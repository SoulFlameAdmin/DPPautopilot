'use strict';

const fs=require('node:fs');

const REQUIRED=Array.from({length:24},(_,i)=>`HW${String(i+1).padStart(2,'0')}`);
const VALID=new Set(['PASS','FAIL','NOT_APPLICABLE','PENDING']);

function validateEvidence(doc){
  const errors=[];
  if(!doc||doc.schema!=='dpp.crypto.hardware-evidence.v1') errors.push('schema');
  if(!Array.isArray(doc&&doc.tests)||doc.tests.length!==24) errors.push('tests_count');
  const ids=Array.isArray(doc&&doc.tests)?doc.tests.map(x=>x&&x.id):[];
  if(JSON.stringify(ids)!==JSON.stringify(REQUIRED)) errors.push('test_ids');
  for(const t of (doc&&doc.tests)||[]){
    if(!VALID.has(t.status)) errors.push(`${t.id}:status`);
    if(t.status==='PASS'&&(!Array.isArray(t.evidence)||t.evidence.length===0)) errors.push(`${t.id}:pass_without_evidence`);
    if(t.status==='NOT_APPLICABLE'&&!(typeof t.reason==='string'&&t.reason.trim())) errors.push(`${t.id}:na_without_reason`);
  }
  if(doc&&doc.result==='PASS'){
    const unfinished=(doc.tests||[]).filter(t=>!['PASS','NOT_APPLICABLE'].includes(t.status));
    if(unfinished.length) errors.push('result_pass_with_unfinished_tests');
    if(!doc.commit_sha) errors.push('pass_without_commit');
    if(!doc.hardware||!doc.hardware.exact_sku) errors.push('pass_without_exact_sku');
    if(!doc.captured_at) errors.push('pass_without_timestamp');
  }
  return {ok:errors.length===0,errors};
}

if(require.main===module){
  const file=process.argv[2];
  if(!file){console.error('usage: node scripts/validate-dpp-crypto-hardware-evidence.cjs <evidence.json>');process.exit(2);}
  let doc;try{doc=JSON.parse(fs.readFileSync(file,'utf8'));}catch(e){console.error('invalid_json');process.exit(2);}
  const r=validateEvidence(doc);
  if(!r.ok){console.error(r.errors.join('\n'));process.exit(1);}
  console.log('CR24 evidence schema: PASS');
}
module.exports={validateEvidence,REQUIRED};
