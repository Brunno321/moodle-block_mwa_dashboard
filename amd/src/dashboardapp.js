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
 * @module     block_mwa_dashboard/dashboardapp
 * @copyright  2026 Bruno Porto
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

/**
 * Note: This module generates HTML markup directly in JavaScript strings for
 * performance reasons ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â the dashboard renders large dynamic datasets (student lists,
 * heatmaps, charts) that require frequent partial updates. All user-supplied data is
 * escaped via the esc() helper before insertion into the DOM.
 * See: https://docs.moodle.org/dev/JavaScript_Modules#HTML_generation
 */
define([
    'block_mwa_dashboard/dashboardstore',
    'block_mwa_dashboard/actioncenter',
    'block_mwa_dashboard/alerts',
    'block_mwa_dashboard/classlist',
    'block_mwa_dashboard/studentprofile',
    'block_mwa_dashboard/activities',
    'block_mwa_dashboard/grades',
    'block_mwa_dashboard/interventions',
    'block_mwa_dashboard/chat',
    'block_mwa_dashboard/teacherfeedback',
    'block_mwa_dashboard/engagementcalc',
    'core/templates'
], function(Store, ActionCenter, Alerts, ClassList, Profile, Activities, Grades, Interventions, Chat, TeacherFeedback, EngagementCalc, Templates) {

    'use strict';

    var Modules = {
        ActionCenter: ActionCenter,
        Alerts: Alerts,
        ClassList: ClassList,
        Profile: Profile,
        Activities: Activities,
        Grades: Grades,
        Interventions: Interventions,
        TeacherFeedback: TeacherFeedback
    };
    var eventChart = null;

    var init = function(config) {
        var STRINGS = Store.getStrings();
        function tr(key, fallback){
          var value = Object.prototype.hasOwnProperty.call(STRINGS, key) ? STRINGS[key] : '';
          if (typeof value === 'string' && value && !/^\[\[.*\]\]$/.test(value)) { return value; }
          return (fallback !== undefined && fallback !== null) ? fallback : key;
        }
        function renderInlineStatus(el, message) {
          if (!el) { return; }
          Templates.render('block_mwa_dashboard/content_inline_status', {
            color: 'var(--muted)',
            message: message
          }).then(function(html) {
            Templates.replaceNodeContents(el, html, '');
          });
        }
        function applyTranslations(){
          document.querySelectorAll('[data-i18n]').forEach(function(el){
            var key = el.getAttribute('data-i18n');
            el.textContent = tr(key, el.textContent);
          });
          document.querySelectorAll('[data-i18n-attr]').forEach(function(el){
            var spec = el.getAttribute('data-i18n-attr').split(':');
            var attr = spec[0], key = spec[1];
            if (attr && key) { el.setAttribute(attr, tr(key, el.getAttribute(attr) || '')); }
          });
        }
        applyTranslations();
        function firstName(value) {
          return String(value || '').trim().split(/\s+/).filter(Boolean)[0] || '';
        }
        function renderActionGreeting() {
          var el = document.getElementById('actionGreeting');
          if (!el) { return; }
          var cfg = Store.getConfig ? Store.getConfig() : (config || {});
          var name = firstName(cfg.userfirstname || cfg.username || '');
          var hour = new Date().getHours();
          var key = hour < 12 ? 'action_greeting_morning' : hour < 18 ? 'action_greeting_afternoon' : 'action_greeting_evening';
          var fallback = hour < 12 ? 'Bom dia, {name}.' : hour < 18 ? 'Boa tarde, {name}.' : 'Boa noite, {name}.';
          var greeting = tr(key, fallback).replace('{name}', name || tr('teacher_label', 'professor(a)'));
          el.textContent = greeting + ' ' + tr('action_welcome_message');
        }
        renderActionGreeting();
        function setupSidebarToggle() {
          var root = document.getElementById('block-mwa-dashboard-app');
          var btn = document.getElementById('mwaSidebarToggle');
          var key = 'block_mwa_dashboard.sidebarCollapsed';
          if (!root || !btn) { return; }
          function update(collapsed) {
            var label = collapsed ? tr('sidebar_expand', 'Expand sidebar') : tr('sidebar_collapse', 'Collapse sidebar');
            root.classList.toggle('mwa-sidebar-collapsed', collapsed);
            btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
            btn.setAttribute('aria-label', label);
            btn.setAttribute('title', label);
          }
          var saved = false;
          try { saved = window.localStorage && window.localStorage.getItem(key) === '1'; } catch (ignore) {}
          update(saved);
          btn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            var collapsed = !root.classList.contains('mwa-sidebar-collapsed');
            update(collapsed);
            try {
              if (window.localStorage) { window.localStorage.setItem(key, collapsed ? '1' : '0'); }
            } catch (ignore) {}
          });
        }
        setupSidebarToggle();
        document.addEventListener('click', function(e){
          if (e.target.closest('.mwa-help-tip')) {
            return;
          }
          var kpiUrl = e.target.closest('[data-kpi-url]');
          if (kpiUrl) {
            e.preventDefault();
            e.stopPropagation();
            if (e.stopImmediatePropagation) {
              e.stopImmediatePropagation();
            }
            var url = kpiUrl.getAttribute('data-kpi-url');
            if (kpiUrl.getAttribute('data-kpi-new-window') === '1') {
              window.open(url, '_blank');
            } else {
              window.location.href = url;
            }
            return;
          }

          var scrollBtn = e.target.closest('[data-scroll-target]');
          if (scrollBtn) {
            e.preventDefault();
            e.stopPropagation();
            var target = document.getElementById(scrollBtn.getAttribute('data-scroll-target'));
            if (target) {
              if (!document.getElementById('page-ac').classList.contains('active')) {
                showPage('ac');
              }
              target.scrollIntoView({behavior: 'smooth', block: 'start'});
              target.classList.add('mwa-scroll-highlight');
              setTimeout(function () { target.classList.remove('mwa-scroll-highlight'); }, 1400);
            }
            return;
          }
          
          var bulkBtn = e.target.closest('[data-bulk-kind]');
          if (bulkBtn) {
            e.preventDefault();
            e.stopPropagation();
            var ac = window.MWAActionCenter;
            if (ac && typeof ac.openBulkForKind === 'function') {
              ac.openBulkForKind(bulkBtn.getAttribute('data-bulk-kind'));
            }
            return;
          }
          
          var btn = e.target.closest('[data-action-page]');
          if (btn) {
            e.preventDefault();
            var page = btn.getAttribute('data-action-page');
            var classFilter = btn.getAttribute('data-cl-filter-target');
            showPage(page);
            if (page === 'classlist' && classFilter && Modules.ClassList && typeof Modules.ClassList.setFilter === 'function') {
              Modules.ClassList.setFilter(classFilter, '');
            }
          }
        });
        document.addEventListener('keydown', function(e) {
          if (e.key !== 'Enter' && e.key !== ' ') {
            return;
          }
          var target = e.target.closest('.mwa-kpi-clickable,.ac-click-card');
          if (!target || e.target.closest('.mwa-help-tip')) {
            return;
          }
          e.preventDefault();
          target.click();
        });
        
        var state={logs:[],grades:[],students:[],activities:[],seen:false};
        var COLORS=['#4f8ef7','#2fb579','#d9962c','#8b6bd6','#e05a5a','#14b8a6'];
        function $(id){return document.getElementById(id)}
        function norm(v){return (v===undefined||v===null)?'':String(v).trim()}
        function lower(v){return norm(v).toLowerCase()}
        function parseDate(log){if(log._ts){return new Date(Number(log._ts)*1000)}var s=norm(log.hora);var m=s.match(/(\d{2})\/(\d{2})\/(\d{2}),\s*(\d{2}):(\d{2})/);if(m){return new Date(2000+Number(m[3]),Number(m[2])-1,Number(m[1]),Number(m[4]),Number(m[5]))}return null}
        function studentKey(name,email){return lower(email)||lower(name)}
        function gradeEmail(row){var k=Object.keys(row).find(function(x){return lower(x)==='email'||lower(x).includes('email')});return k?norm(row[k]):''}
        function gradeName(row){var f=Object.keys(row).find(function(x){return lower(x).includes('first')||lower(x).includes('nome')});var l=Object.keys(row).find(function(x){return lower(x).includes('last')||lower(x).includes('sobrenome')});return [f?row[f]:'',l?row[l]:''].join(' ').trim()}
        function gradePicture(row){var k=Object.keys(row).find(function(x){var lx=lower(x);return lx==='picture url'||lx==='pictureurl'||lx.includes('profile image')||lx.includes('foto')});return k?norm(row[k]):''}
        function gradeUserId(row){var k=Object.keys(row).find(function(x){var lx=lower(x);return lx==='user id'||lx==='userid'||lx==='id do usuario'||lx==='id do usuÃƒÆ’Ã‚Â¡rio'});var n=k?parseInt(row[k],10):0;return isNaN(n)?0:n}
        function logPicture(log){return norm(log.pictureurl||log.profileimageurl||log.userpictureurl)}
        function gradeTotal(row){var keys=Object.keys(row);var k=keys.find(function(x){var lx=lower(x);return lx.includes('course total')||lx.includes('total do curso')||lx==='total'});var v=k?row[k]:null;var n=parseFloat(String(v).replace(',','.'));return isNaN(n)?null:n}
        function isSubmission(log){var text=lower([log.nomedoevento,log.action,log.componente,log.component].join(' '));return text.includes('submit')||text.includes('submission')||text.includes('submitted')||text.includes('upload')||text.includes('graded')}
        function activityName(log){return norm(log.contextodoevento)||norm(log.context)||norm(log._modtype)||null}
        function componentName(log){return norm(log.componente)||norm(log.component)||norm(log._modtype)||tr('other','Other')}
        function logCmid(log){var n=parseInt(log._cmid||log.contextinstanceid||0,10);return isNaN(n)?0:n}
        function logModtype(log){var mod=lower(log._modtype||log.modtype||log.module||'');if(!mod&&/^mod_/.test(norm(log.component||'')))mod=lower(log.component).replace(/^mod_/,'');if(mod==='assignsubmission')mod='assign';if(mod==='hvp')mod='h5pactivity';return mod}
        function buildModel(){
          var by={};
          var activitiesMap={};
          var activityMeta={};
          var metaRow=state.grades&&state.grades[0]&&state.grades[0].__mwa_type__==='activity_names'?state.grades[0]:null;
          if(metaRow){
            Object.keys(metaRow).forEach(function(k){
              var m=k.match(/^act_(\d+)$/);
              if(!m)return;
              var seq=m[1], name=norm(metaRow[k]);
              if(!name)return;
              activityMeta[lower(name)]={
                cmid:parseInt(metaRow['act_cmid_'+seq]||0,10)||0,
                modtype:norm(metaRow['act_module_'+seq]||''),
                available:String(metaRow['act_available_'+seq]||'1')!=='0',
                availablefrom:parseInt(metaRow['act_availablefrom_'+seq]||0,10)||0,
                availableuntil:parseInt(metaRow['act_availableuntil_'+seq]||0,10)||0
              };
            });
          }
          state.logs.forEach(function(l){
            var name=norm(l.nomecompleto||l.student_name||l.userfullname);
            if(!name)return;
            var email=norm(l.email);
            var key=studentKey(name,email);
            if(!by[key])by[key]={name:name,email:email,userid:Number(l._userid||l.userid||0),pictureurl:logPicture(l),interactions:0,contexts:{},submissions:0,last:null,grade:null,score:0};
            if(!by[key].pictureurl&&logPicture(l))by[key].pictureurl=logPicture(l);
            if(!by[key].userid&&(l._userid||l.userid))by[key].userid=Number(l._userid||l.userid||0);
            by[key].interactions++;
            var a=activityName(l);
            if(a){
              var meta=activityMeta[lower(a)]||{};
              by[key].contexts[a]=true;
              activitiesMap[a]=activitiesMap[a]||{
                name:a,
                type:componentName(l),
                accesses:0,
                students:{},
                cmid:meta.cmid||logCmid(l)||0,
                modtype:meta.modtype||logModtype(l)||'',
                available:meta.available!==undefined?meta.available:String(l._available||'1')!=='0',
                availablefrom:meta.availablefrom||parseInt(l._availablefrom||0,10)||0,
                availableuntil:meta.availableuntil||parseInt(l._availableuntil||0,10)||0
              };
              if(!activitiesMap[a].cmid&&meta.cmid)activitiesMap[a].cmid=meta.cmid;
              if(!activitiesMap[a].modtype&&meta.modtype)activitiesMap[a].modtype=meta.modtype;
              if(meta.available!==undefined)activitiesMap[a].available=meta.available;
              if(meta.availablefrom)activitiesMap[a].availablefrom=meta.availablefrom;
              if(meta.availableuntil)activitiesMap[a].availableuntil=meta.availableuntil;
              activitiesMap[a].accesses++;
              activitiesMap[a].students[key]=true;
            }
            if(isSubmission(l))by[key].submissions++;
            var d=parseDate(l);
            if(d&&(!by[key].last||d>by[key].last))by[key].last=d;
          });
          state.grades.forEach(function(g){
            if(!g||g.__mwa_type__==='activity_names')return;
            var email=gradeEmail(g), name=gradeName(g);
            if(!name&&!email)return;
            var key=studentKey(name,email);
            if(!by[key])by[key]={name:name||email,email:email,userid:gradeUserId(g),pictureurl:gradePicture(g),interactions:0,contexts:{},submissions:0,last:null,grade:null,score:0};
            if(!by[key].pictureurl&&gradePicture(g))by[key].pictureurl=gradePicture(g);
            if(!by[key].userid&&gradeUserId(g))by[key].userid=gradeUserId(g);
            by[key].gradeRow=g;
          });
          state.students=Object.keys(by).map(function(k){
            var s=by[k];
            var calc=EngagementCalc.calculateForStudent(s.name,s.email,state.logs,state.grades);
            s.interactions=calc.interactions||s.interactions||0;
            s.coverage=Math.round(calc.coverage||0);
            s.completion=Math.round(calc.completion||0);
            s.gradeProgress=Math.round(calc.gradeProgress||0);
            s.gradeItems=calc.gradeItems||0;
            s.gradeLaunched=calc.gradeLaunched||0;
            s.activeDays=calc.activeDays||0;
            s.daysWithoutAccess=calc.daysWithoutAccess;
            s.last=calc.last||s.last||null;
            s.grade=calc.grade;
            s.score=calc.score;
            s.risk=s.score<=40?'High':s.score<70?'Medium':'Low';
            return s;
          }).sort(function(a,b){return a.score-b.score});
          state.activities=Object.keys(activitiesMap).map(function(k){var a=activitiesMap[k];a.unique=Object.keys(a.students).length;return a}).sort(function(a,b){return b.accesses-a.accesses});
        }
        window.MWADeltaChip = function(cur, prv, invertColors) {
          if (prv === null || prv === undefined || cur === null || cur === undefined) return '';
          var d = cur - prv;
          var pos = invertColors ? d < 0 : d > 0;
          var neg = invertColors ? d > 0 : d < 0;
          var color  = d === 0 ? '#8a94a8' : pos ? '#13794c' : '#b42318';
          var bg     = d === 0 ? '#f0f2f7' : pos ? '#e8f7ef' : '#fdecec';
          var label  = d === 0 ? '0' : (d > 0 ? '+' + d : String(d));
          return '<span style="background:'+bg+';color:'+color+';font-size:.65rem;font-weight:800;padding:2px 7px;border-radius:99px;float:right;margin-left:4px;">'+label+'</span>';
        };

        
        function splitLogsHalf() {
          var dated = [];
          state.logs.forEach(function(l) {
            var d = parseDate(l);
            if (d) dated.push({ l: l, t: d.getTime() });
          });
          dated.sort(function(a,b){ return a.t - b.t; });
          if (dated.length < 4) return { cur: dated, prv: [] };
          var mid = Math.floor(dated.length / 2);
          return { cur: dated.slice(mid), prv: dated.slice(0, mid) };
        }

        function statsOf(arr) {
          var names = {}, nameSet = {}, ri = 0;
          arr.forEach(function(x){ var n=norm(x.l.nomecompleto); if(n){ names[n]=true; nameSet[n]=true; }});
          state.students.forEach(function(st){ if(nameSet[norm(st.name)]&&st.score<=40) ri++; });
          var s = Object.keys(names).length;
          return { students: s, logs: arr.length, avgInt: s?Math.round(arr.length/s):0, atRisk: ri };
        }

        
        function helpTip(text) {
          var safe = esc(text || '');
          return safe ? '<span class="mwa-help-tip" tabindex="0" role="img" aria-label="'+safe+'" title="'+safe+'" data-tooltip="'+safe+'">?</span>' : '';
        }
        function helpTipNode(text) {
          if (!text) return null;
          var node = document.createElement('span');
          node.className = 'mwa-help-tip';
          node.tabIndex = 0;
          node.setAttribute('role', 'img');
          node.setAttribute('aria-label', text);
          node.title = text;
          node.setAttribute('data-tooltip', text);
          node.textContent = '?';
          return node;
        }

        function kpiSmart(label, value, sub, delta, invertDelta, tip, options) {
          options = options || {};
          
          var chipHtml = '';
          if (delta !== null && delta !== undefined && !isNaN(Number(delta))) {
            var pos = invertDelta ? delta < 0 : delta > 0;
            var neg = invertDelta ? delta > 0 : delta < 0;
            var chipClr = delta === 0 ? '#8a94a8' : pos ? '#13794c' : '#b42318';
            var chipBg  = delta === 0 ? '#f0f2f7' : pos ? '#e8f7ef' : '#fdecec';
            var deltaLabel = delta === 0 ? '0' : (delta > 0 ? '+' + delta : String(delta));
            chipHtml = '<span style="background:'+chipBg+';color:'+chipClr+';font-size:.68rem;font-weight:800;padding:2px 8px;border-radius:99px;letter-spacing:.02em;">'+deltaLabel+'</span>';
          }
          var attrs = '';
          if (options.page) {
            attrs += ' data-action-page="' + esc(options.page) + '"';
          }
          if (options.url) {
            attrs += ' data-kpi-url="' + esc(options.url) + '"';
          }
          if (options.scrollTarget) {
            attrs += ' data-scroll-target="' + esc(options.scrollTarget) + '"';
          }
          if (options.newWindow) {
            attrs += ' data-kpi-new-window="1"';
          }
          var clickable = attrs ? ' mwa-kpi-clickable" role="button" tabindex="0"' : '"';
          return '<div class="kpi' + clickable + attrs + '>'
            + '<div class="kpi-label" style="display:flex;justify-content:space-between;align-items:center;gap:8px;">'
            + '<span style="display:inline-flex;align-items:center;gap:6px;">'+label+helpTip(tip)+'</span>'+chipHtml
            + '</div>'
            + '<div class="kpi-value">'+value+'</div>'
            + '<div class="kpi-sub">'+sub+'</div>'
            + '</div>';
        }



        function kpi(label,value,cls,sub){return '<div class="kpi"><div class="kpi-label">'+label+'</div><div class="kpi-value '+(cls||'')+'">'+value+'</div><div class="kpi-sub">'+(sub||'')+'</div></div>'}
        
        
        var dashboard={state:state,$:$,tr:tr,esc:esc,norm:norm,lower:lower,parseDate:parseDate,studentKey:studentKey,componentName:componentName,callAction:function(method,args){return Store.callAction(method,args||{});},receiveData:receiveData,receiveError:receiveError};
        Store.setDashboard(dashboard);
        function renderKPIs(){
          var avgInt = state.students.length ? Math.round(state.logs.length / state.students.length) : 0;
          var activeCourseStudents = state.students.filter(function(s){return Number(s.interactions||0)>0;}).length;
          var atRisk = state.students.filter(function(s){return s.score<=40;}).length;
          var grades = state.students.map(function(s){return s.grade;}).filter(function(v){return v!==null;});
          var avgGrade = grades.length ? Math.round(grades.reduce(function(a,b){return a+b;},0)/grades.length) : null;
          var cfg = Store.getConfig ? Store.getConfig() : (config || {});
          var root = String(cfg.wwwroot || config.wwwroot || '').replace(/\/+$/, '');
          var courseid = parseInt(cfg.courseid || config.courseid || 0, 10);
          var participantsUrl = root && courseid ? root + '/user/index.php?id=' + courseid : '';

          
          var split    = splitLogsHalf();
          var cur      = statsOf(split.cur);
          var prv      = statsOf(split.prv);
          var hasPrev  = prv.logs > 0;

          var dStudents = hasPrev ? (cur.students - prv.students) : null;
          var dLogs     = hasPrev ? (cur.logs     - prv.logs)     : null;
          var dAvgInt   = hasPrev ? (cur.avgInt   - prv.avgInt)   : null;
          var dRisk     = hasPrev ? (cur.atRisk   - prv.atRisk)   : null;

          
          var dGrade = null;
          if (hasPrev && avgGrade !== null) {
            var prvNames = {};
            split.prv.forEach(function(x){ var n=norm(x.l.nomecompleto); if(n) prvNames[n]=true; });
            var prvGrades = state.students.filter(function(s){ return prvNames[norm(s.name)] && s.grade!==null; }).map(function(s){ return s.grade; });
            if (prvGrades.length) {
              var prvAvgGrade = Math.round(prvGrades.reduce(function(a,b){return a+b;},0)/prvGrades.length);
              dGrade = avgGrade - prvAvgGrade;
            }
          }

          Store.renderHtml($('kpis'), kpiSmart(tr('students_in_log','Estudantes ativos'),     state.students.length, tr('students_loaded','estudantes ativos'),   null, false, tr('ac_tip_students_in_log','Quantidade de estudantes matriculados carregados do Moodle para este curso.'), participantsUrl ? {url: participantsUrl, newWindow: true} : {})
          + kpiSmart(tr('active_course_students','Estudante/Interação'), activeCourseStudents, tr('with_course_activity','com interações'), dStudents, false, tr('ac_tip_active_course_students','Quantidade de estudantes que fizeram pelo menos um acesso ou interação registrada no curso.'), {page:'classlist'})
          + kpiSmart(tr('total_interactions','Total de interações'), state.logs.length,     tr('moodle_events','eventos do Moodle'),     dLogs,     false, tr('ac_tip_total_interactions'))
          + kpiSmart(tr('average_student','Média por estudante'),    avgInt,                tr('interactions','interações'),             dAvgInt,   false, tr('ac_tip_average_student'))
          + (avgGrade!==null ? kpiSmart(tr('grade_average'), avgGrade, tr('of_100_points','de 100 pontos'), dGrade, false, tr('ac_tip_grade_average'), {page:'grades'}) : ''));
        }
        
        function mwaChartType(label){
          /* Tipo exato de atividade/recurso (mesma taxonomia usada em
             activities.js: forum, tarefa, quiz, h5p ou video). H5P tem
             bucket proprio, separado de quiz/lesson/SCORM. Usado para
             filtrar a aba de Atividades/Recursos pelo tipo especifico
             clicado no grafico, nao apenas pelo grupo geral. */
          var c = String(label || '').toLowerCase().trim();
          var FORUM = {forum: 1, glossary: 1, data: 1, database: 1, chat: 1};
          var TAREFA = {assign: 1, assignment: 1, workshop: 1};
          var H5P = {h5pactivity: 1, h5p: 1, hvp: 1};
          var QUIZ = {quiz: 1, lesson: 1, scorm: 1,
            choice: 1, feedback: 1, survey: 1, questionnaire: 1, game: 1};
          if (FORUM[c]) { return 'forum'; }
          if (TAREFA[c]) { return 'tarefa'; }
          if (H5P[c] || c.indexOf('h5p') >= 0 || c.indexOf('hvp') >= 0) { return 'h5p'; }
          if (QUIZ[c]) { return 'quiz'; }
          return 'video';
        }
        function goToChartBucket(label){
          var type = mwaChartType(label);
          var isVideo = type === 'video';
          showPage('activities');
          if (Modules.Activities && Modules.Activities.setFilter) {
            /* O botao "Atividades" agrupa forum/tarefa/quiz visualmente,
               mas o filtro aplicado e o tipo exato da fatia clicada. */
            var btn = document.getElementById(isVideo ? 'actTabVideo' : 'actTabActivity');
            Modules.Activities.setFilter(type, btn);
          }
        }
        function renderChart(){var SKIP={System:1,Login:1,system:1,login:1,outro:1,Outro:1};var counts={};state.logs.forEach(function(l){var c=componentName(l);if(SKIP[c])return;counts[c]=(counts[c]||0)+1});var labels=Object.keys(counts);var data=labels.map(function(k){return counts[k]});var ctx=$('eventChart');if(!ctx||!window.Chart)return; if(eventChart)eventChart.destroy();eventChart=new Chart(ctx,{type:'doughnut',data:{labels:labels,datasets:[{data:data,backgroundColor:COLORS,borderWidth:0,hoverOffset:4}]},options:{cutout:'62%',onClick:function(evt,elements){if(!elements||!elements.length)return;goToChartBucket(labels[elements[0].index]);},onHover:function(evt,elements){if(evt&&evt.native&&evt.native.target)evt.native.target.style.cursor=(elements&&elements.length)?'pointer':'default';},plugins:{legend:{position:'bottom',onClick:function(evt,legendItem){if(!legendItem||typeof legendItem.index!=='number')return;goToChartBucket(labels[legendItem.index]);},labels:{usePointStyle:false,boxWidth:12,padding:14,font:{size:12}}}},maintainAspectRatio:false}})}
        function badge(risk){var c=risk==='High'?'low':risk==='Medium'?'medium':'high';return '<span class="badge '+c+'">'+(risk==='High'?tr('risk_high','High'):risk==='Medium'?tr('risk_medium','Medium'):tr('risk_low','Low'))+'</span>'}
        function renderTables(){var list=state.students;var q=lower($('search').value);if(q){list=list.filter(function(s){return lower(s.name).includes(q)||lower(s.email).includes(q)})}var st=$('studentsTable');if(st)Store.renderHtml(st, '<thead><tr><th>'+tr('student','Student')+'</th><th>'+tr('email','Email')+'</th><th>'+tr('interactions','Interactions')+'</th><th>'+tr('coverage')+'</th><th>'+tr('grade','Grade')+'</th><th>'+tr('score','Score')+'</th><th>'+tr('risk','Risk')+'</th></tr></thead><tbody>'+list.map(function(s){return '<tr><td>'+esc(s.name)+'</td><td>'+esc(s.email)+'</td><td>'+s.interactions+'</td><td>'+s.coverage+'%</td><td>'+(s.grade===null?'-':s.grade)+'</td><td>'+s.score+'%</td><td>'+badge(s.risk)+'</td></tr>'}).join('')+'</tbody>');var at=$('activitiesTable');if(at)Store.renderHtml(at, '<thead><tr><th>'+tr('activity','Activity')+'</th><th>'+tr('type','Type')+'</th><th>'+tr('accesses','Accesses')+'</th><th>'+tr('unique_students','Unique students')+'</th></tr></thead><tbody>'+state.activities.map(function(a){return '<tr><td>'+esc(a.name)+'</td><td>'+esc(a.type)+'</td><td>'+a.accesses+'</td><td>'+a.unique+'</td></tr>'}).join('')+'</tbody>');renderGradesTable()}
        function renderGradesTable(){var gt=$('gradesTable');if(!gt)return;if(!state.grades.length){Store.renderHtml(gt, '<tbody><tr><td class="empty">'+tr('no_grade_data_available','No grade data available.')+'</td></tr></tbody>');return}var keys=Object.keys(state.grades[0]).slice(0,12);Store.renderHtml(gt, '<thead><tr>'+keys.map(function(k){return '<th>'+esc(k)+'</th>'}).join('')+'</tr></thead><tbody>'+state.grades.map(function(r){return '<tr>'+keys.map(function(k){return '<td>'+esc(r[k])+'</td>'}).join('')+'</tr>'}).join('')+'</tbody>')}
        function renderAlerts(){if(Modules.Alerts){Modules.Alerts.reset();Modules.Alerts.render();}}
        function alertHtml(s){var cl=s.risk==='High'?'':'medium';var msg=s.risk==='High'?tr('immediate_intervention','Immediate intervention recommended'):tr('monitor_preventive','Monitor and send a preventive message');return '<div class="alert-card '+cl+'"><strong>'+esc(s.name)+'</strong><div class="muted">'+msg+' \u00B7 '+tr('score','Score')+' '+s.score+'% \u00B7 '+s.interactions+' '+tr('interactions','interactions')+' \u00B7 '+tr('grade','Grade')+' '+(s.grade===null?'-':s.grade)+'</div></div>'}
        function hmLogName(l) {
          return (l && (l.nomecompleto || l.fullname || l.userfullname || l.user || '') || '').trim();
        }
        function hmStudentByName(name) {
          var key = norm(name);
          return (state.students || []).filter(function(s) { return norm(s.name) === key; })[0] || null;
        }
        function hmResourceName(l) {
          var raw = l && (l.contextodoevento || l.eventcontext || l.context || l.target || l.nomedoevento || '');
          raw = String(raw || '').replace(/\s+/g, ' ').trim();
          var parts = raw.split(':');
          if (parts.length > 1) {
            parts.shift();
            raw = parts.join(':').trim();
          }
          return raw || tr('unknown_activity');
        }
        function hmIsGenericResourceName(name, l) {
          var text = String(name || '').toLowerCase();
          var ev = String((l && l.nomedoevento) || '').toLowerCase();
          return !text ||
            text === 'course module viewed' ||
            text === 'mÃƒÂ³dulo do curso visualizado' ||
            text === 'modulo do curso visualizado' ||
            text === 'submission graded' ||
            text === 'submissÃƒÂ£o avaliada' ||
            text === 'submissao avaliada' ||
            ev === 'course module viewed' ||
            ev === 'mÃƒÂ³dulo do curso visualizado' ||
            ev === 'modulo do curso visualizado';
        }
        function hmResolvedResourceName(l, list) {
          var name = hmResourceName(l);
          if (!hmIsGenericResourceName(name, l)) return name;
          var cmid = hmCourseModuleId(l);
          if (cmid) {
            var match = (list || []).filter(function(other) {
              return other !== l && hmCourseModuleId(other) === cmid && !hmIsGenericResourceName(hmResourceName(other), other);
            })[0];
            if (match) return hmResourceName(match);
          }
          var mod = hmModuleType(l);
          var modMatch = (list || []).filter(function(other) {
            return other !== l && mod && hmModuleType(other) === mod && !hmIsGenericResourceName(hmResourceName(other), other);
          })[0];
          return modMatch ? hmResourceName(modMatch) : '';
        }
        function hmModuleType(l) {
          var source = String((l && (l._modtype || l.componente || l.component || l.contextodoevento || l.nomedoevento)) || '').toLowerCase();
          if (source.indexOf('h5p') >= 0 || source.indexOf('hvp') >= 0 || source.indexOf('interativo') >= 0) return 'h5pactivity';
          if (source.indexOf('quiz') >= 0 || source.indexOf('question') >= 0 || source.indexOf('question') >= 0) return 'quiz';
          if (source.indexOf('forum') >= 0 || source.indexOf('fÃƒÆ’Ã‚Â³rum') >= 0 || source.indexOf('fÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â³rum') >= 0) return 'forum';
          if (source.indexOf('assign') >= 0 || source.indexOf('tarefa') >= 0) return 'assign';
          if (source.indexOf('page') >= 0 || source.indexOf('pÃƒÆ’Ã‚Â¡gina') >= 0 || source.indexOf('pÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¡gina') >= 0) return 'page';
          if (source.indexOf('resource') >= 0 || source.indexOf('arquivo') >= 0) return 'resource';
          if (source.indexOf('url') >= 0) return 'url';
          if (source.indexOf('scorm') >= 0) return 'scorm';
          return '';
        }
        function hmCourseModuleId(l) {
          var explicit = Number(l && (l.cmid || l._cmid || l.coursemoduleid || l.course_module_id || 0));
          if (explicit > 0) return explicit;
          var desc = String((l && (l.descricao || l.descrio || l.description)) || '');
          var m = desc.match(/course module id(?:\s|&#039;|')+(\d+)/i);
          return m ? Number(m[1]) : 0;
        }
        function hmActivityLinkFromConfig(resourceName, modType) {
          var cfg = Store.getConfig ? Store.getConfig() : {};
          var links = cfg.activitylinks || [];
          var target = norm(resourceName);
          var targetLower = lower(target);
          var wantedMod = lower(modType);
          if (!targetLower || !links.length) return null;
          function cleanName(v) {
            return lower(String(v || '').replace(/^(conteudo interativo|conteÃƒÂºdo interativo|h5p|hvp|quiz|questionario|questionÃƒÂ¡rio|forum|fÃƒÂ³rum|tarefa|assign|pagina|pÃƒÂ¡gina|page)\s*:\s*/i, '').trim());
          }
          var targetClean = cleanName(target);
          var best = null;
          links.forEach(function(link) {
            if (best || !link || !link.url) return;
            var name = norm(link.name);
            var linkClean = cleanName(name);
            var linkMod = lower(link.modname || '');
            var modOk = !wantedMod ||
              wantedMod === linkMod ||
              (wantedMod === 'h5pactivity' && (linkMod === 'h5pactivity' || linkMod === 'hvp')) ||
              (wantedMod === 'hvp' && (linkMod === 'hvp' || linkMod === 'h5pactivity'));
            if (!modOk) return;
            if (linkClean === targetClean ||
                linkClean.indexOf(targetClean) >= 0 ||
                targetClean.indexOf(linkClean) >= 0 ||
                lower(name).indexOf(targetLower) >= 0 ||
                targetLower.indexOf(lower(name)) >= 0) {
              best = link;
            }
          });
          return best;
        }
        function hmActivityUrl(l, resourceName) {
          var direct = l && (l.url || l.contexturl || l.eventurl || l.link || '');
          if (direct && /^https?:\/\//i.test(String(direct))) return String(direct);
          if (direct && /^\//.test(String(direct))) {
            var cfgDirect = Store.getConfig ? Store.getConfig() : {};
            var rootDirect = String(cfgDirect.wwwroot || '').replace(/\/+$/, '');
            if (rootDirect) return rootDirect + String(direct);
          }
          var cmid = hmCourseModuleId(l);
          var mod = hmModuleType(l);
          var raw = lower([
            l && l.descricao,
            l && l.descrio,
            l && l.description,
            l && l.nomedoevento,
            l && l.componente,
            l && l.component
          ].join(' '));
          var isLegacyHvp = raw.indexOf('mod_hvp') >= 0 ||
            raw.indexOf("'hvp'") >= 0 ||
            raw.indexOf('&#039;hvp&#039;') >= 0 ||
            raw.indexOf(' hvp ') >= 0 ||
            raw.indexOf('h5p') >= 0;
          if (isLegacyHvp && cmid > 0) {
            var cfgHvp = Store.getConfig ? Store.getConfig() : {};
            var rootHvp = String(cfgHvp.wwwroot || '').replace(/\/+$/, '');
            if (rootHvp) return rootHvp + '/mod/hvp/view.php?id=' + cmid;
          }
          var configured = hmActivityLinkFromConfig(resourceName || hmResourceName(l), mod);
          if (configured && configured.url) return configured.url;
          if ((!cmid || !mod) && resourceName) {
            var matched = (state.activities || []).filter(function(a) {
              return norm(a.name) === norm(resourceName);
            })[0];
            if (matched) {
              cmid = cmid || Number(matched.cmid || 0);
              mod = mod || hmModuleType(matched) || String(matched.modtype || '').toLowerCase();
            }
          }
          var cfg = Store.getConfig ? Store.getConfig() : {};
          var wwwroot = String(cfg.wwwroot || '').replace(/\/+$/, '');
          var map = {assign:'assign', forum:'forum', quiz:'quiz', page:'page', resource:'resource', url:'url', scorm:'scorm', h5pactivity:'h5pactivity', hvp:'hvp'};
          if (mod === 'h5pactivity' && isLegacyHvp) {
            mod = 'hvp';
          }
          if (!wwwroot || !cmid || !map[mod]) return '';
          return wwwroot + '/mod/' + map[mod] + '/view.php?id=' + cmid;
        }
        function hmResolveStudentName(name) {
          var raw = String(name || '').trim();
          if (!raw) return '';
          var candidates = [];
          function add(v) {
            var value = String(v || '').trim();
            if (value && candidates.indexOf(value) === -1) candidates.push(value);
          }
          (state.students || []).forEach(function(s) {
            add(s && (s.name || s.fullname || s.student_name || s.nomecompleto));
          });
          (state.logs || []).forEach(function(l) {
            add(l && (l.nomecompleto || l.student_name || l.userfullname || l.fullname || l.name || l.aluno));
          });
          (state.grades || []).forEach(function(g) {
            if (!g || g.__mwa_type__ === 'activity_names') return;
            add(g.student_name || g.name || g.nomecompleto || g.Aluno || ((g['First name'] || '') + ' ' + (g['Last name'] || '')).trim());
          });
          var wanted = raw.toLowerCase();
          var exact = candidates.filter(function(n) { return n.toLowerCase() === wanted; })[0];
          if (exact) return exact;
          var first = candidates.filter(function(n) {
            return String(n).split(/\s+/)[0].toLowerCase() === wanted;
          });
          return first.length === 1 ? first[0] : raw;
        }

        function hmGoToProfile(name) {
          var full = hmResolveStudentName(name);
          if (!full) return;
          if (window.showPage) window.showPage('studentprofile');
          if (Modules.Profile && Modules.Profile.render) Modules.Profile.render();
          var attempts = 0;
          function open() {
            var sel = document.getElementById('spStudentSel');
            if (!sel) {
              if (attempts++ < 15) setTimeout(open, 120);
              return;
            }
            if (sel.options.length <= 1 && Modules.Profile && Modules.Profile.render) {
              Modules.Profile.render();
            }
            full = hmResolveStudentName(full);
            var wanted = full.toLowerCase();
            var opt = Array.prototype.slice.call(sel.options).filter(function(o) {
              return String(o.value || '').trim().toLowerCase() === wanted ||
                String(o.text || '').trim().toLowerCase() === wanted;
            })[0];
            if (opt) {
              sel.value = opt.value;
              if (Modules.Profile && Modules.Profile.loadProfile) {
                Modules.Profile.loadProfile(opt.value);
              } else if (window.MWAProfile && window.MWAProfile.loadProfile) {
                window.MWAProfile.loadProfile(opt.value);
              }
              return;
            }
            if (attempts++ < 15) setTimeout(open, 120);
          }
          setTimeout(open, 80);
        }
        function hmDateRange() {
          var wrap = document.getElementById('heatmapDateFilters');
          var active = wrap ? wrap.querySelector('[data-hm-range].btn-accent,[data-hm-range].active') : null;
          var range = active ? active.getAttribute('data-hm-range') : '7';
          var now = new Date();
          var start = null, end = new Date(now.getTime() + 86400000);
          if (range === 'today') {
            start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          } else if (range === '30') {
            start = new Date(now.getTime() - 30 * 86400000);
          } else if (range === 'month') {
            start = new Date(now.getFullYear(), now.getMonth(), 1);
          } else if (range === 'custom') {
            var s = document.getElementById('heatmapStartDate');
            var e = document.getElementById('heatmapEndDate');
            start = s && s.value ? new Date(s.value + 'T00:00:00') : null;
            end = e && e.value ? new Date(e.value + 'T23:59:59') : end;
          } else {
            start = new Date(now.getTime() - 7 * 86400000);
          }
          return {range: range, start: start, end: end};
        }
        function hmInRange(d, range) {
          if (!d) return false;
          if (range.start && d < range.start) return false;
          if (range.end && d > range.end) return false;
          return true;
        }
        function renderHeatmap() {
          var DAYS = [tr('sun','Dom'),tr('mon','Seg'),tr('tue','Ter'),tr('wed','Qua'),
                      tr('thu','Qui'),tr('fri','Sex'),tr('sat','Sab')];

          var selStudent = document.getElementById('heatmapStudentSel');
          var selMod     = document.getElementById('heatmapModSel');
          var selMode    = document.getElementById('heatmapModeSel');
          var searchInput = document.getElementById('heatmapSearchInput');
          var studentFilter = selStudent ? selStudent.value : '';
          var modFilter     = selMod     ? selMod.value     : '';
          var mode          = selMode    ? selMode.value    : 'access';
          function appendHmTip(node, key, fallback) {
            if (!node || node.querySelector('.mwa-help-tip')) return;
            var tipNode = helpTipNode(tr(key, fallback));
            if (tipNode) node.appendChild(tipNode);
          }
          function ensureHeatmapCardTooltips() {
            var page = document.getElementById('page-heatmap');
            if (!page) return;
            [
              ['day_hour', 'hm_tip_card_day_hour', 'Mostra a distribuicao de acessos por dia e hora.'],
              ['hm_insights_title', 'hm_tip_card_insights', 'Resume automaticamente os principais padroes do heatmap.'],
              ['hm_grades_title', 'hm_tip_card_grades', 'Compara horario de acesso com media de notas.'],
              ['hm_besttime_title', 'hm_tip_card_besttime', 'Sugere a melhor janela para enviar intervencoes.']
            ].forEach(function(item) {
              var title = page.querySelector('[data-i18n="' + item[0] + '"]');
              if (!title) return;
              if (!title.parentNode.querySelector('.mwa-help-tip')) {
                var tipNode = helpTipNode(tr(item[1], item[2]));
                if (tipNode) title.parentNode.insertBefore(tipNode, title.nextSibling);
              }
              title.classList.add('hm-card-title');
            });
          }
          ensureHeatmapCardTooltips();
          var dateWrap = document.getElementById('heatmapDateFilters');
          if (dateWrap && !dateWrap.dataset.hmInit) {
            dateWrap.dataset.hmInit = '1';
            dateWrap.addEventListener('click', function(ev) {
              var btn = ev.target.closest('[data-hm-range]');
              if (!btn) return;
              dateWrap.querySelectorAll('[data-hm-range]').forEach(function(b) {
                b.className = b === btn ? 'btn-accent' : 'btn-ghost';
                b.classList.toggle('active', b === btn);
              });
              renderHeatmap();
            });
            ['heatmapStartDate','heatmapEndDate'].forEach(function(id) {
              var input = document.getElementById(id);
              if (input) input.addEventListener('change', function() {
                var custom = dateWrap.querySelector('[data-hm-range="custom"]');
                if (custom) custom.click();
                else renderHeatmap();
              });
            });
          }

          if (selStudent && selStudent.options.length === 0) {
            var optAll = document.createElement('option');
            optAll.value = ''; optAll.textContent = tr('hm_filter_all_students');
            selStudent.appendChild(optAll);
            state.students.forEach(function(s) {
              var opt = document.createElement('option');
              opt.value = norm(s.name); opt.textContent = s.name;
              selStudent.appendChild(opt);
            });
          }
          if (selMod && selMod.options.length === 0) {
            [
              {v:'',  l:tr('hm_filter_all_resources','Todos os recursos')},
              {v:'quiz',        l:tr('hm_filter_quiz','Questionarios')},
              {v:'forum',       l:tr('hm_filter_forum','Foruns')},
              {v:'resource',    l:tr('hm_filter_resource','Arquivos')},
              {v:'url',         l:tr('hm_filter_url','URLs')},
              {v:'page',        l:tr('hm_filter_page','Paginas')},
              {v:'h5pactivity', l:tr('hm_filter_h5p','H5P')},
              {v:'scorm',       l:tr('hm_filter_scorm','SCORM')},
              {v:'video',       l:tr('hm_filter_video','Videos')}
            ].forEach(function(o){
              var opt=document.createElement('option');
              opt.value=o.v; opt.textContent=o.l;
              selMod.appendChild(opt);
            });
          }
          if (selMode && selMode.options.length === 0) {
            [{v:'access',l:tr('hm_mode_access')},
             {v:'dropout',l:tr('hm_mode_dropout','Abandono')}]
            .forEach(function(o){
              var opt=document.createElement('option');
              opt.value=o.v; opt.textContent=o.l;
              selMode.appendChild(opt);
            });
          }

          if (searchInput && !searchInput.dataset.hmInit) {
            searchInput.dataset.hmInit = '1';
            searchInput.addEventListener('input', function() {
              clearTimeout(window.MWAHeatmapSearchTimer);
              window.MWAHeatmapSearchTimer = setTimeout(renderHeatmap, 180);
            });
          }

          var range = hmDateRange();
          var logs = state.logs.filter(function(l) {
            var d = parseDate(l);
            if (!hmInRange(d, range)) return false;
            if (studentFilter && norm(l.nomecompleto) !== studentFilter) return false;
            if (modFilter && (norm(l._modtype || hmModuleType(l))||'').toLowerCase().indexOf(modFilter) < 0) return false;
            var q = searchInput ? lower(searchInput.value) : '';
            if (q) {
              var hay = lower([
                l.nomecompleto,
                l.email,
                l.contextodoevento,
                l.eventcontext,
                l.context,
                l.nomedoevento,
                l.componente,
                l.component,
                l._modtype,
                hmResolvedResourceName(l, state.logs)
              ].join(' '));
              if (hay.indexOf(q) < 0) return false;
            }
            return true;
          });

          var grid = {};
          var lastGrid = {};
          var cellBuckets = {};
          var weekTrend = [{},{}];
          var now = new Date();
          var weekAgo  = new Date(now - 7*86400000);
          var twoWeeks = new Date(now - 14*86400000);

          logs.forEach(function(l) {
            var d = parseDate(l);
            if (!d) return;
            var key = d.getDay() + ':' + d.getHours();
            if (!cellBuckets[key]) cellBuckets[key] = [];
            cellBuckets[key].push(l);

            if (mode === 'access') {
              grid[key] = (grid[key]||0) + 1;
            } else {
              var uid = norm(l.nomecompleto);
              if (!lastGrid[uid] || d > lastGrid[uid].date) {
                lastGrid[uid] = {date: d, key: key};
              }
            }

            if (d >= twoWeeks && d < weekAgo) {
              weekTrend[0][key] = (weekTrend[0][key]||0) + 1;
            } else if (d >= weekAgo) {
              weekTrend[1][key] = (weekTrend[1][key]||0) + 1;
            }
          });

          if (mode === 'dropout') {
            Object.keys(lastGrid).forEach(function(uid) {
              var k = lastGrid[uid].key;
              grid[k] = (grid[k]||0) + 1;
            });
          }

          var max = Math.max(1, Math.max.apply(null, Object.values(grid).concat([0])));

          function heatClass(v) {
            if (!v) return '';
            if (v/max > 0.75) return 'v5';
            if (v/max > 0.50) return 'v4';
            if (v/max > 0.25) return 'v3';
            if (v/max > 0.08) return 'v2';
            return 'v1';
          }

          var deadlines = {};
          for (var d2=0; d2<7; d2++) {
            for (var h=0; h<24; h++) {
              var v    = grid[d2+':'+h]     || 0;
              var vPre = grid[d2+':'+(h-1)] || 0;
              var vNxt = grid[d2+':'+(h+1)] || 0;
              if (v > 0 && v/max > 0.7 && v > vPre * 2 && v > vNxt * 2) {
                deadlines[d2+':'+h] = true;
              }
            }
          }

          function hmUniqueStudents(list) {
            var seen = {};
            return (list || []).map(function(l) {
              var name = hmLogName(l);
              if (!name || name === '-') return null;
              var s = hmStudentByName(name) || {};
              var key = norm(name);
              if (seen[key]) return null;
              seen[key] = 1;
              return {name: name, email: s.email || '', userid: Number(s.userid || 0), pictureurl: s.pictureurl || s.profileimageurl || ''};
            }).filter(Boolean);
          }
          function hmTopResources(list) {
            var map = {};
            (list || []).forEach(function(l) {
              var name = hmResolvedResourceName(l, list);
              if (!name) return;
              if (/^curso:/i.test(String(l.contextodoevento || '')) || /course viewed|curso visto/i.test(String(l.nomedoevento || ''))) return;
              if (hmIsGenericResourceName(name, l)) return;
              var key = norm(name) + '|' + hmModuleType(l);
              if (!map[key]) map[key] = {name: name, type: hmModuleType(l), count: 0, url: hmActivityUrl(l, name)};
              map[key].count++;
              if (!map[key].url) map[key].url = hmActivityUrl(l, name);
            });
            return Object.keys(map).map(function(k){ return map[k]; }).sort(function(a,b){ return b.count-a.count; });
          }
          function hmOpenMessage(students) {
            if (!students || !students.length) return;
            if (window.MWAActionCenter && window.MWAActionCenter.openBulkModal) {
              window.MWAActionCenter.openBulkModal(students);
            }
          }
          function hmOpenProfiles(students) {
            if (!students || !students.length) return;
            if (window.goToStudentProfile) {
              window.goToStudentProfile(students[0].name);
            } else if (window.showPage) {
              window.showPage('studentprofile');
            }
          }
          function renderHmDetail(title, list, extra) {
            var detail = document.getElementById('heatmapDetail');
            if (!detail) return;
            var students = hmUniqueStudents(list);
            var resources = hmTopResources(list).slice(0, 8);
            var totalLogs = (list || []).length;
            var studentChips = students.length ? students.map(function(s) {
              return '<button type="button" class="hm-chip" data-hm-profile="' + esc(s.name) + '" title="' + esc(s.name) + '">' + esc(firstName(s.name)) + '</button>';
            }).join('') : '<span class="hm-muted">' + tr('hm_detail_empty') + '</span>';
            var studentHtml = students.length
              ? '<details class="hm-name-section"><summary><span>' + tr('hm_detail_students') + '</span><strong>' + students.length + '</strong><em>Ver nomes</em></summary><div class="hm-chip-row">' + studentChips + '</div></details>'
              : '<span class="hm-muted">' + tr('hm_detail_empty') + '</span>';
            var resourceHtml = resources.length ? resources.map(function(r) {
              var label = esc(r.name);
              var meta = esc((r.type || tr('type')) + ' - ' + r.count + ' ' + tr('accesses'));
              return '<div class="hm-resource-row">' + (r.url ? '<a href="' + esc(r.url) + '" target="_blank" rel="noopener">' + label + '</a>' : '<span>' + label + '</span>') + '<small>' + meta + '</small></div>';
            }).join('') : '<span class="hm-muted">' + tr('hm_no_data_simple') + '</span>';
            var body = '<div class="card-head"><span>' + esc(title) + '</span></div>'
              + '<div class="card-body hm-detail-body">'
              + '<div class="hm-detail-stats"><div><strong>' + students.length + '</strong><span>' + tr('hm_students_in_slot') + '</span></div><div><strong>' + totalLogs + '</strong><span>' + tr('hm_accesses_in_slot') + '</span></div></div>'
              + '<div class="hm-detail-grid"><div><h4>' + tr('hm_detail_students') + '</h4>' + studentHtml + '</div>'
              + '<div><h4>' + tr('hm_detail_activities') + '</h4><div class="hm-resource-list">' + resourceHtml + '</div></div></div>'
              + '<div class="hm-detail-actions"><button type="button" class="btn-accent" data-hm-message="1">' + tr('hm_msg_this_time') + '</button></div>'
              + '</div>';
            Store.renderHtml(detail, body);
            detail.dataset.hmStudents = JSON.stringify(students);
            detail.dataset.hmSuggestion = '';
            detail.style.display = 'block';
            detail.onclick = function(ev) {
              var profile = ev.target.closest('[data-hm-profile]');
              var action = ev.target.closest('[data-hm-message]');
              var targets = [];
              try { targets = JSON.parse(detail.dataset.hmStudents || '[]'); } catch (e) { targets = []; }
              if (profile) {
                hmGoToProfile(profile.getAttribute('data-hm-profile'));
                return;
              }
              if (!action) return;
              if (action.hasAttribute('data-hm-message')) {
                hmOpenMessage(targets);
              }
            };
          }
          function hmStoreDetail(kind, data) {
            window.MWAHeatmapDetailState = {kind: kind, data: data || {}};
          }
          function hmRestoreDetail() {
            var saved = window.MWAHeatmapDetailState || null;
            if (saved && saved.kind === 'cell') {
              var key = saved.data && saved.data.key;
              if (key) {
                var parts = key.split(':');
                renderHmDetail(tr('hm_detail_title','Detalhe do horario') + ': ' + DAYS[Number(parts[0])] + ' ' + parts[1] + 'h', cellBuckets[key] || [], {});
                return;
              }
            }
            if (saved && saved.kind === 'after') {
              var night = logs.filter(function(l){ var d=parseDate(l); return d && d.getHours() >= 18; });
              renderHmDetail(tr('hm_afterhours_action'), night, {});
              return;
            }
            if (saved && saved.kind === 'filtered') {
              renderHmDetail(tr('hm_filtered_action'), logs, {});
              return;
            }
            if (saved && saved.kind === 'all') {
              renderHmDetail(tr('hm_all_action','Todos os logs carregados'), state.logs, {});
              return;
            }
            if (saved && saved.kind === 'grade') {
              var bucket = saved.data && saved.data.bucket;
              renderHmDetail(tr('hm_grades_title') + ': ' + bucket, hourGradeLogs[bucket] || [], {});
              return;
            }
            var bestLogs = logs.filter(function(l){ var d=parseDate(l); return d && d.getHours() >= best2hStart && d.getHours() < best2hStart + 2; });
            renderHmDetail(tr('hm_besttime_title','Melhor horario para intervir') + ': ' + best2hStart + 'h-' + (best2hStart+2) + 'h', bestLogs, {});
            hmStoreDetail('besttime', {});
          }

          var html = '<div class="h"></div>';
          for (var h2=0; h2<24; h2++) html += '<div class="h">' + h2 + 'h</div>';

          for (var d3=0; d3<7; d3++) {
            html += '<div class="h">' + DAYS[d3] + '</div>';
            for (var h3=0; h3<24; h3++) {
              var v3   = grid[d3+':'+h3] || 0;
              var cls  = heatClass(v3);
              var prev = weekTrend[0][d3+':'+h3] || 0;
              var curr = weekTrend[1][d3+':'+h3] || 0;
              var trend = (prev > 0 && curr > prev*1.3) ? ' +' : (prev > 0 && curr < prev*0.7) ? ' -' : '';
              var deadline = deadlines[d3+':'+h3];
              var label = v3 ? (v3 + trend + (deadline ? '<span class="hm-deadline-dot"></span>' : '')) : '';
              var tip = DAYS[d3] + ' ' + h3 + 'h: ' + v3 + ' '+(v3===1?tr('hm_access_count','{n} acesso').replace('{n}',''):tr('hm_accesses_count').replace('{n}','')) +
                        (trend === ' +' ? ' (+'+tr('hm_trend_up','tendencia de alta')+')' : trend === ' -' ? ' (-'+tr('hm_trend_down','tendencia de baixa')+')' : '') +
                        (deadline ? ' - '+tr('hm_possible_deadline','possivel prazo!') : '');
              html += '<div class="hm-cell ' + cls + (deadlines[d3+':'+h3]?' hm-deadline':'') +
                      '" data-hm-cell="' + d3 + ':' + h3 + '" data-tip="' + esc(tip) + '" role="button" tabindex="0">' + label + '</div>';
            }
          }

          var box = $('heatmap');
          if (box) Store.renderHtml(box, html);

          if (box) {
            box.onmouseover = function(e) {
              var cell = e.target.closest('[data-tip]');
              var tip  = document.getElementById('heatmapTooltip');
              if (cell && tip) {
                tip.textContent = cell.getAttribute('data-tip');
                tip.style.display = 'block';
              }
            };
            box.onmouseout = function() {
              var tip = document.getElementById('heatmapTooltip');
              if (tip) tip.style.display = 'none';
            };
            box.onclick = function(e) {
              var cell = e.target.closest('[data-hm-cell]');
              if (!cell) return;
              box.querySelectorAll('.hm-cell.is-selected').forEach(function(x){ x.classList.remove('is-selected'); });
              cell.classList.add('is-selected');
              var key = cell.getAttribute('data-hm-cell');
              var parts = key.split(':');
              var title = tr('hm_detail_title','Detalhe do horario') + ': ' + DAYS[Number(parts[0])] + ' ' + parts[1] + 'h';
              hmStoreDetail('cell', {key: key});
              renderHmDetail(title, cellBuckets[key] || [], {
                suggestion: tr('hm_ai_default_suggestion')
              });
            };
            box.onkeydown = function(e) {
              if ((e.key === 'Enter' || e.key === ' ') && e.target && e.target.matches('[data-hm-cell]')) {
                e.preventDefault();
                e.target.click();
              }
            };
          }

          var total = Object.values(grid).reduce(function(a,b){return a+b;},0);
          var afterHours = 0;
          for (var d4=0; d4<7; d4++) {
            for (var h4=18; h4<24; h4++) afterHours += (grid[d4+':'+h4]||0);
          }
          var pctAfter = total > 0 ? Math.round(afterHours/total*100) : 0;

          var hourTotals = Array(24).fill(0);
          for (var d5=0; d5<7; d5++) {
            for (var h5=0; h5<24; h5++) hourTotals[h5] += (grid[d5+':'+h5]||0);
          }
          var bestH = hourTotals.indexOf(Math.max.apply(null, hourTotals));
          var peakKey = '0:' + bestH, peakValue = -1;
          Object.keys(grid).forEach(function(k) {
            if ((grid[k] || 0) > peakValue) { peakValue = grid[k] || 0; peakKey = k; }
          });

          var best2h = 0, best2hStart = 0;
          for (var h6=0; h6<23; h6++) {
            var sum2 = hourTotals[h6] + hourTotals[h6+1];
            if (sum2 > best2h) { best2h = sum2; best2hStart = h6; }
          }

          var kpiBox = document.getElementById('heatmapKpis');
          if (kpiBox) {
            Store.renderHtml(kpiBox, '<button type="button" class="hm-kpi" data-hm-kpi="after"><div class="hm-kpi-val">' + pctAfter + '%</div>'
              + '<div class="hm-kpi-lbl">'+tr('hm_kpi_after_hours')+'</div></button>'
              + '<button type="button" class="hm-kpi" data-hm-kpi="peak" data-hm-key="' + esc(peakKey) + '"><div class="hm-kpi-val">' + bestH + 'h</div>'
              + '<div class="hm-kpi-lbl">'+tr('hm_kpi_peak_hour','horario de pico')+'</div></button>'
              + '<button type="button" class="hm-kpi" data-hm-kpi="filtered"><div class="hm-kpi-val">' + total + '</div>'
              + '<div class="hm-kpi-lbl">'+tr('hm_kpi_filtered')+'</div></button>'
              + '<button type="button" class="hm-kpi" data-hm-kpi="all"><div class="hm-kpi-val">' + state.logs.length + '</div>'
              + '<div class="hm-kpi-lbl">'+tr('hm_kpi_total_logs','total de logs')+'</div></button>');
          }

          if (kpiBox) {
            [
              ['hm_tip_kpi_after_hours', 'Percentual dos acessos filtrados que ocorreram apos as 18h.'],
              ['hm_tip_kpi_peak_hour', 'Hora do dia com maior volume de acessos.'],
              ['hm_tip_kpi_filtered', 'Quantidade de acessos considerada apos aplicar os filtros.'],
              ['hm_tip_kpi_total_logs', 'Total de registros carregados do Moodle antes dos filtros.']
            ].forEach(function(item, idx) {
              appendHmTip(kpiBox.querySelectorAll('.hm-kpi-lbl')[idx], item[0], item[1]);
            });
            kpiBox.onclick = function(ev) {
              var btn = ev.target.closest('[data-hm-kpi]');
              if (!btn) return;
              var kind = btn.getAttribute('data-hm-kpi');
              if (kind === 'peak') {
                var key = btn.getAttribute('data-hm-key') || peakKey;
                var parts = key.split(':');
                renderHmDetail(tr('hm_peak_action','Hor?rio de pico') + ': ' + DAYS[Number(parts[0])] + ' ' + parts[1] + 'h', cellBuckets[key] || [], {
                  suggestion: tr('hm_peak_suggestion','Concentre avisos e lembretes pr?ximos deste hor?rio, quando h? maior chance de leitura.')
                });
                hmStoreDetail('cell', {key: key});
              } else if (kind === 'after') {
                var night = logs.filter(function(l){ var d=parseDate(l); return d && d.getHours() >= 18; });
                hmStoreDetail('after', {});
                renderHmDetail(tr('hm_afterhours_action'), night, {
                  suggestion: tr('hm_afterhours_suggestion')
                });
              } else if (kind === 'filtered') {
                hmStoreDetail('filtered', {});
                renderHmDetail(tr('hm_filtered_action'), logs, {
                  suggestion: tr('hm_filtered_suggestion')
                });
              } else {
                hmStoreDetail('all', {});
                renderHmDetail(tr('hm_all_action','Todos os logs carregados'), state.logs, {
                  suggestion: tr('hm_all_suggestion')
                });
              }
            };
          }
          var insights = [];
          var peakDay = 0, peakDaySum = 0;
          for (var d6=0; d6<7; d6++) {
            var ds = 0;
            for (var h7=0; h7<24; h7++) ds += (grid[d6+':'+h7]||0);
            if (ds > peakDaySum) { peakDaySum = ds; peakDay = d6; }
          }
          if (total > 0) {
            insights.push('- '+tr('hm_peak_insight','Pico de acesso em {day} as {hour}h.').replace('{day}',DAYS[peakDay]).replace('{hour}',String(bestH)));
            insights.push('- '+tr('hm_after18_insight').replace('{pct}',String(pctAfter)));
            insights.push('- '+tr('hm_besttime_insight','Melhor horario para enviar mensagens: {start}h-{end}h.').replace('{start}',String(best2hStart)).replace('{end}',String(best2hStart+2)));
            var deadlineCount = Object.keys(deadlines).length;
            if (deadlineCount > 0) {
              insights.push('- '+tr('hm_deadline_insight','Detectados {n} possiveis prazos com pico de acesso.').replace('{n}',String(deadlineCount)));
            }
            var prevTotal = Object.values(weekTrend[0]).reduce(function(a,b){return a+b;},0);
            var currTotal = Object.values(weekTrend[1]).reduce(function(a,b){return a+b;},0);
            if (prevTotal > 0) {
              var chg = Math.round((currTotal-prevTotal)/prevTotal*100);
              insights.push((chg>=0?'+':'-')+' '+tr('hm_trend_insight','Tendencia semanal: {pct}% em relacao a semana anterior.').replace('{pct}',(chg>=0?'+':'')+String(chg)));
            }
          } else {
            insights.push(tr('hm_no_data'));
          }
          var insBox = document.getElementById('heatmapInsights');
          if (insBox) Store.renderHtml(insBox, insights.map(function(i){ return '<p style="margin:0 0 8px;font-size:.85rem;line-height:1.5;">'+i+'</p>'; }).join(''));

          var hourGrades = {};
          var hourGradeLogs = {};
          state.students.forEach(function(s) {
            if (s.grade === null) return;
            var uHours = Array(24).fill(0);
            var uLogs = logs.filter(function(l){ return norm(l.nomecompleto) === norm(s.name); });
            uLogs
              .forEach(function(l){ var d=parseDate(l); if(d) uHours[d.getHours()]++; });
            var uBest = uHours.indexOf(Math.max.apply(null,uHours));
            var bucket = uBest<12?tr('hm_morning','Manha (6h-12h)'):uBest<18?tr('hm_afternoon','Tarde (12h-18h)'):tr('hm_evening','Noite (18h-24h)');
            if (!hourGrades[bucket]) hourGrades[bucket] = [];
            if (!hourGradeLogs[bucket]) hourGradeLogs[bucket] = [];
            hourGrades[bucket].push(s.grade);
            hourGradeLogs[bucket] = hourGradeLogs[bucket].concat(uLogs);
          });
          var gcHTML = '';
          Object.keys(hourGrades).sort().forEach(function(bucket) {
            var grades = hourGrades[bucket];
            var avg = Math.round(grades.reduce(function(a,b){return a+b;},0)/grades.length*10)/10;
            gcHTML += '<button type="button" class="hm-grade-row" data-hm-grade-bucket="' + esc(bucket) + '" style="display:flex;justify-content:space-between;align-items:center;'
              + 'padding:7px 0;border-bottom:1px solid var(--line);font-size:.82rem;">'
              + '<span>' + bucket + '</span>'
              + '<strong style="color:' + (avg>=70?'var(--green)':avg>=50?'var(--amber)':'var(--red)') + ';">'
              + tr('hm_grade_avg','Media') + ' ' + avg + '</strong></button>';
          });
          var gcBox = document.getElementById('heatmapGradeCorr');
          if (gcBox) Store.renderHtml(gcBox, gcHTML || '<p style="color:var(--muted);font-size:.82rem;">'+tr('hm_insufficient_data','Dados insuficientes.')+'</p>');
          if (gcBox) {
            gcBox.onclick = function(ev) {
              var row = ev.target.closest('[data-hm-grade-bucket]');
              if (!row) return;
              var bucket = row.getAttribute('data-hm-grade-bucket');
              hmStoreDetail('grade', {bucket: bucket});
              renderHmDetail(tr('hm_grades_title') + ': ' + bucket, hourGradeLogs[bucket] || [], {
                suggestion: tr('hm_grade_suggestion')
              });
            };
          }

          var btBox = document.getElementById('heatmapBestTime');
          if (btBox && total > 0) {
            var pct2h = total > 0 ? Math.round(best2h/total*100) : 0;
            Store.renderHtml(btBox, '<button type="button" class="hm-besttime-action" data-hm-besttime="1"><div style="font-size:2rem;font-weight:900;color:var(--blue);letter-spacing:-.04em;">'
              + best2hStart + 'h-' + (best2hStart+2) + 'h</div>'
              + '<p style="margin:6px 0 0;font-size:.82rem;color:var(--muted);">'
              + '<strong>' + pct2h + '%</strong> '+tr('hm_besttime_desc')+'<br>'
              + tr('hm_besttime_tip','Envie mensagens antes desse horario para maior chance de leitura.')+'</p></button>');
            btBox.onclick = function(ev) {
              if (!ev.target.closest('[data-hm-besttime]')) return;
              var bestLogs = logs.filter(function(l){ var d=parseDate(l); return d && d.getHours() >= best2hStart && d.getHours() < best2hStart + 2; });
              hmStoreDetail('besttime', {});
              renderHmDetail(tr('hm_besttime_title','Melhor horario para intervir') + ': ' + best2hStart + 'h-' + (best2hStart+2) + 'h', bestLogs, {
                suggestion: tr('hm_besttime_action_suggestion')
              });
            };
          } else if (btBox) {
            Store.renderHtml(btBox, '<p style="color:var(--muted);font-size:.82rem;">'+tr('hm_no_data_simple')+'</p>');
          }

          var leg = document.getElementById('heatmapLegend');
          if (leg) {
            Store.renderHtml(leg, '<span class="hm-leg-item hm-leg-0">0</span>'
              + '<span class="hm-leg-item v1">1-5</span>'
              + '<span class="hm-leg-item v2">6-15</span>'
              + '<span class="hm-leg-item v3">16-30</span>'
              + '<span class="hm-leg-item v4">31-60</span>'
              + '<span class="hm-leg-item v5">60+</span>');
          }
          hmRestoreDetail();
        }

        function renderReport(){var el=$('reportBody');if(!el)return;var risk=state.students.filter(function(s){return s.score<=40}).length;var medium=state.students.filter(function(s){return s.score>40&&s.score<70}).length;var high=state.students.filter(function(s){return s.score>=70}).length;Store.renderHtml(el, '<p><strong>'+tr('total_students','Total students')+':</strong> '+state.students.length+'</p><p><strong>'+tr('total_interactions','Total interactions')+':</strong> '+state.logs.length+'</p><p><strong>'+tr('activities_detected','Activities detected')+':</strong> '+state.activities.length+'</p><p><strong>'+tr('engagement_groups','Engagement groups')+':</strong> '+risk+' '+tr('low','low')+', '+medium+' '+tr('average')+', '+high+' '+tr('high','high')+'.</p><p class=\"muted\">'+tr('report_note','This report uses stable Moodle data fields.')+'</p>');}
        function renderAll(){buildModel();dashboard.state=state;Store.setDashboard(dashboard);renderKPIs();if(Modules.ActionCenter){Modules.ActionCenter.renderEngagement();Modules.ActionCenter.render();}if(Chat){Chat.render();}renderChart();renderTables();renderAlerts();renderHeatmap();renderReport();if(Modules.ClassList)Modules.ClassList.render();if(Modules.Profile)Modules.Profile.render();if(Modules.Activities)Modules.Activities.render();if(Modules.Grades)Modules.Grades.render();if(Modules.Interventions)Modules.Interventions.render();if(!document.querySelector('.page.active')){showPage('ac');}loading.style.display='none'}
        function esc(v){return String(v===undefined||v===null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
        function showPage(p){document.querySelectorAll('.page').forEach(function(x){x.classList.remove('active')});var page=$('page-'+p);if(page)page.classList.add('active');document.querySelectorAll('.nav-item').forEach(function(x){x.classList.toggle('active',x.getAttribute('data-page')===p)});if(p==='alerts'&&Modules.Alerts&&state.logs.length){Modules.Alerts.reset();Modules.Alerts.render();}if(p==='classlist'&&Modules.ClassList&&state.logs.length){Modules.ClassList.render();}if(p==='studentprofile'&&Modules.Profile&&state.logs.length){if(typeof window.MWAReloadData==='function'&&!window.MWAProfileReloading){window.MWAProfileReloading=true;window.MWAReloadData().then(function(){Modules.Profile.render();}).catch(function(){Modules.Profile.render();}).then(function(){window.MWAProfileReloading=false;});}else{Modules.Profile.render();}}if(p==='activities'&&Modules.Activities&&state.logs.length){Modules.Activities.render();}if(p==='grades'&&Modules.Grades){Modules.Grades.render();}if(p==='interventions'&&Modules.Interventions){Modules.Interventions.render();}if(p==='teacherfeedback'&&Modules.TeacherFeedback){Modules.TeacherFeedback.render();}if(p==='chat'&&Chat){Chat.render();}if(p==='heatmap'&&state.logs.length){renderHeatmap();['heatmapStudentSel','heatmapModSel','heatmapModeSel'].forEach(function(id){var el=document.getElementById(id);if(el&&!el.dataset.hmInit){el.dataset.hmInit='1';el.addEventListener('change',renderHeatmap);}});}}
        function markSeen(){state.seen=true;alert(tr('actions_marked_seen','Actions marked as seen.'));}
        Store.setHandler('showPage',showPage);
        Store.setHandler('markSeen',markSeen);
        $('todayLabel').textContent=new Date().toLocaleDateString((config.language&&config.language.indexOf('pt')===0)?'pt-BR':'en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric'});$('search').addEventListener('input',renderTables);
        function receiveData(data){try{state.logs=JSON.parse(data.logs||'[]');state.grades=JSON.parse(data.grades||'[]')}catch(err){$('loadStatus').textContent=tr('could_not_parse','Could not parse Moodle data.');return}renderAll()}function receiveError(message){$('loadStatus').textContent=message||tr('data_load_failed','Data load failed.')}dashboard.receiveData=receiveData;dashboard.receiveError=receiveError;Store.setDashboard(dashboard);
        Store.setHandler('showPage', showPage);
        Store.setHandler('markSeen', markSeen);
        Store.setHandler('toggleSelectPriority', function() { if (Modules.ActionCenter) { Modules.ActionCenter.toggleSelectPriority(); } });
        Store.setHandler('openBulkEmail', function() { if (Modules.ActionCenter) { Modules.ActionCenter.openBulkEmail(); } });
        Store.bindDomEvents(document.getElementById('block-mwa-dashboard-app'));
        return dashboard;
    };

    return {
        init: init
    };
});
