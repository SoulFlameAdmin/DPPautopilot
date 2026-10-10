'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const ui=fs.readFileSync(path.join(__dirname,'../../assets/csp/manufacturer-ops-inline-1.js'),'utf8');
const testUi=ui.replace(/\}\)\(\);\s*$/, 'window.__qrQa={setPassports:p=>{passports=p;session={access_token:"synthetic-test-token"}},renderCarriers};})();');
if(testUi===ui)throw Error('Cannot instrument QR UI for isolated test');

class Element {
 constructor(tag){this.tagName=tag;this.children=[];this.events={};this.disabled=false;this.hidden=false;this.value='';this.className='';this.textContent='';this.dataset={};}
 append(...elements){this.children.push(...elements);}
 replaceChildren(...elements){this.children=elements;}
 addEventListener(event,fn){this.events[event]=fn;}
 removeAttribute(){}
 querySelectorAll(selector){
  return this.children.flatMap(e=>[
   ...(selector==='img'&&e.tagName==='img'?[e]:[]),
   ...(typeof e.querySelectorAll==='function'?e.querySelectorAll(selector):[])
  ]);
 }
}
const id='battery-item-1',pid='passport-1',cid='carrier-1',identifier='urn:dpp:qr-1';
const passport=(status='active',override={})=>({passport_id:pid,battery_item_id:id,unique_identifier:identifier,status,...override});
const carrier=(status='active',override={})=>({id:cid,battery_item_id:id,carrier_kind:'qr',status,public_url:'https://example.test/qr',bound_at:'2026-10-10T00:00:00.000Z',...override});
const publicPassport=(override={})=>({kind:'active',passport_id:pid,unique_identifier:identifier,status:'active',...override});

async function harness({cached=[passport()],cachedCarrier=carrier(),fresh=passport(),liveCarrier=carrier(),publicResult=publicPassport(),throwRequest=null}={}){
 const nodes=new Map(),calls=[];
 const $=selector=>{
  if(!nodes.has(selector))nodes.set(selector,new Element(selector));
  return nodes.get(selector);
 };
 const document={
  querySelector:$,querySelectorAll:()=>[],
  createElement:tag=>new Element(tag),body:{dataset:{}}
 };
 let printCount=0;
 const window={print(){printCount++;}};
 const fakeFetch=async (url)=>{
  calls.push(url);
  if(url==='/data/auth-config.json'){
   return {ok:true,json:async()=>({supabaseUrl:'https://frhletkiuupgksmgxoxc.supabase.co',publishableKey:'synthetic'})};
  }
  if(throwRequest&&url.includes(throwRequest))throw Error('NETWORK_UNAVAILABLE');
  if(url.startsWith('/api/passport?id='))return {ok:true,json:async()=>({data:fresh})};
  if(url.startsWith('/api/passport?identifier='))return {ok:true,json:async()=>({data:publicResult})};
  if(url.startsWith('/api/carriers?battery_item_id='))return {ok:true,json:async()=>({data:liveCarrier?[liveCarrier]:[]})};
  throw Error('Unexpected URL '+url);
 };
 const storage={getItem:()=>null,setItem(){},removeItem(){}};
 new Function('document','window','sessionStorage','fetch','navigator','Option','confirm',testUi)(
  document,window,storage,fakeFetch,{clipboard:{writeText:async()=>{}}},function(){},()=>false
 );
 await new Promise(resolve=>setImmediate(resolve));
 window.__qrQa.setPassports(cached);
 window.__qrQa.renderCarriers([cachedCarrier]);
 const buttons=$( '#carrierList').children.flatMap(row=>row.children).flatMap(el=>el.children);
 const reprint=buttons.find(el=>el.tagName==='button'&&el.textContent==='Reprint');
 return {
  reprint,
  result:()=>$('#carrierResult').textContent,
  clicks:()=>printCount,
  calls:()=>calls.filter(url=>url.startsWith('/api/')),
  async invoke(){if(reprint)await reprint.events.click();}
 };
}
test('valid ACTIVE QR, server passport and public resolver prints once',async()=>{
 const h=await harness();assert.ok(h.reprint);
 await h.invoke();assert.equal(h.clicks(),1);
 assert.equal(h.calls().length,3);assert.equal(h.reprint.disabled,false);
});
test('DRAFT first in cache but unique ACTIVE passport later still prints',async()=>{
 const h=await harness({cached:[passport('draft',{passport_id:'draft-id'}),passport()]});
 await h.invoke();assert.equal(h.clicks(),1);
});
test('DRAFT only: no reprint and no network',async()=>{
 const h=await harness({cached:[passport('draft')]});
 await h.invoke();assert.equal(h.clicks(),0);assert.equal(h.calls().length,0);
});
test('missing passport: fails closed',async()=>{
 const h=await harness({cached:[]});await h.invoke();
 assert.equal(h.clicks(),0);assert.equal(h.calls().length,0);
});
test('REVOKED QR carrier: reprint hidden',async()=>{
 const h=await harness({cachedCarrier:carrier('revoked')});
 assert.equal(h.reprint,undefined);
});
test('REPLACED QR carrier: reprint hidden',async()=>{
 const h=await harness({cachedCarrier:carrier('replaced')});
 assert.equal(h.reprint,undefined);
});
test('freshly revoked passport: print denied',async()=>{
 const h=await harness({fresh:passport('revoked')});
 await h.invoke();assert.equal(h.clicks(),0);
 assert.match(h.result(),/not ACTIVE anymore/);
});
test('freshly DRAFT passport: print denied',async()=>{
 const h=await harness({fresh:passport('draft')});
 await h.invoke();assert.equal(h.clicks(),0);
});
test('freshly revoked carrier: print denied',async()=>{
 const h=await harness({liveCarrier:carrier('revoked')});
 await h.invoke();assert.equal(h.clicks(),0);
});
test('missing carrier or mismatched carrier identity: print denied',async()=>{
 for(const c of [null,carrier('active',{id:'different-id'})]){
  const h=await harness({liveCarrier:c});
  await h.invoke();assert.equal(h.clicks(),0);
 }
});
test('public QR resolver lifecycle transition: print denied',async()=>{
 const h=await harness({publicResult:publicPassport({kind:'lifecycle',status:'replaced'})});
 await h.invoke();assert.equal(h.clicks(),0);
});
test('public QR resolver pointing to other passport: print denied',async()=>{
 const h=await harness({publicResult:publicPassport({passport_id:'another'})});
 await h.invoke();assert.equal(h.clicks(),0);
});
test('multiple cached ACTIVE passports for same item fail closed',async()=>{
 const h=await harness({cached:[passport(),passport('active',{passport_id:'another'})]});
 await h.invoke();assert.equal(h.clicks(),0);assert.equal(h.calls().length,0);
});
test('network outage before validation fails closed',async()=>{
 const h=await harness({throwRequest:'passport?id='});
 await h.invoke();assert.equal(h.clicks(),0);assert.equal(h.reprint.disabled,false);
});
test('backend invalid passport item binding fails closed',async()=>{
 const h=await harness({fresh:passport('active',{battery_item_id:'another-item'})});
 await h.invoke();assert.equal(h.clicks(),0);
});
test('cached carrier without id is never implicitly authorized',async()=>{
 const h=await harness({cachedCarrier:carrier('active',{id:null})});
 await h.invoke();assert.equal(h.clicks(),0);assert.equal(h.calls().length,0);
});
