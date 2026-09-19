'use strict';

(function(){
  const params=new URLSearchParams(window.location.search);
  if(params.get('responsiveProbe')!=='1') return;

  function visible(el){
    const style=getComputedStyle(el);
    if(style.display==='none'||style.visibility==='hidden'||style.visibility==='collapse') return false;
    const rect=el.getBoundingClientRect();
    return rect.width>0&&rect.height>0;
  }

  function measure(){
    const root=document.documentElement;
    const body=document.body;
    const viewportWidth=Math.max(1,window.innerWidth||root.clientWidth||0);
    const viewportHeight=Math.max(1,window.innerHeight||root.clientHeight||0);
    const scrollWidth=Math.max(root.scrollWidth||0,body?.scrollWidth||0);
    const horizontalOverflow=scrollWidth>viewportWidth+1;

    let blockers=0;
    for(const el of document.querySelectorAll('body *')){
      if(!visible(el)) continue;
      const style=getComputedStyle(el);
      if(style.position!=='fixed') continue;
      const rect=el.getBoundingClientRect();
      if(rect.width>=viewportWidth*0.9&&rect.height>=viewportHeight*0.9){
        blockers+=1;
      }
    }

    body.dataset.responsiveProbe='true';
    body.dataset.responsiveReady='true';
    body.dataset.viewportWidth=String(viewportWidth);
    body.dataset.viewportHeight=String(viewportHeight);
    body.dataset.rootScrollWidth=String(scrollWidth);
    body.dataset.horizontalOverflow=String(horizontalOverflow);
    body.dataset.blockingOverlayCount=String(blockers);
  }

  window.addEventListener('load',()=>setTimeout(measure,900),{once:true});
  setTimeout(measure,1800);
})();
