'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
let classify;
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../amd/src/classify.js'), 'utf8'), {
    define: (_, factory) => { classify = factory(); }
});
const aliases = require('../data/reason_aliases.json');
for (const value of ['Pendência acadêmica', 'Academic pending', 'Tarea pendiente [email]']) {
    assert.equal(classify.reasonCode(value, aliases), 'pending');
}
for (const value of ['Baixa participação', 'Low participation', 'Baja participación']) {
    assert.equal(classify.reasonCode(value, aliases), 'low');
}
for (const value of ['Submission submitted', 'Envio submetido', 'Entrega enviada']) {
    assert(classify.isSubmission({nomedoevento: value}));
}
assert(classify.isSubmission({_action_code: 'submitted', nomedoevento: 'anything'}));
assert(!classify.isSubmission({_action_code: 'viewed', nomedoevento: 'Submission submitted'}));
assert.equal(classify.moduleType({_modtype: 'quiz', componente: 'anything'}), 'quiz');
assert.equal(classify.moduleType({componente: 'Cuestionario'}), 'quiz');
assert(classify.genericName('Módulo del curso visualizado'));
assert.equal(classify.eventKind({_action_code: 'graded'}), 'submit');
console.log('Classify: pt/en/es historical labels and stable-code precedence OK');
