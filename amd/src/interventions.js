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
 * @module     block_mwa_dashboard/interventions
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
      function norm(v) { return (v === undefined || v === null) ? '' : String(v).trim(); }

      /* ── module state ── */
      var INTERVENTIONS = [];

      /* ── paleta de cores para avatares ── */
      var AV_COLORS = ['#5b9bd5','#8b72d4','#3aab7a','#c98a2a','#d95f5f','#2aafaa','#e07ba0'];

      /* ── iniciais do nome ── */
      function initials(name) {
        var parts = norm(name).split(/\s+/).filter(Boolean);
        return ((parts[0] ? parts[0][0] : '?') + (parts[1] ? parts[1][0] : '')) || '?';
      }

      /* ── cor do avatar baseada no nome ── */
      function avatarBg(name) {
        var ci = Math.abs((norm(name).charCodeAt(0) || 0) + (norm(name).charCodeAt(1) || 0)) % AV_COLORS.length;
        return AV_COLORS[ci];
      }

      /* ── formata timestamp Unix (seconds) ou Date em DD/MM/AAAA HH:MM ── */
      function fmtDate(d) {
        if (!d) return '—';
        var dt = (typeof d === 'number') ? new Date(d * 1000) : d;
        if (isNaN(dt.getTime())) return '—';
        var dd = String(dt.getDate()).padStart(2, '0');
        var mm = String(dt.getMonth() + 1).padStart(2, '0');
        var hh = String(dt.getHours()).padStart(2, '0');
        var mi = String(dt.getMinutes()).padStart(2, '0');
        return dd + '/' + mm + '/' + dt.getFullYear() + ' ' + hh + ':' + mi;
      }

      /* ── notification toast ── */
      function toast(msg, type) {
        var root = document.getElementById('block-mwa-dashboard-app') || document.body;
        var el = document.createElement('div');
        el.textContent = msg;
        el.style.cssText = [
          'position:fixed',
          'bottom:24px',
          'right:24px',
          'z-index:99999',
          'padding:12px 20px',
          'border-radius:12px',
          'font-size:.83rem',
          'font-weight:800',
          'box-shadow:0 4px 18px rgba(0,0,0,.18)',
          'animation:mwafadeIn .2s ease',
          'max-width:340px',
          'line-height:1.4',
          'background:' + (type === 'error' ? '#d95f5f' : '#3aab7a'),
          'color:#fff'
        ].join(';');
        root.appendChild(el);
        setTimeout(function() { if (el.parentNode) el.parentNode.removeChild(el); }, 3500);
      }

    
      /* Moodle AJAX bridge provided by the dashboard AMD module. */
      function callAMD(fn, args, onSuccess, onError) {
        if (!window.MWADashboard || typeof window.MWADashboard.callAction !== 'function') {
          if (onError) onError({ message: tr('err_ajax_bridge','Dashboard AJAX bridge is not available.') });
          return;
        }
    
        window.MWADashboard.callAction(fn, args || {}).then(function (result) {
          if (onSuccess) onSuccess(result);
        }).catch(function (err) {
          if (onError) onError({ message: (err && err.message) ? err.message : 'Error' });
        });
      }
    
      /* ══════════════════════════════════════════
         MODAL DE ENVIO DE MENSAGEM
      ══════════════════════════════════════════ */
      function getTemplates() {
        return {
          engagement: {
            label:   tr('msg_reason_low_eng'),
            subject: tr('tpl_eng_subject'),
            body:    tr('tpl_eng_body')
          },
          inactive: {
            label:   tr('msg_reason_inactive'),
            subject: tr('tpl_inactive_subject'),
            body:    tr('tpl_inactive_body')
          },
          submission: {
            label:   tr('msg_reason_task'),
            subject: tr('tpl_task_subject'),
            body:    tr('tpl_task_body')
          },
          praise: {
            label:   tr('msg_reason_praise'),
            subject: tr('tpl_praise_subject'),
            body:    tr('tpl_praise_body')
          }
        };
      }
    
      /* ── Gerar mensagem com IA ── */
      function generateWithAI(studentName, studentId) {
        var aiBtn  = document.getElementById('mwaMsgAIBtn');
        var subj   = document.getElementById('mwaMsgSubject');
        var body   = document.getElementById('mwaMsgBody');
        var reason = (document.getElementById('mwaMsgReason') || {}).value || '';
        var type   = SEND_TYPE;

        if (aiBtn) { aiBtn.disabled = true; aiBtn.textContent = '⏳ ' + tr('ct_ai_generating'); }

        // Buscar dados do aluno no state
        var mwa = window.MWADashboard;
        var state = (mwa && mwa.state) || {};
        var student = (state.students || []).find(function(s) {
          return s.userid === studentId || norm(s.name) === norm(studentName);
        }) || {};

        var reasonLabel = reason || tr('msg_reason_low_eng');
        var courseid = parseInt((Store.getConfig ? Store.getConfig().courseid : 0) || 0, 10);
        if (!courseid) {
          var m = (window.location.search || '').match(/[?&]id=(\d+)/);
          if (m) courseid = parseInt(m[1], 10);
        }
        if (!courseid) {
          // Fallback: ler do elemento do bloco
          var blockEl = document.querySelector('[data-courseid]');
          if (blockEl) courseid = parseInt(blockEl.getAttribute('data-courseid') || 0, 10);
        }

        var prompt = 'You are an educational tutor writing a pedagogical message in the same language as this system.\n\n'
          + 'STUDENT: ' + studentName + '\n'
          + 'REASON: ' + reasonLabel + '\n'
          + 'CHANNEL: ' + (type === 'email' ? 'Email (formal)' : 'Moodle message (friendly)')  + '\n'
          + (student.score !== undefined ? 'ENGAGEMENT SCORE: ' + student.score + '%\n' : '')
          + (student.ago !== undefined ? 'DAYS WITHOUT ACCESS: ' + student.ago + '\n' : '')
          + (student.grade !== null && student.grade !== undefined ? 'CURRENT GRADE: ' + student.grade + '\n' : '')
          + '\nWrite a short, empathetic and personalised message to this student.\n'
          + 'Return ONLY two lines:\n'
          + 'SUBJECT: <subject line>\n'
          + 'MESSAGE: <message body, 3-4 sentences>\n'
          + 'Do not include any other text.';

        Store.callAction('block_mwa_dashboard_get_ai_recommendation', {
          courseid: courseid, student_name: studentName, prompt: prompt
        }).then(function(res) {
          var text = (res && (res.recommendation || res.response || res.content)) || '';
          if (!text) throw new Error(tr('err_ajax_bridge'));

          // Parsear SUBJECT: e MESSAGE:
          var subjMatch = text.match(/SUBJECT:\s*(.+)/i);
          var msgMatch  = text.match(/MESSAGE:\s*([\s\S]+)/i);

          if (subjMatch && subj) subj.value = subjMatch[1].trim();
          if (msgMatch  && body) body.value  = msgMatch[1].trim();

          if (aiBtn) { aiBtn.disabled = false; aiBtn.textContent = '✨ ' + tr('msg_ai_generate'); }
          toast(tr('msg_ai_done'), 'success');
        }).catch(function(e) {
          if (aiBtn) { aiBtn.disabled = false; aiBtn.textContent = '✨ ' + tr('msg_ai_generate'); }
          toast('⚠️ ' + e.message, 'error');
        });
      }

      function openSendMessage(studentName, studentEmail, studentId, reason) {
        var old = document.getElementById('mwaMsgOverlay');
        if (old) old.remove();
    
        var overlay = document.createElement('div');
        overlay.className = 'mwa-msg-overlay';
        overlay.id = 'mwaMsgOverlay';
        overlay.onclick = function (e) { if (e.target === overlay) overlay.remove(); };
    
        var bg  = avatarBg(studentName);
        var ini = initials(studentName);
    
        var reasons = [
          { v: '',                   l: tr('msg_reason_select') },
          { v: 'Baixo engajamento',  l: tr('msg_reason_low_eng') },
          { v: 'Risco de evasão',    l: tr('msg_reason_risk') },
          { v: '7+ dias sem acesso', l: '⏰ 7+ dias sem acesso' },
          { v: 'Tarefa pendente',    l: tr('msg_reason_task') },
          { v: 'Reengajamento',      l: tr('msg_reason_reeng') },
          { v: 'Parabenizar',        l: tr('msg_reason_praise') },
          { v: 'Outro',              l: tr('msg_reason_other') },
        ];
    
        Store.renderHtml(overlay, '<div class="mwa-msg-modal">'
            + '<div class="mwa-msg-head">'
              + '<div class="mwa-msg-head-avatar" style="background:' + bg + ';">' + esc(ini) + '</div>'
              + '<div>'
                + '<div class="mwa-msg-head-name">✉️ ' + tr('msg_modal_title') + ' ' + esc(studentName) + '</div>'
                + '<div class="mwa-msg-head-sub">' + esc(studentEmail || 'sem email cadastrado') + '</div>'
              + '</div>'
              + '<button class="mwa-msg-close" onclick="document.getElementById(\'mwaMsgOverlay\').remove()">✕</button>'
            + '</div>'
            + '<div class="mwa-msg-body">'
    
              // Send type — two toggle buttons
              + '<div>'
                + '<div class="mwa-msg-label">' + tr('msg_send_type_label') + '</div>'
                + '<div style="display:flex;gap:8px;">'
                  + '<button id="mwaSendTypeMoodle" class="mwa-msg-tpl-btn" style="border-color:var(--blue);color:var(--blue);font-weight:900;" onclick="window.MWAInterventions._setSendType(\'moodle\')">💬 ' + tr('msg_type_moodle_btn') + '</button>'
                  + '<button id="mwaSendTypeEmail" class="mwa-msg-tpl-btn" onclick="window.MWAInterventions._setSendType(\'email\')">📧 ' + tr('msg_type_email_btn') + '</button>'
                + '</div>'
                + '<div id="mwaSendTypeHint" style="font-size:.7rem;color:var(--muted);margin-top:5px;">' + tr('msg_type_moodle_hint') + '</div>'
              + '</div>'
    
              + '<div>'
                + '<div class="mwa-msg-label">' + tr('msg_reason_label') + '</div>'
                + '<select id="mwaMsgReason" class="mwa-msg-select">'
                  + reasons.map(function (r) {
                      return '<option value="' + esc(r.v) + '"' + (reason === r.v ? ' selected' : '') + '>' + esc(r.l) + '</option>';
                    }).join('')
                + '</select>'
              + '</div>'
    
              + '<div>'
                + '<div class="mwa-msg-label">' + tr('msg_subject_label') + '</div>'
                + '<input id="mwaMsgSubject" class="mwa-msg-input" type="text" placeholder="' + tr('msg_subject_placeholder') + '">'
              + '</div>'
    
              + '<div>'
                + '<div class="mwa-msg-label" style="display:flex;justify-content:space-between;">'
                  + '<span>' + tr('msg_body_label') + '</span><span style="font-weight:400;text-transform:none;letter-spacing:0;">' + tr('msg_templates_label') + '</span>'
                + '</div>'
                + '<div class="mwa-msg-templates">'
                  + Object.entries(getTemplates()).map(function (e) {
                      return '<button class="mwa-msg-tpl-btn" data-tpl="' + e[0] + '" data-name="' + esc(studentName) + '" onclick="window.MWAInterventions.applyTemplate(this.dataset.tpl,this.dataset.name)">' + esc(e[1].label) + '</button>';
                    }).join('')
                + '</div>'
                + '<textarea id="mwaMsgBody" class="mwa-msg-textarea" placeholder="' + tr('msg_body_placeholder') + '"></textarea>'
              + '</div>'
    
            + '</div>'
            + '<div class="mwa-msg-footer">'
              + '<button id="mwaMsgAIBtn" class="mwa-msg-ai-btn">✨ ' + tr('msg_ai_generate') + '</button>'
              + '<button class="mwa-msg-cancel-btn" onclick="document.getElementById(\'mwaMsgOverlay\').remove()">'+tr('msg_cancel')+'</button>'
              + '<button class="mwa-msg-send-btn" id="mwaMsgSendBtn" '
                + 'data-userid="' + (studentId || 0) + '" '
                + 'data-sname="' + esc(studentName) + '" '
                + 'data-semail="' + esc(studentEmail || '') + '" '
                + 'onclick="window.MWAInterventions.doSend(this)">✉️ ' + tr('msg_send_btn') + '</button>'
            + '</div>'
          + '</div>');
    
        (document.getElementById('block-mwa-dashboard-app') || document.body).appendChild(overlay);

        // Bind AI button
        var aiBtn = document.getElementById('mwaMsgAIBtn');
        if (aiBtn) {
          aiBtn.addEventListener('click', function() {
            generateWithAI(studentName, studentId);
          });
        }
    
        // Aplica template se reason veio preenchido
        if (reason) {
          var matched = Object.entries(getTemplates()).find(function (e) { return e[1].label.includes(reason); });
          if (matched) _applyTpl(matched[1], studentName);
        }
    
        var esc_key = function (e) {
          if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', esc_key); }
        };
        document.addEventListener('keydown', esc_key);
      }
    
      /* ── Toggle tipo de envio ── */
      var SEND_TYPE = 'moodle';
      function _setSendType(type) {
        SEND_TYPE = type;
        var bm = document.getElementById('mwaSendTypeMoodle');
        var be = document.getElementById('mwaSendTypeEmail');
        var hint = document.getElementById('mwaSendTypeHint');
        if (bm) { bm.style.borderColor = type === 'moodle' ? 'var(--blue)' : ''; bm.style.color = type === 'moodle' ? 'var(--blue)' : ''; bm.style.fontWeight = type === 'moodle' ? '900' : ''; }
        if (be) { be.style.borderColor = type === 'email' ? 'var(--green)' : ''; be.style.color = type === 'email' ? 'var(--green)' : ''; be.style.fontWeight = type === 'email' ? '900' : ''; }
        if (hint) hint.textContent = type === 'moodle'
          ? tr('msg_type_moodle_hint')
          : tr('msg_type_email_hint');
      }
    
      function applyTemplate(key, studentName) {
        var tpl = getTemplates()[key];
        if (!tpl) return;
        _applyTpl(tpl, studentName);
      }
    
      function _applyTpl(tpl, studentName) {
        var firstName = (studentName || '').split(' ')[0];
        var subj = document.getElementById('mwaMsgSubject');
        var body = document.getElementById('mwaMsgBody');
        if (subj) subj.value = tpl.subject;
        if (body) body.value = tpl.body.replace(/{nome}/gi, firstName);
      }
    
      /* ── Envio real via AMD ── */
      function doSend(el) {
        var userId   = Number((el && el.dataset && el.dataset.userid) || 0);
        var sname    = (el && el.dataset && el.dataset.sname)  || '';
        var semail   = (el && el.dataset && el.dataset.semail) || '';
        var subject  = (document.getElementById('mwaMsgSubject') || {}).value || '';
        var message  = (document.getElementById('mwaMsgBody')    || {}).value || '';
        var reason   = (document.getElementById('mwaMsgReason')  || {}).value || '';
        var sendType = SEND_TYPE; // 'moodle' | 'email'
    
        if (!subject.trim() || !message.trim()) {
          toast('Preencha o assunto e a mensagem.', 'error');
          return;
        }
        if (sendType === 'email' && !semail) {
          toast(tr('msg_no_email'), 'error');
          return;
        }
    
        var btn = document.getElementById('mwaMsgSendBtn');
        if (btn) { btn.disabled = true; btn.textContent = '⏳ Enviando...'; }
    
        var courseid = parseInt((Store.getConfig().courseid || 0), 10);
        var msgHtml  = message.replace(/\n/g, '<br>');
    
        callAMD('block_mwa_dashboard_send_message', {
          courseid:            courseid,
          userid:              userId,
          subject:             subject,
          message:             msgHtml,
          intervention_reason: reason,
          ai_generated:        0,
          send_type:           sendType,
          student_email:       semail
        }, function (res) {
          var overlay = document.getElementById('mwaMsgOverlay');
          if (overlay) overlay.remove();
          if (res.success) {
            var channel = sendType === 'email' ? 'e-mail' : 'Moodle';
            toast('✅ ' + sname + ' recebeu sua mensagem via ' + channel + '!', 'success');
            window.MWAInterventions.loadInterventions();
            if (typeof window.MWAInterventions._afterSend === 'function') {
              window.MWAInterventions._afterSend();
            }
          } else {
            toast('❌ Erro ao enviar: ' + (res.status || 'desconhecido'), 'error');
          }
        }, function (err) {
          if (btn) { btn.disabled = false; btn.textContent = '✉️ ' + tr('msg_send_btn'); }
          toast(tr('msg_conn_error'), 'error');
        });
      }
    
      /* ══════════════════════════════════════════
         CARREGA INTERVENÇÕES DO SERVIDOR
      ══════════════════════════════════════════ */
      function loadInterventions(cb) {
        var courseid = parseInt((Store.getConfig().courseid || 0), 10);
        if (!courseid) { INTERVENTIONS = []; if (cb) cb([]); return; }
    
        callAMD('block_mwa_dashboard_get_interventions', { courseid: courseid }, function (res) {
          try { INTERVENTIONS = JSON.parse(res.interventions || '[]'); } catch (e) { INTERVENTIONS = []; }
          if (cb) cb(INTERVENTIONS);
          renderInterventionsPage();
        }, function () {
          INTERVENTIONS = [];
          if (cb) cb([]);
        });
      }
    
      /* ══════════════════════════════════════════
         ABA INTERVENÇÕES
      ══════════════════════════════════════════ */
    
      /* ── Traduz o motivo armazenado no banco para o idioma activo ── */
      function translateReason(reason) {
        if (!reason) return '—';
        var channel = '';
        var m = reason.match(/\s*\[(moodle|email)\]\s*$/i);
        if (m) { channel = ' [' + m[1] + ']'; reason = reason.replace(m[0], '').trim(); }
        var map = {
          'Baixo engajamento':  'msg_reason_low_eng',
          'Risco de evasão':    'msg_reason_risk',
          '7+ dias sem acesso': 'msg_reason_inactive',
          'Tarefa pendente':    'msg_reason_task',
          'Reengajamento':      'msg_reason_reeng',
          'Parabenizar':        'msg_reason_praise',
          'Outro':              'msg_reason_other',
        };
        var key = map[reason];
        return (key ? tr(key) : reason) + channel;
      }
    
      /* ── Export contact report as native XLSX ── */
      function exportContacts(data, logs) {
        if (!data || !data.length) return;

        function xmlEsc(s) {
          return String(s == null ? '' : s)
            .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
            .replace(/"/g,'&quot;').replace(/'/g,'&apos;');
        }
        function colName(n) { var s=''; n++; while(n>0){n--;s=String.fromCharCode(65+n%26)+s;n=Math.floor(n/26);} return s; }
        function cellRef(r,c){ return colName(c)+(r+1); }

        var sharedStr=[], sharedMap={};
        function si(s){ var k=String(s==null?'':s); if(sharedMap[k]===undefined){sharedMap[k]=sharedStr.length;sharedStr.push(k);} return sharedMap[k]; }

        var headers = [
          tr('int_col_date','Data'),
          tr('int_col_student','Aluno'),
          tr('int_col_reason','Motivo'),
          tr('int_col_teacher','Remetente'),
          tr('int_col_status','Status'),
          tr('int_col_effect','Retornou em'),
          tr('int_export_channel','Canal'),
          tr('int_export_subject','Assunto'),
        ];

        var rows = data.map(function(d) {
          // Calcular retorno
          var returnTs = null;
          var rowName = norm(d.student_name);
          logs.forEach(function(r){
            if(norm(r.nomecompleto)!==rowName)return;
            var ts=r._ts?Number(r._ts):0;
            if(ts>d.timesent&&(returnTs===null||ts<returnTs))returnTs=ts;
          });
          var effectLabel = d.status!=='sent' ? '—'
            : returnTs===null ? tr('int_no_effect','Não retornou')
            : (function(){
                var diff=returnTs-d.timesent;
                if(diff<3600)return Math.round(diff/60)+'min';
                if(diff<86400)return Math.round(diff/3600)+'h';
                return Math.round(diff/86400)+' dias';
              })();

          return [
            fmtDate(d.timesent).slice(0,10),
            d.student_name || '',
            (function(r){var m={'Baixo engajamento':'msg_reason_low_eng','Risco de evasão':'msg_reason_risk','7+ dias sem acesso':'msg_reason_inactive','Tarefa pendente':'msg_reason_task','Reengajamento':'msg_reason_reeng','Parabenizar':'msg_reason_praise','Outro':'msg_reason_other'};return m[r]?tr(m[r]):r||'';})(d.intervention_reason||''),
            d.teacher_name || '',
            d.status==='sent' ? tr('int_status_sent','Enviado') : tr('int_status_error','Erro'),
            effectLabel,
            d.send_type || 'moodle',
            d.subject || '',
          ];
        });

        // Montar worksheet
        var allRows = [headers].concat(rows);
        var ws = {};
        allRows.forEach(function(row, r) {
          row.forEach(function(val, c) {
            var ref = cellRef(r, c);
            ws[ref] = { t: 's', v: String(val==null?'':val) };
          });
        });
        ws['!ref'] = colName(headers.length-1) + (allRows.length);
        ws['!ref'] = 'A1:' + colName(headers.length-1) + allRows.length;
        ws['!cols'] = [{wch:12},{wch:28},{wch:22},{wch:22},{wch:10},{wch:14},{wch:10},{wch:32}];

        // Shared strings XML
        var ssXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
          + '<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"'
          + ' count="'+sharedStr.length+'" uniqueCount="'+sharedStr.length+'">'
          + allRows.reduce(function(acc,row){ row.forEach(function(v){ si(v); }); return acc; }, '')
          + sharedStr.map(function(s){return '<si><t xml:space="preserve">'+xmlEsc(s)+'</t></si>';}).join('')
          + '</sst>';

        // Rebuild sheetRows now that si() is populated
        var sheetRows = '';
        allRows.forEach(function(row, r) {
          var cells = '';
          row.forEach(function(val, c) {
            cells += '<c r="'+cellRef(r,c)+'" t="s"><v>'+si(val)+'</v></c>';
          });
          sheetRows += '<row r="'+(r+1)+'">'+cells+'</row>';
        });

        var colDefs = headers.map(function(_,i){ return '<col min="'+(i+1)+'" max="'+(i+1)+'" width="'+(ws['!cols'][i]?ws['!cols'][i].wch:14)+'" customWidth="1"/>'; }).join('');
        var sheetXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
          + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"'
          + ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
          + '<dimension ref="A1:'+colName(headers.length-1)+allRows.length+'"/>'
          + '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
          + '<cols>'+colDefs+'</cols>'
          + '<sheetData>'+sheetRows+'</sheetData>'
          + '</worksheet>';

        var _sheetName=tr('int_export_sheet_name','Contatos');
        var wbXml='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="'+_sheetName+'" sheetId="1" r:id="rId1"/></sheets></workbook>';
        var wbRels='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>';
        var rootRels='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>';
        var ct='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/></Types>';

        var files=[
          {name:'[Content_Types].xml', data:ct},
          {name:'_rels/.rels',         data:rootRels},
          {name:'xl/workbook.xml',     data:wbXml},
          {name:'xl/_rels/workbook.xml.rels', data:wbRels},
          {name:'xl/worksheets/sheet1.xml',   data:sheetXml},
          {name:'xl/sharedStrings.xml',       data:ssXml},
        ];

        function u32le(n){return[n&0xff,(n>>8)&0xff,(n>>16)&0xff,(n>>24)&0xff];}
        function u16le(n){return[n&0xff,(n>>8)&0xff];}
        function crc32(b){var t=[];for(var i=0;i<256;i++){var c=i;for(var j=0;j<8;j++)c=(c&1)?(0xEDB88320^(c>>>1)):(c>>>1);t[i]=c;}var crc=0xFFFFFFFF;for(var k=0;k<b.length;k++)crc=t[(crc^b[k])&0xff]^(crc>>>8);return(crc^0xFFFFFFFF)>>>0;}

        var enc=new TextEncoder();
        var localH=[],centralD=[],offset=0;
        files.forEach(function(f){
          var nb=enc.encode(f.name), db=enc.encode(f.data);
          var crc=crc32(db), sz=db.length;
          var lh=[0x50,0x4B,0x03,0x04,0x14,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00]
            .concat(u32le(crc),u32le(sz),u32le(sz),u16le(nb.length),u16le(0))
            .concat(Array.from(nb),Array.from(db));
          var cd=[0x50,0x4B,0x01,0x02,0x14,0x00,0x14,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00]
            .concat(u32le(crc),u32le(sz),u32le(sz),u16le(nb.length),u16le(0),u16le(0),u16le(0),u16le(0),u32le(0),u32le(offset))
            .concat(Array.from(nb));
          localH.push(lh); centralD.push(cd); offset+=lh.length;
        });
        var cdBytes=centralD.reduce(function(a,b){return a.concat(b);},[]);
        var eocd=[0x50,0x4B,0x05,0x06,0x00,0x00,0x00,0x00]
          .concat(u16le(files.length),u16le(files.length),u32le(cdBytes.length),u32le(offset),u16le(0));
        var all=localH.reduce(function(a,b){return a.concat(b);},cdBytes.concat(eocd));
        // fix: centralD vem depois dos localH
        all=localH.reduce(function(a,b){return a.concat(b);},cdBytes.length?[]:[]).concat(cdBytes).concat(eocd);
        all=[];
        localH.forEach(function(h){all=all.concat(h);});
        all=all.concat(cdBytes).concat(eocd);

        var blob=new Blob([new Uint8Array(all)],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
        var url=URL.createObjectURL(blob);
        var a=document.createElement('a');
        a.href=url; a.download='contatos_'+new Date().toISOString().slice(0,10)+'.xlsx';
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setTimeout(function(){URL.revokeObjectURL(url);},2000);
      }

      function renderInterventionsPage() {
        var el = document.getElementById('interventionsWrap');
        if (!el) return;
    
        var data = INTERVENTIONS;
        var total     = data.length;
        var sent      = data.filter(function (d) { return d.status === 'sent'; }).length;
        var errors    = total - sent;
    
        // Effectiveness: cross-reference with logs — student who accessed after the message
        var logs      = (window.MWADashboard && window.MWADashboard.state && window.MWADashboard.state.logs) || [];
        var returned  = 0;
        var returnDays = [];
        data.forEach(function (d) {
          if (d.status !== 'sent') return;
          var name = norm(d.student_name);
          var earliest = null;
          logs.forEach(function (r) {
            if (norm(r.nomecompleto) !== name) return;
            var ts = r._ts ? Number(r._ts) : 0;
            if (ts > d.timesent && (earliest === null || ts < earliest)) earliest = ts;
          });
          if (earliest !== null) {
            returned++;
            returnDays.push((earliest - d.timesent) / 86400);
          }
        });
        var returnRate    = sent > 0 ? Math.round(returned / sent * 100) : 0;
        var avgReturnDays = returnDays.length ? (returnDays.reduce(function (a, b) { return a + b; }, 0) / returnDays.length).toFixed(1) : '—';
        var notReturned   = sent > 0 ? 100 - returnRate : 0;
    
        // KPIs
        var kpisHtml =
          '<div class="kpis int-kpi-row" style="margin-bottom:18px;">'
          + '<div class="kpi c-blue"><div class="kpi-label">✉️ ' + tr('int_kpi_sent') + '</div><div class="kpi-value">' + total + '</div></div>'
          + '<div class="kpi c-green"><div class="kpi-label">✅ ' + tr('int_kpi_returned') + '</div><div class="kpi-value">' + returnRate + '%</div><div class="kpi-sub">' + returned + ' ' + tr('int_of') + ' ' + sent + '</div></div>'
          + '<div class="kpi c-teal"><div class="kpi-label">⏱ ' + tr('int_kpi_avg_return') + '</div><div class="kpi-value" style="font-size:1.3rem;">' + avgReturnDays + '</div><div class="kpi-sub">' + tr('int_days') + '</div></div>'
          + '<div class="kpi c-amber"><div class="kpi-label">⚠️ ' + tr('int_kpi_inactive') + '</div><div class="kpi-value">' + notReturned + '%</div><div class="kpi-sub">' + (sent - returned) + ' ' + tr('int_students') + '</div></div>'
          + '</div>';
    
        // Tabela
        var rows = data.map(function (d) {
          var dateStr = fmtDate(d.timesent);
          var statusHtml = d.status === 'sent'
            ? '<span class="int-status-ok">✅</span>'
            : '<span class="int-status-err">❌</span>';
          var aiHtml = d.ai_generated ? '<span class="int-ai-badge">✨ IA</span>' : '';
    
          // Find the nearest access AFTER the message was sent
          var returnTs = null;
          var rowName = norm(d.student_name);
          logs.forEach(function (r) {
            if (norm(r.nomecompleto) !== rowName) return;
            var ts = r._ts ? Number(r._ts) : 0;
            if (ts > d.timesent) {
              if (returnTs === null || ts < returnTs) returnTs = ts;
            }
          });
    
          var effectHtml;
          if (d.status !== 'sent') {
            effectHtml = '—';
          } else if (returnTs === null) {
            effectHtml = '<span style="color:var(--muted);font-weight:700;">❌ ' + tr('int_no_effect') + '</span>';
          } else {
            var diffSec = returnTs - d.timesent;
            var label;
            if (diffSec < 3600) {
              var mins = Math.round(diffSec / 60);
              label = mins <= 1 ? tr('int_time_lt1min','< 1min') : mins + ' ' + tr('int_time_min','min');
            } else if (diffSec < 86400) {
              var hrs = Math.round(diffSec / 3600);
              label = hrs === 1 ? '1 ' + tr('int_time_hour','hora') : hrs + ' ' + tr('int_time_hours','horas');
            } else {
              var dys = Math.round(diffSec / 86400);
              label = dys === 1 ? '1 ' + tr('int_time_day','dia') : dys + ' ' + tr('int_time_days','dias');
            }
            effectHtml = '<span style="color:var(--green);font-weight:700;">✅ ' + label + '</span>';
          }
    
          return '<tr onclick="window.MWAInterventions.showDetail(' + d.id + ')">'
            + '<td style="font-size:.78rem;color:var(--muted);">' + esc(dateStr.slice(0, 10)) + '</td>'
            + '<td><span class="gr-name" onclick="event.stopPropagation();window.goToStudentProfile&&window.goToStudentProfile(' + JSON.stringify(d.student_name) + ')">' + esc(d.student_name) + '</span></td>'
            + '<td style="font-size:.78rem;">' + esc(translateReason(d.intervention_reason || '')) + ' ' + aiHtml + '</td>'
            + '<td style="font-size:.78rem;color:var(--muted);">' + esc(d.teacher_name) + '</td>'
            + '<td class="center">' + statusHtml + '</td>'
            + '<td class="center">' + effectHtml + '</td>'
            + '<td class="center"><button title="Excluir" onclick="event.stopPropagation();window.MWAInterventions.deleteIntervention(' + d.id + ')" style="background:none;border:none;cursor:pointer;font-size:.9rem;color:var(--muted);padding:2px 6px;border-radius:6px;transition:color .15s;" onmouseover="this.style.color=\'var(--red)\'" onmouseout="this.style.color=\'var(--muted)\'">🗑</button></td>'
            + '</tr>';
        }).join('');
    
        var tableHtml = total
          ? '<div class="card" style="overflow:hidden;">'
              + '<table class="int-tbl"><thead><tr>'
                + '<th>' + tr('int_col_date') + '</th>'
                + '<th>' + tr('int_col_student') + '</th>'
                + '<th>' + tr('int_col_reason') + '</th>'
                + '<th>' + tr('int_col_teacher') + '</th>'
                + '<th class="center">' + tr('int_col_status') + '</th>'
                + '<th class="center">' + tr('int_col_effect') + '</th>'
                + '<th style="width:40px;"></th>'
              + '</tr></thead><tbody>' + rows + '</tbody></table>'
            + '</div>'
          : '<div class="gr-empty"><div class="gr-empty-icon">💬</div><p>' + esc(tr('int_no_data')) + '</p></div>';
    
        // Export report button
        var exportBtnHtml = total
          ? '<div style="display:flex;justify-content:flex-end;margin-bottom:12px;">'
            + '<button id="intExportBtn" style="background:linear-gradient(135deg,#3ecf8e,#13794c);color:#fff;border:none;border-radius:12px;padding:9px 18px;font-family:inherit;font-size:.82rem;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:.4rem;">📊 ' + tr('int_export','Exportar relatório') + '</button>'
            + '</div>'
          : '';

        Store.renderHtml(el, kpisHtml + exportBtnHtml + tableHtml);

        // Export button handler
        var exportBtn = document.getElementById('intExportBtn');
        if (exportBtn) {
          exportBtn.addEventListener('click', function () { exportContacts(data, logs); });
        }
      }
    
      /* ── Intervention detail ── */
      function showDetail(id) {
        var d = INTERVENTIONS.find(function (x) { return x.id === id; });
        if (!d) return;
    
        var old = document.getElementById('intDetailOverlay');
        if (old) old.remove();
    
        var overlay = document.createElement('div');
        overlay.className = 'mwa-msg-overlay';
        overlay.id = 'intDetailOverlay';
        overlay.onclick = function (e) { if (e.target === overlay) overlay.remove(); };
    
        Store.renderHtml(overlay, '<div class="int-detail-modal">'
            + '<div class="int-detail-head">'
              + '<div><div style="font-weight:900;font-size:.92rem;">✉️ ' + esc(d.subject) + '</div>'
                + '<div style="font-size:.72rem;color:var(--muted);margin-top:2px;">' + fmtDate(d.timesent) + ' · ' + (d.status === 'sent' ? '✅ Enviada' : '❌ Erro') + '</div>'
              + '</div>'
              + '<button class="mwa-msg-close" onclick="document.getElementById(\'intDetailOverlay\').remove()">✕</button>'
            + '</div>'
            + '<div class="int-detail-body">'
              + '<div class="int-detail-row"><div class="int-detail-label">Aluno</div><div class="int-detail-val">' + esc(d.student_name) + ' · <span style="color:var(--muted);">' + esc(d.student_email) + '</span></div></div>'
              + '<div class="int-detail-row"><div class="int-detail-label">Professor</div><div class="int-detail-val">' + esc(d.teacher_name) + '</div></div>'
              + '<div class="int-detail-row"><div class="int-detail-label">' + tr('msg_detail_reason') + '</div><div class="int-detail-val">' + esc(translateReason(d.intervention_reason || '')) + (d.ai_generated ? ' <span class="int-ai-badge">✨ IA</span>' : '') + '</div></div>'
              + '<div class="int-detail-row"><div class="int-detail-label">' + tr('msg_body_label') + '</div><div class="int-detail-msg">' + esc(d.message.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')) + '</div></div>'
            + '</div>'
          + '</div>');
    
        (document.getElementById('block-mwa-dashboard-app') || document.body).appendChild(overlay);

        // Bind AI button
        var aiBtn = document.getElementById('mwaMsgAIBtn');
        if (aiBtn) {
          aiBtn.addEventListener('click', function() {
            generateWithAI(studentName, studentId);
          });
        }
        var handler = function (e) { if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', handler); } };
        document.addEventListener('keydown', handler);
      }
    
      /* ══════════════════════════════════════════
         TIMELINE NO PERFIL DO ALUNO
      ══════════════════════════════════════════ */
      function renderStudentTimeline(studentName, containerId) {
        var el = document.getElementById(containerId);
        if (!el) return;
    
        var logs = (window.MWADashboard && window.MWADashboard.state && window.MWADashboard.state.logs) || [];
        var msgs = INTERVENTIONS.filter(function (d) { return norm(d.student_name) === norm(studentName) && d.status === 'sent'; });
    
        // Student log events (last 30 days)
        var now30 = Date.now() - 30 * 86400000;
        var logEvents = [];
        var dayMap = {};
        logs.forEach(function (r) {
          if (norm(r.nomecompleto) !== norm(studentName)) return;
          var ts = r._ts ? Number(r._ts) * 1000 : 0;
          if (ts < now30) return;
          var dk = new Date(ts).toDateString();
          if (!dayMap[dk]) {
            dayMap[dk] = true;
            var isSubmit = norm(r.nomedoevento).toLowerCase().includes('submit') ||
                           norm(r.nomedoevento).toLowerCase().includes('post created');
            logEvents.push({ ts: ts / 1000, type: isSubmit ? 'submit' : 'access', ctx: norm(r.contextodoevento) || norm(r.nomedoevento), dk: dk });
          }
        });
    
        // Combina eventos de log + mensagens enviadas
        var allEvents = logEvents.concat(msgs.map(function (m) {
          return { ts: m.timesent, type: 'msg', ctx: m.subject, reason: m.intervention_reason };
        }));
        allEvents.sort(function (a, b) { return a.ts - b.ts; });
    
        if (!allEvents.length) {
          Store.renderHtml(el, '<div style="font-size:.78rem;color:var(--muted);padding:.5rem 0;">' + esc(tr('int_no_timeline')) + '</div>');
          return;
        }
    
        var icons = { access: '🔵', submit: '📤', msg: '✉️', inactive: '⚠️' };
        var cls   = { access: 'access', submit: 'submit', msg: 'msg', inactive: 'inactive' };
    
        var html = '<div class="sp-timeline">' + allEvents.map(function (ev) {
          var dateStr = fmtDate(ev.ts).slice(0, 10);
          var icon    = icons[ev.type] || '•';
          var clsn    = cls[ev.type] || '';
          var title   = ev.type === 'msg' ? '✉️ Mensagem enviada' : ev.type === 'submit' ? '📤 Entrega' : '🔵 Acesso';
          var sub     = esc(ev.ctx || (ev.reason ? 'Motivo: ' + ev.reason : ''));
          return '<div class="sp-tl-item">'
            + '<div class="sp-tl-icon ' + clsn + '">' + icon + '</div>'
            + '<div class="sp-tl-content"><div class="sp-tl-title">' + title + '</div>'
              + (sub ? '<div class="sp-tl-sub">' + sub + '</div>' : '')
            + '</div>'
            + '<div class="sp-tl-date">' + esc(dateStr) + '</div>'
            + '</div>';
        }).join('') + '</div>';
    
        Store.renderHtml(el, html);
      }
    
      /* ── Quick message button ── */
      function quickMessage(studentName, studentEmail, studentId, reason) {
        // Look up real userid in logs if not provided
        if (!studentId || studentId === 0) {
          var logs = (window.MWADashboard && window.MWADashboard.state && window.MWADashboard.state.logs) || [];
          logs.some(function (r) {
            if (norm(r.nomecompleto) === norm(studentName) && r._userid) {
              studentId = Number(r._userid);
              return true;
            }
            return false;
          });
          if (!studentEmail) {
            logs.some(function (r) {
              if (norm(r.nomecompleto) === norm(studentName) && norm(r.email)) {
                studentEmail = norm(r.email);
                return true;
              }
              return false;
            });
          }
        }
        openSendMessage(studentName, studentEmail || '', studentId || 0, reason || '');
      }
    
      /* ── Populate the student select in the Interventions tab ── */
      function populateStudentSelect() {
        var sel = document.getElementById('intStudentSel');
        if (!sel) return;
        var logs = (window.MWADashboard && window.MWADashboard.state && window.MWADashboard.state.logs) || [];
        var seen = {}, names = [];
        logs.forEach(function (r) {
          var n = norm(r.nomecompleto);
          if (n && !seen[n]) { seen[n] = norm(r.email); names.push(n); }
        });
        names.sort(function (a, b) { return a.localeCompare(b, 'pt-BR'); });
        Store.renderHtml(sel, '<option value="">— Selecionar aluno —</option>'
          + names.map(function (n) {
              return '<option value="' + esc(n) + '" data-email="' + esc(seen[n]) + '">' + esc(n) + '</option>';
            }).join(''));
      }
    
      /* ── Enviar para o aluno selecionado ── */
      function sendToSelected() {
        var sel = document.getElementById('intStudentSel');
        if (!sel || !sel.value) { toast('Selecione um aluno.', 'error'); return; }
        var name  = sel.value;
        var email = (sel.options[sel.selectedIndex] && sel.options[sel.selectedIndex].dataset.email) || '';
        openSendMessage(name, email, 0, '');
      }
    
      /* ── Render da aba ── */
      function render() {
        populateStudentSelect();
        loadInterventions();
      }
    
      /* ── Delete intervention ── */
      function deleteIntervention(id) {
        if (!confirm(tr('msg_delete_confirm'))) return;
        callAMD('block_mwa_dashboard_delete_intervention', { id: id }, function (res) {
          if (res && res.success) {
            INTERVENTIONS = INTERVENTIONS.filter(function (d) { return d.id !== id; });
            renderInterventionsPage();
            toast(tr('msg_deleted'), 'success');
          } else {
            toast('Erro ao excluir.', 'error');
          }
        }, function () {
          toast(tr('msg_conn_error'), 'error');
        });
      }
    
      /* ── openByEl: reads data-sname and data-semail from the clicked element ── */
      function openByEl(el) {
        var name  = (el && el.dataset && el.dataset.sname)  || '';
        var email = (el && el.dataset && el.dataset.semail) || '';
        if (name) quickMessage(name, email, 0, '');
      }
    
      /* Public API */
      window.MWAInterventions = {
        render:                  render,
        loadInterventions:       loadInterventions,
        renderInterventionsPage: renderInterventionsPage,
        openSendMessage:         openSendMessage,
        openByEl:                openByEl,
        deleteIntervention:      deleteIntervention,
        quickMessage:            quickMessage,
        sendToSelected:          sendToSelected,
        applyTemplate:           applyTemplate,
        doSend:                  doSend,
        _setSendType:            _setSendType,
        showDetail:              showDetail,
        renderStudentTimeline:   renderStudentTimeline,
        getData:                 function () { return INTERVENTIONS; },
    _afterSend:              null
      };
    
    })();

    return window.MWAInterventions;
});
