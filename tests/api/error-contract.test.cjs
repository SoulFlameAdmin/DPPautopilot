'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const errors=require('../../api/_errors.js');

test('common auth SQLSTATEs map consistently on every API surface',()=>{
  for(const surface of ['models','items','passport','export']){
    assert.deepEqual(errors.mapDatabaseError(surface,{code:'DP101'}),{
      status:401,code:'AUTH_REQUIRED',message:'Authentication is required.'
    });
    assert.deepEqual(errors.mapDatabaseError(surface,{code:'DP104'}),{
      status:403,code:'FORBIDDEN',message:'The request is not permitted.'
    });
  }
});

test('surface-specific mappings preserve semantic differences',()=>{
  assert.deepEqual(errors.mapDatabaseError('models',{code:'23505'}),{
    status:409,code:'MODEL_CONFLICT',message:'The battery model conflicts with an existing record.'
  });
  assert.deepEqual(errors.mapDatabaseError('items',{code:'23505'}),{
    status:409,code:'ITEM_CONFLICT',message:'The battery item conflicts with an existing record.'
  });
  assert.deepEqual(errors.mapDatabaseError('passport',{code:'23505'}),{
    status:409,code:'PASSPORT_CONFLICT',message:'The passport conflicts with an existing record.'
  });
});

test('unknown database errors fail closed to upstream error',()=>{
  assert.deepEqual(errors.mapDatabaseError('models',{code:'ZZ999'}),{
    status:502,code:'UPSTREAM_ERROR',message:'Database request failed.'
  });
  assert.deepEqual(errors.mapDatabaseError('export',null),{
    status:502,code:'UPSTREAM_ERROR',message:'Database request failed.'
  });
});

test('local error catalog exposes stable public messages',()=>{
  assert.deepEqual(errors.localError('AUTH_REQUIRED'),{
    status:401,code:'AUTH_REQUIRED',message:'Bearer authentication is required.'
  });
  assert.deepEqual(errors.localError('SERVER_CONFIGURATION_MISSING'),{
    status:500,code:'SERVER_CONFIGURATION_MISSING',message:'Server configuration is incomplete.'
  });
});

test('errorBody returns exact machine-readable envelope',()=>{
  assert.deepEqual(errors.errorBody({code:'FORBIDDEN',message:'The request is not permitted.'}),{
    error:{code:'FORBIDDEN',message:'The request is not permitted.'}
  });
});
