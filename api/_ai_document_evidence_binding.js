'use strict';

/**
 * Server-side integrity gate for A3 document adapters.
 * A trusted EvidenceRecord must be fetched by an authenticated, tenant-scoped
 * backend. File scan/decoding and authorization are NOT implemented here.
 */
const {DocumentIntelligenceError,uploadKind,extractCsvDocument,extractPdfPages,
  extractRows}=require('./_ai_document_intelligence.js');
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function requireBoundEvidence(file,record){
 if(!record||typeof record!=='object'||typeof record.id!=='string'||
  !UUID.test(record.id)||typeof record.tenant_id!=='string'||!UUID.test(record.tenant_id)||
  record.scan_status!=='clean')
  throw new DocumentIntelligenceError('EVIDENCE_NOT_AUTHORIZED_AND_CLEAN');
 const actual=uploadKind(file);
 if(record.sha256!==actual.sha256||record.size_bytes!==actual.bytes||
  record.filename!==file.filename||record.mime_type!==file.mime)
  throw new DocumentIntelligenceError('EVIDENCE_INTEGRITY_MISMATCH');
 return {id:record.id,kind:actual.kind,
   source:{evidence_id:record.id,sha256:actual.sha256}};
}
function boundCsv({file,trustedRecord}={}){
 const b=requireBoundEvidence(file,trustedRecord);
 if(b.kind!=='csv')throw new DocumentIntelligenceError('INCORRECT_DECODER');
 return extractCsvDocument({file,source:b.source});
}
function boundDecodedPdf({file,trustedRecord,pages}={}){
 const b=requireBoundEvidence(file,trustedRecord);
 if(b.kind!=='pdf')throw new DocumentIntelligenceError('INCORRECT_DECODER');
 return extractPdfPages({pages,source:b.source});
}
function boundDecodedXlsx({file,trustedRecord,rows,sheet}={}){
 const b=requireBoundEvidence(file,trustedRecord);
 if(b.kind!=='xlsx')throw new DocumentIntelligenceError('INCORRECT_DECODER');
 return extractRows({rows,source:b.source,format:'xlsx',sheet});
}
module.exports={requireBoundEvidence,boundCsv,boundDecodedPdf,boundDecodedXlsx};
