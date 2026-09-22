const getPath=(obj,path)=>{let cur=obj;for(const p of path.split('.')){if(cur==null||typeof cur!=='object'||!(p in cur))return undefined;cur=cur[p]}return cur};
const present=v=>v!==undefined&&v!==null&&(!(typeof v==='string')||v.trim()!=='');
const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
(async()=>{
 try{
  const [cr,sr]=await Promise.all([fetch('/data/dpp-field-catalog.json',{cache:'no-store'}),fetch('/data/sample-battery.json',{cache:'no-store'})]);
  if(!cr.ok||!sr.ok) throw new Error('catalog/sample load failed');
  const catalog=await cr.json(), fixture=await sr.json(), item=fixture.items[0];
  if(new URLSearchParams(location.search).get('missing')==='manufacturerContact') delete fixture.model.identification.manufacturer.contact;
  const req=catalog.fields.filter(f=>f.required===true), missing=[];
  for(const f of req){
   const value=f.path.startsWith('model.')?getPath(fixture,f.path):f.path.startsWith('item.')?getPath(item,f.path.slice(5)):undefined;
   if(!present(value)) missing.push(f);
  }
  const done=req.length-missing.length, score=req.length?Math.round((done/req.length)*1000)/10:100;
  summary.innerHTML=`<div class="score ${score===100?'ok':'warn'}" data-score-text>${score}%</div><div>${done} / ${req.length} required fields present</div>`;
  fill.className='fill pct10-'+Math.max(0,Math.min(1000,Math.round(score*10)));
  warnings.innerHTML=missing.length===0?'<h2 class="ok">No required fields missing</h2><p class="muted">Synthetic fixture satisfies the current required catalog contract.</p>':'<h2 class="warn">Action required</h2>'+missing.map(f=>`<article class="warning" data-missing-field="${esc(f.path)}"><div class="path">${esc(f.path)}</div><div>${esc(f.source)}</div><div class="action">Complete: ${esc(f.uiTarget)}</div></article>`).join('');
  document.body.dataset.completenessReady='true';document.body.dataset.score=String(score);document.body.dataset.missingCount=String(missing.length);
 }catch(e){summary.textContent=e.message;document.body.dataset.completenessReady='false'}
})();
