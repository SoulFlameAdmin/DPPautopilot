(()=>{"use strict";

// The production manufacturer workspace must never trust an email string
// kept in localStorage as evidence of a verified company or tenant role.
// Legacy ?early=1 links are routed into the verified email application flow.
function loadScript(src){
  return new Promise((resolve,reject)=>{
    const script=document.createElement("script");
    script.src=src;
    script.onload=resolve;
    script.onerror=()=>reject(new Error("Failed to load "+src));
    document.body.append(script);
  });
}
async function loadProductionDashboard(){
  await loadScript("/assets/csp/manufacturer-inline-1.js");
  await loadScript("/vendor/xlsx.full.min.js");
  await loadScript("/assets/csp/manufacturer-ops-inline-1.js");
}
const params=new URLSearchParams(location.search);
if(params.get("early")==="1"){
  location.replace("/apply");
  return;
}
loadProductionDashboard().catch(error=>{
  const gate=document.querySelector("#authGate");
  const result=document.querySelector("#gateResult");
  if(gate)gate.hidden=false;
  if(result){result.textContent=error.message;result.className="result bad";}
});
})();