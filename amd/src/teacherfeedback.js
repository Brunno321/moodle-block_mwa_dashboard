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
 * Teacher-facing feedback about the effect of interventions.
 *
 * @module     block_mwa_dashboard/teacherfeedback
 * @copyright  2026 Bruno Porto
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
define(['block_mwa_dashboard/dashboardstore', 'block_mwa_dashboard/engagementcalc'], function(Store, EngagementCalc) {

    'use strict';

    var WINDOW_DAYS = 14;
    var trendChart = null;
    var barsChart = null;
    var donutChart = null;
    var currentData = [];
    var kpiTipCursor = 0;
    var kpiTipKeys = [
        'tf_tip_kpi_interventions',
        'tf_tip_kpi_return',
        'tf_tip_kpi_engagement',
        'tf_tip_kpi_grade',
        'tf_tip_kpi_risk'
    ];
    var filterState = {
        period: 'all',
        reason: 'all',
        status: 'all',
        student: ''
    };

    function tr(key, fallback) {
        var strings = Store.getStrings ? Store.getStrings() : {};
        return strings[key] || fallback || key;
    }

    function esc(value) {
        return String(value === undefined || value === null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function helpTip(key, fallback) {
        var text = esc(tr(key, fallback || ''));
        return text ? '<span class="mwa-help-tip" tabindex="0" role="img" aria-label="' + text +
            '" title="' + text + '" data-tooltip="' + text + '">?</span>' : '';
    }

    function norm(value) {
        return String(value === undefined || value === null ? '' : value).trim();
    }

    function lower(value) {
        return norm(value).toLowerCase();
    }

    function ts(log) {
        return Number(log && (log._ts || log.timecreated || 0)) || 0;
    }

    function studentMatches(log, intervention) {
        var rowName = lower(intervention.student_name);
        var rowEmail = lower(intervention.student_email);
        var logName = lower(log.nomecompleto || log.student_name || log.userfullname);
        var logEmail = lower(log.email);
        return (rowEmail && logEmail && rowEmail === logEmail) || (rowName && logName && rowName === logName);
    }

    function isSubmitLog(log) {
        var text = lower([log.nomedoevento, log.eventname, log.action, log.componente, log.component].join(' '));
        return text.indexOf('submit') >= 0 || text.indexOf('submitted') >= 0 ||
            text.indexOf('post created') >= 0 || text.indexOf('discussion created') >= 0 ||
            text.indexOf('attempt submitted') >= 0 || text.indexOf('completed') >= 0 ||
            text.indexOf('completion') >= 0 || text.indexOf('graded') >= 0;
    }

    function isGradeLog(log) {
        var text = lower([log.nomedoevento, log.eventname, log.action, log.componente, log.component].join(' '));
        return text.indexOf('grade') >= 0 || text.indexOf('graded') >= 0 ||
            text.indexOf('nota') >= 0 || text.indexOf('avaliad') >= 0;
    }

    function parseTargets(intervention) {
        try {
            var parsed = JSON.parse(intervention.target_items || '[]');
            return Array.isArray(parsed) ? parsed : [];
        } catch (ignore) {
            return [];
        }
    }

    function logCmid(log) {
        return parseInt(log && (log.cmid || log._cmid || log.contextinstanceid ||
            log.contextinstance || log.coursemoduleid || log.moduleid || 0), 10) || 0;
    }

    function logName(log) {
        return norm(log && (log.contextodoevento || log.eventcontext || log.context ||
            log.nomedoevento || log.action));
    }

    function gradeRows(grades) {
        return (grades || []).filter(function(row) {
            return row && row.__mwa_type__ !== 'activity_names';
        });
    }

    function findGradeRow(intervention, grades) {
        var studentName = lower(intervention.student_name);
        var studentEmail = lower(intervention.student_email);
        var row = null;
        gradeRows(grades).some(function(grade) {
            var first = norm(grade['First name'] || grade.Nome || grade.firstname || '');
            var last = norm(grade['Last name'] || grade.Sobrenome || grade.lastname || '');
            var name = lower(grade.student_name || grade.name || grade.nomecompleto ||
                grade.Aluno || (first + ' ' + last));
            var email = lower(grade.Email || grade.email || '');
            if ((studentEmail && email === studentEmail) || (studentName && name === studentName)) {
                row = grade;
                return true;
            }
            return false;
        });
        return row;
    }

    function currentActivityDone(intervention, target, state) {
        if (!target || !target.seq) {
            return false;
        }
        var row = findGradeRow(intervention, state.grades || []);
        if (!row) {
            return false;
        }
        var current = parseInt(row['act_current_' + target.seq] || 0, 10) || 0;
        var raw = row['act_' + target.seq];
        var number = parseFloat(String(raw || '').replace(',', '.'));
        return current > 0 || (!isNaN(number) && number > 0);
    }

    function sameTarget(log, target) {
        var targetName = lower(target && target.name);
        var targetCmid = parseInt((target && target.cmid) || 0, 10) || 0;
        var name = lower(logName(log));
        var sameCmid = targetCmid && logCmid(log) === targetCmid;
        var sameName = targetName && name && (name.indexOf(targetName) >= 0 || targetName.indexOf(name) >= 0);
        return sameCmid || sameName;
    }

    function itemTouchedAfter(intervention, target, requireSubmit, state) {
        return (state.logs || []).some(function(log) {
            if (!studentMatches(log, intervention)) {
                return false;
            }
            var when = ts(log);
            if (!when || when <= Number(intervention.timesent || 0)) {
                return false;
            }
            if (requireSubmit && !isSubmitLog(log)) {
                return false;
            }
            return sameTarget(log, target);
        });
    }

    function firstAccessAfter(intervention, state) {
        var sent = Number(intervention.timesent || 0) || 0;
        var first = null;
        (state.logs || []).forEach(function(log) {
            if (!studentMatches(log, intervention)) {
                return;
            }
            var when = ts(log);
            if (when > sent && (first === null || when < first)) {
                first = when;
            }
        });
        return first;
    }

    function interventionOutcome(intervention, state) {
        if (intervention.status !== 'sent') {
            return {state: 'none', label: '-'};
        }
        var targets = parseTargets(intervention);
        var type = norm(intervention.target_type || '');
        if (type === 'activity_completion' && targets.length) {
            var delivered = targets.some(function(target) {
                return currentActivityDone(intervention, target, state) ||
                    itemTouchedAfter(intervention, target, true, state);
            });
            return delivered ?
                {state: 'delivered', label: tr('int_result_delivered', 'Entregou'), advanced: true} :
                {state: 'pending', label: tr('int_result_pending', 'Pendente'), advanced: false};
        }
        if (type === 'resource_access' && targets.length) {
            var accessed = targets.some(function(target) {
                return itemTouchedAfter(intervention, target, false, state);
            });
            return accessed ?
                {state: 'accessed', label: tr('int_result_accessed', 'Acessou'), advanced: true} :
                {state: 'pending', label: tr('int_result_pending', 'Pendente'), advanced: false};
        }
        var returnedAt = firstAccessAfter(intervention, state);
        return returnedAt ?
            {state: 'accessed', label: tr('int_result_accessed', 'Acessou'), advanced: true, firstReturn: returnedAt} :
            {state: 'pending', label: tr('int_result_pending', 'Pendente'), advanced: false};
    }

    function trackedItemProgress(intervention, state) {
        var targets = parseTargets(intervention);
        var type = norm(intervention.target_type || '');
        if (!targets.length) {
            return [];
        }
        return targets.map(function(target) {
            var done = false;
            if (type === 'activity_completion') {
                done = currentActivityDone(intervention, target, state) ||
                    itemTouchedAfter(intervention, target, true, state);
            } else if (type === 'resource_access') {
                done = itemTouchedAfter(intervention, target, false, state);
            } else {
                done = itemTouchedAfter(intervention, target, false, state);
            }
            return {
                name: norm(target.name || target.title || ''),
                done: !!done
            };
        }).filter(function(item) {
            return !!item.name;
        });
    }

    function firstName(name) {
        return norm(name).split(/\s+/)[0] || norm(name);
    }

    function studentCurrent(intervention, state) {
        var name = lower(intervention.student_name);
        var email = lower(intervention.student_email);
        return (state.students || []).filter(function(student) {
            return (email && lower(student.email) === email) || (name && lower(student.name) === name);
        })[0] || null;
    }

    function calculateWindowScore(name, email, logs, grades) {
        var calc = EngagementCalc.calculateForStudent(name, email, logs || [], grades || []);
        return Number(calc.score || 0);
    }

    function formatDate(value) {
        if (!value) {
            return '-';
        }
        var date = new Date(Number(value) * 1000);
        return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'});
    }

    function formatDuration(seconds) {
        seconds = Math.max(0, Number(seconds || 0));
        if (!seconds) {
            return '-';
        }
        var minutes = Math.round(seconds / 60);
        if (minutes < 60) {
            return minutes + 'min';
        }
        var hours = Math.floor(minutes / 60);
        var rest = minutes % 60;
        if (hours < 24) {
            return hours + 'h' + (rest ? ' ' + rest + 'min' : '');
        }
        var days = Math.floor(hours / 24);
        var hourRest = hours % 24;
        return days + 'd' + (hourRest ? ' ' + hourRest + 'h' : '');
    }

    function reasonLabel(reason) {
        var map = {
            'Baixo engajamento': tr('msg_reason_low_eng', 'Baixo engajamento'),
            'Risco de evas?o': tr('msg_reason_risk', 'Risco de evas?o'),
            'Risco de evas?o': tr('msg_reason_risk', 'Risco de evas?o'),
            '7+ dias sem acesso': tr('msg_reason_inactive', '7+ dias sem acesso'),
            'Tarefa pendente': tr('msg_reason_task', 'Tarefa pendente'),
            'Reengajamento': tr('msg_reason_reeng', 'Reengajamento'),
            'Outro': tr('msg_reason_other', 'Outro')
        };
        return map[norm(reason)] || norm(reason) || tr('msg_reason_other', 'Outro');
    }

    function analyseIntervention(intervention, state) {
        var logs = state.logs || [];
        var grades = state.grades || [];
        var sent = Number(intervention.timesent || 0) || 0;
        var windowSeconds = WINDOW_DAYS * 86400;
        var beforeLogs = [];
        var afterLogs = [];
        var firstReturn = null;
        var submissionsAfter = 0;
        var gradeAfter = false;

        logs.forEach(function(log) {
            if (!studentMatches(log, intervention)) {
                return;
            }
            var when = ts(log);
            if (!when) {
                return;
            }
            if (when < sent && when >= sent - windowSeconds) {
                beforeLogs.push(log);
            }
            if (when > sent && when <= sent + windowSeconds) {
                afterLogs.push(log);
                if (firstReturn === null || when < firstReturn) {
                    firstReturn = when;
                }
                if (isSubmitLog(log)) {
                    submissionsAfter++;
                }
                if (isGradeLog(log)) {
                    gradeAfter = true;
                }
            }
        });

        var name = norm(intervention.student_name);
        var email = norm(intervention.student_email);
        var beforeScore = calculateWindowScore(name, email, beforeLogs, grades);
        var afterScore = calculateWindowScore(name, email, afterLogs, grades);
        var current = studentCurrent(intervention, state);
        var currentScore = current ? Number(current.score || 0) : afterScore;
        var gradeCurrent = current && current.grade !== null && current.grade !== undefined;
        var outcome = interventionOutcome(intervention, state);
        if (firstReturn === null && outcome.firstReturn) {
            firstReturn = outcome.firstReturn;
        }
        var returned = firstReturn !== null || outcome.state === 'accessed' || outcome.state === 'delivered';
        var improvedEngagement = afterScore >= beforeScore + 5 || afterLogs.length > beforeLogs.length;
        var improvedGrade = gradeAfter || outcome.state === 'delivered' || (gradeCurrent && returned && submissionsAfter > 0);
        if (outcome.state === 'delivered' && submissionsAfter === 0) {
            submissionsAfter = 1;
        }
        var advanced = outcome.advanced || returned || improvedEngagement || improvedGrade || submissionsAfter > 0;
        var inactiveAfterContact = !returned;
        var worse = beforeLogs.length > 0 && afterLogs.length === 0;
        var stillRisk = !advanced || currentScore < 40;
        var category = advanced ? 'advanced' : worse ? 'worse' : 'same';
        if (advanced && currentScore < 40) {
            category = 'partial';
        }

        return {
            raw: intervention,
            name: name,
            first: firstName(name),
            email: email,
            reason: reasonLabel(intervention.intervention_reason),
            sent: sent,
            beforeScore: Math.round(beforeScore),
            afterScore: Math.round(afterScore),
            currentScore: Math.round(currentScore),
            beforeLogs: beforeLogs.length,
            afterLogs: afterLogs.length,
            returned: returned,
            firstReturn: firstReturn,
            submissionsAfter: submissionsAfter,
            gradeAfter: improvedGrade,
            improvedEngagement: improvedEngagement,
            advanced: advanced,
            inactiveAfterContact: inactiveAfterContact,
            worse: worse,
            stillRisk: stillRisk,
            category: category,
            outcomeState: outcome.state,
            outcomeLabel: outcome.label,
            trackedItems: trackedItemProgress(intervention, state)
        };
    }

    function analyse(interventions, state) {
        if (!Array.isArray(interventions)) {
            interventions = [];
        }
        return interventions
            .filter(function(item) { return item && item.status === 'sent' && Number(item.timesent || 0) > 0; })
            .map(function(item) { return analyseIntervention(item, state); });
    }

    function pct(count, total) {
        return total ? Math.round((count / total) * 100) : 0;
    }

    function kpi(label, value, sub, cls, tipKey) {
        if (!tipKey) {
            tipKey = kpiTipKeys[kpiTipCursor] || '';
            kpiTipCursor++;
        }
        if (!tipKey) {
            if (label === tr('tf_kpi_interventions_total', 'Interventions')) {
                tipKey = 'tf_tip_kpi_interventions';
            } else if (label === tr('tf_kpi_return', 'Return after contact')) {
                tipKey = 'tf_tip_kpi_return';
            } else if (label === tr('tf_kpi_engagement', 'Improved engagement')) {
                tipKey = 'tf_tip_kpi_engagement';
            } else if (label === tr('tf_kpi_grade', 'Improved grade')) {
                tipKey = 'tf_tip_kpi_grade';
            } else if (label === tr('tf_kpi_risk', 'Still at risk')) {
                tipKey = 'tf_tip_kpi_risk';
            }
        }
        return '<div class="tf-kpi ' + esc(cls || '') + '">'
            + '<div class="tf-kpi-label">' + esc(label) + helpTip(tipKey) + '</div>'
            + '<div class="tf-kpi-value">' + esc(value) + '</div>'
            + '<div class="tf-kpi-sub">' + esc(sub) + '</div>'
            + '</div>';
    }

    function cardHead(icon, labelKey, fallback, tipKey) {
        return '<div class="card-head">' + icon + ' ' + esc(tr(labelKey, fallback)) + helpTip(tipKey) + '</div>';
    }

    function helpTipNode(key, fallback) {
        var text = tr(key, fallback || '');
        if (!text) {
            return null;
        }
        var node = document.createElement('span');
        node.className = 'mwa-help-tip';
        node.setAttribute('tabindex', '0');
        node.setAttribute('role', 'img');
        node.setAttribute('aria-label', text);
        node.setAttribute('title', text);
        node.setAttribute('data-tooltip', text);
        node.textContent = '?';
        return node;
    }

    function ensureCardTooltips() {
        var items = [
            ['tf_chart_timeline', 'tf_tip_chart_timeline', 'Timeline: before and after'],
            ['tf_chart_bars', 'tf_tip_chart_bars', 'Intervention results'],
            ['tf_card_advanced', 'tf_tip_card_advanced', 'Who progressed'],
            ['tf_card_followup', 'tf_tip_card_followup', 'Pending follow-up'],
            ['tf_card_effective', 'tf_tip_card_effective', 'Most effective interventions'],
            ['tf_card_summary', 'tf_tip_card_summary', 'Teacher summary']
        ];
        var heads = Array.prototype.slice.call(document.querySelectorAll('#teacherFeedbackWrap .card-head'));
        items.forEach(function(item) {
            var label = tr(item[0], item[2]);
            heads.some(function(head) {
                if (head.textContent.indexOf(label) < 0 || head.querySelector('.mwa-help-tip')) {
                    return false;
                }
                var tip = helpTipNode(item[1]);
                if (tip) {
                    head.appendChild(tip);
                }
                return true;
            });
        });
    }

    function pill(text, cls) {
        return '<span class="tf-pill ' + esc(cls || '') + '">' + esc(text) + '</span>';
    }

    function studentKey(item) {
        return lower(item.email) || lower(item.name);
    }

    function groupStudents(items) {
        var grouped = {};
        items.forEach(function(item) {
            var key = studentKey(item);
            if (!key) {
                key = 'student-' + Object.keys(grouped).length;
            }
            if (!grouped[key]) {
                grouped[key] = {
                    name: item.name,
                    email: item.email,
                    reason: item.reason,
                    items: [],
                    interventions: 0,
                    advancedInterventions: 0,
                    returned: false,
                    accessed: false,
                    delivered: false,
                    pending: false,
                    pendingInterventions: 0,
                    gradeAfter: false,
                    improvedEngagement: false,
                    advanced: false,
                    submissionsAfter: 0,
                    firstReturn: item.firstReturn || null,
                    beforeScore: item.beforeScore || 0,
                    currentScore: item.currentScore || 0,
                    afterScore: item.afterScore || 0
                };
            }
            grouped[key].items.push(item);
            grouped[key].interventions++;
            if (item.outcomeState === 'pending' || !item.advanced) {
                grouped[key].pending = true;
                grouped[key].pendingInterventions++;
            } else {
                grouped[key].advancedInterventions++;
                grouped[key].returned = grouped[key].returned || !!item.returned;
                grouped[key].accessed = grouped[key].accessed || item.outcomeState === 'accessed';
                grouped[key].delivered = grouped[key].delivered || item.outcomeState === 'delivered' || item.submissionsAfter > 0;
                grouped[key].gradeAfter = grouped[key].gradeAfter || !!item.gradeAfter;
                grouped[key].improvedEngagement = grouped[key].improvedEngagement || !!item.improvedEngagement;
                grouped[key].advanced = true;
            }
            grouped[key].submissionsAfter += Number(item.submissionsAfter || 0);
            if (item.firstReturn && (!grouped[key].firstReturn || item.firstReturn < grouped[key].firstReturn)) {
                grouped[key].firstReturn = item.firstReturn;
            }
            grouped[key].beforeScore = Math.max(grouped[key].beforeScore, item.beforeScore || 0);
            grouped[key].currentScore = Math.max(grouped[key].currentScore, item.currentScore || 0);
            grouped[key].afterScore = Math.max(grouped[key].afterScore, item.afterScore || 0);
        });
        return Object.keys(grouped).map(function(key) {
            return grouped[key];
        }).sort(function(a, b) {
            return b.currentScore - a.currentScore || b.interventions - a.interventions || a.name.localeCompare(b.name);
        });
    }

    function statusChip(text, cls) {
        return '<span class="tf-status-chip ' + esc(cls || '') + '">' + esc(text) + '</span>';
    }

    function interventionLabel(count) {
        return count === 1 ? tr('tf_intervention_single', 'intervenção') : tr('tf_interventions_short', 'intervenções');
    }

    function returnedLabel(count) {
        return count === 1 ? tr('tf_returned_single', 'retornou') : tr('tf_returned_plural', 'retornaram');
    }

    /** Picks the singular or plural form of a summary metric label. */
    function metricLabel(count, key) {
        return count === 1 ? tr(key + '_single') : tr(key);
    }

    function statusForItem(item) {
        if (item.outcomeState === 'pending' || !item.advanced) {
            return 'pending';
        }
        if ((item.trackedItems || []).some(function(target) { return !target.done; })) {
            return 'partial';
        }
        if (!item.returned || !(item.outcomeState === 'delivered' || item.submissionsAfter > 0) || !item.gradeAfter) {
            return 'partial';
        }
        if (item.category === 'partial') {
            return 'partial';
        }
        return 'advanced';
    }

    function statusText(status) {
        if (status === 'pending') {
            return tr('tf_filter_status_pending', 'Pendente');
        }
        if (status === 'partial') {
            return tr('tf_filter_status_partial', 'Avanço parcial');
        }
        if (status === 'advanced') {
            return tr('tf_filter_status_advanced', 'Avançou');
        }
        return tr('tf_filter_all_statuses', 'Todos os status');
    }

    function groupStatus(item) {
        if (item.pending && item.advancedInterventions > 0) {
            return 'partial';
        }
        if (item.pending || !item.advanced) {
            return 'pending';
        }
        return 'advanced';
    }

    function rowsForType(item, type) {
        var rows = item.items || [];
        if (type === 'risk') {
            return rows.filter(function(row) {
                return statusForItem(row) === 'pending';
            });
        }
        return rows.filter(function(row) {
            return statusForItem(row) !== 'pending';
        });
    }

    function statusForRows(rows, type) {
        if (type === 'risk') {
            return 'pending';
        }
        if (rows.some(function(row) { return statusForItem(row) === 'partial'; })) {
            return 'partial';
        }
        return 'advanced';
    }

    function itemTargetsText(item) {
        var targets = parseTargets(item.raw || {});
        if (!targets.length) {
            return '-';
        }
        return targets.map(function(target) {
            return norm(target.name || target.title || '');
        }).filter(Boolean).join(', ') || '-';
    }

    function yesNoValue(value) {
        return '<strong class="tf-yn ' + (value ? 'yes' : 'no') + '">'
            + esc(value ? tr('tf_yes', 'Sim') : tr('tf_no', 'Nao')) + '</strong>';
    }

    function trackedItemsHtml(item) {
        var targets = item.trackedItems || [];
        if (!targets.length) {
            return '';
        }
        return '<div class="tf-targets"><small>' + esc(tr('tf_detail_targets', 'Itens acompanhados')) + '</small>'
            + '<div class="tf-target-list">' + targets.map(function(target) {
                return '<span class="tf-target-chip ' + (target.done ? 'done' : 'pending') + '">'
                    + esc(target.name) + '</span>';
            }).join('') + '</div></div>';
    }

    function renderStudentDetail(item, type) {
        var interventions = rowsForType(item, type);
        var returned = interventions.some(function(row) { return !!row.returned; });
        var delivered = interventions.some(function(row) { return row.outcomeState === 'delivered' || row.submissionsAfter > 0; });
        var gradeAfter = interventions.some(function(row) { return !!row.gradeAfter; });
        var firstReturn = null;
        interventions.forEach(function(row) {
            if (row.firstReturn && (!firstReturn || row.firstReturn < firstReturn)) {
                firstReturn = row.firstReturn;
            }
        });
        var delay = firstReturn ? formatDuration(firstReturn - Number((interventions[0] && interventions[0].sent) || 0)) : '-';
        var rows = interventions.map(function(row) {
            var state = statusForItem(row);
            return '<div class="tf-detail-intervention">'
                + '<div><strong>' + esc(formatDate(row.sent)) + '</strong><span>' + esc(row.reason || '-') + '</span></div>'
                + '<div><span class="tf-status-chip ' + (state === 'pending' ? 'red' : state === 'partial' ? 'blue' : 'green') + '">' + esc(statusText(state)) + '</span></div>'
                + trackedItemsHtml(row)
                + '</div>';
        }).join('');
        return '<div class="tf-student-detail">'
            + '<div class="tf-detail-grid">'
            + '<div><small>' + esc(tr('tf_detail_interventions', 'Intervenções recebidas')) + '</small><strong>' + interventions.length + ' ' + esc(interventionLabel(interventions.length)) + '</strong></div>'
            + '<div><small>' + esc(tr('tf_detail_accessed_after', 'Acessou depois')) + '</small>' + yesNoValue(returned) + '</div>'
            + '<div><small>' + esc(tr('tf_detail_delivered', 'Entregou algo')) + '</small>' + yesNoValue(delivered) + '</div>'
            + '<div><small>' + esc(tr('tf_detail_grade', 'Melhorou nota')) + '</small>' + yesNoValue(gradeAfter) + '</div>'
            + '<div><small>' + esc(tr('tf_detail_reaction_time', 'Tempo para reagir')) + '</small><strong>' + esc(delay) + '</strong></div>'
            + '</div>'
            + '<div class="tf-detail-history">' + rows + '</div>'
            + '</div>';
    }

    function renderStudentList(items, type, alreadyGrouped) {
        if (!items.length) {
            return '<div class="tf-empty-small">' + esc(tr('tf_none', 'Nenhum aluno neste grupo.')) + '</div>';
        }
        var grouped = alreadyGrouped ? items : groupStudents(items);
        var visible = grouped.slice(0, 6);
        var hidden = grouped.slice(6);
        function row(item) {
            var chips = [];
            var rows = rowsForType(item, type);
            var count = rows.length;
            var studentStatus = statusForRows(rows, type);
            chips.push(statusChip(count + ' ' + interventionLabel(count), 'neutral'));
            if (type === 'risk' && item.pending) {
                chips.push(statusChip(tr('int_result_pending', 'Pendente'), 'red'));
            } else {
                if (rows.some(function(entry) { return !!entry.returned; })) {
                    chips.push(statusChip(tr('tf_returned_short', 'retornou'), 'blue'));
                }
                if (rows.some(function(entry) { return !!entry.improvedEngagement; })) {
                    chips.push(statusChip(tr('tf_improved_engagement_short', 'melhorou engajamento'), 'green'));
                }
                if (rows.some(function(entry) { return !!entry.gradeAfter; })) {
                    chips.push(statusChip(tr('tf_improved_grade_short', 'melhorou nota'), 'green'));
                }
                if (!rows.some(function(entry) { return !!entry.returned; })) {
                    chips.push(statusChip(tr('tf_still_risk_short', 'Ainda em risco'), 'red'));
                }
            }
            return '<details class="tf-student-item"><summary>'
                + '<div class="tf-student-row">'
                + '<div class="tf-student-main"><span class="tf-student-dot ' + esc(studentStatus) + '" title="' + esc(statusText(studentStatus)) + '"></span><div><strong>' + esc(item.name) + '</strong><small>' + esc(item.reason || '') + '</small></div></div>'
                + '<div class="tf-status-list">' + chips.join('') + '</div>'
                + '</div>'
                + '</summary>' + renderStudentDetail(item, type) + '</details>';
        }
        return '<div class="tf-student-list">' + visible.map(row).join('')
            + (hidden.length ? '<details class="tf-more-list"><summary>' + esc(tr('tf_show_all', 'Exibir todos')) + ' (' + grouped.length + ')</summary>' + hidden.map(row).join('') + '</details>' : '')
            + '</div>';
    }

    function option(value, label, selected) {
        return '<option value="' + esc(value) + '"' + (selected ? ' selected' : '') + '>' + esc(label) + '</option>';
    }

    function uniqueSorted(items, field) {
        var seen = {};
        items.forEach(function(item) {
            var value = norm(item[field]);
            if (value) {
                seen[value] = true;
            }
        });
        return Object.keys(seen).sort(function(a, b) { return a.localeCompare(b); });
    }

    function renderFilters(items) {
        var reasons = uniqueSorted(items, 'reason');
        var students = uniqueSorted(items, 'name');
        return '<div class="tf-filter-panel">'
            + '<div class="tf-filter-field"><label>' + esc(tr('tf_filter_period', 'Período')) + '</label><select id="tfFilterPeriod">'
            + option('all', tr('tf_filter_all_periods', 'Todo o período'), filterState.period === 'all')
            + option('7', tr('tf_filter_7d', 'Últimos 7 dias'), filterState.period === '7')
            + option('30', tr('tf_filter_30d', 'Últimos 30 dias'), filterState.period === '30')
            + option('90', tr('tf_filter_90d', 'Últimos 90 dias'), filterState.period === '90')
            + '</select></div>'
            + '<div class="tf-filter-field"><label>' + esc(tr('tf_filter_reason', 'Motivo')) + '</label><select id="tfFilterReason">'
            + option('all', tr('tf_filter_all_reasons', 'Todos os motivos'), filterState.reason === 'all')
            + reasons.map(function(reason) { return option(reason, reason, filterState.reason === reason); }).join('')
            + '</select></div>'
            + '<div class="tf-filter-field"><label>' + esc(tr('tf_filter_status', 'Status')) + '</label><select id="tfFilterStatus">'
            + option('all', tr('tf_filter_all_statuses', 'Todos os status'), filterState.status === 'all')
            + option('advanced', tr('tf_filter_status_advanced', 'Avançou'), filterState.status === 'advanced')
            + option('partial', tr('tf_filter_status_partial', 'Avanço parcial'), filterState.status === 'partial')
            + option('pending', tr('tf_filter_status_pending', 'Pendente'), filterState.status === 'pending')
            + '</select></div>'
            + '<div class="tf-filter-field"><label>' + esc(tr('tf_filter_student')) + '</label><input id="tfFilterStudent" type="search" list="tfStudentOptions" value="' + esc(filterState.student) + '" placeholder="' + esc(tr('tf_filter_student_placeholder')) + '">'
            + '<datalist id="tfStudentOptions">' + students.map(function(name) { return option(name, name, false); }).join('') + '</datalist></div>'
            + '<button type="button" id="tfClearFilters" class="tf-clear-filters">' + esc(tr('clearfilters', 'Limpar filtros')) + '</button>'
            + '</div>';
    }

    function applyFilters(items) {
        var now = Math.floor(Date.now() / 1000);
        var period = filterState.period === 'all' ? 0 : parseInt(filterState.period || 0, 10);
        var student = lower(filterState.student);
        return items.filter(function(item) {
            if (period && Number(item.sent || 0) < now - (period * 86400)) {
                return false;
            }
            if (filterState.reason !== 'all' && item.reason !== filterState.reason) {
                return false;
            }
            if (filterState.status !== 'all' && statusForItem(item) !== filterState.status) {
                return false;
            }
            if (student && lower(item.name + ' ' + item.email).indexOf(student) < 0) {
                return false;
            }
            return true;
        });
    }

    function renderReasonRanking(items) {
        var byReason = {};
        items.forEach(function(item) {
            if (!byReason[item.reason]) {
                byReason[item.reason] = {total: 0, advanced: 0, returned: 0};
            }
            byReason[item.reason].total++;
            if (item.advanced) {
                byReason[item.reason].advanced++;
            }
            if (item.returned) {
                byReason[item.reason].returned++;
            }
        });
        var rows = Object.keys(byReason).map(function(reason) {
            var data = byReason[reason];
            return {reason: reason, total: data.total, rate: pct(data.advanced, data.total), returned: data.returned};
        }).sort(function(a, b) { return b.rate - a.rate || b.total - a.total; });
        if (!rows.length) {
            return '<div class="tf-empty-small">' + esc(tr('tf_no_reason_data', 'Sem motivos suficientes para ranquear.')) + '</div>';
        }
        return rows.map(function(row) {
            return '<div class="tf-rank-row">'
                + '<div><strong>' + esc(row.reason) + '</strong><span>' + row.returned + ' ' + esc(returnedLabel(row.returned)) + ' · ' + row.total + ' ' + esc(interventionLabel(row.total)) + '</span></div>'
                + '<div class="tf-rank-bar"><i style="width:' + row.rate + '%"></i></div>'
                + '<b>' + row.rate + '%</b>'
                + '</div>';
        }).join('');
    }

    function renderSummary(items) {
        var grouped = groupStudents(items);
        var total = items.length;
        var unique = grouped.length;
        var returned = grouped.filter(function(i) { return i.returned; }).length;
        var delivered = grouped.filter(function(i) { return i.delivered; }).length;
        var grade = grouped.filter(function(i) { return i.gradeAfter; }).length;
        var noResponse = grouped.filter(function(i) { return i.pending; }).length;
        var returnRate = pct(returned, unique);
        var deliveryRate = pct(delivered, unique);
        var gradeRate = pct(grade, unique);
        var pendingText = noResponse ?
            esc(tr('tf_summary_pending_prefix', 'Ainda há')) + ' ' + noResponse + ' ' + esc(tr('tf_summary_pending_suffix', 'aluno(s) pendente(s). Isso indica que parte dos contatos ainda não gerou evidência de retorno, acesso, entrega ou nota.')) :
            esc(tr('tf_summary_no_pending_text', 'No momento, não há alunos pendentes após contato. Mantenha o acompanhamento para confirmar se o avanço se sustenta nos próximos acessos.'));
        return '<div class="tf-summary-lead">'
            + '<strong>' + esc(tr('tf_summary_reading_title', 'Leitura pedagógica')) + '</strong>'
            + '<span>' + esc(tr('tf_summary_reading_prefix', 'Foram registradas')) + ' <strong>' + total + '</strong> ' + esc(tr('tf_interventions_short', 'intervenções')) + ' '
            + esc(tr('tf_summary_reading_middle', 'envolvendo')) + ' <strong>' + unique + '</strong> ' + esc(tr('tf_summary_unique_students_suffix', 'aluno(s) único(s).')) + '</span>'
            + '</div>'
            + '<div class="tf-summary-metrics">'
            + '<span class="blue"><b>' + returned + '</b>' + esc(metricLabel(returned, 'tf_summary_returned_metric')) + '<small>' + returnRate + '%</small></span>'
            + '<span class="green"><b>' + delivered + '</b>' + esc(metricLabel(delivered, 'tf_summary_delivered_metric')) + '<small>' + deliveryRate + '%</small></span>'
            + '<span class="green"><b>' + grade + '</b>' + esc(metricLabel(grade, 'tf_summary_grade_metric')) + '<small>' + gradeRate + '%</small></span>'
            + '<span class="red"><b>' + noResponse + '</b>' + esc(metricLabel(noResponse, 'tf_summary_pending_metric')) + '</span>'
            + '</div>'
            + '<p><strong>' + esc(tr('tf_summary_impact_title', 'Impacto observado')) + ':</strong> '
            + '<strong>' + returned + '</strong> ' + esc(tr('tf_summary_impact_returned', 'aluno(s) voltaram a acessar o Moodle,')) + ' '
            + '<strong>' + delivered + '</strong> ' + esc(tr('tf_summary_impact_delivered', 'realizaram entregas e')) + ' '
            + '<strong>' + grade + '</strong> ' + esc(tr('tf_summary_impact_grade', 'tiveram novo registro de nota ou desempenho após a intervenção.')) + '</p>'
            + '<p><strong>' + esc(tr('tf_summary_pending_title', 'Ponto de atenção')) + ':</strong> ' + pendingText + '</p>'
            + '<p><strong>' + esc(tr('tf_summary_next_title', 'Próxima ação sugerida')) + ':</strong> '
            + esc(noResponse ? tr('tf_summary_next_pending', 'priorize uma nova mensagem curta e contextualizada para os pendentes, citando a atividade ou conteúdo aberto que ainda falta concluir.')
                : tr('tf_summary_next_monitor', 'acompanhe se os alunos que responderam mantêm acesso, entrega e evolução de nota nos próximos dias.')) + '</p>'
            + '<p class="tf-summary-note">' + esc(tr('tf_summary_note', 'Quando um aluno tem mais de uma intervenção, o resumo consolida por aluno único; já os gráficos de resultado contam cada intervenção separadamente.')) + '</p>';
    }

    function renderCharts(items) {
        if (!window.Chart) {
            return;
        }
        var trendEl = document.getElementById('tfTrendChart');
        var barsEl = document.getElementById('tfBarsChart');
        if (trendChart) { trendChart.destroy(); }
        if (barsChart) { barsChart.destroy(); }

        var grouped = groupStudents(items);
        function chartPair(item) {
            var current = Number(item.currentScore || item.afterScore || 0);
            var rawBefore = Math.min(Number(item.beforeScore || current || 0), current || 100);
            var lift = 0;
            if (item.returned) {
                lift += 10;
            }
            if (item.improvedEngagement) {
                lift += 15;
            }
            if (item.delivered) {
                lift += 10;
            }
            if (item.gradeAfter) {
                lift += 10;
            }
            lift = Math.min(lift, 45);
            var before = lift ? Math.max(0, Math.min(rawBefore, current - Math.round(lift * 0.65))) : rawBefore;
            var after = lift ? Math.min(100, Math.max(current, before + lift)) : current;
            return {before: before, after: after};
        }
        var beforeAvg = grouped.length ? Math.round(grouped.reduce(function(sum, i) { return sum + chartPair(i).before; }, 0) / grouped.length) : 0;
        var afterAvg = grouped.length ? Math.round(grouped.reduce(function(sum, i) { return sum + chartPair(i).after; }, 0) / grouped.length) : 0;
        /* Continua contando por INTERVENCAO (como o texto de ajuda do card
           ja explica), mas agora usa statusForItem() -- a MESMA funcao que
           decide os chips "Avanco parcial"/"Avancou" mostrados no detalhe
           de cada aluno. Antes usava item.category, um criterio proprio
           que podia divergir do que a tela mostra (por isso uma aluna com
           avanco parcial no card podia sumir do grafico). */
        var advanced = 0, partial = 0, inactive = 0;
        items.forEach(function(item) {
            if (item.inactiveAfterContact || statusForItem(item) === 'pending') {
                inactive++;
            } else if (statusForItem(item) === 'partial') {
                partial++;
            } else {
                advanced++;
            }
        });

        if (trendEl) {
            trendChart = new Chart(trendEl, {
                type: 'line',
                data: {
                    labels: [tr('rp_before', 'Antes'), tr('rp_after', 'Depois')],
                    datasets: [{label: tr('tf_avg_engagement', 'Engajamento médio'), data: [beforeAvg, afterAvg], borderColor: '#5b9bd5', backgroundColor: 'rgba(91,155,213,.12)', fill: true, tension: .35}]
                },
                options: {maintainAspectRatio: false, scales: {y: {beginAtZero: true, max: 100}}}
            });
        }
        if (barsEl) {
            barsChart = new Chart(barsEl, {
                type: 'bar',
                data: {
                    labels: [tr('tf_advanced', 'Avançaram'), tr('tf_partial', 'Avanço parcial'), tr('tf_pending_after_contact', 'Continuam pendentes')],
                    datasets: [{data: [advanced, partial, inactive], backgroundColor: ['#5fb37d', '#6f9bdc', '#d96b63'], borderRadius: 6, barPercentage: 0.55, categoryPercentage: 0.7}]
                },
                options: {
                    indexAxis: 'y',
                    maintainAspectRatio: false,
                    plugins: {legend: {display: false}},
                    scales: {x: {beginAtZero: true, precision: 0, ticks: {precision: 0}}, y: {grid: {display: false}}}
                }
            });
        }
    }

    function renderWithData(items) {
        var box = document.getElementById('teacherFeedbackWrap');
        if (!box) {
            return;
        }
        var filtered = applyFilters(items);
        if (!filtered.length) {
            Store.renderHtml(box, renderFilters(items)
                + '<div class="tf-empty-filter">' + esc(tr('tf_filter_empty', 'Nenhuma intervenção encontrada com os filtros selecionados.')) + '</div>');
            bindFilters();
            return;
        }
        var total = filtered.length;
        var grouped = groupStudents(filtered);
        var totalStudents = grouped.length;
        var returned = grouped.filter(function(i) { return i.returned; }).length;
        var improvedEng = grouped.filter(function(i) { return i.improvedEngagement; }).length;
        var improvedGrade = grouped.filter(function(i) { return i.gradeAfter; }).length;
        var stillRisk = grouped.filter(function(i) { return i.pending; }).length;
        var advanced = grouped.filter(function(i) { return i.advancedInterventions > 0; }).sort(function(a, b) { return b.afterScore - a.afterScore; });
        var needContact = grouped.filter(function(i) { return i.pending; }).sort(function(a, b) { return a.currentScore - b.currentScore; });
        kpiTipCursor = 0;

        var html = renderFilters(items)
            + '<div class="tf-filter-count">' + esc(tr('tf_filter_count_prefix', 'Exibindo')) + ' ' + filtered.length + ' ' + esc(tr('tf_filter_count_suffix', 'intervenção(ões) no recorte.')) + '</div>'
            + '<div class="tf-kpi-row">'
            + kpi(tr('tf_kpi_interventions_total', 'Intervenções'), total, tr('tf_messages_sent', 'mensagens enviadas'), 'blue')
            + kpi(tr('tf_kpi_return', 'Retorno após contato'), pct(returned, totalStudents) + '%', returned + ' ' + tr('tf_unique_students', 'alunos únicos'), 'blue')
            + kpi(tr('tf_kpi_engagement', 'Melhoraram engajamento'), pct(improvedEng, totalStudents) + '%', improvedEng + ' ' + tr('tf_unique_students', 'alunos únicos'), 'green')
            + kpi(tr('tf_kpi_grade', 'Melhoraram nota'), pct(improvedGrade, totalStudents) + '%', improvedGrade + ' ' + tr('tf_unique_students', 'alunos únicos'), 'green')
            + kpi(tr('tf_kpi_risk', 'Ainda em risco'), pct(stillRisk, totalStudents) + '%', stillRisk + ' ' + tr('tf_pending_unique_students', 'alunos pendentes'), 'red')
            + '</div>'
            + '<div class="tf-chart-grid">'
            + '<div class="card"><div class="card-head">' + esc(tr('tf_chart_timeline', 'Linha do tempo: antes e depois')) + '</div><div class="tf-chart"><canvas id="tfTrendChart"></canvas></div></div>'
            + '<div class="card"><div class="card-head">' + esc(tr('tf_chart_bars', 'Resultado das intervenções')) + '</div><div class="tf-chart"><canvas id="tfBarsChart"></canvas></div></div>'
            + '</div>'
            + '<div class="tf-card-grid">'
            + '<div class="card"><div class="card-head">&#9989; ' + esc(tr('tf_card_advanced', 'Quem avançou')) + '</div><div class="card-body">' + renderStudentList(advanced, 'advanced', true)
            + '<div class="tf-target-legend"><strong>' + esc(tr('tf_detail_targets', 'Itens acompanhados')) + ':</strong><span><i class="tf-legend-dot red"></i>' + esc(tr('tf_legend_pending', 'Pendência')) + '</span><span><i class="tf-legend-dot green"></i>' + esc(tr('tf_legend_done', 'Concluído')) + '</span></div>'
            + '</div></div>'
            + '<div class="card"><div class="card-head">&#128276; ' + esc(tr('tf_card_followup', 'Pendentes de acompanhamento')) + '</div><div class="card-body">' + renderStudentList(needContact, 'risk', true) + '</div></div>'
            + '<div class="card"><div class="card-head">&#127942; ' + esc(tr('tf_card_effective', 'Intervenções mais efetivas')) + '</div><div class="card-body">' + renderReasonRanking(filtered) + '</div></div>'
            + '<div class="card"><div class="card-head">&#128221; ' + esc(tr('tf_card_summary', 'Resumo para o professor')) + '</div><div class="card-body"><div class="tf-summary">' + renderSummary(filtered) + '</div>'
            + '<div class="tf-summary-tags">' + pill(total + ' ' + interventionLabel(total), 'blue') + pill(returned + ' ' + returnedLabel(returned), 'green') + pill(stillRisk + ' ' + tr('tf_risk_short', 'em risco'), 'red') + '</div></div></div>'
            + '</div>';

        Store.renderHtml(box, html);
        ensureCardTooltips();
        bindFilters();
        renderCharts(filtered);
    }

    function bindFilters() {
        var period = document.getElementById('tfFilterPeriod');
        var reason = document.getElementById('tfFilterReason');
        var status = document.getElementById('tfFilterStatus');
        var student = document.getElementById('tfFilterStudent');
        var clear = document.getElementById('tfClearFilters');
        var studentTimer = null;
        function refresh(focusStudent) {
            renderWithData(currentData);
            if (focusStudent) {
                var next = document.getElementById('tfFilterStudent');
                if (next) {
                    next.focus();
                    next.setSelectionRange(next.value.length, next.value.length);
                }
            }
        }
        if (period) {
            period.addEventListener('change', function() {
                filterState.period = period.value || 'all';
                refresh(false);
            });
        }
        if (reason) {
            reason.addEventListener('change', function() {
                filterState.reason = reason.value || 'all';
                refresh(false);
            });
        }
        if (status) {
            status.addEventListener('change', function() {
                filterState.status = status.value || 'all';
                refresh(false);
            });
        }
        if (student) {
            student.addEventListener('input', function() {
                filterState.student = student.value || '';
                if (studentTimer) {
                    clearTimeout(studentTimer);
                }
                studentTimer = setTimeout(function() {
                    refresh(true);
                }, 180);
            });
        }
        if (clear) {
            clear.addEventListener('click', function() {
                filterState = {period: 'all', reason: 'all', status: 'all', student: ''};
                refresh(false);
            });
        }
    }

    function renderEmpty() {
        var box = document.getElementById('teacherFeedbackWrap');
        if (!box) {
            return;
        }
        Store.renderHtml(box, '<div class="gr-empty"><div class="gr-empty-icon">&#128200;</div><p>' + esc(tr('tf_no_data', 'Envie intervenções para ver a efetividade pedagógica aqui.')) + '</p></div>');
    }

    function loadInterventions() {
        var cfg = Store.getConfig ? Store.getConfig() : {};
        var courseid = parseInt(cfg.courseid || 0, 10) || 0;
        if (!courseid || !Store.callAction) {
            return Promise.resolve([]);
        }
        return Store.callAction('block_mwa_dashboard_get_interventions', {courseid: courseid}).then(function(result) {
            if (!result || !result.interventions) {
                return [];
            }
            if (Array.isArray(result.interventions)) {
                return result.interventions;
            }
            try {
                var parsed = JSON.parse(result.interventions || '[]');
                return Array.isArray(parsed) ? parsed : [];
            } catch (ignore) {
                return [];
            }
        }).catch(function() {
            return [];
        });
    }

    function render() {
        var dashboard = (Store.getModule && Store.getModule('MWADashboard')) || window.MWADashboard || {};
        var state = dashboard.state || {};
        var box = document.getElementById('teacherFeedbackWrap');
        if (!box) {
            return;
        }
        try {
            Store.renderHtml(box, '<div class="empty"><div class="spinner"></div><p>' + esc(tr('tf_loading', 'Analisando efetividade das intervenções...')) + '</p></div>');
            loadInterventions().then(function(interventions) {
                try {
                    currentData = analyse(interventions, state);
                    if (!currentData.length) {
                        renderEmpty();
                        return;
                    }
                    renderWithData(currentData);
                } catch (innerError) {
                    renderEmpty();
                }
            }).catch(function() {
                renderEmpty();
            });
        } catch (error) {
            renderEmpty();
        }
    }

    return {
        render: render
    };
});
