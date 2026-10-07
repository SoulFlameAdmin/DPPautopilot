(()=>{"use strict";
const ENDPOINT="https://soulflame-twins.vercel.app/api/dpp-dashboard-link";
const TOKEN_KEY="dpp_early_access_token_v1";
const tokenFromHash=()=>{
  const p=new URLSearchParams(String(location.hash||"").replace(/^#/,""));
  const v=String(p.get("access")||"").trim();
  return /^[a-f0-9]{64}$/i.test(v)?v:"";
};
const setText=(id,value)=>{const n=document.getElementById(id);if(n)n.textContent=value;};
async function openSession(token){
  const r=await fetch(ENDPOINT,{method:"POST",headers:{"Content-Type":"application/json","Accept":"application/json"},body:JSON.stringify({action:"open",token}),cache:"no-store"});
  const data=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(data?.error||"Dashboard access failed.");
  return data.data||{};
}
(async()=>{
  try{
    let token=tokenFromHash();
    if(token){localStorage.setItem(TOKEN_KEY,token);history.replaceState(null,"",location.pathname);}
    else token=String(localStorage.getItem(TOKEN_KEY)||"").trim();
    if(!/^[a-f0-9]{64}$/i.test(token))throw new Error("Няма валиден Early Access dashboard access.");
    const profile=await openSession(token);
    setText("clientEmail",profile.email||"—");
    setText("workspaceCompanyName",profile.companyName||"Early Access");
    setText("tenantName",profile.companyName||"Early Access Company");
    setText("tenantMeta","Status: "+String(profile.status||"submitted").toUpperCase());
    setText("earlyStatus","Заявката е записана. SoulFlame ще се свърже с вас възможно най-скоро.");
  }catch(error){
    setText("earlyStatus",error.message||"Dashboard access failed.");
  }
})();
})();
