(()=>{"use strict";
const $=s=>document.querySelector(s);
const STORAGE="dpp_company_session_v1";
const PROJECT_URL="https://frhletkiuupgksmgxoxc.supabase.co";
let cfg=null,session=null,refreshTimer=null,currentUser=null;

function result(node,message,kind=""){node.textContent=message;node.className="result"+(kind?" "+kind:"")}
function validEmail(value){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value||"").trim())}
function authHeaders(token){const h={apikey:cfg.publishableKey,"Content-Type":"application/json",Accept:"application/json"};if(token)h.Authorization="Bearer "+token;return h}
async function authCall(path,{method="GET",body,token}={}){
  if(!cfg)throw new Error("Auth configuration is not ready.");
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
  try{
    const r=await fetch(cfg.supabaseUrl+path,{method,headers:authHeaders(token),body:body?JSON.stringify(body):undefined,signal:controller.signal});
    const text=await r.text();let data={};try{data=text?JSON.parse(text):{}}catch{data={}}
    if(!r.ok)throw new Error(data.msg||data.message||data.error_description||data.error||("HTTP "+r.status));
    return data;
  }catch(e){if(e?.name==="AbortError")throw new Error("Authentication request timed out.");throw e}
  finally{clearTimeout(timer)}
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
function confirmationRedirect(){return new URL("/apply",location.origin).href}
function parseConfirmationFragment(){
  const p=new URLSearchParams(location.hash.replace(/^#/,""));
  if(!p.get("access_token"))return false;
  saveSession({access_token:p.get("access_token"),refresh_token:p.get("refresh_token"),expires_in:p.get("expires_in")});
  const clean=new URL(location.href);clean.hash="";history.replaceState(null,"",clean.pathname+clean.search);
  result($("#authResult"),"Email потвърден. Можете да попълните фирмената заявка.","ok");
  return true;
}
async function api(path,{method="GET",body}={}){
  if(!session?.access_token)throw new Error("Login required.");
  const r=await fetch(path,{method,headers:{Authorization:"Bearer "+session.access_token,"Content-Type":"application/json",Accept:"application/json"},body:body?JSON.stringify(body):undefined,cache:"no-store"});
  let data={};try{data=await r.json()}catch{}
  if(r.status===401&&session?.refresh_token){await refreshSession();return api(path,{method,body})}
  if(!r.ok)throw new Error(data?.error?.message||data?.error?.code||("HTTP "+r.status));
  return data;
}
function syncAuthUi(){
  const on=!!session?.access_token;
  $("#signout").hidden=!on;
  $("#sendLink").disabled=on;
  $("#email").disabled=on;
  $("#authState").textContent=on?"AUTHENTICATED":"NOT SIGNED IN";
  $("#authState").className="state"+(on?" ok":"");
}
async function getUser(){
  return authCall("/auth/v1/user",{token:session.access_token});
}
function numberValue(selector,min,max,required=false){
  const raw=$(selector).value.trim();
  if(!raw){
    if(required)throw new Error("Попълнете задължителните числови полета.");
    return null;
  }
  const value=Number(raw);
  if(!Number.isSafeInteger(value)||value<min||value>max)throw new Error("Проверете въведените числови стойности.");
  return value;
}
function selectedSystems(){
  const values=Array.from(document.querySelectorAll('input[name="systems"]:checked')).map(node=>node.value);
  const other=$("#systemsOther").value.trim();
  if(other)values.push("Other: "+other);
  return values;
}
function statusLabel(status){
  return {
    submitted:"Получена",
    reviewing:"В преглед",
    quoted:"Изпратена оферта",
    awaiting_payment:"Очаква плащане",
    paid:"Платена",
    activated:"Активирана",
    rejected:"Затворена"
  }[status]||status;
}
function renderHistory(applications){
  const host=$("#historyList");host.replaceChildren();
  $("#historyCard").hidden=!applications.length;
  for(const app of applications){
    const row=document.createElement("div");row.className="tenant";
    const left=document.createElement("div");
    const strong=document.createElement("strong");strong.textContent=app.company_name;
    const small=document.createElement("small");
    const parts=[statusLabel(app.status)];
    if(app.quote_setup_eur!=null)parts.push("Setup €"+app.quote_setup_eur);
    if(app.quote_monthly_eur!=null)parts.push("Monthly €"+app.quote_monthly_eur);
    small.textContent=parts.join(" · ");
    left.append(strong,small);
    const side=document.createElement("div");side.className="tenant-role";side.textContent=String(app.status||"").toUpperCase();
    row.append(left,side);host.append(row);
  }
}
async function loadApplicationState(){
  if(!session?.access_token)return;
  try{
    currentUser=await getUser();
    result($("#authResult"),"Вход успешен: "+(currentUser.email||"verified user"),"ok");
    $("#verifyCard").hidden=true;
    $("#applicationCard").hidden=false;
    const applications=(await api("/api/application")).data||[];
    renderHistory(applications);
  }catch(e){
    clearSession();
    $("#applicationCard").hidden=true;
    result($("#authResult"),e.message,"bad");
  }
}
async function submitApplication(){
  const company=$("#companyName").value.trim();
  const employees=numberValue("#employeesCount",1,1000000,true);
  const systems=selectedSystems();
  if(!company)throw new Error("Въведете името на фирмата.");
  if(!systems.length)throw new Error("Изберете поне една използвана система или опишете друга.");

  const body={
    company_name:company,
    contact_name:$("#contactName").value.trim(),
    country:$("#country").value.trim(),
    website:$("#website").value.trim(),
    employees_count:employees,
    dpp_users_count:numberValue("#dppUsersCount",1,1000000,false),
    production_sites_count:numberValue("#productionSitesCount",0,100000,false),
    systems,
    product_categories:$("#productCategories").value.trim(),
    sku_count:numberValue("#skuCount",0,100000000,false),
    annual_units:numberValue("#annualUnits",0,1000000000000,false),
    notes:$("#notes").value.trim()
  };

  $("#submitApplication").disabled=true;
  result($("#applicationResult"),"Изпращане на заявката…");
  try{
    const application=(await api("/api/application",{method:"POST",body})).data;
    result($("#applicationResult"),"Заявката е записана успешно.","ok");
    $("#successCard").hidden=false;
    $("#successMeta").textContent="Фирма: "+application.company_name+" · Email: "+application.email+" · Status: "+statusLabel(application.status)+" · ID: "+application.application_id;
    $("#successCard").scrollIntoView({behavior:"smooth",block:"start"});
    const applications=(await api("/api/application")).data||[];
    renderHistory(applications);
  }finally{$("#submitApplication").disabled=false}
}
async function init(){
  cfg=await fetch("/data/auth-config.json",{cache:"no-store"}).then(async r=>{if(!r.ok)throw new Error("Auth config unavailable.");return r.json()});
  if(cfg.supabaseUrl!==PROJECT_URL||!String(cfg.publishableKey||"").startsWith("sb_publishable_"))throw new Error("Invalid DPP auth configuration.");
  document.body.dataset.companyAuthReady="true";
  restoreSession();parseConfirmationFragment();syncAuthUi();
  if(session?.refresh_token){try{await refreshSession()}catch{clearSession()}}
  if(session?.access_token)await loadApplicationState();
  else result($("#authResult"),"Въведете служебния email. Системата ще изпрати защитен регистрационен линк.","ok");
}

$("#sendLink").addEventListener("click",async()=>{
  const e=$("#email").value.trim();
  if(!validEmail(e))return result($("#authResult"),"Въведете валиден служебен email.","bad");
  $("#sendLink").disabled=true;
  try{
    const path="/auth/v1/otp?redirect_to="+encodeURIComponent(confirmationRedirect());
    await authCall(path,{method:"POST",body:{email:e,create_user:true,data:{dpp_company_onboarding:true}}});
    $("#verifyCard").hidden=false;
    $("#verifyResult").textContent="Изпратихме регистрационен линк на "+e+". Проверете Inbox/Spam и натиснете линка.";
    result($("#authResult"),"Линкът е заявен от DPP Autopilot. След отварянето му ще продължите с регистрацията на фирмата.","ok");
  }catch(err){result($("#authResult"),err.message,"bad")}
  finally{if(!session?.access_token)$("#sendLink").disabled=false}
});
$("#signout").addEventListener("click",async()=>{
  try{if(session?.access_token)await authCall("/auth/v1/logout?scope=local",{method:"POST",token:session.access_token})}catch{}
  clearSession();$("#applicationCard").hidden=true;$("#historyCard").hidden=true;$("#successCard").hidden=true;
  result($("#authResult"),"Излязохте от акаунта.","ok");
});
$("#submitApplication").addEventListener("click",()=>submitApplication().catch(e=>result($("#applicationResult"),e.message,"bad")));
init().catch(e=>{document.body.dataset.companyAuthReady="false";result($("#authResult"),e.message,"bad")});
})();