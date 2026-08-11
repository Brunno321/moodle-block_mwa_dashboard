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
 * Delete plugin-held personal data after the configured retention period.
 *
 * @package    block_mwa_dashboard
 * @copyright  2026 Bruno Porto
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

namespace block_mwa_dashboard\task;

defined('MOODLE_INTERNAL') || die();

/**
 * Delete plugin-held personal data after the configured retention period.
 */
class privacy_cleanup extends \core\task\scheduled_task {
    /**
     * Return the translated task name.
     *
     * @return string
     */
    public function get_name(): string {
        return get_string('task_privacy_cleanup', 'block_mwa_dashboard');
    }

    /**
     * Execute the retention cleanup.
     */
    public function execute(): void {
        global $DB;

        $days = max(30, (int)(get_config('block_mwa_dashboard', 'data_retention_days') ?: 365));
        $cutoff = time() - ($days * DAYSECS);

        $DB->delete_records_select(
            'block_mwa_dashboard_snapshot',
            'interventionid IN (
                SELECT id FROM {block_mwa_dashboard_messages} WHERE timesent < :snapshotcutoff
            )',
            ['snapshotcutoff' => $cutoff]
        );
        $DB->delete_records_select('block_mwa_dashboard_messages', 'timesent < :messagecutoff',
            ['messagecutoff' => $cutoff]);
        $DB->delete_records_select('block_mwa_dashboard_log', 'timecreated < :logcutoff',
            ['logcutoff' => $cutoff]);
        $DB->delete_records_select('block_mwa_dashboard_aiaudit', 'timecreated < :auditcutoff',
            ['auditcutoff' => $cutoff]);
    }
}
