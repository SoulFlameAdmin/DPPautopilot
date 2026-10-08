'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'../..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('early manufacturer onboarding is an eight-step full-screen free-answer wizard',()=>{
  const html=read('live/manufacturer-early.html');
  const js=read('assets/csp/manufacturer-early.js');
  const css=read('assets/csp/manufacturer-early.css');

  assert.match(html,/id="intakeScreen"/);
  assert.match(html,/id="questionStage"/);
  assert.match(html,/id="answerInput"/);
  assert.match(html,/id="configureStage"/);
  assert.match(css,/\.intake-screen\{position:fixed;inset:0/);

  for(const key of ['country','company','products','sku','annualVolume','users','systems','automation']){
    assert.match(js,new RegExp('key:"'+key+'"'));
  }
  assert.match(js,/ВЪПРОС "\+\(step\+1\)\+" ОТ "\+QUESTIONS\.length/);
});

test('each onboarding answer is persisted before moving forward',()=>{
  const js=read('assets/csp/manufacturer-early.js');
  assert.match(js,/api\("questionnaire_save",\{key:q\.key,answer\}\)/);
  assert.match(js,/if\(!await saveCurrent\(\)\)return/);
  assert.match(js,/saveLocalDraft\(\)/);
});

test('edited answers are persisted before navigating back',()=>{
  const js=read('assets/csp/manufacturer-early.js');
  assert.match(js,/async function back\(\)/);
  assert.match(js,/if\(current!==saved\)/);
  assert.match(js,/if\(!await saveCurrent\(\)\)return/);
  assert.match(js,/\$\("backQuestion"\)\.addEventListener\("click",\(\)=>back\(\)\)/);
});

test('server answers win over stale local draft data',()=>{
  const js=read('assets/csp/manufacturer-early.js');
  assert.match(js,/const serverValue=String\(answers\[q\.key\]\|\|""\)\.trim\(\)/);
  assert.match(js,/const draftValue=String\(draft\[q\.key\]\|\|""\)\.trim\(\)/);
  assert.match(js,/if\(!serverValue&&draftValue\)answers\[q\.key\]=draft\[q\.key\]/);
});

test('completion requires a real configuration before opening dashboard',()=>{
  const js=read('assets/csp/manufacturer-early.js');
  assert.match(js,/api\("questionnaire_submit",\{answers\}\)/);
  assert.match(js,/if\(!profile\.configuration\|\|!Object\.keys\(profile\.configuration\)\.length\)/);
  assert.match(js,/animateConfiguration/);
  assert.match(js,/setTimeout\(\(\)=>showDashboard\(\),500\)/);
  assert.match(js,/profile\.configuration&&Object\.keys\(profile\.configuration\)\.length/);
});

test('dashboard is hidden until onboarding/configuration is complete',()=>{
  const html=read('live/manufacturer-early.html');
  assert.match(html,/id="appSidebar"[^>]*hidden/);
  assert.match(html,/id="dashboardHome"[^>]*hidden/);
  assert.match(html,/AUTO-CONFIGURED/);
  assert.match(html,/Product \/ SKU/);
});

test('production tenant onboarding uses atomic organization ensure instead of list-then-create race',()=>{
  const js=read('assets/csp/manufacturer-early.js');
  assert.match(js,/organizationRpc\("dpp_api_organization_ensure"/);
  assert.doesNotMatch(js,/organizationRpc\("dpp_api_organization_create"/);
  assert.match(js,/p_name:String\(company\)\.slice\(0,200\)/);
  assert.match(js,/p_slug:slug/);
});
