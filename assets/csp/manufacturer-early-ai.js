(()=>{"use strict";
const Core=globalThis.SoulFlameAIIntake;
if(!Core)return;

const GOOGLE_SESSION_KEY="dpp_google_session_v1";
const EARLY_TOKEN_KEY="dpp_early_access_token_v1";
const CONTINUE_KEY="dpp_ai_intake_manual_continue_v1";
const PROMPT_KEY="dpp_ai_intake_prompt_v1";
const AI_SESSION_KEY="dpp_ai_intake_session_v1";
const EARLY_ENDPOINT="https://soulflame-twins.vercel.app/api/dpp-dashboard-link";
const AI_STATE_ENDPOINT="/api/ai-intake-state";
const LABELS={
  country:"Държава / пазар",company:"Фирма / производител",products:"Продукти",sku:"Модели / SKU",
  annualVolume:"Годишен обем",users:"Екип / роли",systems:"Системи / данни",automation:"Какво да автоматизираме"
};
const $=id=>document.getElementById(id);

function readJson(key){try{return JSON.parse(localStorage.getItem(key)||"null")}catch{return null}}
function googleSession(){const value=readJson(GOOGLE_SESSION_KEY);return value?.access_token?value:null}
function earlyToken(){return String(localStorage.getItem(EARLY_TOKEN_KEY)||"").trim()}
function validUuid(value){return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value||""))}
function aiSessionId(){const value=String(localStorage.getItem(AI_SESSION_KEY)||"").trim();return validUuid(value)?value:""}
function setAiSession(value){if(validUuid(value))localStorage.setItem(AI_SESSION_KEY,String(value));else localStorage.removeItem(AI_SESSION_KEY)}
function message(text,kind=""){const node=$("aiIntakeMessage");if(!node)return;node.textContent=text;node.className="ai-intake-message"+(kind?" "+kind:"")}
function setBusy(active){for(const id of ["aiAnalyze","aiManual","aiConfirm"]){const el=$(id);if(el)el.disabled=!!active}}
function showManual(){
  sessionStorage.setItem(CONTINUE_KEY,"1");
  const panel=$("aiIntakeStage"),progress=document.querySelector(".intake-progress-shell"),questions=$("questionStage");
  if(panel)panel.hidden=true;if(progress)progress.hidden=false;if(questions)questions.hidden=false;
}
function waitForProfile(){
  return new Promise(resolve=>{
    let tries=0;
    const tick=()=>{
      const email=String($("intakeEmail")?.textContent||"").trim();
      const screen=$("intakeScreen"),question=$("questionStage");
      if(screen&&!screen.hidden&&question&&email&&email!=="Проверяваме достъпа…"&&email!=="Access error")return resolve(true);
      if(++tries>60)return resolve(false);
      setTimeout(tick,100);
    };tick();
  });
}
function buildPanel(){
  if($("aiIntakeStage"))return;
  const panel=document.createElement("main");
  panel.className="ai-intake-stage";
  panel.id="aiIntakeStage";
  panel.innerHTML=`
    <div class="ai-orb" aria-hidden="true">AI</div>
    <div class="ai-intake-copy">
      <p class="intake-kicker">AI-FIRST ONBOARDING · BATTERY</p>
      <h1>Опишете фирмата и продукта с един промпт.</h1>
      <p class="question-help">AI ще извади само изрично написаното, ще покаже предложенията като <strong>непотвърдени</strong> и ще остави липсващите въпроси за ръчния режим. Нищо не се публикува автоматично.</p>
      <label class="answer-shell ai-prompt-shell" for="aiPrompt">
        <span>ОПИШЕТЕ КАКВО ПРОИЗВЕЖДАТЕ И КАКВО ИСКАТЕ</span>
        <textarea id="aiPrompt" rows="7" maxlength="20000" placeholder="Пример: Ние сме производител в България, правим LMT батерии... Използваме ERP, BMS и Excel... Искаме DPP системата да..." ></textarea>
        <small><b>AI НЕ Е ИЗТОЧНИК НА ФАКТИ</b><span id="aiPromptCount">0 / 20000</span></small>
      </label>
      <div class="intake-actions ai-start-actions">
        <button class="intake-btn secondary" id="aiManual" type="button">Ръчен режим</button>
        <button class="intake-btn primary" id="aiAnalyze" type="button">AI анализ →</button>
      </div>
      <div class="ai-intake-message" id="aiIntakeMessage" role="status" aria-live="polite">Първо анализираме. После вие потвърждавате всяка стойност, която ще бъде записана.</div>
      <section class="ai-review" id="aiReview" hidden>
        <div class="ai-review-head"><div><p class="intake-kicker">HUMAN REVIEW</p><h2>Потвърдете предложенията.</h2></div><span>UNVERIFIED → USER CONFIRMED</span></div>
        <div id="aiCandidates" class="ai-candidates"></div>
        <div id="aiMissing" class="ai-missing"></div>
        <div class="intake-actions">
          <button class="intake-btn secondary" id="aiBack" type="button">← Редактирай промпта</button>
          <button class="intake-btn primary" id="aiConfirm" type="button">Потвърди избраните →</button>
        </div>
      </section>
      <section class="ai-finish" id="aiFinish" hidden>
        <p class="intake-kicker">8 / 8 CONFIRMED</p>
        <h2>Всички onboarding отговори са потвърдени от вас.</h2>
        <p>Конфигурацията още не е стартирана. Натиснете бутона отдолу, за да продължите изрично към съществуващия setup flow.</p>
        <button class="intake-btn primary" id="aiFinishButton" type="button">Завърши onboarding →</button>
      </section>
    </div>`;
  const question=$("questionStage");question?.parentNode?.insertBefore(panel,question);
}

function renderCandidates(candidates,intake,approvedAnswers={}){
  const box=$("aiCandidates");box.innerHTML="";
  for(const candidate of candidates){
    const approved=String(approvedAnswers?.[candidate.key]||"").trim();
    const row=document.createElement("label");row.className="ai-candidate";row.dataset.key=candidate.key;
    const check=document.createElement("input");check.type="checkbox";check.dataset.aiSelect=candidate.key;check.checked=!!approved;
    const content=document.createElement("span");content.className="ai-candidate-content";
    const top=document.createElement("span");top.className="ai-candidate-top";
    const name=document.createElement("strong");name.textContent=LABELS[candidate.key]||candidate.key;
    const state=document.createElement("b");state.textContent=approved?"ПОТВЪРДЕНО":"НЕПОТВЪРДЕНО";top.append(name,state);
    const input=document.createElement("textarea");input.rows=2;input.maxLength=5000;input.value=approved||candidate.value;input.dataset.aiValue=candidate.key;
    const evidence=document.createElement("small");evidence.textContent="Източник: вашият промпт · “"+candidate.evidence+"”";
    content.append(top,input,evidence);row.append(check,content);box.append(row);
  }
  const missing=Array.isArray(intake?.missing_fields)?intake.missing_fields.filter(key=>Core.KEYS.includes(key)):[];
  const unverified=Array.isArray(intake?.unverified_fields)?intake.unverified_fields.filter(key=>Core.KEYS.includes(key)):[];
  const node=$("aiMissing");
  node.textContent=missing.length?"След потвърждението ще останат за ръчно попълване: "+missing.map(key=>LABELS[key]||key).join(", ")+".":"AI намери предложения за всичките 8 полета. Те пак трябва да бъдат потвърдени от вас.";
  node.dataset.unverified=String(unverified.length);
}

async function stateApi(action,extra={}){
  const google=googleSession();
  if(!google?.access_token)throw new Error("Google сесията липсва. Влезте отново.");
  const response=await fetch(AI_STATE_ENDPOINT,{
    method:"POST",
    headers:{"Content-Type":"application/json",Accept:"application/json",Authorization:"Bearer "+google.access_token},
    body:JSON.stringify({action,...extra}),
    cache:"no-store"
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok){
    const error=new Error(data?.error?.message||data?.error?.code||("HTTP "+response.status));
    error.code=data?.error?.code||"";error.status=response.status;throw error;
  }
  return data?.data||{};
}

async function restorePersistentReview(){
  const sessionId=aiSessionId();
  if(!sessionId)return false;
  try{
    const snapshot=await stateApi("snapshot",{session_id:sessionId});
    const rawCandidates=Array.isArray(snapshot?.candidates)?snapshot.candidates:[];
    const candidates=Core.sanitizeCandidates(rawCandidates.map(item=>({key:item?.field_key,value:item?.value,evidence:item?.evidence})));
    if(!candidates.length)return false;
    const approved=snapshot?.approved_answers&&typeof snapshot.approved_answers==="object"?snapshot.approved_answers:{};
    const candidateKeys=candidates.map(item=>item.key);
    const latestPrompt=(Array.isArray(snapshot?.messages)?[...snapshot.messages].reverse().find(item=>item?.actor==="user"&&String(item?.content||"").trim()):null)?.content||"";
    if(latestPrompt){$("aiPrompt").value=latestPrompt;$("aiPromptCount").textContent=latestPrompt.length+" / 20000";sessionStorage.setItem(PROMPT_KEY,latestPrompt)}
    renderCandidates(candidates,{
      missing_fields:Core.remainingKeys(candidateKeys),
      unverified_fields:candidates.filter(item=>!approved[item.key]).map(item=>item.key)
    },approved);
    $("aiReview").hidden=false;$("aiFinish").hidden=true;$("aiAnalyze").textContent="Анализирай отново →";
    message("Възстановихме последния запазен AI review. Нищо не е публикувано.","ok");
    return true;
  }catch(error){
    if(error?.code==="AI_PERSISTENCE_NOT_ENABLED"||error?.code==="AI_INTAKE_NOT_FOUND"||error?.status===404){setAiSession("");return false}
    message("Не успяхме да възстановим AI review. Можете да анализирате отново или да използвате ръчния режим.","bad");
    return false;
  }
}

async function analyze(){
  const prompt=String($("aiPrompt")?.value||"").trim();
  const google=googleSession();
  if(!prompt){message("Напишете кратко описание, преди AI анализа.","bad");return}
  if(!google?.access_token){message("Google сесията липсва. Влезте отново.","bad");return}
  setBusy(true);message("AI анализира само изрично написаното…");
  sessionStorage.setItem(PROMPT_KEY,prompt);
  try{
    const response=await fetch("/api/ai-intake",{method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json",Authorization:"Bearer "+google.access_token},body:JSON.stringify({module:"battery",prompt}),cache:"no-store"});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data?.error?.message||data?.error?.code||("HTTP "+response.status));
    const candidates=Core.sanitizeCandidates(data?.data?.candidates);
    if(!candidates.length){message("AI не намери достатъчно изрично написани данни. Продължете в ръчен режим или допълнете промпта.","bad");return}
    const persistence=data?.data?.persistence;
    if(persistence?.enabled===true&&validUuid(persistence?.session_id))setAiSession(persistence.session_id);
    else if(persistence?.enabled===false)setAiSession("");
    renderCandidates(candidates,data?.data?.intake);
    $("aiReview").hidden=false;
    $("aiFinish").hidden=true;
    $("aiAnalyze").textContent="Анализирай отново →";
    message("Предложенията са непотвърдени. Маркирайте само тези, които сте проверили.","ok");
  }catch(error){
    message("AI режимът не е достъпен в момента: "+(error.message||"unknown error")+". Ръчният режим остава напълно достъпен.","bad");
  }finally{setBusy(false)}
}

async function recordApprovals(chosen){
  const sessionId=aiSessionId();
  if(!sessionId)return;
  for(const [key,value] of Object.entries(chosen)){
    await stateApi("review",{session_id:sessionId,field_key:key,approved_value:value,accept:true});
  }
}

async function saveConfirmed(){
  const google=googleSession(),token=earlyToken();
  if(!google?.access_token||!/^[a-f0-9]{64}$/i.test(token)){message("Сесията за onboarding е невалидна. Влезте отново.","bad");return}
  const rows=[...document.querySelectorAll(".ai-candidate")];
  const selection={},edits={},raw=[];
  for(const row of rows){
    const key=row.dataset.key;const checkbox=row.querySelector("[data-ai-select]");const input=row.querySelector("[data-ai-value]");
    raw.push({key,value:input?.value||"",evidence:"confirmed in AI review"});selection[key]=checkbox?.checked===true;edits[key]=input?.value||"";
  }
  const chosen=Core.selectedAnswers(raw,selection,edits);
  const keys=Object.keys(chosen);
  if(!keys.length){message("Маркирайте поне едно предложение, което сте проверили.","bad");return}
  setBusy(true);message("Записваме human approval следата и само потвърдените стойности…");
  try{
    await recordApprovals(chosen);
    for(const key of keys){
      const response=await fetch(EARLY_ENDPOINT,{method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json",Authorization:"Bearer "+google.access_token},body:JSON.stringify({action:"questionnaire_save",token,key,answer:chosen[key]}),cache:"no-store"});
      const data=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(data?.error||("Не успяхме да запишем "+key));
    }
    const remaining=Core.remainingKeys(keys);
    if(!remaining.length){
      $("aiReview").hidden=true;$("aiFinish").hidden=false;
      message("8/8 са записани след човешко потвърждение. Нищо не е публикувано.","ok");
      return;
    }
    sessionStorage.setItem(CONTINUE_KEY,"1");
    message("Потвърдените стойности са записани. Отваряме само оставащите въпроси…","ok");
    location.reload();
  }catch(error){message(error.message||"Записът не успя.","bad")}finally{setBusy(false)}
}

(async()=>{
  if(sessionStorage.getItem(CONTINUE_KEY)==="1"){sessionStorage.removeItem(CONTINUE_KEY);return}
  const ready=await waitForProfile();if(!ready)return;
  if($("intakeScreen")?.hidden||$("questionStage")?.hidden)return;
  buildPanel();
  const progress=document.querySelector(".intake-progress-shell");if(progress)progress.hidden=true;
  $("questionStage").hidden=true;
  const savedPrompt=sessionStorage.getItem(PROMPT_KEY)||"";$("aiPrompt").value=savedPrompt;$("aiPromptCount").textContent=savedPrompt.length+" / 20000";
  $("aiPrompt").addEventListener("input",()=>{$("aiPromptCount").textContent=$("aiPrompt").value.length+" / 20000"});
  $("aiManual").addEventListener("click",showManual);
  $("aiAnalyze").addEventListener("click",analyze);
  $("aiBack").addEventListener("click",()=>{$("aiReview").hidden=true;$("aiPrompt").focus()});
  $("aiConfirm").addEventListener("click",saveConfirmed);
  $("aiFinishButton").addEventListener("click",()=>{sessionStorage.setItem(CONTINUE_KEY,"1");location.reload()});
  await restorePersistentReview();
})();
})();
