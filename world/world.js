(()=>{
const canvas=document.getElementById('globe'),ctx=canvas.getContext('2d');
const list=document.getElementById('companyList'),count=document.getElementById('companyCount');
const dialog=document.getElementById('targetDialog'),form=document.getElementById('targetForm');
const seed=[
{id:'voltrax',name:'VOLTRAX',country:'Bulgaria',city:'Sofia region',lat:42.7,lon:23.32,sector:'battery',status:'contacted',mrr:149,next:'Battery DPP demo + commercial offer'},
{id:'biokom',name:'Biokom Trendafilov',country:'Bulgaria',city:'Sliven',lat:42.6817,lon:26.3229,sector:'detergent',status:'target',mrr:120,next:'2027 first contact / DPP roadmap'},
{id:'eu-battery-1',name:'EU Battery Prospect',country:'Germany',city:'Berlin',lat:52.52,lon:13.405,sector:'battery',status:'target',mrr:250,next:'Identify manufacturer + compliance owner'}
];
let companies=JSON.parse(localStorage.getItem('dpp-world-companies')||'null')||seed;
let filter='all',selected=null,rotX=-0.25,rotY=-0.4,zoom=1,drag=false,lastX=0,lastY=0;
const colors={target:'#ff6b6b',contacted:'#ffd166',pilot:'#69a7ff',client:'#62f6c9'};
const system=[
['QR / Identifier',100],['Public Passport',100],['Battery Schema',88],['Import / Mapping',82],['Auth',45],['RBAC / RLS',42],['Registry',58],['Audit / Evidence',61],['NFC',30],['Production UX',36]
];
function save(){localStorage.setItem('dpp-world-companies',JSON.stringify(companies))}
function project(lat,lon,R,cx,cy){
 const p=lat*Math.PI/180,l=lon*Math.PI/180+rotY;
 let x=Math.cos(p)*Math.sin(l),y=Math.sin(p),z=Math.cos(p)*Math.cos(l);
 const cyy=Math.cos(rotX),sy=Math.sin(rotX); const y2=y*cyy-z*sy,z2=y*sy+z*cyy;
 return {x:cx+x*R,y:cy-y2*R,z:z2,visible:z2>0};
}
function spherePoint(lat,lon,R,cx,cy){return project(lat,lon,R,cx,cy)}
function draw(){
 const w=canvas.width,h=canvas.height,cx=w/2,cy=h/2+8,R=Math.min(w,h)*.39*zoom;
 ctx.clearRect(0,0,w,h);
 const g=ctx.createRadialGradient(cx-R*.28,cy-R*.32,R*.06,cx,cy,R*1.08);
 g.addColorStop(0,'#2075a5');g.addColorStop(.38,'#0f4e76');g.addColorStop(.76,'#082c48');g.addColorStop(1,'#03131f');
 ctx.beginPath();ctx.arc(cx,cy,R,0,Math.PI*2);ctx.fillStyle=g;ctx.fill();
 ctx.save();ctx.beginPath();ctx.arc(cx,cy,R,0,Math.PI*2);ctx.clip();
 ctx.globalAlpha=.62;ctx.strokeStyle='#58bce0';ctx.lineWidth=1;
 for(let lat=-75;lat<=75;lat+=15){ctx.beginPath();let first=true;for(let lon=-180;lon<=180;lon+=3){const p=spherePoint(lat,lon,R,cx,cy);if(p.visible){if(first){ctx.moveTo(p.x,p.y);first=false}else ctx.lineTo(p.x,p.y)}}ctx.stroke()}
 for(let lon=-180;lon<180;lon+=15){ctx.beginPath();let first=true;for(let lat=-90;lat<=90;lat+=3){const p=spherePoint(lat,lon,R,cx,cy);if(p.visible){if(first){ctx.moveTo(p.x,p.y);first=false}else ctx.lineTo(p.x,p.y)}}ctx.stroke()}
 ctx.globalAlpha=.18;ctx.fillStyle='#7ee5bd';
 const land=[
  [[70,-165],[58,-140],[50,-125],[35,-118],[20,-102],[8,-82],[24,-72],[45,-65],[58,-80],[70,-105]],
  [[12,-81],[-5,-78],[-20,-70],[-40,-64],[-55,-68],[-35,-52],[-12,-47],[3,-52]],
  [[72,-10],[60,-15],[48,3],[35,-5],[25,15],[10,10],[-5,20],[-35,18],[-35,35],[-10,42],[15,50],[30,42],[45,35],[55,20],[65,35],[72,55]],
  [[70,55],[58,70],[50,95],[55,125],[45,145],[30,125],[20,100],[30,75],[42,60]],
  [[-12,112],[-25,115],[-38,145],[-30,154],[-14,145]],
  [[82,-50],[72,-62],[62,-44],[68,-25]]
 ];
 for(const poly of land){ctx.beginPath();let started=false;for(const [lat,lon] of poly){const p=project(lat,lon,R,cx,cy);if(!p.visible)continue;if(!started){ctx.moveTo(p.x,p.y);started=true}else ctx.lineTo(p.x,p.y)}if(started){ctx.closePath();ctx.fill()}}
 ctx.restore();
 ctx.beginPath();ctx.arc(cx,cy,R,0,Math.PI*2);ctx.strokeStyle='rgba(127,207,255,.42)';ctx.lineWidth=2;ctx.stroke();
 ctx.beginPath();ctx.arc(cx-R*.20,cy-R*.22,R*.82,Math.PI*1.07,Math.PI*1.63);ctx.strokeStyle='rgba(255,255,255,.18)';ctx.lineWidth=11;ctx.stroke();
 const active=companies.filter(c=>filter==='all'||c.sector===filter).map(c=>({c,p:project(c.lat,c.lon,R,cx,cy)})).filter(o=>o.p.visible).sort((a,b)=>a.p.z-b.p.z);
 canvas._points=[];
 for(const o of active){
  const r=o.c.id===selected?10:7;
  ctx.beginPath();ctx.arc(o.p.x,o.p.y,r*2.4,0,Math.PI*2);ctx.fillStyle=colors[o.c.status]+'22';ctx.fill();
  ctx.beginPath();ctx.arc(o.p.x,o.p.y,r,0,Math.PI*2);ctx.fillStyle=colors[o.c.status];ctx.fill();
  ctx.strokeStyle='#fff';ctx.lineWidth=1.5;ctx.stroke();
  if(o.c.id===selected||R>300){ctx.font='600 19px system-ui';ctx.fillStyle='#e9f3ff';ctx.fillText(o.c.name,o.p.x+13,o.p.y-10)}
  canvas._points.push({x:o.p.x,y:o.p.y,c:o.c});
 }
}
function renderList(){
 const arr=companies.filter(c=>filter==='all'||c.sector===filter);
 count.textContent=arr.length;
 list.innerHTML=arr.map(c=>`<div class="company ${c.id===selected?'active':''}" data-id="${c.id}">
 <span class="status-pin" style="background:${colors[c.status]};color:${colors[c.status]}"></span>
 <div><strong>${esc(c.name)}</strong><div class="meta">${esc(c.city||'—')}, ${esc(c.country)} · ${esc(c.sector)}</div></div>
 <div class="money">${c.mrr?('€'+Number(c.mrr).toLocaleString()+'/mo'):'—'}<div class="meta">${esc(c.status)}</div></div>
 <div class="company-detail"><b>Следваща стъпка:</b> ${esc(c.next||'—')}<br><span class="meta">${c.lat.toFixed(3)}, ${c.lon.toFixed(3)}</span></div>
 </div>`).join('')||'<div class="meta">Няма targets в този филтър.</div>';
 list.querySelectorAll('.company').forEach(el=>el.addEventListener('click',()=>{selected=el.dataset.id;const c=companies.find(x=>x.id===selected);if(c){rotY=-(c.lon*Math.PI/180);rotX=-(c.lat*Math.PI/180)*.55}renderList();draw()}));
}
function esc(s){return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function renderProgress(){
 const avg=Math.round(system.reduce((a,x)=>a+x[1],0)/system.length);
 document.getElementById('systemPct').textContent=avg+'%';
 document.getElementById('systemProgress').innerHTML=system.map(([n,p])=>`<div class="prow"><span>${n}</span><div class="bar"><span style="width:${p}%"></span></div><span class="pct">${p}%</span></div>`).join('');
}
document.getElementById('filters').querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{filter=b.dataset.filter;document.querySelectorAll('#filters button').forEach(x=>x.classList.toggle('active',x===b));renderList();draw()}));
document.getElementById('addTarget').addEventListener('click',()=>dialog.showModal());
form.addEventListener('submit',e=>{
 if(e.submitter&&e.submitter.value==='cancel')return;
 e.preventDefault(); const d=new FormData(form);
 const c={id:'c'+Date.now(),name:d.get('name').trim(),country:d.get('country').trim(),city:d.get('city').trim(),lat:Number(d.get('lat')),lon:Number(d.get('lon')),sector:d.get('sector'),status:d.get('status'),mrr:Number(d.get('mrr')||0),next:d.get('next').trim()};
 if(!c.name||!c.country||!Number.isFinite(c.lat)||!Number.isFinite(c.lon))return;
 companies.push(c);save();selected=c.id;form.reset();dialog.close();renderList();draw();
});
document.getElementById('resetView').addEventListener('click',()=>{rotX=-.25;rotY=-.4;zoom=1;selected=null;renderList();draw()});
canvas.addEventListener('pointerdown',e=>{drag=true;lastX=e.clientX;lastY=e.clientY;canvas.setPointerCapture(e.pointerId)});
canvas.addEventListener('pointermove',e=>{if(!drag)return;rotY+=(e.clientX-lastX)*.006;rotX+=(e.clientY-lastY)*.004;rotX=Math.max(-1.2,Math.min(1.2,rotX));lastX=e.clientX;lastY=e.clientY;draw()});
canvas.addEventListener('pointerup',e=>{drag=false;canvas.releasePointerCapture(e.pointerId)});
canvas.addEventListener('wheel',e=>{e.preventDefault();zoom=Math.max(.78,Math.min(1.35,zoom-e.deltaY*.0008));draw()},{passive:false});
canvas.addEventListener('click',e=>{const r=canvas.getBoundingClientRect(),x=(e.clientX-r.left)*canvas.width/r.width,y=(e.clientY-r.top)*canvas.height/r.height;let hit=null,best=999;for(const p of canvas._points||[]){const d=Math.hypot(x-p.x,y-p.y);if(d<18&&d<best){hit=p.c;best=d}}if(hit){selected=hit.id;renderList();draw()}});
renderProgress();renderList();draw();
addEventListener('resize',draw);
})();