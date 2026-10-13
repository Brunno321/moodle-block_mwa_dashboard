'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.resolve(__dirname, '..');
const failures = [];
if (!fs.existsSync(path.join(root, 'amd/build/classify.min.js'))) failures.push('Missing amd/build/classify.min.js for the new AMD dependency');
let store;
vm.runInNewContext(fs.readFileSync(path.join(root, 'amd/build/dashboardstore.min.js'), 'utf8'), {
    define: (_, factory) => { store = factory(); }, console, Date, Intl, Promise
});
const required = ['tr', 'parseLogDate', 'dateParts', 'formatDate', 'formatTime', 'formatDateTime', 'formatNumber', 'reasonCode'];
const missing = required.filter(name => typeof store[name] !== 'function');
if (missing.length) failures.push('Compiled Store does not implement source APIs: ' + missing.join(', '));
failures.forEach(message => console.log('BLOCKED BUILD: ' + message));
console.log(`AMD package contract: ${failures.length} blockers`);
process.exitCode = failures.length ? 1 : 0;
