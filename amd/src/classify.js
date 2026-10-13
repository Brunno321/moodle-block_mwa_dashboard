// Pure classification: stable identifiers first, historical labels only as fallback.
define([], function() {
    'use strict';
    function normalized(value) {
        return String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/\s*\[(moodle|email)\]\s*$/i, '').trim();
    }
    function reasonCode(value, aliases) {
        var text = normalized(value);
        if (['never', 'low', 'pending', 'difficult', 'other'].indexOf(text) >= 0) return text;
        return (aliases || {})[text] || 'other';
    }
    function actionCode(log) {
        if (log._action_code) return log._action_code;
        var action = normalized(log.action);
        if (action) return action.replace(/ /g, '_');
        var text = normalized(log.nomedoevento || log.eventname);
        if (/message|mensagem|mensaje/.test(text)) return 'message_sent';
        if (/graded|avaliad|calificad/.test(text)) return 'graded';
        if (/post created|discussion created|postagem|publicacion creada/.test(text)) return 'post_created';
        if (/submit|submission|upload|submet|envio|enviad|entrega/.test(text)) return 'submitted';
        if (/completed|completion|conclu|completad/.test(text)) return 'completed';
        if (/view|visualiz|access|acess|acceso|visto/.test(text)) return 'viewed';
        return '';
    }
    function isSubmission(log) {
        return ['submitted', 'attempt_submitted', 'uploaded', 'graded', 'post_created',
            'discussion_created', 'completed', 'completion_updated'].indexOf(actionCode(log)) >= 0;
    }
    function isAccess(log) {
        return ['viewed', 'course_viewed', 'accessed', 'opened', 'read'].indexOf(actionCode(log)) >= 0;
    }
    function moduleType(log) {
        var code = normalized(log._modtype || log.modtype || log.module || log.component);
        if (code) return code.replace(/^mod_/, '').replace(/^hvp$/, 'h5pactivity').replace(/^assignsubmission$/, 'assign');
        var text = normalized(log.componente || log.contextodoevento);
        var aliases = {assignment: 'assign', tarefa: 'assign', tarea: 'assign', forum: 'forum', foro: 'forum',
            quiz: 'quiz', cuestionario: 'quiz', questionario: 'quiz', page: 'page', pagina: 'page',
            file: 'resource', arquivo: 'resource', archivo: 'resource', folder: 'folder', pasta: 'folder',
            carpeta: 'folder', book: 'book', livro: 'book', libro: 'book', h5p: 'h5pactivity'};
        return aliases[text] || text;
    }
    function genericName(value) {
        var text = normalized(value);
        return !text || /^(course|curso)\s*:|^(system|sistema)$|^(text and media area|area de texto|area de midia|media|midia)/.test(text) ||
            /^(course module viewed|modulo do curso visualizado|modulo del curso visualizado|course viewed|curso visualizado)$/.test(text);
    }
    function eventKind(log) {
        if (actionCode(log) === 'message_sent' || moduleType(log) === 'message') return 'msg';
        return isSubmission(log) ? 'submit' : 'access';
    }
    return {reasonCode: reasonCode, actionCode: actionCode, moduleType: moduleType,
        isSubmission: isSubmission, isAccess: isAccess, genericName: genericName, eventKind: eventKind};
});
