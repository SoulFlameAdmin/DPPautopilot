'use strict';

const PUBLIC_ACCESS=new Set(['public','public_identifier','public_identifier_or_operator_identity']);
const SECTION_DEFS=[
  {id:'identity',title:'Идентичност и произход',subtitle:'Кой е продуктът, кой стои зад него и къде е произведен.',points:[1,2,3,4,5,6,7,8,9]},
  {id:'composition',title:'Физически данни, състав и безопасност',subtitle:'Основни характеристики и публична информация за безопасност.',points:[10,11,12,13,14,15]},
  {id:'sustainability',title:'Устойчивост и материали',subtitle:'Публични sustainability данни, когато са приложими или вече публикувани.',points:[17,18,19,20,21,22,23,24]},
  {id:'performance',title:'Електрически характеристики и живот',subtitle:'Публичните моделни параметри за напрежение, мощност, ефективност и очакван живот.',points:[26,27,28,29,30,31,32,34,35,36,37,38,39]},
  {id:'compliance',title:'Маркировки, декларации и край на живота',subtitle:'Публични marking, conformity и waste-management данни.',points:[40,41,42,43]}
];
const CATEGORY_LABELS={
  light_means_of_transport:'Light Means of Transport (LMT)',
  electric_vehicle:'Electric Vehicle',
  industrial:'Industrial',
  portable:'Portable',
  starting_lighting_ignition:'SLI',
  other:'Other'
};
const LIFECYCLE_LABELS={
  retired:'Паспортът е приключил жизнения си цикъл',
  revoked:'Паспортът е отнет',
  replaced:'Паспортът е заменен'
};
const LIFECYCLE_REASON_LABELS={
  end_of_life:'Край на жизнения цикъл',
  operator_revoked:'Отнет от оператора',
  safety_or_compliance:'Безопасност или съответствие',
  incorrect_record:'Некоректен запис',
  product_replaced:'Продуктът е заменен',
  other:'Друга причина'
};

const $=selector=>document.querySelector(selector);
function identifierFromLocation(){
  const q=new URLSearchParams(location.search);
  return (q.get('identifier')||q.get('id')||'').trim();
}
function getPath(root,path){
  let cur=root;
  for(const part of String(path||'').split('.')){
    if(!part)continue;
    if(cur==null||typeof cur!=='object'||!Object.prototype.hasOwnProperty.call(cur,part))return undefined;
    cur=cur[part];
  }
  return cur;
}
function present(value){
  if(value===undefined||value===null)return false;
  if(typeof value==='string')return value.trim().length>0;
  if(Array.isArray(value))return value.length>0;
  if(typeof value==='object')return Object.keys(value).length>0;
  return true;
}
function labelize(key){
  return String(key||'')
    .replace(/_/g,' ')
    .replace(/([a-z])([A-Z])/g,'$1 $2')
    .replace(/^./,m=>m.toUpperCase());
}
function safeUrl(value){
  if(typeof value!=='string')return null;
  try{
    const u=new URL(value);
    return ['https:','http:'].includes(u.protocol)?u.href:null;
  }catch{return null}
}
function appendScalar(host,value,unit,key=''){
  if(typeof value==='boolean'){
    host.textContent=value?'Да':'Не';
    return;
  }
  if(typeof value==='number'){
    host.textContent=unit?value+' '+unit:String(value);
    return;
  }
  const text=String(value);
  const url=safeUrl(text);
  if(url){
    const a=document.createElement('a');
    a.href=url;a.target='_blank';a.rel='noopener noreferrer';a.textContent=text;
    host.append(a);return;
  }
  if(/email/i.test(key)&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)){
    const a=document.createElement('a');a.href='mailto:'+text;a.textContent=text;host.append(a);return;
  }
  host.textContent=unit?text+' '+unit:text;
}
function appendValue(host,value,unit,key=''){
  if(Array.isArray(value)){
    const ul=document.createElement('ul');ul.className='field-list';
    for(const entry of value){
      const li=document.createElement('li');
      if(entry&&typeof entry==='object'){
        const grid=document.createElement('div');grid.className='object-grid';
        for(const [k,v] of Object.entries(entry)){
          const row=document.createElement('div');row.className='object-row';
          const left=document.createElement('span');left.className='object-key';left.textContent=labelize(k);
          const right=document.createElement('span');right.className='object-value';
          if(v&&typeof v==='object')right.textContent=JSON.stringify(v);
          else appendScalar(right,v,null,k);
          row.append(left,right);grid.append(row);
        }
        li.append(grid);
      }else appendScalar(li,entry,unit,key);
      ul.append(li);
    }
    host.append(ul);return;
  }
  if(value&&typeof value==='object'){
    const grid=document.createElement('div');grid.className='object-grid';
    for(const [k,v] of Object.entries(value)){
      if(!present(v))continue;
      const row=document.createElement('div');row.className='object-row';
      const left=document.createElement('span');left.className='object-key';left.textContent=labelize(k);
      const right=document.createElement('span');right.className='object-value';
      if(Array.isArray(v)){
        right.textContent=v.map(x=>typeof x==='object'?JSON.stringify(x):String(x)).join(', ');
      }else if(v&&typeof v==='object'){
        right.textContent=JSON.stringify(v);
      }else appendScalar(right,v,null,k);
      row.append(left,right);grid.append(row);
    }
    host.append(grid);return;
  }
  appendScalar(host,value,unit,key);
}
function valueForPoint(passport,point){
  if(point.number===1)return passport.unique_identifier;
  return getPath(passport.public_payload,point.valuePath);
}
function fieldCard(point,value){
  const article=document.createElement('article');article.className='field';
  article.dataset.publicField=point.valuePath;
  article.dataset.euPoint=String(point.number);
  article.dataset.access=point.access;

  const top=document.createElement('div');top.className='field-top';
  const label=document.createElement('div');label.className='field-label';label.textContent=point.name;
  const badge=document.createElement('span');badge.className='point-badge';badge.textContent='EU #'+point.number;
  top.append(label,badge);

  const content=document.createElement('div');content.className='field-value';
  if(point.number===1)content.classList.add('mono');
  appendValue(content,value,point.unit||null,String(point.valuePath).split('.').at(-1));

  const meta=document.createElement('div');meta.className='field-meta';
  const access=document.createElement('span');access.className='meta-chip';access.textContent='public';
  const status=document.createElement('span');status.className='meta-chip';
  status.textContent=point.lmtStatusAt2027_02_18==='not_required_2027'?'published early':point.lmtStatusAt2027_02_18.replace(/_/g,' ');
  meta.append(access,status);

  article.append(top,content,meta);
  return article;
}
function renderSections(passport,matrix){
  const pointMap=new Map(matrix.points.map(p=>[p.number,p]));
  const host=$('#passportSections');host.replaceChildren();
  const nav=$('#sectionNav');nav.replaceChildren();
  let fieldCount=0,sectionCount=0;

  for(const def of SECTION_DEFS){
    const rows=[];
    for(const number of def.points){
      const point=pointMap.get(number);
      if(!point||!PUBLIC_ACCESS.has(point.access)||point.sourceOwner==='derived_duplicate')continue;
      const value=valueForPoint(passport,point);
      if(present(value))rows.push([point,value]);
    }
    if(!rows.length)continue;

    sectionCount+=1;fieldCount+=rows.length;
    const section=document.createElement('section');section.className='section';section.id='section-'+def.id;
    const head=document.createElement('div');head.className='section-head';
    const titleWrap=document.createElement('div');
    const eyebrow=document.createElement('p');eyebrow.className='eyebrow';eyebrow.textContent='PUBLIC BATTERY DATA';
    const h2=document.createElement('h2');h2.textContent=def.title;
    const sub=document.createElement('span');sub.textContent=def.subtitle;
    titleWrap.append(eyebrow,h2);head.append(titleWrap,sub);

    const grid=document.createElement('div');grid.className='field-grid';
    for(const [point,value] of rows)grid.append(fieldCard(point,value));
    section.append(head,grid);host.append(section);

    const link=document.createElement('a');link.href='#'+section.id;link.textContent=def.title;nav.append(link);
  }

  if(sectionCount===0){
    const empty=document.createElement('section');empty.className='section';
    const box=document.createElement('div');box.className='empty-section';
    box.textContent='ACTIVE записът е намерен, но в текущия public payload няма публикувани LMT полета от регулаторната матрица.';
    empty.append(box);host.append(empty);
  }

  document.body.dataset.publicFieldCount=String(fieldCount);
  document.body.dataset.publicSectionCount=String(sectionCount);
  nav.hidden=sectionCount<2;
  return {fieldCount,sectionCount};
}
function isTechnicalPilot(passport){
  return getPath(passport,'public_payload.pilot.mode')==='technical_pilot' &&
    getPath(passport,'public_payload.pilot.regulatory_compliance')===false;
}
function renderPilotSections(passport){
  const host=$('#passportSections');host.replaceChildren();
  const nav=$('#sectionNav');nav.replaceChildren();nav.hidden=true;
  const payload=passport.public_payload||{};
  const entries=Object.entries(payload).filter(([key,value])=>key!=='pilot'&&present(value));
  const section=document.createElement('section');section.className='section';section.id='section-pilot';
  const head=document.createElement('div');head.className='section-head';
  const titleWrap=document.createElement('div');
  const eyebrow=document.createElement('p');eyebrow.className='eyebrow';eyebrow.textContent='APPROVED CUSTOMER DATA';
  const h2=document.createElement('h2');h2.textContent='Technical pilot data';
  const sub=document.createElement('span');sub.textContent='Технически запис за валидиране на data flow. Не е регулаторна сертификация.';
  titleWrap.append(eyebrow,h2);head.append(titleWrap,sub);
  const grid=document.createElement('div');grid.className='field-grid';
  for(const [key,value] of entries){
    const article=document.createElement('article');article.className='field';article.dataset.publicField=key;
    const top=document.createElement('div');top.className='field-top';
    const label=document.createElement('div');label.className='field-label';label.textContent=labelize(key);
    const badge=document.createElement('span');badge.className='point-badge';badge.textContent='PILOT';
    top.append(label,badge);
    const content=document.createElement('div');content.className='field-value';appendValue(content,value,null,key);
    const meta=document.createElement('div');meta.className='field-meta';
    const access=document.createElement('span');access.className='meta-chip';access.textContent='public';
    const status=document.createElement('span');status.className='meta-chip';status.textContent='technical pilot';
    meta.append(access,status);article.append(top,content,meta);grid.append(article);
  }
  section.append(head,grid);host.append(section);
  document.body.dataset.publicFieldCount=String(entries.length);
  document.body.dataset.publicSectionCount='1';
  return {fieldCount:entries.length,sectionCount:1};
}
function formatDate(value){
  const d=new Date(value);
  if(Number.isNaN(d.getTime()))return String(value||'—');
  return new Intl.DateTimeFormat('bg-BG',{dateStyle:'medium',timeStyle:'short'}).format(d);
}
function titleFor(passport){
  const payload=passport.public_payload||{};
  const maker=getPath(payload,'model.identification.manufacturer.name');
  const model=getPath(payload,'model.identification.model_id');
  return [maker,model].filter(present).join(' · ')||'Battery Digital Product Passport';
}
function subtitleFor(passport){
  const category=getPath(passport.public_payload,'model.identification.category');
  return category?(CATEGORY_LABELS[category]||String(category)):'Individual battery public passport';
}
function renderHero(passport,identifier){
  const pilot=isTechnicalPilot(passport);
  const hero=$('#hero');hero.replaceChildren();
  const card=document.createElement('div');card.className='hero-card';
  const left=document.createElement('div');
  const eyebrow=document.createElement('p');eyebrow.className='eyebrow';eyebrow.textContent=pilot?'TECHNICAL PILOT · PUBLIC BATTERY RECORD':'ACTIVE · PUBLIC BATTERY PASSPORT';
  const h1=document.createElement('h1');h1.textContent=titleFor(passport);
  const sub=document.createElement('p');sub.className='hero-subtitle';sub.textContent=subtitleFor(passport);
  const uid=document.createElement('div');uid.className='identifier';uid.dataset.publicUid='';uid.textContent=identifier;
  const actions=document.createElement('div');actions.className='hero-actions';
  const qr=document.createElement('a');qr.className='button primary';qr.href='/qr?identifier='+encodeURIComponent(identifier);qr.textContent='Отвори QR';
  const copy=document.createElement('button');copy.className='button';copy.type='button';copy.id='copyIdentifier';copy.textContent='Копирай ID';
  copy.addEventListener('click',async()=>{
    try{await navigator.clipboard.writeText(identifier);copy.textContent='Копирано ✓';setTimeout(()=>{copy.textContent='Копирай ID'},1600)}
    catch{copy.textContent='ID: '+identifier}
  });
  actions.append(qr,copy);left.append(eyebrow,h1,sub,uid,actions);

  const right=document.createElement('div');right.className='status-stack';
  const status=document.createElement('div');status.className='status-card';
  const strong=document.createElement('strong');strong.textContent=pilot?'● TECHNICAL PILOT':'● ACTIVE';
  const small=document.createElement('small');small.textContent=pilot?'Публикуван за техническа data-flow валидация; без compliance claim.':'Публичният запис е активен.';
  status.append(strong,small);
  const updated=document.createElement('div');updated.className='status-card';
  const updatedStrong=document.createElement('strong');updatedStrong.textContent='Last updated';
  const updatedSmall=document.createElement('small');updatedSmall.textContent=formatDate(passport.updated_at);
  updated.append(updatedStrong,updatedSmall);right.append(status,updated);

  card.append(left,right);hero.append(card);
}
function renderLifecycle(passport,identifier){
  const hero=$('#hero');hero.replaceChildren();
  const card=document.createElement('div');card.className='hero-card lifecycle-hero';
  const left=document.createElement('div');
  const eyebrow=document.createElement('p');eyebrow.className='eyebrow';eyebrow.textContent='PUBLIC PASSPORT LIFECYCLE';
  const h1=document.createElement('h1');h1.textContent=LIFECYCLE_LABELS[passport.status]||'Паспортът вече не е активен';
  const sub=document.createElement('p');sub.className='hero-subtitle';
  sub.textContent='Старите продуктови данни не се публикуват след terminal transition. Показва се само минималният lifecycle запис.';
  const uid=document.createElement('div');uid.className='identifier';uid.dataset.publicUid='';uid.textContent=identifier;
  const meta=document.createElement('div');meta.className='lifecycle-meta';
  const reason=document.createElement('div');reason.className='lifecycle-meta-row';
  const reasonKey=document.createElement('span');reasonKey.textContent='Причина';
  const reasonValue=document.createElement('strong');reasonValue.textContent=LIFECYCLE_REASON_LABELS[passport.reason_code]||labelize(passport.reason_code);
  reason.append(reasonKey,reasonValue);
  const changed=document.createElement('div');changed.className='lifecycle-meta-row';
  const changedKey=document.createElement('span');changedKey.textContent='Променен';
  const changedValue=document.createElement('strong');changedValue.textContent=formatDate(passport.changed_at||passport.updated_at);
  changed.append(changedKey,changedValue);
  meta.append(reason,changed);
  left.append(eyebrow,h1,sub,uid,meta);

  const right=document.createElement('div');right.className='status-stack';
  const status=document.createElement('div');status.className='status-card terminal';
  const statusStrong=document.createElement('strong');statusStrong.textContent='● '+String(passport.status||'terminal').toUpperCase();
  const statusSmall=document.createElement('small');statusSmall.textContent='Този identifier не сочи към ACTIVE паспорт.';
  status.append(statusStrong,statusSmall);right.append(status);

  if(passport.status==='replaced'&&passport.replacement_identifier){
    const replacement=document.createElement('a');
    replacement.className='button primary replacement-link';
    replacement.href='/passport?identifier='+encodeURIComponent(passport.replacement_identifier);
    replacement.textContent='Отвори заместващия паспорт →';
    right.append(replacement);
  }

  card.append(left,right);hero.append(card);
  $('#trustStrip').hidden=true;
  $('#sectionNav').hidden=true;
  $('#passportSections').replaceChildren();
  renderTechnical(passport,identifier);
  document.body.dataset.publicFieldCount='0';
  document.body.dataset.publicSectionCount='0';
}

function renderTechnical(passport,identifier){
  $('#technicalPanel').hidden=false;
  $('#techIdentifier').textContent=identifier;
  $('#techPassportId').textContent=passport.passport_id;
  const time=$('#techUpdated');time.textContent=formatDate(passport.updated_at);time.dateTime=passport.updated_at;
}
function renderError(message,identifier=''){
  const hero=$('#hero');hero.replaceChildren();
  const card=document.createElement('div');card.className='error-card';
  const eyebrow=document.createElement('p');eyebrow.className='eyebrow';eyebrow.textContent='PUBLIC PASSPORT ERROR';
  const h1=document.createElement('h1');h1.textContent='Паспортът не може да бъде показан';
  const p=document.createElement('p');p.textContent=message;
  card.append(eyebrow,h1,p);
  if(identifier){
    const uid=document.createElement('div');uid.className='identifier';uid.textContent=identifier;card.append(uid);
  }
  hero.append(card);
  $('#trustStrip').hidden=true;$('#sectionNav').hidden=true;$('#technicalPanel').hidden=true;$('#passportSections').replaceChildren();
  document.body.dataset.passportReady='false';
  document.body.dataset.passportError='true';
}
(async()=>{
  const identifier=identifierFromLocation();
  if(!identifier||identifier.length>300){
    renderError('Липсва валиден DPP identifier.');
    return;
  }

  const qrHref='/qr?identifier='+encodeURIComponent(identifier);
  $('#qrLink').href=qrHref;$('#footerQrLink').href=qrHref;

  try{
    const carrierParam=(new URLSearchParams(location.search).get('carrier')||'').trim().toLowerCase();
    const carrier=['qr','nfc'].includes(carrierParam)?carrierParam:'';
    const basePassportUrl='/api/passport?identifier='+encodeURIComponent(identifier);
    let [passportResponse,matrixResponse]=await Promise.all([
      fetch(basePassportUrl+(carrier?'&carrier='+carrier:''),{cache:'no-store'}),
      fetch('/data/lmt-battery-71-v2.json',{cache:'no-store'})
    ]);
    let body=null;
    try{body=await passportResponse.json()}catch{}
    if(!passportResponse.ok&&carrier&&body?.error?.code==='CARRIER_NOT_BOUND'){
      passportResponse=await fetch(basePassportUrl,{cache:'no-store'});
      try{body=await passportResponse.json()}catch{body=null}
      document.body.dataset.carrierScan='unbound_fallback';
    }else if(carrier&&passportResponse.ok){
      document.body.dataset.carrierScan='recorded';
    }
    if(!passportResponse.ok){
      const code=body?.error?.code||('HTTP_'+passportResponse.status);
      if(code==='PUBLIC_PASSPORT_NOT_FOUND'||code==='PASSPORT_NOT_FOUND')throw new Error('Не е намерен ACTIVE публичен паспорт за този identifier.');
      throw new Error(body?.error?.message||code);
    }
    const passport=body?.data;
    if(passport?.kind==='lifecycle'){
      renderLifecycle(passport,identifier);
      document.body.dataset.passportReady='true';
      document.body.dataset.passportError='false';
      document.body.dataset.passportIdentifier=identifier;
      document.body.dataset.passportStatus=passport.status;
      document.body.dataset.passportLifecycle='terminal';
      document.body.dataset.restrictedLeak='false';
      return;
    }

    if(!passport||passport.kind!=='active'||passport.status!=='active'||!passport.public_payload)throw new Error('Публичният паспорт не е ACTIVE.');
    const pilot=isTechnicalPilot(passport);
    let matrix=null;
    if(!pilot){
      if(!matrixResponse.ok)throw new Error('Public field mapping is temporarily unavailable.');
      matrix=await matrixResponse.json();
    }

    renderHero(passport,identifier);
    if(pilot)renderPilotSections(passport);
    else renderSections(passport,matrix);
    renderTechnical(passport,identifier);
    $('#trustStrip').hidden=false;

    document.body.dataset.passportReady='true';
    document.body.dataset.passportError='false';
    document.body.dataset.passportIdentifier=identifier;
    document.body.dataset.passportStatus='active';
    document.body.dataset.passportLifecycle='active';
    document.body.dataset.passportPilot=isTechnicalPilot(passport)?'technical_pilot':'false';
    document.body.dataset.restrictedLeak='false';
  }catch(error){
    renderError(error?.message||'Public passport could not be loaded.',identifier);
  }
})();
