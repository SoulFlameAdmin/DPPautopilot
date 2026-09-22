const u02=window.DPPAsyncState;
let fields=[];let sample=null;
const $=id=>document.getElementById(id);
function esc(v){return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]))}
function getPath(obj,path){let cur=obj;for(const p of path.split('.')){if(cur==null||typeof cur!=='object'||!(p in cur))return undefined;cur=cur[p]}return cur}
function fieldId(field){return 'f_'+field.path.replace(/[^a-z0-9]+/gi,'_')}function inputFor(field){const id=fieldId(field);const req=field.required===true||String(field.required).startsWith('conditional');const common=`id="${id}" data-path="${esc(field.path)}" data-type="${esc(field.type)}" aria-describedby="${id}_error" aria-invalid="false" ${req?'data-required="true"':''}`;if(field.type==='object'||field.type==='array'||field.type==='document_ref_array')return `<textarea ${common}></textarea>`;if(field.type==='number'||field.type==='integer')return `<input ${common} type="number" step="any" />`;if(field.type==='month')return `<input ${common} type="month" />`;return `<input ${common} type="text" />`}
function render(){modelForm.innerHTML=fields.map(f=>{const id=fieldId(f);return `<div class="field" data-field="${esc(f.path)}"><label for="${id}">${esc(f.path)}</label><div class="meta"><span class="pill">${esc(f.type)}</span><span class="pill">${esc(f.access)}</span>${(f.required===true||String(f.required).startsWith('conditional'))?'<span class="pill req">required</span>':''}</div>${inputFor(f)}<div id="${id}_error" class="error" data-error-for="${esc(f.path)}" aria-live="polite"></div></div>`}).join('');document.body.dataset.formReady='true';result.textContent=`Schema loaded: ${fields.length} model fields`;}
function setValue(el,field,value){if(value===undefined||value===null){el.value='';return}if(field.type==='object'||field.type==='array'||field.type==='document_ref_array')el.value=JSON.stringify(value,null,2);else el.value=String(value)}
function loadSampleValues(){for(const f of fields){const el=document.querySelector(`[data-path="${CSS.escape(f.path)}"]`);setValue(el,f,getPath(sample,f.path))}result.className='result';result.textContent='Synthetic sample model loaded.'}
function validateField(f,el){const raw=el.value.trim();const required=f.required===true||String(f.required).startsWith('conditional');if(required&&!raw)return 'Required field';if(!raw)return '';if(f.type==='number'&&Number.isNaN(Number(raw)))return 'Must be a number';if(f.type==='integer'&&(!Number.isInteger(Number(raw))))return 'Must be an integer';if(f.type==='month'&&!/^\d{4}-\d{2}$/.test(raw))return 'Use YYYY-MM';if(['object','array','document_ref_array'].includes(f.type)){try{const v=JSON.parse(raw);if(f.type==='object'&&(typeof v!=='object'||Array.isArray(v)||v===null))return 'Must be a JSON object';if((f.type==='array'||f.type==='document_ref_array')&&!Array.isArray(v))return 'Must be a JSON array'}catch{return 'Invalid JSON'}}return ''}
function validate(){let errors=0;for(const f of fields){const el=document.querySelector(`[data-path="${CSS.escape(f.path)}"]`);const before=el.value;const message=validateField(f,el);document.querySelector(`[data-error-for="${CSS.escape(f.path)}"]`).textContent=message;el.setAttribute('aria-invalid',message?'true':'false');if(el.value!==before)document.body.dataset.inputPreserved='false';if(message)errors++}const ok=errors===0;if(!document.body.dataset.inputPreserved)document.body.dataset.inputPreserved='true';document.body.dataset.formValid=String(ok);document.body.dataset.errorCount=String(errors);result.className='result '+(ok?'ok':'bad');result.textContent=ok?`VALID · ${fields.length} catalog model fields checked`:`INVALID · ${errors} field error(s)`;return ok}
loadSample.addEventListener('click',loadSampleValues);validateButton.addEventListener('click',validate);
u02.set('loading',result,'Зареждане на schema…');
(async()=>{
  if(u02.gate(result,{
    loading:'Зареждане на model schema…',
    empty:'Няма model schema данни.',
    error:'Model schema could not be loaded.'
  })) return;
  const [c,s]=await Promise.all([
    fetch('/data/dpp-field-catalog.json',{cache:'no-store'}),
    fetch('/data/sample-battery.json',{cache:'no-store'})
  ]);
  if(!c.ok||!s.ok)throw new Error('schema/sample load failed');
  const catalog=await c.json();
  sample=await s.json();
  fields=catalog.fields.filter(f=>f.path.startsWith('model.'));
  if(!fields.length){
    document.body.dataset.formReady='false';
    u02.set('empty',result,'Няма model schema данни.');
    return;
  }
  render();
  u02.set('success',result);
  const q=new URLSearchParams(location.search);
  if(q.get('sample')==='1'||q.get('invalid')==='1')loadSampleValues();
  if(q.get('invalid')==='1'){
    document.querySelector('[data-path="model.identification.manufacturer.name"]').value='';
  }
  if(q.get('sample')==='1'||q.get('invalid')==='1')validate();
})().catch(e=>{
  result.className='result bad';
  document.body.dataset.formValid='false';
  u02.set('error',result,e.message);
});
