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
 * Privacy subsystem implementation for block_mwa_dashboard.
 *
 * The plugin stores course analytics, intervention messages and historical
 * intervention snapshots in Moodle. Optional AI features transmit minimised
 * educational data directly to the official provider selected by the institution.
 *
 * @package    block_mwa_dashboard
 * @copyright  2026 Bruno Porto
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

namespace block_mwa_dashboard\privacy;

defined('MOODLE_INTERNAL') || die();

use core_privacy\local\metadata\collection;
use core_privacy\local\request\approved_contextlist;
use core_privacy\local\request\approved_userlist;
use core_privacy\local\request\contextlist;
use core_privacy\local\request\userlist;

/**
 * Privacy provider for block_mwa_dashboard.
 */
class provider implements
    \core_privacy\local\metadata\provider,
    \core_privacy\local\request\plugin\provider,
    \core_privacy\local\request\core_userlist_provider {

    /**
     * Describe the personal data stored by this plugin.
     *
     * @param collection $collection The collection to add metadata to.
     * @return collection The updated collection.
     */
    public static function get_metadata(collection $collection): collection {
        // Internal log table.
        $collection->add_database_table(
            'block_mwa_dashboard_log',
            [
                'userid'      => 'privacy:metadata:log:userid',
                'courseid'    => 'privacy:metadata:log:courseid',
                'component'   => 'privacy:metadata:log:component',
                'action'      => 'privacy:metadata:log:action',
                'contextinstanceid' => 'privacy:metadata:log:contextinstanceid',
                'timecreated' => 'privacy:metadata:log:timecreated',
                'origin'      => 'privacy:metadata:log:origin',
            ],
            'privacy:metadata:log'
        );

        // Intervention messages table — stores messages sent by teachers to students.
        $collection->add_database_table(
            'block_mwa_dashboard_messages',
            [
                'userid'              => 'privacy:metadata:messages:userid',
                'teacherid'           => 'privacy:metadata:messages:teacherid',
                'courseid'            => 'privacy:metadata:messages:courseid',
                'subject'             => 'privacy:metadata:messages:subject',
                'message'             => 'privacy:metadata:messages:message',
                'timesent'            => 'privacy:metadata:messages:timesent',
                'status'              => 'privacy:metadata:messages:status',
                'ai_generated'        => 'privacy:metadata:messages:ai_generated',
                'intervention_reason' => 'privacy:metadata:messages:intervention_reason',
                'moodle_msgid'        => 'privacy:metadata:messages:moodle_msgid',
                'send_type'           => 'privacy:metadata:messages:send_type',
                'target_type'         => 'privacy:metadata:messages:target_type',
                'target_items'        => 'privacy:metadata:messages:target_items',
                'teacher_note'        => 'privacy:metadata:messages:teacher_note',
                'teacher_note_updated' => 'privacy:metadata:messages:teacher_note_updated',
            ],
            'privacy:metadata:messages'
        );

        $collection->add_database_table(
            'block_mwa_dashboard_snapshot',
            [
                'interventionid' => 'privacy:metadata:snapshot:interventionid',
                'userid' => 'privacy:metadata:snapshot:userid',
                'courseid' => 'privacy:metadata:snapshot:courseid',
                'reason' => 'privacy:metadata:snapshot:reason',
                'situation' => 'privacy:metadata:snapshot:situation',
                'actiontaken' => 'privacy:metadata:snapshot:action',
                'objective' => 'privacy:metadata:snapshot:objective',
                'snapshotdata' => 'privacy:metadata:snapshot:data',
                'timecreated' => 'privacy:metadata:snapshot:timecreated',
            ],
            'privacy:metadata:snapshot'
        );

        $collection->add_database_table(
            'block_mwa_dashboard_aiaudit',
            [
                'userid' => 'privacy:metadata:aiaudit:userid',
                'courseid' => 'privacy:metadata:aiaudit:courseid',
                'operation' => 'privacy:metadata:aiaudit:operation',
                'purpose' => 'privacy:metadata:aiaudit:purpose',
                'provider' => 'privacy:metadata:aiaudit:provider',
                'endpoint' => 'privacy:metadata:aiaudit:endpoint',
                'categories' => 'privacy:metadata:aiaudit:categories',
                'status' => 'privacy:metadata:aiaudit:status',
                'timecreated' => 'privacy:metadata:aiaudit:timecreated',
            ],
            'privacy:metadata:aiaudit'
        );

        // Individual recommendation endpoint. Direct identifiers are removed or
        // replaced with a request-scoped alias before transmission.
        $collection->add_external_location_link(
            'ai_individual_recommendation',
            [
                'student_alias'   => 'privacy:metadata:external:ia:student_alias',
                'participation'   => 'privacy:metadata:external:ia:participation',
                'interactions'    => 'privacy:metadata:external:ia:interactions',
                'active_days'     => 'privacy:metadata:external:ia:active_days',
                'last_access'     => 'privacy:metadata:external:ia:last_access',
                'completion'      => 'privacy:metadata:external:ia:completion',
                'engagement'      => 'privacy:metadata:external:ia:engagement',
                'pending_items'   => 'privacy:metadata:external:ia:pending_items',
                'grades'          => 'privacy:metadata:external:ia:grades',
                'course_activity' => 'privacy:metadata:external:ia:course_activity',
                'teacher_prompt'  => 'privacy:metadata:external:ia:teacher_prompt',
            ],
            'privacy:metadata:external:ia'
        );

        // Aggregate chat endpoint. The server allowlist discards student records,
        // individual grades and student access lists before transmission.
        $collection->add_external_location_link(
            'ai_aggregate_chat',
            [
                'teacher_messages' => 'privacy:metadata:external:chat:messages',
                'class_counts' => 'privacy:metadata:external:chat:class_counts',
                'class_averages' => 'privacy:metadata:external:chat:class_averages',
                'risk_counts' => 'privacy:metadata:external:chat:risk_counts',
                'activity_metrics' => 'privacy:metadata:external:chat:activity_metrics',
                'peak_access_time' => 'privacy:metadata:external:chat:peak_access_time',
            ],
            'privacy:metadata:external:chat'
        );

        return $collection;
    }

    /**
     * Get the list of contexts that contain user data.
     *
     * @param int $userid The user ID.
     * @return contextlist The contextlist.
     */
    public static function get_contexts_for_userid(int $userid): contextlist {
        global $DB;

        $contextlist = new contextlist();

        // Contexts from the log table (student events).
        $sql = "SELECT DISTINCT ctx.id
                  FROM {block_mwa_dashboard_log} l
                  JOIN {context} ctx ON ctx.instanceid = l.courseid AND ctx.contextlevel = :ctxlevel
                 WHERE l.userid = :userid";
        $contextlist->add_from_sql($sql, ['userid' => $userid, 'ctxlevel' => CONTEXT_COURSE]);

        $sqlsnapshot = "SELECT DISTINCT ctx.id
                          FROM {block_mwa_dashboard_snapshot} s
                          JOIN {context} ctx ON ctx.instanceid = s.courseid AND ctx.contextlevel = :ctxlevel
                         WHERE s.userid = :userid";
        $contextlist->add_from_sql($sqlsnapshot, ['userid' => $userid, 'ctxlevel' => CONTEXT_COURSE]);

        // Contexts from the messages table — as recipient (student).
        $sql2 = "SELECT DISTINCT ctx.id
                   FROM {block_mwa_dashboard_messages} m
                   JOIN {context} ctx ON ctx.instanceid = m.courseid AND ctx.contextlevel = :ctxlevel
                  WHERE m.userid = :userid";
        $contextlist->add_from_sql($sql2, ['userid' => $userid, 'ctxlevel' => CONTEXT_COURSE]);

        // Contexts from the messages table — as sender (teacher).
        $sql3 = "SELECT DISTINCT ctx.id
                   FROM {block_mwa_dashboard_messages} m
                   JOIN {context} ctx ON ctx.instanceid = m.courseid AND ctx.contextlevel = :ctxlevel
                  WHERE m.teacherid = :userid";
        $contextlist->add_from_sql($sql3, ['userid' => $userid, 'ctxlevel' => CONTEXT_COURSE]);

        $sqlaudit = "SELECT DISTINCT ctx.id
                       FROM {block_mwa_dashboard_aiaudit} a
                       JOIN {context} ctx ON ctx.instanceid = a.courseid AND ctx.contextlevel = :ctxlevel
                      WHERE a.userid = :userid AND a.courseid > 0";
        $contextlist->add_from_sql($sqlaudit, ['userid' => $userid, 'ctxlevel' => CONTEXT_COURSE]);
        if ($DB->record_exists('block_mwa_dashboard_aiaudit', ['userid' => $userid, 'courseid' => 0])) {
            $contextlist->add_system_context();
        }

        return $contextlist;
    }

    /**
     * Get the list of users within a context.
     *
     * @param userlist $userlist The userlist to populate.
     */
    public static function get_users_in_context(userlist $userlist): void {
        $context = $userlist->get_context();
        if ($context->contextlevel === CONTEXT_SYSTEM) {
            $userlist->add_from_sql('userid',
                'SELECT DISTINCT userid FROM {block_mwa_dashboard_aiaudit} WHERE courseid = 0', []);
            return;
        }
        if ($context->contextlevel !== CONTEXT_COURSE) {
            return;
        }
        // Students from the log table.
        $sql = "SELECT DISTINCT userid FROM {block_mwa_dashboard_log} WHERE courseid = :courseid";
        $userlist->add_from_sql('userid', $sql, ['courseid' => $context->instanceid]);

        $sqlsnapshot = "SELECT DISTINCT userid FROM {block_mwa_dashboard_snapshot} WHERE courseid = :courseid";
        $userlist->add_from_sql('userid', $sqlsnapshot, ['courseid' => $context->instanceid]);

        // Recipients (students) from the messages table.
        $sql2 = "SELECT DISTINCT userid FROM {block_mwa_dashboard_messages} WHERE courseid = :courseid";
        $userlist->add_from_sql('userid', $sql2, ['courseid' => $context->instanceid]);

        // Senders (teachers) from the messages table.
        $sql3 = "SELECT DISTINCT teacherid AS userid FROM {block_mwa_dashboard_messages} WHERE courseid = :courseid";
        $userlist->add_from_sql('userid', $sql3, ['courseid' => $context->instanceid]);
        $userlist->add_from_sql('userid',
            'SELECT DISTINCT userid FROM {block_mwa_dashboard_aiaudit} WHERE courseid = :courseid',
            ['courseid' => $context->instanceid]);
    }

    /**
     * Export personal data for the given contexts.
     *
     * @param approved_contextlist $contextlist The approved contexts.
     */
    public static function export_user_data(approved_contextlist $contextlist): void {
        global $DB;
        $userid = $contextlist->get_user()->id;
        foreach ($contextlist->get_contexts() as $context) {
            if ($context->contextlevel === CONTEXT_SYSTEM) {
                $audit = $DB->get_records('block_mwa_dashboard_aiaudit', ['userid' => $userid, 'courseid' => 0]);
                if ($audit) {
                    \core_privacy\local\request\writer::with_context($context)
                        ->export_data(['block_mwa_dashboard', 'ai_audit'], (object)['entries' => array_values($audit)]);
                }
                continue;
            }
            if ($context->contextlevel !== CONTEXT_COURSE) {
                continue;
            }
            $courseid = $context->instanceid;
            $audit = $DB->get_records('block_mwa_dashboard_aiaudit',
                ['userid' => $userid, 'courseid' => $courseid]);
            if ($audit) {
                \core_privacy\local\request\writer::with_context($context)
                    ->export_data(['block_mwa_dashboard', 'ai_audit'], (object)['entries' => array_values($audit)]);
            }

            // Export log entries for this user.
            $logs = $DB->get_records('block_mwa_dashboard_log',
                ['userid' => $userid, 'courseid' => $courseid]);
            if ($logs) {
                \core_privacy\local\request\writer::with_context($context)
                    ->export_data(['block_mwa_dashboard', 'log'], (object)['entries' => array_values($logs)]);
            }

            // Export messages sent TO this user (as student/recipient).
            $received = $DB->get_records('block_mwa_dashboard_messages',
                ['userid' => $userid, 'courseid' => $courseid]);
            if ($received) {
                \core_privacy\local\request\writer::with_context($context)
                    ->export_data(['block_mwa_dashboard', 'messages_received'], (object)['messages' => array_values($received)]);
            }
            $snapshots = $DB->get_records('block_mwa_dashboard_snapshot',
                ['userid' => $userid, 'courseid' => $courseid]);
            if ($snapshots) {
                \core_privacy\local\request\writer::with_context($context)
                    ->export_data(['block_mwa_dashboard', 'intervention_snapshots'],
                        (object)['snapshots' => array_values($snapshots)]);
            }

            // Export messages sent BY this user (as teacher/sender).
            $sent = $DB->get_records('block_mwa_dashboard_messages',
                ['teacherid' => $userid, 'courseid' => $courseid]);
            if ($sent) {
                \core_privacy\local\request\writer::with_context($context)
                    ->export_data(['block_mwa_dashboard', 'messages_sent'], (object)['messages' => array_values($sent)]);
            }
        }
    }

    /**
     * Delete all data for all users in the specified context.
     *
     * @param \context $context The context to delete data for.
     */
    public static function delete_data_for_all_users_in_context(\context $context): void {
        global $DB;
        if ($context->contextlevel === CONTEXT_COURSE) {
            $DB->delete_records('block_mwa_dashboard_log',      ['courseid' => $context->instanceid]);
            $DB->delete_records('block_mwa_dashboard_snapshot', ['courseid' => $context->instanceid]);
            $DB->delete_records('block_mwa_dashboard_messages', ['courseid' => $context->instanceid]);
            $DB->delete_records('block_mwa_dashboard_aiaudit', ['courseid' => $context->instanceid]);
        } else if ($context->contextlevel === CONTEXT_SYSTEM) {
            $DB->delete_records('block_mwa_dashboard_aiaudit', ['courseid' => 0]);
        }
    }

    /**
     * Delete personal data for the given user and contexts.
     *
     * @param approved_contextlist $contextlist The approved contexts for the user.
     */
    public static function delete_data_for_user(approved_contextlist $contextlist): void {
        global $DB;
        $userid = $contextlist->get_user()->id;
        foreach ($contextlist->get_contexts() as $context) {
            if ($context->contextlevel === CONTEXT_SYSTEM) {
                $DB->delete_records('block_mwa_dashboard_aiaudit', ['userid' => $userid, 'courseid' => 0]);
                continue;
            }
            if ($context->contextlevel === CONTEXT_COURSE) {
                $courseid = $context->instanceid;
                $DB->delete_records('block_mwa_dashboard_log',
                    ['userid' => $userid, 'courseid' => $courseid]);
                $DB->delete_records('block_mwa_dashboard_snapshot',
                    ['userid' => $userid, 'courseid' => $courseid]);
                // Delete messages where user was the recipient.
                $DB->delete_records('block_mwa_dashboard_messages',
                    ['userid' => $userid, 'courseid' => $courseid]);
                // Anonymise messages where user was the sender (teacher):
                // preserve the message content but clear the personal identifier.
                $DB->set_field('block_mwa_dashboard_messages', 'teacherid', 0,
                    ['teacherid' => $userid, 'courseid' => $courseid]);
                $DB->delete_records('block_mwa_dashboard_aiaudit',
                    ['userid' => $userid, 'courseid' => $courseid]);
            }
        }
    }

    /**
     * Delete personal data for the given users in the given context.
     *
     * @param approved_userlist $userlist The approved users and context.
     */
    public static function delete_data_for_users(approved_userlist $userlist): void {
        global $DB;
        $context = $userlist->get_context();
        if (!in_array($context->contextlevel, [CONTEXT_SYSTEM, CONTEXT_COURSE], true)) {
            return;
        }
        $userids = $userlist->get_userids();
        if (empty($userids)) {
            return;
        }
        list($insql, $params) = $DB->get_in_or_equal($userids, SQL_PARAMS_NAMED);
        $params['courseid'] = $context->contextlevel === CONTEXT_SYSTEM ? 0 : $context->instanceid;
        $DB->delete_records_select('block_mwa_dashboard_aiaudit',
            "userid $insql AND courseid = :courseid", $params);
        if ($context->contextlevel === CONTEXT_SYSTEM) {
            return;
        }
        $DB->delete_records_select('block_mwa_dashboard_log',
            "userid $insql AND courseid = :courseid", $params);
        $DB->delete_records_select('block_mwa_dashboard_snapshot',
            "userid $insql AND courseid = :courseid", $params);
        // Delete messages where users were recipients.
        $DB->delete_records_select('block_mwa_dashboard_messages',
            "userid $insql AND courseid = :courseid", $params);
        $DB->set_field_select('block_mwa_dashboard_messages', 'teacherid', 0,
            "teacherid $insql AND courseid = :courseid", $params);
    }
}
