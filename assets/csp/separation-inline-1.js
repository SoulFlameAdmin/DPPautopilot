const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
const get=(o,p)=>{let c=o;for(const x of p.split('.')){if(c==null||typeof c!=='object'||!(x in c))return undefined;c=c[x]}return c};
(async()=>{try{
 const [cr,sr]=await Promise.all([fetch('/data/dpp-field-catalog.json'),fetch('/data/sample-battery.json')]);const c=await cr.json(),f=await sr.json(),item=f.items[0];
 const modelFields=c.fields.filter(x=>x.path.startsWith('model.')).slice(0,10), itemFields=c.fields.filter(x=>x.path.startsWith('item.'));
 modelTitle.textContent=f.model.identification.model_id;itemTitle.textContent=item.unique_identifier;
 modelRows.innerHTML=modelFields.map(x=>`<div class="row" data-model-path="${esc(x.path)}"><code>${esc(x.path)}</code><div>${esc(JSON.stringify(get(f,x.path)))}</div></div>`).join('');
 itemRows.innerHTML=itemFields.map(x=>`<div class="row" data-item-path="${esc(x.path)}"><code>${esc(x.path)}</code><div>${esc(JSON.stringify(get(item,x.path.slice(5))))}</div></div>`).join('');
 const modelPaths=modelFields.map(x=>x.path), itemPaths=itemFields.map(x=>x.path);
 const leak=modelPaths.some(p=>p.startsWith('item.'))||itemPaths.some(p=>p.startsWith('model.'));
 document.body.dataset.separationReady='true';document.body.dataset.modelPaths=String(modelPaths.length);document.body.dataset.itemPaths=String(itemPaths.length);document.body.dataset.crossLevelLeak=String(leak);
}catch(e){document.body.dataset.separationReady='false'}})();
