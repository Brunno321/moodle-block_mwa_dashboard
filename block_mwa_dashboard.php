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

    public function instance_allow_config() {
        return true;
    }

    /**
     * Return the course associated with this block instance.
     *
     * @return int Course ID or 0 for non-course contexts.
     */
    private function get_instance_courseid(): int {
        if (empty($this->instance->parentcontextid)) {
            return 0;
        }

        $context = context::instance_by_id($this->instance->parentcontextid, IGNORE_MISSING);
        if (!$context || $context->contextlevel !== CONTEXT_COURSE) {
            return 0;
        }

        return (int)$context->instanceid;
    }

    /**
     * Synchronise the explicit course capture setting.
     *
     * @param int $courseid Course ID.
     * @param bool $enabled Whether capture is enabled.
     */
    private function update_course_capture(int $courseid, bool $enabled): void {
        global $DB;

        if ($courseid <= 1) {
            return;
        }

        $record = $DB->get_record('block_mwa_dashboard_course', ['courseid' => $courseid]);
        if ($record) {
            $record->enabled = $enabled ? 1 : 0;
            $record->timemodified = time();
            $DB->update_record('block_mwa_dashboard_course', $record);
        } else {
            $record = (object)[
                'courseid' => $courseid,
                'enabled' => $enabled ? 1 : 0,
                'timemodified' => time(),
            ];
            $DB->insert_record('block_mwa_dashboard_course', $record);
        }

        \block_mwa_dashboard\observer::invalidate_course_cache($courseid);
    }

    public function instance_config_save($data, $nolongerused = false) {
        parent::instance_config_save($data, $nolongerused);

        $courseid = $this->get_instance_courseid();
        if ($courseid > 1) {
            $this->update_course_capture($courseid, !empty($data->enablecapture));
        }
    }

    public function instance_delete() {
        global $DB;

        $courseid = $this->get_instance_courseid();
        $deleted = parent::instance_delete();
        if ($deleted && $courseid > 1) {
            $DB->delete_records('block_mwa_dashboard_course', ['courseid' => $courseid]);
            \block_mwa_dashboard\observer::invalidate_course_cache($courseid);
        }

        return $deleted;
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
