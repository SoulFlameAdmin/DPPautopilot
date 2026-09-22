const formUx=window.DPPFormUX;
const canonical={
 manufacturer_name:'model.identification.manufacturer.name',
 model_id:'model.identification.model_id',
 category:'model.identification.category',
 rated_capacity_ah:'model.rated_capacity_ah',
 chemistry:'model.composition.chemistry',
 unique_identifier:'item.unique_identifier',
 lifecycle_status:'item.lifecycle_status',
 state_of_health_percent:'item.state_of_health'
};
let headers=[],catalog=[];
const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
function render(){
 const options=catalog.map(f=>`<option value="${esc(f.path)}">${esc(f.path)}</option>`).join('');
 rows.innerHTML=headers.map(h=>`<div class="row"><strong>${esc(h)}</strong><select data-source="${esc(h)}" aria-label="Map ${esc(h)} to canonical field"><option value="">— unmapped —</option>${options}</select></div>`).join('');
 for(const sel of rows.querySelectorAll('select')){if(canonical[sel.dataset.source])sel.value=canonical[sel.dataset.source];sel.onchange=update}
 update();
}
function update(){
 const controls=[mappingName,...rows.querySelectorAll('select')],before=formUx.snapshot(controls);
 const map={};for(const sel of rows.querySelectorAll('select'))if(sel.value)map[sel.dataset.source]=sel.value;
 const doc={name:mappingName.value.trim(),source_format:'csv',source_headers:headers,field_mapping:map};
 const nameOk=doc.name.length>0;
 formUx.setError(mappingName,mappingName_error,nameOk?'':'Mapping name is required.');
 const valid=nameOk&&headers.length>0&&Object.keys(map).length===headers.length;
 document.body.dataset.headerCount=String(headers.length);document.body.dataset.mappedCount=String(Object.keys(map).length);document.body.dataset.payloadValid=String(valid);document.body.dataset.formValid=String(valid);
 formUx.markPreserved(before,controls);
 payload.textContent=JSON.stringify(doc,null,2);
}
async function load(){
 const [cr,csvr]=await Promise.all([fetch('/data/dpp-field-catalog.json',{cache:'no-store'}),fetch('/data/sample-import.csv',{cache:'no-store'})]);
 if(!cr.ok||!csvr.ok)throw new Error('catalog/sample load failed');
 catalog=(await cr.json()).fields;
 const first=(await csvr.text()).trim().split(/\r?\n/)[0];
 headers=first.split(',').map(x=>x.trim());
 render();document.body.dataset.mappingReady='true';
 const q=new URLSearchParams(location.search);
 if(q.get('invalid')==='1'){mappingName.value='';update();}
}
mappingName.oninput=update;autoload.onclick=load;
load().catch(e=>payload.textContent=e.message);
