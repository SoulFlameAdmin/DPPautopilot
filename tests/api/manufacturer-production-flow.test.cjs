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

const detailOps=fs.readFileSync(path.join(__dirname,'../../assets/csp/manufacturer-ops-inline-1.js'),'utf8');

test('DRAFT QR and public-link availability depends on ACTIVE state, not mere passport existence',()=>{
  assert.match(detailOps,/const isPublic=!!p&&p\.status==="active"/);
  assert.match(detailOps,/if\(isPublic\)\{qr\.src=/);
  assert.match(detailOps,/pub\.href=isPublic\?/);
});

test('selected DPP capacity never falls back to different master SKU capacity',()=>{
  assert.match(detailOps,/p\?\.public_payload\?\.model\?\.rated_capacity_ah/);
  assert.match(detailOps,/Verifying passport capacity/);
  assert.match(detailOps,/priorPassportId!==/);
  assert.match(detailOps,/priorPassportStatus!==/);
});

function selectedDetailHarness(){
  const nodes=new Map();
  const el=k=>{if(!nodes.has(k))nodes.set(k,{textContent:'',value:'',disabled:false,href:'#',hidden:true,src:'',removeAttribute(){this.src='';}});return nodes.get(k)};
  const start=detailOps.indexOf('function setDetail(p){');
  const end=detailOps.indexOf('async function saveSelectedPassportPilotUpdate()',start);
  assert.ok(start>=0&&end>start);
  const create=new Function('document','itemById','itemModel','activeOrg','fmt','safeText','canWrite','$',
    'let selectedPassport=null;'+detailOps.slice(start,end)+';return setDetail');
  const set=create({querySelectorAll:()=>[]},()=>({model_id:'m'}),()=>({
    rated_capacity_ah:100,canonical_data:{},model_identifier:'SKU',category:'industrial'
  }),{name:'Test company'},()=>'',x=>String(x),()=>true,el);
  return {set,el};
}

test('real selected-DPP function: DRAFT never requests QR, ACTIVE uses its own 101Ah',()=>{
  const h=selectedDetailHarness();
  h.set({passport_id:'P1',battery_item_id:'B1',unique_identifier:'BAT-1',status:'draft'});
  assert.equal(h.el('#detailQrImage').src,'');
  assert.equal(h.el('#detailQrImage').hidden,true);
  assert.equal(h.el('#detailPublicLink').href,'#');
  h.set({passport_id:'P1',battery_item_id:'B1',unique_identifier:'BAT-1',status:'active',
    public_payload:{model:{rated_capacity_ah:101}}});
  assert.equal(h.el('#detailQrImage').src,'/api/qr?identifier=BAT-1');
  assert.equal(h.el('#detailFieldCapacity').textContent,'101 Ah');
  assert.equal(h.el('#detailPilotCapacity').value,'101');
});

test('real selected-DPP function: switching passports cannot copy previous edit capacity',()=>{
  const h=selectedDetailHarness();
  h.set({passport_id:'P1',battery_item_id:'B1',unique_identifier:'BAT-1',status:'active',
    public_payload:{model:{rated_capacity_ah:101}}});
  h.el('#detailPilotCapacity').value='120';
  h.set({passport_id:'P2',battery_item_id:'B2',unique_identifier:'BAT-2',status:'active'});
  assert.equal(h.el('#detailPilotCapacity').value,'');
  assert.equal(h.el('#detailFieldCapacity').textContent,'Verifying passport capacity…');
  h.set({passport_id:'P3',battery_item_id:'B3',unique_identifier:'BAT-3',status:'draft'});
  assert.equal(h.el('#detailQrImage').src,'');
  assert.equal(h.el('#detailPrintButton').disabled,true);
});
