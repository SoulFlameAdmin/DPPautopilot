(() => {
  "use strict";

  const body=document.body;
  const title=document.getElementById("passportTitle");
  const state=document.getElementById("passportState");
  const identifierNode=document.getElementById("passportIdentifier");
  const content=document.getElementById("passportContent");
  const payloadNode=document.getElementById("publicPayload");
  const updatedNode=document.getElementById("passportUpdated");
  const errorBox=document.getElementById("passportError");
  const errorMessage=document.getElementById("passportErrorMessage");

  const params=new URLSearchParams(location.search);
  const identifier=(params.get("identifier")||"").trim();
  identifierNode.textContent=identifier||"—";

  function scalar(value){
    if(value===null) return "—";
    if(typeof value==="boolean") return value?"Да":"Не";
    if(typeof value==="number"||typeof value==="string") return String(value);
    return null;
  }

  function prettyKey(key){
    return String(key).replaceAll("_"," ").replace(/\b\w/g,m=>m.toUpperCase());
  }

  function renderObject(object,label){
    const box=document.createElement("section");
    box.className="node";
    if(label){
      const heading=document.createElement("strong");
      heading.textContent=prettyKey(label);
      box.appendChild(heading);
    }
    const dl=document.createElement("dl");
    for(const [key,value] of Object.entries(object||{})){
      const simple=scalar(value);
      if(simple!==null){
        const dt=document.createElement("dt");dt.textContent=prettyKey(key);
        const dd=document.createElement("dd");dd.textContent=simple;
        dl.append(dt,dd);
        continue;
      }
      if(Array.isArray(value)){
        const dt=document.createElement("dt");dt.textContent=prettyKey(key);
        const dd=document.createElement("dd");
        dd.textContent=value.every(v=>scalar(v)!==null)?value.map(v=>scalar(v)).join(", "):`${value.length} item(s)`;
        dl.append(dt,dd);
        if(value.some(v=>v&&typeof v==="object")){
          const nested=document.createElement("div");nested.className="nested";
          value.forEach((entry,index)=>{
            if(entry&&typeof entry==="object") nested.appendChild(renderObject(entry,`${key} #${index+1}`));
          });
          dl.appendChild(nested);
        }
        continue;
      }
      if(value&&typeof value==="object"){
        const nested=document.createElement("div");nested.className="nested";
        nested.appendChild(renderObject(value,key));
        dl.appendChild(nested);
      }
    }
    box.appendChild(dl);
    return box;
  }

  function fail(message){
    body.dataset.publicPassport="error";
    title.textContent="Паспортът не е наличен";
    state.textContent="Публичната проверка не завърши успешно.";
    content.hidden=true;
    errorBox.hidden=false;
    errorMessage.textContent=message;
  }

  async function load(){
    if(!identifier){fail("Липсва уникален идентификатор.");return;}
    try{
      const response=await fetch("/api/passport?identifier="+encodeURIComponent(identifier),{headers:{Accept:"application/json"}});
      const result=await response.json().catch(()=>({}));
      if(!response.ok||!result.data) throw new Error(result?.error?.message||"Паспортът не е намерен.");
      const p=result.data;
      if(p.unique_identifier!==identifier) throw new Error("Полученият паспорт не съвпада с идентификатора.");
      title.textContent="Battery Passport";
      state.textContent=p.status==="active"?"Активен публичен паспорт.":"Публичен паспорт.";
      identifierNode.textContent=p.unique_identifier;
      updatedNode.textContent=p.updated_at?"Updated: "+new Date(p.updated_at).toLocaleString():"";
      payloadNode.replaceChildren(renderObject(p.public_payload||{},"passport"));
      content.hidden=false;errorBox.hidden=true;
      body.dataset.publicPassport="ready";
    }catch(error){fail(error?.message||"Неуспешно зареждане.");}
  }
  load();
})();