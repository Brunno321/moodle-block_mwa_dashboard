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
 * @module     block_mwa_dashboard/actioncenter
 * @copyright  2026 Bruno Porto
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
define(['block_mwa_dashboard/dashboardstore', 'core/templates'], function(Store, Templates) {

    'use strict';

    var window = Store.windowFacade();
    var _realWindow = (function(){return this;})() || globalThis;

    (function(){
    'use strict';
    function ctx(){ return window.MWADashboard || {}; }
    function $(id){ return (ctx().$ || function(x){return document.getElementById(x);})(id); }
    function tr(key){ var f = ctx().tr || function(k){ return k; }; return f(key, key); }
    function esc(v){ var f = ctx().esc || function(x){return String(x===undefined||x===null?'':x).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]});}; return f(v); }
    function norm(v){ var f = ctx().norm || function(x){return (x===undefined||x===null)?'':String(x).trim();}; return f(v); }
    function lower(v){ var f = ctx().lower || function(x){return norm(x).toLowerCase();}; return f(v); }
    function parseDate(log){ var f = ctx().parseDate; return f ? f(log) : null; }
    function studentKey(name,email){ var f = ctx().studentKey || function(n,e){return lower(e)||lower(n);}; return f(name,email); }
    function componentName(log){ var f = ctx().componentName || function(){return tr('other');}; return f(log); }
    function state(){ return ctx().state || {logs:[],students:[],activities:[]}; }
    function initials(name){var parts=norm(name).split(/\s+/).filter(Boolean);return ((parts[0]?parts[0][0]:'?')+(parts[1]?parts[1][0]:'')) || '?'}
    function renderTemplate(node, template, context){
      if(!node)return Promise.resolve(null);
      return Templates.render('block_mwa_dashboard/'+template, context||{}).then(function(html, js){
        Templates.replaceNodeContents(node, html, js);
        return node;
      });
    }
    function riskClass(score){return score<40?'danger':score<70?'warn':'good'}
    function avatarHtml(s){return '<span class="ac-av '+riskClass(s.score)+'" title="'+esc(s.name)+'" data-av-name="'+esc(s.name)+'" style="cursor:pointer">'+esc(initials(s.name).toUpperCase())+'</span>'}
    function miniAvatars(list){if(!list||!list.length)return '';var shown=list.slice(0,5).map(avatarHtml).join('');if(list.length>5)shown+='<span class="ac-av ac-av-more">+'+(list.length-5)+'</span>';return shown;}
    function urgentAvatarsHtml(list){
      var MAX_SHOWN=5;
      var shown=list.slice(0,MAX_SHOWN);
      var extra=list.slice(MAX_SHOWN);
      var html='<div class="ac-avatars ac-avatars-urgent">';
      html+=shown.map(avatarHtml).join('');
      if(extra.length){
        html+='<span class="ac-av ac-av-more ac-av-expand" title="Ver todos">+'+extra.length+'</span>';
        html+='<span class="ac-av-extra" style="display:none">'+extra.map(avatarHtml).join('')+'</span>';
      }
      html+='</div>';
      return html;
    }
    function actionCard(kind,label,count,desc,students,items,primary,secondary,page,insight,chartHtml,secondaryPage){
      var content='';
      if(chartHtml){content='<div class="ac-chart-mini">'+chartHtml+'</div>';}
      else if(kind==='urgent'){content=urgentAvatarsHtml(students||[]);}
      else if(items&&items.length){content='<div class="ac-items">'+items.slice(0,3).map(function(it){return '<div class="ac-item-row"><span class="ac-item-name">'+esc(it.name)+'</span></div>'}).join('')+'</div>';}
      else{var av=miniAvatars(students||[]);if(av)content='<div class="ac-avatars">'+av+'</div>';}
      var primaryBtn;
      if(kind==='urgent'){
        primaryBtn='<button class="ac-btn-p" data-bulk-kind="urgent">'+esc(primary)+'</button>';
      } else {
        primaryBtn='<button class="ac-btn-p" data-action-page="'+esc(page)+'">'+esc(primary)+'</button>';
      }
      var secondaryBtn=kind==='attention'?'':'<button class="ac-btn-s" data-action-page="'+esc(secondaryPage||page)+'">'+esc(secondary)+'</button>';
      return '<div class="ac-card '+kind+'"><div class="ac-badge-row"><span class="ac-badge '+kind+'">'+esc(label)+'</span><span class="ac-time">'+tr('updated_now')+'</span></div><div class="ac-number '+kind+'">'+esc(count)+'</div><div class="ac-desc">'+esc(desc)+'</div>'+content+'<div class="ac-btn-row">'+primaryBtn+secondaryBtn+'</div>'+(insight?'<div class="ac-insight">💡 '+esc(insight)+'</div>':'')+'</div>';
    }
    function peakHourInfo(){var hours=Array(24).fill(0);state().logs.forEach(function(l){var d=parseDate(l);if(d)hours[d.getHours()]++});var max=Math.max.apply(null,hours), peak=max>0?hours.indexOf(max):-1;return {hours:hours,peak:peak,max:max}}
    function miniHourChart(info){if(!info||info.peak<0)return '';var max=Math.max(1,info.max);return info.hours.map(function(v,i){var h=Math.max(4,Math.round((v/max)*48));return '<div class="ac-bar-mini '+(i===info.peak?'hi':'')+'" style="height:'+h+'px" title="'+i+'h: '+v+'"></div>'}).join('')}
    function showRetentionDrill(title,html){
      var pop=document.getElementById('mwaRetDrill');
      if(!pop){
        pop=document.createElement('div');
        pop.id='mwaRetDrill';
        pop.className='block-mwa-dashboard-app mwa-ret-drill';
        var root=document.getElementById('block-mwa-dashboard-app')||document.body;
        root.appendChild(pop);
        pop.addEventListener('click',function(e){if(e.target===pop)pop.style.display='none';});
        document.addEventListener('keydown',function(e){if(e.key==='Escape')pop.style.display='none';});
      }
      renderTemplate(pop,'action_retention_drill',{title:title,bodyhtml:html}).then(function(){
        var xBtn=pop.querySelector('#mwaRetDrillClose');
        if(xBtn)xBtn.addEventListener('click',function(e){e.stopPropagation();pop.style.display='none';});
        pop.style.display='flex';
      });
    }
    function renderRetentionCurve(){
      var canvas=$('retentionChart');if(!canvas||!window.Chart)return;
      var now=Date.now();
      var weekSets={};
      state().logs.forEach(function(l){
        var d=parseDate(l);if(!d)return;
        var w=Math.floor((now-d.getTime())/(7*86400000));
        if(w<0||w>16)return;
        if(!weekSets[w])weekSets[w]=Object.create(null);
        weekSets[w][norm(l.nomecompleto)]=true;
      });
      var maxW=0;
      Object.keys(weekSets).forEach(function(k){if(Number(k)>maxW)maxW=Number(k);});
      maxW=Math.min(maxW,11);
      var labels=[],values=[],weekIndexMap=[];
      for(var w=maxW;w>=0;w--){
        labels.push(w===0?tr('this_week'):w+' '+tr('weeks_ago','s atrás'));
        values.push(weekSets[w]?Object.keys(weekSets[w]).length:0);
        weekIndexMap.push(w);
      }
      var ptColors=values.map(function(v,i){
        if(i===0)return '#4f8ef7';
        return v>values[i-1]?'#3ecf8e':v<values[i-1]?'#f06570':'#4f8ef7';
      });
      if(window.mwaRetentionChart){try{window.mwaRetentionChart.destroy();}catch(e){}}
      var wrap=canvas.parentElement;
      wrap.replaceChildren();
      var canvasNode=document.createElement('canvas');
      canvasNode.id='retentionChart';
      wrap.appendChild(canvasNode);
      var freshCanvas=$('retentionChart');
      window.mwaRetentionChart=new Chart(freshCanvas,{
        type:'line',
        data:{labels:labels,datasets:[{
          label:tr('active_students','Alunos ativos'),data:values,
          borderColor:'#4f8ef7',backgroundColor:'rgba(79,142,247,.10)',
          borderWidth:2.5,fill:true,tension:.35,
          pointBackgroundColor:ptColors,pointRadius:5,pointHoverRadius:8
        }]},
        options:{
          responsive:true,maintainAspectRatio:false,
          plugins:{legend:{display:false},
            tooltip:{callbacks:{
              title:function(items){return items&&items[0]?items[0].label:'';},
              label:function(item){
                var idx=item.dataIndex,cur=values[idx];
                var prev=idx>0?values[idx-1]:null;
                var diff=prev!==null?cur-prev:null;
                var diffStr=diff===null?'':(diff>0?' (+'+diff+' '+tr('ret_tooltip_returned','+{n} voltaram').replace('{n}','').trim()+')':diff<0?' ('+diff+' '+tr('ret_tooltip_left','{n} saíram').replace('{n}','').trim()+')':' ('+tr('ret_tooltip_stable','estável')+')');
                return cur+' '+tr('ret_unique_students','{n} alunos únicos').replace('{n}','')+diffStr;
              }
            }}
          },
          scales:{
            x:{grid:{display:false},ticks:{color:'#7b8099',font:{size:10}}},
            y:{beginAtZero:true,ticks:{color:'#7b8099',precision:0}}
          }
        }
      });
      freshCanvas.style.cursor='pointer';
      freshCanvas.onclick=function(evt){
        var pts=window.mwaRetentionChart.getElementsAtEventForMode(evt,'nearest',{intersect:true},false);
        if(!pts.length)return;
        var idx=pts[0].index;
        var w=weekIndexMap[idx];
        var cur=weekSets[w]||{};
        var prev=weekSets[w+1]||{};
        var left=Object.keys(prev).filter(function(n){return !cur[n];});
        var came=Object.keys(cur).filter(function(n){return !prev[n];});
        var stayed=Object.keys(cur).filter(function(n){return prev[n];});
        var wLabel=w===0?tr('this_week'):w+' '+tr('weeks_ago','s atrás');
        function fullName(n){return n;}
        var html='<div style="padding:.25rem 0;">';
        html+='<div style="font-size:.8rem;font-weight:700;margin-bottom:.6rem;">'+esc(wLabel)+' — '+tr('ret_drill_active_students','{n} alunos ativos').replace('{n}',Object.keys(cur).length)+'</div>';
        if(left.length)html+='<div class="mwa-ret-left">'+tr('ret_drill_left','📉 Não voltaram ({n}): ').replace('{n}',left.length)+left.map(function(n){var p=n.trim().split(/\s+/);return esc((p[0]||'')+' '+(p[p.length-1]||''));}).join(', ')+'</div>';
        if(came.length)html+='<div class="mwa-ret-came">'+tr('ret_drill_came','📈 Voltaram/novos ({n}): ').replace('{n}',came.length)+came.map(function(n){var p=n.trim().split(/\s+/);return esc((p[0]||'')+' '+(p[p.length-1]||''));}).join(', ')+'</div>';
        if(stayed.length)html+='<div class="mwa-ret-stayed">'+tr('ret_drill_stayed','✓ Continuaram ({n})').replace('{n}',stayed.length)+'</div>';
        html+='</div>';
        showRetentionDrill(wLabel+' — '+tr('ret_drill_retention','Retenção'),html);
      };
    }
    function buildTopFactors(s){
      var factors=[];
      var now=new Date();
      var ago=s.last?Math.floor((now-s.last)/86400000):999;
      var agoLabel=ago>0?(ago>1?tr('ai_factor_no_access_pl','Sem acesso há {n} dias'):tr('ai_factor_no_access','Sem acesso há {n} dia')).replace('{n}',ago):tr('ai_factor_recent_access','Acesso recente');
      var agoValue=ago>0?Math.min(100,ago*6):5;
      factors.push({label:agoLabel,weight:.42,value:agoValue,color:'var(--red)'});
      if(s.grade!==null&&s.grade<70)factors.push({label:tr('ai_factor_partial_grade','Nota parcial ({n} pts)').replace('{n}',s.grade),weight:.28,value:Math.round(((70-s.grade)/70)*100),color:'var(--amber)'});
      if((s.coverage||0)<50)factors.push({label:tr('ai_factor_low_coverage','Cobertura baixa ({n}% das atividades)').replace('{n}',(s.coverage||0)),weight:.18,value:Math.round((1-(s.coverage||0)/100)*100),color:'var(--amber)'});
      if(s.interactions<5&&ago<=7)factors.push({label:tr('ai_factor_symbolic','Presença simbólica — entra mas não interage'),weight:.12,value:60,color:'var(--purple)'});
      return factors.sort(function(a,b){return b.weight-a.weight;}).slice(0,4);
    }
    function renderAIPanel(selected){
      var box=$('aiPredictionPanel');if(!box)return;
      box.className='';
      if(!selected){
        box.className='ai-placeholder';
        renderTemplate(box, 'action_ai_placeholder', {message:tr('ai_click_open_hint')});
        return;
      }
      var firstName=selected.name.split(' ')[0];
      var score=Math.max(0,Math.min(100,selected.score||0));
      var scoreColor=score<40?'#b42318':score<70?'#986014':'#13794c';
      var scoreBg=score<40?'#fdecec':score<70?'#fff4df':'#e8f7ef';
      var topFactors=buildTopFactors(selected);
      var h='';
      h+='<div style="position:relative;padding-bottom:2px;">';
      h+='<span style="font-size:.72rem;color:#66708a;">'+tr('ai_why_at_risk','Por que {name} está em risco?').replace('{name}','<strong style="color:#1e293b;">'+esc(firstName)+'</strong>')+'</span>';
      h+='<span style="position:absolute;right:0;top:0;font-size:.78rem;font-weight:700;padding:2px 9px;border-radius:99px;background:'+scoreBg+';color:'+scoreColor+';">'+score+'%</span>';
      h+='</div>';
      h+='<div style="font-size:1.15rem;font-weight:700;color:#111827;margin:.35rem 0 1.1rem;letter-spacing:-.02em;">'+tr('ai_why_at_risk','Por que {name} está em risco?').replace('{name}',esc(firstName))+'</div>';
      topFactors.forEach(function(f){
        h+='<div style="margin-bottom:.8rem;">';
        h+='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.3rem;">';
        h+='<span style="font-size:.86rem;font-weight:600;color:#1e293b;">'+esc(f.label)+'</span>';
        h+='<span style="font-size:.75rem;color:#66708a;">'+tr('ai_weight','peso')+' '+f.weight.toFixed(2)+'</span>';
        h+='</div>';
        h+='<div style="height:7px;background:#e8ecf5;border-radius:4px;overflow:hidden;">';
        h+='<div style="height:100%;width:'+Math.min(100,f.value)+'%;background:'+f.color+';border-radius:4px;transition:width .6s;"></div>';
        h+='</div>';
        h+='</div>';
      });
      h+='<div style="font-size:.75rem;color:#66708a;margin-top:.9rem;margin-bottom:.5rem;">'+tr('ai_analysis_makes_sense','A análise faz sentido?')+'</div>';
      h+='<div style="display:flex;gap:.5rem;margin-bottom:.4rem;">';
      h+='<button id="mwaRexOk" style="flex:1;background:#f5f7fc;border:1px solid #d1d9e8;border-radius:14px;padding:.55rem;font-size:.8rem;font-weight:600;color:#66708a;cursor:pointer;">'+tr('ai_feedback_correct','👍 Análise correta')+'</button>';
      h+='<button id="mwaRexNo" style="flex:1;background:#f5f7fc;border:1px solid #d1d9e8;border-radius:14px;padding:.55rem;font-size:.8rem;font-weight:600;color:#66708a;cursor:pointer;">'+tr('ai_student_ok','👎 {name} está OK').replace('{name}',esc(firstName))+'</button>';
      h+='</div>';
      h+='<div style="font-size:.68rem;color:#8a94a8;text-align:center;margin-bottom:.9rem;">'+tr('ai_feedback_hint','Seu feedback treina o modelo para sua turma.')+'</div>';
      h+='<button id="mwaRexEmail" style="width:100%;background:linear-gradient(135deg,#5b9bd5,#8b72d4);color:#fff;border:none;border-radius:14px;padding:.75rem;font-size:.86rem;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:.5rem;">'+tr('ai_generate_email','✉️ Gerar email personalizado')+'</button>';
      renderTemplate(box,'content_inline_html',{bodyhtml:h}).then(function(){
        var okBtn=box.querySelector('#mwaRexOk');
        var noBtn=box.querySelector('#mwaRexNo');
        if(okBtn)okBtn.onclick=function(){okBtn.style.borderColor='#3ecf8e';okBtn.style.color='#13794c';okBtn.style.background='#e8f7ef';okBtn.textContent='Obrigado!';};
        if(noBtn)noBtn.onclick=function(){noBtn.style.borderColor='#3ecf8e';noBtn.style.color='#13794c';noBtn.style.background='#e8f7ef';noBtn.textContent='Registrado!';};
        var emailBtn=box.querySelector('#mwaRexEmail');
        if(emailBtn)emailBtn.onclick=function(){
          if(window.MWAInterventions&&typeof window.MWAInterventions.quickMessage==='function'){
            window.MWAInterventions.quickMessage(selected.name,selected.email||'',selected.userid||0,'');
          }
        };
      });
    }
    function renderActionCenter(){
      var high=state().students.filter(function(s){return s.score<40});
      var med=state().students.filter(function(s){return s.score>=40&&s.score<70});
      var good=state().students.filter(function(s){return s.score>=70});
      var totalStudents=Math.max(1,state().students.length);
      var lowCoverage=state().activities.slice().map(function(a){return {name:a.name,pct:Math.round((a.unique/totalStudents)*100),unique:a.unique}}).filter(function(a){return a.pct<50}).sort(function(a,b){return a.pct-b.pct}).slice(0,3).map(function(a){return {name:a.name,value:a.pct+'%'}});
      var peak=peakHourInfo();var peakLabel=peak.peak>=0?tr('peak_at')+' '+String(peak.peak).padStart(2,'0')+'h':'—';
      var peakDesc=peak.peak>=0?tr('peak_desc'):tr('no_peak_desc');
      renderTemplate($('actionCardsRow'),'content_inline_html',{bodyhtml:actionCard('urgent',tr('urgent'),high.length,high.length?tr('urgent_desc'):tr('no_critical_students'),high,high.slice(0,3).map(function(s){return {name:s.name,value:s.score+'%'}}),tr('send_email_ai'),tr('view_list'),'alerts',tr('urgent_insight'),'','alerts')+actionCard('attention',tr('attention'),lowCoverage.length,lowCoverage.length?tr('attention_desc'):tr('good_engagement'),med,lowCoverage,tr('analyse_activities'),tr('view_list'),'activities',lowCoverage.length?tr('attention_insight'):'','','activities')+actionCard('opportunity',tr('opportunity'),peakLabel,peakDesc,good.slice(0,5),[],tr('view_heatmap'),tr('view_profiles'),'heatmap',tr('opportunity_insight'),miniHourChart(peak),'classlist')});
      renderRetentionCurve();
      renderActionFocusList(high.concat(med).slice(0,5), high.concat(med));
      renderAIPanel(null);
      var row=$('actionCardsRow');
      if(row){row.addEventListener('click',function(ev){
        var expandBtn=ev.target.closest('.ac-av-expand');
        if(expandBtn){ev.stopPropagation();var extra=expandBtn.nextElementSibling;if(!extra||!extra.classList.contains('ac-av-extra'))return;var open=extra.style.display!=='none';extra.style.display=open?'none':'inline-flex';expandBtn.textContent=open?'+'+(extra.children.length):'−';return;}
        var av=ev.target.closest('.ac-av[data-av-name]');
        if(av){ev.stopPropagation();var name=av.getAttribute('data-av-name');if(name&&window.goToStudentProfile)window.goToStudentProfile(name);return;}
      },true);}
    }
    function renderActionFocusList(list, fullList){var box=$('actionFocusList');if(!box)return;if(!list.length){renderTemplate(box,'empty_state',{class:'empty',message:tr('no_priority_students')});return}renderTemplate(box,'content_inline_html',{bodyhtml:list.map(function(s,i){var cls=riskClass(s.score);var label=s.score<40?tr('risk_critical'):s.score<70?tr('risk_medium'):tr('risk_low');var width=Math.max(4,Math.min(100,s.score));return '<div class="att-row" data-student-index="'+i+'"'+'  data-sname="'+esc(s.name)+'" data-semail="'+esc(s.email||'')+'" data-userid="'+(s.userid||0)+'"><label class="att-check"><input type="checkbox" class="att-chk" onclick="event.stopPropagation()"></label><div class="att-avatar '+cls+'">'+esc(initials(s.name).toUpperCase())+'</div><div class="att-info"><div class="att-name">'+esc(s.name)+'</div><div class="att-sub">'+(s.last?tr('last_access')+' '+s.last.toLocaleDateString():tr('no_recent_access'))+(s.grade!==null?' · '+tr('grade')+' '+s.grade:'')+'</div></div><div class="att-risk-wrap"><div class="att-risk-label">'+tr('ai_risk')+'</div><div class="att-risk-bar"><div class="att-risk-fill '+cls+'" style="width:'+width+'%"></div></div></div><span class="att-badge '+(s.score<40?'high':s.score<70?'medium':'low')+'">'+label+' · '+s.score+'%</span><button class="att-open-btn" type="button" data-open-student="'+i+'">'+tr('open_btn','Abrir →')+'</button></div>'}).join('')}).then(function(){box.querySelectorAll('[data-open-student]').forEach(function(btn){btn.addEventListener('click',function(ev){ev.stopPropagation();var idx=Number(btn.getAttribute('data-open-student'));renderAIPanel(list[idx]);})});box.querySelectorAll('.att-row').forEach(function(row){row.addEventListener('click',function(ev){if(ev.target.closest('.att-open-btn')||ev.target.closest('.att-check'))return;var idx=Number(row.getAttribute('data-student-index'));renderAIPanel(list[idx]);});});});
      if(fullList&&fullList.length>list.length){
        var moreBtn=document.createElement('button');
        moreBtn.className='att-see-all-btn';
        moreBtn.textContent=tr('att_see_all','Ver lista completa')+'  ('+fullList.length+')';
        moreBtn.addEventListener('click',function(){if(window.showPage)window.showPage('engagement');});
        box.appendChild(moreBtn);
      }}
    function toggleSelectPriority(){var rows=document.querySelectorAll('#actionFocusList .att-row');var allChecked=Array.prototype.every.call(rows,function(r){var chk=r.querySelector('.att-chk');return chk&&chk.checked;});rows.forEach(function(r){r.classList.toggle('selected',!allChecked);var chk=r.querySelector('.att-chk');if(chk)chk.checked=!allChecked;});}
    function openBulkEmail(){var rows=Array.prototype.filter.call(document.querySelectorAll('#actionFocusList .att-row'),function(r){var chk=r.querySelector('.att-chk');return chk&&chk.checked;});if(!rows.length){rows=Array.prototype.slice.call(document.querySelectorAll('#actionFocusList .att-row'));}var targets=rows.map(function(r){return {name:r.dataset.sname||'',email:r.dataset.semail||'',userid:Number(r.dataset.userid||0)};}).filter(function(t){return t.name;});if(!targets.length)return;if(targets.length===1&&window.MWAInterventions&&window.MWAInterventions.quickMessage){window.MWAInterventions.quickMessage(targets[0].name,targets[0].email,targets[0].userid,'');return;}openBulkModal(targets);}function openBulkModal(targets){
      var old=document.getElementById('mwaBulkOverlay');
      if(old)old.remove();
      var root=document.getElementById('block-mwa-dashboard-app')||document.body;
      var names=targets.map(function(t){return t.name;}).join(', ');
      var bulkType='moodle';

      var ov=document.createElement('div');
      ov.className='block-mwa-dashboard-app mwa-msg-overlay';
      ov.id='mwaBulkOverlay';
      ov.addEventListener('click',function(e){if(e.target===ov)ov.remove();});
      var modal=document.createElement('div');
      modal.className='mwa-msg-modal';
      var head=document.createElement('div');
      head.className='mwa-msg-head';
      var headText=document.createElement('div');
      var headName=document.createElement('div');
      headName.className='mwa-msg-head-name';
      headName.textContent='Mensagem para '+targets.length+' alunos';
      var headSub=document.createElement('div');
      headSub.className='mwa-msg-head-sub';
      headSub.style.cssText='font-size:.72rem;color:#6b7a99;';
      headSub.textContent=names.length>120?names.slice(0,120)+'...':names;
      headText.appendChild(headName);
      headText.appendChild(headSub);
      head.appendChild(headText);
      var closeBtn=document.createElement('button');
      closeBtn.className='mwa-msg-close';
      closeBtn.textContent='✕';
      closeBtn.onclick=function(){ov.remove();};
      head.appendChild(closeBtn);
      modal.appendChild(head);
      var body=document.createElement('div');
      body.className='mwa-msg-body';
      var typeDiv=document.createElement('div');
      var typeLabel=document.createElement('div');
      typeLabel.className='mwa-msg-label';
      typeLabel.textContent=tr('msg_send_type','Tipo de envio');
      var typeRow=document.createElement('div');
      typeRow.style.cssText='display:flex;gap:8px;';
      var btnMoodle=document.createElement('button');
      btnMoodle.className='mwa-msg-tpl-btn';
      btnMoodle.id='mwaBulkTypeMoodle';
      btnMoodle.textContent='💬 Mensagem Moodle';
      btnMoodle.style.cssText='border-color:var(--blue);color:var(--blue);font-weight:900;';
      var btnEmail=document.createElement('button');
      btnEmail.className='mwa-msg-tpl-btn';
      btnEmail.id='mwaBulkTypeEmail';
      btnEmail.textContent='📧 E-mail';

      function setBulkType(type){
        bulkType=type;
        btnMoodle.style.borderColor=type==='moodle'?'var(--blue)':'';
        btnMoodle.style.color=type==='moodle'?'var(--blue)':'';
        btnMoodle.style.fontWeight=type==='moodle'?'900':'';
        btnEmail.style.borderColor=type==='email'?'var(--green)':'';
        btnEmail.style.color=type==='email'?'var(--green)':'';
        btnEmail.style.fontWeight=type==='email'?'900':'';
      }
      btnMoodle.onclick=function(){setBulkType('moodle');};
      btnEmail.onclick=function(){setBulkType('email');};
      typeRow.appendChild(btnMoodle);
      typeRow.appendChild(btnEmail);
      typeDiv.appendChild(typeLabel);
      typeDiv.appendChild(typeRow);
      body.appendChild(typeDiv);
      var reasonDiv=document.createElement('div');
      var reasonLabel=document.createElement('div');
      reasonLabel.className='mwa-msg-label';
      reasonLabel.textContent='Motivo';
      var reasonSel=document.createElement('select');
      reasonSel.id='mwaBulkReason';
      reasonSel.className='mwa-msg-select';
      var reasonOpts=[
        {v:'',l:'— Selecionar motivo —'},
        {v:'Baixo engajamento',l:tr('msg_reason_low_eng')},
        {v:'Risco de evasão',l:tr('msg_reason_risk')},
        {v:'7+ dias sem acesso',l:'⏰ 7+ dias sem acesso'},
        {v:'Tarefa pendente',l:tr('msg_reason_task')},
        {v:'Reengajamento',l:tr('msg_reason_reeng')},
        {v:'Parabenizar',l:tr('msg_reason_praise')},
        {v:'Outro',l:tr('msg_reason_other')}
      ];
      reasonOpts.forEach(function(o){
        var opt=document.createElement('option');
        opt.value=o.v;
        opt.textContent=o.l;
        reasonSel.appendChild(opt);
      });
      reasonDiv.appendChild(reasonLabel);
      reasonDiv.appendChild(reasonSel);
      body.appendChild(reasonDiv);
      var subjDiv=document.createElement('div');
      var subjLabel=document.createElement('div');
      subjLabel.className='mwa-msg-label';
      subjLabel.textContent='Assunto';
      var subjInput=document.createElement('input');
      subjInput.id='mwaBulkSubject';
      subjInput.className='mwa-msg-input';
      subjInput.type='text';
      subjInput.placeholder=tr('msg_subject_placeholder','Assunto da mensagem');
      subjDiv.appendChild(subjLabel);
      subjDiv.appendChild(subjInput);
      body.appendChild(subjDiv);
      var msgDiv=document.createElement('div');
      var msgLabelRow=document.createElement('div');
      msgLabelRow.className='mwa-msg-label';
      msgLabelRow.style.cssText='display:flex;justify-content:space-between;';
      var msgLabelSpan=document.createElement('span');
      msgLabelSpan.textContent='Mensagem';
      var tplLabelSpan=document.createElement('span');
      tplLabelSpan.style.cssText='font-weight:400;text-transform:none;letter-spacing:0;';
      tplLabelSpan.textContent=tr('msg_templates_label');
      msgLabelRow.appendChild(msgLabelSpan);
      msgLabelRow.appendChild(tplLabelSpan);

      var tplRow=document.createElement('div');
      tplRow.className='mwa-msg-templates';
      var tplDefs={
        engagement:{label:tr('msg_reason_low_eng'),subject:tr('tpl_eng_subject'),body:tr('tpl_eng_body')},
        inactive:{label:tr('msg_reason_inactive'),subject:tr('tpl_inactive_subject'),body:tr('tpl_inactive_body')},
        submission:{label:tr('msg_reason_task'),subject:tr('tpl_task_subject'),body:tr('tpl_task_body')},
        praise:{label:tr('msg_reason_praise'),subject:tr('tpl_praise_subject'),body:tr('tpl_praise_body')}
      };
      Object.keys(tplDefs).forEach(function(k){
        var tb=document.createElement('button');
        tb.className='mwa-msg-tpl-btn';
        tb.textContent=tplDefs[k].label;
        tb.onclick=function(){
          subjInput.value=tplDefs[k].subject;
          msgArea.value=tplDefs[k].body;
        };
        tplRow.appendChild(tb);
      });

      var msgArea=document.createElement('textarea');
      msgArea.id='mwaBulkBody';
      msgArea.className='mwa-msg-textarea';
      msgArea.placeholder=tr('msg_body_placeholder')||'Digite sua mensagem...';

      msgDiv.appendChild(msgLabelRow);
      msgDiv.appendChild(tplRow);
      msgDiv.appendChild(msgArea);
      body.appendChild(msgDiv);
      var progressDiv=document.createElement('div');
      progressDiv.id='mwaBulkProgress';
      progressDiv.style.display='none';
      var progressTrack=document.createElement('div');
      progressTrack.style.cssText='background:#e8ecf5;border-radius:999px;height:8px;overflow:hidden;';
      var progressBar=document.createElement('div');
      progressBar.id='mwaBulkBar';
      progressBar.style.cssText='height:100%;background:var(--blue);border-radius:999px;width:0;transition:width .3s;';
      progressTrack.appendChild(progressBar);
      var progressStatus=document.createElement('div');
      progressStatus.id='mwaBulkStatus';
      progressStatus.style.cssText='font-size:.78rem;color:var(--muted);margin-top:6px;text-align:center;';
      progressDiv.appendChild(progressTrack);
      progressDiv.appendChild(progressStatus);
      body.appendChild(progressDiv);
      modal.appendChild(body);
      var footer=document.createElement('div');
      footer.className='mwa-msg-footer';
      var cancelBtn=document.createElement('button');
      cancelBtn.className='mwa-msg-cancel-btn';
      cancelBtn.textContent='Cancelar';
      cancelBtn.onclick=function(){ov.remove();};
      var sendBtn=document.createElement('button');
      sendBtn.className='mwa-msg-send-btn';
      sendBtn.id='mwaBulkSendBtn';
      sendBtn.textContent='✉️ Enviar para todos';

      sendBtn.onclick=function(){
        var subject=subjInput.value||'';
        var message=msgArea.value||'';
        var reason=reasonSel.value||'';
        if(!subject.trim()||!message.trim()){alert('Preencha o assunto e a mensagem.');return;}
        var sendType=bulkType;

        sendBtn.disabled=true;
        sendBtn.textContent='⏳ Enviando...';
        progressDiv.style.display='block';
        var bar=document.getElementById('mwaBulkBar');
        var statusEl=document.getElementById('mwaBulkStatus');

        var total=targets.length;
        var sent=0;var errors=0;
        var courseid=parseInt((Store.getConfig().courseid||0),10);
        var msgHtml=message.replace(/\n/g,'<br>');

        function sendOne(i){
          if(i>=total){
            if(bar)bar.style.width='100%';
            var msg='✅ Enviado para '+sent+' aluno'+(sent!==1?'s':'')+'.';
            if(errors)msg+=' ('+errors+' erro'+(errors!==1?'s':'')+')';
            if(statusEl)statusEl.textContent=msg;
            sendBtn.textContent=tr('ac_concluded');
            setTimeout(function(){if(ov.parentNode)ov.remove();},2200);
            if(window.MWAInterventions&&window.MWAInterventions.loadInterventions)
              window.MWAInterventions.loadInterventions();
            return;
          }
          var t=targets[i];
          if(statusEl)statusEl.textContent=tr('msg_sending_to','Enviando para')+' '+t.name+'... ('+(i+1)+'/'+total+')';
          if(bar)bar.style.width=Math.round((i/total)*100)+'%';

          Store.callAction('block_mwa_dashboard_send_message',{
            courseid:   courseid,
            userid:     t.userid,
            subject:    subject,
            message:    msgHtml,
            intervention_reason: reason,
            ai_generated: 0,
            send_type:  sendType,
            student_email: t.email||''
          }).then(function(res){
            if(res&&res.success)sent++;else errors++;
            sendOne(i+1);
          }).catch(function(){
            errors++;
            sendOne(i+1);
          });
        }
        sendOne(0);
      };

      footer.appendChild(cancelBtn);
      footer.appendChild(sendBtn);
      modal.appendChild(footer);
      ov.appendChild(modal);
      root.appendChild(ov);

      document.addEventListener('keydown',function esc_key(e){
        if(e.key==='Escape'){ov.remove();document.removeEventListener('keydown',esc_key);}
      });
    }
window.toggleSelectPriority=toggleSelectPriority;window.openBulkEmail=openBulkEmail;
    
    function gaugeColor(avg){return avg<40?'#d95f5f':avg<70?'#5b9bd5':'#3aab7a'}
    function renderSemiGauge(avg){
      var g=$('gauge');
      if(!g)return;
      var pct=Math.max(0,Math.min(100,Number(avg)||0));
      var dash=(pct/100)*330;
      g.style.setProperty('--gauge-color',gaugeColor(pct));
      g.replaceChildren();
      var ns='http://www.w3.org/2000/svg';
      var svg=document.createElementNS(ns,'svg');
      svg.setAttribute('viewBox','0 0 260 170');
      svg.setAttribute('role','img');
      svg.setAttribute('aria-label',pct+'%');
      var track=document.createElementNS(ns,'path');
      track.setAttribute('class','gauge-track');
      track.setAttribute('d','M 35 140 A 95 95 0 0 1 225 140');
      var progress=document.createElementNS(ns,'path');
      progress.setAttribute('class','gauge-progress');
      progress.setAttribute('d','M 35 140 A 95 95 0 0 1 225 140');
      progress.setAttribute('pathLength','330');
      progress.style.strokeDasharray=dash+' 330';
      var label=document.createElementNS(ns,'text');
      label.setAttribute('class','gauge-center-text');
      label.setAttribute('x','130');
      label.setAttribute('y','126');
      label.setAttribute('text-anchor','middle');
      label.textContent=pct+'%';
      svg.appendChild(track);
      svg.appendChild(progress);
      svg.appendChild(label);
      g.appendChild(svg);
    }
    function renderEngagement(){
      var avg=state().students.length?Math.round(state().students.reduce(function(a,s){return a+s.score},0)/state().students.length):0;
      var label=avg<40?tr('low_participation'):avg<70?tr('average_participation'):tr('high_participation');
      renderSemiGauge(avg);
      var pctEl=$('engPct'); if(pctEl) pctEl.textContent=avg+'%';
      var labelEl=$('engLabel'); if(labelEl) labelEl.textContent=label;
      var needAttention=state().students.filter(function(s){return s.score<70}).length;
      var actionsEl=$('actionsCount'); if(actionsEl) actionsEl.textContent=needAttention;
      if($('navActionBadge'))$('navActionBadge').textContent=needAttention;
      if($('navAlertBadge'))$('navAlertBadge').textContent=needAttention;
    }
    
    function openBulkForKind(kind) {
      var scoreFilter = {
        urgent:  function(s){ return (s.score||100) < 40; },
        warning: function(s){ return (s.score||100) >= 40 && (s.score||100) < 70; },
        good:    function(s){ return (s.score||100) >= 70; }
      };
      var filter = scoreFilter[kind] || function(){ return true; };
      var rows = Array.prototype.slice.call(
        document.querySelectorAll('#actionFocusList .att-row'));
      var targets = rows.map(function(r) {
        return {name: r.dataset.sname||'', email: r.dataset.semail||'',
                userid: Number(r.dataset.userid||0),
                score: Number(r.dataset.score||0)};
      }).filter(function(t) { return t.name && filter(t); });
      if (!targets.length) {
        var sc = (state && state().students) ||
                 (window.MWADashboard && window.MWADashboard.state && window.MWADashboard.state.students) || [];
        targets = sc.filter(filter).map(function(s) {
          return {name: s.name||'', email: s.email||'', userid: Number(s.userid||0)};
        }).filter(function(t){ return t.name; });
      }
      if (!targets.length) {
        var all = (state && state().students) || [];
        targets = all.map(function(s){
          return {name:s.name||'',email:s.email||'',userid:Number(s.userid||0)};
        }).filter(function(t){return t.name;});
      }
      if (!targets.length) { toast(tr('no_priority_students')||'Nenhum aluno encontrado.','error'); return; }
      openBulkModal(targets);
    }
    window.MWAActionCenter = {
      render: renderActionCenter,
      renderEngagement: renderEngagement,
      renderRetentionCurve: renderRetentionCurve,
      toggleSelectPriority: toggleSelectPriority,
      openBulkEmail: openBulkEmail,
      openBulkForKind: openBulkForKind,
      openBulkModal: openBulkModal
    };
    window.toggleSelectPriority = toggleSelectPriority;
    window.openBulkEmail = openBulkEmail;
    })();

    return window.MWAActionCenter;
});
