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

test('completion auto-configures and only then opens the dashboard',()=>{
  const js=read('assets/csp/manufacturer-early.js');
  assert.match(js,/api\("questionnaire_submit",\{answers\}\)/);
  assert.match(js,/animateConfiguration/);
  assert.match(js,/setTimeout\(\(\)=>showDashboard\(\),500\)/);
  assert.match(js,/profile\.status==="configured"/);
});

test('dashboard is hidden until onboarding/configuration is complete',()=>{
  const html=read('live/manufacturer-early.html');
  assert.match(html,/id="appSidebar"[^>]*hidden/);
  assert.match(html,/id="dashboardHome"[^>]*hidden/);
  assert.match(html,/AUTO-CONFIGURED/);
  assert.match(html,/Product \/ SKU/);
});