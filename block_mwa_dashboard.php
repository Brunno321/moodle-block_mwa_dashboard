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
     * Check whether capture is enabled for this course.
     *
     * @param int $courseid Course ID.
     * @return bool Whether capture is enabled.
     */
    private function course_capture_enabled(int $courseid): bool {
        return \block_mwa_dashboard\api::course_capture_enabled($courseid);
    }

    public function instance_config_save($data, $nolongerused = false) {
        $saved = parent::instance_config_save($data, $nolongerused);

        $courseid = $this->get_instance_courseid();
        if ($courseid > 1 && property_exists($data, 'enablecapture')) {
            \block_mwa_dashboard\api::update_course_capture($courseid, !empty($data->enablecapture));
        }

        return $saved;
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
        global $COURSE, $PAGE;

        if ($this->content !== null) {
            return $this->content;
        }

        $this->content = new stdClass();
        $courseid = (int)($PAGE->course->id ?? $COURSE->id ?? SITEID);
        if ($courseid <= SITEID) {
            $courses = \block_mwa_dashboard\api::get_dashboard_courses();
            $requestedcourseid = optional_param('course', 0, PARAM_INT);
            $courseids = array_map(function($course): int {
                return (int)$course->id;
            }, $courses);

            if (in_array($requestedcourseid, $courseids, true)) {
                $courseid = $requestedcourseid;
            } else if (count($courses) === 1) {
                $courseid = (int)$courses[0]->id;
            } else if (count($courses) > 1) {
                $options = ['' => get_string('choose')];
                foreach ($courses as $course) {
                    $options[(int)$course->id] = format_string($course->fullname);
                }
                $selector = html_writer::start_tag('form', [
                    'method' => 'get',
                    'action' => (new moodle_url('/blocks/mwa_dashboard/view.php'))->out(false),
                ]) . html_writer::label(get_string('course'), 'mwa-dashboard-course-' . (int)$this->instance->id) .
                    html_writer::select($options, 'course', '', '', [
                        'id' => 'mwa-dashboard-course-' . (int)$this->instance->id,
                        'class' => 'form-select',
                        'required' => 'required',
                    ]) . html_writer::tag('button', get_string('opendashboard', 'block_mwa_dashboard'), [
                        'type' => 'submit',
                        'class' => 'btn btn-primary mt-2',
                    ]) . html_writer::end_tag('form');
                $this->content->text = $selector;
                $this->content->footer = '';
                return $this->content;
            } else {
                $this->content->text = '';
                return $this->content;
            }
        }

        $context  = context_course::instance($courseid);

        if (!has_capability('block/mwa_dashboard:view', $context)) {
            $this->content->text = '';
            return $this->content;
        }

        $trackallcourses = \block_mwa_dashboard\api::track_all_courses_enabled();
        $canmanagecapture = has_capability('block/mwa_dashboard:managecapture', $context);
        $toggle = optional_param('mwa_capture_toggle', null, PARAM_INT);
        $blockid = optional_param('mwa_capture_blockid', 0, PARAM_INT);
        if ($canmanagecapture && !$trackallcourses && $blockid === (int)$this->instance->id && $toggle !== null) {
            require_sesskey();
            \block_mwa_dashboard\api::update_course_capture($courseid, !empty($toggle));
            redirect($PAGE->url);
        }

        $url = new moodle_url('/blocks/mwa_dashboard/view.php', ['course' => $courseid]);
        $captureenabled = $this->course_capture_enabled($courseid);

        $capturecontrol = '';
        if ($trackallcourses && $courseid > 1) {
            $capturecontrol = html_writer::div(
                get_string('capture_global_enabled', 'block_mwa_dashboard'),
                'alert alert-info'
            );
        } else if ($canmanagecapture && $courseid > 1) {
            $switchbg = $captureenabled ? '#65c915' : '#ee3216';
            $switchshadow = $captureenabled ? 'rgba(79,160,14,.35)' : 'rgba(196,47,20,.32)';
            $knobstyle = $captureenabled
                ? 'right:3px;left:auto;'
                : 'left:3px;right:auto;';
            $switchtext = $captureenabled
                ? html_writer::tag('span', get_string('capture_status_active', 'block_mwa_dashboard'), [
                    'style' => 'position:absolute;left:11px;top:50%;transform:translateY(-50%);',
                ])
                : html_writer::tag('span', get_string('capture_status_inactive', 'block_mwa_dashboard'), [
                    'style' => 'position:absolute;right:9px;top:50%;transform:translateY(-50%);',
                ]);
            $buttonlabel = html_writer::tag('span', get_string('capturedatalabel', 'block_mwa_dashboard'), [
                'style' => 'font-weight:800;color:#1f2937;font-size:.78rem;',
            ]);
            $capturetiptext = get_string('captureactivationtip', 'block_mwa_dashboard');
            $capturetip = html_writer::tag('span', '?', [
                'tabindex' => '0',
                'role' => 'img',
                'aria-label' => $capturetiptext,
                'title' => $capturetiptext,
                'style' => 'display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;' .
                    'margin-left:5px;border:1px solid #cbd5e1;border-radius:999px;background:#fff;' .
                    'color:#657089;font-size:.7rem;font-weight:900;line-height:1;cursor:help;',
            ]);
            $buttonlabel = html_writer::tag('span', $buttonlabel . $capturetip, [
                'style' => 'display:inline-flex;align-items:center;',
            ]);
            $switch = html_writer::tag('span',
                $switchtext .
                html_writer::tag('span', '', [
                    'aria-hidden' => 'true',
                    'style' => 'position:absolute;top:3px;' . $knobstyle .
                        'width:24px;height:24px;border-radius:999px;background:#fff;' .
                        'box-shadow:inset 0 0 0 1px rgba(0,0,0,.15),0 1px 4px rgba(0,0,0,.22);',
                ]),
                [
                    'aria-hidden' => 'true',
                    'style' => 'position:relative;display:inline-block;flex:0 0 auto;width:66px;height:30px;' .
                        'border-radius:999px;background:' . $switchbg . ';color:#fff;' .
                        'font-size:.78rem;font-weight:900;line-height:30px;text-shadow:0 1px 1px rgba(0,0,0,.18);' .
                        'box-shadow:inset 0 -1px 0 rgba(0,0,0,.13),0 1px 5px ' . $switchshadow . ';',
                ]
            );

            $capturecontrol = html_writer::tag('div',
                html_writer::start_tag('form', [
                    'method' => 'post',
                    'action' => $PAGE->url->out(false),
                    'style' => 'margin:0;',
                ]) .
                html_writer::empty_tag('input', [
                    'type' => 'hidden',
                    'name' => 'sesskey',
                    'value' => sesskey(),
                ]) .
                html_writer::empty_tag('input', [
                    'type' => 'hidden',
                    'name' => 'mwa_capture_blockid',
                    'value' => (int)$this->instance->id,
                ]) .
                html_writer::empty_tag('input', [
                    'type' => 'hidden',
                    'name' => 'mwa_capture_toggle',
                    'value' => $captureenabled ? 0 : 1,
                ]) .
                html_writer::tag('button', $buttonlabel . $switch, [
                    'type' => 'submit',
                    'class' => 'btn btn-link',
                    'style' => 'width:100%;display:flex;align-items:center;justify-content:space-between;gap:.5rem;' .
                        'border:0;background:transparent;box-shadow:none;text-decoration:none;padding:.1rem 5px;' .
                        'line-height:1.2;',
                    'aria-label' => get_string('capturedatalabel', 'block_mwa_dashboard') . ': ' .
                        ($captureenabled ? get_string('captureenabledstatus', 'block_mwa_dashboard') :
                            get_string('capturedisabledstatus', 'block_mwa_dashboard')),
                ]) .
                html_writer::end_tag('form'),
                ['style' => 'margin-top:.65rem;']
            );
        }

        $this->content->text = html_writer::tag('div',
            html_writer::tag('p',
                get_string('blockintro', 'block_mwa_dashboard'),
                ['style' => 'font-size:.85rem;color:#555;margin-bottom:.75rem;']
            ) .
            html_writer::link($url,
                get_string('opendashboard', 'block_mwa_dashboard'),
                ['class' => 'btn btn-primary', 'style' => 'width:100%;text-align:center;']
            ) .
            $capturecontrol,
            ['style' => 'text-align:center;padding:.5rem;']
        );

        $this->content->footer = '';
        return $this->content;
    }

    public function has_config() {
        return true;
    }
}
