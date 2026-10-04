(()=>{"use strict";
const $=s=>document.querySelector(s);
const STORAGE="dpp_company_session_v1";
const PROJECT_URL="https://frhletkiuupgksmgxoxc.supabase.co";
const MAX_ROWS=1000;
const FIELD_OPTIONS=[
  ["","— Ignore —"],
  ["model.identification.manufacturer.name","Manufacturer name"],
  ["model.identification.model_id","Model ID"],
  ["model.identification.category","Category"],
  ["model.rated_capacity_ah","Rated capacity (Ah)"],
  ["model.composition.chemistry","Chemistry"],
  ["item.unique_identifier","Unique Battery ID"],
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
  battery_id:"item.unique_identifier",
  serial:"item.unique_identifier",
  lifecycle_status:"item.lifecycle_status",
  state_of_health_percent:"item.state_of_health.percent"
};
let cfg=null,session=null,activeOrg=null,state={headers:[],rows:[],mapping:{},importId:null};

function result(node,message,kind=""){node.textContent=message;node.className="result"+(kind?" "+kind:"")}
function readSession(){try{const v=JSON.parse(sessionStorage.getItem(STORAGE)||"null");if(v?.access_token){session=v;return true}}catch{}session=null;return false}
function saveSession(v){if(v?.access_token){session={access_token:v.access_token,refresh_token:v.refresh_token||session?.refresh_token||"",expires_in:Number(v.expires_in)||3600};sessionStorage.setItem(STORAGE,JSON.stringify(session))}else{session=null;sessionStorage.removeItem(STORAGE)}}
async function authCall(path,body){
  const r=await fetch(cfg.supabaseUrl+path,{method:"POST",headers:{apikey:cfg.publishableKey,"Content-Type":"application/json",Accept:"application/json"},body:JSON.stringify(body)});
  let d={};try{d=await r.json()}catch{}if(!r.ok)throw new Error(d.message||d.error_description||d.error||("HTTP "+r.status));return d;
}
async function refreshSession(){if(!session?.refresh_token)return false;try{saveSession(await authCall("/auth/v1/token?grant_type=refresh_token",{refresh_token:session.refresh_token}));return true}catch{return false}}
async function api(path,{method="GET",body,retry=true}={}){
  if(!session?.access_token)throw new Error("Login required.");
  const r=await fetch(path,{method,headers:{Authorization:"Bearer "+session.access_token,"Content-Type":"application/json",Accept:"application/json"},body:body?JSON.stringify(body):undefined,cache:"no-store"});
  let d={};try{d=await r.json()}catch{}
  if(r.status===401&&retry&&await refreshSession())return api(path,{method,body,retry:false});
  if(!r.ok)throw new Error(d?.error?.message||d?.error?.code||("HTTP "+r.status));return d;
}
function canWrite(){return !!activeOrg&&["owner","admin","editor"].includes(activeOrg.role)}
function normalizeHeader(v){return String(v||"").trim().toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_+|_+$/g,"")}
function parseCSV(text){
  const matrix=[];let row=[],cell="",quoted=false;
  for(let i=0;i<text.length;i++){
    const ch=text[i];
    if(ch==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++}else quoted=!quoted}
    else if(ch===","&&!quoted){row.push(cell);cell=""}
    else if((ch==="\n"||ch==="\r")&&!quoted){if(ch==="\r"&&text[i+1]==="\n")i++;row.push(cell);cell="";if(row.some(v=>String(v).trim()!==""))matrix.push(row);row=[]}
    else cell+=ch;
  }
  if(cell!==""||row.length){row.push(cell);if(row.some(v=>String(v).trim()!==""))matrix.push(row)}
  return matrixToRows(matrix);
}
function matrixToRows(matrix){
  if(!Array.isArray(matrix)||matrix.length<2)throw new Error("Файлът трябва да има header и поне един data row.");
  const headers=matrix[0].map(v=>String(v??"").trim());
  if(headers.some(v=>!v))throw new Error("Има празно име на колона.");
  if(new Set(headers).size!==headers.length)throw new Error("Има дублирани имена на колони.");
  const rows=matrix.slice(1).filter(r=>r.some(v=>String(v??"").trim()!=="")).map(r=>headers.map((_,i)=>r[i]??""));
  if(rows.length<1)throw new Error("Няма data rows.");
  if(rows.length>MAX_ROWS)throw new Error("Максимумът е "+MAX_ROWS+" реда на batch.");
  return {headers,rows};
}
function findEocd(bytes){
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  for(let i=bytes.byteLength-22;i>=Math.max(0,bytes.byteLength-65557);i--){
    if(view.getUint32(i,true)===0x06054b50)return i;
  }
  throw new Error("XLSX ZIP directory not found.");
}
function zipEntries(bytes){
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),eocd=findEocd(bytes);
  const total=view.getUint16(eocd+10,true),dirOffset=view.getUint32(eocd+16,true),entries=new Map();
  let p=dirOffset;
  for(let n=0;n<total;n++){
    if(view.getUint32(p,true)!==0x02014b50)throw new Error("Invalid XLSX ZIP directory.");
    const method=view.getUint16(p+10,true),compressedSize=view.getUint32(p+20,true);
    const fileNameLength=view.getUint16(p+28,true),extraLength=view.getUint16(p+30,true),commentLength=view.getUint16(p+32,true),localOffset=view.getUint32(p+42,true);
    const name=new TextDecoder().decode(bytes.subarray(p+46,p+46+fileNameLength));
    entries.set(name,{method,compressedSize,localOffset});
    p+=46+fileNameLength+extraLength+commentLength;
  }
  return entries;
}
async function zipText(bytes,entry){
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),p=entry.localOffset;
  if(view.getUint32(p,true)!==0x04034b50)throw new Error("Invalid XLSX ZIP entry.");
  const nameLen=view.getUint16(p+26,true),extraLen=view.getUint16(p+28,true),start=p+30+nameLen+extraLen;
  const compressed=bytes.subarray(start,start+entry.compressedSize);
  let raw;
  if(entry.method===0)raw=compressed;
  else if(entry.method===8){
    if(typeof DecompressionStream!=="function")throw new Error("Този browser няма XLSX decompression support. Използвай CSV.");
    const stream=new Blob([compressed]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    raw=new Uint8Array(await new Response(stream).arrayBuffer());
  }else throw new Error("Unsupported XLSX compression method.");
  return new TextDecoder().decode(raw);
}
function xml(text){
  const doc=new DOMParser().parseFromString(text,"application/xml");
  if(doc.querySelector("parsererror"))throw new Error("Invalid XLSX XML.");
  return doc;
}
function colIndex(ref){
  const m=/^([A-Z]+)\d+$/i.exec(ref||"");if(!m)return 0;
  let x=0;for(const ch of m[1].toUpperCase())x=x*26+(ch.charCodeAt(0)-64);return x-1;
}
async function parseXLSX(buffer){
  const bytes=new Uint8Array(buffer),entries=zipEntries(bytes);
  const sheetName=[...entries.keys()].filter(n=>/^xl\/worksheets\/sheet\d+\.xml$/i.test(n)).sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}))[0];
  if(!sheetName)throw new Error("XLSX worksheet not found.");
  let shared=[];
  if(entries.has("xl/sharedStrings.xml")){
    const sharedDoc=xml(await zipText(bytes,entries.get("xl/sharedStrings.xml")));
    shared=[...sharedDoc.getElementsByTagName("si")].map(si=>[...si.getElementsByTagName("t")].map(t=>t.textContent||"").join(""));
  }
  const sheetDoc=xml(await zipText(bytes,entries.get(sheetName))),matrix=[];
  for(const rowNode of [...sheetDoc.getElementsByTagName("row")]){
    const row=[];
    for(const cellNode of [...rowNode.getElementsByTagName("c")]){
      const idx=colIndex(cellNode.getAttribute("r")),type=cellNode.getAttribute("t")||"n";
      let value="";
      if(type==="inlineStr")value=[...cellNode.getElementsByTagName("t")].map(t=>t.textContent||"").join("");
      else{
        const v=cellNode.getElementsByTagName("v")[0]?.textContent??"";
        value=type==="s"?(shared[Number(v)]??""):type==="b"?(v==="1"?"TRUE":"FALSE"):v;
      }
      row[idx]=value;
    }
    matrix.push(row.map(v=>v??""));
  }
  return matrixToRows(matrix);
}
function setPath(root,path,value){
  const parts=path.split(".");let node=root;
  for(let i=0;i<parts.length-1;i++){const k=parts[i];if(!node[k]||typeof node[k]!=="object"||Array.isArray(node[k]))node[k]={};node=node[k]}
  node[parts[parts.length-1]]=value;
}
function mappedObject(row){
  const root={model:{identification:{category:"light_means_of_transport"}},item:{lifecycle_status:"original"}};
  state.headers.forEach((h,i)=>{const path=state.mapping[h];if(path&&String(row[i]??"").trim()!=="")setPath(root,path,String(row[i]).trim())});
  return root;
}
function normalizeRows(){
  return state.rows.map(row=>{
    const root=mappedObject(row),model=root.model||{},item=root.item||{},id=model.identification||{},manufacturer=id.manufacturer||{};
    return {
      normalized_model:{
        model_identifier:String(id.model_id||"").trim(),
        manufacturer_name:String(manufacturer.name||"").trim(),
        category:String(id.category||"light_means_of_transport").trim(),
        canonical_data:model
      },
      normalized_item:{
        unique_identifier:String(item.unique_identifier||"").trim(),
        lifecycle_status:String(item.lifecycle_status||"original").trim(),
        canonical_data:item
      },
      validation_errors:[]
    };
  });
}
function renderMapping(){
  const host=$("#mappingRows");host.replaceChildren();
  for(const h of state.headers){
    const row=document.createElement("div");row.className="mapping";
    const code=document.createElement("code");code.textContent=h;
    const select=document.createElement("select");select.dataset.column=h;select.setAttribute("aria-label","Map "+h);
    for(const [v,l] of FIELD_OPTIONS){const o=document.createElement("option");o.value=v;o.textContent=l;o.selected=state.mapping[h]===v;select.append(o)}
    select.addEventListener("change",()=>{state.mapping[h]=select.value;updateMappingState()});
    row.append(code,select);host.append(row);
  }
  updateMappingState();
}
function updateMappingState(){
  const count=Object.values(state.mapping).filter(Boolean).length;$("#mappingState").textContent=count+" mapped";
}
function renderPreview(){
  const head=$("#previewHead"),body=$("#previewBody");head.replaceChildren();body.replaceChildren();
  const tr=document.createElement("tr");
  for(const h of state.headers){const th=document.createElement("th");th.textContent=h;tr.append(th)}head.append(tr);
  for(const row of state.rows.slice(0,8)){const rr=document.createElement("tr");for(const v of row){const td=document.createElement("td");td.textContent=String(v??"");rr.append(td)}body.append(rr)}
  $("#rowCount").textContent=state.rows.length+" rows";
}
function clearValidation(){
  state.importId=null;$("#errorCard").hidden=true;$("#commitCard").hidden=true;$("#errorRows").replaceChildren();
}
async function loadFile(file){
  clearValidation();result($("#fileResult"),"Парсване на "+file.name+"…");document.body.dataset.importFile="loading";
  const ext=file.name.toLowerCase().split(".").pop();let parsed;
  if(ext==="csv")parsed=parseCSV(await file.text());
  else if(ext==="xlsx")parsed=await parseXLSX(await file.arrayBuffer());
  else throw new Error("Поддържат се .csv и .xlsx.");
  state.headers=parsed.headers;state.rows=parsed.rows;state.mapping=Object.fromEntries(parsed.headers.map(h=>[h,DEFAULT_MAP[normalizeHeader(h)]||""]));
  renderMapping();renderPreview();$("#mappingCard").hidden=false;$("#previewCard").hidden=false;
  $("#fileState").textContent=ext.toUpperCase()+" · "+parsed.rows.length;$("#fileState").className="state ok";
  result($("#fileResult"),"Заредено локално: "+file.name+" · "+parsed.rows.length+" rows. Данните още не са записани.","ok");
  document.body.dataset.importFile=ext;
}
function renderErrors(report){
  const host=$("#errorRows");host.replaceChildren();const rows=report.rows||[];
  $("#errorState").textContent=(report.error_count||0)+" errors";
  for(const r of rows){
    const article=document.createElement("article");article.className="error-row";
    const strong=document.createElement("strong");strong.textContent="Row "+r.row_number+" · "+(r.unique_identifier||r.model_identifier||"unknown");
    article.append(strong);
    for(const msg of r.validation_errors||[]){const span=document.createElement("span");span.textContent=msg;article.append(span)}
    host.append(article);
  }
  if(!rows.length){const e=document.createElement("div");e.className="result ok";e.textContent="Няма row-level validation errors.";host.append(e)}
}
async function stageAndValidate(){
  if(!canWrite())return result($("#importResult"),"Тази роля няма write достъп.","bad");
  const rows=normalizeRows();
  if(!rows.length)return;
  $("#stageImport").disabled=true;clearValidation();result($("#importResult"),"Staging "+rows.length+" rows към production backend…");
  try{
    const staged=(await api("/api/imports",{method:"POST",body:{rows}})).data;
    state.importId=staged.import_id;
    const validated=(await api("/api/imports",{method:"PATCH",body:{id:state.importId,action:"validate"}})).data;
    if(validated.status==="invalid"){
      const report=(await api("/api/imports?id="+encodeURIComponent(state.importId)+"&detail=errors")).data;
      renderErrors(report);$("#errorCard").hidden=false;$("#commitCard").hidden=true;
      result($("#importResult"),"Validation failed: "+validated.error_count+" errors. Виж row-level report.","bad");
    }else{
      $("#errorCard").hidden=true;$("#commitCard").hidden=false;
      result($("#importResult"),"Server validation passed: "+validated.row_count+" rows, 0 errors.","ok");
      result($("#commitResult"),"Import "+state.importId+" е VALIDATED и готов за atomic commit.","ok");
    }
  }catch(e){result($("#importResult"),e.message,"bad")}
  finally{$("#stageImport").disabled=!canWrite()}
}
async function commit(){
  if(!canWrite()||!state.importId)return;
  $("#commitImport").disabled=true;result($("#commitResult"),"Atomic commit…");
  try{
    const data=(await api("/api/imports",{method:"PATCH",body:{id:state.importId,action:"commit"}})).data;
    result($("#commitResult"),"COMMITTED: "+data.committed_rows+" battery rows. Import ID: "+data.import_id,"ok");
  }catch(e){result($("#commitResult"),e.message,"bad")}
  finally{$("#commitImport").disabled=!canWrite()}
}
async function init(){
  cfg=await fetch("/data/auth-config.json",{cache:"no-store"}).then(async r=>{if(!r.ok)throw new Error("Auth config unavailable.");return r.json()});
  if(cfg.supabaseUrl!==PROJECT_URL||!String(cfg.publishableKey||"").startsWith("sb_publishable_"))throw new Error("Invalid DPP auth configuration.");
  document.body.dataset.importReady="true";
  if(!readSession()){document.body.dataset.importAuth="missing";result($("#gateResult"),"Няма фирмена сесия. Влез през Company Access.","bad");return}
  document.body.dataset.importAuth="authenticated";
  const orgs=(await api("/api/organizations")).data||[];activeOrg=orgs.find(o=>o.active)||null;
  if(!activeOrg){document.body.dataset.importTenant="missing";result($("#gateResult"),"Няма активен tenant. Активирай фирма през Company Access.","bad");return}
  document.body.dataset.importTenant="active";$("#tenantName").textContent=activeOrg.name;$("#tenantMeta").textContent=activeOrg.slug+" · "+activeOrg.role.toUpperCase();
  if(!canWrite()){result($("#gateResult"),"Viewer има read-only достъп; batch import изисква owner/admin/editor.","bad");return}
  $("#gateCard").hidden=true;$("#workspace").hidden=false;
}
$("#fileInput").addEventListener("change",async e=>{const f=e.target.files?.[0];if(!f)return;try{await loadFile(f)}catch(err){document.body.dataset.importFile="error";result($("#fileResult"),err.message,"bad");$("#mappingCard").hidden=true;$("#previewCard").hidden=true}});
$("#stageImport").addEventListener("click",stageAndValidate);
$("#commitImport").addEventListener("click",commit);
init().catch(e=>{document.body.dataset.importReady="false";result($("#gateResult"),e.message,"bad")});
})();