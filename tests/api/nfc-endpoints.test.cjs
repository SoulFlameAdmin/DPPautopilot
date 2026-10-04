'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const challenge=require('../../api/nfc-challenge.js');
const status=require('../../api/nfc-status.js');

function response(){
  return {statusCode:0,headers:{},body:'',
    setHeader(k,v){this.headers[k]=v;},
    end(v){this.body=v;}
  };
}

test('challenge requires bearer auth',async()=>{
  const res=response();
  await challenge({method:'POST',headers:{},body:{public_alias:'battery_12345678'}},res);
  assert.equal(res.statusCode,401);
  assert.equal(JSON.parse(res.body).error.code,'AUTH_REQUIRED');
});

test('challenge rejects malformed public alias before upstream call',async()=>{
  const res=response();
  await challenge({method:'POST',headers:{authorization:'Bearer x'},body:{public_alias:'bad'}},res);
  assert.equal(res.statusCode,422);
});

test('challenge endpoint only permits POST',async()=>{
  const res=response();
  await challenge({method:'GET',headers:{}},res);
  assert.equal(res.statusCode,405);
  assert.equal(res.headers.Allow,'POST');
});

test('status requires bearer auth',async()=>{
  const res=response();
  await status({method:'GET',headers:{},query:{public_alias:'battery_12345678'}},res);
  assert.equal(res.statusCode,401);
});

test('status rejects malformed alias',async()=>{
  const res=response();
  await status({method:'GET',headers:{authorization:'Bearer x'},query:{public_alias:'bad'}},res);
  assert.equal(res.statusCode,400);
});

test('status endpoint only permits GET',async()=>{
  const res=response();
  await status({method:'POST',headers:{}},res);
  assert.equal(res.statusCode,405);
  assert.equal(res.headers.Allow,'GET');
});

test('public alias validator has bounded alphabet and length',()=>{
  assert.equal(challenge._test.validAlias('battery_12345678'),true);
  assert.equal(challenge._test.validAlias('../battery_12345678'),false);
  assert.equal(challenge._test.validAlias('a'.repeat(161)),false);
  assert.equal(status._test.validAlias('battery-ABCDEFGH'),true);
});
