'use strict';
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
let store;
const warnings = [];
vm.runInNewContext(fs.readFileSync(require('path').join(__dirname, '../amd/src/dashboardstore.js'), 'utf8'), {
    define: (_, factory) => { store = factory(); },
    console: {warn: (...args) => warnings.push(args)}, Date, Intl, Promise
});
store.configure({timezone: 'America/Merida', locale: 'es-MX'}, {close: 'Cerrar'}, null);
const midnight = new Date('2026-10-13T06:00:00Z');
assert.equal(store.dateParts(midnight).hour, 0);
assert.equal(store.dateParts(midnight).day, 13);
assert.equal(store.dateParts(new Date('2026-10-13T05:59:59Z')).day, 12);
assert.equal(store.dateParts(midnight).weekday, 2);
assert.equal(store.parseLogDate({_ts: midnight.getTime() / 1000}).getTime(), midnight.getTime());
assert.equal(store.parseLogDate({hora: '13/10/26, 00:00'}), null);
assert.equal(store.tr('close', 'Close'), 'Cerrar');
assert.equal(store.tr('missing', 'English'), 'missing');
store.tr('missing');
assert.equal(warnings.length, 1);
assert(store.formatTime(midnight).includes('00:00'));
assert(!/AM|PM/i.test(store.formatDateTime(midnight)));
console.log('Locale: midnight, calendar day, Unix timestamp, 24h and one warning per key OK');
