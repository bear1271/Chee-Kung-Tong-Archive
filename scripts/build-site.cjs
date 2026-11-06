const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {createHash} = require('node:crypto');

const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const hash = data => createHash('sha256').update(data).digest('hex');
const check = process.argv.includes('--check');
function output(name, content) {
    if (check) assert.equal(read(name), content, 'Rebuild required: ' + name);
    else fs.writeFileSync(path.join(root, name), content, 'utf8');
}
function parseAssignment(text, prefix, terminator) {
    assert.ok(text.startsWith(prefix) && text.endsWith(terminator), prefix);
    return JSON.parse(text.slice(prefix.length, -terminator.length));
}

const dist = 'site/dist/';
const catalogue = parseAssignment(read(dist+'catalogue.js'), 'window.CKT_DATA=', ';');
const gazetteerFile = read(dist+'gazetteer.js');
const binding = ';window.CKT_COMPAT=';
const boundary = gazetteerFile.lastIndexOf(binding);
assert.ok(boundary > 0, 'Gazetteer compatibility manifest missing');
const gazetteer = parseAssignment(gazetteerFile.slice(0,boundary+1), 'window.CKT_GAZETTEER=', ';');
const compatibility = parseAssignment(gazetteerFile.slice(boundary), binding, ';');
assert.deepEqual(compatibility,{
    catalogue:hash(JSON.stringify(catalogue)), contract:'ckt-content-v1',
    gazetteer:hash(JSON.stringify(gazetteer)),
},'Catalogue or gazetteer snapshot failed integrity check');

const ids = new Set(catalogue.records.map(record=>record.id));
assert.equal(ids.size,catalogue.records.length,'Duplicate catalogue ID');
assert.equal(ids.size,gazetteer.records.length,'Mismatched catalogue coverage');
for (const record of gazetteer.records) assert.ok(ids.has(record.id),'Unknown gazetteer record ID');

const maps = JSON.parse(read('data/historical_maps/manifest.json'));
for (const map of maps) {
    assert.match(map.image,/^assets\/historical\/[a-z0-9-]+\.jpg$/);
    assert.equal(hash(fs.readFileSync(path.join(root,dist,map.image))),map.sha256,map.image);
}
const app = read('site/candidate/app.js').replace(/\r\n/g,'\n')
    .replace('__CKT_CHINESE_FORMS__',()=>read('site/candidate/chinese-forms.json').trim())
    .replace('__CKT_CATALOGUE_SHA__',compatibility.catalogue)
    .replace('__CKT_GAZETTEER_SHA__',compatibility.gazetteer);
const notice = read('site/candidate/ICU-LICENSE.txt').trim();
output(dist+'app.js','/*\n'+notice+'\n*/\n'+app);
output(dist+'index.html',read('site/candidate/index.html'));
output(dist+'historical-maps.js','window.CKT_HISTORICAL_MAPS='+JSON.stringify(maps)+';\n');
console.log('Verified '+ids.size+' catalogue records and '+maps.length+' historical maps.');
