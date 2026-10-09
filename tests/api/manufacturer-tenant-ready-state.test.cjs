'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'../..');
const ui=fs.readFileSync(path.join(root,'assets/csp/manufacturer-tenant-state.js'),'utf8');
const app=fs.readFileSync(path.join(root,'assets/csp/manufacturer-early.js'),'utf8');
const html=fs.readFileSync(path.join(root,'live/manufacturer-early.html'),'utf8');
const TOKEN='a'.repeat(64);
const session={access_token:'test-jwt',refresh_token:'not-production',expires_at:Math.floor(Date.now()/1000)+3600};
function boot(tenantResponse){
  const nodes=new Map(),stored=new Map([
    ['dpp_early_access_token_v1',TOKEN],
    ['dpp_google_session_v1',JSON.stringify(session)]
  ]),companyStored=new Map();
  const el=id=>{
    if(!nodes.has(id)){
      const listeners=new Map(),attributes=new Map(),classes=new Set();
      nodes.set(id,{
        id,hidden:false,href:'#',className:'',textContent:'',innerHTML:'',value:'',
        disabled:false,style:{},listeners,
        classList:{
          add:x=>classes.add(x),remove:x=>classes.delete(x),
          toggle:(x,on)=>{if(on)classes.add(x);else classes.delete(x);}
        },
        setAttribute:(key,value)=>attributes.set(key,String(value)),
        getAttribute:key=>attributes.get(key)||null,
        addEventListener:(name,fn)=>listeners.set(name,fn),
        append(){},focus(){}
      });
    }
    return nodes.get(id);
  };
  const document={
    body:{dataset:{manufacturerTenant:'pending',manufacturerReady:'false'}},
    getElementById:el,
    createElement:()=>({textContent:'',append(){}}),
    querySelector:()=>null
  };
  let calls=0;
  const fetch=async (url)=>{
    const u=String(url);
    if(u.endsWith('/api/dpp-dashboard-link'))return {ok:true,status:200,async json(){return {data:{
      email:'demo@example.org',companyName:'Demo',
      configuration:{company:{name:'Demo'}},answers:{}
    }};}};
    if(u==='/data/auth-config.json')return {ok:true,status:200,async json(){
      return {supabaseUrl:'https://test.supabase.co',publishableKey:'sb_publishable_test'};
    }};
    if(u.includes('/rest/v1/rpc/dpp_api_organization_ensure')){
      calls++;
      return tenantResponse(calls);
    }
    throw new Error('Unexpected fetch '+u);
  };
  const localStorage={getItem:k=>stored.get(k)||null,setItem:(k,v)=>stored.set(k,String(v)),removeItem:k=>stored.delete(k)};
  const sessionStorage={setItem:(k,v)=>companyStored.set(k,String(v)),getItem:k=>companyStored.get(k)||null,removeItem:k=>companyStored.delete(k)};
  const context={document,fetch,localStorage,sessionStorage,location:{hash:'',pathname:'/manufacturer-early'},URLSearchParams,
    history:{replaceState(){}},setTimeout,clearTimeout,AbortController,console};
  vm.runInNewContext(ui,context,{filename:'manufacturer-tenant-state.js'});
  vm.runInNewContext(app,context,{filename:'manufacturer-early.js'});
  return {document,el,companyStored,calls:()=>calls};
}
const response=(ok,status,data)=>({ok,status,async json(){return data;}});
async function settle(){
  for(let i=0;i<12;i++)await new Promise(resolve=>setImmediate(resolve));
}
test('pending tenant is not marked ready until RPC success',async()=>{
  assert.match(html,/data-manufacturer-ready="false"/);
  assert.match(html,/manufacturer-tenant-state\.js/);
  let release;
  const gate=new Promise(resolve=>{release=resolve;});
  const browser=boot(()=>gate);
  await settle();
  assert.equal(browser.document.body.dataset.manufacturerTenant,'preparing');
  assert.equal(browser.el('tenantStatusMetric').textContent,'Preparing');
  assert.equal(browser.el('productSkuButton').getAttribute('aria-disabled'),'true');
  assert.equal(browser.companyStored.size,0);
  release(response(true,200,{organization_id:'org-id',name:'Demo',active:true}));
  await settle();
  assert.equal(browser.document.body.dataset.manufacturerTenant,'configured');
  assert.equal(browser.document.body.dataset.manufacturerReady,'true');
  assert.equal(browser.el('productSkuButton').getAttribute('aria-disabled'),'false');
  assert.match(browser.el('productSkuButton').href,/modelRegisterCard/);
  assert.equal(browser.companyStored.size,1);
});
test('tenant error preserves intake, blocks Product/SKU and shows Retry',async()=>{
  const browser=boot(()=>response(false,500,{message:'Database unavailable'}));
  await settle();
  assert.equal(browser.document.body.dataset.manufacturerTenant,'setup-failed');
  assert.equal(browser.document.body.dataset.manufacturerReady,'false');
  assert.equal(browser.el('tenantRetry').hidden,false);
  assert.equal(browser.el('productSkuButton').getAttribute('aria-disabled'),'true');
  assert.match(browser.el('earlyStatus').textContent,/Database unavailable/);
  assert.equal(browser.companyStored.size,0);
});
test('expired Google token never produces a READY screen',async()=>{
  const browser=boot(()=>response(false,401,{message:'Unauthorized'}));
  await settle();
  assert.equal(browser.document.body.dataset.manufacturerTenant,'setup-failed');
  assert.match(browser.el('earlyStatus').textContent,/сесията изтече/);
});
test('manual Retry transitions failed to preparing and then to ready',async()=>{
  const browser=boot(call=>call===1
    ?response(false,503,{message:'Temporarily unavailable'})
    :response(true,200,{organization_id:'org-id',name:'Demo',active:true}));
  await settle();
  assert.equal(browser.document.body.dataset.manufacturerTenant,'setup-failed');
  browser.el('tenantRetry').listeners.get('click')();
  await settle();
  assert.equal(browser.calls(),2);
  assert.equal(browser.document.body.dataset.manufacturerTenant,'configured');
  assert.equal(browser.el('tenantRetry').hidden,true);
});
test('never mark READY before successful tenant RPC in source',()=>{
  assert.doesNotMatch(app,/document\.body\.dataset\.manufacturerTenant="configured"/);
  assert.doesNotMatch(app,/prepareProductionEntry\(\)\.catch\(\(\)=>\{\}\)/);
  assert.match(app,/const active=await ensureProductionTenant\(\);[\s\S]*DPPTenantUI\.ready\(active\)/);
});
