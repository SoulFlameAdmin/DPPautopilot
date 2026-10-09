'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {parseCsv}=require('../../api/_ai_document_intelligence.js');
test('CSV parser',()=>{assert.equal(parseCsv('company\nAcme')[1].values[0],'Acme');});
