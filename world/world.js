(()=>{"use strict";
const STORAGE="dpp_company_session_v1";
const $=s=>document.querySelector(s);
const list=$("#companyList"),count=$("#companyCount"),dialog=$("#targetDialog"),form=$("#targetForm");
const cloudState=$("#cloudState"),tenantLabel=$("#tenantLabel"),mapHint=$("#mapHint"),globeWrap=document.querySelector(".globe-wrap");
const colors={target:"#ff6b6b",contacted:"#ffd166",pilot:"#69a7ff",client:"#62f6c9"};
const system=[["QR / Identifier",100],["Public Passport",100],["Battery Schema",88],["Import / Mapping",82],["Auth",62],["RBAC / RLS",55],["Registry",58],["Audit / Evidence",61],["NFC",30],["Production UX",44]];
const seed=[
{id:"demo-voltrax",name:"VOLTRAX",country:"Bulgaria",city:"Sofia region",latitude:42.6977,longitude:23.3219,sector:"battery",status:"contacted",monthly_potential_eur:149,next_step:"Battery DPP demo + commercial offer"},
{id:"demo-biokom",name:"Biokom Trendafilov",country:"Bulgaria",city:"Sliven",latitude:42.6817,longitude:26.3229,sector:"detergent",status:"target",monthly_potential_eur:120,next_step:"2027 first contact / DPP roadmap"}
];
let cfg=null,session=null,activeOrg=null,companies=[],filter="all",selected=null,pickMode=false,viewer=null;

function esc(s){return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]))}
function setCloud(text,kind=""){cloudState.textContent=text;cloudState.className="cloud-state"+(kind?" "+kind:"")}
function restoreSession(){try{const v=JSON.parse(sessionStorage.getItem(STORAGE)||"null");if(v?.access_token){session=v;return true}}catch{}return false}
async function api(path,opts={}){
 if(!session?.access_token)throw new Error("LOGIN_REQUIRED");
 const r=await fetch(path,{method:opts.method||"GET",headers:{Authorization:"Bearer "+session.access_token,"Content-Type":"application/json",Accept:"application/json"},body:opts.body?JSON.stringify(opts.body):undefined,cache:"no-store"});
 let data={};try{data=await r.json()}catch{}
 if(!r.ok)throw new Error(data?.error?.message||data?.message||("HTTP "+r.status));
 return data;
}
async function rest(path,opts={}){
 if(!cfg||!session?.access_token)throw new Error("LOGIN_REQUIRED");
 const headers={apikey:cfg.publishableKey,Authorization:"Bearer "+session.access_token,Accept:"application/json","Content-Type":"application/json"};
 if(opts.prefer)headers.Prefer=opts.prefer;
 const r=await fetch(cfg.supabaseUrl+"/rest/v1/"+path,{method:opts.method||"GET",headers,body:opts.body?JSON.stringify(opts.body):undefined,cache:"no-store"});
 const text=await r.text();let data=null;try{data=text?JSON.parse(text):null}catch{}
 if(!r.ok)throw new Error(data?.message||data?.error||("HTTP "+r.status));
 return data;
}
function statusColor(status){return Cesium.Color.fromCssColorString(colors[status]||colors.target)}
function renderProgress(){
 const avg=Math.round(system.reduce((a,x)=>a+x[1],0)/system.length);
 $("#systemPct").textContent=avg+"%";
 $("#systemProgress").innerHTML=system.map(([n,p])=>'<div class="prow"><span>'+esc(n)+'</span><div class="bar"><span style="width:'+p+'%"></span></div><span class="pct">'+p+'%</span></div>').join("");
}
function filtered(){return companies.filter(c=>filter==="all"||c.sector===filter)}
function renderSummary(){
 const f=filtered(),by=s=>f.filter(x=>x.status===s).length,total=f.reduce((a,x)=>a+Number(x.monthly_potential_eur||0),0);
 $("#summaryStrip").innerHTML='<div class="summary-chip"><strong>'+f.length+'</strong>visible</div><div class="summary-chip"><strong>'+by("target")+'</strong>targets</div><div class="summary-chip"><strong>'+by("client")+'</strong>clients</div><div class="summary-chip"><strong>€'+Math.round(total).toLocaleString()+'</strong>potential/mo</div>';
}
function renderList(){
 const arr=filtered();count.textContent=arr.length;renderSummary();
 list.innerHTML=arr.map(c=>'<div class="company '+(c.id===selected?"active":"")+'" data-id="'+esc(c.id)+'"><span class="status-pin" style="background:'+colors[c.status]+';color:'+colors[c.status]+'"></span><div><strong>'+esc(c.name)+'</strong><div class="meta">'+esc(c.city||"—")+', '+esc(c.country)+' · '+esc(c.sector)+'</div></div><div class="money">'+(c.monthly_potential_eur?("€"+Number(c.monthly_potential_eur).toLocaleString()+"/mo"):"—")+'<div class="meta">'+esc(c.status)+'</div></div><div class="company-detail"><b>Следваща стъпка:</b> '+esc(c.next_step||"—")+'<br><span class="meta">'+Number(c.latitude).toFixed(4)+", "+Number(c.longitude).toFixed(4)+'</span></div></div>').join("")||'<div class="meta">Няма фирми в този филтър.</div>';
 list.querySelectorAll(".company").forEach(el=>el.addEventListener("click",()=>focusCompany(el.dataset.id)));
}
function clearEntities(){if(!viewer)return;viewer.entities.removeAll()}
function renderPins(){
 if(!viewer)return;clearEntities();
 for(const c of filtered()){
  viewer.entities.add({
   id:c.id,
   name:c.name,
   position:Cesium.Cartesian3.fromDegrees(Number(c.longitude),Number(c.latitude),120),
   point:{pixelSize:c.id===selected?15:11,color:statusColor(c.status),outlineColor:Cesium.Color.WHITE,outlineWidth:2,heightReference:Cesium.HeightReference.NONE},
   label:{text:c.name,font:"600 15px sans-serif",fillColor:Cesium.Color.WHITE,outlineColor:Cesium.Color.BLACK,outlineWidth:3,style:Cesium.LabelStyle.FILL_AND_OUTLINE,pixelOffset:new Cesium.Cartesian2(16,-18),distanceDisplayCondition:new Cesium.DistanceDisplayCondition(0,7000000),disableDepthTestDistance:Number.POSITIVE_INFINITY},
   properties:{companyId:c.id}
  });
 }
}
function focusCompany(id){
 const c=companies.find(x=>x.id===id);if(!c||!viewer)return;
 selected=id;renderList();renderPins();
 viewer.camera.flyTo({destination:Cesium.Cartesian3.fromDegrees(Number(c.longitude),Number(c.latitude),900000),duration:.8});
}
function resetEarth(){
 selected=null;renderList();renderPins();
 viewer.camera.flyTo({destination:Cesium.Cartesian3.fromDegrees(20,35,18500000),duration:.9});
}
function initCesium(){
 if(!window.Cesium)throw new Error("CesiumJS failed to load.");
 viewer=new Cesium.Viewer("globe",{animation:false,timeline:false,baseLayerPicker:false,geocoder:false,homeButton:false,sceneModePicker:false,navigationHelpButton:false,fullscreenButton:false,infoBox:false,selectionIndicator:false,baseLayer:false,terrainProvider:new Cesium.EllipsoidTerrainProvider(),requestRenderMode:true,maximumRenderTimeChange:Infinity});
 viewer.imageryLayers.addImageryProvider(new Cesium.OpenStreetMapImageryProvider({url:"https://tile.openstreetmap.org/",credit:"© OpenStreetMap contributors"}));
 viewer.scene.globe.enableLighting=true;
 viewer.scene.backgroundColor=Cesium.Color.fromCssColorString("#020509");
 viewer.camera.setView({destination:Cesium.Cartesian3.fromDegrees(20,35,18500000)});
 viewer.screenSpaceEventHandler.setInputAction(movement=>{
   if(pickMode){
     const ray=viewer.camera.getPickRay(movement.position);const pos=viewer.scene.globe.pick(ray,viewer.scene);
     if(pos){
       const cart=Cesium.Cartographic.fromCartesian(pos);
       form.elements.lat.value=Cesium.Math.toDegrees(cart.latitude).toFixed(6);
       form.elements.lon.value=Cesium.Math.toDegrees(cart.longitude).toFixed(6);
       pickMode=false;$("#pickLocation").classList.remove("active");globeWrap.classList.remove("pick-mode");
       mapHint.textContent="Мястото е избрано. Попълни фирмата и запази.";
       dialog.showModal();
     }
     return;
   }
   const picked=viewer.scene.pick(movement.position);
   if(Cesium.defined(picked)&&picked.id?.id)focusCompany(String(picked.id.id));
 },Cesium.ScreenSpaceEventType.LEFT_CLICK);
}
async function loadCloud(){
 cfg=await fetch("/data/auth-config.json",{cache:"no-store"}).then(r=>{if(!r.ok)throw new Error("AUTH_CONFIG");return r.json()});
 if(!restoreSession()){
   companies=seed;setCloud("LOCAL DEMO","bad");tenantLabel.textContent="Влез през Company Login, за да пазим targets в Supabase.";renderList();renderPins();return;
 }
 const tenant=(await api("/api/tenant")).data;activeOrg=tenant.active_organization_id;
 if(!activeOrg){
   companies=seed;setCloud("NO ACTIVE TENANT","bad");tenantLabel.textContent="Имаш акаунт, но няма активен DPP tenant. Активирай фирма в Company Login.";renderList();renderPins();return;
 }
 const membership=tenant.memberships.find(x=>x.organization_id===activeOrg);
 tenantLabel.textContent="Cloud tenant: "+activeOrg+" · role: "+(membership?.role||"member");
 setCloud("SUPABASE LIVE","ok");
 companies=await rest("dpp_world_companies?organization_id=eq."+encodeURIComponent(activeOrg)+"&select=id,name,country,city,latitude,longitude,sector,status,monthly_potential_eur,contact_name,contact_email,next_step,created_at&order=created_at.desc")||[];
 renderList();renderPins();
}
async function saveCompany(c){
 if(!activeOrg||!session?.access_token){
   c.id="local-"+Date.now();companies.unshift(c);renderList();renderPins();return c;
 }
 const payload={organization_id:activeOrg,name:c.name,country:c.country,city:c.city,latitude:c.latitude,longitude:c.longitude,sector:c.sector,status:c.status,monthly_potential_eur:c.monthly_potential_eur,contact_name:c.contact_name,contact_email:c.contact_email,next_step:c.next_step};
 const rows=await rest("dpp_world_companies",{method:"POST",body:payload,prefer:"return=representation"});
 const saved=Array.isArray(rows)?rows[0]:null;if(!saved)throw new Error("Save returned no row.");
 companies.unshift(saved);return saved;
}
$("#filters").querySelectorAll("button").forEach(b=>b.addEventListener("click",()=>{filter=b.dataset.filter;document.querySelectorAll("#filters button").forEach(x=>x.classList.toggle("active",x===b));renderList();renderPins()}));
$("#addTarget").addEventListener("click",()=>dialog.showModal());
$("#pickLocation").addEventListener("click",()=>{pickMode=true;dialog.close();$("#pickLocation").classList.add("active");globeWrap.classList.add("pick-mode");mapHint.textContent="📍 PICK MODE: кликни върху точната позиция на Земята."});
form.addEventListener("submit",async e=>{
 if(e.submitter&&e.submitter.value==="cancel"){pickMode=false;return}
 e.preventDefault();const d=new FormData(form);
 const c={name:String(d.get("name")||"").trim(),country:String(d.get("country")||"").trim(),city:String(d.get("city")||"").trim(),latitude:Number(d.get("lat")),longitude:Number(d.get("lon")),sector:String(d.get("sector")),status:String(d.get("status")),monthly_potential_eur:Number(d.get("mrr")||0),contact_name:String(d.get("contact_name")||"").trim(),contact_email:String(d.get("contact_email")||"").trim(),next_step:String(d.get("next")||"").trim()};
 if(!c.name||!c.country||!Number.isFinite(c.latitude)||!Number.isFinite(c.longitude)){ $("#saveState").textContent="Попълни фирма, държава и валидна позиция.";$("#saveState").className="save-state bad";return}
 $("#saveTarget").disabled=true;$("#saveState").textContent="Записване…";$("#saveState").className="save-state";
 try{const saved=await saveCompany(c);selected=saved.id;form.reset();dialog.close();renderList();renderPins();focusCompany(saved.id);$("#saveState").textContent="";mapHint.textContent=activeOrg?"Записано в Supabase DPP WORLD.":"Записано локално (demo mode).";}
 catch(err){$("#saveState").textContent="Грешка: "+err.message;$("#saveState").className="save-state bad"}
 finally{$("#saveTarget").disabled=false}
});
$("#resetView").addEventListener("click",resetEarth);
renderProgress();
try{initCesium();loadCloud().catch(e=>{companies=seed;setCloud("CLOUD ERROR","bad");tenantLabel.textContent="Cloud sync error: "+e.message;renderList();renderPins()})}
catch(e){setCloud("MAP ERROR","bad");tenantLabel.textContent=e.message}
})();