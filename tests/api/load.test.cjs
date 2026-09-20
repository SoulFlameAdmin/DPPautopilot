'use strict';
// T07_SYNTHETIC_LOAD_PRECURSOR_PASS

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {performance}=require('node:perf_hooks');

const models=require('../../api/models.js');
const items=require('../../api/items.js');
const passport=require('../../api/passport.js');
const imports=require('../../api/imports.js');
const exportApi=require('../../api/export.js');
const limiter=require('../../api/_rate_limit.js');
const policy=require('../../data/load-test-policy.json');

const UUID='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function makeRes(){
  return {
    statusCode:0,headers:{},body:'',
    setHeader(name,value){this.headers[String(name).toLowerCase()]=String(value);},
    end(value){this.body=value||'';}
  };
}
function request(method,{body=null,query={},token='load-token',ip='198.51.100.10'}={}){
  return {
    method,body,query,
    headers:{
      authorization:`Bearer ${token}`,
      'x-forwarded-for':ip
    }
  };
}
function rpcName(url){return String(url).split('/').pop();}
function p95(values){
  const sorted=[...values].sort((a,b)=>a-b);
  return sorted[Math.max(0,Math.ceil(sorted.length*0.95)-1)]||0;
}
async function pool(tasks,concurrency){
  let next=0;
  const workers=Array.from({length:concurrency},async()=>{
    while(true){
      const index=next++;
      if(index>=tasks.length) return;
      await tasks[index]();
    }
  });
  await Promise.all(workers);
}
function withEnv(){
  const oldUrl=process.env.SUPABASE_URL,oldKey=process.env.SUPABASE_ANON_KEY;
  process.env.SUPABASE_URL='https://example.supabase.co';
  process.env.SUPABASE_ANON_KEY='anon-key';
  return ()=>{
    if(oldUrl===undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL=oldUrl;
    if(oldKey===undefined) delete process.env.SUPABASE_ANON_KEY; else process.env.SUPABASE_ANON_KEY=oldKey;
  };
}
function silenceLogs(){
  const old={info:console.info,warn:console.warn,error:console.error};
  console.info=()=>{};console.warn=()=>{};console.error=()=>{};
  return ()=>Object.assign(console,old);
}
function writeReport(report){
  const dir=path.resolve('artifacts');
  fs.mkdirSync(dir,{recursive:true});
  fs.writeFileSync(path.join(dir,'t07-load-report.json'),JSON.stringify(report,null,2)+'\n');
}

test('synthetic multi-surface concurrency, import volume and overload budgets pass',async()=>{
  const restoreEnv=withEnv();
  const restoreLogs=silenceLogs();
  const originalFetch=global.fetch;
  limiter._test.resetForTests();

  let upstreamCalls=0;
  global.fetch=async(url,options)=>{
    upstreamCalls+=1;
    const rpc=rpcName(url);
    const body=JSON.parse(options.body||'{}');
    let data;
    switch(rpc){
      case 'dpp_api_models_list': data=[]; break;
      case 'dpp_api_items_list': data=[]; break;
      case 'dpp_api_passport_private':
        data={passport_id:UUID,status:'active',public_payload:{},private_payload:{},updated_at:'2026-09-19T00:00:00Z'};
        break;
      case 'dpp_api_import_get':
        data={import_id:UUID,status:'validated',row_count:1,error_count:0};
        break;
      case 'dpp_api_export_bundle':
        data={schema_version:1,organization_id:UUID,counts:{battery_models:0,battery_items:0,passports:0}};
        break;
      case 'dpp_api_import_create':
        data={import_id:UUID,status:'staged',staged_rows:body.p_rows.length};
        break;
      default:
        throw new Error(`unexpected load-test RPC ${rpc}`);
    }
    return {ok:true,async json(){return data;}};
  };

  const report={task:'T07',mode:policy.mode,profiles:{}};

  try{
    const profile=policy.profiles.multi_surface_concurrency;
    const specs=[];
    const surfaces=[
      ['models',models,()=>request('GET')],
      ['items',items,()=>request('GET')],
      ['passport',passport,()=>request('GET',{query:{id:UUID}})],
      ['imports',imports,()=>request('GET',{query:{id:UUID}})],
      ['export',exportApi,()=>request('GET')]
    ];
    let ordinal=0;
    for(const [surface,handler,makeReq] of surfaces){
      for(let i=0;i<profile.requests_per_surface;i++){
        const id=ordinal++;
        specs.push({surface,handler,makeReq:()=>{
          const req=makeReq();
          req.headers.authorization=`Bearer load-${surface}-${id}`;
          req.headers['x-forwarded-for']=`198.51.100.${(id%200)+1}`;
          return req;
        }});
      }
    }
    assert.equal(specs.length,profile.total_requests);

    const durations=[];
    const statuses=[];
    const wallStart=performance.now();
    const beforeUpstream=upstreamCalls;
    const tasks=specs.map(spec=>async()=>{
      const res=makeRes();
      const started=performance.now();
      await spec.handler(spec.makeReq(),res);
      durations.push(performance.now()-started);
      statuses.push(res.statusCode);
    });
    await pool(tasks,profile.concurrency);
    const wallMs=performance.now()-wallStart;
    const loadUpstream=upstreamCalls-beforeUpstream;
    const errors=statuses.filter(s=>s<200||s>=300).length;
    const errorRate=errors/statuses.length;
    const p95Ms=p95(durations);

    assert.equal(statuses.length,profile.total_requests);
    assert.equal(loadUpstream,profile.total_requests);
    assert.equal(errors,0);
    assert.ok(errorRate<=profile.max_error_rate);
    assert.ok(p95Ms<=profile.max_p95_ms,`p95 ${p95Ms}ms exceeded ${profile.max_p95_ms}ms`);
    assert.ok(wallMs<=profile.max_wall_ms,`wall ${wallMs}ms exceeded ${profile.max_wall_ms}ms`);

    report.profiles.multi_surface_concurrency={
      total_requests:statuses.length,
      concurrency:profile.concurrency,
      upstream_calls:loadUpstream,
      errors,
      error_rate:errorRate,
      p95_ms:Number(p95Ms.toFixed(3)),
      wall_ms:Number(wallMs.toFixed(3)),
      budgets:{max_error_rate:profile.max_error_rate,max_p95_ms:profile.max_p95_ms,max_wall_ms:profile.max_wall_ms},
      pass:true
    };

    limiter._test.resetForTests();
    const volume=policy.profiles.import_batch_volume;
    const rows=Array.from({length:volume.rows},(_,i)=>({
      normalized_model:{model_identifier:`LOAD-${i+1}`,manufacturer_name:'Load',category:'portable'},
      normalized_item:{unique_identifier:`urn:dpp:load:${i+1}`},
      validation_errors:[]
    }));
    let res=makeRes();
    let started=performance.now();
    await imports(request('POST',{body:{rows},token:'volume-token',ip:'203.0.113.9'}),res);
    const volumeElapsed=performance.now()-started;
    assert.equal(res.statusCode,volume.expected_status);
    const payload=JSON.parse(res.body);
    assert.equal(payload.data.staged_rows,volume.rows);
    assert.ok(volumeElapsed<=volume.max_elapsed_ms);
    report.profiles.import_batch_volume={
      rows:volume.rows,
      status:res.statusCode,
      elapsed_ms:Number(volumeElapsed.toFixed(3)),
      max_elapsed_ms:volume.max_elapsed_ms,
      pass:true
    };

    limiter._test.resetForTests();
    const overload=policy.profiles.same_client_read_overload;
    const overloadStatuses=[];
    const beforeOverloadUpstream=upstreamCalls;
    await Promise.all(Array.from({length:overload.requests},async()=>{
      const r=makeRes();
      await models(request('GET',{token:'same-client',ip:'192.0.2.44'}),r);
      overloadStatuses.push(r.statusCode);
    }));
    const successes=overloadStatuses.filter(s=>s===200).length;
    const limited=overloadStatuses.filter(s=>s===overload.expected_rate_limit_status).length;
    const overloadUpstream=upstreamCalls-beforeOverloadUpstream;
    assert.equal(successes,overload.expected_successes);
    assert.equal(limited,overload.expected_rate_limited);
    assert.equal(overloadUpstream,overload.expected_successes);
    report.profiles.same_client_read_overload={
      requests:overload.requests,
      successes,
      rate_limited:limited,
      upstream_calls:overloadUpstream,
      configured_budget:overload.configured_budget,
      pass:true
    };

    const shared=policy.profiles.shared_authenticated_concurrency;
    const sharedCounts=new Map();
    let sharedRpcCalls=0;
    const sharedFetch=async(_url,options)=>{
      sharedRpcCalls+=1;
      const body=JSON.parse(options.body||'{}');
      const key=body.p_bucket_key;
      const count=(sharedCounts.get(key)||0)+1;
      sharedCounts.set(key,count);
      const allowed=count<=body.p_limit;
      return {
        ok:true,
        async json(){
          return [{
            allowed,
            request_count:count,
            remaining:Math.max(0,body.p_limit-count),
            reset_epoch_seconds:1900000000,
            retry_after_seconds:allowed?0:30
          }];
        }
      };
    };
    const sharedReq=request('POST',{
      body:{model_identifier:'SHARED-LOAD',manufacturer_name:'Load',category:'portable',canonical_data:{}},
      token:'shared-concurrency-token',
      ip:'192.0.2.88'
    });
    const sharedDecisions=[];
    const sharedStart=performance.now();
    await pool(
      Array.from({length:shared.requests},()=>async()=>{
        const decision=await limiter.checkSharedRateLimit(
          sharedReq,
          shared.surface,
          sharedReq.headers.authorization,
          {
            env:{
              DPP_SHARED_RATE_LIMIT_ENABLED:'true',
              DPP_SUPABASE_URL:'https://example.supabase.co',
              DPP_SUPABASE_PUBLISHABLE_KEY:'publishable'
            },
            fetchImpl:sharedFetch,
            nowMs:1_800_000_000_000,
            ruleName:shared.rule
          }
        );
        sharedDecisions.push(decision);
      }),
      shared.concurrency
    );
    const sharedWallMs=performance.now()-sharedStart;
    const sharedAllowed=sharedDecisions.filter(d=>d.allowed===true).length;
    const sharedDenied=sharedDecisions.filter(d=>d.allowed===false&&!d.error).length;
    const sharedErrors=sharedDecisions.filter(d=>d.error).length;
    assert.equal(sharedAllowed,shared.expected_allowed);
    assert.equal(sharedDenied,shared.expected_denied);
    assert.equal(sharedErrors,0);
    assert.equal(sharedRpcCalls,shared.expected_shared_rpc_calls);
    assert.equal(sharedCounts.size,shared.expected_buckets_per_request);
    for(const count of sharedCounts.values()) assert.equal(count,shared.requests);
    report.profiles.shared_authenticated_concurrency={
      requests:shared.requests,
      concurrency:shared.concurrency,
      configured_budget:shared.configured_budget,
      allowed:sharedAllowed,
      denied:sharedDenied,
      backend_errors:sharedErrors,
      shared_rpc_calls:sharedRpcCalls,
      shared_bucket_count:sharedCounts.size,
      wall_ms:Number(sharedWallMs.toFixed(3)),
      pass:true
    };

    report.claim_boundary=policy.claim_boundary;
    report.remaining=policy.remaining;
    writeReport(report);
  }finally{
    global.fetch=originalFetch;
    restoreLogs();
    restoreEnv();
    limiter._test.resetForTests();
  }
});
