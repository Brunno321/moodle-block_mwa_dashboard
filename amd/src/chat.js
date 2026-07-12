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
 * @module     block_mwa_dashboard/chat
 * @copyright  2026 Bruno Porto
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
define(['block_mwa_dashboard/dashboardstore', 'core/log', 'core/templates'], function(Store, Log, Templates) {
    'use strict';
    var w = Store.windowFacade();

    (function(){
    'use strict';

    function tr(k,fb){var S=Store.getStrings?Store.getStrings():{};var v=Object.prototype.hasOwnProperty.call(S,k)?S[k]:'';return(v&&!/^\[\[/.test(v))?v:(fb!==undefined?fb:k);}
    function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
    function norm(v){return v==null?'':String(v).trim();}
    function $(id){return document.getElementById(id);}
    function renderTemplate(node, template, context){
        if(!node)return Promise.resolve(null);
        return Templates.render('block_mwa_dashboard/'+template, context||{}).then(function(html, js){
            Templates.replaceNodeContents(node, html, js);
            return node;
        }).catch(function(e){Log.error(e);return node;});
    }
    function richText(value){
        return esc(value).replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>').replace(/\n/g,'<br>');
    }
    function parseDate(l){
        if(l._ts)return new Date(Number(l._ts)*1000);
        var s=norm(l.hora);var m=s.match(/(\d{2})\/(\d{2})\/(\d{2}),?\s*(\d{2}):(\d{2})/);
        if(m)return new Date(2000+Number(m[3]),Number(m[2])-1,Number(m[1]),Number(m[4]),Number(m[5]));
        return null;
    }

    var CONVS     = [];
    var CUR_ID    = null;
    var BUSY      = false;
    var _initDone = false;

    function save(){
        try{sessionStorage.setItem('mwa_chat_convs',JSON.stringify(CONVS.slice(-20)));}catch(e){}
    }
    function load(){
        try{
            var s=sessionStorage.getItem('mwa_chat_convs');
            if(s)CONVS=JSON.parse(s)||[];
        }catch(e){CONVS=[];}
    }

    function getCur(){return CONVS.find(function(c){return c.id===CUR_ID;});}

    function newConv(){
        var id='conv_'+Date.now();
        CONVS.unshift({id:id,title:tr('chat_new_conv','Nova conversa'),createdAt:Date.now(),messages:[]});
        CUR_ID=id;
        renderSidebar();
        showWelcome();
        var ti=$('chatConvTitle');if(ti)ti.textContent=tr('chat_assistant_name','Assistente da turma');
    }

    function deleteConv(id){
        CONVS=CONVS.filter(function(c){return c.id!==id;});
        if(CUR_ID===id)CUR_ID=CONVS.length?CONVS[0].id:null;
        if(!CUR_ID)newConv();
        else{renderSidebar();renderMessages();}
        save();
    }

    function buildContext(){
        var mwa=w.MWADashboard||{};
        var state=(mwa&&mwa.state)||{};
        var logs=state.logs||[];
        var grades=state.grades||[];
        if(!logs.length)return null;
        var data=logs.map(function(r){var d=parseDate(r);return d?Object.assign({},r,{_date:d}):null;}).filter(Boolean);
        var students=[];var stuSet={};
        data.forEach(function(r){if(r.nomecompleto&&!stuSet[norm(r.nomecompleto)]){stuSet[norm(r.nomecompleto)]=1;students.push(norm(r.nomecompleto));}});
        var la={};
        data.forEach(function(r){
            var n=norm(r.nomecompleto);
            if(!la[n]||r._date>la[n])la[n]=r._date;
        });
        var now=new Date();
        function daysAgo(d){if(!d)return 99;return Math.round((now-d)/86400000);}
        var gradeMap={};
        grades.forEach(function(g){
            var n=norm(g.student_name||g.name||'');
            if(n&&g.grade!=null)gradeMap[n]=Number(g.grade);
        });
        var gVals=Object.values(gradeMap);
        var avgGrade=gVals.length?Math.round(gVals.reduce(function(s,v){return s+v;},0)/gVals.length):null;
        var evData=[];
        var eng=w.MWAEngagement;
        if(eng&&typeof eng.getData==='function')evData=eng.getData()||[];
        var atRisk=0;
        var summaries=students.slice(0,60).map(function(n){
            var ago=daysAgo(la[n]);
            var ev=evData.find(function(x){return x.name===n;})||null;
            var score=ev?ev.score:null;
            var interactions=data.filter(function(r){return norm(r.nomecompleto)===n;}).length;
            var grade=gradeMap[n]!=null?gradeMap[n]:null;
            if(ago>10&&(score==null||score<60))atRisk++;
            return {
                nome:n,
                diasSemAcesso:ago,
                interacoes:interactions,
                engScore:score!=null?score+'%':'—',
                nota:grade!=null?grade.toFixed(1):'—',
            };
        });

        var cfg=Store.getConfig?Store.getConfig():{};

        return {
            curso:{
                nomeCurso:cfg.coursename||tr('chat_unknown_course','não identificado'),
                totalAlunos:students.length,
                totalInteracoes:data.length,
                mediaInteracoesPorAluno:Math.round(data.length/Math.max(students.length,1)),
                alunosEmRisco:atRisk,
                notaMedia:avgGrade,
                periodoFiltrado:tr('chat_all_period','todo o período'),
            },
            alunos:summaries,
        };
    }

    function showWelcome(){
        var messagesEl=$('chatMessages');
        var sugEl=$('chatSuggestions');
        if(!messagesEl)return;

        var hasData=((w.MWADashboard||{}).state||{}).logs&&((w.MWADashboard||{}).state||{}).logs.length>0;

        renderTemplate(messagesEl, 'chat_welcome', {
            message: hasData
                ? tr('chat_welcome_data','Ola! Tenho acesso a todos os dados da turma carregados no dashboard. Posso analisar engajamento, identificar riscos, comparar alunos e gerar relatorios.')
                : tr('chat_welcome_nodata',tr('chat_welcome_nodata','Ola! Carregue os dados da turma para que eu possa analisar e responder perguntas sobre os alunos.'))
        });

        if(sugEl&&hasData){
            var sugs=[
                tr('chat_sug1','Quem esta em risco de evadir esta semana?'),
                tr('chat_sug2','Quais alunos devo priorizar hoje?'),
                tr('chat_sug3','Como esta o engajamento geral da turma?'),
                tr('chat_sug4','Escreva um email para alunos com nota abaixo de 60'),
                tr('chat_sug5','Quem melhorou mais nos ultimos dias?'),
                tr('chat_sug6','Faca um resumo executivo da turma'),
            ];
            renderTemplate(sugEl, 'chat_suggestions', {
                suggestions: sugs.map(function(s){return {text:s};})
            });
        }else if(sugEl){sugEl.replaceChildren();}
    }
    function renderSidebar(){
        var el=$('chatHistoryList');if(!el)return;
        renderTemplate(el, 'chat_sidebar', {
            emptylabel: tr('chat_no_convs','Nenhuma conversa'),
            conversations: CONVS.slice(0,15).map(function(c){
                return {
                    id: c.id,
                    title: c.title.slice(0,26),
                    date: new Date(c.createdAt).toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'}),
                    active: c.id===CUR_ID
                };
            })
        });
    }
    function renderMessages(){
        var el=$('chatMessages');
        var sugEl=$('chatSuggestions');
        if(!el)return;

        var conv=getCur();
        if(!conv||!conv.messages.length){showWelcome();return;}
        if(sugEl)sugEl.replaceChildren();

        var ti=$('chatConvTitle');if(ti)ti.textContent=conv.title;

        renderTemplate(el, 'chat_messages', {messages: conv.messages.map(function(m){
            var isAI=m.role==='assistant';
            return {
                align: isAI?'flex-start':'flex-end',
                direction: isAI?'':'flex-direction:row-reverse;',
                avatarbg: isAI?'var(--blue-dim)':'var(--panel3)',
                avatarlabel: isAI?'*':'Eu',
                bubblestyle: isAI
                    ?'background:var(--panel2);border:1px solid var(--line);border-radius:2px 12px 12px 12px;'
                    :'background:var(--blue-dim);border:1px solid rgba(79,142,247,.2);border-radius:12px 2px 12px 12px;',
                contenthtml: richText(m.content)
            };
        })}).then(function(){el.scrollTop=el.scrollHeight;});
    }
    function sendMsg(text){
        var input=$('chatInput')||$('chatInputEl');
        if(input){input.value=text;input.style.height='auto';}
        send();
    }

    function send(){
        if(BUSY)return;
        var input=$('chatInput')||$('chatInputEl');
        var text=((input&&input.value)||'').trim();
        if(!text)return;

        var cfg_s=Store.getConfig?Store.getConfig():{};
        if(!cfg_s.ia_enabled){
            alert(tr('chat_ia_not_configured_alert','AI not configured. Acesse Administração → Blocos → MWA Dashboard → Configurações e defina o endpoint da IA.'));
            return;
        }
        var state=((w.MWADashboard||{}).state)||{};
        if(!(state.logs&&state.logs.length)){
            alert(tr('chat_load_data_first','Carregue os dados da turma primeiro.'));
            return;
        }

        if(!CUR_ID)newConv();
        var conv=getCur();if(!conv)return;
        conv.messages.push({role:'user',content:text});
        if(conv.messages.length===1)conv.title=text.slice(0,35)+(text.length>35?'…':'');
        if(input){input.value='';input.style.height='auto';}
        var sugEl=$('chatSuggestions');if(sugEl)sugEl.replaceChildren();
        renderMessages();
        var messagesEl=$('chatMessages');
        var typing=document.createElement('div');
        typing.id='chatTyping';
        typing.style.cssText='display:flex;gap:.5rem;align-items:center;padding:.3rem 0;';
        renderTemplate(typing, 'chat_typing', {}).then(function(){
            if(messagesEl){messagesEl.appendChild(typing);messagesEl.scrollTop=messagesEl.scrollHeight;}
        });

        BUSY=true;
        var btn=$('chatSendBtn');if(btn)btn.disabled=true;
        var ctx=buildContext();
        var cfg=Store.getConfig?Store.getConfig():{};
        var courseid=parseInt(cfg.courseid||0,10);
        var courseName=(ctx&&ctx.curso&&ctx.curso.nomeCurso)||tr('chat_unknown_course','não identificado');
        var lang=cfg.language||'pt_br';
        var langInstr=lang.indexOf('pt')===0
            ?'Responda sempre em português brasileiro, de forma direta e prática.'
            :lang.indexOf('es')===0
            ?'Responda siempre en español, de forma directa y práctica.'
            :'Always respond in English, in a direct and practical way.';
        var langLabel=lang.indexOf('pt')===0?'portuguese-br':lang.indexOf('es')===0?'spanish':'english';

        var ctxMsg=ctx
            ?('You are a pedagogical assistant analysing the course "'+courseName+'". '
              +'Data: '+ctx.curso.totalAlunos+' students, '+ctx.curso.totalInteracoes+' interactions, '
              +'average grade: '+ctx.curso.notaMedia+', '+ctx.curso.alunosEmRisco+' at-risk students. '
              +langInstr)
            :'';

        var histMsgs=ctxMsg
            ?[{role:'user',content:'[CONTEXTO DO CURSO] '+ctxMsg},{role:'assistant',content:'Entendido. Estou pronto para analisar sua turma.'}]
            :[];
        conv.messages.forEach(function(m){histMsgs.push(m);});
        function _chatDone(){
            BUSY=false;
            var t=$('chatTyping');if(t)t.remove();
            if(btn)btn.disabled=false;
            save();
            renderSidebar();
            renderMessages();
        }
        Store.callAction('block_mwa_dashboard_chat_message',{
            courseid:  courseid,
            messages:  JSON.stringify(histMsgs),
            context:   JSON.stringify(ctx||{}),
        }).then(function(res){
            var reply=(res&&res.reply)||'';
            conv.messages.push({role:'assistant',content:reply||tr('chat_no_reply','Não consegui gerar uma resposta. Tente novamente.')});
            _chatDone();
        }).catch(function(e){
            Log.error(e);
            conv.messages.push({role:'assistant',content:tr('chat_error','Erro ao conectar com a IA')+': '+esc(e.message||String(e))});
            _chatDone();
        });
    }

    function updateContextChips(){
        var el=$('chatContextChips');if(!el)return;
        var cfg=Store.getConfig?Store.getConfig():{};
        var state=((w.MWADashboard||{}).state)||{};
        var logs=state.logs||[];
        var grades=state.grades||[];
        var chips=[];
        if(cfg.ia_enabled){
            var provider=cfg.ia_provider&&cfg.ia_provider!=='auto'?cfg.ia_provider:'IA';
            chips.push({background:'rgba(167,139,250,.15)',color:'#a78bfa',border:'rgba(167,139,250,.3)',label:'* '+provider});
        } else {
            chips.push({background:'var(--red-dim)',color:'var(--red)',border:'rgba(240,101,112,.3)',label:tr('chat_ia_not_configured','AI not configured')});
        }
        if(logs.length){
            var studs=new Set();
            logs.forEach(function(r){if(r.nomecompleto)studs.add(norm(r.nomecompleto));});
            chips.push({background:'var(--green-dim)',color:'var(--green)',border:'var(--green-dim)',label:studs.size+' alunos'});
        }
        if(grades.length){
            chips.push({background:'var(--blue-dim)',color:'var(--blue)',border:'rgba(79,142,247,.3)',label:grades.length+' notas'});
        }
        renderTemplate(el, 'chat_chips', {chips:chips});
        var sub=$('chatConvSub');
        if(sub)sub.textContent=logs.length
            ?tr('chat_data_ready','Dados carregados — pronto para analisar')
            :tr('chat_no_data_sub','Carregue dados para ativar o chat');
    }

    function render(){
        if(!_initDone){
            _initDone=true;
            load();
            if(!CUR_ID&&CONVS.length)CUR_ID=CONVS[0].id;
            setupDelegation();
        }
        updateContextChips();
        renderSidebar();
        var inp=$('chatInput')||$('chatInputEl');
        if(inp)inp.placeholder=tr('chat_input_placeholder','Pergunte sobre a turma, peça análises ou relatórios...');
        if(getCur())renderMessages();
        else showWelcome();
    }

    var _delegationInstalled=false;
    function setupDelegation(){
        if(_delegationInstalled)return;
        _delegationInstalled=true;
        var page=document.getElementById('page-chat');
        if(!page)return;
        page.addEventListener('click',function(ev){
            var t=ev.target;
            if(t.closest('[data-chat-new]')){newConv();return;}
            var load=t.closest('[data-chat-load]');
            if(load){
                CUR_ID=load.getAttribute('data-chat-load');
                renderSidebar();
                renderMessages();
                return;
            }
            var del=t.closest('[data-chat-del]');
            if(del){deleteConv(del.getAttribute('data-chat-del'));return;}
            var sug=t.closest('[data-chat-sug]');
            if(sug){sendMsg(sug.getAttribute('data-chat-sug'));return;}
            if(t.closest('#chatSendBtn')){send();return;}
        });
        var input=$('chatInput');
        if(input){
            input.addEventListener('keydown',function(e){
                if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send();}
            });
            input.addEventListener('input',function(){
                this.style.height='auto';
                this.style.height=Math.min(this.scrollHeight,120)+'px';
            });
        }
        var newBtn=$('chatNewBtn');
        if(newBtn)newBtn.addEventListener('click',newConv);
    }

    w.MWAChat={render:render,send:send};

    })();
    return w.MWAChat;
});
