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
  $("#batchProvision").disabled=!write;
  $("#modelIdentifier").disabled=!write;
  $("#manufacturerName").disabled=!write;
  $("#modelCategory").disabled=!write;
  $("#manufacturerContact").disabled=!write;
  $("#manufacturerAddress").disabled=!write;
  $("#manufacturePlace").disabled=!write;
  $("#manufactureMonth").disabled=!write;
  $("#batteryWeightKg").disabled=!write;
  $("#batteryCapacityAh").disabled=!write;
  $("#batteryChemistry").disabled=!write;
  $("#batteryVoltageV").disabled=!write;
  $("#pilotModel").disabled=!write;
  $("#pilotBatteryIdentifier").disabled=!write;
  $("#publishTechnicalPilot").disabled=!write;
  $("#provisionModel").disabled=!write;
  $("#batteryIdentifier").disabled=!write;
  $("#batchModel").disabled=!write;
  $("#batchKey").disabled=!write;
  $("#batchPrefix").disabled=!write;
  $("#batchQuantity").disabled=!write;
  $("#batchSerialStart").disabled=!write;
  $("#batchSerialWidth").disabled=!write;
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
  const pilot=models.filter(m=>m.category!=="light_means_of_transport");
  const modelsCount=$("#modelsCount"),lmtModelsCount=$("#lmtModelsCount");
  if(modelsCount)modelsCount.textContent=String(models.length);
  if(lmtModelsCount)lmtModelsCount.textContent=String(lmt.length);
  const select=$("#provisionModel"),selected=select.value;
  const batchSelect=$("#batchModel"),batchSelected=batchSelect.value;
  const pilotSelect=$("#pilotModel"),pilotSelected=pilotSelect.value;
  select.replaceChildren(new Option("Избери SKU / модел",""));
  batchSelect.replaceChildren(new Option("Избери SKU / модел",""));
  pilotSelect.replaceChildren(new Option("Избери non-LMT technical pilot модел",""));
  for(const model of models){
    const label=model.model_identifier+" · "+model.manufacturer_name+" · "+model.category;
    select.append(new Option(label,model.id));
    batchSelect.append(new Option(label,model.id));
  }
  for(const model of pilot){
    const label=model.model_identifier+" · "+model.manufacturer_name+" · "+model.category;
    pilotSelect.append(new Option(label,model.id));
  }
  if(models.some(m=>m.id===selected))select.value=selected;
  if(models.some(m=>m.id===batchSelected))batchSelect.value=batchSelected;
  if(pilot.some(m=>m.id===pilotSelected))pilotSelect.value=pilotSelected;

  if(!models.length){const e=document.createElement("div");e.className="empty";e.textContent="Няма модели в активната фирма.";host.append(e);return}
  for(const model of models.slice().sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)))){
    const row=document.createElement("article");row.className="row";
    const left=document.createElement("div"),strong=document.createElement("strong"),small=document.createElement("small");
    strong.textContent=model.model_identifier;small.textContent=model.manufacturer_name+" · "+model.id;
    left.append(strong,small);
    const side=document.createElement("div");side.className="row-side";
    const pill=document.createElement("span");pill.className="pill"+(model.category==="light_means_of_transport"?" ok":"");pill.textContent=model.category;
    side.append(pill);
    if(canWrite()){
      const use=document.createElement("button");use.className="btn";use.type="button";use.textContent="Избери за производство";
      use.addEventListener("click",()=>{
        $("#provisionModel").value=model.id;
        $("#batchModel").value=model.id;
        if(model.category!=="light_means_of_transport")$("#pilotModel").value=model.id;
        $("#batteryIdentifier").focus();
      });
      side.append(use);
    }
    row.append(left,side);host.append(row);
  }
}
function lifecycleEditor(item){
  const editor=document.createElement("div");editor.className="lifecycle-editor";editor.hidden=true;
  const title=document.createElement("strong");title.textContent="Passport lifecycle";
  const status=document.createElement("div");status.className="result";status.textContent="Отвори, за да провериш текущия passport status.";

  const form=document.createElement("div");form.className="lifecycle-form";form.hidden=true;
  const transitionWrap=document.createElement("label"),transitionLabel=document.createElement("span"),transition=document.createElement("select");
  transitionLabel.textContent="Действие";
  [["retired","Retire"],["revoked","Revoke"],["replaced","Replace"]].forEach(([value,label])=>transition.append(new Option(label,value)));
  transitionWrap.append(transitionLabel,transition);

  const reasonWrap=document.createElement("label"),reasonLabel=document.createElement("span"),reason=document.createElement("select");
  reasonLabel.textContent="Причина";
  [
    ["end_of_life","Край на жизнения цикъл"],
    ["operator_revoked","Отнет от оператора"],
    ["safety_or_compliance","Безопасност / compliance"],
    ["incorrect_record","Некоректен запис"],
    ["product_replaced","Продуктът е заменен"],
    ["other","Друга причина"]
  ].forEach(([value,label])=>reason.append(new Option(label,value)));
  reasonWrap.append(reasonLabel,reason);

  const noteWrap=document.createElement("label"),noteLabel=document.createElement("span"),note=document.createElement("input");
  noteLabel.textContent="Бележка";note.maxLength=500;note.placeholder="По избор · до 500 символа";noteWrap.append(noteLabel,note);

  const replacementWrap=document.createElement("label"),replacementLabel=document.createElement("span"),replacement=document.createElement("input");
  replacementLabel.textContent="Replacement Battery ID";replacement.maxLength=300;replacement.placeholder="Задължително при Replace";replacementWrap.append(replacementLabel,replacement);replacementWrap.hidden=true;

  const apply=document.createElement("button");apply.type="button";apply.className="btn danger";apply.textContent="Потвърди lifecycle промяната";
  form.append(transitionWrap,reasonWrap,noteWrap,replacementWrap,apply);
  editor.append(title,form,status);

  let report=null;
  function sync(){
    const isReplacement=transition.value==="replaced";
    replacementWrap.hidden=!isReplacement;
    if(transition.value==="retired")reason.value="end_of_life";
    else if(transition.value==="revoked")reason.value="operator_revoked";
    else reason.value="product_replaced";
  }
  transition.addEventListener("change",sync);

  async function load(){
    status.className="result";status.textContent="Проверка на passport lifecycle…";form.hidden=true;
    try{
      report=(await api("/api/passport?identifier="+encodeURIComponent(item.unique_identifier)+"&readiness=1")).data;
      if(!report?.passport_id)throw new Error("Passport record not found.");
      if(report.status!=="active"){
        status.className="result ok";status.textContent="Passport status: "+String(report.status).toUpperCase()+". Terminal transition не е достъпен.";
        return;
      }
      form.hidden=!canWrite();sync();
      status.className="result ok";status.textContent=canWrite()
        ?"ACTIVE passport · можеш да го retire/revoke/replace."
        :"ACTIVE passport · read-only role.";
    }catch(e){status.className="result bad";status.textContent=e.message}
  }

  apply.addEventListener("click",async()=>{
    if(!canWrite()||!report||report.status!=="active")return;
    const repl=replacement.value.trim();
    if(transition.value==="replaced"&&!repl){
      status.className="result bad";status.textContent="Въведи Replacement Battery ID.";return;
    }
    const label=transition.value.toUpperCase();
    if(!confirm(label+" passport "+item.unique_identifier+"? Това е terminal lifecycle действие."))return;
    apply.disabled=true;status.className="result";status.textContent="Запис на lifecycle transition…";
    try{
      const response=await api("/api/passport",{method:"PATCH",body:{
        id:report.passport_id,
        action:"transition",
        transition:transition.value,
        reason_code:reason.value,
        reason_note:note.value.trim()||null,
        replacement_identifier:transition.value==="replaced"?repl:null,
        expected_updated_at:report.passport_updated_at
      }});
      status.className="result ok";status.textContent="Passport → "+String(response.data.status).toUpperCase()+". Public lifecycle view е обновен.";
      await loadData();
    }catch(e){status.className="result bad";status.textContent=e.message;apply.disabled=false}
  });

  return {editor,load};
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
    const completeness=document.createElement("a");completeness.className="btn primary";completeness.href="/manufacturer/completeness?identifier="+encodeURIComponent(item.unique_identifier);completeness.textContent="Completeness";
    const passport=document.createElement("a");passport.className="btn";passport.href="/passport?identifier="+encodeURIComponent(item.unique_identifier);passport.target="_blank";passport.rel="noopener";passport.textContent="Passport";
    side.append(pill,completeness,passport);

    if(canWrite()){
      const lifecycle=document.createElement("button");lifecycle.className="btn";lifecycle.type="button";lifecycle.textContent="Lifecycle";
      const panel=lifecycleEditor(item);
      lifecycle.addEventListener("click",async()=>{panel.editor.hidden=!panel.editor.hidden;if(!panel.editor.hidden)await panel.load()});
      side.append(lifecycle);row.append(left,side,panel.editor);
    }else row.append(left,side);

    host.append(row);
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
  setResult($("#modelResult"),canWrite()?"Production model API е готов за реални фирмени данни.":"Read-only role: моделите са видими, записът е забранен.","ok");
  setResult($("#provisionResult"),canWrite()?"LMT: избери модел и въведи уникален Battery ID.":"Read-only role: production provisioning е забранен.","ok");
  setResult($("#pilotResult"),canWrite()?"Non-LMT: избери модел и създай ACTIVE Technical QR Pilot.":"Read-only role: QR pilot publishing е забранен.","ok");
}
function optionalNumber(selector){
  const raw=$(selector).value.trim();
  if(!raw)return null;
  const value=Number(raw);
  return Number.isFinite(value)&&value>=0?value:null;
}
function compactObject(value){
  const out={};
  for(const [key,item] of Object.entries(value||{})){
    if(item==null||item==="")continue;
    if(item&&typeof item==="object"&&!Array.isArray(item)){
      const child=compactObject(item);
      if(Object.keys(child).length)out[key]=child;
    }else out[key]=item;
  }
  return out;
}
function modelCanonicalFromForm(modelIdentifier,manufacturer,category){
  return compactObject({
    identification:{
      model_id:modelIdentifier,
      category,
      manufacturer:{
        name:manufacturer,
        contact:$("#manufacturerContact").value.trim(),
        postal_address:$("#manufacturerAddress").value.trim()
      },
      place_of_manufacture:$("#manufacturePlace").value.trim(),
      date_of_manufacture:$("#manufactureMonth").value.trim()
    },
    physical:{weight_kg:optionalNumber("#batteryWeightKg")},
    rated_capacity_ah:optionalNumber("#batteryCapacityAh"),
    composition:{chemistry:$("#batteryChemistry").value.trim()},
    voltage:{nominal_v:optionalNumber("#batteryVoltageV")}
  });
}
function technicalPilotPublicPayload(model,identifier){
  const source=model?.canonical_data&&typeof model.canonical_data==="object"?model.canonical_data:{};
  const identification=source.identification&&typeof source.identification==="object"?source.identification:{};
  const manufacturer=identification.manufacturer&&typeof identification.manufacturer==="object"?identification.manufacturer:{};
  return compactObject({
    model:{
      identification:{
        model_id:model.model_identifier,
        category:model.category,
        manufacturer:{
          name:model.manufacturer_name,
          contact:manufacturer.contact||"",
          postal_address:manufacturer.postal_address||""
        },
        place_of_manufacture:identification.place_of_manufacture||"",
        date_of_manufacture:identification.date_of_manufacture||""
      },
      physical:{weight_kg:source.physical?.weight_kg??null},
      rated_capacity_ah:source.rated_capacity_ah??null,
      composition:{chemistry:source.composition?.chemistry||""},
      voltage:source.voltage&&typeof source.voltage==="object"?source.voltage:{}
    },
    item:{unique_identifier:identifier}
  });
}
async function createModel(){
  if(!canWrite())return;
  const modelIdentifier=$("#modelIdentifier").value.trim(),manufacturer=$("#manufacturerName").value.trim(),category=$("#modelCategory").value;
  if(!modelIdentifier||!manufacturer||!category)return setResult($("#modelResult"),"Попълни SKU / Model ID, Manufacturer и category.","bad");
  $("#createModel").disabled=true;setResult($("#modelResult"),"Запис на реалния модел към production /api/models…");
  try{
    const canonical=modelCanonicalFromForm(modelIdentifier,manufacturer,category);
    const created=(await api("/api/models",{method:"POST",body:{
      model_identifier:modelIdentifier,
      manufacturer_name:manufacturer,
      category,
      canonical_data:canonical
    }})).data;
    $("#modelIdentifier").value="";$("#manufacturerName").value="";
    $("#manufacturerContact").value="";$("#manufacturerAddress").value="";$("#manufacturePlace").value="";
    $("#manufactureMonth").value="";$("#batteryWeightKg").value="";$("#batteryCapacityAh").value="";
    $("#batteryChemistry").value="";$("#batteryVoltageV").value="";
    await loadData();
    $("#provisionModel").value=created.id;
    $("#batchModel").value=created.id;
    if(created.category!=="light_means_of_transport")$("#pilotModel").value=created.id;
    setResult($("#modelResult"),"Моделът е записан в real company tenant: "+created.model_identifier+" · "+created.category,"ok");
  }catch(e){setResult($("#modelResult"),e.message,"bad")}
  finally{$("#createModel").disabled=!canWrite()}
}
function showProvision(data){
  const host=$("#provisionResult");host.replaceChildren();host.className="result ok";
  const line=document.createElement("div");line.textContent=(data.idempotent_replay?"Idempotent replay":"Created")+" · "+data.unique_identifier+" · passport "+data.passport_status;
  const links=document.createElement("div");links.className="actions";
  const readiness=document.createElement("a");readiness.className="btn primary";readiness.href="/manufacturer/completeness?identifier="+encodeURIComponent(data.unique_identifier);readiness.textContent="Completeness →";
  links.append(readiness);
  if(data.passport_status==="active"){
    const p=document.createElement("a");p.className="btn";p.href=data.passport_url;p.target="_blank";p.rel="noopener";p.textContent="Отвори Passport";
    const q=document.createElement("a");q.className="btn";q.href=data.qr_url;q.target="_blank";q.rel="noopener";q.textContent="Отвори QR";
    links.append(p,q);
  }
  host.append(line,links);
}
async function ensurePilotQrCarrier(itemId){
  const response=await api("/api/carriers?battery_item_id="+encodeURIComponent(itemId));
  const active=(response.data||[]).find(carrier=>carrier.carrier_kind==="qr"&&carrier.status==="active");
  if(active)return active;
  return (await api("/api/carriers",{method:"POST",body:{battery_item_id:itemId,carrier_kind:"qr"}})).data;
}
function showPilotSuccess(model,item,passport){
  const host=$("#pilotResult");host.replaceChildren();host.className="result ok";
  const line=document.createElement("div");
  line.textContent="REAL QR PILOT READY · "+item.unique_identifier+" · "+model.model_identifier+" · ACTIVE · regulatory_compliance=false";
  const actions=document.createElement("div");actions.className="actions";
  const passportLink=document.createElement("a");passportLink.className="btn primary";passportLink.href="/passport?identifier="+encodeURIComponent(item.unique_identifier)+"&carrier=qr";passportLink.target="_blank";passportLink.rel="noopener";passportLink.textContent="Open + record QR scan";
  const qrLink=document.createElement("a");qrLink.className="btn";qrLink.href="/qr?identifier="+encodeURIComponent(item.unique_identifier);qrLink.target="_blank";qrLink.rel="noopener";qrLink.textContent="Open QR / Print";
  actions.append(passportLink,qrLink);
  host.append(line,actions);
}
async function publishTechnicalPilot(){
  if(!canWrite())return;
  const model=models.find(m=>m.id===$("#pilotModel").value);
  const identifier=$("#pilotBatteryIdentifier").value.trim();
  if(!model||model.category==="light_means_of_transport"){
    return setResult($("#pilotResult"),"Technical QR Pilot е само за non-LMT model. За LMT използвай strict readiness flow.","bad");
  }
  if(!identifier||identifier.length>300){
    return setResult($("#pilotResult"),"Въведи уникален Battery / serial ID.","bad");
  }
  $("#publishTechnicalPilot").disabled=true;
  setResult($("#pilotResult"),"Създаване на real battery item → ACTIVE technical passport → QR carrier…");
  try{
    let item=items.find(i=>i.unique_identifier===identifier&&i.model_id===model.id);
    if(!item){
      item=(await api("/api/items",{method:"POST",body:{
        model_id:model.id,
        unique_identifier:identifier,
        lifecycle_status:"original",
        canonical_data:{serial:identifier,sku:model.model_identifier,source:"manufacturer_dashboard_technical_pilot"}
      }})).data;
    }
    const publicPayload=technicalPilotPublicPayload(model,identifier);
    const published=(await api("/api/passport",{method:"POST",body:{
      action:"publish_technical_pilot",
      battery_item_id:item.id,
      public_payload:publicPayload,
      private_payload:{}
    }})).data;
    await ensurePilotQrCarrier(item.id);
    $("#pilotBatteryIdentifier").value="";
    await loadData();
    $("#pilotModel").value=model.id;
    showPilotSuccess(model,item,published);
  }catch(e){setResult($("#pilotResult"),e.message,"bad")}
  finally{$("#publishTechnicalPilot").disabled=!canWrite()}
}

async function provisionBattery(){
  if(!canWrite())return;
  const model=models.find(m=>m.id===$("#provisionModel").value);
  const identifier=$("#batteryIdentifier").value.trim();
  if(!model||!identifier)return setResult($("#provisionResult"),"Избери модел и въведи уникален Battery ID.","bad");
  $("#provisionBattery").disabled=true;setResult($("#provisionResult"),"Atomic provisioning към production backend…");
  try{
    const response=await api("/api/provision",{method:"POST",body:{
      model_id:model.id,
      unique_identifier:identifier,
      item_canonical_data:{serial:identifier,source:"manufacturer_dashboard"},
      public_payload:{
        model:{identification:{category:model.category,model_id:model.model_identifier,manufacturer:{name:model.manufacturer_name}}},
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
async function provisionBatch(){
  if(!canWrite())return;
  const model=models.find(m=>m.id===$("#batchModel").value);
  const batchKey=$("#batchKey").value.trim();
  const prefix=$("#batchPrefix").value.trim();
  const quantity=Number($("#batchQuantity").value);
  const serialStart=Number($("#batchSerialStart").value);
  const serialWidth=Number($("#batchSerialWidth").value);
  if(!model){
    return setResult($("#batchResult"),"Избери валиден SKU / модел.","bad");
  }
  if(!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(batchKey)){
    return setResult($("#batchResult"),"Batch key трябва да съдържа само букви, цифри, . _ : - и да започва с буква/цифра.","bad");
  }
  if(!prefix||prefix.length>250){
    return setResult($("#batchResult"),"Въведи Battery ID prefix.","bad");
  }
  if(!Number.isInteger(quantity)||quantity<1||quantity>250||
     !Number.isSafeInteger(serialStart)||serialStart<0||
     !Number.isInteger(serialWidth)||serialWidth<1||serialWidth>12){
    return setResult($("#batchResult"),"Quantity 1–250, Serial start ≥ 0 и Serial width 1–12 са задължителни.","bad");
  }
  const lastSerial=serialStart+quantity-1;
  if(!Number.isSafeInteger(lastSerial)||String(lastSerial).length>serialWidth){
    return setResult($("#batchResult"),"Serial range не се побира в избраната ширина.","bad");
  }

  $("#batchProvision").disabled=true;
  setResult($("#batchResult"),"Създаване на "+quantity+" DRAFT паспорта за SKU "+model.model_identifier+"…");
  try{
    const response=await api("/api/batch-provision",{method:"POST",body:{
      model_id:model.id,
      batch_key:batchKey,
      generator:{
        quantity,
        serial_start:serialStart,
        serial_width:serialWidth,
        identifier_prefix:prefix,
        item_canonical_data_template:{
          sku:model.model_identifier,
          source:"manufacturer_dashboard_batch"
        },
        public_payload_template:{
          model:{identification:{
            category:model.category,
            model_id:model.model_identifier,
            manufacturer:{name:model.manufacturer_name}
          }},
          item:{}
        },
        private_payload_template:{}
      }
    }});
    const data=response.data||{},units=Array.isArray(data.units)?data.units:[];
    const first=units[0]?.unique_identifier||"—";
    const last=units[units.length-1]?.unique_identifier||"—";
    await loadData();
    $("#batchModel").value=model.id;
    setResult(
      $("#batchResult"),
      (data.idempotent_replay?"Batch replay verified":"Batch created")+
      " · SKU "+model.model_identifier+
      " · "+units.length+" units · "+first+" → "+last+
      ". Следва: completeness → ACTIVE → Bind QR + Print.",
      "ok"
    );
  }catch(e){
    setResult($("#batchResult"),e.message,"bad");
  }finally{
    $("#batchProvision").disabled=!canWrite();
  }
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
$("#publishTechnicalPilot").addEventListener("click",publishTechnicalPilot);
$("#provisionBattery").addEventListener("click",provisionBattery);
$("#batchProvision").addEventListener("click",provisionBatch);
init().catch(e=>{document.body.dataset.manufacturerReady="false";showGate(e.message)});
})();