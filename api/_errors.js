'use strict';

const contract = require('../data/api-error-contract.json');

function surfaceEntry(surface, sqlstate) {
  const common = contract.common_sqlstate && contract.common_sqlstate[sqlstate];
  if (common) return common;
  const scoped = contract.surfaces && contract.surfaces[surface];
  if (scoped && scoped[sqlstate]) return scoped[sqlstate];
  return contract.default;
}

function mapDatabaseError(surface, data) {
  const sqlstate = data && data.code;
  const entry = surfaceEntry(surface, sqlstate);
  return {
    status: entry.http_status,
    code: entry.code,
    message: entry.message
  };
}

function localError(code, fallbackMessage) {
  const entry = contract.local_codes && contract.local_codes[code];
  if (entry) {
    return {
      status: entry.http_status,
      code,
      message: fallbackMessage || entry.message
    };
  }
  return {
    status: contract.default.http_status,
    code: contract.default.code,
    message: contract.default.message
  };
}

function errorBody(error) {
  return {
    error: {
      code: error.code,
      message: error.message
    }
  };
}

module.exports = {
  contract,
  mapDatabaseError,
  localError,
  errorBody
};
