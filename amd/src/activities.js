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
 * @module     block_mwa_dashboard/activities
 * @copyright  2026 Bruno Porto
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

/**
 * Note: This module generates HTML markup directly in JavaScript strings for
 * performance reasons Ã¢â‚¬â€ the dashboard renders large dynamic datasets (student lists,
 * heatmaps, charts) that require frequent partial updates. All user-supplied data is
 * escaped via the esc() helper before insertion into the DOM.
 * See: https://docs.moodle.org/dev/JavaScript_Modules#HTML_generation
 */
define(['block_mwa_dashboard/dashboardstore'], function(Store) {

    'use strict';

    var window = Store.windowFacade();

    (function () {
      'use strict';
    
      
      function tr(key, fallback) {
        var S = Store.getStrings() || {};
        var v = Object.prototype.hasOwnProperty.call(S, key) ? S[key] : '';
        if (typeof v === 'string' && v && !/^\[\[.*\]\]$/.test(v)) return v;
        return fallback || key;
      }
      function esc(v) {
        return String(v === undefined || v === null ? '' : v)
          .replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
          });
      }
      function tip(key) {
        var text = esc(tr(key));
        return '<span class="mwa-help-tip" tabindex="0" role="img" aria-label="' + text + '" title="' + text + '" data-tooltip="' + text + '">?</span>';
      }
      function norm(v) { return (v === undefined || v === null) ? '' : String(v).trim(); }
      function eventName(r) { return norm(r.nomedoevento || r.eventname || r.event || ''); }
      function componentName(r) { return norm(r.componente || r.component || ''); }
      function studentName(r) { return norm(r.nomecompleto || r.userfullname || r.fullname || r.name || r.affecteduser || ''); }
      function studentEmail(r) { return norm(r.email || r.useremail || ''); }
      function logTime(r) { return norm(r.hora || r.time || r.date || ''); }
      function resourceName(r) {
        var ctx = norm(r.contextodoevento || r.eventcontext || r.context || '');
        var ev = eventName(r);
        var name = ctx || ev || 'Outro';
        return name.replace(/^(quiz|question[aÃƒÂ¡]rio|assignment|tarefa|forum|f[oÃƒÂ³]rum|page|p[aÃƒÂ¡]gina|resource|recurso|file|arquivo|h5p|hvp|conte[uÃƒÂº]do interativo|conte.{0,4}do interativo|interactive content)\s*:\s*/i, '');
      }
      function lowerText(r) {
        return [
          componentName(r),
          eventName(r),
          norm(r.contextodoevento || r.eventcontext || r.context || ''),
          norm(r.descrio || r.description || ''),
          norm(r._modtype || '')
        ].join(' ').toLowerCase();
      }
      function isH5PActivity(r) {
        var text = lowerText(r);
        return text.indexOf('h5p') >= 0 ||
               text.indexOf('hvp') >= 0 ||
               text.indexOf('conteÃƒÂºdo interativo') >= 0 ||
               text.indexOf('conteÃƒÂ£Ã‚Âºdo interativo') >= 0 ||
               text.indexOf('conte') >= 0 && text.indexOf('interativo') >= 0 ||
               text.indexOf('interactive content') >= 0;
      }
      function isManagementEvent(r) {
        var ev = eventName(r).toLowerCase();
        return ev.indexOf('mÃƒÂ³dulo de curso atualizado') >= 0 ||
               ev.indexOf('mÃƒÂ³dulo de curso criado') >= 0 ||
               ev.indexOf('course module updated') >= 0 ||
               ev.indexOf('course module created') >= 0;
      }
      function isCompletionEvent(r) {
        var ev = eventName(r).toLowerCase();
        return ev.indexOf('conclus') >= 0 ||
               ev.indexOf('completion') >= 0 ||
               ev.indexOf('completed') >= 0;
      }
    
      var CURRENT_FILTER = 'all';
      var ACT_DATA = [];
    
      /**
       * Moodle module name -> behaviour bucket. Keys are the values that can
       * arrive either in _modtype (canonical, e.g. "data") or in the component
       * column (English display name, e.g. "database"); localised names are
       * matched separately inside getEventType.
       */
      function set(list) {
        var o = {};
        list.forEach(function (k) { o[k] = true; });
        return o;
      }
      /* Contribute an entry/post. */
      var MOD_FORUM = set(['forum', 'glossary', 'data', 'database', 'chat']);
      /* Submit a file or text. */
      var MOD_TAREFA = set(['assign', 'assignment', 'workshop']);
      /* Attempt based / auto-graded. */
      var MOD_QUIZ = set(['quiz', 'lesson', 'scorm', 'h5pactivity', 'h5p', 'hvp',
        'choice', 'feedback', 'survey', 'questionnaire', 'game']);
      /* Consume only. */
      var MOD_RESOURCE = set(['page', 'book', 'url', 'resource', 'file', 'folder',
        'imscp', 'wiki']);

      function getEventType(r) {
        var comp = componentName(r).toLowerCase();
        var modtype = (r._modtype||'').toLowerCase();
        var ev   = eventName(r).toLowerCase();
        if (modtype === 'label' || comp === 'label' ||
            comp.indexOf('Ã¡rea de mÃ­dia e texto') >= 0 ||
            comp.indexOf('area de midia e texto') >= 0 ||
            comp.indexOf('text and media area') >= 0) {
          return 'login';
        }
    
        /* Non-module noise is discarded before anything else. */
        if (comp === 'system' || ev === 'user logged in' || ev === 'user logged out' || ev === 'course viewed') {
          return 'login';
        }

        /* Post/entry based: the student contributes an item. */
        if (MOD_FORUM[modtype] || MOD_FORUM[comp] ||
            comp === 'fÃƒÂ³rum' || comp === 'glossÃƒÂ¡rio' || comp === 'base de dados')
          return 'forum';

        /* File/text submission based. */
        if (MOD_TAREFA[modtype] || MOD_TAREFA[comp] ||
            comp === 'tarefa' || comp === 'laboraÃƒÂ³rio de avaliaÃƒÂ§ÃƒÂ£o')
          return 'tarefa';

        if (isH5PActivity(r) && !isManagementEvent(r))
          return 'quiz';

        /* Attempt based. */
        if (MOD_QUIZ[modtype] || MOD_QUIZ[comp] ||
            comp === 'questionÃƒÂ¡rio' || comp === 'questionario' || comp === 'pacote h5p' ||
            comp === 'scorm package' || comp === 'liÃƒÂ§ÃƒÂ£o' || comp === 'escolha' || comp === 'jogo' ||
            comp.indexOf('h5p') >= 0 || comp.indexOf('hvp') >= 0 ||
            ev.indexOf('h5p') >= 0 || ev.indexOf('hvp') >= 0 || ev.indexOf('xapi') >= 0 || ev.indexOf('attempt') >= 0)
          return 'quiz';

        /* Consume-only resources. */
        if (MOD_RESOURCE[modtype] || MOD_RESOURCE[comp] ||
            comp === 'pÃƒÂ¡gina' || comp === 'livro' || comp === 'arquivo' || comp === 'pasta' || comp === 'rÃƒÂ³tulo')
          return 'video';

        /* Anything else that is still a real course module (a plugin we do not
           know about) is shown as a resource rather than silently dropped. */
        if (modtype || comp) {
          return 'video';
        }
        return 'outro';
      }
    
      function isCourseGeneral(name) {
        var n = norm(name);
        var plain = n.toLowerCase().normalize ? n.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') : n.toLowerCase();
        if (plain.indexOf('area de midia e texto') === 0 ||
            plain.indexOf('area de texto e midia') === 0 ||
            plain.indexOf('text and media area') === 0) return true;
        if (!n) return true;
        if (/^curso\s*:/i.test(n)) return true;
        if (/^sistema$/i.test(n)) return true;
        if (/^system$/i.test(n)) return true;
        if (/^ÃƒÂ¡rea de texto/i.test(n)) return true;
        if (/^mÃƒÂ­dia/i.test(n)) return true;
        return false;
      }
    
      function isSubmission(r) {
        var ev   = eventName(r).toLowerCase();
        var comp = componentName(r).toLowerCase();
    
        if (comp === 'assignment' || comp === 'tarefa') {
          return ev === 'submission submitted' ||
                 ev === 'file uploaded' ||
                 ev.includes('submit') ||
                 ev.includes('upload');
        }
    
        if (isH5PActivity(r)) {
          return isCompletionEvent(r) ||
                 ev.indexOf('attempt') >= 0 ||
                 ev.indexOf('tentativa') >= 0 ||
                 ev.indexOf('submitted') >= 0 ||
                 ev.indexOf('submit') >= 0 ||
                 ev === 'updated' ||
                 ev.indexOf('hvp') >= 0 ||
                 ev.indexOf('h5p') >= 0 ||
                 ev.indexOf('xapi') >= 0;
        }

        if (comp === 'quiz' || comp === 'questionÃƒÂ¡rio' || comp === 'questionario' || comp === 'h5p' || comp === 'hvp' ||
            comp.indexOf('h5p') >= 0 || comp.indexOf('hvp') >= 0 ||
            comp === 'scorm package' || comp === 'lesson') {
          return ev === 'quiz attempt submitted' ||
                 ev === 'submission submitted' ||
                 ev === 'mod_hvp: attempt submitted' ||
                 ev === 'h5p attempt submitted' ||
                 ev.includes('attempt_submitted') ||
                 ev.includes('attempt submitted') ||
                 ev.includes('mod_hvp') ||
                 ev.includes('hvp') ||
                 ev.includes('h5p') ||
                 ev.includes('xapi') ||
                 ev.includes('submitted') ||
                 ev.includes('submit') ||
                 ev.includes('tentativa enviada') ||
                 ev.includes('tentativa submetida') ||
                 ev.includes('enviou a tentativa');
        }
    
        if (comp === 'forum' || comp === 'fÃƒÂ³rum') {
          return ev === 'forum post created' ||
                 ev === 'discussion created' ||
                 ev === 'content created' ||
                 ev.includes('post_created') ||
                 ev.includes('post created') ||
                 ev.includes('discussion_created') ||
                 ev.includes('discussion created') ||
                 ev.includes('subscription_created') ||
                 ev.includes('subscription created') ||
                 ev.includes('user_subscribed') ||
                 ev.includes('user subscribed');
        }
    
        return false;
      }
    
      function parseDate(log) {
        if (log._ts) return new Date(Number(log._ts) * 1000);
        var s = logTime(log);
        var m = s.match(/(\d{2})\/(\d{2})\/(\d{2}),\s*(\d{2}):(\d{2})/);
        if (m) return new Date(2000 + Number(m[3]), Number(m[2]) - 1, Number(m[1]), Number(m[4]), Number(m[5]));
        return null;
      }
    
      function fmtTime(ms) {
        if (!ms || ms <= 0) return '-';
        var min = Math.round(ms / 60000);
        if (min < 1) return '< 1min';
        if (min < 60) return min + 'min';
        return Math.floor(min / 60) + 'h ' + (min % 60) + 'min';
      }

      function statusFor(pct, excellentLabel, satisfactoryLabel, criticalLabel) {
        if (pct >= 70) {
          return { cls: 'excellent', icon: '<i class="act-status-dot" style="background:var(--green);"></i>', text: excellentLabel, color: 'var(--green)', bg: 'var(--green-dim)', border: 'rgba(58,171,122,.25)' };
        }
        if (pct >= 40) {
          return { cls: 'satisfactory', icon: '<i class="act-status-dot" style="background:var(--amber);"></i>', text: satisfactoryLabel, color: 'var(--amber)', bg: 'var(--amber-dim)', border: 'rgba(201,138,42,.25)' };
        }
        return { cls: 'critical', icon: '<i class="act-status-dot" style="background:var(--red);"></i>', text: criticalLabel, color: 'var(--red)', bg: 'var(--red-dim)', border: 'rgba(201,95,89,.25)' };
      }

      function statusChip(status) {
        return '<span class="act-status-chip ' + status.cls + '" style="background:' + status.bg + ';color:' + status.color + ';">'
          + status.icon + '<span>' + esc(status.text) + '</span></span>';
      }

      function detailStatus(status) {
        return '<div class="act-detail-status ' + status.cls + '" style="background:' + status.bg + ';color:' + status.color + ';">'
          + status.icon + '<span>' + esc(status.text) + '</span></div>';
      }

      function aiHtmlToText(value) {
        return String(value || '')
          .replace(/^#{1,6}\s*/gm, '')
          .replace(/\*\*(.*?)\*\*/g, '$1')
          .replace(/\*(.*?)\*/g, '$1')
          .trim();
      }
    
      function emailFor(name, logs) {
        var found = '';
        logs.some(function (r) {
          if (studentName(r) === name && studentEmail(r)) { found = studentEmail(r); return true; }
          return false;
        });
        return found;
      }
    
      var GAP_MS = 5  * 60 * 1000;
      var CAP_MS = 30 * 60 * 1000;
    
      function calcTimesForResource(timestamps) {
        var result = {};
        Object.keys(timestamps).forEach(function (name) {
          var sorted = timestamps[name].slice().sort(function (a, b) { return a - b; });
          var total = 0;
          for (var i = 1; i < sorted.length; i++) {
            var gap = sorted[i] - sorted[i - 1];
            if (gap < GAP_MS) total += Math.min(gap, CAP_MS);
          }
          if (sorted.length === 1) total = 60000;
          result[name] = total;
        });
        return result;
      }
    
      /**
       * Only assignments, quizzes and forums produce a real submission. Pages,
       * books, URLs, files, folders and wikis are consumption-only resources:
       * for those, "completion" means the student opened the item, so the
       * delivery/submission KPIs are meaningless and must be hidden.
       */
      function hasSubmission(type) {
        return type === 'tarefa' || type === 'quiz' || type === 'forum';
      }

      var TYPE_COLORS = { forum: 'var(--blue)', quiz: 'var(--amber)', tarefa: 'var(--green)', video: 'var(--teal)', login: 'var(--purple)', outro: 'var(--muted)' };
      var TYPE_ICONS  = { forum: '&#128172;', quiz: '?', tarefa: '&#9998;', video: '&#128196;', login: '&#128273;', outro: '&#128204;' };
    
      function buildActMap(logs) {
        var actMap   = {};
        var timeMap  = {};
        var emailMap = {};
    
        logs.forEach(function (r) {
          var name = studentName(r);
          var k    = resourceName(r);
          if (isCourseGeneral(k)) return;
          var t = getEventType(r);
          if (t === 'outro' || t === 'login') return;
    
          if (!actMap[k]) actMap[k] = { count: 0, students: new Set(), concluded: new Set(), submitted: new Set(), type: t };
          actMap[k].count++;
          actMap[k].students.add(name);
          if (isSubmission(r)) actMap[k].submitted.add(name);
    
          if (studentEmail(r)) emailMap[name] = studentEmail(r);
    
          var d = parseDate(r);
          if (d && name) {
            if (!timeMap[k]) timeMap[k] = {};
            if (!timeMap[k][name]) timeMap[k][name] = [];
            timeMap[k][name].push(d.getTime());
          }
        });
    
        Object.values(actMap).forEach(function (v) {
          if (v.type === 'tarefa' || v.type === 'quiz') {
            if (v.submitted.size > 0) v.concluded = new Set(v.submitted);
          } else if (v.type === 'forum') {
            if (v.submitted.size > 0) v.concluded = new Set(v.submitted);
          } else {
            v.concluded = new Set(v.students);
          }
        });
    
        return { actMap: actMap, timeMap: timeMap, emailMap: emailMap };
      }
    
      function renderKPIs(arr, allStudents, filteredCount) {
        var container = document.getElementById('actKpisRow');
        if (!container) return;
        var totalAcc = arr.reduce(function (s, e) { return s + e[1].count; }, 0);
        var avgPct   = arr.length
          ? Math.round(arr.reduce(function (s, e) { return s + e[1].students.size; }, 0) / arr.length / Math.max(1, allStudents.length) * 100)
          : 0;
    
        Store.renderHtml(container, '<div class="kpi c-blue"><div class="kpi-label">' + tr('act_kpi_unique') + tip('act_tip_unique_resources') + '</div><div class="kpi-value">' + arr.length + '</div><div class="kpi-sub">' + filteredCount + ' ' + tr('act_kpi_unique_shown') + '</div></div>'
        + '<div class="kpi c-green"><div class="kpi-label">' + tr('act_kpi_total_acc') + tip('act_tip_total_accesses') + '</div><div class="kpi-value">' + totalAcc.toLocaleString('pt-BR') + '</div></div>'
        + '<div class="kpi c-amber"><div class="kpi-label">' + tr('act_kpi_students') + tip('act_tip_distinct_students') + '</div><div class="kpi-value">' + allStudents.length + '</div></div>'
        + '<div class="kpi c-teal"><div class="kpi-label">' + tr('act_kpi_avg') + tip('act_tip_average_per_resource') + '</div><div class="kpi-value">' + avgPct + '%</div><div class="kpi-sub">' + tr('act_kpi_avg_delta') + '</div></div>');
      }
    
      function renderGrid(filtered, allStudents, activeCompletionBase, logs, emailMap, timeMap) {
        var grid = document.getElementById('actResourceGrid');
        if (!grid) return;
        if (!filtered.length) { Store.renderHtml(grid, '<div class="act-empty">' + esc(tr('no_data')) + '</div>'); return; }
    
        ACT_DATA = [];
    
        var html = filtered.map(function (entry, idx) {
          var k = entry[0], v = entry[1];
          var reachBase = Math.max(1, allStudents.length);
          var activeBase = Math.max(1, activeCompletionBase);
          var pct      = Math.round(v.students.size / reachBase * 100);
          var color    = TYPE_COLORS[v.type] || 'var(--muted)';
          var graded   = hasSubmission(v.type);
          var concPct  = Math.round(v.concluded.size / activeBase * 100);
          var barColor = pct >= 70 ? 'var(--green)' : pct >= 40 ? 'var(--blue)' : 'var(--red)';
          var deliveryStatus = statusFor(
            concPct,
            tr('ct_delivery_excellent'),
            tr('ct_delivery_satisfactory'),
            tr('ct_delivery_critical')
          );
          var coverageStatus = statusFor(
            pct,
            tr('ct_reach_excellent'),
            tr('ct_reach_satisfactory'),
            tr('ct_reach_critical')
          );
    
          var accessedSt    = Array.from(v.students).sort(function (a, b) { return a.localeCompare(b, 'pt-BR'); });
          var concludedSt   = Array.from(v.concluded).sort(function (a, b) { return a.localeCompare(b, 'pt-BR'); });
          var pendingSt     = accessedSt.filter(function (s) { return !v.concluded.has(s); });
          var notAccessedSt = allStudents.filter(function (s) { return !v.students.has(s); }).sort(function (a, b) { return a.localeCompare(b, 'pt-BR'); });
    
          var stuTimes   = timeMap[k] ? calcTimesForResource(timeMap[k]) : {};
          var timeValues = Object.values(stuTimes);
          var avgMs      = timeValues.length ? timeValues.reduce(function (a, b) { return a + b; }, 0) / timeValues.length : 0;
    
          var noAccEmails  = notAccessedSt.map(function (s) { return emailMap[s] || ''; }).filter(Boolean);
          var pendEmails   = pendingSt.map(function (s) { return emailMap[s] || ''; }).filter(Boolean);
    
          var concludedLabel = v.type === 'forum' ? tr('act_label_posted') : (v.type === 'tarefa' || v.type === 'quiz') ? tr('act_label_submitted') : tr('act_label_accessed');
          var pendingLabel   = v.type === 'forum' ? tr('act_label_saw_not_posted') : (v.type === 'tarefa' || v.type === 'quiz') ? tr('act_label_saw_not_submitted') : tr('act_label_pending');
    
          function studentTag(s, cls, suffix) {
            return '<button type="button" class="act-stag ' + cls + '" title="' + esc(s) + '" data-act-profile="' + esc(s) + '">' + esc(s.split(' ')[0]) + (suffix || '') + '</button>';
          }
          var tagsDone = concludedSt.map(function (s) {
            return studentTag(s, 'act-stag-done', ' &#10003;');
          }).join('');
          var tagsPend = pendingSt.map(function (s) {
            return studentTag(s, 'act-stag-pend', ' &times;');
          }).join('');
          var tagsNone = notAccessedSt.map(function (s) {
            return studentTag(s, 'act-stag-none', '');
          }).join('');
          var timeRanking = Object.entries(stuTimes)
            .sort(function (a, b) { return b[1] - a[1]; })
            .slice(0, 10);
    
          ACT_DATA[idx] = {
            title: k, type: v.type, color: color,
            allStudentsCount: allStudents.length,
            activeBaseCount: activeCompletionBase,
            totalAcc: v.count,
            concludedSt: concludedSt, pendingSt: pendingSt, notAccessedSt: notAccessedSt,
            concPct: concPct, pct: pct,
            concludedLabel: concludedLabel, pendingLabel: pendingLabel,
            tagsDone: tagsDone, tagsPend: tagsPend, tagsNone: tagsNone,
            avgMs: avgMs, timeRanking: timeRanking,
            noAccEmails: noAccEmails,
            pendEmails: pendEmails,
            deliveryStatus: deliveryStatus,
            coverageStatus: coverageStatus,
            graded: graded
          };
    
          return '<div class="act-card" onclick="window.MWAActivities.openModal(' + idx + ')">'
            + '<div class="act-card-title-row">'
              + '<div class="act-card-dot" style="background:' + color + ';"></div>'
              + '<div class="act-card-name">' + esc(k) + '</div>'
              + '<span class="act-card-arrow">&nearr;</span>'
            + '</div>'
            + '<div class="act-card-status-row">'
              + (graded ? statusChip(deliveryStatus) : '')
              + statusChip(coverageStatus)
            + '</div>'
            + '<div class="act-card-bar-wrap">'
              + '<div class="act-card-bar-bg"><div class="act-card-bar-fill" style="width:' + pct + '%;background:' + barColor + ';"></div></div>'
              + '<span class="act-card-bar-pct" style="color:' + barColor + ';">' + pct + '%</span>'
            + '</div>'
            + '<div class="act-card-stats">'
              + '<div class="act-card-stat"><div class="act-card-stat-label">' + tr('act_col_students') + '</div><div class="act-card-stat-val" style="color:var(--text);">' + v.students.size + '</div></div>'
              + '<div class="act-card-stat"><div class="act-card-stat-label">' + tr('act_col_accesses') + '</div><div class="act-card-stat-val" style="color:var(--blue);">' + v.count.toLocaleString('pt-BR') + '</div></div>'
              + (v.concluded.size > 0
                  ? '<div class="act-card-stat"><div class="act-card-stat-label">' + tr('act_col_completion_rate') + '</div><div class="act-card-stat-val" style="color:var(--green);">' + concPct + '%</div></div>'
                  : '')
            + '</div>'
          + '</div>';
        }).join('');
    
        Store.renderHtml(grid, html);
      }
    
      function openModal(idx) {
        var d = ACT_DATA[idx];
        if (!d) return;
    
        var overlay = document.createElement('div');
        overlay.className = 'act-modal-overlay';
        overlay.id = 'actModalOverlay';
        overlay.onclick = function (e) { if (e.target === overlay) closeModal(); };
    
        var icon      = TYPE_ICONS[d.type] || '&#128204;';
        var color     = d.color;
        var barColor  = d.pct >= 70 ? 'var(--green)' : d.pct >= 40 ? 'var(--blue)' : 'var(--red)';
        var total     = d.concludedSt.length + d.pendingSt.length;
    
        var kpiHtml =
          '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:14px;">'
          + '<div style="background:var(--panel2);border:1px solid var(--line);border-radius:12px;padding:12px 14px;text-align:center;">'
              + '<div style="font-size:.65rem;font-weight:900;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);margin-bottom:4px;">' + tr('act_modal_participated') + '</div>'
              + '<div style="font-size:1.6rem;font-weight:900;color:var(--green);">' + d.concludedSt.length + '</div>'
          + '</div>'
          + '<div style="background:var(--panel2);border:1px solid var(--line);border-radius:12px;padding:12px 14px;text-align:center;">'
              + '<div style="font-size:.65rem;font-weight:900;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);margin-bottom:4px;">' + tr('act_modal_pending') + '</div>'
              + '<div style="font-size:1.6rem;font-weight:900;color:' + (d.pendingSt.length > 0 ? 'var(--red)' : 'var(--green)') + ';">' + d.pendingSt.length + '</div>'
          + '</div>'
          + '<div style="background:var(--panel2);border:1px solid var(--line);border-radius:12px;padding:12px 14px;text-align:center;">'
              + '<div style="font-size:.65rem;font-weight:900;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);margin-bottom:4px;">' + tr('act_modal_completion_rate') + '</div>'
              + '<div style="font-size:1.6rem;font-weight:900;color:' + barColor + ';">' + d.concPct + '%</div>'
          + '</div>'
          + '</div>';
    
        var progressHtml =
          '<div style="display:flex;align-items:center;gap:8px;margin-bottom:16px;">'
          + '<div style="flex:1;height:8px;background:#e8ecf5;border-radius:4px;overflow:hidden;">'
            + '<div style="width:' + d.pct + '%;height:100%;background:' + barColor + ';border-radius:4px;transition:width .4s;"></div>'
          + '</div>'
          + '<span style="font-size:.78rem;font-weight:900;color:' + barColor + ';min-width:36px;">' + d.pct + '%</span>'
           + '</div>';

        /* Resources have no submission, so only the coverage box applies. */
        var statusHtml = '<div class="act-detail-grid">'
          + (d.graded
            ? '<div class="act-detail-box">'
                + '<div class="act-detail-label">' + esc(tr('ct_delivered')) + '</div>'
                + '<div class="act-detail-number ok">' + d.concludedSt.length + '</div>'
                + '<div class="act-detail-hint">' + esc(d.concludedLabel) + '</div>'
              + '</div>'
              + '<div class="act-detail-box">'
                + '<div class="act-detail-label">' + esc(tr('ct_not_delivered')) + '</div>'
                + '<div class="act-detail-number bad">' + d.pendingSt.length + '</div>'
                + '<div class="act-detail-hint">' + esc(d.pendingLabel) + '</div>'
              + '</div>'
              + '<div class="act-detail-box">'
                + '<div class="act-detail-label">' + esc(tr('act_status_delivery')) + '</div>'
                + detailStatus(d.deliveryStatus)
                + '<div class="act-detail-hint">' + esc(tr('act_status_delivery_hint')) + '</div>'
              + '</div>'
            : '<div class="act-detail-box">'
                + '<div class="act-detail-label">' + esc(tr('act_col_completion_rate')) + '</div>'
                + '<div class="act-detail-number ok">' + d.concPct + '%</div>'
                + '<div class="act-detail-hint">' + esc(tr('act_completion_resource_hint')) + '</div>'
              + '</div>')
          + '<div class="act-detail-box">'
            + '<div class="act-detail-label">' + esc(tr('coverage')) + '</div>'
            + detailStatus(d.coverageStatus)
            + '<div class="act-detail-hint">' + esc(tr('act_status_coverage_hint')) + '</div>'
          + '</div>'
        + '</div>';
    
        function compactNameSection(label, count, tags, cls) {
          if (!count) return '';
          return '<details class="act-name-section ' + cls + '">'
            + '<summary>'
              + '<span class="act-name-section-title">' + esc(label) + '</span>'
              + '<span class="act-name-count">' + count + '</span>'
              + '<span class="act-name-action">Ver nomes</span>'
            + '</summary>'
            + '<div class="act-tags-wrap">' + tags + '</div>'
          + '</details>';
        }
        var tagsHtml = '<div class="act-name-sections">'
          + compactNameSection(d.concludedLabel, d.concludedSt.length, d.tagsDone, 'done')
          + compactNameSection(d.pendingLabel, d.pendingSt.length, d.tagsPend, 'pending')
          + compactNameSection(tr('act_label_no_access'), d.notAccessedSt.length, d.tagsNone, 'none')
          + '</div>';
    
        var timeHtml = '';
        if (d.timeRanking.length) {
          timeHtml = '<div class="act-time-panel act-time-collapsed">'
            + '<button type="button" class="act-time-toggle" id="actToggleTime" aria-expanded="false">'
              + '<span style="font-size:.78rem;font-weight:900;color:var(--text);">&#9201; ' + tr('act_modal_time_per_student') + '</span>'
              + '<span style="font-size:.72rem;color:var(--muted);">' + tr('act_modal_avg') + ': ' + fmtTime(d.avgMs) + '</span>'
              + '<span class="act-name-action">Ver tempos</span>'
            + '</button>'
            + '<div class="act-time-list" id="actTimeList" hidden>'
            + d.timeRanking.map(function (entry) {
                var name  = entry[0];
                var ms    = entry[1];
                var parts = name.split(/\s+/).filter(Boolean);
                var short = parts[0] || name;
                var tclr  = ms >= 600000 ? 'var(--green)' : ms >= 120000 ? 'var(--amber)' : 'var(--red)';
                var hidden = d.timeRanking.indexOf(entry) >= 5 ? ' hidden' : '';
                return '<button type="button" class="act-time-chip act-time-extra' + hidden + '" data-act-profile="' + esc(name) + '" title="' + esc(name) + '">'
                  + '<span class="act-time-chip-dot" style="background:' + tclr + ';"></span>'
                  + '<span class="act-time-chip-name">' + esc(short) + '</span>'
                  + '<span class="act-time-chip-value">' + fmtTime(ms) + '</span>'
                  + '</button>';
              }).join('')
            + (d.timeRanking.length > 5 ? '<button type="button" class="act-show-more-time" id="actShowMoreTime">' + esc(tr('act_show_more_times')) + '</button>' : '')
            + '</div>'
          + '</div>';
        }

        var aiHtml = '<div class="act-ai-panel">'
          + '<div>'
            + '<strong>' + esc(tr('act_ai_title')) + '</strong>'
            + '<span>' + esc(tr('act_ai_desc')) + '</span>'
          + '</div>'
          + '<button type="button" id="actGenerateSuggestion">&#10024; ' + esc(tr('act_ai_generate')) + '</button>'
          + '<div class="act-ai-result" id="actAiResult" hidden></div>'
        + '</div>';
    
        var footerHtml = '<div style="display:flex;justify-content:flex-end;gap:8px;padding:14px 20px 16px;border-top:1px solid var(--line);flex-wrap:wrap;">'
          + (d.pendingSt.length
              ? '<button class="act-msg-btn" id="actMsgPend">'
                + '&#9993; ' + tr('act_msg_pending') + ' (' + d.pendingSt.length + ')'
                + '</button>'
              : '')
          + (d.notAccessedSt.length
              ? '<button class="act-msg-btn" id="actMsgNoAcc">'
                + '&#9993; ' + tr('act_msg_no_access') + ' (' + d.notAccessedSt.length + ')'
                + '</button>'
              : '')
          + '<button style="background:var(--panel);border:1px solid var(--line2);border-radius:12px;padding:9px 18px;font-family:inherit;font-size:.8rem;font-weight:800;color:var(--muted);cursor:pointer;" '
            + 'onclick="window.MWAActivities.closeModal()">' + tr('act_modal_close') + '</button>'
        + '</div>';
    
        Store.renderHtml(overlay, '<div class="act-modal">'
    
            + '<div class="act-modal-head">'
              + '<span style="font-size:1.1rem;flex-shrink:0;">' + icon + '</span>'
              + '<div style="flex:1;min-width:0;">'
                + '<div class="act-modal-title">' + esc(d.title) + '</div>'
                + '<div style="font-size:.7rem;color:var(--muted);margin-top:2px;">'
                  + esc(d.type) + ' &middot; ' + (d.concludedSt.length + d.pendingSt.length) + ' ' + tr('act_col_students') + ' &middot; ' + d.totalAcc.toLocaleString('pt-BR') + ' ' + tr('act_col_accesses')
                + '</div>'
              + '</div>'
              + '<button class="act-modal-close" onclick="window.MWAActivities.closeModal()">&times;</button>'
            + '</div>'
    
            + '<div class="act-modal-body">'
              + kpiHtml
              + progressHtml
              + statusHtml
              + tagsHtml
              + timeHtml
              + aiHtml
            + '</div>'
    
            + footerHtml
    
          + '</div>');
    
        (document.getElementById('block-mwa-dashboard-app') || document.body).appendChild(overlay);
        overlay.querySelectorAll('[data-act-profile]').forEach(function (el) {
          el.addEventListener('click', function (ev) {
            ev.preventDefault();
            ev.stopPropagation();
            var student = el.getAttribute('data-act-profile') || '';
            closeModal();
            if (student && window.goToStudentProfile) {
              window.goToStudentProfile(student);
            } else if (window.showPage) {
              window.showPage('studentprofile');
            }
          });
        });
        var handler = function (e) { if (e.key === 'Escape') { closeModal(); document.removeEventListener('keydown', handler); } };
        document.addEventListener('keydown', handler);

        var btnPend  = document.getElementById('actMsgPend');
        var btnNoAcc = document.getElementById('actMsgNoAcc');
        var btnToggleTime = document.getElementById('actToggleTime');
        var timeList = document.getElementById('actTimeList');
        if (btnToggleTime && timeList) {
          btnToggleTime.onclick = function () {
            var willOpen = timeList.hidden;
            timeList.hidden = !willOpen;
            btnToggleTime.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
            var action = btnToggleTime.querySelector('.act-name-action');
            if (action) {
              action.textContent = willOpen ? 'Ocultar tempos' : 'Ver tempos';
            }
          };
        }
        var btnMoreTime = document.getElementById('actShowMoreTime');
        if (btnMoreTime) {
          btnMoreTime.onclick = function () {
            overlay.querySelectorAll('.act-time-extra').forEach(function (row) { row.hidden = false; });
            btnMoreTime.remove();
          };
        }
        var btnAi = document.getElementById('actGenerateSuggestion');
        if (btnAi) {
          btnAi.onclick = function () {
            var out = document.getElementById('actAiResult');
            if (!out) return;
            btnAi.disabled = true;
            btnAi.classList.add('is-loading');
            btnAi.textContent = '';
            var loadingIcon = document.createElement('span');
            loadingIcon.setAttribute('aria-hidden', 'true');
            loadingIcon.textContent = '⏳';
            btnAi.appendChild(loadingIcon);
            btnAi.appendChild(document.createTextNode(' ' + tr('act_ai_generating', 'Gerando sugestão...')));
            out.hidden = false;
            Store.renderHtml(out,
              '<div class="act-ai-loading">'
                + '<div class="act-ai-loading-head"><span class="act-ai-spinner"></span><strong>' + esc(tr('act_ai_generating', 'Gerando sugestão...')) + '</strong></div>'
                + '<div class="act-ai-loading-track"><span></span></div>'
              + '</div>');
            var cfg = Store.getConfig ? Store.getConfig() : {};
            var courseid = parseInt(cfg.courseid || 0, 10);
            var prompt = [
              'Analise pedagogicamente esta atividade ou recurso do Moodle e responda em português, sem markdown pesado.',
              'Nome: ' + d.title,
              'Tipo: ' + d.type,
              'Cobertura de acesso: ' + d.pct + '%',
              'Conclusão/entrega: ' + d.concPct + '%',
              'Alunos que concluíram/entregaram: ' + d.concludedSt.length,
              'Alunos que viram mas ainda não concluíram: ' + d.pendingSt.length,
              'Alunos sem acesso registrado: ' + d.notAccessedSt.length,
              'Faça duas partes: 1. Diagnóstico pedagógico. 2. Sugestões de melhoria da atividade, conteúdo, instruções, apoio e posicionamento na trilha.'
            ].join('\n');
            Store.callAction('block_mwa_dashboard_get_ai_recommendation', {
              courseid: courseid,
              student_name: d.title,
              prompt: prompt
            }).then(function (res) {
              var text = aiHtmlToText((res && (res.recommendation || res.response || res.content)) || '');
              if (!text) throw new Error(tr('err_ajax_bridge'));
              Store.renderHtml(out, '<div class="act-ai-text">' + esc(text).replace(/\n/g, '<br>') + '</div>');
            }).catch(function (e) {
              Store.renderHtml(out, '<div class="act-ai-error">' + esc(String((e && e.message) || e)) + '</div>');
            }).then(function () {
              btnAi.disabled = false;
              btnAi.classList.remove('is-loading');
              btnAi.textContent = '';
              var generateIcon = document.createElement('span');
              generateIcon.setAttribute('aria-hidden', 'true');
              generateIcon.textContent = '✨';
              btnAi.appendChild(generateIcon);
              btnAi.appendChild(document.createTextNode(' ' + tr('act_ai_generate')));
            });
          };
        }
        if (btnPend) {
          btnPend.onclick = function () {
            var targets = d.pendingSt.map(function (s) {
              var ei = d.pendingSt.indexOf(s);
              return { name: s, email: (d.pendEmails && d.pendEmails[ei]) || '', userid: 0 };
            });
            if (window.MWAActionCenter && window.MWAActionCenter.openBulkModal) {
              closeModal();
              window.MWAActionCenter.openBulkModal(targets);
            }
          };
        }
        if (btnNoAcc) {
          btnNoAcc.onclick = function () {
            var targets = d.notAccessedSt.map(function (s) {
              var ei = d.notAccessedSt.indexOf(s);
              return { name: s, email: (d.noAccEmails && d.noAccEmails[ei]) || '', userid: 0 };
            });
            if (window.MWAActionCenter && window.MWAActionCenter.openBulkModal) {
              closeModal();
              window.MWAActionCenter.openBulkModal(targets);
            }
          };
        }
      }
    
      function closeModal() {
        var el = document.getElementById('actModalOverlay');
        if (el) el.remove();
      }
    
      function setFilter(type, btn) {
        CURRENT_FILTER = type;
        document.querySelectorAll('.act-tab').forEach(function (b) { b.classList.remove('active'); });
        if (btn) btn.classList.add('active');
        renderActivities();
      }
    
      function renderActivities() {
        var dash  = window.MWADashboard || {};
        var state = dash.state || {};
        var logs  = state.logs || [];
    
        var built    = buildActMap(logs);
        var actMap   = built.actMap;
        var timeMap  = built.timeMap;
        var emailMap = built.emailMap;
    
        var arr      = Object.entries(actMap).sort(function (a, b) { return b[1].count - a[1].count; });
        var filtered = CURRENT_FILTER === 'all'
          ? arr
          : arr.filter(function (e) { return e[1].type === CURRENT_FILTER; });
    
        var seen = {};
        var allStudents = [];
        logs.forEach(function (r) {
          var n = studentName(r);
          if (!n) return;
          if (!seen[n]) { seen[n] = true; allStudents.push(n); }
        });
        (state.students || []).forEach(function (s) {
          var n = norm(s && s.name);
          if (n && s.email && !emailMap[n]) emailMap[n] = s.email;
        });
    
        var activeCompletionBase = (state.students || []).filter(function (s) {
          return Number((s && s.interactions) || 0) > 0;
        }).length || allStudents.length;

        renderKPIs(arr, allStudents, filtered.length);
        renderGrid(filtered, allStudents, activeCompletionBase, logs, emailMap, timeMap);
      }
    
      window.MWAActivities = {
        render:    renderActivities,
        setFilter: setFilter,
        openModal: openModal,
        closeModal: closeModal
      };
    
    })();

    return window.MWAActivities;
});
