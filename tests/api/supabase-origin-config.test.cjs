'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {getSupabaseConfig}=require('../../api/_supabase_config.js');
const key='sb_publishable_test';
function config(url){return getSupabaseConfig({DPP_SUPABASE_URL:url,DPP_SUPABASE_PUBLISHABLE_KEY:key});}
test('backend accepts only clean HTTPS Supabase origins',()=>{
  assert.equal(config('https://example.supabase.co').base,'https://example.supabase.co');
  assert.equal(config('https://example.supabase.co/').base,'https://example.supabase.co');
});
for(const url of ['http://example.supabase.co','https://user:secret@example.supabase.co','https://example.supabase.co/auth/v1','https://example.supabase.co/?redirect=evil','https://example.supabase.co/#fragment']){
  test('backend rejects malformed Supabase origin '+url.replace(/secret/g,'***'),()=>{
    assert.throws(()=>config(url),error=>error.publicCode==='SERVER_CONFIGURATION_INVALID');
  });
}
