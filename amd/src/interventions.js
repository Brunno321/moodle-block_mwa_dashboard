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
      function icon(name) {
        return '<svg class="mwa-ui-icon" aria-hidden="true"><use href="#mwa-icon-' + name + '"></use></svg>';
      }
      function snapshotTitle() {
        var config = Store.getConfig ? Store.getConfig() : {};
        var language = String(config.language || '').toLowerCase();
        return language.indexOf('pt') === 0 ? 'Situação no momento da intervenção' : tr('snapshot_title');
      }
      function esc(v) {
        return String(v === undefined || v === null ? '' : v)
          .replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
          });
      }
      function decodeHtmlEntities(text) {
        var parser = new DOMParser();
        var parsed = parser.parseFromString('<!doctype html><body>' + String(text || ''), 'text/html');
        return parsed.body.textContent || '';
      }
      function interventionMessageText(message, removeEmbeddedTargets) {
        var text = String(message || '');
        if (removeEmbeddedTargets) {
          text = text.replace(/<div\s+class=["']mwa-message-targets["'][^>]*>[\s\S]*?<\/div>/gi, '');
        }
        text = decodeHtmlEntities(text)
          .replace(/\r\n|\r/g, '\n')
          .replace(/<br\s*\/?>/gi, '\n')
          .replace(/<\/p\s*>/gi, '\n\n')
          .replace(/<p\b[^>]*>/gi, '')
          .replace(/<\/div\s*>/gi, '\n')
          .replace(/<div\b[^>]*>/gi, '')
          .replace(/<li\b[^>]*>/gi, '- ')
          .replace(/<\/li\s*>/gi, '\n')
          .replace(/<\/(?:ul|ol|tr|table)\s*>/gi, '\n')
          .replace(/<[^>]+>/g, ' ');
        text = text
          .replace(/[ \t]+\n/g, '\n')
          .replace(/\n[ \t]+/g, '\n')
          .replace(/[ \t]{2,}/g, ' ')
          .replace(/\n{3,}/g, '\n\n')
          .replace(/([^\n])\s*(Itens acompanhados)(?=[:A-Z])/i, '$1\n\n$2')
          .replace(/(Itens acompanhados:?)(?=\S)/i, '$1\n')
          .trim();
        return text;
      }
      function norm(v) { return (v === undefined || v === null) ? '' : String(v).trim(); }
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

      /* Pagination state */
      var PAGE_SIZE = 10;
      var CURRENT_PAGE = 1;

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
          never: {
            label:   tr('msg_reason_never'),
            subject: tr('tpl_never_subject'),
            body:    tr('tpl_never_body')
          },
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
          difficulty: {
            label:   tr('msg_reason_difficulty'),
            subject: tr('tpl_difficulty_subject'),
            body:    tr('tpl_difficulty_body')
          },
          other: {
            label:   tr('msg_reason_other'),
            subject: tr('tpl_other_subject'),
            body:    tr('tpl_other_body')
          }
        };
      }

      function getTemplateForReason(reason) {
        var templates = getTemplates();
        var bucket = reasonBucket(reason);
        var map = {
          never: templates.never,
          low: templates.engagement,
          pending: templates.submission,
          difficult: templates.difficulty,
          other: templates.other
        };
        return map[bucket] || null;
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
    
      function parseGeneratedMessage(text) {
        var source = String(text || '').replace(/\r\n|\r/g, '\n').trim();
        var marker = '(?:SUBJECT|ASSUNTO|MESSAGE|MENSAGEM)';
        var subject = '';
        var body = '';
        var subjMatch = source.match(new RegExp('^\\s*(?:SUBJECT|ASSUNTO)\\s*:\\s*(.*?)\\s*$', 'mi'));
        if (subjMatch) {
          subject = subjMatch[1].trim();
        }
        var msgMatch = new RegExp('^\\s*(?:MESSAGE|MENSAGEM)\\s*:\\s*', 'mi').exec(source);
        if (msgMatch) {
          body = source.slice(msgMatch.index + msgMatch[0].length);
          var next = body.search(new RegExp('\\n\\s*' + marker + '\\s*:', 'i'));
          if (next !== -1) {
            body = body.slice(0, next);
          }
        } else {
          body = source;
        }
        body = body
          .replace(new RegExp('^\\s*(?:SUBJECT|ASSUNTO)\\s*:\\s*.*(?:\\n|$)', 'gmi'), '')
          .replace(new RegExp('^\\s*(?:MESSAGE|MENSAGEM)\\s*:\\s*', 'gmi'), '')
          .replace(/\n{3,}/g, '\n\n')
          .trim();
        return {subject: subject, message: body};
      }

      /* Generate message with AI */
      function generateWithAI(studentName, studentId) {
        var aiBtn  = document.getElementById('mwaMsgAIBtn');
        var subj   = document.getElementById('mwaMsgSubject');
        var body   = document.getElementById('mwaMsgBody');
        var reason = (document.getElementById('mwaMsgReason') || {}).value || '';
        var type   = selectedSendType();

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

          var parsed = parseGeneratedMessage(text);

          if (parsed.subject && subj) subj.value = parsed.subject;
          if (parsed.message && body) body.value  = parsed.message;

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
          { v: 'Nunca acessou',          l: '\uD83D\uDEAB ' + tr('msg_reason_never') },
          { v: 'Baixa participação',     l: '\uD83D\uDCC9 ' + tr('msg_reason_low_participation') },
          { v: 'Pendência acadêmica',    l: '\uD83D\uDCCB ' + tr('msg_reason_academic_pending') },
          { v: 'Dificuldade acadêmica',  l: '\uD83D\uDCCA ' + tr('msg_reason_difficulty') },
          { v: 'Outro',              l: '\uD83D\uDCAC ' + tr('msg_reason_other') },
        ];
    
        Store.renderHtml(overlay, '<div class="mwa-msg-modal">'
            + '<div class="mwa-msg-head">'
              + '<div class="mwa-msg-head-avatar" style="background:' + bg + ';">' + esc(ini) + '</div>'
              + '<div>'
                + '<div class="mwa-msg-head-name">' + icon('mail') + ' ' + tr('msg_modal_title') + ' ' + esc(studentName) + '</div>'
                + '<div class="mwa-msg-head-sub">' + esc(studentEmail || tr('msg_no_registered_email')) + '</div>'
              + '</div>'
              + '<button class="mwa-msg-close" onclick="document.getElementById(\'mwaMsgOverlay\').remove()">&times;</button>'
            + '</div>'
            + '<div class="mwa-msg-body">'
    
              + '<div>'
                + '<div class="mwa-msg-label">' + tr('msg_send_type_label') + '</div>'
                + '<div style="display:flex;gap:8px;">'
                  + '<button id="mwaSendTypeMoodle" class="mwa-msg-tpl-btn" style="border-color:var(--blue);color:var(--blue);font-weight:900;" onclick="window.MWAInterventions._toggleSendChannel(\'moodle\')">&#128172; ' + tr('msg_type_moodle_btn') + '</button>'
                  + '<button id="mwaSendTypeEmail" class="mwa-msg-tpl-btn" onclick="window.MWAInterventions._toggleSendChannel(\'email\')">' + icon('mail') + ' ' + tr('msg_type_email_btn') + '</button>'
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

              + '<div id="mwaSnapshotSituationWrap" style="display:none;">'
                + '<div class="mwa-msg-label">' + tr('snapshot_situation_label') + '</div>'
                + '<textarea id="mwaSnapshotSituation" class="mwa-msg-textarea mwa-snapshot-short" placeholder="' + tr('snapshot_situation_placeholder') + '"></textarea>'
              + '</div>'

              + '<div>'
                + '<div class="mwa-msg-label">' + tr('snapshot_objective_label') + '</div>'
                + '<input id="mwaSnapshotObjective" class="mwa-msg-input" type="text">'
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
                + 'onclick="window.MWAInterventions.doSend(this)">' + icon('mail') + ' ' + tr('msg_send_btn') + '</button>'
            + '</div>'
          + '</div>');
    
        (document.getElementById('block-mwa-dashboard-app') || document.body).appendChild(overlay);

        var aiBtn = document.getElementById('mwaMsgAIBtn');
        if (aiBtn) {
          aiBtn.addEventListener('click', function() {
            generateWithAI(studentName, studentId);
          });
        }
    
        var reasonSelect = document.getElementById('mwaMsgReason');
        var suggestedObjectives = {
          never: tr('snapshot_objective_never'),
          low: tr('snapshot_objective_low'),
          pending: tr('snapshot_objective_pending'),
          difficult: tr('snapshot_objective_difficult'),
          other: ''
        };
        function updateSnapshotFields() {
          var selected = reasonSelect ? reasonSelect.value : '';
          var bucket = reasonBucket(selected);
          var situationWrap = document.getElementById('mwaSnapshotSituationWrap');
          var objectiveInput = document.getElementById('mwaSnapshotObjective');
          if (situationWrap) situationWrap.style.display = bucket === 'other' ? 'block' : 'none';
          if (objectiveInput) objectiveInput.value = suggestedObjectives[bucket] || '';
        }
        if (reasonSelect) {
          reasonSelect.addEventListener('change', function () {
            updateSnapshotFields();
            var tpl = getTemplateForReason(reasonSelect.value);
            if (tpl) _applyTpl(tpl, studentName, false);
          });
        }

        if (reason) {
          var presetTpl = getTemplateForReason(reason);
          if (presetTpl) _applyTpl(presetTpl, studentName, false);
        }
        updateSnapshotFields();
    
        var esc_key = function (e) {
          if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', esc_key); }
        };
        document.addEventListener('keydown', esc_key);
      }
    
      /* Toggle send channels */
      var SEND_CHANNELS = { moodle: true, email: false };
      function selectedSendType() {
        return SEND_CHANNELS.moodle && SEND_CHANNELS.email ? 'both' :
          (SEND_CHANNELS.email ? 'email' : (SEND_CHANNELS.moodle ? 'moodle' : ''));
      }
      function sendChannelLabel(type) {
        return type === 'both'
          ? tr('msg_channel_moodle') + ' + ' + tr('msg_channel_email')
          : (type === 'email' ? tr('msg_channel_email') : tr('msg_channel_moodle'));
      }
      function updateSendChannelButtons() {
        var bm = document.getElementById('mwaSendTypeMoodle');
        var be = document.getElementById('mwaSendTypeEmail');
        var hint = document.getElementById('mwaSendTypeHint');
        if (bm) { bm.style.borderColor = SEND_CHANNELS.moodle ? 'var(--blue)' : ''; bm.style.color = SEND_CHANNELS.moodle ? 'var(--blue)' : ''; bm.style.fontWeight = SEND_CHANNELS.moodle ? '900' : ''; }
        if (be) { be.style.borderColor = SEND_CHANNELS.email ? 'var(--green)' : ''; be.style.color = SEND_CHANNELS.email ? 'var(--green)' : ''; be.style.fontWeight = SEND_CHANNELS.email ? '900' : ''; }
        if (hint) {
          var type = selectedSendType();
          hint.textContent = type === 'both'
            ? sendChannelLabel(type)
            : (type === 'email' ? tr('msg_type_email_hint') : tr('msg_type_moodle_hint'));
        }
      }
      function _toggleSendChannel(type) {
        SEND_CHANNELS[type] = !SEND_CHANNELS[type];
        updateSendChannelButtons();
      }
      function _setSendType(type) {
        SEND_CHANNELS.moodle = type === 'moodle' || type === 'both';
        SEND_CHANNELS.email = type === 'email' || type === 'both';
        updateSendChannelButtons();
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
        var situation = (document.getElementById('mwaSnapshotSituation') || {}).value || '';
        var objective = (document.getElementById('mwaSnapshotObjective') || {}).value || '';
        var sendType = selectedSendType();
    
        if (!subject.trim() || !message.trim()) {
          toast(tr('msg_required_subject_body'), 'error');
          return;
        }
        if (!sendType) {
          toast(tr('msg_send_type_label'), 'error');
          return;
        }
        if (reasonBucket(reason) === 'other' && (!situation.trim() || !objective.trim())) {
          toast(tr('snapshot_other_required'), 'error');
          return;
        }
        if ((sendType === 'email' || sendType === 'both') && !semail && !userId) {
          toast(tr('msg_no_email'), 'error');
          return;
        }
    
        var btn = document.getElementById('mwaMsgSendBtn');
        if (btn) { btn.disabled = true; btn.textContent = tr('msg_sending'); }
    
        var courseid = parseInt((Store.getConfig().courseid || 0), 10);
        message = personalizeMessage(message, sname, false);
        subject = personalizeMessage(subject, sname, false);
        var msgHtml  = esc(message).replace(/\r\n|\r|\n/g, '<br>');
    
        callAMD('block_mwa_dashboard_send_message', {
          courseid:            courseid,
          userid:              userId,
          subject:             subject,
          message:             msgHtml,
          intervention_reason: reason,
          ai_generated:        0,
          send_type:           sendType,
          student_email:       semail,
          snapshot_situation:  situation,
          snapshot_objective:  objective
        }, function (res) {
          var overlay = document.getElementById('mwaMsgOverlay');
          if (overlay) overlay.remove();
          if (res.success) {
            var channel = sendChannelLabel(sendType);
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

      /* Classify reason into one of the 5 motivo buckets */
      function reasonBucket(reason) {
        var r = norm(reason).replace(/\s*\[(moodle|email)\]\s*$/i, '');
        if (!r) return 'other';
        var rLow = r.toLowerCase();
        if (rLow.normalize) rLow = rLow.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        if (rLow.indexOf('nunca') >= 0 || rLow === 'never accessed') return 'never';
        if (rLow.indexOf('engajamento') >= 0 || rLow.indexOf('particip') >= 0 ||
            rLow.indexOf('engagement') >= 0 || rLow.indexOf('inativ') >= 0 ||
            rLow.indexOf('evas') >= 0 || rLow.indexOf('reeng') >= 0 ||
            rLow.indexOf('sem acesso') >= 0 || rLow.indexOf('no access') >= 0) return 'low';
        if (rLow.indexOf('tarefa') >= 0 || rLow.indexOf('pendenc') >= 0 ||
            rLow.indexOf('entrega') >= 0 || rLow.indexOf('task') >= 0 ||
            rLow.indexOf('pending') >= 0) return 'pending';
        if (rLow.indexOf('nota') >= 0 || rLow.indexOf('dificul') >= 0 ||
            rLow.indexOf('desempenho') >= 0 || rLow.indexOf('grade') >= 0 ||
            rLow.indexOf('academ') >= 0) return 'difficult';
        return 'other';
      }

      function effectiveReason(d) {
        return norm((d && (d.snapshot_reason || d.snapshot_situation || d.intervention_reason)) || '');
      }

      function trackedTargets(d) {
        try {
          var parsed = JSON.parse((d && d.target_items) || '[]');
          var targetType = norm(d && d.target_type);
          return Array.isArray(parsed) ? parsed.filter(function(item) {
            if (!item || !item.name) return false;
            if (targetType === 'activity_completion') {
              return parseInt(item.seq || 0, 10) > 0;
            }
            return true;
          }) : [];
        } catch (e) {
          return [];
        }
      }

      /* Estado atual dos itens acompanhados. O snapshot permanece historico;
         esta leitura usa somente dados atuais do Moodle. */
      function trackedProgress(d) {
        var dashboardState = (window.MWADashboard && window.MWADashboard.state) || {};
        var logs = dashboardState.logs || [];
        var grades = dashboardState.grades || [];
        var targets = trackedTargets(d);
        var targetType = norm(d.target_type || '');
        var studentId = Number(d.userid || 0);
        var studentName = norm(d.student_name).toLowerCase();
        var studentEmail = norm(d.student_email).toLowerCase();
        var gradeRow = null;

        function lowerText(value) {
          var text = norm(value).toLowerCase();
          return text.normalize ? text.normalize('NFD').replace(/[\u0300-\u036f]/g, '') : text;
        }

        grades.some(function(g) {
          if (!g || g.__mwa_type__ === 'activity_names') return false;
          var first = norm(g['First name'] || g.Nome || g.firstname || '');
          var last = norm(g['Last name'] || g.Sobrenome || g.lastname || '');
          var name = norm(g.student_name || g.name || g.nomecompleto || g.Aluno || (first + ' ' + last)).toLowerCase();
          var email = norm(g.Email || g.email || '').toLowerCase();
          var gradeUserId = Number(g['User ID'] || g.userid || 0);
          if ((studentId && gradeUserId === studentId) || (studentEmail && email === studentEmail) ||
              (studentName && name === studentName)) {
            gradeRow = g;
            return true;
          }
          return false;
        });

        function matchesStudent(log) {
          var logUserId = Number(log._userid || log.userid || log.relateduserid || 0);
          if (studentId && logUserId) return studentId === logUserId;
          var logName = norm(log.nomecompleto || log.student_name || log.userfullname).toLowerCase();
          var logEmail = norm(log.email).toLowerCase();
          return (studentEmail && logEmail && studentEmail === logEmail) ||
            (studentName && logName && studentName === logName);
        }
        function timestamp(log) { return log._ts ? Number(log._ts) : Number(log.timecreated || 0); }
        function cmid(log) {
          return parseInt(log.cmid || log._cmid || log.contextinstanceid || log.contextinstance ||
            log.coursemoduleid || log.moduleid || 0, 10) || 0;
        }
        function contextName(log) {
          return lowerText(log.contextodoevento || log.eventcontext || log.context || log.nomedoevento || log.action);
        }
        function eventText(log) {
          return lowerText([log.nomedoevento, log.eventname, log.action, log.componente, log.component,
            log._modtype, log.modtype, log.module, log.contextodoevento, log.eventcontext, log.context].join(' '));
        }
        function isCompletion(log) {
          var text = eventText(log);
          return /submit|submitted|submission|upload|attempt|tentativa|submet|envio|enviad|entrega|post created|discussion created|postagem|completed|completion|conclu|graded|grade|avaliad|nota/.test(text);
        }
        function isAccess(log) {
          return /view|viewed|visualiz|open|abert|access|acess|read|leitur/.test(eventText(log));
        }
        function isResource(target) {
          if (targetType === 'resource_access') return true;
          var type = lowerText(target && target.type);
          if (type === 'resource') return true;
          var mod = lowerText(target && (target.mod || target.modtype || target.module));
          if (['page', 'url', 'resource', 'book', 'folder', 'imscp', 'label'].indexOf(mod) >= 0) return true;
          if (type === 'activity') return false;
          return false;
        }
        function hasCurrentCompletion(target) {
          if (!gradeRow || !target || !target.seq || isResource(target)) return false;
          var mod = lowerText(target.mod || target.modtype || target.module || '');
          var hasCurrent = Object.prototype.hasOwnProperty.call(gradeRow, 'act_current_' + target.seq);
          var current = hasCurrent ? (parseInt(gradeRow['act_current_' + target.seq] || 0, 10) || 0) : null;
          var key = 'act_' + target.seq;
          var value = gradeRow[key];
          var text = String(value === undefined || value === null ? '' : value).trim();
          var numeric = parseFloat(text.replace(',', '.'));
          var hasPositiveGrade = Object.prototype.hasOwnProperty.call(gradeRow, key) &&
            text !== '' && text !== '-' && !isNaN(numeric) && numeric > 0;
          if (hasCurrent) {
            return mod === 'forum' ? current > 0 : (current > 0 || hasPositiveGrade);
          }
          return hasPositiveGrade;
        }
        function touchedAfter(target) {
          var targetName = lowerText(target && target.name);
          var targetCmid = parseInt((target && target.cmid) || 0, 10) || 0;
          var resource = isResource(target);
          return logs.some(function(log) {
            if (!matchesStudent(log)) return false;
            var ts = timestamp(log);
            if (!ts || ts <= Number(d.timesent || 0)) return false;
            if (resource && !isAccess(log)) return false;
            if (!resource && !isCompletion(log)) return false;
            return (targetCmid && cmid(log) === targetCmid) ||
              (targetName && contextName(log).indexOf(targetName) >= 0);
          });
        }

        var doneFlags = targets.map(function(target) {
          return hasCurrentCompletion(target) || touchedAfter(target);
        });
        var done = doneFlags.filter(Boolean).length;
        var firstAccess = null;
        logs.forEach(function(log) {
          if (!matchesStudent(log)) return;
          var ts = timestamp(log);
          if (ts > Number(d.timesent || 0) && (firstAccess === null || ts < firstAccess)) firstAccess = ts;
        });
        return {
          targets: targets,
          doneFlags: doneFlags,
          total: targets.length,
          done: done,
          pending: Math.max(0, targets.length - done),
          firstAccess: firstAccess
        };
      }

      /* Build the situation text based on intervention data */
      function situationText(d) {
        var parts = [];
        var state = (window.MWADashboard && window.MWADashboard.state) || {};
        var logs = state.logs || [];
        var grades = state.grades || [];

        // Find student in logs
        var studentName = norm(d.student_name).toLowerCase();
        var studentEmail = norm(d.student_email).toLowerCase();

        // Last access
        var lastAccess = null;
        logs.forEach(function(r) {
          var n = norm(r.nomecompleto || r.student_name || '').toLowerCase();
          var e = norm(r.email || '').toLowerCase();
          if ((studentName && n === studentName) || (studentEmail && e === studentEmail)) {
            var ts = r._ts ? Number(r._ts) : Number(r.timecreated || 0);
            if (ts && (!lastAccess || ts > lastAccess)) lastAccess = ts;
          }
        });

        var bucket = reasonBucket(effectiveReason(d));

        if (bucket === 'never') {
          var enroll = null;
          (state.students || []).some(function(s) {
            var n = norm(s.name).toLowerCase();
            var e = norm(s.email || '').toLowerCase();
            if ((studentName && n === studentName) || (studentEmail && e === studentEmail)) {
              enroll = s.daysWithoutAccess === null || s.daysWithoutAccess === undefined
                ? null : Number(s.daysWithoutAccess);
              return true;
            }
            return false;
          });
          parts.push(tr('int_motivo_never_desc').split('.')[0]);
          if (enroll !== null) parts.push(enroll === 1 ? tr('int_ai_enrolled').replace('{n}', enroll) : tr('int_ai_enrolled_pl').replace('{n}', enroll));
        } else if (bucket === 'low') {
          if (lastAccess) {
            var daysAgo = Math.round((Date.now() / 1000 - lastAccess) / 86400);
            parts.push(tr('int_ai_last_access').replace('{n}', daysAgo));
          }
          // Engagement score
          var sc = null;
          (state.students || []).some(function(s) {
            var n = norm(s.name).toLowerCase();
            var e = norm(s.email || '').toLowerCase();
            if ((studentName && n === studentName) || (studentEmail && e === studentEmail)) {
              sc = s.score;
              return true;
            }
            return false;
          });
          if (sc !== null) parts.push(tr('int_ai_engagement').replace('{n}', sc));
        } else if (bucket === 'pending') {
          var targetsAtSend = trackedTargets(d);
          var snapshotPending = null;
          try {
            var snapshotData = JSON.parse(d.snapshot_data || '{}') || {};
            snapshotPending = Number(snapshotData.pendingActivities);
          } catch (ignore) {}
          var pendingAtSend = targetsAtSend.length || (isNaN(snapshotPending) ? 0 : snapshotPending);
          parts.push(pendingAtSend === 1 ? tr('int_ai_pending_one').replace('{n}', pendingAtSend) : tr('int_ai_pending_pl').replace('{n}', pendingAtSend));
          if (lastAccess) {
            var daysLast = Math.round((Date.now() / 1000 - lastAccess) / 86400);
            parts.push(daysLast === 1 ? tr('int_ai_last_day').replace('{n}', daysLast) : tr('int_ai_last_day_pl').replace('{n}', daysLast));
          }
        } else if (bucket === 'difficult') {
          // Grade
          var gradeRow = null;
          grades.forEach(function(g) {
            if (!g || g.__mwa_type__ === 'activity_names') return;
            var first = norm(g['First name'] || g.Nome || g.firstname || '');
            var last = norm(g['Last name'] || g.Sobrenome || g.lastname || '');
            var gname = norm(g.student_name || g.name || g.nomecompleto || g.Aluno || (first + ' ' + last)).toLowerCase();
            var email = norm(g.Email || g.email || '').toLowerCase();
            if ((studentEmail && email === studentEmail) || (studentName && gname === studentName)) {
              gradeRow = g;
            }
          });
          if (gradeRow) {
            var avg = parseFloat(String(gradeRow.media || gradeRow.average || gradeRow.grade || '').replace(',', '.'));
            if (!isNaN(avg)) parts.push(tr('int_ai_grade_mean').replace('{value}', Math.round(avg)));
          }
          parts.push(tr('int_ai_grade_drop'));
        }

        return parts.length ? parts.join('\n') : translateReason(effectiveReason(d));
      }

      /* Build the intervention action description */
      function actionText(d) {
        var bucket = reasonBucket(effectiveReason(d));
        var subject = norm(d.subject);
        if (bucket === 'never') {
          return tr('int_action_welcome');
        }
        if (bucket === 'low') {
          return tr('int_action_reengagement');
        }
        if (bucket === 'pending') {
          return tr('int_action_reminder');
        }
        if (bucket === 'difficult') {
          return tr('int_action_guidance');
        }
        if (subject) return subject;
        return translateReason(effectiveReason(d));
      }

      /* Map interventionResult state to the new status labels */
      /* Status pills matching the reference image:
         🔵 Awaiting response  (blue)
         🟡 Returned           (yellow/orange)
         🟠 Partial progress   (orange)
         🟢 Full progress / Goal reached  (green)
      */
      var SVG_DOT_BLUE   = '<svg width="10" height="10" viewBox="0 0 10 10"><circle cx="5" cy="5" r="5" fill="#4f8ef7"/></svg>';
      var SVG_DOT_YELLOW = '<svg width="10" height="10" viewBox="0 0 10 10"><circle cx="5" cy="5" r="5" fill="#f59e0b"/></svg>';
      var SVG_DOT_ORANGE = '<svg width="10" height="10" viewBox="0 0 10 10"><circle cx="5" cy="5" r="5" fill="#f97316"/></svg>';
      var SVG_DOT_GREEN  = '<svg width="10" height="10" viewBox="0 0 10 10"><circle cx="5" cy="5" r="5" fill="#22c55e"/></svg>';
      var SVG_CAL = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>';
      var SVG_REFRESH = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>';

      function interventionStatusHtml(d, result) {
        var state = result ? result.state : 'none';
        if (d.status !== 'sent') {
          return '<span class="int2-status-pill error">&#10007; ' + tr('int_status_error') + '</span>';
        }
        if (state === 'delivered') {
          // Green indicates verifiable progress in subsequent data.
          return '<span class="int2-status-pill evolved">' + SVG_DOT_GREEN + ' ' + tr('int_status_evolved') + '</span>';
        }
        if (state === 'partial') {
          return '<span class="int2-status-pill tracking">' + SVG_DOT_ORANGE + ' ' + tr('int_status_tracking') + '</span>';
        }
        if (state === 'accessed') {
          // Yellow indicates that the student returned.
          return '<span class="int2-status-pill returned">' + SVG_DOT_YELLOW + ' ' + tr('int_status_returned') + '</span>';
        }
        if (state === 'pending') {
          return '<span class="int2-status-pill awaiting">' + SVG_DOT_BLUE + ' ' + tr('int_status_awaiting') + '</span>';
        }
        return '<span class="int2-status-pill awaiting">' + SVG_DOT_BLUE + ' ' + tr('int_status_awaiting') + '</span>';
      }

      /* Follow-up uses the exact calendar SVG icon. */
      function followupHtml(d, result) {
        var state = result ? result.state : 'none';
        if (d.status !== 'sent') return '<span style="color:var(--muted);">—</span>';
        if (state === 'delivered') {
          // Refresh/done icon indicates that follow-up is complete.
          return '<span class="int2-followup">' + SVG_REFRESH + ' ' + tr('int_followup_done') + '</span>';
        }
        if (state === 'accessed' || state === 'partial') {
          return '<span class="int2-followup">' + SVG_CAL + ' ' + tr('int_followup_5d') + '</span>';
        }
        return '<span class="int2-followup">' + SVG_CAL + ' ' + tr('int_followup_7d') + '</span>';
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
          var returnTs = null;
          var rowName = norm(d.student_name);
          logs.forEach(function(r){
            if(norm(r.nomecompleto)!==rowName)return;
            var ts=r._ts?Number(r._ts):0;
            if(ts>d.timesent&&(returnTs===null||ts<returnTs))returnTs=ts;
          });
          var effectLabel = d.status!=='sent' ? '-'
            : returnTs===null ? tr('int_no_effect')
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

        var ssXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
          + '<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"'
          + ' count="'+sharedStr.length+'" uniqueCount="'+sharedStr.length+'">'
          + allRows.reduce(function(acc,row){ row.forEach(function(v){ si(v); }); return acc; }, '')
          + sharedStr.map(function(s){return '<si><t xml:space="preserve">'+xmlEsc(s)+'</t></si>';}).join('')
          + '</sst>';

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
        var all=[];
        localH.forEach(function(h){all=all.concat(h);});
        all=all.concat(cdBytes).concat(eocd);

        var blob=new Blob([new Uint8Array(all)],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
        var url=URL.createObjectURL(blob);
        var a=document.createElement('a');
        a.href=url; a.download='contatos_'+new Date().toISOString().slice(0,10)+'.xlsx';
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setTimeout(function(){URL.revokeObjectURL(url);},2000);
      }

      /* ================================================================
         interventionResult — unchanged from original
      ================================================================ */
      function interventionResult(d) {
        function formatDiffSeconds(diffSec) {
          if (diffSec < 3600) { var mins = Math.round(diffSec / 60); return mins <= 1 ? tr('int_time_lt1min','< 1min') : mins + ' ' + tr('int_time_min','min'); }
          if (diffSec < 86400) { var hrs = Math.round(diffSec / 3600); return hrs === 1 ? '1 ' + tr('int_time_hour','hora') : hrs + ' ' + tr('int_time_hours','horas'); }
          var dys = Math.round(diffSec / 86400);
          return dys === 1 ? '1 ' + tr('int_time_day','dia') : dys + ' ' + tr('int_time_days','dias');
        }

        if (d.status !== 'sent') return {state: 'none', label: '&mdash;', html: '&mdash;'};
        var progress = trackedProgress(d);
        if (progress.total > 0) {
          if (progress.done === progress.total) {
            return {state: 'delivered', progress: progress, label: tr('int_status_evolved'), html: '<span class="int-result-pill delivered"><i></i>' + tr('int_status_evolved') + '</span>'};
          }
          if (progress.done > 0) {
            return {state: 'partial', progress: progress, label: tr('int_status_tracking'), html: '<span class="int-result-pill accessed"><i></i>' + tr('int_status_tracking') + '</span>'};
          }
          if (progress.firstAccess !== null) {
            return {state: 'accessed', progress: progress, label: tr('int_result_accessed','Acessou'), html: '<span class="int-result-pill accessed"><i></i>' + esc(tr('int_result_accessed','Acessou')) + '</span>'};
          }
          return {state: 'pending', progress: progress, label: tr('int_result_pending','Pendente'), html: '<span class="int-result-pill pending"><i></i>' + esc(tr('int_result_pending','Pendente')) + '</span>'};
        }
        var returnTs = progress.firstAccess;
        if (returnTs === null) {
          return {state: 'pending', label: tr('int_result_pending','Pendente'), html: '<span class="int-result-pill pending"><i></i>' + esc(tr('int_result_pending','Pendente')) + '</span>'};
        }
        return {state: 'accessed', label: tr('int_result_accessed','Acessou'), html: '<span class="int-result-pill accessed"><i></i>' + esc(tr('int_result_accessed','Acessou')) + ' · ' + esc(formatDiffSeconds(returnTs - d.timesent)) + '</span>'};
      }

      /* ================================================================
         RENDER INTERVENTIONS PAGE — new design
      ================================================================ */
      function renderInterventionsPage() {
        var el = document.getElementById('interventionsWrap');
        if (!el) return;

        var data = INTERVENTIONS;
        var logs = (window.MWADashboard && window.MWADashboard.state && window.MWADashboard.state.logs) || [];

        /* ---- Read current filter state ---- */
        var activeFilterId = document.activeElement && document.activeElement.id ? document.activeElement.id : '';
        var activeFilterPos = 0;
        try { activeFilterPos = document.activeElement && typeof document.activeElement.selectionStart === 'number' ? document.activeElement.selectionStart : 0; } catch (e) { activeFilterPos = 0; }

        var fPeriod  = norm((document.getElementById('intFilter2Period')   || {}).value || '30');
        var fReason  = norm((document.getElementById('intFilter2Reason')   || {}).value);
        var fStatus  = norm((document.getElementById('intFilter2Status')   || {}).value);
        var fTeacher = norm((document.getElementById('intFilter2Teacher')  || {}).value);
        var fStudent = norm((document.getElementById('intFilter2Student')  || {}).value).toLowerCase();
        var fPage    = CURRENT_PAGE;
        var fPageSize = PAGE_SIZE;

        /* ---- Period filter ---- */
        var now = Math.floor(Date.now() / 1000);
        var periodDays = parseInt(fPeriod, 10);
        var periodCutoff = (fPeriod && fPeriod !== 'all' && periodDays > 0) ? now - periodDays * 86400 : 0;

        /* ---- Compute result for each row ---- */
        var resultsCache = {};
        data.forEach(function(d) { resultsCache[d.id] = interventionResult(d); });

        /* ---- Filter data ---- */
        function matchesBucket(d, bucket) {
          if (!bucket) return true;
          return reasonBucket(effectiveReason(d)) === bucket;
        }
        var filteredData = data.filter(function(d) {
          if (periodCutoff && d.timesent < periodCutoff) return false;
          if (fReason && !matchesBucket(d, fReason)) return false;
          if (fTeacher && norm(d.teacher_name).toLowerCase().indexOf(fTeacher.toLowerCase()) === -1) return false;
          if (fStudent && norm(d.student_name).toLowerCase().indexOf(fStudent) === -1) return false;
          if (fStatus) {
            var st = resultsCache[d.id] ? resultsCache[d.id].state : 'none';
            if (fStatus === 'awaiting') {
              if (d.status !== 'sent' || (st !== 'pending' && st !== 'none')) return false;
              var anyAccess = logs.some(function(r) { return norm(r.nomecompleto) === norm(d.student_name) && (r._ts ? Number(r._ts) : 0) > d.timesent; });
              if (anyAccess) return false;
            } else if (fStatus === 'returned' && st !== 'accessed') return false;
            else if (fStatus === 'tracking' && st !== 'partial') return false;
            else if (fStatus === 'evolved' && st !== 'delivered') return false;
          }
          return true;
        });

        /* ---- KPI counts per motivo bucket ---- */
        var bucketCounts = { never: 0, low: 0, pending: 0, difficult: 0, other: 0 };
        filteredData.forEach(function(d) {
          var b = reasonBucket(effectiveReason(d));
          if (bucketCounts[b] !== undefined) bucketCounts[b]++;
          else bucketCounts.other++;
        });

        /* ---- Summary KPIs ---- */
        var totalInterventions = filteredData.length;
        var uniqueStudents = {};
        var uniqueTeachers = {};
        var returnedCount = 0;
        filteredData.forEach(function(d) {
          uniqueStudents[norm(d.student_name).toLowerCase()] = 1;
          if (d.teacher_name) uniqueTeachers[norm(d.teacher_name).toLowerCase()] = 1;
          if (d.status === 'sent') {
            var res = resultsCache[d.id];
            if (res && (res.state === 'accessed' || res.state === 'partial' || res.state === 'delivered')) returnedCount++;
          }
        });
        var sentCount = filteredData.filter(function(d) { return d.status === 'sent'; }).length;
        var returnRate = sentCount > 0 ? Math.round(returnedCount / sentCount * 100) : 0;

        /* ---- Collect teacher values ---- */
        var teacherValues = [];
        data.forEach(function(d) {
          var t = norm(d.teacher_name);
          if (t && teacherValues.indexOf(t) === -1) teacherValues.push(t);
        });
        teacherValues.sort(function(a, b) { return a.localeCompare(b); });

        /* ---- Pagination ---- */
        var totalRows = filteredData.length;
        var totalPages = Math.max(1, Math.ceil(totalRows / fPageSize));
        if (fPage > totalPages) { CURRENT_PAGE = 1; fPage = 1; }
        var pageStart = (fPage - 1) * fPageSize;
        var pageEnd = Math.min(pageStart + fPageSize, totalRows);
        var pageData = filteredData.slice(pageStart, pageEnd);

        /* ---- Build period dropdown ---- */
        function periodDropdown() {
          var periods = [
            { v: '7',   l: tr('int_period_7d') },
            { v: '30',  l: tr('int_period_30d') },
            { v: '90',  l: tr('int_period_90d') },
            { v: 'all', l: tr('int_period_all') }
          ];
          var cur = fPeriod || '30';
          var sel = periods.filter(function(p) { return p.v === cur; })[0];
          var text = sel ? sel.l : tr('int_period_30d');
          // Period has a calendar icon (matching the reference image)
          var SVG_CAL_SM = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>';
          return '<div class="int2-filter-group">'
            + '<label class="int2-filter-label">' + tr('int_period_label') + '</label>'
            + '<div class="int2-dd" data-filter2="intFilter2Period">'
              + '<input type="hidden" id="intFilter2Period" value="' + esc(cur) + '">'
              + '<button type="button" class="int2-dd-toggle" style="min-width:170px;">' + SVG_CAL_SM + '<span>' + esc(text) + '</span><b></b></button>'
              + '<div class="int2-dd-menu">'
                + periods.map(function(p) {
                    return '<button type="button" class="int2-dd-option' + (p.v === cur ? ' is-selected' : '') + '" data-value="' + esc(p.v) + '">' + esc(p.l) + '</button>';
                  }).join('')
              + '</div>'
            + '</div>'
          + '</div>';
        }

        function customDropdown2(id, label, placeholder, items, current) {
          var selected = (items || []).filter(function(item) { return item.v === current; })[0];
          var text = selected ? selected.l : placeholder;
          return '<div class="int2-filter-group">'
            + '<label class="int2-filter-label">' + esc(label) + '</label>'
            + '<div class="int2-dd" data-filter2="' + esc(id) + '">'
              + '<input type="hidden" id="' + esc(id) + '" value="' + esc(current || '') + '">'
              + '<button type="button" class="int2-dd-toggle"><span>' + esc(text) + '</span><b></b></button>'
              + '<div class="int2-dd-menu">'
                + '<button type="button" class="int2-dd-option' + (!current ? ' is-selected' : '') + '" data-value="">' + esc(placeholder) + '</button>'
                + (items || []).map(function(item) {
                    return '<button type="button" class="int2-dd-option' + (item.v === current ? ' is-selected' : '') + '" data-value="' + esc(item.v) + '">' + esc(item.l) + '</button>';
                  }).join('')
              + '</div>'
            + '</div>'
          + '</div>';
        }

        /* ---- Build motivo cards ---- */
        // Inline SVG icons matching the reference image exactly
        var SVG_NEVER    = '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#d95f5f" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>';
        var SVG_LOW      = '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#5b9bd5" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>';
        var SVG_PENDING  = '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#c98a2a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="15" y2="17"/></svg>';
        var SVG_DIFFICULT= '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#3aab7a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>';
        var SVG_OTHER    = '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#8b72d4" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
        var motivoCards = [
          {
            bucket: 'never',
            icon: SVG_NEVER,
            color: '#d95f5f',
            bg: 'rgba(217,95,95,.07)',
            border: 'rgba(217,95,95,.25)',
            label: tr('int_motivo_never'),
            desc: tr('int_motivo_never_desc'),
            count: bucketCounts.never
          },
          {
            bucket: 'low',
            icon: SVG_LOW,
            color: '#5b9bd5',
            bg: 'rgba(91,155,213,.07)',
            border: 'rgba(91,155,213,.25)',
            label: tr('int_motivo_low'),
            desc: tr('int_motivo_low_desc'),
            count: bucketCounts.low
          },
          {
            bucket: 'pending',
            icon: SVG_PENDING,
            color: '#c98a2a',
            bg: 'rgba(201,138,42,.07)',
            border: 'rgba(201,138,42,.25)',
            label: tr('int_motivo_pending'),
            desc: tr('int_motivo_pending_desc'),
            count: bucketCounts.pending
          },
          {
            bucket: 'difficult',
            icon: SVG_DIFFICULT,
            color: '#3aab7a',
            bg: 'rgba(58,171,122,.07)',
            border: 'rgba(58,171,122,.25)',
            label: tr('int_motivo_difficult'),
            desc: tr('int_motivo_difficult_desc'),
            count: bucketCounts.difficult
          },
          {
            bucket: 'other',
            icon: SVG_OTHER,
            color: '#8b72d4',
            bg: 'rgba(139,114,212,.07)',
            border: 'rgba(139,114,212,.25)',
            label: tr('int_motivo_other'),
            desc: tr('int_motivo_other_desc'),
            count: bucketCounts.other
          }
        ];

        var motivoHtml = motivoCards.map(function(c) {
          var isActive = fReason === c.bucket;
          return '<div class="int2-motivo-card' + (isActive ? ' active' : '') + '" data-bucket="' + esc(c.bucket) + '" style="'
            + '--mc:' + c.color + ';'
            + '--mcbg:' + c.bg + ';'
            + '--mcborder:' + c.border + ';'
            + '" onclick="window.MWAInterventions._filterByBucket(\'' + c.bucket + '\')">'
            + '<div class="int2-motivo-head">'
              + '<div class="int2-motivo-icon-svg">' + c.icon + '</div>'
              + '<div class="int2-motivo-label" style="color:' + c.color + ';">' + esc(c.label) + '</div>'
            + '</div>'
            + '<div class="int2-motivo-desc">' + esc(c.desc) + '</div>'
            + '<div class="int2-motivo-count" style="color:' + c.color + ';">' + c.count + '</div>'
            + '</div>';
        }).join('');

        /* ---- Build summary panel ---- */
        var summaryHtml = '<div class="int2-summary-panel">'
          + '<div class="int2-summary-title">' + tr('int_summary_title') + ' <span class="mwa-help-tip" tabindex="0" role="button" aria-label="' + esc(tr('int_summary_tip')) + '" data-tooltip="' + esc(tr('int_summary_tip')) + '">?</span></div>'
          + '<div class="int2-summary-row"><span>' + tr('int_summary_realized') + '</span><strong>' + totalInterventions + '</strong></div>'
          + '<div class="int2-summary-row"><span>' + tr('int_summary_unique') + '</span><strong>' + Object.keys(uniqueStudents).length + '</strong></div>'
          + '<div class="int2-summary-row"><span>' + tr('int_summary_teachers') + '</span><strong>' + Object.keys(uniqueTeachers).length + '</strong></div>'
          + '<div class="int2-summary-row rate"><span>' + tr('int_summary_rate') + '</span><strong class="int2-rate-val">' + returnRate + '%</strong></div>'
          + '</div>';

        /* ---- Build filters bar ---- */
        // Motivo: labels exatamente como na imagem (sem emoji no dropdown)
        var reasonOptions = [
          { v: 'never',     l: tr('int_motivo_never') },
          { v: 'low',       l: tr('int_motivo_low') },
          { v: 'pending',   l: tr('int_motivo_pending') },
          { v: 'difficult', l: tr('int_motivo_difficult') },
          { v: 'other',     l: tr('int_motivo_other') }
        ];
        var statusOptions2 = [
          { v: 'awaiting',  l: tr('int_status_awaiting') },
          { v: 'returned',  l: tr('int_status_returned') },
          { v: 'tracking',  l: tr('int_status_tracking') },
          { v: 'evolved',   l: tr('int_status_evolved') }
        ];
        var teacherOptions = teacherValues.map(function(t) { return { v: t, l: t }; });

        // Filters bar: period, reason, status, teacher, student search, and clear filters.
        var filtersHtml = '<div class="int2-filters-bar">'
          + periodDropdown()
          + customDropdown2('intFilter2Reason',  tr('int_filter_reason'),  tr('int_filter_all_reasons'),    reasonOptions,  fReason)
          + customDropdown2('intFilter2Status',  tr('int_filter_status'),  tr('int_filter_all_status'),     statusOptions2, fStatus)
          + customDropdown2('intFilter2Teacher', tr('int_filter_professor'), tr('int_filter_all_professors'), teacherOptions, fTeacher)
          + '<div class="int2-filter-group int2-search-group">'
            + '<label class="int2-filter-label">&nbsp;</label>'
            + '<div class="int2-search-wrap">'
              + '<input id="intFilter2Student" class="int2-search-input" type="search" value="' + esc(fStudent) + '" placeholder="' + esc(tr('int_filter_student_placeholder2')) + '">'
              + '<span class="int2-search-icon" aria-hidden="true"><svg class="mwa-ui-icon"><use href="#mwa-icon-search"></use></svg></span>'
            + '</div>'
          + '</div>'
          + '<div class="int2-filter-group int2-clear-group">'
            + '<label class="int2-filter-label">&nbsp;</label>'
            + '<button id="int2ClearFilters" class="int2-clear-btn">&#128465; ' + tr('int_filter_clear') + '</button>'
          + '</div>'
          + '</div>';

        /* ---- Build motivo pill for the table ---- */
        function motivoPill(d) {
          var bucket = reasonBucket(effectiveReason(d));
          var card = motivoCards.filter(function(c) { return c.bucket === bucket; })[0] || motivoCards[4];
          return '<span class="int2-reason-pill" style="--rc:' + card.color + ';--rcbg:' + card.bg + ';">'
            + '<span class="int2-reason-pill-icon">' + card.icon + '</span>'
            + esc(card.label)
            + '</span>';
        }

        /* ---- Build table rows ---- */
        var tableRows = pageData.map(function(d) {
          var result = resultsCache[d.id];
          var dateStr = fmtDate(d.timesent);
          var sitText = situationText(d);
          var actText = actionText(d);
          var sitLines = sitText.split('\n');
          var actLines = actText.split('\n');

          // Use the reason-specific inline SVG icon shown in the reference image.
          var bucket = reasonBucket(effectiveReason(d));
          // Never/low uses an envelope, pending uses a clipboard, and difficult uses a pedagogical bubble.
          var actionIcon = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>';
          if (bucket === 'pending') actionIcon = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="15" y2="17"/></svg>';
          if (bucket === 'difficult') actionIcon = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';

          var sitHtml = sitLines.map(function(l, i) {
            return i === 0
              ? '<div class="int2-cell-main">' + esc(l) + '</div>'
              : '<div class="int2-cell-sub">' + esc(l) + '</div>';
          }).join('');

          var actHtml = '<div class="int2-cell-action-icon">' + actionIcon + '</div>'
            + '<div>'
            + actLines.map(function(l, i) {
                return i === 0
                  ? '<div class="int2-cell-main">' + esc(l) + '</div>'
                  : '<div class="int2-cell-sub">' + esc(l) + '</div>';
              }).join('')
            + '</div>';

          return '<tr class="int2-row" onclick="window.MWAInterventions.toggleDetail(' + d.id + ')">'
            + '<td class="int2-td int2-td-date"><div class="int2-date-main">' + esc(dateStr.replace(' ', '\n').split('\n')[0]) + '</div><div class="int2-date-time">' + esc(dateStr.split(' ')[1] || '') + '</div></td>'
            + '<td class="int2-td int2-td-student"><div class="int2-student-cell">'
              + studentAvatar(d, 'int-student-avatar small')
              + '<a class="int2-student-name gr-name" onclick="event.stopPropagation();window.goToStudentProfile&&window.goToStudentProfile(' + JSON.stringify(d.student_name) + ')">' + esc(d.student_name) + '</a>'
              + '</div></td>'
            + '<td class="int2-td int2-td-reason">' + motivoPill(d) + '</td>'
            + '<td class="int2-td int2-td-situation">' + sitHtml + '</td>'
            + '<td class="int2-td int2-td-action"><div class="int2-action-wrap">' + actHtml + '</div></td>'
            + '<td class="int2-td int2-td-teacher"><div class="int2-cell-main">' + esc(d.teacher_name || '') + '</div></td>'
            + '<td class="int2-td int2-td-status">' + interventionStatusHtml(d, result) + '</td>'
            + '<td class="int2-td int2-td-followup">' + followupHtml(d, result) + '</td>'
            + '<td class="int2-td int2-td-actions">'
              + '<button class="int2-action-menu-btn" title="' + esc(tr('int_action_menu_title')) + '" onclick="event.stopPropagation();window.MWAInterventions._openRowMenu(event,' + d.id + ',\'' + esc(d.student_name) + '\',\'' + esc(d.student_email || '') + '\')">&#8943;</button>'
            + '</td>'
            + '</tr>'
            + '<tr class="int2-detail-tr" id="int2Detail_' + d.id + '" style="display:none;"><td colspan="9">' + renderDetailRow(d, result ? result.html : '', d.status === 'sent' ? '<span class="int-status-ok">&#10003;</span>' : '<span class="int-status-err">&#10007;</span>') + '</td></tr>';
        }).join('');

        /* ---- Table header ---- */
        var tableHtml = filteredData.length
          ? '<table class="int2-table">'
            + '<thead><tr class="int2-thead-row">'
            + '<th class="int2-th">DATA</th>'
            + '<th class="int2-th">ALUNO</th>'
            + '<th class="int2-th">MOTIVO</th>'
            + '<th class="int2-th">SITUA\u00c7\u00c3O IDENTIFICADA</th>'
            + '<th class="int2-th">INTERVEN\u00c7\u00c3O REALIZADA</th>'
            + '<th class="int2-th">PROFESSOR</th>'
            + '<th class="int2-th">STATUS</th>'
            + '<th class="int2-th">ACOMPANHAMENTO</th>'
            + '<th class="int2-th"></th>'
            + '</tr></thead>'
            + '<tbody>' + tableRows + '</tbody>'
            + '</table>'
          : '<div class="gr-empty"><div class="gr-empty-icon">' + icon('mail') + '</div><p>' + esc(data.length ? tr('int_no_filter_results') : tr('int_no_data')) + '</p></div>';

        /* ---- Pagination ---- */
        function pagBtn(n, label, disabled, active) {
          return '<button class="int2-page-btn' + (active ? ' active' : '') + (disabled ? ' disabled' : '') + '"'
            + (disabled ? ' disabled' : '')
            + ' onclick="window.MWAInterventions._goPage(' + n + ')">'
            + (label || n)
            + '</button>';
        }
        var pagHtml = '';
        if (totalRows > 0) {
          var pagBtns = pagBtn(fPage - 1, '&#8249;', fPage <= 1, false);
          var startPage = Math.max(1, fPage - 2);
          var endPage = Math.min(totalPages, startPage + 4);
          if (endPage - startPage < 4) startPage = Math.max(1, endPage - 4);
          for (var pi = startPage; pi <= endPage; pi++) {
            pagBtns += pagBtn(pi, pi, false, pi === fPage);
          }
          pagBtns += pagBtn(fPage + 1, '&#8250;', fPage >= totalPages, false);

          var pagSizeOptions = [5, 10, 20, 50].map(function(s) {
            return '<option value="' + s + '"' + (s === fPageSize ? ' selected' : '') + '>' + s + '</option>';
          }).join('');

          pagHtml = '<div class="int2-pagination">'
            + '<div class="int2-pag-info">' + tr('int_pag_showing').replace('{start}', pageStart + 1).replace('{end}', pageEnd).replace('{total}', totalRows) + '</div>'
            + '<div class="int2-pag-pages">' + pagBtns + '</div>'
            + '<div class="int2-pag-size">'
              + tr('int_items_per_page')
              + '<select class="int2-page-size-sel" onchange="window.MWAInterventions._setPageSize(this.value)">'
              + pagSizeOptions
              + '</select>'
            + '</div>'
            + '</div>';
        }

        /* ---- Table wrapper (registered count + export) ---- */
        var tableHeaderHtml = '<div class="int2-table-header">'
          + '<div class="int2-table-title">' + tr('int_registered') + ' (' + filteredData.length + ')</div>'
          + '<div class="int2-table-actions">'
            + (filteredData.length
              ? '<button id="int2ExportBtn" class="int2-export-btn">' + icon('download') + ' ' + tr('int_export_btn') + '</button>'
              : '')
          + '</div>'
          + '</div>';

        /* ---- Cards row (motivos + summary) ---- */
        // Render the intervention reasons section as shown in the reference image.
        var cardsAreaHtml = '<div class="int2-section-header">'
          + '<span class="int2-section-title">' + tr('int_motivos_section') + '</span>'
          + ' <span class="mwa-help-tip" tabindex="0" role="button" aria-label="' + esc(tr('int_tip_motivos_section')) + '" data-tooltip="' + esc(tr('int_tip_motivos_section')) + '">?</span>'
          + '</div>'
          + '<div class="int2-cards-area">'
            + '<div class="int2-motivo-cards">' + motivoHtml + '</div>'
            + summaryHtml
          + '</div>';

        /* ---- Assemble ---- */
        var fullHtml = cardsAreaHtml
          + filtersHtml
          + '<div class="int2-table-wrap">'
            + tableHeaderHtml
            + tableHtml
            + pagHtml
          + '</div>';

        Store.renderHtml(el, fullHtml);

        /* ---- Bind dropdown events ---- */
        Array.prototype.slice.call(el.querySelectorAll('.int2-dd-toggle')).forEach(function(btn) {
          btn.addEventListener('click', function(ev) {
            ev.preventDefault(); ev.stopPropagation();
            var box = btn.closest('.int2-dd');
            Array.prototype.slice.call(el.querySelectorAll('.int2-dd.is-open')).forEach(function(openBox) {
              if (openBox !== box) openBox.classList.remove('is-open');
            });
            if (box) box.classList.toggle('is-open');
          });
        });
        Array.prototype.slice.call(el.querySelectorAll('.int2-dd-option')).forEach(function(opt) {
          opt.addEventListener('click', function(ev) {
            ev.preventDefault(); ev.stopPropagation();
            var box = opt.closest('.int2-dd');
            var input = box ? box.querySelector('input[type="hidden"]') : null;
            var label = box ? box.querySelector('.int2-dd-toggle span') : null;
            if (input) input.value = opt.getAttribute('data-value') || '';
            if (label) label.textContent = opt.textContent || '';
            if (box) box.classList.remove('is-open');
            CURRENT_PAGE = 1;
            if (input) input.dispatchEvent(new Event('change', {bubbles: true}));
          });
        });
        document.addEventListener('click', function closeInt2Dropdowns() {
          if (!document.body.contains(el)) { document.removeEventListener('click', closeInt2Dropdowns); return; }
          Array.prototype.slice.call(el.querySelectorAll('.int2-dd.is-open')).forEach(function(box) { box.classList.remove('is-open'); });
        });

        /* ---- Bind search/filter inputs ---- */
        ['intFilter2Period','intFilter2Reason','intFilter2Status','intFilter2Teacher'].forEach(function(id) {
          var fEl = document.getElementById(id);
          if (!fEl) return;
          fEl.addEventListener('change', function() { CURRENT_PAGE = 1; clearTimeout(window._mwaInt2Timer); window._mwaInt2Timer = setTimeout(renderInterventionsPage, 0); });
        });
        var studentSearch = document.getElementById('intFilter2Student');
        if (studentSearch) {
          studentSearch.addEventListener('input', function() { CURRENT_PAGE = 1; clearTimeout(window._mwaInt2Timer); window._mwaInt2Timer = setTimeout(renderInterventionsPage, 500); });
        }

        /* ---- Clear filters ---- */
        var clearBtn = document.getElementById('int2ClearFilters');
        if (clearBtn) {
          clearBtn.addEventListener('click', function() {
            ['intFilter2Period','intFilter2Reason','intFilter2Status','intFilter2Teacher'].forEach(function(id) {
              var fEl = document.getElementById(id);
              if (fEl) fEl.value = id === 'intFilter2Period' ? '30' : '';
            });
            var ss = document.getElementById('intFilter2Student');
            if (ss) ss.value = '';
            CURRENT_PAGE = 1;
            renderInterventionsPage();
          });
        }

        /* ---- Export button ---- */
        var exportBtn = document.getElementById('int2ExportBtn');
        if (exportBtn) {
          exportBtn.addEventListener('click', function() { exportContacts(filteredData, logs); });
        }

        /* ---- Restore focus ---- */
        if (activeFilterId) {
          var activeFilter = document.getElementById(activeFilterId);
          if (activeFilter) {
            activeFilter.focus();
            try { if (typeof activeFilter.setSelectionRange === 'function') activeFilter.setSelectionRange(activeFilterPos, activeFilterPos); } catch (e) {}
          }
        }
      }
    
      /* Intervention detail */
      function renderDetailRow(d, effectHtml, statusHtml) {
        var note = d.teacher_note || loadNote(d.id);
        var reason = translateReason(effectiveReason(d));
        var channel = d.send_type === 'both' ? sendChannelLabel('both') :
          (d.send_type === 'email' ? tr('msg_channel_email') : tr('msg_channel_moodle'));
        var avatar = studentAvatar(d, 'int-detail-avatar');

        /* --- Novo status (substituir effectHtml pelo status pill correto) --- */
        var result = interventionResult(d);
        var newStatusHtml = interventionStatusHtml(d, result);

        /* --- Itens acompanhados (target_items) --- */
        var progress = result.progress || trackedProgress(d);
        var targets = progress.targets;
        var plainMessage = interventionMessageText(d.message, !!(targets && targets.length));

        function itemIsDone(target) {
          return !!progress.doneFlags[targets.indexOf(target)];
        }

        var targetsHtml = '';
        if (targets && targets.length > 0) {
          var doneCount    = progress.done;
          var pendingCount = progress.pending;
          var summary = doneCount + ' ' + tr('tf_legend_done','Conclu\u00eddo') + (pendingCount > 0 ? ' \u00b7 ' + pendingCount + ' ' + tr('tf_legend_pending','Pend\u00eancia') : '');
          var pills = targets.map(function(t, idx) {
            var done = itemIsDone(t);
            var label = t.name ? t.name.substring(0, 20) + (t.name.length > 20 ? '\u2026' : '') : (idx + 1);
            return '<span class="int2-target-pill ' + (done ? 'done' : 'pending') + '" title="' + esc(t.name || '') + '">' + esc(String(label)) + '</span>';
          }).join('');
          targetsHtml = '<div class="int2-targets-block">'
            + '<div class="int2-targets-title">' + esc(tr('tf_detail_targets','Itens acompanhados')) + '</div>'
            + '<div class="int2-targets-summary">' + esc(summary) + '</div>'
            + '<div class="int2-targets-pills">' + pills + '</div>'
            + '</div>';
        }

        function snapshotBlock() {
          var data = {};
          try { data = JSON.parse(d.snapshot_data || '{}') || {}; } catch (e) { data = {}; }
          if (!d.snapshot_timecreated || !Object.keys(data).length) return '';
          var bucket = reasonBucket(d.snapshot_reason || d.intervention_reason || '');
          function ratio(a, b) {
            return a === null || a === undefined ? null : String(a) + (b !== null && b !== undefined ? '/' + b : '');
          }
          function accessValue() {
            if (!data.lastAccess) return null;
            return data.daysWithoutAccess === null || data.daysWithoutAccess === undefined
              ? new Date(Number(data.lastAccess) * 1000).toLocaleDateString()
              : tr('snapshot_days_ago').replace('{days}', String(data.daysWithoutAccess));
          }
          var snapshotCourseGrade = data.gradeMetric === 'course_total_points' ? data.courseTotalGrade : null;
          var legacyGradeSnapshot = data.gradeMetric !== 'course_total_points' && data.averageGrade !== null &&
            data.averageGrade !== undefined;
          var definitions = {
            never: [
              ['snapshot_first_access', data.firstAccessCompleted ? tr('snapshot_yes') : tr('snapshot_no')],
              ['snapshot_days_enrolled', data.daysSinceEnrolment],
              ['snapshot_activities_done', ratio(data.activitiesCompleted, data.activitiesTotal)],
              ['snapshot_resources_accessed', ratio(data.resourcesAccessed, data.resourcesTotal)]
            ],
            low: [
              ['snapshot_last_access', accessValue()],
              ['snapshot_active_days_7', data.activeDaysLast7],
              ['snapshot_interactions', data.interactions],
              ['snapshot_resources_accessed', ratio(data.resourcesAccessed, data.resourcesTotal)],
              ['snapshot_activities_done', ratio(data.activitiesCompleted, data.activitiesTotal)],
              ['snapshot_regularity', data.regularity]
            ],
            pending: [
              ['snapshot_pending', targets.length || data.pendingActivities],
              ['snapshot_overdue', data.overdueDeliveries],
              ['snapshot_activities_done', ratio(data.activitiesCompleted, data.activitiesTotal)],
              ['snapshot_oldest_pending', data.oldestPendingDays === null ? null : data.oldestPendingDays + ' ' + tr('snapshot_days')],
              ['snapshot_last_access', accessValue()]
            ],
            difficult: [
              ['snapshot_last_assessment', data.lastAssessmentResult],
              ['snapshot_below_reference', data.assessmentsBelowReference],
              ['snapshot_attempts', data.attempts],
              ['snapshot_assessed_done', ratio(data.assessedActivitiesCompleted, data.assessedActivitiesTotal)],
              ['snapshot_grade_trend', data.gradeTrend]
            ],
            other: [
              ['snapshot_last_access', accessValue()],
              ['snapshot_activities_done', ratio(data.activitiesCompleted, data.activitiesTotal)],
              ['snapshot_pending', data.pendingActivities]
            ]
          };
          var rows = (definitions[bucket] || definitions.other).filter(function(item) {
            return item[1] !== null && item[1] !== undefined && item[1] !== '';
          }).map(function(item) {
            return '<div class="int-snapshot-metric"><span>' + esc(tr(item[0])) + '</span><strong>' + esc(String(item[1])) + '</strong></div>';
          }).join('');
          var captured = new Date(Number(d.snapshot_timecreated) * 1000);
          var capturedLabel = captured.toLocaleDateString() + ' ' + tr('snapshot_at') + ' ' +
            captured.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
          var snapshotEngagement = Number(data.engagement);
          snapshotEngagement = isNaN(snapshotEngagement) ? null : Math.max(0, Math.min(100, Math.round(snapshotEngagement)));
          var engagementKpi = snapshotEngagement === null ? '' : '<div class="int-snapshot-engagement-kpi" style="--snapshot-pct:' + snapshotEngagement + ';">'
            + '<div class="int-snapshot-engagement-ring"><span>' + snapshotEngagement + '%</span></div>'
            + '<div><strong>' + esc(tr('snapshot_engagement_at_time')) + '</strong><small>' + esc(tr('snapshot_recorded_at')) + ': ' + esc(capturedLabel) + '</small></div>'
            + '</div>';
          var snapshotGrade = snapshotCourseGrade === null || snapshotCourseGrade === undefined ? null : Number(snapshotCourseGrade);
          snapshotGrade = snapshotGrade === null || isNaN(snapshotGrade) || legacyGradeSnapshot ? null : Math.round(snapshotGrade * 10) / 10;
          var gradeKpi = snapshotGrade === null ? '' : '<div class="int-snapshot-grade-kpi' + (snapshotGrade < 60 ? ' is-below-reference' : ' is-approved') + '">'
            + '<div class="int-snapshot-grade-value">' + esc(snapshotGrade.toFixed(1)) + '</div>'
            + '<div><strong>' + esc(tr('snapshot_grade_at_time')) + '</strong><small>' + esc(tr('snapshot_grade_points')) + '</small></div>'
            + '</div>';
          var situationKpi = '<div class="int-snapshot-situation-kpi"><span>' + esc(tr('snapshot_situation_label')) + '</span>'
            + '<strong>' + esc(d.snapshot_situation || d.snapshot_reason || '') + '</strong></div>';
          var snapshotKpis = '<div class="int-snapshot-kpi-row">' + engagementKpi + gradeKpi + situationKpi + '</div>';
          var snapshotContent = snapshotKpis
            + '<div class="int-snapshot-concepts">'
            + '<div><span>' + esc(tr('snapshot_action_label')) + '</span><strong>' + esc(d.snapshot_action || '') + '</strong></div>'
            + '<div><span>' + esc(tr('snapshot_objective_label')) + '</span><strong>' + esc(d.snapshot_objective || '') + '</strong></div>'
            + '</div><div class="int-snapshot-grid">' + rows + '</div>'
            + (legacyGradeSnapshot ? '<div class="int-snapshot-lock">' + tr('int_snapshot_lock') + '</div>' : '')
            + '<div class="int-snapshot-date">' + esc(tr('snapshot_recorded_at')) + ': ' + esc(capturedLabel) + '</div>'
            + '<div class="int-snapshot-lock">🔒 ' + esc(tr('snapshot_historical_notice')) + '</div>';
          return '<div class="int-snapshot-launch">'
            + '<button type="button" class="int-snapshot-open-btn" onclick="event.stopPropagation();window.MWAInterventions.openSnapshot(' + Number(d.id) + ')">'
            + '<span class="int-snapshot-open-icon">' + icon('chart') + '</span><span><strong>' + esc(snapshotTitle()) + '</strong><small>' + esc(tr('snapshot_open')) + '</small></span><b>›</b>'
            + '</button>'
            + '<div id="intSnapshotSource_' + Number(d.id) + '" hidden>' + snapshotContent + '</div>'
            + '</div>';
        }

        return '<div class="int-collapse-panel" style="margin:0;border-radius:0;border:0;box-shadow:none;background:#f8fbff;">'
            + '<div class="int-collapse-top">'
              + '<div>'
                + '<div class="int-collapse-eyebrow">' + esc(tr('int_view_details')) + '</div>'
                + '<div class="int-collapse-title">' + icon('mail') + ' ' + esc(d.subject || tr('int_export_subject')) + '</div>'
              + '</div>'
              + '<button class="btn-ghost int-collapse-close" onclick="event.stopPropagation();window.MWAInterventions.toggleDetail(' + d.id + ')">' + esc(tr('int_collapse')) + '</button>'
            + '</div>'
            + '<div class="int-detail-grid">'
              + '<div class="int-detail-chip int-detail-student-chip"><div class="int-detail-person">' + avatar + '<div><span>' + esc(tr('int_col_student')) + '</span><strong>' + esc(d.student_name || '') + '</strong><small>' + esc(d.student_email || tr('msg_no_registered_email')) + '</small></div></div></div>'
              + '<div class="int-detail-chip"><span>' + esc(tr('int_col_teacher')) + '</span><strong>' + esc(d.teacher_name || '') + '</strong><small>' + esc(fmtDate(d.timesent)) + '</small></div>'
              + '<div class="int-detail-chip"><span>' + esc(tr('msg_detail_reason')) + '</span><strong>' + esc(reason) + (d.ai_generated ? ' <span class="int-ai-badge">IA</span>' : '') + '</strong><small>' + esc(channel) + '</small></div>'
              + '<div class="int-detail-chip int-status-effect-chip"><span>' + esc(tr('int_col_status','Status')) + '</span><div style="margin-top:4px;">' + newStatusHtml + '</div></div>'
            + '</div>'
            + '<div class="int-detail-columns">'
              + '<div class="int-detail-message-card">'
                + '<div class="int-detail-label">' + esc(tr('msg_body_label')) + '</div>'
                + '<div class="int-detail-msg">' + esc(plainMessage) + '</div>'
                + targetsHtml
              + '</div>'
              + '<div class="int-note-card ' + (note ? 'is-open' : '') + '" id="intNoteCard_' + d.id + '">'
                + '<div class="int-note-head">'
                  + '<div><div class="int-detail-label">' + esc(tr('int_notes_title')) + '</div><div class="int-note-sub">' + esc(tr('int_notes_subtitle')) + '</div></div>'
                  + '<button class="btn-ghost" onclick="event.stopPropagation();window.MWAInterventions.toggleNotes(' + d.id + ')">' + icon('edit') + ' ' + esc(tr('int_notes_btn')) + '</button>'
                + '</div>'
                + '<textarea id="intNoteText_' + d.id + '" class="int-note-textarea" onclick="event.stopPropagation();" placeholder="' + esc(tr('int_notes_placeholder')) + '">' + esc(note) + '</textarea>'
                + '<div class="int-note-actions"><span id="intNoteSaved_' + d.id + '" class="int-note-saved"></span><button class="btn-accent" onclick="event.stopPropagation();window.MWAInterventions.saveNote(' + d.id + ')">' + esc(tr('int_notes_save')) + '</button></div>'
              + '</div>'
            + '</div>'
            + snapshotBlock()
          + '</div>';
      }

      function closeSnapshot() {
        var overlay = document.getElementById('intSnapshotOverlay');
        if (overlay) overlay.remove();
      }

      function openSnapshot(id) {
        var source = document.getElementById('intSnapshotSource_' + Number(id));
        if (!source) return;
        closeSnapshot();
        var overlay = document.createElement('div');
        overlay.id = 'intSnapshotOverlay';
        overlay.className = 'block-mwa-dashboard-app int-snapshot-overlay';
        overlay.onclick = function(event) {
          if (event.target === overlay) closeSnapshot();
        };
        Store.renderHtml(overlay, '<section class="int-snapshot-modal" role="dialog" aria-modal="true" aria-labelledby="intSnapshotModalTitle">'
          + '<header class="int-snapshot-modal-head"><div><span>' + icon('chart') + '</span><strong id="intSnapshotModalTitle">' + esc(snapshotTitle()) + '</strong></div>'
          + '<button type="button" class="int-snapshot-modal-close" aria-label="' + esc(tr('snapshot_close')) + '" onclick="window.MWAInterventions.closeSnapshot()">&times;</button></header>'
          + '<div class="int-snapshot-modal-body">' + source.innerHTML + '</div></section>');
        document.body.appendChild(overlay);
        var closeButton = overlay.querySelector('.int-snapshot-modal-close');
        if (closeButton) closeButton.focus();
        overlay.addEventListener('keydown', function(event) {
          if (event.key === 'Escape') closeSnapshot();
        });
      }

      function toggleDetail(id) {
        var tr2 = document.getElementById('int2Detail_' + id);
        if (!tr2) {
          // Fallback for old accordion style
          var row = document.getElementById('intDetailRow_' + id);
          var main = document.getElementById('intRow_' + id);
          if (!row) return;
          var shouldOpen = !row.classList.contains('is-open');
          document.querySelectorAll('#interventionsWrap .int-detail-row-collapsible.is-open').forEach(function(el) { el.classList.remove('is-open'); });
          document.querySelectorAll('#interventionsWrap .int-main-row.is-open').forEach(function(el) { el.classList.remove('is-open'); });
          if (shouldOpen) { row.classList.add('is-open'); if (main) main.classList.add('is-open'); }
          return;
        }
        var shouldOpen = tr2.style.display === 'none' || tr2.style.display === '';
        // Close all open detail rows
        document.querySelectorAll('#interventionsWrap .int2-detail-tr').forEach(function(el) {
          el.style.display = 'none';
        });
        document.querySelectorAll('#interventionsWrap .int2-row.is-open').forEach(function(el) {
          el.classList.remove('is-open');
        });
        if (shouldOpen) {
          tr2.style.display = 'table-row';
          var mainRow = tr2.previousElementSibling;
          if (mainRow) mainRow.classList.add('is-open');
        }
      }

      function toggleNotes(id) {
        var card = document.getElementById('intNoteCard_' + id);
        if (!card) return;
        card.classList.toggle('is-open');
        if (card.classList.contains('is-open')) {
          var textarea = document.getElementById('intNoteText_' + id);
          if (textarea) textarea.focus();
        }
      }

      function showDetail(id) { toggleDetail(id); }
    
      /* ============================================================
         TIMELINE IN THE STUDENT PROFILE
      ============================================================ */
      function renderStudentTimeline(studentName, containerId) {
        var el2 = document.getElementById(containerId);
        if (!el2) return;

        var logs = (window.MWADashboard && window.MWADashboard.state && window.MWADashboard.state.logs) || [];
        var msgs = INTERVENTIONS.filter(function (d) { return norm(d.student_name) === norm(studentName) && d.status === 'sent'; });
        var previousSelect = el2.querySelector('[data-sp-timeline-days]');
        var period = previousSelect ? String(previousSelect.value || '30') : String(el2.dataset.timelineDays || '30');
        el2.dataset.timelineDays = period;
        var cutoff = period === 'all' ? 0 : Date.now() - Number(period || 30) * 86400000;

        function eventTs(r) {
          if (r._ts) return Number(r._ts) * 1000;
          if (r.timecreated) return Number(r.timecreated) * 1000;
          var s = norm(r.hora || r.time || r.date);
          var m2 = s.match(/(\d{2})\/(\d{2})\/(\d{2}),\s*(\d{2}):(\d{2})(?::(\d{2}))?/);
          if (m2) return new Date(2000 + Number(m2[3]), Number(m2[2]) - 1, Number(m2[1]), Number(m2[4]), Number(m2[5]), Number(m2[6] || 0)).getTime();
          return 0;
        }
        function eventKind(r) {
          var ev = norm(r.nomedoevento || r.eventname || r.action).toLowerCase();
          var comp = norm(r.componente || r.component || r._modtype).toLowerCase();
          if (ev.indexOf('submit') !== -1 || ev.indexOf('submitted') !== -1 || ev.indexOf('post created') !== -1 || ev.indexOf('discussion created') !== -1 || ev.indexOf('attempt submitted') !== -1 || ev.indexOf('completed') !== -1 || ev.indexOf('completion') !== -1 || ev.indexOf('graded') !== -1) return 'submit';
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
        function eventContext(r) { return norm(r.contextodoevento || r.eventcontext || r.context || r.coursename || r.nomedoevento || r.action); }

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

        var allEvents = logEvents.concat(msgs.map(function (m2) {
          return { ts: m2.timesent, type: 'msg', ctx: m2.subject, reason: m2.intervention_reason };
        }).filter(function(m2) { return !cutoff || Number(m2.ts || 0) * 1000 >= cutoff; }));
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
          Store.renderHtml(el2, controls + '<div class="sp-card-empty">' + esc(tr('no_data')) + '</div>');
          return;
        }

        var icons = { access: icon('circle'), submit: icon('check'), msg: icon('mail'), inactive: icon('warning') };
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

        Store.renderHtml(el2, html);
      }

      /* Quick message button */
      function quickMessage(studentName, studentEmail, studentId, reason) {
        if (!studentId || studentId === 0) {
          var logs = (window.MWADashboard && window.MWADashboard.state && window.MWADashboard.state.logs) || [];
          logs.some(function (r) {
            if (norm(r.nomecompleto) === norm(studentName) && r._userid) { studentId = Number(r._userid); return true; }
            return false;
          });
          if (!studentEmail) {
            logs.some(function (r) {
              if (norm(r.nomecompleto) === norm(studentName) && norm(r.email)) { studentEmail = norm(r.email); return true; }
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
        var seen2 = {}, names = [];
        logs.forEach(function (r) {
          var n = norm(r.nomecompleto);
          if (n && !seen2[n]) { seen2[n] = norm(r.email); names.push(n); }
        });
        names.sort(function (a, b) { return a.localeCompare(b); });
        Store.renderHtml(sel, '<option value="">' + tr('msg_select_student') + '</option>'
          + names.map(function (n) {
              return '<option value="' + esc(n) + '" data-email="' + esc(seen2[n]) + '">' + esc(n) + '</option>';
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

      /* Filter by motivo bucket (from card click) */
      function _filterByBucket(bucket) {
        var fEl = document.getElementById('intFilter2Reason');
        if (!fEl) return;
        // Toggle: if already active, clear
        fEl.value = fEl.value === bucket ? '' : bucket;
        CURRENT_PAGE = 1;
        renderInterventionsPage();
      }

      /* Pagination helpers */
      function _goPage(n) {
        CURRENT_PAGE = n;
        renderInterventionsPage();
      }

      function _setPageSize(n) {
        PAGE_SIZE = parseInt(n, 10) || 10;
        CURRENT_PAGE = 1;
        renderInterventionsPage();
      }

      /* Row action menu */
      function _openRowMenu(ev, id, studentName, studentEmail) {
        ev.stopPropagation();
        var old = document.getElementById('int2RowMenu');
        if (old) old.remove();
        var menu = document.createElement('div');
        menu.id = 'int2RowMenu';
        menu.className = 'int2-row-menu';

        function makeMenuBtn(icon, label, handler) {
          var btn = document.createElement('button');
          btn.type = 'button';
          btn.textContent = icon + ' ' + label;
          btn.addEventListener('click', handler);
          return btn;
        }

        menu.appendChild(makeMenuBtn('\u2709', tr('int_menu_send'), function() {
          window.MWAInterventions.quickMessage(studentName, studentEmail, 0, '');
        }));
        menu.appendChild(makeMenuBtn('\uD83D\uDDD1', tr('int_menu_delete'), function() {
          window.MWAInterventions.deleteIntervention(id);
        }));

        var rect = ev.target.getBoundingClientRect();
        menu.style.cssText = 'position:fixed;top:' + (rect.bottom + 4) + 'px;left:' + (rect.left - 120) + 'px;z-index:99999;background:#fff;border:1px solid #e0e4ef;border-radius:12px;box-shadow:0 8px 28px rgba(0,0,0,.16);padding:6px;min-width:160px;';
        Array.prototype.slice.call(menu.querySelectorAll('button')).forEach(function(b) {
          b.style.cssText = 'display:block;width:100%;background:none;border:0;border-radius:9px;padding:9px 12px;text-align:left;font-family:inherit;font-size:.82rem;font-weight:700;cursor:pointer;color:#1a2540;';
          b.onmouseover = function() { b.style.background='#f0f4ff'; };
          b.onmouseout  = function() { b.style.background='none'; };
        });
        document.body.appendChild(menu);
        setTimeout(function() {
          document.addEventListener('click', function closeMenu() { if (menu.parentNode) menu.parentNode.removeChild(menu); document.removeEventListener('click', closeMenu); });
        }, 0);
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
        _toggleSendChannel:      _toggleSendChannel,
        showDetail:              showDetail,
        toggleDetail:            toggleDetail,
        openSnapshot:            openSnapshot,
        closeSnapshot:           closeSnapshot,
        toggleNotes:             toggleNotes,
        saveNote:                saveNote,
        renderStudentTimeline:   renderStudentTimeline,
        getData:                 function () { return INTERVENTIONS; },
        _filterByBucket:         _filterByBucket,
        _goPage:                 _goPage,
        _setPageSize:            _setPageSize,
        _openRowMenu:            _openRowMenu,
        _afterSend:              null
      };
    
    })();

    return window.MWAInterventions;
});
