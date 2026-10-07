(()=>{"use strict";
const EARLY_STORAGE="dpp_early_access_client_v1";

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
function readProductionSession(){
  try{
    const value=JSON.parse(sessionStorage.getItem("dpp_company_session_v1")||"null");
    return !!value?.access_token;
  }catch{}
  return false;
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
async function loadProductionDashboard(){
  await loadScript("/assets/csp/manufacturer-inline-1.js");
  await loadScript("/vendor/xlsx.full.min.js");
  await loadScript("/assets/csp/manufacturer-ops-inline-1.js");
}

const params=new URLSearchParams(location.search);
const client=readEarlyClient();
const productionSession=readProductionSession();
// A real authenticated company session always wins over stale early-access state.
// This keeps refresh/re-entry on the operational Manufacturer Home instead of
// accidentally falling back to the read-only early-access shell.
if(params.get("early")==="1"&&client&&!productionSession){
  showEarlyAccess(client);
}else{
  if(productionSession&&params.has("early")){
    params.delete("early");
    const query=params.toString();
    history.replaceState(null,"",location.pathname+(query?"?"+query:"")+location.hash);
  }
  loadProductionDashboard().catch(error=>{
    const gate=document.querySelector("#authGate");
    const result=document.querySelector("#gateResult");
    if(gate)gate.hidden=false;
    if(result){result.textContent=error.message;result.className="result bad";}
  });
}
})();