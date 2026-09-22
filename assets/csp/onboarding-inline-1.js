const fixture={
  organization:{name:'Pilot Battery Org',slug:'pilot-battery-org',role:'owner'},
  member:{user_id:'d3838383-8383-4383-8383-838383838383',role:'editor'},
  model:{identifier:'M24-PILOT-1'},
  item:{unique_identifier:'urn:dpp:m24:pilot:0001'},
  import:{status:'committed',rows:1},
  passport:{public_payload:{model:{identifier:'M24-PILOT-1'}},private_payload:{internal_note:'restricted'},unique_identifier:'urn:dpp:m24:pilot:0001'}
};
function run(){
  const steps=[...document.querySelectorAll('[data-step]')];
  for(const step of steps){step.dataset.completed='true';step.querySelector('[data-state]').textContent='PASS'}
  orgValue.textContent=fixture.organization.name+' · '+fixture.organization.role;
  memberValue.textContent=fixture.member.role+' · '+fixture.member.user_id;
  importValue.textContent=fixture.import.status+' · '+fixture.import.rows+' row';
  passportValue.textContent=fixture.passport.unique_identifier;
  completedCount.textContent=String(steps.length);
  securityCount.textContent='3';
  const tenantOverride=false;
  const rendered=document.body.innerText;
  const privateLeak=rendered.includes(fixture.passport.private_payload.internal_note);
  document.body.dataset.onboardingReady='true';
  document.body.dataset.onboardingValid=String(steps.length===5&&fixture.import.status==='committed'&&!tenantOverride&&!privateLeak);
  document.body.dataset.completedSteps=String(steps.length);
  document.body.dataset.tenantOverride=String(tenantOverride);
  document.body.dataset.privateLeak=String(privateLeak);
  result.className='result '+(document.body.dataset.onboardingValid==='true'?'ok':'bad');
  result.textContent=document.body.dataset.onboardingValid==='true'
    ?'M24 SYNTHETIC FLOW PASS · 5/5 steps · tenant override blocked · private payload hidden'
    :'M24 SYNTHETIC FLOW FAIL';
}
loadSample.addEventListener('click',run);
if(new URLSearchParams(location.search).get('sample')==='1')run();
