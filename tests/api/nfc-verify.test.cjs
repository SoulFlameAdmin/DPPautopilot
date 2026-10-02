'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const verify=require('../../api/nfc-verify.js');
const core=require('../../api/_nfc_crypto.js');

function response(){return{statusCode:0,headers:{},body:'',setHeader(k,v){this.headers[k]=v;},end(v){this.body=v;}};}
function validBody(){return{
  schema:core.PROTOCOL_SCHEMA,mode:'pki_ecc',public_alias:'battery_12345678',
  challenge_id:'11111111-1111-4111-8111-111111111111',
  proof:Buffer.from('synthetic-proof').toString('base64url')
};}

test('verify requires auth',async()=>{
  const res=response();await verify({method:'POST',headers:{},body:validBody()},res);
  assert.equal(res.statusCode,401);
});

test('verify rejects malformed envelope fail closed',async()=>{
  const res=response();const b=validBody();b.mode='custom_crypto';
  await verify({method:'POST',headers:{authorization:'Bearer x'},body:b},res);
  assert.equal(JSON.parse(res.body).data.result,'invalid');
});

test('default proof provider never claims authentic',async()=>{
  const res=response();
  await verify({method:'POST',headers:{authorization:'Bearer x'},body:validBody()},res);
  const data=JSON.parse(res.body).data;
  assert.equal(data.result,'backend_error');
  assert.equal(data.reason_code,'proof_provider_unconfigured');
});

test('authentic provider fails closed if persistence adapter is absent',async()=>{
  const res=response();
  await verify({method:'POST',headers:{authorization:'Bearer x'},body:validBody()},res,{
    verifyProviderProof:async()=>({result:'authentic',reason_code:'proof_valid'})
  });
  const data=JSON.parse(res.body).data;
  assert.equal(data.result,'backend_error');
  assert.equal(data.reason_code,'persistence_boundary_unconfigured');
});

test('provider exception becomes backend_error',async()=>{
  const res=response();
  await verify({method:'POST',headers:{authorization:'Bearer x'},body:validBody()},res,{
    verifyProviderProof:async()=>{throw new Error('secret internal detail');}
  });
  const body=JSON.parse(res.body);
  assert.equal(body.data.result,'backend_error');
  assert.equal(JSON.stringify(body).includes('secret internal detail'),false);
});

test('successful adapters can produce allowlisted authentic result',async()=>{
  const res=response();
  await verify({method:'POST',headers:{authorization:'Bearer x'},body:validBody()},res,{
    verifyProviderProof:async()=>({result:'authentic',reason_code:'proof_valid'}),
    consumeAndRecord:async input=>({result:input.result,reason_code:input.reason_code,verification_id:'verify_123'})
  });
  const data=JSON.parse(res.body).data;
  assert.equal(data.result,'authentic');
  assert.equal(data.verification_id,'verify_123');
});
