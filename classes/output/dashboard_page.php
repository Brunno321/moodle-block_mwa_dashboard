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
        $page->requires->js('/blocks/mwa_dashboard/amd/build/vendor/chart.umd.js', true);

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
        return [
            'courseid'           => (int)$this->courseid,
            'wwwroot'            => (string)$CFG->wwwroot,
            'selectstudentlabel' => get_string('msg_select_student', 'block_mwa_dashboard'),
            'deletelabel'        => get_string('chat_delete_conv', 'block_mwa_dashboard'),
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
        global $CFG, $DB;

        $coursename = '';
        if ($this->courseid > 0) {
            $coursename = (string)$DB->get_field('course', 'fullname', ['id' => $this->courseid]);
        }

        $ia_url      = get_config('block_mwa_dashboard', 'ia_endpoint') ?: '';
        $ia_provider = get_config('block_mwa_dashboard', 'ia_provider') ?: 'auto';
        return [
            'courseid'    => (int)$this->courseid,
            'wwwroot'     => (string)$CFG->wwwroot,
            'coursename'  => $coursename,
            'language'    => current_language(),
            'ia_enabled'  => !empty($ia_url),
            'ia_endpoint' => (string)$ia_url,
            'ia_provider' => (string)$ia_provider,
        ];
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
            'interventions.css',
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
            'feature_coming_soon',
            'feature_placeholder',
            'fri',
            'good_engagement',
            'grade',
            'grade_analysis',
            'grade_average',
            'gradebook_title',
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
            // ── Message modal & interventions ──
            'msg_reason_select', 'msg_reason_low_eng', 'msg_reason_risk', 'msg_reason_inactive',
            'msg_reason_task', 'msg_reason_reeng', 'msg_reason_praise', 'msg_reason_other',
            'msg_reason_label', 'msg_type_moodle_hint', 'msg_type_email_hint',
            'msg_no_email', 'msg_no_registered_email', 'msg_conn_error', 'msg_delete_confirm', 'msg_deleted',
            'msg_delete_error', 'msg_required_subject_body', 'msg_sending',
            'msg_channel_email', 'msg_channel_moodle', 'msg_sent_success',
            'msg_send_error', 'msg_unknown_status', 'msg_select_student_required',
            'msg_modal_title', 'msg_send_type_label', 'msg_type_moodle_btn', 'msg_type_email_btn',
            'msg_subject_label', 'msg_subject_placeholder', 'msg_body_label', 'msg_templates_label',
            'msg_body_placeholder', 'msg_ai_soon', 'msg_ai_generate', 'msg_ai_done', 'msg_cancel', 'msg_send_btn', 'msg_detail_reason',
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
            'tpl_eng_subject', 'tpl_eng_body', 'tpl_inactive_subject', 'tpl_inactive_body',
            'tpl_task_subject', 'tpl_task_body', 'tpl_praise_subject', 'tpl_praise_body',
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
            // ── Action Center: retention drill-down ──
            'ret_drill_active_students',
            'ret_drill_retention',
            'ret_drill_left',
            'ret_drill_came',
            'ret_drill_stayed',
            'ret_tooltip_returned',
            'ret_tooltip_left',
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
            'ai_factor_recent_access',
            'ai_factor_partial_grade',
            'ai_factor_low_coverage',
            'ai_factor_symbolic',
            'ai_factor_low_engagement',
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
            'cl_sort_interactions',
            'cl_sort_alpha',
            'cl_sort_ago',
            'cl_sort_participation',
            'cl_sort_time',
            'cl_view_activities',
            'cl_view_participation',
            'cl_search_placeholder',
            'cl_th_last_access',
            'cl_th_days_without',
            'cl_th_participation',
            'cl_th_deliveries',
            'cl_th_total_time',
            'cl_open_profile',
            'cl_result',
            'cl_no_grades_hint',
            'cl_no_grade_for_student',
            'cl_no_activities_found',
            // ── Student Profile tab ──
            'sp_page_subtitle',
            'sp_select_label', 'msg_select_student', 'msg_new_message',
            'sp_btn_message', 'sp_btn_history', 'sp_days_suffix',
            'sp_score_label', 'sp_timeline_label', 'chat_delete_conv',
            'sp_select_student',
            'sp_select_hint',
            'sp_kpi_last_access',
            'sp_kpi_active_days',
            'sp_kpi_grade',
            'sp_kpi_engagement',
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
            'act_filter_forum',
            'act_filter_task',
            'act_filter_quiz',
            'act_filter_video',
            'act_kpi_unique',
            'act_kpi_unique_delta',
            'act_kpi_unique_shown',
            'act_kpi_total_acc',
            'act_kpi_students',
            'act_kpi_avg',
            'act_kpi_avg_delta',
            'act_col_students',
            'act_col_accesses',
            'act_col_submitted',
            'act_label_posted',
            'act_label_submitted',
            'act_label_accessed',
            'act_label_saw_not_posted',
            'act_label_saw_not_submitted',
            'act_label_pending',
            'act_label_no_access',
            // ── Activity modal ──
            'act_modal_participated',
            'act_modal_pending',
            'act_modal_completion_rate',
            'act_modal_time_per_student',
            'act_modal_avg',
            'act_modal_email_no_access',
            'act_modal_email_no_access_btn',
            'act_msg_pending',
            'act_msg_no_access',
            'act_modal_close',
            // ── Grades tab ──
            'grades_title',
            'grades_subtitle',
            'gr_no_grades_loaded',
            'gr_avg_grade',
            'gr_points',
            'gr_approved',
            'gr_of_class',
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
            'gr_search_placeholder',
            'gr_filter_all',
            'gr_export',
            'gr_col_student',
            'gr_col_grade',
            'gr_col_activities',
            'gr_col_current_grade',
            'gr_col_missing',
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
            'int_days',
            'int_of',
            'int_students',
            'int_col_date',
            'int_col_student',
            'int_col_reason',
            'int_col_teacher',
            'int_col_status',
            'int_col_effect',
            'att_see_all', 'int_export', 'int_export_channel', 'int_export_subject', 'int_status_sent', 'int_status_error',
            'int_no_data',
            'int_no_timeline',
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
            'ct_no_data', 'ct_updated', 'ct_stuck_modules', 'ct_of_eval', 'ct_low_access', 'ct_reach_below', 'ct_ai_suggestions', 'ct_click_generate', 'ct_where_stuck', 'ct_delivered', 'ct_not_delivered', 'ct_total', 'ct_critical', 'ct_attention', 'ct_low_label', 'ct_no_stuck', 'ct_material', 'ct_resource', 'ct_all_good', 'ct_ai_desc', 'ct_generate_btn', 'ct_refresh', 'ct_ai_generating', 'ct_ai_error', 'ct_reach_table', 'ct_students_total', 'ct_missing', 'ct_stuck_note', 'ct_who_stuck', 'ct_no_stuck_found',
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
            'ct_ai_analyzing', 'ct_item_prompt_stuck_line', 'ct_item_prompt',
            'pl_page_title', 'pl_page_sub', 'pl_no_data', 'pl_low_part', 'pl_med_part', 'pl_high_part', 'pl_ai_plans', 'pl_morning', 'pl_afternoon', 'pl_evening', 'pl_dawn', 'pl_peak_title', 'pl_rhythm_title', 'pl_best_day', 'pl_high_desc', 'pl_med_desc', 'pl_low_desc', 'pl_empty', 'pl_plan_ready', 'pl_plan_waiting', 'pl_click_generate', 'pl_click_generate_2', 'pl_gen_btn', 'pl_email_btn', 'pl_copy_btn', 'pl_profile_btn', 'pl_generating',
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
            // ── Engagement prediction tab ──
            'ev_low_part', 'ev_med_part', 'ev_high_part', 'ev_avg_score',
            'ev_dist_title', 'ev_score_title', 'ev_filter_label',
            'ev_all', 'ev_sort_score', 'ev_sort_ago', 'ev_sort_alpha',
            'ev_analyze_all', 'ev_modal_sub', 'ev_students', 'ev_empty',
            'ev_active_days', 'ev_days_no_access', 'ev_last_access', 'ev_trend_drop',
            'ev_trend', 'ev_approved', 'ev_approved_delta', 'ev_ai_analyzing', 'ev_ai_class_analyzing', 'ev_ai_class_title', 'ev_ai_conn_error', 'ev_part_low_delta', 'ev_part_med_delta', 'ev_part_high_delta', 'ev_interactions_title', 'ev_no_email', 'ev_reason_no_access_ago', 'ev_reason_low_inter2',
            'ev_risk_factors', 'ev_factor_recency', 'ev_factor_recency_sub',
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
            'ev_prompt_class_expert', 'ev_prompt_class_total', 'ev_prompt_class_low',
            'ev_prompt_class_med', 'ev_prompt_class_high', 'ev_prompt_class_avg',
            'ev_prompt_class_risk', 'ev_prompt_class_provide', 'ev_prompt_class_style',
            'ev_bucket_0_3', 'ev_bucket_4_7', 'ev_bucket_8_14', 'ev_bucket_15_21', 'ev_bucket_21p',
            // ── Heatmap tab ──
            'hm_filter_all_students', 'hm_filter_all_resources',
            'hm_filter_quiz', 'hm_filter_forum', 'hm_filter_resource',
            'hm_filter_url', 'hm_filter_page', 'hm_filter_h5p',
            'hm_filter_scorm', 'hm_filter_video',
            'hm_mode_access', 'hm_mode_dropout',
            'hm_kpi_after_hours', 'hm_kpi_peak_hour', 'hm_kpi_filtered', 'hm_kpi_total_logs',
            'hm_insights_title', 'hm_grades_title', 'hm_besttime_title',
            'hm_besttime_desc', 'hm_besttime_tip',
            'hm_no_data', 'hm_insufficient_data', 'hm_no_data_simple',
            'hm_peak_insight', 'hm_after18_insight', 'hm_besttime_insight',
            'hm_deadline_insight', 'hm_trend_insight',
            'hm_access_count', 'hm_accesses_count',
            'hm_possible_deadline', 'hm_trend_up', 'hm_trend_down',
            'hm_morning', 'hm_afternoon', 'hm_evening',
            'hm_grade_avg', 'hm_dropout_label', 'hm_legend_zero', 'hm_students_label',
        ];
    }

}
