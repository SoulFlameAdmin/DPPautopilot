let rules,evalCases,catalog,acceptedMap={};
const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
const norm=v=>String(v??'').replace(/([a-z0-9])([A-Z])/g,'$1 $2').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/%/g,' percent ').match(/[a-z0-9]+/g)?.join(' ')||'';
const toks=v=>new Set(norm(v).split(' ').filter(Boolean));
function suggest(header,threshold=.70){
 const h=norm(header),ht=toks(header),ranked=[];
 for(const field of rules.fields){
   let best=null;
   for(const alias of [...field.aliases,field.path]){
     const a=norm(alias); let score=0,reason='';
     if(h===a){score=.99;reason='exact normalized alias match'}
     else{
       const at=toks(alias); if(!ht.size||!at.size)continue;
       const inter=[...ht].filter(x=>at.has(x)).length,union=new Set([...ht,...at]).size;
       const overlap=inter/union,containment=inter/Math.min(ht.size,at.size);
       score=Math.round((.55*overlap+.35*containment)*1000)/1000;reason='token overlap';
     }
     if(!best||score>best.score)best={score,alias,reason};
   }
   if(best&&best.score>=threshold)ranked.push({path:field.path,confidence:best.score,evidence:{reason:best.reason,matchedAlias:best.alias,normalizedHeader:h}});
 }
 return ranked.sort((a,b)=>b.confidence-a.confidence||a.path.localeCompare(b.path));
}
function applySuggestion(header,path){
 acceptedMap[header]=path; accepted.textContent=JSON.stringify(acceptedMap,null,2);
 document.body.dataset.appliedCount=String(Object.keys(acceptedMap).length);
}
function derivedAliases(field){
 const path=field.path,leaf=path.split('.').pop(),out=new Set([
   path,path.replaceAll('.',' '),leaf,leaf.replaceAll('_',' '),field.apiTarget||'',field.uiTarget||''
 ]);
 for(const target of [field.apiTarget||'',field.uiTarget||''])if(target)out.add(target.split('.').pop());
 return [...out].filter(Boolean);
}
function buildRules(catalogDoc,overlay){
 const explicit=new Map((overlay.fields||[]).map(f=>[f.path,f.aliases||[]]));
 return {version:2,catalogVersion:catalogDoc.catalogVersion,fields:catalogDoc.fields.map(field=>({
   path:field.path,
   aliases:[...new Set([...derivedAliases(field),...(explicit.get(field.path)||[])])]
 }))};
}
async function init(){
 const [rr,er,cr]=await Promise.all([
   fetch('/data/mapping-assistant-rules.json',{cache:'no-store'}),
   fetch('/data/mapping-assistant-eval.json',{cache:'no-store'}),
   fetch('/data/dpp-field-catalog.json',{cache:'no-store'})
 ]);
 if(!rr.ok||!er.ok||!cr.ok)throw new Error('BAT18 mapping data unavailable');
 const overlay=await rr.json();evalCases=await er.json();catalog=await cr.json();
 rules=buildRules(catalog,overlay);
 document.body.dataset.catalogFieldCount=String(rules.fields.length);
 let suggested=0,unknown=0;
 rows.innerHTML=evalCases.cases.map((c,i)=>{
   const s=suggest(c.header)[0]||null;
   if(s)suggested++;else unknown++;
   return `<div class="row" data-header="${esc(c.header)}" data-has-suggestion="${s?'true':'false'}">
     <strong>${esc(c.header)}</strong>
     <div>${s?`<code>${esc(s.path)}</code>`:'<span class="muted">No suggestion</span>'}</div>
     <div>${s?`<span class="ok">${Math.round(s.confidence*100)}%</span>`:'—'}</div>
     <div class="muted">${s?esc(s.evidence.reason+' · '+s.evidence.matchedAlias):'Unknown column left untouched'}</div>
     <div>${s?`<button data-apply-header="${esc(c.header)}" data-apply-path="${esc(s.path)}">Apply</button>`:''}</div>
   </div>`;
 }).join('');
 for(const btn of rows.querySelectorAll('button[data-apply-header]')){
   btn.onclick=()=>applySuggestion(btn.dataset.applyHeader,btn.dataset.applyPath);
 }
 document.body.dataset.suggestionCount=String(suggested);
 document.body.dataset.unknownCount=String(unknown);
 document.body.dataset.appliedCount='0';
 document.body.dataset.reviewReady='true';
}
init().catch(e=>rows.textContent=e.message);
