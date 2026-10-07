'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const source=fs.readFileSync(path.join(__dirname,'../../assets/csp/client-dashboard.js'),'utf8');

test('manufacturer onboarding client binds all eight stable question ids',()=>{
  for(let i=1;i<=8;i++)assert.match(source,new RegExp('onboardingQ'+i));
  assert.match(source,/configureDppSystem/);
});

test('manufacturer onboarding client uses authenticated same-origin backend',()=>{
  assert.match(source,/const ONBOARDING_ENDPOINT="\/api\/manufacturer-onboarding"/);
  assert.match(source,/Authorization:"Bearer "\+companySession\.access_token/);
  assert.match(source,/dpp_company_session_v1/);
});

test('answers are persisted before configure and restored from backend state',()=>{
  assert.match(source,/action:"answer"/);
  assert.match(source,/await flushAllAnswers\(\)/);
  assert.match(source,/const state=await manufacturerApi\(\)/);
  assert.match(source,/applyOnboardingState\(state\)/);
  assert.match(source,/action:"configure"/);
});

test('configuration progress is driven by returned backend steps',()=>{
  assert.match(source,/Array\.isArray\(configured\?\.steps\)/);
  assert.match(source,/step\.status==="done"\?"done":"error"/);
  assert.doesNotMatch(source,/setTimeout\([^)]*done/i);
});
