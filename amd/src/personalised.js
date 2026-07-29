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
 * @module     block_mwa_dashboard/personalised
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
define(['block_mwa_dashboard/dashboardstore','core/log'], function(Store, Log) {
    'use strict';
    var w = Store.windowFacade();

    (function(){
    'use strict';

    /* ── helpers ── */
    function tr(k,fb){var S=Store.getStrings?Store.getStrings():{};var v=Object.prototype.hasOwnProperty.call(S,k)?S[k]:'';return(v&&!/^\[\[/.test(v))?v:(fb!==undefined?fb:k);}
    function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
    function norm(v){return v==null?'':String(v).trim();}
    function $(id){return document.getElementById(id);}
    function parseDate(l){
        if(l._ts)return new Date(Number(l._ts)*1000);
        var s=norm(l.hora);var m=s.match(/(\d{2})\/(\d{2})\/(\d{2}),?\s*(\d{2}):(\d{2})/);
        if(m)return new Date(2000+Number(m[3]),Number(m[2])-1,Number(m[1]),Number(m[4]),Number(m[5]));
        return null;
    }
    function initials(name){return norm(name).split(/\s+/).filter(Boolean).slice(0,2).map(function(w){return w[0]||'';}).join('').toUpperCase()||'?';}
    function avatarColor(name){var C=['#2d6ef5','#a78bfa','#3ecf8e','#f5a623','#f06570','#2dd4bf'];var ci=Math.abs((norm(name).charCodeAt(0)||0)+(norm(name).charCodeAt(1)||0))%C.length;return C[ci];}
    function getEventType(r){
        var ev=norm(r.nomedoevento).toLowerCase();
        var comp=norm(r.componente||r.component||'');var compL=comp.toLowerCase();
        var modtype=(r._modtype||'').toLowerCase();
        if(modtype==='assign'||comp==='Tarefa'||comp==='Assignment'||compL.indexOf('tarefa')>=0||
           comp==='Envio de arquivos'||(ev.indexOf('avaliado')>=0&&(compL.indexOf('tarefa')>=0||modtype==='assign')))return 'tarefa';
        if(ev.indexOf('envio')>=0||ev.indexOf('submiss')>=0||ev.indexOf('entrega')>=0||ev.indexOf('submitted')>=0)return 'tarefa';
        if(modtype==='quiz'||modtype==='h5pactivity'||modtype==='scorm'||modtype==='lesson'||
           comp==='Questionário'||comp==='Quiz'||comp==='H5P'||comp==='Pacote H5P'||comp==='Pacote SCORM'||
           comp==='Jogo'||comp==='External tool'||comp==='Ferramenta externa - LTI'||
           compL.indexOf('questionário')>=0||compL.indexOf('scorm')>=0||compL.indexOf('h5p')>=0||
           ev.indexOf('tentativa')>=0||ev.indexOf('attempt')>=0||ev.indexOf('xapi')>=0)return 'quiz';
        if(modtype==='forum'||modtype==='glossary'||comp==='Forum'||comp==='Forum'||comp==='Glossário'||
           compL.indexOf('fórum')>=0||compL.indexOf('forum')>=0||ev.indexOf('discuss')>=0||ev.indexOf('glossári')>=0)return 'forum';
        if(modtype==='page'||modtype==='book'||modtype==='url'||modtype==='resource'||modtype==='folder'||
           comp==='Página'||comp==='Page'||comp==='Livro'||comp==='Book'||comp==='URL'||
           comp==='Arquivo'||comp==='File'||comp==='Pasta'||comp==='Folder'||
           compL==='página'||compL==='livro'||compL==='url'||compL==='arquivo'||compL==='pasta'||
           ev.indexOf('capítulo')>=0||ev.indexOf('chapter')>=0||ev.indexOf('módulo do curso visualizado')>=0||ev.indexOf('course module viewed')>=0)return 'video';
        if(modtype==='chat'||modtype==='bigbluebuttonbn'||comp==='Chat'||comp==='BigBlueButton'||compL.indexOf('bbb')>=0)return 'video';
        if(modtype==='wiki'||modtype==='data'||modtype==='workshop'||modtype==='choice'||
           comp==='Wiki'||comp==='Base de dados'||comp==='Database'||comp==='Workshop'||
           comp==='Escolha'||comp==='Choice'||comp==='Pesquisa'||comp==='Survey'||compL.indexOf('wiki')>=0)return 'forum';
        if(ev.indexOf('login')>=0||ev.indexOf('loggedin')>=0||ev.indexOf('curso visto')>=0||ev.indexOf('course viewed')>=0||
           modtype==='system'||comp==='Sistema'||comp==='System')return 'login';
        return 'outro';
    }

    /* ── estado ── */
    var PL_DATA = [];
    var PL_CACHE = {};
    var PL_FILTER = 'all';
    var PL_GENERATING = {};

    /* ── riskLabel (reuses engagement logic) ── */
    function riskLabel(score){
        if(score>=70)return {label:tr('ev_high_part','Alta participação'),cls:'badge high',ring:'#3aab7a',color:'var(--green)'};
        if(score>=40)return {label:tr('ev_med_part','Participação média'),cls:'badge medium',ring:'#5b9bd5',color:'var(--blue)'};
        return {label:tr('ev_low_part','Baixa participação'),cls:'badge low',ring:'#d95f5f',color:'var(--red)'};
    }

    /* ════════════════════════════════════════════
       plBuildProfile — portado do dashboard.html
    ════════════════════════════════════════════ */
    function plBuildProfile(name, sData, evData){
        if(!sData||!sData.length)return null;

        var hours={manha:0,tarde:0,noite:0,madrugada:0};
        var weekdays={}, dayMap={};

        sData.forEach(function(r){
            var d=r._date;if(!d)return;
            var h=d.getHours(), dw=d.getDay();
            if(h>=5&&h<12)hours.manha++;
            else if(h>=12&&h<18)hours.tarde++;
            else if(h>=18&&h<24)hours.noite++;
            else hours.madrugada++;
            weekdays[dw]=(weekdays[dw]||0)+1;
            var dk=d.getFullYear()+'-'+(d.getMonth()+1)+'-'+d.getDate();
            dayMap[dk]=(dayMap[dk]||0)+1;
        });

        // Peak hour
        var peakHour=Object.keys(hours).reduce(function(a,b){return hours[a]>hours[b]?a:b;});
        var peakHourLabel={manha:tr('plh_manha','Manhã (5h–12h)'),tarde:tr('plh_tarde','Tarde (12h–18h)'),noite:tr('plh_noite','Noite (18h–24h)'),madrugada:tr('plh_madrugada','Madrugada (0h–5h)')}[peakHour];

        var ago=evData?evData.ago:0;
        var evasionScore=evData?evData.score:50;
        var activeDays=Object.keys(dayMap).length;
        var consistency=Math.min(100,Math.round((activeDays/Math.max(1,activeDays+ago))*100));

        // Weekend preference
        var weekend=(weekdays[0]||0)+(weekdays[6]||0);
        var weekdayTotal=sData.length-weekend;
        var prefWeekend=weekend>weekdayTotal*0.4;

        // Peak day
        var dayNames=[tr('sun','Dom'),tr('mon','Seg'),tr('tue','Ter'),tr('wed','Qua'),tr('thu','Qui'),tr('fri','Sex'),tr('sat','Sáb')];
        var peakDayNum=Object.keys(weekdays).reduce(function(a,b){return(weekdays[a]||0)>(weekdays[b]||0)?a:b;},1);
        var peakDay=dayNames[peakDayNum]||'Seg';

        // Avg session
        var sorted=sData.slice().sort(function(a,b){return a._date-b._date;});
        var sessions=0,sessionTotal=0,lastT=null;
        sorted.forEach(function(r){
            if(lastT){var gap=(r._date-lastT)/60000;if(gap<120){sessionTotal+=gap;sessions++;}}
            lastT=r._date;
        });
        var avgSession=sessions>0?Math.round(sessionTotal/sessions):0;

        // Resource type
        var typeCount={forum:0,quiz:0,tarefa:0,video:0,login:0,outro:0};
        sData.forEach(function(r){var t=getEventType(r);typeCount[t]=(typeCount[t]||0)+1;});
        var dominant=Object.keys(typeCount).reduce(function(a,b){return typeCount[a]>typeCount[b]?a:b;});

        // Engagement
        var evScore=evData?evData.score:null;
        var engScore=evScore!=null?evScore:0;
        var evR=riskLabel(engScore);
        var engLabel=evR?evR.label:tr('pl_no_score','Sem score');
        var engTier=evScore==null?tr('pl_tier_low','pouco'):evScore>=75?tr('pl_tier_high','muito'):evScore>=50?tr('pl_tier_med','engajado'):evScore>=25?tr('pl_tier_alert','alerta'):tr('pl_tier_low','pouco');
        var engCls=evScore==null?'risco':evScore>=75?'engajado':evScore>=50?'irregular':evScore>=25?'irregular':'risco';

        // Rhythm
        var _tHigh=tr('pl_tier_high','muito'),_tMed=tr('pl_tier_med','engajado'),_tAlert=tr('pl_tier_alert','alerta');
        var rhythmStyle=engTier===_tHigh||engTier===_tMed?tr('pl_rhythm_steady','constante'):engTier===_tAlert?tr('pl_rhythm_irregular','irregular'):tr('pl_rhythm_risk','risco');

        // Tags
        var tags=[];
        if(peakHour==='noite'||peakHour==='madrugada')tags.push({label:peakHour==='madrugada'?tr('pl_tag_dawn','🌙 Madrugador'):tr('pl_tag_night','🌙 Noturno'),cls:'noturno'});
        else if(peakHour==='manha')tags.push({label:tr('pl_tag_morning','☀️ Matinal'),cls:'matinal'});
        else tags.push({label:tr('pl_tag_afternoon','🌤 Vespertino'),cls:'explorador'});
        if(prefWeekend)tags.push({label:tr('pl_tag_weekend','📅 Prefere fins de semana'),cls:'explorador'});
        if(rhythmStyle==='constante')tags.push({label:tr('pl_tag_steady','✅ Ritmo constante'),cls:'constante'});
        else if(rhythmStyle==='irregular')tags.push({label:tr('pl_tag_irregular','⚡ Ritmo irregular'),cls:'irregular'});
        else tags.push({label:tr('pl_tag_risk','🚨 Em risco'),cls:'risco'});
        var engTagLabel=engTier==='muito'?tr('pl_tag_high_eng','🟢 Alto engajamento'):engTier==='engajado'?tr('pl_tag_med_eng','🔵 Eng. médio'):engTier==='alerta'?tr('pl_tag_low_eng','🟠 Eng. baixo'):tr('pl_tag_inactive','🔴 Pouco ativo');
        tags.push({label:engTagLabel,cls:engCls});

        // Email from state
        var stud=(((w.MWADashboard||{}).state||{}).students||[]).find(function(s){return norm(s.name)===name;});

        return {
            name:name, peakHour:peakHour, peakHourLabel:peakHourLabel,
            peakDay:peakDay, prefWeekend:prefWeekend,
            consistency:consistency, activeDays:activeDays, ago:ago,
            score:evasionScore, engScore:engScore, engLabel:engLabel, engCls:engCls,
            avgSession:avgSession, dominant:dominant, hours:hours, weekdays:weekdays,
            tags:tags, rhythmStyle:rhythmStyle, interactions:sData.length,
            email:(stud&&stud.email)||'', userid:(stud&&stud.userid)||0,
            totalDays:activeDays+ago, evData:evData
        };
    }

    /* ════════════════════════════════════════════
       plBuildAll
    ════════════════════════════════════════════ */
    function plBuildAll(){
        var mwa=w.MWADashboard||{};
        var state=(mwa&&mwa.state)||{};
        var logs=state.logs||[];
        if(!logs.length){
            var _db=Store.getModule?Store.getModule('MWADashboard'):null;
            if(_db&&_db.state){state=_db.state;logs=state.logs||[];}
        }
        if(!logs.length)return;

        // Parse dates
        var data=logs.map(function(r){var d=parseDate(r);return d?Object.assign({},r,{_date:d}):null;}).filter(Boolean);

        // Group by student
        var byStudent={};
        data.forEach(function(r){
            var n=norm(r.nomecompleto);if(!n)return;
            if(!byStudent[n])byStudent[n]=[];
            byStudent[n].push(r);
        });

        // Get EV_DATA from MWAEngagement
        var evDataList=[];
        var eng=w.MWAEngagement;
        if(eng&&typeof eng.getData==='function')evDataList=eng.getData()||[];

        PL_DATA=Object.keys(byStudent).map(function(name){
            var evData=evDataList.find(function(x){return x.name===name;})||null;
            return plBuildProfile(name,byStudent[name],evData);
        }).filter(Boolean).sort(function(a,b){return (b.engScore||0)-(a.engScore||0);});
    }

    /* ════════════════════════════════════════════
       plFilter + plGetFiltered
    ════════════════════════════════════════════ */
    function plGetFiltered(){
        var f=PL_FILTER||'all';
        if(f==='all')return PL_DATA;
        return PL_DATA.filter(function(p){
            var s=p.engScore||0;
            if(f==='critico')return s<40;
            if(f==='medio')  return s>=40&&s<70;
            if(f==='alto')   return s>=70;
            return true;
        });
    }

    function plFilter(f){
        PL_FILTER=f;
        ['plBtnAll','plBtnCrit','plBtnMedio','plBtnAlto'].forEach(function(id){
            var el=$(id);if(el)el.className='btn-ghost';
        });
        var activeMap={all:'plBtnAll',critico:'plBtnCrit',medio:'plBtnMedio',alto:'plBtnAlto'};
        var activeEl=$(activeMap[f]);if(activeEl)activeEl.className='btn-accent';
        var filtered=plGetFiltered();
        var labels={all:tr('ev_all','todos').toLowerCase(),critico:tr('pl_low_part','participação baixa').toLowerCase(),medio:tr('pl_med_part','participação média').toLowerCase(),alto:tr('pl_high_part','alta participação').toLowerCase()};
        var lbl=$('plFilterLabel');
        if(lbl)lbl.textContent=filtered.length+' '+(filtered.length===1?tr('ev_student','aluno'):tr('ev_students','alunos'))+' · '+(labels[f]||f);
        plRenderCards(filtered);
    }

    /* ════════════════════════════════════════════
       plBestDay
    ════════════════════════════════════════════ */
    function plBestDay(){
        var days={};
        PL_DATA.forEach(function(p){
            Object.keys(p.weekdays||{}).forEach(function(d){days[d]=(days[d]||0)+(p.weekdays[d]||0);});
        });
        var best=Object.keys(days).reduce(function(a,b){return(days[a]||0)>(days[b]||0)?a:b;},1);
        return [tr('pl_day_sun','Domingo'),tr('pl_day_mon','Segunda'),tr('pl_day_tue','Terça'),tr('pl_day_wed','Quarta'),tr('pl_day_thu','Quinta'),tr('pl_day_fri','Sexta'),tr('pl_day_sat','Sábado')][best]||'—';
    }

    /* ════════════════════════════════════════════
       render principal
    ════════════════════════════════════════════ */
    function render(){
        plBuildAll();
        if(!PL_DATA.length){
            var sgEl=$('plStudentGrid');
            if(sgEl)Store.renderHtml(sgEl, '<div class="empty"><div class="empty-icon">🎯</div><p>'+tr('pl_no_data','Carregue dados para ver os planos personalizados.')+'</p></div>');
            return;
        }

        var pl_baixa=PL_DATA.filter(function(p){return(p.engScore||0)<40;}).length;
        var pl_media=PL_DATA.filter(function(p){return(p.engScore||0)>=40&&(p.engScore||0)<70;}).length;
        var pl_alta=PL_DATA.filter(function(p){return(p.engScore||0)>=70;}).length;
        var gerados=Object.keys(PL_CACHE).length;

        // KPIs
        var kpiBox=$('plKpis');
        if(kpiBox){
            var dcPl = window.MWADeltaChip;
            var plSorted = PL_DATA.slice().sort(function(a,b){return (b.ago||0)-(a.ago||0);});
            var plMid = Math.floor(plSorted.length/2);
            var plPrv = plSorted.slice(0,plMid), plCur = plSorted.slice(plMid);
            function plCount(arr,fn){return arr.filter(fn).length;}
            var dPlCrit  = dcPl ? dcPl(plCount(plCur,function(x){return (x.engScore||0)<40;}),  plCount(plPrv,function(x){return (x.engScore||0)<40;}),  true)  : '';
            var dPlMed   = dcPl ? dcPl(plCount(plCur,function(x){return (x.engScore||0)>=40&&(x.engScore||0)<70;}), plCount(plPrv,function(x){return (x.engScore||0)>=40&&(x.engScore||0)<70;}), false) : '';
            var dPlAlta  = dcPl ? dcPl(plCount(plCur,function(x){return (x.engScore||0)>=70;}), plCount(plPrv,function(x){return (x.engScore||0)>=70;}),  false) : '';
            Store.renderHtml(kpiBox, mkKpi('c-red',  '🔴 '+tr('pl_low_part','Participação baixa'),  pl_baixa, tr('pl_delta_low','part. < 40%'),  'critico', dPlCrit)+
                mkKpi('c-blue', '🔵 '+tr('pl_med_part','Participação média'),   pl_media, tr('pl_delta_med','part. 40–69%'), 'medio',   dPlMed)+
                mkKpi('c-green','🟢 '+tr('pl_high_part','Alta participação'),    pl_alta,  tr('pl_delta_high','part. ≥ 70%'), 'alto',    dPlAlta));
        }

        // Overview panels
        var peakHours={manha:0,tarde:0,noite:0,madrugada:0};
        PL_DATA.forEach(function(p){if(peakHours[p.peakHour]!==undefined)peakHours[p.peakHour]++;});
        var peakLabels={manha:tr('pl_morning','☀️ Manhã'),tarde:tr('pl_afternoon','🌤 Tarde'),noite:tr('pl_evening','🌙 Noite'),madrugada:tr('pl_dawn','🌑 Madrugada')};
        var peakColors={manha:'var(--amber)',tarde:'var(--blue)',noite:'var(--purple)',madrugada:'var(--teal)'};
        var totalPl=Math.max(1,PL_DATA.length);

        var peakRows=Object.keys(peakHours).sort(function(a,b){return peakHours[b]-peakHours[a];}).map(function(k){
            var v=peakHours[k];
            var pct=Math.round((v/totalPl)*100);
            return '<div class="pl-ritmo-bar">'
                +'<div class="pl-ritmo-label">'+peakLabels[k]+'</div>'
                +'<div class="ev-bar" style="flex:1;">'
                +'<div class="ev-bar-fill" style="width:'+pct+'%;background:'+peakColors[k]+';"></div></div>'
                +'<span style="font-size:.7rem;font-family:\'DM Mono\';color:var(--muted);width:28px;text-align:right;">'+v+'</span>'
                +'</div>';
        }).join('');

        var rhythmGroups=[
            {label:tr('pl_high_part','Alta participação'), count:pl_alta, color:'var(--green)', desc:tr('pl_high_desc','Participação ≥ 70% — completam atividades e entregas')},
            {label:tr('pl_med_part','Participação média'),  count:pl_media,color:'var(--blue)',  desc:tr('pl_med_desc','Participação 40–69% — ativos com espaço para melhorar')},
            {label:tr('pl_low_part','Participação baixa'),  count:pl_baixa,color:'var(--red)',   desc:tr('pl_low_desc','Participação < 40% — precisam de atenção')},
        ];
        var segRows=rhythmGroups.map(function(g){
            return '<div class="pl-segment">'
                +'<div class="pl-segment-dot" style="background:'+g.color+';"></div>'
                +'<div class="pl-segment-info"><strong style="color:var(--text);">'+esc(g.label)+'</strong> — '+esc(g.desc)+'</div>'
                +'<div class="pl-segment-count" style="color:'+g.color+';">'+g.count+'</div>'
                +'</div>';
        }).join('');

        var bestDay=plBestDay();

        var ovEl=$('plOverview');
        if(ovEl){
            Store.renderHtml(ovEl, '<div class="pl-overview-card card"><div class="card-head">'
            +'<span class="card-title">⏰ '+tr('pl_peak_title','Horário de Pico da Turma')+'</span></div>'
            +'<div style="padding:.75rem 1rem 1rem;">'+peakRows+'</div></div>'
            +'<div class="pl-overview-card card"><div class="card-head">'
            +'<span class="card-title">📊 '+tr('pl_rhythm_title','Perfil de Ritmo da Turma')+'</span></div>'
            +'<div style="padding:.75rem 1rem;">'+segRows
            +'<div style="margin-top:.75rem;padding-top:.75rem;border-top:1px solid var(--line);font-size:.75rem;color:var(--muted);">'
            +tr('pl_best_day','Melhor dia para atividades síncronas')+': <strong style="color:var(--text);">'+esc(bestDay)+'</strong></div>'
            +'</div></div>');
        }

        // Install delegation on the page (idempotent)
        setupPageDelegation();
        plFilter(PL_FILTER);
    }

    /* ════════════════════════════════════════════
       plRenderCards — matching the reference layout
    ════════════════════════════════════════════ */
    function plRenderCards(profiles){
        var sgEl=$('plStudentGrid');
        if(!sgEl)return;
        if(!profiles.length){
            Store.renderHtml(sgEl, '<div class="empty"><p>'+tr('pl_empty','Nenhum aluno nesta categoria.')+'</p></div>');
            return;
        }

        var colors=['#2d6ef5','#a78bfa','#3ecf8e','#f5a623','#f06570','#2dd4bf'];

        Store.renderHtml(sgEl, profiles.map(function(p,i){
            var color=colors[i%colors.length];
            var ini=initials(p.name);
            var cached=PL_CACHE[p.name];
            var dotClr=cached?'var(--green)':'var(--line2)';
            var dotTitle=cached?tr('pl_plan_ready','Plano gerado'):tr('pl_plan_waiting','Aguardando');
            var pillsHtml=p.tags.map(function(t){return '<span class="pl-pill '+t.cls+'">'+esc(t.label)+'</span>';}).join('');
            var bodyHtml=cached?plRenderCachedBody(cached)
                :'<div style="padding:.65rem 0;font-size:.78rem;color:var(--muted);">'
                +tr('pl_click_generate','Clique em')
                +' <strong>\u2726 '+tr('pl_gen_btn','Gerar plano IA')+'</strong> '
                +tr('pl_click_generate_2','para create it um plano personalizado.')+'</div>';
            var rk=riskLabel(p.engScore||0);
            var sn=esc(p.name);
            // Meta: interactions · days without access · eng
            var meta=p.interactions+' '+tr('interactions','interações')+' \u00b7 '+p.ago+'d \u00b7 en...';
            if(p.activeDays!==undefined)meta=p.interactions+' '+tr('interactions','interações')+' \u00b7 '+p.ago+'d \u00b7 eng: '+(p.engScore||0)+'%';

            return '<div class="pl-list-item" id="plcard_'+i+'">'
                // Row header — layout EXATO do dashboard.html
                +'<div class="pl-list-row" data-pl-toggle="'+i+'">'
                  +'<span style="width:7px;height:7px;border-radius:50%;background:'+dotClr+';flex-shrink:0;" title="'+esc(dotTitle)+'"></span>'
                  +'<div class="pl-list-avatar" style="background:'+color+';">'+ini+'</div>'
                  +'<div style="flex:1;min-width:0;">'
                    +'<div class="pl-list-name">'+esc(p.name)+'</div>'
                    +'<div class="pl-list-meta">'+p.interactions+' '+tr('interactions','interações')+' \u00b7 '+p.ago+'d \u00b7 en...</div>'
                  +'</div>'
                  +'<span class="'+rk.cls+'" style="font-size:.63rem;flex-shrink:0;">'+rk.label+'</span>'
                  +'<span class="pl-list-chevron">\u2964</span>'
                +'</div>'
                // Body — closed by default via CSS max-height:0
                +'<div class="pl-list-body"><div class="pl-list-body-inner">'
                  +'<div style="display:flex;flex-wrap:wrap;gap:.25rem;margin:.5rem 0 .65rem;">'+pillsHtml+'</div>'
                  +'<div id="plbody_'+i+'">'+bodyHtml+'</div>'
                  +'<div class="pl-list-actions">'
                    +'<button class="btn-accent" style="font-size:.75rem;" data-pl-gen="'+i+'" data-pl-name="'+sn+'">\u2726 '+tr('pl_gen_btn','Gerar plano IA')+'</button>'
                    +'<button class="btn-ghost"  style="font-size:.75rem;" data-pl-msg="'+i+'">\u2709\ufe0f '+tr('pl_msg_btn','Mensagem')+'</button>'
                    +(cached?'<button class="btn-ghost pl-copy-btn" style="font-size:.75rem;" data-pl-copy="'+i+'">\ud83d\udccb '+tr('pl_copy_btn','Copiar')+'</button>':'')
                    +'<button class="btn-ghost" style="font-size:.75rem;" data-pl-profile="'+sn+'">\ud83d\udc64 '+tr('pl_profile_btn','Perfil')+'</button>'
                  +'</div>'
                +'</div></div>'
                +'</div>';
        }).join(''));
    }

    /* ── plToggleItem ── */
    function plToggleItem(i){
        var el=$('plcard_'+i);if(el)el.classList.toggle('open');
    }

    /* ── plRenderCachedBody — portado fielmente ── */
    function plRenderCachedBody(plan){
        function cleanText(t){
            return (t||'')
                .replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>')
                .replace(/\*(.*?)\*/g,'<em>$1</em>')
                .replace(/^#{1,3}\s*.+$/gm,'')
                .replace(/^[-•*]\s+(.+)$/gm,'<div style="display:flex;gap:.4rem;margin:.2rem 0;"><span style="color:var(--blue);flex-shrink:0;">›</span><span>$1</span></div>')
                .replace(/\n\n/g,'<br>').replace(/\n/g,' ').trim();
        }
        var map={};
        var sectionRe=/#{1,3}\s*([^\n]+)\n([\s\S]*?)(?=#{1,3}\s|$)/g;
        var _m;
        while((_m=sectionRe.exec(plan))!==null){map[_m[1].trim()]=_m[2].trim();}

        var sections=[
            {icon:'📚',label:tr('pl_section_trail','Trilha de Conteúdo'),   keys:['Trilha de Conteúdo','Trilha','📚']},
            {icon:'⏰',label:tr('pl_section_rhythm','Ritmo Sugerido'),        keys:['Ritmo Sugerido','Ritmo','⏰']},
            {icon:'🎓',label:tr('pl_section_style','Estilo de Aprendizagem'),keys:['Estilo de Aprendizagem','Estilo','🎓']},
            {icon:'✅',label:tr('pl_section_action','Ação Imediata'),          keys:['Ação Imediata','Acao Imediata','Ação','✅']},
        ];
        var usedKeys={};
        var html=sections.map(function(s){
            var body='';
            for(var ki=0;ki<s.keys.length;ki++){
                var kn=s.keys[ki].toLowerCase().replace(/[^\w\sãáàâêéèîíìôóòûúùç]/g,'').trim();
                var found=Object.keys(map).find(function(mk){return mk.toLowerCase().replace(/[^\w\sãáàâêéèîíìôóòûúùç]/g,'').trim()===kn&&!usedKeys[mk];});
                if(!found)found=Object.keys(map).find(function(mk){return mk.toLowerCase().indexOf(kn)>=0&&!usedKeys[mk];});
                if(found&&map[found]){body=map[found];usedKeys[found]=1;break;}
            }
            if(!body)return '';
            return '<div class="pl-section">'
                +'<div class="pl-section-title">'+s.icon+' '+esc(s.label)+'</div>'
                +'<div class="pl-section-content">'+cleanText(body)+'</div>'
                +'</div>';
        }).join('');

        if(html.trim())return html;
        return '<div class="pl-section"><div class="pl-section-title">📋 '+tr('pl_section_generated','Plano gerado')+'</div>'
            +'<div class="pl-section-content" style="font-size:.78rem;">'+cleanText(plan)+'</div></div>';
    }

    /* ── plGenerate ── */
    function plGenerate(idx){
        var filtered=plGetFiltered();
        var p=filtered[idx];
        if(!p)return;
        if(PL_CACHE[p.name]){plRefreshCard(idx,filtered);return;}
        if(PL_GENERATING[p.name])return;
        PL_GENERATING[p.name]=true;

        var item=$('plcard_'+idx);
        var bodyEl=$('plbody_'+idx);
        if(item)item.classList.add('open');
        if(item){var sb=item.querySelector('.pl-status-bar');if(sb){sb.className='pl-status-bar gerando';}}
        if(bodyEl)Store.renderHtml(bodyEl, '<div class="pl-loading"><div class="ai-dot"></div><div class="ai-dot"></div><div class="ai-dot"></div>'
            +'<span style="margin-left:.5rem;">'+tr('pl_generating','Gerando plano personalizado com IA...')+'</span></div>');

        var _sit=[];
        if(p.ago>14)_sit.push(tr('pl_sit_absent','AUSENTE HÁ {n} DIAS — risco crítico de evasão').replace('{n}',p.ago));
        else if(p.ago>7)_sit.push(tr('pl_sit_dropping','sem acesso há {n} dias — engajamento caindo').replace('{n}',p.ago));
        else _sit.push(tr('pl_sit_last','último acesso há {n} dias').replace('{n}',p.ago));
        if(p.consistency<20)_sit.push(tr('pl_sit_irregular','acesso muito irregular ({n}% consistência)').replace('{n}',p.consistency));
        else if(p.consistency>=70)_sit.push(tr('pl_sit_consistent','ritmo consistente ({n}%) — aluno disciplinado').replace('{n}',p.consistency));
        if(p.interactions<20)_sit.push(tr('pl_sit_few_inter','pouquíssimas interações ({n}) — quase não participou').replace('{n}',p.interactions));
        else if(p.interactions>200)_sit.push(tr('pl_sit_many_inter','{n} interações — aluno muito ativo').replace('{n}',p.interactions));
        if(p.avgSession<5)_sit.push(tr('pl_sit_short_sess','sessões curtíssimas ({n}min)').replace('{n}',p.avgSession));
        else if(p.avgSession>30)_sit.push(tr('pl_sit_long_sess','sessões longas ({n}min) — estuda com profundidade').replace('{n}',p.avgSession));
        var _domMap={forum:tr('pl_dom_forum','fóruns (perfil colaborativo)'),quiz:tr('pl_dom_quiz','questionários (autoavaliativo)'),tarefa:tr('pl_dom_task','tarefas (orientado a entrega)'),video:tr('pl_dom_video','conteúdos/leituras (autodidata)')};
        var _domLabel=_domMap[p.dominant]||p.dominant;
        var _engNivel=(p.engScore||0)>=75?tr('pl_eng_very','MUITO ENGAJADO'):(p.engScore||0)>=50?tr('pl_eng_ok','ENGAJADO'):(p.engScore||0)>=25?tr('pl_eng_alert','EM ALERTA'):tr('pl_eng_low','POUCO ATIVO');

        var lang=Store.getConfig&&Store.getConfig().language||'';
        var prompt=
            tr('pl_prompt_intro','Você é um tutor especialista em EaD. Analise este aluno e gere recomendações CONCRETAS para sua situação ESPECÍFICA.')+'\n\n'
            +tr('pl_prompt_student','ALUNO: ')+p.name+' | '+tr('pl_prompt_level','NÍVEL: ')+_engNivel+' (eng: '+(p.engScore||0)+'%)\n'
            +tr('pl_prompt_situation','SITUAÇÃO:\n')+_sit.map(function(s){return '• '+s;}).join('\n')+'\n\n'
            +tr('pl_prompt_data','DADOS:\n')
            +'• '+p.ago+'d '+tr('pl_prompt_no_acc','sem acesso')+' | '+p.interactions+' '+tr('interactions','interações')+' | '+p.activeDays+'/'+p.totalDays+' '+tr('pl_prompt_active_days','dias ativos')+'\n'
            +'• '+tr('pl_prompt_consist','Consistência: ')+p.consistency+'% | '+tr('pl_prompt_session','Sessão média: ')+p.avgSession+'min\n'
            +'• '+tr('pl_prompt_peak_hour','Horário favorito: ')+p.peakHourLabel+' | '+tr('pl_prompt_peak_day','Dia: ')+p.peakDay+' | '+tr('pl_prompt_resource','Recurso: ')+_domLabel+'\n\n'
            +tr('pl_prompt_format','Gere o plano EXATAMENTE neste formato:')+'\n\n'
            +'### 📚 '+tr('pl_section_trail','Trilha de Conteúdo')+'\n'
            +tr('pl_prompt_trail_inst','Sugira 3 atividades específicas para um aluno {level} que prefere {dom} e acessa {hour}.').replace('{level}',_engNivel).replace('{dom}',_domLabel).replace('{hour}',p.peakHourLabel)+'\n'
            +'### ⏰ '+tr('pl_section_rhythm','Ritmo Sugerido')+'\n'
            +tr('pl_prompt_rhythm_inst','Sessões de {min}min, {pct}% consistência. Recomende frequência e duração ideal.').replace('{min}',p.avgSession).replace('{pct}',p.consistency)+'\n'
            +'### 🎓 '+tr('pl_section_style','Estilo de Aprendizagem')+'\n'
            +tr('pl_prompt_style_inst','Com base em: recurso favorito {dom}, sessões de {min}min. Identifique o estilo e adapte.').replace('{dom}',_domLabel).replace('{min}',p.avgSession)+'\n'
            +'### ✅ '+tr('pl_section_action','Ação Imediata')+'\n'
            +tr('pl_prompt_action_inst','UMA ação para hoje. Situação: {sit}. Diga O QUÊ fazer, POR QUÊ e COMO.').replace('{sit}',(_sit[0]||tr('pl_prompt_active','aluno ativo')))+'\n'
            +tr('pl_prompt_rules','REGRAS: use exatamente os 4 títulos acima com ###. Máx 300 palavras.')+' '
            +(lang.indexOf('pt')===0?tr('ev_prompt_lang_pt','Responda em português brasileiro.'):lang.indexOf('es')===0?tr('ev_prompt_lang_es','Responda en español.'):tr('ev_prompt_lang_en','Respond in English.'));

        var cfg=Store.getConfig?Store.getConfig():{};
        var courseid=parseInt(cfg.courseid||0,10);

        Store.callAction('block_mwa_dashboard_get_ai_recommendation',{
            courseid:courseid, student_name:p.name, prompt:prompt
        }).then(function(res){
            var text=(res&&(res.recommendation||res.response||res.content))||'';
            if(!text)throw new Error(tr('pl_empty_response','Resposta vazia'));
            PL_CACHE[p.name]=text;
            delete PL_GENERATING[p.name];
            plRefreshCard(idx,filtered);
            // Atualizar contador KPI
            var kpiG=$('plKpiGerados');if(kpiG)kpiG.textContent=Object.keys(PL_CACHE).length;
        }).catch(function(e){
            Log.error(e);
            delete PL_GENERATING[p.name];
            if(bodyEl)Store.renderHtml(bodyEl, '<div style="padding:.5rem;font-size:.78rem;color:var(--red);">❌ Erro: '+esc(e.message)+'</div>');
            if(item){var sb=item.querySelector('.pl-status-bar');if(sb)sb.className='pl-status-bar aguardando';}
        });
    }

    /* ── plRefreshCard ── */
    function plRefreshCard(idx,filtered){
        var p=filtered[idx];if(!p)return;
        var bodyEl=$('plbody_'+idx);if(!bodyEl)return;
        var cached=PL_CACHE[p.name];
        if(cached){
            Store.renderHtml(bodyEl, plRenderCachedBody(cached));
            var item=$('plcard_'+idx);
            if(item){
                var dot=item.querySelector('.pl-list-row > span:first-child');
                if(dot){dot.style.background='var(--green)';dot.title=tr('pl_plan_ready','Plano gerado');}
                var sb=item.querySelector('.pl-status-bar');
                if(sb)sb.className='pl-status-bar gerado';
                var acts=item.querySelector('.pl-list-actions');
                if(acts&&!acts.querySelector('.pl-copy-btn')){
                    var cb=document.createElement('button');
                    cb.className='btn-ghost pl-copy-btn';cb.style.fontSize='.75rem';
                    Store.renderHtml(cb, '📋 '+tr('pl_copy_btn','Copiar'));
                    cb.setAttribute('data-pl-copy',idx);
                    acts.appendChild(cb);
                }
            }
        }
    }

    /* ── plCopyPlan ── */
    function plCopyPlan(idx){
        var filtered=plGetFiltered();
        var p=filtered[idx];if(!p)return;
        var text=PL_CACHE[p.name];if(!text)return;
        if(navigator.clipboard&&navigator.clipboard.writeText){
            navigator.clipboard.writeText(tr('pl_copy_header','PLANO DE APRENDIZAGEM — ')+p.name+'\n\n'+text)
                .then(function(){alert('📋 '+tr('pl_copied','Plano copiado!'));})
                .catch(function(){});
        }
    }

    /* ── Event delegation ── */
    var _pageListenerInstalled=false;
    function setupPageDelegation(){
        if(_pageListenerInstalled)return;
        _pageListenerInstalled=true;
        var page=document.getElementById('page-personalised');
        if(!page)return;

        page.addEventListener('click',function(ev){
            var t=ev.target;
            // Filter buttons
            var fb=t.closest('[data-pl-filter]');
            if(fb){plFilter(fb.getAttribute('data-pl-filter'));return;}
            // KPI cards
            var kpi=t.closest('.kpi[data-pl-filter]');
            if(kpi){plFilter(kpi.getAttribute('data-pl-filter'));return;}
            // Toggle card
            var tog=t.closest('[data-pl-toggle]');
            if(tog&&!t.closest('button')){plToggleItem(Number(tog.getAttribute('data-pl-toggle')));return;}
            // Generate
            var gen=t.closest('[data-pl-gen]');
            if(gen){ev.stopPropagation();plGenerate(Number(gen.getAttribute('data-pl-gen')));return;}
            // Copy
            var cp=t.closest('[data-pl-copy]');
            if(cp){ev.stopPropagation();plCopyPlan(Number(cp.getAttribute('data-pl-copy')));return;}
            // Mensagem
            var msg=t.closest('[data-pl-msg]');
            if(msg){
                ev.stopPropagation();
                var idx=Number(msg.getAttribute('data-pl-msg'));
                var filtered=plGetFiltered();var px=filtered[idx];
                if(px&&w.MWAInterventions&&typeof w.MWAInterventions.quickMessage==='function')
                    w.MWAInterventions.quickMessage(px.name,px.email||'',px.userid||0,'');
                return;
            }
            // Perfil — navega para page-studentprofile e carrega o aluno
            var profileBtn=t.closest('[data-pl-profile]');
            if(profileBtn){
                ev.stopPropagation();
                var studentName=profileBtn.getAttribute('data-pl-profile')||'';
                // Navega para a aba de perfil
                if(w.showPage)w.showPage('studentprofile');
                // Carrega o perfil do aluno
                setTimeout(function(){
                    if(w.MWAProfile&&typeof w.MWAProfile.loadProfile==='function'){
                        w.MWAProfile.loadProfile(studentName);
                    }
                    // Atualizar o select do perfil para refletir o aluno
                    var sel=document.getElementById('spStudentSel');
                    if(sel){sel.value=studentName;}
                },150);
                return;
            }
        });
    }

    /* ── helpers KPI ── */
    function mkKpi(cls,label,val,sub,filter,chip){
        return '<div class="kpi '+cls+'" data-pl-filter="'+filter+'" style="cursor:pointer;">'
            +'<div class="kpi-top"><span class="kpi-label">'+label+'</span>'+(chip||'')+'</div>'
            +'<div class="kpi-val">'+val+'</div>'
            +'<div class="kpi-delta">'+esc(sub)+'</div>'
            +'</div>';
    }
    function mkKpiStatic(cls,label,val,sub){
        return '<div class="kpi '+cls+'">'
            +'<div class="kpi-top"><span class="kpi-label">'+label+'</span></div>'
            +'<div class="kpi-val">'+val+'</div>'
            +'<div class="kpi-delta">'+esc(sub)+'</div>'
            +'</div>';
    }

    /* ── Public API ── */
    w.MWAPersonalised={render:render,filter:plFilter,generate:plGenerate};

    })();
    return w.MWAPersonalised;
});
