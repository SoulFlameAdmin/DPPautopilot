(()=>{"use strict";
const $=id=>document.getElementById(id);
function apply(state,detail=""){
  const ready=state==="configured";
  document.body.dataset.manufacturerTenant=state;
  document.body.dataset.manufacturerReady=String(ready);
  const views={
    preparing:["PREPARING","Подготвяме фирмения workspace…","Onboarding 8/8 е запазен. Проверяваме фирмения tenant преди Product / SKU.","Preparing","Pending","Проверяваме конфигурацията","PREPARING","Активираме фирмения tenant…","Свързваме фирмения tenant…","Google session · Tenant verification pending"],
    configured:["AUTO-CONFIGURED","Вашият DPP workspace е готов.","Фирменият tenant е потвърден. Следва Product / SKU → Batch → Serial units → DPP → QR.","Configured","Ready","Настройката е завършена","READY FOR PRODUCT","Onboarding 8/8 е завършен. Company tenant е активен. Следва: реален Product / SKU.","Отворете реалната Product / SKU форма","Google session · Production tenant active"],
    "setup-failed":["SETUP FAILED","Фирменият workspace още не е активен.","Отговорите са запазени, но настройката на tenant не е потвърдена. Опитайте отново.","Setup failed","Pending","Настройката не е завършена","SETUP FAILED","Не успяхме да активираме фирмения tenant: "+String(detail||"Проверете връзката и сесията."),"Използвайте бутона „Опитай отново“.","Google session · Tenant activation failed"]
  };
  if(!Object.prototype.hasOwnProperty.call(views,state))throw new Error("Unknown tenant state");
  const ids=["tenantBadge","tenantHeadline","tenantDescription","tenantStatusMetric","tenantQrStatus","tenantSectionTitle","tenantSectionBadge","earlyStatus","productSkuEntryState","tenantMeta"];
  ids.forEach((id,index)=>{const node=$(id);if(node)node.textContent=views[state][index];});
  if(ready && detail?.name && $("tenantMeta"))$("tenantMeta").textContent="Google session · "+detail.name+" · Production tenant active";
  for(const id of ["tenantBadge","tenantSectionBadge"]){const el=$(id);if(el)el.className="state"+(ready?" ok":state==="setup-failed"?" bad":"");}
  const status=$("earlyStatus");
  if(status)status.className="result"+(ready?" ok":state==="setup-failed"?" bad":"");
  const retry=$("tenantRetry");if(retry)retry.hidden=state!=="setup-failed";
  for(const id of ["productSkuEntry","productSkuButton"]){
    const link=$(id);if(!link)continue;
    link.href=ready?"/manufacturer#modelRegisterCard":"#";
    link.setAttribute("aria-disabled",ready?"false":"true");
    link.classList.toggle("preparing",!ready);
    link.classList.toggle("ready",ready);
  }
}
globalThis.DPPTenantUI={
  preparing:()=>apply("preparing"),
  ready:tenant=>apply("configured",tenant),
  failed:error=>apply("setup-failed",error?.message||String(error||"Tenant request failed."))
};
})();