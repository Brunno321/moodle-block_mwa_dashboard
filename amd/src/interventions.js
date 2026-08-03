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
 * performance reasons  -  the dashboard renders large dynamic datasets (student lists,
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
      function helpTip(key) {
        var text = esc(tr(key));
        return text ? '<span class="mwa-help-tip int-help-tip" tabindex="0" role="img" aria-label="' + text + '" title="' + text + '" data-tooltip="' + text + '">?</span>' : '';
      }
      function noteKey(id) {
        var cfg = Store.getConfig ? Store.getConfig() : {};
        return 'mwa_int_note_' + (cfg.courseid || 0) + '_' + id;
      }
      function loadNote(id) {
        try { return localStorage.getItem(noteKey(id)) || ''; } catch (e) { return ''; }
      }
      function saveNote(id) {
        var textarea = document.getElementById('intNoteText_' + id);
        if (!textarea) { return; }
        var value = textarea.value || '';
        try { localStorage.setItem(noteKey(id), value); } catch (e) {}
        var status = document.getElementById('intNoteSaved_' + id);
        if (status) {
          status.textContent = tr('int_note_saving');
        }
        callAMD('block_mwa_dashboard_save_intervention_note', { id: id, note: value }, function (res) {
          var item = INTERVENTIONS.find(function (d) { return d.id === id; });
          if (item && res && res.success) {
            item.teacher_note = res.note || value;
            item.teacher_note_updated = res.timemodified || 0;
          }
          if (status) {
            status.textContent = res && res.success ? tr('int_note_saved') : tr('int_note_save_error');
            setTimeout(function () { status.textContent = ''; }, 1800);
          }
        }, function () {
          if (status) {
            status.textContent = tr('int_note_save_error');
          }
        });
      }

      /* module state */
      var INTERVENTIONS = [];

      /* avatar colour palette */
      var AV_COLORS = ['#5b9bd5','#8b72d4','#3aab7a','#c98a2a','#d95f5f','#2aafaa','#e07ba0'];

      /* name initials */
      function initials(name) {
        var parts = norm(name).split(/\s+/).filter(Boolean);
        return ((parts[0] ? parts[0][0] : '?') + (parts[1] ? parts[1][0] : '')) || '?';
      }

      /* avatar colour derived from the name */
      function avatarBg(name) {
        var ci = Math.abs((norm(name).charCodeAt(0) || 0) + (norm(name).charCodeAt(1) || 0)) % AV_COLORS.length;
        return AV_COLORS[ci];
      }

      function studentPicture(d) {
        var pic = norm(d && (d.student_pictureurl || d.pictureurl));
        if (pic) return pic;
        var name = norm(d && d.student_name);
        var email = norm(d && d.student_email);
        var state = (window.MWADashboard && window.MWADashboard.state) || {};
        (state.students || []).some(function (s) {
          if ((name && norm(s.name) === name) || (email && norm(s.email) === email)) {
            pic = norm(s.pictureurl || s.profileimageurl || s.userpictureurl);
            return !!pic;
          }
          return false;
        });
        if (pic) return pic;
        (state.logs || []).some(function (r) {
          if ((name && norm(r.nomecompleto || r.student_name || r.userfullname) === name) || (email && norm(r.email) === email)) {
            pic = norm(r.pictureurl || r.profileimageurl || r.userpictureurl);
            return !!pic;
          }
          return false;
        });
        return pic;
      }

      function studentAvatar(d, cls) {
        var name = norm(d && d.student_name);
        var pic = studentPicture(d);
        var klass = cls || 'int-student-avatar';
        return '<span class="' + klass + (pic ? ' has-img' : '') + '" style="background:' + avatarBg(name) + ';">'
          + (pic ? '<img src="' + esc(pic) + '" alt="' + esc(name) + '" loading="lazy">' : esc(initials(name).toUpperCase()))
          + '</span>';
      }

      /* format a Unix timestamp (seconds) or Date as DD/MM/YYYY HH:MM */
      function fmtDate(d) {
        if (!d) return '-';
        var dt = (typeof d === 'number') ? new Date(d * 1000) : d;
        if (isNaN(dt.getTime())) return '-';
        var dd = String(dt.getDate()).padStart(2, '0');
        var mm = String(dt.getMonth() + 1).padStart(2, '0');
        var hh = String(dt.getHours()).padStart(2, '0');
        var mi = String(dt.getMinutes()).padStart(2, '0');
        return dd + '/' + mm + '/' + dt.getFullYear() + ' ' + hh + ':' + mi;
      }

      /* notification toast */
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
    
      /* ============================================================
         MESSAGE SEND MODAL
      ============================================================ */
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
          }
        };
      }

      function getTemplateForReason(reason) {
        var templates = getTemplates();
        var map = {
          'Baixo engajamento': templates.engagement,
          'Risco de evasão': templates.inactive,
          'Risco de evasÃ£o': templates.inactive,
          'Risco de evasÃƒÂ£o': templates.inactive,
          '7+ dias sem acesso': templates.inactive,
          'Tarefa pendente': templates.submission,
          'Reengajamento': templates.inactive
        };
        return map[reason] || null;
      }

      function firstNameForMessage(studentName, keepToken) {
        if (keepToken) {
          return '{firstname}';
        }
        return (studentName || '').split(/\s+/).filter(Boolean)[0] || '';
      }

      function personalizeMessage(text, studentName, keepToken) {
        var fn = firstNameForMessage(studentName, keepToken);
        return String(text || '').replace(/\{firstname\}|\{nome\}|\{name\}/gi, fn);
      }
    
      /* Generate message with AI */
      function generateWithAI(studentName, studentId) {
        var aiBtn  = document.getElementById('mwaMsgAIBtn');
        var subj   = document.getElementById('mwaMsgSubject');
        var body   = document.getElementById('mwaMsgBody');
        var reason = (document.getElementById('mwaMsgReason') || {}).value || '';
        var type   = SEND_TYPE;

        if (aiBtn) { aiBtn.disabled = true; aiBtn.textContent = tr('ct_ai_generating'); }

        // Look up the student data in state
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
          // Fallback: read from the block element
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

          if (aiBtn) { aiBtn.disabled = false; aiBtn.textContent = tr('msg_ai_generate'); }
          toast(tr('msg_ai_done'), 'success');
        }).catch(function(e) {
          if (aiBtn) { aiBtn.disabled = false; aiBtn.textContent = tr('msg_ai_generate'); }
          toast(e.message, 'error');
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
          { v: 'Risco de evasão',     l: tr('msg_reason_risk') },
          { v: '7+ dias sem acesso', l: tr('msg_reason_inactive') },
          { v: 'Tarefa pendente',    l: tr('msg_reason_task') },
          { v: 'Reengajamento',      l: tr('msg_reason_reeng') },
          { v: 'Outro',              l: tr('msg_reason_other') },
        ];
    
        Store.renderHtml(overlay, '<div class="mwa-msg-modal">'
            + '<div class="mwa-msg-head">'
              + '<div class="mwa-msg-head-avatar" style="background:' + bg + ';">' + esc(ini) + '</div>'
              + '<div>'
                + '<div class="mwa-msg-head-name">&#9993; ' + tr('msg_modal_title') + ' ' + esc(studentName) + '</div>'
                + '<div class="mwa-msg-head-sub">' + esc(studentEmail || tr('msg_no_registered_email')) + '</div>'
              + '</div>'
              + '<button class="mwa-msg-close" onclick="document.getElementById(\'mwaMsgOverlay\').remove()">&times;</button>'
            + '</div>'
            + '<div class="mwa-msg-body">'
    
              // Send type  -  two toggle buttons
              + '<div>'
                + '<div class="mwa-msg-label">' + tr('msg_send_type_label') + '</div>'
                + '<div style="display:flex;gap:8px;">'
                  + '<button id="mwaSendTypeMoodle" class="mwa-msg-tpl-btn" style="border-color:var(--blue);color:var(--blue);font-weight:900;" onclick="window.MWAInterventions._setSendType(\'moodle\')">&#128172; ' + tr('msg_type_moodle_btn') + '</button>'
                  + '<button id="mwaSendTypeEmail" class="mwa-msg-tpl-btn" onclick="window.MWAInterventions._setSendType(\'email\')">&#9993; ' + tr('msg_type_email_btn') + '</button>'
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
                + '<div class="mwa-msg-label">' + tr('msg_body_label') + '</div>'
                + '<textarea id="mwaMsgBody" class="mwa-msg-textarea" placeholder="' + tr('msg_body_placeholder') + '"></textarea>'
              + '</div>'
    
            + '</div>'
            + '<div class="mwa-msg-footer">'
              + '<button id="mwaMsgAIBtn" class="mwa-msg-ai-btn">' + tr('msg_ai_generate') + '</button>'
              + '<button class="mwa-msg-cancel-btn" onclick="document.getElementById(\'mwaMsgOverlay\').remove()">'+tr('msg_cancel')+'</button>'
              + '<button class="mwa-msg-send-btn" id="mwaMsgSendBtn" '
                + 'data-userid="' + (studentId || 0) + '" '
                + 'data-sname="' + esc(studentName) + '" '
                + 'data-semail="' + esc(studentEmail || '') + '" '
                + 'onclick="window.MWAInterventions.doSend(this)">&#9993; ' + tr('msg_send_btn') + '</button>'
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
    
        var reasonSelect = document.getElementById('mwaMsgReason');
        if (reasonSelect) {
          reasonSelect.addEventListener('change', function () {
            var tpl = getTemplateForReason(reasonSelect.value);
            if (tpl) _applyTpl(tpl, studentName, false);
          });
        }

        if (reason) {
          var presetTpl = getTemplateForReason(reason);
          if (presetTpl) _applyTpl(presetTpl, studentName, false);
        }
    
        var esc_key = function (e) {
          if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', esc_key); }
        };
        document.addEventListener('keydown', esc_key);
      }
    
      /* Toggle send type */
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
        _applyTpl(tpl, studentName, false);
      }
    
      function _applyTpl(tpl, studentName, keepToken) {
        var subj = document.getElementById('mwaMsgSubject');
        var body = document.getElementById('mwaMsgBody');
        if (subj) subj.value = tpl.subject;
        if (body) body.value = personalizeMessage(tpl.body, studentName, keepToken);
      }
    
      /* Actual send via AMD */
      function doSend(el) {
        var userId   = Number((el && el.dataset && el.dataset.userid) || 0);
        var sname    = (el && el.dataset && el.dataset.sname)  || '';
        var semail   = (el && el.dataset && el.dataset.semail) || '';
        var subject  = (document.getElementById('mwaMsgSubject') || {}).value || '';
        var message  = (document.getElementById('mwaMsgBody')    || {}).value || '';
        var reason   = (document.getElementById('mwaMsgReason')  || {}).value || '';
        var sendType = SEND_TYPE;
    
        if (!subject.trim() || !message.trim()) {
          toast(tr('msg_required_subject_body'), 'error');
          return;
        }
        if (sendType === 'email' && !semail) {
          toast(tr('msg_no_email'), 'error');
          return;
        }
    
        var btn = document.getElementById('mwaMsgSendBtn');
        if (btn) { btn.disabled = true; btn.textContent = tr('msg_sending'); }
    
        var courseid = parseInt((Store.getConfig().courseid || 0), 10);
        message = personalizeMessage(message, sname, false);
        subject = personalizeMessage(subject, sname, false);
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
            var channel = sendType === 'email' ? tr('msg_channel_email') : tr('msg_channel_moodle');
            var sentMsg = tr('msg_sent_success').replace('{name}', sname).replace('{channel}', channel);
            toast(sentMsg, 'success');
            window.MWAInterventions.loadInterventions();
            if (typeof window.MWAInterventions._afterSend === 'function') {
              window.MWAInterventions._afterSend();
            }
          } else {
            toast(tr('msg_send_error').replace('{status}', (res.status || tr('msg_unknown_status'))), 'error');
          }
        }, function (err) {
          if (btn) { btn.disabled = false; btn.textContent = tr('msg_send_btn'); }
          toast(tr('msg_conn_error'), 'error');
        });
      }
    
      /* ============================================================
         LOAD INTERVENTIONS FROM SERVER
      ============================================================ */
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
    
      /* ============================================================
         INTERVENTIONS TAB
      ============================================================ */
    
      /* Translate the reason stored in the database into the active language */
      function translateReason(reason) {
        if (!reason) return '-';
        var channel = '';
        var m = reason.match(/\s*\[(moodle|email)\]\s*$/i);
        if (m) { channel = ' [' + m[1] + ']'; reason = reason.replace(m[0], '').trim(); }
        var map = {
          'Baixo engajamento':  'msg_reason_low_eng',
          'Risco de evasão':     'msg_reason_risk',
          'Risco de evasÃ£o':    'msg_reason_risk',
          'Risco de evasÃƒÂ£o':   'msg_reason_risk',
          '7+ dias sem acesso': 'msg_reason_inactive',
          'Tarefa pendente':    'msg_reason_task',
          'Reengajamento':      'msg_reason_reeng',
          'Parabenizar':        'msg_reason_praise',
          'Outro':              'msg_reason_other',
        };
        var key = map[reason];
        return (key ? tr(key) : reason) + channel;
      }
    
      /* Export contact report as native XLSX */
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
          tr('int_col_effect','Status'),
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
          var effectLabel = d.status!=='sent' ? '-'
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
            (function(r){var m={'Baixo engajamento':'msg_reason_low_eng','Risco de evasão':'msg_reason_risk','Risco de evasÃ£o':'msg_reason_risk','Risco de evasÃƒÂ£o':'msg_reason_risk','7+ dias sem acesso':'msg_reason_inactive','Tarefa pendente':'msg_reason_task','Reengajamento':'msg_reason_reeng','Parabenizar':'msg_reason_praise','Outro':'msg_reason_other'};return m[r]?tr(m[r]):r||'';})(d.intervention_reason||''),
            d.teacher_name || '',
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
        // fix: centralD comes after localH
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
    
        // Effectiveness: cross-reference with logs  -  student who accessed after the message
        var logs      = (window.MWADashboard && window.MWADashboard.state && window.MWADashboard.state.logs) || [];
        var grades    = (window.MWADashboard && window.MWADashboard.state && window.MWADashboard.state.grades) || [];
        function parseTargets(d) {
          try {
            var parsed = JSON.parse(d.target_items || '[]');
            return Array.isArray(parsed) ? parsed : [];
          } catch (e) {
            return [];
          }
        }
        function studentMatchesLog(log, d) {
          var rowName = norm(d.student_name).toLowerCase();
          var rowEmail = norm(d.student_email).toLowerCase();
          var logName = norm(log.nomecompleto || log.student_name || log.userfullname).toLowerCase();
          var logEmail = norm(log.email).toLowerCase();
          return (rowEmail && logEmail && rowEmail === logEmail) || (rowName && logName && rowName === logName);
        }
        function logTs(log) {
          return log._ts ? Number(log._ts) : Number(log.timecreated || 0);
        }
        function logCmid(log) {
          return parseInt(log.cmid || log._cmid || log.contextinstanceid || log.contextinstance || log.coursemoduleid || log.moduleid || 0, 10) || 0;
        }
        function logName(log) {
          return norm(log.contextodoevento || log.eventcontext || log.context || log.nomedoevento || log.action);
        }
        function isSubmitLog(log) {
          var text = norm([log.nomedoevento, log.eventname, log.action, log.componente, log.component].join(' ')).toLowerCase();
          return text.indexOf('submit') >= 0 || text.indexOf('submitted') >= 0 || text.indexOf('post created') >= 0 ||
            text.indexOf('discussion created') >= 0 || text.indexOf('attempt submitted') >= 0 || text.indexOf('completed') >= 0 ||
            text.indexOf('completion') >= 0 || text.indexOf('graded') >= 0;
        }
        function currentActivityDone(d, target) {
          if (!target || !target.seq || !grades.length) return false;
          var studentName = norm(d.student_name).toLowerCase();
          var studentEmail = norm(d.student_email).toLowerCase();
          var row = null;
          grades.some(function(g) {
            if (!g || g.__mwa_type__ === 'activity_names') return false;
            var first = norm(g['First name'] || g.Nome || g.firstname || '');
            var last = norm(g['Last name'] || g.Sobrenome || g.lastname || '');
            var name = norm(g.student_name || g.name || g.nomecompleto || g.Aluno || (first + ' ' + last)).toLowerCase();
            var email = norm(g.Email || g.email || '').toLowerCase();
            if ((studentEmail && email === studentEmail) || (studentName && name === studentName)) {
              row = g;
              return true;
            }
            return false;
          });
          if (!row) return false;
          var current = parseInt(row['act_current_' + target.seq] || 0, 10) || 0;
          var val = row['act_' + target.seq];
          var num = parseFloat(String(val || '').replace(',', '.'));
          return current > 0 || (!isNaN(num) && num > 0);
        }
        function itemTouchedAfter(d, target, requireSubmit) {
          var targetName = norm(target && target.name).toLowerCase();
          var targetCmid = parseInt((target && target.cmid) || 0, 10) || 0;
          return logs.some(function(log) {
            if (!studentMatchesLog(log, d)) return false;
            var ts = logTs(log);
            if (!ts || ts <= d.timesent) return false;
            if (requireSubmit && !isSubmitLog(log)) return false;
            var sameCmid = targetCmid && logCmid(log) === targetCmid;
            var sameName = targetName && logName(log).toLowerCase().indexOf(targetName) >= 0;
            return sameCmid || sameName;
          });
        }
        function firstAccessAfter(d) {
          var earliest = null;
          logs.forEach(function(r) {
            if (!studentMatchesLog(r, d)) return;
            var ts = logTs(r);
            if (ts > d.timesent && (earliest === null || ts < earliest)) earliest = ts;
          });
          return earliest;
        }
        function formatDiffSeconds(diffSec) {
          if (diffSec < 3600) {
            var mins = Math.round(diffSec / 60);
            return mins <= 1 ? tr('int_time_lt1min','< 1min') : mins + ' ' + tr('int_time_min','min');
          }
          if (diffSec < 86400) {
            var hrs = Math.round(diffSec / 3600);
            return hrs === 1 ? '1 ' + tr('int_time_hour','hora') : hrs + ' ' + tr('int_time_hours','horas');
          }
          var dys = Math.round(diffSec / 86400);
          return dys === 1 ? '1 ' + tr('int_time_day','dia') : dys + ' ' + tr('int_time_days','dias');
        }
        function interventionResult(d) {
          if (d.status !== 'sent') return {state: 'none', label: '&mdash;', html: '&mdash;'};
          var targets = parseTargets(d);
          var type = norm(d.target_type || '');
          if (type === 'activity_completion' && targets.length) {
            var delivered = targets.some(function(target) {
              return currentActivityDone(d, target) || itemTouchedAfter(d, target, true);
            });
            return delivered
              ? {state: 'delivered', label: tr('int_result_delivered','Entregou'), html: '<span class="int-result-pill delivered"><i></i>' + esc(tr('int_result_delivered','Entregou')) + '</span>'}
              : {state: 'pending', label: tr('int_result_pending','Pendente'), html: '<span class="int-result-pill pending"><i></i>' + esc(tr('int_result_pending','Pendente')) + '</span>'};
          }
          if (type === 'resource_access' && targets.length) {
            var accessed = targets.some(function(target) { return itemTouchedAfter(d, target, false); });
            return accessed
              ? {state: 'accessed', label: tr('int_result_accessed','Acessou'), html: '<span class="int-result-pill accessed"><i></i>' + esc(tr('int_result_accessed','Acessou')) + '</span>'}
              : {state: 'pending', label: tr('int_result_pending','Pendente'), html: '<span class="int-result-pill pending"><i></i>' + esc(tr('int_result_pending','Pendente')) + '</span>'};
          }
          var returnTs = firstAccessAfter(d);
          if (returnTs === null) {
            return {state: 'pending', label: tr('int_result_pending','Pendente'), html: '<span class="int-result-pill pending"><i></i>' + esc(tr('int_result_pending','Pendente')) + '</span>'};
          }
          return {state: 'accessed', label: tr('int_result_accessed','Acessou'), html: '<span class="int-result-pill accessed"><i></i>' + esc(tr('int_result_accessed','Acessou')) + ' · ' + esc(formatDiffSeconds(returnTs - d.timesent)) + '</span>'};
        }
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
        var avgReturnDays = returnDays.length ? (returnDays.reduce(function (a, b) { return a + b; }, 0) / returnDays.length).toFixed(1) : '&mdash;';
        var notReturned   = sent > 0 ? 100 - returnRate : 0;
    
        var activeFilterId = document.activeElement && document.activeElement.id ? document.activeElement.id : '';
        var activeFilterPos = 0;
        try {
          activeFilterPos = document.activeElement && typeof document.activeElement.selectionStart === 'number'
            ? document.activeElement.selectionStart
            : 0;
        } catch (e) {
          activeFilterPos = 0;
        }
        var currentNameRaw = norm((document.getElementById('intFilterName') || {}).value);
        var currentName = currentNameRaw.toLowerCase();
        var currentReason = norm((document.getElementById('intFilterReason') || {}).value);
        var currentStatus = norm((document.getElementById('intFilterStatus') || {}).value);
        var currentFrom = norm((document.getElementById('intFilterFrom') || {}).value);
        var currentTo = norm((document.getElementById('intFilterTo') || {}).value);
        function dateKey(ts) {
          if (!ts) return '';
          var d = new Date(Number(ts) * 1000);
          if (isNaN(d.getTime())) return '';
          return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
        }
        function filterLabel(text) {
          return norm(text)
            .replace(/[^0-9A-Za-zÀ-ÖØ-öø-ÿ+ ]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        }
        function cleanReasonLabel(reason) {
          var r = norm(reason).replace(/\s*\[(moodle|email)\]\s*$/i, '');
          var map = {
            'Baixo engajamento': '\uD83D\uDCC9 Baixo engajamento',
            'Risco de evasão': '\u26A0\uFE0F Risco de evasão',
            'Risco de evasÃ£o': '\u26A0\uFE0F Risco de evasão',
            'Risco de evasÃƒÂ£o': '\u26A0\uFE0F Risco de evasão',
            '7+ dias sem acesso': '\u23F0 7+ dias sem acesso',
            'Tarefa pendente': '\uD83D\uDCDD Tarefa pendente',
            'Reengajamento': '\uD83D\uDD04 Reengajamento',
            'Outro': '\uD83D\uDCAC Outro'
          };
          return map[r] || filterLabel(translateReason(r));
        }
        var reasonValues = [];
        data.forEach(function (d) {
          var r = norm(d.intervention_reason || '');
          if (r && reasonValues.indexOf(r) === -1) reasonValues.push(r);
        });
        reasonValues.sort(function (a, b) { return cleanReasonLabel(a).localeCompare(cleanReasonLabel(b), 'pt-BR'); });
        var filteredData = data.filter(function (d) {
          var hay = [
            d.student_name || '',
            d.student_email || '',
            d.teacher_name || '',
            d.subject || '',
            translateReason(d.intervention_reason || '')
          ].join(' ').toLowerCase();
          var dk = dateKey(d.timesent);
          if (currentName && hay.indexOf(currentName) === -1) return false;
          if (currentReason && norm(d.intervention_reason || '') !== currentReason) return false;
          if (currentStatus && norm(interventionResult(d).state || '') !== currentStatus) return false;
          if (currentFrom && dk && dk < currentFrom) return false;
          if (currentTo && dk && dk > currentTo) return false;
          return true;
        });

        var kpisHtml = '';
        function customDropdown(id, label, placeholder, items, current) {
          var selected = (items || []).filter(function (item) { return item.v === current; })[0];
          var text = selected ? selected.l : placeholder;
          return '<label class="int-filter-field">' + esc(label)
            + '<div class="int-filter-dd" data-filter="' + esc(id) + '">'
              + '<input type="hidden" id="' + esc(id) + '" value="' + esc(current || '') + '">'
              + '<button type="button" class="int-filter-dd-toggle"><span>' + esc(text) + '</span><b></b></button>'
              + '<div class="int-filter-dd-menu">'
                + '<button type="button" class="int-filter-dd-option" data-value="">' + esc(placeholder) + '</button>'
                + (items || []).map(function (item) {
                  return '<button type="button" class="int-filter-dd-option' + (item.v === current ? ' is-selected' : '') + '" data-value="' + esc(item.v) + '">' + esc(item.l) + '</button>';
                }).join('')
              + '</div>'
            + '</div>'
          + '</label>';
        }
        var reasonOptions = reasonValues.map(function (r) { return {v: r, l: cleanReasonLabel(r)}; });
        var statusOptions = [
          {v: 'accessed', l: '\uD83D\uDD35 Acessou'},
          {v: 'delivered', l: '\uD83D\uDFE2 Entregou'},
          {v: 'pending', l: '\uD83D\uDD34 Pendente'}
        ];
    
        var filtersHtml = '<div class="card int-filter-card" style="margin-bottom:14px;padding:14px 16px;">'
          + '<div style="display:grid;grid-template-columns:minmax(220px,1.5fr) minmax(160px,1fr) minmax(140px,.8fr) minmax(135px,.7fr) minmax(135px,.7fr);gap:10px;align-items:end;">'
            + '<label style="display:flex;flex-direction:column;gap:5px;font-size:.68rem;font-weight:900;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);">' + esc(tr('int_filter_search')) + '<input id="intFilterName" class="mwa-msg-input" type="search" value="' + esc(currentNameRaw) + '" placeholder="' + esc(tr('int_filter_search_placeholder')) + '" style="height:38px;"></label>'
            + customDropdown('intFilterReason', tr('int_filter_reason'), tr('int_filter_all_reasons'), reasonOptions, currentReason)
            + customDropdown('intFilterStatus', tr('int_filter_status'), tr('int_filter_all_status'), statusOptions, currentStatus)
            + '<label style="display:flex;flex-direction:column;gap:5px;font-size:.68rem;font-weight:900;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);">' + esc(tr('int_filter_from')) + '<input id="intFilterFrom" class="mwa-msg-input" type="date" value="' + esc(currentFrom) + '" style="height:38px;"></label>'
            + '<label style="display:flex;flex-direction:column;gap:5px;font-size:.68rem;font-weight:900;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);">' + esc(tr('int_filter_to')) + '<input id="intFilterTo" class="mwa-msg-input" type="date" value="' + esc(currentTo) + '" style="height:38px;"></label>'
          + '</div>'
          + '<div style="font-size:.74rem;color:var(--muted);margin-top:8px;">' + filteredData.length + ' ' + esc(tr('int_filter_results')) + ' &middot; ' + total + ' ' + esc(tr('int_filter_total')) + '</div>'
          + '</div>';

        var rows = filteredData.map(function (d) {
          var dateStr = fmtDate(d.timesent);
          var statusHtml = d.status === 'sent'
            ? '<span class="int-status-ok">&#10003;</span>'
            : '<span class="int-status-err">&#10007;</span>';
          var aiHtml = d.ai_generated ? '<span class="int-ai-badge">IA</span>' : '';
    
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
    
          var result = interventionResult(d);
          var effectHtml = result.html;
    
          return '<div class="int-accordion-card">'
            + '<div class="int-main-row" id="intRow_' + d.id + '" role="button" tabindex="0" onclick="window.MWAInterventions.toggleDetail(' + d.id + ')">'
              + '<span class="int-date">' + esc(dateStr.slice(0, 10)) + '</span>'
              + '<span class="int-student-row">' + studentAvatar(d, 'int-student-avatar small') + '<span class="gr-name" onclick="event.stopPropagation();window.goToStudentProfile&&window.goToStudentProfile(' + JSON.stringify(d.student_name) + ')">' + esc(d.student_name) + '</span></span>'
              + '<span class="int-reason-cell">' + esc(translateReason(d.intervention_reason || '')) + ' ' + aiHtml + '</span>'
              + '<span class="int-teacher-cell">' + esc(d.teacher_name) + '</span>'
              + '<span class="int-result-cell">' + effectHtml + '</span>'
              + '<span class="int-actions-cell"></span>'
            + '</div>'
            + '<button type="button" class="int-delete-btn" title="' + esc(tr('chat_delete_conv')) + '" aria-label="' + esc(tr('chat_delete_conv')) + '" onclick="event.stopPropagation();window.MWAInterventions.deleteIntervention(' + d.id + ')">&#128465;</button>'
            + renderDetailRow(d, effectHtml, statusHtml)
          + '</div>';
        }).join('');
    
        var tableHtml = filteredData.length
          ? '<div class="int-accordion-list">'
              + '<div class="int-list-head">'
                + '<span>' + tr('int_col_date') + '</span>'
                + '<span>' + tr('int_col_student') + '</span>'
                + '<span>' + tr('int_col_reason') + '</span>'
                + '<span>' + tr('int_col_teacher') + '</span>'
                + '<span>' + tr('int_col_effect') + '</span>'
                + '<span></span>'
              + '</div>'
              + rows
            + '</div>'
          : '<div class="gr-empty"><div class="gr-empty-icon">&#9993;</div><p>' + esc(total ? tr('int_no_filter_results') : tr('int_no_data')) + '</p></div>';
    
        // Report actions.
        var exportBtnHtml = '<div style="display:flex;justify-content:flex-end;align-items:center;gap:10px;margin-bottom:12px;">'
          + '<button id="intClearFilters" class="btn-ghost" style="height:38px;font-size:.78rem;white-space:nowrap;margin:0;display:inline-flex;align-items:center;justify-content:center;">' + esc(tr('int_filter_clear')) + '</button>'
          + (filteredData.length ? '<button id="intExportBtn" style="height:38px;background:linear-gradient(135deg,#3ecf8e,#13794c);color:#fff;border:none;border-radius:12px;padding:9px 18px;font-family:inherit;font-size:.82rem;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:.4rem;">&#128202; ' + tr('int_export') + '</button>' : '')
          + '</div>';

        Store.renderHtml(el, kpisHtml + filtersHtml + exportBtnHtml + tableHtml);

        // Export button handler
        var exportBtn = document.getElementById('intExportBtn');
        if (exportBtn) {
          exportBtn.addEventListener('click', function () { exportContacts(filteredData, logs); });
        }
        Array.prototype.slice.call(el.querySelectorAll('.int-filter-dd-toggle')).forEach(function (btn) {
          btn.addEventListener('click', function (ev) {
            ev.preventDefault();
            ev.stopPropagation();
            var box = btn.closest('.int-filter-dd');
            Array.prototype.slice.call(el.querySelectorAll('.int-filter-dd.is-open')).forEach(function (openBox) {
              if (openBox !== box) openBox.classList.remove('is-open');
            });
            if (box) box.classList.toggle('is-open');
          });
        });
        Array.prototype.slice.call(el.querySelectorAll('.int-filter-dd-option')).forEach(function (opt) {
          opt.addEventListener('click', function (ev) {
            ev.preventDefault();
            ev.stopPropagation();
            var box = opt.closest('.int-filter-dd');
            var input = box ? box.querySelector('input[type="hidden"]') : null;
            var label = box ? box.querySelector('.int-filter-dd-toggle span') : null;
            if (input) input.value = opt.getAttribute('data-value') || '';
            if (label) label.textContent = opt.textContent || '';
            if (box) box.classList.remove('is-open');
            if (input) input.dispatchEvent(new Event('change', {bubbles: true}));
          });
        });
        document.addEventListener('click', function closeIntDropdowns() {
          if (!document.body.contains(el)) {
            document.removeEventListener('click', closeIntDropdowns);
            return;
          }
          Array.prototype.slice.call(el.querySelectorAll('.int-filter-dd.is-open')).forEach(function (box) {
            box.classList.remove('is-open');
          });
        });
        ['intFilterName', 'intFilterReason', 'intFilterStatus', 'intFilterFrom', 'intFilterTo'].forEach(function (id) {
          var filterEl = document.getElementById(id);
          if (!filterEl) return;
          filterEl.addEventListener(id === 'intFilterName' ? 'input' : 'change', function () {
            clearTimeout(window._mwaIntFilterTimer);
            window._mwaIntFilterTimer = setTimeout(renderInterventionsPage, id === 'intFilterName' ? 520 : 0);
          });
        });
        if (activeFilterId) {
          var activeFilter = document.getElementById(activeFilterId);
          if (activeFilter) {
            activeFilter.focus();
            try {
              if (typeof activeFilter.setSelectionRange === 'function') {
                activeFilter.setSelectionRange(activeFilterPos, activeFilterPos);
              }
            } catch (e) {}
          }
        }
        var clearBtn = document.getElementById('intClearFilters');
        if (clearBtn) {
          clearBtn.addEventListener('click', function () {
            ['intFilterName', 'intFilterReason', 'intFilterStatus', 'intFilterFrom', 'intFilterTo'].forEach(function (id) {
              var filterEl = document.getElementById(id);
              if (filterEl) filterEl.value = '';
            });
            renderInterventionsPage();
          });
        }
      }
    
      /* Intervention detail */
      function renderDetailRow(d, effectHtml, statusHtml) {
        var note = d.teacher_note || loadNote(d.id);
        var plainMessage = String(d.message || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '');
        var reason = translateReason(d.intervention_reason || '');
        var channel = d.send_type === 'email' ? tr('msg_channel_email') : tr('msg_channel_moodle');
        var avatar = studentAvatar(d, 'int-detail-avatar');
        return '<div class="int-detail-row-collapsible" id="intDetailRow_' + d.id + '">'
            + '<div class="int-collapse-panel">'
              + '<div class="int-collapse-top">'
                + '<div>'
                  + '<div class="int-collapse-eyebrow">' + esc(tr('int_view_details')) + '</div>'
                  + '<div class="int-collapse-title">&#9993; ' + esc(d.subject || tr('int_export_subject')) + '</div>'
                + '</div>'
                + '<button class="btn-ghost int-collapse-close" onclick="event.stopPropagation();window.MWAInterventions.toggleDetail(' + d.id + ')">' + esc(tr('int_collapse')) + '</button>'
              + '</div>'
              + '<div class="int-detail-grid">'
                + '<div class="int-detail-chip int-detail-student-chip"><div class="int-detail-person">' + avatar + '<div><span>' + esc(tr('int_col_student')) + '</span><strong>' + esc(d.student_name || '') + '</strong><small>' + esc(d.student_email || tr('msg_no_registered_email')) + '</small></div></div></div>'
                + '<div class="int-detail-chip"><span>' + esc(tr('int_col_teacher')) + '</span><strong>' + esc(d.teacher_name || '') + '</strong><small>' + esc(fmtDate(d.timesent)) + '</small></div>'
                + '<div class="int-detail-chip"><span>' + esc(tr('msg_detail_reason')) + '</span><strong>' + esc(reason) + (d.ai_generated ? ' <span class="int-ai-badge">IA</span>' : '') + '</strong><small>' + esc(channel) + '</small></div>'
                + '<div class="int-detail-chip int-status-effect-chip"><span>' + esc(tr('int_col_effect')) + '</span><strong>' + effectHtml + '</strong></div>'
              + '</div>'
              + '<div class="int-detail-columns">'
                + '<div class="int-detail-message-card">'
                  + '<div class="int-detail-label">' + esc(tr('msg_body_label')) + '</div>'
                  + '<div class="int-detail-msg">' + esc(plainMessage) + '</div>'
                + '</div>'
                + '<div class="int-note-card ' + (note ? 'is-open' : '') + '" id="intNoteCard_' + d.id + '">'
                  + '<div class="int-note-head">'
                    + '<div><div class="int-detail-label">' + esc(tr('int_notes_title')) + '</div><div class="int-note-sub">' + esc(tr('int_notes_subtitle')) + '</div></div>'
                    + '<button class="btn-ghost" onclick="event.stopPropagation();window.MWAInterventions.toggleNotes(' + d.id + ')">&#9998; ' + esc(tr('int_notes_btn')) + '</button>'
                  + '</div>'
                  + '<textarea id="intNoteText_' + d.id + '" class="int-note-textarea" onclick="event.stopPropagation();" placeholder="' + esc(tr('int_notes_placeholder')) + '">' + esc(note) + '</textarea>'
                  + '<div class="int-note-actions"><span id="intNoteSaved_' + d.id + '" class="int-note-saved"></span><button class="btn-accent" onclick="event.stopPropagation();window.MWAInterventions.saveNote(' + d.id + ')">' + esc(tr('int_notes_save')) + '</button></div>'
                + '</div>'
              + '</div>'
            + '</div>'
        + '</div>';
      }

      function toggleDetail(id) {
        var row = document.getElementById('intDetailRow_' + id);
        var main = document.getElementById('intRow_' + id);
        if (!row) { return; }
        var shouldOpen = !row.classList.contains('is-open');
        document.querySelectorAll('#interventionsWrap .int-detail-row-collapsible.is-open').forEach(function (el) {
          el.classList.remove('is-open');
        });
        document.querySelectorAll('#interventionsWrap .int-main-row.is-open').forEach(function (el) {
          el.classList.remove('is-open');
        });
        if (shouldOpen) {
          row.classList.add('is-open');
          if (main) { main.classList.add('is-open'); }
        }
      }

      function toggleNotes(id) {
        var card = document.getElementById('intNoteCard_' + id);
        if (!card) { return; }
        card.classList.toggle('is-open');
        if (card.classList.contains('is-open')) {
          var textarea = document.getElementById('intNoteText_' + id);
          if (textarea) { textarea.focus(); }
        }
      }

      function showDetail(id) {
        toggleDetail(id);
        return;
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
              + '<div><div style="font-weight:900;font-size:.92rem;">&#9993; ' + esc(d.subject) + '</div>'
                + '<div style="font-size:.72rem;color:var(--muted);margin-top:2px;">' + fmtDate(d.timesent) + ' &middot; ' + (d.status === 'sent' ? esc(tr('int_status_sent')) : esc(tr('int_status_error'))) + '</div>'
              + '</div>'
              + '<button class="mwa-msg-close" onclick="document.getElementById(\'intDetailOverlay\').remove()">&times;</button>'
            + '</div>'
            + '<div class="int-detail-body">'
              + '<div class="int-detail-row"><div class="int-detail-label">Aluno</div><div class="int-detail-val">' + esc(d.student_name) + ' &middot; <span style="color:var(--muted);">' + esc(d.student_email) + '</span></div></div>'
              + '<div class="int-detail-row"><div class="int-detail-label">Professor</div><div class="int-detail-val">' + esc(d.teacher_name) + '</div></div>'
              + '<div class="int-detail-row"><div class="int-detail-label">' + tr('msg_detail_reason') + '</div><div class="int-detail-val">' + esc(translateReason(d.intervention_reason || '')) + (d.ai_generated ? ' <span class="int-ai-badge">IA</span>' : '') + '</div></div>'
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
    
      /* ============================================================
         TIMELINE IN THE STUDENT PROFILE
      ============================================================ */
      function renderStudentTimeline(studentName, containerId) {
        var el = document.getElementById(containerId);
        if (!el) return;

        var logs = (window.MWADashboard && window.MWADashboard.state && window.MWADashboard.state.logs) || [];
        var msgs = INTERVENTIONS.filter(function (d) { return norm(d.student_name) === norm(studentName) && d.status === 'sent'; });
        var previousSelect = el.querySelector('[data-sp-timeline-days]');
        var period = previousSelect ? String(previousSelect.value || '30') : String(el.dataset.timelineDays || '30');
        el.dataset.timelineDays = period;
        var cutoff = period === 'all' ? 0 : Date.now() - Number(period || 30) * 86400000;

        function eventTs(r) {
          if (r._ts) return Number(r._ts) * 1000;
          if (r.timecreated) return Number(r.timecreated) * 1000;
          var s = norm(r.hora || r.time || r.date);
          var m = s.match(/(\d{2})\/(\d{2})\/(\d{2}),\s*(\d{2}):(\d{2})(?::(\d{2}))?/);
          if (m) return new Date(2000 + Number(m[3]), Number(m[2]) - 1, Number(m[1]), Number(m[4]), Number(m[5]), Number(m[6] || 0)).getTime();
          return 0;
        }

        function eventKind(r) {
          var ev = norm(r.nomedoevento || r.eventname || r.action).toLowerCase();
          var comp = norm(r.componente || r.component || r._modtype).toLowerCase();
          if (ev.indexOf('submit') !== -1 || ev.indexOf('submitted') !== -1 ||
              ev.indexOf('post created') !== -1 || ev.indexOf('discussion created') !== -1 ||
              ev.indexOf('attempt submitted') !== -1 || ev.indexOf('completed') !== -1 ||
              ev.indexOf('completion') !== -1 || ev.indexOf('graded') !== -1) {
            return 'submit';
          }
          if (comp === 'message' || ev.indexOf('message') !== -1) return 'msg';
          return 'access';
        }

        function isGenericCourseView(r) {
          var ctx = norm(r.contextodoevento || r.eventcontext || r.context).toLowerCase();
          var ev = norm(r.nomedoevento || r.eventname || r.action).toLowerCase();
          return ctx === 'course module viewed' || ev === 'course module viewed';
        }

        function eventTitle(kind) {
          if (kind === 'msg') return tr('sp_tl_message');
          if (kind === 'submit') return tr('sp_tl_completion');
          return tr('sp_tl_access');
        }

        function eventContext(r) {
          return norm(r.contextodoevento || r.eventcontext || r.context || r.coursename || r.nomedoevento || r.action);
        }

        var logEvents = [];
        var seen = {};
        logs.forEach(function (r) {
          if (norm(r.nomecompleto) !== norm(studentName)) return;
          if (isGenericCourseView(r)) return;
          var ts = eventTs(r);
          if (!ts || ts < cutoff) return;
          var kind = eventKind(r);
          var ctx = eventContext(r);
          var key = [ts, kind, ctx, norm(r.nomedoevento)].join('|');
          if (seen[key]) return;
          seen[key] = true;
          logEvents.push({ ts: Math.round(ts / 1000), type: kind, ctx: ctx });
        });

        var allEvents = logEvents.concat(msgs.map(function (m) {
          return { ts: m.timesent, type: 'msg', ctx: m.subject, reason: m.intervention_reason };
        }).filter(function(m) {
          return !cutoff || Number(m.ts || 0) * 1000 >= cutoff;
        }));
        allEvents.sort(function (a, b) { return b.ts - a.ts; });

        var controls = '<div class="sp-timeline-tools">'
          + '<div class="sp-timeline-legend">'
          + '<span><i class="sp-legend-dot access"></i>' + esc(tr('sp_tl_access')) + '</span>'
          + '<span><i class="sp-legend-dot submit"></i>' + esc(tr('sp_tl_completion')) + '</span>'
          + '<span><i class="sp-legend-dot msg"></i>' + esc(tr('sp_tl_message')) + '</span>'
          + '</div>'
          + '<label class="sp-timeline-filter"><span>' + esc(tr('sp_tl_period')) + '</span>'
          + '<select data-sp-timeline-days onchange="this.closest(\'[id]\').dataset.timelineDays=this.value;window.MWAInterventions&&window.MWAInterventions.renderStudentTimeline('
          + "'" + esc(studentName) + "','" + esc(containerId) + "'"
          + ')">'
          + '<option value="7"' + (period === '7' ? ' selected' : '') + '>' + esc(tr('sp_tl_7d')) + '</option>'
          + '<option value="30"' + (period === '30' ? ' selected' : '') + '>' + esc(tr('sp_tl_30d')) + '</option>'
          + '<option value="90"' + (period === '90' ? ' selected' : '') + '>' + esc(tr('sp_tl_90d')) + '</option>'
          + '<option value="all"' + (period === 'all' ? ' selected' : '') + '>' + esc(tr('sp_tl_all')) + '</option>'
          + '</select></label></div>';

        if (!allEvents.length) {
          Store.renderHtml(el, controls + '<div class="sp-card-empty">' + esc(tr('no_data')) + '</div>');
          return;
        }

        var icons = { access: '&#128309;', submit: '&#9989;', msg: '&#9993;', inactive: '&#9888;' };
        var cls   = { access: 'access', submit: 'submit', msg: 'msg', inactive: 'inactive' };

        var hasMore = allEvents.length > 5;
        var html = controls + '<div class="sp-timeline">' + allEvents.map(function (ev, idx) {
          var dateStr = fmtDate(ev.ts);
          var icon    = icons[ev.type] || '&bull;';
          var clsn    = cls[ev.type] || '';
          var title   = eventTitle(ev.type);
          var sub     = esc(ev.ctx || (ev.reason ? tr('int_timeline_reason') + ': ' + ev.reason : ''));
          return '<div class="sp-tl-item sp-tl-' + clsn + (idx >= 5 ? ' sp-tl-extra' : '') + '"' + (idx >= 5 ? ' style="display:none;"' : '') + '>'
            + '<div class="sp-tl-icon ' + clsn + '">' + icon + '</div>'
            + '<div class="sp-tl-content"><div class="sp-tl-title">' + title + '</div>'
              + (sub ? '<div class="sp-tl-sub">' + sub + '</div>' : '')
            + '</div>'
            + '<div class="sp-tl-date">' + esc(dateStr) + '</div>'
            + '</div>';
        }).join('') + '</div>' + (hasMore
          ? '<button type="button" class="sp-tl-more" data-open="0" data-more="' + esc(tr('sp_tl_show_more')) + '" data-less="' + esc(tr('sp_tl_show_less')) + '" onclick="var box=this.previousElementSibling;var open=this.getAttribute(&quot;data-open&quot;)===&quot;1&quot;;box.querySelectorAll(&quot;.sp-tl-extra&quot;).forEach(function(x){x.style.display=open?&quot;none&quot;:&quot;flex&quot;;});this.setAttribute(&quot;data-open&quot;,open?&quot;0&quot;:&quot;1&quot;);this.textContent=open?this.getAttribute(&quot;data-more&quot;):this.getAttribute(&quot;data-less&quot;);">' + esc(tr('sp_tl_show_more')) + '</button>'
          : '');

        Store.renderHtml(el, html);
      }
      /* Quick message button */
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
        if (window.MWAActionCenter && typeof window.MWAActionCenter.openBulkModal === 'function') {
          window.MWAActionCenter.openBulkModal([{name: studentName, email: studentEmail || '', userid: studentId || 0}], reason ? {reason: reason} : null);
          return;
        }
        openSendMessage(studentName, studentEmail || '', studentId || 0, reason || '');
      }
    
      /* Populate the student select in the Interventions tab */
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
        Store.renderHtml(sel, '<option value="">' + tr('msg_select_student') + '</option>'
          + names.map(function (n) {
              return '<option value="' + esc(n) + '" data-email="' + esc(seen[n]) + '">' + esc(n) + '</option>';
            }).join(''));
      }
    
      /* Send to the selected student */
      function sendToSelected() {
        var sel = document.getElementById('intStudentSel');
        if (!sel || !sel.value) { toast(tr('msg_select_student_required'), 'error'); return; }
        var name  = sel.value;
        var email = (sel.options[sel.selectedIndex] && sel.options[sel.selectedIndex].dataset.email) || '';
        openSendMessage(name, email, 0, '');
      }
    
      /* Tab render */
      function render() {
        populateStudentSelect();
        loadInterventions();
      }
    
      /* Delete intervention */
      function deleteIntervention(id) {
        if (!confirm(tr('msg_delete_confirm'))) return;
        callAMD('block_mwa_dashboard_delete_intervention', { id: id }, function (res) {
          if (res && res.success) {
            INTERVENTIONS = INTERVENTIONS.filter(function (d) { return d.id !== id; });
            renderInterventionsPage();
            toast(tr('msg_deleted'), 'success');
          } else {
            toast(tr('msg_delete_error'), 'error');
          }
        }, function () {
          toast(tr('msg_conn_error'), 'error');
        });
      }
    
      /* openByEl: reads data-sname and data-semail from the clicked element */
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
        toggleDetail:            toggleDetail,
        toggleNotes:             toggleNotes,
        saveNote:                saveNote,
        renderStudentTimeline:   renderStudentTimeline,
        getData:                 function () { return INTERVENTIONS; },
    _afterSend:              null
      };
    
    })();

    return window.MWAInterventions;
});
