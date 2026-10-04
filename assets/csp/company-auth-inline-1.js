(()=>{"use strict";
const $=s=>document.querySelector(s);
const STORAGE="dpp_company_session_v1";
const PROJECT_URL="https://frhletkiuupgksmgxoxc.supabase.co";
let cfg=null,session=null,refreshTimer=null;

function result(node,message,kind=""){node.textContent=message;node.className="result"+(kind?" "+kind:"")}
function validEmail(value){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value||"").trim())}
function validPassword(value){return String(value||"").length>=8}
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
  session=null;sessionStorage.removeItem(STORAGE);document.body.dataset.companySession="anonymous";
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
function confirmationRedirect(){return new URL("/company",location.origin).href}
function parseConfirmationFragment(){
  const p=new URLSearchParams(location.hash.replace(/^#/,""));
  if(!p.get("access_token"))return false;
  saveSession({access_token:p.get("access_token"),refresh_token:p.get("refresh_token"),expires_in:p.get("expires_in")});
  history.replaceState(null,"",location.pathname+location.search);
  result($("#authResult"),"Email verified. Authenticated session received.","ok");
  return true;
}
function slugify(value){
  const map={а:"a",б:"b",в:"v",г:"g",д:"d",е:"e",ж:"zh",з:"z",и:"i",й:"y",к:"k",л:"l",м:"m",н:"n",о:"o",п:"p",р:"r",с:"s",т:"t",у:"u",ф:"f",х:"h",ц:"ts",ч:"ch",ш:"sh",щ:"sht",ъ:"a",ь:"",ю:"yu",я:"ya"};
  return String(value||"").toLowerCase().split("").map(ch=>map[ch]??ch).join("").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,120);
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
  $("#signup").disabled=on;$("#signin").disabled=on;
  $("#email").disabled=on;$("#password").disabled=on;
  $("#authState").textContent=on?"AUTHENTICATED":"NOT SIGNED IN";
  $("#authState").className="state"+(on?" ok":"");
}
async function getUser(){
  const user=await authCall("/auth/v1/user",{token:session.access_token});
  return user;
}
async function loadTenantState(){
  if(!session?.access_token)return;
  let user;
  try{user=await getUser()}catch(e){clearSession();result($("#authResult"),e.message,"bad");return}
  result($("#authResult"),"Вход успешен: "+(user.email||"verified user"),"ok");
  $("#verifyCard").hidden=true;
  try{
    const orgs=(await api("/api/organizations")).data||[];
    renderOrganisations(orgs);
    if(!orgs.length){
      $("#companyCard").hidden=false;$("#tenantCard").hidden=true;$("#readyCard").hidden=true;document.body.dataset.companyTenant="none";
    }else{
      $("#companyCard").hidden=true;$("#tenantCard").hidden=false;
      const active=orgs.find(o=>o.active);
      if(active)showReady(active);else{$("#readyCard").hidden=true;document.body.dataset.companyTenant="available"}
    }
  }catch(e){result($("#companyResult"),"Tenant API: "+e.message,"bad");$("#companyCard").hidden=false}
}
function renderOrganisations(orgs){
  const host=$("#tenantList");host.innerHTML="";
  for(const org of orgs){
    const row=document.createElement("div");row.className="tenant"+(org.active?" active":"");
    const copy=document.createElement("div");
    const strong=document.createElement("strong");strong.textContent=org.name;
    const small=document.createElement("small");small.textContent=org.slug+" · "+org.organization_id;
    copy.append(strong,small);
    const side=document.createElement("div");
    const role=document.createElement("div");role.className="tenant-role";role.textContent=org.role;
    const button=document.createElement("button");button.className="btn";button.type="button";button.textContent=org.active?"ACTIVE":"Активирай";button.disabled=org.active;
    button.addEventListener("click",()=>activateTenant(org.organization_id));
    side.append(role,button);row.append(copy,side);host.append(row);
  }
}
async function activateTenant(id){
  try{await api("/api/tenant",{method:"POST",body:{organization_id:id}});await loadTenantState()}catch(e){result($("#companyResult"),e.message,"bad")}
}
function showReady(org){
  document.body.dataset.companyTenant="active";$("#readyCard").hidden=false;
  $("#readyCompany").textContent=org.name+" е активна.";
  $("#readyMeta").textContent="Role: "+org.role+" · tenant: "+org.slug+" · "+org.organization_id;
}
async function init(){
  cfg=await fetch("/data/auth-config.json",{cache:"no-store"}).then(async r=>{if(!r.ok)throw new Error("Auth config unavailable.");return r.json()});
  if(cfg.supabaseUrl!==PROJECT_URL||!String(cfg.publishableKey||"").startsWith("sb_publishable_"))throw new Error("Invalid DPP auth configuration.");
  document.body.dataset.companyAuthReady="true";
  restoreSession();parseConfirmationFragment();syncAuthUi();
  if(session?.refresh_token){try{await refreshSession()}catch{clearSession()}}
  if(session?.access_token)await loadTenantState();
  else result($("#authResult"),"Готово. Създай акаунт или влез.","ok");
}
$("#companyName").addEventListener("input",()=>{if(!$("#companySlug").dataset.manual)$("#companySlug").value=slugify($("#companyName").value)});
$("#companySlug").addEventListener("input",()=>{$("#companySlug").dataset.manual="1";$("#companySlug").value=slugify($("#companySlug").value)});
$("#signup").addEventListener("click",async()=>{
  const e=$("#email").value.trim(),p=$("#password").value;
  if(!validEmail(e)||!validPassword(p)){return result($("#authResult"),"Въведи валиден служебен email и парола минимум 8 символа.","bad")}
  try{
    const path="/auth/v1/signup?redirect_to="+encodeURIComponent(confirmationRedirect());
    const data=await authCall(path,{method:"POST",body:{email:e,password:p}});
    if(data.access_token){saveSession(data);await loadTenantState();return}
    $("#verifyCard").hidden=false;$("#verifyResult").textContent="Confirmation email requested for "+e+". След потвърждение отвори /company.";
    result($("#authResult"),"Регистрацията е приета. Нужно е email потвърждение.","ok");
  }catch(err){result($("#authResult"),err.message,"bad")}
});
$("#signin").addEventListener("click",async()=>{
  const e=$("#email").value.trim(),p=$("#password").value;
  if(!validEmail(e)||!validPassword(p)){return result($("#authResult"),"Въведи валиден email и парола.","bad")}
  try{const data=await authCall("/auth/v1/token?grant_type=password",{method:"POST",body:{email:e,password:p}});saveSession(data);await loadTenantState()}
  catch(err){result($("#authResult"),err.message,"bad")}
});
$("#signout").addEventListener("click",async()=>{
  try{if(session?.access_token)await authCall("/auth/v1/logout",{method:"POST",token:session.access_token})}catch{}
  clearSession();$("#companyCard").hidden=true;$("#tenantCard").hidden=true;$("#readyCard").hidden=true;result($("#authResult"),"Изходът е успешен.","ok");
});
$("#createCompany").addEventListener("click",async()=>{
  const name=$("#companyName").value.trim(),slug=slugify($("#companySlug").value||name);
  if(!name||!slug){return result($("#companyResult"),"Въведи име на фирмата и валиден slug.","bad")}
  $("#companySlug").value=slug;
  try{
    const created=(await api("/api/organizations",{method:"POST",body:{name,slug}})).data;
    result($("#companyResult"),"Company tenant created: "+created.name,"ok");
    await loadTenantState();
  }catch(err){result($("#companyResult"),err.message,"bad")}
});
init().catch(e=>{document.body.dataset.companyAuthReady="false";result($("#authResult"),e.message,"bad")});
})();