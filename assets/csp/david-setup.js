(()=>{
'use strict';
const $=id=>document.getElementById(id);
const SESSION_KEY='dpp_company_session_v1',DRAFT_KEY='dpp_david_setup_draft_v1';
const TOPICS=['Фирма','Продукти','Модели','Серийни номера','DPP данни','Производство','Импорт','QR'];
const FALLBACK=[
'Как се казва фирмата ви и в коя държава работите?',
'Какви батерии произвеждате, с каква химия и капацитет?',
'Колко модела имате и как ги идентифицирате?',
'Следите ли всяка бройка със сериен номер или използвате партиди?',
'Какви технически и екологични данни, източници и доказателства разполагате?',
'Какъв е приблизителният обем на производство?',
'Как управлявате данните: Excel, CSV, ERP или API?',
'Как бихте желали да печатате и използвате QR кодовете?'
];
let session=null,authConfig=null,company=null,answers={},index=0,busy=false;
const params=new URLSearchParams(location.search);
const referral=/^[a-z0-9][a-z0-9_-]{0,31}$/i.test(params.get('ref')||'')?(params.get('ref')||'').toLowerCase():'';
function status(text,kind=''){$('status').textContent=text;$('status').className='status '+kind}
function show(id){for(const name of ['authView','companyView','questionView','reviewView','readyView'])$(name).hidden=name!==id}
function progress(percent){$('progressBar').value=Math.max(0,Math.min(100,percent))}
function getSession(){
  try{const stored=JSON.parse(sessionStorage.getItem(SESSION_KEY)||'null');
    return stored&&typeof stored.access_token==='string'&&stored.access_token?stored:null;
  }catch{return null}
}
function saveSession(x){session={access_token:x.access_token,refresh_token:x.refresh_token,expires_in:x.expires_in};sessionStorage.setItem(SESSION_KEY,JSON.stringify(session))}
async function refresh(){
  if(!session?.refresh_token)return false;
  if(!authConfig)authConfig=await fetch('/data/auth-config.json').then(r=>r.json());
  const r=await fetch(authConfig.supabaseUrl+'/auth/v1/token?grant_type=refresh_token',{
    method:'POST',headers:{apikey:authConfig.publishableKey,'Content-Type':'application/json'},
    body:JSON.stringify({refresh_token:session.refresh_token})
  });
  if(!r.ok)return false;
  saveSession(await r.json());return true;
}
async function api(path,{method='GET',body,retry=true}={}){
  if(!session?.access_token)throw Error('Нужен е потвърден фирмен вход.');
  const r=await fetch(path,{method,headers:{Authorization:'Bearer '+session.access_token,
    'Content-Type':'application/json',Accept:'application/json'},cache:'no-store',body:body?JSON.stringify(body):undefined});
  if(r.status===401&&retry&&await refresh())return api(path,{method,body,retry:false});
  const data=await r.json().catch(()=>({}));
  if(!r.ok)throw Error(data?.error?.message||data?.error?.code||'Заявката не успя.');
  return data;
}
function slug(value){
  const ascii=String(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
  return (ascii.slice(0,70)||'company')+'-'+crypto.randomUUID().slice(0,8);
}
function loadDraft(){
  try{const saved=JSON.parse(sessionStorage.getItem(DRAFT_KEY)||'null');
    if(saved?.organization_id===company?.organization_id&&saved.answers&&typeof saved.answers==='object'){
      const filtered={};for(let i=0;i<8;i++){const k='onboardingQ'+(i+1);
        if(typeof saved.answers[k]==='string'&&saved.answers[k].length<=1800)filtered[k]=saved.answers[k]}
      return filtered;
    }
  }catch{}
  return {};
}
function saveDraft(){sessionStorage.setItem(DRAFT_KEY,JSON.stringify({organization_id:company.organization_id,answers}))}
function verifiedAnswers(saved){
  const result={};
  for(const row of saved||[]){
    const n=Number(String(row.question_key||'').replace('onboardingQ',''));
    if(n>=1&&n<=8&&typeof row.raw_answer==='string'&&row.raw_answer.trim())
      result['onboardingQ'+n]=row.raw_answer.slice(0,1800);
  }
  return result;
}
function updateSignin(){
  const url=new URL('/company',location.origin);url.searchParams.set('flow','setup');
  if(referral)url.searchParams.set('ref',referral);
  $('signinLink').href=url.pathname+url.search;
}
async function boot(){
  updateSignin();session=getSession();
  if(!session){show('authView');status('Потвърдете своя имейл, за да продължите.');return}
  status('Свързваме фирменото ви пространство…');
  let orgs;
  try{orgs=(await api('/api/organizations')).data||[]}
  catch(e){show('authView');status('Достъп: '+e.message,'error');return}
  if(!orgs.length){show('companyView');progress(8);status('Входът е потвърден. Създайте вашата фирма.','ok');return}
  company=orgs.find(x=>x.active)||orgs[0];
  if(!company?.active)await api('/api/tenant',{method:'POST',body:{organization_id:company.organization_id}});
  await loadState();
}
async function loadState(){
  let data;
  try{data=(await api('/api/david-setup')).data}
  catch(e){show('companyView');status('Неуспешна настройка: '+e.message,'error');return}
  if(data?.configuration?.status==='configured'){showReady(data.configuration);return}
  answers={...verifiedAnswers(data?.answers),...loadDraft()};
  const missing=Array.from({length:8},(_,i)=>i).find(i=>!answers['onboardingQ'+(i+1)]);
  index=missing===undefined?8:missing;
  if(index===8)showReview();
  else await showQuestion();
}
async function showQuestion(){
  show('questionView');progress(18+index*8);
  const key='onboardingQ'+(index+1);
  $('questionIndex').textContent='DAVID · ВЪПРОС '+(index+1)+' ОТ 8';
  $('questionTitle').textContent=TOPICS[index];
  $('questionText').textContent='Подготвям въпроса…';
  $('questionHelp').textContent='';
  $('answerText').value=answers[key]||'';
  $('backQuestion').disabled=index===0;
  $('nextQuestion').textContent=index===7?'Провери отговорите →':'Продължи →';
  try{
    const prior={};for(let i=0;i<index;i++){const k='onboardingQ'+(i+1);if(answers[k])prior[k]=answers[k]}
    const res=await api('/api/david-setup',{method:'POST',body:{
      action:'question',index,answers:prior,ai_consent:$('aiConsent').checked
    }});
    $('questionText').textContent=res.data.question;
    $('questionHelp').textContent=(res.data.source==='gemini'?'DAVID · Gemini: ':'DAVID · Guided: ')+(res.data.why||'');
    status('Въпрос '+(index+1)+' от 8.','ok');
  }catch(e){
    $('questionText').textContent=FALLBACK[index];status('Работим с основните въпроси: '+e.message,'error');
  }
}
function captureAnswer(){
  const value=$('answerText').value.trim();
  if(!value||value.length>1800)throw Error('Попълнете отговор до 1800 символа.');
  answers['onboardingQ'+(index+1)]=value;saveDraft();
}
function showReview(){
  show('reviewView');progress(88);status('Моля, проверете данните преди запис.','ok');
  $('approveCheckbox').checked=false;
  const host=$('reviewAnswers');host.replaceChildren();
  for(let i=0;i<8;i++){
    const wrapper=document.createElement('div');wrapper.className='review-item';
    const label=document.createElement('label');label.textContent=(i+1)+'. '+TOPICS[i];label.htmlFor='reviewQ'+i;
    const input=document.createElement('textarea');input.id='reviewQ'+i;input.maxLength=1800;input.value=answers['onboardingQ'+(i+1)]||'';
    input.addEventListener('input',()=>{answers['onboardingQ'+(i+1)]=input.value.trim();saveDraft();$('approveCheckbox').checked=false});
    wrapper.append(label,input);host.append(wrapper);
  }
}
function showReady(config){
  show('readyView');progress(100);status('Фирменият ви DAVID DPP профил е запазен.','ok');
  $('readySummary').textContent='DAVID конфигурира фирменото DPP пространство. Ревизия '+String(config.revision||1)+'. Продуктовите паспорти се публикуват само след проверка на необходимите данни.';
  sessionStorage.removeItem(DRAFT_KEY);
}
$('createCompany').addEventListener('click',async()=>{
  if(busy)return;const name=$('companyName').value.trim();if(!name||name.length>200){$('companyMessage').textContent='Въведете името на фирмата.';return}
  busy=true;$('createCompany').disabled=true;$('companyMessage').textContent='Създаваме фирменото ви пространство…';
  try{
    company=(await api('/api/organizations',{method:'POST',body:{name,slug:slug(name)}})).data;
    await loadState();
  }catch(e){$('companyMessage').textContent=e.message;status('Неуспешно създаване: '+e.message,'error')}
  finally{busy=false;$('createCompany').disabled=false}
});
$('nextQuestion').addEventListener('click',async()=>{
  if(busy)return;
  try{captureAnswer()}catch(e){status(e.message,'error');return}
  if(index===7){showReview();return}
  busy=true;$('nextQuestion').disabled=true;index++;
  try{await showQuestion()}finally{busy=false;$('nextQuestion').disabled=false}
});
$('backQuestion').addEventListener('click',async()=>{
  if(busy||index===0)return;
  if($('answerText').value.trim())answers['onboardingQ'+(index+1)]=$('answerText').value.trim();
  saveDraft();index--;await showQuestion();
});
$('backReview').addEventListener('click',async()=>{index=7;await showQuestion()});
$('aiConsent').addEventListener('change',()=>showQuestion());
$('approveButton').addEventListener('click',async()=>{
  if(busy)return;
  for(let i=0;i<8;i++){const value=String(answers['onboardingQ'+(i+1)]||'').trim();
    if(!value){status('Попълнете всички осем отговора.','error');return}answers['onboardingQ'+(i+1)]=value}
  if(!$('approveCheckbox').checked){status('Първо потвърдете, че сте проверили отговорите.','error');return}
  busy=true;$('approveButton').disabled=true;status('DAVID записва вашите 8 потвърдени отговора и настройва фирмения профил…');
  try{
    const data=(await api('/api/david-setup',{method:'POST',body:{
      action:'approve',approved:true,answers,referral
    }})).data;
    showReady(data);
  }catch(e){status('Неуспешен запис: '+e.message+'. Може да опитате отново; отговорите остават на това устройство.','error')}
  finally{busy=false;$('approveButton').disabled=false}
});
$('createDraft').addEventListener('click',async()=>{
  if(busy)return;
  const model=$('modelCode').value.trim(),serial=$('serialCode').value.trim(),category=$('batteryCategory').value;
  if(!model||!serial||!category){$('draftResult').textContent='Попълнете модел, уникален номер и категория.';return}
  if(model.length>128||serial.length>220){$('draftResult').textContent='Идентификаторът е твърде дълъг.';return}
  busy=true;$('createDraft').disabled=true;
  let stage='model';
  try{
    $('draftResult').textContent='Създаваме модела…';
    const newModel=(await api('/api/models',{method:'POST',body:{
      model_identifier:model,manufacturer_name:company.name,category,canonical_data:{}
    }})).data;
    stage='item';$('draftResult').textContent='Регистрираме изделието…';
    const newItem=(await api('/api/items',{method:'POST',body:{
      model_id:newModel.id,unique_identifier:serial,canonical_data:{}
    }})).data;
    stage='passport';$('draftResult').textContent='Запазваме черновия паспорт…';
    await api('/api/passport',{method:'POST',body:{
      battery_item_id:newItem.id,
      public_payload:{item:{unique_identifier:serial}},
      private_payload:{}
    }});
    $('draftResult').textContent='Черновият паспорт е създаден. Отворете таблото, попълнете задължителните технически полета и активирайте паспорта. Тогава ще можете да изтеглите публичния QR.';
    status('Първият паспорт е записан като чернова.','ok');
  }catch(e){
    $('draftResult').textContent='Неуспешен етап '+stage+': '+e.message+'. Проверете каталога в таблото преди нов опит, за да не създадете дублиращ модел.';
  }finally{busy=false;$('createDraft').disabled=false}
});
boot().catch(e=>{show('authView');status('Грешка при стартиране: '+e.message,'error')});
})();
