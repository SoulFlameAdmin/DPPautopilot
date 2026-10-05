'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const XLSX=require('../../vendor/xlsx.full.min.js');

test('vendored SheetJS parser is pinned and can round-trip XLSX rows',()=>{
  assert.equal(XLSX.version,'0.18.5');
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([
    ['manufacturer_name','model_id','category','unique_identifier'],
    ['SoulFlame','SF-LMT-01','light_means_of_transport','BAT-XLSX-001'],
    ['SoulFlame','SF-LMT-01','light_means_of_transport','BAT-XLSX-002']
  ]),'Batteries');
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['note'],['secondary sheet']]),'Notes');

  const bytes=XLSX.write(wb,{type:'array',bookType:'xlsx'});
  const parsed=XLSX.read(bytes,{
    type:'array',
    dense:true,
    cellFormula:false,
    cellHTML:false,
    cellStyles:false,
    cellDates:false,
    sheetRows:1002
  });
  assert.deepEqual(parsed.SheetNames,['Batteries','Notes']);
  const rows=XLSX.utils.sheet_to_json(parsed.Sheets.Batteries,{header:1,raw:false,defval:'',blankrows:false});
  assert.equal(rows.length,3);
  assert.equal(rows[1][3],'BAT-XLSX-001');
  assert.equal(rows[2][3],'BAT-XLSX-002');
});

test('manufacturer production page self-hosts XLSX parser and exposes worksheet controls',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../../live/manufacturer.html'),'utf8');
  const ops=fs.readFileSync(path.join(__dirname,'../../assets/csp/manufacturer-ops-inline-1.js'),'utf8');
  assert.match(html,/src="\/vendor\/xlsx\.full\.min\.js"/);
  assert.match(html,/id="xlsxFile"/);
  assert.match(html,/id="xlsxSheet"/);
  assert.doesNotMatch(html,/cdn\.jsdelivr\.net\/npm\/xlsx/);
  assert.match(ops,/function loadXlsxFile\(/);
  assert.match(ops,/function switchXlsxSheet\(/);
  assert.match(ops,/sheetRows:1002/);
  assert.match(ops,/Максимумът е 1000 data rows/);
  assert.match(ops,/Максимумът е 100 колони/);
});
