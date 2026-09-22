const u02=window.DPPAsyncState;
const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
function getPath(obj,path){let cur=obj;for(const p of path.split('.')){if(cur==null||typeof cur!=='object'||!(p in cur))return undefined;cur=cur[p]}return cur}
function display(value){if(value===undefined||value===null)return '—';if(typeof value==='object')return JSON.stringify(value,null,2);return String(value)}
u02.set('loading',hero,'Зареждане…');
(async()=>{
  try{
    if(u02.gate(hero,{
      loading:'Зареждане на public passport…',
      empty:'Няма public passport за показване.',
      error:'Public passport could not be loaded.'
    })) return;
    const [cr,sr]=await Promise.all([fetch('/data/dpp-field-catalog.json',{cache:'no-store'}),fetch('/data/sample-battery.json',{cache:'no-store'})]);
    if(!cr.ok||!sr.ok)throw new Error('catalog/sample load failed');
    const catalog=await cr.json();const fixture=await sr.json();
    const requested=new URLSearchParams(location.search).get('id')||fixture.items[0].unique_identifier;
    const item=fixture.items.find(x=>x.unique_identifier===requested);
    if(!item){hero.innerHTML=`<div class="empty" data-passport-not-found="true">Passport not found for identifier: ${esc(requested)}</div>`;document.body.dataset.passportReady='false';document.body.dataset.restrictedLeak='false';u02.set('empty',hero);return}
    hero.innerHTML=`<div class="badge">PUBLIC PASSPORT · SYNTHETIC DEMO</div><h2>${esc(fixture.model.identification.manufacturer.name)} · ${esc(fixture.model.identification.model_id)}</h2><div class="uid" data-public-uid>${esc(item.unique_identifier)}</div><div class="notice">Only fields classified as public/public_identifier are rendered. Restricted and authority-only fields are intentionally excluded.</div>`;
    const rendered=[];
    for(const f of catalog.fields){
      if(!['public','public_identifier'].includes(f.access))continue;
      let value;
      if(f.path.startsWith('model.')) value=getPath(fixture,f.path);
      else if(f.path==='item.unique_identifier') value=item.unique_identifier;
      else continue;
      if(value===undefined)continue;
      rendered.push({field:f,value});
    }
    publicFields.innerHTML=rendered.map(({field,value})=>`<article class="card" data-public-field="${esc(field.path)}" data-access="${esc(field.access)}"><div class="label">${esc(field.apiTarget)}</div><div class="value">${esc(display(value))}</div><div class="path">${esc(field.path)}</div><span class="access">${esc(field.access)}</span></article>`).join('');
    const restrictedMarkers=[fixture.model.restricted_composition?.cathode,fixture.model.safety_measures?.transport,fixture.model.compliance_test_reports?.[0]?.document_ref].filter(v=>v!==undefined).map(String);
    const visible=publicFields.textContent+' '+hero.textContent;
    const leak=restrictedMarkers.some(marker=>marker && visible.includes(marker));
    document.body.dataset.passportReady='true';document.body.dataset.restrictedLeak=String(leak);document.body.dataset.publicFieldCount=String(rendered.length);document.body.dataset.passportId=item.unique_identifier;u02.set('success',hero);
  }catch(e){hero.innerHTML=`<div class="error">${esc(e.message)}</div>`;document.body.dataset.passportReady='false';document.body.dataset.restrictedLeak='unknown';u02.set('error',hero)}
})();
