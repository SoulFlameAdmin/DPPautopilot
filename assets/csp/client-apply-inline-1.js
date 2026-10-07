(()=>{"use strict";
const $=s=>document.querySelector(s);
const ENDPOINT="https://soulflame-twins.vercel.app/api/dpp-dashboard-link";
const EARLY_STORAGE="dpp_early_access_client_v1";
const TOKEN_KEY="dpp_early_access_token_v1";

function show(message,kind=""){
  const node=$("#result");
  node.textContent=message;
  node.className="result"+(kind?" "+kind:"");
}
function validEmail(value){
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value||"").trim());
}
async function registerClient(email){
  const response=await fetch(ENDPOINT,{
    method:"POST",
    headers:{"Content-Type":"application/json","Accept":"application/json"},
    body:JSON.stringify({action:"new_client",email}),
    cache:"no-store"
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data?.error||"Регистрацията не беше записана.");
  return data;
}

$("#registerClient").addEventListener("click",async()=>{
  const email=$("#email").value.trim().toLowerCase();
  if(!validEmail(email)){
    show("Въведете валиден email адрес.","bad");
    return;
  }

  $("#registerClient").disabled=true;
  show("Регистрираме email-а и отваряме вашия dashboard…");

  try{
    const data=await registerClient(email);
    localStorage.setItem(EARLY_STORAGE,JSON.stringify({email,requestId:data.requestId||null,registeredAt:new Date().toISOString(),status:"reviewing"}));
    if(data.accessToken)localStorage.setItem(TOKEN_KEY,data.accessToken);
    window.location.assign(data.dashboardUrl||"/manufacturer-early");
  }catch(error){
    show(error.message,"bad");
    $("#registerClient").disabled=false;
  }
});
})();
