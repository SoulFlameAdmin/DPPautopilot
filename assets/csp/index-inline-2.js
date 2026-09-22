(()=>{
  const pairs=[
    ["Меню","Menu"],["Етапи","Stages"],["Граници на продукта","Product boundaries"],["DAVID Worker","DAVID Worker"],
    ["Models","Модели"],["Items","Батерии"],["Imports","Импорти"],["Passports","Паспорти"],["Settings","Настройки"],["Pilot onboarding","Пилотно внедряване"],
    ["Етапи от canonical master plan: Demo → MVP/Data/Auth/API → UX → Security/Privacy/Ops → Testing → Release/Acceptance → Expansion.","Stages from the canonical master plan: Demo → MVP/Data/Auth/API → UX → Security/Privacy/Ops → Testing → Release/Acceptance → Expansion."],
    ["Battery Digital Product Passport Automation","Автоматизация на цифров паспорт за батерии"],
    ["От battery data до контролиран цифров продуктов паспорт.","From battery data to a controlled digital product passport."],
    ["DPP Autopilot следва едно правило: GREEN означава реална имплементация, приложим PASS тест и конкретно evidence. DAVID Worker показва текущата задача, а „Етапи“ отваря пълния технически master plan.","DPP Autopilot follows one rule: GREEN means real implementation, an applicable PASS test and concrete evidence. DAVID Worker shows the current task, while “Stages” opens the complete technical master plan."],
    ["Отвори „Етапи“","Open Stages"],["Виж границите","View boundaries"],["зареждане…","loading…"],["Текуща задача","Current task"],["Зареждане на worker status…","Loading worker status…"],["Последно завършена","Last completed"],["Следваща","Next"],
    ["Състояние на разработката","Development status"],["Данните идват директно от machine-readable master plan.","Data comes directly from the machine-readable master plan."],
    ["GREEN = доказано","GREEN = proven"],["YELLOW = частично","YELLOW = partial"],["RED = незавършено","RED = unfinished"],["Общо доказано изпълнение","Overall proven completion"],["GREEN задачи","GREEN tasks"],["Оставащи / частични","Remaining / partial"],["Външни blockers","External blockers"],["Видими продуктови граници","Visible product boundaries"],
    ["DPP Autopilot · source of truth: docs/MASTER_AUTOPILOT_PLAN.md · Compliance твърдения се правят само при актуална регулаторна и техническа проверка.","DPP Autopilot · source of truth: docs/MASTER_AUTOPILOT_PLAN.md · Compliance claims are made only after current regulatory and technical verification."],
    ["Engineering control room","Инженерен контролен център"],["DPP Autopilot · Етапи","DPP Autopilot · Stages"],["✕ Затвори","✕ Close"],["Всички","All"],["Зареждане на master plan…","Loading master plan…"],["Exit:","Изход:"]
  ];
  const toEn=new Map(pairs.map(([bg,en])=>[bg,en]));
  const toBg=new Map(pairs.flatMap(([bg,en])=>[[en,bg],[bg,bg]]));
  function mapText(value,lang){
    const trimmed=value.trim(); if(!trimmed) return value;
    const mapped=(lang==="en"?toEn:toBg).get(trimmed); if(!mapped) return value;
    return value.replace(trimmed,mapped);
  }
  let observer=null;
  let applying=false;
  function apply(lang){
    if(applying) return;
    applying=true;
    if(observer) observer.disconnect();
    try{
      document.documentElement.lang=lang;
      localStorage.setItem("dpp-language",lang);
      const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
      let n; while((n=walker.nextNode())){
        const tag=n.parentElement?.tagName;
        if(tag==="SCRIPT"||tag==="STYLE"||tag==="NOSCRIPT") continue;
        const next=mapText(n.nodeValue,lang);
        if(next!==n.nodeValue) n.nodeValue=next;
      }
      document.querySelectorAll("[data-lang-toggle]").forEach(b=>{
        const text=lang==="bg"?"BG / EN":"EN / BG";
        const title=lang==="bg"?"Смени на English":"Switch to Български";
        if(b.textContent!==text) b.textContent=text;
        if(b.title!==title) b.title=title;
      });
    }finally{
      applying=false;
      if(observer) observer.observe(document.body,{childList:true,subtree:true});
    }
  }
  const initial=localStorage.getItem("dpp-language")==="en"?"en":"bg";
  document.addEventListener("click",e=>{
    const b=e.target.closest("[data-lang-toggle]"); if(!b) return;
    apply(document.documentElement.lang==="bg"?"en":"bg");
  });
  observer=new MutationObserver(()=>apply(document.documentElement.lang==="en"?"en":"bg"));
  window.addEventListener("DOMContentLoaded",()=>apply(initial));
})();
