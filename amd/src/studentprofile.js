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
 * @module     block_mwa_dashboard/studentprofile
 * @copyright  2026 Bruno Porto
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
define(['block_mwa_dashboard/dashboardstore', 'block_mwa_dashboard/engagementcalc', 'core/templates'], function(Store, EngagementCalc, Templates) {

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
      function norm(v) { return (v === undefined || v === null) ? '' : String(v).trim(); }
      function renderTemplate(node, template, context) {
        if (!node) return Promise.resolve(null);
        return Templates.render('block_mwa_dashboard/' + template, context || {}).then(function(html, js) {
          Templates.replaceNodeContents(node, html, js);
          return node;
        });
      }
    
      var NOTES    = window.MWA_TUTOR_NOTES    || (window.MWA_TUTOR_NOTES    = {});
      var CONTACTS = window.MWA_CONTACT_HIST   || (window.MWA_CONTACT_HIST   = {});
      var PENDING_PROFILE_STUDENT = '';
      var SP_SEARCH = '';
    
      var AV_COLORS = ['#5b9bd5','#8b72d4','#3aab7a','#c98a2a','#d95f5f','#2aafaa','#e07ba0'];
    
      function parseDate(log) {
        if (log._ts) return new Date(Number(log._ts) * 1000);
        var s = norm(log.hora);
        var m = s.match(/(\d{2})\/(\d{2})\/(\d{2}),\s*(\d{2}):(\d{2})/);
        if (m) return new Date(2000 + Number(m[3]), Number(m[2]) - 1, Number(m[1]), Number(m[4]), Number(m[5]));
        return null;
      }
      function getDaysAgo(date) {
        if (!date) return 999;
        return Math.max(0, Math.floor((Date.now() - date.getTime()) / 86400000));
      }
      function fmtDate(d) {
        if (!d) return '—';
        return String(d.getDate()).padStart(2,'0') + '/' + String(d.getMonth()+1).padStart(2,'0') + '/' + d.getFullYear();
      }
      function agoColor(ago) {
        if (ago === 0) return 'var(--green)';
        if (ago <= 2)  return 'var(--teal)';
        if (ago <= 6)  return 'var(--amber)';
        return 'var(--red)';
      }
    
      function engLabel(score) {
        if (score === 0) return { label: tr('ev_never_access', 'Nunca acessou o Moodle'), color: 'var(--red)', tone: 'low' };
        if (score >= 70) return { label: tr('high_participation'), color: 'var(--green)', tone: 'high' };
        if (score > 40) return { label: tr('average_participation'), color: 'var(--amber)', tone: 'medium' };
        return { label: tr('low_participation'), color: 'var(--red)', tone: 'low' };
      }
    
      function calcParticipation(name, logs, grades) {
        var email = '';
        (logs || []).some(function(r) {
          if (norm(r.nomecompleto) === name && norm(r.email)) {
            email = norm(r.email);
            return true;
          }
          return false;
        });
        return EngagementCalc.calculateForStudent(name, email, logs || [], grades || []).score;
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

      function getEmailForStudent(name, logs, grades, students) {
        var target = name.toLowerCase();
        var found = '';
        (students || []).some(function (s) {
          var n = norm(s.name || s.fullname || s.nomecompleto || s.student_name).toLowerCase();
          if (n === target) {
            found = norm(s.email || s.mail);
            return !!found;
          }
          return false;
        });
        if (found) return found;
        (logs || []).some(function (r) {
          var n = norm(r.nomecompleto || r.student_name || r.userfullname || r.fullname || r.name).toLowerCase();
          if (n === target) {
            found = norm(r.email);
            return !!found;
          }
          return false;
        });
        if (found) return found;
        (grades || []).some(function (g) {
          if (!g || g.__mwa_type__ === 'activity_names') return false;
          var gname = (norm(g['First name']) + ' ' + norm(g['Last name'])).trim().toLowerCase();
          if (gname === target) {
            found = norm(g.Email || g.email);
            return !!found;
          }
          return false;
        });
        return found;
      }

      function buildActivityProgress(name, grades) {
        var meta = grades && grades[0] && grades[0].__mwa_type__ === 'activity_names' ? grades[0] : null;
        if (!meta) return '<span class="cl-no-grades-hint">' + esc(tr('cl_no_activities_found')) + '</span>';
        var actNames = {};
        var actCmids = {};
        var actModules = {};
        Object.keys(meta).forEach(function (k) {
          var m = k.match(/^act_(\d+)$/);
          if (!m) return;
          actNames[Number(m[1])] = norm(meta[k]);
          actCmids[Number(m[1])] = Number(meta['act_cmid_' + m[1]] || 0);
          actModules[Number(m[1])] = norm(meta['act_module_' + m[1]] || '');
        });
        var rawRow = null;
        (grades || []).some(function (g) {
          if (!g || g.__mwa_type__ === 'activity_names') return false;
          var first = norm(g['First name'] || g.Nome || g.firstname || '');
          var last = norm(g['Last name'] || g.Sobrenome || g.lastname || '');
          var gname = norm(g.student_name || g.name || g.nomecompleto || g.Aluno || (first + ' ' + last));
          if (gname.toLowerCase() === name.toLowerCase()) {
            rawRow = g;
            return true;
          }
          return false;
        });
        var wwwroot = (Store.getConfig().wwwroot || '').replace(/\/$/, '');
        var seqs = Object.keys(actNames).sort(function (a, b) { return Number(a) - Number(b); });
        if (!seqs.length) return '<span class="cl-no-grades-hint">' + esc(tr('cl_no_activities_found')) + '</span>';
        return '<div class="cl-act-dots">' + seqs.map(function (seq) {
          var val = rawRow ? rawRow['act_' + seq] : null;
          var current = rawRow && Object.prototype.hasOwnProperty.call(rawRow, 'act_current_' + seq) ? Number(rawRow['act_current_' + seq] || 0) : null;
          var mod = String(actModules[Number(seq)] || '').toLowerCase();
          var num = (val === null || val === undefined) ? NaN : parseFloat(String(val).replace(',', '.'));
          var hasGrade = !isNaN(num) && num > 0;
          var done = current !== null ? (mod === 'forum' ? current > 0 : current > 0 || hasGrade) : hasGrade;
          var cls = done ? 'done' : 'missing';
          var actName = actNames[Number(seq)] || ('Atividade ' + seq);
          var cmid = actCmids[Number(seq)] || 0;
          var url = cmid && mod && wwwroot ? wwwroot + '/mod/' + encodeURIComponent(mod) + '/view.php?id=' + encodeURIComponent(String(cmid)) : '';
          var completedLabel = mod === 'forum' ? tr('act_label_posted_single') : tr('act_label_submitted_single');
          var title = esc(actName) + (done ? ' (' + esc(completedLabel) + ')' : ' (-)');
          if (url) return '<a class="cl-act-dot ' + cls + '" href="' + esc(url) + '" target="_blank" rel="noopener" title="' + title + '" onclick="event.stopPropagation()">' + esc(seq) + '</a>';
          return '<span class="cl-act-dot ' + cls + '" title="' + title + '">' + esc(seq) + '</span>';
        }).join('') + '</div>';
      }

      function moduleOf(log) {
        var mod = norm(log._modtype || log.modtype || log.module || log.modname || '').toLowerCase();
        var comp = norm(log.component || log.componente || '').toLowerCase();
        if (!mod && /^mod_/.test(comp)) mod = comp.replace(/^mod_/, '');
        if (mod === 'hvp') mod = 'h5pactivity';
        return mod;
      }

      function isCourseGeneral(v) {
        v = norm(v).toLowerCase();
        return !v || v === 'course module viewed' || v === 'módulo do curso visualizado' || v === 'course viewed' || v === 'curso visualizado';
      }

      function isResourceModule(log) {
        var mod = moduleOf(log);
        var comp = norm(log.component || log.componente || '').toLowerCase();
        if (mod === 'label' || comp.indexOf('area de midia e texto') >= 0 || comp.indexOf('área de mídia e texto') >= 0 || comp.indexOf('text and media area') >= 0) return false;
        return mod === 'page' || mod === 'book' || mod === 'url' || mod === 'resource' || mod === 'folder' || mod === 'imscp' ||
          comp === 'page' || comp === 'página' || comp === 'book' || comp === 'livro' || comp === 'url' || comp === 'arquivo' || comp === 'file';
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
        (activityLinks || []).forEach(function(link) {
          if (!link || link.tracked === false) return;
          var cmid = parseInt(link.cmid || 0, 10) || 0;
          if (!isResourceModule(link) && (!cmid || graded[cmid])) return;
          var name = norm(link.name || '');
          if (!name) return;
          var mod = moduleOf(link);
          var key = cmid ? 'cmid:' + cmid : 'name:' + name.toLowerCase();
          map[key] = {name: name, cmid: cmid, mod: mod, url: norm(link.url || ''), students: {}};
        });
        (logs || []).forEach(function (log) {
          var cmid = parseInt(log.cmid || log._cmid || log.contextinstanceid || log.contextinstance || log.coursemoduleid || log.moduleid || 0, 10) || 0;
          if (!cmid) return;
          var key = 'cmid:' + cmid;
          if (!map[key]) return;
          var mod = moduleOf(log);
          if (!map[key].mod && mod) map[key].mod = mod;
          if (!map[key].url) map[key].url = norm(log.url || log.contexturl || log.objecturl || log.link || log.viewurl || log._url || '');
          var student = norm(log.nomecompleto || log.student_name || log.userfullname || log.fullname || log.name);
          if (student) map[key].students[student.toLowerCase()] = 1;
        });
        return Object.keys(map).map(function (key) { return map[key]; }).sort(function (a, b) { return a.name.localeCompare(b.name, 'pt-BR'); });
      }

      function buildResourceProgress(name, logs, grades) {
        var config = Store.getConfig ? Store.getConfig() : {};
        var resources = buildResourceCatalog(logs, config.activitylinks || [], grades);
        if (!resources.length) return '<span class="cl-no-grades-hint">' + esc(tr('cl_no_resources_found')) + '</span>';
        var studentKey = name.toLowerCase();
        var wwwroot = (Store.getConfig().wwwroot || '').replace(/\/$/, '');
        return '<div class="cl-act-dots">' + resources.map(function (res, idx) {
          var done = !!(res.students && res.students[studentKey]);
          var cls = done ? 'done' : 'missing';
          var url = res.url || ((wwwroot && res.cmid && res.mod) ? wwwroot + '/mod/' + encodeURIComponent(res.mod) + '/view.php?id=' + encodeURIComponent(String(res.cmid)) : '');
          var title = esc(res.name) + (done ? ' (' + esc(tr('cl_resource_accessed')) + ')' : ' (' + esc(tr('cl_resource_not_accessed')) + ')');
          var label = String(idx + 1);
          if (url) return '<a class="cl-act-dot ' + cls + '" href="' + esc(url) + '" target="_blank" rel="noopener" title="' + title + '" onclick="event.stopPropagation()">' + label + '</a>';
          return '<span class="cl-act-dot ' + cls + '" title="' + title + '">' + label + '</span>';
        }).join('') + '</div>';
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

      function renderCalendar(sData, containerId) {
        var el = document.getElementById(containerId);
        if (!el) return;
        var dayMap = {};
        sData.forEach(function (r) {
          if (!r._parsed_date) return;
          var d = r._parsed_date;
          var dk = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
          dayMap[dk] = (dayMap[dk] || 0) + 1;
        });
        var today = new Date();
        var weeks = [];
        var cur = new Date(today);
        cur.setDate(cur.getDate() - cur.getDay());
        for (var w = 51; w >= 0; w--) {
          var week = [];
          for (var d = 0; d < 7; d++) {
            var date = new Date(cur);
            date.setDate(cur.getDate() - (51 - w) * 7 + d);
            var dk = date.getFullYear() + '-' + String(date.getMonth()+1).padStart(2,'0') + '-' + String(date.getDate()).padStart(2,'0');
            week.push({ date: new Date(date), dk: dk, count: dayMap[dk] || 0 });
          }
          weeks.push(week);
        }
        var maxCount = Math.max.apply(null, Object.values(dayMap).concat([1]));
        function getColor(n) {
          if (n === 0) return 'rgba(0,0,0,.06)';
          var i = n / maxCount;
          if (i < .25) return '#3aab7a30';
          if (i < .50) return '#3aab7a60';
          if (i < .75) return '#3aab7a90';
          return '#3aab7a';
        }
        var monthMarkers = [];
        weeks.forEach(function (wk, wi) {
          var label = '';
          if (wi === 0 || wk[0].date.getDate() <= 7) {
            var m = wk[0].date.toLocaleDateString('pt-BR', { month: 'short' });
            if (!monthMarkers.length || monthMarkers[monthMarkers.length-1] !== m) {
              label = m;
              monthMarkers.push(m);
            }
          }
          wk.monthLabel = label;
        });
        var days = ['D','S','T','Q','Q','S','S'];
        renderTemplate(el, 'student_calendar', {
          months: weeks.map(function(wk){ return {label: wk.monthLabel || ''}; }),
          days: days.map(function(day, i){ return {label: i % 2 === 1 ? day : ''}; }),
          weeks: weeks.map(function(wk){
            return {items: wk.map(function(day){
              return {
                title: day.dk + ': ' + day.count + ' acesso' + (day.count !== 1 ? 's' : ''),
                color: getColor(day.count)
              };
            })};
          }),
          less: tr('sp_calendar_less'),
          more: tr('sp_calendar_more'),
          legend: [
            {color:'rgba(0,0,0,.06)'},
            {color:'#3aab7a30'},
            {color:'#3aab7a60'},
            {color:'#3aab7a90'},
            {color:'#3aab7a'}
          ]
        });
      }
      function renderDailyChart(sData) {
        var daily = {};
        sData.forEach(function (r) {
          if (!r._parsed_date) return;
          var d = r._parsed_date;
          var dk = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
          daily[dk] = (daily[dk] || 0) + 1;
        });
        var arr = Object.entries(daily).sort(function (a, b) { return a[0] < b[0] ? -1 : 1; });
        if (arr.length === 1) {
          arr.unshift([arr[0][0], 0]);
        }
        var canvas = document.getElementById('spDailyChart');
        if (!canvas || !window.Chart) return;
        if (window._spDailyChart) window._spDailyChart.destroy();
        window._spDailyChart = new Chart(canvas, {
          type: 'line',
          data: {
            labels: arr.map(function (e) { return e[0].slice(5); }),
            datasets: [{
              label: tr('interactions'),
              data: arr.map(function (e) { return e[1]; }),
              borderColor: '#3aab7a',
              backgroundColor: 'rgba(58,171,122,.08)',
              fill: true,
              tension: .4,
              pointRadius: 3,
              pointBackgroundColor: '#3aab7a'
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
              x: { grid: { display: false }, ticks: { color: 'var(--muted)', maxTicksLimit: 12, font: { size: 10 } } },
              y: { beginAtZero: true, ticks: { color: 'var(--muted)', font: { size: 10 } } }
            }
          }
        });
      }
    
      function loadProfile(name) {
        var el = document.getElementById('spContent');
        if (!el) return;
        if (!name) {
          renderTemplate(el, 'empty_state', {
            class: 'sp-empty',
            icon: '👤',
            iconclass: 'sp-empty-icon',
            message: tr('sp_select_hint')
          });
          return;
        }
    
        var dash   = window.MWADashboard || {};
        var state  = dash.state || {};
        var logs   = state.logs   || [];
        var grades = state.grades || [];
        var students = state.students || [];
        var sLogs = logs.filter(function (r) { return norm(r.nomecompleto) === name; })
          .map(function (r) { var clone = Object.assign({}, r); clone._parsed_date = parseDate(r); return clone; })
          .filter(function (r) { return r._parsed_date; })
          .sort(function (a, b) { return a._parsed_date - b._parsed_date; });
        var first     = sLogs.length ? sLogs[0]._parsed_date : null;
        var last      = sLogs.length ? sLogs[sLogs.length - 1]._parsed_date : null;
        var ago       = getDaysAgo(last);
        var ac        = agoColor(ago);
        var email     = getEmailForStudent(name, logs, grades, students);
        var uniqDays  = new Set(sLogs.map(function (r) { var d = r._parsed_date; return d.getFullYear() + '-' + (d.getMonth()+1) + '-' + d.getDate(); })).size;
        var total     = sLogs.length;
        var score     = calcParticipation(name, logs, grades);
        var eng       = engLabel(score);
        var grade = null;
        if (grades.length) {
          grades.some(function (g) {
            var gn = (norm(g['First name']) + ' ' + norm(g['Last name'])).trim();
            if (gn.toLowerCase() === name.toLowerCase()) {
              var k = Object.keys(g).find(function (x) { var lx = x.toLowerCase(); return lx.includes('course total') || lx.includes('total do curso'); });
              if (k) { var n = parseFloat(String(g[k]).replace(',','.')); if (!isNaN(n)) grade = n; }
              return true;
            }
            return false;
          });
        }
        var now7 = Date.now() - 7 * 86400000, now14 = Date.now() - 14 * 86400000;
        var w1 = sLogs.filter(function (r) { return r._parsed_date.getTime() >= now7; }).length;
        var w2 = sLogs.filter(function (r) { return r._parsed_date.getTime() >= now14 && r._parsed_date.getTime() < now7; }).length;
        var trendHtml = w1 > 0 ? '' : '<span class="sp-trend">' + tr('no_data') + '</span>';
        if (w2 > 0) {
          var diff = w1 - w2;
          var pct  = Math.min(100, Math.round(Math.abs(diff / w2) * 100));
          if (pct >= 5) {
            trendHtml = diff > 0
              ? '<span class="sp-trend up">↑' + pct + '% ' + tr('sp_vs_last_week') + '</span>'
              : '<span class="sp-trend down">↓' + pct + '% ' + tr('sp_vs_last_week') + '</span>';
          } else {
            trendHtml = '<span class="sp-trend">= ' + tr('sp_stable') + '</span>';
          }
        }
        var spark = [];
        for (var i = 6; i >= 0; i--) {
          var d = new Date(Date.now() - i * 86400000);
          var dk = d.getFullYear() + '-' + (d.getMonth()+1) + '-' + d.getDate();
          spark.push(sLogs.filter(function (r) {
            var rd = r._parsed_date;
            return rd.getFullYear() + '-' + (rd.getMonth()+1) + '-' + rd.getDate() === dk;
          }).length);
        }
        var maxS = Math.max.apply(null, spark.concat([1]));
        var sparkSvg = spark.map(function (v, i) {
          var h = Math.max(2, Math.round(v / maxS * 28));
          var clr = v === 0 ? 'rgba(0,0,0,.12)' : v >= maxS * .7 ? '#3aab7a' : '#5b9bd5';
          return '<rect x="' + (i * 9) + '" y="' + (30 - h) + '" width="6" height="' + h + '" rx="2" fill="' + clr + '"/>';
        }).join('');
        var initials = name.split(/\s+/).filter(Boolean).slice(0,2).map(function (w) { return w[0]; }).join('').toUpperCase();
        var ci = Math.abs((name.charCodeAt(0)||0) + (name.charCodeAt(1)||0)) % AV_COLORS.length;
        var picture = getPictureForStudent(name, email, logs, grades);
        var noteVal  = NOTES[name] || '';
        var contacts = CONTACTS[name] || [];
        var safeN = esc(name);
        var histHtml = contacts.length
          ? contacts.map(function (c, idx) {
              return '<div class="sp-contact-item">'
                + '<div class="sp-contact-dot" style="background:var(--blue);"></div>'
                + '<div style="flex:1;">'
                  + '<div class="sp-contact-subject">' + esc(c.subject || tr('sp_contact')) + '</div>'
                  + '<div class="sp-contact-meta">' + esc(c.type || 'email') + ' · ' + fmtDate(new Date(c.date)) + '</div>'
                + '</div>'
                + '<button class="sp-contact-delete" onclick="window.MWAProfile.deleteContact(' + JSON.stringify(name) + ',' + idx + ')">🗑</button>'
                + '</div>';
            }).join('')
          : '<div style="font-size:.78rem;color:var(--muted);padding:.5rem 0;">' + esc(tr('sp_no_contacts')) + '</div>';
        var calId = 'spCal_' + name.replace(/[^a-zA-Z0-9]/g, '_');
        var activityProgressHtml = buildActivityProgress(name, grades);
        var resourceProgressHtml = buildResourceProgress(name, logs, grades);
    
        renderTemplate(el, 'student_profile', {
          avatarcolor: AV_COLORS[ci],
          initials: initials,
          pictureurl: picture,
          haspicture: !!picture,
          name: name,
          email: email || tr('no_email'),
          rawemail: email,
          firstdate: fmtDate(first),
          lastdate: fmtDate(last),
          totalinteractions: total.toLocaleString('pt-BR'),
          interactionslabel: tr('interactions'),
          lastaccesslabel: tr('sp_kpi_last_access'),
          agocolor: ac,
          ago: last ? ago : '-',
          agosuffix: last ? tr('sp_days_suffix') : '',
          activedayslabel: tr('sp_kpi_active_days'),
          uniquedays: uniqDays,
          total: total,
          gradelabel: tr('sp_kpi_grade'),
          gradecolor: grade !== null ? (grade >= 60 ? 'var(--green)' : 'var(--amber)') : 'var(--muted)',
          gradevalue: grade !== null ? grade.toFixed(1) : '—',
          gradesub: grade !== null ? (grade >= 60 ? tr('sp_approved') : tr('sp_in_progress')) : tr('sp_no_grade'),
          engagementkpilabel: tr('sp_kpi_engagement'),
          engcolor: eng.color,
          englabel: eng.label,
          engagementtone: eng.tone,
          score: score,
          activityprogresslabel: tr('cl_th_activity_progress'),
          activityprogresshtml: activityProgressHtml,
          resourceprogresslabel: tr('cl_th_resource_progress'),
          resourceprogresshtml: resourceProgressHtml,
          activity7d: tr('sp_activity_7d'),
          trendhtml: trendHtml,
          sparksvg: sparkSvg,
          hasweekdata: w1 > 0,
          nodatalabel: tr('no_data'),
          hasdailydata: sLogs.length > 0,
          weekinteractions: w1,
          weeklabel: tr('sp_interactions_this_week'),
          calendarid: calId,
          dailyjourney: tr('sp_daily_journey'),
          activitycalendar: tr('sp_activity_calendar')
        }).then(function () {
          renderDailyChart(sLogs);
          renderCalendar(sLogs, calId);
          if (window.MWAInterventions) {
            window.MWAInterventions.renderStudentTimeline(name, 'spTimeline_' + calId);
          }
        });
      }
    
      function toggleCollapse(trigger) {
        var body = trigger.nextElementSibling;
        var arrow = trigger.querySelector('.sp-collapse-arrow');
        if (!body) return;
        body.classList.toggle('open');
        if (arrow) arrow.classList.toggle('open');
      }
    
      function saveNote(name) {
        var area = document.getElementById('spNoteArea');
        if (!area) return;
        var text = area.value.trim();
        if (text) NOTES[name] = text;
        else delete NOTES[name];
        var t = document.createElement('div');
        t.textContent = tr('sp_note_saved');
        t.style.cssText = 'position:fixed;bottom:24px;right:24px;background:var(--green);color:#fff;padding:10px 18px;border-radius:12px;font-size:.82rem;font-weight:800;z-index:9999;animation:mwafadeIn .25s ease;';
        (document.getElementById('block-mwa-dashboard-app') || document.body).appendChild(t);
        setTimeout(function () { t.remove(); }, 2000);
      }
    
      function addContact(name) {
        var subject = prompt(tr('sp_contact_subject_prompt'), '');
        if (!subject) return;
        if (!CONTACTS[name]) CONTACTS[name] = [];
        CONTACTS[name].unshift({ subject: subject, type: 'manual', date: Date.now() });
        loadProfile(name);
      }
    
      function deleteContact(name, idx) {
        if (!CONTACTS[name]) return;
        CONTACTS[name].splice(idx, 1);
        if (!CONTACTS[name].length) delete CONTACTS[name];
        loadProfile(name);
      }
    
      function render() {
        var sel = document.getElementById('spStudentSel');
        if (!sel) return;

        function getNames() {
          var dash  = window.MWADashboard || {};
          var state = dash.state || {};
          var logs  = state.logs || [];
          var grades = state.grades || [];
          var names = getAllStudentNames(logs, grades, state.students || []);
          names.sort(function(a,b){ return a.localeCompare(b,'pt-BR'); });
          return { names: names, logs: logs, grades: grades, students: state.students || [] };
        }

        function fillSelect(selectedName) {
          var current = norm(selectedName) || norm(sel.value);
          var d = getNames();
          var placeholder = tr('sp_select_placeholder') || '-- Escolha um aluno --';
          sel.replaceChildren();
          var opt = document.createElement('option');
          opt.value = '';
          opt.textContent = placeholder;
          sel.appendChild(opt);
          d.names.forEach(function(n) {
            var item = document.createElement('option');
            item.value = n;
            item.textContent = n;
            sel.appendChild(item);
          });
          if (current) sel.value = current;
        }

        fillSelect(PENDING_PROFILE_STUDENT);
        if (!sel.dataset.spInit) {
          sel.dataset.spInit = '1';
          sel.addEventListener('change', function() {
            loadProfile(sel.value);
          });
        }
        if (PENDING_PROFILE_STUDENT) {
          loadProfile(PENDING_PROFILE_STUDENT);
          PENDING_PROFILE_STUDENT = '';
        }
      }
    
      window.goToStudentProfile = function (name) {
        var normalName = norm(name);
        window.showPage && window.showPage('studentprofile');
        var attempts = 0;
        function openWhenReady() {
          var sel = document.getElementById('spStudentSel');
          if (!sel) {
            if (attempts++ < 10) setTimeout(openWhenReady, 120);
            return;
          }
          if (!sel.dataset.spInit) {
            PENDING_PROFILE_STUDENT = normalName;
            render();
            if (attempts++ < 10) setTimeout(openWhenReady, 120);
            return;
          }
          sel.value = normalName;
          loadProfile(normalName);
        }
        setTimeout(openWhenReady, 150);
      };
    
      window.MWAProfile = {
        render:       render,
        loadProfile:  loadProfile,
        saveNote:     saveNote,
        addContact:   addContact,
        deleteContact:deleteContact,
        toggleCollapse: toggleCollapse
      };
    
    })();

    return window.MWAProfile;
});
