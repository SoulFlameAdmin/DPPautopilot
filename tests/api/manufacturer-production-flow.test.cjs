'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const manufacturer=fs.readFileSync(path.join(__dirname,'../../assets/csp/manufacturer-inline-1.js'),'utf8');
const provision=fs.readFileSync(path.join(__dirname,'../../api/provision.js'),'utf8');
const batch=fs.readFileSync(path.join(__dirname,'../../api/batch-provision.js'),'utf8');

test('manufacturer production UI provisions the selected stored battery category',()=>{
  assert.match(manufacturer,/category:model\.category/);
  assert.match(manufacturer,/showProvision\(response\.data,model\)/);
  assert.doesNotMatch(manufacturer,/if\(!model\|\|model\.category!=="light_means_of_transport"\|\|!identifier\)/);
});

test('single and batch server APIs call generic manufacturer provisioning RPCs',()=>{
  assert.match(provision,/dpp_api_battery_provision/);
  assert.match(batch,/dpp_api_battery_batch_provision/);
  assert.doesNotMatch(provision,/rpc\/dpp_api_scooter_battery_provision/);
  assert.doesNotMatch(batch,/rpc\/dpp_api_scooter_battery_batch_provision/);
});

test('non-LMT draft can only become a technical pilot through an explicit user action',()=>{
  assert.match(manufacturer,/Publish technical pilot →/);
  assert.match(manufacturer,/activateProvisionedTechnicalPilot/);
  assert.match(manufacturer,/action:"publish_technical_pilot"/);
  assert.match(manufacturer,/regulatory_compliance!==false/);
  assert.match(manufacturer,/published\.passport_id!==data\.passport_id/);
});

test('LMT production cannot use the technical-pilot shortcut',()=>{
  assert.match(manufacturer,/model\.category==="light_means_of_transport"\)return/);
  assert.match(manufacturer,/Technical QR Pilot е само за non-LMT model/);
});

test('manufacturer dashboard safely recovers one inactive membership but never guesses among multiple tenants',()=>{
  assert.match(manufacturer,/if\(!activeOrg&&orgs\.length===1\)/);
  assert.match(manufacturer,/organizationRpc\("dpp_api_tenant_context_set",\{p_organization_id:orgs\[0\]\.organization_id\}\)/);
  assert.match(manufacturer,/if\(orgs\.length>1\)showGate/);
  assert.match(manufacturer,/няколко фирмени пространства/);
});
