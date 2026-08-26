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
 * External services definition for block_mwa_dashboard.
 *
 * @package    block_mwa_dashboard
 * @copyright  2026 Bruno Porto
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

defined('MOODLE_INTERNAL') || die();

$functions = [
    'block_mwa_dashboard_get_logs' => [
        'classname'     => 'block_mwa_dashboard\external',
        'methodname'    => 'get_logs',
        'description'   => 'Get access logs for a course',
        'type'          => 'read',
        'ajax'          => true,
        'loginrequired' => true,
    ],
    'block_mwa_dashboard_get_grades' => [
        'classname'     => 'block_mwa_dashboard\external',
        'methodname'    => 'get_grades',
        'description'   => 'Get grades for all students in a course',
        'type'          => 'read',
        'ajax'          => true,
        'loginrequired' => true,
    ],
    'block_mwa_dashboard_send_message' => [
        'classname'     => 'block_mwa_dashboard\external',
        'methodname'    => 'send_message',
        'description'   => 'Send a pedagogical intervention message to a student',
        'type'          => 'write',
        'ajax'          => true,
        'loginrequired' => true,
    ],
    'block_mwa_dashboard_get_interventions' => [
        'classname'     => 'block_mwa_dashboard\external',
        'methodname'    => 'get_interventions',
        'description'   => 'Get intervention message history for a course',
        'type'          => 'read',
        'ajax'          => true,
        'loginrequired' => true,
    ],
    'block_mwa_dashboard_get_followup_indicators' => [
        'classname'     => 'block_mwa_dashboard\external',
        'methodname'    => 'get_followup_indicators',
        'description'   => 'Get current Moodle indicators for students with intervention snapshots',
        'type'          => 'read',
        'ajax'          => true,
        'loginrequired' => true,
    ],
    'block_mwa_dashboard_delete_intervention' => [
        'classname'     => 'block_mwa_dashboard\external',
        'methodname'    => 'delete_intervention',
        'description'   => 'Delete a pedagogical intervention record',
        'type'          => 'write',
        'ajax'          => true,
        'loginrequired' => true,
    ],
    'block_mwa_dashboard_save_intervention_note' => [
        'classname'     => 'block_mwa_dashboard\external',
        'methodname'    => 'save_intervention_note',
        'description'   => 'Save a private teacher note for an intervention',
        'type'          => 'write',
        'ajax'          => true,
        'loginrequired' => true,
    ],
    'block_mwa_dashboard_get_ai_recommendation' => [
        'classname'     => 'block_mwa_dashboard\external',
        'methodname'    => 'get_ai_recommendation',
        'description'   => 'Generate AI recommendation for a student or the class',
        'type'          => 'read',
        'ajax'          => true,
        'loginrequired' => true,
    ],
    'block_mwa_dashboard_chat_message' => [
        'classname'     => 'block_mwa_dashboard\external',
        'methodname'    => 'chat_message',
        'description'   => 'Send a chat message to the AI assistant',
        'type'          => 'read',
        'ajax'          => true,
        'loginrequired' => true,
    ],
    'block_mwa_dashboard_get_activity_content' => [
        'classname'     => 'block_mwa_dashboard\external',
        'methodname'    => 'get_activity_content',
        'description'   => 'Extract text content from a course activity or resource for AI analysis',
        'type'          => 'read',
        'ajax'          => true,
        'loginrequired' => true,
    ],
    'block_mwa_dashboard_get_due_dates' => [
        'classname'     => 'block_mwa_dashboard\external',
        'methodname'    => 'get_due_dates',
        'description'   => 'Fetch due/cutoff dates for graded activities in a course, keyed by cmid',
        'type'          => 'read',
        'ajax'          => true,
        'loginrequired' => true,
    ],
    'block_mwa_dashboard_set_activity_tracking' => [
        'classname'     => 'block_mwa_dashboard\external',
        'methodname'    => 'set_activity_tracking',
        'description'   => 'Include or exclude a course activity from dashboard tracking',
        'type'          => 'write',
        'ajax'          => true,
        'loginrequired' => true,
    ],
    'block_mwa_dashboard_get_hidden_activities' => [
        'classname' => 'block_mwa_dashboard\external', 'methodname' => 'get_hidden_activities',
        'description' => 'Get activities visually hidden by the current teacher in a course',
        'type' => 'read', 'ajax' => true, 'loginrequired' => true,
    ],
    'block_mwa_dashboard_set_activity_hidden' => [
        'classname' => 'block_mwa_dashboard\external', 'methodname' => 'set_activity_hidden',
        'description' => 'Hide or show a tracked activity for the current teacher',
        'type' => 'write', 'ajax' => true, 'loginrequired' => true,
    ],
];
