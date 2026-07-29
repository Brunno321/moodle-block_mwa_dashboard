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
 * Backup step definitions for block_mwa_dashboard.
 *
 * @package    block_mwa_dashboard
 * @copyright  2026 Bruno Porto
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

defined('MOODLE_INTERNAL') || die();

/**
 * Defines the backup step that saves the block's course- and user-scoped data.
 *
 * Structure produced:
 *
 * <mwa_dashboard>
 *   <logs>
 *     <log> ... </log>
 *   </logs>
 *   <messages>
 *     <message> ... </message>
 *   </messages>
 * </mwa_dashboard>
 */
class backup_block_mwa_dashboard_structure_step extends backup_block_structure_step {

    /**
     * Defines the XML tree that will be written to the backup file.
     *
     * @return backup_nested_element
     */
    protected function define_structure() {

        // Decide whether user data is included in this backup.
        $userinfo = $this->get_setting_value('users');

        // Root element — matches the block component name.
        $mwadashboard = new backup_nested_element('mwa_dashboard');

        // --- block_mwa_dashboard_log ---
        // Every field except 'id' (auto-assigned on restore) and 'ip'
        // (personal data — omitted deliberately).
        $logs = new backup_nested_element('logs');
        $log  = new backup_nested_element('log', ['id'], [
            'courseid',
            'userid',
            'component',
            'action',
            'contextinstanceid',
            'timecreated',
            'origin',
        ]);

        // --- block_mwa_dashboard_messages ---
        $messages = new backup_nested_element('messages');
        $message  = new backup_nested_element('message', ['id'], [
            'courseid',
            'userid',
            'teacherid',
            'subject',
            'message',
            'timesent',
            'status',
            'ai_generated',
            'intervention_reason',
            'moodle_msgid',
            'send_type',
        ]);

        // Build the tree.
        $mwadashboard->add_child($logs);
        $logs->add_child($log);

        $mwadashboard->add_child($messages);
        $messages->add_child($message);

        // Wire up the DB sources.
        $log->set_source_table(
            'block_mwa_dashboard_log',
            ['courseid' => backup::VAR_COURSEID]
        );

        // Messages contain user-identifiable data — only back them up when
        // user data is requested.
        if ($userinfo) {
            $message->set_source_table(
                'block_mwa_dashboard_messages',
                ['courseid' => backup::VAR_COURSEID]
            );
        }

        // Annotate user IDs so Moodle can remap them on restore.
        $log->annotate_ids('user', 'userid');

        $message->annotate_ids('user', 'userid');
        $message->annotate_ids('user', 'teacherid');

        return $this->prepare_block_structure($mwadashboard);
    }
}
