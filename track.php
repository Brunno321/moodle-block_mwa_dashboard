<?php
// This file is part of Moodle - http://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

// Moodle is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with Moodle.  If not, see <http://www.gnu.org/licenses/>.

/**
 * Updates activity tracking for a course.
 *
 * @package    block_mwa_dashboard
 * @copyright  2026 Bruno Porto
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

require_once(__DIR__ . '/../../config.php');

$courseid = required_param('courseid', PARAM_INT);
$cmid = required_param('cmid', PARAM_INT);
$tracked = required_param('tracked', PARAM_BOOL);
$course = get_course($courseid);

require_login($course);
require_sesskey();
$context = context_course::instance($courseid);
require_capability('block/mwa_dashboard:managecapture', $context);

$DB->get_record('course_modules', [
    'id' => $cmid,
    'course' => $courseid,
    'deletioninprogress' => 0,
], 'id', MUST_EXIST);

$record = $DB->get_record('block_mwa_dashboard_course', ['courseid' => $courseid]);
$excluded = $record ? json_decode((string)$record->excludedcmids, true) : [];
$excluded = is_array($excluded) ? array_flip(array_map('intval', $excluded)) : [];
if ($tracked) {
    unset($excluded[$cmid]);
} else {
    $excluded[$cmid] = true;
}
$excludedcmids = array_map('intval', array_keys($excluded));
sort($excludedcmids);

if ($record) {
    $record->excludedcmids = json_encode($excludedcmids);
    $record->timemodified = time();
    $DB->update_record('block_mwa_dashboard_course', $record);
} else {
    $DB->insert_record('block_mwa_dashboard_course', (object)[
        'courseid' => $courseid,
        'enabled' => 0,
        'excludedcmids' => json_encode($excludedcmids),
        'timemodified' => time(),
    ]);
}

redirect(new moodle_url('/blocks/mwa_dashboard/view.php', [
    'course' => $courseid,
    'mwa_page' => 'activities',
]));
