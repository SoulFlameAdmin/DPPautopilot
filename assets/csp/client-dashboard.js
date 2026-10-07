(()=>{"use strict";
const $=s=>document.querySelector(s);
const ENDPOINT="https://soulflame-twins.vercel.app/api/dpp-dashboard-link";
const TOKEN_STORAGE="dpp_early_access_token_v1";
let token="",profile=null,directory={countries:[],manufacturers:{}};

function setStatus(message,kind=""){
  const n=$("#statusBox");
  n.textContent=message;
  n.className="result"+(kind?" "+kind:"");
}
function tokenFromHash(){
  const p=new URLSearchParams(String(location.hash||"").replace(/^#/,""));
  const value=String(p.get("access")||"").trim();
  return /^[a-f0-9]{64}$/i.test(value)?value:"";
}
function saveToken(value){
  token=value;
  if(token)localStorage.setItem(TOKEN_STORAGE,token);
}
function restoreToken(){
  const value=String(localStorage.getItem(TOKEN_STORAGE)||"").trim();
  if(/^[a-f0-9]{64}$/i.test(value)){token=value;return true}
  return false;
}
function cleanUrl(){
  history.replaceState(null,"",location.pathname+location.search);
}
async function call(action,extra={}){
  const response=await fetch(ENDPOINT,{
    method:"POST",
    headers:{"Content-Type":"application/json","Accept":"application/json"},
    body:JSON.stringify({action,token,...extra}),
    cache:"no-store"
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data?.error||"Dashboard request failed.");
  return data;
}
async function loadDirectory(){
  const r=await fetch("/data/manufacturers.json",{cache:"no-store"});
  if(!r.ok)throw new Error("Manufacturer directory unavailable.");
  directory=await r.json();
  const s=$("#countrySelect");
  for(const [code,name] of directory.countries||[]){
    const o=document.createElement("option");o.value=code;o.textContent=name;s.append(o);
  }
  const other=document.createElement("option");other.value="OTHER";other.textContent="Other / Друга държава";s.append(other);
}
function updateManufacturers(){
  const code=$("#countrySelect").value;
  const s=$("#manufacturerSelect");s.replaceChildren();
  if(!code){
    const o=document.createElement("option");o.value="";o.textContent="Първо изберете държава…";s.append(o);s.disabled=true;return;
  }
  s.disabled=false;
  let o=document.createElement("option");o.value="";o.textContent="Изберете вашата фирма…";s.append(o);
  for(const name of directory.manufacturers?.[code]||[]){o=document.createElement("option");o.value=name;o.textContent=name;s.append(o)}
  o=document.createElement("option");o.value="__OTHER__";o.textContent="Друга фирма / Не е в списъка";s.append(o);
}
function manufacturerName(){
  return $("#manufacturerSelect").value==="__OTHER__"?$("#customManufacturer").value.trim():$("#manufacturerSelect").value.trim();
}
function countryName(){
  return $("#countrySelect").selectedOptions[0]?.textContent||"";
}
function showReview(data){
  $("#loadingCard").hidden=true;
  $("#onboardingCard").hidden=true;
  $("#reviewCard").hidden=false;
  $("#dashCompany").textContent=data.companyName||"—";
  $("#dashCountry").textContent=data.country||"—";
  $("#dashEmail").textContent=data.email||"—";
}
async function submit(){
  const company=manufacturerName();
  const country=countryName();
  const requestText=$("#requestText").value.trim();
  if(!$("#countrySelect").value)throw new Error("Изберете държава.");
  if(!$("#manufacturerSelect").value)throw new Error("Изберете фирма.");
  if(!company)throw new Error("Въведете името на фирмата.");
  if(requestText.length<20)throw new Error("Опишете накратко какво ви трябва.");

  $("#submitApplication").disabled=true;
  const resultNode=$("#applicationResult");
  resultNode.textContent="Записваме заявката…";
  resultNode.className="result";
  try{
    const response=await call("submit",{
      country,
      companyName:company,
      manufacturer:company,
      requestText
    });
    showReview(response.data||{email:profile.email,country,companyName:company});
  }finally{
    $("#submitApplication").disabled=false;
  }
}
async function init(){
  const hashToken=tokenFromHash();
  if(hashToken){saveToken(hashToken);cleanUrl()}
  else restoreToken();

  if(!token)throw new Error("Няма личен dashboard link. Върнете се в Early Access страницата и поискайте линк по email.");

  const opened=await call("open");
  profile=opened.data||{};
  $("#welcomeText").textContent="Добре дошли, "+(profile.email||"client")+". Това е вашият DPP Early Access dashboard.";

  await loadDirectory();

  if(["submitted","reviewing","quoted","activated","rejected"].includes(String(profile.status||""))){
    showReview(profile);
    return;
  }

  $("#loadingCard").hidden=true;
  $("#onboardingCard").hidden=false;
}

$("#countrySelect").addEventListener("change",()=>{
  updateManufacturers();
  $("#customManufacturerWrap").hidden=true;
  $("#customManufacturer").value="";
});
$("#manufacturerSelect").addEventListener("change",()=>{
  $("#customManufacturerWrap").hidden=$("#manufacturerSelect").value!=="__OTHER__";
});
$("#submitApplication").addEventListener("click",()=>submit().catch(error=>{
  const n=$("#applicationResult");
  n.textContent=error.message;
  n.className="result bad";
}));
init().catch(error=>setStatus(error.message,"bad"));
})();