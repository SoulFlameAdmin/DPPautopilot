'use strict';
// R10_R13_SYNTHETIC_FIRE_RECOVER_DRILL_PASS

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const monitoring=require('../../api/_monitoring.js');
const monitorPolicy=require('../../data/monitoring-alert-policy.json');
const incident=require('../../data/incident-runbook-contract.json');
const drill=require('../../data/monitoring-incident-drill.json');

const NOW=1_800_100_000_000;

function event(index,overrides={}){
  return {
    event:'dpp_http_request',
    timestamp_ms:NOW-30_000+index*100,
    request_id:`drill-${String(index).padStart(8,'0')}`,
    surface:'models',
    method:'GET',
    status:200,
    outcome:'success',
    duration_ms:120,
    auth_present:true,
    error_code:null,
    ...overrides
  };
}

function getAlert(result,id){
  const found=result.alerts.find(a=>a.signal_id===id);
  assert.ok(found,`missing alert ${id}`);
  return found;
}

test('synthetic critical availability drill fires, maps to SEV1, acknowledges inside target and recovers',()=>{
  assert.equal(drill.status,'partial');
  assert.equal(drill.safety.live_delivery_configured,false);
  assert.equal(drill.safety.production_runtime_claimed,false);
  assert.equal(drill.safety.production_rollback_claimed,false);
  assert.equal(monitorPolicy.delivery.live_delivery_configured,false);

  const fireSpec=drill.scenario.fire;
  const firing=Array.from({length:fireSpec.request_count},(_,i)=>event(i));
  firing[firing.length-1]=event(firing.length-1,{
    status:503,
    outcome:'server_error',
    error_code:'UPSTREAM_ERROR'
  });

  const fireResult=monitoring.evaluateMonitoring(firing,{nowMs:NOW});
  const fired=getAlert(fireResult,drill.scenario.signal_id);
  assert.equal(fired.active,true);
  assert.equal(fired.value,fireSpec.expected_ratio);
  assert.equal(fired.severity,drill.scenario.severity);
  assert.equal(fired.owner,drill.scenario.owner);

  const sev=incident.severities.find(s=>s.id===drill.scenario.incident_severity);
  assert.ok(sev,'missing mapped incident severity');
  assert.equal(sev.target_ack_minutes,drill.scenario.ack_target_minutes);
  assert.ok(sev.criteria.some(x=>x.includes('critical availability signal')));
  assert.ok(incident.roles.includes(fired.owner));

  const timeline=drill.scenario.synthetic_timeline_minutes;
  assert.ok(timeline.acknowledge<=sev.target_ack_minutes);
  for(const phase of incident.required_phases){
    assert.ok(Object.prototype.hasOwnProperty.call(timeline,phase),`missing synthetic timeline phase ${phase}`);
  }
  assert.ok(timeline.detect_and_open<=timeline.triage);
  assert.ok(timeline.triage<=timeline.contain);
  assert.ok(timeline.contain<=timeline.communicate);
  assert.ok(timeline.communicate<=timeline.recover);
  assert.ok(timeline.recover<=timeline.verify);
  assert.ok(timeline.verify<=timeline.close_and_learn);

  const recoveryNow=NOW+monitorPolicy.evaluation_window_seconds*1000+1_000;
  const recovered=Array.from({length:drill.scenario.recovery.request_count},(_,i)=>({
    ...event(i+100),
    timestamp_ms:recoveryNow-30_000+i*100
  }));
  const recoveryResult=monitoring.evaluateMonitoring(recovered,{nowMs:recoveryNow});
  const cleared=getAlert(recoveryResult,drill.scenario.signal_id);
  assert.equal(cleared.active,false);
  assert.equal(cleared.value,drill.scenario.recovery.expected_ratio);

  const report={
    generated_from:'synthetic_ci',
    live_delivery:false,
    production_runtime:false,
    production_rollback:false,
    scenario_id:drill.scenario.id,
    fired:{
      signal_id:fired.signal_id,
      severity:fired.severity,
      owner:fired.owner,
      value:fired.value,
      threshold:fired.threshold,
      sample_count:fired.sample_count
    },
    incident:{
      severity:sev.id,
      target_ack_minutes:sev.target_ack_minutes,
      synthetic_ack_minutes:timeline.acknowledge,
      phases:incident.required_phases,
      timeline_minutes:timeline
    },
    recovered:{
      active:cleared.active,
      value:cleared.value,
      sample_count:cleared.sample_count
    },
    required_before_green:drill.required_before_green
  };
  fs.mkdirSync(path.join(process.cwd(),'artifacts'),{recursive:true});
  fs.writeFileSync(
    path.join(process.cwd(),'artifacts','r10-r13-monitoring-incident-drill.json'),
    JSON.stringify(report,null,2)+'\n',
    'utf8'
  );
});
