<?php
// This file is part of Moodle - http://moodle.org/.

namespace block_mwa_dashboard\ai;

defined('MOODLE_INTERNAL') || die();

/**
 * Metadata-only local audit for external AI operations.
 *
 * @package    block_mwa_dashboard
 * @copyright  2026 Bruno Porto
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
final class audit {
    /** @var string[] Values accepted in the stored category list. */
    private const ALLOWED_CATEGORIES = [
        'policy', 'individual_summary', 'aggregate_context', 'aggregate_conversation',
        'activity_metrics', 'pseudonymised_individual_metrics', 'forum_posts_anonymised',
        'question_text_only', 'question_answer_key', 'connection_test',
    ];

    /**
     * Store audit metadata without prompt, response, student identity or credentials.
     *
     * @param int $userid Initiating Moodle user.
     * @param int $courseid Course identifier or zero for an admin connection test.
     * @param string $operation Allowlisted operation identifier.
     * @param string $purpose Fixed processing purpose.
     * @param string[] $categories Data categories sent.
     * @param string $status success or error.
     */
    public static function record(int $userid, int $courseid, string $operation, string $purpose,
            array $categories, string $status): void {
        global $DB;

        $categories = array_values(array_intersect(self::ALLOWED_CATEGORIES, array_unique($categories)));
        $record = (object)[
            'userid' => max(0, $userid),
            'courseid' => max(0, $courseid),
            'operation' => clean_param($operation, PARAM_ALPHANUMEXT),
            'purpose' => clean_param($purpose, PARAM_ALPHANUMEXT),
            'provider' => clean_param(client::provider(), PARAM_ALPHANUMEXT),
            'endpoint' => client::audit_endpoint(),
            'categories' => implode(',', $categories),
            'status' => $status === 'success' ? 'success' : 'error',
            'timecreated' => time(),
        ];
        // Audit is deliberately non-blocking: an unavailable/misaligned audit table must
        // never turn a successful AI request into a user-facing database error. The table
        // is created/repaired by install.xml/db/upgrade.php; this guard also protects sites
        // while an upgrade is still pending.
        try {
            $DB->insert_record('block_mwa_dashboard_aiaudit', $record, false);
        } catch (\Throwable $exception) {
            debugging('MWA AI audit could not be recorded: ' . $exception->getMessage(), DEBUG_DEVELOPER);
        }
    }
}
