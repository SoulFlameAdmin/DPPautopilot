'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const errors=require('../../api/_errors.js');

test('common auth SQLSTATEs map consistently on every API surface',()=>{
  for(const surface of ['models','items','passport','export','imports','tenant','organizations','members']){
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

test('onboarding surfaces expose stable semantic errors',()=>{
  assert.deepEqual(errors.mapDatabaseError('organizations',{code:'23505'}),{
    status:409,code:'ORGANIZATION_CONFLICT',message:'An organization with the requested identity already exists.'
  });
  assert.deepEqual(errors.mapDatabaseError('organizations',{code:'DP501'}),{
    status:422,code:'VALIDATION_ERROR',message:'The request failed validation.'
  });
  assert.deepEqual(errors.mapDatabaseError('members',{code:'DP502'}),{
    status:404,code:'MEMBER_TARGET_NOT_FOUND',message:'The target user was not found.'
  });
  assert.deepEqual(errors.mapDatabaseError('members',{code:'DP503'}),{
    status:404,code:'MEMBER_NOT_FOUND',message:'The membership was not found.'
  });
  assert.deepEqual(errors.mapDatabaseError('members',{code:'DP505'}),{
    status:409,code:'MEMBER_CONFLICT',message:'The membership already exists.'
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

test('all route-local identifier and action errors are canonical',()=>{
  const expected={
    INVALID_MODEL_ID:[400,'A valid model UUID is required.'],
    INVALID_ITEM_ID:[400,'A valid item UUID is required.'],
    INVALID_IDENTIFIER:[400,'identifier must contain 1..300 characters.'],
    INVALID_PASSPORT_ID:[400,'A valid passport UUID is required.'],
    INVALID_IMPORT_ACTION:[422,'action must be validate or commit.'],
    INVALID_IMPORT_ID:[400,'A valid import UUID is required.'],
    INVALID_ORGANIZATION_ID:[422,'organization_id must be a valid UUID.']
  };
  for(const [code,[status,message]] of Object.entries(expected)){
    assert.deepEqual(errors.localError(code),{status,code,message});
  }
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
