'use strict';

(function(){
  const allowed=new Set(['loading','empty','success','error']);
  const raw=new URLSearchParams(window.location.search).get('state');
  const forced=allowed.has(raw)?raw:null;

  function set(state,target,message){
    if(!allowed.has(state)) throw new Error('U02_INVALID_ASYNC_STATE');
    document.body.dataset.asyncState=state;
    if(target){
      target.dataset.asyncState=state;
      target.setAttribute('aria-busy',state==='loading'?'true':'false');
      if(message!==undefined) target.textContent=message;
    }
    return state;
  }

  function gate(target,messages={}){
    if(!forced||forced==='success') return false;
    const defaults={
      loading:'Зареждане…',
      empty:'Няма данни за показване.',
      error:'Данните не могат да бъдат заредени.'
    };
    set(forced,target,messages[forced]||defaults[forced]);
    return true;
  }

  document.body.dataset.asyncState='loading';
  window.DPPAsyncState={forced,set,gate,states:[...allowed]};
})();
