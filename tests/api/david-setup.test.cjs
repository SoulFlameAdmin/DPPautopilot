'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const handler=require('../../api/david-setup.js');
const {TOPICS,validAnswers,validReferral,geminiQuestion,configureAnswers,authorize}=handler._test;
const root=path.resolve(__dirname,'../..');

test('eight stable topics map to the tenant-backed onboarding RPC keys',()=>{
  assert.equal(TOPICS.length,8);
  assert.deepEqual(TOPICS.map(x=>x.key),Array.from({length:8},(_,i)=>'onboardingQ'+(i+1)));
  assert.ok(TOPICS.every(x=>x.title&&x.question.length>10));
});
test('approval refuses missing answers, injected keys and oversized values',()=>{
  const full=Object.fromEntries(TOPICS.map(x=>[x.key,'Producer factual answer '+x.key]));
  assert.equal(validAnswers(full,true),true);
  assert.equal(validAnswers({...full,onboardingQ9:'unsafe'},true),false);
  assert.equal(validAnswers({...full,onboardingQ1:''},true),false);
  assert.equal(validAnswers({...full,onboardingQ1:'a'.repeat(1801)},true),false);
  assert.equal(validAnswers(Object.fromEntries(Object.entries(full).slice(0,7)),true),false);
  assert.equal(validAnswers({},false),true);
  assert.equal(validReferral('ilko'),true);
  assert.equal(validReferral('ilko<script>'),false);
});
test('Gemini does not receive data unless an API key is configured, and discloses fallback',async()=>{
  let calls=0;
  const result=await geminiQuestion(1,{onboardingQ1:'Business privately owned'},{
    env:{},fetchImpl:async()=>{calls++;throw Error('should not be called')}
  });
  assert.equal(result.source,'template');
  assert.equal(calls,0);
});
test('Gemini requests structured question at fixed model endpoint without passing key in URL',async()=>{
  const urls=[];
  const fakeFetch=async(url,opts)=>{
    urls.push(String(url));
    assert.equal(opts.headers['x-goog-api-key'],'fake-test-key');
    const body=JSON.parse(opts.body);
    assert.equal(body.generationConfig.responseMimeType,'application/json');
    assert.ok(body.contents[0].parts[0].text.includes('Продукти'));
    return {ok:true,json:async()=>({candidates:[{content:{parts:[{text:JSON.stringify({
      question:'Каква химия използват вашите батерии и какъв е номиналният капацитет?',
      why:'Например литиево-йонна, 2 kWh.'
    })}]}}]})};
  };
  const result=await geminiQuestion(1,{},{
    env:{GEMINI_API_KEY:'fake-test-key',GEMINI_MODEL:'gemini-3.8-flash'},
    fetchImpl:fakeFetch
  });
  assert.equal(result.source,'gemini');
  assert.equal(urls.length,1);
  assert.ok(urls[0].startsWith('https://generativelanguage.googleapis.com/v1beta/models/'));
  assert.ok(!urls[0].includes('fake-test-key'));
});
test('tenant context refuses users without active company membership',async()=>{
  const config={env:{DPP_SUPABASE_URL:'https://example.supabase.co',DPP_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test'},
    fetchImpl:async()=>({ok:true,json:async()=>({active_organization_id:null,memberships:[]})})};
  await assert.rejects(()=>authorize('Bearer fake-user',config),/COMPANY_REQUIRED/);
});
test('approve writes all eight user-approved answers via tenant RPC, then configures last',async()=>{
  const calls=[];
  const options={env:{DPP_SUPABASE_URL:'https://example.supabase.co',DPP_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test'},
    fetchImpl:async(url,options)=>{
      calls.push({url,body:JSON.parse(options.body),auth:options.headers.Authorization});
      return {ok:true,json:async()=>({status:'configured',revision:1})};
    }};
  const answers=Object.fromEntries(TOPICS.map(t=>[t.key,'Approved answer for '+t.title]));
  const r=await configureAnswers(answers,'ilko','Bearer confirmed-company-user',options);
  assert.equal(r.status,'configured');
  assert.equal(calls.length,9);
  for(let i=0;i<8;i++){
    assert.ok(calls[i].url.endsWith('/rpc/dpp_api_manufacturer_onboarding_answer_upsert'));
    assert.equal(calls[i].body.p_question_key,'onboardingQ'+(i+1));
    assert.equal(calls[i].auth,'Bearer confirmed-company-user');
    assert.equal(calls[i].body.p_structured_value.source,'manufacturer_approved');
    assert.equal(calls[i].body.p_structured_value.referral_hint,i===0?'ilko':undefined);
  }
  assert.ok(calls[8].url.endsWith('/rpc/dpp_api_manufacturer_onboarding_configure'));
  assert.ok(!JSON.stringify(calls).includes('service_role'));
});
test('actual UI is CSP-safe and never requests a public QR for an unactivated draft',()=>{
  const html=fs.readFileSync(path.join(root,'live/setup.html'),'utf8');
  const js=fs.readFileSync(path.join(root,'assets/csp/david-setup.js'),'utf8');
  const api=fs.readFileSync(path.join(root,'api/david-setup.js'),'utf8');
  const start=fs.readFileSync(path.join(root,'live/start.html'),'utf8');
  const config=JSON.parse(fs.readFileSync(path.join(root,'vercel.json'),'utf8'));
  assert.ok(config.rewrites.some(r=>r.source==='/start'));
  assert.ok(config.rewrites.some(r=>r.source==='/setup'));
  assert.match(start,/8 кратки въпроса/);
  assert.match(html,/id="approveCheckbox"/);
  assert.match(html,/id="aiConsent"/);
  assert.match(html,/чернови паспорт/);
  assert.ok(!html.includes('<script>'));
  assert.ok(!js.includes('innerHTML'));
  assert.ok(!js.includes('/api/qr?identifier='));
  assert.ok(api.includes('source:\'manufacturer_approved\''));
  assert.ok(!api.includes('SUPABASE_SERVICE_ROLE_KEY'));
});
