const formUx=window.DPPFormUX;
let cfg,accessToken=null,refreshToken=null,refreshTimer=null;
const out=(x,cls='')=>{result.className=cls;result.textContent=typeof x==='string'?x:JSON.stringify(x,null,2)};
function validateAuth({passwordRequired=true}={}){
 const controls=[email,password],before=formUx.snapshot(controls);
 const emailValue=email.value.trim();
 const emailOk=/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailValue);
 const passwordOk=!passwordRequired||password.value.length>0;
 formUx.setError(email,email_error,emailOk?'':'Enter a valid email address.');
 formUx.setError(password,password_error,passwordOk?'':'Password is required.');
 const ok=emailOk&&passwordOk;
 document.body.dataset.formValid=String(ok);
 formUx.markPreserved(before,controls);
 return ok;
}
const AUTH_REQUEST_TIMEOUT_MS=15000;
async function call(path,{method='GET',body,token}={}){
 if(!cfg) throw new Error('auth client is not ready');
 const headers={'apikey':cfg.publishableKey,'Content-Type':'application/json'};
 if(token) headers.Authorization='Bearer '+token;
 const controller=new AbortController();
 const timeout=setTimeout(()=>controller.abort(),AUTH_REQUEST_TIMEOUT_MS);
 let r;
 try{
  r=await fetch(cfg.supabaseUrl+path,{method,headers,body:body?JSON.stringify(body):undefined,signal:controller.signal});
 }catch(e){
  if(e?.name==='AbortError') throw new Error('Authentication request timed out. Please try again.');
  throw e;
 }finally{
  clearTimeout(timeout);
 }
 const text=await r.text();let data;try{data=text?JSON.parse(text):{}}catch{data={raw:text}}
 if(!r.ok) throw Object.assign(new Error(data.msg||data.message||data.error_description||('HTTP '+r.status)),{status:r.status,data});
 return data;
}
async function refreshSession(){
 if(!refreshToken)return false;
 try{
  const d=await call('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:refreshToken}});
  setSession(d);
  return true;
 }catch{
  setSession(null);
  return false;
 }
}
function refreshDelayMs(expiresIn){
 const ttlSeconds=Number(expiresIn);
 if(!Number.isFinite(ttlSeconds)||ttlSeconds<=0)return 0;
 const ttlMs=ttlSeconds*1000;
 const leadMs=Math.min(60000,Math.max(1000,Math.floor(ttlMs*0.1)));
 return Math.max(1000,ttlMs-leadMs);
}
function setSession(data){
 if(refreshTimer){clearTimeout(refreshTimer);refreshTimer=null}
 accessToken=data?.access_token||null;refreshToken=data?.refresh_token||null;
 const refreshAfter=refreshDelayMs(data?.expires_in);
 if(accessToken&&refreshToken&&refreshAfter>0){
  refreshTimer=setTimeout(refreshSession,refreshAfter);
 }
 document.body.dataset.sessionState=accessToken?'authenticated':'anonymous';
 session.textContent=accessToken?'Authenticated session in memory only.':'No authenticated session.';
}
async function init(){
 cfg=await fetch('/data/auth-config.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error('auth config unavailable');return r.json()});
 if(cfg.supabaseUrl!=='https://frhletkiuupgksmgxoxc.supabase.co'||!String(cfg.publishableKey||'').startsWith('sb_publishable_')){
  cfg=null;
  setSession(null);
  throw new Error('invalid auth config');
 }
 setSession(null);document.body.dataset.authReady='true';
}
signup.onclick=async()=>{if(!validateAuth())return out('Check the highlighted fields.','bad');try{const d=await call('/auth/v1/signup',{method:'POST',body:{email:email.value.trim(),password:password.value}});setSession(d);out(d.session?'Sign-up created authenticated session.':'Sign-up accepted; email confirmation is required by current project settings.','ok')}catch(e){out(e.message,'bad')}};
signin.onclick=async()=>{if(!validateAuth())return out('Check the highlighted fields.','bad');try{const d=await call('/auth/v1/token?grant_type=password',{method:'POST',body:{email:email.value.trim(),password:password.value}});setSession(d);out('Sign-in succeeded.','ok')}catch(e){out(e.message,'bad')}};
function recoveryRedirect(){return new URL('/demo/auth-recovery.html',location.origin).href}
reset.onclick=async()=>{if(!validateAuth({passwordRequired:false}))return out('Check the highlighted email field.','bad');try{const redirectTo=recoveryRedirect();await call('/auth/v1/recover?redirect_to='+encodeURIComponent(redirectTo),{method:'POST',body:{email:email.value.trim()}});out('If the account is eligible, a password reset email will be sent.','ok')}catch(e){out(e.message,'bad')}};
signout.onclick=async()=>{try{if(accessToken)await call('/auth/v1/logout',{method:'POST',token:accessToken});setSession(null);out('Signed out.','ok')}catch(e){setSession(null);out(e.message,'bad')}};
init().then(()=>{
 const q=new URLSearchParams(location.search);
 if(q.get('invalid')==='1'){
   email.value='invalid-email';
   password.value='';
   signin.click();
 }
}).catch(e=>{cfg=null;setSession(null);document.body.dataset.authReady='false';out(e.message,'bad')});
