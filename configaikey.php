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
 * MWA Dashboard administration page.
 * Handles data retention settings and optional AI provider configuration.
 * No licence, activation code or commercial key is required for any feature.
 *
 * @package    block_mwa_dashboard
 * @copyright  2026 Bruno Porto
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

require_once(__DIR__ . '/../../config.php');

require_login();
require_admin();

$context = context_system::instance();
$url     = new moodle_url('/blocks/mwa_dashboard/configaikey.php');
$settingsurl = new moodle_url('/admin/settings.php', ['section' => 'blocksettingmwa_dashboard']);

$PAGE->set_context($context);
$PAGE->set_url($url);
$PAGE->set_pagelayout('admin');
$PAGE->set_title(get_string('settings_admin_page', 'block_mwa_dashboard'));
$PAGE->set_heading(get_string('settings_admin_page', 'block_mwa_dashboard'));

// ── Process form submissions ──────────────────────────────────────────────────

if (data_submitted() && confirm_sesskey()) {
    $action = optional_param('action', '', PARAM_ALPHA);

    if ($action === 'general') {
        // Save data retention setting.
        $days = optional_param('data_retention_days', 365, PARAM_INT);
        $days = max(30, $days);
        set_config('data_retention_days', $days, 'block_mwa_dashboard');
        redirect($url, get_string('changessaved'), null,
            \core\output\notification::NOTIFY_SUCCESS);
    }

    if ($action === 'ai') {
        // Save optional AI settings.
        $iaenabled = optional_param('ia_enabled', 0, PARAM_BOOL);
        $provider  = optional_param('ia_provider', 'none', PARAM_ALPHANUMEXT);
        $model     = optional_param('ia_model', 'recommended', PARAM_ALPHANUMEXT);
        $timeout   = optional_param('ia_timeout', 90, PARAM_INT);
        $insturl   = optional_param('ia_institutional_url', '', PARAM_URL);
        $instmodel = optional_param('ia_institutional_model', '', PARAM_ALPHANUMEXT);
        $instprivate = optional_param('ia_institutional_private', 0, PARAM_BOOL);
        set_config('ia_enabled',  $iaenabled,   'block_mwa_dashboard');
        set_config('ia_provider', $provider,    'block_mwa_dashboard');
        set_config('ia_model',    $model,       'block_mwa_dashboard');
        set_config('ia_timeout',  max(10, $timeout), 'block_mwa_dashboard');
        set_config('ia_institutional_url',     $insturl,     'block_mwa_dashboard');
        set_config('ia_institutional_model',   $instmodel,   'block_mwa_dashboard');
        set_config('ia_institutional_private', $instprivate, 'block_mwa_dashboard');
        redirect($url, get_string('changessaved'), null,
            \core\output\notification::NOTIFY_SUCCESS);
    }

    if ($action === 'credential') {
        // Save or remove the optional provider credential.
        $provider    = (string)get_config('block_mwa_dashboard', 'ia_provider');
        $configkey   = $provider === 'institutional' ? 'ia_institutional_credential' : 'ia_provider_credential';
        $rotationkey = $provider === 'institutional' ? 'ia_institutional_credential_lastrotated' : 'ia_credential_lastrotated';
        if (optional_param('remove', 0, PARAM_BOOL)) {
            unset_config($configkey,   'block_mwa_dashboard');
            unset_config($rotationkey, 'block_mwa_dashboard');
            redirect($url, get_string('settings_ia_credential_removed', 'block_mwa_dashboard'), null,
                \core\output\notification::NOTIFY_SUCCESS);
        }
        $credential = trim(optional_param('credential', '', PARAM_TEXT));
        if ($credential === '') {
            redirect($url, get_string('settings_ia_credential_required', 'block_mwa_dashboard'), null,
                \core\output\notification::NOTIFY_ERROR);
        }
        set_config($configkey,   $credential, 'block_mwa_dashboard');
        set_config($rotationkey, time(),       'block_mwa_dashboard');
        redirect($url, get_string('settings_ia_credential_saved', 'block_mwa_dashboard'), null,
            \core\output\notification::NOTIFY_SUCCESS);
    }
}

// ── Read current values ───────────────────────────────────────────────────────

$retentiondays  = (int)get_config('block_mwa_dashboard', 'data_retention_days') ?: 365;
$iaenabled      = (bool)get_config('block_mwa_dashboard', 'ia_enabled');
$provider       = \block_mwa_dashboard\ai\client::provider();
$model          = (string)get_config('block_mwa_dashboard', 'ia_model') ?: 'recommended';
$timeout        = (int)get_config('block_mwa_dashboard', 'ia_timeout') ?: 90;
$insturl        = (string)get_config('block_mwa_dashboard', 'ia_institutional_url');
$instmodel      = (string)get_config('block_mwa_dashboard', 'ia_institutional_model');
$instprivate    = (bool)get_config('block_mwa_dashboard', 'ia_institutional_private');

$credkey        = $provider === 'institutional' ? 'ia_institutional_credential' : 'ia_provider_credential';
$rotkey         = $provider === 'institutional' ? 'ia_institutional_credential_lastrotated' : 'ia_credential_lastrotated';
$credconfigured = trim((string)get_config('block_mwa_dashboard', $credkey)) !== '';
$credlastrot    = (int)get_config('block_mwa_dashboard', $rotkey);
$rotoverdue     = $credconfigured && $credlastrot > 0 && (time() - $credlastrot) > (90 * DAYSECS);

// Provider options.
$provideroptions = [
    'none'        => get_string('settings_ia_provider_none',        'block_mwa_dashboard'),
    'deepseek'    => get_string('settings_ia_provider_deepseek',    'block_mwa_dashboard'),
    'openai'      => get_string('settings_ia_provider_openai',      'block_mwa_dashboard'),
    'gemini'      => get_string('settings_ia_provider_gemini',      'block_mwa_dashboard'),
    'anthropic'   => get_string('settings_ia_provider_anthropic',   'block_mwa_dashboard'),
    'institutional' => get_string('settings_ia_provider_institutional', 'block_mwa_dashboard'),
];
$modeloptions = [
    'recommended'       => get_string('settings_ia_model_recommended',      'block_mwa_dashboard'),
    'deepseek-v4-flash' => get_string('settings_ia_model_deepseek_v4_flash', 'block_mwa_dashboard'),
    'deepseek-v4-pro'   => get_string('settings_ia_model_deepseek_v4_pro',  'block_mwa_dashboard'),
    'gpt-4.1-mini'      => get_string('settings_ia_model_gpt41_mini',       'block_mwa_dashboard'),
    'gpt-4.1'           => get_string('settings_ia_model_gpt41',            'block_mwa_dashboard'),
    'gemini-3.5-flash'  => get_string('settings_ia_model_gemini35_flash',   'block_mwa_dashboard'),
    'claude-sonnet-4-6' => get_string('settings_ia_model_claude_sonnet46',  'block_mwa_dashboard'),
    'claude-sonnet-5'   => get_string('settings_ia_model_claude_sonnet5',   'block_mwa_dashboard'),
];

// ── Output ────────────────────────────────────────────────────────────────────

echo $OUTPUT->header();
echo $OUTPUT->heading(get_string('settings_admin_page', 'block_mwa_dashboard'));
echo html_writer::div(get_string('settings_admin_page_desc', 'block_mwa_dashboard'), 'alert alert-info mb-4');

// Quick-start guide for AI setup (only shown when AI not yet configured).
if (!$iaenabled || $provider === 'none' || $provider === '') {
    $steps = html_writer::tag('strong', get_string('settings_ia_quickstart', 'block_mwa_dashboard')) .
        html_writer::tag('ol',
            html_writer::tag('li', get_string('settings_ia_quickstart_step1', 'block_mwa_dashboard')) .
            html_writer::tag('li', get_string('settings_ia_quickstart_step2', 'block_mwa_dashboard')) .
            html_writer::tag('li', get_string('settings_ia_quickstart_step3', 'block_mwa_dashboard')) .
            html_writer::tag('li', get_string('settings_ia_quickstart_step4', 'block_mwa_dashboard')) .
            html_writer::tag('li', get_string('settings_ia_quickstart_step5', 'block_mwa_dashboard'))
        );
    echo html_writer::div($steps, 'card card-body bg-light mb-4');
}

// Helper to build a select element.
$selecthtml = function(string $name, array $options, string $current): string {
    $html = html_writer::start_tag('select', ['name' => $name, 'id' => 'id_' . $name, 'class' => 'custom-select form-control w-auto']);
    foreach ($options as $val => $label) {
        $attrs = ['value' => $val];
        if ((string)$val === (string)$current) {
            $attrs['selected'] = 'selected';
        }
        $html .= html_writer::tag('option', s($label), $attrs);
    }
    $html .= html_writer::end_tag('select');
    return $html;
};

// ── Section 1: General / data retention ──────────────────────────────────────
echo $OUTPUT->heading(get_string('settings_general_heading', 'block_mwa_dashboard'), 3);
echo html_writer::tag('p', get_string('settings_general_heading_desc', 'block_mwa_dashboard'));
echo html_writer::start_tag('form', ['method' => 'post', 'action' => $url->out(false)]);
echo html_writer::empty_tag('input', ['type' => 'hidden', 'name' => 'sesskey', 'value' => sesskey()]);
echo html_writer::empty_tag('input', ['type' => 'hidden', 'name' => 'action',  'value' => 'general']);
echo html_writer::start_div('form-group mb-3');
echo html_writer::tag('label', get_string('settings_data_retention_days', 'block_mwa_dashboard'), ['for' => 'id_data_retention_days']);
echo html_writer::empty_tag('input', ['type' => 'number', 'id' => 'id_data_retention_days',
    'name' => 'data_retention_days', 'value' => $retentiondays, 'min' => '30', 'class' => 'form-control w-auto']);
echo html_writer::div(get_string('settings_data_retention_days_desc', 'block_mwa_dashboard'), 'form-text text-muted');
echo html_writer::end_div();
echo html_writer::tag('button', get_string('savechanges'), ['type' => 'submit', 'class' => 'btn btn-primary']);
echo html_writer::end_tag('form');

// ── Section 2: Optional AI integration ───────────────────────────────────────
echo html_writer::tag('hr', '');
echo $OUTPUT->heading(get_string('settings_ia_heading', 'block_mwa_dashboard'), 3);
echo html_writer::div(get_string('settings_ia_heading_desc', 'block_mwa_dashboard'), 'alert alert-info mb-3');
echo html_writer::start_tag('form', ['method' => 'post', 'action' => $url->out(false)]);
echo html_writer::empty_tag('input', ['type' => 'hidden', 'name' => 'sesskey', 'value' => sesskey()]);
echo html_writer::empty_tag('input', ['type' => 'hidden', 'name' => 'action',  'value' => 'ai']);

// Enable checkbox.
echo html_writer::start_div('form-check mb-3');
$chkattrs = ['type' => 'checkbox', 'id' => 'id_ia_enabled', 'name' => 'ia_enabled', 'value' => '1', 'class' => 'form-check-input'];
if ($iaenabled) {
    $chkattrs['checked'] = 'checked';
}
echo html_writer::empty_tag('input', $chkattrs);
echo html_writer::tag('label', get_string('settings_ia_enabled', 'block_mwa_dashboard'), ['class' => 'form-check-label', 'for' => 'id_ia_enabled']);
echo html_writer::div(get_string('settings_ia_enabled_desc', 'block_mwa_dashboard'), 'form-text text-muted');
echo html_writer::end_div();

// Provider select.
echo html_writer::start_div('form-group mb-3');
echo html_writer::tag('label', get_string('settings_ia_provider', 'block_mwa_dashboard'), ['for' => 'id_ia_provider']);
echo $selecthtml('ia_provider', $provideroptions, $provider);
echo html_writer::div(get_string('settings_ia_provider_desc', 'block_mwa_dashboard'), 'form-text text-muted');
echo html_writer::end_div();

// Model select.
echo html_writer::start_div('form-group mb-3');
echo html_writer::tag('label', get_string('settings_ia_model', 'block_mwa_dashboard'), ['for' => 'id_ia_model']);
echo $selecthtml('ia_model', $modeloptions, $model);
echo html_writer::end_div();

// Timeout.
echo html_writer::start_div('form-group mb-3');
echo html_writer::tag('label', get_string('settings_ia_timeout', 'block_mwa_dashboard'), ['for' => 'id_ia_timeout']);
echo html_writer::empty_tag('input', ['type' => 'number', 'id' => 'id_ia_timeout',
    'name' => 'ia_timeout', 'value' => $timeout, 'min' => '10', 'class' => 'form-control w-auto']);
echo html_writer::end_div();

// Institutional fields.
echo html_writer::start_div('form-group mb-3');
echo html_writer::tag('label', get_string('settings_ia_institutional_url', 'block_mwa_dashboard'), ['for' => 'id_ia_institutional_url']);
echo html_writer::empty_tag('input', ['type' => 'url', 'id' => 'id_ia_institutional_url',
    'name' => 'ia_institutional_url', 'value' => s($insturl), 'class' => 'form-control']);
echo html_writer::end_div();
echo html_writer::start_div('form-group mb-3');
echo html_writer::tag('label', get_string('settings_ia_institutional_model', 'block_mwa_dashboard'), ['for' => 'id_ia_institutional_model']);
echo html_writer::empty_tag('input', ['type' => 'text', 'id' => 'id_ia_institutional_model',
    'name' => 'ia_institutional_model', 'value' => s($instmodel), 'class' => 'form-control']);
echo html_writer::end_div();

echo html_writer::tag('button', get_string('savechanges'), ['type' => 'submit', 'class' => 'btn btn-primary']);
echo html_writer::end_tag('form');

// ── Section 3: Provider credential (only if provider != none) ─────────────────
if ($provider !== 'none' && $provider !== '') {
    echo html_writer::tag('hr', '');
    echo $OUTPUT->heading(get_string('settings_ia_credential', 'block_mwa_dashboard'), 3);
    echo html_writer::tag('p', get_string('settings_ia_credential_page_desc', 'block_mwa_dashboard'));
    if ($credconfigured && $credlastrot > 0) {
        echo html_writer::tag('p',
            get_string('settings_ia_credential_lastrotated', 'block_mwa_dashboard', userdate($credlastrot)),
            ['class' => 'alert alert-secondary']);
    }
    if ($rotoverdue) {
        echo html_writer::tag('p',
            get_string('settings_ia_credential_rotation_warning', 'block_mwa_dashboard'),
            ['class' => 'alert alert-warning']);
    }
    echo html_writer::start_tag('form', ['method' => 'post', 'action' => $url->out(false)]);
    echo html_writer::empty_tag('input', ['type' => 'hidden', 'name' => 'sesskey', 'value' => sesskey()]);
    echo html_writer::empty_tag('input', ['type' => 'hidden', 'name' => 'action',  'value' => 'credential']);
    echo html_writer::start_div('form-group mb-3');
    echo html_writer::tag('label', get_string('settings_ia_credential', 'block_mwa_dashboard'), ['for' => 'id_credential']);
    echo html_writer::empty_tag('input', ['type' => 'password', 'id' => 'id_credential', 'name' => 'credential',
        'class' => 'form-control', 'autocomplete' => 'new-password']);
    echo html_writer::div(get_string('settings_ia_credential_never_shown', 'block_mwa_dashboard'), 'form-text text-muted');
    echo html_writer::end_div();
    echo html_writer::tag('button', get_string('settings_ia_credential_save_new', 'block_mwa_dashboard'),
        ['type' => 'submit', 'class' => 'btn btn-primary mr-2']);
    if ($credconfigured) {
        echo html_writer::tag('button', get_string('settings_ia_credential_remove', 'block_mwa_dashboard'), [
            'type' => 'submit', 'name' => 'remove', 'value' => '1', 'class' => 'btn btn-danger',
            'formnovalidate' => 'formnovalidate']);
    }
    echo html_writer::end_tag('form');

    // Test connection link.
    echo html_writer::tag('hr', '');
    echo html_writer::link(
        new moodle_url('/blocks/mwa_dashboard/testai.php'),
        get_string('settings_ia_test_button', 'block_mwa_dashboard'),
        ['class' => 'btn btn-secondary']
    );
}

echo $OUTPUT->footer();
