<?php
// This file is part of Moodle - http://moodle.org/

/**
 * Instance configuration form for block_mwa_dashboard.
 *
 * @package    block_mwa_dashboard
 * @copyright  2026 Bruno Porto
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

defined('MOODLE_INTERNAL') || die();

/**
 * Per-instance configuration form.
 */
class block_mwa_dashboard_edit_form extends block_edit_form {

    /**
     * Add block-specific fields.
     *
     * @param MoodleQuickForm $mform The form being built.
     */
    protected function specific_definition($mform) {
        // Data collection is controlled directly from the block card.
    }
}
