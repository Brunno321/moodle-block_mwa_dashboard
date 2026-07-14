<?php
// This file is part of Moodle - http://moodle.org/
//
// @package    block_mwa_dashboard
// @copyright  2026 Bruno Porto
// @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later

defined('MOODLE_INTERNAL') || die();

if ($ADMIN->fulltree) {

    // ── AI server endpoint ──────────────────────────────────
    $settings->add(new admin_setting_heading(
        'block_mwa_dashboard/ia_heading',
        get_string('settings_ia_heading', 'block_mwa_dashboard'),
        get_string('settings_ia_heading_desc', 'block_mwa_dashboard')
    ));

    $settings->add(new admin_setting_configtext(
        'block_mwa_dashboard/ia_endpoint',
        get_string('settings_ia_endpoint', 'block_mwa_dashboard'),
        get_string('settings_ia_endpoint_desc', 'block_mwa_dashboard'),
        'https://mwa-6exk.onrender.com',
        PARAM_URL
    ));

    // ── API key (optional, for server authentication) ───────
    $settings->add(new admin_setting_configpasswordunmask(
        'block_mwa_dashboard/ia_apikey',
        get_string('settings_ia_apikey', 'block_mwa_dashboard'),
        get_string('settings_ia_apikey_desc', 'block_mwa_dashboard'),
        ''
    ));

    // ── Preferred provider ───────────────────────────────────────
    $settings->add(new admin_setting_configselect(
        'block_mwa_dashboard/ia_provider',
        get_string('settings_ia_provider', 'block_mwa_dashboard'),
        get_string('settings_ia_provider_desc', 'block_mwa_dashboard'),
        'auto',
        [
            'auto'     => get_string('settings_ia_provider_auto',    'block_mwa_dashboard'),
            'gemini'   => get_string('settings_ia_provider_gemini',  'block_mwa_dashboard'),
            'openai'   => get_string('settings_ia_provider_openai',  'block_mwa_dashboard'),
            'deepseek' => get_string('settings_ia_provider_deepseek','block_mwa_dashboard'),
            'claude'   => get_string('settings_ia_provider_claude',  'block_mwa_dashboard'),
        ]
    ));

    // ── Maximum response timeout ─────────────────────────────────
    $settings->add(new admin_setting_configtext(
        'block_mwa_dashboard/ia_timeout',
        get_string('settings_ia_timeout', 'block_mwa_dashboard'),
        get_string('settings_ia_timeout_desc', 'block_mwa_dashboard'),
        '90',
        PARAM_INT
    ));

    // ── Connection test button ────────────────────────────────
    $settings->add(new admin_setting_heading(
        'block_mwa_dashboard/ia_test_heading',
        get_string('settings_ia_test_heading', 'block_mwa_dashboard'),
        get_string('settings_ia_test_desc', 'block_mwa_dashboard')
    ));
}
