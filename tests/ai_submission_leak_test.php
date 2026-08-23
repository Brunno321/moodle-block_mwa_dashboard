<?php
// This file is part of Moodle - http://moodle.org/.

namespace block_mwa_dashboard;

defined('MOODLE_INTERNAL') || die();

/**
 * Tests that student submission content cannot enter an AI request.
 *
 * @package    block_mwa_dashboard
 * @copyright  2026 Bruno Porto
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
final class ai_submission_leak_test extends \advanced_testcase {
    /** Injected submission content must be removed by the final filter. */
    public function test_injected_submission_content_is_removed(): void {
        $method = new \ReflectionMethod(\block_mwa_dashboard\ai\client::class, 'scrub_messages');
        $method->setAccessible(true);
        $messages = $method->invoke(null, [[
            'role' => 'user',
            'category' => 'individual_summary',
            'content' => "submission_files: Este é o texto que o estudante enviou na atividade\n" .
                'Nota agregada: 71.4',
        ]], []);

        $this->assertStringNotContainsString('Este é o texto que o estudante enviou na atividade',
            $messages[0]['content']);
        $this->assertStringNotContainsString('submission_files', $messages[0]['content']);
    }

    /** Assignment submission file areas must remain excluded from content extraction. */
    public function test_assignment_submission_file_areas_are_not_queried(): void {
        $source = file_get_contents(__DIR__ . '/../classes/external.php');
        $this->assertIsString($source);
        $this->assertMatchesRegularExpression('/[\'\"]assign[\'\"]\s*=>\s*\[\s*\]/', $source);
        $this->assertDoesNotMatchRegularExpression(
            '/get_area_files\([^;]*(?:assignsubmission_file|submission_files|onlinetext)/is',
            $source
        );
    }
}
