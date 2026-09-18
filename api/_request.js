'use strict';

const MAX_BODY_BYTES = 1024 * 1024;

class RequestBodyError extends Error {
  constructor(status, code, message) {
    super(code);
    this.status = status;
    this.code = code;
    this.publicMessage = message;
  }
}

function tooLarge() {
  return new RequestBodyError(413, 'PAYLOAD_TOO_LARGE', 'Request body exceeds the 1 MiB limit.');
}

function invalidJson() {
  return new RequestBodyError(400, 'INVALID_JSON', 'Request body must be valid JSON.');
}

function parseBody(req) {
  const value = req && req.body;
  if (value == null || value === '') return {};

  if (Buffer.isBuffer(value)) {
    if (value.length > MAX_BODY_BYTES) throw tooLarge();
    try { return JSON.parse(value.toString('utf8')); }
    catch (_) { throw invalidJson(); }
  }

  if (typeof value === 'string') {
    if (Buffer.byteLength(value, 'utf8') > MAX_BODY_BYTES) throw tooLarge();
    try { return JSON.parse(value); }
    catch (_) { throw invalidJson(); }
  }

  if (typeof value === 'object') {
    let encoded;
    try { encoded = JSON.stringify(value); }
    catch (_) { throw invalidJson(); }
    if (Buffer.byteLength(encoded, 'utf8') > MAX_BODY_BYTES) throw tooLarge();
    return value;
  }

  throw invalidJson();
}

function bodyErrorResponse(error) {
  if (error instanceof RequestBodyError) {
    return {
      status: error.status,
      body: { error: { code: error.code, message: error.publicMessage } }
    };
  }
  return {
    status: 400,
    body: { error: { code: 'INVALID_JSON', message: 'Request body must be valid JSON.' } }
  };
}

module.exports = {
  MAX_BODY_BYTES,
  RequestBodyError,
  parseBody,
  bodyErrorResponse
};
