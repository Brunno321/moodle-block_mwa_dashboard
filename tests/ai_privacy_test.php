<?php
// This file is part of Moodle - http://moodle.org/.

namespace block_mwa_dashboard;

defined('MOODLE_INTERNAL') || die();

/**
 * Tests the final AI transport filter against direct identifier leakage.
 *
 * @package    block_mwa_dashboard
 * @copyright  2026 Bruno Porto
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
final class ai_privacy_test extends \advanced_testcase {
    /**
     * Invoke the private transport filter without making an external request.
     *
     * @param array $messages Messages to filter.
     * @param array $identifiers Direct identifiers to reject.
     * @return array
     */
    private function filter(array $messages, array $identifiers): array {
        $method = new \ReflectionMethod(\block_mwa_dashboard\ai\client::class, 'scrub_messages');
        $method->setAccessible(true);
        return $method->invoke(null, $messages, $identifiers);
    }

    /** Direct identifiers must not survive the final transport boundary. */
    public function test_direct_identifiers_are_removed(): void {
        $input = implode("\n", [
            'Nome: João da Silva',
            'E-mail: joao@email.com',
            'IP: 192.168.1.50',
            'Matrícula: 202612345',
            'Username: joaosilva',
            'UserID: 157',
        ]);
        $messages = $this->filter([[
            'role' => 'user',
            'category' => 'individual_summary',
            'content' => $input,
        ]], ['João da Silva', 'joao@email.com', '202612345', 'joaosilva', '157']);

        $output = $messages[0]['content'];
        foreach (['João da Silva', 'joao@email.com', '192.168.1.50', '202612345', 'joaosilva',
                'UserID', 'userid=157'] as $leak) {
            $this->assertStringNotContainsStringIgnoringCase($leak, $output);
        }
    }
}
