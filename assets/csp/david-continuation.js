(()=>{
'use strict';
// Navigation-only bridge. No token or password access. The existing company
// sign-in script verifies the user, and the setup API verifies tenancy again.
const query=new URLSearchParams(location.search);
const flowKey='dpp_david_setup_pending';
const refKey='dpp_david_setup_ref';
if(query.get('flow')==='setup'){
  sessionStorage.setItem(flowKey,'1');
  const ref=query.get('ref')||'';
  if(/^[a-z0-9][a-z0-9_-]{0,31}$/i.test(ref))sessionStorage.setItem(refKey,ref.toLowerCase());
}
if(sessionStorage.getItem(flowKey)!=='1')return;
const status=document.getElementById('authResult');
if(!status)return;
let leaving=false;
function continueAfterVerifiedLogin(){
  if(leaving||sessionStorage.getItem(flowKey)!=='1')return;
  const text=String(status.textContent||'');
  if(!text.startsWith('Вход успешен:')||document.body.dataset.companyRecovery==='active')return;
  leaving=true;
  const url=new URL('/setup',location.origin);
  const ref=sessionStorage.getItem(refKey)||'';
  if(/^[a-z0-9][a-z0-9_-]{0,31}$/i.test(ref))url.searchParams.set('ref',ref);
  sessionStorage.removeItem(flowKey);
  sessionStorage.removeItem(refKey);
  location.assign(url.pathname+url.search);
}
const watcher=new MutationObserver(continueAfterVerifiedLogin);
watcher.observe(status,{childList:true,characterData:true,subtree:true});
continueAfterVerifiedLogin();
})();
