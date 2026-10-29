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
  show("Изпращаме линк за потвърждение на имейла…");

  try{
    const data=await registerClient(email);
    if(data.status!=="email_sent")throw new Error("Не успяхме да потвърдим изпращането на линка.");
    show("Изпратихме ви личен линк. Проверете входящата поща (и Spam), отворете линка и чак тогава ще влезете в Early Access dashboard.","ok");
  }catch(error){
    show(error.message,"bad");
  }finally{
    $("#registerClient").disabled=false;
  }
});
})();
