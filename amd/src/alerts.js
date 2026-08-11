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
 * @module     block_mwa_dashboard/alerts
 * @copyright  2026 Bruno Porto
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
define(['block_mwa_dashboard/dashboardstore'], function(Store) {

    'use strict';

    var window = Store.windowFacade();

    (function () {
      'use strict';
    
      
      function tr(key) {
        var S = Store.getStrings() || {};
        var v = Object.prototype.hasOwnProperty.call(S, key) ? S[key] : '';
        if (typeof v === 'string' && v && !/^\[\[.*\]\]$/.test(v)) return v;
        return key;
      }
    
      
      function trN(key, n) {
        return tr(key).replace('{n}', n);
      }
    
      function esc(v) {
        return String(v === undefined || v === null ? '' : v)
          .replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
          });
      }
    
      function norm(v) { return (v === undefined || v === null) ? '' : String(v).trim(); }
      function lower(v) { return norm(v).toLowerCase(); }
      function cmidOf(log) { return String(log._cmid || log.contextinstanceid || '').trim(); }
      function activityName(log) { return norm(log.contextodoevento || log.eventcontext || log.context || log._resource || log.nomedoevento || log.eventname); }
      function activityKeys(log) {
        var keys = [];
        var cmid = cmidOf(log);
        var name = lower(activityName(log));
        if (cmid) keys.push('cmid:' + cmid);
        if (name) keys.push('name:' + name);
        return keys;
      }
      function componentOf(log) { return lower(log.componente || log.component || log._modtype || log.modtype); }
      function isEvaluativeComponent(log) {
        var c = componentOf(log);
        var t = lower([log.nomedoevento, log.eventname, log.action, log.contextodoevento, log.eventcontext].join(' '));
        return c === 'assignment' || c === 'assign' || c === 'tarefa' ||
          c === 'forum' || c === 'fórum' || c === 'quiz' || c === 'questionário' || c === 'questionario' ||
          c === 'h5p' || c === 'hvp' || c === 'h5pactivity' || c.indexOf('h5p') >= 0 || c.indexOf('hvp') >= 0 ||
          t.indexOf('quiz') >= 0 || t.indexOf('question') >= 0 || t.indexOf('h5p') >= 0 || t.indexOf('hvp') >= 0;
      }
      function isViewEvent(log) {
        var ev = lower(log.nomedoevento || log.eventname || log.action || '');
        return ev.indexOf('view') >= 0 || ev.indexOf('visualiz') >= 0 || ev.indexOf('visto') >= 0 || ev.indexOf('acess') >= 0;
      }
      function isSubmitEvent(log) {
        var ev = lower(log.nomedoevento || log.eventname || log.action || '');
        if (ev.indexOf('status viewed') >= 0 || ev.indexOf('status visualiz') >= 0) return false;
        return ev.indexOf('submit') >= 0 || ev.indexOf('submitted') >= 0 ||
          ev.indexOf('upload') >= 0 || ev.indexOf('post created') >= 0 || ev.indexOf('discussion created') >= 0 ||
          ev.indexOf('attempt submitted') >= 0 || ev.indexOf('tentativa enviada') >= 0 || ev.indexOf('tentativa submetida') >= 0 ||
          ev.indexOf('enviou a tentativa') >= 0 || ev.indexOf('post criado') >= 0 || ev.indexOf('discussão criada') >= 0 ||
          ev.indexOf('discussao criada') >= 0 || ev.indexOf('resposta adicionada') >= 0 || ev.indexOf('submetid') >= 0 ||
          ev.indexOf('envio foi submetido') >= 0 || ev.indexOf('envio submetido') >= 0 ||
          ev.indexOf('envio enviado') >= 0 || ev.indexOf('arquivo enviado') >= 0;
      }

      function gradeRows() {
        var grades = window.MWADashboard && window.MWADashboard.state ? (window.MWADashboard.state.grades || []) : [];
        return grades.filter(function (row) { return row && row.__mwa_type__ !== 'activity_names'; });
      }

      function gradeMeta() {
        var grades = window.MWADashboard && window.MWADashboard.state ? (window.MWADashboard.state.grades || []) : [];
        return grades[0] && grades[0].__mwa_type__ === 'activity_names' ? grades[0] : null;
      }

      function gradeStudentName(row) {
        var first = norm(row['First name'] || row.Nome || row.firstname || row.student_firstname);
        var last = norm(row['Last name'] || row.Sobrenome || row.lastname || row.student_lastname);
        return norm(row.student_name || row.name || row.nomecompleto || row['Full name'] || (first + ' ' + last));
      }

      function gradeStudentEmail(row) {
        return norm(row.Email || row.email || row['E-mail'] || row.mail);
      }

      function processedGradeForStudent(student) {
        var targetName = lower(student.name);
        return (window.MWA_GRADES_CACHE || []).find(function (item) {
          return item && targetName && lower(item.name) === targetName;
        }) || null;
      }

      function findGradeRow(student) {
        var targetName = lower(student.name);
        var targetEmail = lower(student.email);
        return gradeRows().find(function (row) {
          var rowName = lower(gradeStudentName(row));
          var rowEmail = lower(gradeStudentEmail(row));
          return (targetEmail && rowEmail && targetEmail === rowEmail) || (targetName && rowName && targetName === rowName);
        }) || null;
      }

      function activitySequences(meta) {
        var names = window.MWA_ACT_NAMES || {};
        var keys = Object.keys(names).length
          ? Object.keys(names).sort(function (a, b) { return Number(a) - Number(b); })
          : Object.keys(meta || {}).filter(function (key) { return /^act_\d+$/.test(key); })
            .map(function (key) { return key.split('_')[1]; })
            .sort(function (a, b) { return Number(a) - Number(b); });
        return keys;
      }

      function seqFromTitle(title) {
        var text = lower(title);
        var match = text.match(/(?:atividade|activity)\s*(\d+)/i);
        return match ? match[1] : '';
      }

      function gradeValuePresent(student, seq, row, meta, processed) {
        var key = 'act_' + seq;
        var modules = window.MWA_ACT_MODULES || {};
        var module = lower(modules[Number(seq)] || (meta && meta['act_module_' + seq]));
        var actCurrent = processed && processed.actCurrent ? processed.actCurrent : {};
        if (module === 'forum' && Object.prototype.hasOwnProperty.call(actCurrent, String(seq))) {
          var current = Number(actCurrent[String(seq)] || 0);
          return !isNaN(current) && current > 0;
        }
        if (module === 'forum' && row && Object.prototype.hasOwnProperty.call(row, 'act_current_' + seq)) {
          var rowCurrent = Number(row['act_current_' + seq] || 0);
          return !isNaN(rowCurrent) && rowCurrent > 0;
        }
        var actGrades = processed && processed.actGrades ? processed.actGrades : null;
        var value = actGrades && Object.prototype.hasOwnProperty.call(actGrades, String(seq)) ? actGrades[String(seq)] : row && row[key];
        var num = parseFloat(String(value).replace(',', '.'));
        return value !== null && value !== undefined && String(value).trim() !== '' && String(value).trim() !== '-' && !isNaN(num) && num > 0;
      }

      function markGradeSubmissions(student, submitted) {
        var meta = gradeMeta();
        var processed = processedGradeForStudent(student);
        if (!meta && !processed) return;
        var row = findGradeRow(student);
        if (!row && !processed) return;
        activitySequences(meta).forEach(function (seq) {
          if (!gradeValuePresent(student, seq, row, meta, processed)) return;
          var cmids = window.MWA_ACT_CMIDS || {};
          var names = window.MWA_ACT_NAMES || {};
          var cmid = norm(cmids[Number(seq)] || (meta && meta['act_cmid_' + seq]));
          var name = lower(names[Number(seq)] || (meta && meta['act_' + seq]));
          if (cmid) submitted['cmid:' + cmid] = true;
          if (name) submitted['name:' + name] = true;
        });
      }

      function deliveredTitleForStudent(student, title) {
        var meta = gradeMeta();
        var processed = processedGradeForStudent(student);
        var row = findGradeRow(student);
        if (!meta && !processed) return false;
        if (!row && !processed) return false;
        var titleKey = lower(title);
        var explicitSeq = seqFromTitle(title);
        if (explicitSeq && gradeValuePresent(student, explicitSeq, row, meta, processed)) return true;
        var names = window.MWA_ACT_NAMES || {};
        return activitySequences(meta).some(function (seq) {
          var metaName = lower(names[Number(seq)] || (meta && meta['act_' + seq]));
          if (!metaName) return false;
          var sameActivity = titleKey === metaName || titleKey.indexOf(metaName) >= 0 || metaName.indexOf(titleKey) >= 0;
          return sameActivity && gradeValuePresent(student, seq, row, meta, processed);
        });
      }

      function studentLooksComplete(student) {
        var meta = gradeMeta();
        var processed = processedGradeForStudent(student);
        var row = findGradeRow(student);
        if (!meta && !processed) return false;
        if (!row && !processed) return false;
        var seqs = activitySequences(meta);
        if (!seqs.length) return false;
        return seqs.every(function (seq) { return gradeValuePresent(student, seq, row, meta, processed); });
      }
    
      function getLogs() {
        if (window.MWADashboard && window.MWADashboard.state) return window.MWADashboard.state.logs || [];
        return [];
      }

      function getStudents() {
        if (window.MWADashboard && window.MWADashboard.state) return window.MWADashboard.state.students || [];
        return [];
      }
    
      /* ── getDaysAgo ── */
      function getDaysAgo(date) {
        if (!date) return 9999;
        return Math.floor((Date.now() - date.getTime()) / 86400000);
      }
    
      /* ── parseDate a partir de um log ── */
      function parseDate(log) {
        if (log._ts) return new Date(Number(log._ts) * 1000);
        var s = norm(log.hora);
        var m = s.match(/(\d{2})\/(\d{2})\/(\d{2}),\s*(\d{2}):(\d{2})/);
        if (m) return new Date(2000 + Number(m[3]), Number(m[2]) - 1, Number(m[1]), Number(m[4]), Number(m[5]));
        return null;
      }
    
      /* ── agrupa logs por aluno ── */
      function groupByStudent() {
        var byStudent = {};
        getLogs().forEach(function (r) {
          var name = norm(r.nomecompleto);
          if (!name) return;
          var key  = lower(norm(r.email)) || lower(name);
          if (!byStudent[key]) byStudent[key] = { name: name, email: norm(r.email), userid: Number(r._userid||r.userid||0), logs: [] };
          if (!byStudent[key].userid && (r._userid || r.userid)) byStudent[key].userid = Number(r._userid||r.userid||0);
          var clone = Object.assign({}, r);
          clone.date = parseDate(r);
          byStudent[key].logs.push(clone);
        });
        return byStudent;
      }
    
      /* ════════════════════════════════════════════
         BUILD: detecta os 6 padrões de alerta
      ════════════════════════════════════════════ */
      var SA_DATA = null;
      var SA_STUDENTS_MAP = {};
      var SA_FILTER = 'all';
    
      function buildSmartAlertData() {
        if (SA_DATA && SA_DATA.built) return SA_DATA;
    
        var byStudent = groupByStudent();
        var keys = Object.keys(byStudent);

        var neverAccessed = getStudents().filter(function (s) {
          return !s.last && Number(s.interactions || 0) === 0;
        }).map(function (s) {
          return { name: s.name || '', email: s.email || '', userid: Number(s.userid || 0) };
        }).filter(function (s) {
          return s.name;
        }).sort(function (a, b) {
          return (a.name || '').localeCompare(b.name || '');
        });
    
        /* Alert 1 — Viewed but not submitted */
        var sawNotSubmit = [];
        keys.forEach(function (k) {
          var s   = byStudent[k];
          var evs = s.logs;
          var viewed = {};
          var submitted = {};
          evs.forEach(function (e) {
            if (!isEvaluativeComponent(e)) return;
            var keysForEvent = activityKeys(e);
            if (!keysForEvent.length) return;
            var title = activityName(e) || keysForEvent[0];
            if (isViewEvent(e)) {
              keysForEvent.forEach(function (key) { viewed[key] = title; });
            }
            if (isSubmitEvent(e)) {
              keysForEvent.forEach(function (key) { submitted[key] = true; });
            }
          });
          markGradeSubmissions(s, submitted);
          if (studentLooksComplete(s)) return;
          var seenPending = {};
          var pending = Object.keys(viewed).filter(function (key) { return !submitted[key]; })
            .map(function (key) { return viewed[key]; })
            .filter(function (title) {
              var key = lower(title);
          if (!title || seenPending[key]) return false;
              if (deliveredTitleForStudent(s, title)) return false;
              seenPending[key] = true;
              return true;
            });
          if (pending.length) sawNotSubmit.push({ name: s.name, email: s.email, activities: pending.slice(0, 4) });
        });
    
        /* Alert 2 — Sharp drop semana a semana */
        var sharpDrop = [];
        keys.forEach(function (k) {
          var s    = byStudent[k];
          var evs  = s.logs.filter(function (r) { return r.date; });
          var thisWeek = evs.filter(function (r) { return getDaysAgo(r.date) <= 7; }).length;
          var lastWeek = evs.filter(function (r) { return getDaysAgo(r.date) > 7 && getDaysAgo(r.date) <= 14; }).length;
          if (lastWeek >= 5 && thisWeek < lastWeek * 0.4) {
            sharpDrop.push({ name: s.name, email: s.email, drop: Math.round((1 - thisWeek / lastWeek) * 100) });
          }
        });
    
        /* Alert 3 — Early ghosts */
        var ghosts = [];
        keys.forEach(function (k) {
          var s   = byStudent[k];
          var evs = s.logs.filter(function (r) { return r.date; })
                          .sort(function (a, b) { return a.date - b.date; });
          if (!evs.length) return;
          var first         = evs[0].date;
          var last          = evs[evs.length - 1].date;
          var daysSinceLast = getDaysAgo(last);
          var activePeriod  = Math.round((last - first) / 86400000);
          if (activePeriod <= 14 && daysSinceLast > 21)
            ghosts.push({ name: s.name, email: s.email, daysSinceLast: daysSinceLast });
        });
    
        /* Alert 4 — Symbolic access (≤2 dias distintos) */
        var symbolic = [];
        keys.forEach(function (k) {
          var s      = byStudent[k];
          var evs    = s.logs.filter(function (r) { return r.date; });
          var daySet = new Set(evs.map(function (r) { return r.date.toDateString(); }));
          if (daySet.size <= 2)
            symbolic.push({ name: s.name, email: s.email, days: daySet.size });
        });
    
        /* Alert 5 — Madrugadores (>45% entre 0h–5h) */
        var nightOwls = [];
        keys.forEach(function (k) {
          var s    = byStudent[k];
          var evs  = s.logs.filter(function (r) { return r.date; });
          var dawn = evs.filter(function (r) { return r.date.getHours() < 5; }).length;
          if (evs.length >= 10 && dawn / evs.length >= 0.45)
            nightOwls.push({ name: s.name, email: s.email, pct: Math.round(dawn / evs.length * 100) });
        });
    
        /* Alert 6 — Reactivated (gap ≥10 days, returned in last 5 days) */
        var reactivated = [];
        keys.forEach(function (k) {
          var s   = byStudent[k];
          var evs = s.logs.filter(function (r) { return r.date; })
                          .sort(function (a, b) { return a.date - b.date; });
          if (evs.length < 2) return;
          var last = evs[evs.length - 1];
          if (getDaysAgo(last.date) > 5) return;
          var recent = evs.filter(function (r) { return getDaysAgo(r.date) <= 5; });
          var before = evs.filter(function (r) { return getDaysAgo(r.date) > 5; });
          if (!before.length) return;
          var gap = Math.round((recent[0].date - before[before.length - 1].date) / 86400000);
          if (gap >= 10)
            reactivated.push({ name: s.name, email: s.email, gap: gap });
        });
    
        SA_DATA = { built: true, sawNotSubmit: sawNotSubmit, sharpDrop: sharpDrop,
                    ghosts: ghosts, symbolic: symbolic, nightOwls: nightOwls,
                    reactivated: reactivated, neverAccessed: neverAccessed };
        return SA_DATA;
      }
    
      /* ════════════════════════════════════════════
         RENDER KPIs — lê Store.getStrings() via tr() em runtime
      ════════════════════════════════════════════ */
      function renderAlertKPIs(d) {
        var container = document.getElementById('saKpisRow');
        if (!container) return;

        function helpTip(text) {
          var safe = esc(text || '');
          return safe ? '<span class="mwa-help-tip sa-kpi-help" tabindex="0" role="img" aria-label="' + safe + '" title="' + safe + '" data-tooltip="' + safe + '">?</span>' : '';
        }
    
        var kpis = [
          { key: 'saw', cls: 'c-red',    icon: '👁',  lk: 'alert_kpi_viu_label',      dk: 'alert_kpi_viu_delta',      tk: 'alert_kpi_viu_tip',      val: d.sawNotSubmit.length },
          { key: 'drop', cls: 'c-amber',  icon: '📉', lk: 'alert_kpi_queda_label',    dk: 'alert_kpi_queda_delta',    tk: 'alert_kpi_queda_tip',    val: d.sharpDrop.length    },
          { key: 'ghost', cls: 'c-purple', icon: '👻', lk: 'alert_kpi_fantasma_label', dk: 'alert_kpi_fantasma_delta', tk: 'alert_kpi_fantasma_tip', val: d.ghosts.length       },
          { key: 'symbolic', cls: 'c-blue',   icon: '⚡', lk: 'alert_kpi_simbol_label',   dk: 'alert_kpi_simbol_delta',   tk: 'alert_kpi_simbol_tip',   val: d.symbolic.length     },
          { key: 'reactivated', cls: 'c-teal',   icon: '🔄', lk: 'alert_kpi_reat_label',     dk: 'alert_kpi_reat_delta',     tk: 'alert_kpi_reat_tip',     val: d.reactivated.length  },
          { key: 'never', cls: 'c-red',    icon: '🚫', lk: 'alert_kpi_never_label',    dk: 'alert_kpi_never_delta',    tk: 'alert_kpi_never_tip',    val: d.neverAccessed.length },
        ];
    
        // Delta: dividir logs em metade recente vs anterior
        var dc = window.MWADeltaChip;
        var alLogs = (window.MWADashboard&&window.MWADashboard.state&&window.MWADashboard.state.logs)||[];
        var alDated = alLogs.map(function(l){var t=l&&l.timecreated?l.timecreated*1000:0;return t?{l:l,t:t}:null;}).filter(Boolean).sort(function(a,b){return a.t-b.t;});
        var alMid=Math.floor(alDated.length/2),alPrv={},alCur={};
        alDated.slice(0,alMid).forEach(function(x){var n=(x.l.nomecompleto||'').trim().toLowerCase();if(n)alPrv[n]=true;});
        alDated.slice(alMid).forEach(function(x){var n=(x.l.nomecompleto||'').trim().toLowerCase();if(n)alCur[n]=true;});
        function alDelta(arr,inv){if(!dc||!alDated.length)return '';var c=arr.filter(function(s){return alCur[(s.name||'').trim().toLowerCase()];}).length;var p=arr.filter(function(s){return alPrv[(s.name||'').trim().toLowerCase()];}).length;return dc(c,p,inv);}
        var kpiDeltas=[alDelta(d.sawNotSubmit,true),alDelta(d.sharpDrop,true),alDelta(d.ghosts,true),alDelta(d.symbolic,true),alDelta(d.reactivated,false),alDelta(d.neverAccessed,true)];
        Store.renderHtml(container, kpis.map(function (kpi, i) {
          return '<button type="button" class="sa-kpi sa-kpi-filter ' + kpi.cls + (SA_FILTER === kpi.key ? ' active' : '') + '" data-sa-filter="' + kpi.key + '">'
            + '<span class="sa-kpi-trend-wrap">' + (kpiDeltas[i]||'') + '</span>'
            + '<div class="sa-kpi-head"><span class="sa-kpi-icon" aria-hidden="true">' + kpi.icon + '</span><div class="sa-kpi-label"><span>' + esc(tr(kpi.lk)) + '</span>' + helpTip(tr(kpi.tk)) + '</div></div>'
            + '<div class="sa-kpi-val">' + kpi.val + '</div>'
            + '<div class="sa-kpi-delta">' + esc(tr(kpi.dk)) + '</div>'
            + '</button>';
        }).join(''));

        container.querySelectorAll('[data-sa-filter]').forEach(function (btn) {
          btn.addEventListener('click', function () {
            var key = btn.getAttribute('data-sa-filter') || 'all';
            SA_FILTER = SA_FILTER === key ? 'all' : key;
            renderSmartAlerts(false);
          });
        });
      }
    
      /* ════════════════════════════════════════════
         saBlock — todas as strings via tr() em runtime
      ════════════════════════════════════════════ */
      function saBlock(cls, icon, titleKey, tipKey, students, extraFn) {
        var id = 'sa_' + Math.random().toString(36).slice(2, 7);
        SA_STUDENTS_MAP[id] = students;
        var n  = students.length;
    
        var fmt = function (s) {
          var parts = norm(s.name).split(/\s+/).filter(Boolean);
          var short = (parts[0] || '') + (parts.length > 1 ? ' ' + parts[parts.length - 1] : '');
          var extra = extraFn ? extraFn(s) : '';
          return '<strong class="sa-student-link" role="button" tabindex="0" data-profile-student="' + esc(s.name || '') + '">' + esc(short) + '</strong>'
            + (extra ? ' <span style="color:var(--subtle);font-size:.72rem;">(' + esc(extra) + ')</span>' : '');
        };
    
        var shortN = students.slice(0, 5).map(fmt).join(' · ');
        var allN   = students.map(fmt).join(' · ');
        var moreN  = n > 5
          ? ' <span class="sa-toggle-link" onclick="window.MWAAlerts.saToggle(\'' + id + '\')">'
            + esc(trN('alert_see_more', n - 5)) + '</span>'
          : '';
        var lessN  = ' <span class="sa-toggle-link" onclick="window.MWAAlerts.saToggle(\'' + id + '\')">'
            + esc(tr('alert_see_less')) + '</span>';
    
        var emails = students.map(function (s) { return s.email; }).filter(Boolean);
    
        return '<div class="smart-alert ' + cls + '" id="' + id + '">'
          + '<div class="sa-icon">' + icon + '</div>'
          + '<div class="sa-body">'
            + '<div class="sa-title">' + esc(tr(titleKey)) + ' <span class="sa-count">' + n + '</span></div>'
            + '<div class="sa-names">'
              + '<span class="sa-short">' + shortN + moreN + '</span>'
              + '<span class="sa-full" style="display:none;">' + allN + lessN + '</span>'
            + '</div>'
            + '<div class="sa-tip">💡 ' + esc(tr(tipKey)) + '</div>'
            + '<div class="sa-actions">'
              + (students.length
                  ? '<button class="sa-btn-primary" data-sa-bulk="1">✉️ ' + esc(tr('alert_email_all')) + '</button>'
                  : '')
            + '</div>'
          + '</div>'
          + '</div>';
      }
    
      function saToggle(id) {
        var el = document.getElementById(id);
        if (!el) return;
        var s = el.querySelector('.sa-short');
        var a = el.querySelector('.sa-full');
        if (!s || !a) return;
        if (a.style.display === 'none') { a.style.display = ''; s.style.display = 'none'; }
        else                            { a.style.display = 'none'; s.style.display = ''; }
      }

      function openClassListStudent(name) {
        if (!name) return;
        if (window.showPage) window.showPage('classlist');
        setTimeout(function () {
          if (window.MWAClassList && typeof window.MWAClassList.openStudent === 'function') {
            window.MWAClassList.openStudent(name);
          }
        }, 250);
      }
    
      
      function renderSmartAlerts(badgeOnly) {
        SA_DATA = null;
        SA_STUDENTS_MAP = {};
        var d     = buildSmartAlertData();
        var total = d.sawNotSubmit.length + d.sharpDrop.length + d.ghosts.length
                  + d.symbolic.length + d.reactivated.length + d.neverAccessed.length;
    
        var badge = document.getElementById('navAlertBadge');
        if (badge) badge.textContent = total || '0';
    
        if (badgeOnly) return;
    
        renderAlertKPIs(d);
    
        var blocks = [];

        if ((SA_FILTER === 'all' || SA_FILTER === 'never') && d.neverAccessed.length)
          blocks.push(saBlock('sa-danger',  '🚫', 'alert_block_never_title', 'alert_block_never_tip', d.neverAccessed, null));
    
        if ((SA_FILTER === 'all' || SA_FILTER === 'saw') && d.sawNotSubmit.length)
          blocks.push(saBlock('sa-danger',  '&#128064;', 'alert_block_viu_title',   'alert_block_viu_tip',   d.sawNotSubmit,
            function (s) { return (s.activities || []).slice(0, 3).join(', '); }));
    
        if ((SA_FILTER === 'all' || SA_FILTER === 'drop') && d.sharpDrop.length)
          blocks.push(saBlock('sa-warning', '📉', 'alert_block_queda_title', 'alert_block_queda_tip', d.sharpDrop,
            function (s) { return trN('alert_extra_queda', s.drop); }));
    
        if ((SA_FILTER === 'all' || SA_FILTER === 'symbolic') && d.symbolic.length)
          blocks.push(saBlock('sa-danger',  '⚡', 'alert_block_simbol_title','alert_block_simbol_tip', d.symbolic,
            function (s) { return trN('alert_extra_dias', s.days); }));
    
        if ((SA_FILTER === 'all' || SA_FILTER === 'ghost') && d.ghosts.length)
          blocks.push(saBlock('sa-purple',  '👻', 'alert_block_ghost_title', 'alert_block_ghost_tip', d.ghosts,
            function (s) { return trN('alert_extra_sumiu', s.daysSinceLast); }));
    
        if ((SA_FILTER === 'all' || SA_FILTER === 'reactivated') && d.reactivated.length)
          blocks.push(saBlock('sa-success', '🔄', 'alert_block_reat_title',  'alert_block_reat_tip',  d.reactivated,
            function (s) { return trN('alert_extra_ausente', s.gap); }));
    
        var list = document.getElementById('saAlertList');
        if (!list) return;
    
        Store.renderHtml(list, blocks.length
          ? '<div class="smart-alerts-wrap">' + blocks.join('') + '</div>'
          : '<div class="sa-empty"><div class="sa-empty-icon">✅</div><p>' + esc(tr('alerts_no_data')) + '</p></div>');

        
        var container = document.getElementById('saAlertList');
        if (container) {
          container.addEventListener('click', function(e) {
            var profileLink = e.target.closest('[data-profile-student]');
            if (profileLink) {
              e.preventDefault();
              e.stopPropagation();
              var profileName = profileLink.getAttribute('data-profile-student') || '';
              openClassListStudent(profileName);
              return;
            }
            var btn = e.target.closest('[data-sa-bulk]');
            if (!btn) return;
            e.stopPropagation();
            
            var card = btn.closest('.smart-alert');
            var cardId = card ? card.id : null;
            var studs = cardId ? (SA_STUDENTS_MAP[cardId] || []) : [];
            if (!studs.length) return;
            var targets = studs.map(function(s) {
              return {name: s.name||'', email: s.email||'', userid: s.userid||0};
            }).filter(function(t) { return t.name; });
            if (!targets.length) return;
            if (targets.length === 1) {
              if (window.MWAInterventions && window.MWAInterventions.quickMessage) {
                window.MWAInterventions.quickMessage(targets[0].name, targets[0].email, targets[0].userid, '');
              }
            } else if (window.MWAActionCenter && typeof window.MWAActionCenter.openBulkModal === 'function') {
              window.MWAActionCenter.openBulkModal(targets);
            } else if (window.MWAInterventions && window.MWAInterventions.quickMessage) {
              window.MWAInterventions.quickMessage(targets[0].name, targets[0].email, targets[0].userid, '');
            }
          }, {once: false});
        }
      }
    
      window.MWAAlerts = {
        render:   renderSmartAlerts,
        saToggle: saToggle,
        reset:    function () { SA_DATA = null; SA_STUDENTS_MAP = {}; }
      };
    
    })();

    return window.MWAAlerts;
});
