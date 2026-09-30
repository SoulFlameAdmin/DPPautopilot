const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
function getPath(obj,path){let cur=obj;for(const p of path.split('.')){if(cur==null||typeof cur!=='object'||!(p in cur))return undefined;cur=cur[p]}return cur}
function display(value){if(value===undefined||value===null)return '—';if(typeof value==='object')return JSON.stringify(value,null,2);return String(value)}
(async()=>{
  try{
    const [cr,sr]=await Promise.all([fetch('/data/dpp-field-catalog.json',{cache:'no-store'}),fetch('/data/sample-battery.json',{cache:'no-store'})]);
    if(!cr.ok||!sr.ok)throw new Error('catalog/sample load failed');
    const catalog=await cr.json();const fixture=await sr.json();
    const requested=new URLSearchParams(location.search).get('id')||'';
    const match=/^urn:dpp:pilot:bg:battery:SFBG-ESS-100-DEMO:(\d{6})$/.exec(requested);
    const serial=match?Number(match[1]):0;
    if(!match||serial<1||serial>10){hero.innerHTML=`<div class="empty" data-passport-not-found="true">Pilot passport not found for identifier: ${esc(requested)}</div>`;document.body.dataset.passportReady='false';document.body.dataset.restrictedLeak='false';return}
    fixture.model.identification.category='industrial';fixture.model.identification.model_id='SFBG-ESS-100-DEMO';
    hero.innerHTML=`<div class="badge">PUBLIC PASSPORT · SYNTHETIC BG PILOT</div><h2>${esc(fixture.model.identification.manufacturer.name)} · ${esc(fixture.model.identification.model_id)}</h2><div class="uid" data-public-uid>${esc(requested)}</div><div class="notice">Synthetic UAT only. Public/public_identifier fields are rendered; restricted and authority-only fields are excluded.</div>`;
    const rendered=[];
    for(const f of catalog.fields){
      if(!['public','public_identifier'].includes(f.access))continue;
      let value;
      if(f.path.startsWith('model.')) value=getPath(fixture,f.path);
      else if(f.path==='item.unique_identifier') value=requested;
      else continue;
      if(value===undefined)continue;
      rendered.push({field:f,value});
    }
    publicFields.innerHTML=rendered.map(({field,value})=>`<article class="card" data-public-field="${esc(field.path)}" data-access="${esc(field.access)}"><div class="label">${esc(field.apiTarget)}</div><div class="value">${esc(display(value))}</div><div class="path">${esc(field.path)}</div><span class="access">${esc(field.access)}</span></article>`).join('');
    const restrictedMarkers=[fixture.model.restricted_composition?.cathode,fixture.model.safety_measures?.transport,fixture.model.compliance_test_reports?.[0]?.document_ref].filter(Boolean).map(String);
    const visible=publicFields.textContent+' '+hero.textContent;
    const leak=restrictedMarkers.some(marker=>marker&&visible.includes(marker));
    document.body.dataset.passportReady='true';document.body.dataset.restrictedLeak=String(leak);document.body.dataset.publicFieldCount=String(rendered.length);document.body.dataset.passportId=requested;
  }catch(e){hero.innerHTML=`<div class="error">${esc(e.message)}</div>`;document.body.dataset.passportReady='false';document.body.dataset.restrictedLeak='unknown'}
})();
