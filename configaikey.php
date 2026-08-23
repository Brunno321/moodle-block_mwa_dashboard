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
require_once($CFG->libdir . '/filelib.php');

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

/**
 * Validate an OpenRouter model slug while preserving provider/model separators.
 *
 * @param string $model Raw model value.
 * @return string Safe OpenRouter model id.
 */
function block_mwa_dashboard_clean_openrouter_model(string $model): string {
    $model = trim(clean_param($model, PARAM_TEXT));
    if ($model === '' || !preg_match('/^[A-Za-z0-9._~:\/-]{1,160}$/', $model)) {
        return 'openrouter/auto';
    }
    return $model;
}

/**
 * Decide whether OpenRouter reports a model as free.
 *
 * @param array $model OpenRouter model metadata.
 * @return bool
 */
function block_mwa_dashboard_openrouter_model_is_free(array $model): bool {
    $id = strtolower((string)($model['id'] ?? ''));
    if (strpos($id, ':free') !== false) {
        return true;
    }
    $pricing = $model['pricing'] ?? null;
    if (!is_array($pricing)) {
        return false;
    }
    $seenprice = false;
    foreach (['prompt', 'completion', 'request'] as $field) {
        if (!array_key_exists($field, $pricing)) {
            continue;
        }
        $seenprice = true;
        if ((float)$pricing[$field] > 0) {
            return false;
        }
    }
    return $seenprice;
}

/**
 * Load OpenRouter text models for the administrator model picker.
 *
 * @param bool $freeonly Whether to show only free models.
 * @param string $current Currently saved model id.
 * @return array{0: array, 1: bool} Select options and API availability flag.
 */
function block_mwa_dashboard_openrouter_model_options(bool $freeonly, string $current): array {
    $options = [];
    $available = false;
    $headers = ['Accept: application/json'];
    $credential = trim((string)get_config('block_mwa_dashboard', 'ia_provider_credential'));
    if ($credential !== '') {
        $headers[] = 'Authorization: Bearer ' . $credential;
    }

    $curl = new curl();
    $curl->setopt(['CURLOPT_TIMEOUT' => 20, 'CURLOPT_RETURNTRANSFER' => true]);
    $response = $curl->get('https://openrouter.ai/api/v1/models?output_modalities=text&sort=pricing-low-to-high',
        [], ['CURLOPT_HTTPHEADER' => $headers]);
    $info = $curl->get_info();
    $status = (int)($info['http_code'] ?? 0);
    $data = json_decode((string)$response, true);

    if (!$curl->get_errno() && $status >= 200 && $status < 300 && is_array($data['data'] ?? null)) {
        $available = true;
        foreach ($data['data'] as $item) {
            if (!is_array($item)) {
                continue;
            }
            $id = block_mwa_dashboard_clean_openrouter_model((string)($item['id'] ?? $item['canonical_slug'] ?? ''));
            if ($id === 'openrouter/auto' && empty($item['id'])) {
                continue;
            }
            $modalities = $item['architecture']['output_modalities'] ?? [];
            if (is_array($modalities) && $modalities && !in_array('text', $modalities, true)) {
                continue;
            }
            $isfree = block_mwa_dashboard_openrouter_model_is_free($item);
            if ($freeonly && !$isfree) {
                continue;
            }
            $name = trim((string)($item['name'] ?? $id));
            $badge = $isfree
                ? get_string('settings_ia_openrouter_model_free', 'block_mwa_dashboard')
                : get_string('settings_ia_openrouter_model_paid', 'block_mwa_dashboard');
            $options[$id] = $name . ' - ' . $badge . ' (' . $id . ')';
        }
    }

    $current = block_mwa_dashboard_clean_openrouter_model($current);
    if ($current !== '' && !isset($options[$current])) {
        $options[$current] = get_string('settings_ia_openrouter_model_current', 'block_mwa_dashboard', $current);
    }
    if (!$options) {
        $options['openrouter/auto'] = get_string('settings_ia_openrouter_model_auto', 'block_mwa_dashboard');
    }
    return [$options, $available];
}

// ── Process form submissions ──────────────────────────────────────────────────

if (data_submitted() && confirm_sesskey()) {
    $action = optional_param('action', '', PARAM_ALPHA);

    if ($action === 'general') {
        // Save data retention setting.
        $days = optional_param('data_retention_days', 90, PARAM_INT);
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
        $openroutermodel = block_mwa_dashboard_clean_openrouter_model(
            optional_param('ia_openrouter_model', 'openrouter/auto', PARAM_TEXT)
        );
        $openrouterfreeonly = optional_param('ia_openrouter_free_only', 1, PARAM_BOOL);
        if (!in_array($provider, ['none', 'deepseek', 'openai', 'gemini', 'anthropic', 'openrouter', 'institutional'], true)) {
            $provider = 'none';
        }
        set_config('ia_enabled',  $iaenabled,   'block_mwa_dashboard');
        set_config('ia_provider', $provider,    'block_mwa_dashboard');
        set_config('ia_model',    $model,       'block_mwa_dashboard');
        set_config('ia_timeout',  max(10, $timeout), 'block_mwa_dashboard');
        set_config('ia_institutional_url',     $insturl,     'block_mwa_dashboard');
        set_config('ia_institutional_model',   $instmodel,   'block_mwa_dashboard');
        set_config('ia_institutional_private', $instprivate, 'block_mwa_dashboard');
        set_config('ia_openrouter_model',      $openroutermodel,     'block_mwa_dashboard');
        set_config('ia_openrouter_free_only',  $openrouterfreeonly,  'block_mwa_dashboard');
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

$retentiondays  = (int)get_config('block_mwa_dashboard', 'data_retention_days') ?: 90;
$iaenabled      = (bool)get_config('block_mwa_dashboard', 'ia_enabled');
$provider       = \block_mwa_dashboard\ai\client::provider();
$model          = (string)get_config('block_mwa_dashboard', 'ia_model') ?: 'recommended';
$timeout        = (int)get_config('block_mwa_dashboard', 'ia_timeout') ?: 90;
$insturl        = (string)get_config('block_mwa_dashboard', 'ia_institutional_url');
$instmodel      = (string)get_config('block_mwa_dashboard', 'ia_institutional_model');
$instprivate    = (bool)get_config('block_mwa_dashboard', 'ia_institutional_private');
$openroutermodel = block_mwa_dashboard_clean_openrouter_model(
    (string)get_config('block_mwa_dashboard', 'ia_openrouter_model')
);
$openrouterfreeonlyconfig = get_config('block_mwa_dashboard', 'ia_openrouter_free_only');
$openrouterfreeonly = $openrouterfreeonlyconfig === false ? true : (bool)$openrouterfreeonlyconfig;

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
    'openrouter'  => get_string('settings_ia_provider_openrouter',  'block_mwa_dashboard'),
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
if ($provider === 'openrouter') {
    [$openrouteroptions, $openroutermodelsavailable] =
        block_mwa_dashboard_openrouter_model_options($openrouterfreeonly, $openroutermodel);
} else {
    $openrouteroptions = [
        $openroutermodel => get_string('settings_ia_openrouter_model_current', 'block_mwa_dashboard', $openroutermodel),
    ];
    $openroutermodelsavailable = true;
}

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
$regularmodelstyle = in_array($provider, ['openrouter', 'institutional'], true) ? 'display:none' : '';
echo html_writer::start_div('form-group mb-3', ['id' => 'mwa_regular_model_fields', 'style' => $regularmodelstyle]);
echo html_writer::tag('label', get_string('settings_ia_model', 'block_mwa_dashboard'), ['for' => 'id_ia_model']);
echo $selecthtml('ia_model', $modeloptions, $model);
echo html_writer::end_div();

// OpenRouter dynamic model fields.
$openrouterstyle = $provider === 'openrouter' ? '' : 'display:none';
echo html_writer::start_div('border rounded p-3 mb-3', ['id' => 'mwa_openrouter_fields', 'style' => $openrouterstyle]);
echo html_writer::tag('h4', get_string('settings_ia_openrouter_heading', 'block_mwa_dashboard'), ['class' => 'h5 mb-3']);
echo html_writer::start_div('form-group mb-3');
echo html_writer::tag('label', get_string('settings_ia_openrouter_free_only', 'block_mwa_dashboard'),
    ['for' => 'id_ia_openrouter_free_only']);
echo $selecthtml('ia_openrouter_free_only', [
    '1' => get_string('settings_ia_openrouter_free_only_yes', 'block_mwa_dashboard'),
    '0' => get_string('settings_ia_openrouter_free_only_no', 'block_mwa_dashboard'),
], $openrouterfreeonly ? '1' : '0');
echo html_writer::div(get_string('settings_ia_openrouter_free_only_desc', 'block_mwa_dashboard'), 'form-text text-muted');
echo html_writer::end_div();
echo html_writer::start_div('form-group mb-3');
echo html_writer::tag('label', get_string('settings_ia_openrouter_model', 'block_mwa_dashboard'),
    ['for' => 'id_ia_openrouter_model']);
echo $selecthtml('ia_openrouter_model', $openrouteroptions, $openroutermodel);
echo html_writer::div(get_string('settings_ia_openrouter_model_desc', 'block_mwa_dashboard'), 'form-text text-muted');
echo html_writer::end_div();
if ($provider === 'openrouter' && !$openroutermodelsavailable) {
    echo html_writer::div(get_string('settings_ia_openrouter_models_unavailable', 'block_mwa_dashboard'),
        'alert alert-warning mb-0');
}
echo html_writer::end_div();

// Timeout.
echo html_writer::start_div('form-group mb-3');
echo html_writer::tag('label', get_string('settings_ia_timeout', 'block_mwa_dashboard'), ['for' => 'id_ia_timeout']);
echo html_writer::empty_tag('input', ['type' => 'number', 'id' => 'id_ia_timeout',
    'name' => 'ia_timeout', 'value' => $timeout, 'min' => '10', 'class' => 'form-control w-auto']);
echo html_writer::end_div();

// Institutional fields.
$institutionalstyle = $provider === 'institutional' ? '' : 'display:none';
echo html_writer::start_div('', ['id' => 'mwa_institutional_fields', 'style' => $institutionalstyle]);
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
echo html_writer::start_div('form-check mb-3');
$instprivateattrs = ['type' => 'checkbox', 'id' => 'id_ia_institutional_private', 'name' => 'ia_institutional_private',
    'value' => '1', 'class' => 'form-check-input'];
if ($instprivate) {
    $instprivateattrs['checked'] = 'checked';
}
echo html_writer::empty_tag('input', $instprivateattrs);
echo html_writer::tag('label', get_string('settings_ia_institutional_private', 'block_mwa_dashboard'),
    ['class' => 'form-check-label', 'for' => 'id_ia_institutional_private']);
echo html_writer::end_div();
echo html_writer::end_div();

echo html_writer::tag('button', get_string('savechanges'), ['type' => 'submit', 'class' => 'btn btn-primary']);
echo html_writer::end_tag('form');
echo html_writer::script("
(function() {
    var provider = document.getElementById('id_ia_provider');
    var regular = document.getElementById('mwa_regular_model_fields');
    var openrouter = document.getElementById('mwa_openrouter_fields');
    var institutional = document.getElementById('mwa_institutional_fields');
    if (!provider) {
        return;
    }
    function toggleProviderFields() {
        var value = provider.value;
        if (regular) {
            regular.style.display = (value === 'openrouter' || value === 'institutional') ? 'none' : '';
        }
        if (openrouter) {
            openrouter.style.display = value === 'openrouter' ? '' : 'none';
        }
        if (institutional) {
            institutional.style.display = value === 'institutional' ? '' : 'none';
        }
    }
    provider.addEventListener('change', toggleProviderFields);
    toggleProviderFields();
}());
");

// ── Section 3: Provider credential (only if provider != none) ─────────────────
if ($provider !== 'none' && $provider !== '') {
    echo html_writer::tag('hr', '');
    echo $OUTPUT->heading(get_string('settings_ia_credential', 'block_mwa_dashboard'), 3);
    echo html_writer::tag('p',
        get_string('settings_ia_credential_provider', 'block_mwa_dashboard', $provideroptions[$provider] ?? $provider),
        ['class' => 'alert alert-secondary']);
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
    $credentiallabel = $provider === 'openrouter'
        ? get_string('settings_ia_openrouter_api_key', 'block_mwa_dashboard')
        : get_string('settings_ia_credential', 'block_mwa_dashboard');
    echo html_writer::tag('label', $credentiallabel, ['for' => 'id_credential']);
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
