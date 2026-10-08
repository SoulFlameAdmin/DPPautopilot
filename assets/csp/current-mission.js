(()=>{
  const host=document.getElementById('missionSteps');
  if(!host)return;
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
  const labels={green:'DONE',yellow:'NOW',red:'NEXT',blocked:'BLOCKED'};
  const icons={green:'✓',yellow:'•',red:'→',blocked:'!'};
  const render=(m)=>{
    document.getElementById('missionTitle').textContent=m.title||'Battery Client Pilot';
    document.getElementById('missionObjective').textContent=m.objective||'';
    document.getElementById('missionRule').textContent=m.rule||'';
    host.innerHTML=(m.steps||[]).map((s,i)=>`
      <article class="mission-step ${esc(s.status)}">
        <div class="mission-step-top">
          <span class="mission-index">${String(i+1).padStart(2,'0')}</span>
          <span class="mission-state">${icons[s.status]||'•'} ${labels[s.status]||esc(s.status)}</span>
        </div>
        <h3>${esc(s.title)}</h3>
        <p>${esc(s.detail)}</p>
        <div class="mission-evidence">${esc(s.evidence)}</div>
      </article>`).join('');
  };
  fetch('/data/current-mission.json?ts='+Date.now(),{cache:'no-store'})
    .then(r=>{if(!r.ok)throw new Error('mission '+r.status);return r.json()})
    .then(render)
    .catch(e=>{host.innerHTML='<div class="error">Current mission could not be loaded: '+esc(e.message)+'</div>'});
})();
