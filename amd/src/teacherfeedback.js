// This file is part of Moodle - http://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Follow-up report based exclusively on intervention snapshots and later Moodle data.
 *
 * @module     block_mwa_dashboard/teacherfeedback
 * @copyright  2026 Bruno Porto
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
define(['block_mwa_dashboard/dashboardstore'], function(Store) {
    'use strict';

    var data = [];
    var activeTab = 'overview';
    var aiReport = '';
    var aiReportError = '';
    var aiReportLoading = false;
    var filters = {from: '', to: '', reason: 'all', teacher: 'all', student: 'all'};
    var DAY = 86400;
    var REASONS = ['never', 'low', 'pending', 'difficult', 'other'];

    function tr(key) {
        var S = Store.getStrings() || {};
        var v = Object.prototype.hasOwnProperty.call(S, key) ? S[key] : '';
        if (typeof v === 'string' && v && !/^\[\[.*\]\]$/.test(v)) { return v; }
        return key;
    }

    var REASON_META = {
        never: {label: function() { return tr('int_motivo_never'); }, icon: 'ban', color: '#e5484d'},
        low: {label: function() { return tr('int_motivo_low'); }, icon: 'pulse', color: '#1769e0'},
        pending: {label: function() { return tr('int_motivo_pending'); }, icon: 'document', color: '#f28c00'},
        difficult: {label: function() { return tr('int_motivo_difficult'); }, icon: 'bars', color: '#198754'},
        other: {label: function() { return tr('int_motivo_other'); }, icon: 'bubble', color: '#7030a0'}
    };

    function svg(name, size) {
        var paths = {
            users: '<circle cx="8" cy="8" r="3"/><circle cx="17" cy="8" r="3"/><path d="M2 20v-2a6 6 0 0 1 12 0v2M12 14.2A6 6 0 0 1 23 18v2"/>',
            refresh: '<path d="M20 7v5h-5M4 17v-5h5"/><path d="M6.1 8a7 7 0 0 1 11.7-1L20 12M4 12l2.2 5a7 7 0 0 0 11.7-1"/>',
            target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1"/><path d="M12 1v3M12 20v3M1 12h3M20 12h3"/>',
            hourglass: '<path d="M7 3h10M7 21h10M8 3c0 4 1 6 4 9-3 3-4 5-4 9M16 3c0 4-1 6-4 9 3 3 4 5 4 9"/>',
            close: '<path d="M5 5l14 14M19 5L5 19"/>',
            trend: '<path d="M3 17l6-6 4 4 8-9M16 6h5v5"/>',
            grid: '<rect x="3" y="4" width="18" height="16" rx="1"/><path d="M3 9h18M8 4v16"/>',
            engagement: '<circle cx="8" cy="8" r="3"/><circle cx="17" cy="7" r="2"/><path d="M2 19a6 6 0 0 1 12 0M14 13a5 5 0 0 1 8 4"/>',
            learning: '<path d="M3 7l9-4 9 4-9 4-9-4zM6 9v6c4 3 8 3 12 0V9"/>',
            interaction: '<path d="M4 5h12a3 3 0 0 1 3 3v5a3 3 0 0 1-3 3H9l-5 4v-4a3 3 0 0 1-2-3V8a3 3 0 0 1 2-3z"/><path d="M7 10h1M11 10h1M15 10h1"/>',
            permanence: '<path d="M7 7h10l-2-2M17 17H7l2 2M19 7l2 2-2 2M5 17l-2-2 2-2"/>',
            mediation: '<circle cx="7" cy="8" r="3"/><circle cx="17" cy="8" r="3"/><path d="M1 20v-2a5 5 0 0 1 10 0v2M13 20v-2a5 5 0 0 1 10 0v2M10 12h4"/>',
            trajectory: '<path d="M5 20V9M12 20V4M19 20v-7M3 20h18M4 5l4 2 4-4 5 4 4-3"/>',
            download: '<path d="M12 3v12M7 10l5 5 5-5M4 18v3h16v-3"/>',
            filter: '<path d="M3 5h18l-7 8v6l-4 2v-8L3 5z"/>',
            calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18"/>',
            info: '<circle cx="12" cy="12" r="10"/><path d="M12 11v6M12 7h.01"/>',
            shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6l8-3zM8 12l3 3 5-6"/>',
            person: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
            message: '<path d="M4 4h16v12H8l-4 4V4z"/><path d="M8 9h1M12 9h1M16 9h1"/>',
            ban: '<circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/>',
            pulse: '<path d="M3 13h4l2-7 4 13 3-8 2 2h3"/>',
            document: '<path d="M6 3h9l4 4v14H6zM14 3v5h5M9 12h6M9 16h6"/>',
            bars: '<path d="M5 20v-6M12 20V8M19 20V4M3 20h18"/>',
            bubble: '<path d="M4 4h16v13H8l-4 4V4z"/>',
            clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
            check: '<circle cx="12" cy="12" r="9"/><path d="M8 12l3 3 5-6"/>',
            checkmark: '<path d="M7 12l3 3 7-7"/>',
            bang: '<path d="M12 6v8M12 18h.01"/>',
            exclamation: '<circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 17h.01"/>',
            stopwatch: '<circle cx="12" cy="13" r="8"/><path d="M12 9v5l3-2M9 2h6M12 2v3M18 6l2-2"/>',
            login: '<path d="M10 5H5v14h5M14 8l4 4-4 4M8 12h10"/>',
            sparkles: '<path d="M12 3l1.4 3.6L17 8l-3.6 1.4L12 13l-1.4-3.6L7 8l3.6-1.4L12 3zM19 14l.8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8L19 14zM5 13l.8 2.2L8 16l-2.2.8L5 19l-.8-2.2L2 16l2.2-.8L5 13z"/>'
        };
        return '<svg class="fr-svg fr-svg-' + esc(name) + '" width="' + (size || 20) + '" height="' + (size || 20) +
            '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
            (paths[name] || paths.info) + '</svg>';
    }

    function esc(value) {
        return String(value === undefined || value === null ? '' : value)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function norm(value) {
        return String(value === undefined || value === null ? '' : value).trim();
    }

    function lower(value) {
        return norm(value).toLowerCase();
    }

    function number(value) {
        if (value === '' || value === null || value === undefined) {
            return null;
        }
        var parsed = Number(value);
        return isNaN(parsed) ? null : parsed;
    }

    function round(value, decimals) {
        var factor = Math.pow(10, decimals || 0);
        return Math.round(value * factor) / factor;
    }

    function pct(value, total) {
        return total > 0 ? Math.round(value * 100 / total) : null;
    }

    function pctText(value, total) {
        var result = pct(value, total);
        return result === null ? '—' : result + '%';
    }

    function timestamp(log) {
        return Number(log && (log._ts || log.timecreated || 0)) || 0;
    }

    function reasonBucket(value) {
        var text = lower(value).normalize ? lower(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '') : lower(value);
        if (text.indexOf('nunca') >= 0 || text.indexOf('never') >= 0) { return 'never'; }
        if (text.indexOf('particip') >= 0 || text.indexOf('engaj') >= 0 || text.indexOf('acesso') >= 0 ||
                text.indexOf('evas') >= 0 || text.indexOf('reeng') >= 0) { return 'low'; }
        if (text.indexOf('pend') >= 0 || text.indexOf('entrega') >= 0 || text.indexOf('tarefa') >= 0) { return 'pending'; }
        if (text.indexOf('dific') >= 0 || text.indexOf('nota') >= 0 || text.indexOf('desempenho') >= 0) { return 'difficult'; }
        return 'other';
    }

    function parseSnapshot(row) {
        try {
            var parsed = JSON.parse(row.snapshot_data || '{}');
            return parsed && typeof parsed === 'object' ? parsed : {};
        } catch (ignore) {
            return {};
        }
    }

    function courseTotalGrade(data) {
        if (!data || data.gradeMetric !== 'course_total_points') { return null; }
        return number(data.courseTotalGrade);
    }

    function studentKey(row) {
        return Number(row.userid || 0) ? 'id:' + Number(row.userid) : 'email:' + lower(row.student_email || row.email || row.name);
    }

    function logMatches(log, row) {
        var logid = Number(log._userid || log.userid || log.relateduserid || 0);
        if (Number(row.userid || 0) && logid) { return Number(row.userid) === logid; }
        var email = lower(log.email);
        var name = lower(log.nomecompleto || log.student_name || log.userfullname);
        return (email && email === lower(row.student_email)) || (name && name === lower(row.student_name));
    }

    function findStudent(row, state) {
        var userid = Number(row.userid || 0);
        var email = lower(row.student_email);
        var name = lower(row.student_name);
        return (state.students || []).filter(function(student) {
            return (userid && Number(student.userid || 0) === userid) ||
                (email && lower(student.email) === email) || (name && lower(student.name) === name);
        })[0] || null;
    }

    function currentEngagement(row) {
        var studentValue = row && row.current ? number(row.current.score) : null;
        if (studentValue !== null) { return studentValue; }
        return row && row.currentIndicator ? number(row.currentIndicator.engagement) : null;
    }

    function eventText(log) {
        return lower([log.nomedoevento, log.eventname, log.action, log.componente, log.component,
            log.contextodoevento, log.eventcontext].join(' '));
    }

    function isAcademicAction(log) {
        var text = eventText(log);
        return isLearningModuleAccess(log) || isSubmission(log) ||
            /submit|submitted|submission|attempt|tentativa|completed|completion|conclu|graded|grade|avaliad|entrega|enviad|post created|discussion created/.test(text);
    }

    function isSubmission(log) {
        var text = eventText(log);
        return /submit|submitted|submission|attempt submitted|completed|completion|conclu|entrega|post created|discussion created/.test(text);
    }

    function isResourceAccess(log) {
        var module = lower(log && (log._modtype || log.modtype || log.module || ''));
        var component = lower(log && (log.component || log.componente || '')).replace(/^mod_/, '');
        if (!module) { module = component; }
        if (module === 'file' || module === 'arquivo') { module = 'resource'; }
        if (['resource', 'page', 'url', 'book', 'folder', 'imscp', 'wiki'].indexOf(module) < 0) { return false; }
        return /view|visualiz|open|abert|access|acess|read|leitur/.test(eventText(log));
    }

    function isLearningModuleAccess(log) {
        var module = lower(log && (log._modtype || log.modtype || log.module || ''));
        var rawComponent = lower(log && (log.component || log.componente || ''));
        var component = rawComponent.replace(/^mod_/, '');
        if (!module) { module = component; }
        if (!/view|visualiz|open|abert|access|acess|read|leitur/.test(eventText(log))) { return false; }
        if (!module || ['course', 'core', 'system', 'user', 'label'].indexOf(module) >= 0) { return false; }
        return rawComponent.indexOf('mod_') === 0 || [
            'resource', 'file', 'page', 'url', 'book', 'folder', 'imscp',
            'assign', 'assignment', 'quiz', 'forum', 'lesson', 'h5pactivity', 'scorm', 'choice',
            'choicegroup', 'groupselect', 'glossary', 'workshop', 'data', 'chat', 'feedback', 'survey',
            'questionnaire', 'game', 'attendance', 'board', 'journal', 'vpl', 'bigbluebuttonbn', 'webconf'
        ].indexOf(module) >= 0;
    }

    function parseTargets(row) {
        try {
            var parsed = JSON.parse(row.target_items || '[]');
            return Array.isArray(parsed) ? parsed : [];
        } catch (ignore) {
            return [];
        }
    }

    function sameTarget(log, target) {
        var cmid = Number(log.cmid || log._cmid || log.contextinstanceid || 0);
        var targetid = Number(target.cmid || 0);
        var context = lower(log.contextodoevento || log.eventcontext || log.context || '');
        var name = lower(target.name);
        return (targetid && cmid === targetid) || (name && context.indexOf(name) >= 0);
    }

    function trackedActivityDone(target, current, afterLogs) {
        var gradeRow = current && current.gradeRow;
        if (gradeRow && target.seq) {
            var mod = lower(target.mod || target.modtype || '');
            var hasCurrent = Object.prototype.hasOwnProperty.call(gradeRow, 'act_current_' + target.seq);
            var currentCount = hasCurrent ? Number(gradeRow['act_current_' + target.seq] || 0) : null;
            var currentGrade = parseFloat(String(gradeRow['act_' + target.seq] || '').replace(',', '.'));
            if (hasCurrent) {
                return mod === 'forum' ? currentCount > 0 : (currentCount > 0 || (!isNaN(currentGrade) && currentGrade > 0));
            }
            if (!isNaN(currentGrade) && currentGrade > 0) { return true; }
        }
        return (afterLogs || []).some(function(log) { return isSubmission(log) && sameTarget(log, target); });
    }

    function analyseRow(row, state, currentIndicators) {
        var snapshot = parseSnapshot(row);
        var captured = Number(row.snapshot_timecreated || row.timesent || 0);
        var current = findStudent(row, state);
        var currentIndicator = currentIndicators[String(row.userid)] || null;
        var after = (state.logs || []).filter(function(log) {
            return timestamp(log) > captured && logMatches(log, row);
        }).sort(function(a, b) { return timestamp(a) - timestamp(b); });
        var academic = after.filter(isAcademicAction);
        var submissions = after.filter(isSubmission);
        var reason = reasonBucket(row.snapshot_reason || row.intervention_reason);
        var trackedItems = norm(row.target_type) === 'activity_completion' ? parseTargets(row).map(function(target) {
            return {
                key: studentKey(row) + ':' + (target.cmid || target.seq || lower(target.name)),
                name: norm(target.name),
                done: trackedActivityDone(target, current, after)
            };
        }) : [];
        var trackedResources = norm(row.target_type) === 'resource_access' ? parseTargets(row).map(function(target) {
            return {
                key: studentKey(row) + ':' + (target.cmid || target.seq || lower(target.name)),
                name: norm(target.name),
                done: after.some(function(log) { return sameTarget(log, target); })
            };
        }) : [];
        // Keep the report status aligned with the Interventions tab: any real
        // Moodle access after the intervention starts the follow-up process.
        var response = after.length > 0;
        var reached = null;
        var initial = null;
        var currentValue = null;

        var allTracked = trackedItems.concat(trackedResources);
        if (allTracked.length) {
            reached = allTracked.every(function(item) { return item.done; });
        } else if (reason === 'never') {
            reached = response;
        } else if (reason === 'low') {
            initial = number(snapshot.engagement);
            currentValue = currentEngagement({current: current, currentIndicator: currentIndicator});
            reached = initial !== null && currentValue !== null ? currentValue > initial : null;
        } else if (reason === 'pending') {
            var completedTracked = trackedItems.filter(function(item) { return item.done; }).length;
            initial = trackedItems.length || number(snapshot.pendingActivities);
            currentValue = trackedItems.length ? Math.max(0, trackedItems.length - completedTracked) :
                (currentIndicator ? number(currentIndicator.pendingActivities) : null);
            reached = initial !== null && currentValue !== null ? currentValue < initial : null;
        } else if (reason === 'difficult') {
            initial = courseTotalGrade(snapshot);
            currentValue = currentIndicator ? courseTotalGrade(currentIndicator) : null;
            reached = initial !== null && currentValue !== null ? currentValue > initial : null;
        } else {
            reached = null;
        }

        // A return to Moodle is already a partial response. Academic actions
        // remain measured separately in the second response-time indicator.
        var firstResponse = response ? timestamp(after[0]) : 0;
        var latest = after.length ? timestamp(after[after.length - 1]) : 0;
        return {
            raw: row,
            snapshot: snapshot,
            key: studentKey(row),
            reason: reason,
            current: current,
            currentIndicator: currentIndicator,
            captured: captured,
            after: after,
            academic: academic,
            submissions: submissions,
            trackedItems: trackedItems,
            trackedResources: trackedResources,
            response: response,
            reached: reached,
            firstResponse: firstResponse,
            latest: latest,
            initial: initial,
            currentValue: currentValue
        };
    }

    function groupStudents(rows) {
        var groups = {};
        rows.forEach(function(row) {
            if (!groups[row.key]) { groups[row.key] = {key: row.key, rows: [], name: row.raw.student_name}; }
            groups[row.key].rows.push(row);
        });
        return Object.keys(groups).map(function(key) {
            var group = groups[key];
            group.latest = group.rows.slice().sort(function(a, b) { return b.captured - a.captured; })[0];
            group.responded = group.latest.response;
            group.reached = group.latest.reached === true;
            group.unknownGoal = group.latest.reached === null;
            return group;
        });
    }

    function progressState(item) {
        if (item && item.reached === true) { return 'integral'; }
        if (item && (item.response === true || item.responded === true)) { return 'partial'; }
        return 'awaiting';
    }

    function avg(values) {
        var clean = values.filter(function(value) { return value !== null && value !== undefined && !isNaN(value); });
        if (!clean.length) { return null; }
        return clean.reduce(function(sum, value) { return sum + Number(value); }, 0) / clean.length;
    }

    function formatNumber(value, suffix) {
        if (value === null || value === undefined || isNaN(value)) { return '—'; }
        return Number(value) === 0 ? '0' : round(value, 1) + (suffix || '');
    }

    function formatDate(ts) {
        if (!ts) { return '—'; }
        return new Date(ts * 1000).toLocaleDateString();
    }

    function formatDateTime(ts) {
        if (!ts) { return '—'; }
        return new Date(ts * 1000).toLocaleString([], {dateStyle: 'short', timeStyle: 'short'});
    }

    function localDateKey(ts) {
        var date = ts instanceof Date ? ts : new Date(Number(ts) * 1000);
        return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' +
            String(date.getDate()).padStart(2, '0');
    }

    function duration(seconds) {
        if (seconds === null || seconds === undefined || !isFinite(seconds)) { return '—'; }
        var hours = seconds / 3600;
        if (hours < 1) { return Math.round(seconds / 60) + ' min'; }
        if (hours < 48) { return round(hours, 1) + ' h'; }
        return round(hours / 24, 1) + ' dias';
    }

    function filterRows(rows) {
        var from = filters.from ? new Date(filters.from + 'T00:00:00').getTime() / 1000 : 0;
        var to = filters.to ? new Date(filters.to + 'T23:59:59').getTime() / 1000 : Number.MAX_SAFE_INTEGER;
        return rows.filter(function(row) {
            return row.captured >= from && row.captured <= to &&
                (filters.reason === 'all' || row.reason === filters.reason) &&
                (filters.teacher === 'all' || String(row.raw.teacherid) === filters.teacher) &&
                (filters.student === 'all' || row.key === filters.student);
        });
    }

    function option(value, label, selected) {
        return '<option value="' + esc(value) + '"' + (String(value) === String(selected) ? ' selected' : '') + '>' + esc(label) + '</option>';
    }

    function filtersHtml(rows) {
        var teachers = {};
        var students = {};
        rows.forEach(function(row) { teachers[String(row.raw.teacherid)] = row.raw.teacher_name; });
        rows.forEach(function(row) { students[row.key] = row.raw.student_name || row.raw.student_email || tr('tf_student_fallback'); });
        var teacherOptions = option('all', tr('tf_filter_all_teachers'), filters.teacher);
        Object.keys(teachers).sort(function(a, b) { return teachers[a].localeCompare(teachers[b]); }).forEach(function(id) {
            teacherOptions += option(id, teachers[id], filters.teacher);
        });
        var studentOptions = option('all', tr('tf_filter_all_students'), filters.student);
        Object.keys(students).sort(function(a, b) { return students[a].localeCompare(students[b]); }).forEach(function(key) {
            studentOptions += option(key, students[key], filters.student);
        });
        var reasonOptions = option('all', tr('tf_filter_all_reasons'), filters.reason);
        REASONS.forEach(function(key) { reasonOptions += option(key, REASON_META[key].label(), filters.reason); });
        return '<div class="fr-toolbar open">' +
            '<div class="fr-filter"><label>Período inicial</label><input id="frFrom" type="date" value="' + esc(filters.from) + '"></div>' +
            '<div class="fr-filter"><label>Período final</label><input id="frTo" type="date" value="' + esc(filters.to) + '"></div>' +
            '<div class="fr-filter"><label>Motivo</label><select id="frReason">' + reasonOptions + '</select></div>' +
            '<div class="fr-filter"><label>Professor</label><select id="frTeacher">' + teacherOptions + '</select></div>' +
            '<div class="fr-filter fr-student-filter"><label>Estudante</label><select id="frStudent">' + studentOptions + '</select></div>' +
            '<button type="button" class="fr-btn fr-clear" id="frClear">⌫ Limpar filtros</button></div>';
    }

    function headerActionsHtml() {
        return '<div class="fr-header-actions">' +
            '<button type="button" class="fr-btn fr-export" id="frExport">' + svg('download', 16) + ' Exportar relatório (PDF)</button></div>';
    }

    function kpi(icon, label, value, sub, color, help) {
        return '<div class="fr-kpi" style="--fr-color:' + color + '"><div class="fr-kpi-head"><span class="fr-kpi-icon">' + svg(icon, 27) + '</span>' +
            '<span class="fr-kpi-label">' + esc(label) + (help ? '<span class="mwa-help-tip fr-kpi-help" tabindex="0" role="img" aria-label="' + esc(help) + '" title="' + esc(help) + '" data-tooltip="' + esc(help) + '">?</span>' : '') + '</span></div>' +
            '<strong class="fr-kpi-value">' + esc(value) + '</strong><small class="fr-kpi-sub">' + esc(sub) + '</small>' +
            '</div>';
    }

    function tabsHtml() {
        var tabs = [
            ['overview', 'grid', tr('tf_tab_overview')], ['engagement', 'engagement', tr('tf_tab_engagement')],
            ['learning', 'learning', tr('tf_tab_learning')], ['interaction', 'interaction', tr('tf_tab_interaction')],
            ['continuity', 'permanence', tr('tf_tab_continuity')], ['mediation', 'mediation', tr('tf_tab_mediation')],
            ['trajectory', 'trajectory', tr('tf_tab_trajectory')], ['ai', 'sparkles', tr('tf_tab_ai')]
        ];
        return '<div class="fr-tabs" role="tablist">' + tabs.map(function(tab) {
            return '<button type="button" data-fr-tab="' + tab[0] + '" class="' + (activeTab === tab[0] ? 'active' : '') + '">' +
                svg(tab[1], 21) + tab[2] + '</button>';
        }).join('') + '</div>';
    }

    function card(title, body, scope, extra) {
        return '<section class="fr-card ' + (extra || '') + '" data-fr-scope="' + scope + '"><h2>' + title + '</h2>' + body + '</section>';
    }

    function info(text) {
        return '<div class="fr-info">' + svg('info', 16) + '<p>' + esc(text) + '</p></div>';
    }

    function reasonChart(rows) {
        rows = Array.isArray(rows) ? rows : [];

        var data = REASONS.map(function(reason) {
            var meta = REASON_META[reason];
            var subset = rows.filter(function(row) { return row.reason === reason; });
            var responded = subset.filter(function(row) { return row.response; }).length;
            var engagementPairs = metricPairs(subset).engagement;
            var engagementDelta = avg(engagementPairs.map(function(pair) { return pair.after - pair.before; }));
            function uniqueNames(items) {
                var seen = {};
                return items.map(function(item) { return norm(item && item.raw ? item.raw.student_name : item && item.name).trim(); })
                    .filter(function(name) {
                        if (!name || seen[name]) { return false; }
                        seen[name] = true;
                        return true;
                    });
            }
            return {
                label: meta.label(),
                color: meta.color,
                icon: meta.icon,
                total: subset.length,
                respondedPct: subset.length ? pct(responded, subset.length) : null,
                delta: engagementDelta,
                interventionNames: uniqueNames(subset),
                respondedNames: uniqueNames(subset.filter(function(row) { return row.response; })),
                engagementNames: uniqueNames(engagementPairs)
            };
        });

        if (data.every(function(d) { return d.total === 0; })) {
            return '<div class="fr-no-data">' + tr('tf_reason_no_data') + '</div>';
        }

        /* SVG dimensions */
        var W = 1200, H = 200;
        var padL = 48, padR = 20, padT = 20, padB = 44;
        var chartW = W - padL - padR;
        var chartH = H - padT - padB;
        var n = data.length;
        var groupW = chartW / n;
        var barW = Math.min(22, groupW / 3.5);
        var gap = barW * 0.6;

        /* Scales: left axis 0-100, right axis for delta (-100 to +100). */
        var maxTotal = Math.max.apply(null, data.map(function(d) { return d.total; })) || 1;
        var scalePct = function(v) { return chartH - (v / 100) * chartH; };
        var scaleCount = function(v) { return chartH - (v / (maxTotal * 1.25)) * chartH; };
        var scaleDelta = function(v) {
            if (v === null) return null;
            var abs = Math.max.apply(null, data.map(function(d) { return d.delta !== null ? Math.abs(d.delta) : 0; })) || 1;
            return chartH / 2 - (v / (abs * 1.5)) * (chartH / 2);
        };

        /* Grid lines */
        var grid = [0, 25, 50, 75, 100].map(function(v) {
            var y = padT + scalePct(v);
            return '<line class="fr-grid-line" x1="' + padL + '" y1="' + y + '" x2="' + (W - padR) + '" y2="' + y + '"/>' +
                '<text class="fr-axis-label" x="' + (padL - 4) + '" y="' + (y + 4) + '" text-anchor="end">' + v + '</text>';
        }).join('');

        /* Bars */
        var bars = data.map(function(d, i) {
            var cx = padL + i * groupW + groupW / 2;

            /* Bar 1: interventions (count, grey-blue). */
            var hTotal = d.total > 0 ? Math.max(4, scaleCount(0) - scaleCount(d.total)) : 0;
            var yTotal = padT + chartH - hTotal;
            var detail1 = esc(JSON.stringify({series: tr('tf_reason_interventions'), label: d.label, value: d.total, students: d.interventionNames}));
            var b1 = d.total > 0
                ? '<rect class="fr-reason-bar" tabindex="0" role="button" data-fr-reason-detail="' + detail1 + '" x="' + (cx - barW - gap) + '" y="' + yTotal + '" width="' + barW + '" height="' + hTotal + '" rx="3" fill="#a8b8d8" opacity=".85"/>' +
                  '<text class="fr-bar-val" x="' + (cx - barW / 2 - gap) + '" y="' + (yTotal - 4) + '" text-anchor="middle">' + d.total + '</text>'
                : '';

            /* Bar 2: Returned students percentage (blue). */
            var rPct = d.respondedPct !== null ? d.respondedPct : 0;
            var hResp = rPct > 0 ? Math.max(4, scalePct(0) - scalePct(rPct)) : 0;
            var yResp = padT + chartH - hResp;
            var detail2 = esc(JSON.stringify({series: tr('tf_reason_responded_pct'), label: d.label, value: rPct + '%', students: d.respondedNames}));
            var b2 = d.respondedPct !== null
                ? '<rect class="fr-reason-bar" tabindex="0" role="button" data-fr-reason-detail="' + detail2 + '" x="' + cx + '" y="' + yResp + '" width="' + barW + '" height="' + hResp + '" rx="3" fill="#1769e0" opacity=".8"/>' +
                  (rPct > 0 ? '<text class="fr-bar-val" x="' + (cx + barW / 2) + '" y="' + (yResp - 4) + '" text-anchor="middle">' + rPct + '%</text>' : '')
                : '';

            /* Bar 3: engagement change (green/red, centered at midpoint). */
            var b3 = '';
            if (d.delta !== null) {
                var midY = padT + chartH / 2;
                var dy = scaleDelta(d.delta);
                if (dy !== null) {
                    var yBar = dy < chartH / 2 ? padT + dy : midY;
                    var hBar = Math.abs(midY - (padT + dy));
                    hBar = Math.max(hBar, 3);
                    var dColor = d.delta >= 0 ? '#15935f' : '#d93025';
                    var detail3 = esc(JSON.stringify({series: tr('tf_reason_engage_delta'), label: d.label, value: (d.delta > 0 ? '+' : '') + formatNumber(d.delta), students: d.engagementNames}));
                    b3 = '<rect class="fr-reason-bar" tabindex="0" role="button" data-fr-reason-detail="' + detail3 + '" x="' + (cx + barW + gap) + '" y="' + yBar + '" width="' + barW + '" height="' + hBar + '" rx="3" fill="' + dColor + '" opacity=".8"/>' +
                        '<text class="fr-bar-val" x="' + (cx + barW * 1.5 + gap) + '" y="' + (Math.min(yBar, midY) - 4) + '" text-anchor="middle" fill="' + dColor + '">' +
                        (d.delta > 0 ? '+' : '') + formatNumber(d.delta) + '</text>';
                }
            }

            /* Full X label, split into two balanced lines when needed. */
            var words = d.label.split(/\s+/);
            var labelLines = [d.label];
            if (d.label.length > 16 && words.length > 1) {
                var midpoint = Math.ceil(words.length / 2);
                labelLines = [words.slice(0, midpoint).join(' '), words.slice(midpoint).join(' ')];
            }
            var xLabel = '<text class="fr-axis-label fr-axis-label-x" x="' + cx + '" y="' + (H - 17) + '" text-anchor="middle">' +
                labelLines.map(function(line, lineIndex) {
                    return '<tspan x="' + cx + '" dy="' + (lineIndex ? 11 : 0) + '">' + esc(line) + '</tspan>';
                }).join('') + '</text>';

            return b1 + b2 + b3 + xLabel;
        }).join('');

        /* Zero line for delta */
        var zeroY = padT + chartH / 2;
        var zeroLine = '<line class="fr-zero-line" x1="' + padL + '" y1="' + zeroY + '" x2="' + (W - padR) + '" y2="' + zeroY + '" stroke-dasharray="3 3" opacity=".4"/>';

        /* Legend */
        var legend = '<span><i style="background:#a8b8d8"></i>' + tr('tf_reason_interventions') + '</span>' +
            '<span><i style="background:#1769e0"></i>' + tr('tf_reason_responded_pct') + '</span>' +
            '<span><i style="background:linear-gradient(#15935f 50%,#d93025 50%)"></i>' + tr('tf_reason_engage_delta') + '</span>';

        var svgStyle = '<style>' +
            '.fr-grid-line{stroke:#e8ecf5;stroke-width:1}' +
            '.fr-zero-line{stroke:#b0b8cc;stroke-width:1}' +
            '.fr-axis-label{font-size:10px;fill:#6b7394;font-family:inherit}' +
            '.fr-axis-label-x{font-size:9.5px;fill:#2a3250;font-weight:700}' +
            '.fr-bar-val{font-size:9px;fill:#2a3250;font-family:inherit;font-weight:700}' +
            '.fr-reason-bar{cursor:pointer;outline:none}.fr-reason-bar:hover,.fr-reason-bar:focus,.fr-reason-bar.active{opacity:1!important;stroke:#07154f;stroke-width:1.5}' +
            '</style>';

        return '<div class="fr-line-chart fr-reason-chart">' +
            '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(tr('tf_reason_chart_title')) + '" preserveAspectRatio="xMidYMid meet" style="display:block;width:100%;overflow:visible">' +
            svgStyle + '<g class="grid">' + grid + '</g>' + zeroLine + bars +
            '</svg>' +
            '<div class="fr-legend">' + legend + '</div></div>' +
            '<div class="fr-chart-detail" id="frReasonDetail"><strong>Clique em uma barra</strong><span>Veja os estudantes contabilizados neste indicador.</span></div>' +
            '<div class="fr-reason-info-gap" aria-hidden="true"></div>' +
            info(tr('tf_reason_engage_note'));
    }

    function donutHtml(groups) {
        var total = groups.length;
        var reachedGroups = groups.filter(function(group) { return group.reached; });
        var monitoringGroups = groups.filter(function(group) { return group.responded && !group.reached; });
        var noResponseGroups = groups.filter(function(group) { return progressState(group) === 'awaiting'; });
        var reached = reachedGroups.length;
        var monitoring = monitoringGroups.length;
        var noResponse = noResponseGroups.length;
        var pr = pct(reached, total) || 0;
        var pm = pct(monitoring, total) || 0;
        var pn = Math.max(0, 100 - pr - pm);
        var slices = [{label: tr('tf_kpi_evolved'), count: reached, percent: pr, color: '#198754', names: reachedGroups.map(function(group) { return group.name; })},
            {label: tr('tf_kpi_tracking'), count: monitoring, percent: pm, color: '#ff8a00', names: monitoringGroups.map(function(group) { return group.name; })},
            {label: tr('int_status_awaiting'), count: noResponse, percent: pn, color: '#e32929', names: noResponseGroups.map(function(group) { return group.name; })}];
        return '<div class="fr-donut-wrap"><div class="fr-donut" data-fr-donut="' + esc(JSON.stringify(slices)) +
            '" style="background:conic-gradient(#198754 0 ' + pr + '%,#ff8a00 ' + pr + '% ' + (pr + pm) + '%,#e32929 ' + (pr + pm) + '% 100%)">' +
            '<span class="fr-donut-tooltip" hidden></span>' +
            '<div><strong class="fr-donut-center-value">' + pr + '%</strong><span class="fr-donut-center-label">' + tr('tf_donut_rate_label') + '</span></div></div>' +
            '<ul><li title="' + reached + ' (' + pr + '%)"><i style="background:#198754"></i>' + tr('tf_kpi_evolved') + '</li>' +
            '<li title="' + monitoring + ' (' + pm + '%)"><i style="background:#ff8a00"></i>' + tr('tf_kpi_tracking') + '</li>' +
            '<li title="' + noResponse + ' (' + pn + '%)"><i style="background:#e32929"></i>' + tr('int_status_awaiting') + '</li></ul></div>' +
            '<div class="fr-donut-detail" id="frDonutDetail"><strong>' + tr('tf_donut_select_prompt') + '</strong><span>' + tr('tf_donut_select_sub') + '</span></div>' +
            info(tr('tf_donut_info'));
    }

    function metricPairs(rows) {
        var pairs = {engagement: [], grade: [], approval: [], activities: []};
        var tracked = {};
        var gradeByStudent = {};
        var engagementByStudent = {};
        rows.forEach(function(row) {
            var snap = row.snapshot;
            var cur = row.currentIndicator;
            if (!cur) { return; }
            var initialEngagement = number(snap.engagement);
            var currentEngagementValue = currentEngagement(row);
            if (initialEngagement !== null && currentEngagementValue !== null &&
                    (!engagementByStudent[row.key] || row.captured < engagementByStudent[row.key].captured)) {
                engagementByStudent[row.key] = {
                    before: initialEngagement,
                    after: currentEngagementValue,
                    captured: row.captured,
                    name: row.raw.student_name
                };
            }
            var initialGrade = courseTotalGrade(snap);
            var currentGrade = courseTotalGrade(cur);
            var reference = number(snap.gradeReference);
            reference = reference === null ? 60 : reference;
            if (initialGrade !== null && currentGrade !== null &&
                    (!gradeByStudent[row.key] || row.captured < gradeByStudent[row.key].captured)) {
                gradeByStudent[row.key] = {
                    before: initialGrade,
                    after: currentGrade,
                    reference: reference,
                    captured: row.captured,
                    name: row.raw.student_name
                };
            }
            (row.trackedItems || []).forEach(function(item) {
                if (!tracked[item.key]) {
                    tracked[item.key] = {done: !!item.done, captured: row.captured};
                } else {
                    tracked[item.key].done = tracked[item.key].done || !!item.done;
                    tracked[item.key].captured = Math.min(tracked[item.key].captured, row.captured);
                }
            });
        });
        Object.keys(engagementByStudent).forEach(function(key) {
            pairs.engagement.push(engagementByStudent[key]);
        });
        Object.keys(gradeByStudent).forEach(function(key) {
            var gradePair = gradeByStudent[key];
            pairs.grade.push(gradePair);
            pairs.approval.push({
                before: gradePair.before >= gradePair.reference ? 100 : 0,
                after: gradePair.after >= gradePair.reference ? 100 : 0,
                captured: gradePair.captured,
                name: gradePair.name
            });
        });
        Object.keys(tracked).forEach(function(key) {
            pairs.activities.push({before: 0, after: tracked[key].done ? 1 : 0, captured: tracked[key].captured});
        });
        return pairs;
    }

    function analyticalSummaryHtml(rows, groups, pairs) {
        function summarize(items) {
            var valid = items.filter(function(item) { return number(item.before) !== null && number(item.after) !== null; });
            return {
                count: valid.length,
                average: avg(valid.map(function(item) { return Number(item.after) - Number(item.before); })),
                improved: valid.filter(function(item) { return Number(item.after) > Number(item.before); }),
                declined: valid.filter(function(item) { return Number(item.after) < Number(item.before); })
            };
        }
        function names(items) {
            var unique = {};
            items.forEach(function(item) {
                var name = norm(item.name || (item.latest && item.latest.raw.student_name));
                if (name) { unique[name] = true; }
            });
            var list = Object.keys(unique);
            return list.length ? list.slice(0, 12).join(', ') + (list.length > 12 ? ' e mais ' + (list.length - 12) : '') : 'nenhum estudante identificado';
        }
        function metricSentence(label, summary) {
            if (!summary.count) { return 'Não há pares comparáveis suficientes para avaliar ' + label + ' no recorte.'; }
            var direction = summary.average > 0.05 ? 'aumentou' : summary.average < -0.05 ? 'diminuiu' : 'permaneceu estável';
            return 'Na comparação antes × depois, ' + label + ' ' + direction + ' em média ' +
                formatNumber(Math.abs(summary.average), ' pontos') + '. ' + summary.improved.length + ' de ' + summary.count +
                ' estudantes melhoraram e ' + summary.declined.length + ' apresentaram queda.';
        }
        var total = groups.length;
        var responded = groups.filter(function(group) { return group.responded; });
        var evolved = groups.filter(function(group) { return group.reached; });
        var partial = groups.filter(function(group) { return group.responded && !group.reached; });
        var noResponse = groups.filter(function(group) { return !group.responded; });
        var engagement = summarize(pairs.engagement), grade = summarize(pairs.grade);
        var reasonResults = REASONS.map(function(reason) {
            var reasonGroups = groupStudents(rows.filter(function(row) { return row.reason === reason; }));
            return {label: REASON_META[reason].label(), total: reasonGroups.length,
                responded: reasonGroups.filter(function(group) { return group.responded; }).length};
        }).filter(function(item) { return item.total > 0; });
        reasonResults.sort(function(a, b) { return (b.responded / b.total) - (a.responded / a.total); });
        var sustained = sustainedAfterSeven(groups);
        var findings = [
            'Foram acompanhados ' + total + ' estudantes. ' + responded.length + ' (' + pctText(responded.length, total) +
                ') retornaram ao Moodle após a intervenção; ' + evolved.length + ' (' + pctText(evolved.length, total) +
                ') atingiram integralmente o objetivo observado.',
            metricSentence('o engajamento', engagement),
            metricSentence('a nota', grade)
        ];
        if (sustained.eligible) {
            findings.push(sustained.count + ' de ' + sustained.eligible + ' estudantes elegíveis (' +
                pctText(sustained.count, sustained.eligible) + ') mantiveram atividade após sete dias.');
        }
        if (reasonResults.length) {
            var best = reasonResults[0], weakest = reasonResults.length > 1 ? reasonResults[reasonResults.length - 1] : null;
            findings.push('O maior retorno foi observado em “' + best.label + '”: ' + best.responded + ' de ' + best.total +
                ' (' + pctText(best.responded, best.total) + ').' + (weakest ? ' O menor ocorreu em “' + weakest.label + '”: ' +
                    weakest.responded + ' de ' + weakest.total + ' (' + pctText(weakest.responded, weakest.total) + ').' : ''));
        }
        var recommendations = [];
        if (noResponse.length) { recommendations.push('Priorizar novo contato com ' + names(noResponse) + ', que ainda não retornaram após a intervenção.'); }
        if (partial.length) { recommendations.push('Reavaliar a estratégia de ' + names(partial) + ', que retornaram, mas ainda não alcançaram o resultado integral.'); }
        if (grade.declined.length || engagement.declined.length) { recommendations.push('Revisar individualmente os casos com queda: ' + names(grade.declined.concat(engagement.declined)) + '.'); }
        if (!recommendations.length) { recommendations.push('Manter o acompanhamento periódico para confirmar a continuidade dos avanços observados.'); }
        var improved = engagement.improved.concat(grade.improved);
        var issuedAt = new Date().toLocaleString([], {dateStyle: 'long', timeStyle: 'short'});
        var period = filters.from || filters.to ? (filters.from ? new Date(filters.from + 'T00:00:00').toLocaleDateString() : 'início') +
            ' a ' + (filters.to ? new Date(filters.to + 'T00:00:00').toLocaleDateString() : 'hoje') : 'Todo o período disponível';
        var interventionRows = rows.slice().sort(function(a, b) { return b.captured - a.captured; }).map(function(row) {
            var status = !row.response ? 'Sem retorno' : row.reached === true ? 'Objetivo alcançado' : 'Em acompanhamento';
            return '<tr><td>' + esc(formatDateTime(row.captured)) + '</td><td>' + esc(row.raw.student_name || row.raw.student_email || 'Não identificado') +
                '</td><td>' + esc(REASON_META[row.reason].label()) + '</td><td>' + esc(row.raw.teacher_name || row.raw.teachername || row.raw.sender_name || '—') +
                '</td><td>' + esc(status) + '</td><td>' + esc(row.firstResponse ? duration(row.firstResponse - row.captured) : 'Sem retorno') + '</td></tr>';
        }).join('');
        return '<section class="fr-card fr-analytical-summary fr-export-only" data-fr-scope="overview"><header class="fr-export-report-head">' +
            '<div><small>MWA DASHBOARD · RELATÓRIO ANALÍTICO</small><h1>Relatório de Acompanhamento e Evolução da Aprendizagem</h1></div>' +
            '<dl><div><dt>Data de expedição</dt><dd>' + esc(issuedAt) + '</dd></div><div><dt>Período analisado</dt><dd>' + esc(period) +
            '</dd></div><div><dt>Intervenções analisadas</dt><dd>' + rows.length + '</dd></div><div><dt>Estudantes acompanhados</dt><dd>' + total + '</dd></div></dl></header>' +
            '<div class="fr-analytical-title">' + svg('sparkles', 20) + '<div><h2>Análise pedagógica do período</h2><p>Leitura automática dos dados antes e depois das intervenções.</p></div></div>' +
            '<div class="fr-analytical-grid"><div><h3>O que está acontecendo</h3><ul>' + findings.map(function(item) { return '<li>' + esc(item) + '</li>'; }).join('') +
            '</ul></div><div><h3>O que melhorou</h3><p>' + (improved.length ? 'Houve melhora mensurável para: ' + esc(names(improved)) + '.' :
                'Ainda não há melhora mensurável nos pares comparáveis deste recorte.') + '</p><h3>Pontos de atenção e próximos passos</h3><ul>' +
            recommendations.map(function(item) { return '<li>' + esc(item) + '</li>'; }).join('') + '</ul></div></div>' +
            '<section class="fr-export-interventions"><h2>Intervenções incluídas no relatório</h2><p>Relação cronológica das ações do recorte e do retorno observado posteriormente no Moodle.</p>' +
            '<table><thead><tr><th>Data da intervenção</th><th>Estudante</th><th>Motivo</th><th>Responsável</th><th>Situação observada</th><th>Tempo até o retorno</th></tr></thead><tbody>' +
            interventionRows + '</tbody></table></section>' +
            '<p class="fr-analytical-note">As variações mostram associação temporal após as intervenções e não comprovam causalidade. A leitura depende da disponibilidade de dados comparáveis.</p></section>';
    }

    function deltaCard(label, pairs, suffix, invert, mode, detail) {
        var aggregate = mode === 'sum' ? function(values) {
            return values.length ? values.reduce(function(total, value) { return total + Number(value || 0); }, 0) : null;
        } : avg;
        var before = aggregate(pairs.map(function(pair) { return pair.before; }));
        var after = aggregate(pairs.map(function(pair) { return pair.after; }));
        if (detail === 'tracked') {
            var totalTracked = pairs.length;
            var completedTracked = after === null ? 0 : after;
            var remainingTracked = Math.max(0, totalTracked - completedTracked);
            var progressChip = '<small class="up">↑ ' + formatNumber(completedTracked) + '</small>';
            return '<div class="fr-delta fr-activity-delta"><span class="fr-delta-label">' + label + '</span>' +
                '<strong><b class="initial-red"><small>' + tr('tf_delta_remaining') + '</small>' + (totalTracked ? formatNumber(remainingTracked) : '—') +
                '</b><em>→</em><b class="positive"><small>' + tr('tf_delta_concluded') + '</small>' +
                (totalTracked ? formatNumber(completedTracked) : '—') + '</b></strong>' + progressChip + '</div>';
        }
        var gradeMetric = lower(label).indexOf('nota') >= 0;
        function metricValue(value, valueSuffix) {
            if (value === null || value === undefined || isNaN(value)) { return '—'; }
            return gradeMetric ? Number(value).toFixed(1) + (valueSuffix || '') : formatNumber(value, valueSuffix);
        }
        var delta = before !== null && after !== null ? after - before : null;
        var good = delta !== null && (invert ? delta < 0 : delta > 0);
        var deltaText = delta === null ? tr('tf_no_tracked_items') : delta === 0 ? '0' :
            (delta > 0 ? '↑ +' : '↓ ') + metricValue(delta, suffix);
        var detailClass = null;
        if (detail === 'approval') {
            var approvedBefore = pairs.filter(function(pair) { return pair.before >= 100; }).length;
            var approvedAfter = pairs.filter(function(pair) { return pair.after >= 100; }).length;
            var approvalRate = pairs.length ? Math.round(approvedAfter * 1000 / pairs.length) / 10 : null;
            var approvalGain = approvedAfter - approvedBefore;
            var approvalChip = '<small class="up">↑ ' + Math.max(0, approvalGain) + '</small>';
            return '<div class="fr-delta fr-approval-delta"><span class="fr-delta-label">' + label + '</span>' +
                '<strong><b><small>' + tr('tf_delta_students') + '</small>' + approvedAfter + '</b><em>·</em><b class="positive"><small>' + tr('tf_delta_percent') + '</small>' +
                (approvalRate === null ? '—' : formatNumber(approvalRate, '%')) + '</b></strong>' + approvalChip + '</div>';
        }
        var beforeClass = before === 0 ? 'zero' : '';
        var afterClass = after === 0 ? 'zero' : (invert ? 'neutral' : 'positive');
        var afterText = after === 0 && suffix ? '0' + suffix : metricValue(after, suffix);
        return '<div class="fr-delta"><span class="fr-delta-label">' + label + '</span><strong><b class="' + beforeClass + '">' + metricValue(before, suffix) + '</b><em>→</em><b class="' + afterClass + '">' + afterText + '</b></strong>' +
            '<small class="' + (detailClass !== null ? detailClass : delta === null ? '' : delta === 0 ? 'zero' : good ? 'up' : 'down') + '">' +
            deltaText + '</small></div>';
    }

    function lineChart(pairs) {
        function namesThatImproved(values) {
            var seen = {};
            return values.filter(function(value) { return value.after > value.before && norm(value.name); })
                .map(function(value) { return norm(value.name); })
                .filter(function(name) {
                    var key = lower(name);
                    if (seen[key]) { return false; }
                    seen[key] = true;
                    return true;
                });
        }
        var series = [
            {label: tr('tf_chart_engagement'), color: '#0b5be7', values: pairs.engagement},
            {label: tr('tf_chart_grade'), color: '#11813b', values: pairs.grade},
            {label: tr('tf_chart_approval'), color: '#6423a5', values: pairs.approval, approval: true}
        ].filter(function(item) { return item.values.length; });
        if (!series.length) { return '<div class="fr-no-data">Sem pares snapshot × atual elegíveis para o gráfico.</div>'; }
        var timelineDays = {};
        series.forEach(function(item) {
            item.values.forEach(function(value) { timelineDays[localDateKey(value.captured)] = true; });
        });
        var timelinePointCount = Object.keys(timelineDays).length + 1;
        var chartWidth = Math.max(1200, 96 + Math.max(1, timelinePointCount - 1) * 150);
        var left = 48, right = chartWidth - 24, top = 18, bottom = 142;
        var grid = [0, 25, 50, 75, 100].map(function(value) {
            var y = bottom - value * ((bottom - top) / 100);
            return '<line x1="' + left + '" y1="' + y + '" x2="' + right + '" y2="' + y + '"/><text x="4" y="' + (y + 4) + '">' + value + '</text>';
        }).join('');
        var paths = series.map(function(item) {
            var byDay = {};
            item.values.forEach(function(value) {
                var day = localDateKey(value.captured);
                if (!byDay[day]) { byDay[day] = []; }
                byDay[day].push(value);
            });
            var points = Object.keys(byDay).sort().map(function(day) {
                var dayValues = byDay[day];
                return {
                    label: new Date(day + 'T12:00:00').toLocaleDateString([], {day: '2-digit', month: '2-digit'}),
                    value: item.approval ? dayValues.filter(function(value) { return value.before >= 100; }).length :
                        avg(dayValues.map(function(value) { return value.before; })),
                    students: item.approval ? dayValues.filter(function(value) { return value.before >= 100 && norm(value.name); })
                        .map(function(value) { return norm(value.name); }) : namesThatImproved(dayValues)
                };
            });
            points.push({label: new Date().toLocaleDateString([], {day: '2-digit', month: '2-digit'}),
                value: item.approval ? item.values.filter(function(value) { return value.after >= 100; }).length :
                    avg(item.values.map(function(value) { return value.after; })),
                students: item.approval ? item.values.filter(function(value) { return value.after >= 100 && norm(value.name); })
                    .map(function(value) { return norm(value.name); }) : namesThatImproved(item.values)});
            var step = points.length > 1 ? (right - left) / (points.length - 1) : 0;
            var coordinates = points.map(function(point, index) {
                return {x: left + step * index, y: bottom - Math.max(0, Math.min(100, point.value)) * ((bottom - top) / 100),
                    label: point.label, value: point.value, students: point.students};
            });
            var path = coordinates.map(function(point, index) { return (index ? 'L ' : 'M ') + point.x + ' ' + point.y; }).join(' ');
            return '<path d="' + path + '" stroke="' + item.color + '"/>' + coordinates.map(function(point) {
                var detail = JSON.stringify({series: item.label, label: point.label, value: round(point.value, 1),
                    students: point.students, approval: !!item.approval});
                return '<circle class="fr-chart-point" tabindex="0" role="button" cx="' + point.x + '" cy="' + point.y +
                    '" r="4.2" fill="' + item.color + '" data-fr-chart-detail="' + esc(detail) +
                    '" aria-label="Ver estudantes que melhoraram em ' + esc(item.label) + ', ' + esc(point.label) + '"/>';
            }).join('');
        }).join('');
        var labels = [];
        var firstSeries = series[0].values;
        var days = {};
        firstSeries.forEach(function(value) { days[localDateKey(value.captured)] = true; });
        Object.keys(days).sort().forEach(function(day) { labels.push(new Date(day + 'T12:00:00').toLocaleDateString([], {day: '2-digit', month: '2-digit'})); });
        labels.push(new Date().toLocaleDateString([], {day: '2-digit', month: '2-digit'}));
        var labelStep = labels.length > 1 ? (right - left) / (labels.length - 1) : 0;
        var xlabels = labels.map(function(label, index) {
            return '<text class="axis" text-anchor="middle" x="' + (left + labelStep * index) + '" y="160">' + label + '</text>';
        }).join('');
        var legend = series.map(function(item) { return '<span><i style="background:' + item.color + '"></i>' + item.label + '</span>'; }).join('');
        var interventionDays = Object.keys(days).sort();
        var interventionMarkers = interventionDays.map(function(day, index) {
            var markerX = left + labelStep * index;
            var markerDate = new Date(day + 'T12:00:00').toLocaleDateString([], {day: '2-digit', month: '2-digit'});
            return '<line class="fr-intervention-line" x1="' + markerX + '" y1="' + top + '" x2="' + markerX + '" y2="' + bottom + '"/>' +
                '<text class="fr-intervention-label" text-anchor="start" x="' + (markerX + 7) + '" y="28">' + tr('tf_linechart_marker') + '</text>' +
                '<text class="fr-intervention-label" text-anchor="start" x="' + (markerX + 7) + '" y="38">(' + esc(markerDate) + ')</text>';
        }).join('');
        return '<div class="fr-chart-title">' + tr('tf_linechart_title') + '</div><div class="fr-line-chart"><svg viewBox="0 0 ' + chartWidth + ' 170" style="min-width:' + chartWidth + 'px" role="img" aria-label="' + esc(tr('tf_linechart_aria')) + '"><g class="grid">' + grid + '</g>' +
            interventionMarkers + '<g class="lines">' + paths + '</g>' + xlabels +
            '</svg><div class="fr-legend">' + legend + '</div>' +
            '<div class="fr-chart-detail" id="frChartDetail"><strong>' + tr('tf_linechart_select') + '</strong><span>' + tr('tf_linechart_select_sub') + '</span></div></div>';
    }

    function interactionHtml(rows, groups) {
        var unique = groups.length;
        function rowStudentNames(test) {
            var names = {};
            rows.forEach(function(row) {
                if (test(row)) { names[row.key] = row.raw.student_name || 'Estudante'; }
            });
            return Object.keys(names).map(function(key) { return names[key]; });
        }
        var activities = rowStudentNames(function(row) {
            return row.academic.length > 0 || (row.trackedItems || []).some(function(item) { return item.done; });
        });
        var resources = rowStudentNames(function(row) {
            return row.after.some(isResourceAccess);
        });
        var attempts = rowStudentNames(function(row) {
            return row.after.some(function(log) { return /attempt|tentativa/.test(eventText(log)); });
        });
        var returned = rowStudentNames(function(row) {
            return row.after.length > 0;
        });
        var items = [['learning', activities, tr('tf_journey_activities')], ['document', resources, tr('tf_journey_resources')],
            ['refresh', attempts, tr('tf_journey_attempts')], ['login', returned, tr('tf_journey_returned')]];
        return '<div class="fr-interaction-kpis">' + items.map(function(item) {
            var percent = pct(item[1].length, unique) || 0;
            return '<div class="fr-interaction-clickable" tabindex="0" role="button" data-fr-interaction="' +
                esc(JSON.stringify({label: item[2], names: item[1]})) + '"><b>' + svg(item[0], 20) + '</b><strong class="' + (percent === 0 ? 'zero' : '') + '">' +
                (percent === 0 ? '0' : percent + '%') + '</strong><span>' + item[2] + '</span></div>';
        }).join('') + '</div><div class="fr-bars">' + items.map(function(item) {
            var percent = pct(item[1].length, unique) || 0;
            return '<div><span>' + item[2] + '</span><i><b style="width:' + percent + '%"></b></i><strong>' + item[1].length + ' (' + percent + '%)</strong></div>';
        }).join('') + '</div><div class="fr-interaction-detail" id="frInteractionDetail"><strong>' + tr('tf_interaction_select') + '</strong><span>' + tr('tf_interaction_select_sub') + '</span></div>' +
            info(tr('tf_interaction_info'));
    }

    function continuity(groups, startDays, endDays) {
        var now = Date.now() / 1000;
        var eligible = groups.filter(function(group) { return now - group.latest.captured >= endDays * DAY; });
        var activeGroups = eligible.filter(function(group) {
            var start = group.latest.captured + startDays * DAY;
            var end = group.latest.captured + endDays * DAY;
            return group.latest.after.some(function(log) {
                var time = timestamp(log);
                return (startDays === 0 ? time >= start : time > start) && time <= end;
            });
        });
        return {count: activeGroups.length, eligible: eligible.length, groups: activeGroups};
    }

    function sustainedAfterSeven(groups) {
        var now = Date.now() / 1000;
        var eligible = groups.filter(function(group) {
            return now - group.latest.captured >= 7 * DAY;
        });
        var sustainedGroups = eligible.filter(function(group) {
            var start = group.latest.captured + 7 * DAY;
            return group.latest.after.some(function(log) { return timestamp(log) > start; });
        });
        return {count: sustainedGroups.length, eligible: eligible.length, groups: sustainedGroups, eligibleGroups: eligible};
    }

    function continuityHtml(groups) {
        var sustained = sustainedAfterSeven(groups);
        var total = groups.length;
        var now = Date.now() / 1000;
        var observing = groups.filter(function(group) {
            return now - group.latest.captured < 7 * DAY;
        });
        var notSustainedGroups = sustained.eligibleGroups.filter(function(group) {
            return sustained.groups.indexOf(group) < 0;
        });
        var notSustained = Math.max(0, sustained.eligible - sustained.count);
        var windowPercent = pct(sustained.eligible, total) || 0;
        return '<div class="fr-continuity-side"><h3>' + tr('tf_cont_side_title') + '</h3>' +
            '<div class="fr-cont-class-row fr-cont-clickable" tabindex="0" role="button" data-fr-continuity="' + esc(JSON.stringify({label: tr('tf_cont_sustained'), names: sustained.groups.map(function(group) { return group.name; })})) + '"><span class="fr-cont-icon green">' + svg('checkmark', 14) + '</span><strong class="green">' + sustained.count + '</strong><div><span>' + tr('tf_cont_sustained') + '</span><b>' + pctText(sustained.count, total) + '</b><small>' + tr('tf_cont_sustained_sub') + '</small></div></div>' +
            '<div class="fr-cont-class-row fr-cont-clickable" tabindex="0" role="button" data-fr-continuity="' + esc(JSON.stringify({label: tr('tf_cont_observing'), names: observing.map(function(group) { return group.name; })})) + '"><span class="fr-cont-icon amber">' + svg('bang', 14) + '</span><strong class="amber">' + observing.length + '</strong><div><span>' + tr('tf_cont_observing') + '</span><b>' + pctText(observing.length, total) + '</b><small>' + tr('tf_cont_observing_sub') + '</small></div></div>' +
            '<div class="fr-cont-class-row fr-cont-clickable" tabindex="0" role="button" data-fr-continuity="' + esc(JSON.stringify({label: tr('tf_cont_not_sustained'), names: notSustainedGroups.map(function(group) { return group.name; })})) + '"><span class="fr-cont-icon red">' + svg('close', 14) + '</span><strong class="red">' + notSustained + '</strong><div><span>' + tr('tf_cont_not_sustained') + '</span><b>' + pctText(notSustained, total) + '</b><small>' + tr('tf_cont_not_sustained_sub') + '</small></div></div>' +
            '<div class="fr-cont-window"><span>' + tr('tf_cont_window_label') + '</span><strong>' + tr('tf_cont_window_students').replace('{eligible}', sustained.eligible).replace('{total}', total) + '</strong><i><b style="width:' + windowPercent + '%"></b></i></div></div>' +
            '<div class="fr-continuity-detail" id="frContinuityDetail"><strong>' + tr('tf_cont_select_prompt') + '</strong><span>' + tr('tf_cont_select_sub') + '</span></div>' +
            info(tr('tf_cont_info'));
    }

    function mediationHtml(rows) {
        var responseTimes = rows.filter(function(row) { return row.firstResponse; }).map(function(row) { return row.firstResponse - row.captured; });
        var academicTimes = rows.filter(function(row) { return row.academic.length; }).map(function(row) {
            return timestamp(row.academic[0]) - row.captured;
        });
        var within48 = responseTimes.filter(function(seconds) { return seconds <= 48 * 3600; }).length;
        var total = rows.length;
        var effectiveness = pctText(within48, total);
        return '<div class="fr-mediation"><div class="fr-response-metrics">' +
            '<div class="fr-response-metric"><span>' + svg('clock', 21) + '</span><div><b>' + tr('tf_med_first_response') + '</b>' +
            '<small>' + tr('tf_med_with_response').replace('{n}', responseTimes.length).replace('{total}', total) + '</small></div><strong>' + duration(avg(responseTimes)) + '</strong></div>' +
            '<div class="fr-response-metric"><span>' + svg('clock', 21) + '</span><div><b>' + tr('tf_med_first_academic') + '</b>' +
            '<small>' + tr('tf_med_with_academic').replace('{n}', academicTimes.length).replace('{total}', total) + '</small></div><strong>' + duration(avg(academicTimes)) + '</strong></div></div>' +
            '<div class="fr-48"><span class="fr-48-icon">' + svg('stopwatch', 30) + '</span><div class="fr-48-copy"><b>' + tr('tf_med_48h_title') + '</b>' +
            '<p><strong>' + effectiveness + '</strong><span>' + tr('tf_med_48h_count').replace('{n}', within48).replace('{total}', total) + '</span></p>' +
            '<i><b style="width:' + (pct(within48, total) || 0) + '%"></b></i></div></div>' +
            info(tr('tf_med_48h_info')) + '</div>';
    }

    function aiReportHtml() {
        var config = Store.getConfig ? Store.getConfig() : {};
        var body = '';
        if (aiReportLoading) {
            body = '<div class="fr-ai-loading"><span class="spinner"></span><p>' + tr('tf_ai_loading') + '</p></div>';
        } else if (aiReportError) {
            body = '<div class="fr-ai-error">' + svg('exclamation', 18) + '<p>' + esc(aiReportError) + '</p></div>';
        } else if (aiReport) {
            body = '<div class="fr-ai-content">' + formatAiReport(aiReport) + '</div>';
        } else if (!config.ia_enabled) {
            body = '<div class="fr-ai-empty">' + svg('sparkles', 28) + '<div><b>' + tr('tf_ai_not_configured') + '</b><p>' + tr('tf_ai_not_configured_sub') + '</p></div></div>';
        } else {
            body = '<div class="fr-ai-intro"><div class="fr-ai-empty">' + svg('sparkles', 28) +
                '<div><b>' + tr('tf_ai_intro_title') + '</b><p>' + tr('tf_ai_intro_sub') + '</p></div></div>' +
                '<div class="fr-ai-topics"><span>' + tr('tf_ai_topic_before_after') + '</span><span>' + tr('tf_ai_topic_progress') + '</span><span>' + tr('tf_ai_topic_priority') + '</span><span>' + tr('tf_ai_topic_recommend') + '</span></div>' +
                '<button type="button" class="fr-btn fr-ai-generate fr-ai-primary" id="frAiGenerate">' + svg('sparkles', 16) + ' ' + tr('tf_ai_generate_btn') + '</button></div>';
        }
        return '<section class="fr-card fr-ai-report" data-fr-scope="ai"><div class="fr-ai-title"><div><span>' +
            svg('sparkles', 20) + '</span><h2>' + tr('tf_ai_report_title') + '</h2></div>' +
            (aiReport ? '<button type="button" class="fr-btn fr-ai-generate" id="frAiRegenerate">' + svg('refresh', 15) + ' ' + tr('tf_ai_regen_btn') + '</button>' : '') +
            '</div>' + body + info(tr('tf_ai_report_notice')) + '</section>';
    }

    function formatAiReport(text) {
        var html = '';
        var listType = '';
        function clean(value) {
            return esc(norm(value).replace(/^#{1,6}\s*/, '').replace(/^\*\*(.*?)\*\*:?$/, '$1:')
                .replace(/\*\*(.*?)\*\*/g, '$1').replace(/__(.*?)__/g, '$1').replace(/`([^`]*)`/g, '$1'));
        }
        function closeList() {
            if (listType) { html += '</' + listType + '>'; listType = ''; }
        }
        norm(text).split(/\r?\n/).forEach(function(rawLine) {
            var line = norm(rawLine);
            if (!line) { closeList(); return; }
            var bullet = line.match(/^[-*•]\s+(.+)$/);
            var numbered = line.match(/^\d+[.)]\s+(.+)$/);
            if (bullet || numbered) {
                var desired = numbered ? 'ol' : 'ul';
                if (listType !== desired) { closeList(); listType = desired; html += '<' + desired + '>'; }
                html += '<li>' + clean((bullet || numbered)[1]) + '</li>';
                return;
            }
            closeList();
            var isMarkdownTitle = /^#{1,6}\s+/.test(line) || /^\*\*.*\*\*:?$/.test(line);
            var isPlainTitle = line.length <= 70 && /:$/.test(line);
            if (isMarkdownTitle || isPlainTitle) {
                html += '<h3>' + clean(line).replace(/:$/, '') + '</h3>';
            } else {
                html += '<p>' + clean(line) + '</p>';
            }
        });
        closeList();
        return html;
    }

    function buildAiPrompt(rows) {
        var groups = groupStudents(rows);
        var lines = groups.slice(0, 100).map(function(group) {
            var row = group.latest;
            var snapshot = row.snapshot || {};
            var beforeEngagement = number(snapshot.engagement);
            var afterEngagement = currentEngagement(row);
            var beforeGrade = courseTotalGrade(snapshot);
            var afterGrade = row.currentIndicator ? courseTotalGrade(row.currentIndicator) : null;
            return [
                'Estudante: ' + norm(row.raw.student_name || row.raw.student_email || 'Não identificado'),
                tr('tf_ai_motivo').replace('{v}', REASON_META[row.reason].label()),
                tr('tf_ai_intervencao').replace('{v}', formatDateTime(row.captured)),
                tr('tf_ai_engagement_delta').replace('{before}', formatNumber(beforeEngagement, '%')).replace('{after}', formatNumber(afterEngagement, '%')),
                tr('tf_ai_grade_delta').replace('{before}', formatNumber(beforeGrade, '')).replace('{after}', formatNumber(afterGrade, '')),
                tr('tf_ai_after_events').replace('{n}', row.after.length),
                tr('tf_ai_after_academic').replace('{n}', row.academic.length),
                tr('tf_ai_first_return').replace('{v}', row.firstResponse ? duration(row.firstResponse - row.captured) : tr('tf_ai_no_return')),
                tr('tf_ai_result').replace('{v}', !row.response ? tr('tf_ai_result_none') : row.reached === true ? tr('tf_ai_result_full') : tr('tf_ai_result_partial')),
                tr('tf_ai_continuity').replace('{v}', row.after.some(function(log) { return timestamp(log) > row.captured + 7 * DAY; }) ? tr('tf_ai_continuity_yes') : tr('tf_ai_continuity_no'))
            ].join(' | ');
        });
        return 'Crie um relatório pedagógico em português brasileiro comparando os dados antes e depois das intervenções. ' +
            'Use exclusivamente os dados fornecidos, não invente causas nem informações. Diferencie associação de causalidade. ' +
            'Estruture em: síntese executiva; avanços observados; alunos que precisam de novo acompanhamento; padrões por motivo; ' +
            'recomendações práticas; limitações dos dados. Destaque números e nomes somente quando estiverem nos dados. ' +
            'Não use Markdown, hashtags, asteriscos, tabelas ou blocos de código. Escreva títulos simples em linhas separadas, parágrafos curtos e listas claras.\n\n' +
            'Recorte: ' + rows.length + ' intervenções e ' + groups.length + ' estudantes únicos.\n' + lines.join('\n');
    }

    function generateAiReport(allRows) {
        var config = Store.getConfig ? Store.getConfig() : {};
        var rows = filterRows(allRows);
        if (!config.ia_enabled) {
            aiReportError = tr('ai_unavailable_message', '🔒 Os recursos de Inteligência Artificial estão indisponíveis. Configure uma chave de API válida na administração do MWA.');
            aiReport = '';
            renderReport(allRows);
            return;
        }
        if (!rows.length) {
            aiReportError = 'Não há dados no recorte atual para analisar.';
            aiReport = '';
            renderReport(allRows);
            return;
        }
        aiReportLoading = true;
        aiReportError = '';
        renderReport(allRows);
        Store.callAction('block_mwa_dashboard_get_ai_recommendation', {
            courseid: Number(config.courseid || 0),
            student_name: 'Turma acompanhada',
            prompt: buildAiPrompt(rows)
        }).then(function(result) {
            aiReport = norm(result && (result.recommendation || result.response || result.content));
            aiReportError = aiReport ? '' : 'A IA não retornou conteúdo para este relatório.';
        }).catch(function(error) {
            aiReport = '';
            aiReportError = 'Não foi possível gerar o relatório com IA. ' + norm(error && error.message);
        }).then(function() {
            aiReportLoading = false;
            renderReport(allRows);
        });
    }

    function strategyTable(rows) {
        var map = {};
        rows.forEach(function(row) {
            var name = norm(row.raw.snapshot_action || row.raw.subject || row.raw.target_type || tr('tf_strategy_unknown'));
            if (!map[name]) { map[name] = []; }
            map[name].push(row);
        });
        var names = Object.keys(map).sort(function(a, b) { return map[b].length - map[a].length; });
        if (!names.length) { return '<div class="fr-no-data">' + tr('tf_strategy_no_data') + '</div>'; }
        return '<div class="fr-table-wrap"><table class="fr-table"><thead><tr><th>' + tr('tf_strategy_col_strategy') + '</th><th>' + tr('tf_strategy_col_total') + '</th><th>' + tr('tf_strategy_col_responded') + '</th><th>' + tr('tf_strategy_col_evolved') + '</th><th>' + tr('tf_strategy_col_rate') + '</th></tr></thead><tbody>' + names.map(function(name) {
            var subset = map[name], responded = subset.filter(function(row) { return row.response; }).length;
            var eligible = subset.filter(function(row) { return row.reached !== null; });
            var reached = eligible.filter(function(row) { return row.reached; }).length;
            return '<tr><td><span class="fr-strategy-icon">' + svg('target', 14) + '</span> ' + esc(name) + '</td><td>' + subset.length + '</td><td>' + responded + ' (' + pctText(responded, subset.length) + ')</td>' +
                '<td>' + reached + ' (' + pctText(reached, eligible.length) + ')</td><td class="fr-rate">' + pctText(reached, eligible.length) + '</td></tr>';
        }).join('') + '</tbody></table></div>' + info(tr('tf_strategy_info'));
    }

    function accessJourneyHtml(rows, groups) {
        var journeys = (groups || groupStudents(rows)).map(function(group) { return group.latest; })
            .filter(function(row) { return row && row.captured; });
        var dayCount = 16;
        var access = [], academic = [];
        for (var day = 0; day < dayCount; day++) {
            access.push({count: 0, students: {}});
            academic.push({count: 0, students: {}});
        }
        function collect(row, logs, buckets) {
            (logs || []).forEach(function(log) {
                var elapsed = timestamp(log) - row.captured;
                var relativeDay = Math.floor(elapsed / DAY);
                if (elapsed < 0 || relativeDay < 0 || relativeDay >= dayCount) { return; }
                buckets[relativeDay].count++;
                var name = norm(row.raw.student_name || row.raw.student_email || 'Estudante');
                if (name) { buckets[relativeDay].students[name] = true; }
            });
        }
        journeys.forEach(function(row) {
            collect(row, row.after, access);
            collect(row, row.academic, academic);
        });
        var hasEvents = access.some(function(item) { return item.count > 0; });
        if (!hasEvents) {
            return '<div class="fr-no-data">Ainda não existem acessos posteriores às intervenções selecionadas.</div>' +
                info('O gráfico começa no momento da intervenção e utiliza somente logs reais posteriores do Moodle, até o 15º dia.');
        }

        var maxValue = Math.max.apply(null, access.concat(academic).map(function(item) { return item.count; }).concat([1]));
        var tickStep = Math.max(1, Math.ceil(maxValue / 4));
        var chartMax = tickStep * 4;
        var left = 48, right = 690, top = 20, bottom = 158;
        var xStep = (right - left) / (dayCount - 1);
        function x(index) { return left + (xStep * index); }
        function y(value) { return bottom - (value / chartMax) * (bottom - top); }
        var ticks = [0, 1, 2, 3, 4].map(function(index) {
            var value = tickStep * index;
            var ypos = y(value);
            return '<line x1="' + left + '" y1="' + ypos + '" x2="' + right + '" y2="' + ypos +
                '"/><text x="5" y="' + (ypos + 4) + '">' + value + '</text>';
        }).join('');
        var singleStudent = filters.student !== 'all' && journeys.length === 1;
        function dayLabel(index) {
            if (!singleStudent) { return 'D+' + index; }
            return 'D+' + index + ' · ' + formatDate(journeys[0].captured + index * DAY);
        }
        function seriesPath(values) {
            return values.map(function(item, index) {
                return (index ? 'L ' : 'M ') + x(index) + ' ' + y(item.count);
            }).join(' ');
        }
        function points(values, label, color) {
            return values.map(function(item, index) {
                var students = Object.keys(item.students);
                var detail = JSON.stringify({series: label, day: dayLabel(index), value: item.count, students: students});
                var title = label + ' · ' + dayLabel(index) + ': ' + item.count;
                return '<circle class="fr-journey-point" tabindex="0" role="button" cx="' + x(index) + '" cy="' +
                    y(item.count) + '" r="4.2" fill="' + color + '" data-fr-journey-detail="' + esc(detail) +
                    '" aria-label="' + esc(title) + '"><title>' + esc(title) + '</title></circle>';
            }).join('');
        }
        var accessPath = seriesPath(access);
        var academicPath = seriesPath(academic);
        var areaPath = accessPath + ' L ' + right + ' ' + bottom + ' L ' + left + ' ' + bottom + ' Z';
        var labels = access.map(function(unused, index) {
            if (index % 3 !== 0 && index !== dayCount - 1) { return ''; }
            return '<text class="axis" text-anchor="middle" x="' + x(index) + '" y="177">D+' + index + '</text>';
        }).join('');
        return '<div class="fr-chart-title">' + tr('tf_journey_title') + '</div>' +
            '<div class="fr-line-chart fr-journey-chart"><svg viewBox="0 0 710 188" role="img" aria-label="' + esc(tr('tf_journey_aria')) + '">' +
            '<g class="grid">' + ticks + '</g><path class="fr-journey-area" d="' + areaPath + '"/>' +
            '<line class="fr-intervention-line" x1="' + left + '" y1="' + top + '" x2="' + left + '" y2="' + bottom + '"/>' +
            '<text class="fr-intervention-label" x="' + (left + 7) + '" y="31">' + tr('tf_journey_d0') + '</text>' +
            '<g class="lines"><path d="' + accessPath + '" stroke="#2da873"/><path d="' + academicPath + '" stroke="#1769e0"/></g>' +
            points(access, tr('tf_journey_access'), '#2da873') + points(academic, tr('tf_journey_academic'), '#1769e0') + labels +
            '</svg><div class="fr-legend"><span><i style="background:#2da873"></i>' + tr('tf_journey_access') + '</span>' +
            '<span><i style="background:#1769e0"></i>' + tr('tf_journey_academic') + '</span></div>' +
            '<div class="fr-chart-detail" id="frJourneyDetail"><strong>' + tr('tf_journey_select') + '</strong>' +
            '<span>' + tr('tf_journey_select_sub') + '</span></div></div>' +
            info(tr('tf_journey_info'));
    }

    function trajectoryTable(rows) {
        var sorted = rows.slice().sort(function(a, b) { return b.captured - a.captured; }).slice(0, 50);
        return '<div class="fr-table-wrap"><table class="fr-table"><thead><tr><th>' + tr('tf_th_student') + '</th><th>' + tr('tf_th_snapshot') + '</th><th>' + tr('tf_th_intervention') + '</th><th>' + tr('tf_th_after_data') + '</th><th>' + tr('tf_th_response') + '</th><th>' + tr('tf_th_progress') + '</th><th>' + tr('tf_th_activity_days') + '</th></tr></thead><tbody>' +
            sorted.map(function(row) {
                var now = Date.now() / 1000;
                function marker(startDays, endDays) {
                    if (now - row.captured < endDays * DAY) { return '—'; }
                    return row.after.some(function(log) {
                        var time = timestamp(log);
                        return time >= row.captured + startDays * DAY && time <= row.captured + endDays * DAY;
                    }) ? '✓' : '×';
                }
                var progress = progressState(row);
                var progressHtml = progress === 'integral' ? '<b class="green">Integral</b>' :
                    progress === 'partial' ? '<b class="amber">Parcial</b>' : '<b class="red">' + tr('int_status_awaiting') + '</b>';
                return '<tr><td><strong>' + esc(row.raw.student_name) + '</strong></td><td>' + formatDateTime(row.captured) + '</td>' +
                    '<td><span class="fr-reason" style="--fr-color:' + REASON_META[row.reason].color + '">' + svg(REASON_META[row.reason].icon, 15) + ' ' + REASON_META[row.reason].label() + '</span><small>' + esc(row.raw.snapshot_action || '') + '</small></td>' +
                    '<td>' + tr('tf_traj_events_academic').replace('{events}', row.after.length).replace('{academic}', row.academic.length) + '</td>' +
                    '<td>' + (row.response ? '<b class="green">' + tr('tf_yes') + '</b>' : '<b class="red">' + tr('tf_no') + '</b>') + '</td>' +
                    '<td>' + progressHtml + '</td>' +
                    '<td>' + marker(0, 7) + ' / ' + marker(7, 15) + '</td></tr>';
            }).join('') + '</tbody></table></div>';
    }

    function renderReport(allRows) {
        var box = document.getElementById('teacherFeedbackWrap');
        if (!box) { return; }
        var rows = filterRows(allRows);
        var groups = groupStudents(rows);
        var total = groups.length;
        var responded = groups.filter(function(group) { return group.responded; }).length;
        var reached = groups.filter(function(group) { return group.reached; }).length;
        var monitoring = groups.filter(function(group) { return group.responded && !group.reached; }).length;
        var noResponse = groups.filter(function(group) { return !group.responded; }).length;
        var sustained = sustainedAfterSeven(groups);
        var pairs = metricPairs(rows);
        var ignored = data.filter(function(row) { return !row.raw.snapshot_timecreated; }).length;

        var html = headerActionsHtml() + '<div class="fr-kpis">' +
            kpi('users', tr('tf_kpi_students_tracked'), String(total), total ? tr('tf_kpi_students_all') : tr('tf_kpi_students_none'), '#1769e0', tr('tf_kpi_students_tracked_tip')) +
            kpi('refresh', tr('tf_kpi_responded'), String(responded), pctText(responded, total) + ' ' + tr('tf_of_total'), '#1769e0', tr('tf_kpi_responded_tip')) +
            kpi('target', tr('tf_kpi_evolved'), String(reached), pctText(reached, total) + ' ' + tr('tf_of_total'), '#198754', tr('tf_kpi_evolved_tip')) +
            kpi('hourglass', tr('tf_kpi_tracking'), String(monitoring), pctText(monitoring, total) + ' ' + tr('tf_of_total'), '#ff7a00', tr('tf_kpi_tracking_tip')) +
            kpi('close', tr('tf_kpi_no_response'), String(noResponse), pctText(noResponse, total) + ' ' + tr('tf_of_total'), '#ed0000', tr('tf_kpi_no_response_tip')) +
            kpi('trend', tr('tf_kpi_sustained'), sustained.eligible ? String(sustained.count) : '—', sustained.eligible ? pctText(sustained.count, sustained.eligible) + ' ' + tr('tf_of_eligible') : tr('tf_no_eligible_after'), '#7030a0', tr('tf_kpi_sustained_tip')) +
            '</div>' + filtersHtml(allRows) + tabsHtml();

        if (!rows.length) {
            html += '<div class="fr-empty"><span>▥</span><h2>' + tr('tf_empty_eligible') + '</h2><p>' + tr('tf_empty_eligible_desc') + '</p></div>';
            if (ignored) { html += info(ignored + ' intervenção(ões) anterior(es) ao snapshot foram preservadas, mas não entram em comparações antes × depois.'); }
            Store.renderHtml(box, html);
            bind(allRows);
            return;
        }

        html += analyticalSummaryHtml(rows, groups, pairs);
        html += '<div class="fr-grid fr-grid-top">' +
            card(tr('tf_reason_chart_title'), reasonChart(rows), 'overview engagement', 'fr-span-14 fr-result-card') + '</div>';
        html += '<div class="fr-grid fr-grid-middle">' +
            card(tr('tf_progress_card_title'), '<div class="fr-deltas">' +
                deltaCard(tr('tf_progress_engagement_label'), pairs.engagement, '', false) + deltaCard(tr('tf_progress_grade_label'), pairs.grade, '', false) +
                deltaCard(tr('tf_progress_approved_label'), pairs.approval, '%', false, null, 'approval') + deltaCard(tr('tf_progress_activities_label'), pairs.activities, '', false, 'sum', 'tracked') +
                '</div>' + lineChart(pairs) + info(tr('tf_progress_info')), 'overview learning', 'fr-span-14') + '</div>';
        html += '<div class="fr-grid fr-grid-support">' +
            card(tr('tf_card_synthesis'), donutHtml(groups), 'overview', 'fr-span-7 fr-summary-card') +
            card(tr('tf_card_continuity'), continuityHtml(groups), 'overview continuity', 'fr-span-7 fr-continuity-card') + '</div>';
        html += aiReportHtml();
        html += '<div class="fr-grid fr-grid-bottom">' +
            card('Interação do estudante após a intervenção', interactionHtml(rows, groups), 'overview interaction', 'fr-span-7 fr-interaction-card') +
            card(tr('tf_card_mediation_time'), mediationHtml(rows), 'overview mediation', 'fr-span-7 fr-mediation-card') +
            card(tr('tf_progress_by_strategy'), strategyTable(rows), 'mediation', 'fr-span-8') +
            card(tr('tf_card_journey'), accessJourneyHtml(rows, groups), 'trajectory', 'fr-span-14 fr-journey-card') +
            card(tr('tf_card_trajectory'), trajectoryTable(rows), 'trajectory', 'fr-span-14') + '</div>';
        if (ignored) { html += info(ignored + ' intervenção(ões) sem snapshot foram excluídas das métricas comparativas.'); }
        Store.renderHtml(box, html);
        applyTab();
        bind(allRows);
    }

    function applyTab() {
        document.querySelectorAll('#teacherFeedbackWrap [data-fr-scope]').forEach(function(cardNode) {
            var scopes = cardNode.getAttribute('data-fr-scope').split(' ');
            cardNode.hidden = scopes.indexOf(activeTab) === -1;
        });
        document.querySelectorAll('#teacherFeedbackWrap .fr-grid').forEach(function(grid) {
            var visible = Array.prototype.filter.call(grid.children, function(child) { return !child.hidden; });
            grid.classList.toggle('fr-grid-empty', visible.length === 0);
            visible.forEach(function(cardNode) { cardNode.classList.toggle('fr-single-visible', visible.length === 1); });
        });
    }

    function bind(rows) {
        var from = document.getElementById('frFrom');
        var to = document.getElementById('frTo');
        var reason = document.getElementById('frReason');
        var teacher = document.getElementById('frTeacher');
        var student = document.getElementById('frStudent');
        [from, to, reason, teacher, student].forEach(function(element) {
            if (!element) { return; }
            element.addEventListener('change', function() {
                filters.from = from.value; filters.to = to.value; filters.reason = reason.value;
                filters.teacher = teacher.value; filters.student = student.value;
                renderReport(rows);
            });
        });
        var clear = document.getElementById('frClear');
        if (clear) { clear.addEventListener('click', function() { filters = {from: '', to: '', reason: 'all', teacher: 'all', student: 'all'}; renderReport(rows); }); }
        var exportButton = document.getElementById('frExport');
        if (exportButton) { exportButton.addEventListener('click', function() {
            document.body.classList.add('mwa-print-analytical-report');
            var cleanup = function() { document.body.classList.remove('mwa-print-analytical-report'); };
            window.addEventListener('afterprint', cleanup, {once: true});
            window.print();
            window.setTimeout(cleanup, 1200);
        }); }
        var aiButton = document.getElementById('frAiGenerate');
        var aiRegenerate = document.getElementById('frAiRegenerate');
        if (aiButton) { aiButton.disabled = aiReportLoading; aiButton.addEventListener('click', function() { generateAiReport(rows); }); }
        if (aiRegenerate) { aiRegenerate.disabled = aiReportLoading; aiRegenerate.addEventListener('click', function() { generateAiReport(rows); }); }
        document.querySelectorAll('[data-fr-tab]').forEach(function(button) {
            button.addEventListener('click', function() {
                activeTab = button.getAttribute('data-fr-tab');
                document.querySelectorAll('[data-fr-tab]').forEach(function(item) { item.classList.toggle('active', item === button); });
                applyTab();
            });
        });
        function showChartDetail(point) {
            var panel = document.getElementById('frChartDetail');
            if (!panel) { return; }
            var detail = {};
            try { detail = JSON.parse(point.getAttribute('data-fr-chart-detail') || '{}'); } catch (ignore) { detail = {}; }
            var names = Array.isArray(detail.students) ? detail.students : [];
            panel.replaceChildren();
            var title = document.createElement('strong');
            title.textContent = (detail.series || 'Indicador') + ' · ' + (detail.label || '') + ' · ' +
                (detail.approval ? detail.value + (Number(detail.value) === 1 ? ' estudante' : ' estudantes') : 'valor ' + detail.value);
            var text = document.createElement('span');
            text.textContent = names.length ? (detail.approval ? tr('tf_students_approved') : tr('tf_students_improved')) + ' ' + names.join(', ') :
                (detail.approval ? tr('tf_no_student_approved') :
                    tr('tf_no_student_improved'));
            panel.appendChild(title);
            panel.appendChild(text);
            document.querySelectorAll('.fr-chart-point').forEach(function(item) {
                item.classList.toggle('active', item === point);
            });
        }
        document.querySelectorAll('.fr-chart-point').forEach(function(point) {
            point.addEventListener('click', function() { showChartDetail(point); });
            point.addEventListener('keydown', function(event) {
                if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); showChartDetail(point); }
            });
        });
        function showReasonDetail(bar) {
            var panel = document.getElementById('frReasonDetail');
            if (!panel) { return; }
            var detail = {};
            try { detail = JSON.parse(bar.getAttribute('data-fr-reason-detail') || '{}'); } catch (ignore) { detail = {}; }
            var names = Array.isArray(detail.students) ? detail.students.filter(Boolean) : [];
            panel.replaceChildren();
            var title = document.createElement('strong');
            title.textContent = (detail.series || 'Indicador') + ' · ' + (detail.label || '') + ' · ' + (detail.value || '0');
            var text = document.createElement('span');
            text.textContent = names.length ? names.join(', ') : tr('tf_no_student_counted');
            panel.appendChild(title);
            panel.appendChild(text);
            document.querySelectorAll('.fr-reason-bar').forEach(function(item) {
                item.classList.toggle('active', item === bar);
            });
        }
        document.querySelectorAll('.fr-reason-bar').forEach(function(bar) {
            bar.addEventListener('click', function() { showReasonDetail(bar); });
            bar.addEventListener('keydown', function(event) {
                if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); showReasonDetail(bar); }
            });
        });
        function showJourneyDetail(point) {
            var panel = document.getElementById('frJourneyDetail');
            if (!panel) { return; }
            var detail = {};
            try { detail = JSON.parse(point.getAttribute('data-fr-journey-detail') || '{}'); } catch (ignore) { detail = {}; }
            var names = Array.isArray(detail.students) ? detail.students : [];
            panel.replaceChildren();
            var title = document.createElement('strong');
            title.textContent = (detail.series || 'Eventos') + ' · ' + (detail.day || '') + ': ' + Number(detail.value || 0);
            var text = document.createElement('span');
            text.textContent = names.length ? tr('tf_students_label') + ' ' + names.join(', ') : tr('tf_no_student_point');
            panel.appendChild(title);
            panel.appendChild(text);
            document.querySelectorAll('.fr-journey-point').forEach(function(item) {
                item.classList.toggle('active', item === point);
            });
        }
        document.querySelectorAll('.fr-journey-point').forEach(function(point) {
            point.addEventListener('click', function() { showJourneyDetail(point); });
            point.addEventListener('keydown', function(event) {
                if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); showJourneyDetail(point); }
            });
        });
        function showContinuityNames(row) {
            var panel = document.getElementById('frContinuityDetail');
            if (!panel) { return; }
            var detail = {};
            try { detail = JSON.parse(row.getAttribute('data-fr-continuity') || '{}'); } catch (ignore) { detail = {}; }
            var names = Array.isArray(detail.names) ? detail.names.filter(Boolean) : [];
            panel.replaceChildren();
            var title = document.createElement('strong');
            title.textContent = detail.label || 'Classificação';
            var text = document.createElement('span');
            text.textContent = names.length ? names.join(', ') : tr('tf_no_student_here');
            panel.appendChild(title);
            panel.appendChild(text);
            document.querySelectorAll('.fr-cont-clickable').forEach(function(item) {
                item.classList.toggle('active', item === row);
            });
        }
        document.querySelectorAll('.fr-cont-clickable').forEach(function(row) {
            row.addEventListener('click', function() { showContinuityNames(row); });
            row.addEventListener('keydown', function(event) {
                if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); showContinuityNames(row); }
            });
        });
        function showFunnelNames(step) {
            var panel = document.getElementById('frContinuityDetail');
            if (!panel) { return; }
            var detail = {};
            try { detail = JSON.parse(step.getAttribute('data-fr-funnel') || '{}'); } catch (ignore) { detail = {}; }
            var names = Array.isArray(detail.names) ? detail.names.filter(Boolean) : [];
            panel.replaceChildren();
            var title = document.createElement('strong');
            title.textContent = detail.label || 'Etapa do funil';
            var text = document.createElement('span');
            text.textContent = names.length ? names.join(', ') : tr('tf_no_student_here');
            panel.appendChild(title);
            panel.appendChild(text);
            document.querySelectorAll('.fr-funnel-step').forEach(function(item) {
                item.classList.toggle('active', item === step);
            });
            document.querySelectorAll('.fr-cont-clickable').forEach(function(item) {
                item.classList.remove('active');
            });
        }
        document.querySelectorAll('.fr-funnel-step').forEach(function(step) {
            step.addEventListener('click', function() { showFunnelNames(step); });
            step.addEventListener('keydown', function(event) {
                if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); showFunnelNames(step); }
            });
        });
        function showInteractionNames(cardNode) {
            var panel = document.getElementById('frInteractionDetail');
            if (!panel) { return; }
            var detail = {};
            try { detail = JSON.parse(cardNode.getAttribute('data-fr-interaction') || '{}'); } catch (ignore) { detail = {}; }
            var names = Array.isArray(detail.names) ? detail.names.filter(Boolean) : [];
            panel.querySelector('strong').textContent = detail.label || 'Indicador';
            panel.querySelector('span').textContent = names.length ? names.join(', ') : tr('tf_no_student_counted');
            document.querySelectorAll('.fr-interaction-clickable').forEach(function(item) {
                item.classList.toggle('active', item === cardNode);
            });
        }
        document.querySelectorAll('.fr-interaction-clickable').forEach(function(cardNode) {
            cardNode.addEventListener('click', function() { showInteractionNames(cardNode); });
            cardNode.addEventListener('keydown', function(event) {
                if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); showInteractionNames(cardNode); }
            });
        });
        document.querySelectorAll('[data-fr-donut]').forEach(function(donut) {
            var slices = [];
            try { slices = JSON.parse(donut.getAttribute('data-fr-donut') || '[]'); } catch (ignore) { slices = []; }
            var tooltip = donut.querySelector('.fr-donut-tooltip');
            var sliceAt = function(event) {
                if (!slices.length) { return null; }
                var rect = donut.getBoundingClientRect();
                var x = event.clientX - rect.left;
                var y = event.clientY - rect.top;
                var dx = x - rect.width / 2;
                var dy = y - rect.height / 2;
                var distance = Math.sqrt(dx * dx + dy * dy);
                if (distance < rect.width * .15 || distance > rect.width * .5) { return null; }
                var position = ((Math.atan2(dy, dx) * 180 / Math.PI) + 450) % 360 / 3.6;
                var accumulated = 0;
                var slice = slices[slices.length - 1];
                slices.some(function(item) {
                    accumulated += Number(item.percent || 0);
                    if (position <= accumulated) { slice = item; return true; }
                    return false;
                });
                return {slice: slice, x: x, y: y};
            };
            donut.addEventListener('mousemove', function(event) {
                if (!tooltip) { return; }
                var selected = sliceAt(event);
                if (!selected) { tooltip.hidden = true; return; }
                var slice = selected.slice;
                tooltip.textContent = slice.label + ': ' + slice.count + ' (' + slice.percent + '%)';
                tooltip.style.left = selected.x + 'px';
                tooltip.style.top = selected.y + 'px';
                tooltip.hidden = false;
            });
            donut.addEventListener('click', function(event) {
                var selected = sliceAt(event);
                if (!selected) { return; }
                var value = donut.querySelector('.fr-donut-center-value');
                var label = donut.querySelector('.fr-donut-center-label');
                if (value) {
                    value.textContent = selected.slice.percent + '%';
                    value.style.color = selected.slice.color || '#07154f';
                }
                if (label) { label.textContent = selected.slice.label; }
                var panel = document.getElementById('frDonutDetail');
                if (panel) {
                    var names = Array.isArray(selected.slice.names) ? selected.slice.names.filter(Boolean) : [];
                    panel.querySelector('strong').textContent = selected.slice.label;
                    panel.querySelector('span').textContent = names.length ? names.join(', ') : tr('tf_no_student_here');
                }
            });
            donut.addEventListener('mouseleave', function() { if (tooltip) { tooltip.hidden = true; } });
        });
    }

    function loadReportData() {
        var config = Store.getConfig ? Store.getConfig() : {};
        var courseid = Number(config.courseid || 0);
        var groupid = Number(config.groupid || 0);
        return Store.callAction('block_mwa_dashboard_get_interventions', {
            courseid: courseid,
            groupid: groupid
        }).then(function(result) {
            var interventions = [];
            if (Array.isArray(result.interventions)) {
                interventions = result.interventions;
            } else {
                try { interventions = JSON.parse(result.interventions || '[]'); } catch (ignore) { interventions = []; }
            }
            var userids = interventions.filter(function(row) { return Number(row.snapshot_timecreated || 0) > 0; })
                .map(function(row) { return Number(row.userid || 0); })
                .filter(function(userid, index, list) { return userid > 0 && list.indexOf(userid) === index; });
            return Store.callAction('block_mwa_dashboard_get_followup_indicators', {
                courseid: courseid,
                groupid: groupid,
                userids: JSON.stringify(userids)
            }).then(function(currentResult) {
                var indicators = {};
                try { indicators = JSON.parse(currentResult.indicators || '{}'); } catch (ignore) { indicators = {}; }
                return {interventions: interventions, indicators: indicators};
            });
        });
    }

    function closeIndividualReport() {
        var overlay = document.getElementById('frIndividualReportOverlay');
        if (overlay && overlay.parentNode) { overlay.parentNode.removeChild(overlay); }
        document.body.classList.remove('mwa-print-student-report');
    }

    function printIndividualReport() {
        document.body.classList.add('mwa-print-student-report');
        window.print();
        window.setTimeout(function() { document.body.classList.remove('mwa-print-student-report'); }, 500);
    }

    function individualMetric(label, values, suffix, sumValues, showAfter) {
        var before = values.length ? (sumValues ? values.reduce(function(total, item) { return total + Number(item.before || 0); }, 0) : avg(values.map(function(item) { return item.before; }))) : null;
        var after = showAfter && values.length ? (sumValues ? values.reduce(function(total, item) { return total + Number(item.after || 0); }, 0) : avg(values.map(function(item) { return item.after; }))) : null;
        var formatMetric = function(value) {
            if (value === null || value === undefined || isNaN(value)) { return '—'; }
            return lower(label).indexOf('nota') >= 0 ? Number(value).toFixed(1) + (suffix || '') : formatNumber(value, suffix || '');
        };
        return '<div class="fr-ir-metric"><span>' + esc(label) + '</span><strong>' +
            esc(formatMetric(before)) + '<em>→</em>' + esc(formatMetric(after)) + '</strong></div>';
    }

    function individualApprovalMetric(label, values, showAfter) {
        var beforeValue = values.length ? avg(values.map(function(item) { return item.before; })) : null;
        var afterValue = showAfter && values.length ? avg(values.map(function(item) { return item.after; })) : null;
        var beforeApproved = beforeValue === null ? null : beforeValue >= 100;
        var afterApproved = afterValue === null ? null : afterValue >= 100;
        function state(value) {
            if (value === null) { return '<b class="is-neutral">—</b>'; }
            return '<b class="' + (value ? 'is-approved' : 'is-not-approved') + '">' +
                esc(tr(value ? 'snapshot_yes' : 'snapshot_no')) + '</b>';
        }
        var transition = state(beforeApproved);
        if (afterApproved !== null && afterApproved !== beforeApproved) {
            transition += '<em>→</em>' + state(afterApproved);
        }
        return '<div class="fr-ir-metric fr-ir-approval-metric"><span>' + esc(label) + '</span><strong>' + transition + '</strong></div>';
    }

    function trackedMetric(label, rows, property, doneLabel) {
        var unique = {};
        rows.forEach(function(row) {
            (row[property] || []).forEach(function(item) {
                if (!unique[item.key]) {
                    unique[item.key] = {done: false, name: item.name || ''};
                }
                unique[item.key].done = unique[item.key].done || item.done;
            });
        });
        var items = Object.keys(unique).map(function(key) { return unique[key]; });
        var done = items.filter(function(item) { return item.done; }).length;
        var remaining = Math.max(0, items.length - done);
        return '<div class="fr-ir-metric fr-ir-tracked-metric"><span>' + esc(label) + '</span>' +
            '<small>' + esc(tr('tf_ir_tracked_total').replace('{count}', items.length)) + '</small>' +
            '<div><strong><b>' + remaining + '</b><em>' + esc(tr('tf_ir_remaining')) + '</em></strong>' +
            '<strong><b>' + done + '</b><em>' + esc(doneLabel) + '</em></strong></div></div>';
    }

    function renderIndividualReport(studentName, rows) {
        var overlay = document.getElementById('frIndividualReportOverlay');
        if (!overlay) { return; }
        var pairs = metricPairs(rows);
        var groups = groupStudents(rows);
        var group = groups[0] || null;
        var hasVerifiedResponse = rows.some(function(row) { return row.response && row.after && row.after.length; });
        function metricSummary(label, values, suffix, sumValues, deltaLabel, booleanState) {
            if (!values.length) { return null; }
            var before = sumValues ? values.reduce(function(total, item) { return total + Number(item.before || 0); }, 0) : avg(values.map(function(item) { return item.before; }));
            var after = sumValues ? values.reduce(function(total, item) { return total + Number(item.after || 0); }, 0) : avg(values.map(function(item) { return item.after; }));
            if (before === null || after === null) { return null; }
            var isGrade = lower(label).indexOf('nota') >= 0;
            if (booleanState) {
                before = before >= 100 ? 1 : 0;
                after = after >= 100 ? 1 : 0;
            }
            var format = function(value) {
                if (booleanState) { return tr(value ? 'snapshot_yes' : 'snapshot_no'); }
                return isGrade ? Number(value).toFixed(1) + (suffix || '') : formatNumber(value, suffix || '');
            };
            return {label: label, before: before, after: after, delta: after - before, format: format,
                deltaLabel: deltaLabel, booleanState: !!booleanState};
        }
        var approvalMetric = metricSummary(tr('tf_ir_approval'), pairs.approval, '', false, '', true);
        var reportMetrics = [
            metricSummary(tr('tf_ir_engagement'), pairs.engagement, '', false, tr('tf_ir_engagement_points')),
            metricSummary(tr('tf_ir_average_grade'), pairs.grade, '', false, tr('tf_ir_points')),
            metricSummary(tr('tf_ir_completed_activities'), pairs.activities, '', true, tr('tf_ir_activities_unit'))
        ].filter(Boolean);
        var improved = hasVerifiedResponse ? reportMetrics.filter(function(metric) { return metric.delta > 0.0001; }) : [];
        var declined = hasVerifiedResponse ? reportMetrics.filter(function(metric) { return metric.delta < -0.0001; }) : [];
        var stable = hasVerifiedResponse ? reportMetrics.filter(function(metric) { return Math.abs(metric.delta) <= 0.0001; }) : [];
        var classification = !rows.length ? tr('tf_ir_insufficient_data') : !hasVerifiedResponse ? tr('tf_ir_awaiting_return') : group && group.reached ? tr('tf_ir_full_progress') :
            (improved.length || (group && group.responded)) ? tr('tf_ir_partial_progress') : tr('tf_ir_no_change');
        var classificationClass = classification === tr('tf_ir_full_progress') ? 'integral' :
            classification === tr('tf_ir_partial_progress') ? 'partial' : 'neutral';
        var ordered = rows.slice().sort(function(a, b) { return a.captured - b.captured; });
        var interventionRows = ordered.map(function(row) {
            var reason = REASON_META[row.reason] ? REASON_META[row.reason].label() : row.reason;
            return '<tr><td>' + esc(formatDateTime(row.captured)) + '</td><td>' + esc(reason) + '</td><td>' +
                esc(row.raw.teacher_name || '—') + '</td><td>' + (row.response ? tr('tf_ir_responded') : tr('tf_ir_no_response')) + '</td></tr>';
        }).join('');
        var timeline = [];
        ordered.forEach(function(row) {
            timeline.push({time: row.captured, title: tr('tf_ir_intervention_done'), detail: REASON_META[row.reason] ? REASON_META[row.reason].label() : row.reason, icon: 'message'});
            if (row.firstResponse) { timeline.push({time: row.firstResponse, title: tr('tf_ir_student_response'), detail: tr('tf_ir_response_recorded'), icon: 'refresh'}); }
            if (row.academic && row.academic.length) { timeline.push({time: timestamp(row.academic[0]), title: tr('tf_ir_academic_activity'), detail: tr('tf_ir_activity_recorded'), icon: 'check'}); }
        });
        timeline.sort(function(a, b) { return a.time - b.time; });
        var timelineHtml = timeline.length ? timeline.map(function(item) {
            return '<div class="fr-ir-timeline-item"><span><svg class="mwa-ui-icon" aria-hidden="true"><use href="#mwa-icon-' + item.icon + '"></use></svg></span><div><strong>' + esc(item.title) + '</strong><small>' + esc(formatDateTime(item.time)) + ' · ' + esc(item.detail || '') + '</small></div></div>';
        }).join('') : '<div class="fr-ir-empty">' + esc(tr('tf_ir_no_events')) + '</div>';
        function joinPhrases(items) {
            if (items.length < 2) { return items.join(''); }
            return items.slice(0, -1).join('; ') + '; ' + tr('tf_ir_and') + ' ' + items[items.length - 1];
        }
        var conclusion = tr('tf_ir_not_enough_snapshots');
        if (rows.length && !hasVerifiedResponse) {
            conclusion = tr('tf_ir_awaiting_return_text');
        } else if (rows.length) {
            var sentences = [tr('tf_ir_conclusion_classification').replace('{count}', rows.length).replace('{classification}', classification.toLowerCase())];
            if (improved.length) {
                sentences.push(tr('tf_ir_improvements') + ' ' + joinPhrases(improved.map(function(metric) {
                    var change = tr('tf_ir_changed_from').replace('{metric}', lower(metric.label)).replace('{before}', metric.format(metric.before)).replace('{after}', metric.format(metric.after));
                    return metric.booleanState ? change : change + ' (+' + formatNumber(metric.delta) + ' ' + metric.deltaLabel + ')';
                })) + '.');
            }
            if (declined.length) {
                sentences.push(tr('tf_ir_declines') + ' ' + joinPhrases(declined.map(function(metric) {
                    var change = tr('tf_ir_changed_from').replace('{metric}', lower(metric.label)).replace('{before}', metric.format(metric.before)).replace('{after}', metric.format(metric.after));
                    return metric.booleanState ? change : change + ' (' + formatNumber(metric.delta) + ' ' + metric.deltaLabel + ')';
                })) + '.');
            }
            if (stable.length) {
                sentences.push(tr('tf_ir_stable') + ' ' + joinPhrases(stable.map(function(metric) {
                    return tr('tf_ir_stayed_at').replace('{metric}', lower(metric.label)).replace('{value}', metric.format(metric.after));
                })) + '.');
            }
            if (approvalMetric) {
                if (approvalMetric.before === 0 && approvalMetric.after === 1) {
                    sentences.push(tr('tf_ir_approved_after_intervention'));
                } else if (approvalMetric.after === 0) {
                    sentences.push(tr('tf_ir_still_not_approved'));
                } else {
                    sentences.push(tr('tf_ir_remains_approved'));
                }
            }
            conclusion = sentences.join(' ');
        }

        Store.renderHtml(overlay, '<section class="fr-ir-modal" role="dialog" aria-modal="true" aria-labelledby="frIrTitle">' +
            '<header class="fr-ir-head"><div><svg class="mwa-ui-icon" aria-hidden="true"><use href="#mwa-icon-chart"></use></svg><div><small>' + esc(tr('tf_ir_title')) + '</small><h2 id="frIrTitle">' + esc(tr('tf_ir_evolution_of').replace('{student}', studentName)) + '</h2></div></div>' +
            '<div class="fr-ir-actions"><button type="button" onclick="window.MWATeacherFeedback.printIndividualReport()"><svg class="mwa-ui-icon" aria-hidden="true"><use href="#mwa-icon-download"></use></svg> ' + esc(tr('tf_ir_export_pdf')) + '</button><button type="button" class="fr-ir-close" aria-label="' + esc(tr('close')) + '" onclick="window.MWATeacherFeedback.closeIndividualReport()"><svg class="mwa-ui-icon" aria-hidden="true"><use href="#mwa-icon-close"></use></svg></button></div></header>' +
            '<div class="fr-ir-body"><div class="fr-ir-summary"><div><span>' + esc(tr('student')) + '</span><strong>' + esc(studentName) + '</strong></div><div><span>' + esc(tr('tf_ir_period')) + '</span><strong>' + (ordered.length ? esc(formatDate(ordered[0].captured)) + ' ' + esc(tr('tf_ir_to')) + ' ' + esc(formatDate(Math.floor(Date.now() / 1000))) : '—') + '</strong></div><div><span>' + esc(tr('tf_ir_interventions')) + '</span><strong>' + rows.length + '</strong></div><div><span>' + esc(tr('tf_ir_classification')) + '</span><strong class="' + classificationClass + '">' + esc(classification) + '</strong></div></div>' +
            '<section class="fr-ir-section"><h3>' + esc(tr('tf_ir_before_after')) + '</h3><div class="fr-ir-metrics">' +
            individualMetric(tr('tf_ir_engagement'), pairs.engagement, '', false, hasVerifiedResponse) + individualMetric(tr('tf_ir_average_grade'), pairs.grade, '', false, hasVerifiedResponse) +
            individualApprovalMetric(tr('tf_ir_approval'), pairs.approval, hasVerifiedResponse) +
            trackedMetric(tr('tf_ir_tracked_activities'), rows, 'trackedItems', tr('tf_ir_completed')) +
            trackedMetric(tr('tf_ir_tracked_resources'), rows, 'trackedResources', tr('tf_ir_accessed')) + '</div></section>' +
            '<div class="fr-ir-grid"><section class="fr-ir-section"><h3>' + esc(tr('tf_ir_timeline')) + '</h3><div class="fr-ir-timeline">' + timelineHtml + '</div></section>' +
            '<section class="fr-ir-section"><h3>' + esc(tr('tf_ir_registered_interventions')) + '</h3><div class="fr-ir-table-wrap"><table><thead><tr><th>' + esc(tr('tf_ir_date')) + '</th><th>' + esc(tr('tf_ir_reason')) + '</th><th>' + esc(tr('tf_ir_teacher')) + '</th><th>' + esc(tr('tf_ir_return')) + '</th></tr></thead><tbody>' + interventionRows + '</tbody></table></div></section></div>' +
            '<section class="fr-ir-conclusion"><svg class="mwa-ui-icon" aria-hidden="true"><use href="#mwa-icon-lightbulb"></use></svg><div><strong>' + esc(hasVerifiedResponse ? tr('tf_ir_conclusion') : tr('tf_ir_followup')) + '</strong><p>' + esc(conclusion) + '</p></div></section>' +
            '<p class="fr-ir-note">' + esc(tr('tf_ir_causality_note')) + '</p></div></section>');
    }

    function openIndividualReport(studentName) {
        closeIndividualReport();
        var overlay = document.createElement('div');
        overlay.id = 'frIndividualReportOverlay';
        overlay.className = 'fr-ir-overlay';
        var loading = document.createElement('div');
        loading.className = 'fr-loading';
        var spinner = document.createElement('div');
        spinner.className = 'spinner';
        var loadingText = document.createElement('p');
        loadingText.textContent = tr('tf_ir_preparing');
        loading.appendChild(spinner);
        loading.appendChild(loadingText);
        overlay.appendChild(loading);
        (document.getElementById('block-mwa-dashboard-app') || document.body).appendChild(overlay);
        overlay.addEventListener('click', function(event) { if (event.target === overlay) { closeIndividualReport(); } });
        var dashboard = (Store.getModule && Store.getModule('MWADashboard')) || window.MWADashboard || {};
        var state = dashboard.state || {logs: [], grades: [], students: []};
        loadReportData().then(function(result) {
            var analysed = (result.interventions || []).map(function(row) { return analyseRow(row, state, result.indicators || {}); });
            var key = lower(studentName);
            renderIndividualReport(studentName, analysed.filter(function(row) {
                return lower(row.raw.student_name || row.raw.student_email) === key && Number(row.raw.snapshot_timecreated || 0) > 0 && row.raw.status === 'sent';
            }));
        }).catch(function(error) {
            closeIndividualReport();
            Store.notify((error && error.message) || tr('tf_ir_generation_error'), 'error');
        });
    }

    function render() {
        var box = document.getElementById('teacherFeedbackWrap');
        if (!box) { return; }
        Store.renderHtml(box, '<div class="fr-loading"><div class="spinner"></div><p>' + tr('tf_loading_consolidate') + '</p></div>');
        var dashboard = (Store.getModule && Store.getModule('MWADashboard')) || window.MWADashboard || {};
        var state = dashboard.state || {logs: [], grades: [], students: []};
        loadReportData().then(function(result) {
            data = (result.interventions || []).map(function(row) { return analyseRow(row, state, result.indicators || {}); });
            var eligible = data.filter(function(row) {
                return Number(row.raw.snapshot_timecreated || 0) > 0 && row.raw.status === 'sent';
            });
            renderReport(eligible);
        }).catch(function() {
            Store.renderHtml(box, '<div class="fr-empty"><span>!</span><h2>' + tr('tf_error_load') + '</h2><p>' + tr('tf_error_load_sub') + '</p></div>');
        });
    }

    var api = {render: render, openIndividualReport: openIndividualReport, closeIndividualReport: closeIndividualReport, printIndividualReport: printIndividualReport};
    window.MWATeacherFeedback = api;
    Store.register('MWATeacherFeedback', api);
    return api;
});
