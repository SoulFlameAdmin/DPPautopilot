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

const capacityHardening=fs.readFileSync(path.join(__dirname,'../../assets/csp/manufacturer-detail-hardening.js'),'utf8');

function capacitySyncHarness({focused=false,resolver}={}){
  const begin=capacityHardening.indexOf('async function syncPassportSpecificDetail(){');
  const end=capacityHardening.indexOf('\nif(qrState)qrState.id',begin);
  assert.ok(begin>=0&&end>begin,'actual async passport detail function must be present');
  const input={value:'125'};
  const display={textContent:'Verifying passport capacity…'};
  const document={activeElement:focused?input:null};
  let currentId='P-001';
  const apiFetch=resolver|| (async()=>({ok:true,json:async()=>({data:{public_payload:{model:{rated_capacity_ah:101}}}})}));
  const init=new Function('selectedPassportId','accessToken','setQrState','fetch','capacityNode','capacityInput','active','document',
    'let requestVersion=0;let dirtyCapacityPassportId="";'+capacityHardening.slice(begin,end)+';return syncPassportSpecificDetail;');
  const sync=init(()=>currentId,()=>'test-token',()=>{},apiFetch,display,input,()=>true,document);
  return {sync,input,display,setId(value){currentId=value;}};
}

test('async passport readback never overwrites a capacity value being typed',async()=>{
  const h=capacitySyncHarness({focused:true});
  await h.sync();
  assert.equal(h.display.textContent,'101 Ah');
  assert.equal(h.input.value,'125');
});

test('async passport readback initializes unfocused capacity and ignores stale selection',async()=>{
  const h=capacitySyncHarness();
  await h.sync();
  assert.equal(h.display.textContent,'101 Ah');
  assert.equal(h.input.value,'101');
  let respond;
  const delayed=capacitySyncHarness({resolver:()=>new Promise(resolve=>{respond=resolve;})});
  const pending=delayed.sync();
  delayed.setId('P-002');
  respond({ok:true,json:async()=>({data:{public_payload:{model:{rated_capacity_ah:900}}}})});
  await pending;
  assert.equal(delayed.input.value,'125');
});

function pilotUpdateRaceHarness({returnWrongIdentity=false}={}){
  const start=detailOps.indexOf('async function saveSelectedPassportPilotUpdate(){');
  const end=detailOps.indexOf('const detailSavePilotUpdate=',start);
  assert.ok(start>=0&&end>start,'actual save function must be present');
  const a={passport_id:'PASS-A',status:'active',unique_identifier:'BAT-A'};
  const b={passport_id:'PASS-B',status:'active',unique_identifier:'BAT-B'};
  const nodes=new Map([
    ['#detailPilotCapacity',{value:'125'}],
    ['#detailSavePilotUpdate',{disabled:false}],
    ['#detailEditResult',{textContent:'',className:''}]
  ]);
  const $=name=>nodes.get(name);
  const requests=[];
  let resolveGet;
  const api=async(path,options)=>{
    requests.push({path,options});
    if(options?.method==='PATCH')return {data:{passport_id:'PASS-A'}};
    return new Promise(resolve=>{resolveGet=resolve;});
  };
  let selectAfterLoad=[];
  const factory=new Function('$','canWrite','setText','api','loadBase','setDetail',
    'let passports=[];let selectedPassport={passport_id:"PASS-A",status:"active",unique_identifier:"BAT-A"};'+
    detailOps.slice(start,end)+
    ';return {save:saveSelectedPassportPilotUpdate,'+
    'select:(p)=>{selectedPassport=p;},'+
    'selected:()=>selectedPassport,passports:(ps)=>{passports=ps;}};');
  let harness;
  const reload=async()=>{harness.passports([a,b]);};
  harness=factory($,()=>true,(el,msg,kind)=>{el.textContent=msg;el.kind=kind;},
    api,reload,p=>{selectAfterLoad.push(p.passport_id);harness.select(p)});
  return {harness,requests,nodes,a,b,getRespond(){
      assert.equal(typeof resolveGet,'function');
      resolveGet({data:{passport_id:returnWrongIdentity?'PASS-B':'PASS-A',updated_at:'2026-10-08T21:00:00Z'}});
    },selectAfterLoad};
}

test('pilot PATCH cannot steal selection or attribute response to another DPP after async GET',async()=>{
  const h=pilotUpdateRaceHarness();
  const saving=h.harness.save();
  h.harness.select(h.b); // user switched to another passport while first GET was pending
  h.getRespond();
  await saving;
  assert.equal(h.requests.length,2);
  assert.equal(h.requests[0].path,'/api/passport?id=PASS-A');
  assert.equal(h.requests[1].options.body.id,'PASS-A');
  assert.equal(h.requests[1].options.body.capacity_ah,125);
  assert.equal(h.harness.selected().passport_id,'PASS-B');
  assert.deepEqual(h.selectAfterLoad,[]);
  assert.match(h.nodes.get('#detailEditResult').textContent,/UPDATED · BAT-A/);
  assert.match(h.nodes.get('#detailEditResult').textContent,/Currently viewing a different passport/);
});

test('pilot PATCH refuses mismatched identity from prior detail GET before any write',async()=>{
  const h=pilotUpdateRaceHarness({returnWrongIdentity:true});
  const saving=h.harness.save();
  h.getRespond();
  await saving;
  assert.equal(h.requests.length,1,'wrong passport detail must fail before PATCH');
  assert.equal(h.nodes.get('#detailEditResult').kind,'bad');
  assert.match(h.nodes.get('#detailEditResult').textContent,/identity changed/);
});
