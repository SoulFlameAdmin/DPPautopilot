'use strict';
// M24_ONBOARDING_FLOW_PRECURSOR_PASS

const test=require('node:test');
const assert=require('node:assert/strict');
const limiter=require('../../api/_rate_limit.js');
const organizations=require('../../api/organizations.js');
const members=require('../../api/members.js');
const models=require('../../api/models.js');
const items=require('../../api/items.js');
const imports=require('../../api/imports.js');
const passport=require('../../api/passport.js');

const IDS={
  org:'d1818181-8181-4181-8181-818181818181',
  owner:'d2828282-8282-4282-8282-828282828282',
  editor:'d3838383-8383-4383-8383-838383838383',
  model:'d4848484-8484-4484-8484-848484848484',
  item:'d5858585-8585-4585-8585-858585858585',
  import:'d6868686-8686-4686-8686-868686868686',
  passport:'d7878787-8787-4787-8787-878787878787'
};

function makeRes(){
  return {
    statusCode:0,headers:{},body:'',
    setHeader(name,value){this.headers[String(name).toLowerCase()]=value;},
    end(value){this.body=value||'';}
  };
}
function req(method,body=null,query={},auth='Bearer m24-onboarding-token'){
  return {
    method,body,query,
    headers:{
      ...(auth?{authorization:auth}:{}),
      'x-forwarded-for':'203.0.113.200'
    }
  };
}
function json(res){return JSON.parse(res.body);}
function rpcName(url){return String(url).split('/').pop();}

function backend(){
  const state={
    activeOrg:null,
    members:[],
    model:null,
    item:null,
    import:null,
    passport:null,
    payloads:[]
  };
  const ok=data=>({ok:true,async json(){return data;}});
  const fail=(code,message='internal detail')=>({ok:false,async json(){return {code,message};}});

  const fetchImpl=async(url,options)=>{
    const rpc=rpcName(url);
    const body=JSON.parse(options.body||'{}');
    state.payloads.push({rpc,body});

    if(rpc==='dpp_api_organization_create'){
      state.activeOrg=IDS.org;
      state.members=[{user_id:IDS.owner,role:'owner'}];
      return ok({organization_id:IDS.org,name:body.p_name,slug:body.p_slug,role:'owner',active:true});
    }
    if(rpc==='dpp_api_members_add'){
      state.members.push({user_id:body.p_user_id,role:body.p_role});
      return ok({user_id:body.p_user_id,role:body.p_role});
    }
    if(rpc==='dpp_api_members_list') return ok(state.members);

    if(rpc==='dpp_api_models_create'){
      if(!state.activeOrg) return fail('DP103');
      state.model={
        id:IDS.model,
        model_identifier:body.p_model_identifier,
        manufacturer_name:body.p_manufacturer_name,
        category:body.p_category,
        canonical_data:body.p_canonical_data
      };
      return ok(state.model);
    }
    if(rpc==='dpp_api_items_create'){
      if(!state.model||body.p_model_id!==IDS.model) return fail('DP305');
      state.item={
        id:IDS.item,
        model_id:IDS.model,
        unique_identifier:body.p_unique_identifier,
        lifecycle_status:body.p_lifecycle_status,
        canonical_data:body.p_canonical_data
      };
      return ok(state.item);
    }

    if(rpc==='dpp_api_import_create'){
      state.import={id:IDS.import,status:'staged',rows:body.p_rows,row_count:0,error_count:0};
      return ok({import_id:IDS.import,status:'staged',staged_rows:body.p_rows.length});
    }
    if(rpc==='dpp_api_import_validate'){
      if(!state.import) return fail('DP001');
      state.import.row_count=state.import.rows.length;
      state.import.error_count=state.import.rows.reduce((n,row)=>n+(row.validation_errors||[]).length,0);
      state.import.status=state.import.error_count?'invalid':'validated';
      return ok({import_id:IDS.import,status:state.import.status,row_count:state.import.row_count,error_count:state.import.error_count});
    }
    if(rpc==='dpp_api_import_commit'){
      if(!state.import||state.import.status!=='validated') return fail('DP003');
      state.import.status='committed';
      return ok({import_id:IDS.import,status:'committed',committed_rows:state.import.row_count,already_committed:false});
    }

    if(rpc==='dpp_api_passport_create'){
      if(!state.item||body.p_battery_item_id!==IDS.item) return fail('DP405');
      state.passport={
        passport_id:IDS.passport,
        unique_identifier:state.item.unique_identifier,
        status:'draft',
        public_payload:body.p_public_payload,
        private_payload:body.p_private_payload,
        updated_at:'2026-09-19T06:45:00Z'
      };
      return ok(state.passport);
    }
    if(rpc==='dpp_api_passport_public'){
      if(!state.passport||body.p_unique_identifier!==state.passport.unique_identifier) return fail('DP402');
      return ok({
        passport_id:IDS.passport,
        unique_identifier:state.passport.unique_identifier,
        status:state.passport.status,
        public_payload:state.passport.public_payload,
        updated_at:state.passport.updated_at
      });
    }
    return fail('XX999',`unexpected RPC ${rpc}`);
  };
  return {state,fetchImpl};
}

test.beforeEach(()=>limiter._test.resetForTests());

test('new org -> member -> model/item -> import validate/commit -> public passport precursor',async()=>{
  const original=global.fetch;
  const originalWarn=console.warn;
  const oldUrl=process.env.SUPABASE_URL;
  const oldKey=process.env.SUPABASE_ANON_KEY;
  const b=backend();
  process.env.SUPABASE_URL='https://example.supabase.co';
  process.env.SUPABASE_ANON_KEY='anon-key';
  global.fetch=b.fetchImpl;
  console.warn=()=>{};
  try{
    let res=makeRes();
    await organizations(req('POST',{name:'Pilot Battery Org',slug:'pilot-battery-org'}),res);
    assert.equal(res.statusCode,201);
    assert.equal(json(res).data.organization_id,IDS.org);
    assert.equal(json(res).data.role,'owner');

    res=makeRes();
    await members(req('POST',{user_id:IDS.editor,role:'editor'}),res);
    assert.equal(res.statusCode,201);

    res=makeRes();
    await members(req('GET'),res);
    assert.equal(res.statusCode,200);
    assert.deepEqual(json(res).data.map(x=>x.role),['owner','editor']);

    res=makeRes();
    await models(req('POST',{
      model_identifier:'M24-PILOT-1',
      manufacturer_name:'Pilot Manufacturer',
      category:'electric_vehicle',
      canonical_data:{capacity_kwh:82}
    }),res);
    assert.equal(res.statusCode,201);
    assert.equal(json(res).data.id,IDS.model);

    res=makeRes();
    await items(req('POST',{
      model_id:IDS.model,
      unique_identifier:'urn:dpp:m24:pilot:0001',
      lifecycle_status:'original',
      canonical_data:{serial:'M24-PILOT-0001'}
    }),res);
    assert.equal(res.statusCode,201);
    assert.equal(json(res).data.id,IDS.item);

    const rows=[{
      normalized_model:{model_identifier:'M24-IMPORT-1',manufacturer_name:'Pilot Manufacturer',category:'portable'},
      normalized_item:{unique_identifier:'urn:dpp:m24:import:0001'},
      validation_errors:[]
    }];
    res=makeRes();
    await imports(req('POST',{rows}),res);
    assert.equal(res.statusCode,201);
    assert.equal(json(res).data.status,'staged');

    res=makeRes();
    await imports(req('PATCH',{id:IDS.import,action:'validate'}),res);
    assert.equal(res.statusCode,200);
    assert.equal(json(res).data.status,'validated');

    res=makeRes();
    await imports(req('PATCH',{id:IDS.import,action:'commit'}),res);
    assert.equal(res.statusCode,200);
    assert.equal(json(res).data.status,'committed');

    res=makeRes();
    await passport(req('POST',{
      battery_item_id:IDS.item,
      public_payload:{model:{identifier:'M24-PILOT-1'}},
      private_payload:{internal_note:'restricted'}
    }),res);
    assert.equal(res.statusCode,201);
    assert.equal(json(res).data.passport_id,IDS.passport);

    res=makeRes();
    await passport(req('GET',null,{identifier:'urn:dpp:m24:pilot:0001'},null),res);
    assert.equal(res.statusCode,200);
    assert.equal(json(res).data.unique_identifier,'urn:dpp:m24:pilot:0001');
    assert.equal(Object.prototype.hasOwnProperty.call(json(res).data,'private_payload'),false);

    for(const call of b.state.payloads.filter(x=>x.rpc.startsWith('dpp_api_members_'))){
      assert.equal(Object.prototype.hasOwnProperty.call(call.body,'p_organization_id'),false);
    }
    assert.equal(b.state.import.status,'committed');
    assert.equal(b.state.members.length,2);
  }finally{
    global.fetch=original;
    console.warn=originalWarn;
    if(oldUrl===undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL=oldUrl;
    if(oldKey===undefined) delete process.env.SUPABASE_ANON_KEY; else process.env.SUPABASE_ANON_KEY=oldKey;
  }
});
