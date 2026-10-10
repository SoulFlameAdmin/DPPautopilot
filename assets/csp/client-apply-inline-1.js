(()=>{"use strict";
const $=s=>document.querySelector(s);
const CONFIG_URL="/data/auth-config.json";
const ENDPOINT="https://soulflame-twins.vercel.app/api/dpp-dashboard-link";
const RELAY_URL="https://soulflame-twins.vercel.app/frontend/FRONTEND/dpp-auth/";
const GOOGLE_SESSION_KEY="dpp_google_session_v1";
const EARLY_STORAGE="dpp_early_access_client_v1";
const TOKEN_KEY="dpp_early_access_token_v1";
let cfg=null;
let currentUser=null;

function show(message,kind=""){
  const node=$("#result");
  if(!node)return;
  node.textContent=message;
  node.className="result"+(kind?" "+kind:"");
}
function clearOAuthHash(){
  if(!location.hash)return;
  history.replaceState(null,"",location.pathname+location.search);
}
async function loadConfig(){
  const response=await fetch(CONFIG_URL,{cache:"no-store"});
  if(!response.ok)throw new Error("Google Auth configuration is unavailable.");
  cfg=await response.json();
  if(!cfg?.supabaseUrl||!String(cfg.publishableKey||"").startsWith("sb_publishable_")){
    throw new Error("Google Auth configuration is invalid.");
  }
}
function authHeaders(token){
  const headers={apikey:cfg.publishableKey,Accept:"application/json","Content-Type":"application/json"};
  if(token)headers.Authorization="Bearer "+token;
  return headers;
}
async function getUser(accessToken){
  const response=await fetch(cfg.supabaseUrl+"/auth/v1/user",{
    headers:authHeaders(accessToken),cache:"no-store"
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw Object.assign(new Error(data?.message||data?.msg||"Google session is not valid."),{status:response.status});
  return data;
}
async function refreshGoogleSession(refreshToken){
  const response=await fetch(cfg.supabaseUrl+"/auth/v1/token?grant_type=refresh_token",{
    method:"POST",
    headers:authHeaders(),
    body:JSON.stringify({refresh_token:refreshToken})
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok||!data.access_token)throw new Error(data?.message||data?.msg||"Google session refresh failed.");
  return storeGoogleSession(data);
}
function storeGoogleSession(data,user){
  const value={
    access_token:data.access_token,
    refresh_token:data.refresh_token||"",
    expires_at:Math.floor(Date.now()/1000)+(Number(data.expires_in)||3600),
    user:user||data.user||null
  };
  localStorage.setItem(GOOGLE_SESSION_KEY,JSON.stringify(value));
  return value;
}
function readGoogleSession(){
  try{return JSON.parse(localStorage.getItem(GOOGLE_SESSION_KEY)||"null")}catch{return null}
}
function clearLocalAccess(){
  localStorage.removeItem(GOOGLE_SESSION_KEY);
  localStorage.removeItem(EARLY_STORAGE);
  localStorage.removeItem(TOKEN_KEY);
  // A company session is tab-scoped and must not survive Google account switching.
  sessionStorage.removeItem("dpp_company_session_v1");
}
function userView(user){
  const meta=user?.user_metadata||{};
  return {
    name:meta.full_name||meta.name||user?.email||"Google user",
    email:user?.email||"",
    avatar:meta.avatar_url||meta.picture||""
  };
}
function renderUser(user){
  currentUser=user||null;
  const box=$("#googleUser"),open=$("#openDashboard"),switchBtn=$("#switchGoogle"),login=$("#googleLogin");
  if(!user){
    box.hidden=true;open.hidden=true;switchBtn.hidden=true;login.hidden=false;
    return;
  }
  const view=userView(user);
  $("#googleName").textContent=view.name;
  $("#googleEmail").textContent=view.email;
  const avatar=$("#googleAvatar");
  avatar.textContent=(view.name||"G").slice(0,1).toUpperCase();
  if(view.avatar){
    const img=new Image();
    img.alt="";
    img.referrerPolicy="no-referrer";
    img.onload=()=>avatar.replaceChildren(img);
    img.src=view.avatar;
  }
  box.hidden=false;open.hidden=false;switchBtn.hidden=false;login.hidden=true;
}
function googleOAuthUrl(){
  const url=new URL(cfg.supabaseUrl+"/auth/v1/authorize");
  url.searchParams.set("provider","google");
  url.searchParams.set("redirect_to",RELAY_URL);
  return url.toString();
}
async function openExistingEarlyAccess(){
  const token=localStorage.getItem(TOKEN_KEY);
  if(!/^[a-f0-9]{64}$/i.test(String(token||"")))return false;
  const session=readGoogleSession();
  if(!session?.access_token)return false;
  const response=await fetch(ENDPOINT,{
    method:"POST",
    headers:{
      "Content-Type":"application/json",
      "Accept":"application/json",
      "Authorization":"Bearer "+session.access_token
    },
    body:JSON.stringify({action:"open",token}),
    cache:"no-store"
  });
  if(!response.ok){
    localStorage.removeItem(TOKEN_KEY);
    return false;
  }
  location.replace("/manufacturer-early#access="+encodeURIComponent(token));
  return true;
}
async function registerGoogleClient(user){
  const email=String(user?.email||"").trim().toLowerCase();
  if(!email)throw new Error("Google не върна email за този акаунт.");
  const session=readGoogleSession();
  if(!session?.access_token)throw new Error("Google session expired.");
  const response=await fetch(ENDPOINT,{
    method:"POST",
    headers:{
      "Content-Type":"application/json",
      "Accept":"application/json",
      "Authorization":"Bearer "+session.access_token
    },
    body:JSON.stringify({action:"new_client"}),
    cache:"no-store"
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data?.error||"DPP достъпът не беше създаден.");
  localStorage.setItem(EARLY_STORAGE,JSON.stringify({
    email,
    googleUserId:user.id||null,
    requestId:data.requestId||null,
    registeredAt:new Date().toISOString(),
    status:"submitted"
  }));
  if(data.accessToken)localStorage.setItem(TOKEN_KEY,data.accessToken);
  return data;
}
async function enterDashboard(){
  $("#openDashboard").disabled=true;
  show("Проверяваме DPP достъпа и отваряме dashboard-а…");
  try{
    if(await openExistingEarlyAccess())return;
    const data=await registerGoogleClient(currentUser);
    location.replace(data.dashboardUrl||"/manufacturer-early");
  }catch(error){
    $("#openDashboard").disabled=false;
    show(error.message,"bad");
  }
}
async function finishGoogleLogin(sessionData){
  const user=await getUser(sessionData.access_token);
  const session=storeGoogleSession(sessionData,user);
  currentUser=user;
  renderUser(user);
  show("Google входът е успешен. Отваряме DPP dashboard…","ok");
  await enterDashboard();
  return session;
}
async function restoreGoogle(){
  let session=readGoogleSession();
  if(!session?.access_token)return null;
  try{
    if(session.expires_at&&session.expires_at<=Math.floor(Date.now()/1000)+30&&session.refresh_token){
      session=await refreshGoogleSession(session.refresh_token);
    }
    const user=await getUser(session.access_token);
    storeGoogleSession(session,user);
    return user;
  }catch{
    if(session?.refresh_token){
      try{
        session=await refreshGoogleSession(session.refresh_token);
        const user=await getUser(session.access_token);
        storeGoogleSession(session,user);
        return user;
      }catch{}
    }
    clearLocalAccess();
    return null;
  }
}
function parseCallback(){
  const params=new URLSearchParams(String(location.hash||"").replace(/^#/,""));
  const error=params.get("error_description")||params.get("error");
  if(error){
    clearOAuthHash();
    throw new Error(error);
  }
  const access=params.get("access_token");
  if(!access)return null;
  const data={
    access_token:access,
    refresh_token:params.get("refresh_token")||"",
    expires_in:Number(params.get("expires_in"))||3600
  };
  clearOAuthHash();
  return data;
}
async function boot(){
  await loadConfig();
  const callback=parseCallback();
  if(callback){
    await finishGoogleLogin(callback);
    return;
  }
  const user=await restoreGoogle();
  if(user){
    renderUser(user);
    show("Google акаунтът е запазен. Отваряме вашия DPP dashboard…","ok");
    await enterDashboard();
    return;
  }
  renderUser(null);
  show("Влезте с Google, за да създадем или отворим вашия DPP достъп.");
}
$("#googleLogin").addEventListener("click",async()=>{
  try{
    $("#googleLogin").disabled=true;
    show("Отваряме защитения Google вход…");
    if(!cfg)await loadConfig();
    location.assign(googleOAuthUrl());
  }catch(error){
    $("#googleLogin").disabled=false;
    show(error.message,"bad");
  }
});
$("#openDashboard").addEventListener("click",()=>enterDashboard());
$("#switchGoogle").addEventListener("click",async()=>{
  clearLocalAccess();
  renderUser(null);
  show("Изберете друг Google акаунт.");
  if(!cfg)await loadConfig();
  location.assign(googleOAuthUrl());
});
boot().catch(error=>{
  renderUser(null);
  show("Google входът не се зареди: "+error.message,"bad");
});
})();