const $=id=>document.getElementById(id);
function esc(v){return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));}
function render(rows,mode){
  const suppliers=Array.isArray(rows)?rows:[];
  const packages=suppliers.reduce((n,x)=>n+(Number(x.package_count)||0),0);
  const missing=suppliers.reduce((n,x)=>n+(Number(x.missing_count)||0),0);
  const ready=suppliers.filter(x=>(Number(x.missing_count)||0)===0).length;
  $('supplierCount').textContent=suppliers.length;
  $('packageCount').textContent=packages;
  $('missingCount').textContent=missing;
  $('readyCount').textContent=ready;
  $('modeNotice').textContent=mode==='sample'
    ?'SYNTHETIC SAMPLE · Няма клиентски данни. Production view ще използва authenticated /api/suppliers.'
    :'AUTHENTICATED API VIEW';
  const sorted=[...suppliers].sort((a,b)=>(Number(b.missing_count)||0)-(Number(a.missing_count)||0));
  $('supplierRows').innerHTML=sorted.length?sorted.map(s=>{
    const miss=Number(s.missing_count)||0;
    return '<article class="row">'+
      '<div class="name"><strong>'+esc(s.legal_name)+'</strong><span class="meta">'+esc(s.external_ref)+'</span></div>'+
      '<div class="metric"><strong>'+esc(s.package_count||0)+'</strong><span class="meta">packages</span></div>'+
      '<div class="metric"><strong class="'+(miss?'warn':'ok')+'">'+miss+'</strong><span class="meta">missing</span></div>'+
      '<div class="status '+(miss?'warn':'ok')+'">'+(miss?'ACTION NEEDED':'READY')+'</div>'+
    '</article>';
  }).join(''):'<div class="empty">Няма suppliers.</div>';
  document.body.dataset.supplierDashboardReady='true';
  document.body.dataset.supplierMode=mode;
}
async function load(){
  const q=new URLSearchParams(location.search);
  if(q.get('sample')==='1'){
    const r=await fetch('/data/sample-suppliers.json',{cache:'no-store'});
    if(!r.ok) throw new Error('sample supplier data unavailable');
    const data=await r.json();
    render(data.suppliers,'sample');
    return;
  }
  const token=window.__DPP_ACCESS_TOKEN;
  if(!token) throw new Error('Authenticated session required. Use ?sample=1 for synthetic preview.');
  const r=await fetch('/api/suppliers',{headers:{Authorization:'Bearer '+token},cache:'no-store'});
  const data=await r.json();
  if(!r.ok) throw new Error(data?.error?.message||'Supplier API unavailable');
  render(data.data,'api');
}
$('refresh').addEventListener('click',()=>load().catch(e=>{$('supplierRows').textContent=e.message;}));
load().catch(e=>{$('modeNotice').textContent='NOT READY';$('supplierRows').textContent=e.message;document.body.dataset.supplierDashboardReady='false';});
