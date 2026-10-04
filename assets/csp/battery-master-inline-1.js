(()=>{"use strict";
const host=document.querySelector("#planHost");
const green=document.querySelector("#greenCount");
const yellow=document.querySelector("#yellowCount");
const red=document.querySelector("#redCount");
const nextPoint=document.querySelector("#nextPoint");
const greenThrough=document.querySelector("#greenThrough");
const note=document.querySelector("#statusNote");
const gates=document.querySelector("#externalGates");
const search=document.querySelector("#planSearch");
let plan=null,activeFilter="all";

function statusLabel(status){return status==="green"?"GREEN":status==="yellow"?"YELLOW":"RED"}
function make(tag,cls,text){const e=document.createElement(tag);if(cls)e.className=cls;if(text!=null)e.textContent=text;return e}
function matches(task){
  if(activeFilter!=="all"&&task.status!==activeFilter)return false;
  const q=search.value.trim().toLocaleLowerCase("bg");
  if(!q)return true;
  return (String(task.id)+" "+task.title+" "+task.plain).toLocaleLowerCase("bg").includes(q);
}
function render(){
  if(!plan)return;
  host.replaceChildren();
  for(const phase of plan.phases){
    const tasks=plan.tasks.filter(t=>t.id>=phase.range[0]&&t.id<=phase.range[1]&&matches(t));
    if(!tasks.length)continue;
    const section=make("section","phase");
    const head=make("div","phase-head");
    const left=make("div");
    left.append(make("div","phase-range",phase.id+" · точки "+phase.range[0]+"–"+phase.range[1]),make("h2","",phase.title));
    const counts=make("div","phase-counts");
    for(const status of ["green","yellow","red"]){
      const n=tasks.filter(t=>t.status===status).length;
      if(n)counts.append(make("span","count-chip",statusLabel(status)+" "+n));
    }
    head.append(left,counts);
    const list=make("div","tasks");
    for(const task of tasks){
      const row=make("article","task"+(task.id===plan.sequentialProgress.next?" is-next":""));
      row.append(make("span","dot "+task.status),make("span","task-id","#"+task.id));
      const body=make("div");
      const title=make("div","task-title",task.title);
      if(task.id===plan.sequentialProgress.next)title.append(make("span","next-tag","следва по ред"));
      body.append(title,make("div","task-plain",task.plain));
      row.append(body);list.append(row);
    }
    section.append(head,list);host.append(section);
  }
  if(!host.children.length)host.append(make("div","empty","Няма точки по този филтър."));
}
async function init(){
  const r=await fetch("/data/scooter-battery-master-100.json",{cache:"no-store"});
  if(!r.ok)throw new Error("Master plan data unavailable.");
  plan=await r.json();
  green.textContent=String(plan.counts.green);
  yellow.textContent=String(plan.counts.yellow);
  red.textContent=String(plan.counts.red);
  nextPoint.textContent="#"+plan.sequentialProgress.next;
  greenThrough.textContent="По ред GREEN до #"+plan.sequentialProgress.greenThrough;
  note.textContent=plan.note+" · Обновено: "+plan.updatedAt;
  gates.replaceChildren();
  plan.externalAfter100.forEach((item,index)=>{
    const row=make("div","external-gate");
    row.append(make("b","",String(index+1)+"."),document.createTextNode(item));
    gates.append(row);
  });
  document.body.dataset.planReady="true";
  render();
}
document.querySelectorAll("[data-filter]").forEach(button=>button.addEventListener("click",()=>{
  activeFilter=button.dataset.filter;
  document.querySelectorAll("[data-filter]").forEach(b=>b.classList.toggle("active",b===button));
  render();
}));
search.addEventListener("input",render);
init().catch(error=>{
  document.body.dataset.planReady="error";
  note.textContent=error.message;
  host.replaceChildren(make("div","empty","Неуспешно зареждане на Battery Master Plan."));
});
})();