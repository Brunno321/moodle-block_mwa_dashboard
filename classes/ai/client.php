<?php
// This file is part of Moodle - http://moodle.org/.

namespace block_mwa_dashboard\ai;

defined('MOODLE_INTERNAL') || die();

/**
 * Server-side client for the officially supported AI providers.
 *
 * @package    block_mwa_dashboard
 * @copyright  2026 Bruno Porto
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
final class client {
    /** @var string[] Message categories accepted at the final transport boundary. */
    private const ALLOWED_CATEGORIES = [
        'policy', 'individual_summary', 'aggregate_context', 'aggregate_conversation', 'connection_test',
    ];

    /** @var string Field names that must never leave Moodle. */
    private const FORBIDDEN_FIELD_PATTERN =
        '(?:username|user_name|user-id|userid|user_id|idnumber|id_number|matr[ií]cula|enrolment_?id|' .
        'enrollment_?id|assignsubmission_file|submission_files|submission_content|submission_text)';

    /** @var string[] Scalar educational fields allowed in structured AI context. */
    private const ALLOWED_STRUCTURED_FIELDS = [
        'nomeCurso', 'totalAlunos', 'alunosComInteracoes', 'totalInteracoes', 'mediaInteracoesPorAluno',
        'alunosEmRisco', 'alunosSemAcessoRecente', 'notaMedia', 'aprovados', 'mediaCobertura',
        'mediaConclusao', 'atividadesAvaliativas', 'pendenciasAvaliativas', 'recursosBaixaCobertura',
        'horarioPico', 'nome', 'tipo', 'acessos', 'alunosUnicos', 'cobertura', 'faltam', 'temNota',
        'alunos', 'atividades', 'atividadesListadas',
    ];

    /** @var array<string, string[]> Officially supported models by provider. */
    private const MODELS = [
        'deepseek' => ['deepseek-v4-flash', 'deepseek-v4-pro'],
        'openai' => ['gpt-4.1-mini', 'gpt-4.1'],
        'gemini' => ['gemini-3.5-flash'],
        'anthropic' => ['claude-sonnet-4-6', 'claude-sonnet-5'],
        'institutional' => [],
    ];

    /** @var array<string, string> Recommended model by provider. */
    private const DEFAULT_MODELS = [
        'deepseek' => 'deepseek-v4-flash',
        'openai' => 'gpt-4.1-mini',
        'gemini' => 'gemini-3.5-flash',
        'anthropic' => 'claude-sonnet-4-6',
        'institutional' => '',
    ];

    /**
     * Whether the mandatory server-side configuration is present.
     *
     * @return bool
     */
    public static function is_configured(): bool {
        if (!get_config('block_mwa_dashboard', 'ia_enabled')) {
            return false;
        }
        $provider = self::provider();
        if ($provider === 'none' || $provider === '') {
            return false;
        }
        $credential = self::credential();
        if ($provider === 'institutional') {
            return $credential !== '' && self::institutional_url(false) !== '' && self::model() !== '';
        }
        return isset(self::MODELS[$provider]) && $credential !== '';
    }

    /**
     * Return the selected provider, including migration of the former label.
     *
     * @return string
     */
    public static function provider(): string {
        $provider = (string)get_config('block_mwa_dashboard', 'ia_provider');
        if ($provider === 'claude') {
            return 'anthropic';
        }
        return $provider ?: 'none';
    }

    /**
     * Return the configured destination without query parameters or credentials.
     *
     * @return string Safe endpoint for local audit metadata.
     */
    public static function audit_endpoint(): string {
        $provider = self::provider();
        if ($provider === 'openai') {
            return 'https://api.openai.com/v1/chat/completions';
        }
        if ($provider === 'deepseek') {
            return 'https://api.deepseek.com/chat/completions';
        }
        if ($provider === 'gemini') {
            return 'https://generativelanguage.googleapis.com/v1beta/models/[configured-model]:generateContent';
        }
        if ($provider === 'anthropic') {
            return 'https://api.anthropic.com/v1/messages';
        }
        $parts = parse_url(trim((string)get_config('block_mwa_dashboard', 'ia_institutional_url')));
        if (!is_array($parts) || empty($parts['scheme']) || empty($parts['host'])) {
            return '';
        }
        $endpoint = strtolower((string)$parts['scheme']) . '://' . (string)$parts['host'];
        if (!empty($parts['port'])) {
            $endpoint .= ':' . (int)$parts['port'];
        }
        // Custom paths can contain tenant tokens; audit only the institutional origin.
        return substr($endpoint, 0, 255);
    }

    /**
     * Return the validated model for the selected provider.
     *
     * @return string
     */
    public static function model(): string {
        $provider = self::provider();
        $model = (string)get_config('block_mwa_dashboard', 'ia_model');
        if ($provider === 'institutional') {
            return trim((string)get_config('block_mwa_dashboard', 'ia_institutional_model'));
        }
        if ($model === 'recommended' || !in_array($model, self::MODELS[$provider] ?? [], true)) {
            return self::DEFAULT_MODELS[$provider] ?? '';
        }
        return $model;
    }

    /**
     * Send a text conversation directly from Moodle to the selected provider.
     *
     * @param array $messages Conversation messages with an allowed category.
     * @param string[] $forbiddenidentifiers Direct identifiers removed at the final boundary.
     * @return string Provider response text.
     */
    public static function complete(array $messages, array $forbiddenidentifiers = []): string {
        if (!self::is_configured()) {
            throw new \moodle_exception('ai_configuration_incomplete', 'block_mwa_dashboard');
        }

        $messages = self::scrub_messages($messages, $forbiddenidentifiers);
        $provider = self::provider();
        if ($provider === 'gemini') {
            return self::complete_gemini($messages);
        }
        if ($provider === 'anthropic') {
            return self::complete_anthropic($messages);
        }
        if ($provider === 'institutional') {
            return self::complete_institutional($messages);
        }
        return self::complete_openai_compatible($provider, $messages);
    }

    /**
     * Remove direct contact and network identifiers as a final transport guard.
     *
     * @param array $messages Conversation messages.
     * @param string[] $forbiddenidentifiers Direct identifiers to remove.
     * @return array
     */
    private static function scrub_messages(array $messages, array $forbiddenidentifiers): array {
        $clean = [];
        foreach ($messages as $message) {
            if (!is_array($message)) {
                continue;
            }
            $category = (string)($message['category'] ?? '');
            if (!in_array($message['role'] ?? '', ['system', 'user', 'assistant'], true) ||
                    !in_array($category, self::ALLOWED_CATEGORIES, true)) {
                continue;
            }
            $content = (string)($message['content'] ?? '');
            $content = preg_replace('/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu', '[email removed]', $content);
            $content = preg_replace('/(?<!\d)(?:\d{1,3}\.){3}\d{1,3}(?!\d)/', '[IP removed]', $content);
            $content = preg_replace(
                '/^[^\r\n]*(?:' . self::FORBIDDEN_FIELD_PATTERN . ')[^\r\n]*$/imu',
                '[restricted identifier removed]',
                $content
            );
            $content = preg_replace_callback(
                '/"([\p{L}\p{N}_-]+)"\s*:\s*("(?:\\\\.|[^"\\\\])*"|-?\d+(?:\.\d+)?|true|false|null)/u',
                static function(array $match): string {
                    return in_array($match[1], self::ALLOWED_STRUCTURED_FIELDS, true)
                        ? $match[0]
                        : '"field_omitted":null';
                },
                $content
            );
            usort($forbiddenidentifiers, static function(string $left, string $right): int {
                return mb_strlen($right) <=> mb_strlen($left);
            });
            foreach (array_unique(array_filter(array_map('trim', $forbiddenidentifiers))) as $identifier) {
                $content = preg_replace(
                    '/(?<![\p{L}\p{N}])' . preg_quote($identifier, '/') . '(?![\p{L}\p{N}])/ui',
                    '[direct identifier removed]',
                    $content
                );
            }
            $clean[] = ['role' => $message['role'], 'content' => $content];
        }
        if (!$clean) {
            throw new \moodle_exception('ai_empty_request', 'block_mwa_dashboard');
        }
        return $clean;
    }

    /**
     * Call OpenAI or DeepSeek through their Chat Completions interfaces.
     *
     * @param string $provider Provider identifier.
     * @param array $messages Conversation messages.
     * @return string
     */
    private static function complete_openai_compatible(string $provider, array $messages): string {
        $url = $provider === 'openai'
            ? 'https://api.openai.com/v1/chat/completions'
            : 'https://api.deepseek.com/chat/completions';
        $payload = [
            'model' => self::model(),
            'messages' => $messages,
            'stream' => false,
        ];
        if ($provider === 'openai') {
            $payload['store'] = false;
        }
        $data = self::post_json($url, $payload, [
            'Authorization: Bearer ' . self::credential(),
        ]);
        return self::required_text($data['choices'][0]['message']['content'] ?? '');
    }

    /**
     * Call an administrator-approved OpenAI-compatible institutional API.
     *
     * @param array $messages Conversation messages.
     * @return string
     */
    private static function complete_institutional(array $messages): string {
        $payload = ['model' => self::model(), 'messages' => $messages, 'stream' => false];
        $data = self::post_json(self::institutional_url(true), $payload, [
            'Authorization: Bearer ' . self::credential(),
        ]);
        return self::required_text($data['choices'][0]['message']['content'] ?? '');
    }

    /**
     * Validate the institutional endpoint and reject unsafe destinations by default.
     *
     * @param bool $throw Whether to throw on invalid configuration.
     * @return string
     */
    private static function institutional_url(bool $throw): string {
        $url = trim((string)get_config('block_mwa_dashboard', 'ia_institutional_url'));
        $parts = $url === '' ? false : parse_url($url);
        $valid = is_array($parts) && strtolower((string)($parts['scheme'] ?? '')) === 'https'
            && !empty($parts['host']) && empty($parts['user']) && empty($parts['pass']);
        if ($valid && !get_config('block_mwa_dashboard', 'ia_institutional_private')) {
            $host = strtolower((string)$parts['host']);
            $valid = $host !== 'localhost' && substr($host, -6) !== '.local';
            if ($valid && filter_var($host, FILTER_VALIDATE_IP)) {
                $valid = filter_var($host, FILTER_VALIDATE_IP,
                    FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE) !== false;
            } else if ($valid && $throw) {
                $addresses = gethostbynamel($host);
                $valid = is_array($addresses) && !empty($addresses);
                foreach ($addresses ?: [] as $address) {
                    if (filter_var($address, FILTER_VALIDATE_IP,
                            FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE) === false) {
                        $valid = false;
                        break;
                    }
                }
            }
        }
        if (!$valid) {
            if ($throw) {
                throw new \moodle_exception('ai_institutional_endpoint_invalid', 'block_mwa_dashboard');
            }
            return '';
        }
        return $url;
    }

    /**
     * Call the Gemini GenerateContent API.
     *
     * @param array $messages Conversation messages.
     * @return string
     */
    private static function complete_gemini(array $messages): string {
        $contents = [];
        foreach ($messages as $message) {
            $role = $message['role'] === 'assistant' ? 'model' : 'user';
            $contents[] = ['role' => $role, 'parts' => [['text' => $message['content']]]];
        }
        $url = 'https://generativelanguage.googleapis.com/v1beta/models/' .
            rawurlencode(self::model()) . ':generateContent';
        $data = self::post_json($url, ['contents' => $contents], [
            'x-goog-api-key: ' . self::credential(),
        ]);
        return self::required_text($data['candidates'][0]['content']['parts'][0]['text'] ?? '');
    }

    /**
     * Call the Anthropic Messages API.
     *
     * @param array $messages Conversation messages.
     * @return string
     */
    private static function complete_anthropic(array $messages): string {
        $system = [];
        $conversation = [];
        foreach ($messages as $message) {
            if ($message['role'] === 'system') {
                $system[] = $message['content'];
                continue;
            }
            $conversation[] = $message;
        }
        $payload = [
            'model' => self::model(),
            'max_tokens' => 4096,
            'messages' => $conversation,
        ];
        if ($system) {
            $payload['system'] = implode("\n\n", $system);
        }
        $data = self::post_json('https://api.anthropic.com/v1/messages', $payload, [
            'x-api-key: ' . self::credential(),
            'anthropic-version: 2023-06-01',
        ]);
        return self::required_text($data['content'][0]['text'] ?? '');
    }

    /**
     * Perform a JSON request and convert provider failures to a safe Moodle error.
     *
     * @param string $url Fixed provider URL.
     * @param array $payload Request payload.
     * @param string[] $headers Provider headers.
     * @return array Decoded response.
     */
    private static function post_json(string $url, array $payload, array $headers): array {
        $timeout = max(10, min(180, (int)(get_config('block_mwa_dashboard', 'ia_timeout') ?: 90)));
        $curl = new \curl();
        $curl->setopt(['CURLOPT_TIMEOUT' => $timeout, 'CURLOPT_RETURNTRANSFER' => true]);
        $headers[] = 'Content-Type: application/json';
        $response = $curl->post($url, json_encode($payload), ['CURLOPT_HTTPHEADER' => $headers]);
        $info = $curl->get_info();
        $status = (int)($info['http_code'] ?? 0);
        $data = json_decode((string)$response, true);
        if ($curl->get_errno() || $status < 200 || $status >= 300 || !is_array($data)) {
            debugging('MWA AI provider request failed with HTTP status ' . $status, DEBUG_DEVELOPER);
            throw new \moodle_exception('ai_provider_request_failed', 'block_mwa_dashboard');
        }
        return $data;
    }

    /**
     * Require a non-empty provider response.
     *
     * @param mixed $text Response value.
     * @return string
     */
    private static function required_text($text): string {
        $text = trim((string)$text);
        if ($text === '') {
            throw new \moodle_exception('ai_provider_empty_response', 'block_mwa_dashboard');
        }
        return $text;
    }

    /**
     * Return the provider credential without exposing it outside this server-side class.
     *
     * @return string
     */
    private static function credential(): string {
        $key = self::provider() === 'institutional' ? 'ia_institutional_credential' : 'ia_provider_credential';
        return trim((string)get_config('block_mwa_dashboard', $key));
    }
}
