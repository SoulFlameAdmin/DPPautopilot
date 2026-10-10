'use strict';
/** Reusable Supabase bearer identity verification for DPP GPT preview only. */
const { getSupabaseConfig }=require('./_supabase_config.js');
const AUTH_TIMEOUT_MS=8000;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
class LMTAuthError extends Error {
 constructor(code,status=401){super(code);this.code=code;this.status=status;}
}
async function validateBearerSupabase(authorization,{
 env=process.env,fetchImpl=globalThis.fetch,timeoutMs=AUTH_TIMEOUT_MS
}={}){
 if(typeof authorization!=='string'||!/^Bearer\s+\S+$/i.test(authorization))
  throw new LMTAuthError('AUTH_REQUIRED',401);
 const {base,key}=getSupabaseConfig(env);
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),timeoutMs);
 let response;
 try{
  response=await fetchImpl(`${base.replace(/\/$/,'')}/auth/v1/user`,{
   method:'GET',headers:{apikey:key,Authorization:authorization,Accept:'application/json'},
   cache:'no-store',signal:controller.signal});
 }catch(e){
  if(controller.signal.aborted||e?.name==='AbortError')throw new LMTAuthError('AUTH_SERVICE_TIMEOUT',503);
  throw new LMTAuthError('AUTH_SERVICE_UNAVAILABLE',503);
 }finally{clearTimeout(timer);}
 if([401,403].includes(response?.status))throw new LMTAuthError('AUTH_INVALID',401);
 if(!response?.ok)throw new LMTAuthError('AUTH_SERVICE_UNAVAILABLE',503);
 const user=await response.json().catch(()=>null);
 if(!user||typeof user.id!=='string'||!UUID.test(user.id))
  throw new LMTAuthError('AUTH_RESPONSE_INVALID',502);
 return {user_id:user.id};
}
module.exports={AUTH_TIMEOUT_MS,LMTAuthError,validateBearerSupabase};
