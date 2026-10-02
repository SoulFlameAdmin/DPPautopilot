'use strict';

const $=id=>document.getElementById(id);
const els={
  email:$('email'),password:$('password'),signup:$('signup'),signin:$('signin'),signout:$('signout'),
  currentUserId:$('currentUserId'),session:$('session'),
  organization:$('organization'),role:$('role'),orgName:$('orgName'),orgSlug:$('orgSlug'),
  createOrg:$('createOrg'),activateOrg:$('activateOrg'),reloadData:$('reloadData'),
  manufacturer:$('manufacturer'),modelIdentifier:$('modelIdentifier'),sku:$('sku'),serial:$('serial'),
  chemistry:$('chemistry'),capacity:$('capacity'),voltage:$('voltage'),productionDate:$('productionDate'),
  createBattery:$('createBattery'),battery:$('battery'),batteryId:$('batteryId'),publicId:$('publicId'),
  publicUrl:$('publicUrl'),qrImage:$('qrImage'),bindQr:$('bindQr'),printLabel:$('printLabel'),
  writeNfc:$('writeNfc'),verifyNfc:$('verifyNfc'),bindNfcManual:$('bindNfcManual'),
  workerUserId:$('workerUserId'),addWorker:$('addWorker'),printQr:$('printQr'),printId:$('printId'),
  printUrl:$('printUrl'),result:$('result')
};

let authConfig=null;
let accessToken=null;
let refreshToken=null;
let currentUser=null;
let organizations=[];
let items=[];

function log(message,kind=''){
  const stamp=new Date().toISOString().replace('T',' ').replace('Z',' UTC');
  els.result.className=kind;
  els.result.textContent='['+stamp+'] '+message;
}
function setBusy(button,busy,label){
  if(!button)return;
  if(busy){
    button.dataset.oldText=button.textContent;
    button.textContent=label||'Working…';
    button.disabled=true;
  }else{
    button.textContent=button.dataset.oldText||button.textContent;
    button.disabled=false;
  }
}
function setSession(data){
  accessToken=data?.access_token||null;
  refreshToken=data?.refresh_token||null;
  currentUser=data?.user||currentUser||null;
  document.body.dataset.auth=accessToken?'authenticated':'anonymous';
  els.currentUserId.value=currentUser?.id||'';
  els.session.textContent=accessToken
    ? 'Authenticated. Session is kept in memory only.'
    : currentUser?.id
      ? 'Account exists. Sign in after any required email confirmation.'
      : 'Not signed in.';
}
async function loadConfig(){
  const response=await fetch('/data/auth-config.json',{cache:'no-store'});
  if(!response.ok)throw new Error('Auth config unavailable.');
  const cfg=await response.json();
  if(!cfg.supabaseUrl||!cfg.publishableKey)throw new Error('Auth config is incomplete.');
  authConfig=cfg;
}
async function authCall(path,{method='GET',body,token}={}){
  if(!authConfig)throw new Error('Auth client is not ready.');
  const headers={apikey:authConfig.publishableKey,'Content-Type':'application/json'};
  if(token)headers.Authorization='Bearer '+token;
  const response=await fetch(authConfig.supabaseUrl+path,{
    method,headers,body:body?JSON.stringify(body):undefined
  });
  const text=await response.text();
  let data={};
  try{data=text?JSON.parse(text):{};}catch{data={};}
  if(!response.ok){
    throw new Error(data.msg||data.message||data.error_description||('Auth HTTP '+response.status));
  }
  return data;
}
async function api(path,{method='GET',body,auth=true}={}){
  const headers={'Content-Type':'application/json'};
  if(auth){
    if(!accessToken)throw new Error('Sign in first.');
    headers.Authorization='Bearer '+accessToken;
  }
  const response=await fetch(path,{
    method,headers,body:body===undefined?undefined:JSON.stringify(body),cache:'no-store'
  });
  const text=await response.text();
  let payload={};
  try{payload=text?JSON.parse(text):{};}catch{payload={};}
  if(!response.ok){
    const message=payload?.error?.message||payload?.error?.code||('HTTP '+response.status);
    throw new Error(message);
  }
  return payload.data;
}
function selectedOrganization(){
  return organizations.find(org=>org.organization_id===els.organization.value)||null;
}
function updateRole(){
  const org=selectedOrganization();
  els.role.value=org?.role||'';
}
function updateBattery(){
  const item=items.find(value=>value.id===els.battery.value)||null;
  if(!item){
    els.batteryId.value='';
    els.publicId.value='';
    els.publicUrl.value='';
    els.qrImage.removeAttribute('src');
    els.printQr.removeAttribute('src');
    els.printId.textContent='No battery selected';
    els.printUrl.textContent='';
    document.body.dataset.qr='unknown';
    return;
  }
  const url=new URL('/demo/carrier-passport.html',location.origin);
  url.searchParams.set('id',item.unique_identifier);
  els.batteryId.value=item.id;
  els.publicId.value=item.unique_identifier;
  els.publicUrl.value=url.href;
  const qrSrc='/api/qr-test?url='+encodeURIComponent(url.href);
  els.qrImage.src=qrSrc;
  els.printQr.src=qrSrc;
  els.printId.textContent=item.unique_identifier;
  els.printUrl.textContent=url.href;
  document.body.dataset.qr='ready';
}
async function loadOrganizations({activateSingle=false}={}){
  organizations=await api('/api/organizations');
  els.organization.innerHTML='';
  if(!organizations.length){
    els.organization.insertAdjacentHTML('beforeend','<option value="">No organization yet</option>');
    els.role.value='';
    return;
  }
  for(const org of organizations){
    const option=document.createElement('option');
    option.value=org.organization_id;
    option.textContent=org.name+' · '+org.role+(org.active?' · ACTIVE':'');
    els.organization.appendChild(option);
  }
  const active=organizations.find(org=>org.active);
  if(active)els.organization.value=active.organization_id;
  else if(activateSingle&&organizations.length===1){
    els.organization.value=organizations[0].organization_id;
    await activateSelectedOrganization();
    return;
  }
  updateRole();
  if(active)await loadItems();
}
async function activateSelectedOrganization(){
  const id=els.organization.value;
  if(!id)throw new Error('Select an organization first.');
  await api('/api/tenant',{method:'POST',body:{organization_id:id}});
  organizations=await api('/api/organizations');
  const active=organizations.find(org=>org.organization_id===id);
  els.role.value=active?.role||'';
  await loadItems();
  log('Organization activated. Role: '+(active?.role||'unknown'),'ok');
}
async function loadItems(selectId=null){
  items=await api('/api/items');
  els.battery.innerHTML='';
  if(!items.length){
    els.battery.insertAdjacentHTML('beforeend','<option value="">No batteries yet</option>');
    updateBattery();
    return;
  }
  for(const item of items){
    const option=document.createElement('option');
    option.value=item.id;
    option.textContent=item.unique_identifier+' · '+item.lifecycle_status;
    els.battery.appendChild(option);
  }
  if(selectId&&items.some(item=>item.id===selectId))els.battery.value=selectId;
  updateBattery();
}
function makeBatteryPublicId(){
  const d=new Date();
  const date=[
    String(d.getUTCFullYear()).slice(-2),
    String(d.getUTCMonth()+1).padStart(2,'0'),
    String(d.getUTCDate()).padStart(2,'0')
  ].join('');
  const random=(crypto.randomUUID?crypto.randomUUID():Math.random().toString(16).slice(2))
    .replace(/-/g,'').slice(0,8).toUpperCase();
  return 'BAT-'+date+'-'+random;
}
function batteryForm(){
  const fields={
    manufacturer:els.manufacturer.value.trim(),
    model:els.modelIdentifier.value.trim(),
    sku:els.sku.value.trim(),
    serial:els.serial.value.trim(),
    chemistry:els.chemistry.value.trim(),
    capacity_ah:Number(els.capacity.value),
    voltage_v:Number(els.voltage.value),
    production_date:els.productionDate.value||null
  };
  if(!fields.manufacturer||!fields.model||!fields.sku||!fields.serial||!fields.chemistry){
    throw new Error('Fill manufacturer, model, SKU, serial and chemistry.');
  }
  if(!Number.isFinite(fields.capacity_ah)||fields.capacity_ah<=0)throw new Error('Capacity must be greater than zero.');
  if(!Number.isFinite(fields.voltage_v)||fields.voltage_v<=0)throw new Error('Voltage must be greater than zero.');
  return fields;
}
async function findOrCreateModel(fields){
  const models=await api('/api/models');
  const existing=models.find(model=>model.model_identifier===fields.model);
  if(existing)return existing;
  return api('/api/models',{
    method:'POST',
    body:{
      model_identifier:fields.model,
      manufacturer_name:fields.manufacturer,
      category:'industrial',
      canonical_data:{
        sku:fields.sku,
        chemistry:fields.chemistry,
        nominal_capacity_ah:fields.capacity_ah,
        nominal_voltage_v:fields.voltage_v
      }
    }
  });
}
async function createBatteryAndPassport(){
  const fields=batteryForm();
  const model=await findOrCreateModel(fields);
  const publicId=makeBatteryPublicId();

  const item=await api('/api/items',{
    method:'POST',
    body:{
      model_id:model.id,
      unique_identifier:publicId,
      lifecycle_status:'original',
      canonical_data:{
        sku:fields.sku,
        serial_number:fields.serial,
        chemistry:fields.chemistry,
        capacity_ah:fields.capacity_ah,
        voltage_v:fields.voltage_v,
        production_date:fields.production_date
      }
    }
  });

  const passport=await api('/api/passport',{
    method:'POST',
    body:{
      battery_item_id:item.id,
      public_payload:{
        battery_id:publicId,
        manufacturer:fields.manufacturer,
        model:fields.model,
        sku:fields.sku,
        serial_number:fields.serial,
        chemistry:fields.chemistry,
        capacity_ah:fields.capacity_ah,
        voltage_v:fields.voltage_v,
        production_date:fields.production_date
      },
      private_payload:{}
    }
  });

  await api('/api/passport',{
    method:'PATCH',
    body:{
      id:passport.passport_id,
      status:'active',
      expected_updated_at:passport.updated_at
    }
  });

  await loadItems(item.id);
  log('REAL battery created in Supabase: '+publicId+' → active passport.','ok');
}
async function bindCarrier(kind){
  const batteryId=els.batteryId.value;
  const url=els.publicUrl.value;
  if(!batteryId||!url)throw new Error('Select a battery first.');
  const body={battery_item_id:batteryId,carrier_kind:kind,public_url:url};
  if(kind==='nfc')body.nfc_technology='ntag215';
  const carrier=await api('/api/carriers',{method:'POST',body});
  log(kind.toUpperCase()+' carrier bound: '+carrier.id,'ok');
  return carrier;
}
function decodeRecord(record){
  try{
    if(record.recordType==='url'||record.recordType==='text'){
      return new TextDecoder(record.encoding||'utf-8').decode(record.data);
    }
  }catch{}
  return '';
}
async function writeNfc(){
  const url=els.publicUrl.value;
  if(!url)throw new Error('Select a battery first.');
  if(!('NDEFReader' in window)){
    document.body.dataset.nfc='fallback';
    throw new Error('Web NFC is unavailable. Use NFC Tools to write the exact URL, then press the manual bind button.');
  }
  if(!window.isSecureContext)throw new Error('Web NFC requires HTTPS.');
  const ndef=new NDEFReader();
  await ndef.write({records:[{recordType:'url',data:url}]});
  await bindCarrier('nfc');
  document.body.dataset.nfc='written';
  log('NTAG215 written with the exact DPP URL and bound in Supabase.','ok');
}
async function verifyNfc(){
  const expected=els.publicUrl.value;
  if(!expected)throw new Error('Select a battery first.');
  if(!('NDEFReader' in window))throw new Error('Web NFC is unavailable on this device/browser.');
  if(!window.isSecureContext)throw new Error('Web NFC requires HTTPS.');

  const ndef=new NDEFReader();
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),20000);
  log('Hold the NTAG215 to the phone now…','warn');
  try{
    await ndef.scan({signal:controller.signal});
    const actual=await new Promise((resolve,reject)=>{
      const onAbort=()=>reject(new Error('NFC verification timed out.'));
      controller.signal.addEventListener('abort',onAbort,{once:true});
      ndef.addEventListener('readingerror',()=>reject(new Error('NFC tag could not be read.')),{once:true});
      ndef.addEventListener('reading',event=>{
        for(const record of event.message.records){
          const value=decodeRecord(record);
          if(value){resolve(value);return;}
        }
        reject(new Error('No readable URL record was found.'));
      },{once:true});
    });
    if(actual!==expected)throw new Error('NFC VERIFY FAILED. Expected '+expected+' but read '+actual);
    document.body.dataset.nfc='verified';
    log('NFC VERIFIED ✅ URL is an exact match.','ok');
  }finally{
    clearTimeout(timeout);
    if(!controller.signal.aborted)controller.abort();
  }
}
async function addWorker(){
  const userId=els.workerUserId.value.trim();
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)){
    throw new Error('Enter a valid Supabase user UUID.');
  }
  await api('/api/members',{method:'POST',body:{user_id:userId,role:'viewer'}});
  log('Worker added as viewer. This account can read the organization DPP but cannot create/edit batteries.','ok');
}
function wire(button,fn,label){
  button.addEventListener('click',async()=>{
    setBusy(button,true,label);
    try{await fn();}
    catch(error){log(error.message||String(error),'bad');}
    finally{setBusy(button,false);}
  });
}

els.organization.addEventListener('change',updateRole);
els.battery.addEventListener('change',updateBattery);

wire(els.signup,async()=>{
  if(!els.email.value.trim()||!els.password.value)throw new Error('Enter email and password.');
  const data=await authCall('/auth/v1/signup',{
    method:'POST',
    body:{email:els.email.value.trim(),password:els.password.value}
  });
  currentUser=data.user||currentUser;
  setSession(data);
  log(data.access_token?'Sign-up complete and authenticated.':'Account created. Confirm email if required, then sign in. User UUID: '+(data.user?.id||'unknown'),'ok');
  if(data.access_token)await loadOrganizations({activateSingle:true});
},'Creating…');

wire(els.signin,async()=>{
  if(!els.email.value.trim()||!els.password.value)throw new Error('Enter email and password.');
  const data=await authCall('/auth/v1/token?grant_type=password',{
    method:'POST',
    body:{email:els.email.value.trim(),password:els.password.value}
  });
  currentUser=data.user||null;
  setSession(data);
  await loadOrganizations({activateSingle:true});
  log('Signed in. User UUID: '+(currentUser?.id||'unknown'),'ok');
},'Signing in…');

wire(els.signout,async()=>{
  if(accessToken){
    try{await authCall('/auth/v1/logout',{method:'POST',token:accessToken});}catch{}
  }
  accessToken=null;refreshToken=null;currentUser=null;organizations=[];items=[];
  setSession(null);
  els.organization.innerHTML='';els.battery.innerHTML='';updateBattery();
  log('Signed out.','ok');
});

wire(els.createOrg,async()=>{
  const name=els.orgName.value.trim(),slug=els.orgSlug.value.trim();
  if(!name||!slug)throw new Error('Enter company name and slug.');
  const org=await api('/api/organizations',{method:'POST',body:{name,slug}});
  await loadOrganizations();
  els.organization.value=org.organization_id;
  await activateSelectedOrganization();
  log('Test company created and activated.','ok');
},'Creating…');

wire(els.activateOrg,activateSelectedOrganization,'Activating…');
wire(els.reloadData,async()=>{await loadOrganizations();log('Live Supabase data reloaded.','ok');},'Reloading…');
wire(els.createBattery,createBatteryAndPassport,'Creating…');
wire(els.bindQr,async()=>bindCarrier('qr'),'Binding…');
wire(els.writeNfc,writeNfc,'Touch tag…');
wire(els.verifyNfc,verifyNfc,'Waiting for NFC…');
wire(els.bindNfcManual,async()=>{await bindCarrier('nfc');document.body.dataset.nfc='manual-bound';log('NTAG215 marked as manually written/bound. Verify it by tapping the tag on a clean phone.','ok');},'Binding…');
wire(els.addWorker,addWorker,'Adding…');

els.printLabel.addEventListener('click',()=>{
  if(!els.publicUrl.value){log('Select a battery first.','bad');return;}
  window.print();
});

(async()=>{
  const today=new Date().toISOString().slice(0,10);
  els.productionDate.value=today;
  await loadConfig();
  setSession(null);
  log('Station ready. Sign in as Borko/admin to start the real physical test.');
})().catch(error=>log(error.message||String(error),'bad'));
