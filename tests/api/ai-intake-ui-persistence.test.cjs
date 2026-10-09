'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(
  path.resolve(__dirname, '../../assets/csp/manufacturer-early-ai.js'),
  'utf8'
);

test('AI review session id is durable across browser restarts only when server persistence is enabled', () => {
  assert.match(source, /AI_SESSION_KEY="dpp_ai_intake_session_v1"/);
  assert.match(source, /localStorage\.setItem\(AI_SESSION_KEY/);
  assert.match(source, /persistence\?\.enabled===true&&validUuid\(persistence\?\.session_id\)/);
  assert.match(source, /else if\(persistence\?\.enabled===false\)setAiSession\(""\)/);
});

test('saved AI review restores from server snapshot without publishing anything', () => {
  assert.match(source, /stateApi\("snapshot",\{session_id:sessionId\}\)/);
  assert.match(source, /snapshot\?\.approved_answers/);
  assert.match(source, /snapshot\?\.messages/);
  assert.match(source, /Възстановихме последния запазен AI review/);
  assert.doesNotMatch(source, /stateApi\("publish"/);
  assert.doesNotMatch(source, /stateApi\("submit"/);
});

test('human approval audit is recorded before canonical questionnaire persistence', () => {
  const approval = source.indexOf('await recordApprovals(chosen)');
  const canonical = source.indexOf('action:"questionnaire_save"');
  assert.ok(approval >= 0, 'human approval audit call missing');
  assert.ok(canonical > approval, 'canonical save must follow human approval audit');
  assert.match(source, /stateApi\("review",\{session_id:sessionId,field_key:key,approved_value:value,accept:true\}\)/);
});

test('feature-off or stale persistence state fails back to the existing safe paths', () => {
  assert.match(source, /AI_PERSISTENCE_NOT_ENABLED/);
  assert.match(source, /AI_INTAKE_NOT_FOUND/);
  assert.match(source, /setAiSession\(""\)/);
  assert.match(source, /Ръчният режим остава напълно достъпен/);
  assert.match(source, /showManual/);
});
