'use strict';

const test = require('node:test');
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
  assert.equal(url,'https://dpp.example/passport?identifier=BAT%20SF%2F0001');
});

test('rejects missing, oversized and control-character identifiers',()=>{
  assert.equal(handler._test.normalizeIdentifier(''),null);
  assert.equal(handler._test.normalizeIdentifier('x'.repeat(301)),null);
  assert.equal(handler._test.normalizeIdentifier('bad\nvalue'),null);
  assert.equal(handler._test.normalizeIdentifier(' BAT-001 '),'BAT-001');
});

test('renders a standalone SVG QR carrier',()=>{
  const svg=handler._test.renderQrSvg('https://dpp.example/passport?identifier=BAT-001');
  assert.match(svg,/^<svg\b/);
  assert.match(svg,/<path\b/);
  assert.ok(svg.length>500);
});

test('GET returns SVG and exact canonical target header',()=>{
  const old=process.env.DPP_PUBLIC_ORIGIN;
  process.env.DPP_PUBLIC_ORIGIN='https://dpp.example';
  try{
    const res=makeRes();
    handler(makeReq('GET',{identifier:'BAT-001'}),res);
    assert.equal(res.statusCode,200);
    assert.match(res.headers['content-type'],/^image\/svg\+xml/);
    assert.equal(res.headers['x-dpp-carrier'],'qr');
    assert.equal(res.headers['x-dpp-identifier'],'BAT-001');
    assert.equal(res.headers['x-dpp-target'],'https://dpp.example/passport?identifier=BAT-001');
    assert.match(res.body,/^<svg\b/);
  } finally {
    if(old===undefined) delete process.env.DPP_PUBLIC_ORIGIN;
    else process.env.DPP_PUBLIC_ORIGIN=old;
  }
});

test('download mode sends attachment disposition',()=>{
  const res=makeRes();
  handler(makeReq('GET',{identifier:'BAT-001',download:'1'}),res);
  assert.equal(res.statusCode,200);
  assert.match(res.headers['content-disposition'],/^attachment;/);
});

test('invalid identifier and unsupported methods fail closed',()=>{
  let res=makeRes();
  handler(makeReq('GET',{}),res);
  assert.equal(res.statusCode,400);
  assert.equal(JSON.parse(res.body).error.code,'INVALID_IDENTIFIER');

  res=makeRes();
  handler(makeReq('POST',{identifier:'BAT-001'}),res);
  assert.equal(res.statusCode,405);
  assert.equal(res.headers.allow,'GET');
});


test('different battery identifiers produce different canonical targets and different QR carriers',()=>{
  const old=process.env.DPP_PUBLIC_ORIGIN;
  process.env.DPP_PUBLIC_ORIGIN='https://dpp.example';
  try{
    const a=makeRes();
    const b=makeRes();
    handler(makeReq('GET',{identifier:'BAT-UNIQUE-0001'}),a);
    handler(makeReq('GET',{identifier:'BAT-UNIQUE-0002'}),b);
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
