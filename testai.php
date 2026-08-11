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
 * AI connection test page.
 *
 * @package    block_mwa_dashboard
 * @copyright  2026 Bruno Porto
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

require_once(__DIR__ . '/../../config.php');

require_login();
require_admin();

global $USER;

$url = new moodle_url('/blocks/mwa_dashboard/testai.php');
$PAGE->set_url($url);
$PAGE->set_context(context_system::instance());
$PAGE->set_pagelayout('admin');
$PAGE->set_title(get_string('settings_ia_test_heading', 'block_mwa_dashboard'));
$PAGE->set_heading(get_string('settings_ia_test_heading', 'block_mwa_dashboard'));

$tested = optional_param('test', 0, PARAM_BOOL);

echo $OUTPUT->header();

if ($tested && confirm_sesskey()) {
    try {
        \block_mwa_dashboard\ai\client::complete([
            [
                'role' => 'user',
                'category' => 'connection_test',
                'content' => 'Reply with exactly: MWA AI connection successful',
            ],
        ]);
        $details = get_string('settings_ia_test_success', 'block_mwa_dashboard', (object)[
            'provider' => \block_mwa_dashboard\ai\client::provider(),
            'model' => \block_mwa_dashboard\ai\client::model(),
        ]);
        \block_mwa_dashboard\ai\audit::record((int)$USER->id, 0, 'connection_test',
            'provider_connection_validation', ['connection_test'], 'success');
        echo $OUTPUT->notification($details, 'notifysuccess');
    } catch (Throwable $exception) {
        \block_mwa_dashboard\ai\audit::record((int)$USER->id, 0, 'connection_test',
            'provider_connection_validation', ['connection_test'], 'error');
        echo $OUTPUT->notification(
            get_string('settings_ia_test_failure', 'block_mwa_dashboard') . ' ' . s($exception->getMessage()),
            'notifyproblem'
        );
    }
}

echo html_writer::tag('p', get_string('settings_ia_test_page_desc', 'block_mwa_dashboard'));
echo html_writer::start_tag('form', ['method' => 'post', 'action' => $url]);
echo html_writer::empty_tag('input', ['type' => 'hidden', 'name' => 'sesskey', 'value' => sesskey()]);
echo html_writer::empty_tag('input', ['type' => 'hidden', 'name' => 'test', 'value' => 1]);
echo html_writer::tag(
    'button',
    get_string('settings_ia_test_button', 'block_mwa_dashboard'),
    ['type' => 'submit', 'class' => 'btn btn-primary']
);
echo html_writer::end_tag('form');

echo $OUTPUT->footer();
