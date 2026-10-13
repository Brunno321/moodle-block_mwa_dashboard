'use strict';
const {catalog} = require('./lang_catalog');
const languages = ['en', 'es', 'es_mx', 'pt_br'];
const catalogs = languages.map(catalog);
const placeholders = value => (value.match(/\{\$a(?:->\w+)?\}|\{[A-Za-z]\w*\}/g) || []).sort().join('|');
let errors = 0;
for (let i = 1; i < languages.length; i++) {
    for (const [key, value] of catalogs[0]) {
        if (!catalogs[i].has(key)) {
            console.error(`${languages[i]}: missing ${key}`); errors++;
        } else if (placeholders(value) !== placeholders(catalogs[i].get(key))) {
            console.error(`${languages[i]}: placeholders differ for ${key}: ${placeholders(value)} / ${placeholders(catalogs[i].get(key))}`); errors++;
        }
    }
    for (const key of catalogs[i].keys()) {
        if (!catalogs[0].has(key)) { console.error(`${languages[i]}: extra ${key}`); errors++; }
    }
}
languages.forEach((language, i) => console.log(`${language}: ${catalogs[i].size} keys`));
console.log(`Language parity: ${errors} errors`);
process.exitCode = errors ? 1 : 0;
