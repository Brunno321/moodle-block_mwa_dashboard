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
 * External API functions for block_mwa_dashboard.
 *
 * @package    block_mwa_dashboard
 * @copyright  2026 Bruno Porto
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

namespace block_mwa_dashboard;

defined('MOODLE_INTERNAL') || die();



global $CFG;
require_once($CFG->libdir . '/externallib.php');

class external extends \external_api {

    /** @var array Course-scoped enrolled users reused during the current request. */
    private static $aienrolledusers = [];

    /** @var array Request-scoped aliases that do not expose Moodle user IDs. */
    private static $aialiases = [];

    /**
     * Return a request-scoped alias for an enrolled user.
     *
     * @param int $courseid Course identifier.
     * @param int $userid Moodle user identifier.
     * @return string Opaque alias.
     */
    private static function get_ai_alias(int $courseid, int $userid): string {
        if (!isset(self::$aialiases[$courseid])) {
            $userids = array_map('intval', array_keys(self::get_ai_enrolled_users($courseid)));
            sort($userids, SORT_NUMERIC);
            self::$aialiases[$courseid] = [];
            foreach ($userids as $index => $id) {
                self::$aialiases[$courseid][$id] = sprintf('Student-%03d', $index + 1);
            }
        }
        return self::$aialiases[$courseid][$userid] ?? 'Student';
    }

    /**
     * Return the enrolled users needed by the AI privacy layer.
     *
     * AI context can contain many strings. Loading enrolments once per string
     * creates unnecessary repeated database reads and can exhaust a busy Moodle
     * connection. Keep the result only for the lifetime of this PHP request.
     *
     * @param int $courseid Course identifier.
     * @return array Enrolled users keyed by user id.
     */
    private static function get_ai_enrolled_users(int $courseid): array {
        if (!array_key_exists($courseid, self::$aienrolledusers)) {
            $context = \context_course::instance($courseid);
            self::$aienrolledusers[$courseid] = get_enrolled_users(
                $context,
                '',
                0,
                'u.id, u.firstname, u.lastname, u.alternatename, u.middlename, u.email, u.username, u.idnumber'
            );
        }
        return self::$aienrolledusers[$courseid];
    }

    /**
     * Return direct enrolment identifiers for the final AI transport filter.
     *
     * @param int $courseid Course identifier.
     * @return string[]
     */
    private static function get_ai_forbidden_identifiers(int $courseid): array {
        $identifiers = [];
        foreach (self::get_ai_enrolled_users($courseid) as $student) {
            $identifiers[] = trim($student->firstname . ' ' . $student->lastname);
            $identifiers[] = trim((string)$student->firstname);
            $identifiers[] = trim((string)$student->lastname);
            $identifiers[] = trim((string)$student->alternatename);
            $identifiers[] = trim((string)$student->middlename);
            $identifiers[] = trim((string)$student->email);
            $identifiers[] = trim((string)$student->username);
            $identifiers[] = trim((string)$student->idnumber);
        }
        return array_values(array_unique(array_filter($identifiers)));
    }

    /**
     * Replace enrolled users' real names with request-scoped aliases.
     *
     * This is deliberately applied immediately before calls to the external AI
     * service. Moodle keeps and displays the real name locally, while the AI
     * only receives an opaque identifier such as "Student-001".
     *
     * @param int $courseid Course identifier.
     * @param string $text Text that may contain enrolled student names.
     * @return string Text safe to transmit to the AI provider.
     */
    private static function pseudonymize_students_for_ai(int $courseid, string $text): string {
        if ($text === '') {
            return $text;
        }

        // Remove direct contact and network identifiers before name replacement.
        $text = preg_replace('/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu', '[email removed]', $text);
        $text = preg_replace('/(?<!\d)(?:\d{1,3}\.){3}\d{1,3}(?!\d)/', '[IP removed]', $text);

        $users = self::get_ai_enrolled_users($courseid);
        $replacements = [];
        $firstcounts = [];
        foreach ($users as $candidate) {
            $first = trim((string)$candidate->firstname);
            if ($first !== '') {
                $key = \core_text::strtolower($first);
                $firstcounts[$key] = ($firstcounts[$key] ?? 0) + 1;
            }
        }
        foreach ($users as $student) {
            $alias = self::get_ai_alias($courseid, (int)$student->id);
            $firstname = trim((string)$student->firstname);
            $names = [
                trim($student->firstname . ' ' . $student->lastname),
                trim($student->alternatename ?? ''),
                trim($student->middlename ?? ''),
            ];
            if ($firstname !== '' && ($firstcounts[\core_text::strtolower($firstname)] ?? 0) === 1) {
                $names[] = $firstname;
            }
            foreach ($names as $name) {
                if ($name !== '') {
                    $replacements[$name] = $alias;
                }
            }
        }

        // Longer names first prevents a partial name from masking a full name.
        uksort($replacements, static function(string $left, string $right): int {
            return mb_strlen($right) <=> mb_strlen($left);
        });
        foreach ($replacements as $name => $alias) {
            $text = preg_replace('/(?<![\p{L}\p{N}])' . preg_quote($name, '/') . '(?![\p{L}\p{N}])/ui', $alias, $text);
        }
        return $text;
    }

    /**
     * Restore local student names in an AI response before showing it in Moodle.
     * Aliases are sent only to the external provider; real names never leave Moodle.
     *
     * @param int $courseid Course identifier.
     * @param string $text AI response containing optional aliases.
     * @return string Response with aliases replaced by Moodle display names.
     */
    private static function restore_students_in_ai_response(int $courseid, string $text): string {
        if ($text === '') {
            return $text;
        }

        $users = self::get_ai_enrolled_users($courseid);
        foreach ($users as $student) {
            $name = trim($student->alternatename ?: ($student->firstname . ' ' . $student->lastname));
            if ($name === '') {
                continue;
            }
            $alias = self::get_ai_alias($courseid, (int)$student->id);
            $text = preg_replace('/(?<![\p{L}\p{N}])' . preg_quote($alias, '/') . '(?![\p{L}\p{N}])/ui', $name, $text);
        }
        return $text;
    }

    /**
     * Validate institutional opt-in and AI permissions.
     *
     * @param \context_course $context Course context.
     * @return void
     */
    private static function require_ai_access(\context_course $context): void {
        $canuseai = has_capability('block/mwa_dashboard:useai', $context);
        $canmanage = has_capability('block/mwa_dashboard:manageinterventions', $context);
        if (!$canuseai && !$canmanage) {
            throw new \required_capability_exception(
                $context,
                'block/mwa_dashboard:useai',
                'nopermissions',
                ''
            );
        }
        if (!get_config('block_mwa_dashboard', 'ia_enabled')) {
            throw new \moodle_exception('ai_disabled', 'block_mwa_dashboard');
        }
        if (!\block_mwa_dashboard\ai\client::is_configured()) {
            throw new \moodle_exception('ai_configuration_incomplete', 'block_mwa_dashboard');
        }
    }

    /**
     * Recursively pseudonymize text values in a chat context payload.
     *
     * @param int $courseid Course identifier.
     * @param mixed $value Context value.
     * @return mixed Pseudonymized value.
     */
    private static function pseudonymize_ai_context(int $courseid, $value) {
        if (is_string($value)) {
            return self::pseudonymize_students_for_ai($courseid, $value);
        }
        if (is_array($value)) {
            foreach ($value as $key => $item) {
                $value[$key] = self::pseudonymize_ai_context($courseid, $item);
            }
        }
        return $value;
    }

    /**
     * Keep only minimised aggregate and pseudonymised educational data accepted by the external chat endpoint.
     *
     * @param array $context Client context.
     * @return array Minimised aggregate and pseudonymised educational context.
     */
    private static function privacy_safe_chat_context(int $courseid, array $context): array {
        $coursekeys = [
            'nomeCurso', 'totalAlunos', 'alunosComInteracoes', 'totalInteracoes',
            'mediaInteracoesPorAluno', 'alunosEmRisco', 'alunosSemAcessoRecente', 'notaMedia', 'aprovados',
            'mediaCobertura', 'mediaConclusao', 'atividadesAvaliativas',
            'pendenciasAvaliativas', 'recursosBaixaCobertura', 'horarioPico',
        ];
        $activitykeys = ['nome', 'tipo', 'acessos', 'alunosUnicos', 'cobertura', 'faltam', 'temNota'];
        $totalskeys = ['alunos', 'atividades', 'atividadesListadas', 'recursosBaixaCobertura'];
        $studentkeys = [
            'nota', 'interacoes', 'diasSemAcesso', 'engajamento', 'cobertura', 'conclusao', 'diasAtivos',
            'atividadesPendentes', 'notasPendentes', 'atividadesEntregues', 'conteudosNaoAcessados',
        ];

        $clean = ['curso' => [], 'atividades' => [], 'totais' => [], 'estudantes' => []];
        $course = is_array($context['curso'] ?? null) ? $context['curso'] : [];
        foreach ($coursekeys as $key) {
            if (isset($course[$key]) && is_scalar($course[$key])) {
                $clean['curso'][$key] = $course[$key];
            }
        }
        foreach (array_slice(is_array($context['atividades'] ?? null) ? $context['atividades'] : [], 0, 60) as $activity) {
            if (!is_array($activity)) { continue; }
            $item = [];
            foreach ($activitykeys as $key) {
                if (isset($activity[$key]) && is_scalar($activity[$key])) { $item[$key] = $activity[$key]; }
            }
            if ($item) { $clean['atividades'][] = $item; }
        }
        $totals = is_array($context['totais'] ?? null) ? $context['totais'] : [];
        foreach ($totalskeys as $key) {
            if (isset($totals[$key]) && is_scalar($totals[$key])) { $clean['totais'][$key] = $totals[$key]; }
        }

        // Individual educational records are pseudonymised locally in Moodle.
        // Real names are used only to resolve the request-scoped alias and are never copied to the outbound payload.
        $usersbyname = [];
        foreach (self::get_ai_enrolled_users($courseid) as $student) {
            foreach (array_filter([
                trim($student->firstname . ' ' . $student->lastname),
                trim((string)$student->alternatename),
            ]) as $displayname) {
                $usersbyname[\core_text::strtolower($displayname)] = (int)$student->id;
            }
        }
        foreach (array_slice(is_array($context['estudantes'] ?? null) ? $context['estudantes'] : [], 0, 200) as $student) {
            if (!is_array($student)) { continue; }
            $localname = trim((string)($student['nomeLocal'] ?? ''));
            $userid = $usersbyname[\core_text::strtolower($localname)] ?? 0;
            if (!$userid) { continue; }
            $item = ['alias' => self::get_ai_alias($courseid, $userid)];
            foreach ($studentkeys as $key) {
                if (!array_key_exists($key, $student)) { continue; }
                $value = $student[$key];
                if (is_scalar($value) || is_array($value)) { $item[$key] = $value; }
            }
            $clean['estudantes'][] = $item;
        }
        return $clean;
    }

    /**
     * Prepare user conversation messages for the external provider.
     *
     * @param int $courseid Course identifier.
     * @param array $messages Conversation messages.
     * @return array Sanitised messages.
     */
    private static function aggregate_chat_messages(int $courseid, array $messages): array {
        $clean = [];
        foreach (array_slice($messages, -30) as $message) {
            if (!is_array($message) || ($message['role'] ?? '') !== 'user') {
                continue;
            }
            $content = (string)($message['content'] ?? '');
            if (strpos($content, '[COURSE DATA]') === 0 ||
                    stripos($content, 'I have full access to the course data') !== false) {
                continue;
            }
            $clean[] = [
                'role' => 'user',
                'category' => 'aggregate_conversation',
                'content' => self::pseudonymize_students_for_ai($courseid, $content),
            ];
        }
        return $clean;
    }

    // -- get_logs ---------------------------------------------------------

    public static function get_logs_parameters() {
        return new \external_function_parameters([
            'courseid' => new \external_value(PARAM_INT, 'Course ID'),
            'since'    => new \external_value(PARAM_INT, 'Unix timestamp - only logs after this', VALUE_DEFAULT, 0),
        ]);
    }

    public static function get_logs(int $courseid, int $since = 0): array {
        $params = self::validate_parameters(self::get_logs_parameters(), compact('courseid', 'since'));
        $ctx    = \context_course::instance($params['courseid']);
        self::validate_context($ctx);
        require_capability('block/mwa_dashboard:view', $ctx);
        $logs = api::get_logs($params['courseid'], $params['since']);
        return ['logs' => json_encode($logs), 'count' => count($logs)];
    }

    public static function get_logs_returns() {
        return new \external_single_structure([
            'logs'  => new \external_value(PARAM_RAW,  'JSON array of log records'),
            'count' => new \external_value(PARAM_INT,  'Number of records'),
        ]);
    }

    // -- get_grades -------------------------------------------------------

    public static function get_grades_parameters() {
        return new \external_function_parameters([
            'courseid' => new \external_value(PARAM_INT, 'Course ID'),
        ]);
    }

    public static function get_grades(int $courseid): array {
        $params = self::validate_parameters(self::get_grades_parameters(), compact('courseid'));
        $ctx    = \context_course::instance($params['courseid']);
        self::validate_context($ctx);
        require_capability('block/mwa_dashboard:view', $ctx);

        $grades = api::get_grades($params['courseid']);
        return ['grades' => json_encode($grades), 'count' => count($grades)];
    }

    public static function get_grades_returns() {
        return new \external_single_structure([
            'grades' => new \external_value(PARAM_RAW, 'JSON array of grade records'),
            'count'  => new \external_value(PARAM_INT, 'Number of students'),
        ]);
    }

    /* ════════════════════════════════════════════════════════════
       send_message — envia mensagem via API nativa do Moodle
       e grava registro em block_mwa_dashboard_messages
    ════════════════════════════════════════════════════════════ */
    public static function send_message_parameters() {
        return new \external_function_parameters([
            'courseid'            => new \external_value(PARAM_INT,  'Course ID'),
            'userid'              => new \external_value(PARAM_INT,  'Recipient user ID'),
            'subject'             => new \external_value(PARAM_TEXT, 'Message subject'),
            'message'             => new \external_value(PARAM_RAW,  'Message body (HTML or plain)'),
            'intervention_reason' => new \external_value(PARAM_TEXT, 'Reason for intervention', VALUE_DEFAULT, ''),
            'ai_generated'        => new \external_value(PARAM_INT,  '1 if AI-generated', VALUE_DEFAULT, 0),
            'send_type'           => new \external_value(PARAM_ALPHA,   'moodle or email', VALUE_DEFAULT, 'moodle'),
            'student_email'       => new \external_value(PARAM_NOTAGS, 'Student email for email send type', VALUE_DEFAULT, ''),
            'target_type'         => new \external_value(PARAM_ALPHANUMEXT, 'Tracked intervention target type', VALUE_DEFAULT, ''),
            'target_items'        => new \external_value(PARAM_RAW, 'JSON list of tracked targets', VALUE_DEFAULT, '[]'),
            'snapshot_situation'  => new \external_value(PARAM_TEXT, 'Situation identified for Other reason', VALUE_DEFAULT, ''),
            'snapshot_objective'  => new \external_value(PARAM_TEXT, 'Expected intervention objective', VALUE_DEFAULT, ''),
            'snapshot_engagement' => new \external_value(PARAM_INT, 'Engagement shown when intervention is sent', VALUE_DEFAULT, -1),
        ]);
    }

    public static function send_message(int $courseid, int $userid, string $subject,
                                        string $message, string $intervention_reason = '',
                                        int $ai_generated = 0, string $send_type = 'moodle',
                                         string $student_email = '', string $target_type = '',
                                         string $target_items = '[]', string $snapshot_situation = '',
                                         string $snapshot_objective = '', int $snapshot_engagement = -1): array {
        global $DB, $USER, $CFG;

        $params = self::validate_parameters(self::send_message_parameters(), [
            'courseid'            => $courseid,
            'userid'              => $userid,
            'subject'             => $subject,
            'message'             => $message,
            'intervention_reason' => $intervention_reason,
            'ai_generated'        => $ai_generated,
            'send_type'           => $send_type,
            'student_email'       => $student_email,
            'target_type'         => $target_type,
            'target_items'        => $target_items,
            'snapshot_situation'  => $snapshot_situation,
            'snapshot_objective'  => $snapshot_objective,
            'snapshot_engagement' => $snapshot_engagement,
        ]);

        $ctx = \context_course::instance($params['courseid']);
        self::validate_context($ctx);
        require_capability('block/mwa_dashboard:view', $ctx);
        require_capability('block/mwa_dashboard:manageinterventions', $ctx);

        // Fetch the recipient — guard against userid=0
        $recipient = null;
        if ($params['userid'] > 0) {
            $recipient = $DB->get_record('user', ['id' => $params['userid']], '*', IGNORE_MISSING);
        }
        // Fallback: look up by email if userid is not mapped
        if (!$recipient && !empty($params['student_email'])) {
            $semail = clean_param($params['student_email'], PARAM_EMAIL);
            if ($semail) {
                $recipient = $DB->get_record('user', ['email' => $semail], '*', IGNORE_MISSING);
            }
        }
        if (!$recipient || !is_enrolled($ctx, $recipient, '', true)) {
            throw new \moodle_exception('invalidrecipient', 'block_mwa_dashboard');
        }

        $sender = $DB->get_record('user', ['id' => $USER->id], '*', MUST_EXIST);

        $cleanreason = trim($params['intervention_reason']);
        $objectives = [
            'Nunca acessou'        => get_string('snapshot_objective_never', 'block_mwa_dashboard'),
            'Baixa participação'   => get_string('snapshot_objective_low', 'block_mwa_dashboard'),
            'Pendência acadêmica'  => get_string('snapshot_objective_pending', 'block_mwa_dashboard'),
            'Dificuldade acadêmica'=> get_string('snapshot_objective_difficult', 'block_mwa_dashboard'),
        ];
        $situation = $cleanreason === 'Outro' ? trim($params['snapshot_situation']) : $cleanreason;
        $objective = trim($params['snapshot_objective']);
        if ($objective === '' && isset($objectives[$cleanreason])) {
            $objective = $objectives[$cleanreason];
        }
        if ($cleanreason === 'Outro' && ($situation === '' || $objective === '')) {
            return ['success' => false, 'status' => 'error_snapshot_fields_required', 'recordid' => 0];
        }

        $decodedtargets = json_decode($params['target_items'], true);
        $decodedtargets = is_array($decodedtargets) ? array_values($decodedtargets) : [];
        $targetlinks = [];
        $coursemodinfo = null;
        foreach ($decodedtargets as $targetindex => $target) {
            if (!is_array($target)) {
                continue;
            }
            $targetname = trim((string)($target['name'] ?? ''));
            $targeturl = clean_param((string)($target['url'] ?? ''), PARAM_URL);
            $targetcmid = (int)($target['cmid'] ?? 0);
            $targetmod = clean_param((string)($target['mod'] ?? ''), PARAM_ALPHANUMEXT);
            if ($targeturl === '' && $targetcmid > 0 && $targetmod !== '') {
                $targeturl = rtrim($CFG->wwwroot, '/') . '/mod/' . rawurlencode($targetmod) .
                    '/view.php?id=' . $targetcmid;
            }
            if ($targeturl === '' && $targetname !== '') {
                if ($coursemodinfo === null) {
                    $coursemodinfo = get_fast_modinfo($params['courseid']);
                }
                foreach ($coursemodinfo->get_cms() as $coursemodule) {
                    if (\core_text::strtolower(trim($coursemodule->name)) !==
                            \core_text::strtolower($targetname) || empty($coursemodule->url)) {
                        continue;
                    }
                    $targetcmid = (int)$coursemodule->id;
                    $targetmod = clean_param((string)$coursemodule->modname, PARAM_ALPHANUMEXT);
                    $targeturl = $coursemodule->url->out(false);
                    break;
                }
            }
            if ($targeturl !== '') {
                $decodedtargets[$targetindex]['url'] = $targeturl;
                $decodedtargets[$targetindex]['cmid'] = $targetcmid;
                $decodedtargets[$targetindex]['mod'] = $targetmod;
                $targetlinks[] = '- ' . ($targetname !== '' ? $targetname . ': ' : '') . $targeturl;
            }
        }
        $plainhtml = preg_replace('~<div\s+class="mwa-message-targets"[^>]*>.*?</div>~is', '', $params['message']);
        $plainmessage = trim(html_to_text($plainhtml ?? $params['message'], 0, false));
        if ($targetlinks) {
            $plainmessage .= "\n\nItens acompanhados:\n" . implode("\n", $targetlinks);
        }

        $msgid  = null;
        $status = 'sent';

        if ($params['send_type'] === 'email') {
            // ── Send via email using email_to_user() ──
            if (!$recipient) {
                return ['success' => false, 'status' => 'error_no_user', 'recordid' => 0];
            }
            try {
                require_once($CFG->libdir . '/moodlelib.php');
                $result = email_to_user(
                    $recipient,
                    $sender,
                    $params['subject'],
                    $plainmessage,
                    $params['message']
                );
                if (!$result) $status = 'error';
            } catch (\Exception $e) {
                $status = 'error';
            }
        } else {
            // ── Send via Moodle messaging API (message_send) ──
            if (!$recipient) {
                return ['success' => false, 'status' => 'error_no_user', 'recordid' => 0];
            }
            try {
                // Uses Moodle's native messaging system.
                // component='moodle', name='instantmessage' is the default provider
                // which always exists — no registration in messages.php required.
                $eventdata                    = new \core\message\message();
                $eventdata->component         = 'moodle';
                $eventdata->name              = 'instantmessage';
                $eventdata->userfrom          = $sender;
                $eventdata->userto            = $recipient;
                $eventdata->subject           = $params['subject'];
                $eventdata->fullmessage       = $params['message'];
                $eventdata->fullmessageformat = FORMAT_HTML;
                $eventdata->fullmessagehtml   = $params['message'];
                $eventdata->smallmessage      = '';
                $eventdata->notification      = 0;
                $eventdata->courseid          = $params['courseid'];

                $msgid = message_send($eventdata);
                if (!$msgid) $status = 'error';
            } catch (\Exception $e) {
                $status = 'error';
            }
        }

        $action = $status === 'sent'
            ? ($params['send_type'] === 'email' ? get_string('ext_action_sent_email', 'block_mwa_dashboard') : get_string('ext_action_sent_moodle', 'block_mwa_dashboard'))
            : ($params['send_type'] === 'email' ? get_string('ext_action_fail_email', 'block_mwa_dashboard') : get_string('ext_action_fail_moodle', 'block_mwa_dashboard'));

        // Persist intervention and its immutable snapshot atomically.
        $transaction = $DB->start_delegated_transaction();
        $record = new \stdClass();
        $record->courseid            = $params['courseid'];
        $record->userid              = $recipient ? $recipient->id : 0;
        $record->teacherid           = $USER->id;
        $record->subject             = $params['subject'];
        $record->message             = $params['message'];
        $record->timesent            = time();
        $record->status              = $status;
        $record->ai_generated        = $params['ai_generated'];
        $record->send_type            = $params['send_type'];
        $record->intervention_reason  = substr($cleanreason, 0, 100);
        $record->moodle_msgid        = $msgid;
        $record->target_type         = substr($params['target_type'], 0, 30);
        $record->target_items        = json_encode($decodedtargets);

        $recid = $DB->insert_record('block_mwa_dashboard_messages', $record);
        snapshot_manager::capture((int)$recid, (int)$record->courseid, (int)$record->userid,
            $cleanreason, $situation, $action, $objective, (int)$record->timesent, $decodedtargets,
            $params['snapshot_engagement'] >= 0 ? min(100, $params['snapshot_engagement']) : null);
        $transaction->allow_commit();

        return ['success' => ($status === 'sent'), 'status' => $status, 'recordid' => (int)$recid];
    }

    public static function send_message_returns() {
        return new \external_single_structure([
            'success'  => new \external_value(PARAM_BOOL, 'Whether message was sent'),
            'status'   => new \external_value(PARAM_TEXT, 'sent or error'),
            'recordid' => new \external_value(PARAM_INT,  'ID in block_mwa_dashboard_messages'),
        ]);
    }

    /* ════════════════════════════════════════════════════════════
       get_interventions — histórico de intervenções do curso
    ════════════════════════════════════════════════════════════ */
    public static function get_interventions_parameters() {
        return new \external_function_parameters([
            'courseid' => new \external_value(PARAM_INT, 'Course ID'),
        ]);
    }

    public static function get_interventions(int $courseid): array {
        global $DB;

        $params = self::validate_parameters(self::get_interventions_parameters(), compact('courseid'));
        $ctx    = \context_course::instance($params['courseid']);
        self::validate_context($ctx);
        require_capability('block/mwa_dashboard:view', $ctx);
        require_capability('block/mwa_dashboard:manageinterventions', $ctx);

        $rows = $DB->get_records_sql(
            "SELECT m.id, m.courseid, m.userid, m.teacherid, m.subject, m.message,
                     m.timesent, m.status, m.ai_generated, m.intervention_reason, m.send_type, m.moodle_msgid,
                    m.target_type, m.target_items, m.teacher_note, m.teacher_note_updated,
                     s.reason AS snapshot_reason, s.situation AS snapshot_situation,
                     s.actiontaken AS snapshot_action, s.objective AS snapshot_objective,
                     s.snapshotdata AS snapshot_data, s.timecreated AS snapshot_timecreated,
                     u.firstname AS student_firstname, u.lastname AS student_lastname, u.email AS student_email,
                     u.picture AS student_picture, u.imagealt AS student_imagealt,
                     t.firstname AS teacher_firstname, t.lastname AS teacher_lastname
                FROM {block_mwa_dashboard_messages} m
          LEFT JOIN {block_mwa_dashboard_snapshot} s ON s.interventionid = m.id
               JOIN {user} u ON u.id = m.userid
               JOIN {user} t ON t.id = m.teacherid
              WHERE m.courseid = :courseid
              ORDER BY m.timesent DESC",
            ['courseid' => $params['courseid']]
        );

        $records = [];
        foreach ($rows as $r) {
            $records[] = [
                'id'                  => (int)$r->id,
                'userid'              => (int)$r->userid,
                'teacherid'           => (int)$r->teacherid,
                'student_name'        => trim($r->student_firstname . ' ' . $r->student_lastname),
                'student_email'       => $r->student_email,
                'student_pictureurl'  => api::user_picture_url((object)[
                    'id' => (int)$r->userid,
                    'firstname' => $r->student_firstname,
                    'lastname' => $r->student_lastname,
                    'picture' => $r->student_picture,
                    'imagealt' => $r->student_imagealt,
                    'email' => $r->student_email,
                ]),
                'teacher_name'        => trim($r->teacher_firstname . ' ' . $r->teacher_lastname),
                'subject'             => $r->subject,
                'message'             => $r->message,
                'timesent'            => (int)$r->timesent,
                'status'              => $r->status,
                'ai_generated'        => (int)$r->ai_generated,
                'intervention_reason' => $r->intervention_reason ?? '',
                'send_type'           => preg_match('/\[(email)\]\s*$/i', $r->intervention_reason ?? '')
                    ? 'email' : ($r->send_type ?? 'moodle'),
                'target_type'         => $r->target_type ?? '',
                'target_items'        => $r->target_items ?? '[]',
                'teacher_note'        => $r->teacher_note ?? '',
                'teacher_note_updated' => (int)($r->teacher_note_updated ?? 0),
                'snapshot_reason'      => $r->snapshot_reason ?? '',
                'snapshot_situation'   => $r->snapshot_situation ?? '',
                'snapshot_action'      => $r->snapshot_action ?? '',
                'snapshot_objective'   => $r->snapshot_objective ?? '',
                'snapshot_data'        => $r->snapshot_data ?? '',
                'snapshot_timecreated' => (int)($r->snapshot_timecreated ?? 0),
            ];
        }

        return ['interventions' => json_encode($records), 'count' => count($records)];
    }

    public static function get_interventions_returns() {
        return new \external_single_structure([
            'interventions' => new \external_value(PARAM_RAW, 'JSON array of intervention records'),
            'count'         => new \external_value(PARAM_INT, 'Number of records'),
        ]);
    }

    /* ── current follow-up indicators ── */
    public static function get_followup_indicators_parameters() {
        return new \external_function_parameters([
            'courseid' => new \external_value(PARAM_INT, 'Course ID'),
            'userids' => new \external_value(PARAM_RAW, 'JSON array of student IDs'),
        ]);
    }

    /** Return current indicators using the same calculation as the immutable snapshot. */
    public static function get_followup_indicators(int $courseid, string $userids): array {
        global $DB;

        $params = self::validate_parameters(self::get_followup_indicators_parameters(),
            ['courseid' => $courseid, 'userids' => $userids]);
        $context = \context_course::instance($params['courseid']);
        self::validate_context($context);
        require_capability('block/mwa_dashboard:view', $context);

        $requested = json_decode($params['userids'], true);
        $requested = is_array($requested) ? array_values(array_unique(array_filter(array_map('intval', $requested)))) : [];
        $calculatedat = time();
        if (!$requested) {
            return ['indicators' => '{}', 'timecalculated' => $calculatedat];
        }

        [$insql, $inparams] = $DB->get_in_or_equal($requested, SQL_PARAMS_NAMED, 'uid');
        $inparams['courseid'] = $params['courseid'];
        $allowed = $DB->get_fieldset_sql(
            "SELECT DISTINCT userid
               FROM {block_mwa_dashboard_snapshot}
              WHERE courseid = :courseid AND userid {$insql}",
            $inparams
        );
        $coursegrades = api::get_grades($params['courseid']);
        $courselogs = api::get_logs($params['courseid']);
        $result = [];
        foreach ($allowed as $userid) {
            $userid = (int)$userid;
            $result[(string)$userid] = snapshot_manager::current_indicators(
                $params['courseid'], $userid, $calculatedat, $coursegrades, $courselogs
            );
        }

        return [
            'indicators' => json_encode($result, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
            'timecalculated' => $calculatedat,
        ];
    }

    public static function get_followup_indicators_returns() {
        return new \external_single_structure([
            'indicators' => new \external_value(PARAM_RAW, 'JSON object keyed by student ID'),
            'timecalculated' => new \external_value(PARAM_INT, 'Calculation timestamp'),
        ]);
    }

    /* ── delete_intervention ── */
    public static function delete_intervention_parameters() {
        return new \external_function_parameters([
            'id' => new \external_value(PARAM_INT, 'Record ID in block_mwa_dashboard_messages'),
        ]);
    }

    public static function delete_intervention(int $id): array {
        global $DB, $USER;

        $params = self::validate_parameters(self::delete_intervention_parameters(), ['id' => $id]);

        $record = $DB->get_record('block_mwa_dashboard_messages', ['id' => $params['id']], '*', IGNORE_MISSING);
        if (!$record) {
            return ['success' => false];
        }

        $ctx = \context_course::instance($record->courseid);
        self::validate_context($ctx);
        require_capability('block/mwa_dashboard:view', $ctx);
        require_capability('block/mwa_dashboard:manageinterventions', $ctx);

        // Only allow deletion of own record (or admin)
        if ($record->teacherid != $USER->id && !has_capability('moodle/site:config', \context_system::instance())) {
            return ['success' => false];
        }

        $transaction = $DB->start_delegated_transaction();
        $DB->delete_records('block_mwa_dashboard_snapshot', ['interventionid' => $params['id']]);
        $DB->delete_records('block_mwa_dashboard_messages', ['id' => $params['id']]);
        $transaction->allow_commit();
        return ['success' => true];
    }

    public static function delete_intervention_returns() {
        return new \external_single_structure([
            'success' => new \external_value(PARAM_BOOL, 'Whether deletion succeeded'),
        ]);
    }

    public static function save_intervention_note_parameters() {
        return new \external_function_parameters([
            'id'   => new \external_value(PARAM_INT, 'Record ID in block_mwa_dashboard_messages'),
            'note' => new \external_value(PARAM_RAW, 'Private teacher note'),
        ]);
    }

    public static function save_intervention_note(int $id, string $note): array {
        global $DB;

        $params = self::validate_parameters(self::save_intervention_note_parameters(), [
            'id'   => $id,
            'note' => $note,
        ]);

        $record = $DB->get_record('block_mwa_dashboard_messages', ['id' => $params['id']], '*', IGNORE_MISSING);
        if (!$record) {
            return ['success' => false, 'note' => '', 'timemodified' => 0];
        }

        $ctx = \context_course::instance($record->courseid);
        self::validate_context($ctx);
        require_capability('block/mwa_dashboard:view', $ctx);
        require_capability('block/mwa_dashboard:manageinterventions', $ctx);

        $clean = trim(strip_tags($params['note']));
        if (strlen($clean) > 12000) {
            $clean = substr($clean, 0, 12000);
        }
        $update = (object)[
            'id' => $record->id,
            'teacher_note' => $clean,
            'teacher_note_updated' => time(),
        ];
        $DB->update_record('block_mwa_dashboard_messages', $update);

        return ['success' => true, 'note' => $clean, 'timemodified' => $update->teacher_note_updated];
    }

    public static function save_intervention_note_returns() {
        return new \external_single_structure([
            'success'      => new \external_value(PARAM_BOOL, 'Whether the note was saved'),
            'note'         => new \external_value(PARAM_RAW, 'Saved note'),
            'timemodified' => new \external_value(PARAM_INT, 'Last update timestamp'),
        ]);
    }

    public static function get_ai_recommendation_parameters(): \external_function_parameters {
        return new \external_function_parameters([
            'courseid'     => new \external_value(PARAM_INT,  'Course ID'),
            'student_name' => new \external_value(PARAM_NOTAGS, 'Student name or empty for class'),
            'prompt'       => new \external_value(PARAM_RAW,  'Prompt for the AI'),
        ]);
    }

    public static function get_ai_recommendation(int $courseid, string $student_name, string $prompt): array {
        global $USER;

        $params = self::validate_parameters(self::get_ai_recommendation_parameters(), [
            'courseid'     => $courseid,
            'student_name' => $student_name,
            'prompt'       => $prompt,
        ]);

        $context = \context_course::instance($params['courseid']);
        self::validate_context($context);
        require_capability('block/mwa_dashboard:view', $context);

        self::require_ai_access($context);

        $alias = self::pseudonymize_students_for_ai(
            $params['courseid'],
            $params['student_name']
        ) ?: 'Class';
        $instruction = self::pseudonymize_students_for_ai($params['courseid'], $params['prompt']);
        $auditcategories = ['policy', 'individual_summary'];
        if (strpos($instruction, '[Texto completo dos alunos') !== false ||
                strpos($instruction, '[Atividade real do fórum]') !== false) {
            $auditcategories[] = 'forum_post_content';
        }
        try {
            $text = \block_mwa_dashboard\ai\client::complete([
                [
                    'role' => 'system',
                    'category' => 'policy',
                    'content' => 'You are a pedagogical assistant. Use only the minimised Moodle data supplied. ' .
                        'Never infer a real identity from a student alias.',
                ],
                ['role' => 'user', 'category' => 'individual_summary',
                    'content' => "Subject: {$alias}\n\n{$instruction}"],
            ], self::get_ai_forbidden_identifiers($params['courseid']));
            \block_mwa_dashboard\ai\audit::record((int)$USER->id, $params['courseid'], 'recommendation',
                'pedagogical_recommendation', $auditcategories, 'success');
        } catch (\Throwable $exception) {
            \block_mwa_dashboard\ai\audit::record((int)$USER->id, $params['courseid'], 'recommendation',
                'pedagogical_recommendation', $auditcategories, 'error');
            throw $exception;
        }

        $text = self::restore_students_in_ai_response($params['courseid'], $text);
        return ['success' => !empty($text), 'recommendation' => $text ?: 'Sem resposta da IA.'];
    }

    public static function get_ai_recommendation_returns(): \external_single_structure {
        return new \external_single_structure([
            'success'        => new \external_value(PARAM_BOOL, 'Success'),
            'recommendation' => new \external_value(PARAM_RAW,  'AI recommendation text'),
        ]);
    }

    // ────────────────────────────────────────────────────────────
    // chat_message — conversation with class context
    // ────────────────────────────────────────────────────────────

    public static function chat_message_parameters(): \external_function_parameters {
        return new \external_function_parameters([
            'courseid'  => new \external_value(PARAM_INT,  'Course ID'),
            'messages'  => new \external_value(PARAM_RAW,  'JSON: array of {role,content}'),
            'context'   => new \external_value(PARAM_RAW,  'JSON: course context summary', VALUE_DEFAULT, '{}'),
        ]);
    }

    public static function chat_message(int $courseid, string $messages, string $context = '{}'): array {
        global $USER;

        $params = self::validate_parameters(self::chat_message_parameters(), [
            'courseid' => $courseid,
            'messages' => $messages,
            'context'  => $context,
        ]);

        $ctx = \context_course::instance($params['courseid']);
        self::validate_context($ctx);
        require_capability('block/mwa_dashboard:view', $ctx);

        self::require_ai_access($ctx);

        $msg_list = self::aggregate_chat_messages(
            $params['courseid'],
            json_decode($params['messages'], true) ?? []
        );
        $ctx_data = self::privacy_safe_chat_context($params['courseid'], json_decode($params['context'], true) ?? []);
        array_unshift($msg_list, [
            'role' => 'user',
            'category' => 'aggregate_context',
            'content' => "[PRIVACY-SAFE COURSE DATA]\n" . json_encode($ctx_data) .
                "\nIndividual records use request-scoped aliases created inside Moodle. Analyse educational patterns only. " .
                "Never request or infer real identity, email, username, enrolment identifier, IP address or submission content. " .
                "You may compare aliases using the allowed educational indicators when pedagogically relevant.",
        ]);

        try {
            $reply = \block_mwa_dashboard\ai\client::complete(
                $msg_list,
                self::get_ai_forbidden_identifiers($params['courseid'])
            );
            \block_mwa_dashboard\ai\audit::record((int)$USER->id, $params['courseid'], 'chat',
                'aggregate_pedagogical_analysis',
                ['aggregate_context', 'pseudonymised_individual_metrics', 'aggregate_conversation', 'activity_metrics'], 'success');
        } catch (\Throwable $exception) {
            \block_mwa_dashboard\ai\audit::record((int)$USER->id, $params['courseid'], 'chat',
                'aggregate_pedagogical_analysis',
                ['aggregate_context', 'pseudonymised_individual_metrics', 'aggregate_conversation', 'activity_metrics'], 'error');
            throw $exception;
        }

        $reply = self::restore_students_in_ai_response($params['courseid'], (string)$reply);
        return ['success' => !empty($reply), 'reply' => $reply ?: 'Sem resposta da IA.'];
    }

    public static function chat_message_returns(): \external_single_structure {
        return new \external_single_structure([
            'success' => new \external_value(PARAM_BOOL, 'Success'),
            'reply'   => new \external_value(PARAM_RAW,  'AI reply text'),
        ]);
    }

    // ──── Due dates for graded activities ──────────────────────
    public static function get_due_dates_parameters(): \external_function_parameters {
        return new \external_function_parameters([
            'courseid' => new \external_value(PARAM_INT, 'Course ID'),
        ]);
    }

    public static function get_due_dates(int $courseid): array {
        global $DB;

        $params = self::validate_parameters(self::get_due_dates_parameters(), ['courseid' => $courseid]);
        $context = \context_course::instance($params['courseid']);
        self::validate_context($context);
        require_capability('block/mwa_dashboard:view', $context);

        $dates = []; // cmid => timestamp (ms)

        try {
            $modinfo = get_fast_modinfo($params['courseid']);
            $cms = $modinfo->get_cms();

            // Preload deadline records by module type. This keeps the number of
            // database requests bounded instead of issuing one query per course module.
            $instanceids = [
                'assign' => [], 'quiz' => [], 'forum' => [], 'lesson' => [],
                'workshop' => [], 'choice' => [], 'data' => [],
            ];
            foreach ($cms as $cm) {
                if ($cm->uservisible && isset($instanceids[$cm->modname])) {
                    $instanceids[$cm->modname][] = (int)$cm->instance;
                }
            }

            $records = [
                'assign' => $instanceids['assign']
                    ? $DB->get_records_list('assign', 'id', $instanceids['assign'], '', 'id, duedate, cutoffdate') : [],
                'quiz' => $instanceids['quiz']
                    ? $DB->get_records_list('quiz', 'id', $instanceids['quiz'], '', 'id, timeclose') : [],
                'forum' => $instanceids['forum']
                    ? $DB->get_records_list('forum', 'id', $instanceids['forum'], '', 'id, duedate, cutoffdate') : [],
                'lesson' => $instanceids['lesson']
                    ? $DB->get_records_list('lesson', 'id', $instanceids['lesson'], '', 'id, deadline') : [],
                'workshop' => $instanceids['workshop']
                    ? $DB->get_records_list('workshop', 'id', $instanceids['workshop'], '', 'id, submissionend') : [],
                'choice' => $instanceids['choice']
                    ? $DB->get_records_list('choice', 'id', $instanceids['choice'], '', 'id, timeclose') : [],
                'data' => $instanceids['data']
                    ? $DB->get_records_list('data', 'id', $instanceids['data'], '', 'id, timeviewto') : [],
            ];

            foreach ($cms as $cm) {
                if (!$cm->uservisible) continue;
                $modname = $cm->modname;
                $instanceid = $cm->instance;
                $best = 0;

                try {
                    $rec = $records[$modname][$instanceid] ?? null;
                    if ($modname === 'assign') {
                        if ($rec) {
                            // Cutoff takes priority (real deadline); fallback to duedate
                            if (!empty($rec->cutoffdate) && $rec->cutoffdate > 0) {
                                $best = $rec->cutoffdate;
                            } elseif (!empty($rec->duedate) && $rec->duedate > 0) {
                                $best = $rec->duedate;
                            }
                        }
                    } elseif ($modname === 'quiz') {
                        if ($rec && !empty($rec->timeclose) && $rec->timeclose > 0) {
                            $best = $rec->timeclose;
                        }
                    } elseif ($modname === 'forum') {
                        if ($rec) {
                            if (!empty($rec->cutoffdate) && $rec->cutoffdate > 0) {
                                $best = $rec->cutoffdate;
                            } elseif (!empty($rec->duedate) && $rec->duedate > 0) {
                                $best = $rec->duedate;
                            }
                        }
                    } elseif ($modname === 'lesson') {
                        if ($rec && !empty($rec->deadline) && $rec->deadline > 0) {
                            $best = $rec->deadline;
                        }
                    } elseif ($modname === 'workshop') {
                        if ($rec && !empty($rec->submissionend) && $rec->submissionend > 0) {
                            $best = $rec->submissionend;
                        }
                    } elseif ($modname === 'choice') {
                        if ($rec && !empty($rec->timeclose) && $rec->timeclose > 0) {
                            $best = $rec->timeclose;
                        }
                    } elseif ($modname === 'data') {
                        if ($rec && !empty($rec->timeviewto) && $rec->timeviewto > 0) {
                            $best = $rec->timeviewto;
                        }
                    } elseif ($modname === 'h5pactivity') {
                        // h5pactivity has no native due date in core
                        $best = 0;
                    }
                } catch (\Throwable $e) {
                    $best = 0;
                }

                if ($best > 0) {
                    $dates[] = ['cmid' => $cm->id, 'duedate' => $best * 1000];
                }
            }
        } catch (\Throwable $e) {
            // Return whatever was collected; never fail the whole call
        }

        return ['dates' => $dates];
    }

    public static function get_due_dates_returns(): \external_single_structure {
        return new \external_single_structure([
            'dates' => new \external_multiple_structure(
                new \external_single_structure([
                    'cmid'    => new \external_value(PARAM_INT, 'Course module ID'),
                    'duedate' => new \external_value(PARAM_INT, 'Due/cutoff date in milliseconds'),
                ])
            ),
        ]);
    }

    // ──── Activity/resource content extraction ──────────────────────
    public static function get_activity_content_parameters(): \external_function_parameters {
        return new \external_function_parameters([
            'courseid' => new \external_value(PARAM_INT,  'Course ID'),
            'cmid'     => new \external_value(PARAM_INT,  'Course module ID'),
        ]);
    }

    public static function get_activity_content(int $courseid, int $cmid): array {
        global $DB;

        $params = self::validate_parameters(self::get_activity_content_parameters(), [
            'courseid' => $courseid,
            'cmid'     => $cmid,
        ]);

        $context = \context_course::instance($params['courseid']);
        self::validate_context($context);
        require_capability('block/mwa_dashboard:view', $context);
        self::require_ai_access($context);

        try {
            $cm = get_coursemodule_from_id('', $params['cmid'], $params['courseid'], false, MUST_EXIST);
        } catch (\Exception $e) {
            return ['success' => false, 'content' => '', 'modname' => '', 'activityname' => ''];
        }

        $modname = $cm->modname;
        $instanceid = $cm->instance;
        $sections = [];   // Blocos estruturados para o prompt
        $activityname = $cm->name ?? '';

        // Helper: add non-empty section, preserving spaces between HTML blocks
        $add_section = function(string $label, string $text) use (&$sections) {
            // Convert block tags to breaks/spaces before stripping HTML
            $text = preg_replace('#</(p|div|li|h[1-6]|tr|td|br)\s*>#i', "\n", $text);
            $text = preg_replace('#<br\s*/?>#i', "\n", $text);
            $text = preg_replace('#<li[^>]*>#i', "• ", $text);
            $clean = trim(strip_tags($text));
            // Decode entities and normalize whitespace
            $clean = html_entity_decode($clean, ENT_QUOTES | ENT_HTML5, 'UTF-8');
            $clean = preg_replace('/[ \t]+/', ' ', $clean);
            $clean = preg_replace('/\n{3,}/', "\n\n", $clean);
            $clean = trim($clean);
            if ($clean !== '') {
                $sections[] = "[$label]\n$clean";
            }
        };

        switch ($modname) {

            // ─── PAGE ────────────────────────────────────────────────────
            case 'page':
                $rec = $DB->get_record('page', ['id' => $instanceid], 'name, content, intro');
                if ($rec) {
                    $activityname = $rec->name ?? $activityname;
                    $add_section('Descrição/introdução', $rec->intro ?? '');
                    $add_section('Conteúdo da página', $rec->content ?? '');
                    // Reading metrics
                    $word_count = str_word_count(strip_tags($rec->content ?? ''));
                    $sections[] = "[Métricas]\nPalavras: $word_count | Leitura estimada: " . ceil($word_count / 200) . " min";
                }
                break;

            // ─── ASSIGNMENT ────────────────────────────────────────────────────
            case 'assign':
                $rec = $DB->get_record('assign', ['id' => $instanceid],
                    'name, intro, activity, maxattempts, submissiondrafts, requiresubmissionstatement, ' .
                    'duedate, cutoffdate, allowsubmissionsfromdate, gradingduedate, grade, ' .
                    'teamsubmission, attemptreopenmethod, blindmarking');
                if ($rec) {
                    $activityname = $rec->name ?? $activityname;
                    $add_section('Enunciado da tarefa', $rec->intro ?? '');
                    // Additional activity instructions ("activity" field)
                    if (!empty($rec->activity)) {
                        $add_section('Instruções da atividade', $rec->activity);
                    }
                    // Metadata relevant for pedagogical analysis
                    $meta = [];
                    if (!empty($rec->allowsubmissionsfromdate)) $meta[] = "Abertura: " . date('d/m/Y H:i', $rec->allowsubmissionsfromdate);
                    if (!empty($rec->duedate))    $meta[] = "Prazo de entrega: " . date('d/m/Y H:i', $rec->duedate);
                    if (!empty($rec->cutoffdate)) $meta[] = "Prazo máximo (após, não aceita): " . date('d/m/Y H:i', $rec->cutoffdate);
                    if ($rec->grade > 0)          $meta[] = "Valor: {$rec->grade} pontos";
                    elseif ($rec->grade < 0)      $meta[] = "Avaliação por escala/conceito";
                    // Tentativas: -1 = ilimitadas
                    if ($rec->maxattempts == -1)      $meta[] = "Tentativas: ILIMITADAS";
                    elseif ($rec->maxattempts > 0)    $meta[] = "Tentativas permitidas: {$rec->maxattempts}";
                    else                              $meta[] = "Tentativas: 1 (única)";
                    // Como reabre tentativa
                    $reopen_labels = ['none' => 'Não reabre', 'manual' => 'Reabertura manual', 'untilpass' => 'Reabre até atingir nota de aprovação'];
                    if (!empty($rec->attemptreopenmethod) && isset($reopen_labels[$rec->attemptreopenmethod])) {
                        $meta[] = "Reabertura: " . $reopen_labels[$rec->attemptreopenmethod];
                    }
                    if ($rec->submissiondrafts)   $meta[] = "Exige clicar em 'Enviar' para finalizar (rascunhos)";
                    if ($rec->teamsubmission)     $meta[] = "Entrega em grupo: Sim";
                    if ($rec->requiresubmissionstatement) $meta[] = "Exige declaração de autoria";
                    if ($rec->blindmarking)       $meta[] = "Correção às cegas (anônima)";
                    if ($meta) $sections[] = "[Configurações de entrega]\n" . implode("\n", $meta);
                    // Grading criteria (rubric/guide)
                    try {
                        $modctx = \context_module::instance($params['cmid']);
                        $gc = $DB->get_record('grading_areas', ['contextid' => $modctx->id, 'component' => 'mod_assign'], 'activemethod');
                        if ($gc && !empty($gc->activemethod)) {
                            $method_labels = ['rubric' => 'Rubrica', 'guide' => 'Guia de avaliação', 'btec' => 'BTEC'];
                            $sections[] = "[Método de avaliação]\n" . ($method_labels[$gc->activemethod] ?? ucfirst($gc->activemethod));
                        } else {
                            $sections[] = "[Método de avaliação]\nAvaliação simples por nota direta (sem rubrica)";
                        }
                    } catch (\Exception $e) {}
                    // Campos de envio habilitados
                    $plugins = $DB->get_records('assign_plugin_config',
                        ['assignment' => $instanceid, 'subtype' => 'assignsubmission', 'name' => 'enabled', 'value' => '1'],
                        '', 'plugin');
                    if ($plugins) {
                        $plug_labels = ['file' => 'Envio de arquivo', 'onlinetext' => 'Texto online', 'comments' => 'Comentários'];
                        $plug_names = array_map(function($p) use ($plug_labels) {
                            return $plug_labels[$p->plugin] ?? $p->plugin;
                        }, array_values($plugins));
                        $sections[] = "[Tipos de envio aceitos]\n" . implode(', ', $plug_names);
                    }
                }
                break;

            // ─── FORUM ─────────────────────────────────────────────────────
            case 'forum':
                $rec = $DB->get_record('forum', ['id' => $instanceid], '*');
                if ($rec) {
                    $activityname = $rec->name ?? $activityname;
                    $add_section('Descrição/pergunta norteadora do fórum', $rec->intro ?? '');
                    $meta = [];
                    $type_labels = ['general'=>'Fórum geral','eachuser'=>'Cada aluno inicia tópico','single'=>'Discussão simples','qanda'=>'Perguntas e respostas','blog'=>'Blog'];
                    $meta[] = "Tipo: " . ($type_labels[$rec->type] ?? $rec->type);
                    if (!empty($rec->grade) && $rec->grade > 0) $meta[] = "Pontuação: {$rec->grade} pts";
                    if (!empty($rec->assessed)) $meta[] = "Avaliação das postagens: Sim";
                    $sections[] = "[Configurações]\n" . implode("\n", $meta);

                    // Read ALL discussions and posts — same approach as smartedu
                    try {
                        $discussions = $DB->get_records('forum_discussions', ['forum' => $instanceid]);
                        $all_posts = [];
                        $total_posts = 0;
                        $author_ids = [];
                        $disc_texts = [];

                        // Fetch all posts in one request and group them in memory,
                        // avoiding one database query for every discussion.
                        $posts_by_discussion = [];
                        if ($discussions) {
                            list($insql, $inparams) = $DB->get_in_or_equal(array_keys($discussions), SQL_PARAMS_NAMED, 'discussion');
                            $posts = $DB->get_records_select(
                                'forum_posts',
                                "discussion $insql",
                                $inparams,
                                'discussion ASC, created ASC'
                            );
                            foreach ($posts as $post) {
                                $posts_by_discussion[$post->discussion][] = $post;
                            }
                        }

                        foreach ($discussions as $disc) {
                            $posts = $posts_by_discussion[$disc->id] ?? [];
                            $disc_posts = [];
                            foreach ($posts as $post) {
                                $total_posts++;
                                $author_ids[$post->userid] = true;
                                $msg = trim(strip_tags($post->message ?? ''));
                                $msg = html_entity_decode($msg, ENT_QUOTES | ENT_HTML5, 'UTF-8');
                                $msg = preg_replace('/\s+/', ' ', $msg);
                                if ($msg !== '') {
                                    $disc_posts[] = $msg;
                                }
                            }
                            if ($disc_posts) {
                                $disc_title = trim($disc->name ?? 'Sem título');
                                // Post inicial separado das respostas
                                $initial = array_shift($disc_posts);
                                $block = "TÓPICO: $disc_title\n  [Post inicial] " . mb_substr($initial, 0, 400);
                                foreach (array_slice($disc_posts, 0, 8) as $reply) {
                                    $block .= "\n  [Resposta] " . mb_substr($reply, 0, 300);
                                }
                                if (count($disc_posts) > 8) {
                                    $block .= "\n  [...+" . (count($disc_posts) - 8) . " respostas]";
                                }
                                $disc_texts[] = $block;
                                // Corpus agregado
                                $all_posts[] = $initial;
                                foreach (array_slice($disc_posts, 0, 5) as $r) {
                                    $all_posts[] = $r;
                                }
                            }
                        }

                        $disc_count = count($discussions);
                        $author_count = count($author_ids);
                        if ($disc_count > 0) {
                            $sections[] = "[Atividade real do fórum]\nDiscussões: $disc_count | Posts: $total_posts | Participantes: $author_count";
                        }

                        // Pseudonymise enrolled student names inside forum text before it is added to the AI prompt.
                        // This is defence in depth: the complete recommendation prompt is pseudonymised again later.
                        if ($disc_texts) {
                            foreach ($disc_texts as &$block) {
                                $block = self::pseudonymize_students_for_ai($params['courseid'], $block);
                            }
                            unset($block);
                            $add_section('O que os alunos escreveram — faça um resumo dos temas discutidos', implode("\n\n", $disc_texts));
                        }

                        // Build a pseudonymised aggregated corpus for thematic analysis.
                        if ($all_posts) {
                            $corpus = implode(' | ', array_map(function($t) { return mb_substr($t, 0, 300); }, $all_posts));
                            if (mb_strlen($corpus) > 3000) {
                                $corpus = mb_substr($corpus, 0, 3000) . ' [...]';
                            }
                            $corpus = self::pseudonymize_students_for_ai($params['courseid'], $corpus);
                            $sections[] = "[Texto completo dos alunos — use para resumir temas, argumentos e lacunas]\n$corpus";
                        }
                    } catch (\Throwable $e) {
                        $sections[] = "[Posts do fórum]\nErro ao ler posts: " . $e->getMessage();
                    }
                }
                break;

            // ─── QUIZ ──────────────────────────────────────────────
            case 'quiz':
                $rec = $DB->get_record('quiz', ['id' => $instanceid], '*');
                if ($rec) {
                    $activityname = $rec->name ?? $activityname;
                    $add_section('Introdução/instruções do questionário', $rec->intro ?? '');
                    $meta = [];
                    if (isset($rec->attempts) && $rec->attempts == 0) $meta[] = "Tentativas: ILIMITADAS";
                    elseif (isset($rec->attempts) && $rec->attempts > 0) $meta[] = "Tentativas: {$rec->attempts}";
                    if (!empty($rec->grade) && $rec->grade > 0) $meta[] = "Nota máxima: {$rec->grade}";
                    if (!empty($rec->timelimit) && $rec->timelimit > 0) $meta[] = "Tempo limite: " . round($rec->timelimit / 60) . " min";
                    if (!empty($rec->shuffleanswers)) $meta[] = "Alternativas embaralhadas: Sim";
                    if ($meta) $sections[] = "[Configurações]\n" . implode("\n", $meta);

                    // Fetch questions: ultra-simple step-by-step approach
                    $questions = [];
                    $q_errors = [];

                    // Step 1: get all quiz slots
                    $slots = [];
                    try {
                        $slots = $DB->get_records('quiz_slots', ['quizid' => $instanceid], 'slot');
                    } catch (\Throwable $e) {
                        $q_errors[] = "slots: " . $e->getMessage();
                    }

                    // Step 2: for each slot, resolve the question_id
                    $question_ids = [];
                    $refs_by_slot = [];
                    $setrefs_by_slot = [];
                    $latest_version_by_entry = [];
                    $entries_by_category = [];
                    $questions_by_category = [];
                    $slotids = array_map('intval', array_keys($slots));

                    if ($slotids) {
                        try {
                            list($insql, $inparams) = $DB->get_in_or_equal($slotids, SQL_PARAMS_NAMED, 'quizslot');
                            $baseparams = ['component' => 'mod_quiz', 'questionarea' => 'slot'];
                            $allrefs = $DB->get_records_select(
                                'question_references',
                                "component = :component AND questionarea = :questionarea AND itemid $insql",
                                $baseparams + $inparams,
                                '',
                                'id, itemid, questionbankentryid'
                            );
                            foreach ($allrefs as $ref) {
                                $refs_by_slot[(int)$ref->itemid][] = $ref;
                            }
                        } catch (\Throwable $e) {
                            // Older Moodle versions may store questionid directly in quiz_slots.
                        }

                        try {
                            list($insql, $inparams) = $DB->get_in_or_equal($slotids, SQL_PARAMS_NAMED, 'quizset');
                            $baseparams = ['component' => 'mod_quiz', 'questionarea' => 'slot'];
                            $allsetrefs = $DB->get_records_select(
                                'question_set_references',
                                "component = :component AND questionarea = :questionarea AND itemid $insql",
                                $baseparams + $inparams,
                                '',
                                'id, itemid, filtercondition'
                            );
                            foreach ($allsetrefs as $setref) {
                                $setrefs_by_slot[(int)$setref->itemid][] = $setref;
                            }
                        } catch (\Throwable $e) {
                            // Random set references are unavailable on older Moodle versions.
                        }
                    }

                    $entryids = [];
                    foreach ($refs_by_slot as $slotrefs) {
                        foreach ($slotrefs as $ref) {
                            $entryids[(int)$ref->questionbankentryid] = true;
                        }
                    }

                    $categoryids = [];
                    foreach ($setrefs_by_slot as $slotsetrefs) {
                        foreach ($slotsetrefs as $setref) {
                            $filter = json_decode($setref->filtercondition, true);
                            $categoryid = 0;
                            if (is_array($filter)) {
                                if (!empty($filter['category'])) {
                                    $categoryid = (int)$filter['category'];
                                } elseif (!empty($filter['cat'])) {
                                    $parts = explode(',', $filter['cat']);
                                    $categoryid = (int)$parts[0];
                                } elseif (!empty($filter['questioncategoryid'])) {
                                    $categoryid = (int)$filter['questioncategoryid'];
                                }
                            } elseif (is_numeric($setref->filtercondition)) {
                                $categoryid = (int)$setref->filtercondition;
                            }
                            if ($categoryid > 0) {
                                $categoryids[$categoryid] = true;
                            }
                        }
                    }

                    if ($categoryids) {
                        try {
                            $allentries = $DB->get_records_list(
                                'question_bank_entries', 'questioncategoryid', array_keys($categoryids),
                                'questioncategoryid ASC, id ASC', 'id, questioncategoryid'
                            );
                            $categorycounts = [];
                            foreach ($allentries as $entry) {
                                $categoryid = (int)$entry->questioncategoryid;
                                $categorycounts[$categoryid] = ($categorycounts[$categoryid] ?? 0) + 1;
                                if ($categorycounts[$categoryid] <= 10) {
                                    $entries_by_category[$categoryid][] = $entry;
                                    $entryids[(int)$entry->id] = true;
                                }
                            }
                        } catch (\Throwable $e) {
                            try {
                                $allcategoryquestions = $DB->get_records_list(
                                    'question', 'category', array_keys($categoryids), 'category ASC, id ASC',
                                    'id, category, qtype'
                                );
                                foreach ($allcategoryquestions as $question) {
                                    $questions_by_category[(int)$question->category][] = $question;
                                }
                            } catch (\Throwable $fallbackerror) {
                                $q_errors[] = 'categories: ' . $fallbackerror->getMessage();
                            }
                        }
                    }

                    if ($entryids) {
                        try {
                            $allversions = $DB->get_records_list(
                                'question_versions', 'questionbankentryid', array_keys($entryids),
                                'questionbankentryid ASC, version DESC',
                                'id, questionbankentryid, questionid, version'
                            );
                            foreach ($allversions as $version) {
                                $entryid = (int)$version->questionbankentryid;
                                if (!isset($latest_version_by_entry[$entryid])) {
                                    $latest_version_by_entry[$entryid] = $version;
                                }
                            }
                        } catch (\Throwable $e) {
                            $q_errors[] = 'versions: ' . $e->getMessage();
                        }
                    }
                    foreach ($slots as $slot) {
                        // Try via question_references (fixed questions, Moodle 4.0+)
                        try {
                            $refs = $refs_by_slot[(int)$slot->id] ?? [];
                            foreach ($refs as $ref) {
                                $version = $latest_version_by_entry[(int)$ref->questionbankentryid] ?? null;
                                if ($version) {
                                    $question_ids[] = $version->questionid;
                                }
                            }
                        } catch (\Throwable $e) {
                            // No question_references — may be Moodle 3.x
                            if (!empty($slot->questionid)) {
                                $question_ids[] = $slot->questionid;
                            }
                        }

                        // If not found via question_references, try question_set_references
                        // (used for RANDOM questions from a question bank category)
                        if (empty($question_ids) || !isset($refs) || empty($refs)) {
                            try {
                                $set_refs = $setrefs_by_slot[(int)$slot->id] ?? [];
                                foreach ($set_refs as $sr) {
                                    // filtercondition is JSON with the category
                                    $filter = json_decode($sr->filtercondition, true);
                                    $cat_id = 0;
                                    if (is_array($filter)) {
                                        // Moodle 4.3+: {"cat":"id,contextid"} ou {"category":"id"}
                                        if (!empty($filter['category'])) {
                                            $cat_id = (int)$filter['category'];
                                        } elseif (!empty($filter['cat'])) {
                                            $parts = explode(',', $filter['cat']);
                                            $cat_id = (int)$parts[0];
                                        } elseif (!empty($filter['questioncategoryid'])) {
                                            $cat_id = (int)$filter['questioncategoryid'];
                                        }
                                    } elseif (is_numeric($sr->filtercondition)) {
                                        $cat_id = (int)$sr->filtercondition;
                                    }
                                    if ($cat_id > 0) {
                                        // Fetch questions from category via question_bank_entries
                                        try {
                                            $entries = $entries_by_category[$cat_id] ?? [];
                                            foreach ($entries as $entry) {
                                                $version = $latest_version_by_entry[(int)$entry->id] ?? null;
                                                if ($version) {
                                                    $question_ids[] = $version->questionid;
                                                }
                                            }
                                        } catch (\Throwable $e2) {
                                            // Fallback: buscar diretamente da tabela question pela categoria
                                            try {
                                                $cat_qs = array_slice($questions_by_category[$cat_id] ?? [], 0, 10);
                                                foreach ($cat_qs as $cq) {
                                                    $question_ids[] = $cq->id;
                                                }
                                            } catch (\Throwable $e3) {
                                                $q_errors[] = "cat{$cat_id}: " . $e3->getMessage();
                                            }
                                        }
                                    }
                                }
                            } catch (\Throwable $e) {
                                // question_set_references does not exist in this version
                            }
                        }
                    }

                    // Step 3: fetch each question individually
                    if ($question_ids) {
                        $uniquequestionids = array_values(array_unique(array_map('intval', $question_ids)));
                        $loadedquestions = $DB->get_records_list(
                            'question', 'id', $uniquequestionids, '', 'id, category, qtype'
                        );
                        $randomcategoryids = [];
                        foreach ($loadedquestions as $loadedquestion) {
                            if ($loadedquestion->qtype === 'random') {
                                $randomcategoryids[(int)$loadedquestion->category] = true;
                            }
                        }
                        $randomquestionsbycategory = [];
                        if ($randomcategoryids) {
                            $randomquestions = $DB->get_records_list(
                                'question', 'category', array_keys($randomcategoryids), 'category ASC, id ASC',
                                'id, category, qtype'
                            );
                            foreach ($randomquestions as $randomquestion) {
                                $randomquestionsbycategory[(int)$randomquestion->category][] = $randomquestion;
                            }
                        }
                        foreach (array_unique($question_ids) as $qid) {
                            try {
                                $q = $loadedquestions[(int)$qid] ?? null;
                                if ($q && $q->qtype !== 'random') {
                                    $questions[$q->id] = $q;
                                } elseif ($q && $q->qtype === 'random') {
                                    // Random question: try to get questions from the category
                                    try {
                                        $cat_questions = array_slice($randomquestionsbycategory[(int)$q->category] ?? [], 0, 5);
                                        foreach ($cat_questions as $cq) {
                                            if ($cq->qtype !== 'random' && !isset($questions[$cq->id])) {
                                                $questions[$cq->id] = $cq;
                                            }
                                        }
                                    } catch (\Throwable $e) {}
                                }
                            } catch (\Throwable $e) {
                                $q_errors[] = "q{$qid}: " . $e->getMessage();
                            }
                        }
                    }

                    // Step 4: format the questions
                    if ($questions) {
                        $qtype_labels = [
                            'multichoice'=>'Múltipla escolha','truefalse'=>'V/F',
                            'shortanswer'=>'Resposta curta','essay'=>'Dissertativa',
                            'numerical'=>'Numérica','match'=>'Associação',
                            'gapselect'=>'Lacunas','calculated'=>'Calculada',
                        ];
                        $type_counts = [];
                        foreach ($questions as $q) {
                            $t = $qtype_labels[$q->qtype] ?? $q->qtype;
                            $type_counts[$t] = ($type_counts[$t] ?? 0) + 1;
                        }
                        $type_summary = [];
                        foreach ($type_counts as $t => $n) { $type_summary[] = "$n × $t"; }
                        $sections[] = "[Composição]\n" . count($questions) . " questões: " . implode(', ', $type_summary);

                        // Question text, alternatives and correctness are deliberately excluded.
                        // Only aggregate composition metadata may leave Moodle.
                    } else {
                        $err_detail = $q_errors ? implode(' | ', array_slice($q_errors, 0, 3)) : 'nenhum erro capturado';
                        $sections[] = "[Questões]\n" . count($slots) . " slots. IDs resolvidos: " . count($question_ids)
                            . ". Questões carregadas: 0. Erros: $err_detail";
                    }
                }
                break;

            // ─── BOOK ────────────────────────────────────────────────────
            case 'book':
                $rec = $DB->get_record('book', ['id' => $instanceid], 'name, intro, numbering');
                if ($rec) {
                    $activityname = $rec->name ?? $activityname;
                    $add_section('Introdução', $rec->intro ?? '');
                    $chapters = $DB->get_records('book_chapters', ['bookid' => $instanceid], 'pagenum', 'title, content, subchapter');
                    if ($chapters) {
                        $sections[] = "[Estrutura]\n" . count($chapters) . " capítulos/seções";
                        $chap_texts = [];
                        $total_words = 0;
                        foreach (array_slice($chapters, 0, 10) as $c) {
                            $words = str_word_count(strip_tags($c->content ?? ''));
                            $total_words += $words;
                            $indent = $c->subchapter ? '  ' : '';
                            $text   = mb_substr(strip_tags($c->content ?? ''), 0, 300);
                            $chap_texts[] = "{$indent}► {$c->title} ({$words} palavras)\n{$indent}  $text";
                        }
                        $add_section('Capítulos', implode("\n\n", $chap_texts));
                        $read_min = ceil($total_words / 200);
                        $sections[] = "[Métricas de leitura]\nTotal de palavras estimado: $total_words | Tempo: ~{$read_min} min";
                    }
                }
                break;

            // ─── H5P ──────────────────────────────────────────────────────
            case 'h5pactivity':
                $rec = $DB->get_record('h5pactivity', ['id' => $instanceid], 'name, intro, grade');
                if ($rec) {
                    $activityname = $rec->name ?? $activityname;
                    $add_section('Descrição', $rec->intro ?? '');
                    if ($rec->grade > 0) $sections[] = "[Pontuação]\n{$rec->grade} pts";
                    // Tentar extrair textos do JSON do pacote H5P
                    $h5p_record = $DB->get_record_sql(
                        "SELECT h.json_content, h.mainlibraryid FROM {h5p} h
                           JOIN {files} f ON f.itemid = h.id AND f.filearea = 'package' AND f.component = 'mod_h5pactivity'
                          WHERE f.contextid = (SELECT id FROM {context} WHERE instanceid = ? AND contextlevel = 70)
                          LIMIT 1", [$params['cmid']]
                    );
                    if ($h5p_record && !empty($h5p_record->json_content)) {
                        $json = json_decode($h5p_record->json_content, true);
                        if ($json) {
                            $texts = [];
                            $keys  = ['title','text','question','statement','description','label','header','intro'];
                            array_walk_recursive($json, function($val, $key) use (&$texts, $keys) {
                                if (is_string($val) && in_array(strtolower($key), $keys)) {
                                    $clean = trim(strip_tags($val));
                                    if (mb_strlen($clean) > 5 && mb_strlen($clean) < 600) $texts[] = $clean;
                                }
                            });
                            if ($texts) {
                                $unique = array_unique($texts);
                                $add_section('Conteúdo interativo (H5P)', implode("\n• ", array_slice($unique, 0, 25)));
                            }
                        }
                    }
                }
                break;

            // ─── URL ──────────────────────────────────────────────────────
            case 'url':
                $rec = $DB->get_record('url', ['id' => $instanceid], 'name, intro, externalurl, display');
                if ($rec) {
                    $activityname = $rec->name ?? $activityname;
                    $add_section('Descrição', $rec->intro ?? '');
                    $sections[] = "[Link]\n" . ($rec->externalurl ?? '');
                }
                break;

            // ─── SCORM ────────────────────────────────────────────────────
            case 'scorm':
                $rec = $DB->get_record('scorm', ['id' => $instanceid], 'name, intro, maxattempt, grademethod, maxgrade');
                if ($rec) {
                    $activityname = $rec->name ?? $activityname;
                    $add_section('Descrição', $rec->intro ?? '');
                    $meta = [];
                    if ($rec->maxattempt > 0) $meta[] = "Tentativas: {$rec->maxattempt}";
                    if ($rec->maxgrade > 0)   $meta[] = "Nota máxima: {$rec->maxgrade}";
                    if ($meta) $sections[] = "[Configurações]\n" . implode("\n", $meta);
                }
                break;

            // ─── LABEL ───────────────────────────────────────────────────
            case 'label':
                $rec = $DB->get_record('label', ['id' => $instanceid], 'name, intro');
                if ($rec) {
                    $activityname = $rec->name ?? $activityname;
                    $add_section('Conteúdo do rótulo', $rec->intro ?? '');
                }
                break;

            // ─── GLOSSARY ────────────────────────────────────────────────
            case 'glossary':
                $rec = $DB->get_record('glossary', ['id' => $instanceid], 'name, intro, allowcomments, usedynalink, allowduplicatedentries');
                if ($rec) {
                    $activityname = $rec->name ?? $activityname;
                    $add_section('Descrição', $rec->intro ?? '');
                    $total_entries = $DB->count_records('glossary_entries', ['glossaryid' => $instanceid]);
                    if ($total_entries > 0) {
                        $sections[] = "[Atividade atual]\nEntradas cadastradas: $total_entries";
                        // Sample of latest entries
                        $entries = $DB->get_records('glossary_entries', ['glossaryid' => $instanceid], 'timecreated DESC', 'concept, definition', 0, 8);
                        if ($entries) {
                            $entry_texts = array_map(function($e) {
                                return trim($e->concept) . ': ' . mb_substr(strip_tags($e->definition ?? ''), 0, 200);
                            }, $entries);
                            $add_section('Termos cadastrados (amostra)', implode("\n---\n", $entry_texts));
                        }
                    }
                }
                break;

            // ─── WIKI ─────────────────────────────────────────────────────
            case 'wiki':
                $rec = $DB->get_record('wiki', ['id' => $instanceid], 'name, intro, wikimode, firstpagetitle');
                if ($rec) {
                    $activityname = $rec->name ?? $activityname;
                    $add_section('Descrição', $rec->intro ?? '');
                    $meta = [];
                    $meta[] = "Modo: " . ($rec->wikimode === 'collaborative' ? 'Colaborativo' : 'Individual');
                    if ($rec->firstpagetitle) $meta[] = "Página inicial: {$rec->firstpagetitle}";
                    $sections[] = "[Configurações]\n" . implode("\n", $meta);
                    // First page content
                    $page = $DB->get_record_sql(
                        "SELECT wp.cachedcontent FROM {wiki_subwikis} ws
                           JOIN {wiki_pages} wp ON wp.subwikiid = ws.id
                          WHERE ws.wikiid = ? ORDER BY wp.id LIMIT 1", [$instanceid]);
                    if ($page) $add_section('Conteúdo da wiki', $page->cachedcontent ?? '');
                }
                break;

            // ─── DATABASE ────────────────────────────────────────────
            case 'data':
                $rec = $DB->get_record('data', ['id' => $instanceid], 'name, intro, maxentries, requiredentries');
                if ($rec) {
                    $activityname = $rec->name ?? $activityname;
                    $add_section('Descrição', $rec->intro ?? '');
                    $meta = [];
                    if ($rec->requiredentries > 0) $meta[] = "Entradas obrigatórias: {$rec->requiredentries}";
                    if ($rec->maxentries > 0)      $meta[] = "Máximo de entradas: {$rec->maxentries}";
                    if ($meta) $sections[] = "[Configurações]\n" . implode("\n", $meta);
                    // Campos do banco de dados
                    $fields = $DB->get_records('data_fields', ['dataid' => $instanceid], 'id', 'name, type, description');
                    if ($fields) {
                        $field_texts = array_map(function($f) {
                            return "• {$f->name} (" . ($f->type) . ")" . ($f->description ? ": " . strip_tags($f->description) : '');
                        }, $fields);
                        $add_section('Campos do formulário', implode("\n", $field_texts));
                    }
                }
                break;

            // ─── FILE / RESOURCE ────────────────────────────────────────
            case 'resource':
                $rec = $DB->get_record('resource', ['id' => $instanceid], 'name, intro');
                if ($rec) {
                    $activityname = $rec->name ?? $activityname;
                    $add_section('Descrição', $rec->intro ?? '');
                    // File information
                    $file = $DB->get_record_sql(
                        "SELECT filename, filesize, mimetype FROM {files}
                          WHERE contextid = (SELECT id FROM {context} WHERE instanceid = ? AND contextlevel = 70)
                            AND component = 'mod_resource' AND filearea = 'content' AND filename != '.'
                          LIMIT 1", [$params['cmid']]);
                    if ($file) {
                        $sizekb = round($file->filesize / 1024);
                        $sections[] = "[Arquivo]\n{$file->filename} | {$file->mimetype} | {$sizekb} KB";
                    }
                }
                break;

            // ─── LESSON ────────────────────────────────────────────────────
            case 'lesson':
                $rec = $DB->get_record('lesson', ['id' => $instanceid], 'name, intro, grade, practice');
                if ($rec) {
                    $activityname = $rec->name ?? $activityname;
                    $add_section('Introdução', $rec->intro ?? '');
                    if ($rec->grade > 0) $sections[] = "[Pontuação]\n{$rec->grade} pts";
                    // Lesson pages with content
                    $pages = $DB->get_records('lesson_pages', ['lessonid' => $instanceid], 'id', 'title, contents, qtype', 0, 15);
                    if ($pages) {
                        $sections[] = "[Estrutura]\n" . count($pages) . " páginas na lição";
                        $page_texts = [];
                        foreach ($pages as $p) {
                            $ptext = mb_substr(strip_tags($p->contents ?? ''), 0, 300);
                            if (trim($ptext)) $page_texts[] = "► " . ($p->title ?? '') . ": $ptext";
                        }
                        if ($page_texts) $add_section('Páginas', implode("\n\n", $page_texts));
                    }
                }
                break;

            // ─── CHOICE (poll) ────────────────────────────────────────
            case 'choice':
                $rec = $DB->get_record('choice', ['id' => $instanceid], 'name, intro');
                if ($rec) {
                    $activityname = $rec->name ?? $activityname;
                    $add_section('Pergunta da enquete', $rec->intro ?? '');
                    $options = $DB->get_records('choice_options', ['choiceid' => $instanceid], 'id', 'text');
                    if ($options) {
                        $opt_texts = array_map(function($o) { return "• " . strip_tags($o->text ?? ''); }, $options);
                        $add_section('Opções de resposta', implode("\n", $opt_texts));
                    }
                }
                break;

            // ─── GAME (games plugin) ───────────────────────────────────
            case 'game':
                $rec = $DB->get_record('game', ['id' => $instanceid], 'name, intro, gamekind, quizid, glossaryid');
                if ($rec) {
                    $activityname = $rec->name ?? $activityname;
                    $add_section('Descrição do jogo', $rec->intro ?? '');
                    $kind_labels = [
                        'hangman' => 'Forca', 'crossword' => 'Palavras cruzadas',
                        'cryptex' => 'Criptex', 'millionaire' => 'Show do milhão',
                        'sudoku' => 'Sudoku', 'snakes' => 'Cobras e escadas',
                        'hiddenpicture' => 'Imagem oculta', 'bookquiz' => 'Quiz de livro',
                    ];
                    if (!empty($rec->gamekind)) {
                        $sections[] = "[Tipo de jogo]\n" . ($kind_labels[$rec->gamekind] ?? $rec->gamekind);
                    }
                    // If the game is based on a quiz or glossary, pull that content
                    if (!empty($rec->quizid)) {
                        $src_quiz = $DB->get_record('quiz', ['id' => $rec->quizid], 'name, intro');
                        if ($src_quiz) $add_section('Baseado no quiz', ($src_quiz->name ?? '') . "\n" . strip_tags($src_quiz->intro ?? ''));
                    }
                    if (!empty($rec->glossaryid)) {
                        $entries = $DB->get_records('glossary_entries', ['glossaryid' => $rec->glossaryid], 'id', 'concept, definition', 0, 20);
                        if ($entries) {
                            $entry_texts = array_map(function($e) {
                                return trim($e->concept) . ': ' . mb_substr(strip_tags($e->definition ?? ''), 0, 150);
                            }, $entries);
                            $add_section('Termos do jogo (do glossário)', implode("\n", $entry_texts));
                        }
                    }
                }
                break;

            // ─── GENERIC ─────────────────────────────────────────────────
            default:
                try {
                    $rec = $DB->get_record($modname, ['id' => $instanceid], 'name, intro');
                    if ($rec) {
                        $activityname = $rec->name ?? $activityname;
                        $add_section('Descrição', $rec->intro ?? '');
                    }
                } catch (\Exception $e) {
                    // modulo sem tabela padrao
                }
                break;
        }

        // ── Extract content from referenced files and URLs ────────────────
        try {
        // Collect sources: Moodle files + URLs embedded in content
        $sources = [];
        $all_text = implode(' ', array_column($sections, null));

        // 1. Module files (resource, assign with file, etc.)
        try {
            $ctx = \context_module::instance($params['cmid']);
            $ctxid = $ctx->id;
            $fs  = get_file_storage();

            // File areas per module
            $file_areas = [
                'resource'    => [['mod_resource',    'content',    0]],
                'assign'      => [],
                'page'        => [['mod_page',        'content',    0]],
                'book'        => [],
                'h5pactivity' => [['mod_h5pactivity', 'package',    0]],
                'scorm'       => [['mod_scorm',       'package',    0]],
            ];
            $areas = $file_areas[$modname] ?? [[$modname === 'resource' ? 'mod_resource' : "mod_$modname", 'content', 0]];
            if ($modname === 'resource') {
                $areas = [['mod_resource', 'content', 0]];
            }
            foreach ($areas as $area) {
                [$comp, $filearea, $itemid_] = $area;
                $files = $fs->get_area_files($ctxid, $comp, $filearea, false, 'filename', false);
                foreach ($files as $mfile) {
                    if ($mfile->is_directory()) continue;
                    $mime = $mfile->get_mimetype();
                    $fname = strtolower($mfile->get_filename());
                    // Only text-extractable types
                    if (
                        $mime === 'application/pdf' ||
                        (strpos($fname, '.pdf') !== false) ||
                        (strpos($mime, 'word') !== false) ||
                        (strpos($fname, '.docx') !== false) ||
                        (strpos($fname, '.doc') !== false) ||
                        (strpos($mime, 'text/') === 0)
                    ) {
                        $sources[] = [
                            'type'       => 'file',
                            'filename'   => $mfile->get_filename(),
                            'label'      => $mfile->get_filename(),
                            'contextid'  => $ctxid,
                            'component'  => $comp,
                            'filearea'   => $filearea,
                            'itemid'     => $mfile->get_itemid(),
                        ];
                    }
                }
            }
        } catch (\Exception $e) {
            // Context not available, skip
        }

        // 2. URLs in already-extracted content (YouTube, external links)
        $all_html = '';
        // Fetch intro/content/externalurl ONLY from columns that exist in the module table.
        // (page has content; url has externalurl; most only have intro)
        try {
            $columns = $DB->get_columns($modname);
            $wanted  = [];
            foreach (['intro', 'content', 'externalurl'] as $col) {
                if (isset($columns[$col])) {
                    $wanted[] = $col;
                }
            }
            if ($wanted) {
                $raw = $DB->get_record($modname, ['id' => $instanceid], implode(', ', $wanted));
                if ($raw) {
                    foreach ($wanted as $col) {
                        $all_html .= ' ' . ($raw->$col ?? '');
                    }
                }
            }
        } catch (\Throwable $e) {}

        // Decode HTML entities to catch escaped URLs (&quot; etc.)
        $all_html = html_entity_decode($all_html, ENT_QUOTES | ENT_HTML5, 'UTF-8');

        // Search for URLs in both src/href attributes and loose text
        $found_urls = [];
        // src="..." e href="..." de iframes/links
        if (preg_match_all('#(?:src|href)\s*=\s*["\']([^"\']+)["\']#i', $all_html, $attr_matches)) {
            $found_urls = array_merge($found_urls, $attr_matches[1]);
        }
        // URLs soltas no texto
        if (preg_match_all('#https?://[^\s"\'<>\)]+#', $all_html . ' ' . $all_text, $text_matches)) {
            $found_urls = array_merge($found_urls, $text_matches[0]);
        }

        $seen_urls = [];
        foreach ($found_urls as $found_url) {
            $found_url = trim(rtrim($found_url, '.,;)'));
            if ($found_url === '' || in_array($found_url, $seen_urls)) continue;
            if (strpos($found_url, 'http') !== 0) continue;
            $seen_urls[] = $found_url;
            // YouTube (embed, watch, youtu.be, nocookie)
            if (content_extractor::youtube_id($found_url)) {
                $sources[] = ['type' => 'url', 'url' => $found_url, 'label' => 'Vídeo YouTube'];
                continue;
            }
            // External URLs that are not from Moodle itself
            $wwwroot = $CFG->wwwroot ?? '';
            if ($wwwroot && !(strpos($found_url, $wwwroot) === 0)) {
                $sources[] = ['type' => 'url', 'url' => $found_url, 'label' => $found_url];
            }
        }

        // Extract content from found sources (max 3 to avoid overloading)
        if ($sources) {
            try {
                $extracted = content_extractor::extract_all(array_slice($sources, 0, 3));
                if (trim($extracted)) {
                    $sections[] = "=== CONTEÚDO EXTRAÍDO DE ARQUIVOS/LINKS ===\n$extracted";
                }
            } catch (\Throwable $e) {
                // Extraction failure should not prevent base analysis
                $sections[] = "[Extração de arquivos/links não disponível: " . $e->getMessage() . "]";
            }
        }

        } catch (\Throwable $content_err) {
            // Any failure in extra content extraction is silenced
            // to not prevent the base analysis that already works
        }

        // Build final content from structured sections
        // Prefix with summary of extracted sections (helps debug and gives AI context)
        $section_labels = [];
        foreach ($sections as $sec) {
            if (preg_match('/^\[([^\]]+)\]/', $sec, $m)) {
                $section_labels[] = $m[1];
            }
        }
        if ($section_labels) {
            array_unshift($sections, "[Seções extraídas: " . implode(', ', $section_labels) . "]\nTotal: " . count($sections) . " blocos de conteúdo");
        }
        $content = implode("\n\n", $sections);

        // Limit to 7000 chars to not exceed AI context
        if (mb_strlen($content) > 7000) {
            $content = mb_substr($content, 0, 6950) . "\n\n[... truncado por limite de tamanho]";
        }

        return [
            'success'      => !empty(trim($content)),
            'content'      => trim($content),
            'modname'      => $modname,
            'activityname' => $activityname,
        ];
    }

    public static function get_activity_content_returns(): \external_single_structure {
        return new \external_single_structure([
            'success'      => new \external_value(PARAM_BOOL, 'Whether content was extracted'),
            'content'      => new \external_value(PARAM_RAW,  'Extracted text content'),
            'modname'      => new \external_value(PARAM_ALPHANUMEXT, 'Module name'),
            'activityname' => new \external_value(PARAM_RAW, 'Activity name'),
        ]);
    }

}
