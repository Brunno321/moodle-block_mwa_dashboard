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
 * Block definition for block_mwa_dashboard.
 *
 * @package    block_mwa_dashboard
 * @copyright  2026 Bruno Porto
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

defined('MOODLE_INTERNAL') || die();

class block_mwa_dashboard extends block_base {

    public function init() {
        $this->title = get_string('pluginname', 'block_mwa_dashboard');
    }

    public function applicable_formats() {
        return ['course-view' => true, 'site' => true, 'my' => true];
    }

    public function instance_allow_multiple() {
        return false;
    }

    public function get_content() {
        global $COURSE;

        if ($this->content !== null) {
            return $this->content;
        }

        $this->content = new stdClass();
        $courseid = $COURSE->id;
        $context  = context_course::instance($courseid);

        if (!has_capability('block/mwa_dashboard:view', $context)) {
            $this->content->text = get_string('nopermission', 'block_mwa_dashboard');
            return $this->content;
        }

        $url = new moodle_url('/blocks/mwa_dashboard/view.php', ['course' => $courseid]);

        $this->content->text = html_writer::tag('div',
            html_writer::tag('p',
                get_string('blockintro', 'block_mwa_dashboard'),
                ['style' => 'font-size:.85rem;color:#555;margin-bottom:.75rem;']
            ) .
            html_writer::link($url,
                get_string('opendashboard', 'block_mwa_dashboard'),
                ['class' => 'btn btn-primary', 'style' => 'width:100%;text-align:center;']
            ),
            ['style' => 'text-align:center;padding:.5rem;']
        );

        $this->content->footer = '';
        return $this->content;
    }

    public function has_config() {
        return true;
    }
}
