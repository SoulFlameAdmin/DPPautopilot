'use strict';

const policy=require('../data/monitoring-alert-policy.json');
const observabilityPolicy=require('../data/observability-policy.json');

const ALLOWED_SURFACES=new Set(observabilityPolicy.surfaces||[]);
const REQUEST_ID_RE=new RegExp(observabilityPolicy.correlation.accepted_pattern);
const ERROR_CODE_RE=/^[A-Z0-9_]{2,80}$/;

function expectedOutcome(status){
  return status>=500?'server_error':status>=400?'client_error':'success';
}

function percentile(values,p){
  if(!values.length) return 0;
  const sorted=[...values].sort((a,b)=>a-b);
  const rank=Math.max(0,Math.ceil(p*sorted.length)-1);
  return sorted[Math.min(rank,sorted.length-1)];
}

function validEvent(event){
  if(!event||event.event!=='dpp_http_request') return false;
  if(!Number.isInteger(event.status)||event.status<100||event.status>599) return false;
  if(!Number.isFinite(event.duration_ms)||event.duration_ms<0) return false;
  if(typeof event.request_id!=='string'||!REQUEST_ID_RE.test(event.request_id)) return false;
  if(typeof event.surface!=='string'||!ALLOWED_SURFACES.has(event.surface)) return false;
  if(event.outcome!==expectedOutcome(event.status)) return false;
  if(typeof event.auth_present!=='boolean') return false;
  if(event.error_code!==null&&(
    typeof event.error_code!=='string'||!ERROR_CODE_RE.test(event.error_code)
  )) return false;
  return true;
}

function eventsInWindow(events,nowMs,windowSeconds){
  const floor=nowMs-windowSeconds*1000;
  return events.filter(e=>validEvent(e)&&Number.isFinite(e.timestamp_ms)&&e.timestamp_ms>=floor&&e.timestamp_ms<=nowMs);
}

function ratio(count,total){
  return total>0?count/total:0;
}

function consecutive5xx(events){
  let max=0,current=0;
  for(const event of [...events].sort((a,b)=>a.timestamp_ms-b.timestamp_ms)){
    if(event.status>=500&&event.status<=599){
      current+=1;
      if(current>max) max=current;
    }else current=0;
  }
  return max;
}

function measure(signal,events){
  const total=events.length;
  const metric=signal.threshold.metric;
  if(metric==='ratio'){
    const count=events.filter(e=>e.status>=500&&e.status<=599).length;
    return ratio(count,total);
  }
  if(metric==='consecutive_status_class') return consecutive5xx(events);
  if(metric==='p95_duration_ms') return percentile(events.map(e=>e.duration_ms),0.95);
  if(metric==='error_code_ratio'){
    const allowed=new Set(signal.threshold.error_codes||[]);
    return ratio(events.filter(e=>allowed.has(e.error_code)).length,total);
  }
  throw new Error(`UNKNOWN_MONITORING_METRIC:${metric}`);
}

function triggered(signal,value){
  if(signal.threshold.operator!=='>=') throw new Error('UNSUPPORTED_MONITORING_OPERATOR');
  return value>=signal.threshold.value;
}

function evaluateMonitoring(events,options={}){
  const nowMs=Number.isFinite(options.nowMs)?options.nowMs:Date.now();
  const p=options.policy||policy;
  const windowEvents=eventsInWindow(events,nowMs,p.evaluation_window_seconds);
  const alerts=[];

  for(const signal of p.signals){
    const sample_count=windowEvents.length;
    const value=measure(signal,windowEvents);
    const active=sample_count>=signal.minimum_requests&&triggered(signal,value);
    alerts.push({
      signal_id:signal.id,
      severity:signal.severity,
      owner:signal.owner,
      active,
      sample_count,
      value,
      threshold:signal.threshold.value,
      clear_below:signal.clear_below,
      window_seconds:p.evaluation_window_seconds
    });
  }

  return {
    evaluated_at_ms:nowMs,
    input_event:p.input_event,
    window_seconds:p.evaluation_window_seconds,
    sample_count:windowEvents.length,
    alerts
  };
}

module.exports={
  evaluateMonitoring,
  _test:{percentile,validEvent,eventsInWindow,ratio,consecutive5xx,measure,triggered,expectedOutcome,ALLOWED_SURFACES,REQUEST_ID_RE,ERROR_CODE_RE}
};
