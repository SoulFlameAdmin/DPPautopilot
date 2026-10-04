'use strict';

const $=id=>document.getElementById(id);
const el={
  title:$('title'),identifier:$('identifier'),status:$('status'),updated:$('updated'),publicData:$('publicData'),
  email:$('email'),password:$('password'),signup:$('signup'),signin:$('signin'),signout:$('signout'),
  userId:$('userId'),authResult:$('authResult'),organization:$('organization'),role:$('role'),
  activateOrg:$('activateOrg'),loadPrivate:$('loadPrivate'),privateData:$('privateData')
};

let config=null;
let token=null;
let user=null;
let passportId=null;
let organizations=[];

function show(target,value,kind=''){
  target.className=kind;
  target.textContent=typeof value==='string'?value:JSON.stringify(value,null,2);
}
async function loadConfig(){
  const r=await fetch('/data/auth-config.json',{cache:'no-store'});
  if(!r.ok)throw new Error('Auth config unavailable.');
  config=await r.json();
  if(!config.supabaseUrl||!config.publishableKey)throw new Error('Auth config is incomplete.');
}
async function authCall(path,{method='GET',body,accessToken}={}){
  const headers={apikey:config.publishableKey,'Content-Type':'application/json'};
  if(accessToken)headers.Authorization='Bearer '+accessToken;
  const r=await fetch(config.supabaseUrl+path,{method,headers,body:body?JSON.stringify(body):undefined});
  const text=await r.text();
  let data={};
  try{data=text?JSON.parse(text):{};}catch{}
  if(!r.ok)throw new Error(data.msg||data.message||data.error_description||('Auth HTTP '+r.status));
  return data;
}
async function api(path,{method='GET',body,auth=true}={}){
  const headers={'Content-Type':'application/json'};
  if(auth){
    if(!token)throw new Error('Sign in first.');
    headers.Authorization='Bearer '+token;
  }
  const r=await fetch(path,{method,headers,body:body===undefined?undefined:JSON.stringify(body),cache:'no-store'});
  const text=await r.text();
  let data={};
  try{data=text?JSON.parse(text):{};}catch{}
  if(!r.ok)throw new Error(data?.error?.message||data?.error?.code||('HTTP '+r.status));
  return data.data;
}
function setAuth(data){
  token=data?.access_token||null;
  user=data?.user||user||null;
  el.userId.value=user?.id||'';
  document.body.dataset.auth=token?'authenticated':'anonymous';
  show(el.authResult,token?'Authenticated.':'No authenticated session.',token?'ok':'');
}
async function loadPublicPassport(){
  const id=new URLSearchParams(location.search).get('id')||'';
  if(!id)throw new Error('Missing battery identifier.');
  const data=await api('/api/carriers?mode=open&identifier='+encodeURIComponent(id)+'&source=unknown',{auth:false});
  passportId=data.passport_id;
  el.identifier.value=data.unique_identifier||id;
  el.status.value=data.status||'';
  el.updated.value=data.updated_at||'';
  const p=data.public_payload||{};
  el.title.textContent=(p.manufacturer||'Battery')+' · '+(p.model||data.unique_identifier||id);
  show(el.publicData,p,'ok');
  document.body.dataset.passport='ready';
}
function updateRole(){
  const org=organizations.find(o=>o.organization_id===el.organization.value);
  el.role.value=org?.role||'';
}
async function activateSelected(){
  const id=el.organization.value;
  if(!id)throw new Error('No organization is selected.');
  await api('/api/tenant',{method:'POST',body:{organization_id:id}});
  await loadOrganizations(false);
  show(el.authResult,'Organization activated. Role: '+el.role.value,'ok');
}
async function loadOrganizations(autoActivate=true){
  organizations=await api('/api/organizations');
  el.organization.innerHTML='';
  if(!organizations.length){
    const opt=document.createElement('option');
    opt.value='';opt.textContent='No company membership yet';
    el.organization.appendChild(opt);
    el.role.value='';
    show(el.authResult,'Signed in, but this account is not yet a member of a DPP company. Send the UUID above to the admin, then sign in/reload again.','warn');
    return;
  }
  for(const org of organizations){
    const opt=document.createElement('option');
    opt.value=org.organization_id;
    opt.textContent=org.name+' · '+org.role+(org.active?' · ACTIVE':'');
    el.organization.appendChild(opt);
  }
  const active=organizations.find(o=>o.active);
  if(active){
    el.organization.value=active.organization_id;
    updateRole();
    return;
  }
  el.organization.value=organizations[0].organization_id;
  updateRole();
  if(autoActivate&&organizations.length===1)await activateSelected();
}
async function loadAllowedCompanyData(){
  if(!passportId)throw new Error('Public passport is not loaded.');
  const data=await api('/api/passport?id='+encodeURIComponent(passportId));
  show(el.privateData,{
    role:el.role.value,
    passport_id:data.passport_id,
    status:data.status,
    public_payload:data.public_payload,
    private_payload:data.private_payload,
    updated_at:data.updated_at
  },'ok');
}
function wire(button,fn,label){
  button.addEventListener('click',async()=>{
    const old=button.textContent;
    button.disabled=true;
    button.textContent=label||'Working…';
    try{await fn();}
    catch(error){show(el.authResult,error.message||String(error),'bad');}
    finally{button.disabled=false;button.textContent=old;}
  });
}

el.organization.addEventListener('change',updateRole);

wire(el.signup,async()=>{
  if(!el.email.value.trim()||!el.password.value)throw new Error('Enter email and password.');
  const data=await authCall('/auth/v1/signup',{
    method:'POST',
    body:{email:el.email.value.trim(),password:el.password.value}
  });
  user=data.user||user;
  setAuth(data);
  if(data.access_token){
    await loadOrganizations();
    show(el.authResult,'Worker account created and authenticated. UUID: '+(user?.id||'unknown'),'ok');
  }else{
    show(el.authResult,'Worker account created. UUID: '+(user?.id||'unknown')+'. Admin must add this UUID to the company; email confirmation may also be required.','warn');
  }
},'Creating…');

wire(el.signin,async()=>{
  if(!el.email.value.trim()||!el.password.value)throw new Error('Enter email and password.');
  const data=await authCall('/auth/v1/token?grant_type=password',{
    method:'POST',
    body:{email:el.email.value.trim(),password:el.password.value}
  });
  user=data.user||null;
  setAuth(data);
  await loadOrganizations();
  show(el.authResult,'Signed in. UUID: '+(user?.id||'unknown')+' · role: '+(el.role.value||'not assigned'),'ok');
},'Signing in…');

wire(el.signout,async()=>{
  if(token){
    try{await authCall('/auth/v1/logout',{method:'POST',accessToken:token});}catch{}
  }
  token=null;user=null;organizations=[];
  setAuth(null);
  el.organization.innerHTML='';el.role.value='';show(el.privateData,'Sign in first.');
},'Signing out…');

wire(el.activateOrg,async()=>{
  if(token&&organizations.length===0)await loadOrganizations(false);
  await activateSelected();
},'Activating…');

wire(el.loadPrivate,loadAllowedCompanyData,'Loading…');

(async()=>{
  await Promise.all([loadConfig(),loadPublicPassport()]);
})().catch(error=>{
  document.body.dataset.passport='error';
  el.title.textContent='Passport unavailable';
  show(el.publicData,error.message||String(error),'bad');
});
