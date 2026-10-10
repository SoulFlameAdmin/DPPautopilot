(()=>{"use strict";
const EARLY_STORAGE="dpp_early_access_client_v1";
const COMPANY_SESSION_KEY="dpp_company_session_v1";
const GOOGLE_SESSION_KEY="dpp_google_session_v1";

function loadScript(src){
  return new Promise((resolve,reject)=>{
    const script=document.createElement("script");
    script.src=src;
    script.onload=resolve;
    script.onerror=()=>reject(new Error("Failed to load "+src));
    document.body.append(script);
  });
}
function readEarlyClient(){
  try{
    const value=JSON.parse(localStorage.getItem(EARLY_STORAGE)||"null");
    if(value&&typeof value.email==="string"&&value.email.includes("@"))return value;
  }catch{}
  return null;
}
function text(selector,value){const node=document.querySelector(selector);if(node)node.textContent=value;}
function disableEarlyAccessControls(){
  document.querySelectorAll("#dashboard button,#dashboard input,#dashboard select,#dashboard textarea").forEach(node=>{node.disabled=true});
  document.querySelectorAll(".side-nav a,#dashboard a").forEach(node=>{
    node.setAttribute("aria-disabled","true");
    node.addEventListener("click",event=>event.preventDefault());
  });
}
function addEarlyAccessNotice(client){
  const workspace=document.querySelector("#dashboard .workspace-main");
  if(!workspace||document.querySelector("#earlyAccessNotice"))return;
  const card=document.createElement("section");
  card.id="earlyAccessNotice";
  card.className="card";
  const eyebrow=document.createElement("p");
  eyebrow.className="eyebrow";
  eyebrow.textContent="EARLY ACCESS · REVIEWING";
  const title=document.createElement("h2");
  title.textContent="Регистрацията е получена.";
  const body=document.createElement("p");
  body.textContent="SoulFlame ще прегледа заявката за "+client.email+" и ще се свърже с вас. Производствените функции ще бъдат активирани след одобрение и уточняване на условията.";
  const state=document.createElement("div");
  state.className="result ok";
  state.textContent="Вашият dashboard е създаден · статус: EARLY ACCESS / REVIEWING";
  card.append(eyebrow,title,body,state);
  workspace.prepend(card);
}
function showEarlyAccess(client){
  document.body.dataset.manufacturerReady="true";
  document.body.dataset.manufacturerAuth="early_access";
  document.body.dataset.manufacturerTenant="pending";
  document.body.dataset.manufacturerMode="early_access";

  const gate=document.querySelector("#authGate");
  const dashboard=document.querySelector("#dashboard");
  if(gate)gate.hidden=true;
  if(dashboard)dashboard.hidden=false;

  text("#workspaceCompanyName","Early Access");
  text("#tenantName",client.email);
  text("#tenantMeta","EARLY ACCESS · REVIEWING · activation pending");
  text(".welcome .eyebrow","EARLY ACCESS MANUFACTURER");
  text(".welcome .state","REGISTRATION RECEIVED · REVIEWING");
  text(".welcome h1","Welcome to SOULFLAME DPP AUTOPILOT");

  const welcomeText=document.querySelector(".welcome h1 + p");
  if(welcomeText)welcomeText.textContent="Вашето фирмено пространство е подготвено. Ще отключим production функциите след преглед и обратна връзка от SoulFlame.";

  addEarlyAccessNotice(client);
  disableEarlyAccessControls();
}
async function companySession(){
  const now=Math.floor(Date.now()/1000);
  let google=null,company=null;
  try{google=JSON.parse(localStorage.getItem(GOOGLE_SESSION_KEY)||"null")}catch{}
  try{company=JSON.parse(sessionStorage.getItem(COMPANY_SESSION_KEY)||"null")}catch{}
  if(google?.access_token){
    const expires=Number(google.expires_at);
    if(Number.isSafeInteger(expires)&&expires>now+30){
      const fresh={access_token:google.access_token,refresh_token:google.refresh_token||"",
        expires_at:expires,expires_in:expires-now,source:"google"};
      sessionStorage.setItem(COMPANY_SESSION_KEY,JSON.stringify(fresh));
      return fresh;
    }
    // Expired tokens are never renewed by simply changing their local expiry.
    try{
      if(typeof google.refresh_token!=="string"||!google.refresh_token)throw new Error("NO_REFRESH_TOKEN");
      const cfgResponse=await fetch("/data/auth-config.json",{cache:"no-store"});
      if(!cfgResponse.ok)throw new Error("AUTH_CONFIG_UNAVAILABLE");
      const cfg=await cfgResponse.json();
      if(cfg?.supabaseUrl!=="https://frhletkiuupgksmgxoxc.supabase.co"||
         typeof cfg.publishableKey!=="string"||!cfg.publishableKey.startsWith("sb_publishable_"))
        throw new Error("AUTH_CONFIG_INVALID");
      const response=await fetch(cfg.supabaseUrl+"/auth/v1/token?grant_type=refresh_token",{
        method:"POST",headers:{apikey:cfg.publishableKey,"Content-Type":"application/json",Accept:"application/json"},
        body:JSON.stringify({refresh_token:google.refresh_token}),cache:"no-store"
      });
      if(!response.ok)throw new Error("AUTH_REFRESH_REJECTED");
      const data=await response.json();
      const ttl=Number(data?.expires_in);
      if(typeof data?.access_token!=="string"||!data.access_token||
         typeof data?.refresh_token!=="string"||!data.refresh_token||
         !Number.isSafeInteger(ttl)||ttl<=30||ttl>604800)throw new Error("AUTH_REFRESH_INVALID");
      const expiresAt=Math.floor(Date.now()/1000)+ttl;
      const fresh={access_token:data.access_token,refresh_token:data.refresh_token,
        expires_at:expiresAt,expires_in:ttl,source:"google"};
      localStorage.setItem(GOOGLE_SESSION_KEY,JSON.stringify({...google,...fresh}));
      sessionStorage.setItem(COMPANY_SESSION_KEY,JSON.stringify(fresh));
      return fresh;
    }catch{
      localStorage.removeItem(GOOGLE_SESSION_KEY);
      sessionStorage.removeItem(COMPANY_SESSION_KEY);
      return null;
    }
  }
  if(company?.source==="google"){
    sessionStorage.removeItem(COMPANY_SESSION_KEY);return null;
  }
  const expires=Number(company?.expires_at);
  if(company?.access_token&&Number.isSafeInteger(expires)&&expires>now+30)return company;
  return null;
}
async function ensureOnboardingConfigured(){
  const active=await companySession();
  if(!active)return true;
  const response=await fetch("/api/manufacturer-onboarding",{
    headers:{Authorization:"Bearer "+active.access_token,Accept:"application/json"},
    cache:"no-store"
  });
  if(response.status===401)return true;
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data?.error?.message||data?.error?.code||("HTTP "+response.status));
  if(data?.data?.configuration?.status==="configured")return true;
  location.replace("/dashboard");
  return false;
}
async function loadProductionDashboard(){
  if(!await ensureOnboardingConfigured())return;
  await loadScript("/assets/csp/manufacturer-inline-1.js");
  await loadScript("/vendor/xlsx.full.min.js");
  await loadScript("/assets/csp/manufacturer-detail-hardening.js");
  await loadScript("/assets/csp/manufacturer-ops-inline-1.js");
}

const params=new URLSearchParams(location.search);
const client=readEarlyClient();
if(params.get("early")==="1"&&client){
  showEarlyAccess(client);
}else{
  loadProductionDashboard().catch(error=>{
    const gate=document.querySelector("#authGate");
    const result=document.querySelector("#gateResult");
    if(gate)gate.hidden=false;
    if(result){result.textContent=error.message;result.className="result bad";}
  });
}
})();