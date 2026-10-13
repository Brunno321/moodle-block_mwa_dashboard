// Read PHP language assignments without executing Moodle or requiring dependencies.
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
function catalog(language) {
    const source = fs.readFileSync(path.join(root, 'lang', language, 'block_mwa_dashboard.php'), 'utf8');
    const values = new Map();
    const expression = /\$string\[['"]([^'"]+)['"]\]\s*=\s*(['"])((?:\\[\s\S]|(?!\2)[^\\])*)\2\s*;/g;
    for (const match of source.matchAll(expression)) {
        values.set(match[1], match[3].replace(/\\(['\\])/g, '$1'));
    }
    return values;
}
function clientKeys() {
    const source = fs.readFileSync(path.join(root, 'classes/output/dashboard_page.php'), 'utf8');
    const start = source.indexOf('protected function string_keys()');
    const end = source.indexOf('];', start);
    return new Set([...source.slice(start, end).matchAll(/'([a-z][a-z0-9_]*)'/g)].map(match => match[1]));
}
module.exports = {root, catalog, clientKeys};
