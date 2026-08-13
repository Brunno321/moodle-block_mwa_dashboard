<?php
// This file is part of Moodle - http://moodle.org/.

namespace block_mwa_dashboard;

defined('MOODLE_INTERNAL') || die();

/**
 * Tests the metadata-only local AI audit trail.
 *
 * @package    block_mwa_dashboard
 * @copyright  2026 Bruno Porto
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
final class ai_audit_test extends \advanced_testcase {
    /** Audit rows contain operational metadata and no prompt or response columns. */
    public function test_audit_stores_metadata_only(): void {
        global $DB;

        $this->resetAfterTest(true);
        set_config('ia_provider', 'deepseek', 'block_mwa_dashboard');
        \block_mwa_dashboard\ai\audit::record(
            84,
            27,
            'chat',
            'aggregate_pedagogical_analysis',
            ['aggregate_context', 'activity_metrics', 'forbidden_category'],
            'success'
        );

        $record = $DB->get_record('block_mwa_dashboard_aiaudit', ['userid' => 84], '*', MUST_EXIST);
        $this->assertSame(27, (int)$record->courseid);
        $this->assertSame('chat', $record->operation);
        $this->assertSame('aggregate_pedagogical_analysis', $record->purpose);
        $this->assertSame('deepseek', $record->provider);
        $this->assertSame('https://api.deepseek.com/chat/completions', $record->endpoint);
        $this->assertSame('aggregate_context,activity_metrics', $record->categories);
        $this->assertSame('success', $record->status);
        foreach (['prompt', 'response', 'credential', 'student_name'] as $forbiddenproperty) {
            $this->assertFalse(property_exists($record, $forbiddenproperty));
        }
    }
}
