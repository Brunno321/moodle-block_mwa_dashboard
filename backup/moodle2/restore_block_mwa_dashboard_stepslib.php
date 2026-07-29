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
 * Restore step definitions for block_mwa_dashboard.
 *
 * @package    block_mwa_dashboard
 * @copyright  2026 Bruno Porto
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

defined('MOODLE_INTERNAL') || die();

/**
 * Restores the block_mwa_dashboard data from a backup archive.
 *
 * Reads the XML produced by backup_block_mwa_dashboard_structure_step and
 * re-inserts rows into block_mwa_dashboard_log and
 * block_mwa_dashboard_messages, remapping course IDs and user IDs to the
 * values that exist in the target Moodle instance.
 */
class restore_block_mwa_dashboard_structure_step extends restore_structure_step {

    /**
     * Defines which XML paths this step handles and maps them to restore paths.
     *
     * @return restore_path_element[]
     */
    protected function define_structure() {

        $paths = [];

        $paths[] = new restore_path_element(
            'block_mwa_dashboard_log',
            '/block/mwa_dashboard/logs/log'
        );

        // Messages were only written when user data was included.
        if ($this->get_setting_value('users')) {
            $paths[] = new restore_path_element(
                'block_mwa_dashboard_message',
                '/block/mwa_dashboard/messages/message'
            );
        }

        return $paths;
    }

    // -----------------------------------------------------------------------
    // Processors — one method per restore_path_element name.
    // -----------------------------------------------------------------------

    /**
     * Processes a single <log> element.
     *
     * @param array $data Raw data from the XML element.
     */
    public function process_block_mwa_dashboard_log($data) {
        global $DB;

        $data = (object) $data;

        // Remap IDs supplied by the backup framework.
        $data->courseid = $this->get_mappingid('course', $data->courseid);
        $data->userid   = $this->get_mappingid('user',   $data->userid);

        // Remap the course-module reference stored in contextinstanceid.
        // If no mapping exists (e.g. the module was not included in the
        // backup) fall back to 0 rather than inserting a broken reference.
        $cmid = $this->get_mappingid('course_module', $data->contextinstanceid);
        $data->contextinstanceid = $cmid ? $cmid : 0;

        // ip was excluded from the backup — ensure the field is absent/null.
        unset($data->ip);
        $data->ip = null;

        unset($data->id);
        $newid = $DB->insert_record('block_mwa_dashboard_log', $data);
        $this->set_mapping('block_mwa_dashboard_log', $data->id ?? 0, $newid);
    }

    /**
     * Processes a single <message> element.
     *
     * @param array $data Raw data from the XML element.
     */
    public function process_block_mwa_dashboard_message($data) {
        global $DB;

        $data = (object) $data;

        // Remap all foreign keys.
        $data->courseid  = $this->get_mappingid('course', $data->courseid);
        $data->userid    = $this->get_mappingid('user',   $data->userid);
        $data->teacherid = $this->get_mappingid('user',   $data->teacherid);

        // moodle_msgid references a message in the old instance — not valid
        // after restore, so clear it.
        $data->moodle_msgid = null;

        unset($data->id);
        $newid = $DB->insert_record('block_mwa_dashboard_messages', $data);
        $this->set_mapping('block_mwa_dashboard_message', $data->id ?? 0, $newid);
    }
}
