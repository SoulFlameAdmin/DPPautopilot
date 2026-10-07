(()=>{"use strict";
const ENDPOINT="https://soulflame-twins.vercel.app/api/dpp-dashboard-link";
const TOKEN_KEY="dpp_early_access_token_v1";
const CHAT_KEY="dpp_early_access_chat_v1";
let token="",profile=null,step=0,answers={};

const QUESTIONS=[
  {key:"country",text:"В коя държава е регистрирана фирмата?"},
  {key:"company",text:"Как се казва фирмата / производителят?"},
  {key:"products",text:"Какво точно произвеждате — батерии, електрически скутери, компоненти или друго?"},
  {key:"sku",text:"Приблизително колко модела / SKU имате?"},
  {key:"annualVolume",text:"Какъв е приблизителният ви годишен производствен обем?"},
  {key:"users",text:"Колко души очаквате да работят с DPP системата?"},
  {key:"systems",text:"Какви системи използвате в момента — ERP, MES, BMS, PLM, Excel, API или други?"},
  {key:"automation",text:"Какво искате SoulFlame DPP да автоматизира или реши за вас?"},
  {key:"timeline",text:"Имате ли желан срок за старт или внедряване? Ако не — напишете „няма“.",optional:true},
  {key:"extra",text:"Има ли нещо друго важно за вашия бизнес или DPP процес? Ако не — напишете „няма“.",optional:true}
];

const $=id=>document.getElementById(id);
const tokenFromHash=()=>{
  const p=new URLSearchParams(String(location.hash||"").replace(/^#/,""));
  const v=String(p.get("access")||"").trim();
  return /^[a-f0-9]{64}$/i.test(v)?v:"";
};
function setText(id,value){const n=$(id);if(n)n.textContent=value;}
function addMsg(text,kind="bot"){
  const n=document.createElement("div");
  n.className="chat-msg "+kind;
  n.textContent=text;
  $("chatLog").append(n);
  $("chatLog").scrollTop=$("chatLog").scrollHeight;
}
function saveDraft(){
  localStorage.setItem(CHAT_KEY,JSON.stringify({step,answers,email:profile?.email||"",savedAt:new Date().toISOString()}));
}
function restoreDraft(){
  try{
    const data=JSON.parse(localStorage.getItem(CHAT_KEY)||"null");
    if(!data||data.email!==profile?.email)return false;
    step=Math.max(0,Math.min(Number(data.step)||0,QUESTIONS.length));
    answers=data.answers&&typeof data.answers==="object"?data.answers:{};
    return step>0||Object.keys(answers).length>0;
  }catch{return false}
}
async function api(action,extra={}){
  const r=await fetch(ENDPOINT,{method:"POST",headers:{"Content-Type":"application/json","Accept":"application/json"},body:JSON.stringify({action,token,...extra}),cache:"no-store"});
  const data=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(data?.error||"Dashboard request failed.");
  return data;
}
async function openSession(){return (await api("open")).data||{}}
function renderQuestion(){
  setText("chatProgress",Math.min(step,QUESTIONS.length)+" / "+QUESTIONS.length);
  if(step>=QUESTIONS.length){return finalize();}
  addMsg(QUESTIONS[step].text,"bot");
}
function looksLikeQuestion(text){
  const t=text.trim().toLowerCase();
  return /\?$/.test(t)||/^(как|защо|може ли|кога|къде|какъв|каква|какви|имате ли|ще може ли|how|why|can|when|where|what)\b/.test(t);
}
async function escalateQuestion(text){
  addMsg(text,"user");
  setText("chatResult","Изпращаме въпроса към SoulFlame…");
  try{
    const r=await api("support_question",{question:text});
    addMsg("Този въпрос е извън автоматичния intake. Изпратих го към SoulFlame и ще получите човешки отговор.","system");
    setText("chatResult",r.notification==="sent"?"Въпросът е изпратен към SoulFlame.":"Въпросът е записан за SoulFlame review.");
  }catch(error){
    addMsg("Не успях да препратя въпроса в момента. Продължете с intake въпросите, а SoulFlame ще го види при прегледа.","system");
    setText("chatResult",error.message);
  }
  renderQuestion();
}
async function finalize(){
  $("chatForm").hidden=true;
  setText("chatProgress",QUESTIONS.length+" / "+QUESTIONS.length);
  addMsg("Готово. Изпращам целия бизнес intake към SoulFlame за реален преглед.","system");
  setText("chatResult","Изпращаме отговорите…");
  try{
    const r=await api("questionnaire_submit",{answers});
    localStorage.removeItem(CHAT_KEY);
    profile={...profile,...r.data};
    setText("statusMetric","Review");
    setText("reviewBadge","REVIEWING");
    setText("tenantMeta","Business intake completed · SoulFlame review");
    setText("earlyStatus","Въпросникът е завършен. SoulFlame ще прегледа бизнеса ви и ще конфигурира точния dashboard и услугите преди оферта и Stripe плащане.");
    addMsg("Получихме всичко. SoulFlame ще прегледа вашия бизнес, ще подготви точната конфигурация и ще продължи комуникацията с вас. Плащането остава заключено до договорена оферта.","bot");
    setText("chatResult",r.notification==="sent"?"Business intake е изпратен към SoulFlame DPP Gmail.":"Business intake е записан за SoulFlame review.");
  }catch(error){
    $("chatForm").hidden=false;
    addMsg("Не успях да изпратя финалния intake. Отговорите са запазени само на това устройство и можете да опитате отново.","system");
    setText("chatResult",error.message);
  }
}
function startChat(){
  const resumed=restoreDraft();
  addMsg("Здравейте. Аз съм автоматизираният DPP Intake Assistant. Ще ви задам кратки въпроси, за да може SoulFlame да разбере реалния ви бизнес и да подготви точната услуга.","bot");
  if(resumed)addMsg("Намерих незавършен intake на това устройство. Продължаваме от мястото, където спряхте.","system");
  if(profile?.status==="reviewing"){
    $("chatForm").hidden=true;
    setText("chatProgress",QUESTIONS.length+" / "+QUESTIONS.length);
    addMsg("Вашият business intake вече е получен и е в SoulFlame review. Ако имате допълнителен въпрос, ще добавим отделен support channel в следващата версия.","bot");
    return;
  }
  renderQuestion();
}

$("chatForm").addEventListener("submit",async event=>{
  event.preventDefault();
  const input=$("chatInput");
  const text=String(input.value||"").trim();
  if(!text)return;
  input.value="";
  $("chatSend").disabled=true;
  try{
    if(looksLikeQuestion(text)){
      await escalateQuestion(text);
      return;
    }
    addMsg(text,"user");
    const q=QUESTIONS[step];
    if(!q)return;
    answers[q.key]=text.slice(0,1800);
    step++;
    saveDraft();
    renderQuestion();
  }finally{$("chatSend").disabled=false;input.focus()}
});

(async()=>{
  try{
    token=tokenFromHash();
    if(token){localStorage.setItem(TOKEN_KEY,token);history.replaceState(null,"",location.pathname);}
    else token=String(localStorage.getItem(TOKEN_KEY)||"").trim();
    if(!/^[a-f0-9]{64}$/i.test(token))throw new Error("Няма валиден Early Access dashboard access.");
    profile=await openSession();
    setText("clientEmail",profile.email||"—");
    setText("clientEmailTop",profile.email||"—");
    setText("tenantMeta","Login saved on this device · "+String(profile.status||"submitted").toUpperCase());
    setText("earlyStatus","Влезли сте успешно с "+(profile.email||"email")+". Завършете 24/7 AI Support intake-а вдясно.");
    if(profile.status==="reviewing"){
      setText("statusMetric","Review");
      setText("reviewBadge","REVIEWING");
    }
    startChat();
  }catch(error){
    setText("earlyStatus",error.message||"Dashboard access failed.");
    addMsg("Dashboard access failed. Върнете се към регистрацията и влезте отново с email.","system");
    $("chatForm").hidden=true;
  }
})();
})();
