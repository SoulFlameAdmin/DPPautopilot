'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const handler=require('../../api/carriers.js');

function makeRes(){
  return {statusCode:0,headers:{},body:null,setHeader(k,v){this.headers[String(k).toLowerCase()]=v;},end(v){this.body=v;}};
}

test('QR proxy allows same-origin HTTPS target',()=>{
  assert.equal(handler._test.allowedQrTarget(
    'https://dpp.example/demo/carrier-passport.html?id=BAT-1',
    'https://dpp.example'
  ),true);
});

test('QR proxy rejects arbitrary external target',()=>{
  assert.equal(handler._test.allowedQrTarget(
    'https://evil.example/collect',
    'https://dpp.example'
  ),false);
});

test('QR proxy permits localhost only for test HTTP',()=>{
  assert.equal(handler._test.allowedQrTarget('http://127.0.0.1:8000/demo/passport.html?id=1','http://127.0.0.1:8000'),true);
  assert.equal(handler._test.allowedQrTarget('http://example.com/demo/passport.html?id=1','http://example.com'),false);
});

test('QR endpoint returns PNG bytes for valid same-origin request',async()=>{
  const original=global.fetch;
  const png=Buffer.from([137,80,78,71,13,10,26,10,...new Array(64).fill(0)]);
  global.fetch=async()=>({
    ok:true,
    headers:{get(name){return String(name).toLowerCase()==='content-type'?'image/png':null;}},
    async arrayBuffer(){return png;}
  });
  try{
    const req={
      method:'GET',
      headers:{'x-forwarded-host':'dpp.example','x-forwarded-proto':'https'},
      query:{mode:'qr',url:'https://dpp.example/demo/carrier-passport.html?id=BAT-1'}
    };
    const res=makeRes();
    await handler(req,res);
    assert.equal(res.statusCode,200);
    assert.equal(res.headers['content-type'],'image/png');
    assert.equal(Buffer.isBuffer(res.body),true);
  }finally{global.fetch=original;}
});

test('QR endpoint rejects cross-origin URL before upstream fetch',async()=>{
  const original=global.fetch;
  let called=false;
  global.fetch=async()=>{called=true;throw new Error('unexpected');};
  try{
    const req={
      method:'GET',
      headers:{'x-forwarded-host':'dpp.example','x-forwarded-proto':'https'},
      query:{mode:'qr',url:'https://evil.example/x'}
    };
    const res=makeRes();
    await handler(req,res);
    assert.equal(res.statusCode,400);
    assert.equal(called,false);
  }finally{global.fetch=original;}
});
