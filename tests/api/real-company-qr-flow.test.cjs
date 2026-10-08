'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'../..');
const html=fs.readFileSync(path.join(root,'live/manufacturer.html'),'utf8');
const dashboard=fs.readFileSync(path.join(root,'assets/csp/manufacturer-inline-1.js'),'utf8');
const entry=fs.readFileSync(path.join(root,'assets/csp/manufacturer-entry.js'),'utf8');
const detailHardening=fs.readFileSync(path.join(root,'assets/csp/manufacturer-detail-hardening.js'),'utf8');
const ops=fs.readFileSync(path.join(root,'assets/csp/manufacturer-ops-inline-1.js'),'utf8');
const passportApi=fs.readFileSync(path.join(root,'api/passport.js'),'utf8');
const carriersApi=fs.readFileSync(path.join(root,'api/carriers.js'),'utf8');
const qrApi=fs.readFileSync(path.join(root,'api/qr.js'),'utf8');

test('real company dashboard exposes non-LMT model data and technical QR pilot controls',()=>{
  for(const id of [
    'modelCategory','manufacturerContact','manufacturerAddress','manufacturePlace',
    'manufactureMonth','batteryWeightKg','batteryCapacityAh','batteryChemistry',
    'batteryVoltageV','pilotModel','pilotBatteryIdentifier','publishTechnicalPilot'
  ]) assert.match(html,new RegExp('id="'+id+'"'));
  assert.match(html,/regulatory_compliance=false/);
  assert.match(html,/Technical QR Pilot/);
});

test('real company flow is tenant-backed and never demo/local product storage',()=>{
  assert.match(dashboard,/organizationRpc\("dpp_api_organizations_list",\{\}\)/);
  assert.match(dashboard,/api\("\/api\/models"/);
  assert.match(dashboard,/api\("\/api\/items"/);
  assert.match(dashboard,/const GOOGLE_STORAGE="dpp_google_session_v1"/);
  assert.doesNotMatch(dashboard,/localStorage\.(?:setItem|getItem)\([^\n;]*(?:demo|model|item|product|battery|passport|batch)/i);
  assert.match(html,/REAL TENANT DATA · NO DEMO STORAGE/);
});

test('non-LMT flow creates real item then publishes active technical passport',()=>{
  assert.match(dashboard,/model\.category==="light_means_of_transport"/);
  assert.match(dashboard,/api\("\/api\/items",\{method:"POST"/);
  assert.match(dashboard,/action:"publish_technical_pilot"/);
  assert.match(passportApi,/dpp_api_technical_pilot_publish/);
  assert.match(passportApi,/regulatory_compliance/);
});

test('technical pilot binds QR and exposes print\/scan path',()=>{
  assert.match(dashboard,/ensurePilotQrCarrier/);
  assert.match(dashboard,/api\("\/api\/carriers"/);
  assert.match(dashboard,/carrier_kind:"qr"/);
  assert.match(dashboard,/\/passport\?identifier=/);
  assert.match(dashboard,/&carrier=qr/);
  assert.match(dashboard,/\/qr\?identifier=/);
  assert.match(carriersApi,/dpp_api_carrier_bind_secure/);
  assert.match(qrApi,/passport/);
  assert.match(html,/Bind QR \+ Print selected/);
  assert.match(ops,/\$\("#printSelected"\)\.addEventListener/);
  assert.match(ops,/printPassports\(selectedPassports\(\),\{bind:true\}\)/);
});

test('DRAFT passport cannot assign or load QR before ACTIVE state',()=>{
  const hardeningPos=entry.indexOf('/assets/csp/manufacturer-detail-hardening.js');
  const opsPos=entry.indexOf('/assets/csp/manufacturer-ops-inline-1.js');
  assert.ok(hardeningPos>=0&&opsPos>hardeningPos,'detail hardening must load before operations bundle');
  assert.match(detailHardening,/Object\.defineProperty\(qr,"src"/);
  assert.match(detailHardening,/if\(!active\(\)\)/);
  assert.match(detailHardening,/this\.removeAttribute\("src"\)/);
  assert.match(detailHardening,/QR available after activation/);
});

test('selected DPP detail refreshes passport-specific capacity from public_payload',()=>{
  assert.match(detailHardening,/\/api\/passport\?id=/);
  assert.match(detailHardening,/full\?\.public_payload\?\.model\?\.rated_capacity_ah/);
  assert.match(detailHardening,/selectedPassportId\(\)!==passportId/);
  assert.match(detailHardening,/capacityNode\.textContent=value\+" Ah"/);
  assert.match(detailHardening,/capacityInput&&active\(\)/);
});

test('LMT remains separated from technical pilot shortcut',()=>{
  assert.match(dashboard,/Technical QR Pilot е само за non-LMT model/);
  assert.match(dashboard,/За LMT използвай strict readiness flow/);
  assert.match(dashboard,/model\.category!=="light_means_of_transport"/);
});
