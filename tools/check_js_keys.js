'use strict';
const fs = require('fs');
const path = require('path');
const {root, catalog, clientKeys} = require('./lang_catalog');
const english = catalog('en'), exposed = clientKeys();
let errors = 0, uses = 0;
function check(key, file, source, offset) {
    uses++;
    if (!english.has(key) || !exposed.has(key)) {
        console.error(`${file}:${source.slice(0, offset).split('\n').length}: ${key} missing in ${!english.has(key) ? 'lang/en' : 'string_keys()'}`);
        errors++;
    }
}
for (const file of fs.readdirSync(path.join(root, 'amd/src')).filter(file => file.endsWith('.js'))) {
    const source = fs.readFileSync(path.join(root, 'amd/src', file), 'utf8');
    for (const match of source.matchAll(/\b(?:tr|trN|tip)\(\s*['"]([a-z][a-z0-9_]*)['"]/g)) {
        check(match[1], `amd/src/${file}`, source, match.index);
    }
}
console.log(`Literal client keys: ${uses} uses, ${errors} errors (computed keys require review)`);
process.exitCode = errors ? 1 : 0;
