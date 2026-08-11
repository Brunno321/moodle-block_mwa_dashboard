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
 * Snapshot manager for block_mwa_dashboard.
 *
 * @package    block_mwa_dashboard
 * @copyright  2026 Bruno Porto
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

namespace block_mwa_dashboard;

defined('MOODLE_INTERNAL') || die();

/** Creates immutable, server-side snapshots for pedagogical interventions. */
final class snapshot_manager {
    /** @var string[] Resource module types. */
    private const RESOURCES = ['resource', 'page', 'url', 'book', 'folder', 'imscp'];

    /** @var string[] Evaluated activity module types. */
    private const EVALUATED = ['assign', 'quiz', 'h5pactivity', 'hvp', 'game'];

    /**
     * Capture and persist one snapshot. There is intentionally no update method.
     *
     * @param int $interventionid Intervention record id.
     * @param int $courseid Course id.
     * @param int $userid Student id.
     * @param string $reason Intervention reason.
     * @param string $situation Identified situation.
     * @param string $action Strategy/action performed.
     * @param string $objective Expected objective.
     * @param int $timecreated Capture timestamp.
     * @param array $trackeditems Items selected for historical follow-up.
     * @return int Snapshot id.
     */
    public static function capture(int $interventionid, int $courseid, int $userid, string $reason,
            string $situation, string $action, string $objective, int $timecreated,
            array $trackeditems = [], ?int $engagementoverride = null): int {
        global $DB;

        if ($DB->record_exists('block_mwa_dashboard_snapshot', ['interventionid' => $interventionid])) {
            throw new \coding_exception('An intervention snapshot can only be created once.');
        }

        $data = self::indicators($courseid, $userid, $timecreated);
        if ($engagementoverride !== null && $engagementoverride >= 0 && $engagementoverride <= 100) {
            // Preserve the exact Moodle-derived percentage visible in Lista da Turma
            // at the instant the professor registers the intervention.
            $data['engagement'] = $engagementoverride;
        }
        $trackeditems = array_values(array_filter($trackeditems, 'is_array'));
        $trackeditems = array_slice($trackeditems, 0, 100);
        if ($trackeditems) {
            $data['trackedItemsTotal'] = count($trackeditems);
            $data['trackedItemsInitialPending'] = count($trackeditems);
            if (strpos(\core_text::strtolower($reason), 'pend') !== false) {
                // Every target offered by the message UI is open and pending for this student.
                $data['pendingActivities'] = count($trackeditems);
            }
        }
        $json = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        if ($json === false) {
            throw new \coding_exception('Unable to encode the intervention snapshot.');
        }

        return (int)$DB->insert_record('block_mwa_dashboard_snapshot', (object)[
            'interventionid' => $interventionid,
            'courseid' => $courseid,
            'userid' => $userid,
            'reason' => $reason,
            'situation' => $situation,
            'actiontaken' => $action,
            'objective' => $objective,
            'snapshotdata' => $json,
            'timecreated' => $timecreated,
        ]);
    }

    /** Calculate current indicators without changing a historical snapshot. */
    public static function current_indicators(int $courseid, int $userid, int $calculatedat,
            ?array $coursegrades = null, ?array $courselogs = null): array {
        return self::indicators($courseid, $userid, $calculatedat, $coursegrades, $courselogs);
    }

    /** Build indicators exclusively from Moodle data at capture time. */
    private static function indicators(int $courseid, int $userid, int $capturedat,
            ?array $coursegrades = null, ?array $courselogs = null): array {
        global $DB;

        $enrolmentcreated = (int)$DB->get_field_sql(
            "SELECT MIN(ue.timecreated)
               FROM {user_enrolments} ue
               JOIN {enrol} e ON e.id = ue.enrolid
              WHERE e.courseid = :courseid AND ue.userid = :userid
                AND e.status = 0 AND ue.status = 0",
            ['courseid' => $courseid, 'userid' => $userid]
        );
        $lastaccess = (int)$DB->get_field_sql(
            "SELECT MAX(timecreated) FROM {block_mwa_dashboard_log}
              WHERE courseid = :courseid AND userid = :userid AND timecreated <= :capturedat",
            ['courseid' => $courseid, 'userid' => $userid, 'capturedat' => $capturedat]
        );
        $moodlelastaccess = (int)$DB->get_field('user_lastaccess', 'timeaccess',
            ['courseid' => $courseid, 'userid' => $userid]);
        $lastaccess = max($lastaccess, $moodlelastaccess);

        $modulemeta = [];
        $modules = $DB->get_records_sql(
            "SELECT cm.id, m.name AS modname
               FROM {course_modules} cm
               JOIN {modules} m ON m.id = cm.module
              WHERE cm.course = :courseid AND cm.visible = 1 AND cm.deletioninprogress = 0",
            ['courseid' => $courseid]
        );
        foreach ($modules as $module) {
            $modulemeta[(int)$module->id] = (string)$module->modname;
        }

        $visited = [];
        $timestamps = $DB->get_records_sql(
            "SELECT id, contextinstanceid, timecreated
               FROM {block_mwa_dashboard_log}
              WHERE courseid = :courseid AND userid = :userid AND timecreated <= :capturedat
           ORDER BY timecreated ASC",
            ['courseid' => $courseid, 'userid' => $userid, 'capturedat' => $capturedat]
        );
        $active7 = [];
        foreach ($timestamps as $event) {
            $cmid = (int)$event->contextinstanceid;
            if ($cmid > 0) {
                $visited[$cmid] = true;
            }
            if ((int)$event->timecreated >= $capturedat - (7 * DAYSECS)) {
                $active7[userdate((int)$event->timecreated, '%Y-%m-%d')] = true;
            }
        }

        $donecmids = [];
        $completionrows = $DB->get_records_sql(
            "SELECT id, coursemoduleid
               FROM {course_modules_completion}
              WHERE userid = :userid AND completionstate > 0",
            ['userid' => $userid]
        );
        foreach ($completionrows as $completionrow) {
            if (isset($modulemeta[(int)$completionrow->coursemoduleid])) {
                $donecmids[(int)$completionrow->coursemoduleid] = true;
            }
        }

        $grades = $coursegrades ?? api::get_grades($courseid);
        $participationlogs = $courselogs ?? api::get_logs($courseid);
        $participationlogs = array_values(array_filter($participationlogs, function($log) use ($capturedat) {
            return (int)($log['_ts'] ?? 0) <= $capturedat;
        }));
        $meta = [];
        $studentrow = null;
        foreach ($grades as $row) {
            if (($row['__mwa_type__'] ?? '') === 'activity_names') {
                $meta = $row;
            } else if ((int)($row['User ID'] ?? 0) === $userid) {
                $studentrow = $row;
            }
        }

        $activitytotal = 0;
        $overdue = 0;
        $oldestpending = null;
        $resourcetotal = 0;
        $resourceaccessed = 0;
        $evaluatedtotal = 0;
        $evaluateddone = 0;
        $attempts = 0;
        $gradevalues = [];
        foreach ($modulemeta as $cmid => $modname) {
            if (in_array($modname, self::RESOURCES, true)) {
                $resourcetotal++;
                if (isset($visited[$cmid])) {
                    $resourceaccessed++;
                }
            } else if ($modname !== 'label') {
                $activitytotal++;
            }
        }

        foreach ($meta as $key => $name) {
            if (!preg_match('/^act_(\d+)$/', (string)$key, $match)) {
                continue;
            }
            $seq = $match[1];
            $mod = (string)($meta['act_module_' . $seq] ?? '');
            $cmid = (int)($meta['act_cmid_' . $seq] ?? 0);
            $current = (int)($studentrow['act_current_' . $seq] ?? 0);
            $rawgrade = $studentrow['act_' . $seq] ?? null;
            $numericgrade = is_numeric($rawgrade) ? (float)$rawgrade : null;
            $done = $current > 0 || $numericgrade !== null;

            if (in_array($mod, self::RESOURCES, true)) {
                continue;
            }

            if ($done) {
                $donecmids[$cmid] = true;
            } else {
                $due = (int)($meta['act_duedate_' . $seq] ?? 0);
                if ($due > 0 && $due < $capturedat) {
                    $overdue++;
                    $age = (int)floor(($capturedat - $due) / DAYSECS);
                    $oldestpending = $oldestpending === null ? $age : max($oldestpending, $age);
                }
            }
            if (in_array($mod, self::EVALUATED, true)) {
                $evaluatedtotal++;
                if ($done) {
                    $evaluateddone++;
                }
            }
            if ($mod === 'quiz') {
                $attempts += $current;
            }
            if ($numericgrade !== null) {
                $gradevalues[] = $numericgrade;
            }
        }

        $activitydone = 0;
        foreach ($donecmids as $cmid => $unused) {
            if (isset($modulemeta[$cmid]) && !in_array($modulemeta[$cmid], self::RESOURCES, true)
                    && $modulemeta[$cmid] !== 'label') {
                $activitydone++;
            }
        }
        $activitydone = min($activitydone, $activitytotal);
        $pending = max(0, $activitytotal - $activitydone);

        $graderows = $DB->get_records_sql(
            "SELECT gg.id, gg.finalgrade, gi.grademax, gg.timemodified
               FROM {grade_grades} gg
               JOIN {grade_items} gi ON gi.id = gg.itemid
              WHERE gi.courseid = :courseid AND gg.userid = :userid
                AND gi.itemtype = 'mod' AND gg.finalgrade IS NOT NULL
           ORDER BY gg.timemodified DESC, gg.id DESC",
            ['courseid' => $courseid, 'userid' => $userid], 0, 20
        );
        $normalisedgrades = [];
        foreach ($graderows as $graderow) {
            $max = (float)$graderow->grademax;
            if ($max > 0) {
                $normalisedgrades[] = round(((float)$graderow->finalgrade / $max) * 100, 1);
            }
        }
        // The follow-up report compares the student's accumulated course score,
        // not the mean percentage of only the activities that already have a grade.
        // Averaging graded items alone makes a single full-mark activity appear as
        // 100 points even when the student has accumulated far less in the course.
        $coursetotal = $studentrow['Course total (Grade)'] ?? null;
        $averagegrade = is_numeric($coursetotal) ? round((float)$coursetotal, 1) : 0.0;
        $lastassessment = $normalisedgrades[0] ?? null;
        $belowreference = $normalisedgrades ? count(array_filter($normalisedgrades, function($grade) {
            return $grade < 60;
        })) : null;
        $trend = null;
        if (count($normalisedgrades) >= 4) {
            $recent = array_sum(array_slice($normalisedgrades, 0, 2)) / 2;
            $previous = array_sum(array_slice($normalisedgrades, 2, 2)) / 2;
            $trend = abs($recent - $previous) < 1 ? 'estável' : ($recent > $previous ? 'alta' : 'queda');
        }

        $completion = $activitytotal > 0 ? (int)round(($activitydone / $activitytotal) * 100) : 0;
        $interactioncount = count($timestamps);
        $activedays = count($active7);
        // Keep the snapshot aligned with the exact participation percentage shown
        // in Lista da Turma (EngagementCalc.calculateForStudent().score).
        $engagement = self::participation_score($userid, $participationlogs, $studentrow, $meta);

        return [
            'firstAccessCompleted' => $lastaccess > 0,
            'enrolmentCreated' => $enrolmentcreated ?: null,
            'daysSinceEnrolment' => $enrolmentcreated ? max(0, (int)floor(($capturedat - $enrolmentcreated) / DAYSECS)) : null,
            'lastAccess' => $lastaccess ?: null,
            'daysWithoutAccess' => $lastaccess ? max(0, (int)floor(($capturedat - $lastaccess) / DAYSECS)) : null,
            'engagement' => $engagement,
            'activeDaysLast7' => $activedays,
            'resourcesAccessed' => $resourceaccessed,
            'resourcesTotal' => $resourcetotal,
            'activitiesCompleted' => $activitydone,
            'activitiesTotal' => $activitytotal,
            'completionPercent' => $completion,
            'interactions' => $interactioncount,
            'regularity' => $activedays >= 5 ? 'alta' : ($activedays >= 3 ? 'média' : ($activedays > 0 ? 'baixa' : 'sem participação')),
            'pendingActivities' => $pending,
            'overdueDeliveries' => $overdue,
            'oldestPendingDays' => $oldestpending,
            'averageGrade' => $averagegrade,
            'courseTotalGrade' => $averagegrade,
            'gradeMetric' => 'course_total_points',
            'lastAssessmentResult' => $lastassessment,
            'assessmentsBelowReference' => $belowreference,
            'gradeReference' => 60,
            'attempts' => $attempts,
            'assessedActivitiesCompleted' => $evaluateddone,
            'assessedActivitiesTotal' => $evaluatedtotal,
            'gradeTrend' => $trend,
        ];
    }

    /** Match the participation score used by amd/src/engagementcalc.js. */
    private static function participation_score(int $userid, array $logs, ?array $studentrow, array $meta): int {
        $allactivities = [];
        $studentactivities = [];
        $submittedactivities = [];
        $activedays = [];
        $mindate = null;
        $maxdate = null;
        $interactions = 0;

        foreach ($logs as $log) {
            $context = trim((string)($log['contextodoevento'] ?? $log['context'] ??
                $log['eventcontext'] ?? $log['_resource'] ?? $log['_modtype'] ?? ''));
            $lowercontext = \core_text::strtolower($context);
            $isgeneral = $lowercontext === '' || preg_match('/^(curso|course)\s*:/u', $lowercontext) ||
                in_array($lowercontext, ['sistema', 'system'], true) ||
                preg_match('/^(area de texto|text area|midia|media)/u', $lowercontext);
            $module = \core_text::strtolower(trim((string)($log['_modtype'] ?? $log['modtype'] ?? '')));
            if ($module === 'hvp') {
                $module = 'h5pactivity';
            }
            $istrackedcontent = in_array($module, ['page', 'book', 'url', 'resource', 'folder', 'imscp'], true);
            $cmid = (int)($log['_cmid'] ?? $log['cmid'] ?? $log['contextinstanceid'] ?? 0);
            $contentkey = $istrackedcontent ? ($cmid > 0 ? 'cmid:' . $cmid : $module . ':' . $lowercontext) : '';
            if ($contentkey !== '') {
                $allactivities[$contentkey] = true;
            }
            $timestamp = (int)($log['_ts'] ?? 0);
            if ($timestamp > 0) {
                $mindate = $mindate === null ? $timestamp : min($mindate, $timestamp);
                $maxdate = $maxdate === null ? $timestamp : max($maxdate, $timestamp);
            }
            if ((int)($log['_userid'] ?? 0) !== $userid) {
                continue;
            }
            $interactions++;
            if ($contentkey !== '') {
                $studentactivities[$contentkey] = true;
            }
            if ($timestamp > 0) {
                $activedays[userdate($timestamp, '%Y-%m-%d')] = true;
            }
            $eventtext = \core_text::strtolower(implode(' ', [
                $log['nomedoevento'] ?? '', $log['eventname'] ?? '', $log['action'] ?? '',
                $log['componente'] ?? '', $log['component'] ?? '', $log['_modtype'] ?? '',
            ]));
            if (!$isgeneral && preg_match('/submit|submission|upload|post created|discussion created|attempt submitted|graded|submetid|envio/u', $eventtext)) {
                $submittedactivities[$lowercontext] = true;
            }
        }

        $gradekeys = [];
        foreach (array_keys($meta) as $key) {
            if (preg_match('/^act_(\d+)$/', (string)$key, $match)) {
                $gradekeys[$key] = $match[1];
            }
        }
        $gradelaunched = 0;
        foreach ($gradekeys as $key => $seq) {
            if ($studentrow === null) {
                continue;
            }
            $module = \core_text::strtolower((string)($meta['act_module_' . $seq] ?? ''));
            $current = (int)($studentrow['act_current_' . $seq] ?? 0);
            $raw = $studentrow[$key] ?? null;
            $numeric = ($raw !== null && $raw !== '' && $raw !== '-' && is_numeric($raw)) ? (float)$raw : null;
            $effective = $module === 'forum' ? ($current > 0 ? ($numeric ?? 1) : null) :
                ($current > 0 ? ($numeric ?? 1) : $numeric);
            if ($effective !== null) {
                $gradelaunched++;
            }
        }

        $total = $studentrow['Course total (Grade)'] ?? null;
        $totalmax = $studentrow['Course total max (Grade)'] ?? null;
        $total = is_numeric($total) ? (float)$total : null;
        $totalmax = is_numeric($totalmax) && (float)$totalmax > 0 ? (float)$totalmax : null;
        $gradeitems = count($gradekeys);
        $gradescore = $total !== null ? self::clamp_score($totalmax ? ($total / $totalmax) * 100 : $total) : 0;
        $gradelaunchscore = $gradeitems ? self::clamp_score(($gradelaunched / $gradeitems) * 100) : 0;
        $observeddays = $mindate !== null && $maxdate !== null ?
            max(1, (int)floor(($maxdate - $mindate) / DAYSECS) + 1) : 1;
        $expectedactivedays = min(30, max(7, $observeddays));
        $activedaysscore = self::clamp_score((count($activedays) / $expectedactivedays) * 100);
        $coveragescore = $allactivities ? self::clamp_score((count($studentactivities) / count($allactivities)) * 100) : 100;
        $completiontarget = $gradeitems ?: (count($allactivities) ?: 1);
        $completedcount = $gradeitems ? $gradelaunched : count($submittedactivities);
        $completionscore = self::clamp_score((min($completedcount, $completiontarget) / $completiontarget) * 100);
        $interactiontarget = max(10, (count($allactivities) + $gradeitems) * 2);
        $interactionscore = self::clamp_score(($interactions / $interactiontarget) * 100);
        $participationscore = self::clamp_score(($interactionscore * .70) + ($activedaysscore * .30));
        $score = self::clamp_score(($coveragescore * .30) + ($completionscore * .35) +
            ($gradelaunchscore * .25) + ($participationscore * .10));

        if ($coveragescore >= 100 && $completionscore >= 100 &&
                ($gradeitems === 0 || $gradelaunchscore >= 100) && $interactions > 0) {
            $score = 100;
        }
        if (!$completedcount && !$gradelaunched && !$gradescore) {
            $browseonly = $interactions ? min(12, 2 + (count($activedays) * 2) + (min($interactions, 20) * .25)) : 0;
            $score = min($score, (int)round($browseonly));
        }
        return $score;
    }

    /** Round and constrain a participation component to 0..100. */
    private static function clamp_score(float $value): int {
        return max(0, min(100, (int)round($value)));
    }
}
