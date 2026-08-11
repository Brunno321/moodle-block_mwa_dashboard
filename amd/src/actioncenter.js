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
define(['block_mwa_dashboard/dashboardstore', 'core/templates',
    'block_mwa_dashboard/engagementcalc'], function(Store, Templates, EngagementCalc) {

    'use strict';

    var window = Store.windowFacade();
    var _realWindow = (function(){return this;})() || globalThis;
    var actionCardTargets = {};

    (function(){
    'use strict';
    function ctx(){ return window.MWADashboard || {}; }
    function $(id){ return (ctx().$ || function(x){return document.getElementById(x);})(id); }
    function tr(key, fallback){
      var f = ctx().tr || function(k){ return k; };
      var value = f(key, key);
      return value === key && fallback ? fallback : value;
    }
    function esc(v){ var f = ctx().esc || function(x){return String(x===undefined||x===null?'':x).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]});}; return f(v); }
    function norm(v){ var f = ctx().norm || function(x){return (x===undefined||x===null)?'':String(x).trim();}; return f(v); }
    function lower(v){ var f = ctx().lower || function(x){return norm(x).toLowerCase();}; return f(v); }
    function parseDate(log){ var f = ctx().parseDate; return f ? f(log) : null; }
    function studentKey(name,email){ var f = ctx().studentKey || function(n,e){return lower(e)||lower(n);}; return f(name,email); }
    function componentName(log){ var f = ctx().componentName || function(){return tr('other');}; return f(log); }
    function state(){ return ctx().state || {logs:[],students:[],activities:[]}; }
    function hydrateMessageTarget(target){
      target=Object.assign({},target||{});
      var targetId=Number(target.userid||0);
      var targetEmail=lower(target.email||'');
      var targetName=lower(target.name||'');
      var student=(state().students||[]).find(function(item){
        var itemId=Number(item&&item.userid||0);
        var itemEmail=lower(item&&item.email||'');
        var itemName=lower(item&&item.name||'');
        return (targetId&&itemId===targetId)||(targetEmail&&itemEmail===targetEmail)||
          (targetName&&itemName===targetName);
      });
      if(student)target=Object.assign({},student,target);
      if(target.name){
        var calc=EngagementCalc.calculateForStudent(target.name,target.email||'',state().logs||[],state().grades||[]);
        target.score=Math.round(Number(calc&&calc.score||0));
      }
      return target;
    }
    function initials(name){var parts=norm(name).split(/\s+/).filter(Boolean);return ((parts[0]?parts[0][0]:'?')+(parts[1]?parts[1][0]:'')) || '?'}
    function studentPicture(s){return norm(s&&s.pictureurl);}
    function avatarInner(s){var pic=studentPicture(s);return pic?'<img src="'+esc(pic)+'" alt="'+esc(s.name)+'" loading="lazy">':esc(initials(s.name).toUpperCase());}
    function renderTemplate(node, template, context){
      if(!node)return Promise.resolve(null);
      return Templates.render('block_mwa_dashboard/'+template, context||{}).then(function(html, js){
        Templates.replaceNodeContents(node, html, js);
        return node;
      });
    }
    function riskClass(score){return score<=40?'danger':score<70?'warn':'good'}
    function avatarHtml(s){return '<span class="ac-av '+riskClass(s.score)+(studentPicture(s)?' has-img':'')+'" title="'+esc(s.name)+'" data-av-name="'+esc(s.name)+'" style="cursor:pointer">'+avatarInner(s)+'</span>'}
    function miniAvatars(list){if(!list||!list.length)return '';var shown=list.slice(0,5).map(avatarHtml).join('');if(list.length>5)shown+='<span class="ac-av ac-av-more">+'+(list.length-5)+'</span>';return shown;}
    function isOpenNow(meta){
      var now=Math.floor(Date.now()/1000);
      if(!meta)return true;
      if(String(meta.available||'1')==='0'||meta.available===0)return false;
      var from=Number(meta.availablefrom||0);
      var until=Number(meta.availableuntil||0);
      if(from&&from>now)return false;
      if(until&&until<now)return false;
      return true;
    }
    function moduleOfLog(log){
      var mod=lower(log&& (log._modtype||log.modtype||log.module||log.modname||''));
      var comp=lower(log&& (log.component||log.componente||''));
      if(!mod&&comp.indexOf('mod_')===0)mod=comp.replace(/^mod_/,'');
      if(mod==='hvp')mod='h5pactivity';
      if(mod==='assignsubmission')mod='assign';
      return mod;
    }
    function cmidOfLog(log){
      var cmid=parseInt((log&& (log.cmid||log._cmid||log.contextinstanceid||log.contextinstance||log.coursemoduleid||log.moduleid))||0,10);
      return isNaN(cmid)?0:cmid;
    }
    function realContextName(log){
      var ctxName=norm(log&& (log.contextodoevento||log.eventcontext||log.context||''));
      var ev=norm(log&& (log.nomedoevento||log.eventname||log.action||''));
      var low=lower(ctxName);
      if(ctxName&&low!=='course module viewed'&&low!=='mÃƒÆ’Ã‚Â³dulo do curso visualizado')return ctxName.replace(/^(page|pÃƒÆ’Ã‚Â¡gina|book|livro|url|resource|recurso|file|arquivo|folder|pasta)\s*:\s*/i,'');
      return ev&&lower(ev)!=='course module viewed'?ev:'';
    }
    function isResourceLog(log){
      var mod=moduleOfLog(log);
      var comp=lower(log&& (log.component||log.componente||''));
      if(mod==='label'||comp.indexOf('ÃƒÆ’Ã‚Â¡rea de mÃƒÆ’Ã‚Â­dia e texto')>=0||comp.indexOf('text and media area')>=0)return false;
      return ['page','book','url','resource','folder','imscp'].indexOf(mod)>=0||['pÃƒÆ’Ã‚Â¡gina','page','livro','book','url','arquivo','file','pasta','folder'].indexOf(comp)>=0;
    }
    function studentAccessedCatalogItem(student,item){
      var studentName=lower(student&&student.name);
      var studentEmail=lower(student&&student.email);
      var studentId=Number(student&&student.userid||0);
      var itemCmid=cmidOfLog(item);
      var itemName=lower(item&&item.name);
      return (state().logs||[]).some(function(log){
        var logName=lower(log.nomecompleto||log.student_name||log.userfullname||log.fullname||log.name||'');
        var logEmail=lower(log.email||'');
        var logUserId=Number(log._userid||log.userid||0);
        var sameStudent=(studentId&&logUserId===studentId)||(studentEmail&&logEmail===studentEmail)||
          (studentName&&logName===studentName);
        if(!sameStudent)return false;
        return itemCmid?cmidOfLog(log)===itemCmid:lower(realContextName(log))===itemName;
      });
    }
    function mergeCatalogTargets(items,student,wantResource){
      var result=(items||[]).slice();
      var known={};
      result.forEach(function(item){known[item.cmid?'cmid:'+item.cmid:'name:'+lower(item.name)]=true;});
      (Store.getConfig().activitylinks||[]).forEach(function(link){
        var resource=isResourceLog(link);
        var mod=moduleOfLog(link);
        var name=norm(link.name||'');
        var cmid=cmidOfLog(link);
        var key=cmid?'cmid:'+cmid:'name:'+lower(name);
        if(!name||mod==='label'||resource!==wantResource||known[key]||!isOpenNow(link)||
            studentAccessedCatalogItem(student,link))return;
        result.push({id:key,type:resource?'resource':'activity',name:name,cmid:cmid,mod:mod,
          url:norm(link.url||''),available:true,done:false});
        known[key]=true;
      });
      return result;
    }
    function buildActivityTargetsForStudent(student){
      var grades=(state().grades||[]);
      if(!grades.length)return mergeCatalogTargets([],student,false);
      var meta=grades[0]&&grades[0].__mwa_type__==='activity_names'?grades[0]:null;
      if(!meta)return mergeCatalogTargets([],student,false);
      var studentName=lower(student&&student.name);
      var studentEmail=lower(student&&student.email);
      var studentId=Number(student&&student.userid||0);
      var row=null;
      grades.some(function(g){
        if(!g||g.__mwa_type__==='activity_names')return false;
        var first=norm(g['First name']||g.Nome||g.firstname||'');
        var last=norm(g['Last name']||g.Sobrenome||g.lastname||'');
        var gname=lower(g.student_name||g.name||g.nomecompleto||g.Aluno||(first+' '+last));
        var email=lower(g.Email||g.email||'');
        var gradeUserId=Number(g['User ID']||g.userid||0);
        if((studentId&&gradeUserId===studentId)||(studentEmail&&email===studentEmail)||
            (studentName&&gname===studentName)){row=g;return true;}
        return false;
      });
      if(!row)return mergeCatalogTargets([],student,false);
      var targets=Object.keys(meta).filter(function(k){return /^act_\d+$/.test(k);}).map(function(k){
        var seq=k.replace('act_','');
        var name=norm(meta[k]);
        var mod=lower(meta['act_module_'+seq]||'');
        var cmid=parseInt(meta['act_cmid_'+seq]||0,10)||0;
        var available={available:meta['act_available_'+seq],availablefrom:meta['act_availablefrom_'+seq],availableuntil:meta['act_availableuntil_'+seq]};
        var current=parseInt(row['act_current_'+seq]||0,10)||0;
        var val=row['act_'+seq];
        var num=parseFloat(String(val||'').replace(',','.'));
        var hasGrade=!isNaN(num)&&num>0;
        var done=(mod==='forum')?current>0:(current>0||hasGrade);
        var www=(Store.getConfig().wwwroot||'').replace(/\/$/,'');
        return {id:'act:'+seq,type:'activity',name:name,cmid:cmid,mod:mod,seq:Number(seq),available:isOpenNow(available),done:done,url:(www&&cmid&&mod)?www+'/mod/'+encodeURIComponent(mod)+'/view.php?id='+encodeURIComponent(String(cmid)):''};
      }).filter(function(item){return item.name&&item.available&&!item.done;});
      return mergeCatalogTargets(targets,student,false);
    }
    function buildResourceTargetsForStudent(student){
      var logs=state().logs||[];
      var studentName=lower(student&&student.name);
      var studentEmail=lower(student&&student.email);
      var studentId=Number(student&&student.userid||0);
      var resources={};
      (Store.getConfig().activitylinks||[]).forEach(function(link){
        if(!isResourceLog(link)||!isOpenNow(link))return;
        var name=norm(link.name||'');
        var cmid=cmidOfLog(link);
        var mod=moduleOfLog(link);
        if(!name)return;
        var key=cmid?'cmid:'+cmid:'name:'+lower(name);
        resources[key]={id:key,type:'resource',name:name,cmid:cmid,mod:mod,
          url:norm(link.url||''),available:true,students:{}};
      });
      logs.forEach(function(log){
        if(!isResourceLog(log))return;
        if(!isOpenNow({available:log._available,availablefrom:log._availablefrom,availableuntil:log._availableuntil}))return;
        var name=realContextName(log);
        if(!name)return;
        var cmid=cmidOfLog(log);
        var mod=moduleOfLog(log);
        var key=cmid?'cmid:'+cmid:'name:'+lower(name);
        if(!resources[key])resources[key]={id:key,type:'resource',name:name,cmid:cmid,mod:mod,url:norm(log.url||log.contexturl||log.objecturl||log.link||log.viewurl||log._url||''),available:true,students:{}};
        var sname=lower(log.nomecompleto||log.student_name||log.userfullname||log.fullname||log.name||'');
        var semail=lower(log.email||'');
        var logUserId=Number(log._userid||log.userid||0);
        if(sname)resources[key].students[sname]=1;
        if(semail)resources[key].students[semail]=1;
        if(logUserId)resources[key].students['id:'+logUserId]=1;
      });
      var www=(Store.getConfig().wwwroot||'').replace(/\/$/,'');
      return Object.keys(resources).map(function(k){
        var r=resources[k];
        var seen=(studentId&&r.students['id:'+studentId])||(studentName&&r.students[studentName])||
          (studentEmail&&r.students[studentEmail]);
        if(!r.url&&www&&r.cmid&&r.mod)r.url=www+'/mod/'+encodeURIComponent(r.mod)+'/view.php?id='+encodeURIComponent(String(r.cmid));
        r.done=!!seen;
        return r;
      }).filter(function(item){return item.name&&item.available&&!item.done;});
    }
    function targetsForReason(reason, target){
      if(reason==='Pendência acadêmica')return buildActivityTargetsForStudent(target);
      if(reason==='Baixa participação')return buildResourceTargetsForStudent(target);
      return [];
    }
    function helpTip(text){
      var safe=esc(text||'');
      return safe?'<span class="mwa-help-tip" tabindex="0" role="img" aria-label="'+safe+'" title="'+safe+'" data-tooltip="'+safe+'">?</span>':'';
    }
    function isNeverAccessed(s){return !s.last && (s.interactions||0)===0;}
    function urgentBucket(s){
      if(isNeverAccessed(s))return 'never';
      if((s.daysWithoutAccess||0)>=7)return 'inactive';
      return 'low';
    }
    function urgentSort(a,b){
      var wa={never:0,inactive:1,low:2}, ba=urgentBucket(a), bb=urgentBucket(b);
      if(wa[ba]!==wa[bb])return wa[ba]-wa[bb];
      if((b.daysWithoutAccess||0)!==(a.daysWithoutAccess||0))return (b.daysWithoutAccess||0)-(a.daysWithoutAccess||0);
      return (a.score||0)-(b.score||0);
    }
    function urgentSummaryHtml(list){
      var counts={never:0,inactive:0,low:0};
      (list||[]).forEach(function(s){counts[urgentBucket(s)]++;});
      var rows=[
        {count:counts.never,label:tr('ac_summary_never')},
        {count:counts.inactive,label:tr('ac_summary_inactive')},
        {count:counts.low,label:tr('ac_summary_low','com baixa participação')}
      ].filter(function(r){return r.count>0;});
      if(!rows.length)return '';
      return '<div class="ac-urgent-summary">'+rows.map(function(r){return '<span><strong>'+r.count+'</strong> '+esc(r.label)+'</span>';}).join('')+'</div>';
    }
    function urgentAvatarsHtml(list){
      var MAX_SHOWN=5;
      var shown=list.slice(0,MAX_SHOWN);
      var extra=list.slice(MAX_SHOWN);
      var html='<div class="ac-avatars ac-avatars-urgent">';
      html+=shown.map(avatarHtml).join('');
      if(extra.length){
        html+='<span class="ac-av ac-av-more ac-av-open-list" title="'+esc(tr('view_list'))+'" data-action-page="alerts">+'+extra.length+'</span>';
      }
      html+='</div>';
      return html+urgentSummaryHtml(list);
    }
    function attentionSummaryHtml(items){
      var counts={zero:0,low:0,delivery:0};
      (items||[]).forEach(function(it){
        var pct=Number(it.pct);
        if(!isFinite(pct))pct=parseInt(String(it.value||'').replace('%',''),10)||0;
        if(pct<=0)counts.zero++;
        else if(pct<60)counts.low++;
        var dpct=Number(it.deliveryPct);
        if(isFinite(dpct)&&dpct<60)counts.delivery++;
      });
      var rows=[
        {count:counts.zero,label:tr('ac_summary_no_access_activities','sem acesso')},
        {count:counts.low,label:tr('ac_summary_low','com baixa participação')},
        {count:counts.delivery,label:tr('ac_summary_low_delivery','com baixa entrega')}
      ].filter(function(r){return r.count>0;});
      if(!rows.length)return '';
      return '<div class="ac-compact-summary attention">'+rows.map(function(r){return '<span><strong>'+r.count+'</strong> '+esc(r.label)+'</span>';}).join('')+'</div>';
    }
    function attentionItemsHtml(items){
      var MAX_SHOWN=3;
      var list=items||[];
      var shown=list.slice(0,MAX_SHOWN);
      var extra=list.length-MAX_SHOWN;
      if(!list.length)return '';
      function shortName(n){
        n=String(n||'');
        return n.length>32?n.slice(0,31).replace(/[\s\-–—:,.]+$/,'')+'\u2026':n;
      }
      var html='<div class="ac-items ac-items-compact">'+shown.map(function(it){
        var full=String(it.name||'');
        var txt=esc(shortName(full));
        var label=it.url
          ?'<a class="ac-item-name ac-item-link" href="'+esc(it.url)+'" target="_blank" rel="noopener" title="'+esc(full)+'">'+txt+'</a>'
          :'<span class="ac-item-name" title="'+esc(full)+'">'+txt+'</span>';
        return '<div class="ac-item-row">'+label+'</div>';
      }).join('');
      if(extra>0){
        html+='<div class="ac-item-row ac-item-more-row"><button type="button" class="ac-item-more" data-action-page="activities" data-act-low="1">+'+extra+' '+esc(tr('ac_more_activities','mais'))+'</button></div>';
      }
      html+='</div>';
      return html+attentionSummaryHtml(list);
    }
    function actionCard(kind,label,count,desc,students,items,primary,secondary,page,insight,chartHtml,secondaryPage,tip){
      var content='';
      if(chartHtml){content='<div class="ac-chart-mini">'+chartHtml+'</div>';}
      else if(kind==='urgent'||kind==='attention'){content=urgentAvatarsHtml(students||[]);}
      else if(kind==='review'){content=attentionItemsHtml(items||[]);}
      else if(items&&items.length){content='<div class="ac-items">'+items.slice(0,3).map(function(it){return '<div class="ac-item-row"><span class="ac-item-name">'+esc(it.name)+'</span></div>'}).join('')+'</div>';}
      else{var av=miniAvatars(students||[]);if(av)content='<div class="ac-avatars">'+av+'</div>';}
      content='<div class="ac-card-content '+kind+'">'+content+'</div>';
      var primaryBtn;
      if(kind==='urgent'||kind==='attention'){
        primaryBtn='<button class="ac-btn-p" data-bulk-kind="'+esc(kind)+'">'+esc(primary)+'</button>';
      } else {
        var lowAttr=(kind==='review')?' data-act-low="1"':'';
        primaryBtn='<button class="ac-btn-p" data-action-page="'+esc(page)+'"'+lowAttr+'>'+esc(primary)+'</button>';
      }
      var secondaryBtn='';
      if(kind!=='review'&&kind!=='opportunity'){
        var filterAttr=kind==='urgent'?' data-cl-filter-target="never"':kind==='attention'?' data-cl-filter-target="low"':'';
        secondaryBtn='<button class="ac-btn-s" data-action-page="'+esc(secondaryPage||page)+'"'+filterAttr+'>'+esc(secondary)+'</button>';
      }
      return '<div class="ac-card '+kind+'"><div class="ac-badge-row"><span class="ac-badge '+kind+'">'+esc(label)+'</span>'+helpTip(tip)+'<span class="ac-time">'+tr('updated_now')+'</span></div><div class="ac-number '+kind+'">'+esc(count)+'</div><div class="ac-desc">'+esc(desc)+'</div>'+content+'<div class="ac-btn-row">'+primaryBtn+secondaryBtn+'</div>'+(insight?'<div class="ac-insight">&#128161; '+esc(insight)+'</div>':'')+'</div>';
    }
    function peakHourInfo(){var hours=Array(24).fill(0);state().logs.forEach(function(l){var d=parseDate(l);if(d)hours[d.getHours()]++});var max=Math.max.apply(null,hours), peak=max>0?hours.indexOf(max):-1;return {hours:hours,peak:peak,max:max}}
    function miniHourChart(info){if(!info||info.peak<0)return '';var max=Math.max(1,info.max);return info.hours.map(function(v,i){var h=Math.max(4,Math.round((v/max)*48));return '<div class="ac-bar-mini '+(i===info.peak?'hi':'')+'" style="height:'+h+'px" title="'+i+'h: '+v+'"></div>'}).join('')}
    function mwaSubmissionsByActivity(){
      var map={};
      (state().logs||[]).forEach(function(l){
        var a=String(l.contextodoevento||l.context||l.eventcontext||l._resource||l._modtype||'').trim();
        if(!a)return;
        var txt=String([l.nomedoevento,l.eventname,l.action,l.componente,l.component,l._modtype].join(' ')).toLowerCase();
        var isSub=txt.indexOf('submit')>=0||txt.indexOf('submission')>=0||txt.indexOf('upload')>=0||
          txt.indexOf('post created')>=0||txt.indexOf('discussion created')>=0||
          txt.indexOf('attempt submitted')>=0||txt.indexOf('graded')>=0||
          txt.indexOf('submetid')>=0||txt.indexOf('envio')>=0;
        if(!isSub)return;
        var who=String(l.email||l.nomecompleto||l.student_name||l.userfullname||'').toLowerCase().trim();
        if(!who)return;
        if(!map[a])map[a]={};
        map[a][who]=true;
      });
      return map;
    }

    function mwaDeliveryPct(act,subMap,totalStudents){
      var mod=String(act.modtype||'').toLowerCase();
      var graded=(mod==='assign'||mod==='quiz'||mod==='forum');
      var done=graded?Object.keys(subMap[act.name]||{}).length:(act.unique||0);
      if(!totalStudents)return 0;
      return Math.round((done/totalStudents)*100);
    }

    function contentReachTotal(){
      var names={};
      state().logs.forEach(function(l){
        if(!parseDate(l))return;
        var n=norm(l.nomecompleto||l.student_name||l.userfullname);
        if(n)names[n]=1;
      });
      return Math.max(1,Object.keys(names).length);
    }
    function activityUrl(item){
      var cfg=Store.getConfig?Store.getConfig():{};
      if(item&&item.url)return item.url;
      if(item&&item.name){
        var names=window.MWA_ACT_NAMES||{}, cmids=window.MWA_ACT_CMIDS||{}, mods=window.MWA_ACT_MODULES||{};
        var foundSeq=Object.keys(names).find(function(seq){return lower(names[seq])===lower(item.name);});
        if(foundSeq){
          item.cmid=parseInt(cmids[foundSeq]||item.cmid||0,10)||0;
          item.modtype=norm(mods[foundSeq]||item.modtype||'');
        }
      }
      if(!item||!item.cmid||!item.modtype||!cfg.wwwroot)return '';
      return cfg.wwwroot.replace(/\/$/,'')+'/mod/'+encodeURIComponent(item.modtype)+'/view.php?id='+encodeURIComponent(String(item.cmid));
    }
    function isTextMediaArea(item){
      if(!item)return false;
      var mod=lower(item.modtype||item.module||item.type||'');
      var name=norm(item.name||item.context||'');
      var plain=name.toLowerCase().normalize ? name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'') : name.toLowerCase();
      return mod==='label'||plain.indexOf('area de midia e texto')===0||
        plain.indexOf('area de texto e midia')===0||plain.indexOf('text and media area')===0;
    }
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
        labels.push(w===0?tr('this_week'):w+' '+tr('weeks_ago','semanas atr?s'));
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
          label:tr('active_students'),data:values,
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
                var diffStr='';
                if(diff!==null){
                  if(diff>0){diffStr=' (+'+diff+' voltaram)';}
                  else if(diff<0){diffStr=' ('+diff+' sairam)';}
                  else{diffStr=' (estavel)';}
                }
                return cur+' alunos ativos'+diffStr;
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
        var wLabel=w===0?tr('this_week'):w+' semana(s) atras';
        var html='<div style="padding:.25rem 0;">';
        html+='<div style=\"font-size:.8rem;font-weight:700;margin-bottom:.6rem;\">'+esc(wLabel)+' - '+Object.keys(cur).length+' alunos ativos</div>';
        if(left.length)html+='<div class=\"mwa-ret-left\">Nao voltaram ('+left.length+'): '+left.map(function(n){var p=n.trim().split(/\s+/);return esc((p[0]||'')+' '+(p[p.length-1]||''));}).join(', ')+'</div>';
        if(came.length)html+='<div class=\"mwa-ret-came\">Voltaram/novos ('+came.length+'): '+came.map(function(n){var p=n.trim().split(/\s+/);return esc((p[0]||'')+' '+(p[p.length-1]||''));}).join(', ')+'</div>';
        if(stayed.length)html+='<div class="mwa-ret-stayed">'+tr('ret_drill_stayed','&#10003; Continuaram ({n})').replace('{n}',stayed.length)+'</div>';
        html+='</div>';
        showRetentionDrill(wLabel+' - Retencao',html);
      };
    }
    function firstName(name){return (norm(name).split(/\s+/)[0]||norm(name)||'aluno');}
    function isCurrentlyOpenItem(it){
      if(!it)return false;
      if(it.available===false||String(it.available)==='0')return false;
      var now=Math.floor(Date.now()/1000);
      var from=parseInt(it.availablefrom||it.openfrom||it.timeopen||0,10)||0;
      var until=parseInt(it.availableuntil||it.closeafter||it.timeclose||0,10)||0;
      if(from&&now<from)return false;
      if(until&&now>until)return false;
      return true;
    }
    function renderActionCenter(){
      var neverAccessed=state().students.filter(isNeverAccessed).sort(function(a,b){return (a.name||'').localeCompare(b.name||'');});
      var high=state().students.filter(function(s){return Number(s.interactions||0)>0&&s.score<40&&!isNeverAccessed(s)}).sort(urgentSort);
      var med=state().students.filter(function(s){return s.score>40&&s.score<70});
      var good=state().students.filter(function(s){return s.score>=70});
      actionCardTargets.never = neverAccessed.slice();
      actionCardTargets.urgent = neverAccessed.slice();
      actionCardTargets.attention = high.slice();
      actionCardTargets.warning = med.slice();
      actionCardTargets.good = good.slice();
      var totalStudents=contentReachTotal();
      var mwaSubMap=mwaSubmissionsByActivity();
      var lowCoverage=state().activities.slice().filter(function(a){return !isTextMediaArea(a)&&isCurrentlyOpenItem(a);}).map(function(a){var pct=Math.round(((a.unique||0)/totalStudents)*100);var dpct=mwaDeliveryPct(a,mwaSubMap,totalStudents);var worst=Math.min(pct,dpct);var item={name:a.name,pct:pct,deliveryPct:dpct,worst:worst,unique:a.unique,value:worst+'%',cmid:a.cmid||0,modtype:a.modtype||''};item.url=activityUrl(item);return item;}).filter(function(a){return a.pct<60||a.deliveryPct<60}).sort(function(a,b){return a.worst-b.worst});
      var peak=peakHourInfo();var peakLabel=peak.peak>=0?tr('peak_at')+' '+String(peak.peak).padStart(2,'0')+'h':'-';
      var peakDesc=peak.peak>=0?tr('peak_desc'):tr('no_peak_desc');
      renderTemplate($('actionCardsRow'),'content_inline_html',{bodyhtml:
        actionCard('urgent',tr('urgent'),neverAccessed.length,neverAccessed.length?tr('ac_never_desc'):tr('ac_no_never_students'),neverAccessed,[],tr('send_email_ai'),tr('view_list'),'alerts',tr('ac_never_insight'),'','classlist',tr('ac_tip_card_never'))
        +actionCard('attention',tr('attention'),high.length,high.length?tr('urgent_desc'):tr('no_critical_students'),high,high.slice(0,3).map(function(s){return {name:s.name,value:s.score+'%'}}),tr('send_email_ai'),tr('view_list'),'alerts',tr('urgent_insight'),'','classlist',tr('ac_tip_card_urgent'))
        +actionCard('review',tr('ac_review'),lowCoverage.length,lowCoverage.length?tr('attention_desc'):tr('good_engagement'),med,lowCoverage,tr('analyse_activities'),tr('view_list'),'activities',lowCoverage.length?tr('attention_insight'):'','','activities',tr('ac_tip_card_attention'))
        +actionCard('opportunity',tr('opportunity'),peakLabel,peakDesc,good.slice(0,5),[],tr('view_heatmap'),tr('view_profiles'),'heatmap',tr('opportunity_insight'),miniHourChart(peak),'classlist',tr('ac_tip_card_opportunity'))});
      renderRetentionCurve();
      var row=$('actionCardsRow');
      if(row){row.addEventListener('click',function(ev){
        var expandBtn=ev.target.closest('.ac-av-expand');
        if(expandBtn){ev.stopPropagation();var extra=expandBtn.nextElementSibling;if(!extra||!extra.classList.contains('ac-av-extra'))return;var open=extra.style.display!=='none';extra.style.display=open?'none':'inline-flex';expandBtn.textContent=open?'+'+(extra.children.length):'-';return;}
        var av=ev.target.closest('.ac-av[data-av-name]');
        if(av){ev.stopPropagation();var name=av.getAttribute('data-av-name');if(name&&window.goToStudentProfile)window.goToStudentProfile(name);return;}
      },true);}
    }
    function toggleSelectPriority(){var rows=document.querySelectorAll('#actionFocusList .att-row');var allChecked=Array.prototype.every.call(rows,function(r){var chk=r.querySelector('.att-chk');return chk&&chk.checked;});rows.forEach(function(r){r.classList.toggle('selected',!allChecked);var chk=r.querySelector('.att-chk');if(chk)chk.checked=!allChecked;});}
    function openBulkEmail(){var rows=Array.prototype.filter.call(document.querySelectorAll('#actionFocusList .att-row'),function(r){var chk=r.querySelector('.att-chk');return chk&&chk.checked;});if(!rows.length){rows=Array.prototype.slice.call(document.querySelectorAll('#actionFocusList .att-row'));}var targets=rows.map(function(r){return {name:r.dataset.sname||'',email:r.dataset.semail||'',userid:Number(r.dataset.userid||0)};}).filter(function(t){return t.name;});if(!targets.length)return;openBulkModal(targets);}function openBulkModal(targets,preset){
      var old=document.getElementById('mwaBulkOverlay');
      if(old)old.remove();
      var root=document.getElementById('block-mwa-dashboard-app')||document.body;
      targets=(targets||[]).filter(function(t){return t&&t.name;}).map(hydrateMessageTarget);
      var selectedTargets=targets.slice();
      function targetNames(list){return (list||[]).map(function(t){return t.name;}).join(', ');}
      function recipientFirstName(t){return firstName((t&&t.name)||'');}
      function personalizeMessageText(text,t){
        var fn=recipientFirstName(t);
        return String(text||'').replace(/\{firstname\}|\{nome\}|\{name\}/g,fn);
      }
      function previewMessageText(text){
        if(selectedTargets.length===1)return personalizeMessageText(text,selectedTargets[0]);
        return String(text||'').replace(/\{nome\}|\{name\}/g,'{firstname}');
      }
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
      var studentLabel=targets.length===1?tr('student'):tr('students');
      headName.textContent=tr('msg_modal_title')+' '+targets.length+' '+studentLabel;
      var headSub=document.createElement('div');
      headSub.className='mwa-msg-head-sub';
      headSub.style.cssText='font-size:.72rem;color:#6b7a99;';
      headSub.textContent=targetNames(selectedTargets).length>120?targetNames(selectedTargets).slice(0,120)+'...':targetNames(selectedTargets);
      headText.appendChild(headName);
      headText.appendChild(headSub);
      head.appendChild(headText);
      var closeBtn=document.createElement('button');
      closeBtn.className='mwa-msg-close';
      closeBtn.textContent='\u00D7';
      closeBtn.onclick=function(){ov.remove();};
      head.appendChild(closeBtn);
      modal.appendChild(head);
      var body=document.createElement('div');
      body.className='mwa-msg-body';
      var targetDiv=document.createElement('div');
      var targetLabelEl=document.createElement('div');
      targetLabelEl.className='mwa-msg-label';
      targetLabelEl.textContent=tr('msg_recipients_label','Destinatários');
      targetDiv.className='mwa-recipient-dropdown';
      var targetBtn=document.createElement('button');
      targetBtn.type='button';
      targetBtn.className='mwa-recipient-toggle';
      targetBtn.id='mwaBulkRecipients';
      var targetBtnText=document.createElement('span');
      targetBtnText.textContent=tr('msg_recipients_all')+' ('+targets.length+')';
      var targetBtnArrow=document.createElement('span');
      targetBtnArrow.className='mwa-recipient-arrow';
      targetBtnArrow.textContent='\u25BE';
      targetBtn.appendChild(targetBtnText);
      targetBtn.appendChild(targetBtnArrow);
      var targetList=document.createElement('div');
      targetList.className='mwa-recipient-list';
      var selectAllLabel=document.createElement('label');
      selectAllLabel.className='mwa-recipient-check all';
      var selectAllBox=document.createElement('input');
      selectAllBox.type='checkbox';
      selectAllBox.checked=true;
      selectAllBox.id='mwaBulkSelectAll';
      selectAllLabel.appendChild(selectAllBox);
      var selectAllText=document.createElement('span');
      selectAllText.textContent=tr('msg_recipients_select_all');
      selectAllLabel.appendChild(selectAllText);
      targetList.appendChild(selectAllLabel);
      targets.forEach(function(t,i){
        var row=document.createElement('label');
        row.className='mwa-recipient-check';
        var chk=document.createElement('input');
        chk.type='checkbox';
        chk.checked=true;
        chk.value=String(i);
        chk.className='mwa-recipient-item';
        var txt=document.createElement('span');
        var nameStrong=document.createElement('strong');
        nameStrong.textContent=t.name||'';
        txt.appendChild(nameStrong);
        if(t.email){
          var emailSmall=document.createElement('small');
          emailSmall.textContent=t.email;
          txt.appendChild(emailSmall);
        }
        row.appendChild(chk);
        row.appendChild(txt);
        targetList.appendChild(row);
      });
      function updateRecipients(){
        var checked=Array.prototype.slice.call(targetList.querySelectorAll('.mwa-recipient-item:checked')).map(function(chk){return targets[Number(chk.value)];}).filter(Boolean);
        selectedTargets=checked;
        selectAllBox.checked=selectedTargets.length===targets.length;
        selectAllBox.indeterminate=selectedTargets.length>0&&selectedTargets.length<targets.length;
        var label=selectedTargets.length===1?tr('student'):tr('students');
        headName.textContent=tr('msg_modal_title')+' '+selectedTargets.length+' '+label;
        var names=targetNames(selectedTargets);
        headSub.textContent=names.length>120?names.slice(0,120)+'...':names;
        if(sendBtn&&!sendBtn.classList.contains('is-sending'))resetSendButton();
        targetBtnText.textContent=selectedTargets.length===targets.length
          ? tr('msg_recipients_all')+' ('+targets.length+')'
          : selectedTargets.length===1
            ? selectedTargets[0].name
            : selectedTargets.length+' '+tr('students','estudantes');
        if(targetSelectList){
          renderTargetOptions();
          updateTargetMessage();
        }
      }
      function setAllRecipients(checked){
        Array.prototype.slice.call(targetList.querySelectorAll('.mwa-recipient-item')).forEach(function(chk){chk.checked=checked;});
        updateRecipients();
      }
      targetBtn.onclick=function(e){
        e.preventDefault();
        e.stopPropagation();
        targetDiv.classList.toggle('is-open');
      };
      selectAllBox.onchange=function(){setAllRecipients(selectAllBox.checked);};
      targetList.addEventListener('change',function(e){
        if(e.target&&e.target.classList.contains('mwa-recipient-item')){
          updateRecipients();
        }
      });
      document.addEventListener('click',function closeRecipients(e){
        if(!ov.parentNode){document.removeEventListener('click',closeRecipients);return;}
        if(!targetDiv.contains(e.target))targetDiv.classList.remove('is-open');
      });
      targetDiv.appendChild(targetLabelEl);
      targetDiv.appendChild(targetBtn);
      targetDiv.appendChild(targetList);
      body.appendChild(targetDiv);
      var typeDiv=document.createElement('div');
      var typeLabel=document.createElement('div');
      typeLabel.className='mwa-msg-label';
      typeLabel.textContent=tr('msg_send_type_label');
      var typeRow=document.createElement('div');
      typeRow.style.cssText='display:flex;gap:8px;';
      var btnMoodle=document.createElement('button');
      btnMoodle.className='mwa-msg-tpl-btn';
      btnMoodle.id='mwaBulkTypeMoodle';
      btnMoodle.textContent='\uD83D\uDCAC '+tr('msg_type_moodle_btn');
      btnMoodle.style.cssText='border-color:var(--blue);color:var(--blue);font-weight:900;';
      var btnEmail=document.createElement('button');
      btnEmail.className='mwa-msg-tpl-btn';
      btnEmail.id='mwaBulkTypeEmail';
      btnEmail.textContent='\uD83D\uDCE7 '+tr('msg_type_email_btn');

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
      reasonLabel.textContent=tr('msg_detail_reason');
      var reasonSel=document.createElement('select');
      reasonSel.id='mwaBulkReason';
      reasonSel.className='mwa-msg-select';
      var reasonOpts=[
        {v:'',l:tr('msg_reason_select')},
        {v:'Nunca acessou',l:'\uD83D\uDEAB ' + tr('msg_reason_never')},
        {v:'Baixa participação',l:'\uD83D\uDCC9 ' + tr('msg_reason_low_participation')},
        {v:'Pendência acadêmica',l:'\uD83D\uDCCB ' + tr('msg_reason_academic_pending')},
        {v:'Dificuldade acadêmica',l:'\uD83D\uDCCA ' + tr('msg_reason_difficulty')},
        {v:'Outro',l:'\uD83D\uDCAC ' + tr('msg_reason_other')}
      ];      reasonOpts.forEach(function(o){
        var opt=document.createElement('option');
        opt.value=o.v;
        opt.textContent=o.l;
        reasonSel.appendChild(opt);
      });
      reasonDiv.appendChild(reasonLabel);
      reasonDiv.appendChild(reasonSel);
      body.appendChild(reasonDiv);
      var snapshotSituationDiv=document.createElement('div');
      snapshotSituationDiv.style.display='none';
      var snapshotSituationLabel=document.createElement('div');
      snapshotSituationLabel.className='mwa-msg-label';
      snapshotSituationLabel.textContent=tr('snapshot_situation_label','Situação identificada');
      var snapshotSituationInput=document.createElement('textarea');
      snapshotSituationInput.className='mwa-msg-textarea mwa-snapshot-short';
      snapshotSituationInput.placeholder=tr('snapshot_situation_placeholder','Descreva a situação observada.');
      snapshotSituationDiv.appendChild(snapshotSituationLabel);
      snapshotSituationDiv.appendChild(snapshotSituationInput);
      body.appendChild(snapshotSituationDiv);
      var snapshotObjectiveDiv=document.createElement('div');
      var snapshotObjectiveLabel=document.createElement('div');
      snapshotObjectiveLabel.className='mwa-msg-label';
      snapshotObjectiveLabel.textContent=tr('snapshot_objective_label','Objetivo da intervenção');
      var snapshotObjectiveInput=document.createElement('input');
      snapshotObjectiveInput.className='mwa-msg-input';
      snapshotObjectiveDiv.appendChild(snapshotObjectiveLabel);
      snapshotObjectiveDiv.appendChild(snapshotObjectiveInput);
      body.appendChild(snapshotObjectiveDiv);
      var suggestedObjectives={
        'Nunca acessou':tr('snapshot_objective_never','Realizar o primeiro acesso ao curso.'),
        'Baixa participação':tr('snapshot_objective_low','Retomar e ampliar a participação no curso.'),
        'Pendência acadêmica':tr('snapshot_objective_pending','Regularizar as atividades pendentes.'),
        'Dificuldade acadêmica':tr('snapshot_objective_difficult','Favorecer a evolução dos resultados de aprendizagem.'),
        'Outro':''
      };
      function updateSnapshotFields(){
        snapshotSituationDiv.style.display=reasonSel.value==='Outro'?'block':'none';
        snapshotObjectiveInput.value=suggestedObjectives[reasonSel.value]||'';
      }
      var targetSelectDiv=document.createElement('div');
      targetSelectDiv.id='mwaBulkTargetSelectWrap';
      targetSelectDiv.style.display='none';
      var targetSelectLabel=document.createElement('div');
      targetSelectLabel.className='mwa-msg-label';
      targetSelectLabel.textContent=tr('msg_target_items_label','Itens para acompanhar');
      var targetSelectList=document.createElement('div');
      targetSelectList.className='mwa-recipient-list mwa-target-list';
      targetSelectList.style.cssText='position:static;display:block;max-height:220px;margin-top:8px;border-radius:12px;';
      targetSelectDiv.appendChild(targetSelectLabel);
      targetSelectDiv.appendChild(targetSelectList);
      body.appendChild(targetSelectDiv);
      var subjDiv=document.createElement('div');
      var subjLabel=document.createElement('div');
      subjLabel.className='mwa-msg-label';
      subjLabel.textContent=tr('msg_subject_label');
      var subjInput=document.createElement('input');
      subjInput.id='mwaBulkSubject';
      subjInput.className='mwa-msg-input';
      subjInput.type='text';
      subjInput.placeholder=tr('msg_subject_placeholder');
      subjDiv.appendChild(subjLabel);
      subjDiv.appendChild(subjInput);
      body.appendChild(subjDiv);
      var msgDiv=document.createElement('div');
      var msgLabelRow=document.createElement('div');
      msgLabelRow.className='mwa-msg-label';
      var msgLabelSpan=document.createElement('span');
      msgLabelSpan.textContent=tr('msg_body_label');
      msgLabelRow.appendChild(msgLabelSpan);

      var msgArea=document.createElement('textarea');
      msgArea.id='mwaBulkBody';
      msgArea.className='mwa-msg-textarea';
      msgArea.placeholder=tr('msg_body_placeholder');

      msgDiv.appendChild(msgLabelRow);
      msgDiv.appendChild(msgArea);
      body.appendChild(msgDiv);
      var reasonTemplates={
        'Nunca acessou':{subject:tr('tpl_never_subject'),body:tr('tpl_never_body')},
        'Baixa participação':{subject:tr('tpl_eng_subject'),body:tr('tpl_eng_body')},
        'Pendência acadêmica':{subject:tr('tpl_task_subject'),body:tr('tpl_task_body')},
        'Dificuldade acadêmica':{subject:tr('tpl_difficulty_subject'),body:tr('tpl_difficulty_body')},
        'Outro':{subject:tr('tpl_other_subject'),body:tr('tpl_other_body')}
      };
      var selectedTargetOptions=[];
      function selectedTargetNames(){
        return Array.prototype.slice.call(targetSelectList.querySelectorAll('.mwa-target-item:checked')).map(function(chk){
          var item=selectedTargetOptions[Number(chk.value)];
          return item&&item.name;
        }).filter(Boolean);
      }
      function selectedTargetKeys(){
        return Array.prototype.slice.call(targetSelectList.querySelectorAll('.mwa-target-item:checked')).map(function(chk){
          var item=selectedTargetOptions[Number(chk.value)];
          return item&&item._key;
        }).filter(Boolean);
      }
      function selectedTargetItemsForStudent(t){
        var selectedKeys=selectedTargetKeys();
        var own=targetsForReason(reasonSel.value,t).filter(function(item){
          var key=(item.type||'item')+':'+(item.cmid||item.seq||lower(item.name));
          return selectedKeys.indexOf(key)>=0;
        });
        return own.map(function(item){
          var mod=item.mod||item.modtype||'';
          var resolved=norm(item.url||'');
          if(!resolved&&item.type==='activity'){
            resolved=activityUrl(Object.assign({},item,{modtype:mod}));
          }
          if(!resolved&&item.cmid&&mod&&Store.getConfig().wwwroot){
            resolved=Store.getConfig().wwwroot.replace(/\/$/,'')+'/mod/'+encodeURIComponent(mod)+'/view.php?id='+encodeURIComponent(String(item.cmid));
          }
          return {type:item.type||'',name:item.name||'',cmid:item.cmid||0,mod:mod,url:resolved,seq:item.seq||0};
        });
      }
      function targetTypeForReason(reason){
        if(reason==='Pendência acadêmica')return 'activity_completion';
        if(reason==='Baixa participação')return 'resource_access';
        if(reason==='Nunca acessou')return 'access_after_message';
        return '';
      }
      function reasonUsesTargetItems(reason){
        return reason==='Pendência acadêmica'||reason==='Baixa participação';
      }
      function updateTargetMessage(){
        var tpl=reasonTemplates[reasonSel.value];
        if(!tpl)return;
        msgArea.value=appendSelectedTargetText(previewMessageText(tpl.body||''));
      }
      function stripTargetTextBlock(text){
        var intro=tr('msg_target_items_intro','Itens indicados:');
        var idx=String(text||'').indexOf(intro);
        return idx>=0?String(text||'').slice(0,idx).replace(/\s+$/,''):String(text||'');
      }
      function appendSelectedTargetText(text){
        return stripTargetTextBlock(text);
      }
      function ensureFirstNameToken(text){
        var value=String(text||'').trim().replace(/\{\{\s*firstname\s*\}\}/gi,'{firstname}');
        if(/\{firstname\}/i.test(value))return value;
        value=value.replace(/^\s*(olá|ola|oi)\s*,?\s*(pessoal|turma|estudantes|alunos)\s*[!,.:–—-]*\s*/i,'');
        return 'Olá, {firstname}!\n\n'+value;
      }
      function targetItemsHtml(items){
        items=(items||[]).filter(function(item){return item&&item.name;});
        if(!items.length)return '';
        return '<div class="mwa-message-targets"><p><strong>'+esc(tr('tf_detail_targets','Itens acompanhados'))+'</strong></p><ul>'
          + items.map(function(item){
            var name=esc(item.name||'');
            var url=norm(item.url||'');
            return '<li>'+(url?'<a href="'+esc(url)+'" target="_blank" rel="noopener">'+name+'</a>':name)+'</li>';
          }).join('')+'</ul></div>';
      }
      function messageParagraphsHtml(text){
        return String(text||'').replace(/\r\n?/g,'\n').split(/\n\s*\n/).filter(function(block){return block.trim();})
          .map(function(block){return '<p>'+esc(block.trim()).replace(/\n/g,'<br>')+'</p>';}).join('');
      }
      function messageHtmlForStudent(text,t,items){
        var plain=stripTargetTextBlock(personalizeMessageText(text,t));
        return '<div class="mwa-message-body">'+messageParagraphsHtml(plain)+targetItemsHtml(items)+'</div>';
      }
      function renderTargetOptions(){
        var reason=reasonSel.value;
        selectedTargetOptions=[];
        if(reason!=='Pendência acadêmica'&&reason!=='Baixa participação'){
          targetSelectDiv.style.display='none';
          targetSelectList.replaceChildren();
          return;
        }
        var map={};
        selectedTargets.forEach(function(t){
          targetsForReason(reason,t).forEach(function(item){
            var key=(item.type||'item')+':'+(item.cmid||item.seq||lower(item.name));
            if(!map[key])map[key]=Object.assign({},item,{_key:key});
          });
        });
        selectedTargetOptions=Object.keys(map).map(function(k){return map[k];}).sort(function(a,b){return String(a.name).localeCompare(String(b.name),'pt-BR');});
        if(!selectedTargetOptions.length){
          targetSelectDiv.style.display='block';
          targetSelectList.replaceChildren();
          var emptyMsg=document.createElement('div');
          emptyMsg.className='mwa-target-empty';
          emptyMsg.textContent=tr('msg_no_open_pending_items','Nenhum item aberto e pendente para os alunos selecionados.');
          targetSelectList.appendChild(emptyMsg);
          return;
        }
        targetSelectDiv.style.display='block';
        targetSelectList.replaceChildren();
        selectedTargetOptions.forEach(function(item,i){
          var label=document.createElement('label');
          label.className='mwa-recipient-check';
          var cb=document.createElement('input');
          cb.type='checkbox';
          cb.className='mwa-target-item';
          cb.value=i;
          cb.checked=true;
          var wrap=document.createElement('span');
          var strong=document.createElement('strong');
          strong.textContent=item.name;
          var small=document.createElement('small');
          small.textContent=item.type==='activity'?tr('msg_target_activity','Atividade'):tr('msg_target_resource','Conteúdo');
          wrap.appendChild(strong);
          wrap.appendChild(small);
          label.appendChild(cb);
          label.appendChild(wrap);
          targetSelectList.appendChild(label);
        });
      }
      reasonSel.addEventListener('change',function(){
        var tpl=reasonTemplates[reasonSel.value];
        updateSnapshotFields();
        renderTargetOptions();
        if(!tpl)return;
        subjInput.value=tpl.subject||'';
        updateTargetMessage();
      });
      targetSelectList.addEventListener('change',function(e){
        if(e.target&&e.target.classList.contains('mwa-target-item')){
          msgArea.value=appendSelectedTargetText(msgArea.value);
        }
      });
      if(preset){
        subjInput.value=preset.subject||'';
        msgArea.value=preset.message||'';
        reasonSel.value=preset.reason||'';
        updateSnapshotFields();
        if(preset.type)setBulkType(preset.type);
        renderTargetOptions();
        updateTargetMessage();
      }
      updateSnapshotFields();
      var progressDiv=document.createElement('div');
      progressDiv.id='mwaBulkProgress';
      progressDiv.className='mwa-bulk-progress';
      progressDiv.style.display='none';
      var progressTrack=document.createElement('div');
      progressTrack.className='mwa-bulk-progress-track';
      var progressBar=document.createElement('div');
      progressBar.id='mwaBulkBar';
      progressBar.className='mwa-bulk-progress-bar';
      progressTrack.appendChild(progressBar);
      var progressStatus=document.createElement('div');
      progressStatus.id='mwaBulkStatus';
      progressStatus.className='mwa-bulk-progress-status';
      progressDiv.appendChild(progressTrack);
      progressDiv.appendChild(progressStatus);
      body.appendChild(progressDiv);
      modal.appendChild(body);
      var footer=document.createElement('div');
      footer.className='mwa-msg-footer mwa-msg-footer-bulk';
      var cancelBtn=document.createElement('button');
      cancelBtn.className='mwa-msg-cancel-btn';
      cancelBtn.textContent=tr('msg_close','Fechar');
      cancelBtn.onclick=function(){ov.remove();};
      var sendBtn=document.createElement('button');
      sendBtn.className='mwa-msg-send-btn';
      sendBtn.id='mwaBulkSendBtn';
      sendBtn.textContent='\u2709\uFE0F '+tr('msg_send_btn','Enviar');
      var sendingGifUrl=((Store.getConfig?Store.getConfig():{}).wwwroot||'').replace(/\/$/,'')+
        '/blocks/mwa_dashboard/pix/enviando-email.gif';
      function resetSendButton(){
        if(!sendBtn)return;
        sendBtn.disabled=false;
        sendBtn.classList.remove('is-sending','is-sent');
        sendBtn.textContent='\u2709\uFE0F '+tr('msg_send_btn','Enviar');
      }
      function showSendingButton(){
        sendBtn.disabled=true;
        sendBtn.classList.remove('is-sent');
        sendBtn.classList.add('is-sending');
        sendBtn.replaceChildren();
        var animation=document.createElement('img');
        animation.className='mwa-msg-sending-gif';
        animation.src=sendingGifUrl;
        animation.alt='';
        var label=document.createElement('span');
        label.textContent=tr('msg_sending');
        sendBtn.appendChild(animation);
        sendBtn.appendChild(label);
      }
      function showSentButton(){
        sendBtn.disabled=true;
        sendBtn.classList.remove('is-sending');
        sendBtn.classList.add('is-sent');
        sendBtn.textContent='\u2713 '+tr('msg_sent','Enviado');
      }
      function clearMessageFieldsAfterSend(){
        reasonSel.value='';
        snapshotSituationInput.value='';
        snapshotObjectiveInput.value='';
        subjInput.value='';
        msgArea.value='';
        updateSnapshotFields();
        renderTargetOptions();
      }

      sendBtn.onclick=function(){
        var subject=subjInput.value||'';
        var message=msgArea.value||'';
        var reason=reasonSel.value||'';
        if(!subject.trim()||!message.trim()){alert(tr('msg_required_subject_body'));return;}
        if(reason==='Outro'&&(!snapshotSituationInput.value.trim()||!snapshotObjectiveInput.value.trim())){
          alert(tr('snapshot_other_required','Informe a situação identificada e o objetivo da intervenção.'));return;
        }
        if(!selectedTargets.length){alert(tr('msg_recipients_required','Selecione pelo menos um destinat?rio.'));return;}
        var sendType=bulkType;
        var requiresTargets=reasonUsesTargetItems(reason);
        var checkedKeys=selectedTargetKeys();
        if(requiresTargets&&!checkedKeys.length){
          alert(tr('msg_target_required','Selecione pelo menos uma atividade ou conteudo para acompanhar.'));
          return;
        }
        var preparedTargets=selectedTargets.map(function(t){
          var items=requiresTargets?selectedTargetItemsForStudent(t):[];
          return Object.assign({},t,{_targetItems:items});
        }).filter(function(t){
          return !requiresTargets||t._targetItems.length>0;
        });
        var skipped=selectedTargets.length-preparedTargets.length;
        if(!preparedTargets.length){
          alert(tr('msg_no_recipients_with_pending_items','Nenhum aluno selecionado deve os itens marcados.'));
          return;
        }
        showSendingButton();
        progressDiv.style.display='block';
        var bar=document.getElementById('mwaBulkBar');
        var statusEl=document.getElementById('mwaBulkStatus');
        if(bar)bar.classList.add('is-sending');

        var total=preparedTargets.length;
        var sent=0;var errors=0;
        var courseid=parseInt((Store.getConfig().courseid||0),10);

        function sendOne(i){
          if(i>=total){
            if(bar)bar.style.width='100%';
            if(bar)bar.classList.remove('is-sending');
            var msg=tr('msg_bulk_sent_success').replace('{sent}',String(sent)).replace('{student}',sent===1?tr('student'):tr('students'));
            if(errors)msg+=' '+tr('msg_bulk_error_suffix').replace('{errors}',String(errors));
            if(skipped)msg+=' '+tr('msg_bulk_skipped_no_pending','{skipped} aluno(s) sem pendencia nao receberam mensagem.').replace('{skipped}',String(skipped));
            if(statusEl)statusEl.textContent=msg;
            showSentButton();
            clearMessageFieldsAfterSend();
            if(window.MWAInterventions&&window.MWAInterventions.loadInterventions)
              window.MWAInterventions.loadInterventions();
            return;
          }
          var t=preparedTargets[i];
          var subjectForStudent=personalizeMessageText(subject,t);
          var targetItems=t._targetItems||[];
          var targetType=targetTypeForReason(reason);
          var msgHtml=messageHtmlForStudent(message,t,targetItems);
          if(statusEl)statusEl.textContent=tr('msg_sending_to')+' '+t.name+'... ('+(i+1)+'/'+total+')';
          if(bar)bar.style.width=Math.round((i/total)*100)+'%';

          Store.callAction('block_mwa_dashboard_send_message',{
            courseid:   courseid,
            userid:     t.userid,
            subject:    subjectForStudent,
            message:    msgHtml,
            intervention_reason: reason,
            ai_generated: 0,
            send_type:  sendType,
            student_email: t.email||'',
            target_type: targetType,
            target_items: JSON.stringify(targetItems),
            snapshot_situation: snapshotSituationInput.value.trim(),
            snapshot_objective: snapshotObjectiveInput.value.trim(),
            snapshot_engagement: Math.max(0,Math.min(100,Math.round(Number(t.score||0))))
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

      var aiBtn=document.createElement('button');
      aiBtn.id='mwaBulkAIBtn';
      aiBtn.className='mwa-msg-ai-btn';
      aiBtn.textContent='\u2728 '+tr('msg_ai_generate');
      aiBtn.onclick=function(){
        if(!selectedTargets.length){alert(tr('msg_recipients_required','Selecione pelo menos um destinatário.'));return;}
        aiBtn.disabled=true;
        aiBtn.textContent='\u23F3 '+tr('msg_ai_generating','Gerando mensagem...');
        var reason=(reasonSel.options[reasonSel.selectedIndex]?reasonSel.options[reasonSel.selectedIndex].textContent:'')||tr('msg_reason_low_eng');
        var cfg=Store.getConfig?Store.getConfig():{};
        var courseid=parseInt(cfg.courseid||0,10);
        var nameList=selectedTargets.map(function(t){return t.name;}).join(', ');
        var trackedNames=selectedTargetNames();
        var prompt='You are an educational tutor writing a pedagogical message.\n\n'
          +'RECIPIENT_COUNT: '+selectedTargets.length+'\n'
          +'REASON: '+reason+'\n'
          +'CHANNEL: '+(bulkType==='email'?'Email (formal)':'Moodle message (friendly)')+'\n\n'
          +'The system sends one separate personalized message to each student.\n'
          +'Write in the singular and address the student using the exact literal token {firstname}.\n'
          +'Never address a group and never list recipient names.\n'
          +(trackedNames.length?'TRACKED_ITEMS: '+trackedNames.join(' | ')+'\nMention these tracked items clearly in the message.\n':'')
          +'Write a short, empathetic pedagogical message in Brazilian Portuguese.\n'
          +'Return ONLY two lines:\n'
          +'SUBJECT: <subject line>\n'
          +'MESSAGE: <message body, 3-4 sentences>\n'
          +'Do not include any other text.';
        Store.callAction('block_mwa_dashboard_get_ai_recommendation',{
          courseid:courseid,
          student_name:nameList,
          prompt:prompt
        }).then(function(res){
          var text=(res&&(res.recommendation||res.response||res.content))||'';
          if(!text)throw new Error(tr('err_ajax_bridge'));
          var subjMatch=text.match(/SUBJECT:\s*(.+)/i);
          var msgMatch=text.match(/MESSAGE:\s*([\s\S]+)/i);
          if(subjMatch)subjInput.value=subjMatch[1].trim();
          if(msgMatch)msgArea.value=appendSelectedTargetText(ensureFirstNameToken(msgMatch[1]));
          aiBtn.disabled=false;
          aiBtn.textContent='\u2728 '+tr('msg_ai_generate');
        }).catch(function(e){
          aiBtn.disabled=false;
          aiBtn.textContent='\u2728 '+tr('msg_ai_generate');
          alert('Atenção: '+e.message);
        });
      };

      footer.appendChild(sendBtn);
      footer.appendChild(aiBtn);
      footer.appendChild(cancelBtn);
      modal.appendChild(footer);
      ov.appendChild(modal);
      root.appendChild(ov);

      document.addEventListener('keydown',function esc_key(e){
        if(e.key==='Escape'){ov.remove();document.removeEventListener('keydown',esc_key);}
      });
    }
window.toggleSelectPriority=toggleSelectPriority;window.openBulkEmail=openBulkEmail;
    
    function gaugeColor(avg){return avg<40?'#d95f5f':avg<70?'#5b9bd5':'#3aab7a'}
    function renderSemiGauge(avg,labelText){
      var g=$('gauge');
      if(!g)return;
      var pct=Math.max(0,Math.min(100,Number(avg)||0));
      var color=gaugeColor(pct);
      g.style.setProperty('--gauge-color',color);
      g.replaceChildren();

      /* Donut completo: circunferencia de raio 74 -> 2*PI*74 = 464.96 */
      var ns='http://www.w3.org/2000/svg';
      var CIRC=464.96;
      var svg=document.createElementNS(ns,'svg');
      svg.setAttribute('viewBox','0 0 180 180');
      svg.setAttribute('class','gauge-donut');
      svg.setAttribute('role','img');
      svg.setAttribute('aria-label',pct+'%');

      var track=document.createElementNS(ns,'circle');
      track.setAttribute('class','gauge-track');
      track.setAttribute('cx','90');
      track.setAttribute('cy','90');
      track.setAttribute('r','74');

      var progress=document.createElementNS(ns,'circle');
      progress.setAttribute('class','gauge-progress');
      progress.setAttribute('cx','90');
      progress.setAttribute('cy','90');
      progress.setAttribute('r','74');
      progress.style.strokeDasharray=((pct/100)*CIRC)+' '+CIRC;

      svg.appendChild(track);
      svg.appendChild(progress);
      g.appendChild(svg);

      /* Centro em HTML para reaproveitar engPct/engLabel do template. */
      var inner=document.createElement('div');
      inner.className='gauge-inner';
      var num=document.createElement('div');
      num.id='engPct';
      num.className='gauge-num';
      num.textContent=pct+'%';
      var lbl=document.createElement('div');
      lbl.id='engLabel';
      lbl.className='gauge-label';
      var dot=document.createElement('i');
      dot.className='gauge-dot';
      dot.style.background=color;
      lbl.appendChild(dot);
      var lblTxt=document.createElement('span');
      lblTxt.className='gauge-label-txt';
      lblTxt.textContent=labelText||'';
      lbl.appendChild(lblTxt);
      inner.appendChild(num);
      inner.appendChild(lbl);
      g.appendChild(inner);
    }
    function renderEngagement(){
      var withInteractions=state().students.filter(function(s){return Number(s.interactions||0)>0});
      var avg=withInteractions.length?Math.round(withInteractions.reduce(function(a,s){return a+s.score},0)/withInteractions.length):0;
      var label=avg<40?tr('low_participation'):avg<70?tr('average_participation'):tr('high_participation');
      /* renderSemiGauge ja escreve engPct e engLabel (com o dot colorido);
         reatribuir textContent aqui apagaria o dot. */
      renderSemiGauge(avg,label);
      var visibleNever=state().students.filter(isNeverAccessed).length;
      var visibleUrgent=state().students.filter(function(s){return Number(s.interactions||0)>0&&s.score<40&&!isNeverAccessed(s)}).length;
      var totalStudents=contentReachTotal();
      var mwaSubMap2=mwaSubmissionsByActivity();
      var visibleAttention=state().activities.slice().filter(function(a){
        if(isTextMediaArea(a)||!isCurrentlyOpenItem(a))return false;
        var pct=totalStudents?Math.round(((a.unique||0)/totalStudents)*100):0;
        var dpct=mwaDeliveryPct(a,mwaSubMap2,totalStudents);
        return pct<60||dpct<60;
      }).length;
      var needAttention=visibleNever+visibleUrgent+visibleAttention;
      var actionsEl=$('actionsCount'); if(actionsEl) actionsEl.textContent=needAttention;
      if($('navActionBadge'))$('navActionBadge').textContent=needAttention;
    }
    
    function openBulkForKind(kind) {
      var scoreFilter = {
        urgent:  function(s){ return isNeverAccessed(s); },
        attention: function(s){ var score=Number(s.score||0); return Number(s.interactions||0)>0 && score < 40 && !isNeverAccessed(s); },
        warning: function(s){ var score=Number(s.score||0); return score > 40 && score < 70; },
        good:    function(s){ var score=Number(s.score||0); return score >= 70; }
      };
      var filter = scoreFilter[kind] || function(){ return true; };
      var seen={};
      var sc = (actionCardTargets[kind] && actionCardTargets[kind].length ? actionCardTargets[kind] : null) ||
               (state && state().students) ||
               (window.MWADashboard && window.MWADashboard.state && window.MWADashboard.state.students) || [];
      var targets = sc.filter(filter).map(function(s) {
        return {name: s.name||'', email: s.email||'', userid: Number(s.userid||0), score: Number(s.score||0)};
      }).filter(function(t){
        var key=lower(t.email)||lower(t.name);
        if(!t.name||seen[key])return false;
        seen[key]=1;
        return true;
      });
      if (!targets.length) {
        var rows = Array.prototype.slice.call(document.querySelectorAll('#actionFocusList .att-row'));
        targets = rows.map(function(r) {
          return {name: r.dataset.sname||'', email: r.dataset.semail||'', userid: Number(r.dataset.userid||0), score: Number(r.dataset.score||0)};
        }).filter(function(t) { return t.name && filter(t); });
      }
      if (!targets.length && !scoreFilter[kind]) {
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
