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
  const hero=$('#hero');hero.replaceChildren();
  const card=document.createElement('div');card.className='hero-card';
  const left=document.createElement('div');
  const eyebrow=document.createElement('p');eyebrow.className='eyebrow';eyebrow.textContent='ACTIVE · PUBLIC BATTERY PASSPORT';
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
  const strong=document.createElement('strong');strong.textContent='● ACTIVE';
  const small=document.createElement('small');small.textContent='Публичният запис е активен.';
  status.append(strong,small);
  const updated=document.createElement('div');updated.className='status-card';
  const updatedStrong=document.createElement('strong');updatedStrong.textContent='Last updated';
  const updatedSmall=document.createElement('small');updatedSmall.textContent=formatDate(passport.updated_at);
  updated.append(updatedStrong,updatedSmall);right.append(status,updated);

  card.append(left,right);hero.append(card);
}
function renderTechnical(passport,identifier){
  $('#technicalPanel').hidden=false;
  $('#techIdentifier').textContent=identifier;
  $('#techPassportId').textContent=passport.passport_id;
  const time=$('#techUpdated');time.textContent=formatDate(passport.updated_at);time.dateTime=passport.updated_at;
}
function renderLifecycle(passport,identifier){
  const labels={
    retired:{title:'Този паспорт е RETIRED',message:'Този DPP запис е приключен и вече не е активен за текущо използване.',tone:'retired'},
    revoked:{title:'Този паспорт е REVOKED',message:'Операторът е оттеглил този DPP запис. Публичните продуктови данни вече не се показват.',tone:'revoked'},
    replaced:{title:'Този паспорт е REPLACED',message:'Този DPP запис е заменен с друг активен паспорт.',tone:'replaced'}
  };
  const state=labels[passport.status]||labels.retired;
  const hero=$('#hero');hero.replaceChildren();
  const card=document.createElement('div');card.className='lifecycle-card '+state.tone;
  const eyebrow=document.createElement('p');eyebrow.className='eyebrow';eyebrow.textContent='PASSPORT LIFECYCLE NOTICE';
  const h1=document.createElement('h1');h1.textContent=state.title;
  const p=document.createElement('p');p.className='lifecycle-message';p.textContent=state.message;
  const uid=document.createElement('div');uid.className='identifier';uid.dataset.publicUid='';uid.textContent=identifier;
  const meta=document.createElement('div');meta.className='lifecycle-meta';
  const reason=document.createElement('span');reason.textContent='Reason code: '+String(passport.reason_code||'—').replace(/_/g,' ');
  const changed=document.createElement('span');changed.textContent='Changed: '+formatDate(passport.changed_at||passport.updated_at);
  meta.append(reason,changed);
  card.append(eyebrow,h1,p,uid,meta);

  if(passport.status==='replaced'&&passport.replacement_identifier){
    const actions=document.createElement('div');actions.className='hero-actions';
    const replacement=document.createElement('a');replacement.className='button primary';
    replacement.href='/passport?identifier='+encodeURIComponent(passport.replacement_identifier);
    replacement.textContent='Отвори заместващия паспорт →';
    actions.append(replacement);card.append(actions);
  }

  hero.append(card);
  $('#trustStrip').hidden=true;
  $('#sectionNav').hidden=true;
  $('#passportSections').replaceChildren();
  $('#qrLink').hidden=true;
  $('#footerQrLink').hidden=true;
  renderTechnical(passport,identifier);
  document.body.dataset.passportReady='true';
  document.body.dataset.passportError='false';
  document.body.dataset.passportIdentifier=identifier;
  document.body.dataset.passportStatus=passport.status;
  document.body.dataset.publicFieldCount='0';
  document.body.dataset.publicSectionCount='0';
  document.body.dataset.restrictedLeak='false';
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
    const [passportResponse,matrixResponse]=await Promise.all([
      fetch('/api/passport?identifier='+encodeURIComponent(identifier),{cache:'no-store'}),
      fetch('/data/lmt-battery-71-v2.json',{cache:'no-store'})
    ]);
    let body=null;
    try{body=await passportResponse.json()}catch{}
    if(!passportResponse.ok){
      const code=body?.error?.code||('HTTP_'+passportResponse.status);
      if(code==='PUBLIC_PASSPORT_NOT_FOUND'||code==='PASSPORT_NOT_FOUND')throw new Error('Не е намерен ACTIVE публичен паспорт за този identifier.');
      throw new Error(body?.error?.message||code);
    }
    if(!matrixResponse.ok)throw new Error('Public field mapping is temporarily unavailable.');
    const matrix=await matrixResponse.json();
    const passport=body?.data;
    if(!passport)throw new Error('Публичният DPP запис липсва.');
    if(['retired','revoked','replaced'].includes(passport.status)){
      renderLifecycle(passport,identifier);
      return;
    }
    if(passport.status!=='active'||!passport.public_payload)throw new Error('Публичният паспорт не е ACTIVE.');

    renderHero(passport,identifier);
    renderSections(passport,matrix);
    renderTechnical(passport,identifier);
    $('#trustStrip').hidden=false;

    document.body.dataset.passportReady='true';
    document.body.dataset.passportError='false';
    document.body.dataset.passportIdentifier=identifier;
    document.body.dataset.passportStatus='active';
    document.body.dataset.restrictedLeak='false';
  }catch(error){
    renderError(error?.message||'Public passport could not be loaded.',identifier);
  }
})();
