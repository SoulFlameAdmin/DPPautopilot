const u02=window.DPPAsyncState;
const fieldMap={
 manufacturer_name:'model.identification.manufacturer.name',
 model_id:'model.identification.model_id',
 category:'model.identification.category',
 rated_capacity_ah:'model.rated_capacity_ah',
 chemistry:'model.composition.chemistry',
 unique_identifier:'item.unique_identifier',
 lifecycle_status:'item.lifecycle_status',
 state_of_health_percent:'item.state_of_health.percent'
};
const categories=new Set(['portable','light_means_of_transport','starting_lighting_ignition','industrial','electric_vehicle','other']);
const statuses=new Set(['original','repurposed','remanufactured','second_life','waste','retired']);
const uid=/^urn:dpp:demo:battery:[A-Za-z0-9][A-Za-z0-9._-]{0,63}:[0-9]{6,12}$/;
const model=/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
function add(list,row,column,code,message){list.push({row,column,canonicalField:fieldMap[column],code,message})}
function validate(rows,headers){
 const out=[],seen=new Set();
 rows.forEach((cells,i)=>{
   const row=i+2,obj=Object.fromEntries(headers.map((h,j)=>[h,(cells[j]??'').trim()]));
   if(!obj.manufacturer_name)add(out,row,'manufacturer_name','REQUIRED','Manufacturer name is required.');
   if(!model.test(obj.model_id))add(out,row,'model_id','MODEL_ID_FORMAT','Use letters, digits, dot, underscore or hyphen; max 64 chars.');
   if(!categories.has(obj.category))add(out,row,'category','CATEGORY_INVALID','Choose a supported battery category.');
   if(obj.rated_capacity_ah==='')add(out,row,'rated_capacity_ah','REQUIRED','Rated capacity is required.');
   else if(!Number.isFinite(Number(obj.rated_capacity_ah)))add(out,row,'rated_capacity_ah','NUMBER_INVALID','Enter a numeric Ah value.');
   else if(Number(obj.rated_capacity_ah)<=0)add(out,row,'rated_capacity_ah','NUMBER_POSITIVE','Rated capacity must be greater than zero.');
   if(!obj.chemistry)add(out,row,'chemistry','REQUIRED','Battery chemistry is required.');
   if(!uid.test(obj.unique_identifier))add(out,row,'unique_identifier','IDENTIFIER_INVALID','Use the defined synthetic demo identifier format.');
   else if(seen.has(obj.unique_identifier))add(out,row,'unique_identifier','IDENTIFIER_DUPLICATE','Unique identifier already appears in this import.');
   else seen.add(obj.unique_identifier);
   if(!statuses.has(obj.lifecycle_status))add(out,row,'lifecycle_status','STATUS_INVALID','Choose a supported lifecycle status.');
   const soh=Number(obj.state_of_health_percent);
   if(obj.state_of_health_percent===''||!Number.isFinite(soh)||soh<0||soh>100)add(out,row,'state_of_health_percent','RANGE_0_100','State of health must be between 0 and 100.');
 });
 return out;
}
u02.set('loading',summary,'Loading…');
(async()=>{try{
 if(u02.gate(summary,{
   loading:'Зареждане на validation fixture…',
   empty:'Няма import rows за валидиране.',
   error:'Import validation fixture could not be loaded.'
 })) return;
 const r=await fetch('/data/sample-import-invalid.csv',{cache:'no-store'});if(!r.ok)throw new Error('invalid fixture unavailable');
 const raw=(await r.text()).trim();
 if(!raw){
   document.body.dataset.validationReady='false';
   u02.set('empty',summary,'Няма import rows за валидиране.');
   return;
 }
 const lines=raw.split(/\r?\n/),headers=lines[0].split(',').map(x=>x.trim()),rows=lines.slice(1).map(x=>x.split(','));
 if(!rows.length){
   document.body.dataset.validationReady='false';
   u02.set('empty',summary,'Няма import rows за валидиране.');
   return;
 }
 const report=validate(rows,headers),invalidRows=new Set(report.map(x=>x.row)),validRows=rows.length-invalidRows.size;
 errors.innerHTML=report.map(e=>`<tr data-error-code="${esc(e.code)}" data-error-row="${e.row}"><td>${e.row}</td><td>${esc(e.column)}</td><td><code>${esc(e.canonicalField)}</code></td><td><code>${esc(e.code)}</code></td><td>${esc(e.message)}</td></tr>`).join('');
 summary.innerHTML=`<strong class="${report.length?'bad':'ok'}">${report.length} validation errors</strong> · ${validRows}/${rows.length} rows can proceed; invalid rows are blocked.`;
 const json=JSON.stringify({version:1,rowCount:rows.length,validRowCount:validRows,errorCount:report.length,errors:report},null,2);
 download.href='data:application/json;charset=utf-8,'+encodeURIComponent(json);
 document.body.dataset.validationReady='true';document.body.dataset.rowCount=String(rows.length);document.body.dataset.validRowCount=String(validRows);document.body.dataset.errorCount=String(report.length);document.body.dataset.downloadReady='true';
 u02.set('success',summary);
}catch(e){
 document.body.dataset.validationReady='false';
 u02.set('error',summary,e.message);
}})();
