'use strict';

const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'
}[ch]));

function identifierFromLocation(){
  const q=new URLSearchParams(location.search);
  return (q.get('identifier')||q.get('id')||'').trim();
}

function flatten(value,prefix='',out=[]){
  if(out.length>=96) return out;
  if(value===null || value===undefined){
    out.push([prefix,'—']);
    return out;
  }
  if(Array.isArray(value)){
    out.push([prefix,JSON.stringify(value,null,2)]);
    return out;
  }
  if(typeof value==='object'){
    const entries=Object.entries(value);
    if(entries.length===0) out.push([prefix,'{}']);
    for(const [key,child] of entries){
      flatten(child,prefix ? prefix+'.'+key : key,out);
      if(out.length>=96) break;
    }
    return out;
  }
  out.push([prefix,String(value)]);
  return out;
}

function heroTitle(payload,identifier){
  return payload?.title ||
    payload?.model?.identification?.model_name ||
    payload?.model?.identification?.model_id ||
    payload?.battery_id ||
    identifier;
}

(async()=>{
  const identifier=identifierFromLocation();
  if(!identifier || identifier.length>300){
    hero.innerHTML='<div class="error">Липсва валиден DPP identifier.</div>';
    return;
  }

  qrLink.href='/qr?identifier='+encodeURIComponent(identifier);

  try{
    const response=await fetch('/api/passport?identifier='+encodeURIComponent(identifier),{cache:'no-store'});
    let body=null;
    try{body=await response.json();}catch{}
    if(!response.ok){
      const code=body?.error?.code||('HTTP_'+response.status);
      throw new Error(code==='PASSPORT_NOT_FOUND' ? 'Public passport not found or not active.' : (body?.error?.message||code));
    }

    const passport=body?.data;
    if(!passport || passport.status!=='active' || !passport.public_payload){
      throw new Error('Public passport is not active.');
    }

    hero.innerHTML=
      '<div class="badge">ACTIVE · PUBLIC PASSPORT</div>'+
      '<h2>'+esc(heroTitle(passport.public_payload,identifier))+'</h2>'+
      '<div class="uid" data-public-uid>'+esc(identifier)+'</div>'+
      '<div class="notice">Passport ID: '+esc(passport.passport_id)+' · Updated: '+esc(passport.updated_at)+'</div>';

    const rows=flatten(passport.public_payload);
    publicFields.innerHTML=rows.map(([path,value])=>
      '<article class="card" data-public-field="'+esc(path)+'">'+
        '<div class="label">'+esc(path)+'</div>'+
        '<div class="value">'+esc(value)+'</div>'+
        '<span class="access">public</span>'+
      '</article>'
    ).join('');

    document.body.dataset.passportReady='true';
    document.body.dataset.passportIdentifier=identifier;
    document.body.dataset.publicFieldCount=String(rows.length);
  }catch(error){
    hero.innerHTML='<div class="error">'+esc(error.message||'Public passport could not be loaded.')+'</div>';
    document.body.dataset.passportReady='false';
  }
})();
