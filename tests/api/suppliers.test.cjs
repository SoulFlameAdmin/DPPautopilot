'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const handler=require('../../api/suppliers.js');

function makeRes(){
  return {statusCode:0,headers:{},body:'',
    setHeader(name,value){this.headers[String(name).toLowerCase()]=value;},
    end(value){this.body=value||'';}
  };
}
function req(method,body=null,query={},auth='Bearer test-token'){
  return {method,body,query,headers:auth?{authorization:auth}:{}};
}
function setEnv(){
  const oldUrl=process.env.SUPABASE_URL, oldKey=process.env.SUPABASE_ANON_KEY;
  process.env.SUPABASE_URL='https://example.supabase.co';
  process.env.SUPABASE_ANON_KEY='anon-key';
  return ()=>{
    if(oldUrl===undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL=oldUrl;
    if(oldKey===undefined) delete process.env.SUPABASE_ANON_KEY; else process.env.SUPABASE_ANON_KEY=oldKey;
  };
}
const supplierId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const modelId='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const packageId='cccccccc-cccc-4ccc-8ccc-cccccccccccc';

function supplier(overrides={}){
  return {
    id:supplierId,external_ref:'SUP-1',legal_name:'Cells GmbH',status:'active',
    package_count:2,missing_count:1,last_package_at:'2026-10-02T00:00:00Z',
    created_at:'2026-10-01T00:00:00Z',updated_at:'2026-10-01T00:00:00Z',...overrides
  };
}
function pkg(overrides={}){
  return {
    id:packageId,supplier_id:supplierId,subject_kind:'component',subject_ref:'cell:NMC-21700',
    model_id:modelId,item_id:null,component_ref:'CELL-01',material_ref:null,
    verification_status:'unverified',supersedes_id:null,
    source_date:'2026-10-02T00:00:00Z',created_at:'2026-10-02T00:00:01Z',...overrides
  };
}
function verification(overrides={}){
  return {
    id:'dddddddd-dddd-4ddd-8ddd-dddddddddddd',package_id:packageId,status:'verified',
    evidence_ref:'supplier-evidence:sha256:abc',note:null,recorded_at:'2026-10-02T00:01:00Z',...overrides
  };
}

test('suppliers requires bearer auth',async()=>{
  const original=global.fetch; let called=false;
  global.fetch=async()=>{called=true;throw new Error('unexpected');};
  try{
    const res=makeRes(); await handler(req('GET',null,{},null),res);
    assert.equal(res.statusCode,401); assert.equal(called,false);
  }finally{global.fetch=original;}
});

test('GET suppliers uses tenant-scoped list RPC',async()=>{
  const original=global.fetch, restore=setEnv(); let seen;
  global.fetch=async(url,options)=>{seen={url,options};return {ok:true,async json(){return [supplier()];}};};
  try{
    const res=makeRes(); await handler(req('GET'),res);
    assert.equal(res.statusCode,200);
    assert.equal(seen.url,'https://example.supabase.co/rest/v1/rpc/dpp_api_suppliers_list');
    assert.equal(JSON.parse(res.body).data[0].missing_count,1);
  }finally{global.fetch=original;restore();}
});

test('create supplier trims input and calls protected RPC',async()=>{
  const original=global.fetch, restore=setEnv(); let body;
  global.fetch=async(_url,options)=>{body=JSON.parse(options.body);return {ok:true,async json(){return supplier({package_count:undefined,missing_count:undefined,last_package_at:undefined});}};};
  try{
    const res=makeRes();
    await handler(req('POST',{action:'create_supplier',external_ref:' SUP-1 ',legal_name:' Cells GmbH '}),res);
    assert.equal(res.statusCode,201);
    assert.deepEqual(body,{p_external_ref:'SUP-1',p_legal_name:'Cells GmbH'});
  }finally{global.fetch=original;restore();}
});

test('create package enforces exact component scope before upstream',async()=>{
  const original=global.fetch, restore=setEnv(); let seen;
  global.fetch=async(url,options)=>{seen={url,body:JSON.parse(options.body)};return {ok:true,async json(){return pkg();}};};
  try{
    let res=makeRes();
    await handler(req('POST',{
      action:'create_package',supplier_id:supplierId,subject_kind:'component',
      subject_ref:'cell:NMC-21700',model_id:modelId,item_id:null,component_ref:'CELL-01',
      material_ref:null,payload:{chemistry:'NMC'},source_date:'2026-10-02T00:00:00Z',supersedes_id:null
    }),res);
    assert.equal(res.statusCode,201);
    assert.equal(seen.url,'https://example.supabase.co/rest/v1/rpc/dpp_api_supplier_package_create');
    assert.equal(seen.body.p_component_ref,'CELL-01');

    res=makeRes();
    await handler(req('POST',{
      action:'create_package',supplier_id:supplierId,subject_kind:'component',
      subject_ref:'bad',model_id:null,item_id:null,component_ref:'CELL-01',
      payload:{},source_date:'2026-10-02T00:00:00Z'
    }),res);
    assert.equal(res.statusCode,422);
  }finally{global.fetch=original;restore();}
});

test('verify package records evidence through protected RPC',async()=>{
  const original=global.fetch, restore=setEnv(); let seen;
  global.fetch=async(url,options)=>{seen={url,body:JSON.parse(options.body)};return {ok:true,async json(){return verification();}};};
  try{
    const res=makeRes();
    await handler(req('POST',{action:'verify_package',package_id:packageId,status:'verified',evidence_ref:' supplier-evidence:sha256:abc '}),res);
    assert.equal(res.statusCode,201);
    assert.equal(seen.url,'https://example.supabase.co/rest/v1/rpc/dpp_api_supplier_package_verify');
    assert.equal(seen.body.p_evidence_ref,'supplier-evidence:sha256:abc');
  }finally{global.fetch=original;restore();}
});

test('supplier not found and package not found map without leaking database detail',async()=>{
  const original=global.fetch, restore=setEnv();
  try{
    global.fetch=async()=>({ok:false,async json(){return {code:'DP601',message:'secret supplier detail'};}});
    let res=makeRes();
    await handler(req('POST',{action:'create_package',supplier_id:supplierId,subject_kind:'model',subject_ref:'M1',model_id:modelId,payload:{},source_date:'2026-10-02T00:00:00Z'}),res);
    assert.equal(res.statusCode,404);
    assert.equal(JSON.parse(res.body).error.code,'SUPPLIER_NOT_FOUND');
    assert.equal(res.body.includes('secret supplier detail'),false);

    global.fetch=async()=>({ok:false,async json(){return {code:'DP604',message:'secret package detail'};}});
    res=makeRes();
    await handler(req('POST',{action:'verify_package',package_id:packageId,status:'verified',evidence_ref:'evidence:x'}),res);
    assert.equal(res.statusCode,404);
    assert.equal(JSON.parse(res.body).error.code,'SUPPLIER_PACKAGE_NOT_FOUND');
  }finally{global.fetch=original;restore();}
});

test('unsupported action is rejected locally',async()=>{
  const original=global.fetch; let called=false;
  global.fetch=async()=>{called=true;throw new Error('unexpected');};
  try{
    const res=makeRes(); await handler(req('POST',{action:'destroy_everything'}),res);
    assert.equal(res.statusCode,422); assert.equal(called,false);
  }finally{global.fetch=original;}
});

test('malformed successful upstream shape fails closed',async()=>{
  const env={SUPABASE_URL:'https://example.supabase.co',SUPABASE_ANON_KEY:'anon-key'};
  await assert.rejects(
    ()=>handler._test.rpc('dpp_api_suppliers_list',{},'Bearer t',env,async()=>({ok:true,async json(){return [{id:'bad'}];}}),50),
    e=>e.status===502&&e.publicCode==='UPSTREAM_ERROR'
  );
});
