'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'../..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('dedicated auth pages expose required registration/login/recovery fields',()=>{
  const register=read('live/register.html');
  const login=read('live/login.html');
  const forgot=read('live/forgot-password.html');

  for(const id of ['contactName','companyName','email','phone','registrationId','password','confirmPassword']){
    assert.match(register,new RegExp('id="'+id+'"'));
  }
  assert.match(login,/id="email"/);
  assert.match(login,/id="password"/);
  assert.match(login,/href="\/forgot-password"/);
  assert.match(forgot,/id="newPassword"/);
  assert.match(forgot,/id="confirmNewPassword"/);
  assert.match(forgot,/id="resetSubmit"/);
});

test('auth pages use shared external script and no inline executable script',()=>{
  for(const file of ['live/register.html','live/login.html','live/forgot-password.html']){
    const html=read(file);
    assert.match(html,/src="\/assets\/csp\/company-auth-pages\.js"/);
    assert.doesNotMatch(html,/<script(?![^>]*src=)[^>]*>/i);
  }
});

test('shared auth client preserves company metadata and routes successful sessions correctly',()=>{
  const js=read('assets/csp/company-auth-pages.js');
  for(const key of ['contact_name','company_name','phone','company_registration_id']){
    assert.match(js,new RegExp(key));
  }
  assert.match(js,/location\.assign\(active\?"\/dashboard":"\/company\?source=login"\)/);
  assert.match(js,/\/auth\/v1\/recover\?redirect_to=/);
  assert.match(js,/\/auth\/v1\/logout\?scope=global/);
  assert.match(js,/password!==confirmPassword/);
});

test('vercel exposes clean auth routes',()=>{
  const config=JSON.parse(read('vercel.json'));
  const routes=new Map(config.rewrites.map(item=>[item.source,item.destination]));
  assert.equal(routes.get('/register'),'/live/register');
  assert.equal(routes.get('/login'),'/live/login');
  assert.equal(routes.get('/forgot-password'),'/live/forgot-password');
});