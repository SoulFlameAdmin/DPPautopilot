(()=>{"use strict";
const COMPANY_SESSION_KEY="dpp_company_session_v1";
const GOOGLE_SESSION_KEY="dpp_google_session_v1";
const qr=document.querySelector("#detailQrImage");
const statusNode=document.querySelector("#detailStatus");
const batteryNode=document.querySelector("#detailBatteryId");
const capacityNode=document.querySelector("#detailFieldCapacity");
const capacityInput=document.querySelector("#detailPilotCapacity");
const qrWrap=qr?.closest(".qr-wrap");
const qrState=qrWrap?.querySelector("small")||null;
let requestVersion=0;
let dirtyCapacityPassportId="";
let trackedPassportId="";

function active(){return String(statusNode?.textContent||"").trim().toUpperCase()==="ACTIVE";}
function selectedPassportId(){return document.querySelector(".passport-rows .ops-row.selected")?.dataset?.passportId||"";}
function trackPassportSelection(){
  const id=selectedPassportId();
  if(id!==trackedPassportId){trackedPassportId=id;dirtyCapacityPassportId="";}
  return id;
}
capacityInput?.addEventListener("input",()=>{
  const id=trackPassportSelection();
  if(id)dirtyCapacityPassportId=id;
});
function accessToken(){
  try{const value=JSON.parse(sessionStorage.getItem(COMPANY_SESSION_KEY)||"null");if(value?.access_token)return value.access_token;}catch{}
  try{const value=JSON.parse(localStorage.getItem(GOOGLE_SESSION_KEY)||"null");if(value?.access_token)return value.access_token;}catch{}
  return "";
}
function setQrState(){
  if(!qr)return;
  if(active()){
    qr.hidden=false;
    if(qrState)qrState.textContent="Scan for Digital Product Passport";
  }else{
    qr.removeAttribute("src");
    qr.hidden=true;
    if(qrState)qrState.textContent=selectedPassportId()?"QR available after activation":"Select an ACTIVE passport";
  }
}

// Block the operations bundle from even assigning a QR URL while the selected DPP is not ACTIVE.
// This prevents a DRAFT selection from starting a false/broken /api/qr request.
if(qr){
  const nativeSrc=Object.getOwnPropertyDescriptor(HTMLImageElement.prototype,"src");
  if(nativeSrc?.get&&nativeSrc?.set){
    Object.defineProperty(qr,"src",{
      configurable:true,
      enumerable:nativeSrc.enumerable,
      get(){return nativeSrc.get.call(this);},
      set(value){
        if(!active()){
          this.removeAttribute("src");
          this.hidden=true;
          if(qrState)qrState.textContent="QR available after activation";
          return;
        }
        nativeSrc.set.call(this,value);
        this.hidden=false;
        if(qrState)qrState.textContent="Scan for Digital Product Passport";
      }
    });
  }
}

async function syncPassportSpecificDetail(){
  const passportId=trackPassportSelection();
  const version=++requestVersion;
  setQrState();
  if(!passportId)return;
  const token=accessToken();
  if(!token)return;
  try{
    const response=await fetch("/api/passport?id="+encodeURIComponent(passportId),{
      headers:{Authorization:"Bearer "+token,Accept:"application/json"},
      cache:"no-store"
    });
    if(!response.ok)return;
    const full=(await response.json().catch(()=>({})))?.data;
    if(version!==requestVersion||selectedPassportId()!==passportId)return;
    const raw=full?.public_payload?.model?.rated_capacity_ah;
    const value=Number(raw);
    if(Number.isFinite(value)&&value>0){
      if(capacityNode)capacityNode.textContent=value+" Ah";
      // Do not overwrite a user typing a new capacity while the asynchronous
      // passport-specific detail request returns. Submit remains an explicit action.
      if(capacityInput&&active()&&document.activeElement!==capacityInput&&dirtyCapacityPassportId!==passportId)
        capacityInput.value=String(value);
    }
  }catch{}
}

if(qrState)qrState.id="detailQrState";
setQrState();
const observer=new MutationObserver(()=>queueMicrotask(syncPassportSpecificDetail));
if(statusNode)observer.observe(statusNode,{childList:true,subtree:true});
if(batteryNode)observer.observe(batteryNode,{childList:true,subtree:true});
document.addEventListener("click",event=>{
  if(event.target.closest(".passport-rows .ops-row"))setTimeout(syncPassportSpecificDetail,0);
});
document.addEventListener("change",event=>{
  if(event.target.matches(".passport-print-check"))setTimeout(syncPassportSpecificDetail,0);
});
})();