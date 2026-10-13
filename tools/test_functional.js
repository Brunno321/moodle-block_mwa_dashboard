'use strict';
const assert = require('assert');
const fs = require('fs');
// Simulate a browser outside Mérida; do not let host timezone hide regional bugs.
process.env.TZ = 'UTC';
const harness = require('./functional_harness');
const results = [];
async function test(area, name, callback) {
    try { const env = harness(); await callback(env); results.push({area, name, status: 'PASS'}); }
    catch (error) { results.push({area, name, status: 'FAIL', error: error.message}); }
}
function log(e, extra = {}) { return Object.assign({_ts: e.now / 1000, nomecompleto: 'Estudiante Prueba', email: 'test@example.invalid',
    _cmid: 10, _modtype: 'quiz', _action_code: 'viewed', contextodoevento: 'Cuestionario'}, extra); }
function messageForm(e, extra = {}) {
    e.node('mwaMsgSubject').value = 'Hola {nome}';
    e.node('mwaMsgBody').value = 'Revisa tu tarea <script>alert(1)</script>\nGracias';
    e.node('mwaMsgReason').value = 'Dificuldade acadêmica';
    e.node('mwaSnapshotSituation').value = '';
    e.node('mwaSnapshotObjective').value = '';
    const button = e.node('mwaMsgSendBtn');
    button.dataset = {userid: '123', sname: 'Estudiante Prueba', semail: 'test@example.invalid'};
    e.modules.interventions._setSendType('moodle');
    Object.entries(extra).forEach(([id, value]) => { e.nodes.get(id).value = value; });
    return button;
}
(async function() {
    await test('Carga AMD', 'Los nueve módulos funcionales cargan sin errores', e => {
        for (const name of ['actioncenter','activities','alerts','classlist','grades','studentprofile','interventions','teacherfeedback','engagementcalc']) {
            assert(e.modules[name]);
        }
    });
    await test('Participación', 'Estudiante sin actividad obtiene cero', e => {
        const result = e.modules.engagementcalc.calculateForStudent('Sin Acceso', '', [], []);
        assert.equal(result.score, 0); assert.equal(result.interactions, 0); assert.equal(result.last, null);
    });
    await test('Participación', 'Navegación sola no equivale a completar actividades', e => {
        const result = e.modules.engagementcalc.calculateForStudent('Estudiante Prueba', '', [log(e)], []);
        assert(result.score <= 12); assert.equal(result.submittedActivities, 0);
    });
    await test('Participación', 'Se separan estudiantes y se deduplican nombres', e => {
        assert.equal(e.modules.engagementcalc.getStudentNames([log(e), log(e), log(e,{nomecompleto:'Otra Persona'})], []).length, 2);
    });
    for (const [grade, expected] of [[0,true],[59.9,true],[60,false],[100,false],[null,false],['',false],['59,9',true]]) {
        await test('Centro de acciones', `Calificación ${JSON.stringify(grade)} frente al umbral 60%`, e => {
            assert.equal(e.hooks.actioncenter.releasedGradeBelowThreshold({grade, gradeMax:100}), expected);
        });
    }
    await test('Centro de acciones', 'El umbral se adapta al máximo del curso', e => {
        assert.equal(e.hooks.actioncenter.releasedGradeBelowThreshold({grade: 29, gradeMax:50}), true);
        assert.equal(e.hooks.actioncenter.releasedGradeBelowThreshold({grade: 30, gradeMax:50}), false);
    });
    await test('Centro de acciones', 'Objetivos excluyen entregas completadas y actividades cerradas', e => {
        e.state.grades=[{__mwa_type__:'activity_names',act_1:'Pendiente',act_cmid_1:10,act_module_1:'assign',act_available_1:1,
            act_2:'Entregada',act_cmid_2:20,act_module_2:'assign',act_available_2:1,
            act_3:'Cerrada',act_cmid_3:30,act_module_3:'quiz',act_available_3:0},
            {'User ID':123,'First name':'Estudiante','Last name':'Prueba',act_current_1:0,act_current_2:1,act_current_3:0}];
        const targets=e.hooks.actioncenter.buildActivityTargetsForStudent({userid:123,name:'Estudiante Prueba'});
        assert.deepEqual(Array.from(targets,t=>t.cmid),[10]);
    });
    await test('Centro de acciones', 'Nunca accedió se distingue del bajo desempeño', e => {
        assert.equal(e.modules.actioncenter.isFollowUpStudent({grade:0, gradeMax:100, interactions:0}), false);
        assert.equal(e.modules.actioncenter.isFollowUpStudent({grade:0, gradeMax:100, interactions:1}), true);
    });
    await test('Centro de acciones', 'Siete días sin acceso requiere contenido disponible', e => {
        const student = {interactions:1, grade:null, daysWithoutAccess:7};
        assert.equal(e.modules.actioncenter.isFollowUpStudent(student), false);
        e.config.activitylinks = [{cmid:10,name:'Recurso',tracked:true}];
        assert.equal(e.modules.actioncenter.isFollowUpStudent(student), true);
    });
    await test('Centro de acciones', 'Mensaje masivo de seguimiento selecciona solo bajo desempeño y deduplica', e => {
        e.state.students = [
            {name:'Bajo',email:'bajo@example.invalid',userid:101,grade:20,gradeMax:100,interactions:1},
            {name:'Bajo',email:'bajo@example.invalid',userid:101,grade:20,gradeMax:100,interactions:1},
            {name:'Aprobado',email:'alto@example.invalid',userid:102,grade:80,gradeMax:100,interactions:1},
            {name:'Nunca',email:'nunca@example.invalid',userid:103,grade:0,gradeMax:100,interactions:0}];
        e.modules.actioncenter.openBulkForKind('attention');
        assert.deepEqual(Array.from(e.window.__selectedTargets, target => target.userid), [101]);
        assert.equal(e.calls.length, 0);
    });
    for (const [kind,scores,expected] of [['warning',[40,41,69,70],[2,3]],['good',[69,70,100],[2,3]]]) {
        await test('Centro de acciones', `Filtro ${kind} respeta los límites`, e => {
            e.state.students = scores.map((score,i) => ({name:'Prueba '+i,email:`p${i}@example.invalid`,userid:i+1,score,interactions:1}));
            e.modules.actioncenter.openBulkForKind(kind);
            assert.deepEqual(Array.from(e.window.__selectedTargets,t => t.userid), expected);
        });
    }
    for (const [type,expected] of [['moodle','moodle'],['email','email'],['both','both']]) {
        await test('Mensajes', `Canal ${type}, destinatario y HTML seguro`, async e => {
            const button = messageForm(e); e.modules.interventions._setSendType(type);
            e.modules.interventions.doSend(button); await e.flush();
            const sent = e.calls.find(call => call.method === 'block_mwa_dashboard_send_message');
            assert(sent); assert.equal(sent.args.userid,123); assert.equal(sent.args.courseid,2); assert.equal(sent.args.send_type,expected);
            assert(!sent.args.message.includes('<script>')); assert(sent.args.message.includes('&lt;script&gt;')); assert(sent.args.message.includes('<br>'));
        });
    }
    for (const id of ['mwaMsgSubject','mwaMsgBody']) {
        await test('Mensajes', `Campo obligatorio ${id} vacío bloquea envío`, e => {
            const button = messageForm(e, {[id]:'  '}); e.modules.interventions.doSend(button); assert.equal(e.calls.length,0);
        });
    }
    await test('Mensajes', 'Sin canal no envía', e => {
        const button=messageForm(e); e.modules.interventions._setSendType(''); e.modules.interventions.doSend(button); assert.equal(e.calls.length,0);
    });
    await test('Mensajes', 'Motivo Otro exige situación y objetivo', e => {
        const button=messageForm(e,{mwaMsgReason:'Otro'}); e.modules.interventions.doSend(button); assert.equal(e.calls.length,0);
    });
    await test('Mensajes', 'Fallo del servicio habilita reintento', async e => {
        const button=messageForm(e); e.respond(() => Promise.resolve({success:false,status:'error'}));
        e.modules.interventions.doSend(button); await e.flush(); assert.equal(button.disabled,false);
    });
    await test('Mensajes', 'Fallo de conexión habilita reintento', async e => {
        const button=messageForm(e); e.respond(() => Promise.reject(new Error('Simulated network failure')));
        e.modules.interventions.doSend(button); await e.flush(); assert.equal(button.disabled,false);
    });
    await test('Mensajes', 'Dos invocaciones durante envío no duplican el mensaje', async e => {
        const button=messageForm(e); e.respond(() => new Promise(() => {}));
        e.modules.interventions.doSend(button); e.modules.interventions.doSend(button);
        assert.equal(e.calls.filter(call => call.method === 'block_mwa_dashboard_send_message').length,1);
    });
    await test('Lista de clase', 'Sesiones deduplican eventos y limitan los huecos', e => {
        const times=[0,0,60,360,3600]; const rows=times.map(t=>log(e,{_ts:e.now/1000+t}));
        assert.equal(e.hooks.classlist.calcSessionTimes(rows)['Estudiante Prueba'],360000);
    });
    await test('Lista de clase', 'CSV protege fórmulas y comillas', e => {
        assert(e.hooks.classlist.csvCell('=1+1').includes("'=")); assert(e.hooks.classlist.csvCell('a"b').includes('a""b'));
    });
    await test('Lista de clase', 'Presencia distingue acceso reciente y ausencia', e => {
        assert.equal(e.hooks.classlist.presenceInfo(e.modules.engagementcalc.parseDate({_ts:(e.now-60000)/1000})).tone,'online');
        assert.equal(e.hooks.classlist.presenceInfo(null).tone,'offline');
    });
    for (const [grade,expected] of [[0,0],[null,null],['',null],['59,5',59.5]]) {
        await test('Calificaciones', `Distingue cero de ausencia: ${JSON.stringify(grade)}`, e => {
            const data=e.hooks.grades.parseGrades([{'First name':'Prueba','Last name':'Uno','Email':'test@example.invalid',
                'Course total (Grade)':grade,'Course full max (Grade)':100}]);
            assert.equal(data[0].total,expected);
        });
    }
    for (const [mod,type] of [['assign','tarefa'],['forum','forum'],['quiz','quiz'],['h5pactivity','h5p'],['resource','video'],['label','login']]) {
        await test('Actividades', `Clasifica ${mod} sin depender del texto visible`, e => {
            assert.equal(e.hooks.activities.getEventType(log(e,{_modtype:mod,componente:'Etiqueta libre'})),type);
        });
    }
    await test('Actividades', 'Entrega y visualización son distintas', e => {
        assert(e.hooks.activities.isSubmission(log(e,{_action_code:'submitted',nomedoevento:'Texto libre'})));
        assert(!e.hooks.activities.isSubmission(log(e,{_action_code:'viewed',nomedoevento:'Submission submitted'})));
    });
    await test('Actividades', 'Dos CMID con el mismo nombre siguen siendo actividades distintas', e => {
        const result=e.hooks.activities.buildActMap([log(e,{_cmid:10,contextodoevento:'Cuestionario repetido'}),
            log(e,{_cmid:20,contextodoevento:'Cuestionario repetido'})]);
        assert.equal(Object.keys(result.actMap).length,2);
    });
    await test('Actividades', 'Ocultar conserva curso y CMID al enviar la solicitud', async e => {
        e.respond((method)=>Promise.resolve(method==='block_mwa_dashboard_set_activity_hidden'?{cmids:[10]}:{cmids:[]}));
        e.modules.activities.setHidden(10,true); await e.flush();
        const call=e.calls.find(call=>call.method==='block_mwa_dashboard_set_activity_hidden');
        assert.equal(call.args.courseid,2); assert.equal(call.args.cmid,10); assert.equal(call.args.hidden,true);
    });
    await test('Actividades', 'Cancelar desactivar seguimiento no llama al servicio', e => {
        e.window.confirm=()=>false; e.modules.activities.setTracked(10,false); assert.equal(e.calls.length,0);
    });
    await test('Actividades', 'Error al cambiar seguimiento se informa', async e => {
        e.respond(()=>Promise.reject(new Error('Simulated error'))); e.modules.activities.setTracked(10,true); await e.flush();
        assert(e.notices.some(notice=>notice.type==='error'));
    });
    await test('Perfil', 'Se reconoce recurso por módulo estable', e => {
        assert(e.hooks.studentprofile.isResourceModule(log(e,{_modtype:'resource',componente:'Archivo'})));
        assert(!e.hooks.studentprofile.isResourceModule(log(e,{_modtype:'quiz',componente:'Cuestionario'})));
    });
    await test('Perfil', 'Búsqueda identifica nombres sin distinguir acentos', e => {
        assert.equal(e.hooks.studentprofile.studentKey('  María  '), 'maria');
    });
    await test('Perfil', 'Guardar y borrar nota funciona durante la sesión', e => {
        const area=e.node('spNoteArea'); area.value='Nota de prueba'; e.modules.studentprofile.saveNote('Estudiante Prueba');
        assert.equal(e.window.MWA_TUTOR_NOTES['Estudiante Prueba'],'Nota de prueba');
        area.value=''; e.modules.studentprofile.saveNote('Estudiante Prueba');
        assert.equal(e.window.MWA_TUTOR_NOTES['Estudiante Prueba'],undefined);
    });
    await test('Intervenciones', 'Nota de intervención se guarda y está aislada por curso', e => {
        e.node('intNoteText_7').value='Seguimiento de prueba'; e.modules.interventions.saveNote(7);
        assert.equal(e.hooks.interventions.loadNote(7),'Seguimiento de prueba');
        e.config.courseid=3; assert.equal(e.hooks.interventions.loadNote(7),'');
    });
    await test('Intervenciones', 'Cancelar eliminación no llama al servicio', e => {
        e.window.confirm=()=>false; e.modules.interventions.deleteIntervention(7); assert.equal(e.calls.length,0);
    });
    await test('Intervenciones', 'Eliminación usa el identificador solicitado', async e => {
        e.modules.interventions.deleteIntervention(7); await e.flush();
        const call=e.calls.find(call=>call.method==='block_mwa_dashboard_delete_intervention'); assert.equal(call.args.id,7);
    });
    await test('Intervenciones', 'Plantilla personaliza nombre del destinatario', e => {
        const subject=e.node('mwaMsgSubject'), body=e.node('mwaMsgBody');
        e.modules.interventions.applyTemplate('never','María Prueba');
        assert(subject.value.length>0); assert(body.value.includes('María')); assert(!body.value.includes('{nome}'));
    });
    await test('Intervenciones', 'Historial recibido por AJAX queda disponible', async e => {
        e.respond(() => Promise.resolve({interventions: JSON.stringify([{id:7,student_name:'Prueba',status:'sent'}])}));
        e.modules.interventions.loadInterventions(); await e.flush();
        assert.equal(e.modules.interventions.getData()[0].id,7);
    });
    await test('Intervenciones', 'JSON inválido del historial se controla', async e => {
        e.respond(() => Promise.resolve({interventions:'invalid'}));
        e.modules.interventions.loadInterventions(); await e.flush();
        assert.equal(e.modules.interventions.getData().length,0);
    });
    await test('Alertas', 'Lista explícita de quienes nunca accedieron', e => {
        e.state.students=[{name:'Nunca',userid:301,interactions:0,moodleLastAccess:0},
            {name:'Activo',userid:302,interactions:1,moodleLastAccess:e.now/1000}];
        const result=e.hooks.alerts.buildSmartAlertData();
        assert(JSON.stringify(result).includes('Nunca'));
    });
    await test('Alertas', 'Finalización H5P por código excluye una falsa entrega pendiente', e => {
        assert(e.hooks.alerts.isSubmitEvent(log(e,{_action_code:'completion_updated',nomedoevento:'Finalización H5P actualizada'})));
    });
    for(const [name,days,property] of [
        ['Caída de participación',[8,8,8,8,8,8,0],'sharpDrop'],
        ['Inactividad temprana',[30,29],'ghosts'],
        ['Acceso simbólico',[4,0],'symbolic'],
        ['Reactivación',[20,0],'reactivated']]) {
        await test('Alertas',name,e=> {
            e.state.logs=days.map(day=>log(e,{_ts:e.now/1000-day*86400}));
            assert.equal(e.hooks.alerts.buildSmartAlertData()[property].length,1);
        });
    }
    await test('Alertas','Actividad de madrugada se calcula en Mérida',e=> {
        e.state.logs=Array.from({length:10},(_,i)=>log(e,{_ts:Date.parse('2026-10-13T07:00:00Z')/1000+i*60}));
        assert.equal(e.hooks.alerts.buildSmartAlertData().nightOwls[0].pct,100);
    });
    await test('Alertas','Días de actividad simbólica se agrupan en Mérida aunque el navegador use UTC',e=> {
        e.state.logs=[log(e,{_ts:Date.parse('2026-10-11T05:30:00Z')/1000}),log(e,{_ts:Date.parse('2026-10-11T06:30:00Z')/1000})];
        assert.equal(e.hooks.alerts.buildSmartAlertData().symbolic[0].days,2);
    });
    await test('Mapa de calor/fechas', 'Medianoche Mérida cambia el día y hora de agrupamiento', e => {
        const before=e.modules.engagementcalc.parseDate({_ts:Date.parse('2026-10-13T05:59:59Z')/1000});
        const after=e.modules.engagementcalc.parseDate({_ts:Date.parse('2026-10-13T06:00:00Z')/1000});
        assert.equal(e.store.dateParts(before).hour,23); assert.equal(e.store.dateParts(before).day,12);
        assert.equal(e.store.dateParts(after).hour,0); assert.equal(e.store.dateParts(after).day,13);
        assert.equal(e.hooks.teacherfeedback.localDateKey(before),'2026-10-12');
    });
    await test('Participación', 'Calificación y puntuación nunca salen de límites válidos', e => {
        const rows=Array.from({length:40},(_,i)=>log(e,{_ts:e.now/1000-i*3600,_action_code:'submitted'}));
        const result=e.modules.engagementcalc.calculateForStudent('Estudiante Prueba','test@example.invalid',rows,[]);
        assert(Number.isFinite(result.score)); assert(result.score>=0 && result.score<=100);
    });
    await test('Lista de clase', 'Progreso académico no ejecuta HTML de nombres de actividades', e => {
        const grades=[{__mwa_type__:'activity_names',act_1:'<img src=x onerror=alert(1)>',act_cmid_1:10,act_module_1:'assign'},
            {'First name':'Estudiante','Last name':'Prueba',act_1:0,act_current_1:1}];
        const html=e.hooks.classlist.buildActDots('Estudiante Prueba',grades);
        assert(!html.includes('<img src=x')); assert(html.includes('&lt;img'));
    });
    await test('Reporte docente', 'CMID distinto no se confunde con un nombre coincidente', e => {
        assert.equal(!!e.hooks.teacherfeedback.sameTarget(log(e,{_cmid:10,contextodoevento:'Tarea repetida'}),{cmid:20,name:'Tarea repetida'}),false);
    });
    await test('Reporte docente', 'Un evento que no es acceso no completa un objetivo de recurso', e => {
        const row={userid:123,student_name:'Estudiante Prueba',student_email:'test@example.invalid',snapshot_timecreated:e.now/1000-60,
            _reason_code:'low',snapshot_data:'{}',target_type:'resource_access',target_items:JSON.stringify([{cmid:10,name:'Archivo'}])};
        const result=e.hooks.teacherfeedback.analyseRow(row,{students:[],grades:[],logs:[log(e,{_modtype:'resource',
            _action_code:'deleted',nomedoevento:'Contenido eliminado',contextodoevento:'Archivo'})]},{});
        assert.equal(result.reached,false);
    });
    await test('Intervenciones', 'Motivos históricos pt/en/es corresponden al mismo código', e => {
        for(const label of ['Dificuldade acadêmica','Academic difficulty','Dificultad académica']) assert.equal(e.hooks.interventions.reasonBucket(label),'difficult');
    });
    await test('Reporte docente', 'No cuenta eventos anteriores ni de otro estudiante', e => {
        const captured=e.now/1000-3600;
        const row={userid:123,student_name:'Estudiante Prueba',student_email:'test@example.invalid',snapshot_timecreated:captured,
            _reason_code:'never',snapshot_data:'{}'};
        const result=e.hooks.teacherfeedback.analyseRow(row,{students:[],grades:[],logs:[log(e,{_ts:captured-1}),
            log(e,{nomecompleto:'Otra',email:'other@example.invalid'}),log(e)]},{});
        assert.equal(result.after.length,1); assert.equal(result.response,true); assert.equal(result.reached,true);
    });
    await test('Reporte docente', 'Un código de finalización H5P cuenta aunque la etiqueta cambie', e => {
        assert(e.hooks.teacherfeedback.isSubmission(log(e,{_action_code:'completion_updated',nomedoevento:'Finalización H5P actualizada'})));
    });
    await test('Reporte docente', 'JSON histórico inválido no rompe el reporte', e => {
        assert.equal(Object.keys(e.hooks.teacherfeedback.parseSnapshot({snapshot_data:'not-json'})).length,0);
    });
    for(const [item,expected] of [[{reached:true,response:true},'integral'],[{reached:false,response:true},'partial'],
        [{reached:null,response:false},'awaiting']]) {
        await test('Reporte docente',`Estado de seguimiento ${expected}`,e=>assert.equal(e.hooks.teacherfeedback.progressState(item),expected));
    }
    await test('Reporte docente','Estudiante con varias intervenciones no duplica la población',e=> {
        const groups=e.hooks.teacherfeedback.groupStudents([
            {key:'id:123',raw:{student_name:'Prueba'},captured:100,response:false,reached:false},
            {key:'id:123',raw:{student_name:'Prueba'},captured:200,response:true,reached:true}]);
        assert.equal(groups.length,1);assert.equal(groups[0].latest.captured,200);assert.equal(groups[0].reached,true);
    });
    for(const area of ['classlist','grades','activities','alerts','studentprofile','interventions','teacherfeedback']) {
        await test('Seguridad HTML', `Escapado en ${area}`, e => {
            const escaped=e.hooks[area].esc('<script>"x"</script>'); assert(!escaped.includes('<script>')); assert(escaped.includes('&lt;'));
        });
    }
    const summary={passed:results.filter(r=>r.status==='PASS').length,failed:results.filter(r=>r.status==='FAIL').length,results};
    if(process.argv[2]) fs.writeFileSync(process.argv[2],Buffer.from(JSON.stringify(summary,null,2)+'\n'));
    console.log(`Functional tests: ${summary.passed} PASS, ${summary.failed} FAIL`);
    for(const result of results.filter(result => result.status === 'FAIL')) {
        console.log(`FAIL [${result.area}] ${result.name}: ${result.error}`);
    }
    process.exitCode=summary.failed ? 1 : 0;
})();
