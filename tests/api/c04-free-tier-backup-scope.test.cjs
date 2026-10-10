'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),
 fs=require('node:fs'),path=require('node:path');
const sql=fs.readFileSync(path.resolve(__dirname,'../../scripts/c04-storage-backup-scope-select-only.sql'),'utf8');
const doc=fs.readFileSync(path.resolve(__dirname,'../../docs/c04-free-tier-storage-recovery-evidence-20261010.md'),'utf8');
const commands=sql.replace(/^\s*--[^\n]*/gm,'').split(';').map(q=>q.trim()).filter(Boolean);
test('only three standalone read-only SELECT statements can run',()=>{
 assert.equal(commands.length,3);
 assert.ok(commands.every(q=>/^SELECT\s/i.test(q)));
 const noQuotedValues=commands.join(' ').replace(/'(?:''|[^'])*'/g,"''");
 assert.doesNotMatch(noQuotedValues,/\b(INSERT|UPDATE|DELETE|ALTER|DROP|CREATE|TRUNCATE|GRANT|REVOKE|COPY|EXECUTE|CALL|DO|BEGIN|COMMIT)\b/i);
});
test('the inventory covers all shared project Storage buckets and metadata only',()=>{
 assert.match(sql,/FROM storage\.buckets b LEFT JOIN storage\.objects o ON o\.bucket_id=b\.id/);
 assert.match(sql,/GROUP BY b\.id,b\.public/);
 assert.doesNotMatch(sql,/\bo\.name\b|storage\.get_object|storage\.download|pg_read_file|pg_ls_dir/i);
});
test('the report clearly says metadata is neither real backup nor physical object checksum',()=>{
 for(const phrase of ['98 objects','108,414,143','119,893,139','Free','C04 remains RED',
  'no encrypted real logical export','no Storage object-byte export','no isolated real DB+Storage restore']){
  assert.ok(doc.includes(phrase),'Missing preflight finding or release caveat: '+phrase);
 }
});
test('the report requires explicit approval and acknowledges cross-app shared Storage scope',()=>{
 assert.match(doc,/explicit human owner authorization/);
 assert.match(doc,/non-DPP apps share the project/);
 assert.match(doc,/private buckets/);
});
