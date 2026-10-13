'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const {catalog} = require('./lang_catalog');
const root = path.resolve(__dirname, '..');
const now = Date.parse('2026-10-13T18:00:00Z');
class TestDate extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
}
function harness() {
    const nodes = new Map(), memory = new Map(), calls = [], notices = [], hooks = {}, modules = {};
    function node(id) {
        const classes = new Set();
        const element = {id, value: '', textContent: '', innerHTML: '', dataset: {}, style: {}, children: [],
            disabled: false, parentNode: null,
            classList: {add: (...values) => values.forEach(v => classes.add(v)), remove: (...values) => values.forEach(v => classes.delete(v)),
                contains: v => classes.has(v), toggle: v => classes.has(v) ? classes.delete(v) : classes.add(v)},
            appendChild(child) { child.parentNode = this; this.children.push(child); if (child.id) nodes.set(child.id, child); return child; },
            removeChild(child) { this.children = this.children.filter(v => v !== child); child.parentNode = null; },
            replaceChildren(...children) { this.children = children; },
            remove() { if (this.parentNode) this.parentNode.removeChild(this); nodes.delete(this.id); },
            setAttribute(key, value) { this[key] = String(value); }, getAttribute(key) { return this[key] || ''; },
            addEventListener() {}, removeEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; },
            focus() {}, scrollIntoView() {}, click() { if (this.onclick) this.onclick({stopPropagation() {}}); }};
        if (id) nodes.set(id, element);
        return element;
    }
    const document = {body: node('body'), getElementById: id => nodes.get(id) || null,
        createElement: () => node(''), createElementNS: () => node(''), querySelector: () => null,
        querySelectorAll: () => [], addEventListener() {}, removeEventListener() {}};
    const storage = {getItem: key => memory.get(key) || null, setItem: (key, value) => memory.set(key, String(value)), removeItem: key => memory.delete(key)};
    const window = {__tests: hooks, document, location: {href: 'http://test.invalid/blocks/mwa_dashboard/view.php?course=2'},
        localStorage: storage, confirm: () => true, alert: text => notices.push(text), requestAnimationFrame: () => 0,
        matchMedia: () => ({matches: false}), history: {replaceState() {}}, URL};
    const sandbox = {window, document, localStorage: storage, console, Date: TestDate, Intl, URL, Promise, Set, Map,
        Blob, TextEncoder, Uint8Array, ArrayBuffer, setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {},
        requestAnimationFrame: () => 0, confirm: (...args) => window.confirm(...args), prompt: () => null};
    const context = vm.createContext(sandbox);
    function load(name, names = [], marker) {
        let source = fs.readFileSync(path.join(root, 'amd/src', name + '.js'), 'utf8');
        if (marker) {
            if (!source.includes(marker)) throw new Error(`Missing hook anchor for ${name}`);
            const expose = names.map(key => `${JSON.stringify(key)}: typeof ${key} === 'function' ? ${key} : undefined`).join(',');
            source = source.replace(marker, `window.__tests[${JSON.stringify(name)}] = {${expose}};\n` + marker);
        }
        if (name === 'actioncenter') {
            // Observe recipients without opening the bulk UI or changing production files.
            const last = source.lastIndexOf('      openBulkModal(targets);');
            if (last < 0) throw new Error('Bulk recipient hook missing');
            source = source.slice(0, last) + source.slice(last).replace('      openBulkModal(targets);', '      window.__selectedTargets = targets;');
        }
        let exported;
        context.define = (deps, factory) => { exported = factory(...deps.map(dep => {
            if (dep.startsWith('block_mwa_dashboard/')) return modules[dep.split('/').pop()];
            if (dep === 'core/templates') return {render: () => Promise.resolve(''), replaceNodeContents() {}};
            if (dep === 'core/chartjs') return function() { this.destroy = () => {}; };
            return {};
        })); };
        vm.runInContext(source, context, {filename: name + '.js'});
        modules[name] = exported;
        return exported;
    }
    load('classify');
    const store = load('dashboardstore');
    store.windowFacade = () => window;
    const state = {logs: [], grades: [], students: [], activities: []};
    let response = () => Promise.resolve({success: true, status: 'sent', interventions: '[]'});
    const caller = (method, args) => { calls.push({method, args}); return response(method, args); };
    window.MWADashboard = {state, tr: store.tr, callAction: caller};
    store.register('MWADashboard', window.MWADashboard);
    const config = {courseid: 2, wwwroot: 'http://test.invalid', language: 'es_mx', locale: 'es-MX',
        timezone: 'America/Merida', activitylinks: [], reasonaliases: require('../data/reason_aliases.json')};
    store.configure(config, Object.fromEntries(catalog('es_mx')), caller);
    store.notify = (message, type) => notices.push({message, type});
    const definitions = {
        engagementcalc: [],
        actioncenter: ['isNeverAccessed', 'releasedGradeBelowThreshold', 'hasTotalGradeAtOrAboveThreshold', 'hasOverdueDelivery',
            'inactiveForFollowUp', 'isFollowUpStudent', 'buildActivityTargetsForStudent', 'personalizeMessageText'],
        classlist: ['esc', 'presenceInfo', 'calcSessionTimes', 'csvCell', 'buildActDots', 'buildResourceCatalog', 'buildResourceDots',
            'totalGradeBelowCourseThreshold', 'hasTotalGradeAtOrAboveThreshold', 'followUpReasons', 'getAllStudentNames'],
        grades: ['parseGrades', 'buildExportData', 'esc'],
        activities: ['getEventType', 'isSubmission', 'resourceName', 'esc', 'isManagementEvent', 'isH5PActivity', 'buildActMap'],
        alerts: ['parseDate', 'getDaysAgo', 'esc', 'buildSmartAlertData', 'isSubmitEvent', 'isViewEvent'],
        studentprofile: ['esc', 'getAllStudentNames', 'isResourceModule', 'moduleOf', 'studentKey'],
        interventions: ['reasonBucket', 'translateReason', 'personalizeMessage', 'selectedSendType', 'esc', 'fmtDate', 'loadNote'],
        teacherfeedback: ['analyseRow', 'isSubmission', 'isResourceAccess', 'sameTarget', 'progressState', 'parseSnapshot', 'groupStudents', 'esc', 'localDateKey']
    };
    const markers = {actioncenter: 'window.MWAActionCenter = {', classlist: 'window.MWAClassList = {', grades: 'window.MWAGrades = {',
        activities: 'window.MWAActivities = {', alerts: 'window.MWAAlerts = {', studentprofile: 'window.MWAProfile = {',
        interventions: 'window.MWAInterventions = {', teacherfeedback: '    var api = {render: render,'};
    for (const [name, names] of Object.entries(definitions)) load(name, names, markers[name]);
    return {node, nodes, window, store, modules, hooks, state, config, calls, notices, memory, now,
        respond: fn => { response = fn; }, flush: async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); }};
}
module.exports = harness;
