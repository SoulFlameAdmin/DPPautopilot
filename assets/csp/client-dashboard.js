(()=>{"use strict";
const $=s=>document.querySelector(s);
const STORAGE="dpp_company_session_v1";
const PROJECT_URL="https://frhletkiuupgksmgxoxc.supabase.co";
const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
let cfg=null,session=null,currentUser=null,directory={countries:[],manufacturers:{}};

function setStatus(message,kind=""){const n=$("#statusBox");n.textContent=message;n.className="result"+(kind?" "+kind:"")}
function authHeaders(token){return {apikey:cfg.publishableKey,Authorization:"Bearer "+token,"Content-Type":"application/json",Accept:"application/json"}}
async function authCall(path){
  const r=await fetch(cfg.supabaseUrl+path,{headers:authHeaders(session.access_token),cache:"no-store"});
  const data=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(data.message||data.error||"Authentication failed.");
  return data;
}
async function api(path,{method="GET",body}={}){
  const r=await fetch(path,{method,headers:{Authorization:"Bearer "+session.access_token,"Content-Type":"application/json",Accept:"application/json"},body:body?JSON.stringify(body):undefined,cache:"no-store"});
  const data=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(data?.error?.message||data?.error?.code||"Request failed.");
  return data;
}
function parseHashSession(){
  const p=new URLSearchParams(location.hash.replace(/^#/,""));
  const token=p.get("access_token");
  if(!token)return null;
  return {access_token:token,refresh_token:p.get("refresh_token")||"",expires_in:Number(p.get("expires_in"))||3600};
}
function requestId(){
  const value=new URL(location.href).searchParams.get("request")||"";
  return UUID_RE.test(value)?value:null;
}
async function bindRequest(){
  const id=requestId();
  if(!id)return;
  await api("/api/registration-link",{method:"PATCH",body:{request_id:id}});
}
function cleanUrl(){
  const u=new URL(location.href);u.hash="";u.searchParams.delete("request");history.replaceState(null,"",u.pathname+u.search);
}
async function loadDirectory(){
  const r=await fetch("/data/manufacturers.json",{cache:"no-store"});
  if(!r.ok)throw new Error("Manufacturer directory unavailable.");
  directory=await r.json();
  for(const [code,name] of directory.countries||[]){
    const o=document.createElement("option");o.value=code;o.textContent=name;$("#countrySelect").append(o);
  }
  const other=document.createElement("option");other.value="OTHER";other.textContent="Other / Друга държава";$("#countrySelect").append(other);
}
function updateManufacturers(){
  const code=$("#countrySelect").value;
  const s=$("#manufacturerSelect");s.replaceChildren();
  if(!code){const o=document.createElement("option");o.value="";o.textContent="Първо изберете държава…";s.append(o);s.disabled=true;return}
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
function showReview(app){
  $("#loadingCard").hidden=true;$("#onboardingCard").hidden=true;$("#reviewCard").hidden=false;
  $("#dashCompany").textContent=app.company_name||"—";
  $("#dashCountry").textContent=app.country||"—";
  $("#dashEmail").textContent=app.email||currentUser?.email||"—";
}
async function submit(){
  const company=manufacturerName(),country=countryName(),notes=$("#requestText").value.trim();
  if(!$("#countrySelect").value)throw new Error("Изберете държава.");
  if(!$("#manufacturerSelect").value)throw new Error("Изберете фирма.");
  if(!company)throw new Error("Въведете името на фирмата.");
  if(notes.length<20)throw new Error("Опишете накратко какво ви трябва.");
  $("#submitApplication").disabled=true;
  $("#applicationResult").textContent="Изпращаме заявката…";
  try{
    const app=(await api("/api/application",{method:"POST",body:{
      company_name:company,contact_name:"",country,website:"",
      employees_count:null,dpp_users_count:null,production_sites_count:null,
      systems:[],product_categories:"Battery / electric mobility DPP early access",
      sku_count:null,annual_units:null,
      notes:"Manufacturer: "+company+"\n\nClient request:\n"+notes
    }})).data;
    showReview({...app,country,email:currentUser.email});
  }finally{$("#submitApplication").disabled=false}
}
async function init(){
  cfg=await fetch("/data/auth-config.json",{cache:"no-store"}).then(r=>r.json());
  if(cfg.supabaseUrl!==PROJECT_URL)throw new Error("Invalid auth configuration.");
  session=parseHashSession();
  if(session){sessionStorage.setItem(STORAGE,JSON.stringify(session))}
  else{try{session=JSON.parse(sessionStorage.getItem(STORAGE)||"null")}catch{}}
  if(!session?.access_token)throw new Error("Няма валидна Supabase Auth сесия. Поискайте нов sign-in link.");
  currentUser=await authCall("/auth/v1/user");
  await bindRequest();
  cleanUrl();
  await loadDirectory();
  $("#welcomeText").textContent="Добре дошли, "+currentUser.email+". Това е вашият DPP Early Access dashboard.";
  const apps=(await api("/api/application")).data||[];
  if(apps.length){showReview(apps[0]);return}
  $("#loadingCard").hidden=true;$("#onboardingCard").hidden=false;
}
$("#countrySelect").addEventListener("change",()=>{updateManufacturers();$("#customManufacturerWrap").hidden=true;$("#customManufacturer").value=""});
$("#manufacturerSelect").addEventListener("change",()=>{$("#customManufacturerWrap").hidden=$("#manufacturerSelect").value!=="__OTHER__"});
$("#submitApplication").addEventListener("click",()=>submit().catch(e=>{const n=$("#applicationResult");n.textContent=e.message;n.className="result bad"}));
init().catch(e=>setStatus(e.message,"bad"));
})();