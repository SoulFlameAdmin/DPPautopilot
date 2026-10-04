'use strict';

function send(res,status,body){
  res.statusCode=status;
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Cache-Control','no-store');
  res.end(JSON.stringify(body));
}
function bearer(req){
  const v=req.headers&&(req.headers.authorization||req.headers.Authorization);
  return typeof v==='string'&&/^Bearer\s+\S+$/i.test(v)?v:null;
}
function validAlias(v){return typeof v==='string'&&/^[A-Za-z0-9_-]{8,160}$/.test(v);}
async function rpc(payload,authorization,env=process.env,fetchImpl=fetch){
  const base=env.DPP_SUPABASE_URL||env.SUPABASE_URL;
  const key=env.DPP_SUPABASE_PUBLISHABLE_KEY||env.SUPABASE_ANON_KEY;
  if(!base||!key) throw Object.assign(new Error('SERVER_CONFIGURATION_MISSING'),{status:500});
  const response=await fetchImpl(`${base.replace(/\/$/,'')}/rest/v1/rpc/dpp_api_nfc_status`,{
    method:'POST',headers:{apikey:key,Authorization:authorization,'Content-Type':'application/json',Accept:'application/json'},
    body:JSON.stringify(payload)
  });
  let data=null;try{data=await response.json();}catch(_){}
  if(!response.ok) throw Object.assign(new Error('UPSTREAM_ERROR'),{status:response.status>=500?502:response.status});
  return data;
}
async function handler(req,res){
  if(String(req.method||'').toUpperCase()!=='GET'){
    res.setHeader('Allow','GET');return send(res,405,{error:{code:'METHOD_NOT_ALLOWED',message:'Unsupported method.'}});
  }
  const authorization=bearer(req);
  if(!authorization) return send(res,401,{error:{code:'AUTH_REQUIRED',message:'Bearer authentication is required.'}});
  const alias=req.query&&req.query.public_alias;
  if(!validAlias(alias)) return send(res,400,{error:{code:'INVALID_ALIAS',message:'A valid public_alias is required.'}});
  try{
    const rows=await rpc({p_public_alias:alias},authorization);
    const row=Array.isArray(rows)?rows[0]:rows;
    if(!row) return send(res,404,{error:{code:'NOT_FOUND',message:'NFC identity was not found.'}});
    return send(res,200,{data:{
      schema:'dpp.nfc.verification.v1',
      public_alias:row.public_alias,
      lifecycle_state:row.lifecycle_state,
      mode:row.mode,
      algorithm_id:row.algorithm_id,
      tamper_state:row.tamper_state||null,
      activated_at:row.activated_at||null,
      revoked_at:row.revoked_at||null
    }});
  }catch(e){
    const status=Number.isInteger(e.status)?e.status:502;
    return send(res,status,{error:{code:status===500?'SERVER_CONFIGURATION_MISSING':'UPSTREAM_ERROR',message:status>=500?'Database request failed.':'Request failed.'}});
  }
}
module.exports=handler;
module.exports._test={bearer,validAlias,rpc};
