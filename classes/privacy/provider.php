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
 * This plugin reads existing Moodle log and grade data for analytics
 * purposes. It does not store any personal data of its own.
 *
 * @package    block_mwa_dashboard
 * @copyright  2026 Bruno Porto
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

namespace block_mwa_dashboard\privacy;

defined('MOODLE_INTERNAL') || die();

/**
 * Privacy provider indicating this plugin does not store personal data.
 *
 * The plugin reads data from {logstore_standard_log}, {user}, and
 * {grade_grades} via SQL queries but does not create, modify, or
 * store any personal data in its own database tables.
 */
class provider implements
    \core_privacy\local\metadata\null_provider {

    /**
     * Returns a reason why this plugin does not store personal data.
     *
     * @return string The language string identifier.
     */
    public static function get_reason(): string {
        return 'privacy:metadata';
    }
}
