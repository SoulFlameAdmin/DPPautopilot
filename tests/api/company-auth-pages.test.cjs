'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'../..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('pilot auth surface is Google-only',()=>{
  const html=read('live/apply.html');
  assert.match(html,/id="googleLogin"/);
  assert.match(html,/Продължи с Google/);
  assert.doesNotMatch(html,/type="password"/i);
  assert.doesNotMatch(html,/id="email"/i);
});

test('Google auth page uses external CSP-safe scripts and styles',()=>{
  const html=read('live/apply.html');
  assert.match(html,/src="\/assets\/csp\/client-apply-inline-1\.js"/);
  assert.match(html,/href="\/assets\/csp\/google-access\.css"/);
  assert.doesNotMatch(html,/<script(?![^>]*src=)[^>]*>/i);
});

test('Google auth client persists session and opens DPP dashboard',()=>{
  const js=read('assets/csp/client-apply-inline-1.js');
  assert.match(js,/provider","google"/);
  assert.match(js,/\/auth\/v1\/user/);
  assert.match(js,/grant_type=refresh_token/);
  assert.match(js,/dpp_google_session_v1/);
  assert.match(js,/localStorage\.setItem\(GOOGLE_SESSION_KEY/);
  assert.match(js,/action:"new_client"/);
  assert.match(js,/manufacturer-early#access=/);
});

test('all public auth entry routes use the Google-only pilot surface',()=>{
  const config=JSON.parse(read('vercel.json'));
  const routes=new Map(config.rewrites.map(item=>[item.source,item.destination]));
  assert.equal(routes.get('/register'),'/live/apply');
  assert.equal(routes.get('/login'),'/live/apply');
  assert.equal(routes.get('/forgot-password'),'/live/apply');
  assert.equal(routes.get('/apply'),'/live/apply');
});