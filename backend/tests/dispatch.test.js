const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const mongoose = require('mongoose');
const { createDispatcher } = require('../utils/dispatchService');

function matches(doc, filter) {
  return Object.entries(filter).every(([key, value]) => {
    if (key === '$or') return value.some(f => matches(doc, f));
    if (value?.$in) return value.$in.includes(doc[key]);
    if (value?.$lt) return doc[key] < value.$lt;
    return String(doc[key]) === String(value);
  });
}
function fixture() {
  const records = [];
  const counts = new Map();
  const Model = {
    async init() {},
    async create(doc) {
      if (records.some(r => String(r.userId) === String(doc.userId) && r.key === doc.key)) throw Object.assign(new Error('duplicate'), { code: 11000 });
      const record = { ...doc, _id: crypto.randomUUID(), state: 'preparing' }; records.push(record); return record;
    },
    async findOne(filter) { return records.find(r => matches(r, filter)); },
    async findOneAndUpdate(filter, update) { const r = records.find(r => matches(r, filter)); if (r) Object.assign(r, update.$set); return r; },
    async updateOne(filter, update) { const r = records.find(r => matches(r, filter)); if (!r) return { matchedCount: 0, modifiedCount: 0 }; Object.assign(r, update.$set); return { matchedCount: 1, modifiedCount: 1 }; }
  };
  const dispatch = createDispatcher({ Model, activeUser: async id => ({ _id: id }), reserve: async id => { counts.set(String(id), (counts.get(String(id)) || 0) + 1); return { day: require('../utils/safetyControls').localDay('Asia/Kolkata') }; } });
  const user = { _id: new mongoose.Types.ObjectId(), email: `sender@${crypto.randomUUID()}.invalid` };
  const mail = { to: `careers@${crypto.randomUUID()}.invalid`, subject: 'Application', text: 'I would like to discuss this role.' };
  return { dispatch, records, user, mail, counts };
}
test('concurrent and repeated sends submit once and recover the original RFC ID', async () => {
  const { dispatch, records, user, mail, counts } = fixture();
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let submitted = 0;
  const transport = async (u, m, o) => { await o.beforeSubmit(); submitted++; await gate; return { messageId: crypto.randomUUID(), threadId: crypto.randomUUID() }; };
  const first = dispatch(user, { ...mail }, { idempotencyKey: 'application' }, transport);
  // Let the first claim reach the submission boundary.
  while (!submitted) await new Promise(resolve => setImmediate(resolve));
  await assert.rejects(dispatch(user, { ...mail }, { idempotencyKey: 'application' }, transport), /already sending/);
  release();
  const result = await first;
  const retry = await dispatch(user, { ...mail, text: 'Edited draft' }, { idempotencyKey: 'application' }, transport);
  assert.equal(submitted, 1); assert.equal(retry.alreadySent, true);
  assert.equal(retry.rfcMessageId, result.rfcMessageId);
  assert.match(result.rfcMessageId, /^<.+@.+>$/);
  assert.equal(records[0].state, 'sent'); assert.equal(counts.get(String(user._id)), 1);
});
test('an ambiguous provider failure stays blocked and never retries another transport', async () => {
  const { dispatch, records, user, mail } = fixture();
  let submitted = 0;
  const transport = async (u, m, o) => { await o.beforeSubmit(); submitted++; throw new Error('socket timed out'); };
  await assert.rejects(dispatch(user, { ...mail }, {}, transport), /uncertain/);
  assert.equal(records[0].state, 'unknown');
  await assert.rejects(dispatch(user, { ...mail }, {}, transport), /uncertain/);
  assert.equal(submitted, 1);
});
test('a pre-submission failure is retryable and a second user has an independent claim', async () => {
  const { dispatch, records, user, mail, counts } = fixture();
  await assert.rejects(dispatch(user, { ...mail }, {}, async () => { throw new Error('recipient is blocked'); }), /blocked/);
  assert.equal(records[0].state, 'failed');
  const transport = async (u, m, o) => { await o.beforeSubmit(); return { messageId: crypto.randomUUID() }; };
  await dispatch(user, { ...mail }, {}, transport);
  const other = { ...user, _id: new mongoose.Types.ObjectId() };
  await dispatch(other, { ...mail }, {}, transport);
  assert.equal(records.length, 2); assert.equal(counts.get(String(user._id)), 1); assert.equal(counts.get(String(other._id)), 1);
});
test('stale preparations can recover, but stale submissions remain blocked', async () => {
  const { dispatch, records, user, mail } = fixture();
  await assert.rejects(dispatch(user, { ...mail }, {}, async () => { throw new Error('preflight'); }));
  records[0].state = 'preparing'; records[0].leaseUntil = new Date(0);
  await dispatch(user, { ...mail }, {}, async (u, m, o) => { await o.beforeSubmit(); return {}; });
  records[0].state = 'submitting'; records[0].leaseUntil = new Date(0);
  await assert.rejects(dispatch(user, { ...mail }, {}, async () => { throw new Error('must not run'); }), /uncertain/);
});
