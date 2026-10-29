'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'../..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

test('public Early Access application requires email proof before dashboard entry',()=>{
  const js=read('assets/csp/client-apply-inline-1.js');
  const html=read('live/apply.html');
  assert.match(js,/action:"new_client"/);
  assert.match(js,/data\.status!=="email_sent"/);
  assert.match(js,/Проверете входящата поща/);
  assert.doesNotMatch(js,/window\.location\.assign|accessToken|dashboardUrl|localStorage\.setItem|sessionStorage\.setItem/);
  assert.match(html,/Отворете личния линк от пощата си/);
  assert.match(html,/Достъпът се активира само след потвърждение/);
  assert.doesNotMatch(html,/не чакаме email потвърждение|влизате директно/);
});


test('legacy manufacturer early access does not treat an email in localStorage as login',()=>{
  const entry=read('assets/csp/manufacturer-entry.js');
  const real=read('assets/csp/manufacturer-inline-1.js');
  assert.match(entry,/params\.get\("early"\)==="1"/);
  assert.match(entry,/location\.replace\("\/apply"\)/);
  assert.doesNotMatch(entry,/readEarlyClient|showEarlyAccess|localStorage\.getItem|dpp_early_access_client_v1/);
  assert.match(entry,/loadProductionDashboard/);
  assert.match(real,/sessionStorage\.getItem/);
});
