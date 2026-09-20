'use strict';

const crypto=require('node:crypto');
const policy=require('../data/rate-limit-policy.json');

const buckets=new Map();
const DEFAULT_MAX_BUCKETS=10000;
const PRUNE_INTERVAL_MS=10000;
let lastPruneMs=0;

function firstHeader(req,name){
  if(!req||!req.headers) return '';
  const value=req.headers[name]??req.headers[name.toLowerCase()]??req.headers[name.toUpperCase()];
  if(Array.isArray(value)) return value[0]||'';
  return typeof value==='string'?value:'';
}

function normalizedIp(req){
  const forwarded=firstHeader(req,'x-forwarded-for');
  if(forwarded) return forwarded.split(',')[0].trim().slice(0,128)||'unknown';
  const real=firstHeader(req,'x-real-ip');
  if(real) return real.trim().slice(0,128)||'unknown';
  const socketIp=req&&req.socket&&typeof req.socket.remoteAddress==='string'?req.socket.remoteAddress:'';
  return socketIp.trim().slice(0,128)||'unknown';
}

function digest(value,length=32){
  return crypto.createHash('sha256').update(value).digest('hex').slice(0,length);
}

function authDigest(req){
  const auth=firstHeader(req,'authorization');
  if(!auth) return null;
  return digest(auth,24);
}

function networkDigest(req){
  return digest(normalizedIp(req),32);
}

function bucketIdentities(req){
  const identities=[`network:${networkDigest(req)}`];
  const credential=authDigest(req);
  if(credential) identities.push(`credential:${credential}`);
  return identities;
}

function sharedBucketKeys(req,surface,ruleName){
  return bucketIdentities(req).map(identity=>`${surface}|${ruleName}|${identity}`);
}

function classify(surface,req){
  const method=String(req&&req.method||'GET').toUpperCase();
  if(surface==='passport'&&method==='GET'&&req&&req.query&&req.query.identifier){
    return 'public_passport_read';
  }
  if(surface==='export') return 'export_read';
  if(surface==='imports'&&method!=='GET') return 'import_write';
  return method==='GET'?'authenticated_read':'authenticated_write';
}

function pruneBuckets(nowMs,maxBuckets=DEFAULT_MAX_BUCKETS,force=false,protectedKeys=[]){
  if(!force&&buckets.size<maxBuckets&&nowMs-lastPruneMs<PRUNE_INTERVAL_MS) return;

  const protectedSet=new Set(protectedKeys);
  for(const [key,state] of buckets){
    if(protectedSet.has(key)) continue;
    if(!state||!Number.isFinite(state.resetAt)||state.resetAt<=nowMs) buckets.delete(key);
  }

  while(buckets.size>maxBuckets){
    let evicted=false;
    for(const key of buckets.keys()){
      if(protectedSet.has(key)) continue;
      buckets.delete(key);
      evicted=true;
      break;
    }
    if(!evicted) break;
  }
  lastPruneMs=nowMs;
}

function incrementBucket(key,resetAt){
  const previousState=buckets.get(key);
  const previous=previousState&&Number.isInteger(previousState.count)?previousState.count:0;
  const count=previous+1;
  buckets.set(key,{count,resetAt});
  return count;
}

function sharedLimiterEnabled(env=process.env){
  return String(env&&env.DPP_SHARED_RATE_LIMIT_ENABLED||'').toLowerCase()==='true';
}

async function checkSharedRateLimit(req,surface,authorization,options={}){
  const env=options.env||process.env;
  const fetchImpl=options.fetchImpl||fetch;
  if(!authorization||!sharedLimiterEnabled(env)){
    return {enforced:false,allowed:true,reason:!authorization?'no_authorization':'feature_disabled'};
  }

  const ruleName=options.ruleName||classify(surface,req);
  if(ruleName==='public_passport_read'){
    return {enforced:false,allowed:true,reason:'public_anonymous_scope'};
  }
  const rule=(options.rules||policy.rules)[ruleName];
  if(!rule) return {enforced:true,allowed:false,error:true,status:503,code:'RATE_LIMIT_BACKEND_UNAVAILABLE'};

  const base=env.DPP_SUPABASE_URL||env.SUPABASE_URL;
  const key=env.DPP_SUPABASE_PUBLISHABLE_KEY||env.SUPABASE_ANON_KEY;
  if(!base||!key){
    return {enforced:true,allowed:false,error:true,status:503,code:'RATE_LIMIT_BACKEND_UNAVAILABLE'};
  }

  const now=new Date(Number.isFinite(options.nowMs)?options.nowMs:Date.now()).toISOString();
  const keys=sharedBucketKeys(req,surface,ruleName);
  try{
    const rows=await Promise.all(keys.map(async bucketKey=>{
      const response=await fetchImpl(`${base.replace(/\/$/,'')}/rest/v1/rpc/dpp_rate_limit_consume`,{
        method:'POST',
        headers:{
          apikey:key,
          Authorization:authorization,
          'Content-Type':'application/json',
          Accept:'application/json'
        },
        body:JSON.stringify({
          p_bucket_key:bucketKey,
          p_window_seconds:rule.window_seconds,
          p_limit:rule.limit,
          p_now:now
        })
      });
      if(!response.ok) throw new Error('SHARED_RATE_LIMIT_RPC_FAILED');
      const data=await response.json();
      const row=Array.isArray(data)?data[0]:data;
      if(!row||typeof row.allowed!=='boolean') throw new Error('SHARED_RATE_LIMIT_RESPONSE_INVALID');
      return row;
    }));

    return {
      enforced:true,
      allowed:rows.every(row=>row.allowed),
      ruleName,
      limit:rule.limit,
      remaining:Math.min(...rows.map(row=>Number(row.remaining)||0)),
      resetEpochSeconds:Math.max(...rows.map(row=>Number(row.reset_epoch_seconds)||0)),
      retryAfterSeconds:Math.max(...rows.map(row=>Number(row.retry_after_seconds)||0)),
      sharedBuckets:rows.length
    };
  }catch(_){
    return {enforced:true,allowed:false,error:true,status:503,code:'RATE_LIMIT_BACKEND_UNAVAILABLE'};
  }
}

async function enforceSharedRateLimit(req,res,surface,authorization,options={}){
  const decision=await checkSharedRateLimit(req,surface,authorization,options);
  if(decision.enforced&&!decision.error) applyRateLimitHeaders(res,decision);
  return decision;
}

function sharedRateLimitUnavailableBody(){
  return {error:{code:'RATE_LIMIT_BACKEND_UNAVAILABLE',message:'Request protection is temporarily unavailable.'}};
}

function checkRateLimit(req,surface,options={}){
  const ruleName=options.ruleName||classify(surface,req);
  const rules=options.rules||policy.rules;
  const rule=rules[ruleName];
  if(!rule) throw new Error(`RATE_LIMIT_RULE_MISSING:${ruleName}`);

  const nowMs=Number.isFinite(options.nowMs)?options.nowMs:Date.now();
  const windowMs=rule.window_seconds*1000;
  const windowStart=Math.floor(nowMs/windowMs)*windowMs;
  const resetAt=windowStart+windowMs;
  const requestedMaxBuckets=Number.isInteger(options.maxBuckets)&&options.maxBuckets>0
    ?options.maxBuckets
    :DEFAULT_MAX_BUCKETS;
  const identityKeys=bucketIdentities(req).map(
    identity=>`${surface}|${ruleName}|${identity}|${windowStart}`
  );
  const maxBuckets=Math.max(requestedMaxBuckets,identityKeys.length);

  pruneBuckets(nowMs,maxBuckets,false,identityKeys);

  const counts=identityKeys.map(key=>incrementBucket(key,resetAt));

  if(buckets.size>maxBuckets) pruneBuckets(nowMs,maxBuckets,true,identityKeys);

  const highestCount=Math.max(...counts);
  const remaining=Math.max(0,rule.limit-highestCount);
  const allowed=counts.every(count=>count<=rule.limit);
  const retryAfterSeconds=allowed?0:Math.max(1,Math.ceil((resetAt-nowMs)/1000));

  return {
    allowed,
    ruleName,
    limit:rule.limit,
    remaining,
    resetEpochSeconds:Math.ceil(resetAt/1000),
    retryAfterSeconds
  };
}

function applyRateLimitHeaders(res,decision){
  res.setHeader('X-RateLimit-Limit',String(decision.limit));
  res.setHeader('X-RateLimit-Remaining',String(decision.remaining));
  res.setHeader('X-RateLimit-Reset',String(decision.resetEpochSeconds));
  if(!decision.allowed) res.setHeader('Retry-After',String(decision.retryAfterSeconds));
}

function enforceRateLimit(req,res,surface,options={}){
  const decision=checkRateLimit(req,surface,options);
  applyRateLimitHeaders(res,decision);
  return decision;
}

function rateLimitBody(){
  return {error:{code:'RATE_LIMITED',message:'Too many requests. Retry later.'}};
}

function resetForTests(){
  buckets.clear();
  lastPruneMs=0;
}

module.exports={
  policy,
  classify,
  checkRateLimit,
  enforceRateLimit,
  checkSharedRateLimit,
  enforceSharedRateLimit,
  sharedRateLimitUnavailableBody,
  rateLimitBody,
  _test:{
    normalizedIp,
    authDigest,
    networkDigest,
    bucketIdentities,
    sharedBucketKeys,
    sharedLimiterEnabled,
    pruneBuckets,
    resetForTests,
    buckets,
    DEFAULT_MAX_BUCKETS,
    PRUNE_INTERVAL_MS
  }
};
