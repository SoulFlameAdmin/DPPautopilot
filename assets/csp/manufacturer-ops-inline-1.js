(()=>{"use strict";
const $=s=>document.querySelector(s);
const STORAGE="dpp_company_session_v1";
const PROJECT_URL="https://frhletkiuupgksmgxoxc.supabase.co";
const CATEGORIES=new Set(["portable","light_means_of_transport","starting_lighting_ignition","industrial","electric_vehicle","other"]);
const FIELD_OPTIONS=[
 ["","— Ignore —"],
 ["model.identification.manufacturer.name","Manufacturer name"],
 ["model.identification.model_id","Model ID"],
 ["model.identification.category","Category"],
 ["model.rated_capacity_ah","Rated capacity (Ah)"],
 ["model.composition.chemistry","Chemistry"],
 ["item.unique_identifier","Unique identifier"],
 ["item.lifecycle_status","Lifecycle status"],
 ["item.state_of_health.percent","State of health (%)"]
];
const DEFAULT_MAP={
 manufacturer_name:"model.identification.manufacturer.name",
 manufacturer:"model.identification.manufacturer.name",
 model_id:"model.identification.model_id",
 model_identifier:"model.identification.model_id",
 category:"model.identification.category",
 rated_capacity_ah:"model.rated_capacity_ah",
 chemistry:"model.composition.chemistry",
 unique_identifier:"item.unique_identifier",
 serial:"item.unique_identifier",
 lifecycle_status:"item.lifecycle_status",
 state_of_health_percent:"item.state_of_health.percent"
};
let cfg=null,session=null,activeOrg=null,items=[],models=[],passports=[],carriers=[],mappingProfiles=[],selectedMappingId=null,selectedPassport=null,csv={headers:[],rows:[],mapping:{},mappingProfileId:null,importId:null,validated:false,sourceType:null,sourceName:"",workbook:null,sheetNames:[],selectedSheet:null};

function setText(node,msg,kind=""){if(!node)return;node.textContent=msg;node.className="result"+(kind?" "+kind:"")}
function readSession(){
 try{const v=JSON.parse(sessionStorage.getItem(STORAGE)||"null");if(v?.access_token){session=v;return true}}catch{}
 session=null;return false;
}
function saveSession(v){
 if(v?.access_token){session={access_token:v.access_token,refresh_token:v.refresh_token||session?.refresh_token||"",expires_in:Number(v.expires_in)||3600};sessionStorage.setItem(STORAGE,JSON.stringify(session))}
 else{session=null;sessionStorage.removeItem(STORAGE)}
}
async function authCall(path,body){
 const r=await fetch(cfg.supabaseUrl+path,{method:"POST",headers:{apikey:cfg.publishableKey,"Content-Type":"application/json",Accept:"application/json"},body:JSON.stringify(body)});
 const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data.msg||data.message||data.error_description||data.error||("HTTP "+r.status));return data;
}
async function refresh(){
 if(!session?.refresh_token)return false;
 try{saveSession(await authCall("/auth/v1/token?grant_type=refresh_token",{refresh_token:session.refresh_token}));return true}catch{return false}
}
async function api(path,{method="GET",body,retry=true}={}){
 if(!session?.access_token)throw new Error("Login required.");
 const r=await fetch(path,{method,headers:{Authorization:"Bearer "+session.access_token,"Content-Type":"application/json",Accept:"application/json"},body:body?JSON.stringify(body):undefined,cache:"no-store"});
 const data=await r.json().catch(()=>({}));
 if(r.status===401&&retry&&await refresh())return api(path,{method,body,retry:false});
 if(!r.ok)throw new Error(data?.error?.message||data?.error?.code||("HTTP "+r.status));
 return data;
}
function canWrite(){return !!activeOrg&&["owner","admin","editor"].includes(activeOrg.role)}
function fmt(v){const d=new Date(v);return Number.isNaN(d.getTime())?String(v||"—"):new Intl.DateTimeFormat("bg-BG",{dateStyle:"medium",timeStyle:"short"}).format(d)}
function button(label,cls="btn"){const b=document.createElement("button");b.type="button";b.className=cls;b.textContent=label;return b}
function link(label,href,cls="btn"){const a=document.createElement("a");a.className=cls;a.href=href;a.textContent=label;return a}
function option(text,value){return new Option(text,value)}
function itemById(id){return items.find(x=>x.id===id)||null}
function passportByItem(id){return passports.find(x=>x.battery_item_id===id)||null}
function modelById(id){return models.find(x=>x.id===id)||null}
function itemModel(item){return item?modelById(item.model_id):null}
function safeText(v,fallback="—"){return v==null||v===""?fallback:String(v)}
function setDetail(p){
 selectedPassport=p||null;
 document.querySelectorAll(".passport-rows .ops-row").forEach(row=>row.classList.toggle("selected",!!p&&row.dataset.passportId===p.passport_id));
 const item=p?itemById(p.battery_item_id):null,model=itemModel(item);
 const id=p?.unique_identifier||"Select a passport";
 const status=(p?.status||"—").toUpperCase();
 const chemistry=model?.canonical_data?.composition?.chemistry||model?.canonical_data?.chemistry||"—";
 const capacity=model?.rated_capacity_ah!=null?model.rated_capacity_ah+" Ah":(model?.canonical_data?.rated_capacity_ah!=null?model.canonical_data.rated_capacity_ah+" Ah":"—");
 const type=model?.category||"—";
 const company=activeOrg?.name||"—";
 const manufacturer=model?.manufacturer_name||company;
 $("#detailBatteryId").textContent=id;
 $("#detailUpdated").textContent=p?"Last updated: "+fmt(p.updated_at):"—";
 $("#detailStatus").textContent=status;
 $("#detailFieldBattery").textContent=id;
 $("#detailFieldModel").textContent=model?.model_identifier||safeText(item?.model_id);
 $("#detailFieldClient").textContent=company;
 $("#detailFieldType").textContent=type;
 $("#detailFieldChemistry").textContent=chemistry;
 $("#detailFieldCapacity").textContent=capacity;
 $("#detailFieldManufacturer").textContent=manufacturer;
 $("#detailFieldStatus").textContent=status;
 const qr=$("#detailQrImage"); if(p){qr.src="/api/qr?identifier="+encodeURIComponent(id);qr.hidden=false}else{qr.removeAttribute("src");qr.hidden=true}
 const pub=$("#detailPublicLink");pub.href=p?"/passport?identifier="+encodeURIComponent(id):"#";
 const print=$("#detailPrintButton");print.disabled=!p||p.status!=="active";
}
function syncSearchFields(source){
 const mirror=$("#passportSearchMirror");
 if(source===mirror)$("#passportSearch").value=mirror.value;
 else if(mirror)mirror.value=$("#passportSearch").value;
 renderPassports();
}

async function loadBase(){
 const [orgData,itemData,modelData,passportData,carrierData]=await Promise.all([
  api("/api/organizations"),api("/api/items"),api("/api/models"),api("/api/passport?list=1&limit=500"),api("/api/carriers")
 ]);
 const orgs=orgData.data||[];activeOrg=orgs.find(o=>o.active)||null;
 if(!activeOrg)throw new Error("Active company is required.");
 items=itemData.data||[];models=modelData.data||[];passports=passportData.data||[];carriers=carrierData.data||[];
 const name=$("#workspaceCompanyName");if(name)name.textContent=activeOrg.name||"Company";
 renderPassportStats();renderPassports();renderCarrierItemOptions();
 if(passports.length)setDetail(selectedPassport&&passports.find(p=>p.passport_id===selectedPassport.passport_id)||passports[0]);else setDetail(null);
 document.body.dataset.manufacturerOpsReady="true";
}

function renderPassportStats(){
 const counts={all:passports.length,draft:0,active:0,terminal:0};
 for(const p of passports){if(p.status==="draft")counts.draft++;else if(p.status==="active")counts.active++;else counts.terminal++}
 $("#opsPassportCount").textContent=counts.all;$("#opsActiveCount").textContent=counts.active;$("#opsDraftCount").textContent=counts.draft;$("#opsTerminalCount").textContent=counts.terminal;
 const printed=carriers.filter(c=>c.carrier_kind==="qr"&&c.status==="active").length;
 const carrierNode=$("#printedCarrierCount");if(carrierNode)carrierNode.textContent=printed;
 const countText=$("#passportCountText");if(countText)countText.textContent="Showing "+passports.length+" passports";
}
function renderPassports(){
 const host=$("#passportOpsList"),q=$("#passportSearch").value.trim().toLowerCase();host.replaceChildren();
 const rows=passports.filter(p=>{
  const item=itemById(p.battery_item_id),model=itemModel(item),company=activeOrg?.name||"";
  const hay=[p.unique_identifier,p.status,model?.model_identifier,company].join(" ").toLowerCase();
  return !q||hay.includes(q);
 });
 if(!rows.length){const e=document.createElement("div");e.className="empty";e.textContent="No passports match this filter.";host.append(e);return}
 for(const p of rows){
  const item=itemById(p.battery_item_id),model=itemModel(item);
  const row=document.createElement("article");row.className="ops-row";row.dataset.passportId=p.passport_id;
  const c0=document.createElement("div");c0.className="ops-cell";
  const check=document.createElement("input");check.type="checkbox";check.className="passport-print-check";check.dataset.itemId=p.battery_item_id;check.dataset.identifier=p.unique_identifier;check.disabled=p.status!=="active";c0.append(check);
  const c1=document.createElement("div");c1.className="ops-cell";const id=document.createElement("strong");id.textContent=p.unique_identifier;c1.append(id);
  const c2=document.createElement("div");c2.className="ops-cell muted";c2.textContent=model?.model_identifier||safeText(item?.model_id);
  const c3=document.createElement("div");c3.className="ops-cell muted";c3.textContent=activeOrg?.name||"—";
  const c4=document.createElement("div");c4.className="ops-cell";const pill=document.createElement("span");pill.className="status-pill "+(p.status==="draft"?"pending":p.status==="active"?"":"terminal");pill.textContent=p.status.toUpperCase();c4.append(pill);
  const c5=document.createElement("div");c5.className="ops-cell muted";c5.textContent=fmt(p.updated_at);
  const c6=document.createElement("div");c6.className="ops-cell ops-actions";const menu=button("⋯","row-menu");c6.append(menu);
  row.append(c0,c1,c2,c3,c4,c5,c6);
  row.addEventListener("click",e=>{if(e.target.closest("input,button,a"))return;setDetail(p)});
  menu.addEventListener("click",()=>setDetail(p));
  host.append(row);
 }
 if(selectedPassport)setDetail(selectedPassport);
}
async function carriersFor(itemId){return (await api("/api/carriers?battery_item_id="+encodeURIComponent(itemId))).data||[]}
async function ensureQrCarrier(itemId){
 const existing=await carriersFor(itemId);
 const active=existing.find(c=>c.carrier_kind==="qr"&&c.status==="active");
 if(active)return active;
 if(!canWrite())throw new Error("QR carrier is not bound and this role cannot bind one.");
 return (await api("/api/carriers",{method:"POST",body:{battery_item_id:itemId,carrier_kind:"qr"}})).data;
}
function buildPrintSheet(rows){
 const sheet=$("#printSheet");sheet.replaceChildren();
 for(const p of rows){
  const card=document.createElement("article");card.className="print-label";
  const img=document.createElement("img");img.alt="DPP QR";img.src="/api/qr?identifier="+encodeURIComponent(p.unique_identifier);
  const meta=document.createElement("div"),name=document.createElement("strong"),small=document.createElement("small");
  name.textContent=p.unique_identifier;small.textContent="DPP Autopilot · ACTIVE battery passport";
  meta.append(name,small);card.append(img,meta);sheet.append(card);
 }
 return [...sheet.querySelectorAll("img")];
}
async function printPassports(rows,{bind=true}={}){
 if(!rows.length)throw new Error("Избери поне един ACTIVE passport.");
 setText($("#printResult"),"Подготовка на "+rows.length+" QR labels…");
 if(bind){for(const p of rows)await ensureQrCarrier(p.battery_item_id)}
 const images=buildPrintSheet(rows);
 await Promise.all(images.map(img=>img.decode?img.decode().catch(()=>{}):Promise.resolve()));
 setText($("#printResult"),"QR labels са подготвени. Отварям системния print dialog.","ok");
 window.print();
}
function selectedPassports(){
 const ids=new Set([...document.querySelectorAll(".passport-print-check:checked")].map(x=>x.dataset.itemId));
 return passports.filter(p=>ids.has(p.battery_item_id)&&p.status==="active");
}

function renderCarrierItemOptions(){
 const select=$("#carrierItem"),old=select.value;select.replaceChildren(option("Избери battery item",""));
 for(const item of items.slice().sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)))){
  select.append(option(item.unique_identifier,item.id));
 }
 if(items.some(i=>i.id===old))select.value=old;
}
function syncCarrierForm(){
 const nfc=$("#carrierKind").value==="nfc";
 $("#nfcFields").hidden=!nfc;
 $("#carrierNfcTech").disabled=!nfc||!canWrite();
 $("#carrierExternalUid").disabled=!canWrite();
 $("#bindCarrier").disabled=!canWrite()||!$("#carrierItem").value;
}
async function loadCarrierPanel(){
 const itemId=$("#carrierItem").value,carrierHost=$("#carrierList"),historyHost=$("#scanHistory");
 carrierHost.replaceChildren();historyHost.replaceChildren();
 if(!itemId){setText($("#carrierResult"),"Избери battery item.");return}
 setText($("#carrierResult"),"Зареждане на carriers и scan history…");
 try{
  const [carrierData,historyData]=await Promise.all([
   api("/api/carriers?battery_item_id="+encodeURIComponent(itemId)),
   api("/api/carriers?history=1&battery_item_id="+encodeURIComponent(itemId)+"&limit=100")
  ]);
  renderCarriers(carrierData.data||[]);renderScanHistory(historyData.data||[]);
  setText($("#carrierResult"),"Production carrier state е зареден.","ok");
 }catch(e){setText($("#carrierResult"),e.message,"bad")}
}
function renderCarriers(rows){
 const host=$("#carrierList");host.replaceChildren();
 if(!rows.length){const e=document.createElement("div");e.className="empty";e.textContent="Няма physical carriers за тази батерия.";host.append(e);return}
 for(const c of rows){
  const row=document.createElement("article");row.className="ops-row";
  const left=document.createElement("div"),strong=document.createElement("strong"),small=document.createElement("small"),url=document.createElement("div");
  strong.textContent=c.carrier_kind.toUpperCase()+" · "+c.status.toUpperCase()+(c.nfc_technology?" · "+c.nfc_technology:"");
  small.textContent=(c.external_uid?"UID "+c.external_uid+" · ":"")+"bound "+fmt(c.bound_at);
  url.className="carrier-url";url.textContent=c.public_url;
  left.append(strong,small,url);
  const actions=document.createElement("div");actions.className="ops-actions";
  const copy=button("Copy URL");copy.addEventListener("click",async()=>{try{await navigator.clipboard.writeText(c.public_url);copy.textContent="Copied ✓"}catch{copy.textContent="Copy failed"}});
  actions.append(copy);
  if(c.carrier_kind==="qr"){
   const reprint=button("Reprint");reprint.addEventListener("click",async()=>{
    const item=itemById(c.battery_item_id),p=passportByItem(c.battery_item_id);
    try{await printPassports([p||{battery_item_id:item.id,unique_identifier:item.unique_identifier,status:"active"}],{bind:false})}catch(e){setText($("#carrierResult"),e.message,"bad")}
   });actions.append(reprint);
  }
  if(c.status==="active"&&canWrite()){
   const reissue=button("Reissue");reissue.addEventListener("click",async()=>{
    try{
     reissue.disabled=true;setText($("#carrierResult"),"Reissue на "+c.carrier_kind.toUpperCase()+" carrier…");
     await api("/api/carriers",{method:"POST",body:{battery_item_id:c.battery_item_id,carrier_kind:c.carrier_kind,nfc_technology:c.carrier_kind==="nfc"?(c.nfc_technology||"other"):null,external_uid:c.external_uid||null}});
     await loadCarrierPanel();setText($("#carrierResult"),"Carrier е reissued; старият е REPLACED.","ok");
    }catch(e){setText($("#carrierResult"),e.message,"bad")}finally{reissue.disabled=false}
   });
   const revoke=button("Revoke","btn danger");revoke.addEventListener("click",async()=>{
    if(!confirm("Revoke "+c.carrier_kind.toUpperCase()+" carrier?"))return;
    try{await api("/api/carriers",{method:"PATCH",body:{id:c.id,action:"revoke",reason:"operator revoke"}});await loadCarrierPanel();setText($("#carrierResult"),"Carrier е revoked.","ok")}catch(e){setText($("#carrierResult"),e.message,"bad")}
   });
   actions.append(reissue,revoke);
  }
  row.append(left,actions);host.append(row);
 }
}
function renderScanHistory(rows){
 const host=$("#scanHistory");host.replaceChildren();
 if(!rows.length){const e=document.createElement("div");e.className="empty";e.textContent="Все още няма записани QR/NFC opens.";host.append(e);return}
 for(const e of rows){
  const row=document.createElement("div");row.className="scan-row";
  const src=document.createElement("span");src.className="scan-source";src.textContent=e.source;
  const id=document.createElement("div");id.textContent=e.unique_identifier;
  const when=document.createElement("small");when.textContent=fmt(e.occurred_at);
  row.append(src,id,when);host.append(row);
 }
}
async function bindCarrier(){
 if(!canWrite())return;
 const itemId=$("#carrierItem").value,kind=$("#carrierKind").value;
 if(!itemId)return setText($("#carrierResult"),"Избери battery item.","bad");
 const body={battery_item_id:itemId,carrier_kind:kind};
 if(kind==="nfc"){body.nfc_technology=$("#carrierNfcTech").value;const uid=$("#carrierExternalUid").value.trim();if(uid)body.external_uid=uid}
 $("#bindCarrier").disabled=true;setText($("#carrierResult"),"Secure binding към production backend…");
 try{
  const c=(await api("/api/carriers",{method:"POST",body})).data;
  await loadCarrierPanel();
  setText($("#carrierResult"),c.carrier_kind.toUpperCase()+" carrier ACTIVE · URL е derivеd server-side.","ok");
 }catch(e){setText($("#carrierResult"),e.message,"bad")}
 finally{syncCarrierForm()}
}

function normalizeTabularData(headers,rows,sourceLabel){
 const normalizedHeaders=(headers||[]).map(x=>String(x??"").trim());
 if(normalizedHeaders.length<1)throw new Error(sourceLabel+" няма header.");
 if(normalizedHeaders.length>100)throw new Error("Максимумът е 100 колони на import.");
 if(normalizedHeaders.some(x=>!x))throw new Error(sourceLabel+" има празно име на колона.");
 if(new Set(normalizedHeaders).size!==normalizedHeaders.length)throw new Error(sourceLabel+" има дублирани колони.");
 const normalizedRows=(rows||[])
  .filter(row=>Array.isArray(row)&&row.some(v=>String(v??"").trim()!==""))
  .map(row=>normalizedHeaders.map((_,i)=>String(row[i]??"").trim()));
 if(normalizedRows.length<1)throw new Error(sourceLabel+" трябва да има поне един data row.");
 if(normalizedRows.length>1000)throw new Error("Максимумът е 1000 data rows на import.");
 return {headers:normalizedHeaders,rows:normalizedRows};
}
function parseCSV(text){
 const rows=[];let row=[],cell="",quoted=false;
 for(let i=0;i<text.length;i++){
  const ch=text[i];
  if(ch==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++}else quoted=!quoted}
  else if(ch===","&&!quoted){row.push(cell);cell=""}
  else if((ch==="\n"||ch==="\r")&&!quoted){if(ch==="\r"&&text[i+1]==="\n")i++;row.push(cell);cell="";if(row.some(v=>v!==""))rows.push(row);row=[]}
  else cell+=ch;
 }
 if(quoted)throw new Error("CSV има незатворена кавичка.");
 if(cell!==""||row.length){row.push(cell);if(row.some(v=>v!==""))rows.push(row)}
 if(rows.length<2)throw new Error("CSV трябва да има header и поне един data row.");
 return normalizeTabularData(rows[0],rows.slice(1),"CSV");
}
function parseXlsxSheet(workbook,sheetName){
 if(!window.XLSX?.utils)throw new Error("XLSX parser не е зареден.");
 const sheet=workbook?.Sheets?.[sheetName];
 if(!sheet)throw new Error("Worksheet не е намерен.");
 const ref=sheet["!fullref"]||sheet["!ref"];
 if(!ref)throw new Error("Worksheet е празен.");
 const range=window.XLSX.utils.decode_range(ref);
 const rowSpan=range.e.r-range.s.r+1;
 const colSpan=range.e.c-range.s.c+1;
 if(rowSpan>1001)throw new Error("Worksheet има над 1000 data rows.");
 if(colSpan>100)throw new Error("Worksheet има над 100 колони.");
 const matrix=window.XLSX.utils.sheet_to_json(sheet,{header:1,raw:false,defval:"",blankrows:false});
 if(matrix.length<2)throw new Error("Worksheet трябва да има header и поне един data row.");
 return normalizeTabularData(matrix[0],matrix.slice(1),"XLSX worksheet");
}
function renderXlsxSheetOptions(){
 const group=$("#xlsxSheetGroup"),select=$("#xlsxSheet");
 if(!csv.workbook||csv.sourceType!=="xlsx"){
  group.hidden=true;select.replaceChildren();return;
 }
 group.hidden=false;select.replaceChildren();
 for(const name of csv.sheetNames)select.append(option(name,name));
 select.value=csv.selectedSheet||csv.sheetNames[0]||"";
}
function renderMappingProfiles(){
 const select=$("#savedMappingSelect");if(!select)return;
 const previous=selectedMappingId||select.value;
 select.replaceChildren(option("— Select profile —",""));
 for(const p of mappingProfiles)select.append(option(p.name+" · r"+p.revision,p.id));
 if(mappingProfiles.some(p=>p.id===previous)){select.value=previous;selectedMappingId=previous}else{select.value="";selectedMappingId=null}
 $("#deleteMappingProfile").disabled=!selectedMappingId||!canWrite();
}
async function loadMappingProfiles(){
 const response=await api("/api/import-mappings");
 mappingProfiles=Array.isArray(response.data)?response.data:[];
 renderMappingProfiles();
}
function selectedMappingProfile(){return mappingProfiles.find(p=>p.id===selectedMappingId)||null}
function selectMappingProfile(id){
 selectedMappingId=id||null;
 const profile=selectedMappingProfile();
 $("#mappingProfileName").value=profile?.name||"";
 $("#deleteMappingProfile").disabled=!profile||!canWrite();
 setText($("#mappingProfileStatus"),profile?"Selected "+profile.name+" · revision "+profile.revision:"Saved mappings are private to the active company tenant.",profile?"ok":"");
}
function applyMappingProfile(){
 const profile=selectedMappingProfile();
 if(!profile)return setText($("#mappingProfileStatus"),"Select a saved mapping first.","bad");
 if(!csv.headers.length)return setText($("#mappingProfileStatus"),"Load a CSV or XLSX file before applying a mapping.","bad");
 if(csv.sourceType&&profile.source_format!==csv.sourceType)return setText($("#mappingProfileStatus"),"This profile is for "+profile.source_format.toUpperCase()+", but the loaded file is "+csv.sourceType.toUpperCase()+".","bad");
 let matched=0;
 for(const h of csv.headers){
  const value=profile.field_mapping&&typeof profile.field_mapping[h]==="string"?profile.field_mapping[h]:"";
  csv.mapping[h]=value;
  if(value)matched++;
 }
 csv.mappingProfileId=profile.id;csv.importId=null;csv.validated=false;
 renderCsvMapping();renderCsvSummary();
 setText($("#mappingProfileStatus"),"Applied "+profile.name+" · "+matched+" mapped columns.","ok");
}
async function saveCurrentMappingProfile(){
 if(!canWrite())return;
 const name=$("#mappingProfileName").value.trim();
 if(!name)return setText($("#mappingProfileStatus"),"Enter a mapping profile name.","bad");
 if(!csv.headers.length||!csv.sourceType)return setText($("#mappingProfileStatus"),"Load a CSV or XLSX file before saving a mapping.","bad");
 const profile=selectedMappingProfile();
 $("#saveMappingProfile").disabled=true;
 setText($("#mappingProfileStatus"),"Saving mapping profile…");
 try{
  const response=await api("/api/import-mappings",{method:"POST",body:{
   id:profile?.id||null,
   name,
   source_format:csv.sourceType,
   source_headers:csv.headers,
   field_mapping:csv.mapping
  }});
  const saved=response.data;
  await loadMappingProfiles();
  selectMappingProfile(saved.id);
  csv.mappingProfileId=saved.id;
  setText($("#mappingProfileStatus"),"Saved "+saved.name+" · revision "+saved.revision+".","ok");
 }catch(e){setText($("#mappingProfileStatus"),e.message,"bad")}
 finally{$("#saveMappingProfile").disabled=!canWrite()}
}
async function deleteCurrentMappingProfile(){
 const profile=selectedMappingProfile();
 if(!profile||!canWrite())return;
 if(!confirm("Delete saved mapping "+profile.name+"?"))return;
 $("#deleteMappingProfile").disabled=true;
 setText($("#mappingProfileStatus"),"Deleting mapping profile…");
 try{
  await api("/api/import-mappings?id="+encodeURIComponent(profile.id),{method:"DELETE"});
  if(csv.mappingProfileId===profile.id)csv.mappingProfileId=null;
  selectedMappingId=null;
  await loadMappingProfiles();
  $("#mappingProfileName").value="";
  setText($("#mappingProfileStatus"),"Mapping profile deleted.","ok");
 }catch(e){setText($("#mappingProfileStatus"),e.message,"bad");$("#deleteMappingProfile").disabled=false}
}

function setImportData(parsed,meta={}){
 csv={
  headers:parsed.headers,
  rows:parsed.rows,
  mapping:{},
  mappingProfileId:null,
  importId:null,
  validated:false,
  sourceType:meta.sourceType||null,
  sourceName:meta.sourceName||"",
  workbook:meta.workbook||null,
  sheetNames:Array.isArray(meta.sheetNames)?meta.sheetNames:[],
  selectedSheet:meta.selectedSheet||null
 };
 for(const h of csv.headers)csv.mapping[h]=DEFAULT_MAP[h.trim().toLowerCase()]||"";
 renderXlsxSheetOptions();
 renderCsvMapping();renderCsvPreview();renderCsvSummary();
 document.body.dataset.importSource=csv.sourceType||"none";
}
function renderCsvMapping(){
 const host=$("#csvMappings");host.replaceChildren();
 for(const h of csv.headers){
  const row=document.createElement("div");row.className="csv-map-row";
  const name=document.createElement("span");name.textContent=h;
  const select=document.createElement("select");select.dataset.column=h;select.setAttribute("aria-label","Map "+h);
  for(const [value,label] of FIELD_OPTIONS)select.append(option(label,value));
  select.value=csv.mapping[h]||"";
  select.addEventListener("change",()=>{csv.mapping[h]=select.value;csv.mappingProfileId=null;csv.importId=null;csv.validated=false;renderCsvSummary()});
  row.append(name,select);host.append(row);
 }
}
function renderCsvPreview(){
 const host=$("#csvPreview");host.replaceChildren();
 if(!csv.headers.length)return;
 const table=document.createElement("table"),thead=document.createElement("thead"),tr=document.createElement("tr");
 for(const h of csv.headers){const th=document.createElement("th");th.textContent=h;tr.append(th)}thead.append(tr);
 const tbody=document.createElement("tbody");
 for(const values of csv.rows.slice(0,8)){const r=document.createElement("tr");for(const v of values){const td=document.createElement("td");td.textContent=v;r.append(td)}tbody.append(r)}
 table.append(thead,tbody);host.append(table);
}
function mappedValue(values,target){
 const idx=csv.headers.findIndex(h=>csv.mapping[h]===target);return idx>=0?String(values[idx]??"").trim():"";
}
function setPath(root,path,value){
 const parts=path.split(".");let cur=root;
 for(let i=0;i<parts.length-1;i++){if(!cur[parts[i]]||typeof cur[parts[i]]!=="object")cur[parts[i]]={};cur=cur[parts[i]]}
 cur[parts.at(-1)]=value;
}
function buildImportRows(){
 const targets=Object.values(csv.mapping).filter(Boolean);
 if(new Set(targets).size!==targets.length)throw new Error("Едно canonical field не може да е map-нато от две колони.");
 const required=["model.identification.manufacturer.name","model.identification.model_id","model.identification.category","item.unique_identifier"];
 for(const target of required)if(!targets.includes(target))throw new Error("Липсва mapping за "+target);
 return csv.rows.map(values=>{
  const manufacturer=mappedValue(values,"model.identification.manufacturer.name");
  const modelId=mappedValue(values,"model.identification.model_id");
  const category=mappedValue(values,"model.identification.category");
  const identifier=mappedValue(values,"item.unique_identifier");
  const lifecycle=mappedValue(values,"item.lifecycle_status")||"original";
  const errors=[];
  if(!manufacturer)errors.push("manufacturer_name is required");
  if(!modelId)errors.push("model_id is required");
  if(!identifier)errors.push("unique_identifier is required");
  if(!CATEGORIES.has(category))errors.push("unsupported category: "+category);
  if(!["original","repurposed","remanufactured","second_life","waste","retired"].includes(lifecycle))errors.push("unsupported lifecycle_status: "+lifecycle);
  const modelCanonical={identification:{manufacturer:{name:manufacturer},model_id:modelId,category}};
  const itemCanonical={unique_identifier:identifier};
  for(let i=0;i<csv.headers.length;i++){
   const target=csv.mapping[csv.headers[i]],value=String(values[i]??"").trim();
   if(!target||!value)continue;
   if(target.startsWith("model.")&&!["model.identification.manufacturer.name","model.identification.model_id","model.identification.category"].includes(target)){
    setPath(modelCanonical,target.slice(6),/^\d+(\.\d+)?$/.test(value)?Number(value):value);
   }
   if(target.startsWith("item.")&&!["item.unique_identifier","item.lifecycle_status"].includes(target)){
    setPath(itemCanonical,target.slice(5),/^\d+(\.\d+)?$/.test(value)?Number(value):value);
   }
  }
  return {normalized_model:{model_identifier:modelId,manufacturer_name:manufacturer,category,canonical_data:modelCanonical},normalized_item:{unique_identifier:identifier,lifecycle_status:lifecycle,canonical_data:itemCanonical},validation_errors:errors};
 });
}
function importSourceLabel(){
 if(csv.sourceType==="xlsx")return "XLSX · "+(csv.selectedSheet||"worksheet");
 if(csv.sourceType==="csv")return "CSV";
 return "NO FILE";
}
function renderCsvSummary(){
 $("#csvRows").textContent=csv.rows.length;$("#csvColumns").textContent=csv.headers.length;
 $("#csvMapped").textContent=Object.values(csv.mapping).filter(Boolean).length;
 $("#importSourcePill").textContent=importSourceLabel();
 let valid=false,error="";
 try{if(csv.rows.length){const rows=buildImportRows();valid=rows.every(r=>r.validation_errors.length===0);if(!valid)error=rows.reduce((n,r)=>n+r.validation_errors.length,0)+" local validation errors"}}
 catch(e){error=e.message}
 $("#stageImport").disabled=!canWrite()||!valid;
 $("#validateImport").disabled=!canWrite()||!csv.importId;
 $("#commitImport").disabled=!canWrite()||!csv.importId||!csv.validated;
 setText($("#csvResult"),error||(!csv.rows.length?"Зареди CSV или XLSX файл.":importSourceLabel()+" mapping е валиден за staging."),error?"bad":(valid?"ok":""));
}
async function loadCsvFile(file){
 if(!file)return;
 if(!/\.csv$/i.test(file.name))throw new Error("Избери .csv файл.");
 if(file.size>2*1024*1024)throw new Error("CSV файлът е над 2 MiB.");
 const parsed=parseCSV(await file.text());
 $("#xlsxFile").value="";
 setImportData(parsed,{sourceType:"csv",sourceName:file.name});
}
async function loadXlsxFile(file){
 if(!file)return;
 if(!/\.xlsx$/i.test(file.name))throw new Error("Избери .xlsx Excel файл.");
 if(file.size>5*1024*1024)throw new Error("XLSX файлът е над 5 MiB.");
 if(!window.XLSX?.read||!window.XLSX?.utils)throw new Error("XLSX parser не е зареден. Refresh-ни страницата и опитай пак.");
 const workbook=window.XLSX.read(await file.arrayBuffer(),{
  type:"array",
  dense:true,
  cellFormula:false,
  cellHTML:false,
  cellStyles:false,
  cellDates:false,
  sheetRows:1002
 });
 const sheetNames=(workbook.SheetNames||[]).slice(0,50);
 if(!sheetNames.length)throw new Error("XLSX workbook няма worksheets.");
 const selectedSheet=sheetNames.find(name=>workbook.Sheets?.[name]?.["!ref"])||sheetNames[0];
 const parsed=parseXlsxSheet(workbook,selectedSheet);
 $("#csvFile").value="";
 setImportData(parsed,{sourceType:"xlsx",sourceName:file.name,workbook,sheetNames,selectedSheet});
}
async function switchXlsxSheet(sheetName){
 if(csv.sourceType!=="xlsx"||!csv.workbook)return;
 const workbook=csv.workbook,sheetNames=csv.sheetNames.slice(),sourceName=csv.sourceName;
 const parsed=parseXlsxSheet(workbook,sheetName);
 setImportData(parsed,{sourceType:"xlsx",sourceName,workbook,sheetNames,selectedSheet:sheetName});
}
async function stageImport(){
 try{
  const rows=buildImportRows();$("#stageImport").disabled=true;setText($("#csvResult"),"Staging "+rows.length+" "+importSourceLabel()+" rows към production import API…");
  const data=(await api("/api/imports",{method:"POST",body:{rows,mapping_id:csv.mappingProfileId||null}})).data;
  csv.importId=data.import_id;csv.validated=false;renderCsvSummary();setText($("#csvResult"),"STAGED · "+data.staged_rows+" rows · "+data.import_id,"ok");
 }catch(e){setText($("#csvResult"),e.message,"bad");renderCsvSummary()}
}
async function validateImport(){
 if(!csv.importId)return;
 try{
  $("#validateImport").disabled=true;setText($("#csvResult"),"Server-side validation…");
  const data=(await api("/api/imports",{method:"PATCH",body:{id:csv.importId,action:"validate"}})).data;
  csv.validated=data.status==="validated"&&data.error_count===0;renderCsvSummary();
  setText($("#csvResult"),csv.validated?"VALIDATED · 0 errors":"INVALID · "+data.error_count+" errors",csv.validated?"ok":"bad");
 }catch(e){setText($("#csvResult"),e.message,"bad");renderCsvSummary()}
}
async function commitImport(){
 if(!csv.importId||!csv.validated)return;
 let passed=false;
 try{
  $("#commitImport").disabled=true;setText($("#csvResult"),"Atomic commit + idempotency replay acceptance…");
  const first=(await api("/api/imports",{method:"PATCH",body:{id:csv.importId,action:"commit"}})).data;
  const second=(await api("/api/imports",{method:"PATCH",body:{id:csv.importId,action:"commit"}})).data;
  if(first.status!=="committed"||first.already_committed!==false||second.status!=="committed"||second.already_committed!==true||first.committed_rows!==second.committed_rows){
   throw new Error("Idempotency acceptance failed.");
  }
  passed=true;
  document.body.dataset.importIdempotency="pass";
  setText($("#csvResult"),"COMMITTED "+first.committed_rows+" rows · replay = NO-OP ✓ · idempotency PASS","ok");
  await loadBase();$("#refreshDashboard").click();
 }catch(e){document.body.dataset.importIdempotency="fail";setText($("#csvResult"),e.message,"bad")}
 finally{
  if(passed){csv.validated=false;$("#commitImport").disabled=true}
  else renderCsvSummary();
 }
}

async function init(){
 cfg=await fetch("/data/auth-config.json",{cache:"no-store"}).then(r=>{if(!r.ok)throw new Error("Auth config unavailable.");return r.json()});
 if(cfg.supabaseUrl!==PROJECT_URL)throw new Error("Unexpected auth project.");
 if(!readSession()){setText($("#opsStatus"),"Влез през Company Access, за да използваш production operations.","bad");return}
 await loadBase();
 await loadMappingProfiles();
 $("#opsRole").textContent=activeOrg.role.toUpperCase();$("#opsRole").className="state "+(canWrite()?"ok":"readonly");
 $("#saveMappingProfile").disabled=!canWrite();$("#deleteMappingProfile").disabled=!canWrite()||!selectedMappingId;
 syncCarrierForm();renderCsvSummary();setText($("#opsStatus"),"Operations center е свързан към production tenant.","ok");
}
$("#passportSearch").addEventListener("input",e=>syncSearchFields(e.currentTarget));
const searchMirror=$("#passportSearchMirror");if(searchMirror)searchMirror.addEventListener("input",e=>syncSearchFields(e.currentTarget));
const detailPrint=$("#detailPrintButton");if(detailPrint)detailPrint.addEventListener("click",async()=>{if(!selectedPassport)return;try{await printPassports([selectedPassport],{bind:true})}catch(e){setText($("#printResult"),e.message,"bad")}});
const filterButton=$("#passportFilterButton");if(filterButton)filterButton.addEventListener("click",()=>{$("#passportSearch").focus()});
$("#refreshOps").addEventListener("click",async()=>{try{setText($("#opsStatus"),"Refresh…");await loadBase();setText($("#opsStatus"),"Production data refreshed.","ok")}catch(e){setText($("#opsStatus"),e.message,"bad")}});
$("#selectActivePassports").addEventListener("click",()=>document.querySelectorAll(".passport-print-check:not(:disabled)").forEach(x=>x.checked=true));
$("#clearPassportSelection").addEventListener("click",()=>document.querySelectorAll(".passport-print-check").forEach(x=>x.checked=false));
$("#printSelected").addEventListener("click",async()=>{try{await printPassports(selectedPassports(),{bind:true})}catch(e){setText($("#printResult"),e.message,"bad")}});
$("#carrierItem").addEventListener("change",()=>{syncCarrierForm();loadCarrierPanel()});
$("#carrierKind").addEventListener("change",syncCarrierForm);
$("#bindCarrier").addEventListener("click",bindCarrier);
$("#refreshCarriers").addEventListener("click",loadCarrierPanel);
$("#savedMappingSelect").addEventListener("change",e=>selectMappingProfile(e.target.value));
$("#loadMappingProfile").addEventListener("click",applyMappingProfile);
$("#saveMappingProfile").addEventListener("click",saveCurrentMappingProfile);
$("#deleteMappingProfile").addEventListener("click",deleteCurrentMappingProfile);
$("#csvFile").addEventListener("change",async e=>{try{await loadCsvFile(e.target.files?.[0])}catch(err){setText($("#csvResult"),err.message,"bad")}});
$("#xlsxFile").addEventListener("change",async e=>{try{await loadXlsxFile(e.target.files?.[0])}catch(err){setText($("#csvResult"),err.message,"bad")}});
$("#xlsxSheet").addEventListener("change",async e=>{try{await switchXlsxSheet(e.target.value)}catch(err){setText($("#csvResult"),err.message,"bad")}});
$("#stageImport").addEventListener("click",stageImport);
$("#validateImport").addEventListener("click",validateImport);
$("#commitImport").addEventListener("click",commitImport);
init().catch(e=>{document.body.dataset.manufacturerOpsReady="false";setText($("#opsStatus"),e.message,"bad")});
})();