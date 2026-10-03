'use strict';

const fs=require('node:fs');
const https=require('node:https');
const http=require('node:http');

const STATUS_PATH='data/dpp-crypto-status.json';
const EVIDENCE_PATH='data/dpp-crypto-tracker-evidence.json';

function fail(message){throw new Error(message);}
function readJson(path){return JSON.parse(fs.readFileSync(path,'utf8'));}

function expectedIds(){return Array.from({length:25},(_,i)=>`CR${String(i+1).padStart(2,'0')}`);}

function validateStatus(status){
  if(status.schema!=='dpp.crypto.status.v1') fail('unexpected status schema');
  if(status.total!==25) fail('total must be 25');
  if(!Array.isArray(status.points)||status.points.length!==25) fail('points must contain exactly 25 CR entries');

  const ids=status.points.map(p=>p.id);
  if(JSON.stringify(ids)!==JSON.stringify(expectedIds())) fail('CR ids must be CR01..CR25 in order');

  const allowed=new Set(['GREEN','YELLOW','BLOCKED','RED']);
  const derived={green:0,yellow:0,blocked:0,red:0};
  for(const point of status.points){
    if(!allowed.has(point.status)) fail(`invalid status for ${point.id}`);
    derived[point.status.toLowerCase()]++;
  }

  for(const key of Object.keys(derived)){
    if(status.counts?.[key]!==derived[key]) fail(`count mismatch for ${key}`);
  }
  const pct=Math.floor((derived.green/25)*100);
  if(status.percent_green!==pct) fail(`percent_green must be ${pct}`);

  const cr25=status.points.find(p=>p.id==='CR25');
  if(cr25.status==='GREEN'){
    const ev=readJson(EVIDENCE_PATH);
    if(ev.result!=='PASS') fail('CR25 GREEN requires tracker evidence result PASS');
    if(typeof ev.public_url!=='string'||!/^https:\/\//.test(ev.public_url)) fail('CR25 GREEN requires public HTTPS URL');
    if(ev.http_status!==200) fail('CR25 GREEN requires HTTP 200 evidence');
    if(ev.status_json_match!==true) fail('CR25 GREEN requires deployed status JSON match evidence');
    if(!ev.observed_at||!ev.observer) fail('CR25 GREEN requires timestamp and observer');
  }

  return {derived,pct};
}

function validateEvidence(ev){
  if(ev.schema!=='dpp.crypto.tracker.evidence.v1') fail('unexpected tracker evidence schema');
  if(!['PENDING','PASS','FAIL'].includes(ev.result)) fail('invalid tracker evidence result');
  if(ev.result==='PASS'){
    if(typeof ev.public_url!=='string'||!/^https:\/\//.test(ev.public_url)) fail('PASS evidence requires public HTTPS URL');
    if(ev.http_status!==200) fail('PASS evidence requires HTTP 200');
    if(ev.status_json_match!==true) fail('PASS evidence requires deployed JSON match');
    if(!ev.observed_at||!ev.observer) fail('PASS evidence requires observed_at and observer');
  }
  return true;
}

function get(url,timeoutMs=15000){
  return new Promise((resolve,reject)=>{
    const client=url.startsWith('https:')?https:http;
    const req=client.get(url,{headers:{'User-Agent':'DPP-CRYPTO-CR25-validator/1.0'}},res=>{
      const chunks=[];
      let bytes=0;
      res.on('data',chunk=>{
        bytes+=chunk.length;
        if(bytes>1024*1024){req.destroy(new Error('response_too_large'));return;}
        chunks.push(chunk);
      });
      res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:Buffer.concat(chunks).toString('utf8')}));
    });
    req.setTimeout(timeoutMs,()=>req.destroy(new Error('timeout')));
    req.on('error',reject);
  });
}

async function probe(baseUrl){
  const base=baseUrl.replace(/\/$/,'');
  const pageUrl=base.endsWith('.html')?base:`${base}/demo/dpp-crypto-progress.html`;
  const root=base.endsWith('.html')?base.slice(0,-'/demo/dpp-crypto-progress.html'.length):base;
  const jsonUrl=`${root}/data/dpp-crypto-status.json`;
  const [page,json]=await Promise.all([get(pageUrl),get(jsonUrl)]);
  if(page.status!==200) fail(`tracker page HTTP ${page.status}`);
  if(json.status!==200) fail(`tracker JSON HTTP ${json.status}`);
  if(!/DPP CRYPTO/i.test(page.body)) fail('tracker page does not contain DPP CRYPTO marker');

  const deployed=JSON.parse(json.body);
  const local=readJson(STATUS_PATH);
  for(const key of ['schema','total','percent_green','branch']){
    if(deployed[key]!==local[key]) fail(`deployed status mismatch: ${key}`);
  }
  if(JSON.stringify(deployed.counts)!==JSON.stringify(local.counts)) fail('deployed counts mismatch');
  return {pageUrl,jsonUrl,http_status:200,status_json_match:true};
}

async function main(){
  const status=readJson(STATUS_PATH);
  const evidence=readJson(EVIDENCE_PATH);
  const summary=validateStatus(status);
  validateEvidence(evidence);
  console.log(`CR25_TRACKER_CONTRACT_PASS: ${summary.derived.green}/25 GREEN (${summary.pct}%) with honest reachability evidence state ${evidence.result}`);

  const arg=process.argv.indexOf('--probe');
  if(arg!==-1){
    const url=process.argv[arg+1]||process.env.DPP_CRYPTO_TRACKER_URL;
    if(!url) fail('--probe requires URL or DPP_CRYPTO_TRACKER_URL');
    const result=await probe(url);
    console.log('CR25_REMOTE_PROBE_PASS '+JSON.stringify(result));
  }
}

main().catch(error=>{console.error('CR25_TRACKER_VALIDATION_FAIL:',error.message);process.exit(1);});
