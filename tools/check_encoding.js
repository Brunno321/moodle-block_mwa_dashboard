'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process');
const root = path.resolve(__dirname, '..');
const files = cp.execFileSync('git', ['-c', `safe.directory=${root.replace(/\\/g, '/')}`,
    'diff', '--name-only', 'a2f710c'], {cwd: root, encoding: 'utf8'}).trim().split(/\r?\n/).filter(Boolean);
let bom = 0, mojibake = 0, oldZone = 0;
for (const file of files) {
    const bytes = fs.readFileSync(path.join(root, file));
    const text = bytes.toString('utf8');
    if (bytes.subarray(0, 3).equals(Buffer.from([239, 187, 191]))) { console.error(`${file}: BOM`); bom++; }
    const corrupt = text.match(/\u00c3|\u00e2\u20ac/g) || [];
    if (corrupt.length) { console.error(`${file}: ${corrupt.length} mojibake markers`); mojibake += corrupt.length; }
    // Avoid introducing the prohibited literal in this checker itself.
    if (text.includes(['Sao', 'Paulo'].join('_'))) { console.error(`${file}: old timezone`); oldZone++; }
}
console.log(`Encoding: ${files.length} changed files, ${bom} BOM, ${mojibake} mojibake markers, ${oldZone} old timezones`);
process.exitCode = bom + mojibake + oldZone ? 1 : 0;
