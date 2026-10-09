'use strict';

/**
 * SOULFLAME AI Document Intelligence A3 — untrusted-input candidate adapter.
 *
 * v1 parses UTF-8 CSV bytes. PDF and XLSX binaries are ONLY sniffed/validated;
 * parsing their pages/worksheets requires a separate vetted, sandboxed decoder.
 * This module can normalize the decoder's output, but never executes documents,
 * checks a legal claim or marks a candidate verified.
 *
 * SECURITY: IDs/digests must be minted/bound by the authorized server storage
 * layer. Never accept a client's evidence_id or decoded document as verified.
 * These are eight manufacturer ONBOARDING fields, not Battery Annex XIII fields.
 */
const { createHash } = require('node:crypto');

const ALIASES = Object.freeze({
  country: ['country', 'country of registration', 'държава', 'държава на регистрация'],
  company: ['company', 'company name', 'manufacturer', 'фирма', 'производител'],
  products: ['products', 'product category', 'продукти', 'продуктова категория'],
  sku: ['number of models', 'model count', 'sku count', 'number of skus',
    'брой модели', 'брой продуктови модели'],
  annualVolume: ['annual volume', 'annual production volume',
    'units per year', 'годишен обем', 'годишен производствен обем'],
  users: ['users', 'team members', 'platform users', 'потребители', 'членове на екипа'],
  systems: ['systems', 'erp systems', 'software systems', 'системи', 'използвани системи'],
  automation: ['automation goal', 'automation needs', 'automation',
    'автоматизация', 'нужди от автоматизация']
});
const MAX_BYTES = 1024 * 1024;
const MAX_ROWS = 1000;
const MAX_COLUMNS = 64;
const MAX_CELL = 5000;
const ALLOWED_TYPES = Object.freeze({
  csv: Object.freeze({ext: '.csv', mimes:['text/csv', 'application/csv']}),
  pdf: Object.freeze({ext: '.pdf', mimes:['application/pdf']}),
  xlsx: Object.freeze({ext: '.xlsx', mimes:['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']})
});
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^[a-f0-9]{64}$/i;
const normalize = v => String(v).trim().normalize('NFKC').toLowerCase().replace(/\s+/g,' ');
const KNOWN = new Map(Object.entries(ALIASES).flatMap(([key,aliases]) =>
  aliases.map(name=>[normalize(name),key])));
class DocumentIntelligenceError extends Error {
  constructor(code) { super(code); this.name='DocumentIntelligenceError'; this.code=code; }
}
function invalid(code) { throw new DocumentIntelligenceError(code); }
function validEvidenceId(v) { return typeof v==='string' && UUID.test(v); }
function textCell(v) {
  if(typeof v!=='string' || !v.trim() || v.length>MAX_CELL || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v))
    return false;
  // Do not export formula-like strings as DPP candidate values.
  return !/^[\s\uFEFF]*[=+\-@]/.test(v);
}
function uploadKind({filename,mime,bytes}={}) {
  if(typeof filename!=='string' || filename.length<5 || filename.length>255 ||
    /[\/\\\u0000-\u001f\u007f]/.test(filename) || filename.includes('..'))
    invalid('INVALID_FILENAME');
  if(!Buffer.isBuffer(bytes) || bytes.length<1 || bytes.length>MAX_BYTES)
    invalid('INVALID_FILE_SIZE');
  const kind=Object.keys(ALLOWED_TYPES).find(k=>filename.toLowerCase().endsWith(ALLOWED_TYPES[k].ext));
  if(!kind || !ALLOWED_TYPES[kind].mimes.includes(mime)) invalid('UNSUPPORTED_MEDIA_TYPE');
  if(kind==='pdf' && !bytes.subarray(0,1024).includes(Buffer.from('%PDF-'))) invalid('INVALID_FILE_SIGNATURE');
  if(kind==='xlsx' && !(bytes[0]===0x50 && bytes[1]===0x4b && bytes[2]===0x03 && bytes[3]===0x04))
    invalid('INVALID_FILE_SIGNATURE');
  if(kind==='csv' && (bytes.includes(0) || (bytes[0]===0xff && bytes[1]===0xfe) ||
    (bytes[0]===0xfe && bytes[1]===0xff))) invalid('INVALID_CSV_ENCODING');
  return {kind,sha256:createHash('sha256').update(bytes).digest('hex'),
    bytes:bytes.length,requires_external_decoder:kind!=='csv',
    decoder_status:kind==='csv'?'csv_ready':'requires_sandboxed_decoder'};
}
function decodeCsvUtf8(bytes) {
  try {return new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);}
  catch {invalid('INVALID_CSV_ENCODING');}
}
function parseCsv(bytes) {
  const csv=typeof bytes==='string'?bytes:decodeCsvUtf8(bytes);
  if(Buffer.byteLength(csv,'utf8')>MAX_BYTES || csv.includes('\0')) invalid('INVALID_CSV_ENCODING');
  const rows=[]; let row=[],cell='',inQuotes=false,afterQuote=false,atStart=true;
  let line=1,rowLine=1;
  const pushCell=()=>{
    if(cell.length>MAX_CELL) invalid('CELL_TOO_LONG');
    if(row.length>=MAX_COLUMNS) invalid('TOO_MANY_COLUMNS');
    row.push(cell);cell='';atStart=true;afterQuote=false;
  };
  const pushRow=()=>{
    pushCell();
    if(rows.length>=MAX_ROWS) invalid('TOO_MANY_ROWS');
    rows.push({line:rowLine,values:row});row=[];rowLine=line;
  };
  for(let i=0;i<csv.length;i++){
    const c=csv[i];
    if(inQuotes){
      if(c==='"'){
        if(csv[i+1]==='"'){cell+='"';i++;}
        else {inQuotes=false;afterQuote=true;}
      } else {cell+=c; if(c==='\n')line++;}
    }else if(afterQuote){
      if(c===',')pushCell();
      else if(c==='\r' && csv[i+1]==='\n'){i++;line++;pushRow();}
      else if(c==='\n'){line++;pushRow();}
      else invalid('INVALID_CSV_QUOTING');
    }else if(c===',' )pushCell();
    else if(c==='"'){if(!atStart)invalid('INVALID_CSV_QUOTING');inQuotes=true;atStart=false;}
    else if(c==='\r' && csv[i+1]==='\n'){i++;line++;pushRow();}
    else if(c==='\n'){line++;pushRow();}
    else if(c==='\r')invalid('INVALID_CSV_NEWLINE');
    else {cell+=c;atStart=false;}
    if(cell.length>MAX_CELL) invalid('CELL_TOO_LONG');
  }
  if(inQuotes)invalid('INVALID_CSV_QUOTING');
  if(cell!=='' || row.length || afterQuote)pushRow();
  // RFC 4180: a BOM may appear only at the very beginning.
  if(rows[0]?.values[0]?.charCodeAt(0)===0xfeff)rows[0].values[0]=rows[0].values[0].slice(1);
  return rows;
}
function makeEvidence(source){
  if(!source || !validEvidenceId(source.evidence_id) || !SHA256.test(source.sha256||''))
    invalid('INVALID_EVIDENCE_REFERENCE');
  return {evidence_id:source.evidence_id,sha256:source.sha256.toLowerCase()};
}
function extractRows({rows,source,format='csv',sheet=null}={}){
  const evidence=makeEvidence(source);
  if(!['csv','xlsx'].includes(format)||!Array.isArray(rows) || rows.length<1 ||
    rows.length>MAX_ROWS) invalid('INVALID_TABULAR_DATA');
  const prepared=rows.map((r,i)=>{
    const cells=Array.isArray(r)?r:r?.values;
    const row=Array.isArray(r)?i+1:r?.line;
    if(!Array.isArray(cells)||cells.length>MAX_COLUMNS||
      !Number.isSafeInteger(row)||row<1 ||
      cells.some(v=>typeof v!=='string' || v.length>MAX_CELL))
      invalid('INVALID_TABULAR_ROW');
    return {row,values:cells};
  });
  if(format==='xlsx' && (typeof sheet!=='string'||!sheet.trim()||sheet.length>128))
    invalid('INVALID_WORKSHEET_NAME');
  const header=prepared[0].values.map(normalize);
  const seen=new Set(), columns=[];
  header.forEach((name,col)=>{
    const key=KNOWN.get(name);
    if(!key)return;
    if(seen.has(key)) invalid('DUPLICATE_FIELD_HEADER');
    seen.add(key);columns.push({col,key,header:name});
  });
  const candidates=[],issues=[];
  for(const entry of prepared.slice(1)){
    for(const {col,key,header} of columns) {
      const raw=entry.values[col]??'';
      if(!raw.trim())continue;
      if(!textCell(raw)) {
        issues.push({row:entry.row,column:col+1,key,code:'UNSAFE_OR_INVALID_CELL'});
        continue;
      }
      candidates.push({
        key,value:raw.trim(),evidence:raw.trim().slice(0,1000),
        source_type:'document',source_ref:'evidence:'+evidence.evidence_id,
        source_digest:evidence.sha256,
        source_anchor:format==='csv'?{row:entry.row,column:col+1}:
          {sheet,row:entry.row,column:col+1},
        verified:false
      });
    }
  }
  return {format,candidates,issues,conflicted_fields:conflicted(candidates),
    unmapped_headers:header.filter(name=>name&&!KNOWN.has(name))};
}
function extractPdfPages({pages,source}={}){
  const evidence=makeEvidence(source);
  if(!Array.isArray(pages)||pages.length<1||pages.length>200) invalid('INVALID_PDF_PAGES');
  const candidates=[],issues=[];
  const seenPages=new Set();
  for(const page of pages){
    if(!page || !Number.isSafeInteger(page.number)||page.number<1||
      seenPages.has(page.number)||typeof page.text!=='string'||
      page.text.length>100000)invalid('INVALID_PDF_PAGE');
    seenPages.add(page.number);
    for(const [ix,line] of page.text.split(/\r?\n/).entries()){
      if(ix>=10000)invalid('PDF_TOO_MANY_LINES');
      // Conservative text extraction from an OUTSIDE trusted parser. The page
      // and line number must refer to the original stored document.
      const match=/^([^:\n]{1,120}):[ \t]*(.{1,5000})$/.exec(line.trim());
      if(!match)continue;
      const key=KNOWN.get(normalize(match[1]));
      if(!key)continue;
      const value=match[2].trim();
      if(!textCell(value)){
        issues.push({page:page.number,line:ix+1,key,code:'UNSAFE_OR_INVALID_CELL'});
        continue;
      }
      candidates.push({key,value,evidence:value.slice(0,1000),source_type:'document',
        source_ref:'evidence:'+evidence.evidence_id,
        source_digest:evidence.sha256,source_anchor:{page:page.number,line:ix+1},verified:false});
    }
  }
  return {format:'pdf',candidates,issues,conflicted_fields:conflicted(candidates)};
}
function conflicted(candidates){
  const seen=new Map(), conflicts=new Set();
  for(const c of candidates){
    const normalized=normalize(c.value);
    if(seen.has(c.key)&&seen.get(c.key)!==normalized)conflicts.add(c.key);
    else seen.set(c.key,normalized);
  }
  return [...conflicts];
}
function extractCsvDocument({file,source}={}){
  const info=uploadKind(file);
  if(info.kind!=='csv')invalid('REQUIRES_SANDBOXED_DECODER');
  const result=extractRows({rows:parseCsv(file.bytes),source,format:'csv'});
  return {...result,upload:{kind:info.kind,sha256:info.sha256,bytes:info.bytes}};
}
module.exports={DocumentIntelligenceError,uploadKind,parseCsv,extractRows,
  extractPdfPages,extractCsvDocument,conflicted,ALIASES};
