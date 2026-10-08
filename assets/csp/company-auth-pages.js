(()=>{"use strict";
const $=s=>document.querySelector(s);
const STORAGE="dpp_company_session_v1";
const PROJECT_URL="https://frhletkiuupgksmgxoxc.supabase.co";
const page=document.body.dataset.authPage||"";
let cfg=null,recoverySession=null;

function setResult(message,kind="",node=$("#pageResult")){
  if(!node)return;
  node.textContent=message;
  node.className="result"+(kind?" "+kind:"");
}
function setState(value,kind=""){
  const node=$("#pageState");
  if(!node)return;
  node.textContent=value;
  node.className="state"+(kind?" "+kind:"");
}
function validEmail(value){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value||"").trim())}
function validPassword(value){return String(value||"").length>=8}
function validPhone(value){return /^[+0-9() .-]{5,40}$/.test(String(value||"").trim())}
function validRegistrationId(value){return /^[A-Za-z0-9 ._\/-]{4,40}$/.test(String(value||"").trim())}
function saveSession(value){
  if(!value?.access_token)throw new Error("Authentication session is missing.");
  const session={
    access_token:value.access_token,
    refresh_token:value.refresh_token||"",
    expires_in:Number(value.expires_in)||3600
  };
  sessionStorage.setItem(STORAGE,JSON.stringify(session));
  return session;
}
function clearSession(){sessionStorage.removeItem(STORAGE)}
function headers(token){
  const value={apikey:cfg.publishableKey,"Content-Type":"application/json",Accept:"application/json"};
  if(token)value.Authorization="Bearer "+token;
  return value;
}
async function authCall(path,{method="GET",body,token}={}){
  if(!cfg)throw new Error("Auth configuration is not ready.");
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
  try{
    const response=await fetch(cfg.supabaseUrl+path,{
      method,headers:headers(token),body:body?JSON.stringify(body):undefined,signal:controller.signal
    });
    const raw=await response.text();
    let data={};
    try{data=raw?JSON.parse(raw):{}}catch{}
    if(!response.ok)throw new Error(data.msg||data.message||data.error_description||data.error||("HTTP "+response.status));
    return data;
  }catch(error){
    if(error?.name==="AbortError")throw new Error("Authentication request timed out.");
    throw error;
  }finally{clearTimeout(timer)}
}
async function loadConfig(){
  const response=await fetch("/data/auth-config.json",{cache:"no-store"});
  if(!response.ok)throw new Error("Auth config unavailable.");
  cfg=await response.json();
  if(cfg.supabaseUrl!==PROJECT_URL||!String(cfg.publishableKey||"").startsWith("sb_publishable_")){
    throw new Error("Invalid DPP auth configuration.");
  }
  document.body.dataset.companyAuthReady="true";
  setState("READY","ok");
}
function confirmationRedirect(){return new URL("/company?source=register",location.origin).href}
function recoveryRedirect(){return new URL("/forgot-password?recovery=1",location.origin).href}
async function discoverTenant(session){
  const response=await fetch("/api/organizations",{
    method:"GET",
    headers:{Authorization:"Bearer "+session.access_token,Accept:"application/json"},
    cache:"no-store"
  });
  if(response.status===401)throw new Error("Session verification failed.");
  if(!response.ok)return null;
  const body=await response.json().catch(()=>({}));
  const orgs=Array.isArray(body?.data)?body.data:[];
  return orgs.find(org=>org&&org.active)||null;
}
function parseRecoveryHash(){
  const params=new URLSearchParams(String(location.hash||"").replace(/^#/,""));
  const access=params.get("access_token");
  if(!access||params.get("type")!=="recovery")return false;
  recoverySession=saveSession({
    access_token:access,
    refresh_token:params.get("refresh_token")||"",
    expires_in:params.get("expires_in")
  });
  const clean=new URL(location.href);
  clean.hash="";
  history.replaceState(null,"",clean.pathname+clean.search);
  return true;
}
async function register(){
  const contactName=$("#contactName").value.trim();
  const companyName=$("#companyName").value.trim();
  const email=$("#email").value.trim().toLowerCase();
  const phone=$("#phone").value.trim();
  const registrationId=$("#registrationId").value.trim();
  const password=$("#password").value;
  const confirmPassword=$("#confirmPassword").value;

  if(contactName.length<2||contactName.length>120)return setResult("Въведи валидно име / лице за контакт.","bad");
  if(companyName.length<2||companyName.length>200)return setResult("Въведи валидно име на фирмата.","bad");
  if(!validEmail(email))return setResult("Въведи валиден служебен email.","bad");
  if(!validPhone(phone))return setResult("Въведи валиден телефон.","bad");
  if(!validRegistrationId(registrationId))return setResult("Въведи валиден ЕИК / VAT / Registration ID.","bad");
  if(!validPassword(password))return setResult("Паролата трябва да е минимум 8 символа.","bad");
  if(password!==confirmPassword)return setResult("Двете пароли не съвпадат.","bad");

  const button=$("#registerSubmit");
  button.disabled=true;
  setState("WORKING","pending");
  setResult("Създаване на фирмен акаунт…");
  try{
    const data=await authCall("/auth/v1/signup?redirect_to="+encodeURIComponent(confirmationRedirect()),{
      method:"POST",
      body:{
        email,password,
        data:{
          contact_name:contactName,
          company_name:companyName,
          phone,
          company_registration_id:registrationId
        }
      }
    });
    if(data.access_token){
      saveSession(data);
      location.assign("/company?source=register");
      return;
    }
    setState("VERIFY EMAIL","pending");
    setResult("Ако email-ът е нов, confirmation link е изпратен. Ако вече е използван, няма да получиш нов confirmation — използвай Вход или Забравена парола. За чист E2E тест използвай нов email адрес.","ok");
  }catch(error){
    setState("ERROR");
    setResult(error.message,"bad");
  }finally{button.disabled=false}
}
async function login(){
  const email=$("#email").value.trim().toLowerCase();
  const password=$("#password").value;
  if(!validEmail(email)||!validPassword(password))return setResult("Въведи валиден email и парола.","bad");

  const button=$("#loginSubmit");
  button.disabled=true;
  setState("WORKING","pending");
  setResult("Проверка на акаунта…");
  try{
    const data=await authCall("/auth/v1/token?grant_type=password",{method:"POST",body:{email,password}});
    const session=saveSession(data);
    const active=await discoverTenant(session);
    setState("AUTHENTICATED","ok");
    location.assign(active?"/dashboard":"/company?source=login");
  }catch(error){
    clearSession();
    setState("ERROR");
    setResult(error.message,"bad");
  }finally{button.disabled=false}
}
async function requestRecovery(){
  const email=$("#email").value.trim().toLowerCase();
  if(!validEmail(email))return setResult("Въведи валиден служебен email.","bad");
  const button=$("#forgotSubmit");
  button.disabled=true;
  setState("WORKING","pending");
  try{
    await authCall("/auth/v1/recover?redirect_to="+encodeURIComponent(recoveryRedirect()),{method:"POST",body:{email}});
    setState("EMAIL SENT","ok");
    setResult("Ако акаунтът съществува, recovery link е изпратен. Провери email-а.","ok");
  }catch(error){
    setState("ERROR");
    setResult(error.message,"bad");
  }finally{button.disabled=false}
}
async function resetPassword(){
  const password=$("#newPassword").value;
  const confirmPassword=$("#confirmNewPassword").value;
  if(!recoverySession?.access_token)return setResult("Няма валидна recovery сесия.","bad",$("#resetResult"));
  if(!validPassword(password))return setResult("Новата парола трябва да е минимум 8 символа.","bad",$("#resetResult"));
  if(password!==confirmPassword)return setResult("Двете пароли не съвпадат.","bad",$("#resetResult"));

  const button=$("#resetSubmit");
  button.disabled=true;
  setResult("Смяна на паролата…","",$("#resetResult"));
  try{
    await authCall("/auth/v1/user",{method:"PUT",body:{password},token:recoverySession.access_token});
    await authCall("/auth/v1/logout?scope=global",{method:"POST",token:recoverySession.access_token}).catch(()=>{});
    clearSession();
    recoverySession=null;
    setResult("Паролата е сменена. Влез с новата парола.","ok",$("#resetResult"));
    setTimeout(()=>location.assign("/login?reset=1"),500);
  }catch(error){
    setResult(error.message,"bad",$("#resetResult"));
    button.disabled=false;
  }
}
async function init(){
  await loadConfig();
  if(page==="register"){
    $("#registerSubmit").addEventListener("click",register);
    return;
  }
  if(page==="login"){
    if(new URLSearchParams(location.search).get("reset")==="1")setResult("Паролата е сменена успешно. Влез с новата парола.","ok");
    $("#loginSubmit").addEventListener("click",login);
    return;
  }
  if(page==="forgot"){
    $("#forgotSubmit").addEventListener("click",requestRecovery);
    $("#resetSubmit").addEventListener("click",resetPassword);
    if(parseRecoveryHash()){
      $("#requestCard").hidden=true;
      $("#resetCard").hidden=false;
      setState("RECOVERY","pending");
      setResult("Recovery сесията е потвърдена. Задай нова парола.","ok",$("#resetResult"));
    }
  }
}
init().catch(error=>{
  document.body.dataset.companyAuthReady="false";
  setState("ERROR");
  setResult(error.message,"bad");
});
})();