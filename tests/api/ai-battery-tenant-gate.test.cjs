'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),
 vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const src=fs.readFileSync(path.resolve(__dirname,'../../api/_ai_lmt_tenant_gate.js'),'utf8');
const mod={exports:{}};
vm.runInNewContext(src,{module:mod,exports:mod.exports,process:{env:{}},
 AbortController,setTimeout,clearTimeout,require:name=>{
  assert.equal(name,'./_supabase_config.js');
  return {getSupabaseConfig:()=>({base:'https://test.supabase.co',key:'sb_publishable_fake'})};
 }},{filename:'_ai_lmt_tenant_gate.js'});
const {readContext,validateManufacturerTenant}=mod.exports;
const ORG='00000000-0000-4000-8000-000000000002';
const OTHER='00000000-0000-4000-8000-000000000003';
const data=(role='owner')=>({active_organization_id:ORG,memberships:[
 {organization_id:ORG,role,active:true},
 {organization_id:OTHER,role:'viewer',active:false}
]});
const rejects=(code)=>e=>e?.code===code;
function mockRpc(value,status=200){
 let count=0;
 const fetchImpl=async(url,request)=>{
  count++;
  assert.equal(url,'https://test.supabase.co/rest/v1/rpc/dpp_api_tenant_context');
  assert.equal(request.method,'POST');
  assert.equal(request.headers.Authorization,'Bearer test-token');
  assert.equal(request.headers.apikey,'sb_publishable_fake');
  assert.equal(request.body,'{}');
  return {status,ok:status===200,json:async()=>value};
 };
 return {fetchImpl,get count(){return count;}};
}
test('real server context grants owner, admin and editor only',()=>{
 for(const role of ['owner','admin','editor']){
  const x=readContext(data(role));
  assert.equal(x.organization_id,ORG);assert.equal(x.role,role);
 }
});
test('viewer is a valid membership but not an AI billing role',()=>{
 assert.throws(()=>readContext(data('viewer')),rejects('MANUFACTURER_WRITE_ROLE_REQUIRED'));
});
test('session without active tenant is refused without spending',()=>{
 assert.throws(()=>readContext({active_organization_id:null,memberships:[]}),
  rejects('ACTIVE_MANUFACTURER_REQUIRED'));
});
test('mismatch between active ID and memberships is an invalid DB response',()=>{
 assert.throws(()=>readContext({...data(),active_organization_id:OTHER}),
  rejects('TENANT_CONTEXT_INVALID'));
});
test('ambiguous two active tenants always fail closed',()=>{
 const x=data();x.memberships[1].active=true;
 assert.throws(()=>readContext(x),rejects('TENANT_CONTEXT_INVALID'));
});
test('client-supplied owner property cannot replace membership role',()=>{
 const x={...data('viewer'),owner:true,role:'owner'};
 assert.throws(()=>readContext(x),rejects('MANUFACTURER_WRITE_ROLE_REQUIRED'));
});
test('duplicate member organization cannot be used to spoof another role',()=>{
 const x=data();x.memberships.push({...x.memberships[0],role:'owner'});
 assert.throws(()=>readContext(x),rejects('TENANT_CONTEXT_INVALID'));
});
test('bad organization identifiers, membership role and arbitrary object are rejected',()=>{
 for(const x of [
  undefined,{},[],{active_organization_id:'fake',memberships:[]},
  {active_organization_id:ORG,memberships:[{organization_id:ORG,role:'superadmin',active:true}]},
  {active_organization_id:ORG,memberships:[{organization_id:ORG,role:'owner',active:'true'}]}
 ])assert.throws(()=>readContext(x),rejects('TENANT_CONTEXT_INVALID'));
});
test('validated server RPC result resolves authorized active tenant',async()=>{
 const mock=mockRpc(data('editor'));
 const v=await validateManufacturerTenant('Bearer test-token',{fetchImpl:mock.fetchImpl,env:{}});
 assert.equal(v.organization_id,ORG);assert.equal(v.role,'editor');assert.equal(mock.count,1);
});
test('invalid bearer blocks the RPC before network use',async()=>{
 const mock=mockRpc(data('owner'));
 await assert.rejects(validateManufacturerTenant('no bearer',{fetchImpl:mock.fetchImpl,env:{}}),rejects('AUTH_REQUIRED'));
 assert.equal(mock.count,0);
});
test('RPC rejected HTTP token remains denial, not a fallback to caller claims',async()=>{
 const mock=mockRpc({code:'DP101'},403);
 await assert.rejects(validateManufacturerTenant('Bearer test-token',{fetchImpl:mock.fetchImpl,env:{}}),rejects('TENANT_CONTEXT_DENIED'));
});
test('RPC network failures deny all paid requests',async()=>{
 await assert.rejects(validateManufacturerTenant('Bearer test-token',{fetchImpl:async()=>{throw Error('offline')},env:{}}),
  rejects('TENANT_CONTEXT_UNAVAILABLE'));
});
test('malformed JSON or missing server state fails closed',async()=>{
 const mock=mockRpc({memberships:[{role:'owner'}]});
 await assert.rejects(validateManufacturerTenant('Bearer test-token',{fetchImpl:mock.fetchImpl,env:{}}),
  rejects('TENANT_CONTEXT_INVALID'));
});
test('timeout remains active while RPC response body is read',async()=>{
 let aborted=false;
 const fetchImpl=async(_url,request)=>{
  request.signal.addEventListener('abort',()=>{aborted=true;},{once:true});
  return {status:200,ok:true,json:()=>new Promise((resolve,reject)=>{
   const fail=()=>{const e=new Error('aborted');e.name='AbortError';reject(e);};
   if(request.signal.aborted)return fail();
   request.signal.addEventListener('abort',fail,{once:true});
  })};
 };
 await assert.rejects(
  validateManufacturerTenant('Bearer test-token',{fetchImpl,env:{},timeoutMs:20}),
  rejects('TENANT_CONTEXT_TIMEOUT')
 );
 assert.equal(aborted,true);
});
