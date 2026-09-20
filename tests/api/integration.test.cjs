'use strict';
// T03_API_INTEGRATION_PRECURSOR_PASS

const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const models=require('../../api/models.js');
const items=require('../../api/items.js');
const passport=require('../../api/passport.js');
const imports=require('../../api/imports.js');
const exportApi=require('../../api/export.js');

const IDS={
  model:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  item:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  passport:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  import:'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
};
const EVIDENCE_BYTES=Buffer.from('T03 evidence object bytes','utf8');
const EVIDENCE_SHA256=crypto.createHash('sha256').update(EVIDENCE_BYTES).digest('hex');
const EVIDENCE_BYTES_2=Buffer.from('T03 evidence object bytes second page','utf8');
const EVIDENCE_SHA256_2=crypto.createHash('sha256').update(EVIDENCE_BYTES_2).digest('hex');

function makeRes(){
  return {
    statusCode:0,headers:{},body:'',
    setHeader(name,value){this.headers[String(name).toLowerCase()]=value;},
    end(value){this.body=value||'';}
  };
}
function req(method,body=null,query={},auth='Bearer integration-token'){
  return {method,body,query,headers:auth?{authorization:auth}:{}};
}
function withEnv(){
  const oldUrl=process.env.SUPABASE_URL,oldKey=process.env.SUPABASE_ANON_KEY;
  process.env.SUPABASE_URL='https://example.supabase.co';
  process.env.SUPABASE_ANON_KEY='anon-key';
  return ()=>{
    if(oldUrl===undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL=oldUrl;
    if(oldKey===undefined) delete process.env.SUPABASE_ANON_KEY; else process.env.SUPABASE_ANON_KEY=oldKey;
  };
}
function json(res){return JSON.parse(res.body);}
function rpcName(url){return String(url).split('/').pop();}

function makeBackend(){
  const state={
    model:null,item:null,passport:null,
    imports:new Map(),
    exportCalls:0,
    passportCreateWrites:0
  };
  const fetchImpl=async(url,options)=>{
    if(String(url).includes('/functions/v1/dpp-evidence-object')){
      const parsed=new URL(String(url));
      const path=parsed.searchParams.get('path');
      const objects={
        'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee/evidence/passport/report.pdf':EVIDENCE_BYTES,
        'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee/evidence/passport/report-2.pdf':EVIDENCE_BYTES_2
      };
      const bytes=objects[path];
      if(!bytes){
        return {ok:false,status:404,async arrayBuffer(){return new ArrayBuffer(0);}};
      }
      return {
        ok:true,
        status:200,
        async arrayBuffer(){
          return bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
        }
      };
    }
    const rpc=rpcName(url);
    const body=JSON.parse(options.body||'{}');
    const ok=data=>({ok:true,async json(){return data;}});
    const fail=(code,message='internal detail')=>({ok:false,async json(){return {code,message};}});

    if(rpc==='dpp_api_models_create'){
      if(state.model&&state.model.model_identifier===body.p_model_identifier) return fail('23505','duplicate model internal');
      state.model={
        id:IDS.model,
        model_identifier:body.p_model_identifier,
        manufacturer_name:body.p_manufacturer_name,
        category:body.p_category,
        canonical_data:body.p_canonical_data
      };
      return ok(state.model);
    }
    if(rpc==='dpp_api_models_list') return ok(state.model?[state.model]:[]);
    if(rpc==='dpp_api_models_update'){
      if(!state.model||body.p_id!==IDS.model) return fail('DP205');
      state.model={...state.model,
        model_identifier:body.p_model_identifier??state.model.model_identifier,
        manufacturer_name:body.p_manufacturer_name??state.model.manufacturer_name,
        category:body.p_category??state.model.category,
        canonical_data:body.p_canonical_data??state.model.canonical_data
      };
      return ok(state.model);
    }

    if(rpc==='dpp_api_items_create'){
      if(!state.model||body.p_model_id!==IDS.model) return fail('DP305','model tenant detail');
      state.item={
        id:IDS.item,
        model_id:body.p_model_id,
        unique_identifier:body.p_unique_identifier,
        lifecycle_status:body.p_lifecycle_status,
        canonical_data:body.p_canonical_data
      };
      return ok(state.item);
    }
    if(rpc==='dpp_api_items_list') return ok(state.item?[state.item]:[]);
    if(rpc==='dpp_api_items_update'){
      if(!state.item||body.p_id!==IDS.item) return fail('DP306');
      state.item={...state.item,
        model_id:body.p_model_id??state.item.model_id,
        unique_identifier:body.p_unique_identifier??state.item.unique_identifier,
        lifecycle_status:body.p_lifecycle_status??state.item.lifecycle_status,
        canonical_data:body.p_canonical_data??state.item.canonical_data
      };
      return ok(state.item);
    }

    if(rpc==='dpp_api_passport_create'){
      if(!state.item||body.p_battery_item_id!==IDS.item) return fail('DP405');
      if(state.passport){
        const sameDraft=
          state.passport.status==='draft' &&
          state.passport.battery_item_id===body.p_battery_item_id &&
          JSON.stringify(state.passport.public_payload)===JSON.stringify(body.p_public_payload) &&
          JSON.stringify(state.passport.private_payload)===JSON.stringify(body.p_private_payload);
        if(sameDraft) return ok(state.passport);
        return fail('DP412','duplicate passport internal');
      }
      state.passport={
        passport_id:IDS.passport,
        battery_item_id:IDS.item,
        unique_identifier:state.item.unique_identifier,
        status:'draft',
        public_payload:body.p_public_payload,
        private_payload:body.p_private_payload,
        updated_at:'2026-09-19T00:00:00Z'
      };
      state.passportCreateWrites+=1;
      return ok(state.passport);
    }
    if(rpc==='dpp_api_passport_update_checked'){
      if(!state.passport||body.p_id!==IDS.passport) return fail('DP403');
      if(body.p_expected_updated_at!==state.passport.updated_at) return fail('DP411');
      state.passport={...state.passport,
        status:body.p_status??state.passport.status,
        public_payload:body.p_public_payload??state.passport.public_payload,
        private_payload:body.p_private_payload??state.passport.private_payload,
        updated_at:'2026-09-19T00:01:00Z'
      };
      return ok(state.passport);
    }
    if(rpc==='dpp_api_passport_private'){
      if(!state.passport||body.p_id!==IDS.passport) return fail('DP403','private tenant detail');
      return ok({...state.passport,organization_id:'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'});
    }
    if(rpc==='dpp_api_passport_public'){
      if(!state.passport||body.p_unique_identifier!==state.passport.unique_identifier) return fail('DP402');
      return ok({
        passport_id:state.passport.passport_id,
        unique_identifier:state.passport.unique_identifier,
        status:state.passport.status,
        public_payload:state.passport.public_payload,
        updated_at:state.passport.updated_at,
        private_payload:state.passport.private_payload,
        organization_id:'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
      });
    }

    if(rpc==='dpp_api_import_create'){
      const record={
        import_id:IDS.import,
        status:'staged',
        staged_rows:body.p_rows.length,
        rows:body.p_rows,
        row_count:0,
        error_count:0,
        already_committed:false
      };
      state.imports.set(IDS.import,record);
      return ok({import_id:record.import_id,status:record.status,staged_rows:record.staged_rows});
    }
    if(rpc==='dpp_api_import_validate'){
      const record=state.imports.get(body.p_import_id);
      if(!record) return fail('DP001','import tenant detail');
      record.row_count=record.rows.length;
      record.error_count=record.rows.reduce((n,r)=>n+(r.validation_errors||[]).length,0);
      record.status=record.error_count?'invalid':'validated';
      return ok({import_id:record.import_id,status:record.status,row_count:record.row_count,error_count:record.error_count});
    }
    if(rpc==='dpp_api_import_commit'){
      const record=state.imports.get(body.p_import_id);
      if(!record) return fail('DP001');
      if(record.status==='committed'){
        return ok({import_id:record.import_id,status:'committed',committed_rows:record.row_count,already_committed:true});
      }
      if(record.status!=='validated'||record.error_count) return fail('DP003','invalid commit internal');
      record.status='committed';
      record.already_committed=false;
      return ok({import_id:record.import_id,status:'committed',committed_rows:record.row_count,already_committed:false});
    }
    if(rpc==='dpp_api_import_get'){
      const record=state.imports.get(body.p_import_id);
      if(!record) return fail('DP001');
      return ok({import_id:record.import_id,status:record.status,row_count:record.row_count,error_count:record.error_count});
    }

    if(rpc==='dpp_api_export_bundle'){
      state.exportCalls+=1;
      const versions=state.passport?[{
        passport_id:IDS.passport,
        version_no:1,
        snapshot:{status:state.passport.status}
      }]:[];
      const audit=state.passport?[{
        id:1,
        target_table:'dpp_passports',
        target_id:IDS.passport,
        action:'UPDATE'
      }]:[];
      const evidence=state.passport?[
        {
          id:'ffffffff-ffff-4fff-8fff-ffffffffffff',
          related_record_type:'passport',
          related_record_id:IDS.passport,
          storage_bucket:'dpp-evidence',
          storage_path:'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee/evidence/passport/report.pdf',
          original_filename:'report.pdf',
          content_type:'application/pdf',
          byte_size:EVIDENCE_BYTES.length,
          sha256_hex:EVIDENCE_SHA256,
          metadata:{source:'integration'}
        },
        {
          id:'99999999-9999-4999-8999-999999999999',
          related_record_type:'passport',
          related_record_id:IDS.passport,
          storage_bucket:'dpp-evidence',
          storage_path:'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee/evidence/passport/report-2.pdf',
          original_filename:'report-2.pdf',
          content_type:'application/pdf',
          byte_size:EVIDENCE_BYTES_2.length,
          sha256_hex:EVIDENCE_SHA256_2,
          metadata:{source:'integration'}
        }
      ]:[];
      return ok({
        schema_version:1,
        organization_id:'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
        organization:{id:'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',name:'Integration Org'},
        generated_at:'2026-09-20T00:02:00Z',
        records:{
          battery_models:state.model?[state.model]:[],
          battery_items:state.item?[state.item]:[],
          passports:state.passport?[state.passport]:[],
          passport_versions:versions,
          audit_log:audit
        },
        evidence_manifest:evidence,
        counts:{
          battery_models:state.model?1:0,
          battery_items:state.item?1:0,
          passports:state.passport?1:0,
          passport_versions:versions.length,
          audit_log:audit.length,
          evidence_manifest:evidence.length
        }
      });
    }
    return fail('XX999',`unexpected RPC ${rpc}`);
  };
  return {state,fetchImpl};
}

test('protected API boundaries reject missing bearer before upstream',async()=>{
  const original=global.fetch;
  let called=0;
  global.fetch=async()=>{called+=1;throw new Error('unexpected');};
  try{
    for(const [handler,request] of [
      [models,req('GET',null,{},null)],
      [items,req('GET',null,{},null)],
      [passport,req('GET',null,{id:IDS.passport},null)],
      [imports,req('GET',null,{id:IDS.import},null)],
      [exportApi,req('GET',null,{},null)]
    ]){
      const res=makeRes();
      await handler(request,res);
      assert.equal(res.statusCode,401);
      assert.equal(json(res).error.code,'AUTH_REQUIRED');
    }
    assert.equal(called,0);
  }finally{global.fetch=original;}
});

test('stateful model -> item -> passport -> public/private -> export journey',async()=>{
  const restore=withEnv(),original=global.fetch;
  const backend=makeBackend();
  global.fetch=backend.fetchImpl;
  try{
    let res=makeRes();
    await models(req('POST',{
      model_identifier:'INT-MODEL-1',
      manufacturer_name:'Integration Maker',
      category:'electric_vehicle',
      canonical_data:{capacity_kwh:75}
    }),res);
    assert.equal(res.statusCode,201);
    assert.equal(json(res).data.id,IDS.model);

    res=makeRes();
    await items(req('POST',{
      model_id:IDS.model,
      unique_identifier:'urn:dpp:t03:item:1',
      lifecycle_status:'original',
      canonical_data:{serial:'T03-1'}
    }),res);
    assert.equal(res.statusCode,201);
    assert.equal(json(res).data.id,IDS.item);

    res=makeRes();
    await passport(req('POST',{
      battery_item_id:IDS.item,
      public_payload:{item:{unique_identifier:'urn:dpp:t03:item:1'},model:{name:'INT-MODEL-1'}},
      private_payload:{state_of_health:{percent:96}}
    }),res);
    assert.equal(res.statusCode,201);
    assert.equal(json(res).data.passport_id,IDS.passport);
    assert.equal(backend.state.passportCreateWrites,1);

    res=makeRes();
    await passport(req('POST',{
      battery_item_id:IDS.item,
      public_payload:{item:{unique_identifier:'urn:dpp:t03:item:1'},model:{name:'INT-MODEL-1'}},
      private_payload:{state_of_health:{percent:96}}
    }),res);
    assert.equal(res.statusCode,201);
    assert.equal(json(res).data.passport_id,IDS.passport);
    assert.equal(backend.state.passportCreateWrites,1);

    res=makeRes();
    await passport(req('POST',{
      battery_item_id:IDS.item,
      public_payload:{item:{unique_identifier:'urn:dpp:t03:item:1'},model:{name:'INT-MODEL-1'}},
      private_payload:{state_of_health:{percent:12}}
    }),res);
    assert.equal(res.statusCode,409);
    assert.equal(json(res).error.code,'PASSPORT_CONFLICT');
    assert.equal(res.body.includes('duplicate passport internal'),false);
    assert.equal(backend.state.passportCreateWrites,1);

    const passportUpdatedAt=backend.state.passport.updated_at;
    res=makeRes();
    await passport(req('PATCH',{
      id:IDS.passport,
      status:'active',
      expected_updated_at:passportUpdatedAt
    }),res);
    assert.equal(res.statusCode,200);
    assert.equal(json(res).data.status,'active');

    res=makeRes();
    await passport(req('GET',null,{id:IDS.passport}),res);
    assert.equal(res.statusCode,200);
    assert.equal(json(res).data.private_payload.state_of_health.percent,96);

    res=makeRes();
    await passport(req('GET',null,{identifier:'urn:dpp:t03:item:1'},null),res);
    assert.equal(res.statusCode,200);
    const publicData=json(res).data;
    assert.equal(publicData.status,'active');
    assert.equal(Object.prototype.hasOwnProperty.call(publicData,'private_payload'),false);
    assert.equal(Object.prototype.hasOwnProperty.call(publicData,'organization_id'),false);

    res=makeRes();
    await exportApi(req('GET',null,{
      include_evidence:'1',
      evidence_offset:'0',
      evidence_limit:'1'
    }),res);
    assert.equal(res.statusCode,200);
    const bundle=json(res).data;
    assert.equal(bundle.counts.battery_models,1);
    assert.equal(bundle.counts.battery_items,1);
    assert.equal(bundle.counts.passports,1);
    assert.equal(bundle.counts.passport_versions,1);
    assert.equal(bundle.counts.audit_log,1);
    assert.equal(bundle.counts.evidence_manifest,2);
    assert.equal(bundle.records.battery_models[0].id,IDS.model);
    assert.equal(bundle.records.battery_items[0].id,IDS.item);
    assert.equal(bundle.records.passports[0].passport_id,IDS.passport);
    assert.equal(bundle.records.passport_versions[0].passport_id,IDS.passport);
    assert.equal(bundle.records.audit_log[0].target_id,IDS.passport);
    assert.equal(bundle.evidence_manifest[0].storage_bucket,'dpp-evidence');
    assert.equal(bundle.evidence_manifest[0].sha256_hex,EVIDENCE_SHA256);
    assert.equal(Object.prototype.hasOwnProperty.call(bundle.evidence_manifest[0],'object_bytes'),false);
    assert.equal(Object.prototype.hasOwnProperty.call(bundle.evidence_manifest[0],'content_bytes'),false);
    assert.equal(Object.prototype.hasOwnProperty.call(bundle.evidence_manifest[0],'signed_url'),false);
    assert.equal(bundle.evidence_export.included,true);
    assert.equal(bundle.evidence_export.object_count,1);
    assert.equal(bundle.evidence_export.total_bytes,EVIDENCE_BYTES.length);
    assert.equal(bundle.evidence_export.integrity,'sha256_verified');
    assert.equal(bundle.evidence_export.paged,true);
    assert.equal(bundle.evidence_export.offset,0);
    assert.equal(bundle.evidence_export.limit,1);
    assert.equal(bundle.evidence_export.has_more,true);
    assert.equal(bundle.evidence_export.next_offset,1);
    assert.match(bundle.evidence_export.manifest_sha256,/^[0-9a-f]{64}$/);
    assert.equal(bundle.evidence_objects[0].storage_path,'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee/evidence/passport/report.pdf');
    assert.equal(bundle.evidence_objects[0].byte_size,EVIDENCE_BYTES.length);
    assert.equal(bundle.evidence_objects[0].sha256_hex,EVIDENCE_SHA256);
    assert.equal(bundle.evidence_objects[0].content_base64,EVIDENCE_BYTES.toString('base64'));
    assert.equal(Buffer.from(bundle.evidence_objects[0].content_base64,'base64').toString('utf8'),'T03 evidence object bytes');

    res=makeRes();
    await exportApi(req('GET',null,{
      include_evidence:'1',
      evidence_offset:String(bundle.evidence_export.next_offset),
      evidence_limit:'1',
      evidence_manifest_sha256:bundle.evidence_export.manifest_sha256
    }),res);
    assert.equal(res.statusCode,200);
    const secondPage=json(res).data;
    assert.equal(secondPage.evidence_export.manifest_sha256,bundle.evidence_export.manifest_sha256);
    assert.equal(secondPage.evidence_export.offset,1);
    assert.equal(secondPage.evidence_export.has_more,false);
    assert.equal(secondPage.evidence_export.next_offset,null);
    assert.equal(secondPage.evidence_objects.length,1);
    assert.equal(secondPage.evidence_objects[0].storage_path,'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee/evidence/passport/report-2.pdf');
    assert.equal(secondPage.evidence_objects[0].sha256_hex,EVIDENCE_SHA256_2);
    assert.equal(Buffer.from(secondPage.evidence_objects[0].content_base64,'base64').toString('utf8'),'T03 evidence object bytes second page');
    assert.equal(backend.state.exportCalls,2);
  }finally{global.fetch=original;restore();}
});

test('stateful import create -> validate -> commit -> repeat commit -> get journey',async()=>{
  const restore=withEnv(),original=global.fetch;
  const backend=makeBackend();
  global.fetch=backend.fetchImpl;
  try{
    const rows=[{
      normalized_model:{model_identifier:'IMP-1',manufacturer_name:'Import Maker',category:'portable'},
      normalized_item:{unique_identifier:'urn:dpp:t03:import:1'},
      validation_errors:[]
    }];

    let res=makeRes();
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
    assert.equal(json(res).data.already_committed,false);

    res=makeRes();
    await imports(req('PATCH',{id:IDS.import,action:'commit'}),res);
    assert.equal(res.statusCode,200);
    assert.equal(json(res).data.already_committed,true);

    res=makeRes();
    await imports(req('GET',null,{id:IDS.import}),res);
    assert.equal(res.statusCode,200);
    assert.equal(json(res).data.status,'committed');
    assert.equal(json(res).data.row_count,1);
  }finally{global.fetch=original;restore();}
});

test('semantic not-found and conflict errors stay stable and non-leaking',async()=>{
  const restore=withEnv(),original=global.fetch;
  const backend=makeBackend();
  global.fetch=backend.fetchImpl;
  try{
    let res=makeRes();
    await items(req('POST',{
      model_id:IDS.model,
      unique_identifier:'urn:dpp:t03:no-model'
    }),res);
    assert.equal(res.statusCode,404);
    assert.equal(json(res).error.code,'MODEL_NOT_FOUND');
    assert.equal(res.body.includes('tenant detail'),false);

    res=makeRes();
    await passport(req('GET',null,{id:IDS.passport}),res);
    assert.equal(res.statusCode,404);
    assert.equal(json(res).error.code,'PASSPORT_NOT_FOUND');

    res=makeRes();
    await imports(req('GET',null,{id:IDS.import}),res);
    assert.equal(res.statusCode,404);
    assert.equal(json(res).error.code,'IMPORT_NOT_FOUND');

    res=makeRes();
    await models(req('POST',{
      model_identifier:'DUP-MODEL',
      manufacturer_name:'Maker',
      category:'portable',
      canonical_data:{}
    }),res);
    assert.equal(res.statusCode,201);

    res=makeRes();
    await models(req('POST',{
      model_identifier:'DUP-MODEL',
      manufacturer_name:'Maker',
      category:'portable',
      canonical_data:{}
    }),res);
    assert.equal(res.statusCode,409);
    assert.equal(json(res).error.code,'MODEL_CONFLICT');
    assert.equal(res.body.includes('duplicate model internal'),false);
  }finally{global.fetch=original;restore();}
});

test('invalid import remains non-committable through HTTP semantic contract',async()=>{
  const restore=withEnv(),original=global.fetch;
  const backend=makeBackend();
  global.fetch=backend.fetchImpl;
  try{
    const rows=[{
      normalized_model:{model_identifier:'IMP-BAD',manufacturer_name:'Bad Maker',category:'portable'},
      normalized_item:{unique_identifier:'urn:dpp:t03:bad'},
      validation_errors:[{code:'required',field:'serial'}]
    }];

    let res=makeRes();
    await imports(req('POST',{rows}),res);
    assert.equal(res.statusCode,201);

    res=makeRes();
    await imports(req('PATCH',{id:IDS.import,action:'validate'}),res);
    assert.equal(res.statusCode,200);
    assert.equal(json(res).data.status,'invalid');
    assert.equal(json(res).data.error_count,1);

    res=makeRes();
    await imports(req('PATCH',{id:IDS.import,action:'commit'}),res);
    assert.equal(res.statusCode,409);
    assert.equal(json(res).error.code,'IMPORT_NOT_COMMITTABLE');
    assert.equal(res.body.includes('invalid commit internal'),false);
  }finally{global.fetch=original;restore();}
});
