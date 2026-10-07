(()=>{"use strict";
const $=s=>document.querySelector(s);
const STORAGE="dpp_company_session_v1";
const PROJECT_URL="https://frhletkiuupgksmgxoxc.supabase.co";
let cfg=null,session=null,refreshTimer=null,currentUser=null,activeOrg=null,recoveryMode=false;

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
function recoveryRedirect(){return new URL("/company",location.origin).href}
function parseConfirmationFragment(){
  const p=new URLSearchParams(location.hash.replace(/^#/,""));
  if(!p.get("access_token"))return false;
  recoveryMode=p.get("type")==="recovery"||new URLSearchParams(location.search).get("recovery")==="1";
  saveSession({access_token:p.get("access_token"),refresh_token:p.get("refresh_token"),expires_in:p.get("expires_in")});
  const clean=new URL(location.href);clean.hash="";clean.searchParams.delete("recovery");history.replaceState(null,"",clean.pathname+clean.search);
  document.body.dataset.companyRecovery=recoveryMode?"active":"none";
  if(recoveryMode){
    $("#resetCard").hidden=false;
    result($("#resetResult"),"Recovery сесията е потвърдена. Въведи новата парола.","ok");
    result($("#authResult"),"Password recovery mode.","ok");
    return "recovery";
  }
  result($("#authResult"),"Email verified. Authenticated session received.","ok");
  return "confirmation";
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
async function verifyRegistrationRequest(){
  if(!session?.access_token||recoveryMode)return null;
  const url=new URL(location.href),requestId=url.searchParams.get("request");
  if(!requestId)return null;
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)){
    result($("#authResult"),"Невалиден registration request.","bad");return null;
  }
  try{
    const verified=(await api("/api/registration-link",{method:"PATCH",body:{request_id:requestId}})).data;
    url.searchParams.delete("request");url.searchParams.delete("dpp");
    history.replaceState(null,"",url.pathname+url.search+url.hash);
    result($("#authResult"),"DPP registration verified. Продължаваме към фирмения tenant.","ok");
    return verified;
  }catch(e){result($("#authResult"),"Registration verification: "+e.message,"bad");return null}
}
function syncAuthUi(){
  const on=!!session?.access_token;
  const recovery=on&&recoveryMode;
  $("#signout").hidden=!on||recovery;
  $("#forgotPassword").disabled=on;
  $("#signup").disabled=on;$("#signin").disabled=on;
  $("#email").disabled=on;$("#password").disabled=on;
  $("#sessionCard").hidden=!on||recovery;
  $("#authState").textContent=recovery?"RECOVERY":(on?"AUTHENTICATED":"NOT SIGNED IN");
  $("#authState").className="state"+(on?" ok":"");
}
async function getUser(){
  const user=await authCall("/auth/v1/user",{token:session.access_token});
  return user;
}
async function loadTenantState(){
  if(!session?.access_token||recoveryMode)return;
  let user;
  try{user=await getUser()}catch(e){clearSession();result($("#authResult"),e.message,"bad");return}
  currentUser=user;
  result($("#authResult"),"Вход успешен: "+(user.email||"verified user"),"ok");
  $("#verifyCard").hidden=true;
  try{
    const orgs=(await api("/api/organizations")).data||[];
    renderOrganisations(orgs);
    if(!orgs.length){
      activeOrg=null;$("#companyCard").hidden=false;$("#tenantCard").hidden=true;$("#readyCard").hidden=true;$("#teamCard").hidden=true;document.body.dataset.companyTenant="none";
    }else{
      $("#companyCard").hidden=true;$("#tenantCard").hidden=false;
      const active=orgs.find(o=>o.active);
      if(active)showReady(active);else{activeOrg=null;$("#readyCard").hidden=true;$("#teamCard").hidden=true;document.body.dataset.companyTenant="available"}
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
  activeOrg=org;
  document.body.dataset.companyTenant="active";$("#readyCard").hidden=false;$("#teamCard").hidden=false;
  $("#readyCompany").textContent=org.name+" е активна.";
  $("#readyMeta").textContent="Role: "+org.role+" · tenant: "+org.slug+" · "+org.organization_id;
  loadTeam().catch(e=>result($("#teamResult"),e.message,"bad"));
  const params=new URLSearchParams(location.search);
  if(!recoveryMode&&(params.get("dpp")==="1"||params.get("request"))){
    const target=new URL("/manufacturer",location.origin);
    target.searchParams.set("onboarding","1");
    location.replace(target.href);
  }
}

function canManageTarget(targetRole){
  if(!activeOrg)return false;
  if(activeOrg.role==="owner")return targetRole!=="owner";
  if(activeOrg.role==="admin")return targetRole==="editor"||targetRole==="viewer";
  return false;
}
function allowedRoles(){
  return activeOrg?.role==="owner"?["admin","editor","viewer"]:["editor","viewer"];
}
async function loadTeam(){
  if(!activeOrg)return;
  $("#teamRoleBadge").textContent=String(activeOrg.role||"rbac").toUpperCase();
  const manager=activeOrg.role==="owner"||activeOrg.role==="admin";
  $("#teamAdd").hidden=!manager;
  const roleSelect=$("#memberRole");
  Array.from(roleSelect.options).forEach(o=>{o.hidden=activeOrg.role==="admin"&&o.value==="admin";o.disabled=o.hidden});
  if(activeOrg.role==="admin"&&roleSelect.value==="admin")roleSelect.value="editor";
  const members=(await api("/api/members?detail=1")).data||[];
  renderTeam(members);
}
function renderTeam(members){
  const host=$("#teamList");host.replaceChildren();
  if(!members.length){
    const empty=document.createElement("div");empty.className="result";empty.textContent="Няма членове в активния tenant.";host.append(empty);return;
  }
  for(const member of members){
    const row=document.createElement("article");row.className="team-member"+(member.is_self?" self":"");
    const left=document.createElement("div");
    const title=document.createElement("strong");title.textContent=member.email||member.user_id;
    const meta=document.createElement("small");meta.textContent=member.role.toUpperCase()+" · "+member.user_id+(member.is_self?" · YOU":"");
    left.append(title,meta);

    const side=document.createElement("div");side.className="team-member-side";
    if(canManageTarget(member.role)){
      const select=document.createElement("select");
      for(const role of allowedRoles()){
        const option=document.createElement("option");option.value=role;option.textContent=role.toUpperCase();option.selected=role===member.role;select.append(option);
      }
      select.addEventListener("change",()=>updateMemberRole(member.user_id,select.value));
      const remove=document.createElement("button");remove.type="button";remove.className="btn danger";remove.textContent="Премахни";
      remove.addEventListener("click",()=>removeMember(member.user_id,member.email||member.user_id));
      side.append(select,remove);
    }else{
      const readonly=document.createElement("span");readonly.className="team-readonly";readonly.textContent=member.role.toUpperCase();side.append(readonly);
    }
    row.append(left,side);host.append(row);
  }
}
async function updateMemberRole(userId,role){
  try{
    await api("/api/members",{method:"PATCH",body:{user_id:userId,role}});
    result($("#teamResult"),"Ролята е обновена.","ok");await loadTeam();
  }catch(e){result($("#teamResult"),e.message,"bad");await loadTeam().catch(()=>{})}
}
async function removeMember(userId,label){
  if(!confirm("Премахване на "+label+" от фирмения tenant?"))return;
  try{
    await api("/api/members",{method:"DELETE",body:{user_id:userId}});
    result($("#teamResult"),"Членът е премахнат.","ok");await loadTeam();
  }catch(e){result($("#teamResult"),e.message,"bad")}
}
async function init(){
  cfg=await fetch("/data/auth-config.json",{cache:"no-store"}).then(async r=>{if(!r.ok)throw new Error("Auth config unavailable.");return r.json()});
  if(cfg.supabaseUrl!==PROJECT_URL||!String(cfg.publishableKey||"").startsWith("sb_publishable_"))throw new Error("Invalid DPP auth configuration.");
  document.body.dataset.companyAuthReady="true";
  restoreSession();parseConfirmationFragment();syncAuthUi();
  if(recoveryMode)return;
  if(session?.refresh_token){try{await refreshSession()}catch{clearSession()}}
  if(session?.access_token){await verifyRegistrationRequest();await loadTenantState();}
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
$("#forgotPassword").addEventListener("click",async()=>{
  const e=$("#email").value.trim();
  if(!validEmail(e))return result($("#authResult"),"Въведи валиден email за recovery.","bad");
  $("#forgotPassword").disabled=true;
  try{
    await authCall("/auth/v1/recover?redirect_to="+encodeURIComponent(recoveryRedirect()),{method:"POST",body:{email:e}});
    result($("#authResult"),"Ако акаунтът съществува, recovery линкът е изпратен на email-а.","ok");
  }catch(err){result($("#authResult"),err.message,"bad")}
  finally{$("#forgotPassword").disabled=false}
});
$("#signin").addEventListener("click",async()=>{
  const e=$("#email").value.trim(),p=$("#password").value;
  if(!validEmail(e)||!validPassword(p)){return result($("#authResult"),"Въведи валиден email и парола.","bad")}
  try{const data=await authCall("/auth/v1/token?grant_type=password",{method:"POST",body:{email:e,password:p}});saveSession(data);await loadTenantState()}
  catch(err){result($("#authResult"),err.message,"bad")}
});
$("#signout").addEventListener("click",async()=>{
  try{if(session?.access_token)await authCall("/auth/v1/logout?scope=local",{method:"POST",token:session.access_token})}catch{}
  currentUser=null;activeOrg=null;recoveryMode=false;clearSession();
  $("#companyCard").hidden=true;$("#tenantCard").hidden=true;$("#readyCard").hidden=true;$("#teamCard").hidden=true;$("#sessionCard").hidden=true;
  result($("#authResult"),"Текущата сесия е приключена.","ok");
});
$("#revokeSessions").addEventListener("click",async()=>{
  if(!session?.access_token)return;
  $("#revokeSessions").disabled=true;result($("#sessionResult"),"Отнемане на refresh сесиите…");
  try{
    await authCall("/auth/v1/logout?scope=global",{method:"POST",token:session.access_token});
    currentUser=null;activeOrg=null;recoveryMode=false;clearSession();
    $("#companyCard").hidden=true;$("#tenantCard").hidden=true;$("#readyCard").hidden=true;$("#teamCard").hidden=true;$("#sessionCard").hidden=true;
    result($("#authResult"),"Сесиите са отнети. Влез отново.","ok");
  }catch(err){result($("#sessionResult"),err.message,"bad");$("#revokeSessions").disabled=false}
});
$("#updatePassword").addEventListener("click",async()=>{
  const password=$("#newPassword").value,confirmPassword=$("#confirmNewPassword").value;
  if(!recoveryMode||!session?.access_token)return result($("#resetResult"),"Няма активна recovery сесия.","bad");
  if(!validPassword(password))return result($("#resetResult"),"Новата парола трябва да е минимум 8 символа.","bad");
  if(password!==confirmPassword)return result($("#resetResult"),"Двете пароли не съвпадат.","bad");
  $("#updatePassword").disabled=true;result($("#resetResult"),"Смяна на паролата…");
  try{
    await authCall("/auth/v1/user",{method:"PUT",body:{password},token:session.access_token});
    await authCall("/auth/v1/logout?scope=global",{method:"POST",token:session.access_token});
    recoveryMode=false;currentUser=null;activeOrg=null;clearSession();
    $("#newPassword").value="";$("#confirmNewPassword").value="";$("#resetCard").hidden=true;
    document.body.dataset.companyRecovery="complete";
    result($("#authResult"),"Паролата е сменена и refresh сесиите са отнети. Влез отново.","ok");
  }catch(err){result($("#resetResult"),err.message,"bad");$("#updatePassword").disabled=false}
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
$("#addMember").addEventListener("click",async()=>{
  if(!activeOrg||!(activeOrg.role==="owner"||activeOrg.role==="admin"))return;
  const email=$("#memberEmail").value.trim().toLowerCase(),role=$("#memberRole").value;
  if(!validEmail(email)){return result($("#teamResult"),"Въведи валиден служебен email.","bad")}
  if(activeOrg.role==="admin"&&role==="admin"){return result($("#teamResult"),"Admin не може да добавя друг admin.","bad")}
  try{
    await api("/api/members",{method:"POST",body:{email,role}});
    $("#memberEmail").value="";
    result($("#teamResult"),"Членът е добавен към активната фирма.","ok");
    await loadTeam();
  }catch(e){
    const msg=/target user/i.test(e.message)
      ?"Този email още няма потвърден DPP акаунт. Нека първо се регистрира и потвърди email-а в /company."
      :e.message;
    result($("#teamResult"),msg,"bad");
  }
});
init().catch(e=>{document.body.dataset.companyAuthReady="false";result($("#authResult"),e.message,"bad")});
})();