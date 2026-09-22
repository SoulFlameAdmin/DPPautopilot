const u02=window.DPPAsyncState;
    let PLAN=null;let activeFilter='all';
    const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
    function scrollToId(id){document.getElementById(id)?.scrollIntoView({behavior:'smooth',block:'start'})}
    function toggleMenu(){const m=document.getElementById('burgerMenu');const b=document.getElementById('menuToggle');const open=!m.classList.contains('open');m.classList.toggle('open',open);m.setAttribute('aria-hidden',String(!open));b.setAttribute('aria-expanded',String(open))}
    function closeMenu(){const m=document.getElementById('burgerMenu');const b=document.getElementById('menuToggle');m.classList.remove('open');m.setAttribute('aria-hidden','true');b.setAttribute('aria-expanded','false')}
    function openPlan(){document.getElementById('planOverlay').classList.add('open');document.getElementById('planOverlay').setAttribute('aria-hidden','false');document.body.classList.add('plan-open')}
    function closePlan(){document.getElementById('planOverlay').classList.remove('open');document.getElementById('planOverlay').setAttribute('aria-hidden','true');document.body.classList.remove('plan-open')}
    document.addEventListener('keydown',e=>{if(e.key==='Escape'){closePlan();closeMenu()}});
    document.addEventListener('click',e=>{const m=document.getElementById('burgerMenu');const b=document.getElementById('menuToggle');if(m.classList.contains('open')&&!m.contains(e.target)&&!b.contains(e.target))closeMenu()});
    function colorClass(status){return ['green','yellow','red','blocked'].includes(status)?status:'red'}
    function flattenTasks(){return PLAN?.gates?.flatMap(g=>g.tasks||[])||[]}
    function calc(g){const t=g.tasks||[];const green=t.filter(x=>x.status==='green').length;const pct=t.length?Math.round(green/t.length*100):0;return {total:t.length,green,pct}}
    function renderSummary(){const tasks=flattenTasks();const green=tasks.filter(x=>x.status==='green').length;const blocked=tasks.filter(x=>x.status==='blocked').length;const remaining=tasks.length-green;const pct=tasks.length?Math.round(green/tasks.length*100):0;overallPct.textContent=pct+'%';overallBar.className='pct-'+pct;greenCount.textContent=green;remainingCount.textContent=remaining;blockedCount.textContent=blocked}
    function renderGates(){const host=document.getElementById('gates');host.innerHTML='';const visible=(PLAN.gates||[]).filter(g=>g.id!=='FOUNDATION');visible.forEach((g,i)=>{const c=calc(g);const el=document.createElement('article');el.className='gate';el.dataset.stage=g.id;el.innerHTML=`<div class="gate-kicker">Етап ${i+1}</div><h3>${esc(g.label)}</h3><p>${esc(g.purpose)}</p><div class="gate-foot"><div class="gate-count"><span>${c.green}/${c.total} GREEN</span><span>${c.pct}%</span></div><div class="progress"><span class="pct-${c.pct}"></span></div></div>`;host.appendChild(el)})}
    function renderPlan(){if(!PLAN)return;const host=document.getElementById('planContent');host.innerHTML='';PLAN.gates.forEach(g=>{const tasks=(g.tasks||[]).filter(t=>activeFilter==='all'||t.status===activeFilter);if(!tasks.length)return;const c=calc(g);const phase=document.createElement('section');phase.className='phase';phase.dataset.phase=g.id;phase.innerHTML=`<div class="phase-head"><div class="phase-head-row"><div><h3>${esc(g.label)}</h3><div class="phase-purpose">${esc(g.purpose)}</div><div class="exit"><strong>Exit:</strong> ${esc(g.exitCriteria)}</div></div><div class="phase-score"><strong>${c.pct}%</strong><div class="phase-score-sub">${c.green}/${c.total} GREEN</div></div></div></div><div class="tasks">${tasks.map(t=>`<div class="task"><span class="task-status ${colorClass(t.status)}"></span><span class="task-id">${esc(t.id)}</span><div><div class="task-title">${esc(t.title)}</div><div class="task-evidence">${esc(t.evidence)}</div></div></div>`).join('')}</div>`;host.appendChild(phase)})}
    async function loadPlan(){try{const r=await fetch('/data/master-plan.json?ts='+Date.now(),{cache:'no-store'});if(!r.ok)throw new Error('plan '+r.status);PLAN=await r.json();renderSummary();renderGates();renderPlan();return true}catch(e){document.getElementById('planContent').innerHTML='<div class="error">Master plan could not be loaded: '+esc(e.message)+'</div>';return false}}
    async function loadWorker(){try{const r=await fetch('/data/worker-status.json?ts='+Date.now(),{cache:'no-store'});if(!r.ok)throw new Error('worker '+r.status);const w=await r.json();currentTask.textContent=w.currentTask||'—';lastCompleted.textContent=w.lastCompletedTask||'—';nextTask.textContent=w.nextTask||'—';workerMessage.textContent=w.message||'';workerStamp.textContent=(w.state||'unknown').toUpperCase()+' · '+(w.currentGate||'')+' · '+new Date(w.updatedAt).toLocaleString('bg-BG');const p=document.getElementById('workerPulse');p.classList.remove('state-working','state-blocked','state-idle');p.classList.add(w.state==='working'?'state-working':w.state==='blocked'?'state-blocked':'state-idle');return true}catch(e){currentTask.textContent='Worker status unavailable';workerMessage.textContent=e.message;workerPulse.classList.remove('state-working','state-idle');workerPulse.classList.add('state-blocked');return false}}
    document.getElementById('filters').addEventListener('click',e=>{if(!e.target.matches('.filter'))return;document.querySelectorAll('.filter').forEach(b=>b.classList.remove('active'));e.target.classList.add('active');activeFilter=e.target.dataset.filter;renderPlan()});
    (async()=>{
      const forced=u02.forced;
      if(forced&&forced!=='success'){
        const messages={
          loading:'Зареждане на master plan и worker status…',
          empty:'Няма master plan / worker данни за показване.',
          error:'Dashboard data could not be loaded.'
        };
        u02.set(forced,planContent,messages[forced]);
        currentTask.textContent=messages[forced];
        lastCompleted.textContent='—';nextTask.textContent='—';workerMessage.textContent='';
        workerStamp.textContent=forced.toUpperCase();
        if(forced==='empty'){gates.innerHTML='';overallPct.textContent='0%';greenCount.textContent='0';remainingCount.textContent='0';blockedCount.textContent='0'}
        return;
      }
      u02.set('loading',planContent,'Зареждане на master plan…');
      const [planOk,workerOk]=await Promise.all([loadPlan(),loadWorker()]);
      u02.set(planOk&&workerOk?'success':'error',planContent);
      if(new URLSearchParams(location.search).get('plan')==='open')openPlan();
      setInterval(loadWorker,20000);setInterval(loadPlan,60000);
    })();
