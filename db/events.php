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
 * Event observer definitions for block_mwa_dashboard.
 *
 * Captures course-level events into a focused plugin table
 * ({block_mwa_dashboard_log}) instead of querying the massive
 * logstore_standard_log at read time.
 *
 * @package    block_mwa_dashboard
 * @copyright  2026 Bruno Porto
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

defined('MOODLE_INTERNAL') || die();

$observers = [
    // Course access.
    [
        'eventname' => '\core\event\course_viewed',
        'callback'  => '\block_mwa_dashboard\observer::store',
    ],
    // Any course module viewed (covers all mod types: forum, assign, quiz, page, book, etc.).
    [
        'eventname' => '\core\event\course_module_viewed',
        'callback'  => '\block_mwa_dashboard\observer::store',
    ],
    // Assignment events.
    [
        'eventname' => '\mod_assign\event\assessable_submitted',
        'callback'  => '\block_mwa_dashboard\observer::store',
    ],
    [
        'eventname' => '\mod_assign\event\submission_status_viewed',
        'callback'  => '\block_mwa_dashboard\observer::store',
    ],
    // Quiz events.
    [
        'eventname' => '\mod_quiz\event\attempt_submitted',
        'callback'  => '\block_mwa_dashboard\observer::store',
    ],
    [
        'eventname' => '\mod_quiz\event\attempt_started',
        'callback'  => '\block_mwa_dashboard\observer::store',
    ],
    // Forum events.
    [
        'eventname' => '\mod_forum\event\post_created',
        'callback'  => '\block_mwa_dashboard\observer::store',
    ],
    [
        'eventname' => '\mod_forum\event\discussion_created',
        'callback'  => '\block_mwa_dashboard\observer::store',
    ],
    [
        'eventname' => '\mod_forum\event\discussion_viewed',
        'callback'  => '\block_mwa_dashboard\observer::store',
    ],
    // H5P activity.
    [
        'eventname' => '\mod_h5pactivity\event\statement_accepted',
        'callback'  => '\block_mwa_dashboard\observer::store',
    ],
    // SCORM.
    [
        'eventname' => '\mod_scorm\event\sco_launched',
        'callback'  => '\block_mwa_dashboard\observer::store',
    ],
    // Grading.
    [
        'eventname' => '\core\event\user_graded',
        'callback'  => '\block_mwa_dashboard\observer::store',
    ],
];
