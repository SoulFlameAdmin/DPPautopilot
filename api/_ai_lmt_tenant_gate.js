'use strict';
/**
 * A2-bound, read-only manufacturer tenant permission proof.
 * The RPC has no arguments. The organization and role come ONLY from the
 * authenticated Supabase session and DB membership, never from the prompt.
 * No writes, approvals, persistence, passport generation or promotion.
 */
const {getSupabaseConfig}=require('./_supabase_config.js');
const ROLES=new Set(['owner','admin','editor']);
const VALID_ROLES=new Set(['owner','admin','editor','viewer']);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TIMEOUT_MS=8000;
class LMTTenantError extends Error{
 constructor(code,status=403){super(code);this.name='LMTTenantError';this.code=code;this.status=status;}
}
function readContext(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||
    !Array.isArray(value.memberships)||value.memberships.length>1000)
  throw new LMTTenantError('TENANT_CONTEXT_INVALID',502);
 const activeId=value.active_organization_id;
 if(activeId!==null&&(typeof activeId!=='string'||!UUID.test(activeId)))
  throw new LMTTenantError('TENANT_CONTEXT_INVALID',502);
 const seen=new Set();
 let selected=null;
 for(const m of value.memberships){
  if(!m||typeof m!=='object'||Array.isArray(m)||
    typeof m.organization_id!=='string'||!UUID.test(m.organization_id)||
    !VALID_ROLES.has(m.role)||typeof m.active!=='boolean'||seen.has(m.organization_id))
   throw new LMTTenantError('TENANT_CONTEXT_INVALID',502);
  seen.add(m.organization_id);
  if(m.active){
   if(selected)throw new LMTTenantError('TENANT_CONTEXT_INVALID',502);
   selected=m;
  }
 }
 if(activeId===null){
  if(selected)throw new LMTTenantError('TENANT_CONTEXT_INVALID',502);
  throw new LMTTenantError('ACTIVE_MANUFACTURER_REQUIRED',403);
 }
 if(!selected||selected.organization_id!==activeId)
  throw new LMTTenantError('TENANT_CONTEXT_INVALID',502);
 if(!ROLES.has(selected.role))throw new LMTTenantError('MANUFACTURER_WRITE_ROLE_REQUIRED',403);
 return {organization_id:activeId,role:selected.role};
}
async function validateManufacturerTenant(authorization,{
 env=process.env,fetchImpl=globalThis.fetch,timeoutMs=TIMEOUT_MS
}={}){
 if(typeof authorization!=='string'||!/^Bearer\s+\S+$/i.test(authorization))
  throw new LMTTenantError('AUTH_REQUIRED',401);
 const {base,key}=getSupabaseConfig(env);
 const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),timeoutMs);
 let response;
 try{
  response=await fetchImpl(`${base.replace(/\/$/,'')}/rest/v1/rpc/dpp_api_tenant_context`,{
   method:'POST',headers:{apikey:key,Authorization:authorization,
    'Content-Type':'application/json',Accept:'application/json'},
   body:'{}',cache:'no-store',signal:ctrl.signal
  });
 }catch(e){
  if(ctrl.signal.aborted||e?.name==='AbortError')
   throw new LMTTenantError('TENANT_CONTEXT_TIMEOUT',503);
  throw new LMTTenantError('TENANT_CONTEXT_UNAVAILABLE',503);
 }finally{clearTimeout(timer);}
 if([401,403].includes(response?.status))
  throw new LMTTenantError('TENANT_CONTEXT_DENIED',403);
 if(!response?.ok)throw new LMTTenantError('TENANT_CONTEXT_UNAVAILABLE',503);
 const ctx=await response.json().catch(()=>null);
 return readContext(ctx);
}
module.exports={LMTTenantError,readContext,validateManufacturerTenant,TIMEOUT_MS};
