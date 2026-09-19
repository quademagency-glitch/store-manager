// Runtime test intentionally outside Jest: Jest maps archiver to a stub and
// cannot catch a changed export/constructor in the installed ZIP library.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { inflateRawSync } = require('node:zlib');
const express = require('express');
const request = require('supertest');
process.env.LOG_LEVEL = 'silent';
const receiptRows = [
  { id: 'receipt-one', type: 'expense', receipt_url: 'one.txt' },
  { id: 'receipt-two', type: 'expense', receipt_url: 'two.txt' },
];
const files = { 'one.txt': Buffer.from('Complete first receipt'), 'two.txt': Buffer.from('Complete second receipt') };
const chain = new Proxy({}, { get: (_, key) => key === 'then' ? resolve => Promise.resolve({ data: receiptRows }).then(resolve) : () => chain });
function stub(modulePath, exports) {
  const id = require.resolve(modulePath);
  require.cache[id] = { id, filename: id, loaded: true, exports };
}
stub('../db/supabase', { supabaseAdmin: { from: () => chain, storage: { from: () => ({ download: async name => ({ data: { arrayBuffer: async () => files[name] } }) }) } } });
stub('../middleware/authGuard', (req, res, next) => { req.user = { id: 'owner', role: 'Business Admin', business_id: 'business' }; next(); });
stub('../utils/auditLog', { logAuditEvent() {}, AUDIT_ACTIONS: {} });
const app = express(); app.use('/ledger', require('../routes/ledger'));
function readZip(buffer) {
  const entries = {};
  for (let offset = 0; offset + 46 <= buffer.length; offset++) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) continue;
    const method = buffer.readUInt16LE(offset + 10);
    const size = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const name = buffer.subarray(offset + 46, offset + 46 + nameLength).toString();
    const local = buffer.readUInt32LE(offset + 42);
    const start = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28);
    const compressed = buffer.subarray(start, start + size);
    entries[name] = (method === 8 ? inflateRawSync(compressed) : compressed).toString();
  }
  return entries;
}
test('actual receipt endpoint produces a complete, readable ZIP with the installed library', async () => {
  const response = await request(app).get('/ledger/download-receipts').buffer(true).parse((res, done) => {
    const chunks = []; res.on('data', chunk => chunks.push(chunk)); res.on('end', () => done(null, Buffer.concat(chunks)));
  });
  assert.equal(response.status, 200);
  assert.match(response.headers['content-type'], /zip/);
  assert.deepEqual(readZip(response.body), {
    'expense_receipt-one.txt': 'Complete first receipt',
    'expense_receipt-two.txt': 'Complete second receipt',
  });
});
