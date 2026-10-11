'use strict';

const matrix=require('../data/lmt-battery-71-v2.json');
const catalog=require('../data/dpp-field-catalog.json');

const CATEGORIES=new Set(['portable','light_means_of_transport','starting_lighting_ignition','industrial','electric_vehicle','other']);
const LIFECYCLES=new Set(['original','repurposed','remanufactured','second_life','waste','retired']);
const MONTH=/^\d{4}-(0[1-9]|1[0-2])$/;
const KNOWN_MAPPING_TARGETS=new Set([
  '',
  ...catalog.fields.map(field=>field.path),
  ...matrix.points.map(point=>point.valuePath)
]);
const POINT_BY_PATH=new Map(matrix.points.map(point=>[point.valuePath,point]));

function isObject(value){return !!value&&typeof value==='object'&&!Array.isArray(value);}
function nonEmptyString(value){return typeof value==='string'&&value.trim().length>0;}
function getPath(root,dotted){
  let current=root;
  for(const part of dotted.split('.')){
    if(!isObject(current)||!Object.hasOwn(current,part))return {exists:false,value:undefined};
    current=current[part];
  }
  return {exists:true,value:current};
}
function valueTypeValid(kind,value){
  if(kind==='number')return typeof value==='number'&&Number.isFinite(value);
  if(kind==='integer')return Number.isSafeInteger(value);
  if(kind==='month')return typeof value==='string'&&MONTH.test(value);
  if(kind==='string'||kind==='enum'||kind==='document_ref')return nonEmptyString(value);
  if(kind==='array')return Array.isArray(value);
  if(kind==='document_ref_array')return Array.isArray(value)&&value.every(nonEmptyString);
  if(kind==='object')return isObject(value);
  return false;
}
function printableIdentifier(value){
  return nonEmptyString(value)&&value.trim().length<=300&&![...value].some(ch=>{const c=ch.codePointAt(0);return c<32||c===127;});
}
function error(code,path){return {code,path};}
function validatePoint(point,value){
  const errors=[];
  if(!valueTypeValid(point.valueType,value))return [error('VALUE_TYPE_INVALID',point.valuePath)];
  if(point.unit==='%'&&!(value>=0&&value<=100))errors.push(error('PERCENT_OUT_OF_RANGE',point.valuePath));
  if(point.unit==='cycles'&&value<0)errors.push(error('CYCLES_NEGATIVE',point.valuePath));
  if(['model.physical.weight_kg','model.rated_capacity_ah','model.c_rate_test'].includes(point.valuePath)&&value<=0){
    errors.push(error('NON_POSITIVE_VALUE',point.valuePath));
  }
  if(point.valuePath.startsWith('model.voltage.')&&value<=0)errors.push(error('NON_POSITIVE_VALUE',point.valuePath));
  if(point.valuePath==='item.unique_identifier'&&!printableIdentifier(value))errors.push(error('IDENTIFIER_INVALID',point.valuePath));
  return errors;
}
function canonicalValue(row,point){
  const path=point.valuePath;
  if(path.startsWith('model.')){
    const data=row.normalized_model.canonical_data;
    if(!isObject(data))return {exists:false,value:undefined};
    return getPath(data,path.slice('model.'.length));
  }
  if(path.startsWith('item.')){
    const data=row.normalized_item.canonical_data;
    if(!isObject(data))return {exists:false,value:undefined};
    return getPath(data,path.slice('item.'.length));
  }
  return {exists:false,value:undefined};
}
function compareIfPresent(errors,root,path,expected,code){
  if(!isObject(root))return;
  const found=getPath(root,path);
  if(found.exists&&found.value!==expected)errors.push(error(code,path));
}
function validateNormalizedRow(row){
  const errors=[];
  if(!isObject(row))return [error('ROW_OBJECT_REQUIRED','$')];
  const model=row.normalized_model,item=row.normalized_item;
  if(!isObject(model))errors.push(error('MODEL_OBJECT_REQUIRED','normalized_model'));
  if(!isObject(item))errors.push(error('ITEM_OBJECT_REQUIRED','normalized_item'));
  if(errors.length)return errors;

  if(!nonEmptyString(model.model_identifier))errors.push(error('MODEL_IDENTIFIER_REQUIRED','normalized_model.model_identifier'));
  if(!nonEmptyString(model.manufacturer_name))errors.push(error('MANUFACTURER_REQUIRED','normalized_model.manufacturer_name'));
  if(!CATEGORIES.has(model.category))errors.push(error('CATEGORY_INVALID','normalized_model.category'));
  if(!printableIdentifier(item.unique_identifier))errors.push(error('IDENTIFIER_INVALID','normalized_item.unique_identifier'));
  const lifecycle=item.lifecycle_status==null||item.lifecycle_status===''?'original':item.lifecycle_status;
  if(!LIFECYCLES.has(lifecycle))errors.push(error('LIFECYCLE_INVALID','normalized_item.lifecycle_status'));
  if(model.canonical_data!=null&&!isObject(model.canonical_data))errors.push(error('CANONICAL_MODEL_OBJECT_REQUIRED','normalized_model.canonical_data'));
  if(item.canonical_data!=null&&!isObject(item.canonical_data))errors.push(error('CANONICAL_ITEM_OBJECT_REQUIRED','normalized_item.canonical_data'));

  compareIfPresent(errors,model.canonical_data,'identification.manufacturer.name',model.manufacturer_name,'MANUFACTURER_IDENTITY_MISMATCH');
  compareIfPresent(errors,model.canonical_data,'identification.model_id',model.model_identifier,'MODEL_IDENTITY_MISMATCH');
  compareIfPresent(errors,model.canonical_data,'identification.category',model.category,'CATEGORY_IDENTITY_MISMATCH');
  compareIfPresent(errors,item.canonical_data,'unique_identifier',item.unique_identifier,'ITEM_IDENTITY_MISMATCH');
  compareIfPresent(errors,item.canonical_data,'lifecycle_status',lifecycle,'LIFECYCLE_IDENTITY_MISMATCH');

  if(model.category!=='light_means_of_transport')return errors;

  for(const point of matrix.points){
    const found=canonicalValue(row,point);
    if(found.exists)errors.push(...validatePoint(point,found.value));
  }

  // Top-level identity fields are commit-authoritative even if canonical_data omits duplicates.
  errors.push(...validatePoint(POINT_BY_PATH.get('item.unique_identifier'),item.unique_identifier));

  for(const group of matrix.validation?.orderedGroups||[]){
    const values=[];
    let complete=true;
    for(const path of group){
      const point=POINT_BY_PATH.get(path);
      if(!point){complete=false;break;}
      const found=canonicalValue(row,point);
      if(!found.exists||!valueTypeValid(point.valueType,found.value)){complete=false;break;}
      values.push(found.value);
    }
    if(complete&&values.some((value,index)=>index>0&&values[index-1]>value)){
      errors.push(error('ORDERED_GROUP_INVALID',group.join(' <= ')));
    }
  }
  return errors;
}
function validateNormalizedRows(rows){
  if(!Array.isArray(rows))return [{row:null,errors:[error('ROWS_ARRAY_REQUIRED','$')]}];
  return rows.map((row,index)=>({row:index+1,errors:validateNormalizedRow(row)})).filter(result=>result.errors.length>0);
}
function validMappingTarget(value){return typeof value==='string'&&KNOWN_MAPPING_TARGETS.has(value.trim());}

module.exports={
  CATEGORIES,LIFECYCLES,KNOWN_MAPPING_TARGETS,
  isObject,getPath,valueTypeValid,printableIdentifier,
  validatePoint,validateNormalizedRow,validateNormalizedRows,validMappingTarget
};
