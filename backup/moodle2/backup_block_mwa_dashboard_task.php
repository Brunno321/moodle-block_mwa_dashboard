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
 * Backup task for block_mwa_dashboard.
 *
 * @package    block_mwa_dashboard
 * @copyright  2026 Bruno Porto
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

defined('MOODLE_INTERNAL') || die();

require_once($CFG->dirroot . '/blocks/mwa_dashboard/backup/moodle2/backup_block_mwa_dashboard_stepslib.php');

/**
 * Backup task that coordinates the backup of block_mwa_dashboard data.
 */
class backup_block_mwa_dashboard_task extends backup_block_task {

    /**
     * No custom settings needed beyond the defaults (users, anonymize).
     */
    protected function define_my_settings() {
    }

    /**
     * Register the single structure step that writes the XML.
     */
    protected function define_my_steps() {
        $this->add_step(new backup_block_mwa_dashboard_structure_step(
            'block_mwa_dashboard_structure',
            'block.xml'
        ));
    }

    /**
     * No file areas to back up for this block.
     *
     * @return array
     */
    public function get_fileareas() {
        return [];
    }

    /**
     * No extra config data encoded into the block instance record.
     *
     * @return array
     */
    public function get_configdata_encoded_attributes() {
        return [];
    }

    /**
     * Encodes any URLs contained in the block configuration.
     * Not needed here — return the content unchanged.
     *
     * @param string $content
     * @return string
     */
    public static function encode_content_links($content) {
        return $content;
    }
}
