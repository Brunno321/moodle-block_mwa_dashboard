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
 * @module     block_mwa_dashboard/classlist
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
define(['block_mwa_dashboard/dashboardstore', 'block_mwa_dashboard/engagementcalc'], function(Store, EngagementCalc) {

    'use strict';

    var window = Store.windowFacade();

    (function () {
      function icon(name) {
        return '<svg class="mwa-ui-icon" aria-hidden="true"><use href="#mwa-icon-' + name + '"></use></svg>';
      }
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
      function norm(v) { return (v === undefined || v === null) ? '' : String(v).trim(); }
      function helpTip(text) {
        return '<span class="mwa-help-tip cl-help-tip" tabindex="0" aria-label="' + esc(text) + '" data-tooltip="' + esc(text) + '">?</span>';
      }

      /**
       * Delta chip for a class KPI card.
       *
       * The label always reports the real signed change (cur - prv); only the
       * colour encodes whether that change is good or bad. "never" and "low"
       * are undesirable buckets, so for them a drop is green and a rise is red
       * (invertColors = true); "medium" and "high" are the reverse.
       */
      function classKpiDeltaChip(key, cur, prv, invertColors) {
        if (prv === null || prv === undefined || cur === null || cur === undefined) {
          return '';
        }
        var d = Number(cur) - Number(prv);
        var label = d === 0 ? '0' : (d > 0 ? '+' + d : String(d));
        var good = invertColors ? d < 0 : d > 0;
        var color = d === 0 ? '#8a94a8' : good ? '#13794c' : '#b42318';
        var bg = d === 0 ? '#f0f2f7' : good ? '#e8f7ef' : '#fdecec';
        return '<span style="background:' + bg + ';color:' + color + ';font-size:.65rem;font-weight:800;padding:2px 7px;border-radius:99px;">' + label + '</span>';
      }
    
      /* ── module state ── */
      var CL_VIEW = 'participation';
      var CL_FILTER = 'all';
      var CL_SEARCH = '';
      var CL_DETAIL_ITEMS = {};
      var CL_PAGE = 1;
      var CL_PAGE_SIZE = 10;
      var CL_EXPORT_ITEMS = [];
      var CL_EXPORT_SESSION_TIMES = {};
      var CL_EXPORT_GRADES = [];
      var CL_EXPORT_RESOURCES = [];
    
      /* ── avatar colours (cycling by name) ── */
      var AV_COLORS = ['#5b9bd5','#8b72d4','#3aab7a','#c98a2a','#d95f5f','#2aafaa','#e07ba0'];
    
      /* ── helpers de data ── */
      function parseDate(log) {
        if (log._ts) return new Date(Number(log._ts) * 1000);
        if (log.timecreated) return new Date(Number(log.timecreated) * 1000);
        var s = norm(log.hora || log.time || log.date);
        var m = s.match(/(\d{2})\/(\d{2})\/(\d{2}),\s*(\d{2}):(\d{2})(?::(\d{2}))?/);
        if (m) return new Date(2000 + Number(m[3]), Number(m[2]) - 1, Number(m[1]), Number(m[4]), Number(m[5]), Number(m[6] || 0));
        return null;
      }
    
      function fmtDate(d) {
        if (!d) return '—';
        var dd = String(d.getDate()).padStart(2, '0');
        var mm = String(d.getMonth() + 1).padStart(2, '0');
        return dd + '/' + mm + '/' + d.getFullYear();
      }

      function presenceInfo(last) {
        if (!last || !(last instanceof Date) || isNaN(last.getTime())) {
          return {tone: 'offline', label: tr('presence_offline', 'Offline')};
        }
        var minutes = Math.max(0, Math.floor((Date.now() - last.getTime()) / 60000));
        if (minutes <= 5) return {tone: 'online', label: tr('presence_online_now', 'Online agora')};
        if (minutes <= 15) return {tone: 'recent', label: tr('presence_recent', 'Ativo recentemente')};
        return {tone: 'offline', label: tr('presence_offline', 'Offline')};
      }
    
      /* ── session time calculation ── */
      var SESSION_GAP = 10 * 60 * 1000;
      var ACTIVE_GAP_CAP = 5 * 60 * 1000;
    
      function calcSessionTimes(logs) {
        var byStudent = {};
        logs.forEach(function (r) {
          var n = norm(r.nomecompleto || r.student_name || r.userfullname || r.fullname || r.name);
          var d = parseDate(r);
          if (!n || !d) return;
          if (!byStudent[n]) byStudent[n] = [];
          byStudent[n].push(d.getTime());
        });
        var result = {};
        Object.keys(byStudent).forEach(function (n) {
          var seen = {};
          var times = byStudent[n]
            .sort(function (a, b) { return a - b; })
            .filter(function (t) {
              if (seen[t]) return false;
              seen[t] = true;
              return true;
            });
          var total = 0;
          var prev = times[0];
          for (var i = 1; i < times.length; i++) {
            var gap = times[i] - prev;
            if (gap > 0 && gap <= SESSION_GAP) {
              total += Math.min(gap, ACTIVE_GAP_CAP);
            }
            prev = times[i];
          }
          result[n] = total;
        });
        return result;
      }
    
      function fmtTime(ms) {
        if (!ms || ms <= 0) return '0min';
        var totalMin = Math.round(ms / 60000);
        if (totalMin < 1) return '< 1min';
        if (totalMin < 60) return totalMin + 'min';
        var h = Math.floor(totalMin / 60);
        var m = totalMin % 60;
        return h + 'h' + (m > 0 ? ' ' + m + 'min' : '');
      }

      function progressCounts(html) {
        var markup = html || '';
        return {
          done: (markup.match(/class="cl-act-dot done"/g) || []).length,
          missing: (markup.match(/class="cl-act-dot missing"/g) || []).length,
          overdue: (markup.match(/class="cl-act-dot overdue"/g) || []).length
        };
      }

      function csvCell(value) {
        var text = value === null || value === undefined ? '' : String(value);
        if (/^[=+\-@]/.test(text)) text = "'" + text;
        return '"' + text.replace(/"/g, '""') + '"';
      }

      function utf16leBlob(text) {
        var buffer = new ArrayBuffer(2 + (text.length * 2));
        var view = new DataView(buffer);
        view.setUint16(0, 0xFEFF, true);
        for (var i = 0; i < text.length; i++) {
          view.setUint16(2 + (i * 2), text.charCodeAt(i), true);
        }
        return new Blob([buffer], {type: 'text/csv;charset=utf-16le'});
      }

      function exportGradeActivities(grades) {
        var meta = grades && grades[0] && grades[0].__mwa_type__ === 'activity_names' ? grades[0] : null;
        if (!meta) return [];
        return Object.keys(meta).map(function(key) {
          var match = key.match(/^act_(\d+)$/);
          return match ? {seq: match[1], name: norm(meta[key]) || ('Atividade ' + match[1])} : null;
        }).filter(Boolean).sort(function(a, b) {
          return Number(a.seq) - Number(b.seq);
        });
      }

      function exportGradeRow(studentName, grades) {
        var found = null;
        (grades || []).some(function(row) {
          if (!row || row.__mwa_type__ === 'activity_names') return false;
          var first = norm(row['First name'] || row.Nome || row.firstname || '');
          var last = norm(row['Last name'] || row.Sobrenome || row.lastname || '');
          var name = norm(row.student_name || row.name || row.nomecompleto || row.Aluno || (first + ' ' + last));
          if (name.toLowerCase() === norm(studentName).toLowerCase()) {
            found = row;
            return true;
          }
          return false;
        });
        return found || {};
      }

      function exportActivityGrade(row, seq) {
        var raw = row['act_' + seq];
        if (raw === null || raw === undefined || String(raw).trim() === '' || String(raw).trim() === '-' || String(raw).trim() === '—') {
          return '';
        }
        var parsed = Number(String(raw).trim().replace(',', '.'));
        return isNaN(parsed) ? raw : parsed;
      }

      function exportClassSpreadsheet() {
        if (!CL_EXPORT_ITEMS.length) {
          Store.notify(tr('cl_export_empty', 'Não há estudantes para exportar com os filtros atuais.'), 'warning');
          return;
        }
        var gradeActivities = exportGradeActivities(CL_EXPORT_GRADES);
        var headers = [
          tr('student', 'Estudante'), tr('email', 'E-mail'), tr('cl_th_participation', 'Participação (%)'),
          tr('cl_th_situation', 'Situação'), tr('attention', 'Em acompanhamento'),
          tr('cl_th_days_without', 'Dias sem acesso'), tr('cl_th_last_access', 'Último acesso'),
          tr('interactions', 'Interações'), tr('ev_active_days', 'Dias ativos'),
          tr('cl_th_total_time', 'Tempo total'), tr('sp_kpi_grade', 'Nota atual'),
          tr('cl_export_activities_done', 'Atividades concluídas'),
          tr('cl_export_activities_missing', 'Atividades pendentes'),
          tr('cl_export_activities_overdue', 'Atividades atrasadas'),
          tr('cl_export_resources_accessed', 'Conteúdos acessados'),
          tr('cl_export_resources_missing', 'Conteúdos não acessados')
        ].concat(gradeActivities.map(function(activity) {
          return tr('sp_kpi_grade', 'Nota') + ' — ' + activity.name;
        }));
        var rows = CL_EXPORT_ITEMS.map(function(item) {
          var calc = item.calc || {};
          var activity = progressCounts(buildActDots(item.name, CL_EXPORT_GRADES));
          var resource = progressCounts(buildResourceDots(item.name, CL_EXPORT_RESOURCES));
          var grade = calc.grade === null || calc.grade === undefined || isNaN(Number(calc.grade)) ? '' : Number(calc.grade);
          var daysWithout = item.status.key === 'never' ? '' : Number(calc.daysWithoutAccess || 0);
          var gradeRow = exportGradeRow(item.name, CL_EXPORT_GRADES);
          return [
            item.name, item.email || '', item.score, item.status.label,
            item.followup ? tr('yes', 'Sim') : tr('no', 'Não'), daysWithout,
            calc.last ? fmtDate(calc.last) : '', item.count, Number(calc.activeDays || 0),
            fmtTime(CL_EXPORT_SESSION_TIMES[item.name] || 0), grade,
            activity.done, activity.missing, activity.overdue,
            resource.done, resource.missing + resource.overdue
          ].concat(gradeActivities.map(function(activity) {
            return exportActivityGrade(gradeRow, activity.seq);
          }));
        });
        var csv = 'sep=;\r\n' + [headers].concat(rows).map(function(row) {
          return row.map(csvCell).join(';');
        }).join('\r\n');
        var blob = utf16leBlob(csv);
        var url = window.URL.createObjectURL(blob);
        var link = document.createElement('a');
        var courseId = (Store.getConfig() || {}).courseid || 'curso';
        link.href = url;
        link.download = 'relatorio_turma_' + courseId + '_' + new Date().toISOString().slice(0, 10) + '.csv';
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(url);
      }
    
      /* ── cor do tempo ── */
      function timeColor(ms) {
        if (ms >= 3600000) return 'var(--green)';
        if (ms >= 900000)  return 'var(--blue)';
        return 'var(--muted)';
      }
    
      /* ── getLastAccess: date of last log entry per student ── */
      function getLastAccess(logs) {
        var m = {};
        logs.forEach(function (r) {
          var n = norm(r.nomecompleto || r.student_name || r.userfullname || r.fullname || r.name);
          var d = parseDate(r);
          if (!n || !d) return;
          if (!m[n] || d > m[n]) m[n] = d;
        });
        return m;
      }
    
      /* ── email do aluno ── */
      function getEmailForStudent(name, logs, grades) {
        var found = null;
        logs.some(function (r) {
          var rn = norm(r.nomecompleto || r.student_name || r.userfullname || r.fullname || r.name);
          if (rn === name && norm(r.email)) {
            found = norm(r.email);
            return true;
          }
          return false;
        });
        if (found) return found;
        (grades || []).some(function (g) {
          if (!g || g['__mwa_type__'] === 'activity_names') return false;
          var first = norm(g['First name'] || g.Nome || g.firstname || '');
          var last = norm(g['Last name'] || g.Sobrenome || g.lastname || '');
          var gname = norm(g.student_name || g.name || g.nomecompleto || g.Aluno || (first + ' ' + last));
          if (gname === name && norm(g.Email || g.email)) {
            found = norm(g.Email || g.email);
            return true;
          }
          return false;
        });
        return found || '';
      }

      function getPictureForStudent(name, email, logs, grades) {
        var target = norm(name).toLowerCase();
        var targetEmail = norm(email).toLowerCase();
        var found = '';
        (logs || []).some(function (r) {
          var n = norm(r.nomecompleto || r.student_name || r.userfullname).toLowerCase();
          var e = norm(r.email).toLowerCase();
          if ((target && n === target) || (targetEmail && e === targetEmail)) {
            found = norm(r.pictureurl || r.profileimageurl || r.userpictureurl);
            return !!found;
          }
          return false;
        });
        if (found) return found;
        (grades || []).some(function (g) {
          if (!g || g.__mwa_type__ === 'activity_names') return false;
          var gname = (norm(g['First name']) + ' ' + norm(g['Last name'])).trim().toLowerCase();
          var gemail = norm(g.Email || g.email).toLowerCase();
          if ((target && gname === target) || (targetEmail && gemail === targetEmail)) {
            found = norm(g['Picture URL'] || g.pictureurl || g.profileimageurl);
            return !!found;
          }
          return false;
        });
        return found;
      }

      function getUserIdForStudent(name, email, students, logs) {
        var target = norm(name).toLowerCase();
        var targetEmail = norm(email).toLowerCase();
        var found = 0;
        (students || []).some(function (s) {
          var n = norm(s.name || s.fullname || s.nomecompleto || s.student_name).toLowerCase();
          var e = norm(s.email).toLowerCase();
          if ((target && n === target) || (targetEmail && e === targetEmail)) {
            found = parseInt(s.id || s.userid || 0, 10) || 0;
            return !!found;
          }
          return false;
        });
        if (found) return found;
        (logs || []).some(function (r) {
          var n = norm(r.nomecompleto || r.student_name || r.userfullname || r.fullname || r.name).toLowerCase();
          var e = norm(r.email).toLowerCase();
          if ((target && n === target) || (targetEmail && e === targetEmail)) {
            found = parseInt(r.userid || r.user_id || r.idusuario || 0, 10) || 0;
            return !!found;
          }
          return false;
        });
        return found || 0;
      }
    
      /* ── activity coverage calculation ── */
      function isCourseGeneral(name) {
        var n = norm(name);
        if (!n) return true;
        if (/^curso\s*:/i.test(n)) return true;
        if (/^sistema$/i.test(n)) return true;
        if (/^área de texto/i.test(n)) return true;
        if (/^mídia/i.test(n)) return true;
        return false;
      }
    
      /* ── dots de atividade por aluno (modo "Ver atividades") ── */
      function buildActDots(name, grades) {
        if (!grades || !grades.length) {
          return '<span class="cl-no-grades-hint">' + esc(tr('cl_no_grades_hint')) + '</span>';
        }

        var meta = grades[0] && grades[0]['__mwa_type__'] === 'activity_names' ? grades[0] : null;
        var actNames = {};
        var actCmids = {};
        var actModules = {};
        var actAvailability = {};
        var actAvailableFrom = {};
        var actAvailableUntil = {};
        var actDueDates = {};
        if (meta) {
          Object.keys(meta).forEach(function (k) {
            var m = k.match(/^act_(\d+)$/);
            if (m) {
              actNames[Number(m[1])] = norm(meta[k]);
              actCmids[Number(m[1])] = Number(meta['act_cmid_' + m[1]] || 0);
              actModules[Number(m[1])] = norm(meta['act_module_' + m[1]] || '');
              actAvailability[Number(m[1])] = String(meta['act_available_' + m[1]] === undefined ? '1' : meta['act_available_' + m[1]]) !== '0';
              actAvailableFrom[Number(m[1])] = Number(meta['act_availablefrom_' + m[1]] || 0);
              actAvailableUntil[Number(m[1])] = Number(meta['act_availableuntil_' + m[1]] || 0);
              actDueDates[Number(m[1])] = Number(meta['act_duedate_' + m[1]] || 0);
            }
          });
        }
        var wwwroot    = (Store.getConfig().wwwroot || '');

        var rawRow = null;
        grades.some(function (g) {
          if (!g || g['__mwa_type__'] === 'activity_names') return false;
          var first = norm(g['First name'] || g.Nome || g.firstname || '');
          var last = norm(g['Last name'] || g.Sobrenome || g.lastname || '');
          var gname = norm(g.student_name || g.name || g.nomecompleto || g.Aluno || (first + ' ' + last));
          if (gname.toLowerCase() === name.toLowerCase()) { rawRow = g; return true; }
          return false;
        });
        if (!rawRow) {
          return '<span class="cl-no-grades-hint">' + esc(tr('cl_no_grade_for_student')) + '</span>';
        }

        var actGrades = {};
        var actCurrent = {};
        Object.keys(rawRow).forEach(function (k) {
          var gm = k.match(/^act_(\d+)$/);
          if (gm) {
            actGrades[gm[1]] = rawRow[k];
            return;
          }
          var cm = k.match(/^act_current_(\d+)$/);
          if (cm) {
            actCurrent[cm[1]] = Number(rawRow[k] || 0);
          }
        });
        var nowSeconds = Math.floor(Date.now() / 1000);
        var seqs      = Object.keys(actNames).length
          ? Object.keys(actNames).sort(function (a, b) { return Number(a) - Number(b); })
          : Object.keys(actGrades).sort(function (a, b) { return Number(a) - Number(b); });
        seqs = seqs.filter(function(seq) {
          var n = Number(seq);
          var overdue = actDueDates[n] > 0 && nowSeconds > actDueDates[n];
          var open = actAvailability[n] !== false && (!actAvailableFrom[n] || actAvailableFrom[n] <= nowSeconds) &&
            (!actAvailableUntil[n] || actAvailableUntil[n] >= nowSeconds);
          return overdue || open;
        });

        if (!seqs.length) {
          return '<span class="cl-no-grades-hint">' + esc(tr('cl_no_activities_found')) + '</span>';
        }

        return '<div class="cl-act-dots">' + seqs.map(function (seq) {
          var key = String(seq);
          var val = actGrades[key];
          var modname = String(actModules[Number(seq)] || '').toLowerCase();
          var hasCurrentState = Object.prototype.hasOwnProperty.call(actCurrent, key);
          var currentCount = hasCurrentState ? Number(actCurrent[key] || 0) : null;
          var num = (val === null || val === undefined) ? NaN : parseFloat(String(val).replace(',', '.'));
          var isForum = modname === 'forum';
          var hasGradeValue = !isNaN(num) && num > 0;
          var done = hasCurrentState
            ? (isForum ? currentCount > 0 : currentCount > 0 || hasGradeValue)
            : hasGradeValue;
          var overdue = !done && actDueDates[Number(seq)] > 0 && nowSeconds > actDueDates[Number(seq)];
          var missing = hasCurrentState
            ? (isForum ? currentCount <= 0 : currentCount <= 0 && !hasGradeValue)
            : val === null || val === undefined || val === '-' || val === '' || (!isNaN(num) && num === 0);
          var cls = done ? 'done' : overdue ? 'overdue' : missing ? 'missing' : 'pending';
          var actName = actNames[Number(seq)] || ('Atividade ' + seq);
          var tooltip = esc(actName) + (hasCurrentState && modname === 'forum'
            ? ' (' + currentCount + ' post' + (currentCount === 1 ? '' : 's') + ')'
            : (done && hasGradeValue ? ' (' + num.toFixed(1) + ' pts)' : done ? ' (concluida)' : overdue ? ' (' + esc(tr('cl_activity_overdue', 'vencida sem entrega')) + ')' : missing ? ' (-)' : ''));
          var cmid = actCmids[Number(seq)] || 0;
          var url = (cmid && modname && wwwroot)
            ? wwwroot + '/mod/' + modname + '/view.php?id=' + cmid
            : '';
          var inner = url
            ? '<a href="' + url + '" target="_blank" rel="noopener" onclick="event.stopPropagation()" style="color:inherit;text-decoration:none;">' + seq + '</a>'
            : String(seq);
          return '<span class="cl-act-dot ' + cls + '" title="' + tooltip + '">' + inner + '</span>';
        }).join('') + '</div>';
      }

      function moduleOf(log) {
        var mod = norm(log._modtype || log.modtype || log.module || log.modname || '').toLowerCase();
        var comp = norm(log.component || log.componente || '').toLowerCase();
        if (!mod && /^mod_/.test(comp)) mod = comp.replace(/^mod_/, '');
        if (mod === 'hvp') mod = 'h5pactivity';
        if (mod === 'assignsubmission') mod = 'assign';
        if (!mod || mod === 'core' || mod === 'system') {
          if (comp === 'página' || comp === 'page') mod = 'page';
          else if (comp === 'livro' || comp === 'book') mod = 'book';
          else if (comp === 'url') mod = 'url';
          else if (comp === 'arquivo' || comp === 'file' || comp === 'recurso' || comp === 'resource') mod = 'resource';
          else if (comp === 'pasta' || comp === 'folder') mod = 'folder';
          else if (comp === 'pacote de conteúdo ims' || comp === 'ims content package' || comp === 'imscp') mod = 'imscp';
        }
        return mod;
      }

      function realContextName(log) {
        var ctx = norm(log.contextodoevento || log.eventcontext || log.context || '');
        var ev = norm(log.nomedoevento || log.eventname || log.action || '');
        var lowerCtx = ctx.toLowerCase();
        if (ctx && !isCourseGeneral(ctx) && lowerCtx !== 'course module viewed' && lowerCtx !== 'módulo do curso visualizado') {
          return ctx.replace(/^(page|página|book|livro|url|resource|recurso|file|arquivo|folder|pasta)\s*:\s*/i, '');
        }
        if (ev && !isCourseGeneral(ev) && ev.toLowerCase() !== 'course module viewed') {
          return ev;
        }
        return '';
      }

      function isResourceModule(log) {
        var mod = moduleOf(log);
        var comp = norm(log.component || log.componente || '').toLowerCase();
        if (mod === 'label' || comp.indexOf('área de mídia e texto') >= 0 ||
            comp.indexOf('area de midia e texto') >= 0 || comp.indexOf('text and media area') >= 0) {
          return false;
        }
        return mod === 'page' || mod === 'book' || mod === 'url' || mod === 'resource' ||
          mod === 'folder' || mod === 'imscp' || comp === 'página' || comp === 'page' ||
          comp === 'livro' || comp === 'book' || comp === 'url' || comp === 'arquivo' ||
          comp === 'file' || comp === 'pasta' || comp === 'folder';
      }

      function cmidOf(log) {
        var raw = log.cmid || log._cmid || log.contextinstanceid || log.contextinstance || log.coursemoduleid || log.moduleid || '';
        var cmid = parseInt(raw, 10);
        return isNaN(cmid) ? 0 : cmid;
      }

      function directResourceUrl(log) {
        return norm(log.url || log.contexturl || log.objecturl || log.link || log.viewurl || log._url || '');
      }

      function gradedCmidSet(grades) {
        var set = {};
        var meta = grades && grades[0] && grades[0].__mwa_type__ === 'activity_names' ? grades[0] : null;
        if (!meta) return set;
        Object.keys(meta).forEach(function(key) {
          var match = key.match(/^act_cmid_(\d+)$/);
          if (match && Number(meta[key] || 0)) set[Number(meta[key])] = true;
        });
        return set;
      }

      function buildResourceCatalog(logs, activityLinks, grades) {
        var map = {};
        var graded = gradedCmidSet(grades);
        var now = Math.floor(Date.now() / 1000);
        (activityLinks || []).forEach(function (link) {
          if (link && link.tracked === false) return;
          var available = String(link && link.available !== undefined ? link.available : '1') !== '0';
          var availableFrom = Number(link && link.availablefrom || 0);
          var availableUntil = Number(link && link.availableuntil || 0);
          if (!available || (availableFrom && availableFrom > now) || (availableUntil && availableUntil < now)) return;
          var name = norm(link.name || '');
          var cmid = cmidOf(link);
          if (!isResourceModule(link) && (!cmid || graded[cmid])) return;
          var mod = moduleOf(link);
          if (!name) return;
          var key = cmid ? 'cmid:' + cmid : 'name:' + name.toLowerCase();
          map[key] = {key: key, name: name, cmid: cmid, mod: mod, url: directResourceUrl(link), students: {}};
        });
        (logs || []).forEach(function (log) {
          var cmid = cmidOf(log);
          if (!cmid) return;
          var key = 'cmid:' + cmid;
          if (!map[key]) return;
          var mod = moduleOf(log);
          if (!map[key].url) {
            map[key].url = directResourceUrl(log);
          }
          if (!map[key].mod && mod) {
            map[key].mod = mod;
          }
          var student = norm(log.nomecompleto || log.student_name || log.userfullname || log.fullname || log.name);
          if (student) map[key].students[student.toLowerCase()] = 1;
        });
        return Object.keys(map).map(function (key) { return map[key]; })
          .sort(function (a, b) { return a.name.localeCompare(b.name, 'pt-BR'); });
      }

      function buildResourceDots(name, resources) {
        if (!resources || !resources.length) {
          return '<span class="cl-no-grades-hint">' + esc(tr('cl_no_resources_found')) + '</span>';
        }
        var studentKey = name.toLowerCase();
        var wwwroot = (Store.getConfig().wwwroot || '').replace(/\/$/, '');
        return '<div class="cl-act-dots">' + resources.map(function (res, idx) {
          var done = !!(res.students && res.students[studentKey]);
          var cls = done ? 'done' : 'missing';
          var tooltip = esc(res.name) + (done ? ' (' + esc(tr('cl_resource_accessed')) + ')' : ' (' + esc(tr('cl_resource_not_accessed')) + ')');
          var url = res.url || ((wwwroot && res.cmid && res.mod)
            ? wwwroot + '/mod/' + encodeURIComponent(res.mod) + '/view.php?id=' + encodeURIComponent(String(res.cmid))
            : '');
          var number = String(idx + 1);
          if (url) {
            return '<a class="cl-act-dot ' + cls + '" href="' + esc(url) + '" target="_blank" rel="noopener" title="' + tooltip + '" onclick="event.stopPropagation()">' + number + '</a>';
          }
          return '<span class="cl-act-dot ' + cls + '" title="' + tooltip + '">' + number + '</span>';
        }).join('') + '</div>';
      }

      function getAllStudentNames(logs, grades, students) {
        var seen = {};
        var names = [];
        function add(name) {
          name = norm(name);
          var key = name.toLowerCase();
          if (name && !seen[key]) {
            seen[key] = true;
            names.push(name);
          }
        }
        if (EngagementCalc && EngagementCalc.getStudentNames) {
          EngagementCalc.getStudentNames(logs || [], grades || []).forEach(add);
        }
        (students || []).forEach(function (s) {
          add(s.name || s.fullname || s.nomecompleto || s.student_name);
        });
        (logs || []).forEach(function (r) {
          add(r.nomecompleto || r.student_name || r.userfullname || r.fullname || r.name);
        });
        return names;
      }

      function statusInfo(score, confirmedNever) {
        if (score === 0 && confirmedNever) {
          return {key: 'never', cls: 'never', color: '#7b8496', label: tr('ev_never_access', 'Nunca acessou o Moodle')};
        }
        if (score >= 70) {
          return {key: 'high', cls: 'high', color: '#3aab7a', label: tr('ev_high_part', 'Alta participação')};
        }
        if (score > 40) {
          return {key: 'medium', cls: 'medium', color: '#8b72d4', label: tr('ev_med_part', 'Em progressão')};
        }
        return {key: 'low', cls: 'low', color: '#4f83d1', label: tr('ev_low_part', 'Baixa participação')};
      }

      function hasNoReleasedGrade(item) {
        var row = item && item.gradeRow || {};
        var raw = row['Course total (Grade)'];
        if (raw === null || raw === undefined || String(raw).trim() === '' || String(raw).trim() === '-') {
          raw = item && item.calc && item.calc.grade;
        }
        var text = raw === null || raw === undefined ? '' : String(raw).trim().toLowerCase();
        return text === '' || text === '-' || text === '—' || text === 'null' || text === 'n/a';
      }

      function totalGradeBelowCourseThreshold(item) {
        if (hasNoReleasedGrade(item) || hasTotalGradeAtOrAboveThreshold(item)) return false;
        var row = item && item.gradeRow || {};
        var raw = row['Course total (Grade)'];
        if (raw === null || raw === undefined || String(raw).trim() === '' || String(raw).trim() === '-') {
          raw = item && item.calc && item.calc.grade;
        }
        var earned = Number(String(raw).trim().replace(',', '.'));
        var maximum = Number(row['Course full max (Grade)'] || item && item.calc && item.calc.gradeMax || 0);
        var required = maximum > 0 ? maximum * 0.60 : 60;
        return !isNaN(earned) && earned < required;
      }

      function hasTotalGradeAtOrAboveThreshold(item) {
        var row = item && item.gradeRow || {};
        var raw = row['Course total (Grade)'];
        if (raw === null || raw === undefined || String(raw).trim() === '' || String(raw).trim() === '-') {
          raw = item && item.calc && item.calc.grade;
        }
        if (raw === null || raw === undefined || String(raw).trim() === '') return false;
        var earned = Number(String(raw).trim().replace(',', '.'));
        var maximum = Number(row['Course full max (Grade)'] || item && item.calc && item.calc.gradeMax || 0);
        var required = maximum > 0 ? maximum * 0.60 : 60;
        return !isNaN(earned) && earned >= required;
      }

      function gradeActivityDone(row, seq, mod) {
        var currentKey = 'act_current_' + seq;
        var hasCurrent = Object.prototype.hasOwnProperty.call(row || {}, currentKey);
        var current = hasCurrent ? Number(row[currentKey] || 0) : null;
        var raw = String(row && row['act_' + seq] !== undefined && row['act_' + seq] !== null ? row['act_' + seq] : '').trim();
        var grade = parseFloat(raw.replace(',', '.'));
        var hasPositiveGrade = raw !== '' && raw !== '-' && !isNaN(grade) && grade > 0;
        if (hasCurrent) return mod === 'forum' ? current > 0 : current > 0 || hasPositiveGrade;
        return hasPositiveGrade;
      }

      function trackedActivity(meta, seq) {
        var cmid = Number(meta['act_cmid_' + seq] || 0);
        var name = norm(meta['act_' + seq] || '').toLowerCase();
        var matched = null;
        (Store.getConfig().activitylinks || []).some(function(link) {
          var linkCmid = cmidOf(link);
          var same = (cmid && linkCmid === cmid) || (!cmid && name && norm(link && link.name).toLowerCase() === name);
          if (same) { matched = link; return true; }
          return false;
        });
        return !matched || matched.tracked !== false;
      }

      function hasOverdueDelivery(item, grades) {
        var meta = grades && grades[0] && grades[0].__mwa_type__ === 'activity_names' ? grades[0] : null;
        var row = item && item.gradeRow;
        if (!meta || !row) return false;
        var now = Math.floor(Date.now() / 1000);
        var enrolled = Number(item.enrolmentCreated || row._enrolment_created || 0);
        return Object.keys(meta).some(function(key) {
          var match = key.match(/^act_(\d+)$/);
          if (!match) return false;
          var seq = match[1];
          var due = Number(meta['act_duedate_' + seq] || 0);
          var availableFrom = Number(meta['act_availablefrom_' + seq] || 0);
          if (!due || due >= now || now > due + (7 * 86400) || (enrolled && enrolled > due) || (availableFrom && availableFrom > due) || !trackedActivity(meta, seq)) return false;
          return !gradeActivityDone(row, seq, norm(meta['act_module_' + seq] || '').toLowerCase());
        });
      }

      function hasOpenPendingActivity(item, grades) {
        var meta = grades && grades[0] && grades[0].__mwa_type__ === 'activity_names' ? grades[0] : null;
        var row = item && item.gradeRow;
        if (!meta || !row) return false;
        var now = Math.floor(Date.now() / 1000);
        return Object.keys(meta).some(function(key) {
          var match = key.match(/^act_(\d+)$/);
          if (!match) return false;
          var seq = match[1];
          var available = String(meta['act_available_' + seq] === undefined ? '1' : meta['act_available_' + seq]) !== '0';
          var from = Number(meta['act_availablefrom_' + seq] || 0);
          var until = Number(meta['act_availableuntil_' + seq] || 0);
          var due = Number(meta['act_duedate_' + seq] || 0);
          var open = available && (!from || from <= now) && (!until || until >= now) && (!due || due >= now);
          return open && trackedActivity(meta, seq) && !gradeActivityDone(row, seq, norm(meta['act_module_' + seq] || '').toLowerCase());
        });
      }

      function availableCourseContent(grades) {
        var now = Math.floor(Date.now() / 1000);
        var links = Store.getConfig().activitylinks || [];
        if (links.some(function(link) {
          if (link && link.tracked === false) return false;
          var available = String(link && link.available !== undefined ? link.available : '1') !== '0';
          var from = Number(link && link.availablefrom || 0);
          var until = Number(link && link.availableuntil || 0);
          return available && (!from || from <= now) && (!until || until >= now);
        })) return true;
        var meta = grades && grades[0] && grades[0].__mwa_type__ === 'activity_names' ? grades[0] : null;
        return !!meta && Object.keys(meta).some(function(key) {
          var match = key.match(/^act_(\d+)$/);
          if (!match) return false;
          var seq = match[1];
          var available = String(meta['act_available_' + seq] === undefined ? '1' : meta['act_available_' + seq]) !== '0';
          var from = Number(meta['act_availablefrom_' + seq] || 0);
          var until = Number(meta['act_availableuntil_' + seq] || 0);
          return available && (!from || from <= now) && (!until || until >= now);
        });
      }

      function followUpReasons(item, grades) {
        if (!item || item.confirmedNever) return [];
        if (hasTotalGradeAtOrAboveThreshold(item)) return [];
        var reasons = [];
        if (hasOverdueDelivery(item, grades)) {
          reasons.push({code: 'EV', tone: 'overdue', label: tr('cl_followup_overdue', 'Entrega vencida')});
        }
        if (Number(item.daysWithoutAccess || 0) >= 7 && availableCourseContent(grades)) {
          reasons.push({code: '7D', tone: 'inactive', label: tr('cl_followup_inactive', 'Sem participação há 7 dias ou mais')});
        }
        if (totalGradeBelowCourseThreshold(item)) {
          reasons.push({code: '<60', tone: 'grade', label: tr('cl_followup_grade', 'Aproveitamento parcial abaixo de 60%')});
        }
        return reasons;
      }

      function followUpReasonHtml(reasons) {
        if (!reasons || !reasons.length) return '';
        return '<span class="cl-followup-reasons">' + reasons.map(function(reason) {
          return '<span class="cl-followup-reason ' + esc(reason.tone) + '" title="' + esc(reason.label) +
            '" aria-label="' + esc(reason.label) + '">' + esc(reason.code) + '</span>';
        }).join('') + '</span>';
      }

      function detChip(icon, label, tone) {
        return '<span class="cl-det-chip ' + esc(tone || 'slate') + '"><span>' + icon + '</span>' + esc(label) + '</span>';
      }

      function determinantHtml(item) {
        var calc = item.calc || {};
        var chips = [];
        if (item.status.key === 'never') {
          chips.push(detChip('&#128683;', tr('ev_never_access', 'Nunca acessou o Moodle'), 'red'));
          chips.push(detChip(icon('warning'), tr('ev_det_at_risk', 'Em risco'), 'red'));
          chips.push(detChip(icon('clock'), tr('ev_det_no_access_recorded', 'Sem acesso registrado'), 'red'));
          return chips.join('');
        }
        if (calc.daysWithoutAccess > 7 && calc.daysWithoutAccess < 99999) {
          chips.push(detChip(icon('clock'), calc.daysWithoutAccess + ' ' + tr('ev_reason_days_no_access', 'dias sem acesso'), calc.daysWithoutAccess > 14 ? 'red' : 'amber'));
        }
        if (calc.interactions > 0 && calc.interactions < 3) {
          chips.push(detChip(icon('bolt'), tr('ev_det_low_activity', 'Poucas interações'), 'amber'));
        }
        if (item.hasOpenPending) {
          chips.push(detChip('&#128221;', tr('ev_det_pending_activities', 'Atividades pendentes'), 'blue'));
        }
        if (item.hasOverdue) {
          chips.push(detChip(icon('warning'), tr('ev_det_overdue_activities', 'Atividades vencidas'), 'red'));
        }
        return chips.join('');
      }

      function tagChip(icon, label, cls) {
        label = String(label || '').replace(/^[^\wÀ-ÿ]+/u, '').trim();
        return '<span class="cl-study-chip ' + esc(cls || 'slate') + '"><span class="cl-study-icon">' + icon + '</span><span>' + esc(label) + '</span></span>';
      }

      function buildStudyTags(name, logs, item) {
        var buckets = { dawn: 0, morning: 0, afternoon: 0, night: 0 };
        if (!item || !item.count || item.score <= 0) {
          return '';
        }
        logs.forEach(function (r) {
          var n = norm(r.nomecompleto || r.student_name || r.userfullname || r.fullname || r.name);
          var d;
          var h;
          if (n !== name) return;
          d = parseDate(r);
          if (!d) return;
          h = d.getHours();
          if (h >= 0 && h < 6) buckets.dawn++;
          else if (h < 12) buckets.morning++;
          else if (h < 18) buckets.afternoon++;
          else buckets.night++;
        });
        var peak = 'diurno';
        var peakCount = Math.max(buckets.dawn, buckets.morning, buckets.afternoon, buckets.night);
        if (peakCount <= 0) {
          return '';
        }
        if (peakCount > 0) {
          if (buckets.night === peakCount || buckets.dawn === peakCount) peak = 'noturno';
          else if (buckets.afternoon === peakCount) peak = 'vespertino';
        }
        if (peak === 'noturno') {
          return tagChip('&#127769;', tr('pl_tag_night', 'Noturno'), 'noturno');
        }
        if (peak === 'vespertino') {
          return tagChip('&#127780;', tr('pl_tag_afternoon', 'Vespertino'), 'vespertino');
        }
        return tagChip(icon('sun'), tr('pl_tag_daytime', 'Diurno'), 'diurno');
      }

      function renderClassKpis(items) {
        var box = document.getElementById('clKpiRow');
        if (!box) return;
        var counts = {never: 0, followup: 0, low: 0, medium: 0, high: 0};
        var total = Math.max(items.length, 1);
        var courseId = (Store.getConfig() || {}).courseid || 0;
        var trendKey = 'mwa_class_kpi_counts_' + courseId;
        var savedTrend = null;
        var savedStamp = '';
        try {
          var raw = JSON.parse(window.localStorage.getItem(trendKey) || 'null');
          if (raw && raw.counts) {
            savedTrend = raw.counts;
            savedStamp = raw.day || '';
          }
        } catch (e) {
          savedTrend = null;
          savedStamp = '';
        }
        items.forEach(function (item) {
          counts[item.status.key]++;
          if (item.followup) counts.followup++;
        });
        var cards = [
          ['never', '&#128683;', tr('ev_never_access', 'Nunca acessou o Moodle'), counts.never, 'never', tr('cl_kpi_tip_never', 'Alunos com 0% de participação, sem acesso registrado no Moodle.'), true],
          ['followup', '<span class="cl-stage-dot" aria-hidden="true"></span>', tr('attention', 'Em acompanhamento'), counts.followup, 'followup', tr('ac_tip_students_attention', 'Alunos com acesso registrado e aproveitamento de até 10%.'), true],
          ['low', '<span class="cl-stage-dot" aria-hidden="true"></span>', tr('ev_low_part', 'Em início de percurso'), counts.low, 'low', tr('cl_kpi_tip_low', 'Alunos com participação de 1% a 40% no curso.'), true],
          ['medium', '<span class="cl-stage-dot" aria-hidden="true"></span>', tr('ev_med_part', 'Em progressão'), counts.medium, 'medium', tr('cl_kpi_tip_medium', 'Alunos com participação de 41% a 69% no curso.'), false],
          ['high', '<span class="cl-stage-dot" aria-hidden="true"></span>', tr('ev_high_part', 'Alta participação'), counts.high, 'high', tr('cl_kpi_tip_high', 'Alunos com participação igual ou superior a 70% no curso.'), false]
        ];
        /* First visit for this course: compare against an empty class, so each
           card reports its starting population (e.g. 1 student in "high" -> +1).
           From the next day on, the stored snapshot provides the real baseline. */
        var previousCounts = savedTrend || {never: 0, followup: 0, low: 0, medium: 0, high: 0};
        Store.renderHtml(box, cards.map(function (c) {
          var pct = Math.round((c[3] / total) * 100);
          var chip = classKpiDeltaChip(c[0], counts[c[0]], previousCounts[c[0]], c[6]);
          return '<button type="button" class="cl-kpi-card ' + c[4] + '" data-cl-filter="' + c[0] + '">'
            + '<span class="cl-kpi-trend-wrap">' + chip + '</span>'
            + '<span class="cl-kpi-head"><span class="cl-kpi-icon" aria-hidden="true">' + c[1] + '</span><span class="cl-kpi-title">' + esc(c[2]) + helpTip(c[5]) + '</span></span>'
            + '<strong>' + pct + '%</strong>'
            + '<span class="cl-kpi-pct">' + c[3] + ' ' + esc(c[3] === 1 ? tr('student', 'estudante') : tr('students', 'estudantes')) + '</span>'
            + '</button>';
        }).join(''));
        /* Only refresh the baseline once per day, so the chip means "change since
           the previous day" instead of resetting to zero on every re-render. */
        try {
          var today = new Date().toISOString().slice(0, 10);
          if (savedStamp !== today) {
            window.localStorage.setItem(trendKey, JSON.stringify({day: today, counts: counts}));
          }
        } catch (e) {}
      }
      function renderClassFilters(items, filtered) {
        var box = document.getElementById('clFilterBar');
        if (!box) return;
        var filters = [
          ['all', tr('ev_all', 'Todos')],
          ['never', tr('ev_never_access', 'Nunca acessou o Moodle')],
          ['engaged', tr('cl_filter_engaged', 'Com engajamento')],
          ['interactions', tr('with_course_activity', 'Com Interações')],
          ['followup', tr('attention', 'Em acompanhamento')],
          ['below60', tr('cl_filter_below_60_percent', 'Aproveitamento parcial abaixo de 60%')],
          ['low', tr('ev_low_part', 'Em início de percurso')],
          ['medium', tr('ev_med_part', 'Em progressão')],
          ['high', tr('ev_high_part', 'Alta participação')]
        ];
        Store.renderHtml(box, filters.map(function (f) {
            return '<option value="' + f[0] + '"' + (CL_FILTER === f[0] ? ' selected' : '') + '>' + esc(f[1]) + '</option>';
          }).join(''));
      }

      function renderClassPagination(totalItems) {
        var box = document.getElementById('clPagination');
        if (!box) return;
        if (!totalItems) {
          Store.renderHtml(box, '');
          return;
        }
        var totalPages = Math.max(1, Math.ceil(totalItems / CL_PAGE_SIZE));
        CL_PAGE = Math.max(1, Math.min(CL_PAGE, totalPages));
        var first = ((CL_PAGE - 1) * CL_PAGE_SIZE) + 1;
        var last = Math.min(totalItems, CL_PAGE * CL_PAGE_SIZE);
        var startPage = Math.max(1, CL_PAGE - 2);
        var endPage = Math.min(totalPages, startPage + 4);
        if (endPage - startPage < 4) startPage = Math.max(1, endPage - 4);
        function pageButton(page, label, disabled, active) {
          return '<button type="button" class="cl-page-btn' + (active ? ' active' : '') + (disabled ? ' disabled' : '') + '"'
            + (disabled ? ' disabled' : '') + ' onclick="window.MWAClassList.goPage(' + page + ')">' + label + '</button>';
        }
        var buttons = pageButton(CL_PAGE - 1, '&#8249;', CL_PAGE <= 1, false);
        for (var page = startPage; page <= endPage; page++) {
          buttons += pageButton(page, String(page), false, page === CL_PAGE);
        }
        buttons += pageButton(CL_PAGE + 1, '&#8250;', CL_PAGE >= totalPages, false);
        var sizes = [5, 10, 20, 50].map(function(size) {
          return '<option value="' + size + '"' + (size === CL_PAGE_SIZE ? ' selected' : '') + '>' + size + '</option>';
        }).join('');
        Store.renderHtml(box, '<div class="cl-pag-info">Mostrando ' + first + ' a ' + last + ' de ' + totalItems + ' estudantes</div>'
          + '<div class="cl-pag-pages">' + buttons + '</div>'
          + '<label class="cl-pag-size">Itens por página: <select onchange="window.MWAClassList.setPageSize(this.value)">' + sizes + '</select></label>');
      }

      function buildStudentDetail(item, activityProgressHtml, resourceProgressHtml, detailId) {
        var calc = item.calc || {};
        var currentGrade = calc.grade === null || calc.grade === undefined ? null : Number(calc.grade);
        if (currentGrade !== null && isNaN(currentGrade)) currentGrade = null;
        var gradeText = currentGrade === null ? '\u2014' : currentGrade.toLocaleString('pt-BR', {minimumFractionDigits: 1, maximumFractionDigits: 1});
        var gradeColor = currentGrade === null ? 'var(--muted)' : currentGrade >= 60 ? 'var(--green)' : 'var(--red)';
        var lastText = calc.last ? fmtDate(calc.last) : '—';
        var daysText = item.status.key === 'never' ? tr('ev_never_access', 'Nunca acessou o Moodle') : (calc.daysWithoutAccess || 0) + 'd';
        return '<div class="cl-detail-panel">'
          + '<div class="cl-detail-top">'
            + '<div class="cl-detail-main">'
              + '<strong>' + esc(item.name) + '</strong>'
              + '<span>' + esc(item.email || tr('no_email', 'Sem e-mail')) + ' &middot; ' + item.count + ' ' + esc(tr('interactions', 'interações')) + ' &middot; ' + esc(tr('ev_active_days', 'Dias ativos')) + ': ' + (calc.activeDays || 0) + '</span>'
              + '<div class="cl-detail-chips">' + (item.studyTags || '') + determinantHtml(item) + '</div>'
            + '</div>'
            + '<div class="cl-detail-top-actions">'
              + '<button class="btn-ghost cl-report-btn" type="button" onclick="window.MWATeacherFeedback&&window.MWATeacherFeedback.openIndividualReport(\'' + esc(item.name) + '\');event.stopPropagation()">' + icon('chart') + ' ' + esc(tr('tf_ir_open', 'Evolution report')) + '</button>'
              + '<button class="btn-ghost cl-detail-collapse" type="button" onclick="window.MWAClassList&&window.MWAClassList.toggleDetail(\'' + esc(detailId) + '\');event.stopPropagation()">' + esc(tr('int_collapse', 'Recolher')) + '</button>'
            + '</div>'
          + '</div>'
          + '<div class="cl-detail-grid">'
            + '<div><span>' + esc(tr('cl_th_days_without', 'Days without access')) + '</span><strong>' + esc(daysText) + '</strong></div>'
            + '<div><span>' + esc(tr('cl_th_last_access', 'Último acesso')) + '</span><strong>' + esc(lastText) + '</strong></div>'
            + '<div><span>' + esc(tr('interactions', 'Interações')) + '</span><strong>' + item.count + '</strong></div>'
            + '<div><span>' + esc(tr('ev_active_days', 'Dias ativos')) + '</span><strong>' + (calc.activeDays || 0) + '</strong></div>'
            + '<div><span>' + esc(tr('sp_kpi_grade', 'Nota atual')) + '</span><strong style="color:' + gradeColor + ';">' + esc(gradeText) + '</strong></div>'
          + '</div>'
          + '<div class="cl-detail-progress-grid">'
            + '<div><h4>' + esc(tr('cl_th_activity_progress', 'Progresso por atividade com nota')) + '</h4>' + activityProgressHtml + '</div>'
            + '<div><h4>' + esc(tr('cl_th_resource_progress', 'Progresso por conteúdo')) + '</h4>' + resourceProgressHtml + '</div>'
          + '</div>'
          + '<div class="ai-box cl-ai-box" id="clai' + esc(detailId) + '">'
            + '<div class="ai-box-title">&#10022; ' + esc(tr('ev_ai_title', 'Análise & Recomendação IA')) + '</div>'
            + '<div class="ai-loading"><div class="ai-dot"></div><div class="ai-dot"></div><div class="ai-dot"></div>'
            + '<span style="margin-left:.5rem;font-size:.78rem;color:var(--muted);">' + esc(tr('ev_ai_hint', 'Clique em "Gerar Recomendação IA" para analisar este aluno.')) + '</span></div>'
          + '</div>'
          + '<div class="cl-detail-actions">'
            + '<button class="btn-accent" type="button" onclick="window.MWAClassList&&window.MWAClassList.genAI(\'' + esc(detailId) + '\');event.stopPropagation()">&#10022; ' + esc(tr('ev_gen_ai', 'Gerar Recomendação IA')) + '</button>'
            + '<button class="btn-ghost" type="button" onclick="window.MWAInterventions&&window.MWAInterventions.quickMessage(\'' + esc(item.name) + '\',\'' + esc(item.email || '') + '\',' + (item.userid || 0) + ',\'\');event.stopPropagation()">' + icon('mail') + ' ' + esc(tr('message')) + '</button>'
          + '</div>'
        + '</div>';
      }
    
      /* ════════════════════════════════════════════
         RENDER PRINCIPAL
      ════════════════════════════════════════════ */
      function toggleClassListView() {
        CL_VIEW = CL_VIEW === 'participation' ? 'activities' : 'participation';
        var btn = document.getElementById('clToggleBtn');
        if (btn) {
          btn.textContent = CL_VIEW === 'activities'
            ? icon('chart') + ' ' + tr('cl_view_participation')
            : icon('clipboard') + ' ' + tr('cl_view_activities');
          btn.classList.toggle('active', CL_VIEW === 'activities');
        }
        renderClassListUnified();
      }
    
      /* ── Filtro de busca (cliente, sem re-render) ── */
      function renderClassListUnified() {
        var dash = window.MWADashboard || {};
        var state = dash.state || {};
        var logs = state.logs || [];
        var grades = state.grades || [];
        var allNames = getAllStudentNames(logs, grades, state.students || []);
        var tb = document.getElementById('clTableBody');
        if (!tb) return;
        if (!allNames.length) {
          CL_EXPORT_ITEMS = [];
          Store.renderHtml(tb, '<tr><td colspan="8" class="cl-empty">' + esc(tr('no_data')) + '</td></tr>');
          var emptyPagination = document.getElementById('clPagination');
          if (emptyPagination) Store.renderHtml(emptyPagination, '');
          return;
        }

        var sessionTimes = calcSessionTimes(logs);
        var activityLinks = (Store.getConfig().activitylinks || []);
        var resources = buildResourceCatalog(logs, activityLinks, grades);
        var sortMode = (document.getElementById('clSort') || {}).value || 'interactions';
        var entries = allNames.map(function (n) {
          var email = getEmailForStudent(n, logs, grades);
          var calc = EngagementCalc.calculateForStudent(n, email, logs, grades);
          var score = Math.round(calc.score || 0);
          var matchedStudent = (state.students || []).find(function (student) {
            var sameEmail = email && norm(student.email).toLowerCase() === norm(email).toLowerCase();
            var sameName = norm(student.name || student.fullname).toLowerCase() === norm(n).toLowerCase();
            return sameEmail || sameName;
          }) || null;
          var rosterStudent = matchedStudent || {};
          var calculatedDays = Number(calc.daysWithoutAccess);
          var daysWithoutAccess = isNaN(calculatedDays)
            ? Number(rosterStudent.daysWithoutAccess || 0)
            : calculatedDays;
          var confirmedNever = matchedStudent
            ? Number(rosterStudent.moodleLastAccess || 0) === 0 && !rosterStudent.last &&
              Number(rosterStudent.interactions || 0) === 0
            : Number(calc.interactions || 0) === 0 && !calc.last;
          var item = {
            name: n,
            email: email,
            userid: getUserIdForStudent(n, email, state.students || [], logs),
            count: calc.interactions || 0,
            calc: calc,
            score: score,
            gradeRow: rosterStudent.gradeRow || null,
            daysWithoutAccess: daysWithoutAccess,
            enrolmentCreated: Number(rosterStudent.enrolmentCreated || 0),
            hasCourseActivity: Number(calc.interactions || rosterStudent.interactions || 0) > 0 ||
              !!rosterStudent.hasAcademicEvidence,
            confirmedNever: confirmedNever,
            studyTags: ''
          };
          item.status = statusInfo(score, item.confirmedNever);
          item.hasOverdue = hasOverdueDelivery(item, grades);
          item.hasOpenPending = hasOpenPendingActivity(item, grades);
          item.followupReasons = followUpReasons(item, grades);
          item.followup = item.followupReasons.length > 0;
          item.below60 = !item.confirmedNever && totalGradeBelowCourseThreshold(item);
          item.studyTags = buildStudyTags(n, logs, item);
          return item;
        });

        renderClassKpis(entries);
        var term = (CL_SEARCH || '').toLowerCase().trim();
        var filtered = entries.filter(function (e) {
          var statusMatch = CL_FILTER === 'all' ||
            (CL_FILTER === 'engaged' ? e.score > 0 :
              CL_FILTER === 'interactions' ? e.hasCourseActivity :
                CL_FILTER === 'followup' ? e.followup :
                  CL_FILTER === 'below60' ? e.below60 :
                  CL_FILTER === e.status.key);
          var searchMatch = !term || e.name.toLowerCase().indexOf(term) !== -1 || (e.email || '').toLowerCase().indexOf(term) !== -1;
          return statusMatch && searchMatch;
        });
        renderClassFilters(entries, filtered);

        filtered.sort(function (a, b) {
          switch (sortMode) {
            case 'alpha':
              return a.name.localeCompare(b.name, 'pt-BR');
            case 'risk':
              return a.score - b.score || a.name.localeCompare(b.name, 'pt-BR');
            case 'participation':
              return b.score - a.score;
            case 'time':
              return (sessionTimes[b.name] || 0) - (sessionTimes[a.name] || 0);
            default:
              return b.count - a.count;
          }
        });

        CL_EXPORT_ITEMS = filtered.slice();
        CL_EXPORT_SESSION_TIMES = sessionTimes;
        CL_EXPORT_GRADES = grades;
        CL_EXPORT_RESOURCES = resources;

        var totalFiltered = filtered.length;
        var totalPages = Math.max(1, Math.ceil(totalFiltered / CL_PAGE_SIZE));
        CL_PAGE = Math.max(1, Math.min(CL_PAGE, totalPages));
        var pageStart = (CL_PAGE - 1) * CL_PAGE_SIZE;
        var visibleEntries = filtered.slice(pageStart, pageStart + CL_PAGE_SIZE);

        CL_DETAIL_ITEMS = {};
        var html = visibleEntries.map(function (e, idx) {
          var n = e.name;
          var email = e.email;
          var picture = getPictureForStudent(n, email, logs, grades);
          var ms = sessionTimes[n] || 0;
          var tc = timeColor(ms);
          var detailId = 'cld' + idx + '_' + Math.abs(n.split('').reduce(function (a, c) { return a + c.charCodeAt(0); }, 0));
          var initials = n.split(/\s+/).filter(Boolean).slice(0, 2).map(function (w) { return w[0]; }).join('').toUpperCase();
          var ci = Math.abs((n.charCodeAt(0) || 0) + (n.charCodeAt(1) || 0)) % AV_COLORS.length;
          var avatarBg = AV_COLORS[ci];
          var activityProgressHtml = buildActDots(n, grades);
          var resourceProgressHtml = buildResourceDots(n, resources);
          var presence = presenceInfo(e.calc && e.calc.last);
          var currentGrade = e.calc && e.calc.grade !== null && e.calc.grade !== undefined
            ? Number(e.calc.grade) : null;
          if (currentGrade !== null && isNaN(currentGrade)) currentGrade = null;
          var gradeText = currentGrade === null ? '\u2014' : currentGrade.toLocaleString('pt-BR', {
            minimumFractionDigits: 1,
            maximumFractionDigits: 1
          });
          var gradeTone = currentGrade === null ? 'empty' : (hasTotalGradeAtOrAboveThreshold(e) ? 'approved' : 'below');
          CL_DETAIL_ITEMS[detailId] = e;
          var circ = 2 * Math.PI * 26;
          var ringDash = Math.round((e.score / 100) * circ);
          var participationHtml = '<div class="cl-score-ring cl-score-ring-summary" style="--score-color:' + esc(e.status.color) + ';">'
            + '<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="26"></circle><circle class="fg" cx="32" cy="32" r="26" stroke-dasharray="' + ringDash + ' ' + circ + '"></circle></svg>'
            + '<span>' + e.score + '%</span>'
            + '</div>';
          var statusHtml = '<div class="cl-status-stack">'
            + '<span class="cl-part-chip ' + e.status.cls + '">' + esc(e.status.label) + '</span>'
            + (e.followup ? '<span class="cl-part-chip followup">' + esc(tr('attention', 'Em acompanhamento')) + '</span>' : '')
            + followUpReasonHtml(e.followupReasons)
            + '</div>';

          return '<tr class="cl-student-summary-row" data-student="' + esc(n) + '" onclick="window.MWAClassList&&window.MWAClassList.toggleDetail(\'' + esc(detailId) + '\')">'
            + '<td style="width:10%;text-align:center;padding:4px 6px;">' + participationHtml + '</td>'
            + '<td style="width:16%;">'
              + '<div class="cl-student-cell">'
                + '<div class="cl-avatar' + (picture ? ' has-img' : '') + '" style="background:' + avatarBg + ';">' + (picture ? '<img src="' + esc(picture) + '" alt="' + esc(n) + '" loading="lazy">' : esc(initials)) + '</div>'
                + '<div style="min-width:0;flex:1;overflow:hidden;">'
                  + '<span class="cl-student-name">' + esc(n) + '</span>'
                  + '<div class="cl-student-email">' + esc(email || tr('no_email', 'Sem e-mail')) + '</div>'
                  + '<span class="mwa-presence ' + presence.tone + '"><i aria-hidden="true"></i>' + esc(presence.label) + '</span>'
                + '</div>'
              + '</div>'
            + '</td>'
            + '<td class="cl-status-cell" style="width:14%;">' + statusHtml + '</td>'
            + '<td style="width:18%;">' + activityProgressHtml + '</td>'
            + '<td style="width:18%;">' + resourceProgressHtml + '</td>'
            + '<td style="width:7%;text-align:center;"><span class="cl-grade ' + gradeTone + '">' + esc(gradeText) + '</span></td>'
            + '<td style="width:10%;text-align:center;"><span class="cl-time" style="color:' + tc + ';">' + fmtTime(ms) + '</span></td>'
            + '<td style="width:5%;padding-right:.75rem;text-align:center;"><span class="cl-row-caret">&#8964;</span></td>'
          + '</tr>'
          + '<tr class="cl-student-detail-row" id="' + esc(detailId) + '" style="display:none;" data-student="' + esc(n) + '"><td colspan="8">' + buildStudentDetail(e, activityProgressHtml, resourceProgressHtml, detailId) + '</td></tr>';
        }).join('');

        Store.renderHtml(tb, html || '<tr><td colspan="8" class="cl-empty">' + esc(tr('no_data')) + '</td></tr>');
        renderClassPagination(totalFiltered);
        var cnt = document.getElementById('clCount');
        if (cnt) {
          var labelMap = {
            all: tr('ev_all', 'Todos'),
            engaged: tr('cl_filter_engaged', 'Com engajamento'),
            interactions: tr('with_course_activity', 'Com interações'),
            followup: tr('attention', 'Em acompanhamento'),
            below60: tr('cl_filter_below_60_percent', 'Aproveitamento parcial abaixo de 60%'),
            never: tr('ev_never_access', 'Nunca acessou o Moodle'),
            low: tr('ev_low_part', 'Baixa participação'),
            medium: tr('ev_med_part', 'Em progressão'),
            high: tr('ev_high_part', 'Alta participação')
          };
          cnt.textContent = filtered.length + ' ' + tr('students', 'estudantes') + ' · ' + (labelMap[CL_FILTER] || labelMap.all);
        }
        document.querySelectorAll('#clKpiRow [data-cl-filter]').forEach(function (btn) {
          btn.addEventListener('click', function () {
            CL_FILTER = btn.getAttribute('data-cl-filter') || 'all';
            CL_PAGE = 1;
            renderClassListUnified();
          });
        });
      }

      function filterClassListUnified(q) {
        CL_SEARCH = q || '';
        CL_PAGE = 1;
        renderClassListUnified();
      }

      function setClassListFilter(filter, search) {
        CL_FILTER = filter || 'all';
        CL_SEARCH = search || '';
        CL_PAGE = 1;
        var input = document.getElementById('clSearch');
        if (input) input.value = CL_SEARCH;
        renderClassListUnified();
      }

      function goToClassPage(page) {
        CL_PAGE = Math.max(1, parseInt(page, 10) || 1);
        renderClassListUnified();
      }

      function setClassPageSize(size) {
        CL_PAGE_SIZE = [5, 10, 20, 50].indexOf(Number(size)) >= 0 ? Number(size) : 10;
        CL_PAGE = 1;
        renderClassListUnified();
      }

      function toggleDetail(id) {
        var row = document.getElementById(id);
        if (!row) return;
        row.style.display = row.style.display === 'none' ? '' : 'none';
      }

      function openStudent(name) {
        var wanted = norm(name).toLowerCase();
        if (!wanted) return;
        CL_FILTER = 'all';
        CL_SEARCH = name || '';
        var search = document.getElementById('clSearch');
        if (search) search.value = name || '';
        renderClassListUnified();
        setTimeout(function () {
          var rows = document.querySelectorAll('#clTableBody tr.cl-student-summary-row');
          var target = null;
          rows.forEach(function (row) {
            var n = norm(row.getAttribute('data-student')).toLowerCase();
            if (!target && n === wanted) target = row;
          });
          if (!target) return;
          var detail = target.nextElementSibling;
          if (detail && detail.classList.contains('cl-student-detail-row')) {
            document.querySelectorAll('#clTableBody tr.cl-student-detail-row').forEach(function (row) {
              row.style.display = 'none';
            });
            detail.style.display = '';
          }
          target.scrollIntoView({behavior: 'smooth', block: 'center'});
        }, 80);
      }

      function genAIClassList(id) {
        var item = CL_DETAIL_ITEMS[id];
        var box = document.getElementById('clai' + id);
        var cfg = Store.getConfig ? Store.getConfig() : {};
        var courseid = parseInt(cfg.courseid || 0, 10);
        var calc;
        var prompt;
        if (!item || !box) return;
        if (!cfg.ia_enabled) {
          Store.renderHtml(box,
            '<div class="ai-box-title">&#10022; ' + esc(tr('ev_ai_title', 'Análise & Recomendação IA')) + '</div>'
            + '<div class="ai-box-text">' + esc(tr('ai_unavailable_message', '🔒 Os recursos de Inteligência Artificial estão indisponíveis. Configure uma chave de API válida na administração do MWA.')) + '</div>'
          );
          return;
        }
        calc = item.calc || {};
        Store.renderHtml(box,
          '<div class="ai-box-title">&#10022; ' + esc(tr('ev_ai_title', 'Análise & Recomendação IA')) + '</div>'
          + '<div class="ai-loading"><div class="ai-dot"></div><div class="ai-dot"></div><div class="ai-dot"></div>'
          + '<span style="margin-left:.5rem;font-size:.78rem;color:var(--muted);">' + esc(tr('loading', 'Carregando...')) + '</span></div>'
        );
        prompt = [
          'Analise este aluno usando apenas os dados do painel da turma.',
          'Escreva em portugues, com orientacao pratica para o professor.',
          'Aluno: ' + item.name,
          'Participacao: ' + item.score + '% (' + item.status.label + ')',
          'Interacoes: ' + item.count,
          'Dias ativos: ' + (calc.activeDays || 0),
          'Ultimo acesso: ' + (calc.last ? fmtDate(calc.last) : '-'),
          'Dias sem acesso: ' + (calc.daysWithoutAccess || 0),
          'Atividades concluidas: ' + Math.round(calc.completion || 0) + '%',
          'Cobertura de conteudo: ' + Math.round(calc.coverage || 0) + '%',
          'Notas lancadas: ' + (calc.gradeLaunched || 0) + ' de ' + (calc.gradeItems || 0),
          'Responda com: 1) diagnostico curto, 2) acao recomendada, 3) mensagem sugerida ao aluno.'
        ].join('\n');
        Store.callAction('block_mwa_dashboard_get_ai_recommendation', {
          courseid: courseid,
          student_name: item.name,
          prompt: prompt
        }).then(function (res) {
          var text = (res && (res.recommendation || res.response || res.content)) || '';
          if (!text) throw new Error(tr('err_ajax_bridge', 'Resposta vazia'));
          text = text
            .replace(/^#{1,6}\s*/gm, '')
            .replace(/\*\*(.+?)\*\*/g, '$1')
            .replace(/^\s*[-*]\s+/gm, '')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
          text = esc(text).replace(/\n/g, '<br>');
          Store.renderHtml(box,
            '<div class="ai-box-title">&#10022; ' + esc(tr('ev_ai_title', 'Análise & Recomendação IA')) + '</div>'
            + '<div class="ai-box-text">' + text + '</div>'
          );
        }).catch(function () {
          Store.renderHtml(box,
            '<div class="ai-box-title">&#10022; ' + esc(tr('ev_ai_title', 'Análise & Recomendação IA')) + '</div>'
            + '<div class="ai-box-text">' + esc(tr('ev_ai_conn_error', 'Não foi possível gerar a recomendação agora.')) + '</div>'
          );
        });
      }
    
      /* Public API */
      window.MWAClassList = {
        render: renderClassListUnified,
        toggle: toggleClassListView,
        filter: filterClassListUnified,
        setFilter: setClassListFilter,
        goPage: goToClassPage,
        setPageSize: setClassPageSize,
        toggleDetail: toggleDetail,
        openStudent: openStudent,
        genAI: genAIClassList,
        exportSpreadsheet: exportClassSpreadsheet
      };
    
    })();

    return window.MWAClassList;
});
