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
      var CURRENT_AVAILABILITY = 'all';
      var CURRENT_SEARCH = '';
      var SEARCH_BOUND = false;
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
      var MOD_QUIZ = set(['quiz', 'lesson', 'scorm',
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

        /* H5P has its own bucket, separate from quiz/lesson/SCORM. */
        if (isH5PActivity(r) && !isManagementEvent(r))
          return 'h5p';
        if ((comp.indexOf('h5p') >= 0 || comp.indexOf('hvp') >= 0 ||
             ev.indexOf('h5p') >= 0 || ev.indexOf('hvp') >= 0) && !isManagementEvent(r))
          return 'h5p';

        /* Attempt based. */
        if (MOD_QUIZ[modtype] || MOD_QUIZ[comp] ||
            comp === 'questionÃƒÂ¡rio' || comp === 'questionario' || comp === 'pacote h5p' ||
            comp === 'scorm package' || comp === 'liÃƒÂ§ÃƒÂ£o' || comp === 'escolha' || comp === 'jogo' ||
            ev.indexOf('xapi') >= 0 || ev.indexOf('attempt') >= 0)
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
        if (pct >= 80) {
          return { cls: 'excellent', icon: '<i class="act-status-dot" style="background:var(--green);"></i>', text: excellentLabel, color: 'var(--green)', bg: 'var(--green-dim)', border: 'rgba(58,171,122,.25)' };
        }
        if (pct >= 60) {
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

      function availabilityState(r) {
        var now = Math.floor(Date.now() / 1000);
        var available = Number(r && r._available);
        var from = Number((r && r._availablefrom) || 0);
        var until = Number((r && r._availableuntil) || 0);
        if (until && now > until) return 'closed';
        if (available === 1 && (!from || now >= from) && (!until || now <= until)) return 'open';
        if (from && now < from) return 'future';
        return available === 1 ? 'open' : 'unknown';
      }

      function mergeAvailability(current, next) {
        if (current === 'closed' || next === 'closed') return 'closed';
        if (current === 'open' || next === 'open') return 'open';
        if (current === 'future' || next === 'future') return 'future';
        return 'unknown';
      }
    
      /**
       * Only assignments, quizzes and forums produce a real submission. Pages,
       * books, URLs, files, folders and wikis are consumption-only resources:
       * for those, "completion" means the student opened the item, so the
       * delivery/submission KPIs are meaningless and must be hidden.
       */
      function hasSubmission(type) {
        return type === 'tarefa' || type === 'quiz' || type === 'forum' || type === 'h5p';
      }

      var TYPE_COLORS = { forum: 'var(--blue)', quiz: 'var(--amber)', h5p: 'var(--purple)', tarefa: 'var(--green)', video: 'var(--teal)', login: 'var(--purple)', outro: 'var(--muted)' };
      var TYPE_ICONS  = { forum: '&#128172;', quiz: '?', h5p: '&#129513;', tarefa: '&#9998;', video: '&#128196;', login: '&#128273;', outro: '&#128204;' };
    
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
    
          /* Read cmid and modtype directly from the log metadata. */
          var logCmid    = parseInt(r._cmid || r.contextinstanceid || r.coursemoduleid || 0, 10) || 0;
          var logModtype = norm(r._modtype || '').toLowerCase();
          if (!actMap[k]) actMap[k] = { count: 0, students: new Set(), concluded: new Set(), submitted: new Set(), type: t, availability: 'unknown', availableuntil: 0, cmid: 0, modtype: '' };
          /* Keep the first valid cmid and non-empty modtype found. */
          if (logCmid  > 0 && actMap[k].cmid  === 0) actMap[k].cmid  = logCmid;
          if (logModtype && !actMap[k].modtype)       actMap[k].modtype = logModtype;
          actMap[k].availability = mergeAvailability(actMap[k].availability, availabilityState(r));
          var logAvailableUntil = Number((r && r._availableuntil) || 0);
          if (logAvailableUntil > 0 && (!actMap[k].availableuntil || logAvailableUntil < actMap[k].availableuntil)) {
            actMap[k].availableuntil = logAvailableUntil;
          }
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

      /**
       * Replace historical submission events with Moodle's current activity
       * state. Logs are intentionally historical: a deleted forum post or a
       * reverted assignment submission remains in the log forever. The grade
       * payload exposes act_current_N from the live Moodle tables, so it is the
       * authoritative source for current delivery/completion status.
       */
      function applyCurrentSubmissionState(actMap, grades) {
        if (!grades || !grades.length || !actMap) return;
        var meta = grades[0] && grades[0].__mwa_type__ === 'activity_names' ? grades[0] : null;
        if (!meta) return;

        var byCmid = {};
        var byName = {};
        Object.keys(actMap).forEach(function(key) {
          var entry = actMap[key];
          var cmid = Number(entry && entry.cmid || 0);
          if (cmid) byCmid[String(cmid)] = entry;
          byName[norm(key).toLowerCase()] = entry;
        });

        Object.keys(meta).forEach(function(key) {
          var match = key.match(/^act_(\d+)$/);
          if (!match) return;
          var seq = match[1];
          var cmid = Number(meta['act_cmid_' + seq] || 0);
          var activityName = norm(meta[key]).toLowerCase();
          var entry = (cmid && byCmid[String(cmid)]) || byName[activityName];
          if (!entry || !hasSubmission(entry.type)) return;

          // Current state wins over historical "submitted/posted" log events.
          entry.submitted = new Set();
          entry.concluded = new Set();

          grades.slice(1).forEach(function(row) {
            if (!row || row.__mwa_type__ !== 'student') return;
            var first = norm(row['First name'] || row.firstname || '');
            var last = norm(row['Last name'] || row.lastname || '');
            var student = norm((first + ' ' + last).trim());
            if (!student) return;
            var current = Number(row['act_current_' + seq] || 0);
            if (current > 0) {
              entry.submitted.add(student);
              entry.concluded.add(student);
            }
          });
        });
      }

      function typeForModule(modname) {
        var mod = norm(modname).toLowerCase();
        if (MOD_FORUM[mod]) return 'forum';
        if (MOD_TAREFA[mod]) return 'tarefa';
        if (mod === 'h5pactivity' || mod === 'hvp') return 'h5p';
        if (MOD_QUIZ[mod]) return 'quiz';
        return 'video';
      }

      function availabilityForModule(module) {
        var now = Math.floor(Date.now() / 1000);
        var from = Number(module.availablefrom || 0);
        var until = Number(module.availableuntil || 0);
        var isAvailable = module.available === true || module.available === 1 || module.available === '1';
        if (until && now > until) return 'closed';
        if (isAvailable && (!from || now >= from) && (!until || now <= until)) return 'open';
        if (from && now < from) return 'future';
        return isAvailable ? 'open' : 'future';
      }

      function availabilityLabel(state) {
        if (state === 'closed') return tr('act_availability_closed');
        if (state === 'today') return tr('act_availability_today');
        if (state === 'future') return tr('act_availability_future');
        if (state === 'open') return tr('act_availability_open');
        return tr('act_availability_unavailable');
      }

      function cardAvailability(entry, dueDate) {
        if (entry.availability === 'closed') return 'closed';
        if (entry.availability === 'future') return 'future';
        if (dueDate && Date.now() > dueDate) return 'closed';
        if (dueDate) {
          var due = new Date(dueDate);
          var today = new Date();
          if (due.getFullYear() === today.getFullYear() && due.getMonth() === today.getMonth() && due.getDate() === today.getDate()) {
            return 'today';
          }
        }
        return 'open';
      }

      function mergeCourseModules(actMap, modules, pruneMissing) {
        var byCmid = {};
        var validCmids = {};
        var validNames = {};
        (modules || []).forEach(function(module) {
          var modname = norm(module && (module.modname || module.modtype)).toLowerCase();
          var name = norm(module && module.name);
          var cmid = Number(module && module.cmid || 0);
          if (name && cmid && modname !== 'label') {
            validCmids[cmid] = true;
            validNames[name.toLowerCase()] = true;
          }
        });
        if (pruneMissing !== false) {
          Object.keys(actMap).forEach(function(key) {
            var existingCmid = Number(actMap[key].cmid || 0);
            if ((existingCmid && !validCmids[existingCmid]) ||
                (!existingCmid && !validNames[key.toLowerCase()])) {
              delete actMap[key];
            }
          });
        }
        Object.keys(actMap).forEach(function(key) {
          var cmid = Number(actMap[key].cmid || 0);
          if (cmid) byCmid[cmid] = key;
        });
        (modules || []).forEach(function(module) {
          var modname = norm(module && (module.modname || module.modtype)).toLowerCase();
          var name = norm(module && module.name);
          var cmid = Number(module && module.cmid || 0);
          if (!name || !cmid || modname === 'label') return;
          var key = byCmid[cmid];
          if (!key) {
            key = name;
            actMap[key] = {
              count: 0, students: new Set(), concluded: new Set(), submitted: new Set(),
              type: typeForModule(modname), availability: availabilityForModule(module),
              availableuntil: Number(module.availableuntil || 0), cmid: cmid, modtype: modname
            };
            byCmid[cmid] = key;
            return;
          }
          var entry = actMap[key];
          entry.modtype = entry.modtype || modname;
          entry.type = entry.type || typeForModule(modname);
          entry.availability = availabilityForModule(module);
          entry.availableuntil = Number(module.availableuntil || 0);
        });
      }
    
      function renderKPIs(arr, allStudents, filteredCount) {
        var container = document.getElementById('actKpisRow');
        if (!container) return;
        var totalAcc = arr.reduce(function (s, e) { return s + e[1].count; }, 0);
        var avgPct   = arr.length
          ? Math.round(arr.reduce(function (s, e) { return s + e[1].students.size; }, 0) / arr.length / Math.max(1, allStudents.length) * 100)
          : 0;
    
        Store.renderHtml(container, '<div class="kpi c-blue act-analysis-kpi act-kpi-blue"><div class="act-kpi-head"><span class="act-kpi-icon" aria-hidden="true">&#128203;</span><div class="kpi-label">' + tr('act_kpi_unique') + tip('act_tip_unique_resources') + '</div></div><div class="kpi-value">' + arr.length + '</div><div class="kpi-sub">' + filteredCount + ' ' + tr('act_kpi_unique_shown') + '</div></div>'
        + '<div class="kpi c-green act-analysis-kpi act-kpi-green"><div class="act-kpi-head"><span class="act-kpi-icon" aria-hidden="true">&#128065;</span><div class="kpi-label">' + tr('act_kpi_total_acc') + tip('act_tip_total_accesses') + '</div></div><div class="kpi-value">' + totalAcc.toLocaleString() + '</div><div class="kpi-sub" aria-hidden="true">&nbsp;</div></div>'
        + '<div class="kpi c-amber act-analysis-kpi act-kpi-amber"><div class="act-kpi-head"><span class="act-kpi-icon" aria-hidden="true">&#128101;</span><div class="kpi-label">' + tr('act_kpi_students') + tip('act_tip_distinct_students') + '</div></div><div class="kpi-value">' + allStudents.length + '</div><div class="kpi-sub" aria-hidden="true">&nbsp;</div></div>'
        + '<div class="kpi c-teal act-analysis-kpi act-kpi-teal"><div class="act-kpi-head"><span class="act-kpi-icon" aria-hidden="true">&#128200;</span><div class="kpi-label">' + tr('act_kpi_avg') + tip('act_tip_average_per_resource') + '</div></div><div class="kpi-value">' + avgPct + '%</div><div class="kpi-sub">' + tr('act_kpi_avg_delta') + '</div></div>');
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
          var dueDate = (renderActivities._dueDates && v.cmid && renderActivities._dueDates[v.cmid]) || 0;
          var cardState = cardAvailability(v, dueDate);
          var scheduleLabel = cardState === 'closed' || cardState === 'today'
            ? availabilityLabel(cardState)
            : dueDate
              ? tr('act_due_label').replace('{date}', new Date(dueDate).toLocaleDateString())
              : v.availability === 'future'
                ? availabilityLabel('future')
                : tr('act_kpi_no_deadline');
    
          var accessedSt    = Array.from(v.students).sort(function (a, b) { return a.localeCompare(b); });
          var concludedSt   = Array.from(v.concluded).sort(function (a, b) { return a.localeCompare(b); });
          var pendingSt     = accessedSt.filter(function (s) { return !v.concluded.has(s); });
          var notAccessedSt = allStudents.filter(function (s) { return !v.students.has(s); }).sort(function (a, b) { return a.localeCompare(b); });
    
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
    
          /* cmid and modtype come from actMap, populated from logs by buildActMap. */
          ACT_DATA[idx] = {
            title: k, type: v.type, color: color,
            cmid: v.cmid || 0, modtype: v.modtype || '',
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
            availability: cardState,
            availableuntil: v.availableuntil || 0,
            duedate: dueDate,
            graded: graded
          };
     
          return '<div class="act-card act-card-' + esc(cardState) + '" onclick="window.MWAActivities.openModal(' + idx + ')">'
            + '<div class="act-card-title-row">'
              + '<div class="act-card-progress" style="--act-progress:' + pct + ';--act-progress-color:' + barColor + ';"><span>' + pct + '%</span></div>'
              + '<div class="act-card-name">' + esc(k) + '</div>'
              + '<span class="act-card-arrow">&nearr;</span>'
            + '</div>'
            + '<div class="act-card-status-row">'
              + '<span class="act-status-chip act-schedule-chip ' + esc(cardState) + '"><span>' + esc(scheduleLabel) + '</span></span>'
              + (graded ? statusChip(deliveryStatus) : '')
              + statusChip(coverageStatus)
            + '</div>'
            + '<div class="act-card-stats">'
              + '<div class="act-card-stat"><div class="act-card-stat-label">' + tr('act_col_students') + '</div><div class="act-card-stat-val" style="color:var(--text);">' + v.students.size + '</div></div>'
              + '<div class="act-card-stat"><div class="act-card-stat-label">' + tr('act_col_accesses') + '</div><div class="act-card-stat-val" style="color:var(--blue);">' + v.count.toLocaleString() + '</div></div>'
              + (v.concluded.size > 0
                  ? '<div class="act-card-stat"><div class="act-card-stat-label">' + tr('act_col_completion_rate') + '</div><div class="act-card-stat-val" style="color:var(--green);">' + concPct + '%</div></div>'
                  : '')
            + '</div>'
          + '</div>';
        }).join('');
    
        Store.renderHtml(grid, html);
      }

      function renderAvailabilityLegend() {
        var box = document.getElementById('actAvailabilityLegend');
        if (!box) return;
        Store.renderHtml(box,
          '<span class="act-legend-item"><i class="act-legend-dot open"></i>' + esc(tr('act_legend_open')) + '</span>'
          + '<span class="act-legend-item"><i class="act-legend-dot today"></i>' + esc(tr('act_legend_today')) + '</span>'
          + '<span class="act-legend-item"><i class="act-legend-dot closed"></i>' + esc(tr('act_legend_closed')) + '</span>'
          + '<span class="act-legend-item"><i class="act-legend-dot future"></i>' + esc(tr('act_legend_future')) + '</span>'
        );
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
    
        var hasDueInfo = d.graded;
        var kpiCols = hasDueInfo ? 4 : 3;
        var dueDateKpi = '';
        if (d.graded) {
          if (d.duedate) {
            var dd = new Date(d.duedate);
            var now = new Date();
            var diffDays = Math.ceil((dd - now) / (1000 * 60 * 60 * 24));
            var dateStr = dd.toLocaleDateString();
            if (d.availability === 'closed') {
              dueDateKpi = '<div style="background:var(--panel2);border:1px solid var(--line);border-radius:12px;padding:12px 14px;text-align:center;">'
                  + '<div style="font-size:.65rem;font-weight:900;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);margin-bottom:4px;">' + tr('act_kpi_closed', 'Finalizada') + '</div>'
                  + '<div style="font-size:1rem;font-weight:900;color:var(--red);">' + dateStr + '</div>'
              + '</div>';
            } else {
              var dateColor = diffDays <= 3 ? 'var(--amber, #f59e0b)' : 'var(--blue)';
              dueDateKpi = '<div style="background:var(--panel2);border:1px solid var(--line);border-radius:12px;padding:12px 14px;text-align:center;">'
                  + '<div style="font-size:.65rem;font-weight:900;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);margin-bottom:4px;">' + (d.availability === 'today' ? tr('act_availability_today', 'Finaliza hoje') : tr('act_kpi_due', 'Finaliza em')) + '</div>'
                  + '<div style="font-size:1rem;font-weight:900;color:' + dateColor + ';">' + dateStr + '</div>'
              + '</div>';
            }
          } else if (d.availability === 'closed') {
            dueDateKpi = '<div style="background:var(--panel2);border:1px solid var(--line);border-radius:12px;padding:12px 14px;text-align:center;">'
                + '<div style="font-size:.65rem;font-weight:900;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);margin-bottom:4px;">' + tr('act_kpi_closed', 'Finalizada') + '</div>'
                + '<div style="font-size:1rem;font-weight:900;color:var(--red);">&#10006;</div>'
            + '</div>';
          } else {
            dueDateKpi = '<div style="background:var(--panel2);border:1px solid var(--line);border-radius:12px;padding:12px 14px;text-align:center;">'
                + '<div style="font-size:.65rem;font-weight:900;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);margin-bottom:4px;">' + tr('act_kpi_no_deadline', 'Sem prazo') + '</div>'
                + '<div style="font-size:1rem;font-weight:900;color:var(--green);">' + tr('act_kpi_no_deadline', 'Sem prazo') + '</div>'
            + '</div>';
          }
        }

        var kpiHtml =
          '<div style="display:grid;grid-template-columns:repeat(' + kpiCols + ',1fr);gap:10px;margin-bottom:14px;">'
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
          + dueDateKpi
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
                  + esc(d.type) + ' &middot; ' + (d.concludedSt.length + d.pendingSt.length) + ' ' + tr('act_col_students') + ' &middot; ' + d.totalAcc.toLocaleString() + ' ' + tr('act_col_accesses')
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
            btnAi.appendChild(document.createTextNode(tr('act_ai_generating', 'Gerando sugestão...')));
            out.hidden = false;
            Store.renderHtml(out,
              '<div class="act-ai-loading-card">'
                + '<div class="act-ai-loading-title">&#10022; ' + esc(tr('ev_ai_title', 'Análise & Recomendação IA')) + '</div>'
                + '<div class="act-ai-loading-row" role="status" aria-live="polite">'
                  + '<span class="act-ai-dot" aria-hidden="true"></span>'
                  + '<span class="act-ai-dot" aria-hidden="true"></span>'
                  + '<span class="act-ai-dot" aria-hidden="true"></span>'
                  + '<span class="act-ai-loading-label">' + esc(tr('act_ai_loading', 'Carregando...')) + '</span>'
                + '</div>'
              + '</div>');
            var cfg = Store.getConfig ? Store.getConfig() : {};
            var courseid = parseInt(cfg.courseid || 0, 10);
            /* Fetch the actual activity or resource content before building the prompt. */
            var contentPromise;
            if (d.cmid > 0) {
              contentPromise = Store.callAction('block_mwa_dashboard_get_activity_content', {
                courseid: courseid,
                cmid: d.cmid
              }).then(function (res) {
                return (res && res.success && res.content) ? res.content : '';
              }).catch(function () { return ''; });
            } else {
              contentPromise = Promise.resolve('');
            }
            contentPromise.then(function (actContent) {
              var modtype = (d.modtype || d.type || '').toLowerCase();

              /* Pedagogical context by module type. */
              var modContext = {
                assign: tr('act_mod_context_assign'),
                forum: tr('act_mod_context_forum'),
                quiz: tr('act_mod_context_quiz'),
                h5pactivity: tr('act_mod_context_h5pactivity'),
                page: tr('act_mod_context_page'),
                book: tr('act_mod_context_book'),
                url: tr('act_mod_context_url'),
                scorm: tr('act_mod_context_scorm'),
                glossary: tr('act_mod_context_glossary'),
                wiki: tr('act_mod_context_wiki'),
                data: tr('act_mod_context_data'),
                resource: tr('act_mod_context_resource'),
                label: tr('act_mod_context_label'),
              };
              var modDesc = modContext[modtype] || modtype || tr('act_mod_context_activity');

              /* Formatted engagement data. */
              var totalStu = d.allStudentsCount || (d.concludedSt.length + d.pendingSt.length + d.notAccessedSt.length);
              var engData = [
                'Cobertura de acesso: ' + d.pct + '% (' + (d.concludedSt.length + d.pendingSt.length) + '/' + totalStu + ' alunos acessaram)',
                'Conclusão/entrega: '   + d.concPct + '% (' + d.concludedSt.length + '/' + totalStu + ' concluíram)',
                'Viram mas não concluíram: ' + d.pendingSt.length,
                'Sem nenhum acesso: '   + d.notAccessedSt.length,
              ].join('\n');

              var promptParts = [];

              if (actContent) {
                var trimmedContent = actContent.length > 4500
                  ? actContent.substring(0, 4500) + '\\n[...conteúdo resumido]'
                  : actContent;

                promptParts.push(
                  'Analise esta ' + modDesc + ' do Moodle. Responda em português, sem markdown.'
                );
                promptParts.push('');
                promptParts.push('Escreva 2 seções:');
                promptParts.push('');
                promptParts.push('1. DIAGNÓSTICO');
                promptParts.push('Avalie o que está sendo pedido e avaliado. Cruze com o engajamento.');
                if (modtype === 'forum') {
                  promptParts.push('IMPORTANTE: Resuma o que os alunos discutiram — temas centrais, argumentos, convergências, lacunas. Avalie se a reflexão foi suficiente.');
                } else if (modtype === 'quiz') {
                  promptParts.push('IMPORTANTE: Avalie CADA questão (Q1, Q2...) — clareza do enunciado, qualidade das alternativas, distratores, feedback.');
                } else if (modtype === 'assign') {
                  promptParts.push('IMPORTANTE: Avalie clareza do enunciado, critérios de avaliação, prazos, tentativas, forma de entrega.');
                }
                // YouTube videos detected in content
                if (actContent.indexOf('VÍDEO DO YOUTUBE DETECTADO') >= 0) {
                  promptParts.push('IMPORTANTE: Foi detectado um vídeo do YouTube. Use as informações extraídas (título, canal, descrição) para avaliar se o vídeo é adequado ao objetivo pedagógico e se está alinhado com o tema do curso. Afirme com base nos dados — não use expressões como "parece ter" ou "possivelmente". Se as informações forem insuficientes, pesquise sobre o vídeo usando a URL fornecida.');
                }
                if (modtype === 'page' || modtype === 'url' || modtype === 'resource') {
                  promptParts.push('IMPORTANTE: Avalie se o conteúdo/recurso é adequado, se a estrutura é clara, se está alinhado com o objetivo do curso. Se houver links ou vídeos, avalie se complementam bem o conteúdo.');
                }
                promptParts.push('');
                promptParts.push('2. SUGESTÕES DE MELHORIA');
                promptParts.push('3 a 5 melhorias concretas. Referencie trechos específicos do conteúdo. Nunca diga que está bom — sempre melhore algo.');
                if (modtype === 'quiz') {
                  promptParts.push('Sugira melhorias em questões específicas (ex: "Na Q2, reformule porque...").');
                } else if (modtype === 'forum') {
                  promptParts.push('Sugira como aprofundar a discussão e melhorar a qualidade dos posts.');
                }
                if (actContent.indexOf('VÍDEO DO YOUTUBE DETECTADO') >= 0) {
                  promptParts.push('Para vídeos: sugira se deveria haver atividade complementar (quiz, fórum, resumo), se há vídeos alternativos ou complementares que enriqueceriam o aprendizado.');
                }
                promptParts.push('');
                promptParts.push('--- ENGAJAMENTO ---');
                promptParts.push(d.title + ' (' + modDesc + ')');
                promptParts.push(engData);
                promptParts.push('');
                promptParts.push('--- CONTEÚDO DA ATIVIDADE (leia com atenção antes de responder) ---');
                promptParts.push(trimmedContent);
              } else {
                /* Without content, base the diagnosis on engagement data only. */
                promptParts.push(
                  'Você é um especialista em Learning Analytics para EaD no Moodle. ' +
                  'Analise esta ' + modDesc + ' com base nos dados de engajamento e responda em português, sem markdown pesado.'
                );
                promptParts.push('');
                promptParts.push('Atividade: ' + d.title);
                promptParts.push('Tipo: ' + modDesc);
                promptParts.push(engData);
                promptParts.push('');
                promptParts.push('Faça duas partes:');
                promptParts.push('1. DIAGNÓSTICO — o que os dados indicam sobre o engajamento e possíveis causas.');
                promptParts.push('2. SUGESTÕES DE MELHORIA — 3 melhorias concretas na atividade para aumentar participação, conclusão ou qualidade das interações.');
              }

              var prompt = promptParts.join('\n');
              return Store.callAction('block_mwa_dashboard_get_ai_recommendation', {
                courseid: courseid,
                student_name: d.title,
                prompt: prompt
              });
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
              var actName = d.title || '';
              var preset = {
                type: 'moodle',
                reason: 'Tarefa pendente',
                subject: tr('ac_ctx_act_pending_subject', 'Atividade pendente: {activity}').replace('{activity}', actName),
                message: tr('ac_ctx_act_pending_body', '').replace(/\{activity\}/g, actName)
              };
              window.MWAActionCenter.openBulkModal(targets, preset);
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
              var actName = d.title || '';
              var preset = {
                type: 'moodle',
                reason: 'Sem acesso',
                subject: tr('ac_ctx_act_no_access_subject', 'Você ainda não acessou: {activity}').replace('{activity}', actName),
                message: tr('ac_ctx_act_no_access_body', '').replace(/\{activity\}/g, actName)
              };
              window.MWAActionCenter.openBulkModal(targets, preset);
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
        var typeSelect = document.getElementById('actTypeFilter');
        if (typeSelect) typeSelect.value = type;
        document.querySelectorAll('.act-tab').forEach(function (b) { b.classList.remove('active'); });
        if (btn) btn.classList.add('active');
        renderActivities();
      }
    
      function bindSearch() {
        if (SEARCH_BOUND) return;
        var input = document.getElementById('actSearchInput');
        var availability = document.getElementById('actAvailabilityFilter');
        var typeSelect = document.getElementById('actTypeFilter');
        var clear = document.getElementById('actClearFilters');
        if (!input && !availability && !typeSelect) return;
        SEARCH_BOUND = true;
        if (input) {
          input.addEventListener('input', function () {
            CURRENT_SEARCH = String(input.value || '').trim().toLowerCase();
            renderActivities();
          });
        }
        if (availability) {
          availability.value = CURRENT_AVAILABILITY;
          availability.addEventListener('change', function () {
            CURRENT_AVAILABILITY = String(availability.value || 'all');
            // The low-engagement filter represents items on which the teacher can act now.
            // When the teacher explicitly asks for future items, leave that
            // review shortcut and show the complete future selection.
            if (CURRENT_AVAILABILITY === 'future' && CURRENT_FILTER === 'low') {
              CURRENT_FILTER = 'all';
              if (typeSelect) typeSelect.value = 'all';
            }
            renderActivities();
          });
        }
        if (typeSelect) {
          typeSelect.value = CURRENT_FILTER;
          typeSelect.addEventListener('change', function () {
            CURRENT_FILTER = String(typeSelect.value || 'all');
            renderActivities();
          });
        }
        if (clear) {
          clear.addEventListener('click', function () {
            CURRENT_FILTER = 'all';
            CURRENT_AVAILABILITY = 'all';
            CURRENT_SEARCH = '';
            if (typeSelect) typeSelect.value = 'all';
            if (availability) availability.value = 'all';
            if (input) input.value = '';
            renderActivities();
          });
        }
      }

      function renderActivities() {
        bindSearch();
        renderAvailabilityLegend();
        var dash  = window.MWADashboard || {};
        var state = dash.state || {};
        var logs  = state.logs || [];
    
        var built    = buildActMap(logs);
        var actMap   = built.actMap;
        var timeMap  = built.timeMap;
        var emailMap = built.emailMap;
        var config = Store.getConfig ? Store.getConfig() : {};
        mergeCourseModules(actMap, config.activitylinks || []);
        // Grade metadata contains Moodle's complete open/close restrictions.
        // Apply it last so a reduced cm_info record cannot turn a future item into an open card.
        mergeCourseModules(actMap, state.activities || [], false);

        // Delivery/completion must reflect the CURRENT Moodle state, not a
        // historical event that may refer to a post/submission later deleted.
        applyCurrentSubmissionState(actMap, state.grades || []);

        // Fetch due/cutoff dates for graded activities via dedicated endpoint (reliable, not dependent on course "show activity dates" setting)
        var courseid = parseInt(config.courseid || 0, 10);
        if (courseid && !renderActivities._dueDatesFetched) {
          renderActivities._dueDatesFetched = true;
          try {
            Store.callAction('block_mwa_dashboard_get_due_dates', { courseid: courseid }).then(function(res) {
              var list = (res && res.dates) || [];
              var dueDates = {};
              list.forEach(function(item) {
                if (item && item.cmid && item.duedate) {
                  dueDates[item.cmid] = item.duedate;
                }
              });
              renderActivities._dueDates = dueDates;
              ACT_DATA.forEach(function(act) {
                if (act && act.cmid && dueDates[act.cmid]) {
                  act.duedate = dueDates[act.cmid];
                } else if (act && !act.duedate && act.availableuntil) {
                  act.duedate = act.availableuntil * 1000;
                }
              });
              renderActivities();
            }).catch(function() {});
          } catch(e) {}
        }
    
        var arr      = Object.entries(actMap).sort(function (a, b) { return b[1].count - a[1].count; });
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

        var gradedCmids = {};
        var gradedNames = {};
        var gradeMeta = state.grades && state.grades[0] && state.grades[0].__mwa_type__ === 'activity_names'
          ? state.grades[0] : null;
        if (gradeMeta) {
          Object.keys(gradeMeta).forEach(function (key) {
            var match = key.match(/^act_(\d+)$/);
            if (!match) return;
            var seq = match[1];
            var cmid = parseInt(gradeMeta['act_cmid_' + seq] || 0, 10) || 0;
            var name = norm(gradeMeta[key]).toLowerCase();
            if (cmid) gradedCmids[String(cmid)] = true;
            if (name) gradedNames[name] = true;
          });
        }
        var lowReachBase = Math.max(1, allStudents.length);
        var lowActiveBase = Math.max(1, activeCompletionBase);
        var filtered = arr.filter(function (e) {
          var t = e[1].type;
          var filterDueDate = (renderActivities._dueDates && e[1].cmid && renderActivities._dueDates[e[1].cmid]) ||
            (e[1].availableuntil ? e[1].availableuntil * 1000 : 0);
          var filterAvailability = cardAvailability(e[1], filterDueDate);
          var okType;
          if (CURRENT_FILTER === 'all') {
            okType = true;
          } else if (CURRENT_FILTER === 'activity') {
            okType = !!(e[1].cmid && gradedCmids[String(e[1].cmid)]) ||
              !!gradedNames[String(e[0] || '').toLowerCase()];
          } else if (CURRENT_FILTER === 'low') {
            var rp = Math.round(e[1].students.size / lowReachBase * 100);
            var dp = Math.round(e[1].concluded.size / lowActiveBase * 100);
            okType = filterAvailability !== 'future' && filterAvailability !== 'closed' && (rp < 60 || dp < 60);
          } else {
            okType = t === CURRENT_FILTER;
          }
          if (!okType) return false;
          if (CURRENT_AVAILABILITY !== 'all' && filterAvailability !== CURRENT_AVAILABILITY) return false;
          if (!CURRENT_SEARCH) return true;
          return String(e[0] || '').toLowerCase().indexOf(CURRENT_SEARCH) >= 0;
        });
    

        renderKPIs(arr, allStudents, filtered.length);
        renderGrid(filtered, allStudents, activeCompletionBase, logs, emailMap, timeMap);
      }
    
      function getChatSnapshot() {
        var dash = window.MWADashboard || {};
        var state = dash.state || {};
        var logs = state.logs || [];
        var built = buildActMap(logs);
        var actMap = built.actMap;
        var config = Store.getConfig ? Store.getConfig() : {};
        mergeCourseModules(actMap, config.activitylinks || []);
        mergeCourseModules(actMap, state.activities || [], false);
        applyCurrentSubmissionState(actMap, state.grades || []);

        var seen = {};
        var allStudents = [];
        logs.forEach(function(r) {
          var n = studentName(r);
          if (!n || seen[n]) return;
          seen[n] = true;
          allStudents.push(n);
        });
        var denominator = allStudents.length;
        return Object.entries(actMap).sort(function(a, b) {
          return b[1].count - a[1].count;
        }).map(function(entry) {
          var name = entry[0];
          var v = entry[1];
          var unique = v.students.size;
          return {
            nome: name,
            tipo: v.type,
            cmid: v.cmid || 0,
            acessos: v.count,
            alunosUnicos: unique,
            totalConsiderado: denominator,
            cobertura: denominator ? Math.round(unique / denominator * 100) : 0,
            faltam: Math.max(denominator - unique, 0)
          };
        });
      }

      function showLowPerformers() {
        CURRENT_AVAILABILITY = 'all';
        CURRENT_SEARCH = '';
        var input = document.getElementById('actSearchInput');
        var availability = document.getElementById('actAvailabilityFilter');
        if (input) input.value = '';
        if (availability) availability.value = 'all';
        setFilter('low', document.getElementById('actTabLow'));
      }

      window.MWAActivities = {
        render:    renderActivities,
        setFilter: setFilter,
        filterLowEngagement: showLowPerformers,
        showLowPerformers: showLowPerformers,
        openModal: openModal,
        closeModal: closeModal,
        getChatSnapshot: getChatSnapshot
      };
    
    })();

    return window.MWAActivities;
});
