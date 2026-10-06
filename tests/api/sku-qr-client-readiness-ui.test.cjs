'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'../..');

test('manufacturer client UI exposes SKU and batch production controls',()=>{
  const html=fs.readFileSync(path.join(root,'live/manufacturer.html'),'utf8');
  const inline=fs.readFileSync(path.join(root,'assets/csp/manufacturer-inline-1.js'),'utf8');
  assert.match(html,/SKU \/ Model ID/);
  assert.match(html,/id="batchModel"/);
  assert.match(html,/id="batchProvision"/);
  assert.match(html,/Quantity/);
  assert.match(inline,/\/api\/batch-provision/);
  assert.match(inline,/item_canonical_data_template:\{\s*sku:model\.model_identifier/);
});

test('imports understand sku and QR print labels include sku',()=>{
  const ops=fs.readFileSync(path.join(root,'assets/csp/manufacturer-ops-inline-1.js'),'utf8');
  assert.match(ops,/sku:"model\.identification\.model_id"/);
  assert.match(ops,/product_sku:"model\.identification\.model_id"/);
  assert.match(ops,/SKU \/ Model ID/);
  assert.match(ops,/small\.textContent="SKU "\+sku/);
});

test('production QR screen exposes SKU from verified passport',()=>{
  const qr=fs.readFileSync(path.join(root,'assets/csp/qr-inline-1.js'),'utf8');
  assert.match(qr,/public_payload\?\.model\?\.identification\?\.model_id/);
  assert.match(qr,/' · SKU '/);
});
