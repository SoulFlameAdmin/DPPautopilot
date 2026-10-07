'use strict';

const bundled=require('../data/auth-config.json');

function getSupabaseConfig(env=process.env){
  const base=String(
    env.DPP_SUPABASE_URL||
    env.SUPABASE_URL||
    bundled.supabaseUrl||
    ''
  ).trim();
  const key=String(
    env.DPP_SUPABASE_PUBLISHABLE_KEY||
    env.SUPABASE_ANON_KEY||
    bundled.publishableKey||
    ''
  ).trim();

  if(!base||!key){
    const error=new Error('SERVER_CONFIGURATION_MISSING');
    error.status=500;
    error.publicCode='SERVER_CONFIGURATION_MISSING';
    error.publicMessage='Server configuration is incomplete.';
    throw error;
  }

  let normalizedBase;
  try{
    const url=new URL(base);
    if(url.protocol!=='https:') throw new Error('invalid protocol');
    normalizedBase=url.origin;
  }catch{
    const error=new Error('SERVER_CONFIGURATION_INVALID');
    error.status=500;
    error.publicCode='SERVER_CONFIGURATION_INVALID';
    error.publicMessage='Server configuration is invalid.';
    throw error;
  }

  if(!key.startsWith('sb_publishable_')&&!key.startsWith('eyJ')){
    const error=new Error('SERVER_CONFIGURATION_INVALID');
    error.status=500;
    error.publicCode='SERVER_CONFIGURATION_INVALID';
    error.publicMessage='Server configuration is invalid.';
    throw error;
  }

  return {base:normalizedBase,key};
}

module.exports={getSupabaseConfig};
