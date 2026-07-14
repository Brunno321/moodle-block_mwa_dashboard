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
 * Full-page view for the MWA Analytics Dashboard.
 *
 * @package    block_mwa_dashboard
 * @copyright  2026 Bruno Porto
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

use block_mwa_dashboard\output\dashboard_page;

require_once('../../config.php');

$courseid = required_param('course', PARAM_INT);
require_login($courseid);

$context = context_course::instance($courseid);
require_capability('block/mwa_dashboard:view', $context);

$PAGE->set_context($context);
$PAGE->set_url('/blocks/mwa_dashboard/view.php', ['course' => $courseid]);
$PAGE->set_title(get_string('pluginname', 'block_mwa_dashboard'));
$PAGE->set_heading(get_string('pluginname', 'block_mwa_dashboard'));
$PAGE->set_pagelayout('embedded');

$dashboard = new dashboard_page($courseid);
$dashboard->require_assets($PAGE);

$PAGE->requires->js_call_amd('block_mwa_dashboard/dashboard', 'init', [
    $dashboard->export_for_amd(),
]);

$renderer = $PAGE->get_renderer('block_mwa_dashboard');

echo $OUTPUT->header();
echo $renderer->render_dashboard_page($dashboard);
echo $OUTPUT->footer();
