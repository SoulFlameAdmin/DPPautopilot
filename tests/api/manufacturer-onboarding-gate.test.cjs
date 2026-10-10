'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const entry=fs.readFileSync(path.join(__dirname,'../../assets/csp/manufacturer-entry.js'),'utf8');
const company=fs.readFileSync(path.join(__dirname,'../../live/company.html'),'utf8');

test('company access routes active tenants into real manufacturer onboarding',()=>{
  assert.match(company,/href="\/dashboard">Настрой DPP системата/);
});

test('manufacturer operations require configured onboarding for authenticated company session',()=>{
  assert.match(entry,/dpp_company_session_v1/);
  assert.match(entry,/fetch\("\/api\/manufacturer-onboarding"/);
  assert.match(entry,/configuration\?\.status==="configured"/);
  assert.match(entry,/location\.replace\("\/dashboard"\)/);
});

test('early access mode stays separate from production onboarding gate',()=>{
  assert.match(entry,/params\.get\("early"\)==="1"/);
  assert.match(entry,/showEarlyAccess\(client\)/);
});
