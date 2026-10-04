(()=>{"use strict";
const $=s=>document.querySelector(s);
const STORAGE="dpp_company_session_v1";
const PROJECT_URL="https://frhletkiuupgksmgxoxc.supabase.co";
let cfg=null,session=null,activeOrg=null,models=[],items=[],refreshing=null;

function setResult(node,message,kind=""){node.textContent=message;node.className="result"+(kind?" "+kind:"")}
function readSession(){
  try{
    const value=JSON.parse(sessionStorage.getItem(STORAGE)||"null");
    if(value?.access_token){session=value;return true}
  }catch{}
  session=null;return false;
}
function saveSession(value){
  if(value?.access_token){
    session={access_token:value.access_token,refresh_token:value.refresh_token||session?.refresh_token||"",expires_in:Number(value.expires_in)||3600};
    sessionStorage.setItem(STORAGE,JSON.stringify(session));
  }else{
    session=null;sessionStorage.removeItem(STORAGE);
  }
}
async function authCall(path,{method="POST",body,token}={}){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
  try{
    const r=await fetch(cfg.supabaseUrl+path,{
      method,
      headers:{apikey:cfg.publishableKey,"Content-Type":"application/json",Accept:"application/json",...(token?{Authorization:"Bearer "+token}:{})},
      body:body?JSON.stringify(body):undefined,
      signal:controller.signal
    });
    const text=await r.text();let data={};try{data=text?JSON.parse(text):{}}catch{}
    if(!r.ok)throw new Error(data.msg||data.message||data.error_description||data.error||("HTTP "+r.status));
    return data;
  }finally{clearTimeout(timer)}
}
async function refreshSession(){
  if(refreshing)return refreshing;
  if(!session?.refresh_token)return false;
  refreshing=(async()=>{
    try{
      const data=await authCall("/auth/v1/token?grant_type=refresh_token",{body:{refresh_token:session.refresh_token}});
      saveSession(data);return true;
    }catch{return false}
    finally{refreshing=null}
  })();
  return refreshing;
}
async function api(path,{method="GET",body,retry=true}={}){
  if(!session?.access_token)throw new Error("Login required.");
  const r=await fetch(path,{
    method,
    headers:{Authorization:"Bearer "+session.access_token,"Content-Type":"application/json",Accept:"application/json"},
    body:body?JSON.stringify(body):undefined,
    cache:"no-store"
  });
  let data={};try{data=await r.json()}catch{}
  if(r.status===401&&retry&&await refreshSession())return api(path,{method,body,retry:false});
  if(!r.ok)throw new Error(data?.error?.message||data?.error?.code||("HTTP "+r.status));
  return data;
}
function canWrite(){return !!activeOrg&&["owner","admin","editor"].includes(activeOrg.role)}
function setMode(){
  const write=canWrite();
  document.body.dataset.manufacturerMode=write?"write":"read_only";
  $("#writeRole").textContent=(activeOrg?.role||"role").toUpperCase();
  $("#writeRole").className="state "+(write?"ok":"readonly");
  $("#createModel").disabled=!write;
  $("#provisionBattery").disabled=!write;
  $("#modelIdentifier").disabled=!write;
  $("#manufacturerName").disabled=!write;
  $("#provisionModel").disabled=!write;
  $("#batteryIdentifier").disabled=!write;
}
function showGate(message){
  document.body.dataset.manufacturerTenant="missing";
  $("#authGate").hidden=false;$("#dashboard").hidden=true;
  setResult($("#gateResult"),message,"bad");
}
function showDashboard(){
  $("#authGate").hidden=true;$("#dashboard").hidden=false;
  document.body.dataset.manufacturerTenant="active";
}
function renderModels(){
  const host=$("#modelsList");host.replaceChildren();
  const lmt=models.filter(m=>m.category==="light_means_of_transport");
  $("#modelsCount").textContent=String(models.length);
  $("#lmtModelsCount").textContent=String(lmt.length);
  const select=$("#provisionModel"),selected=select.value;
  select.replaceChildren(new Option("Избери модел",""));
  for(const model of lmt)select.append(new Option(model.model_identifier+" · "+model.manufacturer_name,model.id));
  if(lmt.some(m=>m.id===selected))select.value=selected;

  if(!models.length){const e=document.createElement("div");e.className="empty";e.textContent="Няма модели в активната фирма.";host.append(e);return}
  for(const model of models.slice().sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)))){
    const row=document.createElement("article");row.className="row";
    const left=document.createElement("div"),strong=document.createElement("strong"),small=document.createElement("small");
    strong.textContent=model.model_identifier;small.textContent=model.manufacturer_name+" · "+model.id;
    left.append(strong,small);
    const side=document.createElement("div");side.className="row-side";
    const pill=document.createElement("span");pill.className="pill"+(model.category==="light_means_of_transport"?" ok":"");pill.textContent=model.category;
    side.append(pill);
    if(model.category==="light_means_of_transport"&&canWrite()){
      const use=document.createElement("button");use.className="btn";use.type="button";use.textContent="Избери за производство";
      use.addEventListener("click",()=>{$("#provisionModel").value=model.id;$("#batteryIdentifier").focus()});
      side.append(use);
    }
    row.append(left,side);host.append(row);
  }
}
function renderItems(){
  const host=$("#itemsList");host.replaceChildren();
  $("#itemsCount").textContent=String(items.length);
  $("#originalItemsCount").textContent=String(items.filter(i=>i.lifecycle_status==="original").length);
  if(!items.length){const e=document.createElement("div");e.className="empty";e.textContent="Няма произведени battery items в активната фирма.";host.append(e);return}
  for(const item of items.slice().sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at))).slice(0,30)){
    const row=document.createElement("article");row.className="row";
    const left=document.createElement("div"),strong=document.createElement("strong"),small=document.createElement("small");
    strong.textContent=item.unique_identifier;small.textContent="model "+item.model_id+" · "+item.id;
    left.append(strong,small);
    const side=document.createElement("div");side.className="row-side";
    const pill=document.createElement("span");pill.className="pill"+(item.lifecycle_status==="original"?" ok":"");pill.textContent=item.lifecycle_status;
    const passport=document.createElement("a");passport.className="btn";passport.href="/passport?identifier="+encodeURIComponent(item.unique_identifier);passport.target="_blank";passport.rel="noopener";passport.textContent="Passport";
    const qr=document.createElement("a");qr.className="btn";qr.href="/qr?identifier="+encodeURIComponent(item.unique_identifier);qr.target="_blank";qr.rel="noopener";qr.textContent="QR";
    side.append(pill,passport,qr);row.append(left,side);host.append(row);
  }
}
async function loadTenant(){
  const orgs=(await api("/api/organizations")).data||[];
  activeOrg=orgs.find(o=>o.active)||null;
  if(!activeOrg){
    if(orgs.length)showGate("Има фирмено пространство, но няма активен tenant. Активирай го през Company Access.");
    else showGate("Няма фирмено пространство. Създай company tenant през Company Access.");
    return false;
  }
  $("#tenantName").textContent=activeOrg.name;
  $("#tenantMeta").textContent=activeOrg.slug+" · "+activeOrg.role.toUpperCase()+" · "+activeOrg.organization_id;
  setMode();showDashboard();return true;
}
async function loadData(){
  if(!activeOrg)return;
  setResult($("#modelResult"),"Зареждане на backend models…");
  setResult($("#provisionResult"),"Зареждане на backend items…");
  const [modelData,itemData]=await Promise.all([api("/api/models"),api("/api/items")]);
  models=modelData.data||[];items=itemData.data||[];
  renderModels();renderItems();
  setResult($("#modelResult"),canWrite()?"Production model API е готов за запис.":"Read-only role: моделите са видими, записът е забранен.","ok");
  setResult($("#provisionResult"),canWrite()?"Избери LMT модел и въведи уникален Battery ID.":"Read-only role: production provisioning е забранен.","ok");
}
async function createModel(){
  if(!canWrite())return;
  const modelIdentifier=$("#modelIdentifier").value.trim(),manufacturer=$("#manufacturerName").value.trim();
  if(!modelIdentifier||!manufacturer)return setResult($("#modelResult"),"Попълни Model identifier и Manufacturer.","bad");
  $("#createModel").disabled=true;setResult($("#modelResult"),"Запис към production /api/models…");
  try{
    const created=(await api("/api/models",{method:"POST",body:{
      model_identifier:modelIdentifier,
      manufacturer_name:manufacturer,
      category:"light_means_of_transport",
      canonical_data:{identification:{model_id:modelIdentifier,category:"light_means_of_transport",manufacturer:{name:manufacturer}}}
    }})).data;
    $("#modelIdentifier").value="";$("#manufacturerName").value="";
    await loadData();$("#provisionModel").value=created.id;
    setResult($("#modelResult"),"LMT моделът е създаден в production backend: "+created.model_identifier,"ok");
  }catch(e){setResult($("#modelResult"),e.message,"bad")}
  finally{$("#createModel").disabled=!canWrite()}
}
function showProvision(data){
  const host=$("#provisionResult");host.replaceChildren();host.className="result ok";
  const line=document.createElement("div");line.textContent=(data.idempotent_replay?"Idempotent replay":"Created")+" · "+data.unique_identifier+" · passport "+data.passport_status;
  const links=document.createElement("div");links.className="actions";
  const p=document.createElement("a");p.className="btn";p.href=data.passport_url;p.target="_blank";p.rel="noopener";p.textContent="Отвори Passport";
  const q=document.createElement("a");q.className="btn primary";q.href=data.qr_url;q.target="_blank";q.rel="noopener";q.textContent="Отвори QR";
  links.append(p,q);host.append(line,links);
}
async function provisionBattery(){
  if(!canWrite())return;
  const model=models.find(m=>m.id===$("#provisionModel").value);
  const identifier=$("#batteryIdentifier").value.trim();
  if(!model||model.category!=="light_means_of_transport"||!identifier)return setResult($("#provisionResult"),"Избери LMT модел и въведи уникален Battery ID.","bad");
  $("#provisionBattery").disabled=true;setResult($("#provisionResult"),"Atomic provisioning към production backend…");
  try{
    const response=await api("/api/provision",{method:"POST",body:{
      model_id:model.id,
      unique_identifier:identifier,
      item_canonical_data:{serial:identifier,source:"manufacturer_dashboard"},
      public_payload:{
        model:{identification:{category:"light_means_of_transport",model_id:model.model_identifier,manufacturer:{name:model.manufacturer_name}}},
        item:{unique_identifier:identifier}
      },
      private_payload:{}
    }});
    $("#batteryIdentifier").value="";
    await loadData();
    showProvision(response.data);
  }catch(e){setResult($("#provisionResult"),e.message,"bad")}
  finally{$("#provisionBattery").disabled=!canWrite()}
}
async function init(){
  cfg=await fetch("/data/auth-config.json",{cache:"no-store"}).then(async r=>{if(!r.ok)throw new Error("Auth config unavailable.");return r.json()});
  if(cfg.supabaseUrl!==PROJECT_URL||!String(cfg.publishableKey||"").startsWith("sb_publishable_"))throw new Error("Invalid DPP auth configuration.");
  document.body.dataset.manufacturerReady="true";
  if(!readSession()){
    document.body.dataset.manufacturerAuth="missing";
    showGate("Няма активна фирмена сесия. Влез през Company Access.");
    return;
  }
  document.body.dataset.manufacturerAuth="authenticated";
  try{
    if(!await loadTenant())return;
    await loadData();
  }catch(e){
    if(/login|required|auth/i.test(e.message)){saveSession(null);document.body.dataset.manufacturerAuth="missing"}
    showGate(e.message);
  }
}
$("#refreshDashboard").addEventListener("click",async()=>{
  try{if(await loadTenant())await loadData()}catch(e){showGate(e.message)}
});
$("#createModel").addEventListener("click",createModel);
$("#provisionBattery").addEventListener("click",provisionBattery);
init().catch(e=>{document.body.dataset.manufacturerReady="false";showGate(e.message)});
})();