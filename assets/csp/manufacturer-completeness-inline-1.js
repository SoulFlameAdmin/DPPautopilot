(()=>{"use strict";
const $=s=>document.querySelector(s);
const STORAGE="dpp_company_session_v1";
const PROJECT_URL="https://frhletkiuupgksmgxoxc.supabase.co";
let cfg=null,session=null,activeOrg=null,matrix=null,report=null,models=[],items=[],refreshing=null;
const params=new URLSearchParams(location.search);
const identifier=(params.get("identifier")||"").trim();

function setResult(node,message,kind=""){node.textContent=message;node.className="result"+(kind?" "+kind:"")}
function readSession(){try{const v=JSON.parse(sessionStorage.getItem(STORAGE)||"null");if(v?.access_token){session=v;return true}}catch{}session=null;return false}
function saveSession(v){if(v?.access_token){session={access_token:v.access_token,refresh_token:v.refresh_token||session?.refresh_token||"",expires_in:Number(v.expires_in)||3600};sessionStorage.setItem(STORAGE,JSON.stringify(session))}else{session=null;sessionStorage.removeItem(STORAGE)}}
async function authCall(path,{body,token}={}){const r=await fetch(cfg.supabaseUrl+path,{method:"POST",headers:{apikey:cfg.publishableKey,"Content-Type":"application/json",Accept:"application/json",...(token?{Authorization:"Bearer "+token}:{})},body:body?JSON.stringify(body):undefined});const text=await r.text();let data={};try{data=text?JSON.parse(text):{}}catch{}if(!r.ok)throw new Error(data.msg||data.message||data.error_description||data.error||("HTTP "+r.status));return data}
async function refreshSession(){if(refreshing)return refreshing;if(!session?.refresh_token)return false;refreshing=(async()=>{try{saveSession(await authCall("/auth/v1/token?grant_type=refresh_token",{body:{refresh_token:session.refresh_token}}));return true}catch{return false}finally{refreshing=null}})();return refreshing}
async function api(path,{method="GET",body,retry=true}={}){if(!session?.access_token)throw new Error("Login required.");const r=await fetch(path,{method,headers:{Authorization:"Bearer "+session.access_token,"Content-Type":"application/json",Accept:"application/json"},body:body?JSON.stringify(body):undefined,cache:"no-store"});let data={};try{data=await r.json()}catch{}if(r.status===401&&retry&&await refreshSession())return api(path,{method,body,retry:false});if(!r.ok)throw new Error(data?.error?.message||data?.error?.code||("HTTP "+r.status));return data}
function canWrite(){return !!activeOrg&&["owner","admin","editor"].includes(activeOrg.role)}
function point(n){return matrix?.points?.find(p=>p.number===n)||{number:n,name:"EU point "+n,valuePath:"",sourceOwner:"",access:""}}
function ownerLabel(v){return ({manufacturer:"Manufacturer",economic_operator:"Economic operator",manufacturer_bms:"Manufacturer / BMS",manufacturer_or_lab:"Manufacturer / Lab",bms:"BMS",derived_duplicate:"Derived"})[v]||v||"Data owner"}
function dataTarget(p){if(p.number===50)return"Authority evidence";if(String(p.valuePath).startsWith("model."))return"Model data";if(String(p.valuePath).startsWith("item."))return"Battery data";return p.level||"Data"}
function setNested(root,path,value){const parts=path.split(".").filter(Boolean);let cur=root;for(let i=0;i<parts.length-1;i++){const k=parts[i];if(!cur[k]||typeof cur[k]!=="object"||Array.isArray(cur[k]))cur[k]={};cur=cur[k]}cur[parts.at(-1)]=value}
function parseValue(raw,type){const text=raw.trim();if(!text)throw new Error("Въведи стойност.");if(type==="number"){const n=Number(text);if(!Number.isFinite(n))throw new Error("Трябва число.");return n}if(type==="integer"){const n=Number(text);if(!Number.isInteger(n))throw new Error("Трябва цяло число.");return n}if(type==="boolean"){if(text==="true")return true;if(text==="false")return false;throw new Error("Използвай true или false.")}if(["object","array","document_ref_array"].includes(type)||type?.includes("array")){let v;try{v=JSON.parse(text)}catch{throw new Error("Стойността трябва да е валиден JSON.")}return v}return text}
function inputHint(p){if(p.number===50)return"пример: TEST-REPORT-2026-001";if(p.valueType==="number"||p.valueType==="integer")return p.unit?("число · "+p.unit):"число";if(p.valueType==="object")return'JSON object, напр. {"name":"Company"}';if(String(p.valueType).includes("array"))return'JSON array, напр. ["A","B"]';if(p.valueType==="boolean")return"true или false";return"стойност"}
function currentModel(){return models.find(x=>x.id===report?.model_id)}
function currentItem(){return items.find(x=>x.id===report?.battery_item_id)}
function showGate(msg){$("#authGate").hidden=false;$("#workspace").hidden=true;setResult($("#gateResult"),msg,"bad")}
function showWorkspace(){$("#authGate").hidden=true;$("#workspace").hidden=false}

async function savePoint(p,raw,node){
  if(!canWrite())return setResult(node,"Тази роля е read-only.","bad");
  try{
    if(p.number===50){
      await api("/api/passport",{method:"PATCH",body:{id:report.passport_id,action:"submit_authority_evidence",field_number:50,evidence:{document_ref:raw.trim()},expected_updated_at:report.passport_updated_at}});
    }else if(String(p.valuePath).startsWith("model.")){
      const model=currentModel();if(!model)throw new Error("Model record not found.");
      const canonical=structuredClone(model.canonical_data||{});
      setNested(canonical,p.valuePath.slice(6),parseValue(raw,p.valueType));
      await api("/api/models",{method:"PATCH",body:{id:model.id,canonical_data:canonical,expected_updated_at:model.updated_at}});
    }else if(String(p.valuePath).startsWith("item.")){
      const item=currentItem();if(!item)throw new Error("Battery item not found.");
      const canonical=structuredClone(item.canonical_data||{});
      setNested(canonical,p.valuePath.slice(5),parseValue(raw,p.valueType));
      await api("/api/items",{method:"PATCH",body:{id:item.id,canonical_data:canonical,expected_updated_at:item.updated_at}});
    }else throw new Error("Това поле се управлява от core identity/lifecycle flow.");
    setResult(node,"Записано. Преизчислявам completeness…","ok");await loadAll();
  }catch(e){setResult(node,e.message,"bad")}
}
async function decideApplicability(p,value,node){
  if(!canWrite())return setResult(node,"Тази роля е read-only.","bad");
  try{
    const isItem=String(p.valuePath).startsWith("item.");
    const record=isItem?currentItem():currentModel();
    if(!record)throw new Error("Record not found.");
    const canonical=structuredClone(record.canonical_data||{});
    canonical.point_applicability={...(canonical.point_applicability||{}),[String(p.number)]:value};
    await api(isItem?"/api/items":"/api/models",{method:"PATCH",body:{id:record.id,canonical_data:canonical,expected_updated_at:record.updated_at}});
    setResult(node,value?"Маркирано: приложимо.":"Маркирано: не е приложимо.","ok");await loadAll();
  }catch(e){setResult(node,e.message,"bad")}
}
function issueCard(p,kind){
  const card=document.createElement("article");card.className="issue";
  const head=document.createElement("div");head.className="issue-head";
  const num=document.createElement("span");num.className="point";num.textContent="#"+p.number;
  const title=document.createElement("div");title.className="issue-title";title.textContent=p.name;
  head.append(num,title);card.append(head);
  const meta=document.createElement("div");meta.className="meta";
  [dataTarget(p),ownerLabel(p.sourceOwner),p.access||"access"].forEach(x=>{const c=document.createElement("span");c.className="chip";c.textContent=x;meta.append(c)});card.append(meta);
  const path=document.createElement("div");path.className="path";path.textContent=p.valuePath||p.canonicalFieldPath||"—";card.append(path);
  const legal=document.createElement("div");legal.className="hint";legal.textContent=p.legalSource||"";card.append(legal);
  const result=document.createElement("div");result.className="result";result.textContent=canWrite()?"Готово за действие.":"Read-only role.";card.append(result);
  if(kind==="missing"&&canWrite()){
    const fixer=document.createElement("div");fixer.className="fixer";
    const input=(p.valueType==="object"||String(p.valueType).includes("array"))?document.createElement("textarea"):document.createElement("input");
    input.placeholder=inputHint(p);input.setAttribute("aria-label","Стойност за EU точка "+p.number);
    const save=document.createElement("button");save.className="btn primary";save.type="button";save.textContent=p.number===50?"Подай evidence":"Запази";
    save.addEventListener("click",()=>savePoint(p,input.value,result));fixer.append(input,save);card.append(fixer);
  }
  if(kind==="decision"&&canWrite()){
    const row=document.createElement("div");row.className="decision";
    const yes=document.createElement("button");yes.className="btn primary";yes.type="button";yes.textContent="Важи";
    const no=document.createElement("button");no.className="btn";no.type="button";no.textContent="Не важи";
    yes.addEventListener("click",()=>decideApplicability(p,true,result));no.addEventListener("click",()=>decideApplicability(p,false,result));row.append(yes,no);card.append(row);
  }
  return card;
}
function render(){
  $("#batteryIdentity").textContent=report.unique_identifier+" · "+report.schema_version;
  const score=Number(report.workflow_score_percent)||0;$("#scoreValue").textContent=score.toFixed(1)+"%";$("#scoreBar").className="pct-"+Math.round(Math.max(0,Math.min(100,score)));
  $("#missingCount").textContent=String(report.missing_count);$("#undecidedCount").textContent=String(report.undecided_count);$("#passportStatus").textContent=String(report.status).toUpperCase();
  $("#missingState").textContent=String(report.missing_count);$("#undecidedState").textContent=String(report.undecided_count);
  $("#scoreMeta").textContent=report.complete_point_count+" / "+report.required_point_count+" required points complete · "+report.blocking_count+" blockers";
  $("#readyLabel").textContent=report.ready?"READINESS PASS":"NOT READY";$("#readyLabel").className=report.ready?"ready":"blocked";
  $("#actionTitle").textContent=report.ready?(report.status==="active"?"Passport е ACTIVE.":"Всички readiness проверки са PASS."):"Попълни "+report.blocking_count+" blocker"+(report.blocking_count===1?"":"s")+".";
  $("#actionText").textContent=report.ready?"Може да се публикува/активира безопасно през readiness gate.":"ACTIVE и публичният QR остават заключени до 0 blockers.";
  const activate=$("#activatePassport");activate.disabled=!canWrite()||!report.ready||report.status==="active";activate.textContent=report.status==="active"?"Passport ACTIVE":"Активирай Passport";
  const publicReady=report.status==="active";for(const [id,path] of [["#publicPassport","/passport?identifier="],["#publicQr","/qr?identifier="]]){const a=$(id);a.hidden=!publicReady;if(publicReady)a.href=path+encodeURIComponent(identifier)}
  const missing=$("#missingList");missing.replaceChildren();if(!report.missing_points.length){const e=document.createElement("div");e.className="empty";e.textContent="Няма липсващи задължителни данни.";missing.append(e)}else report.missing_points.map(point).forEach(p=>missing.append(issueCard(p,"missing")));
  const undecided=$("#undecidedList");undecided.replaceChildren();if(!report.undecided_conditional_points.length){const e=document.createElement("div");e.className="empty";e.textContent="Всички условни точки имат решение.";undecided.append(e)}else report.undecided_conditional_points.map(point).forEach(p=>undecided.append(issueCard(p,"decision")));
  document.body.dataset.completenessStatus=report.ready?"ready":"blocked";showWorkspace()
}
async function loadTenant(){const orgs=(await api("/api/organizations")).data||[];activeOrg=orgs.find(o=>o.active)||null;if(!activeOrg)throw new Error("Няма активен фирмен tenant.");$("#tenantName").textContent=activeOrg.name;$("#tenantMeta").textContent=activeOrg.slug+" · "+activeOrg.role.toUpperCase()}
async function loadAll(){
  if(!identifier)throw new Error("Липсва Battery identifier в адреса.");
  const [r,m,i]=await Promise.all([
    api("/api/passport?identifier="+encodeURIComponent(identifier)+"&readiness=1"),
    api("/api/models"),
    api("/api/items")
  ]);
  report=r.data;models=m.data||[];items=i.data||[];render()
}
async function activate(){
  if(!canWrite()||!report?.ready||report.status==="active")return;
  $("#activatePassport").disabled=true;setResult($("#actionResult"),"Активиране през readiness gate…");
  try{await api("/api/passport",{method:"PATCH",body:{id:report.passport_id,action:"activate",expected_updated_at:report.passport_updated_at}});setResult($("#actionResult"),"Passport е ACTIVE и публичният QR е отключен.","ok");await loadAll()}catch(e){setResult($("#actionResult"),e.message,"bad");$("#activatePassport").disabled=false}
}
async function init(){
  cfg=await fetch("/data/auth-config.json",{cache:"no-store"}).then(async r=>{if(!r.ok)throw new Error("Auth config unavailable.");return r.json()});
  matrix=await fetch("/data/lmt-battery-71-v2.json",{cache:"no-store"}).then(async r=>{if(!r.ok)throw new Error("LMT matrix unavailable.");return r.json()});
  if(cfg.supabaseUrl!==PROJECT_URL||!String(cfg.publishableKey||"").startsWith("sb_publishable_"))throw new Error("Invalid DPP auth configuration.");
  document.body.dataset.completenessReady="true";
  if(!readSession()){document.body.dataset.completenessAuth="missing";showGate("Няма активна фирмена сесия. Влез през Company Access.");return}
  document.body.dataset.completenessAuth="authenticated";await loadTenant();await loadAll()
}
$("#refreshReadiness").addEventListener("click",()=>loadAll().catch(e=>setResult($("#actionResult"),e.message,"bad")));
$("#activatePassport").addEventListener("click",activate);
init().catch(e=>{document.body.dataset.completenessReady="false";showGate(e.message)});
})();