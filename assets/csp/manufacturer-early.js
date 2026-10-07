(()=>{"use strict";
const ENDPOINT="https://soulflame-twins.vercel.app/api/dpp-dashboard-link";
const TOKEN_KEY="dpp_early_access_token_v1";
const DRAFT_KEY="dpp_early_access_onboarding_v2";

const QUESTIONS=[
  {key:"country",kicker:"КОМПАНИЯ · 01",text:"В коя държава е регистрирана фирмата?",help:"Напишете държавата и, ако е важно за дейността ви, основния пазар."},
  {key:"company",kicker:"КОМПАНИЯ · 02",text:"Как се казва фирмата / производителят?",help:"Използвайте реалното търговско име, с което искате да виждате workspace-а."},
  {key:"products",kicker:"ПРОДУКТИ · 03",text:"Какво точно произвеждате?",help:"Опишете свободно продуктите — например батерии, EV battery packs, индустриални батерии, LMT или други продукти."},
  {key:"sku",kicker:"ПРОДУКТИ · 04",text:"Колко модела / SKU имате приблизително?",help:"Може да е точен брой или приблизителен диапазон. Добавете кратко обяснение, ако структурата е по-сложна."},
  {key:"annualVolume",kicker:"ОБЕМ · 05",text:"Какъв е приблизителният ви годишен производствен обем?",help:"Отговорете с бройки, диапазон или описание на производствения мащаб."},
  {key:"users",kicker:"ЕКИП · 06",text:"Кои хора ще работят с DPP системата?",help:"Опишете роли и приблизителен брой — compliance, engineering, production, management и други."},
  {key:"systems",kicker:"СИСТЕМИ · 07",text:"Какви системи и данни използвате в момента?",help:"ERP, MES, BMS, PLM, Excel, API или собствен софтуер. Опишете ги свободно."},
  {key:"automation",kicker:"ЦЕЛ · 08",text:"Какво искате SoulFlame DPP да автоматизира или реши за вас?",help:"Това е най-важният отговор. Опишете желания workflow, проблемите, срока и всичко важно за pilot-а."}
];

const $=id=>document.getElementById(id);
let token="",profile=null,step=0,answers={};

function tokenFromHash(){
  const p=new URLSearchParams(String(location.hash||"").replace(/^#/,""));
  const value=String(p.get("access")||"").trim();
  return /^[a-f0-9]{64}$/i.test(value)?value:"";
}
function setMessage(message,kind=""){
  const node=$("intakeMessage");
  if(!node)return;
  node.textContent=message;
  node.className="intake-message"+(kind?" "+kind:"");
}
async function api(action,extra={}){
  const response=await fetch(ENDPOINT,{
    method:"POST",
    headers:{"Content-Type":"application/json","Accept":"application/json"},
    body:JSON.stringify({action,token,...extra}),
    cache:"no-store"
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data?.error||"DPP request failed.");
  return data;
}
function saveLocalDraft(){
  localStorage.setItem(DRAFT_KEY,JSON.stringify({
    email:profile?.email||"",
    answers,
    step,
    savedAt:new Date().toISOString()
  }));
}
function restoreLocalDraft(){
  try{
    const data=JSON.parse(localStorage.getItem(DRAFT_KEY)||"null");
    if(!data||data.email!==profile?.email)return;
    answers={...answers,...(data.answers&&typeof data.answers==="object"?data.answers:{})};
  }catch{}
}
function firstIncomplete(){
  const index=QUESTIONS.findIndex(q=>!String(answers[q.key]||"").trim());
  return index<0?QUESTIONS.length:index;
}
function renderQuestion(){
  if(step>=QUESTIONS.length){submitAndConfigure();return;}
  const q=QUESTIONS[step];
  $("questionNumber").textContent=String(step+1).padStart(2,"0");
  $("questionKicker").textContent=q.kicker;
  $("questionText").textContent=q.text;
  $("questionHelp").textContent=q.help;
  $("answerInput").value=String(answers[q.key]||"");
  $("answerCount").textContent=$("answerInput").value.length+" / 5000";
  $("answerState").textContent=answers[q.key]?"ЗАПАЗЕНО":"НЕЗАПИСАНО";
  $("progressLabel").textContent="ВЪПРОС "+(step+1)+" ОТ "+QUESTIONS.length;
  $("progressPercent").textContent=Math.round(((step+1)/QUESTIONS.length)*100)+"%";
  $("progressBar").className="p"+(step+1);
  $("backQuestion").disabled=step===0;
  $("nextQuestion").textContent=step===QUESTIONS.length-1?"Завърши и настрой системата →":"Запази и продължи →";
  $("answerInput").focus();
  setMessage("Всеки отговор се записва защитено. Можете да затворите страницата и да продължите по-късно.");
}
async function saveCurrent(){
  const q=QUESTIONS[step];
  const answer=String($("answerInput").value||"").trim();
  if(!answer){
    setMessage("Напишете отговор, преди да продължите.","bad");
    $("answerInput").focus();
    return false;
  }
  $("nextQuestion").disabled=true;
  $("backQuestion").disabled=true;
  $("answerState").textContent="ЗАПИСВАМЕ…";
  setMessage("Записваме отговора в системата…");
  try{
    await api("questionnaire_save",{key:q.key,answer});
    answers[q.key]=answer;
    saveLocalDraft();
    $("answerState").textContent="ЗАПАЗЕНО";
    setMessage("Отговорът е записан.","ok");
    return true;
  }catch(error){
    $("answerState").textContent="ГРЕШКА";
    setMessage(error.message,"bad");
    return false;
  }finally{
    $("nextQuestion").disabled=false;
    $("backQuestion").disabled=step===0;
  }
}
async function next(){
  if(!await saveCurrent())return;
  step++;
  if(step>=QUESTIONS.length)await submitAndConfigure();
  else renderQuestion();
}
function back(){
  if(step<=0)return;
  step--;
  renderQuestion();
}
function setConfigureStep(key,state){
  const row=document.querySelector('[data-step="'+key+'"]');
  if(!row)return;
  row.classList.remove("active","done");
  if(state)row.classList.add(state);
  row.querySelector("b").textContent=state==="done"?"DONE":state==="active"?"WORKING":"WAITING";
}
async function animateConfiguration(steps){
  const keys=["company","workflow","product","batch","dpp","qr","ready"];
  const returned=new Set((Array.isArray(steps)?steps:[]).filter(x=>x?.status==="done").map(x=>x.key));
  for(const key of keys){
    setConfigureStep(key,"active");
    await new Promise(resolve=>setTimeout(resolve,220));
    if(returned.size===0||returned.has(key))setConfigureStep(key,"done");
  }
}
async function submitAndConfigure(){
  $("questionStage").hidden=true;
  $("configureStage").hidden=false;
  $("configureMessage").textContent="Запазваме 8/8 отговора и създаваме pilot конфигурацията…";
  try{
    const result=await api("questionnaire_submit",{answers});
    profile={...profile,...(result.data||{})};
    await animateConfiguration(profile.configuration?.steps||[]);
    $("configureMessage").textContent="Готово. Workspace-ът е конфигуриран. Отваряме dashboard-а…";
    localStorage.removeItem(DRAFT_KEY);
    setTimeout(()=>showDashboard(),500);
  }catch(error){
    $("configureMessage").textContent="Не успяхме да завършим конфигурацията: "+error.message;
    $("questionStage").hidden=false;
    $("configureStage").hidden=true;
    step=Math.max(0,QUESTIONS.length-1);
    renderQuestion();
  }
}
function renderConfiguration(){
  const container=$("configurationSummary");
  if(!container)return;
  const cfg=profile?.configuration||{};
  const integrations=Array.isArray(cfg?.integrations?.requested)?cfg.integrations.requested:[];
  container.innerHTML="";
  const items=[
    ["Mode",cfg.mode||"DPP pilot"],
    ["Company",cfg.company?.name||profile?.companyName||"—"],
    ["Country",cfg.company?.country||profile?.country||"—"],
    ["Integrations",integrations.length?integrations.join(", "):"No integration detected yet"]
  ];
  for(const [label,value] of items){
    const article=document.createElement("article");
    const span=document.createElement("span");
    const strong=document.createElement("strong");
    span.textContent=label;strong.textContent=value;
    article.append(span,strong);container.append(article);
  }
}
function showDashboard(){
  $("intakeScreen").hidden=true;
  $("appSidebar").hidden=false;
  $("dashboardHome").hidden=false;
  document.body.dataset.manufacturerTenant="configured";
  $("clientEmail").textContent=profile?.email||"—";
  $("clientEmailTop").textContent=profile?.email||"—";
  $("profileCompany").textContent=profile?.companyName||"Configured";
  $("tenantMeta").textContent="Google session · Auto-configured DPP pilot";
  $("earlyStatus").textContent="Onboarding 8/8 е завършен. Pilot workspace-ът е конфигуриран автоматично от вашите отговори. Следва: реален Product / SKU.";
  renderConfiguration();
}
function showWizard(){
  $("intakeScreen").hidden=false;
  $("appSidebar").hidden=true;
  $("dashboardHome").hidden=true;
  $("questionStage").hidden=false;
  $("configureStage").hidden=true;
  $("intakeEmail").textContent=profile?.email||"Google account";
  answers={...(profile?.answers&&typeof profile.answers==="object"?profile.answers:{})};
  restoreLocalDraft();
  step=firstIncomplete();
  if(step>=QUESTIONS.length){submitAndConfigure();return;}
  renderQuestion();
}

$("answerInput").addEventListener("input",()=>{
  $("answerCount").textContent=$("answerInput").value.length+" / 5000";
  $("answerState").textContent="НЕЗАПИСАНО";
});
$("nextQuestion").addEventListener("click",()=>next());
$("backQuestion").addEventListener("click",back);
$("answerInput").addEventListener("keydown",event=>{
  if((event.ctrlKey||event.metaKey)&&event.key==="Enter"){event.preventDefault();next();}
});

(async()=>{
  try{
    token=tokenFromHash();
    if(token){
      localStorage.setItem(TOKEN_KEY,token);
      history.replaceState(null,"",location.pathname);
    }else{
      token=String(localStorage.getItem(TOKEN_KEY)||"").trim();
    }
    if(!/^[a-f0-9]{64}$/i.test(token))throw new Error("Няма валиден Early Access dashboard access.");
    profile=(await api("open")).data||{};
    if(profile.status==="configured"&&profile.configuration&&Object.keys(profile.configuration).length){
      showDashboard();
    }else{
      showWizard();
    }
  }catch(error){
    $("intakeEmail").textContent="Access error";
    $("questionText").textContent="Не успяхме да отворим DPP onboarding.";
    $("questionHelp").textContent=error.message||"Влезте отново с Google.";
    $("answerInput").hidden=true;
    $("nextQuestion").hidden=true;
    $("backQuestion").hidden=true;
    setMessage("Върнете се към /register и влезте отново с Google.","bad");
  }
})();
})();