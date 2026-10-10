'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),
 fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'../../assets/csp/',p),'utf8');
const inline=read('manufacturer-inline-1.js'),entry=read('manufacturer-entry.js');
const now=()=>Math.floor(Date.now()/1000);
class Storage{
 constructor(entries={}){this.m=new Map(Object.entries(entries));}
 getItem(k){return this.m.get(k)||null;}
 setItem(k,v){this.m.set(k,String(v));}
 removeItem(k){this.m.delete(k);}
}
const serialized=x=>JSON.stringify(x);
const GOOGLE='dpp_google_session_v1',COMPANY='dpp_company_session_v1';
const project='https://frhletkiuupgksmgxoxc.supabase.co';
function sandbox({google=null,company=null,refreshResponse=null}={}){
 const ls=new Storage(google?{[GOOGLE]:serialized(google)}:{}),
 ss=new Storage(company?{[COMPANY]:serialized(company)}:{});
 const calls=[];
 async function fetchMock(url,opts={}){
  calls.push({url,opts,googleAtCall:ls.getItem(GOOGLE)});
  if(url==='/data/auth-config.json')return {ok:true,json:async()=>({supabaseUrl:project,publishableKey:'sb_publishable_demo'})};
  if(url.startsWith(project+'/auth/v1/token')){
   if(refreshResponse===null)return {ok:false,status:401,json:async()=>({}),text:async()=>'{"error":"invalid_grant"}'};
   return {ok:true,status:200,json:async()=>refreshResponse,text:async()=>JSON.stringify(refreshResponse)};
  }
  if(url.startsWith(project+'/auth/v1/user'))return {ok:false,status:401,json:async()=>({})};
  return {ok:false,status:404,json:async()=>({})};
 }
 const env={localStorage:ls,sessionStorage:ss,fetch:fetchMock,Date,Number,Math,JSON,AbortController,setTimeout,clearTimeout,Promise};
 return {env,ls,ss,calls};
}
function entrySession(env){
 const start=entry.indexOf('async function companySession(){');
 const end=entry.indexOf('async function ensureOnboardingConfigured(){',start);
 assert.ok(start>0&&end>start);
 const source=`const GOOGLE_SESSION_KEY="${GOOGLE}",COMPANY_SESSION_KEY="${COMPANY}";\n`+entry.slice(start,end)+'\ncompanySession;';
 return vm.runInNewContext(source,env);
}
function inlineSession(env){
 const start=inline.indexOf('function expiresSoon(value){'),end=inline.indexOf('function canWrite(){',start);
 assert.ok(start>0&&end>start);
 const source=`const STORAGE="${COMPANY}",GOOGLE_STORAGE="${GOOGLE}";\nlet session=null,refreshing=null;\nconst cfg={supabaseUrl:"${project}",publishableKey:"sb_publishable_demo"};\n`+
  inline.slice(start,end)+'\n({readSession,refreshSession,api,get:()=>session});';
 return vm.runInNewContext(source,env);
}
const expired=()=>({access_token:'OLD_EXPIRED',refresh_token:'ref1',expires_at:now()-500});
const good=()=>({access_token:'NEW_VALID',refresh_token:'ref2',expires_in:3600});
test('entry never rewrites a still valid Google expiry',async()=>{
 const g={access_token:'VALID',refresh_token:'ref',expires_at:now()+2400};
 const h=sandbox({google:g}),get=entrySession(h.env);
 const token=await get();
 assert.equal(token.access_token,'VALID');
 assert.equal(JSON.parse(h.ls.getItem(GOOGLE)).expires_at,g.expires_at);
 assert.equal(h.calls.length,0);
});
test('expired Google session performs actual Supabase refresh before granting onboarding',async()=>{
 const h=sandbox({google:expired(),refreshResponse:good()}),get=entrySession(h.env);
 const previous=h.ls.getItem(GOOGLE);
 const token=await get();
 assert.equal(token.access_token,'NEW_VALID');
 assert.ok(token.expires_at>now()+3000);
 assert.equal(h.calls.at(-1).googleAtCall,previous);
 assert.equal(JSON.parse(h.ls.getItem(GOOGLE)).access_token,'NEW_VALID');
 assert.equal(JSON.parse(h.ss.getItem(COMPANY)).access_token,'NEW_VALID');
});
test('invalid refresh response deletes both stale tokens',async()=>{
 const h=sandbox({google:expired(),company:{access_token:'OLD_EXPIRED'},refreshResponse:{access_token:'BAD',expires_in:3600}}),get=entrySession(h.env);
 assert.equal(await get(),null);
 assert.equal(h.ls.getItem(GOOGLE),null);assert.equal(h.ss.getItem(COMPANY),null);
});
test('rejected refresh denies onboarding and removes expired credentials',async()=>{
 const h=sandbox({google:expired()}),get=entrySession(h.env);
 assert.equal(await get(),null);
 assert.equal(h.ls.getItem(GOOGLE),null);assert.equal(h.ss.getItem(COMPANY),null);
});
test('expired Google without refresh token is rejected before API',async()=>{
 const h=sandbox({google:{access_token:'expired',expires_at:now()-20}}),get=entrySession(h.env);
 assert.equal(await get(),null);assert.equal(h.calls.length,0);
});
test('company Google mirror after cross-tab logout is denied',async()=>{
 const h=sandbox({company:{access_token:'token',source:'google',expires_at:now()+3600}}),get=entrySession(h.env);
 assert.equal(await get(),null);assert.equal(h.ss.getItem(COMPANY),null);
});
test('company-only stale expiry fails closed',async()=>{
 const h=sandbox({company:{access_token:'expired',expires_at:now()-10}}),get=entrySession(h.env);
 assert.equal(await get(),null);
});
test('inline readSession never authorizes an expired Google access token',()=>{
 const h=sandbox({google:expired()}),obj=inlineSession(h.env);
 assert.equal(obj.readSession(),false);
 assert.equal(h.ss.getItem(COMPANY),null);
 assert.equal(JSON.parse(h.ls.getItem(GOOGLE)).expires_at,now()-500);
});
test('inline refresh returns true only for a real provider response',async()=>{
 const h=sandbox({google:expired(),refreshResponse:good()}),obj=inlineSession(h.env);
 assert.equal(obj.readSession(),false);
 assert.equal(await obj.refreshSession(),true);
 assert.equal(obj.get().access_token,'NEW_VALID');
 assert.equal(JSON.parse(h.ls.getItem(GOOGLE)).access_token,'NEW_VALID');
});
test('inline invalid refresh cannot return true or maintain Google token',async()=>{
 const h=sandbox({google:expired(),refreshResponse:{access_token:'FORGED'}}),obj=inlineSession(h.env);
 assert.equal(obj.readSession(),false);
 assert.equal(await obj.refreshSession(),false);
 assert.equal(obj.get(),null);
 assert.equal(h.ls.getItem(GOOGLE),null);
});
test('inline refuses legacy Google company session without local Google identity',()=>{
 const h=sandbox({company:{access_token:'token',source:'google',expires_at:now()+3600}}),obj=inlineSession(h.env);
 assert.equal(obj.readSession(),false);
});
test('inline source includes cross-tab Google storage sync',()=>{
 assert.match(inline,/addEventListener\("storage"/);
 assert.match(inline,/sessionStorage\.removeItem\(STORAGE\)/);
 assert.ok(!inline.includes('Math.max(60,Number(google.expires_at)'));
 assert.ok(!entry.includes('Math.max(60,Number(google.expires_at)'));
});
