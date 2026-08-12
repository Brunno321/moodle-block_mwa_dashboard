<?php
// This file is part of Moodle - http://moodle.org/.

namespace block_mwa_dashboard;

defined('MOODLE_INTERNAL') || die();

/**
 * Tests the central category and structured-field allowlists.
 *
 * @package    block_mwa_dashboard
 * @copyright  2026 Bruno Porto
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
final class ai_allowlist_test extends \advanced_testcase {
    /** @return \ReflectionMethod Final transport filter. */
    private function filter_method(): \ReflectionMethod {
        $method = new \ReflectionMethod(\block_mwa_dashboard\ai\client::class, 'scrub_messages');
        $method->setAccessible(true);
        return $method;
    }

    /** Only explicitly accepted structured educational fields are preserved. */
    public function test_unknown_structured_field_is_removed(): void {
        $messages = $this->filter_method()->invoke(null, [[
            'role' => 'user',
            'category' => 'aggregate_context',
            'content' => '{"notaMedia":71.4,"secretField":"must-not-leak"}',
        ]], []);

        $this->assertStringContainsString('"notaMedia":71.4', $messages[0]['content']);
        $this->assertStringNotContainsString('secretField', $messages[0]['content']);
        $this->assertStringNotContainsString('must-not-leak', $messages[0]['content']);
    }

    /** Messages outside the category allowlist are rejected, not transmitted. */
    public function test_unknown_message_category_is_rejected(): void {
        $this->expectException(\moodle_exception::class);
        $this->expectExceptionMessage(get_string('ai_empty_request', 'block_mwa_dashboard'));
        $this->filter_method()->invoke(null, [[
            'role' => 'user',
            'category' => 'untrusted_raw_data',
            'content' => 'Sensitive content',
        ]], []);
    }
}
