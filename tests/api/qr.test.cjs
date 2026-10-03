const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const originalLoad = Module._load;
let lastEncoded = null;
Module._load = function(request, parent, isMain) {
  if (request === 'qrcode') {
    return {
      toString: async (value, options) => {
        lastEncoded = { value, options };
        return '<svg xmlns="http://www.w3.org/2000/svg"></svg>';
      }
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};
const handler = require('../../api/qr.js');
Module._load = originalLoad;

function response() {
  return {
    statusCode: 0,
    headers: {},
    body: '',
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    end(v = '') { this.body = v; }
  };
}

test('validIdentifier accepts normal battery identifiers', () => {
  assert.equal(handler._test.validIdentifier('urn:dpp:battery:123'), true);
  assert.equal(handler._test.validIdentifier(''), false);
});

test('passportUrl encodes identifier safely', () => {
  assert.equal(
    handler._test.passportUrl('BAT A/1', 'https://dpp.example'),
    'https://dpp.example/passport?identifier=BAT%20A%2F1'
  );
});

test('GET generates QR for canonical public passport URL', async () => {
  const req = {
    method: 'GET',
    query: { identifier: 'urn:dpp:battery:123' },
    headers: { host: 'dpp.example', 'x-forwarded-proto': 'https' }
  };
  const res = response();
  await handler(req, res);
  assert.equal(res.statusCode, 200);
  assert.match(res.headers['content-type'], /^image\/svg\+xml/);
  assert.equal(lastEncoded.value, 'https://dpp.example/passport?identifier=urn%3Adpp%3Abattery%3A123');
  assert.equal(lastEncoded.options.errorCorrectionLevel, 'M');
});

test('invalid identifier is rejected', async () => {
  const req = { method: 'GET', query: {}, headers: { host: 'dpp.example' } };
  const res = response();
  await handler(req, res);
  assert.equal(res.statusCode, 400);
  assert.equal(JSON.parse(res.body).error.code, 'INVALID_IDENTIFIER');
});

test('configured public base URL wins over request host', async () => {
  assert.equal(
    handler._test.requestBaseUrl(
      { headers: { host: 'preview.vercel.app' } },
      { DPP_PUBLIC_BASE_URL: 'https://passport.soulflame.example/' }
    ),
    'https://passport.soulflame.example'
  );
});
