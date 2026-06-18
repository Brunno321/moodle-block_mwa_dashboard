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
 * External service definitions for block_mwa_dashboard.
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
];
