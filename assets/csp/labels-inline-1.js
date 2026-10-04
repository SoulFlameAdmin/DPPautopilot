(()=>{"use strict";
const $=s=>document.querySelector(s),STORAGE="dpp_company_session_v1",MAX=50;let session=null;
function setStatus(t,k=""){const n=$("#status");n.textContent=t;n.className="result"+(k?" "+k:"")}
function readSession(){try{const v=JSON.parse(sessionStorage.getItem(STORAGE)||"null");if(v?.access_token){session=v;return true}}catch{}return false}
async function api(path){const r=await fetch(path,{headers:{Authorization:"Bearer "+session.access_token,Accept:"application/json"},cache:"no-store"});let d={};try{d=await r.json()}catch{}if(!r.ok)throw new Error(d?.error?.message||d?.error?.code||("HTTP "+r.status));return d}
function requested(){const p=new URLSearchParams(location.search),raw=p.get("ids")||"";return [...new Set(raw.split(",").map(x=>x.trim()).filter(Boolean))].slice(0,MAX)}
function card(identifier,target){
 const a=document.createElement("article");a.className="label-card";
 const img=document.createElement("img");img.alt="QR "+identifier;img.src="/api/qr?identifier="+encodeURIComponent(identifier);
 const copy=document.createElement("div"),head=document.createElement("b");head.textContent="BATTERY DIGITAL PRODUCT PASSPORT";
 const strong=document.createElement("strong");strong.textContent=identifier;
 const span=document.createElement("span");span.textContent=target;
 copy.append(head,strong,span);a.append(img,copy);return a;
}
async function init(){
 document.body.dataset.labelsReady="true";
 if(!readSession()){document.body.dataset.labelsAuth="missing";setStatus("Няма фирмена сесия. Влез през Company Access.","bad");return}
 document.body.dataset.labelsAuth="authenticated";
 const items=(await api("/api/items")).data||[],allowed=new Map(items.map(i=>[i.unique_identifier,i]));
 let ids=requested();if(!ids.length)ids=items.slice(0,MAX).map(i=>i.unique_identifier);
 ids=ids.filter(id=>allowed.has(id));
 if(!ids.length){setStatus("Няма избрани battery items в активния tenant.","bad");return}
 const host=$("#labels");let ok=0,failed=0;
 for(const id of ids){
   try{
     const r=await fetch("/api/passport?identifier="+encodeURIComponent(id),{cache:"no-store"});
     if(!r.ok){failed++;continue}
     const data=(await r.json()).data;
     if(data?.status!=="active"){failed++;continue}
     const target=location.origin+"/passport?identifier="+encodeURIComponent(id);
     host.append(card(id,target));ok++;
   }catch{failed++}
 }
 $("#printLabels").disabled=ok===0;
 setStatus("Verified active labels: "+ok+(failed?" · skipped without active passport: "+failed:""),ok?"ok":"bad");
}
$("#printLabels").addEventListener("click",()=>window.print());
init().catch(e=>setStatus(e.message,"bad"));
})();