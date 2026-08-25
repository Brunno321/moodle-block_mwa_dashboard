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
 * Renderable dashboard page for block_mwa_dashboard.
 *
 * @package    block_mwa_dashboard
 * @copyright  2026 Bruno Porto
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

namespace block_mwa_dashboard\output;

use renderable;
use renderer_base;
use templatable;

/**
 * Prepares all template data and page assets for the dashboard.
 */
class dashboard_page implements renderable, templatable {

    /** @var int Course id. */
    protected $courseid;

    /**
     * Constructor.
     *
     * @param int $courseid The Moodle course id.
     */
    public function __construct(int $courseid) {
        $this->courseid = $courseid;
    }

    /**
     * Register CSS dependencies through Moodle page requirements.
     *
     * @param \moodle_page $page The current Moodle page.
     */
    public function require_assets(\moodle_page $page): void {

        foreach (self::stylesheets() as $stylesheet) {
            $page->requires->css(new \moodle_url('/blocks/mwa_dashboard/styles/' . $stylesheet));
        }
    }

    /**
     * Export data for the Mustache template.
     *
     * @param renderer_base $output Renderer instance.
     * @return array Template context.
     */
    public function export_for_template(renderer_base $output): array {
        global $CFG;
        $groupconfig = $this->get_group_config();
        $plugininfo = \core_plugin_manager::instance()->get_plugin_info('block_mwa_dashboard');
        return [
            'courseid'           => (int)$this->courseid,
            'wwwroot'            => (string)$CFG->wwwroot,
            'selectstudentlabel' => get_string('msg_select_student', 'block_mwa_dashboard'),
            'deletelabel'        => get_string('chat_delete_conv', 'block_mwa_dashboard'),
            'showgroupfilter'    => count($groupconfig['groups']) > 1,
            'groups'             => $groupconfig['groups'],
            'pluginrelease'      => $plugininfo ? (string)$plugininfo->release : '4.2',
        ];
    }

    /**
     * Export data passed to the AMD initialiser.
     *
     * @return array
     */
    public function export_for_amd(): array {
        return [
            'courseid' => (int)$this->courseid,
            'config' => $this->get_config(),
            'strings' => $this->get_strings(),
        ];
    }

    /**
     * Get dashboard client configuration.
     *
     * @return array
     */
    protected function get_config(): array {
        global $CFG, $DB, $USER;

        $coursename = '';
        if ($this->courseid > 0) {
            $coursename = (string)$DB->get_field('course', 'fullname', ['id' => $this->courseid]);
        }

        $ia_provider = \block_mwa_dashboard\ai\client::provider();
        $context = \context_course::instance($this->courseid);
        $requestedpage = optional_param('mwa_page', '', PARAM_ALPHA);
        $allowedpages = [
            'ac', 'alerts', 'classlist', 'grades', 'activities', 'heatmap',
            'studentprofile', 'chat', 'interventions', 'teacherfeedback',
        ];
        $initialpage = in_array($requestedpage, $allowedpages, true) ? $requestedpage : 'ac';
        $groupconfig = $this->get_group_config();
        return [
            'courseid'    => (int)$this->courseid,
            'initialpage' => $initialpage,
            'wwwroot'     => (string)$CFG->wwwroot,
            'coursename'  => $coursename,
            'language'    => current_language(),
            'userfirstname' => isset($USER->firstname) ? (string)$USER->firstname : '',
            'activitylinks' => $this->get_activity_links(),
            'excludedcmids' => \block_mwa_dashboard\api::get_excluded_cmids($this->courseid),
            'canmanageactivitytracking' => has_capability('block/mwa_dashboard:managecapture', $context),
            'activitytrackingurl' => (new \moodle_url('/blocks/mwa_dashboard/track.php', [
                'courseid' => $this->courseid,
                'sesskey' => sesskey(),
            ]))->out(false),
            'ia_enabled'  => \block_mwa_dashboard\ai\client::is_configured(),
            'ia_provider' => (string)$ia_provider,
            'groupid' => (int)$groupconfig['groupid'],
            'groups' => $groupconfig['groups'],
        ];
    }

    /** Return groups visible to the current teacher and the active group. */
    protected function get_group_config(): array {
        global $CFG, $USER;
        require_once($CFG->dirroot . '/group/lib.php');
        $course = get_course($this->courseid);
        $context = \context_course::instance($this->courseid);
        $mode = groups_get_course_groupmode($course);
        if ($mode == NOGROUPS) {
            return ['groupid' => 0, 'groups' => []];
        }
        $accessall = has_capability('moodle/site:accessallgroups', $context);
        $canviewall = $accessall || $mode == VISIBLEGROUPS;
        $records = groups_get_all_groups($this->courseid, $canviewall ? 0 : $USER->id, 0, 'g.id,g.name');
        $groups = [];
        if ($canviewall) {
            $groups[] = ['id' => 0, 'name' => get_string('group_all', 'block_mwa_dashboard'), 'selected' => false];
        }
        foreach ($records as $record) {
            $groups[] = ['id' => (int)$record->id, 'name' => format_string($record->name), 'selected' => false];
        }
        $requested = optional_param('group', -1, PARAM_INT);
        $allowedids = array_map(function(array $group): int { return (int)$group['id']; }, $groups);
        $active = in_array($requested, $allowedids, true) ? $requested : ($groups ? (int)$groups[0]['id'] : 0);
        foreach ($groups as &$group) {
            $group['selected'] = (int)$group['id'] === $active;
        }
        unset($group);
        return ['groupid' => $active, 'groups' => $groups];
    }

    /**
     * Return current course module links from Moodle itself.
     *
     * @return array[]
     */
    protected function get_activity_links(): array {
        if ($this->courseid <= 0) {
            return [];
        }

        global $DB;
        $removing = $DB->get_fieldset_select(
            'course_modules',
            'id',
            'course = :courseid AND deletioninprogress = 1',
            ['courseid' => $this->courseid]
        );
        $removing = array_flip(array_map('intval', $removing));
        $links = [];
        $excluded = array_flip(\block_mwa_dashboard\api::get_excluded_cmids($this->courseid));
        $modulemetadata = \block_mwa_dashboard\api::get_course_module_metadata($this->courseid);
        $modinfo = get_fast_modinfo($this->courseid);
        foreach ($modinfo->get_cms() as $cm) {
            // Labels and Text and media areas are layout elements, not resources.
            if (isset($removing[(int)$cm->id]) ||
                    in_array((string)$cm->modname, ['label'], true) || empty($cm->url)) {
                continue;
            }
            $metadata = $modulemetadata[(int)$cm->id] ?? [];
            $links[] = [
                'name' => (string)$cm->name,
                'modname' => (string)$cm->modname,
                'cmid' => (int)$cm->id,
                'url' => $cm->url->out(false),
                'available' => (int)($metadata['available'] ?? !empty($cm->available)),
                'availablefrom' => (int)($metadata['availablefrom'] ?? 0),
                'availableuntil' => (int)($metadata['availableuntil'] ?? 0),
                'duedate' => (int)($metadata['duedate'] ?? 0),
                'tracked' => !isset($excluded[(int)$cm->id]),
            ];
        }
        return $links;
    }

    /**
     * Return dashboard stylesheets loaded from the plugin styles directory.
     *
     * @return string[]
     */
    protected static function stylesheets(): array {
        return [
            'dashboard.css',
            'actioncenter.css',
            'alerts.css',
            'classlist.css',
            'studentprofile.css',
            'activities.css',
            'grades.css',
            'heatmap.css',
            'chat.css',
            'interventions.css',
            'teacherfeedback.css',
            'kpi-polish.css',
            'filter-polish.css',
        ];
    }

    /**
     * Get translated dashboard strings for client-side rendering.
     *
     * @return array
     */
    public function get_strings(): array {
        $component = 'block_mwa_dashboard';
        $strings = [];
        foreach ($this->string_keys() as $key) {
            $value = get_string($key, $component);
            if ($value !== '' && strpos($value, '[[') === false) {
                $strings[$key] = $value;
            } else {
                $strings[$key] = ucfirst(str_replace('_', ' ', $key));
            }
        }
        return $strings;
    }

    /**
     * Return all client-side string identifiers used by the dashboard.
     *
     * @return string[]
     */
    protected function string_keys(): array {
        return [
            'accesses',
            'accesses_label',
            'actions_marked_seen',
            'active_students',
            'students_loaded',
            'active_course_students',
            'with_course_activity',
            'brand_name', 'brand_logo_alt', 'err_ajax_bridge', 'ev_trend_drop', 'ev_reason_drop', 'ev_interactions_title', 'ev_trend',
            'int_time_lt1min', 'int_time_min', 'int_time_hour', 'int_time_hours',
            'int_time_day', 'int_time_days', 'int_export_sheet_name',
            'activities_detected',
            'activities_subtitle',
            'activities_title',
            'activity',
            'activity_access',
            'alerts_label',
            'alerts_subtitle',
            'alerts_title',
            'analyse_activities',
            'analysis_label',
            'at_risk',
            'attention',
            'attention_desc',
            'average',
            'average_participation',
            'average_student',
            'brand_subtitle',
            'button_heatmap',
            'button_mark_seen',
            'button_view_prediction',
            'button_view_students',
            'class_list',
            'class_list_subtitle',
            'content_label',
            'could_not_parse',
            'coverage',
            'critical_alert_title',
            'dashboard_title',
            'data_load_failed',
            'day',
            'day_hour',
            'email',
            'engagement_desc',
            'engagement_groups',
            'engagement_index',
            'engagement_score',
            'event_distribution',
            'event_distribution_desc',
            'event_type_assignment',
            'event_type_forum',
            'event_type_page',
            'event_type_quiz',
            'event_type_book',
            'event_type_file',
            'event_type_folder',
            'event_type_url',
            'event_type_glossary',
            'event_type_database',
            'event_type_chat',
            'event_type_lesson',
            'event_type_scorm',
            'event_type_h5p',
            'event_type_imscp',
            'event_type_wiki',
            'event_type_choice',
            'event_type_feedback',
            'event_type_survey',
            'event_type_questionnaire',
            'event_type_game',
            'event_type_workshop',
            'event_type_attendance',
            'event_type_board',
            'event_type_journal',
            'event_type_vpl',
            'event_type_webconf',
            'feature_coming_soon',
            'feature_placeholder',
            'fri',
            'good_engagement',
            'grade',
            'grade_analysis',
            'grade_average',
            'gradebook_title',
            'group_filter_label', 'group_all',
            'grades_label',
            'grades_subtitle',
            'heatmap_subtitle',
            'heatmap_title',
            'high',
            'high_participation',
            'immediate_intervention',
            'interactions',
            'legend_average',
            'legend_high',
            'legend_low',
            'loading_title',
            'loading_waiting',
            'low',
            'low_participation',
            'mon',
            'monitor_preventive',
            'moodle_events',
            'nav_access_heatmap',
            'nav_action_center',
            'nav_activities',
            'nav_ai',
            'nav_alerts',
            'nav_analysis',
            'nav_chat',
            'nav_class_list',
            'nav_contact_report',
            'nav_content',
            'nav_content_analysis',
            'nav_engagement',
            'nav_grades',
            'nav_personalised_plan',
            'nav_report',
            'nav_student_profile',
            'nav_students',
            'nav_today',
            'no_critical_students',
            'no_data',
            'no_email',
            'sidebar_collapse',
            'sidebar_expand',
            // ── Message modal & interventions ──
            'msg_reason_select', 'msg_reason_never', 'msg_reason_low_participation',
            'msg_reason_academic_pending', 'msg_reason_difficulty', 'msg_reason_low_eng', 'msg_reason_risk', 'msg_reason_inactive',
            'msg_reason_task', 'msg_reason_reeng', 'msg_reason_praise', 'msg_reason_other',
            'msg_reason_label', 'msg_type_moodle_hint', 'msg_type_email_hint',
            'msg_no_email', 'msg_no_registered_email', 'msg_conn_error', 'msg_delete_confirm', 'msg_deleted',
            'msg_delete_error', 'msg_required_subject_body', 'msg_sending',
            'msg_channel_email', 'msg_channel_moodle', 'msg_sent_success',
            'msg_send_error', 'msg_unknown_status', 'msg_select_student_required',
            'msg_modal_title', 'msg_send_type_label', 'msg_type_moodle_btn', 'msg_type_email_btn',
            'msg_subject_label', 'msg_subject_placeholder', 'msg_body_label', 'msg_templates_label',
            'msg_body_placeholder', 'msg_ai_soon', 'msg_ai_generate', 'msg_ai_done', 'msg_cancel', 'msg_close', 'msg_send_btn',
            'msg_send_all_btn', 'msg_bulk_sent_success', 'msg_bulk_error_suffix', 'msg_detail_reason',
            'msg_send_selected_btn', 'msg_recipients_label', 'msg_recipients_all',
            'msg_recipients_select_all', 'msg_recipients_required', 'msg_target_items_label',
            'msg_target_items_intro', 'msg_no_open_pending_items', 'msg_target_activity',
            'msg_target_resource', 'int_result_accessed', 'int_result_delivered',
            'int_result_pending', 'ac_concluded',
            'int_motivo_never_desc', 'int_motivo_low_desc', 'int_motivo_pending_desc',
            'int_motivo_difficult_desc', 'int_motivo_other_desc', 'int_motivo_of_total',
            'int_status_awaiting', 'int_status_returned', 'int_status_tracking', 'int_status_evolved',
            'snapshot_title', 'snapshot_short_title', 'snapshot_open', 'snapshot_close', 'snapshot_engagement_at_time',
            'snapshot_grade_at_time', 'snapshot_grade_points',
            'int_current_engagement', 'int_current_engagement_sub', 'snapshot_situation_label', 'snapshot_situation_placeholder',
            'snapshot_action_label', 'snapshot_objective_label', 'snapshot_other_required',
            'snapshot_recorded_at', 'snapshot_historical_notice', 'snapshot_first_access',
            'snapshot_days_enrolled', 'snapshot_activities_done', 'snapshot_resources_accessed',
            'snapshot_completion', 'snapshot_last_access', 'snapshot_engagement', 'snapshot_active_days_7',
            'snapshot_interactions', 'snapshot_regularity', 'snapshot_pending', 'snapshot_overdue',
            'snapshot_oldest_pending', 'snapshot_average_grade', 'snapshot_last_assessment',
            'snapshot_below_reference', 'snapshot_attempts', 'snapshot_assessed_done',
            'snapshot_grade_trend', 'snapshot_yes', 'snapshot_no', 'snapshot_days_ago',
            'snapshot_days', 'snapshot_at', 'snapshot_objective_never', 'snapshot_objective_low',
            'snapshot_objective_pending', 'snapshot_objective_difficult',
            'int_no_effect', 'int_timeline_msg_sent', 'int_timeline_submit', 'int_timeline_access', 'int_timeline_reason',
            // ── Reports tab ──
            'nav_reports', 'rp_page_title', 'rp_page_subtitle', 'rp_no_data', 'rp_no_data_period',
            'rp_intervention_on', 'rp_recovery_label', 'rp_eng_before', 'rp_eng_after',
            'rp_active_days', 'rp_before', 'rp_after', 'rp_risk_label',
            'rp_risk_reduced', 'rp_risk_increased', 'rp_risk_stable',
            'rp_kpi_recovery_idx', 'rp_kpi_scale', 'rp_kpi_recovered', 'rp_kpi_of_interventions',
            'rp_kpi_avg_engagement', 'rp_kpi_before_after', 'rp_kpi_risk',
            'rp_period_label', 'rp_days', 'rp_interventions_data',
            'rp_section_recovery', 'rp_section_window', 'rp_section_chart',
            'rp_chart_label', 'rp_chart_intervention',
            'tf_nav', 'tf_page_title', 'tf_page_subtitle', 'tf_no_data', 'tf_loading',
            'tf_kpi_return', 'tf_kpi_engagement', 'tf_kpi_grade', 'tf_kpi_risk', 'tf_kpi_worse',
            'tf_students_returned', 'tf_students_improved', 'tf_grade_events', 'tf_need_followup',
            'tf_cold_after_contact', 'tf_chart_timeline', 'tf_chart_bars', 'tf_chart_donut',
            'tf_avg_engagement', 'tf_advanced', 'tf_same', 'tf_worse', 'tf_partial',
            'tf_card_advanced', 'tf_card_followup', 'tf_card_effective', 'tf_card_summary',
            'tf_summary_text', 'tf_none', 'tf_returned_short', 'tf_deliveries_short',
            'tf_grade_short', 'tf_no_progress_short', 'tf_no_reason_data',
            'tf_interventions_short', 'tf_risk_short', 'tf_returned_single', 'tf_returned_plural',
            'tf_filter_period', 'tf_filter_all_periods', 'tf_filter_7d', 'tf_filter_30d', 'tf_filter_90d',
            'tf_filter_reason', 'tf_filter_all_reasons', 'tf_filter_status', 'tf_filter_all_statuses',
            'tf_filter_status_advanced', 'tf_filter_status_partial', 'tf_filter_status_pending',
            'tf_filter_student', 'tf_filter_student_placeholder', 'tf_filter_empty',
            'tf_filter_count_prefix', 'tf_filter_count_suffix', 'tf_detail_interventions',
            'tf_detail_accessed_after', 'tf_detail_delivered', 'tf_detail_grade',
            'tf_detail_reaction_time', 'tf_detail_targets', 'tf_detail_targets_pending',
            'tf_legend_pending', 'tf_legend_done', 'tf_yes', 'tf_no',
            'tf_tip_kpi_interventions', 'tf_tip_kpi_return', 'tf_tip_kpi_engagement',
            'tf_tip_kpi_grade', 'tf_tip_kpi_risk', 'tf_tip_chart_timeline',
            'tf_tip_chart_bars', 'tf_tip_card_advanced', 'tf_tip_card_followup',
            'tf_tip_card_effective', 'tf_tip_card_summary',
            'tf_improved_engagement_short', 'tf_improved_grade_short', 'tf_intervention_single',
            'tf_kpi_interventions_total', 'tf_messages_sent', 'tf_pending_after_contact',
            'tf_pending_unique_students', 'tf_show_all', 'tf_still_risk_short',
            'tf_summary_delivered_metric', 'tf_summary_grade_metric', 'tf_summary_impact_delivered',
            'tf_summary_impact_grade', 'tf_summary_impact_returned', 'tf_summary_impact_title',
            'tf_summary_next_monitor', 'tf_summary_next_pending', 'tf_summary_next_title',
            'tf_summary_no_pending_text', 'tf_summary_note', 'tf_summary_pending_metric',
            'tf_summary_pending_prefix', 'tf_summary_pending_suffix', 'tf_summary_pending_title',
            'tf_summary_reading_middle', 'tf_summary_reading_prefix', 'tf_summary_reading_title',
            'tf_summary_returned_metric', 'tf_summary_returned_metric_single', 'tf_summary_delivered_metric_single', 'tf_summary_grade_metric_single', 'tf_summary_pending_metric_single', 'tf_summary_unique_students_suffix', 'tf_unique_students',
            'tpl_never_subject', 'tpl_never_body', 'tpl_eng_subject', 'tpl_eng_body', 'tpl_inactive_subject', 'tpl_inactive_body',
            'tpl_task_subject', 'tpl_task_body', 'tpl_difficulty_subject', 'tpl_difficulty_body',
            'tpl_other_subject', 'tpl_other_body', 'tpl_praise_subject', 'tpl_praise_body',
            'no_grade_data',
            'no_grade_data_available',
            'no_high_engagement',
            'no_priority_students',
            'no_risk_patterns',
            'no_urgent_action',
            'of_100_points',
            'open',
            'opportunity',
            'opportunity_desc',
            'other',
            'overview_actions_prefix',
            'overview_actions_suffix',
            'overview_subtitle',
            'placeholder_chat',
            'placeholder_content_analysis',
            'placeholder_engagement',
            'placeholder_personalised',
            'placeholder_student_profile',
            'priority_students',
            'action_center_title',
            'action_center_subtitle',
            'action_greeting_morning',
            'action_greeting_afternoon',
            'action_greeting_evening',
            'action_welcome_message',
            'teacher_label',
            'ac_tip_students_in_log',
            'ac_tip_active_course_students',
            'ac_tip_total_interactions',
            'ac_tip_average_student',
            'ac_tip_at_risk',
            'ac_tip_grade_average',
            'ac_tip_card_urgent',
            'ac_tip_card_attention',
            'ac_tip_card_opportunity',
            'ac_summary_never',
            'ac_summary_inactive',
            'ac_summary_low',
            'ac_more_activities',
            'ac_summary_low_delivery',
            'ac_summary_no_access_activities',
            'ac_summary_low_reach_activities',
            'ac_review',
            'ac_never_desc',
            'ac_no_never_students',
            'ac_never_insight',
            'ac_tip_card_never',
            'ac_tip_retention_curve',
            'ac_tip_engagement_index',
            'ac_tip_event_distribution',
            'ac_tip_students_attention',
            'ac_tip_ai_prediction',
            'weekly_retention_curve',
            'unique_active_students_week',
            'students_need_attention',
            'ordered_by_urgency',
            'select_all',
            'bulk_email',
            'ai_prediction_explanation',
            'ai_click_open_hint',
            'ai_student_risk_summary',
            'this_week',
            'one_week_ago',
            'weeks_ago',
            'bulk_email_placeholder',
            'risk_critical',
            'ai_risk',
            'last_access',
            'no_recent_access',
            'alert_never_accessed_label',
            'alert_never_accessed_sub',
            'alert_view_never_accessed',
            // ── Action Center: retention drill-down ──
            'ret_drill_active_students',
            'ret_drill_active_student',
            'ret_one_week_ago',
            'ret_weeks_ago',
            'ret_drill_retention',
            'ret_drill_left',
            'ret_drill_came',
            'ret_drill_stayed',
            'ret_tooltip_returned',
            'ret_tooltip_returned_one',
            'ret_tooltip_returned_many',
            'ret_tooltip_left',
            'ret_tooltip_left_one',
            'ret_tooltip_left_many',
            'ret_tooltip_stable',
            'ret_unique_students',
            // ── Action Center: AI prediction panel ──
            'ai_why_at_risk',
            'ai_weight',
            'ai_analysis_makes_sense',
            'ai_feedback_correct',
            'ai_student_ok',
            'ai_feedback_hint',
            'ai_generate_email',
            'ai_factor_no_access',
            'ai_factor_no_access_pl',
            'ai_factor_never_access',
            'ai_factor_recent_access',
            'ai_factor_partial_grade',
            'ai_factor_low_coverage',
            'ai_factor_completion',
            'ai_factor_grade_progress',
            'ai_factor_symbolic',
            'ai_factor_low_engagement',
            'ac_ctx_btn_welcome',
            'ac_ctx_btn_activity',
            'ac_ctx_btn_material',
            'ac_ctx_btn_study',
            'ac_ctx_no_specific_items',
            'ac_ctx_no_pending_activity',
            'ac_ctx_no_pending_material',
            'ac_ctx_no_pending_grade',
            'ac_ctx_welcome_subject',
            'ac_ctx_welcome_body',
            'ac_ctx_activity_subject',
            'ac_ctx_activity_body',
            'ac_ctx_material_subject',
            'ac_ctx_material_body',
            'ac_ctx_study_subject',
            'ac_ctx_study_body',
            'ac_ctx_act_pending_subject',
            'ac_ctx_act_pending_body',
            'ac_ctx_act_no_access_subject',
            'ac_ctx_act_no_access_body',
            'due_date',
            // ── Alerts tab ──
            'alerts_page_title',
            'alerts_page_subtitle',
            'alerts_no_data',
            'alert_kpi_viu_label',
            'alert_kpi_viu_delta',
            'alert_kpi_viu_tip',
            'alert_kpi_queda_label',
            'alert_kpi_queda_delta',
            'alert_kpi_queda_tip',
            'alert_kpi_fantasma_label',
            'alert_kpi_fantasma_delta',
            'alert_kpi_fantasma_tip',
            'alert_kpi_simbol_label',
            'alert_kpi_simbol_delta',
            'alert_kpi_simbol_tip',
            'alert_kpi_reat_label',
            'alert_kpi_reat_delta',
            'alert_kpi_reat_tip',
            'alert_kpi_never_label',
            'alert_kpi_never_delta',
            'alert_kpi_never_tip',
            'alert_kpi_madru_label',
            'alert_kpi_madru_delta',
            'alert_kpi_madru_tip',
            'alert_block_viu_title',
            'alert_block_viu_desc',
            'alert_block_viu_tip',
            'alert_block_queda_title',
            'alert_block_queda_desc',
            'alert_block_queda_tip',
            'alert_block_simbol_title',
            'alert_block_simbol_desc',
            'alert_block_simbol_tip',
            'alert_block_ghost_title',
            'alert_block_ghost_desc',
            'alert_block_ghost_tip',
            'alert_block_reat_title',
            'alert_block_reat_desc',
            'alert_block_reat_tip',
            'alert_block_never_title',
            'alert_block_never_tip',
            'alert_block_madru_title',
            'alert_block_madru_desc',
            'alert_block_madru_tip',
            'alert_email_all',
            'alert_view_prediction',
            'alert_see_more',
            'alert_see_less',
            'alert_extra_queda',
            'alert_extra_sumiu',
            'alert_extra_dias',
            'alert_extra_madru',
            'alert_extra_ausente',
            // ── Class List tab ──
            'cl_filters_title',
            'cl_filter_participation_label',
            'cl_filter_engaged',
            'cl_filter_below_60_percent',
            'cl_filter_sort_label',
            'cl_filter_search_label',
            'cl_sort_interactions',
            'cl_sort_alpha',
            'cl_sort_ago',
            'cl_sort_risk',
            'cl_sort_participation',
            'cl_sort_time',
            'cl_tip_class_list',
            'cl_export_spreadsheet',
            'cl_export_empty',
            'cl_export_activities_done',
            'cl_export_activities_missing',
            'cl_export_activities_overdue',
            'cl_export_resources_accessed',
            'cl_export_resources_missing',
            'cl_followup_legend',
            'cl_followup_overdue',
            'cl_followup_inactive',
            'cl_followup_grade',
            'presence_online_now',
            'presence_recent',
            'presence_offline',
            'cl_view_activities',
            'cl_view_participation',
            'cl_search_placeholder',
            'cl_th_last_access',
            'cl_th_days_without',
            'cl_th_participation',
            'cl_th_deliveries',
            'cl_th_activity_progress',
            'cl_th_resource_progress',
            'cl_th_total_time',
            'cl_open_profile',
            'cl_result',
            'cl_no_grades_hint',
            'cl_no_grade_for_student',
            'cl_no_activities_found',
            'cl_no_resources_found',
            'cl_resource_accessed',
            'cl_resource_not_accessed',
            'cl_legend_done',
            'cl_legend_missing',
            'cl_legend_overdue',
            'cl_activity_overdue',
            // ── Student Profile tab ──
            'sp_page_subtitle',
            'sp_select_label',
            'sp_select_placeholder',
            'sp_kbd_navigate',
            'sp_kbd_select',
            'sp_kbd_close', 'msg_select_student', 'msg_new_message',
            'sp_btn_message', 'sp_btn_history', 'sp_days_suffix',
            'sp_score_label', 'sp_timeline_label', 'sp_tl_access',
            'sp_tl_completion', 'sp_tl_message', 'sp_tl_period',
            'sp_tl_7d', 'sp_tl_30d', 'sp_tl_90d', 'sp_tl_all',
            'sp_tl_show_more', 'sp_tl_show_less', 'chat_delete_conv',
            'sp_select_student',
            'sp_select_hint',
            'sp_search_student_placeholder',
            'sp_search_no_results',
            'sp_search_clear',
            'sp_kpi_last_access',
            'sp_kpi_active_days',
            'sp_kpi_grade',
            'sp_kpi_engagement',
            'sp_activity_status_title',
            'sp_approved',
            'sp_in_progress',
            'sp_no_grade',
            'sp_activity_7d',
            'sp_no_prev_data',
            'sp_vs_last_week',
            'sp_stable',
            'sp_interactions_this_week',
            'sp_private_notes',
            'sp_notes_placeholder',
            'sp_save',
            'sp_note_saved',
            'sp_contact_history',
            'sp_no_contacts',
            'sp_contact',
            'sp_contact_subject_prompt',
            'sp_intervention',
            'sp_btn_email',
            'sp_email_coming_soon',
            'sp_crm_coming_soon',
            'sp_daily_journey',
            'sp_last_interactions',
            'sp_col_datetime',
            'sp_col_context',
            'sp_col_event',
            'sp_activity_calendar',
            'sp_calendar_less',
            'sp_calendar_more',
            // ── Activities tab ──
            'activities_title',
            'activities_subtitle',
            'act_filter_all',
            'act_filter_activity',
            'act_search_placeholder',
            'act_filter_forum',
            'act_filter_task',
            'act_filter_quiz',
            'act_filter_video',
            'act_filter_low',
            'act_filter_ignored',
            'act_filters_title',
            'act_filter_type_label',
            'act_filter_period_label',
            'act_filter_search_label',
            'act_availability_all',
            'act_availability_open',
            'act_availability_today',
            'act_availability_closed',
            'act_availability_future',
            'act_legend_open',
            'act_legend_today',
            'act_legend_closed',
            'act_legend_future',
            'act_kpi_unique',
            'act_kpi_unique_delta',
            'act_kpi_unique_shown',
            'act_kpi_total_acc',
            'act_kpi_students',
            'act_kpi_avg',
            'act_kpi_avg_delta',
            'act_tip_unique_resources',
            'act_tip_total_accesses',
            'act_tip_distinct_students',
            'act_tip_average_per_resource',
            'act_stop_tracking',
            'act_resume_tracking',
            'act_ignored_title',
            'act_ignored_help',
            'act_tracking_confirm',
            'act_tracking_error',
            'act_col_students',
            'act_col_activity_resource',
            'act_list_title',
            'act_pag_showing',
            'act_items_per_page',
            'act_col_students_access',
            'act_col_access_count',
            'act_col_tracking',
            'act_col_accesses',
            'act_col_access_coverage',
            'act_col_deadline',
            'act_col_submitted', 'act_col_completion_rate', 'act_completion_resource_hint',
            'act_label_posted',
            'act_label_posted_single',
            'act_label_submitted',
            'act_label_submitted_single',
            'act_label_accessed',
            'act_label_accessed_single',
            'act_label_saw_not_posted',
            'act_label_saw_not_posted_single',
            'act_label_saw_not_submitted',
            'act_label_saw_not_submitted_single',
            'act_label_pending',
            'act_label_no_access',
            'act_mod_context_assign',
            'act_mod_context_forum',
            'act_mod_context_quiz',
            'act_mod_context_h5pactivity',
            'act_mod_context_page',
            'act_mod_context_book',
            'act_mod_context_url',
            'act_mod_context_scorm',
            'act_mod_context_glossary',
            'act_mod_context_wiki',
            'act_mod_context_data',
            'act_mod_context_resource',
            'act_mod_context_label',
            'act_mod_context_activity',
            // ── Activity modal ──
            'act_modal_participated',
            'act_modal_pending',
            'act_modal_completion_rate',
            'act_modal_no_access',
            'act_modal_time_per_student',
            'act_modal_avg',
            'act_modal_email_no_access',
            'act_modal_email_no_access_btn',
            'act_msg_pending',
            'act_msg_no_access',
            'act_modal_close',
            'act_status_delivery',
            'act_status_delivery_hint',
            'act_status_coverage_hint',
            'act_ai_title',
            'act_ai_desc',
            'act_ai_generate',
            'act_ai_generating',
            'act_ai_loading',
            'act_show_more_times',
            // ── Grades tab ──
            'grades_title',
            'grades_subtitle',
            'gr_no_grades_loaded',
            'gr_avg_grade',
            'gr_points',
            'gr_approved',
            'gr_of_class', 'gr_kpi_of', 'gr_kpi_pct_hint',
            'gr_in_progress',
            'gr_below_60',
            'gr_below_60_note',
            'gr_no_grade',
            'gr_none_launched',
            'gr_highest',
            'gr_partial_warning_title',
            'gr_partial_warning_body',
            'gr_chart_dist',
            'gr_chart_approval',
            'gr_tip_avg_grade',
            'gr_tip_kpi_approved',
            'gr_tip_kpi_in_progress',
            'gr_tip_kpi_no_grade',
            'gr_tip_highest',
            'gr_tip_chart_distribution',
            'gr_tip_chart_approval',
            'gr_tip_card_approved',
            'gr_tip_card_in_progress',
            'gr_tip_card_no_grade',
            'gr_search_placeholder',
            'gr_filters_title',
            'gr_filter_status_label',
            'gr_filter_search_label',
            'gr_filter_all',
            'gr_export',
            'gr_col_student',
            'gr_col_grade',
            'gr_col_activities',
            'gr_col_current_grade',
            'gr_col_missing',
            'gr_legend_released',
            'gr_legend_pending',
            'gr_legend_overdue',
            'gr_col_progress',
            'gr_col_profile',
            'gr_launched',
            'gr_avg_current',
            'gr_avg_missing',
            'gr_of',
            'gr_grades_launched',
            // ── Interventions tab ──
            'nav_interventions',
            'int_page_title',
            'int_page_subtitle',
            'int_kpi_sent',
            'int_kpi_returned',
            'int_kpi_avg_return',
            'int_kpi_inactive',
            'int_tip_kpi_sent',
            'int_tip_kpi_returned',
            'int_tip_kpi_avg_return',
            'int_tip_kpi_inactive',
            'int_days',
            'int_of',
            'int_students',
            'int_col_date',
            'int_col_student',
            'int_col_reason',
            'int_col_teacher',
            'int_col_status',
            'int_col_effect',
            'att_see_all', 'open_btn', 'int_export', 'int_export_channel', 'int_export_subject', 'int_status_sent', 'int_status_error',
            'int_no_data',
            'int_no_filter_results',
            'int_filter_search',
            'int_filter_search_placeholder',
            'int_filter_reason',
            'int_filter_all_reasons',
            'int_filter_status',
            'int_filter_all_reasons',
            'int_filter_all_status',
            'clearfilters',
            'int_filter_all_status',
            'int_filter_from',
            'int_filter_to',
            'int_filter_clear',
            'int_filter_results',
            'int_filter_total',
            'int_no_timeline',
            'int_view_details',
            'int_collapse',
            'int_notes_btn',
            'int_notes_title',
            'int_notes_subtitle',
            'int_notes_placeholder',
            'int_notes_save',
            'int_note_saving',
            'int_note_saved',
            'int_note_save_error',
            'peak_at',
            'peak_desc',
            'no_peak_desc',
            'view_heatmap',
            'urgent_insight',
            'attention_insight',
            'opportunity_insight',
            'report_note',
            'report_title',
            'risk',
            'risk_high',
            'risk_low',
            'risk_medium',
            'sat',
            'score',
            'score_below_40',
            'kpi_compare', 'kpi_period_1d', 'kpi_period_7d', 'kpi_period_30d',
            'search_student',
            'send_email_ai',
            'standalone_waiting',
            'student',
            'students',
            'students_in_log',
            'students_label',
            'students_table_title',
            'summary_subtitle',
            'sun',
            'thu',
            'total_interactions',
            'total_students',
            'tue',
            'type',
            'unique_students',
            'unknown_activity',
            'unknown_student',
            'updated_now',
            'urgent',
            'urgent_desc',
            'view_list',
            'view_profiles',
            'wed',
            // ── Content Analysis tab ──
            'ct_page_title', 'ct_page_sub', 'ct_period_all', 'ct_total_events', 'ct_all_period', 'ct_videos', 'ct_accesses', 'ct_forum_posts', 'ct_forum_posts_sub', 'ct_quiz', 'ct_interactions', 'ct_task_subs', 'ct_submissions', 'ct_daily_title', 'ct_coverage_title', 'ct_dist_title', 'ct_top_title', 'ct_top_sub', 'ct_th_content', 'ct_th_type', 'ct_th_accesses', 'ct_th_unique', 'ct_th_coverage', 'ct_forum', 'ct_video', 'ct_quiz_short', 'ct_task', 'ct_other', 'ct_of', 'ct_students', 'ct_reach_summary', 'ct_students_short', 'ct_low_access_prompt_item', 'ct_no_content', 'nav_content_section',
            'ct_no_data', 'ct_delivery_excellent', 'ct_delivery_satisfactory', 'ct_delivery_critical', 'ct_reach_excellent', 'ct_reach_satisfactory', 'ct_reach_critical', 'ct_updated', 'ct_stuck_modules', 'ct_of_eval', 'ct_low_access', 'ct_reach_below', 'ct_ai_suggestions', 'ct_click_generate', 'ct_where_stuck', 'ct_delivered', 'ct_not_delivered', 'ct_delivered_single', 'ct_delivered_plural', 'ct_not_delivered_single', 'ct_not_delivered_plural', 'ct_total', 'ct_critical', 'ct_attention', 'ct_low_label', 'ct_no_stuck', 'ct_material', 'ct_resource', 'ct_all_good', 'ct_ai_desc', 'ct_generate_btn', 'ct_refresh', 'ct_ai_generating', 'ct_ai_error', 'ct_reach_table', 'ct_students_total', 'ct_missing', 'ct_stuck_note', 'ct_who_stuck', 'ct_no_stuck_found',
            'ct_tip_kpi_stuck_modules', 'ct_tip_kpi_low_access', 'ct_tip_card_where_stuck', 'ct_tip_card_low_access', 'ct_tip_card_ai_suggestions', 'ct_tip_card_reach_table',
            'msg_send_type', 'msg_subject_placeholder', 'msg_sending_to',
            'gr_act_prefix', 'gr_export_filename',
            'pl_tier_low', 'pl_tier_med', 'pl_tier_high', 'pl_tier_alert',
            'pl_rhythm_steady', 'pl_rhythm_irregular', 'pl_rhythm_risk',
            'ct_eval_activities', 'ct_all_reached',
            'ct_prompt_intro', 'ct_prompt_unknown', 'ct_prompt_data', 'ct_prompt_avg',
            'ct_prompt_stuck', 'ct_prompt_not_done', 'ct_prompt_none',
            'ct_prompt_stuck_section', 'ct_prompt_stuck_names', 'ct_prompt_stuck_item', 'ct_prompt_low_access_section',
            'ct_prompt_low_access', 'ct_prompt_accesses', 'ct_prompt_low_reach',
            'ct_prompt_instruction', 'ct_prompt_s1', 'ct_prompt_s2', 'ct_prompt_s3', 'ct_prompt_s4', 'ct_prompt_footer',
            'ct_ai_analyzing', 'ct_item_prompt_stuck_line', 'ct_item_prompt', 'ct_low_item_prompt',
            'pl_page_title', 'pl_page_sub', 'pl_no_data', 'pl_low_part', 'pl_med_part', 'pl_high_part', 'pl_ai_plans', 'pl_morning', 'pl_afternoon', 'pl_evening', 'pl_dawn', 'pl_peak_title', 'pl_rhythm_title', 'pl_best_day', 'pl_high_desc', 'pl_med_desc', 'pl_low_desc', 'pl_empty', 'pl_plan_ready', 'pl_plan_waiting', 'pl_click_generate', 'pl_click_generate_2', 'pl_gen_btn', 'pl_email_btn', 'pl_copy_btn', 'pl_profile_btn', 'pl_generating',
            'pl_tip_kpi_low', 'pl_tip_kpi_medium', 'pl_tip_kpi_high', 'pl_tip_peak_card', 'pl_tip_rhythm_card',
            'pl_tag_dawn', 'pl_tag_night', 'pl_tag_morning', 'pl_tag_afternoon', 'pl_tag_weekend', 'pl_tag_steady', 'pl_tag_irregular', 'pl_tag_risk', 'pl_tag_high_eng', 'pl_tag_med_eng', 'pl_tag_low_eng', 'pl_tag_inactive', 'pl_no_score', 'pl_day_sun', 'pl_day_mon', 'pl_day_tue', 'pl_day_wed', 'pl_day_thu', 'pl_day_fri', 'pl_day_sat',
            'pl_msg_btn',
            'plh_manha', 'plh_tarde', 'plh_noite', 'plh_madrugada',
            'pl_delta_low', 'pl_delta_med', 'pl_delta_high',
            'pl_section_trail', 'pl_section_rhythm', 'pl_section_style', 'pl_section_action', 'pl_section_generated',
            'pl_dom_forum', 'pl_dom_quiz', 'pl_dom_task', 'pl_dom_video',
            'pl_eng_very', 'pl_eng_ok', 'pl_eng_alert', 'pl_eng_low',
            'pl_sit_absent', 'pl_sit_dropping', 'pl_sit_last', 'pl_sit_irregular', 'pl_sit_consistent',
            'pl_sit_few_inter', 'pl_sit_many_inter', 'pl_sit_short_sess', 'pl_sit_long_sess',
            'pl_prompt_intro', 'pl_prompt_student', 'pl_prompt_level', 'pl_prompt_situation',
            'pl_prompt_data', 'pl_prompt_no_acc', 'pl_prompt_active_days', 'pl_prompt_consist',
            'pl_prompt_session', 'pl_prompt_peak_hour', 'pl_prompt_peak_day', 'pl_prompt_resource',
            'pl_prompt_format', 'pl_prompt_trail_inst', 'pl_prompt_rhythm_inst',
            'pl_prompt_style_inst', 'pl_prompt_action_inst', 'pl_prompt_active', 'pl_prompt_rules',
            'pl_copy_header', 'pl_copied', 'pl_empty_response',
            'chat_history', 'chat_new_conv', 'chat_context_label', 'chat_assistant_name', 'chat_no_data_sub', 'chat_data_ready', 'chat_input_placeholder', 'chat_no_convs', 'chat_welcome_data', 'chat_welcome_nodata', 'chat_sug1', 'chat_sug2', 'chat_sug3', 'chat_sug4', 'chat_sug5', 'chat_sug6', 'chat_load_data_first', 'chat_no_reply', 'chat_error', 'chat_no_data',
            'chat_unknown_course', 'chat_all_period', 'chat_ia_not_configured', 'chat_ia_not_configured_alert',
            'ai_unavailable_message',
            // ── Engagement prediction tab ──
            'ev_low_part', 'ev_never_access', 'ev_med_part', 'ev_high_part', 'ev_avg_score',
            'cl_kpi_tip_never', 'cl_kpi_tip_low', 'cl_kpi_tip_medium', 'cl_kpi_tip_high',
            'ev_dist_title', 'ev_score_title', 'ev_filter_label',
            'ev_tip_kpi_never_accessed', 'ev_tip_kpi_low_participation', 'ev_tip_kpi_medium_participation',
            'ev_tip_kpi_high_participation', 'ev_tip_kpi_approved',
            'ev_tip_card_distribution', 'ev_tip_card_score_access',
            'ev_all', 'ev_sort_score', 'ev_sort_ago', 'ev_sort_alpha',
            'ev_analyze_all', 'ev_modal_sub', 'ev_students', 'ev_empty',
            'ev_active_days', 'ev_days_no_access', 'ev_last_access', 'ev_trend_drop',
            'ev_trend', 'ev_approved', 'ev_approved_delta', 'ev_ai_analyzing', 'ev_ai_class_analyzing', 'ev_ai_class_title', 'ev_ai_conn_error', 'ev_part_never_delta', 'ev_part_low_delta', 'ev_part_med_delta', 'ev_part_high_delta', 'ev_interactions_title', 'ev_no_email', 'ev_reason_no_access_ago', 'ev_reason_low_inter2',
            'ev_risk_factors', 'ev_determinants', 'ev_det_at_risk', 'ev_det_rhythm_irregular',
            'ev_det_rhythm_good', 'ev_det_rhythm_constant', 'ev_det_high_engagement',
            'ev_det_no_access_recorded', 'ev_det_weekly_drop', 'ev_det_low_activity',
            'ev_det_pending_activities', 'ev_det_overdue_activities', 'ev_det_pending_grades',
            'ev_factor_recency', 'ev_factor_recency_sub',
            'ev_factor_trend', 'ev_factor_consistency', 'ev_factor_depth', 'ev_factor_social',
            'ev_reason_no_access', 'ev_reason_days_no_access',
            'ev_reason_drop', 'ev_reason_drop_this_week',
            'ev_reason_no_forum', 'ev_reason_low_inter',
            'ev_ai_title', 'ev_ai_hint', 'ev_ai_loading', 'ev_ai_error', 'ev_gen_ai',
            'ev_student',
            'ev_prompt_expert', 'ev_prompt_name', 'ev_prompt_score', 'ev_prompt_ago',
            'ev_prompt_last', 'ev_prompt_inter', 'ev_prompt_active', 'ev_prompt_of',
            'ev_prompt_reasons', 'ev_prompt_none', 'ev_prompt_provide', 'ev_prompt_style',
            'ev_prompt_lang_pt', 'ev_prompt_lang_es', 'ev_prompt_lang_en',
            'ev_prompt_class_expert', 'ev_prompt_class_total', 'ev_prompt_class_never', 'ev_prompt_class_low',
            'ev_prompt_class_med', 'ev_prompt_class_high', 'ev_prompt_class_avg',
            'ev_prompt_class_risk', 'ev_prompt_class_provide', 'ev_prompt_class_style',
            'ev_bucket_0_3', 'ev_bucket_4_7', 'ev_bucket_8_14', 'ev_bucket_15_21', 'ev_bucket_21p',
            // ── Heatmap tab ──
            'hm_filter_all_students', 'hm_filter_all_resources',
            'hm_filter_quiz', 'hm_filter_forum', 'hm_filter_resource',
            'hm_filter_url', 'hm_filter_page', 'hm_filter_h5p',
            'hm_filter_scorm', 'hm_filter_video',
            'hm_mode_access', 'hm_mode_dropout',
            'hm_kpi_peak_hour', 'hm_kpi_filtered', 'hm_kpi_total_logs',
            'hm_tip_kpi_peak_hour', 'hm_tip_kpi_filtered', 'hm_tip_kpi_total_logs',
            'hm_insights_title', 'hm_grades_title', 'hm_besttime_title',
            'hm_tip_card_day_hour', 'hm_tip_card_insights', 'hm_tip_card_grades', 'hm_tip_card_besttime',
            'hm_besttime_desc', 'hm_besttime_tip',
            'hm_no_data', 'hm_insufficient_data', 'hm_no_data_simple',
            'hm_peak_insight', 'hm_after18_insight', 'hm_besttime_insight',
            'hm_deadline_insight', 'hm_trend_insight',
            'hm_access_count', 'hm_accesses_count',
            'hm_possible_deadline', 'hm_trend_up', 'hm_trend_down',
            'hm_morning', 'hm_afternoon', 'hm_evening',
            'hm_grade_avg', 'hm_dropout_label', 'hm_legend_zero', 'hm_students_label',
            'hm_range_today', 'hm_range_7d', 'hm_range_30d', 'hm_range_month', 'hm_range_custom',
            'hm_filters_title', 'hm_filter_search_label', 'hm_filter_student_label',
            'hm_filter_resource_label', 'hm_filter_mode_label', 'hm_filter_period_label',
            'hm_detail_title', 'hm_detail_empty', 'hm_detail_students', 'hm_detail_activities', 'hm_view_activities',
            'hm_students_in_slot', 'hm_accesses_in_slot', 'hm_msg_this_time', 'hm_view_profiles',
            'hm_ai_suggestion', 'hm_ai_suggestion_title', 'hm_ai_default_suggestion',
            'hm_ai_generated_suggestion', 'hm_peak_action',
            'hm_filtered_action', 'hm_all_action', 'hm_peak_suggestion',
            'hm_filtered_suggestion', 'hm_all_suggestion', 'hm_grade_suggestion',
            'hm_besttime_action_suggestion',
            // ── Interventions v3.5 ──
            'int_period_label', 'int_period_7d', 'int_period_30d', 'int_period_90d', 'int_period_all',
            'int_filter_professor', 'int_filter_all_professors', 'int_filter_student_placeholder2',
            'int_motivos_section', 'int_tip_motivos_section',
            'int_summary_title', 'int_summary_tip', 'int_summary_realized', 'int_summary_unique',
            'int_summary_teachers', 'int_summary_rate',
            'int_registered', 'int_export_btn', 'int_action_menu_title', 'int_snapshot_lock',
            'int_pag_showing', 'int_items_per_page', 'int_showing', 'int_to',
            'int_motivo_never', 'int_motivo_low', 'int_motivo_pending', 'int_motivo_difficult', 'int_motivo_other',
            'int_status_awaiting', 'int_status_returned', 'int_status_tracking', 'int_status_evolved',
            'int_followup_done', 'int_followup_5d', 'int_followup_7d',
            'int_col_followup', 'int_col_situation', 'int_col_action',
            'int_action_welcome', 'int_action_reengagement', 'int_action_reminder', 'int_action_guidance',
            'int_ai_grade_mean', 'int_ai_enrolled', 'int_ai_enrolled_pl',
            'int_ai_last_access', 'int_ai_engagement', 'int_ai_last_day', 'int_ai_last_day_pl',
            'int_ai_grade_drop', 'int_ai_pending_one', 'int_ai_pending_pl',
            'int_menu_send', 'int_menu_delete',
            // ── Class list v3.5 ──
            'cl_th_situation',
            // ── Teacher Feedback v3.5 ──
            'tf_kpi_evolved', 'tf_kpi_tracking', 'tf_kpi_sustained', 'tf_kpi_students_tracked',
            'tf_kpi_students_all', 'tf_kpi_students_none', 'tf_kpi_responded', 'tf_kpi_no_response',
            'tf_of_total', 'tf_of_eligible', 'tf_no_eligible_after',
            'tf_donut_rate_label', 'tf_donut_select_prompt', 'tf_donut_select_sub',
            'tf_cont_sustained', 'tf_cont_sustained_sub', 'tf_cont_observing', 'tf_cont_observing_sub',
            'tf_cont_not_sustained', 'tf_cont_not_sustained_sub',
            'tf_cont_select_prompt', 'tf_cont_select_sub', 'tf_cont_window_label',
            'tf_filter_all_teachers', 'tf_filter_all_students', 'tf_filter_all_period',
            'tf_tab_overview', 'tf_tab_engagement', 'tf_tab_learning', 'tf_tab_interaction',
            'tf_tab_continuity', 'tf_tab_mediation', 'tf_tab_trajectory', 'tf_tab_ai',
            'tf_chart_engagement', 'tf_chart_grade', 'tf_chart_approval',
            'tf_funnel_received', 'tf_funnel_responded', 'tf_funnel_active7', 'tf_funnel_sustained',
            'tf_journey_activities', 'tf_journey_resources', 'tf_journey_attempts', 'tf_journey_returned',
            'tf_interaction_select', 'tf_interaction_select_sub', 'tf_no_tracked_items',
            'tf_card_synthesis', 'tf_card_continuity', 'tf_card_mediation_time',
            'tf_card_journey', 'tf_card_trajectory',
            'tf_empty_eligible', 'tf_empty_eligible_desc',
            'tf_th_student', 'tf_th_snapshot', 'tf_th_intervention', 'tf_th_after_data',
            'tf_th_response', 'tf_th_progress', 'tf_th_activity_days',
            'tf_students_label', 'tf_no_student_here', 'tf_no_student_point',
            'tf_no_student_counted', 'tf_no_student_approved', 'tf_no_student_improved',
            'tf_students_approved', 'tf_students_improved',
            'tf_error_load', 'tf_error_load_sub', 'tf_loading_consolidate',
            'tf_ai_loading', 'tf_ai_not_configured', 'tf_ai_not_configured_sub',
            'tf_ai_intro_title', 'tf_ai_intro_sub',
            'tf_ai_topic_before_after', 'tf_ai_topic_progress', 'tf_ai_topic_priority', 'tf_ai_topic_recommend',
            'tf_ai_generate_btn', 'tf_ai_regen_btn', 'tf_ai_report_title', 'tf_ai_report_notice',
            'tf_linechart_title', 'tf_linechart_aria', 'tf_linechart_marker',
            'tf_linechart_select', 'tf_linechart_select_sub',
            'tf_journey_title', 'tf_journey_aria', 'tf_journey_d0',
            'tf_journey_access', 'tf_journey_academic',
            'tf_journey_select', 'tf_journey_select_sub', 'tf_journey_info',
            'tf_progress_by_strategy', 'tf_progress_after',
            'tf_kpi_students_tracked_tip', 'tf_kpi_responded_tip', 'tf_kpi_evolved_tip',
            'tf_kpi_tracking_tip', 'tf_kpi_no_response_tip', 'tf_kpi_sustained_tip',
            'tf_student_fallback',
            // ── Reason chart ──
            'tf_reason_chart_title', 'tf_reason_interventions', 'tf_reason_responded_pct',
            'tf_reason_engage_delta', 'tf_reason_no_data', 'tf_reason_engage_note',
            // ── Activities availability ──
            'act_availability_closed', 'act_availability_today', 'act_availability_future',
            'act_availability_open', 'act_availability_unavailable', 'act_due_label',
            'act_kpi_no_deadline', 'act_kpi_closed', 'act_kpi_due',
            // ── Mediation card ──
            'tf_med_first_response', 'tf_med_first_academic',
            'tf_med_with_response', 'tf_med_with_academic',
            'tf_med_48h_title', 'tf_med_48h_count', 'tf_med_48h_info',
            // ── Continuity card ──
            'tf_cont_side_title', 'tf_cont_window_students', 'tf_cont_info',
            // ── Trajectory ──
            'tf_traj_events_academic',
            // ── Interaction info ──
            'tf_interaction_info',
            // ── Strategy table ──
            'tf_strategy_col_strategy', 'tf_strategy_col_total', 'tf_strategy_col_responded',
            'tf_strategy_col_evolved', 'tf_strategy_col_rate', 'tf_strategy_no_data',
            'tf_strategy_info', 'tf_strategy_unknown',
            // ── AI context ──
            'tf_ai_motivo', 'tf_ai_intervencao', 'tf_ai_engagement_delta', 'tf_ai_grade_delta',
            'tf_ai_after_events', 'tf_ai_after_academic', 'tf_ai_first_return', 'tf_ai_no_return',
            'tf_ai_result', 'tf_ai_result_none', 'tf_ai_result_full', 'tf_ai_result_partial',
            'tf_ai_continuity', 'tf_ai_continuity_yes', 'tf_ai_continuity_no',
            // ── Donut info ──
            'tf_donut_info',
            // ── Snapshot modal ──
            'snapshot_lock', 'snapshot_days_since', 'snapshot_last_day', 'snapshot_enrolment',
            // ── Teacher Feedback progress card ──
            'tf_progress_card_title', 'tf_progress_engagement_label', 'tf_progress_grade_label',
            'tf_progress_approved_label', 'tf_progress_activities_label', 'tf_progress_info',
            'tf_delta_remaining', 'tf_delta_concluded', 'tf_delta_students', 'tf_delta_percent',
            // Individual evolution report.
            'close', 'tf_ir_open', 'tf_ir_title', 'tf_ir_evolution_of', 'tf_ir_export_pdf',
            'tf_ir_period', 'tf_ir_to', 'tf_ir_interventions', 'tf_ir_classification',
            'tf_ir_before_after', 'tf_ir_engagement', 'tf_ir_average_grade', 'tf_ir_approval',
            'tf_ir_completed_activities', 'tf_ir_timeline', 'tf_ir_registered_interventions',
            'tf_ir_date', 'tf_ir_reason', 'tf_ir_teacher', 'tf_ir_return', 'tf_ir_conclusion',
            'tf_ir_followup', 'tf_ir_awaiting_return', 'tf_ir_awaiting_return_text',
            'tf_ir_causality_note', 'tf_ir_preparing', 'tf_ir_generation_error',
            'tf_ir_insufficient_data', 'tf_ir_full_progress', 'tf_ir_partial_progress',
            'tf_ir_no_change', 'tf_ir_responded', 'tf_ir_no_response', 'tf_ir_intervention_done',
            'tf_ir_student_response', 'tf_ir_response_recorded', 'tf_ir_academic_activity',
            'tf_ir_activity_recorded', 'tf_ir_no_events', 'tf_ir_and', 'tf_ir_not_enough_snapshots',
            'tf_ir_conclusion_classification', 'tf_ir_improvements', 'tf_ir_declines',
            'tf_ir_stable', 'tf_ir_changed_from', 'tf_ir_stayed_at',
            'tf_ir_response_yes_sentence', 'tf_ir_response_no_sentence',
            'tf_ir_engagement_points', 'tf_ir_points', 'tf_ir_percentage_points',
            'tf_ir_activities_unit', 'tf_ir_approved_after_intervention', 'tf_ir_still_not_approved',
            'tf_ir_remains_approved', 'tf_ir_tracked_activities', 'tf_ir_tracked_resources',
            'tf_ir_tracked_total', 'tf_ir_remaining', 'tf_ir_completed', 'tf_ir_accessed',
            'dashboard_updated_at',
            // ── Generic ──
            'message',
        ];
    }

}
