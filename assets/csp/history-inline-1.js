(()=>{"use strict";const $=s=>document.querySelector(s),STORAGE="dpp_company_session_v1";let session=null;
function setStatus(t,k=""){const n=$("#status");n.textContent=t;n.className="result"+(k?" "+k:"")}
function read(){try{const v=JSON.parse(sessionStorage.getItem(STORAGE)||"null");if(v?.access_token){session=v;return true}}catch{}return false}
async function api(path){const r=await fetch(path,{headers:{Authorization:"Bearer "+session.access_token,Accept:"application/json"},cache:"no-store"});let d={};try{d=await r.json()}catch{}if(!r.ok)throw new Error(d?.error?.message||d?.error?.code||("HTTP "+r.status));return d}
function add(host,title,meta){const a=document.createElement("article");a.className="event";const s=document.createElement("strong");s.textContent=title;const m=document.createElement("span");m.textContent=meta;a.append(s,m);host.append(a)}
async function init(){document.body.dataset.historyReady="true";if(!read()){document.body.dataset.historyAuth="missing";setStatus("Няма фирмена сесия.","bad");return}document.body.dataset.historyAuth="authenticated";
 const id=new URLSearchParams(location.search).get("id");if(!id)throw new Error("Missing item id.");
 const data=(await api("/api/items?id="+encodeURIComponent(id)+"&detail=history")).data;
 $("#title").textContent=data.unique_identifier;$("#meta").textContent="Current lifecycle: "+data.lifecycle_status+" · item "+data.item_id+(data.passport_id?" · passport "+data.passport_id:"");
 const lh=$("#lifecycle");if(!(data.lifecycle_events||[]).length)add(lh,"No lifecycle events","No recorded transition.");else for(const e of data.lifecycle_events)add(lh,(e.from_status||"∅")+" → "+(e.to_status||"∅"),e.action+" · "+e.occurred_at+(e.actor_id?" · actor "+e.actor_id:""));
 const vh=$("#versions");if(!(data.passport_versions||[]).length)add(vh,"No passport versions","No active passport history yet.");else for(const v of data.passport_versions)add(vh,"Version "+v.version_no+" · "+v.status,v.created_at+(v.changed_by?" · actor "+v.changed_by:""));
 setStatus("History loaded from production backend.","ok");
}
init().catch(e=>setStatus(e.message,"bad"));})();