const formUx=window.DPPFormUX;
const invalidDemo=new URLSearchParams(location.search).get('invalid')==='1';
let cfg=null,accessToken=null;
const AUTH_REQUEST_TIMEOUT_MS=15000;
function parseHash(){return Object.fromEntries(new URLSearchParams(location.hash.replace(/^#/,'')))}
function setState(msg,cls=''){status.className=cls;status.textContent=msg}
async function init(){
 const h=parseHash();
 history.replaceState(null,'',location.pathname);
 const candidate=h.access_token||null;
 const expiresAt=Number(h.expires_at||0);
 const notExpired=!expiresAt || expiresAt*1000>Date.now();
 const isRecovery=h.type==='recovery' && !!candidate && notExpired;
 accessToken=isRecovery?candidate:null;
 cfg=await fetch('/data/auth-config.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error('auth config unavailable');return r.json()});
 if(cfg.supabaseUrl!=='https://frhletkiuupgksmgxoxc.supabase.co'||!String(cfg.publishableKey||'').startsWith('sb_publishable_')){
  accessToken=null;
  throw new Error('invalid auth config');
 }
 document.body.dataset.recoverySession=isRecovery?'valid':'missing';
 document.body.dataset.recoveryReady='true';
 setState(isRecovery?'Recovery session ready. Enter a new password.':'Missing, expired or invalid recovery session.',isRecovery?'ok':'bad');
}
save.onclick=async()=>{
 const before=formUx.snapshot([password]);
 const passwordOk=password.value.length>=8;
 formUx.setError(password,password_error,passwordOk?'':'Password must be at least 8 characters.');
 document.body.dataset.formValid=String(passwordOk);
 formUx.markPreserved(before,[password]);
 if(!accessToken){document.body.dataset.passwordUpdate='blocked';return setState('Recovery session required.','bad')}
 if(!passwordOk){document.body.dataset.passwordUpdate='blocked';return setState('Password must be at least 8 characters.','bad')}
 try{
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),AUTH_REQUEST_TIMEOUT_MS);
  let r;
  try{
   r=await fetch(cfg.supabaseUrl+'/auth/v1/user',{
    method:'PATCH',
    headers:{'apikey':cfg.publishableKey,'Authorization':'Bearer '+accessToken,'Content-Type':'application/json'},
    body:JSON.stringify({password:password.value}),
    signal:controller.signal
   });
  }catch(e){
   if(e?.name==='AbortError')throw new Error('Password update timed out. Please try again.');
   throw e;
  }finally{
   clearTimeout(timeout);
  }
  const body=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(body.msg||body.message||('HTTP '+r.status));
  accessToken=null;
  document.body.dataset.passwordUpdate='success';
  document.body.dataset.recoverySession='consumed';
  setState('Password updated successfully. Recovery token cleared from the URL.','ok');
 }catch(e){document.body.dataset.passwordUpdate='failed';setState(e.message,'bad')}
};
init().then(()=>{
 if(invalidDemo&&accessToken){
   password.value='short';
   save.click();
 }
}).catch(e=>{accessToken=null;cfg=null;document.body.dataset.recoverySession='missing';document.body.dataset.recoveryReady='true';setState(e.message,'bad')});
