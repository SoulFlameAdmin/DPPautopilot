'use strict';

const test = require('node:test');
const {beforeEach,afterEach}=require('node:test');
const originalFetch=global.fetch;
beforeEach(()=>{global.fetch=async(url,options)=>{
  assert.match(String(url),/dpp_api_passport_public_resolve$/);
  const identifier=JSON.parse(options.body).p_unique_identifier;
  return {ok:true,async json(){return {kind:'active',status:'active',unique_identifier:identifier};}};
};});
afterEach(()=>{global.fetch=originalFetch;});

const assert = require('node:assert/strict');
const handler = require('../../api/qr.js');

function makeRes(){
  return {
    statusCode:0, headers:{}, body:'',
    setHeader(name,value){this.headers[String(name).toLowerCase()]=value;},
    end(value){this.body=value||'';}
  };
}
function makeReq(method='GET',query={}){
  return {method,query,headers:{'x-forwarded-for':'203.0.113.10'}};
}

test('buildPassportUrl is canonical and percent-encodes identifier',()=>{
  const url=handler._test.buildPassportUrl('BAT SF/0001',{DPP_PUBLIC_ORIGIN:'https://dpp.example'});
  assert.equal(url,'https://dpp.example/passport?identifier=BAT%20SF%2F0001&carrier=qr');
});

test('rejects missing, oversized and control-character identifiers',()=>{
  assert.equal(handler._test.normalizeIdentifier(''),null);
  assert.equal(handler._test.normalizeIdentifier('x'.repeat(301)),null);
  assert.equal(handler._test.normalizeIdentifier('bad\nvalue'),null);
  assert.equal(handler._test.normalizeIdentifier(' BAT-001 '),'BAT-001');
});

test('renders a standalone SVG QR carrier',()=>{
  const svg=handler._test.renderQrSvg('https://dpp.example/passport?identifier=BAT-001&carrier=qr');
  assert.match(svg,/^<svg\b/);
  assert.match(svg,/<path\b/);
  assert.ok(svg.length>500);
});

test('GET returns SVG and exact canonical target header',async()=>{
  const old=process.env.DPP_PUBLIC_ORIGIN;
  process.env.DPP_PUBLIC_ORIGIN='https://dpp.example';
  try{
    const res=makeRes();
    await handler(makeReq('GET',{identifier:'BAT-001'}),res);
    assert.equal(res.statusCode,200);
    assert.match(res.headers['content-type'],/^image\/svg\+xml/);
    assert.equal(res.headers['x-dpp-carrier'],'qr');
    assert.equal(res.headers['x-dpp-identifier'],'BAT-001');
    assert.equal(res.headers['x-dpp-target'],'https://dpp.example/passport?identifier=BAT-001&carrier=qr');
    assert.match(res.body,/^<svg\b/);
  } finally {
    if(old===undefined) delete process.env.DPP_PUBLIC_ORIGIN;
    else process.env.DPP_PUBLIC_ORIGIN=old;
  }
});

test('download mode sends attachment disposition',async()=>{
  const res=makeRes();
  await handler(makeReq('GET',{identifier:'BAT-001',download:'1'}),res);
  assert.equal(res.statusCode,200);
  assert.match(res.headers['content-disposition'],/^attachment;/);
});

test('invalid identifier and unsupported methods fail closed',async()=>{
  let res=makeRes();
  await handler(makeReq('GET',{}),res);
  assert.equal(res.statusCode,400);
  assert.equal(JSON.parse(res.body).error.code,'INVALID_IDENTIFIER');

  res=makeRes();
  await handler(makeReq('POST',{identifier:'BAT-001'}),res);
  assert.equal(res.statusCode,405);
  assert.equal(res.headers.allow,'GET');
});


test('different battery identifiers produce different canonical targets and different QR carriers',async()=>{
  const old=process.env.DPP_PUBLIC_ORIGIN;
  process.env.DPP_PUBLIC_ORIGIN='https://dpp.example';
  try{
    const a=makeRes();
    const b=makeRes();
    await handler(makeReq('GET',{identifier:'BAT-UNIQUE-0001'}),a);
    await handler(makeReq('GET',{identifier:'BAT-UNIQUE-0002'}),b);
    assert.equal(a.statusCode,200);
    assert.equal(b.statusCode,200);
    assert.equal(a.headers['x-dpp-identifier'],'BAT-UNIQUE-0001');
    assert.equal(b.headers['x-dpp-identifier'],'BAT-UNIQUE-0002');
    assert.notEqual(a.headers['x-dpp-target'],b.headers['x-dpp-target']);
    assert.notEqual(a.body,b.body);
  } finally {
    if(old===undefined) delete process.env.DPP_PUBLIC_ORIGIN;
    else process.env.DPP_PUBLIC_ORIGIN=old;
  }
});


test('QR generation denies missing active passport and verification errors',async()=>{
  global.fetch=async()=>({ok:true,async json(){return {kind:'lifecycle',status:'revoked'};}});
  let out=makeRes();await handler(makeReq('GET',{identifier:'NO-ACTIVE'}),out);
  assert.equal(out.statusCode,404);assert.equal(JSON.parse(out.body).error.code,'PUBLIC_PASSPORT_NOT_FOUND');
  global.fetch=async()=>{throw new Error('private transport detail');};
  out=makeRes();await handler(makeReq('GET',{identifier:'FAILED-VERIFY'}),out);
  assert.equal(out.statusCode,502);assert.equal(out.body.includes('private transport detail'),false);
});
