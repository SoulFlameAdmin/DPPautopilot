'use strict';

function send(res,status,body){
  res.statusCode=status;
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Content-Disposition','attachment; filename="dpp-export.json"');
  res.end(JSON.stringify(body));
}

function bearer(req){
  const value=req.headers&&(req.headers.authorization||req.headers.Authorization);
  return typeof value==='string'&&/^Bearer\s+\S+$/i.test(value)?value:null;
}

function mapDatabaseError(data){
  const code=data&&data.code;
  if(code==='DP101') return [401,'AUTH_REQUIRED'];
  if(code==='DP102'||code==='DP103'||code==='DP104') return [403,'FORBIDDEN'];
  return [502,'UPSTREAM_ERROR'];
}

async function rpc(authorization,env=process.env,fetchImpl=fetch){
  const base=env.SUPABASE_URL;
  const key=env.SUPABASE_ANON_KEY;
  if(!base||!key){
    const error=new Error('SERVER_CONFIGURATION_MISSING');
    error.status=500;
    throw error;
  }
  const response=await fetchImpl(`${base.replace(/\/$/,'')}/rest/v1/rpc/dpp_api_export_bundle`,{
    method:'POST',
    headers:{
      apikey:key,
      Authorization:authorization,
      'Content-Type':'application/json',
      Accept:'application/json'
    },
    body:'{}'
  });
  let data=null;
  try{data=await response.json();}catch(_){data=null;}
  if(!response.ok){
    const [status,publicCode]=mapDatabaseError(data);
    const error=new Error(publicCode);
    error.status=status;
    error.publicCode=publicCode;
    throw error;
  }
  return data;
}

async function handler(req,res){
  const method=String(req.method||'GET').toUpperCase();
  if(method!=='GET'){
    res.setHeader('Allow','GET');
    return send(res,405,{error:{code:'METHOD_NOT_ALLOWED',message:'Unsupported method.'}});
  }
  const authorization=bearer(req);
  if(!authorization){
    return send(res,401,{error:{code:'AUTH_REQUIRED',message:'Bearer authentication is required.'}});
  }
  try{
    const bundle=await rpc(authorization);
    return send(res,200,{data:bundle});
  }catch(error){
    const status=Number.isInteger(error.status)?error.status:502;
    const code=error.publicCode||error.message||'UPSTREAM_ERROR';
    const message=status===500?'Server configuration is incomplete.':
      status>=500?'Database request failed.':code.replace(/_/g,' ').toLowerCase();
    return send(res,status,{error:{code,message}});
  }
}

module.exports=handler;
module.exports._test={bearer,mapDatabaseError,rpc};
