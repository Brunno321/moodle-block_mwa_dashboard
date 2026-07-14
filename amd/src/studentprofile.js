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
define(['block_mwa_dashboard/dashboardstore', 'core/templates'], function(Store, Templates) {

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
      function fmtDateTime(d) {
        if (!d) return '—';
        return fmtDate(d) + ' ' + String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
      }
    
      function agoColor(ago) {
        if (ago === 0) return 'var(--green)';
        if (ago <= 2)  return 'var(--teal)';
        if (ago <= 6)  return 'var(--amber)';
        return 'var(--red)';
      }
    
      function engLabel(score) {
        if (score >= 70) return { label: tr('high_participation'),  color: 'var(--green)' };
        if (score >= 40) return { label: tr('average_participation'), color: 'var(--blue)' };
        return             { label: tr('low_participation'),   color: 'var(--red)' };
      }
    
      function calcParticipation(name, logs, grades) {
        var allActs = new Set(), myActs = new Set();
        logs.forEach(function (r) {
          var ctx = norm(r.contextodoevento);
          if (!ctx || /^curso\s*:/i.test(ctx) || /^sistema$/i.test(ctx)) return;
          allActs.add(ctx);
          if (norm(r.nomecompleto) === name) myActs.add(ctx);
        });
        var coverScore = allActs.size > 0 ? Math.min(100, Math.round(myActs.size / allActs.size * 100)) : 0;
    
        var grade = null;
        if (grades && grades.length) {
          grades.some(function (g) {
            var gn = (norm(g['First name']) + ' ' + norm(g['Last name'])).trim();
            if (gn.toLowerCase() === name.toLowerCase()) {
              var k = Object.keys(g).find(function (x) {
                var lx = x.toLowerCase();
                return lx.includes('course total') || lx.includes('total do curso');
              });
              if (k) { var n = parseFloat(String(g[k]).replace(',','.')); if (!isNaN(n)) grade = n; }
              return true;
            }
            return false;
          });
        }
        var gradeScore = grade !== null ? Math.min(100, Math.round(grade / 100 * 100)) : 0;
        var hasDelivery = logs.some(function (r) {
          if (norm(r.nomecompleto) !== name) return false;
          var ev   = norm(r.nomedoevento).toLowerCase();
          var comp = norm(r.componente).toLowerCase();
          if (comp === 'assignment' || comp === 'tarefa') {
            return ev === 'submission submitted' || ev === 'file uploaded' || ev.includes('submit') || ev.includes('upload');
          }
          if (comp === 'forum' || comp === 'fórum') {
            return ev === 'forum post created' || ev === 'discussion created' || ev.includes('post_created') || ev.includes('subscription_created');
          }
          return false;
        });
        var deliveryScore = hasDelivery ? 100 : 0;
    
        if (grades && grades.length && grade !== null) {
          return Math.round(gradeScore * 0.50 + coverScore * 0.30 + deliveryScore * 0.20);
        }
        return Math.round(coverScore * 0.60 + deliveryScore * 0.40);
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
    
      function populateSelect() {
        var sel = document.getElementById('spStudentSel');
        if (!sel) return;
        var dash  = window.MWADashboard || {};
        var state = dash.state || {};
        var logs  = state.logs || [];
        var names = [];
        var seen  = {};
        logs.forEach(function (r) {
          var n = norm(r.nomecompleto);
          if (n && !seen[n]) { seen[n] = true; names.push(n); }
        });
        names.sort(function (a, b) { return a.localeCompare(b, 'pt-BR'); });
        var prev = sel.value;
        sel.replaceChildren();
        var placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = tr('sp_select_student');
        sel.appendChild(placeholder);
        names.forEach(function (n) {
          var opt = document.createElement('option');
          opt.value = n;
          opt.textContent = n;
          opt.selected = n === prev;
          sel.appendChild(opt);
        });
        if (prev && seen[prev]) { sel.value = prev; loadProfile(prev); }
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
        var sLogs = logs.filter(function (r) { return norm(r.nomecompleto) === name; })
          .map(function (r) { var clone = Object.assign({}, r); clone._parsed_date = parseDate(r); return clone; })
          .filter(function (r) { return r._parsed_date; })
          .sort(function (a, b) { return a._parsed_date - b._parsed_date; });
    
        if (!sLogs.length) {
          renderTemplate(el, 'empty_state', {
            class: 'sp-empty',
            message: tr('no_data')
          });
          return;
        }
    
        var first     = sLogs[0]._parsed_date;
        var last      = sLogs[sLogs.length - 1]._parsed_date;
        var ago       = getDaysAgo(last);
        var ac        = agoColor(ago);
        var email     = norm(sLogs.find(function (r) { return norm(r.email); }) ? sLogs.find(function (r) { return norm(r.email); }).email : '');
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
        var trendHtml = '<span class="sp-trend">' + tr('sp_no_prev_data') + '</span>';
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
    
        renderTemplate(el, 'student_profile', {
          avatarcolor: AV_COLORS[ci],
          initials: initials,
          name: name,
          email: email || tr('no_email'),
          rawemail: email,
          firstdate: fmtDate(first),
          lastdate: fmtDate(last),
          totalinteractions: total.toLocaleString('pt-BR'),
          interactionslabel: tr('interactions'),
          lastaccesslabel: tr('sp_kpi_last_access'),
          agocolor: ac,
          ago: ago,
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
          score: score,
          activity7d: tr('sp_activity_7d'),
          trendhtml: trendHtml,
          sparksvg: sparkSvg,
          weekinteractions: w1,
          weeklabel: tr('sp_interactions_this_week'),
          calendarid: calId,
          dailyjourney: tr('sp_daily_journey'),
          activitycalendar: tr('sp_activity_calendar')
        });
        setTimeout(function () {
          renderDailyChart(sLogs);
          renderCalendar(sLogs, calId);
          if (window.MWAInterventions) {
            window.MWAInterventions.renderStudentTimeline(name, 'spTimeline_' + calId);
          }
        }, 60);
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
        populateSelect();
        var sel = document.getElementById('spStudentSel');
        if (sel && sel.value) loadProfile(sel.value);
      }
    
      window.goToStudentProfile = function (name) {
        window.showPage && window.showPage('studentprofile');
        setTimeout(function () {
          var sel = document.getElementById('spStudentSel');
          if (!sel) return;
          if (sel.options.length <= 1) populateSelect();
          var opt = Array.from(sel.options).find(function (o) { return o.value === name || o.text === name; });
          if (opt) { sel.value = opt.value; loadProfile(name); }
        }, 150);
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
