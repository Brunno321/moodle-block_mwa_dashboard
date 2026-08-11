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
 * @module     block_mwa_dashboard/grades
 * @copyright  2026 Bruno Porto
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

/**
 * Note: This module generates HTML markup directly in JavaScript strings for
 * performance reasons — the dashboard renders large dynamic datasets (student lists,
 * heatmaps, charts) that require frequent partial updates. All user-supplied data is
 * escaped via the esc() helper before insertion into the DOM.
 * See: https://docs.moodle.org/dev/JavaScript_Modules#HTML_generation
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
      function gradeCourseKey() {
        var cfg = Store.getConfig ? (Store.getConfig() || {}) : {};
        return String(cfg.courseid || cfg.course || '0');
      }
      function gradeDeltaChip(delta, invertColors) {
        if (delta === null || delta === undefined || isNaN(Number(delta))) {
          return '';
        }
        delta = Number(delta);
        var good = invertColors ? delta < 0 : delta > 0;
        var color = delta === 0 ? '#8a94a8' : good ? '#13794c' : '#b42318';
        var bg = delta === 0 ? '#f0f2f7' : good ? '#e8f7ef' : '#fdecec';
        var label = delta === 0 ? '0' : (delta > 0 ? '+' + delta : String(delta));
        return '<span class="gr-kpi-chip" style="background:' + bg + ';color:' + color + ';">' + esc(label) + '</span>';
      }
      function gradeTrendSnapshot() {
        var key = 'mwa_grades_kpi_counts_' + gradeCourseKey();
        var saved = null;
        try {
          saved = JSON.parse((window.localStorage && window.localStorage.getItem(key)) || 'null');
        } catch (e) {
          saved = null;
        }
        return saved && saved.counts ? saved : null;
      }
      function saveGradeTrendSnapshot(metrics, previousSnapshot) {
        var key = 'mwa_grades_kpi_counts_' + gradeCourseKey();
        try {
          if (window.localStorage) {
            var today = new Date().toISOString().slice(0, 10);
            if (!previousSnapshot || previousSnapshot.day !== today) {
              window.localStorage.setItem(key, JSON.stringify({day: today, counts: metrics}));
            }
          }
        } catch (e) {
          // Storage is optional; chips start from zero when unavailable.
        }
      }
      function gradeMetricDelta(current, baseline, key) {
        var previous = Number(Object.prototype.hasOwnProperty.call(baseline || {}, key) ? baseline[key] : current[key]);
        return Number(current[key]) - previous;
      }
      function gradeChipWrap(chip) {
        return chip ? '<span class="gr-kpi-chip-wrap">' + chip + '</span>' : '';
      }
      function norm(v) { return (v === undefined || v === null) ? '' : String(v).trim(); }
      function normKey(k) { return String(k || '').replace(/\xa0/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase(); }
    
      /* ── globally accessible cache ── */
      var GRADES_CACHE = [];
      var ACT_NAMES    = {};  // { seq: 'Nome completo da atividade' }
      var ACT_CMIDS    = {};  // { seq: cmid }
      var ACT_MODULES  = {};  // { seq: 'forum'|'assign'|... }
    
      /* ════════════════════════════════════════════
         PARSE — converte array bruto de notas
         Suporta o formato real retornado pela api.php:
           'First name', 'Last name', 'Email'
           'Activity N - NomeDaAtividade (Grade)'
           'Course total (Grade)'
         E também o formato de export XLSX do Moodle:
           'Nome', 'Sobrenome', 'Email'
           '[Atividade N] NomeDaAtividade (Real)'
           'Total do curso (Real)'
      ════════════════════════════════════════════ */
      function parseGrades(raw) {
        if (!raw || !raw.length) return [];
    
        // Primeira linha: metadados com nomes reais das atividades vindos do PHP.
        // Formato: { __mwa_type__: 'activity_names', act_1: 'Forum', act_2: 'Tarefa', ... }
        var offset = 0;
        ACT_NAMES  = {};
        ACT_CMIDS  = {};
        ACT_MODULES = {};
        if (raw[0] && raw[0]['__mwa_type__'] === 'activity_names') {
          var metaRow = raw[0];
          offset = 1;
          Object.keys(metaRow).forEach(function (k) {
            var m = k.match(/^act_(\d+)$/);
            if (m) { ACT_NAMES[Number(m[1])] = norm(metaRow[k]); return; }
            var mc = k.match(/^act_cmid_(\d+)$/);
            if (mc) { ACT_CMIDS[Number(mc[1])] = Number(metaRow[k]) || 0; return; }
            var mm = k.match(/^act_module_(\d+)$/);
            if (mm) { ACT_MODULES[Number(mm[1])] = norm(metaRow[k]); }
          });
        }
    
        var sample = raw[offset] || raw[0];
        if (!sample) return [];
        var keys   = Object.keys(sample).filter(function (k) { return k !== '__mwa_type__'; });
    
        // Detect name columns — supports pt and en
        var firstNameKey = keys.find(function (k) { return /^(nome|first\s*name)$/i.test(k.trim()); });
        var lastNameKey  = keys.find(function (k) { return /^(sobrenome|last\s*name|surname)$/i.test(k.trim()); });
        var fullNameKey  = keys.find(function (k) { return /nome.*completo|full.*name|^aluno$/i.test(k); });
        var emailKey     = keys.find(function (k) { return /e.?mail/i.test(k); });
    
        // Detect total column — supports API format ('Course total (Grade)')
        // e formato XLSX ('Total do curso (Real)')
        var totalKey = keys.find(function (k) { return /^course\s+total\s*\(grade\)/i.test(normKey(k)); })
          || keys.find(function (k) { return normKey(k).startsWith('total do curso'); })
          || keys.find(function (k) { return /nota\s+final|final\s+grade/i.test(normKey(k)); })
          || keys.find(function (k) { return normKey(k) === 'total'; });
    
        // Detect maximum column (returned by the fixed api.php)
        var totalMaxKey = keys.find(function (k) { return /^course\s+total\s+max/i.test(normKey(k)); });
    
        if (!totalKey) {
          // fallback: last numeric column
          for (var i = keys.length - 1; i >= 0; i--) {
            var k = keys[i];
            if (!k) continue;
            var vals = raw.slice(0, 5).map(function (r) { return r[k]; })
              .filter(function (v) { return v !== null && v !== undefined && v !== '-' && v !== ''; });
            var nums = vals.map(function (v) { return parseFloat(String(v).replace(',', '.')); })
              .filter(function (n) { return !isNaN(n) && n <= 500; });
            if (nums.length >= 3) { totalKey = k; break; }
          }
        }
    
        return raw.slice(offset).filter(function (r) {
          return !r || r['__mwa_type__'] !== 'activity_names';
        }).map(function (r) {
          // Nome
          var name = '';
          if (firstNameKey && lastNameKey) {
            name = ((r[firstNameKey] || '') + ' ' + (r[lastNameKey] || '')).trim();
          } else if (fullNameKey) {
            name = norm(r[fullNameKey]);
          } else {
            name = norm(r[keys[0]]);
          }
    
          // Total
          var rawVal = totalKey ? r[totalKey] : null;
          var num    = (rawVal === '-' || rawVal === null || rawVal === undefined)
            ? NaN : parseFloat(String(rawVal).replace(',', '.'));
          var total  = (!isNaN(num) && num >= 0 && num <= 100000) ? num : null;
    
          // Maximum possible grade (for proportional pass threshold)
          var rawMax = totalMaxKey ? r[totalMaxKey] : null;
          var numMax = (rawMax === '-' || rawMax === null || rawMax === undefined)
            ? NaN : parseFloat(String(rawMax).replace(',', '.'));
          var totalmax = (!isNaN(numMax) && numMax > 0) ? numMax : null;
    
          var email  = emailKey ? norm(r[emailKey]) : '';
    
          // Grades per activity
          var actGrades = {};
          var actCurrent = {};
          var seq = 0;
          keys.forEach(function (k) {
            // Formato da API: chave = 'act_N' (ex: 'act_1', 'act_2')
            var mActKey = k.match(/^act_(\d+)$/);
            if (mActKey) {
              seq = Number(mActKey[1]);
              var v = r[k];
              var parsed = (v === '-' || v === null || v === undefined || v === '') ? null
                : parseFloat(String(v).replace(',', '.'));
              actGrades[String(seq)] = isNaN(parsed) ? null : parsed;
              return;
            }
            var mCurrentKey = k.match(/^act_current_(\d+)$/);
            if (mCurrentKey) {
              var cseq = Number(mCurrentKey[1]);
              var cv = parseInt(r[k], 10);
              actCurrent[String(cseq)] = isNaN(cv) ? 0 : cv;
              return;
            }
            // Fallback: formato XLSX exportado manualmente pelo professor
            var kn = String(k || '').replace(/\xa0/g, ' ').replace(/\s+/g, ' ').trim();
            var mXlsx       = kn.match(/\[Atividade\s*(\d+)\]/i);
            var mXlsxApi    = kn.match(/^Atividade\s+(\d+)\s*[-–]\s*(.+?)(?:\s*\(Real\)|\s*\(Valor\))?\s*$/i);
            var mXlsxMoodle = kn.match(/^(Tarefa|Forum|Forum|Questionário|H5P|Wiki|Glossário|Lição|SCORM|Arquivo|Pacote\s+H5P|Base\s+de\s+dados)[:\s]+(.+?)(?:\s*\(Real\)|\s*\(Valor\))?\s*$/i);
            var mApi        = kn.match(/^Activity\s+(\d+)\s*[-–]\s*(.+?)(?:\s*\(Grade\))?\s*$/i);
            var isAct       = mXlsx || mXlsxApi || mXlsxMoodle || mApi;
            if (!isAct) return;
            seq++;
            var actName = kn.replace(/\(Grade\)|\(Real\)|\(Valor\)/gi, '').trim() || kn.trim();
            if (!ACT_NAMES[seq]) ACT_NAMES[seq] = actName;
            var v = r[k];
            var parsed = (v === '-' || v === null || v === undefined || v === '') ? null
              : parseFloat(String(v).replace(',', '.'));
            actGrades[String(seq)] = isNaN(parsed) ? null : parsed;
          });
    
          return { name: name, total: total, totalmax: totalmax, email: email, actGrades: actGrades, actCurrent: actCurrent };
        }).filter(function (g) { return g.name; });
      }
    
      /* ════════════════════════════════════════════
         RENDER PRINCIPAL
      ════════════════════════════════════════════ */
      function renderGrades() {
        var el = document.getElementById('gradesWrap');
        if (!el) return;
    
        var dash  = window.MWADashboard || {};
        var state = dash.state || {};
        var raw   = state.grades || [];
    
        if (!raw.length) {
          Store.renderHtml(el, '<div class="gr-empty"><div class="gr-empty-icon">🎓</div><p>' + esc(tr('gr_no_grades_loaded')) + '</p></div>');
          return;
        }
    
        var grades   = parseGrades(raw);
        GRADES_CACHE = grades;
        window.MWA_GRADES_CACHE = grades;
        window.MWA_ACT_NAMES    = ACT_NAMES;
        window.MWA_ACT_CMIDS    = ACT_CMIDS;
        window.MWA_ACT_MODULES  = ACT_MODULES;
    
        // Enriquecer ACT_NAMES com nomes reais dos logs (contextodoevento)
        // Only replace if the current name is numeric or empty (means PHP
        // could not get real name). If the XLSX already provided a descriptive name,
        // keep the XLSX name which is more descriptive.
        var logs = (window.MWADashboard && window.MWADashboard.state && window.MWADashboard.state.logs) || [];
        if (logs.length) {
          // Build map: activity number → contextodoevento name
          var logNameMap = {};
          logs.forEach(function (r) {
            var ctx = (r.contextodoevento || '').trim();
            if (!ctx) return;
            var m = ctx.match(/^Atividade\s+(\d+)\s*[-–]\s*(.+)$/i);
            if (m) logNameMap[m[1]] = ctx; // nome completo: "Atividade 3 - Tarefa"
          });
          // Only replace if current ACT_NAMES entry is numeric/empty
          Object.keys(ACT_NAMES).forEach(function (seq) {
            var current = ACT_NAMES[seq] || '';
            var isNumericOrEmpty = !current || /^\d+$/.test(current.trim());
            if (isNumericOrEmpty && logNameMap[seq]) {
              ACT_NAMES[seq] = logNameMap[seq];
            }
          });
        }
    
        var valid    = grades.filter(function (g) { return g.total !== null && g.total >= 0; });
    
        // Pass threshold: if totalmax is available, passed = total >= totalmax * 0.6
        // If not available (old XLSX format, already normalised 0-100), use 60 directly
        function isApproved(g) {
          // Passed = total grade >= 60 (raw value, regardless of maximum)
          return g.total >= 60;
        }
        function pctNorm(g) {
          if (g.totalmax && g.totalmax > 0) return Math.round(g.total / g.totalmax * 100);
          return Math.min(100, Math.round(g.total));
        }
    
        var approved = valid.filter(function (g) { return isApproved(g); });
        var inProg   = valid.filter(function (g) { return !isApproved(g); });
        var noGrade  = grades.filter(function (g) { return g.total === null; });
        var maxG     = valid.length ? Math.max.apply(null, valid.map(function (g) { return g.total; })) : 0;
    
        // Average grade as raw value (not normalised)
        var avgNorm  = valid.length
          ? valid.reduce(function (s, g) { return s + (g.total||0); }, 0) / valid.length : 0;
        /* Percentages are taken over the whole class, not just the students who
           already have a grade. Using valid.length made 2 approved out of 10
           students read as 67%, because only 3 had grades launched. */
        var classSize   = grades.length;
        function classPct(n){ return classSize ? Math.round(n / classSize * 100) : 0; }
        var passRate = classPct(approved.length);
        var isMid    = valid.length > 0 && valid.every(function (g) { return !isApproved(g); }) && valid.some(function (g) { return g.total > 0; });
    
        var hasActGrades = grades.some(function (g) { return g.actGrades && Object.keys(g.actGrades).length > 0; });
        var allActKeys   = hasActGrades
          ? Array.from(new Set(grades.reduce(function (a, g) { return a.concat(Object.keys(g.actGrades || {})); }, [])))
              .sort(function (a, b) { return (parseInt(a) || 0) - (parseInt(b) || 0); })
          : [];
        var totalActs = allActKeys.length;
    
        function actSummary(g) {
          if (!hasActGrades || !totalActs) return null;
          var acts   = g.actGrades || {};
          var graded = Object.values(acts).filter(function (v) { return v !== null && v !== undefined && !isNaN(v); }).length;
          return { graded: graded, total: Object.keys(acts).length };
        }
        var currentMetrics = {
          approved: approved.length,
          inprogress: inProg.length,
          nograde: noGrade.length,
          highest: Math.round(maxG)
        };
        var trendSnapshot = gradeTrendSnapshot();
        var baselineMetrics = (trendSnapshot && trendSnapshot.counts) || {approved: 0, inprogress: 0, nograde: 0, highest: 0};
        var gradeChips = {
          approved: gradeDeltaChip(gradeMetricDelta(currentMetrics, baselineMetrics, 'approved'), false),
          inprogress: gradeDeltaChip(gradeMetricDelta(currentMetrics, baselineMetrics, 'inprogress'), true),
          nograde: gradeDeltaChip(gradeMetricDelta(currentMetrics, baselineMetrics, 'nograde'), true)
        };
        var avgClass = avgNorm >= 60 ? 'gr-grade-ok' : 'gr-grade-low';
        var maxClass = maxG >= 60 ? 'gr-grade-ok' : 'gr-grade-low';
    
        // ── KPIs ──
        var kpisHtml =
          '<div class="kpis gr-analysis-kpis">'
          + '<button type="button" class="kpi c-green gr-kpi-filter gr-kpi-with-chip gr-analysis-kpi gr-kpi-green" onclick="window.MWAGrades&&window.MWAGrades.setFilter(\'approved\')">' + gradeChipWrap(gradeChips.approved) + '<div class="gr-kpi-head"><span class="gr-kpi-icon" aria-hidden="true">&#10003;</span><div class="kpi-label">' + tr('gr_approved') + tip('gr_tip_kpi_approved') + '</div></div><div class="kpi-value">' + passRate + '%</div></button>'
          + '<button type="button" class="kpi c-amber gr-kpi-filter gr-kpi-with-chip gr-analysis-kpi gr-kpi-amber" onclick="window.MWAGrades&&window.MWAGrades.setFilter(\'inprogress\')">' + gradeChipWrap(gradeChips.inprogress) + '<div class="gr-kpi-head"><span class="gr-kpi-icon" aria-hidden="true">&#9203;</span><div class="kpi-label">' + tr('gr_in_progress') + tip('gr_tip_kpi_in_progress') + '</div></div><div class="kpi-value">' + classPct(inProg.length) + '%</div></button>'
          + (noGrade.length > 0 ? '<button type="button" class="kpi c-purple gr-kpi-filter gr-kpi-with-chip gr-analysis-kpi gr-kpi-purple" onclick="window.MWAGrades&&window.MWAGrades.setFilter(\'nograde\')">' + gradeChipWrap(gradeChips.nograde) + '<div class="gr-kpi-head"><span class="gr-kpi-icon" aria-hidden="true">&#9675;</span><div class="kpi-label">' + tr('gr_no_grade') + tip('gr_tip_kpi_no_grade') + '</div></div><div class="kpi-value">' + classPct(noGrade.length) + '%</div></button>' : '')
          + '<div class="kpi c-blue gr-analysis-kpi gr-kpi-blue"><div class="gr-kpi-head"><span class="gr-kpi-icon" aria-hidden="true">&#128202;</span><div class="kpi-label">' + tr('gr_avg_grade') + tip('gr_tip_avg_grade') + '</div></div><div class="kpi-value ' + avgClass + '">' + avgNorm.toFixed(1) + '</div></div>'
          + (maxG > 0 ? '<div class="kpi c-teal gr-analysis-kpi gr-kpi-teal"><div class="gr-kpi-head"><span class="gr-kpi-icon" aria-hidden="true">&#9733;</span><div class="kpi-label">' + tr('gr_highest') + tip('gr_tip_highest') + '</div></div><div class="kpi-value ' + maxClass + '">' + maxG.toFixed(1) + '</div></div>' : '')
          + '</div>';
    
        // ── Partial semester warning ──
        var midHtml = isMid
          ? '<div class="gr-mid-warning"><span style="font-size:1.1rem;">⚠️</span><div><strong>' + tr('gr_partial_warning_title') + '</strong> — ' + tr('gr_partial_warning_body').replace('{max}', maxG.toFixed(1)) + '</div></div>'
          : '';
    
        // ── Charts ──
        var chartsHtml =
          '<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:18px;">'
          + '<div class="card gr-chart-card"><div class="card-head" style="padding:12px 16px;font-size:.75rem;font-weight:900;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);">📊 ' + tr('gr_chart_dist') + tip('gr_tip_chart_distribution') + '</div><div style="height:220px;padding:12px;"><canvas id="grChartDist"></canvas></div></div>'
          + '<div class="card gr-chart-card"><div class="card-head" style="padding:12px 16px;font-size:.75rem;font-weight:900;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);">✅ ' + tr('gr_chart_approval') + tip('gr_tip_chart_approval') + '</div><div style="height:220px;padding:12px;"><canvas id="grChartAR"></canvas></div></div>'
          + '</div>';
    
        // ── Filter bar ──
        var filterHtml =
          '<div class="gr-filter-panel">'
          + '<div class="gr-filter-row">'
            + '<div class="gr-filter-group">'
              + '<div class="gr-filter-label">' + esc(tr('gr_filter_status_label', 'Situação')) + '</div>'
              + '<select id="grFilter" class="gr-standard-select" onchange="window.MWAGrades&&window.MWAGrades.filter()">'
                + '<option value="all">' + esc(tr('ev_all')) + '</option>'
                + '<option value="approved">' + esc(tr('gr_approved')) + '</option>'
                + '<option value="inprogress">' + esc(tr('gr_in_progress')) + '</option>'
                + '<option value="nograde">' + esc(tr('gr_no_grade')) + '</option>'
              + '</select>'
            + '</div>'
            + '<div class="gr-filter-group gr-filter-search-group">'
              + '<label class="gr-filter-label" for="grSearch">' + esc(tr('gr_filter_search_label', 'Buscar')) + '</label>'
              + '<label class="gr-search-wrap"><span class="gr-search-icon" aria-hidden="true">&#128269;</span><input id="grSearch" type="search" class="gr-search" placeholder="' + esc(tr('gr_search_placeholder')) + '" oninput="window.MWAGrades&&window.MWAGrades.filter()"></label>'
            + '</div>'
            + '<div class="gr-filter-group gr-filter-export-group">'
              + '<div class="gr-filter-label">&nbsp;</div>'
              + '<button class="gr-export-btn" onclick="window.MWAGrades&&window.MWAGrades.exportXLSX()"><span aria-hidden="true">&#128202;</span>' + esc(tr('gr_export')) + '</button>'
            + '</div>'
            + '<div class="gr-filter-group gr-filter-clear-group">'
              + '<div class="gr-filter-label">&nbsp;</div>'
              + '<button class="gr-clear-btn" onclick="window.MWAGrades&&window.MWAGrades.clearFilters()">&#128465; ' + esc(tr('clearfilters')) + '</button>'
            + '</div>'
          + '</div>'
          + '</div>';
    
        // ── Approved table ──
        var approvedRows = approved.slice().sort(function (a, b) { return pctNorm(b) - pctNorm(a); }).map(function (g, i) {
          var as = actSummary(g);
          var aColor = as ? (as.graded < as.total ? 'var(--amber)' : 'var(--green)') : 'var(--muted)';
          var gradeLabel = g.total.toFixed(1);
          return '<tr data-name="' + esc(g.name).toLowerCase() + '" data-group="approved">'
            + '<td class="gr-rank">' + (i + 1) + '</td>'
            + '<td><span class="gr-name" data-gname="' + esc(g.name) + '" onclick="window.MWAGrades.openProfile(this)">' + esc(g.name) + '</span></td>'
            + '<td><span class="gr-grade-val" style="color:var(--green);">' + gradeLabel + '</span></td>'
            + (hasActGrades && as ? '<td><button class="gr-detail-btn" style="color:' + aColor + ';" data-gname="' + esc(g.name) + '" onclick="event.stopPropagation();window.MWAGrades.showDetailByEl(this)">' + as.graded + '/' + as.total + ' ' + tr('gr_launched') + ' 📋</button></td>' : '')
            + '<td class="center"><button class="gr-profile-btn" data-gname="' + esc(g.name) + '" onclick="window.MWAGrades.openProfile(this)">👤</button></td>'
            + '</tr>';
        }).join('');
    
        var approvedHtml = '<div class="gr-card approved" id="grCardApproved">'
          + '<div class="gr-card-head"><span class="gr-card-title" style="color:var(--green);">✅ ' + tr('gr_approved') + ' (' + approved.length + ')</span>' + tip('gr_tip_card_approved') + '<span class="gr-card-sub">≥ 60 ' + tr('gr_points') + '</span></div>'
          + '<div style="overflow-x:auto;"><table class="gr-tbl"><thead><tr><th>#</th><th>' + tr('gr_col_student') + '</th><th>' + tr('gr_col_grade') + '</th>' + (hasActGrades ? '<th>' + tr('gr_col_activities') + '</th>' : '') + '<th class="center">' + tr('gr_col_profile') + '</th></tr></thead><tbody>' + approvedRows + '</tbody></table></div>'
          + '</div>';
    
        // ── In progress table ──
        var inProgHtml = '';
        if (inProg.length) {
          var avgIP    = (inProg.reduce(function (s, g) { return s + g.total; }, 0) / inProg.length).toFixed(1);
          var avgFalta = (inProg.reduce(function (s, g) {
            return s + Math.max(0, 60 - g.total);
          }, 0) / inProg.length).toFixed(1);
          var ipRows   = inProg.slice().sort(function (a, b) { return pctNorm(b) - pctNorm(a); }).map(function (g, i) {
            var pct = Math.min(100, Math.round(g.total));
            var barColor = pct >= 60 ? 'var(--green)' : pct >= 40 ? 'var(--amber)' : 'var(--red)';
            var falta = Math.max(0, 60 - g.total).toFixed(1);
            var gradeLabel = g.total.toFixed(1);
            var as       = actSummary(g);
            var aColor   = as ? (as.graded < as.total ? 'var(--amber)' : 'var(--green)') : 'var(--muted)';
            return '<tr data-name="' + esc(g.name).toLowerCase() + '" data-group="inprogress">'
              + '<td class="gr-rank">' + (i + 1) + '</td>'
              + '<td><span class="gr-name" data-gname="' + esc(g.name) + '" onclick="window.MWAGrades.openProfile(this)">' + esc(g.name) + '</span></td>'
              + '<td><span class="gr-grade-val" style="color:var(--amber);">' + gradeLabel + '</span></td>'
              + '<td><span style="font-family:\'DM Mono\',monospace;font-size:.8rem;color:var(--red);">−' + falta + '</span></td>'
              + '<td><div class="gr-prog-wrap"><div class="gr-prog-bg"><div class="gr-prog-fill" style="width:' + pct + '%;background:' + barColor + ';"></div><div class="gr-prog-marker" title="Meta: 60 pts" style="left:60%;"></div></div><span class="gr-prog-label" style="color:' + barColor + ';">' + g.total.toFixed(0) + '/100</span></div><div class="gr-prog-sub">meta: 60 pts</div></td>'
              + (hasActGrades && as ? '<td><button class="gr-detail-btn" style="color:' + aColor + ';" data-gname="' + esc(g.name) + '" onclick="event.stopPropagation();window.MWAGrades.showDetailByEl(this)">' + as.graded + '/' + as.total + ' ' + tr('gr_launched') + ' 📋</button></td>' : '')
              + '<td class="center"><button class="gr-profile-btn" data-gname="' + esc(g.name) + '" onclick="window.MWAGrades.openProfile(this)">👤</button></td>'
              + '</tr>';
          }).join('');
    
          inProgHtml = '<div class="gr-card inprogress" id="grCardInProgress">'
            + '<div class="gr-card-head"><span class="gr-card-title" style="color:var(--amber);">⏳ ' + tr('gr_in_progress') + ' (' + inProg.length + ')</span>' + tip('gr_tip_card_in_progress') + '<span class="gr-card-sub">' + tr('gr_below_60_note') + '</span></div>'
            + '<div style="overflow-x:auto;"><table class="gr-tbl"><thead><tr><th>#</th><th>' + tr('gr_col_student') + '</th><th>' + tr('gr_col_current_grade') + '</th><th>' + tr('gr_col_missing') + '</th><th>' + tr('gr_col_progress') + '</th>' + (hasActGrades ? '<th>' + tr('gr_col_activities') + '</th>' : '') + '<th class="center">' + tr('gr_col_profile') + '</th></tr></thead><tbody>' + ipRows + '</tbody></table></div>'
            + '<div class="gr-footer"><span>' + tr('gr_avg_current') + ':</span><span style="font-family:\'DM Mono\',monospace;font-weight:700;color:var(--amber);">' + avgIP + ' pts</span><span>· ' + tr('gr_avg_missing') + '</span><span style="font-family:\'DM Mono\',monospace;font-weight:700;color:var(--red);">' + avgFalta + ' pts</span></div>'
            + '</div>';
        }
    
        // ── No grade table ──
        var noGradeHtml = '';
        if (noGrade.length) {
          var ngRows = noGrade.map(function (g) {
            return '<tr data-name="' + esc(g.name).toLowerCase() + '" data-group="nograde">'
              + '<td>' + esc(g.name) + '</td>'
              + '<td class="center"><button class="gr-profile-btn" data-gname="' + esc(g.name) + '" onclick="window.MWAGrades.openProfile(this)">👤</button></td>'
              + '</tr>';
          }).join('');
          noGradeHtml = '<div class="gr-card nograde" id="grCardNoGrade">'
            + '<div class="gr-card-head"><span class="gr-card-title">⚪ ' + tr('gr_no_grade') + ' (' + noGrade.length + ')</span>' + tip('gr_tip_card_no_grade') + '<span class="gr-card-sub">' + tr('gr_none_launched') + '</span></div>'
            + '<div style="overflow-x:auto;"><table class="gr-tbl"><thead><tr><th>' + tr('gr_col_student') + '</th><th class="center">' + tr('gr_col_profile') + '</th></tr></thead><tbody>' + ngRows + '</tbody></table></div>'
            + '</div>';
        }
    
        Store.renderHtml(el, midHtml + kpisHtml + chartsHtml + filterHtml + approvedHtml + inProgHtml + noGradeHtml);
        saveGradeTrendSnapshot(currentMetrics, trendSnapshot);
    
        // ── Charts ──
        setTimeout(function () {
          renderCharts(valid, approved, inProg, noGrade, pctNorm);
        }, 60);
      }
    
      /* ── Charts ── */
      function renderCharts(valid, approved, inProg, noGrade, pctNorm) {
        if (!window.Chart) return;
        // Use raw grade (total) for distribution — independent of totalmax
        // Assim 10 pts cai em 0-20, 85 pts em 80-100, etc.
        var bins  = [[0,20],[20,40],[40,60],[60,80],[80,101]];
        var binCounts = bins.map(function (b) {
          return valid.filter(function (g) {
            var p = g.total; // nota bruta direta
            return p >= b[0] && p < b[1];
          }).length;
        });
    
        var c1 = document.getElementById('grChartDist');
        var c2 = document.getElementById('grChartAR');
        if (window._grChartDist) window._grChartDist.destroy();
        if (window._grChartAR)   window._grChartAR.destroy();
    
        if (c1) {
          window._grChartDist = new Chart(c1, {
            type: 'bar',
            data: {
              labels: ['0–20','20–40','40–60','60–80','80–100'],
              datasets: [{ data: binCounts, backgroundColor: ['#d95f5f','#f5a623','#5b9bd5','#3aab7a','#8b72d4'], borderRadius: 5 }]
            },
            options: {
              responsive: true, maintainAspectRatio: false,
              plugins: { legend: { display: false } },
              scales: {
                y: { beginAtZero: true, ticks: { color: 'var(--muted)', font: { size: 10 } }, grid: { display: false } },
                x: { ticks: { color: 'var(--muted)', font: { size: 10 } }, grid: { display: false } }
              }
            }
          });
        }
    
        if (c2) {
          window._grChartAR = new Chart(c2, {
            type: 'doughnut',
            data: {
              labels: [tr('gr_approved'), tr('gr_in_progress'), tr('gr_no_grade')],
              datasets: [{ data: [approved.length, inProg.length, noGrade.length], backgroundColor: ['#3aab7a','#f5a623','#7b8099'], borderWidth: 0 }]
            },
            options: {
              responsive: true, maintainAspectRatio: false,
              cutout: '62%',
              onClick: function (evt, elements) {
                if (!elements || !elements.length) {
                  return;
                }
                var idx = elements[0].index;
                var groups = ['approved', 'inprogress', 'nograde'];
                setFilter(groups[idx] || 'all');
              },
              onHover: function (evt, elements) {
                if (evt && evt.native && evt.native.target) {
                  evt.native.target.style.cursor = elements && elements.length ? 'pointer' : 'default';
                }
              },
              plugins: {
                legend: {
                  position: 'bottom',
                  labels: { color: 'var(--muted)', font: { size: 11 } },
                  onClick: function (evt, item) {
                    var groups = ['approved', 'inprogress', 'nograde'];
                    setFilter(groups[item.index] || 'all');
                  }
                }
              }
            }
          });
        }
      }
    
      /* ── Detail modals de notas ── */
      function showDetail(name, evt) {
        if (evt) evt.stopPropagation();
        var g = null;
        for (var i = 0; i < GRADES_CACHE.length; i++) {
          if (GRADES_CACHE[i].name === name) { g = GRADES_CACHE[i]; break; }
        }
        if (!g) return;
    
        // Simple keys (numbers) sorted, names from ACT_NAMES
        var keys = Object.keys(ACT_NAMES).length
          ? Object.keys(ACT_NAMES).sort(function (a, b) { return Number(a) - Number(b); })
          : Object.keys(g.actGrades || {}).sort(function (a, b) { return Number(a) - Number(b); });
    
        var acts    = g.actGrades || {};
        var graded  = Object.values(acts).filter(function (v) { return v !== null && v !== undefined && !isNaN(v); }).length;
        var tot     = g.total !== null ? g.total.toFixed(1) : '—';
        var approved = g.total !== null && g.total >= 60;
        var tc      = g.total === null ? 'var(--muted)' : approved ? 'var(--green)' : 'var(--amber)';
    
        var rows = keys.map(function (k) {
          // k = sequential key; name comes from ACT_NAMES
          var label = k;
          var nm    = (ACT_NAMES[k] || k).replace(/\(Grade\)|\(Real\)|\(Valor\)/gi, '').trim();
          nm        = nm.length > 55 ? nm.slice(0, 52) + '...' : nm;
          var val   = acts[k];
          var hasV  = val !== null && val !== undefined && !isNaN(val);
          // Colour: green if grade > 0, amber if grade is low (< 40% of activity max or < 5 pts)
          var col   = !hasV ? 'var(--muted)' : Number(val) > 0 ? 'var(--green)' : 'var(--red)';
          return '<div class="gr-act-row">'
            + '<span class="gr-act-num">' + esc(label) + '</span>'
            + '<span class="gr-act-name" title="' + esc(nm) + '">' + esc(nm) + '</span>'
            + '<span class="gr-act-val" style="color:' + col + ';">' + (hasV ? Number(val).toFixed(1) + ' pts' : '—') + '</span>'
            + '</div>';
        }).join('');
    
        var old = document.getElementById('grDetailModal');
        if (old) old.remove();
    
        var overlay = document.createElement('div');
        overlay.className = 'gr-modal-overlay';
        overlay.id = 'grDetailModal';
        overlay.onclick = function (e) { if (e.target === overlay) overlay.remove(); };
    
        Store.renderHtml(overlay, '<div class="gr-modal">'
            + '<div class="gr-modal-head">'
              + '<div style="flex:1;min-width:0;">'
                + '<div class="gr-modal-name">' + esc(name) + '</div>'
                + '<div class="gr-modal-sub">' + graded + ' ' + tr('gr_of') + ' ' + keys.length + ' ' + tr('gr_grades_launched') + '</div>'
              + '</div>'
              + '<div class="gr-modal-total"><div class="gr-modal-total-val" style="color:' + tc + ';">' + tot + '</div><div class="gr-modal-total-label">total</div></div>'
              + '<button class="gr-modal-close" onclick="document.getElementById(\'grDetailModal\').remove()">✕</button>'
            + '</div>'
            + '<div class="gr-modal-body">' + (rows || '<p style="color:var(--muted);text-align:center;">' + esc(tr('no_data')) + '</p>') + '</div>'
          + '</div>');
    
        (document.getElementById('block-mwa-dashboard-app') || document.body).appendChild(overlay);
        var handler = function (e) { if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', handler); } };
        document.addEventListener('keydown', handler);
      }
    
      /* ── Filtro de busca/grupo ── */
      function filter() {
        var search = (document.getElementById('grSearch') || {}).value || '';
        var group  = (document.getElementById('grFilter') || {}).value || 'all';
        var q      = search.toLowerCase().trim();
    
        var cards = { approved: 'grCardApproved', inprogress: 'grCardInProgress', nograde: 'grCardNoGrade' };
        Object.keys(cards).forEach(function (key) {
          var el = document.getElementById(cards[key]);
          if (!el) return;
          el.style.display = (group === 'all' || group === key) ? '' : 'none';
        });
    
        document.querySelectorAll('.gr-tbl tbody tr').forEach(function (row) {
          var name = (row.dataset.name || '').toLowerCase();
          row.style.display = (!q || name.includes(q)) ? '' : 'none';
        });
      }
    
      /* ── Build data for export ── */

      function setFilter(group) {
        var value = group || 'all';
        var input = document.getElementById('grFilter');
        if (input) input.value = value;
        document.querySelectorAll('#grFilterTabs .gr-tab').forEach(function (btn) {
          btn.classList.toggle('active', btn.getAttribute('data-gr-filter') === value);
        });
        filter();
      }

      function clearFilters() {
        var group = document.getElementById('grFilter');
        var search = document.getElementById('grSearch');
        if (group) group.value = 'all';
        if (search) search.value = '';
        filter();
      }
    
      function buildExportData() {
        var allKeys = Array.from(new Set(
          GRADES_CACHE.reduce(function (a, g) { return a.concat(Object.keys(g.actGrades || {})); }, [])
        )).sort(function (a, b) { return (parseInt(a) || 0) - (parseInt(b) || 0); });

        var header = [tr('gr_col_student'), tr('gr_col_grade'), 'Status'];
        var actLabels = allKeys.map(function (k) {
          var nm = (ACT_NAMES[k] || (tr('gr_act_prefix','Ativ. ') + k)).replace(/\(Grade\)|\(Real\)|\(Valor\)/gi, '').trim();
          return nm.length > 40 ? nm.slice(0, 37) + '...' : nm;
        });
        header = header.concat(actLabels);

        var rows = GRADES_CACHE.map(function (g) {
          var status = g.total === null ? tr('gr_no_grade') : g.total >= 60 ? tr('gr_approved') : tr('gr_in_progress');
          var row = [g.name, g.total !== null ? g.total : '', status];
          allKeys.forEach(function (k) {
            var v = (g.actGrades || {})[k];
            row.push((v !== null && v !== undefined && !isNaN(v)) ? Number(v) : '');
          });
          return row;
        });

        return { header: header, rows: rows, allKeys: allKeys };
      }

      /* ── Gerador XLSX nativo (sem biblioteca externa) ── */
      function exportXLSX() {
        if (!GRADES_CACHE.length) { alert(tr('gr_no_grades_loaded')); return; }

        var btn = document.querySelector('.gr-export-btn');
        if (btn) { btn.disabled = true; btn.textContent = '⏳ Exportando...'; }

        var data   = buildExportData();
        var header = data.header;
        var rows   = data.rows;
        var allRows = [header].concat(rows);
        var fname  = tr('gr_export_filename','notas_') + new Date().toISOString().slice(0, 10) + '.xlsx';

        /* ── XML helpers ── */
        function xmlEsc(s) {
          return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
        }
        function colName(n) { // 0-based → A, B, ... Z, AA, ...
          var s = ''; n++;
          while (n > 0) { n--; s = String.fromCharCode(65 + n % 26) + s; n = Math.floor(n / 26); }
          return s;
        }
        function cellRef(r, c) { return colName(c) + (r + 1); }

        /* ── Shared strings ── */
        var sharedStr = [], sharedMap = {};
        function si(s) {
          var k = String(s == null ? '' : s);
          if (sharedMap[k] === undefined) { sharedMap[k] = sharedStr.length; sharedStr.push(k); }
          return sharedMap[k];
        }

        /* ── Spreadsheet content ── */
        var sheetRows = '';
        allRows.forEach(function (row, r) {
          var cells = '';
          row.forEach(function (val, c) {
            var ref = cellRef(r, c);
            if (typeof val === 'number' && !isNaN(val)) {
              cells += '<c r="' + ref + '" t="n"><v>' + val + '</v></c>';
            } else {
              var idx = si(val);
              cells += '<c r="' + ref + '" t="s"><v>' + idx + '</v></c>';
            }
          });
          sheetRows += '<row r="' + (r + 1) + '">' + cells + '</row>';
        });

        // Larguras de coluna
        var colDefs = '<col min="1" max="1" width="34" customWidth="1"/>'
          + '<col min="2" max="2" width="12" customWidth="1"/>'
          + '<col min="3" max="3" width="16" customWidth="1"/>';
        for (var ci = 0; ci < allRows[0].length - 3; ci++) {
          colDefs += '<col min="' + (ci+4) + '" max="' + (ci+4) + '" width="22" customWidth="1"/>';
        }

        var lastCol = colName(header.length - 1);
        var lastRow = allRows.length;
        var dim     = 'A1:' + lastCol + lastRow;

        var sheetXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
          + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"'
          + ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
          + '<dimension ref="' + dim + '"/>'
          + '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
          + '<cols>' + colDefs + '</cols>'
          + '<sheetData>' + sheetRows + '</sheetData>'
          + '</worksheet>';

        var ssXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
          + '<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"'
          + ' count="' + sharedStr.length + '" uniqueCount="' + sharedStr.length + '">'
          + sharedStr.map(function (s) { return '<si><t xml:space="preserve">' + xmlEsc(s) + '</t></si>'; }).join('')
          + '</sst>';

        var wbXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
          + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"'
          + ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
          + '<sheets><sheet name="Notas" sheetId="1" r:id="rId1"/></sheets>'
          + '</workbook>';

        var wbRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
          + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
          + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
          + '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>'
          + '</Relationships>';

        var rootRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
          + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
          + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
          + '</Relationships>';

        var contentTypes = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
          + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
          + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
          + '<Default Extension="xml" ContentType="application/xml"/>'
          + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
          + '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
          + '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>'
          + '</Types>';

        /* ── Build ZIP in memory (stored format — method 0) ── */
        function strToBytes(s) {
          var enc = new TextEncoder();
          return enc.encode(s);
        }
        function u32le(n) { return [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >> 24) & 0xff]; }
        function u16le(n) { return [n & 0xff, (n >> 8) & 0xff]; }

        function crc32(bytes) {
          var table = [];
          for (var i = 0; i < 256; i++) {
            var c = i;
            for (var j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
            table[i] = c;
          }
          var crc = 0xFFFFFFFF;
          for (var k = 0; k < bytes.length; k++) crc = table[(crc ^ bytes[k]) & 0xff] ^ (crc >>> 8);
          return (crc ^ 0xFFFFFFFF) >>> 0;
        }

        var files = [
          { name: '[Content_Types].xml',           data: contentTypes },
          { name: '_rels/.rels',                   data: rootRels },
          { name: 'xl/workbook.xml',               data: wbXml },
          { name: 'xl/_rels/workbook.xml.rels',    data: wbRels },
          { name: 'xl/worksheets/sheet1.xml',      data: sheetXml },
          { name: 'xl/sharedStrings.xml',          data: ssXml }
        ];

        var localHeaders = [], centralDir = [], offset = 0;
        var allBytes = [];

        files.forEach(function (f) {
          var nameBytes  = new TextEncoder().encode(f.name);
          var dataBytes  = strToBytes(f.data);
          var crc        = crc32(dataBytes);
          var size       = dataBytes.length;
          var modDate    = 0x5421; // placeholder date
          var modTime    = 0x0000;

          // Local file header
          var lh = [0x50,0x4B,0x03,0x04, // signature
            0x14,0x00,           // version needed
            0x00,0x00,           // flags
            0x00,0x00,           // compression (stored)
          ].concat(u16le(modTime), u16le(modDate),
            u32le(crc), u32le(size), u32le(size),
            u16le(nameBytes.length), u16le(0));

          var entry = lh.concat(Array.from(nameBytes), Array.from(dataBytes));
          localHeaders.push(entry);

          // Central directory record
          var cd = [0x50,0x4B,0x01,0x02,
            0x14,0x00, 0x14,0x00,
            0x00,0x00, 0x00,0x00,
          ].concat(u16le(modTime), u16le(modDate),
            u32le(crc), u32le(size), u32le(size),
            u16le(nameBytes.length), u16le(0), u16le(0),
            u16le(0), u16le(0),
            u32le(0), u32le(offset))
            .concat(Array.from(nameBytes));

          centralDir.push(cd);
          offset += entry.length;
        });

        var cdOffset = offset;
        var cdBytes  = centralDir.reduce(function (a, b) { return a.concat(b); }, []);
        var eocd = [0x50,0x4B,0x05,0x06,
          0x00,0x00, 0x00,0x00,
        ].concat(u16le(files.length), u16le(files.length),
          u32le(cdBytes.length), u32le(cdOffset),
          u16le(0));

        var all = localHeaders.reduce(function (a, b) { return a.concat(b); }, [])
          .concat(cdBytes).concat(eocd);

        var blob = new Blob([new Uint8Array(all)],
          { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        var url = URL.createObjectURL(blob);
        var a   = document.createElement('a');
        a.href  = url; a.download = fname;
        document.body.appendChild(a); a.click();
        document.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(url); }, 2000);

        if (btn) { btn.disabled = false; Store.renderHtml(btn, '<span aria-hidden="true">&#128202;</span>' + tr('gr_export')); }
      }

      /* ── showDetailByEl: chamado pelo data-* onclick ── */
      function showDetailByEl(el) {
        var name = el && el.dataset && el.dataset.gname;
        if (name) showDetail(name, null);
      }
    
      /* ── openProfile: navigate to profile tab with pre-selected student ── */
      function openProfile(el) {
        var name = el && el.dataset && el.dataset.gname;
        if (!name) return;
        if (window.goToStudentProfile) {
          window.goToStudentProfile(name);
        } else if (window.showPage) {
          window.showPage('studentprofile');
          setTimeout(function () {
            var sel = document.getElementById('spStudentSel');
            if (!sel) return;
            var opt = Array.from(sel.options).find(function (o) { return o.value === name || o.text === name; });
            if (opt) { sel.value = opt.value; window.MWAProfile && window.MWAProfile.loadProfile(name); }
          }, 200);
        }
      }
    
      /* Public API */
      window.MWAGrades = {
        render:          renderGrades,
        filter:          filter,
        setFilter:       setFilter,
        clearFilters:    clearFilters,
        showDetail:      showDetail,
        showDetailByEl:  showDetailByEl,
        openProfile:     openProfile,
        exportXLSX:      exportXLSX
      };
    
    })();

    return window.MWAGrades;
});
