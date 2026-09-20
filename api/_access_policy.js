'use strict';

const catalog = require('../data/dpp-field-catalog.json');

const PUBLIC_ACCESS = new Set(['public','public_identifier']);

function cloneJson(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}

function deletePath(root, segments) {
  if (!root || typeof root !== 'object' || Array.isArray(root) || segments.length === 0) return;
  let node = root;
  for (let i = 0; i < segments.length - 1; i += 1) {
    const key = segments[i];
    if (!node || typeof node !== 'object' || Array.isArray(node) || !Object.prototype.hasOwnProperty.call(node, key)) {
      return;
    }
    node = node[key];
  }
  if (node && typeof node === 'object' && !Array.isArray(node)) {
    delete node[segments[segments.length - 1]];
  }
}

function pruneEmptyObjects(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  for (const key of Object.keys(value)) {
    const child = value[key];
    if (child && typeof child === 'object' && !Array.isArray(child)) {
      pruneEmptyObjects(child);
      if (Object.keys(child).length === 0) delete value[key];
    }
  }
  return value;
}

function restrictedCatalogPaths() {
  return (catalog.fields || [])
    .filter(field => !PUBLIC_ACCESS.has(field.access))
    .map(field => String(field.path || '').split('.').filter(Boolean))
    .filter(parts => parts.length > 1);
}

const RESTRICTED_PATHS = restrictedCatalogPaths();

function pathExists(root, segments) {
  let node = root;
  for (const key of segments) {
    if (!node || typeof node !== 'object' || Array.isArray(node) || !Object.prototype.hasOwnProperty.call(node, key)) {
      return false;
    }
    node = node[key];
  }
  return true;
}

function findRestrictedPublicPaths(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return [];
  return RESTRICTED_PATHS
    .filter(parts => pathExists(payload, parts))
    .map(parts => parts.join('.'));
}

function sanitizePublicPayload(payload) {
  const out = cloneJson(payload);
  if (!out || typeof out !== 'object' || Array.isArray(out)) return out;
  for (const parts of RESTRICTED_PATHS) deletePath(out, parts);
  return pruneEmptyObjects(out);
}

module.exports = {
  PUBLIC_ACCESS,
  RESTRICTED_PATHS,
  sanitizePublicPayload,
  findRestrictedPublicPaths,
  _test: { deletePath, pathExists, restrictedCatalogPaths, cloneJson, pruneEmptyObjects }
};
