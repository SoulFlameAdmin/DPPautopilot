(()=>{"use strict";
const $=s=>document.querySelector(s);
const STORAGE="dpp_company_session_v1";
const REQUEST_STORAGE="dpp_registration_request_v1";
const PROJECT_URL="https://frhletkiuupgksmgxoxc.supabase.co";
const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
let cfg=null,session=null,refreshTimer=null,currentUser=null,directory={countries:[],manufacturers:{}};

function result(node,message,kind=""){node.textContent=message;node.className="result"+(kind?" "+kind:"")}
function validEmail(value){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value||"").trim())}
function authHeaders(token){const h={apikey:cfg.publishableKey,"Content-Type":"application/json",Accept:"application/json"};if(token)h.Authorization="Bearer "+token;return h}
async function authCall(path,{method="GET",body,token}={}){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
  try{
    const r=await fetch(cfg.supabaseUrl+path,{method,headers:authHeaders(token),body:body?JSON.stringify(body):undefined,signal:controller.signal});
    const text=await r.text();let data={};try{data=text?JSON.parse(text):{}}catch{}
    if(!r.ok)throw new Error(data.msg||data.message||data.error_description||data.error||("HTTP "+r.status));
    return data;
  }finally{clearTimeout(timer)}
}
function scheduleRefresh(expiresIn){
  if(refreshTimer)clearTimeout(refreshTimer);
  const ttl=Math.max(30,Number(expiresIn)||3600);
  refreshTimer=setTimeout(()=>refreshSession().catch(()=>clearSession()),Math.max(15000,(ttl-60)*1000));
}
function saveSession(value){
  session=value&&value.access_token?{access_token:value.access_token,refresh_token:value.refresh_token||"",expires_in:Number(value.expires_in)||3600}:null;
  if(session){sessionStorage.setItem(STORAGE,JSON.stringify(session));document.body.dataset.companySession="authenticated";scheduleRefresh(session.expires_in)}
  else clearSession(false);
  syncAuthUi();
}
function clearSession(sync=true){
  if(refreshTimer){clearTimeout(refreshTimer);refreshTimer=null}
  session=null;currentUser=null;sessionStorage.removeItem(STORAGE);document.body.dataset.companySession="anonymous";
  if(sync)syncAuthUi();
}
async function refreshSession(){
  if(!session?.refresh_token)return false;
  const data=await authCall("/auth/v1/token?grant_type=refresh_token",{method:"POST",body:{refresh_token:session.refresh_token}});
  saveSession(data);return true;
}
function restoreSession(){
  try{const value=JSON.parse(sessionStorage.getItem(STORAGE)||"null");if(value?.access_token){session=value;document.body.dataset.companySession="authenticated";return true}}catch{}
  return false;
}
function registrationRequestFromUrl(){
  const value=new URL(location.href).searchParams.get("request")||"";
  return UUID_RE.test(value)?value:null;
}
function parseConfirmationFragment(){
  const p=new URLSearchParams(location.hash.replace(/^#/,""));
  if(!p.get("access_token"))return false;
  saveSession({access_token:p.get("access_token"),refresh_token:p.get("refresh_token"),expires_in:p.get("expires_in")});
  result($("#authResult"),"Supabase Auth потвърди email-а. Зареждаме фирмената регистрация…","ok");
  return true;
}
function cleanConfirmationUrl(){
  const clean=new URL(location.href);clean.hash="";clean.searchParams.delete("request");
  history.replaceState(null,"",clean.pathname+clean.search);
}
async function api(path,{method="GET",body}={}){
  if(!session?.access_token)throw new Error("Нужен е потвърден email.");
  const r=await fetch(path,{method,headers:{Authorization:"Bearer "+session.access_token,"Content-Type":"application/json",Accept:"application/json"},body:body?JSON.stringify(body):undefined,cache:"no-store"});
  let data={};try{data=await r.json()}catch{}
  if(r.status===401&&session?.refresh_token){await refreshSession();return api(path,{method,body})}
  if(!r.ok)throw new Error(data?.error?.message||data?.error?.code||("HTTP "+r.status));
  return data;
}
async function publicApi(path,{method="POST",body}={}){
  const r=await fetch(path,{method,headers:{"Content-Type":"application/json",Accept:"application/json"},body:JSON.stringify(body||{}),cache:"no-store"});
  let data={};try{data=await r.json()}catch{}
  if(!r.ok)throw new Error(data?.error?.message||data?.error?.code||("HTTP "+r.status));
  return data;
}
function syncAuthUi(){
  const on=!!session?.access_token;
  $("#signout").hidden=!on;
  $("#sendLink").disabled=on;
  $("#email").disabled=on;
  $("#authState").textContent=on?"EMAIL VERIFIED":"AWAITING EMAIL";
  $("#authState").className="state"+(on?" ok":"");
}
async function getUser(){return authCall("/auth/v1/user",{token:session.access_token})}
async function bindRegistrationRequest(){
  const requestId=registrationRequestFromUrl()||sessionStorage.getItem(REQUEST_STORAGE);
  if(!requestId||!UUID_RE.test(requestId)||!session?.access_token)return null;
  const verified=(await api("/api/registration-link",{method:"PATCH",body:{request_id:requestId}})).data;
  sessionStorage.setItem(REQUEST_STORAGE,requestId);
  cleanConfirmationUrl();
  return verified;
}
async function loadDirectory(){
  const r=await fetch("/data/manufacturers.json",{cache:"no-store"});
  if(!r.ok)throw new Error("Manufacturer directory unavailable.");
  directory=await r.json();
  const select=$("#countrySelect");
  for(const [code,name] of directory.countries||[]){
    const option=document.createElement("option");option.value=code;option.textContent=name;select.append(option);
  }
  const other=document.createElement("option");other.value="OTHER";other.textContent="Other / Друга държава";select.append(other);
}
function selectedCountryName(){
  const option=$("#countrySelect").selectedOptions[0];
  return option?option.textContent:"";
}
function updateManufacturers(){
  const code=$("#countrySelect").value;
  const select=$("#manufacturerSelect");select.replaceChildren();
  if(!code){
    const option=document.createElement("option");option.value="";option.textContent="Първо изберете държава…";select.append(option);select.disabled=true;return;
  }
  select.disabled=false;
  const prompt=document.createElement("option");prompt.value="";prompt.textContent="Изберете вашата фирма…";select.append(prompt);
  for(const name of directory.manufacturers?.[code]||[]){
    const option=document.createElement("option");option.value=name;option.textContent=name;select.append(option);
  }
  const other=document.createElement("option");other.value="__OTHER__";other.textContent="Друга фирма / Не е в списъка";select.append(other);
}
function manufacturerName(){
  const value=$("#manufacturerSelect").value;
  if(value==="__OTHER__")return $("#customManufacturer").value.trim();
  return value.trim();
}
function showDashboard(app){
  $("#applicationCard").hidden=true;
  $("#verifyCard").hidden=true;
  $("#dashboardCard").hidden=false;
  $("#dashCompany").textContent=app.company_name||"—";
  $("#dashCountry").textContent=app.country||"—";
  $("#dashEmail").textContent=app.email||currentUser?.email||"—";
  $("#dashboardCard").scrollIntoView({behavior:"smooth",block:"start"});
}
async function loadApplicationState(){
  currentUser=await getUser();
  await bindRegistrationRequest().catch(()=>null);
  result($("#authResult"),"Email потвърден: "+(currentUser.email||"verified user")+".","ok");
  $("#verifyCard").hidden=true;
  const applications=(await api("/api/application")).data||[];
  if(applications.length){showDashboard(applications[0]);return}
  $("#applicationCard").hidden=false;
  $("#dashboardCard").hidden=true;
}
async function submitApplication(){
  const countryCode=$("#countrySelect").value;
  const company=manufacturerName();
  const notes=$("#requestText").value.trim();
  if(!countryCode)throw new Error("Изберете държава.");
  if(!$("#manufacturerSelect").value)throw new Error("Изберете фирма.");
  if(!company)throw new Error("Въведете името на фирмата.");
  if(notes.length<20)throw new Error("Опишете накратко какво ви трябва.");

  $("#submitApplication").disabled=true;
  result($("#applicationResult"),"Записваме Early Access заявката…");
  try{
    const application=(await api("/api/application",{method:"POST",body:{
      company_name:company,
      contact_name:"",
      country:selectedCountryName(),
      website:"",
      employees_count:null,
      dpp_users_count:null,
      production_sites_count:null,
      systems:[],
      product_categories:"Battery / electric mobility DPP early access",
      sku_count:null,
      annual_units:null,
      notes:"Country code: "+countryCode+"\nManufacturer: "+company+"\n\nClient request:\n"+notes
    }})).data;
    showDashboard({...application,country:selectedCountryName(),email:currentUser?.email||application.email});
  }finally{$("#submitApplication").disabled=false}
}
async function init(){
  cfg=await fetch("/data/auth-config.json",{cache:"no-store"}).then(async r=>{if(!r.ok)throw new Error("Auth config unavailable.");return r.json()});
  if(cfg.supabaseUrl!==PROJECT_URL||!String(cfg.publishableKey||"").startsWith("sb_publishable_"))throw new Error("Invalid DPP auth configuration.");
  await loadDirectory();
  document.body.dataset.companyAuthReady="true";
  restoreSession();parseConfirmationFragment();syncAuthUi();
  if(session?.refresh_token){try{await refreshSession()}catch{clearSession()}}
  if(session?.access_token)await loadApplicationState();
  else result($("#authResult"),"Въведете валиден email. Ще получите еднократен sign-in link от Supabase Auth.","ok");
}

$("#countrySelect").addEventListener("change",()=>{updateManufacturers();$("#customManufacturerWrap").hidden=true;$("#customManufacturer").value=""});
$("#manufacturerSelect").addEventListener("change",()=>{$("#customManufacturerWrap").hidden=$("#manufacturerSelect").value!=="__OTHER__"});
$("#sendLink").addEventListener("click",async()=>{
  const email=$("#email").value.trim().toLowerCase();
  if(!validEmail(email))return result($("#authResult"),"Въведете валиден email адрес.","bad");
  $("#sendLink").disabled=true;
  try{
    const response=await publicApi("/api/registration-link",{method:"POST",body:{email}});
    const requestId=response?.data?.request_id;
    if(requestId&&UUID_RE.test(requestId))sessionStorage.setItem(REQUEST_STORAGE,requestId);
    $("#verifyCard").hidden=false;
    $("#verifyResult").textContent="Изпратихме еднократен Supabase Auth link на "+email+". Проверете Inbox/Spam и натиснете Sign in.";
    result($("#authResult"),"Email адресът е записан. Линкът е изпратен.","ok");
  }catch(err){result($("#authResult"),err.message,"bad")}
  finally{if(!session?.access_token)$("#sendLink").disabled=false}
});
$("#submitApplication").addEventListener("click",()=>submitApplication().catch(e=>result($("#applicationResult"),e.message,"bad")));
$("#signout").addEventListener("click",async()=>{
  try{if(session?.access_token)await authCall("/auth/v1/logout?scope=local",{method:"POST",token:session.access_token})}catch{}
  clearSession();sessionStorage.removeItem(REQUEST_STORAGE);
  $("#applicationCard").hidden=true;$("#dashboardCard").hidden=true;$("#verifyCard").hidden=true;
  result($("#authResult"),"Излязохте от акаунта.","ok");
});
init().catch(e=>{document.body.dataset.companyAuthReady="false";result($("#authResult"),e.message,"bad")});
})();