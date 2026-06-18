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
 * External API functions for block_mwa_dashboard.
 *
 * @package    block_mwa_dashboard
 * @copyright  2026 Bruno Porto
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

namespace block_mwa_dashboard;

defined('MOODLE_INTERNAL') || die();

global $CFG;
require_once($CFG->libdir . '/externallib.php');

class external extends \external_api {

    // -- get_logs ---------------------------------------------------------

    public static function get_logs_parameters() {
        return new \external_function_parameters([
            'courseid' => new \external_value(PARAM_INT, 'Course ID'),
            'since'    => new \external_value(PARAM_INT, 'Unix timestamp - only logs after this', VALUE_DEFAULT, 0),
        ]);
    }

    public static function get_logs(int $courseid, int $since = 0): array {
        $params = self::validate_parameters(self::get_logs_parameters(), compact('courseid', 'since'));
        $ctx    = \context_course::instance($params['courseid']);
        self::validate_context($ctx);
        require_capability('block/mwa_dashboard:view', $ctx);

        $logs = api::get_logs($params['courseid'], $params['since']);
        return ['logs' => json_encode($logs), 'count' => count($logs)];
    }

    public static function get_logs_returns() {
        return new \external_single_structure([
            'logs'  => new \external_value(PARAM_RAW,  'JSON array of log records'),
            'count' => new \external_value(PARAM_INT,  'Number of records'),
        ]);
    }

    // -- get_grades -------------------------------------------------------

    public static function get_grades_parameters() {
        return new \external_function_parameters([
            'courseid' => new \external_value(PARAM_INT, 'Course ID'),
        ]);
    }

    public static function get_grades(int $courseid): array {
        $params = self::validate_parameters(self::get_grades_parameters(), compact('courseid'));
        $ctx    = \context_course::instance($params['courseid']);
        self::validate_context($ctx);
        require_capability('block/mwa_dashboard:view', $ctx);

        $grades = api::get_grades($params['courseid']);
        return ['grades' => json_encode($grades), 'count' => count($grades)];
    }

    public static function get_grades_returns() {
        return new \external_single_structure([
            'grades' => new \external_value(PARAM_RAW, 'JSON array of grade records'),
            'count'  => new \external_value(PARAM_INT, 'Number of students'),
        ]);
    }
}
