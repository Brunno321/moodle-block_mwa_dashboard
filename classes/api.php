<?php
// This file is part of Moodle - http://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// Moodle is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with Moodle.  If not, see <http://www.gnu.org/licenses/>.
/**
 * Data access layer for block_mwa_dashboard.
 *
 * @package    block_mwa_dashboard
 * @copyright  2026 Bruno Porto
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
namespace block_mwa_dashboard;
defined('MOODLE_INTERNAL') || die();
/**
 * API class with static methods for fetching logs and grades.
 */
class api {

    /**
     * Return course module ids excluded from dashboard tracking.
     *
     * @param int $courseid Course id.
     * @return int[]
     */
    public static function get_excluded_cmids(int $courseid): array {
        global $DB;
        $json = $DB->get_field('block_mwa_dashboard_course', 'excludedcmids', ['courseid' => $courseid]);
        $values = json_decode((string)$json, true);
        if (!is_array($values)) {
            return [];
        }
        return array_values(array_unique(array_filter(array_map('intval', $values))));
    }
    /** @var int Maximum number of log records to return per request. */
    const LOG_LIMIT = 5000;
    /**
     * Default time window in days when no explicit $since is provided.
     * Prevents unbounded queries on large logstore_standard_log tables.
     */
    const LOG_DEFAULT_DAYS  = 90;
    /**
     * Return the Moodle profile picture URL when the user has a custom picture.
     *
     * @param \stdClass $user User record with picture fields.
     * @return string URL or empty string when the user uses Moodle's default initials/avatar.
     */
    public static function user_picture_url(\stdClass $user): string {
        global $PAGE;
        if (empty($user->picture)) {
            return '';
        }
        $picture = new \user_picture($user);
        $picture->size = 1;
        return $picture->get_url($PAGE)->out(false);
    }
    /**
     * Extract date restrictions from Moodle availability JSON.
     *
     * @param string|null $availability Course module availability JSON.
     * @return array Start and end timestamps, 0 when absent.
     */
    private static function availability_window(?string $availability): array {
        $from = 0;
        $until = 0;
        if (empty($availability)) {
            return [$from, $until];
        }
        $data = json_decode($availability, true);
        if (!is_array($data)) {
            return [$from, $until];
        }
        $walk = function($node) use (&$walk, &$from, &$until) {
            if (!is_array($node)) {
                return;
            }
            if (($node['type'] ?? '') === 'date' && !empty($node['t'])) {
                $time = (int)$node['t'];
                $direction = (string)($node['d'] ?? '');
                if (strpos($direction, '>') !== false) {
                    $from = max($from, $time);
                } else if (strpos($direction, '<') !== false) {
                    $until = $until ? min($until, $time) : $time;
                }
            }
            foreach (($node['c'] ?? []) as $child) {
                $walk($child);
            }
        };
        $walk($data);
        return [$from, $until];
    }
    /**
     * Build current visibility/open-window metadata for a course module.
     *
     * @param string|null $availability Course module availability JSON.
     * @param int $visible Course module visible flag.
     * @param array $modulewindow Open/close timestamps from the activity table.
     * @return array Availability fields consumed by the dashboard.
     */
    private static function module_availability_meta(?string $availability, int $visible, array $modulewindow = []): array {
        list($availablefrom, $availableuntil) = self::availability_window($availability);
        $duedate = !empty($modulewindow['duedate']) ? (int)$modulewindow['duedate'] : 0;
        $now = time();
        foreach (['timeopen', 'allowsubmissionsfromdate', 'opendate'] as $field) {
            if (!empty($modulewindow[$field])) {
                $availablefrom = max($availablefrom, (int)$modulewindow[$field]);
            }
        }
        foreach (['timeclose', 'cutoffdate', 'closedate'] as $field) {
            if (!empty($modulewindow[$field])) {
                $availableuntil = $availableuntil ? min($availableuntil, (int)$modulewindow[$field]) : (int)$modulewindow[$field];
            }
        }
        $isopen = ((int)$visible === 1)
            && (!$availablefrom || $now >= $availablefrom)
            && (!$availableuntil || $now <= $availableuntil);
        return [
            'available' => $isopen ? 1 : 0,
            'availablefrom' => $availablefrom,
            'availableuntil' => $availableuntil,
            'duedate' => $duedate,
        ];
    }
    /**
     * Preload activity open/close date fields by module and instance.
     *
     * @param array $bytype Course modules grouped by module name.
     * @return array Date metadata indexed by module name and instance id.
     */
    private static function preload_module_windows(array $bytype): array {
        global $DB;
        $datefields = ['timeopen', 'timeclose', 'allowsubmissionsfromdate', 'duedate', 'cutoffdate', 'closedate', 'opendate'];
        $windows = [];
        foreach ($bytype as $modname => $instances) {
            try {
                $columns = $DB->get_columns($modname);
                $fields = ['id'];
                foreach ($datefields as $field) {
                    if (isset($columns[$field])) {
                        $fields[] = $field;
                    }
                }
                if (count($fields) === 1) {
                    continue;
                }
                $ids = array_map(function($cm) {
                    return (int)$cm->instance;
                }, array_values($instances));
                if (empty($ids)) {
                    continue;
                }
                list($insql, $params) = $DB->get_in_or_equal($ids, SQL_PARAMS_NAMED);
                $records = $DB->get_records_select($modname, "id $insql", $params, '', implode(',', array_unique($fields)));
                foreach ($records as $record) {
                    $row = [];
                    foreach ($datefields as $field) {
                        if (property_exists($record, $field)) {
                            $row[$field] = (int)$record->{$field};
                        }
                    }
                    $windows[$modname][(int)$record->id] = $row;
                }
            } catch (\Exception $e) {
                continue;
            }
        }
        return $windows;
    }
    /** Return complete module availability metadata for dashboard rendering. */
    public static function get_course_module_metadata(int $courseid): array {
        return self::build_cm_name_map($courseid);
    }

    /**
     * Build a map of course_module_id => activity name for all modules in a course.
     *
     * @param int $courseid The course ID.
     * @return array Map of cmid => module information.
     */
    private static function build_cm_name_map(int $courseid): array {
        global $DB;
        $map = [];
        $cms = $DB->get_records_sql("
            SELECT cm.id, m.name AS modname, cm.instance, cm.visible, cm.availability, cm.deletioninprogress FROM {course_modules} cm
            JOIN {modules} m ON m.id = cm.module
            WHERE cm.course = :courseid
        ", ['courseid' => $courseid]);
        // Group by module type to batch-query names.
        $bytype = [];
        foreach ($cms as $cm) {
            if (!empty($cm->deletioninprogress)) {
                continue;
            }
            $bytype[$cm->modname][$cm->id] = $cm;
        }
        $modulewindows = self::preload_module_windows($bytype);
        foreach ($bytype as $modname => $instances) {
            try {
                $ids = array_map(function($cm) {
                    return (int)$cm->instance;
                }, array_values($instances));
                if (empty($ids)) {
                    continue;
                }
                list($insql, $params) = $DB->get_in_or_equal($ids, SQL_PARAMS_NAMED);
                $names = $DB->get_records_select($modname, "id $insql", $params, '', 'id, name');
                foreach ($instances as $cmid => $cm) {
                    $instanceid = (int)$cm->instance;
                    if (isset($names[$instanceid])) {
                        $availability = self::module_availability_meta(
                            $cm->availability ?? null,
                            (int)($cm->visible ?? 1),
                            $modulewindows[$modname][$instanceid] ?? []
                        );
                        $map[$cmid] = [
                            'name' => $names[$instanceid]->name,
                            'modname' => $modname,
                            'available' => $availability['available'],
                            'availablefrom' => $availability['availablefrom'],
                            'availableuntil' => $availability['availableuntil'],
                            'duedate' => $availability['duedate'],
                        ];
                    }
                }
            } catch (\Exception $e) {
                // Some module types might not have a 'name' column.
                continue;
            }
        }
        return $map;
    }
    /**
     * Get access logs for a course, formatted for the dashboard.
     *
     * Reads exclusively from {block_mwa_dashboard_log}, the plugin's own focused
     * table populated in real time by the event observers defined in
     * db/events.php / classes/observer.php. This avoids any query against the
     * massive logstore_standard_log table.
     *
     * If the table is empty for this course the dashboard will show an empty
     * state until the event observer collects the first events. Teachers can
     * trigger population by navigating the course (course_viewed, module_viewed)
     * after the plugin is installed.
     *
     * @param int $courseid The course ID.
     * @param int $since    Only return logs after this Unix timestamp.
     *                      Defaults to LOG_DEFAULT_DAYS days ago when 0.
     * @return array Array of log records.
     */
    public static function get_logs(int $courseid, int $since = 0): array {
        global $DB;
        if ($since <= 0) {
            $since = time() - (self::LOG_DEFAULT_DAYS * DAYSECS);
        }
        $excluded = array_flip(self::get_excluded_cmids($courseid));
        $namemap = self::build_cm_name_map($courseid);
        foreach ($excluded as $cmid => $unused) {
            unset($namemap[$cmid]);
        }
        // Always use the plugin's own table â€” populated by event observers.
        // Never query logstore_standard_log to avoid slow full-table scans.
        $sql = "
            SELECT
                l.id,
                " . $DB->sql_concat("u.firstname", "' '", "u.lastname") . " AS fullname,
                u.firstname,
                u.lastname,
                u.email,
                u.picture,
                u.imagealt,
                l.userid,
                l.component,
                l.action,
                l.contextinstanceid,
                l.timecreated,
                l.origin
            FROM {block_mwa_dashboard_log} l
            JOIN {user} u ON u.id = l.userid
            WHERE l.courseid = :courseid
              AND l.timecreated > :since
               AND l.userid IN (
                  SELECT DISTINCT ra.userid
                    FROM {role_assignments} ra
                    JOIN {context} ctx ON ctx.id = ra.contextid
                    JOIN {role} r ON r.id = ra.roleid
                     JOIN {user_enrolments} ue ON ue.userid = ra.userid
                     JOIN {enrol} e ON e.id = ue.enrolid
                   WHERE ctx.contextlevel = 50
                     AND ctx.instanceid = :courseid2
                     AND r.shortname = 'student'
                      AND e.courseid = :courseid3
                      AND e.status = 0
                      AND ue.status = 0
                      AND (ue.timestart = 0 OR ue.timestart <= :now)
                      AND (ue.timeend = 0 OR ue.timeend > :now2)
              )
            ORDER BY l.timecreated DESC
        ";
        $params = [
            'courseid'  => $courseid,
            'courseid2' => $courseid,
            'courseid3' => $courseid,
            'since'     => $since,
            'now'       => time(),
            'now2'      => time(),
        ];
        $records = $DB->get_records_sql($sql, $params, 0, self::LOG_LIMIT);
        $logs = [];
        foreach ($records as $r) {
            $dt = new \DateTime('@' . $r->timecreated);
            $dt->setTimezone(new \DateTimeZone('America/Sao_Paulo'));
            $cmid    = (int)($r->contextinstanceid ?? 0);
            $component = (string)($r->component ?? '');
            if ($cmid > 0 && isset($excluded[$cmid]) && strpos($component, 'mod_') === 0) {
                continue;
            }
            if ($cmid > 0 && strpos($component, 'mod_') === 0 && !isset($namemap[$cmid])) {
                continue;
            }
            $cminfo = $namemap[$cmid] ?? null;
            $actname = is_array($cminfo) ? ($cminfo['name'] ?? null) : $cminfo;
            $modtype = is_array($cminfo) && !empty($cminfo['modname'])
                ? $cminfo['modname']
                : str_replace(['mod_', 'core'], '', $r->component);
            $context = $actname ?: $modtype;
            $logs[] = [
                'hora'             => $dt->format('d/m/y, H:i:s'),
                'nomecompleto'     => trim($r->fullname),
                'email'            => $r->email,
                'pictureurl'       => self::user_picture_url((object)[
                    'id' => (int)$r->userid,
                    'firstname' => $r->firstname,
                    'lastname' => $r->lastname,
                    'picture' => $r->picture,
                    'imagealt' => $r->imagealt,
                    'email' => $r->email,
                ]),
                'usurioafetado'    => '-',
                'contextodoevento' => $context,
                'componente'       => self::translate_component($r->component),
                'nomedoevento'     => self::translate_action($r->action, $r->component),
                'descrio'          => '',
                'origem'           => $r->origin,
                'endereoip'        => '',
                '_ts'              => (int)$r->timecreated,
                '_cmid'            => $cmid,
                '_modtype'         => $modtype,
                '_available'       => is_array($cminfo) ? (int)($cminfo['available'] ?? 1) : 1,
                '_availablefrom'   => is_array($cminfo) ? (int)($cminfo['availablefrom'] ?? 0) : 0,
                '_availableuntil'  => is_array($cminfo) ? (int)($cminfo['availableuntil'] ?? 0) : 0,
                '_duedate'         => is_array($cminfo) ? (int)($cminfo['duedate'] ?? 0) : 0,
                '_userid'          => (int)$r->userid,
            ];
        }
        $completionlogs = self::get_h5p_completion_logs($courseid, $since, $namemap);
        if (!empty($completionlogs)) {
            $logs = array_merge($completionlogs, $logs);
            usort($logs, function($a, $b) {
                return ($b['_ts'] ?? 0) <=> ($a['_ts'] ?? 0);
            });
        }
        return $logs;
    }
    /**
     * Build synthetic H5P completion log rows from Moodle's completion table.
     *
     * Older plugin versions did not observe all H5P completion events, so relying
     * only on the plugin log table can leave completed H5P activities marked as
     * pending. This keeps the activity card aligned with Moodle's current state.
     *
     * @param int $courseid The course ID.
     * @param int $since Only completions after this timestamp.
     * @param array $namemap Map of cmid => module information.
     * @return array Synthetic log rows.
     */
    private static function get_h5p_completion_logs(int $courseid, int $since, array $namemap): array {
        global $DB;
        $sql = "
            SELECT
                cmc.id,
                cmc.userid,
                cmc.coursemoduleid,
                cmc.timemodified,
                " . $DB->sql_concat("u.firstname", "' '", "u.lastname") . " AS fullname,
                u.firstname,
                u.lastname,
                u.email,
                u.picture,
                u.imagealt,
                m.name AS modname
              FROM {course_modules_completion} cmc
              JOIN {course_modules} cm ON cm.id = cmc.coursemoduleid
              JOIN {modules} m ON m.id = cm.module
              JOIN {user} u ON u.id = cmc.userid
             WHERE cm.course = :courseid
               AND cmc.timemodified > :since
               AND cmc.completionstate > 0
               AND (cm.deletioninprogress = 0 OR cm.deletioninprogress IS NULL)
               AND m.name IN ('hvp', 'h5pactivity')
                AND cmc.userid IN (
                   SELECT DISTINCT ra.userid
                     FROM {role_assignments} ra
                     JOIN {context} ctx ON ctx.id = ra.contextid
                     JOIN {role} r ON r.id = ra.roleid
                      JOIN {user_enrolments} ue ON ue.userid = ra.userid
                      JOIN {enrol} e ON e.id = ue.enrolid
                    WHERE ctx.contextlevel = 50
                      AND ctx.instanceid = :courseid2
                      AND r.shortname = 'student'
                       AND e.courseid = :courseid3
                       AND e.status = 0
                       AND ue.status = 0
                       AND (ue.timestart = 0 OR ue.timestart <= :now)
                       AND (ue.timeend = 0 OR ue.timeend > :now2)
               )
        ";
        $records = $DB->get_records_sql($sql, [
            'courseid' => $courseid,
            'courseid2' => $courseid,
            'courseid3' => $courseid,
            'since' => $since,
            'now' => time(),
            'now2' => time(),
        ]);
        $logs = [];
        foreach ($records as $r) {
            $cmid = (int)$r->coursemoduleid;
            $cminfo = $namemap[$cmid] ?? null;
            if (!is_array($cminfo)) {
                continue;
            }
            $actname = is_array($cminfo) ? ($cminfo['name'] ?? null) : $cminfo;
            $modtype = is_array($cminfo) && !empty($cminfo['modname'])
                ? $cminfo['modname']
                : $r->modname;
            $dt = new \DateTime('@' . (int)$r->timemodified);
            $dt->setTimezone(new \DateTimeZone('America/Sao_Paulo'));
            $logs[] = [
                'hora'             => $dt->format('d/m/y, H:i:s'),
                'nomecompleto'     => trim($r->fullname),
                'email'            => $r->email,
                'pictureurl'       => self::user_picture_url((object)[
                    'id' => (int)$r->userid,
                    'firstname' => $r->firstname,
                    'lastname' => $r->lastname,
                    'picture' => $r->picture,
                    'imagealt' => $r->imagealt,
                    'email' => $r->email,
                ]),
                'usurioafetado'    => trim($r->fullname),
                'contextodoevento' => $actname ?: $modtype,
                'componente'       => 'H5P',
                'nomedoevento'     => 'H5P completion updated',
                'descrio'          => '',
                'origem'           => 'completion',
                'endereoip'        => '',
                '_ts'              => (int)$r->timemodified,
                '_cmid'            => $cmid,
                '_modtype'         => $modtype,
                '_available'       => is_array($cminfo) ? (int)($cminfo['available'] ?? 1) : 1,
                '_availablefrom'   => is_array($cminfo) ? (int)($cminfo['availablefrom'] ?? 0) : 0,
                '_availableuntil'  => is_array($cminfo) ? (int)($cminfo['availableuntil'] ?? 0) : 0,
                '_duedate'         => is_array($cminfo) ? (int)($cminfo['duedate'] ?? 0) : 0,
                '_userid'          => (int)$r->userid,
                '_synthetic'       => 'h5p_completion',
            ];
        }
        return $logs;
    }
    /**
     * Get grades for all students in a course.
     *
     * @param int $courseid The course ID.
     * @return array Array of student grade records.
     */
    /**
     * Get grades for all students in a course.
     *
     * Uses a single bulk query to preload all grade_grades rows, avoiding
     * the N+1 query problem (one DB call per student/item pair).
     *
     * @param int $courseid The course ID.
     * @return array Array of student grade records.
     */
    public static function get_grades(int $courseid): array {
        global $DB, $CFG;
        require_once($CFG->libdir . '/gradelib.php');
        // 1. Fetch all grade items for the course (visible modules + course total).
        $allitems = \grade_item::fetch_all(['courseid' => $courseid]);
        if (empty($allitems)) {
            return [];
        }
        // Filter: module items only (itemtype='mod'), visible, sorted by sortorder.
        $items = array_filter($allitems, function($item) {
            return $item->itemtype === 'mod' && !$item->hidden;
        });
        usort($items, function($a, $b) { return $a->sortorder - $b->sortorder; });
        if (empty($items)) {
            return [];
        }
        // Fetch course module metadata in bulk.
        $cmrows = $DB->get_records_sql(
            "SELECT cm.id AS cmid, m.name AS modname, cm.instance, cm.visible, cm.availability, cm.deletioninprogress
               FROM {course_modules} cm
               JOIN {modules} m ON m.id = cm.module
              WHERE cm.course = :courseid",
            ['courseid' => $courseid]
        );
        // Index module metadata by module name and instance id.
        $cmindex = [];
        $cmbytype = [];
        $excluded = array_flip(self::get_excluded_cmids($courseid));
        foreach ($cmrows as $row) {
            if (!empty($row->deletioninprogress)) {
                continue;
            }
            if (isset($excluded[(int)$row->cmid])) {
                continue;
            }
            $cmbytype[$row->modname][$row->cmid] = $row;
        }
        $modulewindows = self::preload_module_windows($cmbytype);
        foreach ($cmrows as $row) {
            if (!empty($row->deletioninprogress)) {
                continue;
            }
            if (isset($excluded[(int)$row->cmid])) {
                continue;
            }
            $availability = self::module_availability_meta(
                $row->availability ?? null,
                (int)($row->visible ?? 1),
                $modulewindows[$row->modname][(int)$row->instance] ?? []
            );
            $cmindex[$row->modname][(int)$row->instance] = [
                'cmid' => (int)$row->cmid,
                'available' => $availability['available'],
                'availablefrom' => $availability['availablefrom'],
                'availableuntil' => $availability['availableuntil'],
                'duedate' => $availability['duedate'],
            ];
        }
        $items = array_values(array_filter($items, function($item) use ($cmindex) {
            if (empty($item->itemmodule) || empty($item->iteminstance)) {
                return false;
            }
            return isset($cmindex[$item->itemmodule][(int)$item->iteminstance]);
        }));
        if (empty($items)) {
            return [];
        }
        // Populate activity names and course module ids without additional queries.
        $realnames = [];
        $cmids     = [];
        $available = [];
        foreach ($items as $item) {
            $realnames[$item->id] = $item->get_name(false);
            $cmid = 0;
            $availability = ['available' => 1, 'availablefrom' => 0, 'availableuntil' => 0, 'duedate' => 0];
            if (!empty($item->itemmodule) && !empty($item->iteminstance)) {
                $cmmeta = $cmindex[$item->itemmodule][(int)$item->iteminstance] ?? null;
                if (is_array($cmmeta)) {
                    $cmid = $cmmeta['cmid'] ?? 0;
                    $availability = $cmmeta;
                }
            }
            $cmids[$item->id] = $cmid;
            $available[$item->id] = $availability;
        }
        // 3. Enrolled students.
        $context  = \context_course::instance($courseid);
        $students = get_enrolled_users($context, 'mod/assign:submit', 0,
                        'u.id, u.firstname, u.lastname, u.email, u.picture, u.imagealt',
                        '', 0, 0, true);
        if (empty($students)) {
            return [];
        }
        // 4. Bulk load of all grades (1 query).
        $itemids    = array_map(function($i) { return $i->id; }, $items);
        $studentids = array_keys($students);
        list($itemsql,    $itemparams)    = $DB->get_in_or_equal($itemids,    SQL_PARAMS_NAMED, 'item');
        list($studentsql, $studentparams) = $DB->get_in_or_equal($studentids, SQL_PARAMS_NAMED, 'usr');
        // Moodle Participants shows "Enrolment created" from user_enrolments.timecreated.
        // Keep the earliest active enrolment when a student has more than one enrolment method.
        $enrolmentrows = $DB->get_records_sql(
            "SELECT ue.userid AS id, MIN(ue.timecreated) AS enrolmentcreated
               FROM {user_enrolments} ue
               JOIN {enrol} e ON e.id = ue.enrolid
              WHERE e.courseid = :enrolcourseid
                AND ue.userid $studentsql
                AND e.status = 0
                AND ue.status = 0
           GROUP BY ue.userid",
            array_merge(['enrolcourseid' => $courseid], $studentparams)
        );
        $enrolmentcreated = [];
        foreach ($enrolmentrows as $enrolmentrow) {
            $enrolmentcreated[(int)$enrolmentrow->id] = (int)$enrolmentrow->enrolmentcreated;
        }
        $graderows = $DB->get_records_sql(
            "SELECT id, itemid, userid, finalgrade
               FROM {grade_grades}
              WHERE itemid $itemsql
                AND userid $studentsql",
            array_merge($itemparams, $studentparams)
        );
        $grademap = [];
        foreach ($graderows as $gr) {
            $grademap[$gr->userid][$gr->itemid] = $gr->finalgrade;
        }
        $itemmodulebyid = [];
        $itemcmidbyid = [];
        $itemidbycmid = [];
        foreach ($items as $item) {
            $itemid = (int)$item->id;
            $cmid = (int)($cmids[$itemid] ?? 0);
            $itemmodulebyid[$itemid] = $item->itemmodule ?? '';
            $itemcmidbyid[$itemid] = $cmid;
            if ($cmid > 0) {
                $itemidbycmid[$cmid] = $itemid;
            }
        }
        $activitystatemap = [];
        if (!empty($itemidbycmid)) {
            list($cmsql, $cmparams) = $DB->get_in_or_equal(array_keys($itemidbycmid), SQL_PARAMS_NAMED, 'cmc');
            $completionrows = $DB->get_records_sql(
                "SELECT " . $DB->sql_concat('coursemoduleid', "'-'", 'userid') . " AS id,
                        coursemoduleid,
                        userid,
                        MAX(completionstate) AS completionstate
                   FROM {course_modules_completion}
                  WHERE coursemoduleid $cmsql
                    AND userid $studentsql
                    AND completionstate > 0
               GROUP BY coursemoduleid, userid",
                array_merge($cmparams, $studentparams)
            );
            foreach ($completionrows as $completionrow) {
                $itemid = $itemidbycmid[(int)$completionrow->coursemoduleid] ?? 0;
                $module = $itemmodulebyid[$itemid] ?? '';
                $hasgrade = $itemid && array_key_exists($itemid, $grademap[(int)$completionrow->userid] ?? []);
                if ($itemid && in_array($module, ['h5pactivity', 'hvp', 'game'], true) && $hasgrade) {
                    $activitystatemap[$itemid][(int)$completionrow->userid] = 1;
                }
            }
        }
        $assignitems = [];
        $quizitems = [];
        foreach ($items as $item) {
            if (empty($item->iteminstance)) {
                continue;
            }
            if (($item->itemmodule ?? '') === 'assign') {
                $assignitems[(int)$item->iteminstance] = (int)$item->id;
            } else if (($item->itemmodule ?? '') === 'quiz') {
                $quizitems[(int)$item->iteminstance] = (int)$item->id;
            }
        }
        if (!empty($assignitems)) {
            list($assignsql, $assignparams) = $DB->get_in_or_equal(array_keys($assignitems), SQL_PARAMS_NAMED, 'asn');
            $submissionrows = $DB->get_records_sql(
                "SELECT " . $DB->sql_concat('assignment', "'-'", 'userid') . " AS id,
                        assignment,
                        userid,
                        COUNT(1) AS submitcount
                   FROM {assign_submission}
                  WHERE assignment $assignsql
                    AND userid $studentsql
                    AND status = :assignstatus
                    AND latest = 1
               GROUP BY assignment, userid",
                array_merge($assignparams, $studentparams, ['assignstatus' => 'submitted'])
            );
            foreach ($submissionrows as $submissionrow) {
                $itemid = $assignitems[(int)$submissionrow->assignment] ?? 0;
                if ($itemid) {
                    $activitystatemap[$itemid][(int)$submissionrow->userid] = (int)$submissionrow->submitcount;
                }
            }
        }
        if (!empty($quizitems)) {
            list($quizsql, $quizparams) = $DB->get_in_or_equal(array_keys($quizitems), SQL_PARAMS_NAMED, 'qz');
            $attemptrows = $DB->get_records_sql(
                "SELECT " . $DB->sql_concat('quiz', "'-'", 'userid') . " AS id,
                        quiz,
                        userid,
                        COUNT(1) AS attemptcount
                   FROM {quiz_attempts}
                  WHERE quiz $quizsql
                    AND userid $studentsql
                    AND state = :quizstate
               GROUP BY quiz, userid",
                array_merge($quizparams, $studentparams, ['quizstate' => 'finished'])
            );
            foreach ($attemptrows as $attemptrow) {
                $itemid = $quizitems[(int)$attemptrow->quiz] ?? 0;
                if ($itemid) {
                    $activitystatemap[$itemid][(int)$attemptrow->userid] = (int)$attemptrow->attemptcount;
                }
            }
        }
        // Current forum post counts by grade item and student. Forum logs are
        // historical, so deleted posts must be checked against the live tables.
        $forumitems = [];
        foreach ($items as $item) {
            if (($item->itemmodule ?? '') === 'forum' && !empty($item->iteminstance)) {
                $forumitems[(int)$item->iteminstance] = (int)$item->id;
            }
        }
        $forumpostmap = [];
        if (!empty($forumitems)) {
            list($forumsql, $forumparams) = $DB->get_in_or_equal(array_keys($forumitems), SQL_PARAMS_NAMED, 'forum');
            $postrows = $DB->get_records_sql(
                "SELECT " . $DB->sql_concat('d.forum', "'-'", 'p.userid') . " AS id,
                        d.forum,
                        p.userid,
                        COUNT(1) AS postcount
                   FROM {forum_posts} p
                   JOIN {forum_discussions} d ON d.id = p.discussion
                  WHERE d.forum $forumsql
                    AND p.userid $studentsql
               GROUP BY d.forum, p.userid",
                array_merge($forumparams, $studentparams)
            );
            foreach ($postrows as $postrow) {
                $itemid = $forumitems[(int)$postrow->forum] ?? 0;
                if ($itemid) {
                    $forumpostmap[$itemid][(int)$postrow->userid] = (int)$postrow->postcount;
                }
            }
        }
        // 5. Metadata row: name, cmid and module for each activity.
        $actnames = ['__mwa_type__' => 'activity_names'];
        $seq = 0;
        foreach ($items as $item) {
            $seq++;
            $actnames['act_' . $seq]        = $realnames[$item->id];
            $actnames['act_cmid_' . $seq]   = $cmids[$item->id] ?? 0;
            $actnames['act_module_' . $seq] = $item->itemmodule ?? '';
            $actnames['act_available_' . $seq] = $available[$item->id]['available'] ?? 1;
            $actnames['act_availablefrom_' . $seq] = $available[$item->id]['availablefrom'] ?? 0;
            $actnames['act_availableuntil_' . $seq] = $available[$item->id]['availableuntil'] ?? 0;
            $actnames['act_duedate_' . $seq] = $available[$item->id]['duedate'] ?? 0;
        }
        // Student rows.
        $rows = [$actnames];
        foreach ($students as $stu) {
            $row = [
                '__mwa_type__' => 'student',
                'First name'   => $stu->firstname,
                'Last name'    => $stu->lastname,
                'Email'        => $stu->email,
                '_enrolment_created' => $enrolmentcreated[(int)$stu->id] ?? 0,
            ];
            $total    = 0.0;
            $totalmax = 0.0;
            $hasgrade = false;
            $seq = 0;
            foreach ($items as $item) {
                $seq++;
                $finalgrade = $grademap[$stu->id][$item->id] ?? null;
                $val = ($finalgrade !== null) ? round((float)$finalgrade, 1) : null;
                // Keep activity columns aligned with the metadata row.
                $row['act_' . $seq] = ($val !== null) ? $val : '-';
                if (($item->itemmodule ?? '') === 'forum') {
                    $row['act_current_' . $seq] = $forumpostmap[$item->id][$stu->id] ?? 0;
                } else {
                    $row['act_current_' . $seq] = $activitystatemap[$item->id][$stu->id] ?? 0;
                }
                if ($val !== null) {
                    $total    += $val;
                    $totalmax += (float)($item->grademax ?: 100);
                    $hasgrade  = true;
                }
            }
            $row['Course total (Grade)']     = $hasgrade ? round($total, 1)    : null;
            $row['Course total max (Grade)'] = $hasgrade ? round($totalmax, 1) : null;
            $row['User ID']                  = (int)$stu->id;
            $row['Picture URL']              = self::user_picture_url($stu);
            $rows[] = $row;
        }
        return $rows;
    }
    /**
     * Get list of courses the current user can view the dashboard for.
     *
     * @return array Array of course records with id, fullname, shortname.
     */
    public static function get_accessible_courses(): array {
        global $USER;
        $courses = enrol_get_all_users_courses($USER->id, true);
        $result  = [];
        foreach ($courses as $c) {
            $ctx = \context_course::instance($c->id);
            if (has_capability('block/mwa_dashboard:view', $ctx)) {
                $result[] = [
                    'id'        => $c->id,
                    'fullname'  => $c->fullname,
                    'shortname' => $c->shortname,
                ];
            }
        }
        return $result;
    }
    /**
     * Translate a Moodle component name to a human-readable label.
     *
     * @param string $comp The component name.
     * @return string Translated label.
     */
    private static function translate_component(string $comp): string {
        $map = [
            'mod_forum'       => 'Forum',
            'mod_assign'      => 'Assignment',
            'mod_quiz'        => 'Quiz',
            'mod_h5pactivity' => 'H5P',
            'mod_hvp'         => 'H5P',
            'mod_scorm'       => 'SCORM package',
            'mod_page'        => 'Page',
            'mod_book'        => 'Book',
            'mod_url'         => 'URL',
            'mod_resource'    => 'File',
            'mod_folder'      => 'Folder',
            'mod_glossary'    => 'Glossary',
            'mod_lesson'      => 'Lesson',
            'mod_wiki'        => 'Wiki',
            'mod_choice'      => 'Choice',
            'core'            => 'System',
        ];
        return $map[$comp] ?? ucfirst(str_replace(['mod_', 'core_'], '', $comp));
    }
    /**
     * Translate a Moodle log action to a human-readable label.
     *
     * @param string $action The action name.
     * @param string $comp   The component name (for context).
     * @return string Translated label.
     */
    private static function translate_action(string $action, string $comp): string {
        if (($comp === 'mod_quiz' || $comp === 'mod_h5pactivity' || $comp === 'mod_hvp') &&
            ($action === 'submitted' || $action === 'attempt_submitted' || $action === 'attempt submitted')) {
            return $comp === 'mod_quiz' ? 'Quiz attempt submitted' : 'H5P attempt submitted';
        }
        $map = [
            'viewed'             => 'Course module viewed',
            'submitted'          => 'Submission submitted',
            'uploaded'           => 'File uploaded',
            'graded'             => 'Submission graded',
            'created'            => 'Content created',
            'loggedin'           => 'User logged in',
            'loggedout'          => 'User logged out',
            'attempt_submitted'  => 'Quiz attempt submitted',
            'attempt_started'    => 'Quiz attempt started',
            'course_viewed'      => 'Course viewed',
            'post_created'       => 'Forum post created',
            'discussion_created' => 'Discussion created',
            'discussion_viewed'  => 'Discussion viewed',
        ];
        return $map[$action] ?? $action;
    }
}
