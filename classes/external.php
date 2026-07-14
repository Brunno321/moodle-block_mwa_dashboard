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
        ]);
    }

    public static function send_message(int $courseid, int $userid, string $subject,
                                        string $message, string $intervention_reason = '',
                                        int $ai_generated = 0, string $send_type = 'moodle',
                                        string $student_email = ''): array {
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
        ]);

        $ctx = \context_course::instance($params['courseid']);
        self::validate_context($ctx);
        require_capability('block/mwa_dashboard:view', $ctx);

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

        $sender = $DB->get_record('user', ['id' => $USER->id], '*', MUST_EXIST);

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
                    strip_tags($params['message']),
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
                $eventdata->fullmessage       = strip_tags($params['message']);
                $eventdata->fullmessageformat = FORMAT_HTML;
                $eventdata->fullmessagehtml   = $params['message'];
                $eventdata->smallmessage      = $params['subject'];
                $eventdata->notification      = 0;
                $eventdata->courseid          = $params['courseid'];

                $msgid = message_send($eventdata);
                if (!$msgid) $status = 'error';
            } catch (\Exception $e) {
                $status = 'error';
            }
        }

        // Grava o registro no banco independente do canal usado
        $record = new \stdClass();
        $record->courseid            = $params['courseid'];
        $record->userid              = $recipient ? $recipient->id : 0;
        $record->teacherid           = $USER->id;
        $record->subject             = $params['subject'];
        $record->message             = $params['message'];
        $record->timesent            = time();
        $record->status              = $status;
        $record->ai_generated        = $params['ai_generated'];
        $channel = ($params['send_type'] === 'email') ? ' [email]' : ' [moodle]';
        $reason  = substr($params['intervention_reason'] . $channel, 0, 100);
        $record->intervention_reason = $reason;
        $record->moodle_msgid        = $msgid;

        $recid = $DB->insert_record('block_mwa_dashboard_messages', $record);

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

        $rows = $DB->get_records_sql(
            "SELECT m.id, m.courseid, m.userid, m.teacherid, m.subject, m.message,
                    m.timesent, m.status, m.ai_generated, m.intervention_reason, m.moodle_msgid,
                    u.firstname AS student_firstname, u.lastname AS student_lastname, u.email AS student_email,
                    t.firstname AS teacher_firstname, t.lastname AS teacher_lastname
               FROM {block_mwa_dashboard_messages} m
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
                'teacher_name'        => trim($r->teacher_firstname . ' ' . $r->teacher_lastname),
                'subject'             => $r->subject,
                'message'             => $r->message,
                'timesent'            => (int)$r->timesent,
                'status'              => $r->status,
                'ai_generated'        => (int)$r->ai_generated,
                'intervention_reason' => $r->intervention_reason ?? '',
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

        // Only allow deletion of own record (or admin)
        if ($record->teacherid != $USER->id && !has_capability('moodle/site:config', \context_system::instance())) {
            return ['success' => false];
        }

        $DB->delete_records('block_mwa_dashboard_messages', ['id' => $params['id']]);
        return ['success' => true];
    }

    public static function delete_intervention_returns() {
        return new \external_single_structure([
            'success' => new \external_value(PARAM_BOOL, 'Whether deletion succeeded'),
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
        $params = self::validate_parameters(self::get_ai_recommendation_parameters(), [
            'courseid'     => $courseid,
            'student_name' => $student_name,
            'prompt'       => $prompt,
        ]);

        $context = \context_course::instance($params['courseid']);
        self::validate_context($context);

        $iaurl = get_config('block_mwa_dashboard', 'ia_endpoint');
        if (empty($iaurl)) {
            return ['success' => false, 'recommendation' => 'AI not configured. Set ia_endpoint in the block settings.'];
        }

        // Payload no formato que o Node.js espera: array de objetos com 'instrucao'
        $payload = json_encode([[
            'nomecompleto' => $params['student_name'] ?: 'Turma',
            'instrucao'    => $params['prompt'],
            'contexto'     => 'Dashboard MWA',
        ]]);

        $apikey  = get_config('block_mwa_dashboard', 'ia_apikey');
        $timeout = (int)(get_config('block_mwa_dashboard', 'ia_timeout') ?: 90);

        $curl = new \curl();
        $curl->setopt(['CURLOPT_TIMEOUT' => $timeout, 'CURLOPT_RETURNTRANSFER' => true]);
        $headers = ['Content-Type: application/json'];
        if (!empty($apikey)) {
            $headers[] = 'X-API-Key: ' . $apikey;
        }
        $response = $curl->post(rtrim($iaurl, '/') . '/ia', $payload, [
            'CURLOPT_HTTPHEADER' => $headers,
        ]);

        if ($curl->get_errno()) {
            return ['success' => false, 'recommendation' => 'Connection error com a IA: ' . $curl->error];
        }

        $data = json_decode($response, true);
        $text = $data['resposta'] ?? $data['response'] ?? $data['content'] ?? '';

        return ['success' => !empty($text), 'recommendation' => $text ?: 'Sem resposta da IA.'];
    }

    public static function get_ai_recommendation_returns(): \external_single_structure {
        return new \external_single_structure([
            'success'        => new \external_value(PARAM_BOOL, 'Success'),
            'recommendation' => new \external_value(PARAM_RAW,  'AI recommendation text'),
        ]);
    }

    // ────────────────────────────────────────────────────────────
    // chat_message — conversa com contexto da turma
    // ────────────────────────────────────────────────────────────

    public static function chat_message_parameters(): \external_function_parameters {
        return new \external_function_parameters([
            'courseid'  => new \external_value(PARAM_INT,  'Course ID'),
            'messages'  => new \external_value(PARAM_RAW,  'JSON: array of {role,content}'),
            'context'   => new \external_value(PARAM_RAW,  'JSON: course context summary', VALUE_DEFAULT, '{}'),
        ]);
    }

    public static function chat_message(int $courseid, string $messages, string $context = '{}'): array {
        $params = self::validate_parameters(self::chat_message_parameters(), [
            'courseid' => $courseid,
            'messages' => $messages,
            'context'  => $context,
        ]);

        $ctx = \context_course::instance($params['courseid']);
        self::validate_context($ctx);

        $iaurl = get_config('block_mwa_dashboard', 'ia_endpoint');
        if (empty($iaurl)) {
            return ['success' => false, 'reply' => 'AI not configured. Set ia_endpoint in the block settings.'];
        }

        $msg_list = json_decode($params['messages'], true) ?? [];
        $ctx_data = json_decode($params['context'],  true) ?? [];

        $payload = json_encode(['messages' => $msg_list, 'context' => $ctx_data]);

        $apikey  = get_config('block_mwa_dashboard', 'ia_apikey');
        $timeout = (int)(get_config('block_mwa_dashboard', 'ia_timeout') ?: 90);
        $headers = ['Content-Type: application/json'];
        if (!empty($apikey)) {
            $headers[] = 'X-API-Key: ' . $apikey;
        }
        $curl = new \curl();
        $curl->setopt(['CURLOPT_TIMEOUT' => $timeout, 'CURLOPT_RETURNTRANSFER' => true]);
        $response = $curl->post(rtrim($iaurl, '/') . '/chat', $payload, [
            'CURLOPT_HTTPHEADER' => $headers,
        ]);

        if ($curl->get_errno()) {
            return ['success' => false, 'reply' => 'Connection error: ' . $curl->error];
        }

        $data  = json_decode($response, true);
        $reply = trim($data['resposta'] ?? $data['response'] ?? $data['content'] ?? '');

        return ['success' => !empty($reply), 'reply' => $reply ?: 'Sem resposta da IA.'];
    }

    public static function chat_message_returns(): \external_single_structure {
        return new \external_single_structure([
            'success' => new \external_value(PARAM_BOOL, 'Success'),
            'reply'   => new \external_value(PARAM_RAW,  'AI reply text'),
        ]);
    }
}
