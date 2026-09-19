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

function authDigest(req){
  const auth=firstHeader(req,'authorization');
  if(!auth) return 'anon';
  return crypto.createHash('sha256').update(auth).digest('hex').slice(0,24);
}

function identityDigest(req){
  const material=`${normalizedIp(req)}|${authDigest(req)}`;
  return crypto.createHash('sha256').update(material).digest('hex').slice(0,32);
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

function pruneBuckets(nowMs,maxBuckets=DEFAULT_MAX_BUCKETS,force=false){
  if(!force&&buckets.size<maxBuckets&&nowMs-lastPruneMs<PRUNE_INTERVAL_MS) return;

  for(const [key,state] of buckets){
    if(!state||!Number.isFinite(state.resetAt)||state.resetAt<=nowMs) buckets.delete(key);
  }

  while(buckets.size>maxBuckets){
    const oldest=buckets.keys().next().value;
    if(oldest===undefined) break;
    buckets.delete(oldest);
  }
  lastPruneMs=nowMs;
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
  const maxBuckets=Number.isInteger(options.maxBuckets)&&options.maxBuckets>0
    ?options.maxBuckets
    :DEFAULT_MAX_BUCKETS;

  pruneBuckets(nowMs,maxBuckets,false);

  const identity=identityDigest(req);
  const key=`${surface}|${ruleName}|${identity}|${windowStart}`;
  const previousState=buckets.get(key);
  const previous=previousState&&Number.isInteger(previousState.count)?previousState.count:0;
  const count=previous+1;
  buckets.set(key,{count,resetAt});

  if(buckets.size>maxBuckets) pruneBuckets(nowMs,maxBuckets,true);

  const remaining=Math.max(0,rule.limit-count);
  const allowed=count<=rule.limit;
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
  rateLimitBody,
  _test:{
    normalizedIp,
    authDigest,
    identityDigest,
    pruneBuckets,
    resetForTests,
    buckets,
    DEFAULT_MAX_BUCKETS,
    PRUNE_INTERVAL_MS
  }
};
