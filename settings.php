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
 * Plugin settings for block_mwa_dashboard.
 *
 * @package    block_mwa_dashboard
 * @copyright  2026 Bruno Porto
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

defined('MOODLE_INTERNAL') || die();

if ($ADMIN->fulltree) {

    // All core dashboard features (analytics, grades, alerts, interventions,
    // class lists, student profiles, heatmaps) work without any external AI
    // service. No licence, activation code or subscription is required.
    // All configurable settings are managed on a dedicated administration page.
    $settings->add(new admin_setting_heading(
        'block_mwa_dashboard/general_heading',
        get_string('settings_general_heading', 'block_mwa_dashboard'),
        get_string('settings_general_heading_desc', 'block_mwa_dashboard')
    ));

    $settings->add(new admin_setting_description(
        'block_mwa_dashboard/admin_page_link',
        get_string('settings_admin_page', 'block_mwa_dashboard'),
        html_writer::div(
            get_string('settings_admin_page_desc', 'block_mwa_dashboard'),
            'alert alert-info'
        ) . html_writer::link(
            new moodle_url('/blocks/mwa_dashboard/configaikey.php'),
            get_string('settings_admin_page_button', 'block_mwa_dashboard'),
            ['class' => 'btn btn-primary']
        )
    ));

    $PAGE->requires->js_call_amd('block_mwa_dashboard/adminai', 'init');
}
