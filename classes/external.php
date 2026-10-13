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

    /** Validate a dashboard group against Moodle's course group rules. */
    private static function validate_group_scope(int $courseid, int $groupid, \context_course $context): ?array {
        global $CFG, $USER;
        require_once($CFG->dirroot . '/group/lib.php');
        $course = get_course($courseid);
        $mode = groups_get_course_groupmode($course);
        $accessall = has_capability('moodle/site:accessallgroups', $context);
        if ($groupid > 0) {
            $group = groups_get_group($groupid, 'id,courseid', MUST_EXIST);
            if ((int)$group->courseid !== $courseid) {
                throw new \invalid_parameter_exception('The selected group does not belong to this course.');
            }
            if ($mode == SEPARATEGROUPS && !$accessall && !groups_is_member($groupid, $USER->id)) {
                throw new \required_capability_exception($context, 'moodle/site:accessallgroups', 'nopermissions', '');
            }
            return [$groupid];
        }
        if ($mode != SEPARATEGROUPS || $accessall) {
            return null;
        }
        $groups = groups_get_user_groups($courseid, $USER->id);
        return array_values(array_map('intval', $groups[0] ?? []));
    }

    /** Check whether a user is included in an authorized group scope. */
    private static function user_in_group_scope(int $userid, ?array $groupscope): bool {
        global $DB;
        if ($groupscope === null) {
            return true;
        }
        if (!$groupscope) {
            return false;
        }
        [$groupsql, $groupparams] = $DB->get_in_or_equal($groupscope, SQL_PARAMS_NAMED, 'scopegroup');
        return $DB->record_exists_select('groups_members', "userid = :scopeuserid AND groupid $groupsql",
            ['scopeuserid' => $userid] + $groupparams);
    }

    /**
     * Store a private Moodle chat message without invoking notification/email processors.
     *
     * @param \stdClass $sender Sender user record.
     * @param \stdClass $recipient Recipient user record.
     * @param string $subject Message subject.
     * @param string $htmlmessage Message body.
     * @param array $chatmessage Formatted Moodle chat body with plain and HTML variants.
     * @return int Created Moodle message id.
     */
    private static function send_moodle_chat_only(\stdClass $sender, \stdClass $recipient,
                                                  string $subject, string $htmlmessage,
                                                  array $chatmessage): int {
        global $DB, $CFG;

        require_once($CFG->dirroot . '/message/lib.php');

        $now = time();
        $conversationid = 0;
        if (class_exists('\core_message\api') &&
                method_exists('\core_message\api', 'get_conversation_between_users') &&
                method_exists('\core_message\api', 'create_conversation')) {
            $conversation = \core_message\api::get_conversation_between_users([(int)$sender->id, (int)$recipient->id]);
            if (empty($conversation) || empty($conversation->id)) {
                $conversation = \core_message\api::create_conversation(
                    \core_message\api::MESSAGE_CONVERSATION_TYPE_INDIVIDUAL,
                    [(int)$sender->id, (int)$recipient->id]
                );
            }
            $conversationid = (int)($conversation->id ?? 0);
        }

        if (!$conversationid) {
            $conversationid = (int)$DB->get_field_sql(
                "SELECT c.id
                   FROM {message_conversations} c
                   JOIN {message_conversation_members} m1 ON m1.conversationid = c.id AND m1.userid = :senderid
                   JOIN {message_conversation_members} m2 ON m2.conversationid = c.id AND m2.userid = :recipientid
                  WHERE c.type = :type
               ORDER BY c.timemodified DESC",
                [
                    'senderid' => (int)$sender->id,
                    'recipientid' => (int)$recipient->id,
                    'type' => 1,
                ],
                IGNORE_MULTIPLE
            );
        }

        if (!$conversationid) {
            $conversation = (object)[
                'type' => 1,
                'enabled' => 1,
                'timecreated' => $now,
                'timemodified' => $now,
            ];
            $conversationid = (int)$DB->insert_record('message_conversations', $conversation);
        }

        foreach ([(int)$sender->id, (int)$recipient->id] as $memberid) {
            if (!$DB->record_exists('message_conversation_members',
                    ['conversationid' => $conversationid, 'userid' => $memberid])) {
                $DB->insert_record('message_conversation_members', (object)[
                    'conversationid' => $conversationid,
                    'userid' => $memberid,
                    'timecreated' => $now,
                ]);
            }
        }

        $plainmessage = trim((string)($chatmessage['plain'] ?? ''));
        $htmlbody = trim((string)($chatmessage['html'] ?? ''));
        if ($plainmessage === '') {
            $plainmessage = trim(html_to_text($htmlmessage, 0, false));
        }
        if ($htmlbody === '') {
            $htmlbody = nl2br(s($plainmessage !== '' ? $plainmessage : $htmlmessage));
        }
        $message = (object)[
            'useridfrom' => (int)$sender->id,
            'conversationid' => $conversationid,
            'subject' => $subject,
            'fullmessage' => $htmlbody,
            'fullmessageformat' => FORMAT_HTML,
            'fullmessagehtml' => $htmlbody,
            'smallmessage' => $htmlbody,
            'timecreated' => $now,
            'fullmessagetrust' => 0,
        ];
        $messageid = (int)$DB->insert_record('messages', $message);
        $DB->set_field('message_conversations', 'timemodified', $now, ['id' => $conversationid]);

        return $messageid;
    }

    /**
     * Convert the intervention HTML into a readable private Moodle chat message.
     *
     * @param string $htmlmessage Original intervention message HTML.
     * @param array $targets Tracked items with name and URL.
     * @return array Plain and HTML chat text.
     */
    private static function format_moodle_chat_message(string $htmlmessage, array $targets): array {
        $bodyhtml = preg_replace('~<div\s+class=["\']mwa-message-targets["\'][^>]*>.*?</div>~is', '', $htmlmessage);
        $text = trim(html_to_text($bodyhtml ?? $htmlmessage, 0, false));
        $text = str_replace("\xc2\xa0", ' ', $text);
        $text = preg_replace("/\r\n|\r/", "\n", $text);
        $text = preg_replace('/[ \t]+\n/u', "\n", $text);
        $text = preg_replace('/\n[ \t]+/u', "\n", $text);
        $text = preg_replace('/[ \t]{2,}/u', ' ', $text);
        $text = preg_replace('/\n{3,}/u', "\n\n", trim($text));

        $lines = preg_split('/\n{2,}/u', $text);
        $html = '';
        foreach ($lines as $line) {
            $line = trim((string)$line);
            if ($line !== '') {
                $html .= \html_writer::tag('p', s($line));
            }
        }

        $seen = [];
        $items = [];
        foreach ($targets as $target) {
            if (!is_array($target)) {
                continue;
            }
            $name = trim(strip_tags((string)($target['name'] ?? '')));
            $url = clean_param((string)($target['url'] ?? ''), PARAM_URL);
            if ($name === '' || $url === '') {
                continue;
            }
            $key = \core_text::strtolower($name) . '|' . $url;
            if (isset($seen[$key])) {
                continue;
            }
            $seen[$key] = true;
            $items[] = ['name' => $name, 'url' => $url];
        }
        if ($items) {
            $text .= "\n\n" . get_string('tf_detail_targets', 'block_mwa_dashboard') . ":\n";
            $lis = '';
            foreach ($items as $item) {
                $text .= '- ' . $item['name'] . "\n";
                $lis .= \html_writer::tag('li',
                    \html_writer::link($item['url'], s($item['name']), ['target' => '_blank', 'rel' => 'noopener']));
            }
            $html .= \html_writer::tag('p', \html_writer::tag('strong', get_string('tf_detail_targets', 'block_mwa_dashboard')));
            $html .= \html_writer::tag('ul', $lis);
        }
        return ['plain' => trim($text), 'html' => $html];
    }

    // -- get_logs ---------------------------------------------------------

    public static function get_logs_parameters() {
        return new \external_function_parameters([
            'courseid' => new \external_value(PARAM_INT, 'Course ID'),
            'since'    => new \external_value(PARAM_INT, 'Unix timestamp - only logs after this', VALUE_DEFAULT, 0),
            'groupid'  => new \external_value(PARAM_INT, 'Course group ID, or 0 for all allowed groups', VALUE_DEFAULT, 0),
        ]);
    }

    public static function get_logs(int $courseid, int $since = 0, int $groupid = 0): array {
        $params = self::validate_parameters(self::get_logs_parameters(), compact('courseid', 'since', 'groupid'));
        debugging('block_mwa_dashboard get_logs request: ' . json_encode([
            'courseid' => (int)$params['courseid'], 'groupid' => (int)$params['groupid'],
            'since' => (int)$params['since'],
        ]), DEBUG_DEVELOPER);
        if ((int)$params['courseid'] <= 0) {
            throw new \invalid_parameter_exception('The courseid parameter must be a valid course id.');
        }
        $ctx    = \context_course::instance($params['courseid']);
        self::validate_context($ctx);
        require_capability('block/mwa_dashboard:view', $ctx);
        $groupscope = self::validate_group_scope($params['courseid'], $params['groupid'], $ctx);
        debugging('block_mwa_dashboard get_logs SQL scope: ' . json_encode([
            'courseid' => (int)$params['courseid'], 'groupids' => $groupscope,
            'since' => (int)$params['since'],
        ]), DEBUG_DEVELOPER);
        $logs = api::get_logs($params['courseid'], $params['since'], 0, $groupscope);
        return ['logs' => json_encode($logs), 'count' => count($logs)];
    }

    public static function get_logs_returns() {
        return new \external_single_structure([
            'logs'  => new \external_value(PARAM_RAW,  'JSON array of log records'),
            'count' => new \external_value(PARAM_INT,  'Number of records'),
        ]);
    }

    /** Return dashboard UI strings asynchronously, avoiding a large AMD init payload. */
    public static function get_dashboard_strings_parameters() {
        return new \external_function_parameters([
            'courseid' => new \external_value(PARAM_INT, 'Course ID'),
        ]);
    }

    public static function get_dashboard_strings(int $courseid): array {
        $params = self::validate_parameters(self::get_dashboard_strings_parameters(), compact('courseid'));
        if ($params['courseid'] <= 0) {
            throw new \invalid_parameter_exception('The courseid parameter must be a valid course id.');
        }
        $context = \context_course::instance($params['courseid']);
        self::validate_context($context);
        require_capability('block/mwa_dashboard:view', $context);
        $dashboard = new \block_mwa_dashboard\output\dashboard_page($params['courseid']);
        return [
            'strings' => json_encode($dashboard->get_strings(), JSON_UNESCAPED_UNICODE),
            'language' => current_language(),
            'timezone' => api::display_timezone(),
            'locale' => api::display_locale(),
            'reasonaliases' => json_encode(compatibility::reason_aliases(), JSON_UNESCAPED_UNICODE),
        ];
    }

    public static function get_dashboard_strings_returns() {
        return new \external_single_structure([
            'strings' => new \external_value(PARAM_RAW, 'Dashboard language strings'),
            'language' => new \external_value(PARAM_TEXT, 'Current language'),
            'timezone' => new \external_value(PARAM_TEXT, 'Display timezone'),
            'locale' => new \external_value(PARAM_TEXT, 'Display locale'),
            'reasonaliases' => new \external_value(PARAM_RAW, 'Historical reason identifiers'),
        ]);
    }

    // -- get_grades -------------------------------------------------------

    public static function get_grades_parameters() {
        return new \external_function_parameters([
            'courseid' => new \external_value(PARAM_INT, 'Course ID'),
            'groupid'  => new \external_value(PARAM_INT, 'Course group ID, or 0 for all allowed groups', VALUE_DEFAULT, 0),
        ]);
    }

    public static function get_grades(int $courseid, int $groupid = 0): array {
        $params = self::validate_parameters(self::get_grades_parameters(), compact('courseid', 'groupid'));
        debugging('block_mwa_dashboard get_grades request: ' . json_encode([
            'courseid' => (int)$params['courseid'], 'groupid' => (int)$params['groupid'],
        ]), DEBUG_DEVELOPER);
        if ((int)$params['courseid'] <= 0) {
            throw new \invalid_parameter_exception('The courseid parameter must be a valid course id.');
        }
        $ctx    = \context_course::instance($params['courseid']);
        self::validate_context($ctx);
        require_capability('block/mwa_dashboard:view', $ctx);

        $groupscope = self::validate_group_scope($params['courseid'], $params['groupid'], $ctx);
        debugging('block_mwa_dashboard get_grades SQL scope: ' . json_encode([
            'courseid' => (int)$params['courseid'], 'groupids' => $groupscope,
        ]), DEBUG_DEVELOPER);
        $grades = api::get_grades($params['courseid'], 0, $groupscope);
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
            'send_type'           => new \external_value(PARAM_ALPHA,   'moodle, email or both', VALUE_DEFAULT, 'moodle'),
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
                                        string $send_type = 'moodle',
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
        $groupscope = self::validate_group_scope((int)$params['courseid'], 0, $ctx);
        if (!self::user_in_group_scope((int)$recipient->id, $groupscope)) {
            throw new \required_capability_exception($ctx, 'moodle/site:accessallgroups', 'nopermissions', '');
        }

        $sender = $DB->get_record('user', ['id' => $USER->id], '*', MUST_EXIST);

        $cleanreason = trim($params['intervention_reason']);
        $reasoncode = compatibility::reason_code($cleanreason);
        $objectives = [
            'never' => get_string('snapshot_objective_never', 'block_mwa_dashboard'),
            'low' => get_string('snapshot_objective_low', 'block_mwa_dashboard'),
            'pending' => get_string('snapshot_objective_pending', 'block_mwa_dashboard'),
            'difficult' => get_string('snapshot_objective_difficult', 'block_mwa_dashboard'),
        ];
        $reasonlabels = ['never' => 'msg_reason_never', 'low' => 'msg_reason_low_participation',
            'pending' => 'msg_reason_academic_pending', 'difficult' => 'msg_reason_difficulty'];
        $situation = $reasoncode === 'other' ? trim($params['snapshot_situation']) :
            get_string($reasonlabels[$reasoncode], 'block_mwa_dashboard');
        $objective = trim($params['snapshot_objective']);
        if ($objective === '' && isset($objectives[$reasoncode])) {
            $objective = $objectives[$reasoncode];
        }
        if ($reasoncode === 'other' && ($situation === '' || $objective === '')) {
            return ['success' => false, 'status' => 'error_snapshot_fields_required', 'recordid' => 0];
        }

        $decodedtargets = json_decode($params['target_items'], true);
        $decodedtargets = is_array($decodedtargets) ? array_values($decodedtargets) : [];
        $targetlinks = [];
        $chattargets = [];
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
                $chattargets[] = ['name' => $targetname !== '' ? $targetname : $targeturl, 'url' => $targeturl];
            }
        }
        $plainhtml = preg_replace('~<div\s+class="mwa-message-targets"[^>]*>.*?</div>~is', '', $params['message']);
        $plainmessage = trim(html_to_text($plainhtml ?? $params['message'], 0, false));
        if ($targetlinks) {
            $plainmessage .= "\n\n" . get_string('tf_detail_targets', 'block_mwa_dashboard') . ":\n"
                . implode("\n", $targetlinks);
        }
        $chatmessage = self::format_moodle_chat_message($params['message'], $chattargets);

        $sendtype = in_array($params['send_type'], ['moodle', 'email', 'both'], true) ? $params['send_type'] : 'moodle';
        $sendmoodle = $sendtype === 'moodle' || $sendtype === 'both';
        $sendemail = $sendtype === 'email' || $sendtype === 'both';
        $msgid = null;
        $moodlesent = null;
        $emailsent = null;

        if (!$recipient) {
            return ['success' => false, 'status' => 'error_no_user', 'recordid' => 0];
        }

        if ($sendemail) {
            try {
                require_once($CFG->libdir . '/moodlelib.php');
                $emailsent = (bool)email_to_user(
                    $recipient,
                    $sender,
                    $params['subject'],
                    $plainmessage,
                    $params['message']
                );
            } catch (\Exception $e) {
                $emailsent = false;
            }
        }

        if ($sendmoodle) {
            try {
                $msgid = self::send_moodle_chat_only($sender, $recipient, $params['subject'],
                    $params['message'], $chatmessage);
                $moodlesent = !empty($msgid);
            } catch (\Exception $e) {
                $moodlesent = false;
            }
        }

        $status = (($sendmoodle ? $moodlesent : true) && ($sendemail ? $emailsent : true)) ? 'sent' : 'error';
        if ($status === 'sent') {
            $action = $sendtype === 'both'
                ? get_string('ext_action_sent_moodle', 'block_mwa_dashboard') . ' ' .
                    get_string('ext_action_sent_email', 'block_mwa_dashboard')
                : ($sendemail ? get_string('ext_action_sent_email', 'block_mwa_dashboard') :
                    get_string('ext_action_sent_moodle', 'block_mwa_dashboard'));
        } else {
            $action = $sendtype === 'both'
                ? get_string('ext_action_fail_moodle', 'block_mwa_dashboard') . ' ' .
                    get_string('ext_action_fail_email', 'block_mwa_dashboard')
                : ($sendemail ? get_string('ext_action_fail_email', 'block_mwa_dashboard') :
                    get_string('ext_action_fail_moodle', 'block_mwa_dashboard'));
        }

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
        $record->send_type            = $sendtype;
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
            'groupid' => new \external_value(PARAM_INT, 'Course group ID, or 0 for all allowed groups', VALUE_DEFAULT, 0),
        ]);
    }

    public static function get_interventions(int $courseid, int $groupid = 0): array {
        $params = self::validate_parameters(self::get_interventions_parameters(), compact('courseid', 'groupid'));
        debugging('block_mwa_dashboard get_interventions request: ' . json_encode([
            'courseid' => (int)$params['courseid'], 'groupid' => (int)$params['groupid'],
        ]), DEBUG_DEVELOPER);
        if ((int)$params['courseid'] <= 0) {
            throw new \invalid_parameter_exception('The courseid parameter must be a valid course id.');
        }
        $ctx    = \context_course::instance($params['courseid']);
        self::validate_context($ctx);
        require_capability('block/mwa_dashboard:view', $ctx);
        require_capability('block/mwa_dashboard:manageinterventions', $ctx);
        $groupscope = self::validate_group_scope($params['courseid'], $params['groupid'], $ctx);
        debugging('block_mwa_dashboard get_interventions SQL scope: ' . json_encode([
            'courseid' => (int)$params['courseid'], 'groupids' => $groupscope,
        ]), DEBUG_DEVELOPER);
        $rows = api::get_interventions($params['courseid'], 0, 0, $groupscope);

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
                'intervention_reason' => $r->intervention_reason ?? '',
                '_reason_code' => compatibility::reason_code($r->intervention_reason ?? ''),
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
            'groupid' => new \external_value(PARAM_INT, 'Course group ID, or 0 for all allowed groups', VALUE_DEFAULT, 0),
        ]);
    }

    /** Return current indicators using the same calculation as the immutable snapshot. */
    public static function get_followup_indicators(int $courseid, string $userids, int $groupid = 0): array {
        global $DB;

        $params = self::validate_parameters(self::get_followup_indicators_parameters(),
            ['courseid' => $courseid, 'userids' => $userids, 'groupid' => $groupid]);
        $context = \context_course::instance($params['courseid']);
        self::validate_context($context);
        require_capability('block/mwa_dashboard:view', $context);
        $groupscope = self::validate_group_scope($params['courseid'], $params['groupid'], $context);

        $requested = json_decode($params['userids'], true);
        $requested = is_array($requested) ? array_values(array_unique(array_filter(array_map('intval', $requested)))) : [];
        if ($groupscope !== null && $requested) {
            $members = [];
            foreach ($groupscope as $allowedgroupid) {
                $members += array_flip(array_map('intval', array_keys(groups_get_members($allowedgroupid, 'u.id'))));
            }
            $requested = array_values(array_filter($requested, function(int $userid) use ($members): bool {
                return isset($members[$userid]);
            }));
        }
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
        $coursegrades = api::get_grades($params['courseid'], 0, $groupscope);
        $courselogs = api::get_logs($params['courseid'], 0, $groupscope);
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

        $groupscope = self::validate_group_scope((int)$record->courseid, 0, $ctx);
        if (!self::user_in_group_scope((int)$record->userid, $groupscope)) {
            return ['success' => false];
        }

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

        $groupscope = self::validate_group_scope((int)$record->courseid, 0, $ctx);
        if (!self::user_in_group_scope((int)$record->userid, $groupscope)) {
            return ['success' => false, 'note' => '', 'timemodified' => 0];
        }

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

    public static function set_activity_tracking_parameters(): \external_function_parameters {
        return new \external_function_parameters([
            'courseid' => new \external_value(PARAM_INT, 'Course ID'),
            'cmid' => new \external_value(PARAM_INT, 'Course module ID'),
            'tracked' => new \external_value(PARAM_BOOL, 'Whether the item is included in dashboard tracking'),
        ]);
    }

    public static function set_activity_tracking(int $courseid, int $cmid, bool $tracked): array {
        global $DB;
        $params = self::validate_parameters(
            self::set_activity_tracking_parameters(),
            compact('courseid', 'cmid', 'tracked')
        );
        $context = \context_course::instance($params['courseid']);
        self::validate_context($context);
        require_capability('block/mwa_dashboard:managecapture', $context);

        $module = $DB->get_record('course_modules', [
            'id' => $params['cmid'],
            'course' => $params['courseid'],
            'deletioninprogress' => 0,
        ], 'id', MUST_EXIST);
        $record = $DB->get_record('block_mwa_dashboard_course', ['courseid' => $params['courseid']]);
        $excluded = $record ? json_decode((string)$record->excludedcmids, true) : [];
        $excluded = is_array($excluded) ? array_flip(array_map('intval', $excluded)) : [];
        if ($params['tracked']) {
            unset($excluded[(int)$module->id]);
        } else {
            $excluded[(int)$module->id] = true;
        }
        $excludedcmids = array_map('intval', array_keys($excluded));
        sort($excludedcmids);

        if ($record) {
            $record->excludedcmids = json_encode($excludedcmids);
            $record->timemodified = time();
            $DB->update_record('block_mwa_dashboard_course', $record);
        } else {
            $DB->insert_record('block_mwa_dashboard_course', (object)[
                'courseid' => $params['courseid'],
                'enabled' => 0,
                'excludedcmids' => json_encode($excludedcmids),
                'timemodified' => time(),
            ]);
        }
        return ['tracked' => (bool)$params['tracked']];
    }

    public static function set_activity_tracking_returns(): \external_single_structure {
        return new \external_single_structure([
            'tracked' => new \external_value(PARAM_BOOL, 'Current tracking state'),
        ]);
    }

    // Per-teacher visual visibility. This never changes tracking or calculations.
    private static function hidden_activities_preference_name(int $courseid): string {
        return 'block_mwa_dashboard_hidden_' . $courseid;
    }

    public static function get_hidden_activities_parameters(): \external_function_parameters {
        return new \external_function_parameters(['courseid' => new \external_value(PARAM_INT, 'Course ID')]);
    }

    public static function get_hidden_activities(int $courseid): array {
        global $USER;
        $params = self::validate_parameters(self::get_hidden_activities_parameters(), ['courseid' => $courseid]);
        $context = \context_course::instance($params['courseid']);
        self::validate_context($context);
        require_capability('block/mwa_dashboard:managecapture', $context);
        $raw = get_user_preferences(self::hidden_activities_preference_name($params['courseid']), '[]', $USER->id);
        $cmids = json_decode((string)$raw, true);
        $cmids = is_array($cmids) ? array_values(array_unique(array_filter(array_map('intval', $cmids)))) : [];
        sort($cmids);
        return ['cmids' => $cmids];
    }

    public static function get_hidden_activities_returns(): \external_single_structure {
        return new \external_single_structure([
            'cmids' => new \external_multiple_structure(new \external_value(PARAM_INT, 'Course module ID')),
        ]);
    }

    public static function set_activity_hidden_parameters(): \external_function_parameters {
        return new \external_function_parameters([
            'courseid' => new \external_value(PARAM_INT, 'Course ID'),
            'cmid' => new \external_value(PARAM_INT, 'Course module ID'),
            'hidden' => new \external_value(PARAM_BOOL, 'Whether the item is visually hidden'),
        ]);
    }

    public static function set_activity_hidden(int $courseid, int $cmid, bool $hidden): array {
        global $DB, $USER;
        $params = self::validate_parameters(self::set_activity_hidden_parameters(), compact('courseid', 'cmid', 'hidden'));
        $context = \context_course::instance($params['courseid']);
        self::validate_context($context);
        require_capability('block/mwa_dashboard:managecapture', $context);
        $DB->get_record('course_modules', [
            'id' => $params['cmid'], 'course' => $params['courseid'], 'deletioninprogress' => 0,
        ], 'id', MUST_EXIST);
        $preference = self::hidden_activities_preference_name($params['courseid']);
        $current = json_decode((string)get_user_preferences($preference, '[]', $USER->id), true);
        $current = is_array($current) ? array_flip(array_map('intval', $current)) : [];
        if ($params['hidden']) {
            $current[$params['cmid']] = true;
        } else {
            unset($current[$params['cmid']]);
        }
        $cmids = array_map('intval', array_keys($current));
        sort($cmids);
        set_user_preference($preference, json_encode($cmids), $USER->id);
        return ['hidden' => (bool)$params['hidden'], 'cmids' => $cmids];
    }

    public static function set_activity_hidden_returns(): \external_single_structure {
        return new \external_single_structure([
            'hidden' => new \external_value(PARAM_BOOL, 'Current visual visibility state'),
            'cmids' => new \external_multiple_structure(new \external_value(PARAM_INT, 'Hidden course module ID')),
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

}
