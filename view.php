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
 * Full-page view for the MWA Dashboard (embedded layout with iframe).
 *
 * @package    block_mwa_dashboard
 * @copyright  2026 Bruno Porto
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

require_once('../../config.php');
global $DB;

$courseid = required_param('course', PARAM_INT);
require_login($courseid);

$context = context_course::instance($courseid);
require_capability('block/mwa_dashboard:view', $context);

$PAGE->set_context($context);
$PAGE->set_url('/blocks/mwa_dashboard/view.php', ['course' => $courseid]);
$PAGE->set_title(get_string('pluginname', 'block_mwa_dashboard'));
$PAGE->set_pagelayout('embedded');

$frameurl = new moodle_url('/blocks/mwa_dashboard/frame.php', ['course' => $courseid]);

echo $OUTPUT->header();
?>
<style>
html,body{margin:0!important;padding:0!important;overflow:hidden!important;height:100vh;background:#f0f2f7;}
#page,#page-content,#region-main,.region-main-content,#region-main-box{padding:0!important;margin:0!important;}
#page-wrapper,#page{height:100vh!important;}
#mwaFrame{width:100%;border:none;height:100vh;display:block;}
</style>
<iframe id="mwaFrame" src="<?php echo $frameurl; ?>" style="width:100%;height:100vh;border:none;display:block;"></iframe>
<?php
echo $OUTPUT->footer();
