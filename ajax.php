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
 * AJAX endpoint for fetching course logs and grades.
 *
 * @package    block_mwa_dashboard
 * @copyright  2026 Bruno Porto
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

define('AJAX_SCRIPT', true);
require_once('../../config.php');

$courseid = required_param('course', PARAM_INT);
$action   = required_param('action', PARAM_ALPHA);

require_login();
require_sesskey();

header('Content-Type: application/json; charset=utf-8');

try {
    $context = context_course::instance($courseid);
    require_capability('block/mwa_dashboard:view', $context);

    if ($action === 'logs') {
        $logs = \block_mwa_dashboard\api::get_logs($courseid, 0);
        echo json_encode(['logs' => $logs, 'count' => count($logs)]);
    } else if ($action === 'grades') {
        $grades = \block_mwa_dashboard\api::get_grades($courseid);
        echo json_encode(['grades' => $grades, 'count' => count($grades)]);
    } else {
        echo json_encode(['error' => 'unknown action']);
    }
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}
exit;
