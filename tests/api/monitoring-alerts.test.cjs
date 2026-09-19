'use strict';
// R10_MONITORING_ALERT_PRECURSOR_PASS

const test=require('node:test');
const assert=require('node:assert/strict');
const monitoring=require('../../api/_monitoring.js');
const policy=require('../../data/monitoring-alert-policy.json');

const NOW=1_800_000_000_000;

function event(index,overrides={}){
  return {
    event:'dpp_http_request',
    timestamp_ms:NOW-60_000+index*100,
    request_id:`req-${String(index).padStart(8,'0')}`,
    surface:'models',
    method:'GET',
    status:200,
    outcome:'success',
    duration_ms:100,
    auth_present:true,
    error_code:null,
    ...overrides
  };
}

function alert(result,id){
  const found=result.alerts.find(a=>a.signal_id===id);
  assert.ok(found,`missing alert ${id}`);
  return found;
}

test('policy defines owners, five signals and no live delivery claim',()=>{
  assert.equal(policy.status,'partial');
  assert.equal(policy.input_event,'dpp_http_request');
  assert.equal(policy.evaluation_window_seconds,300);
  assert.equal(policy.signals.length,5);
  assert.equal(policy.delivery.live_delivery_configured,false);
  for(const signal of policy.signals){
    assert.ok(signal.owner);
    assert.ok(['critical','warning'].includes(signal.severity));
    assert.ok(signal.minimum_requests>=5);
  }
});

test('critical availability alert fires at 5 percent 5xx rate with enough samples',()=>{
  const events=Array.from({length:20},(_,i)=>event(i));
  events[19]=event(19,{status:502,outcome:'server_error',error_code:'UPSTREAM_ERROR'});
  const result=monitoring.evaluateMonitoring(events,{nowMs:NOW});
  const a=alert(result,'availability_5xx_rate');
  assert.equal(a.active,true);
  assert.equal(a.severity,'critical');
  assert.equal(a.owner,'DPP operations owner');
  assert.equal(a.sample_count,20);
  assert.equal(a.value,0.05);
});

test('availability alert stays clear below threshold and below minimum sample size',()=>{
  let events=Array.from({length:20},(_,i)=>event(i));
  let result=monitoring.evaluateMonitoring(events,{nowMs:NOW});
  assert.equal(alert(result,'availability_5xx_rate').active,false);

  events=Array.from({length:10},(_,i)=>event(i,{
    status:i===9?500:200,
    outcome:i===9?'server_error':'success',
    error_code:i===9?'UPSTREAM_ERROR':null
  }));
  result=monitoring.evaluateMonitoring(events,{nowMs:NOW});
  const a=alert(result,'availability_5xx_rate');
  assert.equal(a.value,0.1);
  assert.equal(a.active,false);
  assert.equal(a.sample_count,10);
});

test('five consecutive 5xx failures fire the acute critical signal',()=>{
  const events=[
    ...Array.from({length:5},(_,i)=>event(i)),
    ...Array.from({length:5},(_,i)=>event(i+5,{status:503,outcome:'server_error',error_code:'UPSTREAM_ERROR'}))
  ];
  const result=monitoring.evaluateMonitoring(events,{nowMs:NOW});
  const a=alert(result,'consecutive_5xx');
  assert.equal(a.active,true);
  assert.equal(a.value,5);
  assert.equal(a.severity,'critical');
});

test('an intervening successful response breaks a 5xx streak',()=>{
  const events=[
    event(0,{status:500,outcome:'server_error',error_code:'UPSTREAM_ERROR'}),
    event(1,{status:500,outcome:'server_error',error_code:'UPSTREAM_ERROR'}),
    event(2,{status:200,outcome:'success',error_code:null}),
    event(3,{status:500,outcome:'server_error',error_code:'UPSTREAM_ERROR'}),
    event(4,{status:500,outcome:'server_error',error_code:'UPSTREAM_ERROR'})
  ];
  const result=monitoring.evaluateMonitoring(events,{nowMs:NOW});
  const a=alert(result,'consecutive_5xx');
  assert.equal(a.value,2);
  assert.equal(a.active,false);
});

test('p95 latency warning fires at 2000ms threshold',()=>{
  const events=Array.from({length:20},(_,i)=>event(i,{duration_ms:i<18?500:2500}));
  const result=monitoring.evaluateMonitoring(events,{nowMs:NOW});
  const a=alert(result,'latency_p95');
  assert.equal(a.active,true);
  assert.equal(a.value,2500);
  assert.equal(a.owner,'DPP platform owner');
});

test('auth failure warning fires at 30 percent using stable public codes',()=>{
  const events=Array.from({length:20},(_,i)=>event(i,{
    status:i<6?401:200,
    outcome:i<6?'client_error':'success',
    error_code:i<6?'AUTH_REQUIRED':null
  }));
  const result=monitoring.evaluateMonitoring(events,{nowMs:NOW});
  const a=alert(result,'auth_failure_rate');
  assert.equal(a.active,true);
  assert.equal(a.value,0.3);
});

test('rate-limit pressure warning fires at 20 percent',()=>{
  const events=Array.from({length:20},(_,i)=>event(i,{
    status:i<4?429:200,
    outcome:i<4?'client_error':'success',
    error_code:i<4?'RATE_LIMITED':null
  }));
  const result=monitoring.evaluateMonitoring(events,{nowMs:NOW});
  const a=alert(result,'rate_limit_pressure');
  assert.equal(a.active,true);
  assert.equal(a.value,0.2);
});

test('events older than the five-minute window are ignored',()=>{
  const old=Array.from({length:20},(_,i)=>event(i,{
    timestamp_ms:NOW-301_000-i,
    status:500,
    outcome:'server_error',
    error_code:'UPSTREAM_ERROR'
  }));
  const current=Array.from({length:20},(_,i)=>event(i+30));
  const result=monitoring.evaluateMonitoring([...old,...current],{nowMs:NOW});
  assert.equal(result.sample_count,20);
  assert.equal(alert(result,'availability_5xx_rate').active,false);
  assert.equal(alert(result,'consecutive_5xx').active,false);
});

test('malformed and non-R09 events cannot influence alert calculations',()=>{
  const events=Array.from({length:20},(_,i)=>event(i));
  events.push({
    event:'other',
    timestamp_ms:NOW,
    request_id:'bad-event',
    surface:'models',
    status:500,
    duration_ms:9999
  });
  events.push({
    event:'dpp_http_request',
    timestamp_ms:NOW,
    request_id:'bad-duration',
    surface:'models',
    status:500,
    duration_ms:-1
  });
  const result=monitoring.evaluateMonitoring(events,{nowMs:NOW});
  assert.equal(result.sample_count,20);
  assert.equal(alert(result,'availability_5xx_rate').active,false);
});


test('rejects malformed status surface request id and outcome',()=>{
  const baseline=Array.from({length:20},(_,i)=>event(i));
  const poisoned=[
    event(100,{status:999}),
    event(101,{surface:'untrusted-surface'}),
    event(102,{request_id:'x'}),
    event(103,{status:500,outcome:'success',error_code:'UPSTREAM_ERROR'}),
    event(104,{auth_present:'yes'}),
    event(105,{error_code:'bad-code!'}),
  ];
  const result=monitoring.evaluateMonitoring([...baseline,...poisoned],{nowMs:NOW});
  assert.equal(result.sample_count,20);
  assert.equal(alert(result,'availability_5xx_rate').active,false);
  assert.equal(alert(result,'auth_failure_rate').active,false);
  assert.equal(alert(result,'rate_limit_pressure').active,false);
});
