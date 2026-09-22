const u02=window.DPPAsyncState;
let fields=[];let fixture=null;let item=null;const allowedStatuses=['original','repurposed','re-used','remanufactured','waste'];
const $=id=>document.getElementById(id);
function esc(v){return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]))}
function getPath(obj,path){let cur=obj;for(const p of path.split('.')){if(cur==null||typeof cur!=='object'||!(p in cur))return undefined;cur=cur[p]}return cur}
function fieldId(f){const rel=f.path.replace(/^item\./,'');return 'f_'+rel.replace(/[^a-z0-9]+/gi,'_')}function inputFor(f){const rel=f.path.replace(/^item\./,'');const id=fieldId(f);const common=`id="${id}" data-path="${esc(rel)}" data-type="${esc(f.type)}" data-required="true" aria-describedby="${id}_error" aria-invalid="false"`;if(rel==='lifecycle_status')return `<select ${common}>${allowedStatuses.map(v=>`<option value="${v}">${v}</option>`).join('')}</select>`;if(f.type==='object'||f.type==='array'||f.type==='document_ref_array')return `<textarea ${common}></textarea>`;if(f.type==='number'||f.type==='integer')return `<input ${common} type="number" step="any" />`;return `<input ${common} type="text" />`}
function render(){itemForm.insertAdjacentHTML('beforeend',fields.map(f=>{const id=fieldId(f);return `<div class="field ${['object','array','document_ref_array'].includes(f.type)?'full':''}" data-field="${esc(f.path)}"><label for="${id}">${esc(f.path)}</label><div class="meta"><span class="pill">${esc(f.type)}</span><span class="pill">${esc(f.access)}</span><span class="pill req">required</span></div>${inputFor(f)}<div id="${id}_error" class="error" data-error-for="${esc(f.path)}" aria-live="polite"></div></div>`}).join(''));document.body.dataset.itemReady='true';result.textContent=`Schema loaded: ${fields.length} item field groups`;}
function setValue(el,f,value){if(value===undefined||value===null){el.value='';return}if(['object','array','document_ref_array'].includes(f.type))el.value=JSON.stringify(value,null,2);else el.value=String(value)}
function loadSampleValues(){item=fixture.items[0];modelLink.value=fixture.model.identification.model_id;for(const f of fields){const rel=f.path.replace(/^item\./,'');const el=document.querySelector(`[data-path="${CSS.escape(rel)}"]`);setValue(el,f,getPath(item,rel))}result.className='result';result.textContent='Synthetic item #1 loaded.'}
function validate(){let errors=0;const expectedModel=fixture.model.identification.model_id;let message=modelLink.value===expectedModel?'':'Item must link to the loaded battery model';document.querySelector('[data-error-for="model_link"]').textContent=message;modelLink.setAttribute('aria-invalid',message?'true':'false');if(message)errors++;
 for(const f of fields){const rel=f.path.replace(/^item\./,'');const el=document.querySelector(`[data-path="${CSS.escape(rel)}"]`);const before=el.value;const raw=el.value.trim();let msg='';if(!raw)msg='Required field';else if(rel==='unique_identifier'&&!raw.startsWith(`urn:dpp:demo:battery:${expectedModel}:`))msg='Identifier must be a demo URN linked to this model';else if(rel==='lifecycle_status'&&!allowedStatuses.includes(raw))msg='Invalid lifecycle status';else if(f.type==='integer'&&!Number.isInteger(Number(raw)))msg='Must be an integer';else if(['object','array','document_ref_array'].includes(f.type)){try{const v=JSON.parse(raw);if(f.type==='object'&&(typeof v!=='object'||Array.isArray(v)||v===null))msg='Must be a JSON object';if((f.type==='array'||f.type==='document_ref_array')&&!Array.isArray(v))msg='Must be a JSON array'}catch{msg='Invalid JSON'}}document.querySelector(`[data-error-for="${CSS.escape(f.path)}"]`).textContent=msg;el.setAttribute('aria-invalid',msg?'true':'false');if(el.value!==before)document.body.dataset.inputPreserved='false';if(msg)errors++}
 const ok=errors===0;if(!document.body.dataset.inputPreserved)document.body.dataset.inputPreserved='true';document.body.dataset.itemValid=String(ok);document.body.dataset.errorCount=String(errors);document.body.dataset.modelLinked=String(modelLink.value===expectedModel);result.className='result '+(ok?'ok':'bad');result.textContent=ok?`VALID · model linked + ${fields.length} item groups checked`:`INVALID · ${errors} field error(s)`;return ok}
loadSample.addEventListener('click',loadSampleValues);validateButton.addEventListener('click',validate);
u02.set('loading',result,'Зареждане…');
(async()=>{
  if(u02.gate(result,{
    loading:'Зареждане на item schema…',
    empty:'Няма item schema данни.',
    error:'Item schema could not be loaded.'
  })) return;
  const [c,s]=await Promise.all([
    fetch('/data/dpp-field-catalog.json',{cache:'no-store'}),
    fetch('/data/sample-battery.json',{cache:'no-store'})
  ]);
  if(!c.ok||!s.ok)throw new Error('schema/sample load failed');
  const catalog=await c.json();
  fixture=await s.json();
  fields=catalog.fields.filter(f=>f.path.startsWith('item.'));
  if(!fields.length){
    document.body.dataset.itemReady='false';
    u02.set('empty',result,'Няма item schema данни.');
    return;
  }
  render();
  u02.set('success',result);
  const q=new URLSearchParams(location.search);
  if(q.get('sample')==='1'||q.get('invalid')==='1')loadSampleValues();
  if(q.get('invalid')==='1')document.querySelector('[data-path="unique_identifier"]').value='BAD-ID';
  if(q.get('sample')==='1'||q.get('invalid')==='1')validate();
})().catch(e=>{
  result.className='result bad';
  document.body.dataset.itemValid='false';
  u02.set('error',result,e.message);
});
