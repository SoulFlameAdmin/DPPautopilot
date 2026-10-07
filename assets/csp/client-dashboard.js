(()=>{"use strict";
const $=s=>document.querySelector(s);
const ENDPOINT="https://soulflame-twins.vercel.app/api/dpp-dashboard-link";
const TOKEN_STORAGE="dpp_early_access_token_v1";
const COMPANY_SESSION_STORAGE="dpp_company_session_v1";
const ONBOARDING_ENDPOINT="/api/manufacturer-onboarding";
const QUESTION_KEYS=[
  "onboardingQ1","onboardingQ2","onboardingQ3","onboardingQ4",
  "onboardingQ5","onboardingQ6","onboardingQ7","onboardingQ8"
];
const STEP_IDS={
  company:"configStepCompany",
  workflow:"configStepWorkflow",
  product:"configStepProduct",
  batch:"configStepBatch",
  dpp:"configStepDpp",
  qr:"configStepQr",
  ready:"configStepReady"
};
let token="",profile=null,directory={countries:[],manufacturers:{}};
let companySession=null;
const saveTimers=new Map();
const saveQueues=new Map();

function setStatus(message,kind=""){
  const n=$("#statusBox");
  if(!n)return;
  n.textContent=message;
  n.className="result"+(kind?" "+kind:"");
}
function onboardingMessage(message,kind=""){
  const n=$(".onboarding-state-note");
  if(!n)return;
  n.textContent=message;
  n.dataset.state=kind||"info";
}
function tokenFromHash(){
  const p=new URLSearchParams(String(location.hash||"").replace(/^#/,""));
  const value=String(p.get("access")||"").trim();
  return /^[a-f0-9]{64}$/i.test(value)?value:"";
}
function saveToken(value){
  token=value;
  if(token)localStorage.setItem(TOKEN_STORAGE,token);
}
function restoreToken(){
  const value=String(localStorage.getItem(TOKEN_STORAGE)||"").trim();
  if(/^[a-f0-9]{64}$/i.test(value)){token=value;return true}
  return false;
}
function cleanUrl(){
  history.replaceState(null,"",location.pathname+location.search);
}
function readCompanySession(){
  try{
    const value=JSON.parse(sessionStorage.getItem(COMPANY_SESSION_STORAGE)||"null");
    if(value&&typeof value.access_token==="string"&&value.access_token.length>20){
      companySession=value;
      return true;
    }
  }catch{}
  companySession=null;
  return false;
}
function hasManufacturerOnboardingUi(){
  return QUESTION_KEYS.every(key=>!!$("#"+key))&&!!$("#configureDppSystem");
}
async function call(action,extra={}){
  const response=await fetch(ENDPOINT,{
    method:"POST",
    headers:{"Content-Type":"application/json","Accept":"application/json"},
    body:JSON.stringify({action,token,...extra}),
    cache:"no-store"
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data?.error||"Dashboard request failed.");
  return data;
}
async function manufacturerApi({method="GET",body}={}){
  if(!companySession?.access_token)throw new Error("Няма активна фирмена сесия. Влезте през Company Access.");
  const response=await fetch(ONBOARDING_ENDPOINT,{
    method,
    headers:{
      Authorization:"Bearer "+companySession.access_token,
      "Content-Type":"application/json",
      Accept:"application/json"
    },
    body:body?JSON.stringify(body):undefined,
    cache:"no-store"
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok){
    const message=data?.error?.message||data?.error?.code||("HTTP "+response.status);
    throw new Error(message);
  }
  return data?.data;
}
function structuredValue(key,raw){
  const value=String(raw||"").trim();
  const map={
    onboardingQ1:"company_activity",
    onboardingQ2:"battery_scope",
    onboardingQ3:"sku_scope",
    onboardingQ4:"tracking_workflow",
    onboardingQ5:"battery_data_profile",
    onboardingQ6:"monthly_volume",
    onboardingQ7:"data_sources",
    onboardingQ8:"qr_print_method"
  };
  return {source:"manufacturer_first_login_v1",[map[key]]:value};
}
function setConfigStep(key,state){
  const id=STEP_IDS[key]||key;
  const node=$("#"+id);
  if(!node)return;
  node.classList.remove("pending","loading","done","error");
  node.classList.add(state);
  const small=node.querySelector("small");
  if(small)small.textContent=state;
}
function resetConfigSteps(){
  Object.keys(STEP_IDS).forEach(key=>setConfigStep(key,"pending"));
}
function configuredSteps(){
  Object.keys(STEP_IDS).forEach(key=>setConfigStep(key,"done"));
}
function answersComplete(){
  return QUESTION_KEYS.every(key=>String($("#"+key)?.value||"").trim().length>0);
}
function syncConfigureButton(configured=false){
  const button=$("#configureDppSystem");
  if(!button)return;
  if(configured){
    button.disabled=false;
    button.dataset.configured="1";
    button.textContent="Open Manufacturer Dashboard →";
    return;
  }
  delete button.dataset.configured;
  button.disabled=!answersComplete();
  button.textContent="Configure DPP system →";
}
function enqueueAnswerSave(key){
  const node=$("#"+key);
  if(!node)return Promise.resolve(null);
  const raw=String(node.value||"").trim();
  if(!raw)return Promise.resolve(null);

  const prior=saveQueues.get(key)||Promise.resolve();
  const next=prior.catch(()=>null).then(async()=>{
    const latest=String($("#"+key)?.value||"").trim();
    if(!latest)return null;
    const answer=await manufacturerApi({
      method:"POST",
      body:{
        action:"answer",
        question_key:key,
        raw_answer:latest,
        structured_value:structuredValue(key,latest)
      }
    });
    const live=$("#"+key);
    if(live){
      live.dataset.saved="true";
      live.dataset.savedAt=answer?.updated_at||"";
    }
    return answer;
  });
  saveQueues.set(key,next);
  return next;
}
function scheduleAnswerSave(key){
  const old=saveTimers.get(key);
  if(old)clearTimeout(old);
  const timer=setTimeout(()=>{
    saveTimers.delete(key);
    enqueueAnswerSave(key).then(()=>{
      onboardingMessage("Отговорите се пазят автоматично в фирмения DPP профил.","ok");
      syncConfigureButton(false);
    }).catch(error=>{
      onboardingMessage("Грешка при запис: "+error.message,"error");
    });
  },450);
  saveTimers.set(key,timer);
}
async function flushAllAnswers(){
  for(const key of QUESTION_KEYS){
    const timer=saveTimers.get(key);
    if(timer){clearTimeout(timer);saveTimers.delete(key)}
    await enqueueAnswerSave(key);
  }
}
function applyOnboardingState(state){
  const answers=Array.isArray(state?.answers)?state.answers:[];
  for(const answer of answers){
    if(!QUESTION_KEYS.includes(answer.question_key))continue;
    const node=$("#"+answer.question_key);
    if(node&&!node.value){
      node.value=answer.raw_answer||"";
      node.dataset.saved="true";
      node.dataset.savedAt=answer.updated_at||"";
    }
  }
  if(state?.configuration?.status==="configured"){
    configuredSteps();
    syncConfigureButton(true);
    onboardingMessage("Фирмената DPP конфигурация е записана. Можете да отворите Manufacturer Dashboard.","ok");
  }else{
    resetConfigSteps();
    syncConfigureButton(false);
    onboardingMessage(
      Number(state?.answered_count||0)+" / 8 отговора са записани в Supabase. Всеки нов отговор се пази автоматично.",
      state?.answered_count?"ok":""
    );
  }
}
async function configureManufacturer(){
  const button=$("#configureDppSystem");
  if(button?.dataset.configured==="1"){
    location.assign("/manufacturer");
    return;
  }
  if(!answersComplete()){
    onboardingMessage("Попълнете и 8-те въпроса преди конфигурация.","error");
    syncConfigureButton(false);
    return;
  }

  button.disabled=true;
  onboardingMessage("Проверяваме и записваме 8-те отговора…","");
  try{
    await flushAllAnswers();
    const state=await manufacturerApi();
    if(!state?.complete||state?.answered_count!==8){
      throw new Error("Системата още не е потвърдила 8/8 записани отговора.");
    }

    resetConfigSteps();
    setConfigStep("company","loading");
    onboardingMessage("Създаваме реалната tenant конфигурация…","");

    const configured=await manufacturerApi({method:"POST",body:{action:"configure"}});
    const returned=Array.isArray(configured?.steps)?configured.steps:[];
    for(const step of returned){
      if(STEP_IDS[step.key]){
        setConfigStep(step.key,step.status==="done"?"done":"error");
      }
    }
    const allDone=Object.keys(STEP_IDS).every(key=>returned.some(step=>step.key===key&&step.status==="done"));
    if(!allDone)throw new Error("Backend конфигурацията не върна пълен 7/7 real-state резултат.");

    onboardingMessage(
      "DPP конфигурацията е записана · revision "+configured.revision+" · реален backend state 7/7.",
      "ok"
    );
    syncConfigureButton(true);
  }catch(error){
    const loading=Object.keys(STEP_IDS).find(key=>$("#"+STEP_IDS[key])?.classList.contains("loading"));
    if(loading)setConfigStep(loading,"error");
    onboardingMessage("Конфигурацията спря: "+error.message,"error");
    syncConfigureButton(false);
  }
}
function bindManufacturerOnboarding(){
  for(const key of QUESTION_KEYS){
    const node=$("#"+key);
    node.addEventListener("input",()=>{
      node.dataset.saved="false";
      syncConfigureButton(false);
      scheduleAnswerSave(key);
    });
    node.addEventListener("blur",()=>{
      const timer=saveTimers.get(key);
      if(timer){clearTimeout(timer);saveTimers.delete(key)}
      enqueueAnswerSave(key).then(()=>{
        onboardingMessage("Последният отговор е записан в Supabase.","ok");
        syncConfigureButton(false);
      }).catch(error=>onboardingMessage("Грешка при запис: "+error.message,"error"));
    });
  }
  $("#configureDppSystem").addEventListener("click",()=>configureManufacturer());
}
async function initManufacturerOnboarding(){
  $("#loadingCard").hidden=true;
  $("#onboardingCard").hidden=false;
  bindManufacturerOnboarding();
  onboardingMessage("Зареждаме записаните onboarding отговори…","");
  const state=await manufacturerApi();
  applyOnboardingState(state);
}

async function loadDirectory(){
  const r=await fetch("/data/manufacturers.json",{cache:"no-store"});
  if(!r.ok)throw new Error("Manufacturer directory unavailable.");
  directory=await r.json();
  const s=$("#countrySelect");
  for(const [code,name] of directory.countries||[]){
    const o=document.createElement("option");o.value=code;o.textContent=name;s.append(o);
  }
  const other=document.createElement("option");other.value="OTHER";other.textContent="Other / Друга държава";s.append(other);
}
function updateManufacturers(){
  const code=$("#countrySelect").value;
  const s=$("#manufacturerSelect");s.replaceChildren();
  if(!code){
    const o=document.createElement("option");o.value="";o.textContent="Първо изберете държава…";s.append(o);s.disabled=true;return;
  }
  s.disabled=false;
  let o=document.createElement("option");o.value="";o.textContent="Изберете вашата фирма…";s.append(o);
  for(const name of directory.manufacturers?.[code]||[]){o=document.createElement("option");o.value=name;o.textContent=name;s.append(o)}
  o=document.createElement("option");o.value="__OTHER__";o.textContent="Друга фирма / Не е в списъка";s.append(o);
}
function manufacturerName(){
  return $("#manufacturerSelect").value==="__OTHER__"?$("#customManufacturer").value.trim():$("#manufacturerSelect").value.trim();
}
function countryName(){
  return $("#countrySelect").selectedOptions[0]?.textContent||"";
}
function showReview(data){
  $("#loadingCard").hidden=true;
  $("#onboardingCard").hidden=true;
  $("#reviewCard").hidden=false;
  $("#dashCompany").textContent=data.companyName||"—";
  $("#dashCountry").textContent=data.country||"—";
  $("#dashEmail").textContent=data.email||"—";
}
async function submit(){
  const company=manufacturerName();
  const country=countryName();
  const requestText=$("#requestText").value.trim();
  if(!$("#countrySelect").value)throw new Error("Изберете държава.");
  if(!$("#manufacturerSelect").value)throw new Error("Изберете фирма.");
  if(!company)throw new Error("Въведете името на фирмата.");
  if(requestText.length<20)throw new Error("Опишете накратко какво ви трябва.");

  $("#submitApplication").disabled=true;
  const resultNode=$("#applicationResult");
  resultNode.textContent="Записваме заявката…";
  resultNode.className="result";
  try{
    const response=await call("submit",{
      country,
      companyName:company,
      manufacturer:company,
      requestText
    });
    showReview(response.data||{email:profile.email,country,companyName:company});
  }finally{
    $("#submitApplication").disabled=false;
  }
}
async function initLegacyDashboard(){
  const hashToken=tokenFromHash();
  if(hashToken){saveToken(hashToken);cleanUrl()}
  else restoreToken();

  if(!token)throw new Error("Няма активна фирмена сесия или личен dashboard link. Влезте през Company Access.");

  const opened=await call("open");
  profile=opened.data||{};
  $("#welcomeText").textContent="Добре дошли, "+(profile.email||"client")+". Това е вашият DPP Early Access dashboard.";

  if(["submitted","reviewing","quoted","activated","rejected"].includes(String(profile.status||""))){
    showReview(profile);
    return;
  }

  if(hasManufacturerOnboardingUi()){
    $("#loadingCard").hidden=false;
    $("#onboardingCard").hidden=true;
    throw new Error("За 8-въпросния Manufacturer Setup е необходим активен Company Access login.");
  }

  await loadDirectory();
  $("#loadingCard").hidden=true;
  $("#onboardingCard").hidden=false;
}
function bindLegacyControls(){
  const country=$("#countrySelect"),manufacturer=$("#manufacturerSelect"),submitButton=$("#submitApplication");
  if(country)country.addEventListener("change",()=>{
    updateManufacturers();
    $("#customManufacturerWrap").hidden=true;
    $("#customManufacturer").value="";
  });
  if(manufacturer)manufacturer.addEventListener("change",()=>{
    $("#customManufacturerWrap").hidden=$("#manufacturerSelect").value!=="__OTHER__";
  });
  if(submitButton)submitButton.addEventListener("click",()=>submit().catch(error=>{
    const n=$("#applicationResult");
    n.textContent=error.message;
    n.className="result bad";
  }));
}
async function init(){
  bindLegacyControls();
  if(hasManufacturerOnboardingUi()&&readCompanySession()){
    $("#welcomeText").textContent="Добре дошли. Зареждаме реалната DPP конфигурация на активната фирма.";
    await initManufacturerOnboarding();
    return;
  }
  await initLegacyDashboard();
}
init().catch(error=>setStatus(error.message,"bad"));
})();