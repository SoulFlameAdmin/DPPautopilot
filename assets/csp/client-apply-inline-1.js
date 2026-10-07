(()=>{"use strict";
const $=s=>document.querySelector(s);
const ENDPOINT="https://soulflame-twins.vercel.app/api/dpp-dashboard-link";

function show(message,kind=""){
  const node=$("#result");
  node.textContent=message;
  node.className="result"+(kind?" "+kind:"");
}
function validEmail(value){
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value||"").trim());
}
async function requestDashboardLink(email){
  const response=await fetch(ENDPOINT,{
    method:"POST",
    headers:{"Content-Type":"application/json","Accept":"application/json"},
    body:JSON.stringify({action:"request_link",email}),
    cache:"no-store"
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data?.error||"Не успяхме да изпратим dashboard link.");
  return data;
}

$("#sendDashboardLink").addEventListener("click",async()=>{
  const email=$("#email").value.trim().toLowerCase();
  if(!validEmail(email)){
    show("Въведете валиден email адрес.","bad");
    return;
  }

  $("#sendDashboardLink").disabled=true;
  show("Изпращаме личния dashboard link от soulflame.dpp@gmail.com…");

  try{
    await requestDashboardLink(email);
    $("#sentCard").hidden=false;
    show("Готово. Проверете Inbox/Spam за писмо от soulflame.dpp@gmail.com.","ok");
    $("#sentCard").scrollIntoView({behavior:"smooth",block:"start"});
  }catch(error){
    show(error.message,"bad");
  }finally{
    $("#sendDashboardLink").disabled=false;
  }
});
})();