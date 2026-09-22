const u02=window.DPPAsyncState;
const FIELD_OPTIONS=[
  ['','— Ignore —'],
  ['model.identification.manufacturer.name','Manufacturer name'],
  ['model.identification.model_id','Model ID'],
  ['model.identification.category','Category'],
  ['model.rated_capacity_ah','Rated capacity (Ah)'],
  ['model.composition.chemistry','Chemistry'],
  ['item.unique_identifier','Unique identifier'],
  ['item.lifecycle_status','Lifecycle status'],
  ['item.state_of_health.percent','State of health (%)']
];
const DEFAULT_MAP={manufacturer_name:'model.identification.manufacturer.name',model_id:'model.identification.model_id',category:'model.identification.category',rated_capacity_ah:'model.rated_capacity_ah',chemistry:'model.composition.chemistry',unique_identifier:'item.unique_identifier',lifecycle_status:'item.lifecycle_status',state_of_health_percent:'item.state_of_health.percent'};
let state={headers:[],rows:[],mapping:{}};
function escapeHtml(v){return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]))}
function parseCSV(text){
  const rows=[];let row=[],cell='',quoted=false;
  for(let i=0;i<text.length;i++){
    const ch=text[i];
    if(ch==='"'){
      if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;
    }else if(ch===','&&!quoted){row.push(cell);cell='';}
    else if((ch==='\n'||ch==='\r')&&!quoted){if(ch==='\r'&&text[i+1]==='\n')i++;row.push(cell);cell='';if(row.some(v=>v!==''))rows.push(row);row=[];}
    else cell+=ch;
  }
  if(cell!==''||row.length){row.push(cell);if(row.some(v=>v!==''))rows.push(row)}
  if(rows.length<2)throw new Error('CSV трябва да има header и поне един data row.');
  const headers=rows[0].map(v=>v.trim());
  if(headers.some(v=>!v))throw new Error('CSV има празно име на колона.');
  if(new Set(headers).size!==headers.length)throw new Error('CSV има дублирани имена на колони.');
  return {headers,rows:rows.slice(1).map(r=>headers.map((_,i)=>r[i]??''))};
}
function render(){
  const {headers,rows}=state;mappingCard.hidden=false;previewCard.hidden=false;
  mappings.innerHTML=headers.map((h,i)=>{
    const options=FIELD_OPTIONS.map(([v,l])=>`<option value="${escapeHtml(v)}" ${state.mapping[h]===v?'selected':''}>${escapeHtml(l)}</option>`).join('');
    return `<div class="mapping"><code>${escapeHtml(h)}</code><select data-column="${escapeHtml(h)}" aria-label="Map ${escapeHtml(h)}">${options}</select></div>`;
  }).join('');
  previewHead.innerHTML='<tr>'+headers.map(h=>`<th>${escapeHtml(h)}</th>`).join('')+'</tr>';
  previewBody.innerHTML=rows.slice(0,5).map(r=>'<tr>'+r.map(v=>`<td>${escapeHtml(v)}</td>`).join('')+'</tr>').join('');
  columnCount.textContent=headers.length;rowCount.textContent=rows.length;updateMapped();
  document.body.dataset.importLoaded='true';
}
function updateMapped(){mappedCount.textContent=Object.values(state.mapping).filter(Boolean).length;document.body.dataset.mappedCount=mappedCount.textContent}
async function loadText(text,label){
  try{
    const parsed=parseCSV(text);
    state.headers=parsed.headers;state.rows=parsed.rows;state.mapping=Object.fromEntries(parsed.headers.map(h=>[h,DEFAULT_MAP[h]||'']));
    render();
    loadStatus.className='status ok';
    loadStatus.textContent=`Заредено: ${label} · ${parsed.rows.length} rows`;
    u02.set('success',loadStatus);
  }catch(e){
    document.body.dataset.importLoaded='false';
    loadStatus.className='status error';
    mappingCard.hidden=true;previewCard.hidden=true;
    u02.set('error',loadStatus,e.message);
  }
}
fileInput.addEventListener('change',async e=>{
  const f=e.target.files?.[0];
  if(!f)return;
  u02.set('loading',loadStatus,`Зареждане: ${f.name}…`);
  await loadText(await f.text(),f.name);
});
loadSample.addEventListener('click',async()=>{
  try{
    u02.set('loading',loadStatus,'Зареждане на synthetic sample…');
    const r=await fetch('/data/sample-import.csv',{cache:'no-store'});
    if(!r.ok)throw new Error('sample '+r.status);
    await loadText(await r.text(),'sample-import.csv');
  }catch(e){
    document.body.dataset.importLoaded='false';
    loadStatus.className='status error';
    mappingCard.hidden=true;previewCard.hidden=true;
    u02.set('error',loadStatus,e.message);
  }
});
mappings.addEventListener('change',e=>{if(!e.target.matches('select[data-column]'))return;state.mapping[e.target.dataset.column]=e.target.value;updateMapped()});
const u02Query=new URLSearchParams(location.search);
if(u02.forced&&u02.forced!=='success'){
  u02.gate(loadStatus,{
    loading:'Зареждане на import data…',
    empty:'Няма зареден import файл.',
    error:'Import data could not be loaded.'
  });
}else if(u02Query.get('sample')==='1'||u02.forced==='success'){
  loadSample.click();
}else{
  u02.set('empty',loadStatus,'Няма зареден файл.');
}
