'use strict';

(function(){
  const interactiveSelector='a[href],button,input:not([type="hidden"]),select,textarea,[tabindex]';

  function visible(el){
    const style=getComputedStyle(el);
    return style.display!=='none'&&style.visibility!=='hidden'&&Number(style.opacity)!==0&&el.getClientRects().length>0;
  }

  function labelledByText(el){
    const ids=String(el.getAttribute('aria-labelledby')||'').trim().split(/\s+/).filter(Boolean);
    return ids.map(id=>document.getElementById(id)?.textContent||'').join(' ').trim();
  }

  function accessibleName(el){
    const aria=String(el.getAttribute('aria-label')||'').trim();
    if(aria) return aria;
    const labelled=labelledByText(el);
    if(labelled) return labelled;
    if(el.id){
      const label=document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if(label&&label.textContent.trim()) return label.textContent.trim();
    }
    const wrapped=el.closest('label');
    if(wrapped&&wrapped.textContent.trim()) return wrapped.textContent.trim();
    if(el.matches('button,a[href]')){
      const text=String(el.textContent||'').trim();
      if(text) return text;
    }
    const title=String(el.getAttribute('title')||'').trim();
    if(title) return title;
    return '';
  }

  function parseColor(value){
    const match=String(value||'').match(/rgba?\(([^)]+)\)/i);
    if(!match) return null;
    const parts=match[1].split(',').map(x=>Number.parseFloat(x.trim()));
    if(parts.length<3||parts.slice(0,3).some(Number.isNaN)) return null;
    return {r:parts[0],g:parts[1],b:parts[2],a:parts.length>3&&!Number.isNaN(parts[3])?parts[3]:1};
  }

  function backgroundFor(el){
    let node=el;
    while(node&&node instanceof Element){
      const style=getComputedStyle(node);
      if(style.backgroundImage&&style.backgroundImage!=='none') return null;
      const bg=parseColor(style.backgroundColor);
      if(bg&&bg.a>=0.98) return bg;
      node=node.parentElement;
    }
    return parseColor(getComputedStyle(document.body).backgroundColor)||{r:255,g:255,b:255,a:1};
  }

  function linear(v){
    v/=255;
    return v<=0.04045?v/12.92:Math.pow((v+0.055)/1.055,2.4);
  }

  function luminance(c){
    return 0.2126*linear(c.r)+0.7152*linear(c.g)+0.0722*linear(c.b);
  }

  function contrast(fg,bg){
    const l1=luminance(fg),l2=luminance(bg);
    return (Math.max(l1,l2)+0.05)/(Math.min(l1,l2)+0.05);
  }

  function textContrastViolation(el){
    if(!visible(el)) return false;
    const text=String(el.textContent||'').trim();
    if(!text&&!el.matches('input,select,textarea,button')) return false;
    const style=getComputedStyle(el);
    const fg=parseColor(style.color),bg=backgroundFor(el);
    if(!fg||!bg||fg.a<0.98) return false;
    const size=Number.parseFloat(style.fontSize)||16;
    const weight=Number.parseInt(style.fontWeight,10)||400;
    const large=size>=24||(size>=18.66&&weight>=700);
    return contrast(fg,bg)<(large?3:4.5);
  }

  function run(){
    const ids=[...document.querySelectorAll('[id]')].map(el=>el.id).filter(Boolean);
    const seen=new Set(),duplicateIds=new Set();
    for(const id of ids){if(seen.has(id)) duplicateIds.add(id);seen.add(id);}

    const controls=[...document.querySelectorAll(interactiveSelector)].filter(el=>visible(el)&&!el.disabled);
    const unlabeled=controls.filter(el=>!accessibleName(el));
    const positiveTabindex=controls.filter(el=>Number.parseInt(el.getAttribute('tabindex')||'0',10)>0);

    let focusFailures=0;
    const previous=document.activeElement;
    for(const el of controls){
      if(el.getAttribute('tabindex')==='-1') continue;
      try{el.focus({preventScroll:true});if(document.activeElement!==el)focusFailures+=1;}catch{focusFailures+=1;}
    }
    try{previous&&previous.focus&&previous.focus({preventScroll:true});}catch{}

    const images=[...document.querySelectorAll('img')].filter(visible);
    const missingAlt=images.filter(img=>!img.hasAttribute('alt'));

    const contrastCandidates=[...document.querySelectorAll(
      'h1,h2,h3,p,a,button,label,input,select,textarea,td,th,strong,span,code,pre,.muted,.status,.result,.error,.ok,.warn'
    )];
    const contrastViolations=contrastCandidates.filter(textContrastViolation);

    const mainCount=document.querySelectorAll('main,[role="main"]').length;
    const h1Count=document.querySelectorAll('h1').length;
    const pass=
      mainCount>=1&&h1Count===1&&duplicateIds.size===0&&unlabeled.length===0&&
      positiveTabindex.length===0&&focusFailures===0&&missingAlt.length===0&&contrastViolations.length===0;

    Object.assign(document.body.dataset,{
      accessibilityProbe:'true',
      accessibilityReady:'true',
      a11yPass:String(pass),
      a11yMainCount:String(mainCount),
      a11yH1Count:String(h1Count),
      a11yDuplicateIdCount:String(duplicateIds.size),
      a11yInteractiveCount:String(controls.length),
      a11yUnlabeledCount:String(unlabeled.length),
      a11yPositiveTabindexCount:String(positiveTabindex.length),
      a11yFocusFailureCount:String(focusFailures),
      a11yMissingAltCount:String(missingAlt.length),
      a11yContrastViolationCount:String(contrastViolations.length),
      a11yFirstContrastTarget:contrastViolations[0]
        ? [contrastViolations[0].tagName.toLowerCase(),contrastViolations[0].id||'',contrastViolations[0].className||''].join('#').slice(0,160)
        : ''
    });
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',()=>setTimeout(run,250),{once:true});
  }else{
    setTimeout(run,250);
  }
})();
