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

      function deltaChip(cur, prv, invertColors) {
        if (prv === null || prv === undefined || cur === null || cur === undefined) {
          return '';
        }
        var d = Number(cur) - Number(prv);
        var pos = invertColors ? d < 0 : d > 0;
        var color = d === 0 ? '#8a94a8' : pos ? '#13794c' : '#b42318';
        var bg = d === 0 ? '#f0f2f7' : pos ? '#e8f7ef' : '#fdecec';
        var label = d === 0 ? '0' : (d > 0 ? '+' + d : String(d));
        return '<span style="background:' + bg + ';color:' + color + ';font-size:.65rem;font-weight:800;padding:2px 7px;border-radius:99px;">' + label + '</span>';
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
    
      function getDaysAgo(date) {
        if (!date) return 999;
        var d = Math.floor((Date.now() - date.getTime()) / 86400000);
        return d < 0 ? 0 : d;
      }
    
      function fmtDate(d) {
        if (!d) return '—';
        var dd = String(d.getDate()).padStart(2, '0');
        var mm = String(d.getMonth() + 1).padStart(2, '0');
        return dd + '/' + mm + '/' + d.getFullYear();
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
    
      /* ── cor por dias sem acesso ── */
      function agoColor(ago) {
        if (ago === 0) return 'var(--green)';
        if (ago <= 2)  return 'var(--teal)';
        if (ago <= 6)  return 'var(--amber)';
        return 'var(--red)';
      }
    
      /* ── participation bar colour ── */
      function partColor(pct) {
        if (pct >= 70) return 'var(--green)';
        if (pct >= 40) return 'var(--blue)';
        return 'var(--muted)';
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
    
      function isSubmission(log) {
        var ev   = norm(log.nomedoevento).toLowerCase();
        var comp = norm(log.componente).toLowerCase();
        // Tarefa: submission submitted ou file uploaded (translate_action output)
        if (comp === 'assignment' || comp === 'tarefa') {
          return ev === 'submission submitted' || ev === 'file uploaded' ||
                 ev.includes('submit') || ev.includes('upload');
        }
        // Quiz
        if (comp === 'quiz' || comp === 'h5p' || comp === 'scorm package') {
          return ev === 'quiz attempt submitted' || ev.includes('attempt submitted');
        }
        // Forum
        if (comp === 'forum' || comp === 'fórum') {
          return ev === 'forum post created' || ev === 'discussion created' ||
                 ev.includes('post_created') || ev.includes('subscription_created') ||
                 ev.includes('post created') || ev.includes('discussion created') ||
                 ev.includes('subscription created');
        }
        return false;
      }
    
      /* ── calculate participation score ── */
      function calcParticipation(name, logs, grades) {
        var email = getEmailForStudent(name, logs || [], grades || []);
        return EngagementCalc.calculateForStudent(name, email, logs || [], grades || []).score;
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
        if (meta) {
          Object.keys(meta).forEach(function (k) {
            var m = k.match(/^act_(\d+)$/);
            if (m) {
              actNames[Number(m[1])] = norm(meta[k]);
              actCmids[Number(m[1])] = Number(meta['act_cmid_' + m[1]] || 0);
              actModules[Number(m[1])] = norm(meta['act_module_' + m[1]] || '');
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
        var seqs      = Object.keys(actNames).length
          ? Object.keys(actNames).sort(function (a, b) { return Number(a) - Number(b); })
          : Object.keys(actGrades).sort(function (a, b) { return Number(a) - Number(b); });

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
          var missing = hasCurrentState
            ? (isForum ? currentCount <= 0 : currentCount <= 0 && !hasGradeValue)
            : val === null || val === undefined || val === '-' || val === '' || (!isNaN(num) && num === 0);
          var cls = done ? 'done' : missing ? 'missing' : 'pending';
          var actName = actNames[Number(seq)] || ('Atividade ' + seq);
          var tooltip = esc(actName) + (hasCurrentState && modname === 'forum'
            ? ' (' + currentCount + ' post' + (currentCount === 1 ? '' : 's') + ')'
            : (done && hasGradeValue ? ' (' + num.toFixed(1) + ' pts)' : done ? ' (concluida)' : missing ? ' (-)' : ''));
          var cmid = actCmids[Number(seq)] || 0;
          var url = (cmid && modname && wwwroot)
            ? wwwroot + '/mod/' + modname + '/view.php?id=' + cmid
            : '';
          var inner = url
            ? '<a href="' + url + '" target="_blank" style="color:inherit;text-decoration:none;">' + seq + '</a>'
            : String(seq);
          return '<span class="cl-act-dot ' + cls + '" title="' + tooltip + '">' + inner + '</span>';
        }).join('') + '</div>';
      }

      function moduleOf(log) {
        var mod = norm(log._modtype || log.modtype || log.module || '').toLowerCase();
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

      function buildResourceCatalog(logs) {
        var map = {};
        (logs || []).forEach(function (log) {
          if (!isResourceModule(log)) return;
          var name = realContextName(log);
          if (!name) return;
          var cmid = cmidOf(log);
          var mod = moduleOf(log);
          var key = cmid ? 'cmid:' + cmid : 'name:' + name.toLowerCase();
          if (!map[key]) {
            map[key] = {key: key, name: name, cmid: cmid, mod: mod, url: directResourceUrl(log), students: {}};
          } else if (!map[key].url) {
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
            return '<a class="cl-act-dot ' + cls + '" href="' + esc(url) + '" target="_blank" rel="noopener" title="' + tooltip + '">' + number + '</a>';
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

      function statusInfo(score) {
        if (score === 0) {
          return {key: 'never', cls: 'never', color: '#8b72d4', label: tr('ev_never_access', 'Nunca acessou o Moodle')};
        }
        if (score >= 70) {
          return {key: 'high', cls: 'high', color: '#3aab7a', label: tr('ev_high_part', 'Alta participação')};
        }
        if (score > 40) {
          return {key: 'medium', cls: 'medium', color: '#5b9bd5', label: tr('ev_med_part', 'Participação média')};
        }
        return {key: 'low', cls: 'low', color: '#d95f5f', label: tr('ev_low_part', 'Baixa participação')};
      }

      function detChip(icon, label, tone) {
        return '<span class="cl-det-chip ' + esc(tone || 'slate') + '"><span>' + icon + '</span>' + esc(label) + '</span>';
      }

      function determinantHtml(item) {
        var calc = item.calc || {};
        var chips = [];
        if (item.score === 0) {
          chips.push(detChip('&#128683;', tr('ev_never_access', 'Nunca acessou o Moodle'), 'red'));
          chips.push(detChip('&#9888;', tr('ev_det_at_risk', 'Em risco'), 'red'));
          chips.push(detChip('&#9201;', tr('ev_det_no_access_recorded', 'Sem acesso registrado'), 'red'));
          return chips.join('');
        }
        if (item.score <= 40) {
          chips.push(detChip('&#9889;', tr('ev_det_rhythm_irregular', 'Ritmo irregular'), 'amber'));
          chips.push(detChip('&#128308;', tr('ev_low_part', 'Baixa participação'), 'red'));
        } else if (item.score < 70) {
          chips.push(detChip('&#9989;', tr('ev_det_rhythm_good', 'Ritmo bom'), 'blue'));
          chips.push(detChip('&#128309;', tr('ev_med_part', 'Participação média'), 'blue'));
        } else {
          chips.push(detChip('&#9989;', tr('ev_det_rhythm_constant', 'Ritmo constante'), 'green'));
          chips.push(detChip('&#128994;', tr('ev_det_high_engagement', 'Alto engajamento'), 'green'));
        }
        if (calc.daysWithoutAccess > 7 && calc.daysWithoutAccess < 99999) {
          chips.push(detChip('&#9201;', calc.daysWithoutAccess + ' ' + tr('ev_reason_days_no_access', 'dias sem acesso'), calc.daysWithoutAccess > 14 ? 'red' : 'amber'));
        }
        if (calc.interactions > 0 && calc.interactions < 3) {
          chips.push(detChip('&#9889;', tr('ev_det_low_activity', 'Poucas interações'), 'amber'));
        }
        if ((calc.gradeItems > 0 && calc.gradeLaunched < calc.gradeItems) || calc.completion < 100) {
          chips.push(detChip('&#128221;', tr('ev_det_pending_activities', 'Atividades pendentes'), 'red'));
        }
        if (calc.gradeItems > 0 && calc.gradeLaunched < calc.gradeItems) {
          chips.push(detChip('&#128202;', tr('ev_det_pending_grades', 'Notas pendentes'), 'amber'));
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
        return tagChip('&#9728;', tr('pl_tag_daytime', 'Diurno'), 'diurno');
      }

      function renderClassKpis(items) {
        var box = document.getElementById('clKpiRow');
        if (!box) return;
        var counts = {never: 0, low: 0, medium: 0, high: 0};
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
          counts[statusInfo(item.score).key]++;
        });
        var cards = [
          ['never', '&#128683;', tr('ev_never_access', 'Nunca acessou o Moodle'), counts.never, 'never', tr('cl_kpi_tip_never', 'Alunos com 0% de participação, sem acesso registrado no Moodle.'), true],
          ['low', '&#128308;', tr('ev_low_part', 'Baixa participação'), counts.low, 'low', tr('cl_kpi_tip_low', 'Alunos com participação de 1% a 40% no curso.'), true],
          ['medium', '&#128309;', tr('ev_med_part', 'Participação média'), counts.medium, 'medium', tr('cl_kpi_tip_medium', 'Alunos com participação de 41% a 69% no curso.'), false],
          ['high', '&#128994;', tr('ev_high_part', 'Alta participação'), counts.high, 'high', tr('cl_kpi_tip_high', 'Alunos com participação igual ou superior a 70% no curso.'), false]
        ];
        /* First visit for this course: compare against an empty class, so each
           card reports its starting population (e.g. 1 student in "high" -> +1).
           From the next day on, the stored snapshot provides the real baseline. */
        var previousCounts = savedTrend || {never: 0, low: 0, medium: 0, high: 0};
        Store.renderHtml(box, cards.map(function (c) {
          var pct = Math.round((c[3] / total) * 100);
          var chip = classKpiDeltaChip(c[0], counts[c[0]], previousCounts[c[0]], c[6]);
          return '<button type="button" class="cl-kpi-card ' + c[4] + '" data-cl-filter="' + c[0] + '">'
            + '<span class="cl-kpi-trend-wrap">' + chip + '</span>'
            + '<span class="cl-kpi-title">' + c[1] + ' ' + esc(c[2]) + helpTip(c[5]) + '</span>'
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
          ['low', tr('ev_low_part', 'Baixa participação')],
          ['medium', tr('ev_med_part', 'Participação média')],
          ['high', tr('ev_high_part', 'Alta participação')]
        ];
        Store.renderHtml(box, filters.map(function (f) {
            return '<button type="button" class="cl-filter-btn ' + (CL_FILTER === f[0] ? 'active' : '') + '" data-cl-filter="' + f[0] + '">' + esc(f[1]) + '</button>';
          }).join(''));
      }

      function buildStudentDetail(item, activityProgressHtml, resourceProgressHtml, detailId) {
        var calc = item.calc || {};
        var circ = 2 * Math.PI * 26;
        var dash = Math.round((item.score / 100) * circ);
        var lastText = calc.last ? fmtDate(calc.last) : '—';
        var daysText = item.score === 0 ? tr('ev_never_access', 'Nunca acessou o Moodle') : (calc.daysWithoutAccess || 0) + 'd';
        return '<div class="cl-detail-panel">'
          + '<div class="cl-detail-top">'
            + '<div class="cl-score-ring" style="--score-color:' + esc(item.status.color) + ';">'
              + '<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="26"></circle><circle class="fg" cx="32" cy="32" r="26" stroke-dasharray="' + dash + ' ' + circ + '"></circle></svg>'
              + '<span>' + item.score + '%</span>'
            + '</div>'
            + '<div class="cl-detail-main">'
              + '<strong>' + esc(item.name) + '</strong>'
              + '<span>' + esc(item.email || tr('no_email', 'Sem e-mail')) + ' &middot; ' + item.count + ' ' + esc(tr('interactions', 'interações')) + ' &middot; ' + esc(tr('ev_active_days', 'Dias ativos')) + ': ' + (calc.activeDays || 0) + '</span>'
              + '<div class="cl-detail-chips">' + determinantHtml(item) + '</div>'
              + '<div class="cl-study-tags">' + (item.studyTags || '') + '</div>'
            + '</div>'
          + '</div>'
          + '<div class="cl-detail-grid">'
            + '<div><span>' + esc(tr('cl_th_days_without', 'Days without access')) + '</span><strong>' + esc(daysText) + '</strong></div>'
            + '<div><span>' + esc(tr('cl_th_last_access', 'Último acesso')) + '</span><strong>' + esc(lastText) + '</strong></div>'
            + '<div><span>' + esc(tr('interactions', 'Interações')) + '</span><strong>' + item.count + '</strong></div>'
            + '<div><span>' + esc(tr('ev_active_days', 'Dias ativos')) + '</span><strong>' + (calc.activeDays || 0) + '</strong></div>'
          + '</div>'
          + '<div class="cl-detail-progress-grid">'
            + '<div><h4>' + esc(tr('cl_th_activity_progress', 'Progresso por atividade')) + '</h4>' + activityProgressHtml + '</div>'
            + '<div><h4>' + esc(tr('cl_th_resource_progress', 'Progresso por conteúdo')) + '</h4>' + resourceProgressHtml + '</div>'
          + '</div>'
          + '<div class="ai-box cl-ai-box" id="clai' + esc(detailId) + '">'
            + '<div class="ai-box-title">&#10022; ' + esc(tr('ev_ai_title', 'Análise & Recomendação IA')) + '</div>'
            + '<div class="ai-loading"><div class="ai-dot"></div><div class="ai-dot"></div><div class="ai-dot"></div>'
            + '<span style="margin-left:.5rem;font-size:.78rem;color:var(--muted);">' + esc(tr('ev_ai_hint', 'Clique em "Gerar Recomendação IA" para analisar este aluno.')) + '</span></div>'
          + '</div>'
          + '<div class="cl-detail-actions">'
            + '<button class="btn-accent" type="button" onclick="window.MWAClassList&&window.MWAClassList.genAI(\'' + esc(detailId) + '\');event.stopPropagation()">&#10022; ' + esc(tr('ev_gen_ai', 'Gerar Recomendação IA')) + '</button>'
            + '<button class="btn-ghost" type="button" onclick="window.MWAInterventions&&window.MWAInterventions.quickMessage(\'' + esc(item.name) + '\',\'' + esc(item.email || '') + '\',' + (item.userid || 0) + ',\'\');event.stopPropagation()">&#9993; ' + esc(tr('message', 'Mensagem')) + '</button>'
          + '</div>'
        + '</div>';
      }
    
      /* ════════════════════════════════════════════
         RENDER PRINCIPAL
      ════════════════════════════════════════════ */
      function renderClassList() {
        var dash  = window.MWADashboard || {};
        var state = dash.state || {};
        var logs   = state.logs   || [];
        var grades = state.grades || [];
    
        if (!logs.length) {
          var tb = document.getElementById('clTableBody');
          if (tb) Store.renderHtml(tb, '<tr><td colspan="7" class="cl-empty">' + esc(tr('no_data')) + '</td></tr>');
          return;
        }
    
        var lastAccess   = getLastAccess(logs);
        var sessionTimes = calcSessionTimes(logs);
        var resources = buildResourceCatalog(logs);
    
        // Group interactions by student
        var byName = {};
        logs.forEach(function (r) {
          var n = norm(r.nomecompleto);
          if (!n) return;
          byName[n] = (byName[n] || 0) + 1;
        });
    
        var sortMode = (document.getElementById('clSort') || {}).value || 'interactions';
    
        var entries = Object.keys(byName).map(function (n) {
          return { name: n, count: byName[n] };
        });
    
        // Sorting
        entries.sort(function (a, b) {
          switch (sortMode) {
            case 'alpha':
              return a.name.localeCompare(b.name, 'pt-BR');
            case 'ago':
              return getDaysAgo(lastAccess[b.name]) - getDaysAgo(lastAccess[a.name]);
            case 'participation':
              var getScore = function(name) {
                return calcParticipation(name, logs, grades);
              };
              return getScore(b.name) - getScore(a.name);
            case 'time':
              return (sessionTimes[b.name] || 0) - (sessionTimes[a.name] || 0);
            default:
              return b.count - a.count;
          }
        });
    
        // Gera linhas
        var html = entries.map(function (e) {
          var n    = e.name;
          var cnt  = e.count;
          var last = lastAccess[n];
          var ago  = getDaysAgo(last);
          var email = getEmailForStudent(n, logs);
          var picture = getPictureForStudent(n, email, logs, grades);
          var ms   = sessionTimes[n] || 0;
          var part = calcParticipation(n, logs, grades);
          var pc   = partColor(part);
          var tc   = timeColor(ms);
    
          // Avatar
          var initials = n.split(/\s+/).filter(Boolean).slice(0, 2).map(function (w) { return w[0]; }).join('').toUpperCase();
          var ci       = Math.abs((n.charCodeAt(0) || 0) + (n.charCodeAt(1) || 0)) % AV_COLORS.length;
          var avatarBg = AV_COLORS[ci];
    
          var participationHtml = '<div class="cl-part-wrap">'
              + '<div class="cl-part-bar-bg"><div class="cl-part-bar-fill" style="width:' + part + '%;background:' + pc + ';"></div></div>'
              + '<span class="cl-part-pct" style="color:' + pc + ';">' + part + '%</span>'
            + '</div>';
          var activityProgressHtml = buildActDots(n, grades);
          var resourceProgressHtml = buildResourceDots(n, resources);
    
          return '<tr data-student="' + esc(n) + '">'
            + '<td style="width:25%;">'
              + '<div class="cl-student-cell">'
                + '<div class="cl-avatar' + (picture ? ' has-img' : '') + '" style="background:' + avatarBg + ';">' + (picture ? '<img src="' + esc(picture) + '" alt="' + esc(n) + '" loading="lazy">' : esc(initials)) + '</div>'
                + '<div style="min-width:0;flex:1;overflow:hidden;">'
                  + '<button type="button" class="cl-student-name" data-profile-student="' + esc(n) + '">' + esc(n) + '</button>'
                  + '<div class="cl-student-email">' + esc(email || tr('no_email')) + '</div>'
                + '</div>'
              + '</div>'
            + '</td>'
            + '<td style="width:18%;">' + participationHtml + '</td>'
            + '<td style="width:15%;">' + activityProgressHtml + '</td>'
            + '<td style="width:15%;">' + resourceProgressHtml + '</td>'
            + '<td style="width:8%;text-align:center;">'
              + '<span class="cl-inter">' + cnt.toLocaleString('pt-BR') + '</span>'
            + '</td>'
            + '<td style="width:10%;text-align:center;">'
              + '<span class="cl-time" style="color:' + tc + ';">' + fmtTime(ms) + '</span>'
            + '</td>'
            + '<td style="width:5%;padding-right:.75rem;">'
              + '<div class="cl-btn-group">'
                + '<button class="cl-profile-btn" title="' + esc(tr('cl_open_profile')) + '" '
                + 'data-gname="' + esc(n) + '" onclick="window.MWAGrades&&window.MWAGrades.openProfile(this)">👤</button>'
                + '<button class="cl-profile-btn" title=""  data-i18n-attr="title:cl_send_msg_title" '
                + 'data-sname="' + esc(n) + '" data-semail="' + esc(email || '') + '" '
                + 'onclick="window.MWAInterventions&&window.MWAInterventions.openByEl(this)">✉️</button>'
              + '</div>'
            + '</td>'
            + '</tr>';
        }).join('');
    
        var tb = document.getElementById('clTableBody');
        if (tb) Store.renderHtml(tb, html || '<tr><td colspan="7" class="cl-empty">' + esc(tr('no_data')) + '</td></tr>');
    
        // Atualiza count
        var cnt = document.getElementById('clCount');
        if (cnt) cnt.textContent = entries.length + ' ' + tr('students');
      }
    
      /* ── Toggle participation ↔ activities ── */
      function toggleClassListView() {
        CL_VIEW = CL_VIEW === 'participation' ? 'activities' : 'participation';
        var btn = document.getElementById('clToggleBtn');
        if (btn) {
          btn.textContent = CL_VIEW === 'activities'
            ? '📊 ' + tr('cl_view_participation')
            : '📋 ' + tr('cl_view_activities');
          btn.classList.toggle('active', CL_VIEW === 'activities');
        }
        renderClassListUnified();
      }
    
      /* ── Filtro de busca (cliente, sem re-render) ── */
      function filterClassList(q) {
        var rows = document.querySelectorAll('#clTableBody tr');
        var term = (q || '').toLowerCase().trim();
        var visible = 0;
        rows.forEach(function (tr) {
          var name = (tr.dataset.student || '').toLowerCase();
          var show = !term || name.indexOf(term) !== -1;
          tr.style.display = show ? '' : 'none';
          if (show) visible++;
        });
        var cnt = document.getElementById('clCount');
        if (cnt) cnt.textContent = term
          ? visible + ' ' + tr('cl_result') + (visible !== 1 ? 's' : '')
          : (Object.keys({}).length || '') + ' ' + tr('students');
      }

      function renderClassListUnified() {
        var dash = window.MWADashboard || {};
        var state = dash.state || {};
        var logs = state.logs || [];
        var grades = state.grades || [];
        var allNames = getAllStudentNames(logs, grades, state.students || []);
        var tb = document.getElementById('clTableBody');
        if (!tb) return;
        if (!allNames.length) {
          Store.renderHtml(tb, '<tr><td colspan="7" class="cl-empty">' + esc(tr('no_data')) + '</td></tr>');
          return;
        }

        var sessionTimes = calcSessionTimes(logs);
        var resources = buildResourceCatalog(logs);
        var sortMode = (document.getElementById('clSort') || {}).value || 'interactions';
        var entries = allNames.map(function (n) {
          var email = getEmailForStudent(n, logs, grades);
          var calc = EngagementCalc.calculateForStudent(n, email, logs, grades);
          var score = Math.round(calc.score || 0);
          var item = {
            name: n,
            email: email,
            userid: getUserIdForStudent(n, email, state.students || [], logs),
            count: calc.interactions || 0,
            calc: calc,
            score: score,
            status: statusInfo(score),
            studyTags: ''
          };
          item.studyTags = buildStudyTags(n, logs, item);
          return item;
        });

        renderClassKpis(entries);
        var term = (CL_SEARCH || '').toLowerCase().trim();
        var filtered = entries.filter(function (e) {
          var statusMatch = CL_FILTER === 'all' || CL_FILTER === e.status.key;
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

        CL_DETAIL_ITEMS = {};
        var html = filtered.map(function (e, idx) {
          var n = e.name;
          var email = e.email;
          var picture = getPictureForStudent(n, email, logs, grades);
          var ms = sessionTimes[n] || 0;
          var pc = partColor(e.score);
          var tc = timeColor(ms);
          var detailId = 'cld' + idx + '_' + Math.abs(n.split('').reduce(function (a, c) { return a + c.charCodeAt(0); }, 0));
          var initials = n.split(/\s+/).filter(Boolean).slice(0, 2).map(function (w) { return w[0]; }).join('').toUpperCase();
          var ci = Math.abs((n.charCodeAt(0) || 0) + (n.charCodeAt(1) || 0)) % AV_COLORS.length;
          var avatarBg = AV_COLORS[ci];
          var activityProgressHtml = buildActDots(n, grades);
          var resourceProgressHtml = buildResourceDots(n, resources);
          CL_DETAIL_ITEMS[detailId] = e;
          var participationHtml = '<div class="cl-part-wrap">'
            + '<div class="cl-part-bar-bg"><div class="cl-part-bar-fill" style="width:' + e.score + '%;background:' + pc + ';"></div></div>'
            + '<span class="cl-part-pct" style="color:' + pc + ';">' + e.score + '%</span>'
            + '</div>';

          return '<tr class="cl-student-summary-row" data-student="' + esc(n) + '" onclick="window.MWAClassList&&window.MWAClassList.toggleDetail(\'' + esc(detailId) + '\')">'
            + '<td style="width:25%;">'
              + '<div class="cl-student-cell">'
                + '<div class="cl-avatar' + (picture ? ' has-img' : '') + '" style="background:' + avatarBg + ';">' + (picture ? '<img src="' + esc(picture) + '" alt="' + esc(n) + '" loading="lazy">' : esc(initials)) + '</div>'
                + '<div style="min-width:0;flex:1;overflow:hidden;">'
                  + '<div class="cl-name-line"><span class="cl-student-name">' + esc(n) + '</span>'
                  + '<span class="cl-part-chip ' + e.status.cls + '">' + esc(e.status.label) + '</span></div>'
                  + '<div class="cl-student-email">' + esc(email || tr('no_email', 'Sem e-mail')) + '</div>'
                + '</div>'
              + '</div>'
            + '</td>'
            + '<td style="width:18%;">' + participationHtml + '</td>'
            + '<td style="width:15%;">' + activityProgressHtml + '</td>'
            + '<td style="width:15%;">' + resourceProgressHtml + '</td>'
            + '<td style="width:8%;text-align:center;"><span class="cl-inter">' + e.count.toLocaleString('pt-BR') + '</span></td>'
            + '<td style="width:10%;text-align:center;"><span class="cl-time" style="color:' + tc + ';">' + fmtTime(ms) + '</span></td>'
            + '<td style="width:5%;padding-right:.75rem;text-align:center;"><span class="cl-row-caret">&#8964;</span></td>'
          + '</tr>'
          + '<tr class="cl-student-detail-row" id="' + esc(detailId) + '" style="display:none;" data-student="' + esc(n) + '"><td colspan="7">' + buildStudentDetail(e, activityProgressHtml, resourceProgressHtml, detailId) + '</td></tr>';
        }).join('');

        Store.renderHtml(tb, html || '<tr><td colspan="7" class="cl-empty">' + esc(tr('no_data')) + '</td></tr>');
        var cnt = document.getElementById('clCount');
        if (cnt) {
          var labelMap = {
            all: tr('ev_all', 'Todos'),
            never: tr('ev_never_access', 'Nunca acessou o Moodle'),
            low: tr('ev_low_part', 'Baixa participação'),
            medium: tr('ev_med_part', 'Participação média'),
            high: tr('ev_high_part', 'Alta participação')
          };
          cnt.textContent = filtered.length + ' ' + tr('students', 'estudantes') + ' · ' + (labelMap[CL_FILTER] || labelMap.all);
        }
        document.querySelectorAll('#clKpiRow [data-cl-filter], #clFilterBar [data-cl-filter]').forEach(function (btn) {
          btn.addEventListener('click', function () {
            CL_FILTER = btn.getAttribute('data-cl-filter') || 'all';
            renderClassListUnified();
          });
        });
      }

      function filterClassListUnified(q) {
        CL_SEARCH = q || '';
        renderClassListUnified();
      }

      function setClassListFilter(filter, search) {
        CL_FILTER = filter || 'all';
        CL_SEARCH = search || '';
        var input = document.getElementById('clSearch');
        if (input) input.value = CL_SEARCH;
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
          'Email: ' + (item.email || '-'),
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
        toggleDetail: toggleDetail,
        openStudent: openStudent,
        genAI: genAIClassList
      };
    
    })();

    return window.MWAClassList;
});

