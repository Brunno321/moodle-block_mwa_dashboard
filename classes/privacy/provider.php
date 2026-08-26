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
 * The plugin stores course analytics, intervention messages and immutable
 * intervention snapshots in Moodle. Optional AI features transmit minimised
 * educational data directly to the official provider selected by the institution.
 * No intermediate server is involved. All individual identifiers are pseudonymised
 * or removed inside Moodle before any external transmission occurs.
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
     * Describe the personal data stored or transmitted by this plugin.
     *
     * Five internal database tables retain analytics data or plugin configuration within Moodle.
     * Two external endpoints may receive minimised educational data when
     * AI is enabled by the site administrator. All external transmissions
     * are pseudonymised or aggregated server-side before leaving Moodle.
     *
     * @param collection $collection The collection to add metadata to.
     * @return collection The updated collection.
     */
    public static function get_metadata(collection $collection): collection {

        // ── Internal tables ───────────────────────────────────────────────

        // Event log — a focused subset of Moodle course events used for analytics.
        $collection->add_database_table(
            'block_mwa_dashboard_log',
            [
                'userid'             => 'privacy:metadata:log:userid',
                'courseid'           => 'privacy:metadata:log:courseid',
                'component'          => 'privacy:metadata:log:component',
                'action'             => 'privacy:metadata:log:action',
                'contextinstanceid'  => 'privacy:metadata:log:contextinstanceid',
                'timecreated'        => 'privacy:metadata:log:timecreated',
                'origin'             => 'privacy:metadata:log:origin',
            ],
            'privacy:metadata:log'
        );

        // Intervention messages — pedagogical messages sent by teachers to students.
        $collection->add_database_table(
            'block_mwa_dashboard_messages',
            [
                'userid'               => 'privacy:metadata:messages:userid',
                'teacherid'            => 'privacy:metadata:messages:teacherid',
                'courseid'             => 'privacy:metadata:messages:courseid',
                'subject'              => 'privacy:metadata:messages:subject',
                'message'              => 'privacy:metadata:messages:message',
                'timesent'             => 'privacy:metadata:messages:timesent',
                'status'               => 'privacy:metadata:messages:status',
                'ai_generated'         => 'privacy:metadata:messages:ai_generated',
                'intervention_reason'  => 'privacy:metadata:messages:intervention_reason',
                'moodle_msgid'         => 'privacy:metadata:messages:moodle_msgid',
                'send_type'            => 'privacy:metadata:messages:send_type',
                'target_type'          => 'privacy:metadata:messages:target_type',
                'target_items'         => 'privacy:metadata:messages:target_items',
                'teacher_note'         => 'privacy:metadata:messages:teacher_note',
                'teacher_note_updated' => 'privacy:metadata:messages:teacher_note_updated',
            ],
            'privacy:metadata:messages'
        );

        // Intervention snapshots — immutable record of the student situation at the moment
        // of each intervention, retained for follow-up and impact analysis.
        $collection->add_database_table(
            'block_mwa_dashboard_snapshot',
            [
                'interventionid' => 'privacy:metadata:snapshot:interventionid',
                'userid'         => 'privacy:metadata:snapshot:userid',
                'courseid'       => 'privacy:metadata:snapshot:courseid',
                'reason'         => 'privacy:metadata:snapshot:reason',
                'situation'      => 'privacy:metadata:snapshot:situation',
                'actiontaken'    => 'privacy:metadata:snapshot:action',
                'objective'      => 'privacy:metadata:snapshot:objective',
                'snapshotdata'   => 'privacy:metadata:snapshot:data',
                'timecreated'    => 'privacy:metadata:snapshot:timecreated',
            ],
            'privacy:metadata:snapshot'
        );

        // AI audit log — metadata-only record of external AI calls.
        // Prompts, responses, student identifiers and credentials are never stored here.
        $collection->add_database_table(
            'block_mwa_dashboard_aiaudit',
            [
                'userid'     => 'privacy:metadata:aiaudit:userid',
                'courseid'   => 'privacy:metadata:aiaudit:courseid',
                'operation'  => 'privacy:metadata:aiaudit:operation',
                'purpose'    => 'privacy:metadata:aiaudit:purpose',
                'provider'   => 'privacy:metadata:aiaudit:provider',
                'endpoint'   => 'privacy:metadata:aiaudit:endpoint',
                'categories' => 'privacy:metadata:aiaudit:categories',
                'status'     => 'privacy:metadata:aiaudit:status',
                'timecreated' => 'privacy:metadata:aiaudit:timecreated',
            ],
            'privacy:metadata:aiaudit'
        );

        // Per-course capture configuration. This table contains no user IDs;
        // it records only whether collection is enabled for a Moodle course.
        $collection->add_database_table(
            'block_mwa_dashboard_course',
            [
                'courseid' => 'privacy:metadata:course:courseid',
                'enabled' => 'privacy:metadata:course:enabled',
                'excludedcmids' => 'privacy:metadata:course:excludedcmids',
                'timemodified' => 'privacy:metadata:course:timemodified',
            ],
            'privacy:metadata:course'
        );

        // ── External AI endpoints ─────────────────────────────────────────
        //
        // Transmission occurs only when:
        //   (a) the site administrator has enabled AI features,
        //   (b) a supported provider has been selected and configured, and
        //   (c) a user with the required capability triggers an AI operation.
        //
        // All transmissions go directly from the Moodle server to the provider
        // API. There is no MWA intermediary server.

        // Individual recommendation endpoint (/ia).
        // Real student names are replaced with request-scoped aliases (e.g. Student-001)
        // inside Moodle before transmission. Email addresses, IP addresses, Moodle user IDs,
        // enrolment identifiers and submission content are blocked by the server-side filter.
        // Aliases are restored to display names locally after the response is received.
        $collection->add_external_location_link(
            'ai_individual_recommendation',
            [
                'student_alias'          => 'privacy:metadata:external:ia:student_alias',
                'participation'          => 'privacy:metadata:external:ia:participation',
                'interactions'           => 'privacy:metadata:external:ia:interactions',
                'active_days'            => 'privacy:metadata:external:ia:active_days',
                'last_access'            => 'privacy:metadata:external:ia:last_access',
                'completion'             => 'privacy:metadata:external:ia:completion',
                'engagement'             => 'privacy:metadata:external:ia:engagement',
                'pending_items'          => 'privacy:metadata:external:ia:pending_items',
                'grades'                 => 'privacy:metadata:external:ia:grades',
                'teacher_prompt'         => 'privacy:metadata:external:ia:teacher_prompt',
                'forum_post_content'     => 'privacy:metadata:external:ia:forum_post_content',
                'quiz_configuration'     => 'privacy:metadata:external:ia:quiz_configuration',
                // Declared explicitly for transparency: both categories are withheld
                // inside Moodle and are not included in the current external payload.
                'quiz_questions'         => 'privacy:metadata:external:ia:quiz_questions',
                'quiz_answers_and_correctness' =>
                    'privacy:metadata:external:ia:quiz_answers_and_correctness',
                'course_resource_content' => 'privacy:metadata:external:ia:course_resource_content',
                'intervention_history'   => 'privacy:metadata:external:ia:intervention_history',
            ],
            'privacy:metadata:external:ia'
        );

        // Chat endpoint (/chat).
        // The server strips individual student records and retains only aggregate class
        // metrics and, when pedagogically required, pseudonymised per-student educational
        // indicators (alias + educational metrics — no name, email, IP or identifier).
        // Teacher messages are sanitised to remove any enrolled student names before
        // transmission. The conversation is not persisted server-side after the response.
        $collection->add_external_location_link(
            'ai_aggregate_chat',
            [
                'teacher_messages'              => 'privacy:metadata:external:chat:messages',
                'conversation_history'          => 'privacy:metadata:external:chat:conversation_history',
                'class_counts'                  => 'privacy:metadata:external:chat:class_counts',
                'class_averages'                => 'privacy:metadata:external:chat:class_averages',
                'risk_counts'                   => 'privacy:metadata:external:chat:risk_counts',
                'activity_metrics'              => 'privacy:metadata:external:chat:activity_metrics',
                'pseudonymised_student_metrics' => 'privacy:metadata:external:chat:pseudonymised_student_metrics',
                'peak_access_time'              => 'privacy:metadata:external:chat:peak_access_time',
            ],
            'privacy:metadata:external:chat'
        );

        return $collection;
    }

    /**
     * Get the list of contexts that contain user data for the given user.
     *
     * @param int $userid The user ID.
     * @return contextlist The contextlist.
     */
    public static function get_contexts_for_userid(int $userid): contextlist {
        global $DB;

        $contextlist = new contextlist();

        // Contexts from the event log table.
        $contextlist->add_from_sql(
            "SELECT DISTINCT ctx.id
               FROM {block_mwa_dashboard_log} l
               JOIN {context} ctx ON ctx.instanceid = l.courseid AND ctx.contextlevel = :ctxlevel
              WHERE l.userid = :userid",
            ['userid' => $userid, 'ctxlevel' => CONTEXT_COURSE]
        );

        // Contexts from the intervention snapshot table.
        $contextlist->add_from_sql(
            "SELECT DISTINCT ctx.id
               FROM {block_mwa_dashboard_snapshot} s
               JOIN {context} ctx ON ctx.instanceid = s.courseid AND ctx.contextlevel = :ctxlevel
              WHERE s.userid = :userid",
            ['userid' => $userid, 'ctxlevel' => CONTEXT_COURSE]
        );

        // Contexts from the messages table — as recipient (student).
        $contextlist->add_from_sql(
            "SELECT DISTINCT ctx.id
               FROM {block_mwa_dashboard_messages} m
               JOIN {context} ctx ON ctx.instanceid = m.courseid AND ctx.contextlevel = :ctxlevel
              WHERE m.userid = :userid",
            ['userid' => $userid, 'ctxlevel' => CONTEXT_COURSE]
        );

        // Contexts from the messages table — as sender (teacher).
        $contextlist->add_from_sql(
            "SELECT DISTINCT ctx.id
               FROM {block_mwa_dashboard_messages} m
               JOIN {context} ctx ON ctx.instanceid = m.courseid AND ctx.contextlevel = :ctxlevel
              WHERE m.teacherid = :userid",
            ['userid' => $userid, 'ctxlevel' => CONTEXT_COURSE]
        );

        // Contexts from the AI audit table (course-level).
        $contextlist->add_from_sql(
            "SELECT DISTINCT ctx.id
               FROM {block_mwa_dashboard_aiaudit} a
               JOIN {context} ctx ON ctx.instanceid = a.courseid AND ctx.contextlevel = :ctxlevel
              WHERE a.userid = :userid AND a.courseid > 0",
            ['userid' => $userid, 'ctxlevel' => CONTEXT_COURSE]
        );

        // System context for audit records not associated with a course (e.g. connection tests).
        if ($DB->record_exists('block_mwa_dashboard_aiaudit', ['userid' => $userid, 'courseid' => 0])) {
            $contextlist->add_system_context();
        }

        return $contextlist;
    }

    /**
     * Get the list of users who have data within a context.
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

        $courseid = $context->instanceid;

        $userlist->add_from_sql('userid',
            'SELECT DISTINCT userid FROM {block_mwa_dashboard_log} WHERE courseid = :courseid',
            ['courseid' => $courseid]);

        $userlist->add_from_sql('userid',
            'SELECT DISTINCT userid FROM {block_mwa_dashboard_snapshot} WHERE courseid = :courseid',
            ['courseid' => $courseid]);

        // Recipients (students).
        $userlist->add_from_sql('userid',
            'SELECT DISTINCT userid FROM {block_mwa_dashboard_messages} WHERE courseid = :courseid',
            ['courseid' => $courseid]);

        // Senders (teachers).
        $userlist->add_from_sql('userid',
            'SELECT DISTINCT teacherid AS userid FROM {block_mwa_dashboard_messages} WHERE courseid = :courseid',
            ['courseid' => $courseid]);

        $userlist->add_from_sql('userid',
            'SELECT DISTINCT userid FROM {block_mwa_dashboard_aiaudit} WHERE courseid = :courseid',
            ['courseid' => $courseid]);
    }

    /**
     * Export all personal data for the user in the given contexts.
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
                        ->export_data(['block_mwa_dashboard', 'ai_audit'],
                            (object)['entries' => array_values($audit)]);
                }
                continue;
            }

            if ($context->contextlevel !== CONTEXT_COURSE) {
                continue;
            }

            $courseid = $context->instanceid;

            $audit = $DB->get_records('block_mwa_dashboard_aiaudit', ['userid' => $userid, 'courseid' => $courseid]);
            if ($audit) {
                \core_privacy\local\request\writer::with_context($context)
                    ->export_data(['block_mwa_dashboard', 'ai_audit'],
                        (object)['entries' => array_values($audit)]);
            }

            $logs = $DB->get_records('block_mwa_dashboard_log', ['userid' => $userid, 'courseid' => $courseid]);
            if ($logs) {
                \core_privacy\local\request\writer::with_context($context)
                    ->export_data(['block_mwa_dashboard', 'log'],
                        (object)['entries' => array_values($logs)]);
            }

            // Messages received by this user as a student.
            $received = $DB->get_records('block_mwa_dashboard_messages', ['userid' => $userid, 'courseid' => $courseid]);
            if ($received) {
                \core_privacy\local\request\writer::with_context($context)
                    ->export_data(['block_mwa_dashboard', 'messages_received'],
                        (object)['messages' => array_values($received)]);
            }

            $snapshots = $DB->get_records('block_mwa_dashboard_snapshot', ['userid' => $userid, 'courseid' => $courseid]);
            if ($snapshots) {
                \core_privacy\local\request\writer::with_context($context)
                    ->export_data(['block_mwa_dashboard', 'intervention_snapshots'],
                        (object)['snapshots' => array_values($snapshots)]);
            }

            // Messages sent by this user as a teacher.
            $sent = $DB->get_records('block_mwa_dashboard_messages', ['teacherid' => $userid, 'courseid' => $courseid]);
            if ($sent) {
                \core_privacy\local\request\writer::with_context($context)
                    ->export_data(['block_mwa_dashboard', 'messages_sent'],
                        (object)['messages' => array_values($sent)]);
            }
        }
    }

    /**
     * Delete all personal data for all users in the specified context.
     *
     * @param \context $context The context to delete data for.
     */
    public static function delete_data_for_all_users_in_context(\context $context): void {
        global $DB;

        if ($context->contextlevel === CONTEXT_COURSE) {
            $DB->delete_records('block_mwa_dashboard_log',      ['courseid' => $context->instanceid]);
            $DB->delete_records('block_mwa_dashboard_snapshot', ['courseid' => $context->instanceid]);
            $DB->delete_records('block_mwa_dashboard_messages', ['courseid' => $context->instanceid]);
            $DB->delete_records('block_mwa_dashboard_aiaudit',  ['courseid' => $context->instanceid]);
        } else if ($context->contextlevel === CONTEXT_SYSTEM) {
            $DB->delete_records('block_mwa_dashboard_aiaudit', ['courseid' => 0]);
        }
    }

    /**
     * Delete personal data for the specified user in the given contexts.
     *
     * Teacher records are anonymised rather than deleted to preserve the
     * intervention history for other participants in the course.
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

                // Delete messages where this user was the recipient.
                $DB->delete_records('block_mwa_dashboard_messages',
                    ['userid' => $userid, 'courseid' => $courseid]);

                // Anonymise messages where this user was the sender (teacher):
                // the message content is preserved for the student but the
                // personal teacher identifier is cleared.
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

        [$insql, $params] = $DB->get_in_or_equal($userids, SQL_PARAMS_NAMED);
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

        // Anonymise messages where users were senders.
        $DB->set_field_select('block_mwa_dashboard_messages', 'teacherid', 0,
            "teacherid $insql AND courseid = :courseid", $params);
    }
}
