(() => {
  'use strict';
  const body=document.body;
  const status=document.getElementById('autopilotStatus');
  const params=new URLSearchParams(location.search);
  const forced=params.get('state');

  const text=(tag,value,className)=>{
    const el=document.createElement(tag);
    if(className)el.className=className;
    el.textContent=value;
    return el;
  };
  const clear=(el)=>{while(el.firstChild)el.removeChild(el.firstChild);};
  const fmt=(value)=>{
    if(value===null||value===undefined)return '—';
    if(typeof value==='object')return JSON.stringify(value);
    return String(value);
  };
  const pill=(value)=>{
    let cls='pill neutral';
    if(value==='approval_required'||value==='awaiting_response')cls='pill approval';
    if(value==='ready_for_safe_local_automation')cls='pill safe';
    if(value==='retry_wait')cls='pill retry';
    return text('span',value,cls);
  };
  const item=(title,state,meta,detail)=>{
    const el=document.createElement('div');
    el.className='queue-item';
    el.setAttribute('role','listitem');
    el.appendChild(text('div',title,'queue-title'));
    const m=document.createElement('div');m.className='queue-meta';
    if(state)m.appendChild(pill(state));
    (meta||[]).forEach(v=>m.appendChild(text('span',v)));
    el.appendChild(m);
    if(detail)el.appendChild(text('div',detail,'kv'));
    return el;
  };
  const empty=(target,label)=>{clear(target);target.appendChild(text('div',label,'empty'));};

  function render(data){
    const actions=Array.isArray(data.actionQueue)?data.actionQueue:[];
    const candidates=data.sourceDiscovery&&Array.isArray(data.sourceDiscovery.candidates)?data.sourceDiscovery.candidates:[];
    const suppliers=data.supplierQueue&&Array.isArray(data.supplierQueue.requests)?data.supplierQueue.requests:[];
    const registry=data.registryOrchestration||null;

    document.getElementById('actionCount').textContent=String(actions.length);
    document.getElementById('candidateCount').textContent=String(candidates.length);
    document.getElementById('supplierCount').textContent=String(suppliers.length);
    document.getElementById('registryState').textContent=registry?registry.status:'—';

    const actionEl=document.getElementById('actionQueue');clear(actionEl);
    actions.forEach(a=>actionEl.appendChild(item(
      a.fieldPath,a.state,[a.action,a.source,'priority '+a.priority],
      a.approvalRequired?'Human approval required':'Safe local automation candidate'
    )));
    if(!actions.length)empty(actionEl,'No open actions.');

    const sourceEl=document.getElementById('sourceQueue');clear(sourceEl);
    candidates.forEach(c=>{
      const p=c.provenance||{};
      sourceEl.appendChild(item(
        c.fieldPath,c.state,[c.adapter,'confidence '+fmt(p.confidence)],
        'document '+fmt(p.documentId)+' · extractor '+fmt(p.extractor)+' · value '+fmt(c.value)
      ));
    });
    if(!candidates.length)empty(sourceEl,'No source candidates.');

    const supplierEl=document.getElementById('supplierQueue');clear(supplierEl);
    suppliers.forEach(s=>supplierEl.appendChild(item(
      s.fieldPath,s.state,['approval '+fmt(s.approvalReference),'receipt '+fmt(s.deliveryReceipt)],
      'externalDeliveryAllowed='+fmt(s.externalDeliveryAllowed)+' · audit events '+(Array.isArray(s.history)?s.history.length:0)
    )));
    if(!suppliers.length)empty(supplierEl,'No supplier requests.');

    const registryEl=document.getElementById('registryQueue');clear(registryEl);
    const retry=document.getElementById('retryState');
    if(registry){
      registryEl.appendChild(item(
        registry.provider,registry.status,[registry.environment,'attempts '+fmt(registry.attemptCount)],
        'externalReference '+fmt(registry.externalReference)+' · networkSubmissionAllowed='+fmt(registry.networkSubmissionAllowed)
      ));
      const re=registry.retryEvidence||{};
      retry.textContent='Retry evidence · '+fmt(re.errorCode)+' · next '+fmt(re.nextRetryAt);
      retry.hidden=registry.status!=='retry_wait';
    }else{
      empty(registryEl,'No registry orchestration.');
      retry.hidden=true;
    }

    const timeline=document.getElementById('auditTimeline');clear(timeline);
    const events=[];
    suppliers.forEach(s=>(s.history||[]).forEach((e,i)=>events.push({queue:'supplier',id:s.id,index:i,event:e})));
    if(registry)(registry.history||[]).forEach((e,i)=>events.push({queue:'registry',id:registry.id,index:i,event:e}));
    events.forEach(entry=>{
      const li=document.createElement('li');
      li.dataset.auditQueue=entry.queue;
      li.appendChild(text('strong',entry.queue+' · '+entry.event.event));
      li.appendChild(text('span',fmt(entry.event.from)+' → '+fmt(entry.event.to)+' · '+entry.id));
      timeline.appendChild(li);
    });
    if(!events.length){
      const li=document.createElement('li');li.textContent='No audit events.';timeline.appendChild(li);
    }

    body.dataset.autopilotReady='true';
    status.classList.remove('error');
    status.textContent='DAVID AUTOPILOT UI PASS · read-only queues · audit visible · retry visible · external side effects disabled';
  }

  function renderEmpty(){
    render({actionQueue:[],sourceDiscovery:{candidates:[]},supplierQueue:{requests:[]},registryOrchestration:null});
    status.textContent='DAVID AUTOPILOT UI EMPTY · deterministic empty state';
  }
  function renderError(message){
    ['actionQueue','sourceQueue','supplierQueue','registryQueue'].forEach(id=>empty(document.getElementById(id),'Unavailable.'));
    document.getElementById('retryState').hidden=true;
    clear(document.getElementById('auditTimeline'));
    body.dataset.autopilotReady='false';
    status.classList.add('error');
    status.textContent='DAVID AUTOPILOT UI ERROR · '+message;
  }

  if(forced==='loading'){
    status.textContent='DAVID AUTOPILOT UI LOADING';
    return;
  }
  if(forced==='empty'){renderEmpty();return;}
  if(forced==='error'){renderError('forced deterministic error state');return;}

  fetch('/data/david-autopilot-ui-demo.json',{cache:'no-store'})
    .then(r=>{if(!r.ok)throw new Error('fixture HTTP '+r.status);return r.json();})
    .then(data=>render(data))
    .catch(err=>renderError(err&&err.message?err.message:'fixture load failed'));
})();
