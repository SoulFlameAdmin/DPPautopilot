'use strict';
// R09_OBSERVABILITY_PRECURSOR_PASS

const test=require('node:test');
const assert=require('node:assert/strict');
const obs=require('../../api/_observability.js');
const models=require('../../api/models.js');
const tenant=require('../../api/tenant.js');
const organizations=require('../../api/organizations.js');
const members=require('../../api/members.js');

function makeRes(){
  return {
    statusCode:0,
    headers:{},
    body:'',
    setHeader(name,value){this.headers[String(name).toLowerCase()]=String(value);},
    end(value){this.body=value||'';}
  };
}
function logger(){
  const lines={info:[],warn:[],error:[]};
  return {
    lines,
    info(v){lines.info.push(v);},
    warn(v){lines.warn.push(v);},
    error(v){lines.error.push(v);}
  };
}

test('preserves only a safe incoming request id and emits deterministic metadata',()=>{
  const res=makeRes();
  const log=logger();
  const req={
    method:'GET',
    headers:{
      'x-request-id':'client.req-1234',
      authorization:'Bearer top-secret-token'
    },
    query:{identifier:'urn:dpp:secret:identifier'}
  };
  const times=[1000,1025,1025];
  obs.startRequestObservability(req,res,'models',{logger:log,now:()=>times.shift()});
  res.statusCode=200;
  res.end(JSON.stringify({data:{private_payload:{secret:'never-log-me'}}}));

  assert.equal(res.headers['x-request-id'],'client.req-1234');
  assert.equal(log.lines.info.length,1);
  const event=JSON.parse(log.lines.info[0]);
  assert.deepEqual(event,{
    event:'dpp_http_request',
    timestamp_ms:1025,
    request_id:'client.req-1234',
    surface:'models',
    method:'GET',
    status:200,
    outcome:'success',
    duration_ms:25,
    auth_present:true,
    error_code:null
  });

  const raw=log.lines.info[0];
  assert.equal(raw.includes('top-secret-token'),false);
  assert.equal(raw.includes('urn:dpp:secret:identifier'),false);
  assert.equal(raw.includes('never-log-me'),false);
});

test('rejects unsafe request ids instead of reflecting log/control characters',()=>{
  const res=makeRes();
  const log=logger();
  const req={method:'GET',headers:{'x-request-id':'bad\nrequest\rid'}};
  obs.startRequestObservability(req,res,'items',{logger:log,now:()=>1000});
  res.statusCode=204;
  res.end('');

  const id=res.headers['x-request-id'];
  assert.match(id,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  assert.equal(id.includes('\n'),false);
  assert.equal(id.includes('\r'),false);
});

test('4xx logs stable public code only and does not log response message or body fields',()=>{
  const res=makeRes();
  const log=logger();
  const req={method:'POST',headers:{authorization:'Bearer secret-auth'},body:{password:'body-secret'}};
  obs.startRequestObservability(req,res,'imports',{logger:log,now:()=>1000});
  res.statusCode=422;
  res.end(JSON.stringify({error:{code:'VALIDATION_ERROR',message:'contains body-secret sensitive context'}}));

  assert.equal(log.lines.warn.length,1);
  const event=JSON.parse(log.lines.warn[0]);
  assert.equal(event.status,422);
  assert.equal(event.error_code,'VALIDATION_ERROR');
  assert.equal(event.auth_present,true);
  const raw=log.lines.warn[0];
  assert.equal(raw.includes('secret-auth'),false);
  assert.equal(raw.includes('body-secret'),false);
  assert.equal(raw.includes('sensitive context'),false);
});

test('5xx uses error severity without leaking upstream payload',()=>{
  const res=makeRes();
  const log=logger();
  const req={method:'GET',headers:{}};
  obs.startRequestObservability(req,res,'export',{logger:log,now:()=>1000});
  res.statusCode=502;
  res.end(JSON.stringify({error:{code:'UPSTREAM_ERROR',message:'database said token=secret'}}));
  assert.equal(log.lines.error.length,1);
  const event=JSON.parse(log.lines.error[0]);
  assert.equal(event.outcome,'server_error');
  assert.equal(event.error_code,'UPSTREAM_ERROR');
  assert.equal(log.lines.error[0].includes('database said'),false);
  assert.equal(log.lines.error[0].includes('secret'),false);
});

test('real models handler returns correlation header and redacted 401 structured event',async()=>{
  const res=makeRes();
  const originalWarn=console.warn;
  const captured=[];
  console.warn=(line)=>captured.push(String(line));
  try{
    await models({
      method:'GET',
      headers:{'x-request-id':'request-401-test'},
      query:{identifier:'must-not-appear'}
    },res);
  }finally{
    console.warn=originalWarn;
  }

  assert.equal(res.statusCode,401);
  assert.equal(res.headers['x-request-id'],'request-401-test');
  assert.equal(captured.length,1);
  const event=JSON.parse(captured[0]);
  assert.equal(event.surface,'models');
  assert.equal(event.status,401);
  assert.equal(event.error_code,'AUTH_REQUIRED');
  assert.equal(event.auth_present,false);
  assert.equal(captured[0].includes('must-not-appear'),false);
  assert.equal(captured[0].includes('Bearer authentication'),false);
});

test('real models validation path never logs bearer or submitted payload',async()=>{
  const res=makeRes();
  const originalWarn=console.warn;
  const captured=[];
  console.warn=(line)=>captured.push(String(line));
  try{
    await models({
      method:'POST',
      headers:{
        authorization:'Bearer ultra-secret-token',
        'x-request-id':'request-422-test'
      },
      body:{
        model_identifier:'',
        manufacturer_name:'Sensitive Manufacturer',
        category:'portable',
        canonical_data:{private_note:'secret-payload'}
      }
    },res);
  }finally{
    console.warn=originalWarn;
  }

  assert.equal(res.statusCode,422);
  assert.equal(captured.length,1);
  const event=JSON.parse(captured[0]);
  assert.equal(event.error_code,'VALIDATION_ERROR');
  assert.equal(event.auth_present,true);
  const raw=captured[0];
  for(const forbidden of ['ultra-secret-token','Sensitive Manufacturer','secret-payload','model_identifier']){
    assert.equal(raw.includes(forbidden),false,forbidden);
  }
});


test('real tenant handler emits correlated redacted 401 structured event',async()=>{
  const res=makeRes();
  const originalWarn=console.warn;
  const captured=[];
  console.warn=(line)=>captured.push(String(line));
  try{
    await tenant({
      method:'GET',
      headers:{'x-request-id':'tenant-401-test'},
      query:{organization_id:'must-not-appear'}
    },res);
  }finally{
    console.warn=originalWarn;
  }

  assert.equal(res.statusCode,401);
  assert.equal(res.headers['x-request-id'],'tenant-401-test');
  assert.equal(captured.length,1);
  const event=JSON.parse(captured[0]);
  assert.equal(event.surface,'tenant');
  assert.equal(event.status,401);
  assert.equal(event.error_code,'AUTH_REQUIRED');
  assert.equal(event.auth_present,false);
  assert.equal(captured[0].includes('must-not-appear'),false);
  assert.equal(captured[0].includes('Bearer authentication'),false);
});


test('logging sink failure never blocks the response',()=>{
  const res=makeRes();
  const req={
    method:'GET',
    headers:{'x-request-id':'logger-fail-1234',authorization:'Bearer never-log-this'}
  };
  const brokenLogger={
    info(){throw new Error('log transport unavailable');},
    warn(){throw new Error('log transport unavailable');},
    error(){throw new Error('log transport unavailable');}
  };

  obs.startRequestObservability(req,res,'models',{logger:brokenLogger,now:()=>1000});
  res.statusCode=200;
  assert.doesNotThrow(()=>res.end(JSON.stringify({data:{ok:true}})));
  assert.equal(res.body,JSON.stringify({data:{ok:true}}));
  assert.equal(res.headers['x-request-id'],'logger-fail-1234');
});


test('real onboarding handlers emit correlated redacted 401 events',async()=>{
  const originalWarn=console.warn;
  try{
    for(const [surface,handler,method] of [
      ['organizations',organizations,'POST'],
      ['members',members,'GET']
    ]){
      const captured=[];
      console.warn=(line)=>captured.push(String(line));
      const res=makeRes();
      await handler({
        method,
        headers:{'x-request-id':`${surface}-401-test`},
        body:{name:'Sensitive Org',slug:'sensitive-org',user_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'},
        query:{secret:'must-not-appear'}
      },res);
      assert.equal(res.statusCode,401);
      assert.equal(res.headers['x-request-id'],`${surface}-401-test`);
      assert.equal(captured.length,1);
      const event=JSON.parse(captured[0]);
      assert.equal(event.surface,surface);
      assert.equal(event.status,401);
      assert.equal(event.error_code,'AUTH_REQUIRED');
      assert.equal(event.auth_present,false);
      for(const forbidden of ['Sensitive Org','sensitive-org','must-not-appear','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa']){
        assert.equal(captured[0].includes(forbidden),false,forbidden);
      }
    }
  }finally{
    console.warn=originalWarn;
  }
});
