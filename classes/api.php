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

    /** @var int Maximum number of log records to return per request. */
    const LOG_LIMIT = 1000;

    /**
     * Default time window in days when no explicit $since is provided.
     * Prevents unbounded queries on large logstore_standard_log tables.
     */
    const LOG_DEFAULT_DAYS  = 90;


    /**
     * Build a map of course_module_id => activity name for all modules in a course.
     *
     * @param int $courseid The course ID.
     * @return array Map of cmid => name.
     */
    private static function build_cm_name_map(int $courseid): array {
        global $DB;

        $map = [];

        $cms = $DB->get_records_sql("
            SELECT cm.id, m.name AS modname, cm.instance
            FROM {course_modules} cm
            JOIN {modules} m ON m.id = cm.module
            WHERE cm.course = :courseid
        ", ['courseid' => $courseid]);

        // Group by module type to batch-query names.
        $bytype = [];
        foreach ($cms as $cm) {
            $bytype[$cm->modname][$cm->id] = $cm->instance;
        }

        foreach ($bytype as $modname => $instances) {
            try {
                $ids = array_values($instances);
                if (empty($ids)) {
                    continue;
                }
                list($insql, $params) = $DB->get_in_or_equal($ids, SQL_PARAMS_NAMED);
                $names = $DB->get_records_select($modname, "id $insql", $params, '', 'id, name');
                foreach ($instances as $cmid => $instanceid) {
                    if (isset($names[$instanceid])) {
                        $map[$cmid] = $names[$instanceid]->name;
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

        $namemap = self::build_cm_name_map($courseid);

        // Always use the plugin's own table — populated by event observers.
        // Never query logstore_standard_log to avoid slow full-table scans.
        $sql = "
            SELECT
                l.id,
                " . $DB->sql_concat("u.firstname", "' '", "u.lastname") . " AS fullname,
                u.email,
                l.userid,
                l.component,
                l.action,
                l.contextinstanceid,
                l.timecreated,
                l.origin,
                l.ip
            FROM {block_mwa_dashboard_log} l
            JOIN {user} u ON u.id = l.userid
            WHERE l.courseid = :courseid
              AND l.timecreated > :since
              AND l.userid IN (
                  SELECT DISTINCT ra.userid
                    FROM {role_assignments} ra
                    JOIN {context} ctx ON ctx.id = ra.contextid
                    JOIN {role} r ON r.id = ra.roleid
                   WHERE ctx.contextlevel = 50
                     AND ctx.instanceid = :courseid2
                     AND r.shortname = 'student'
              )
            ORDER BY l.timecreated DESC
        ";

        $params = [
            'courseid'  => $courseid,
            'courseid2' => $courseid,
            'since'     => $since,
        ];

        $records = $DB->get_records_sql($sql, $params, 0, self::LOG_LIMIT);

        $logs = [];
        foreach ($records as $r) {
            $dt = new \DateTime('@' . $r->timecreated);
            $dt->setTimezone(new \DateTimeZone('America/Sao_Paulo'));

            $cmid    = (int)($r->contextinstanceid ?? 0);
            $actname = $namemap[$cmid] ?? null;
            $modtype = str_replace(['mod_', 'core'], '', $r->component);
            $context = $actname ?: $modtype;

            $logs[] = [
                'hora'             => $dt->format('d/m/y, H:i:s'),
                'nomecompleto'     => trim($r->fullname),
                'email'            => $r->email,
                'usurioafetado'    => '-',
                'contextodoevento' => $context,
                'componente'       => self::translate_component($r->component),
                'nomedoevento'     => self::translate_action($r->action, $r->component),
                'descrio'          => '',
                'origem'           => $r->origin,
                'endereoip'        => $r->ip,
                '_ts'              => (int)$r->timecreated,
                '_cmid'            => $cmid,
                '_modtype'         => $modtype,
                '_userid'          => (int)$r->userid,
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

        // 2. Fetch the real name and cmid for each activity — sem N+1 queries.
        //    a) Pre-load all course modules in a single query (course_modules JOIN modules).
        //    b) Build index [modulename][instanceid] => cmid for O(1) lookup.
        //    c) get_name(false) is called in memory — no DB hit per item.

        // 2a. One query for all course_modules in the course with the module name.
        $cmrows = $DB->get_records_sql(
            "SELECT cm.id AS cmid, m.name AS modname, cm.instance
               FROM {course_modules} cm
               JOIN {modules} m ON m.id = cm.module
              WHERE cm.course = :courseid",
            ['courseid' => $courseid]
        );

        // 2b. Index: $cmindex[modname][instanceid] = cmid
        $cmindex = [];
        foreach ($cmrows as $row) {
            $cmindex[$row->modname][(int)$row->instance] = (int)$row->cmid;
        }

        // 2c. Populate $realnames and $cmids without additional queries.
        $realnames = [];
        $cmids     = [];
        foreach ($items as $item) {
            $realnames[$item->id] = $item->get_name(false);
            $cmid = 0;
            if (!empty($item->itemmodule) && !empty($item->iteminstance)) {
                $cmid = $cmindex[$item->itemmodule][(int)$item->iteminstance] ?? 0;
            }
            $cmids[$item->id] = $cmid;
        }

        // 3. Enrolled students.
        $context  = \context_course::instance($courseid);
        $students = get_enrolled_users($context, 'mod/assign:submit', 0,
                        'u.id, u.firstname, u.lastname, u.email');
        if (empty($students)) {
            return [];
        }

        // 4. Bulk load of all grades (1 query).
        $itemids    = array_map(function($i) { return $i->id; }, $items);
        $studentids = array_keys($students);

        list($itemsql,    $itemparams)    = $DB->get_in_or_equal($itemids,    SQL_PARAMS_NAMED, 'item');
        list($studentsql, $studentparams) = $DB->get_in_or_equal($studentids, SQL_PARAMS_NAMED, 'usr');

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

        // 5. Metadata row: name, cmid and module for each activity.
        $actnames = ['__mwa_type__' => 'activity_names'];
        $seq = 0;
        foreach ($items as $item) {
            $seq++;
            $actnames['act_' . $seq]        = $realnames[$item->id];
            $actnames['act_cmid_' . $seq]   = $cmids[$item->id] ?? 0;
            $actnames['act_module_' . $seq] = $item->itemmodule ?? '';
        }

        // 6. Linhas dos alunos.
        $rows = [$actnames];
        foreach ($students as $stu) {
            $row = [
                '__mwa_type__' => 'student',
                'First name'   => $stu->firstname,
                'Last name'    => $stu->lastname,
                'Email'        => $stu->email,
            ];

            $total    = 0.0;
            $totalmax = 0.0;
            $hasgrade = false;
            $seq = 0;

            foreach ($items as $item) {
                $seq++;
                $finalgrade = $grademap[$stu->id][$item->id] ?? null;
                $val = ($finalgrade !== null) ? round((float)$finalgrade, 1) : null;

                // Chave = 'act_N' — consistente com a linha de metadados.
                $row['act_' . $seq] = ($val !== null) ? $val : '-';

                if ($val !== null) {
                    $total    += $val;
                    $totalmax += (float)($item->grademax ?: 100);
                    $hasgrade  = true;
                }
            }

            $row['Course total (Grade)']     = $hasgrade ? round($total, 1)    : null;
            $row['Course total max (Grade)'] = $hasgrade ? round($totalmax, 1) : null;

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
