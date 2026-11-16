const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const crypto = require('node:crypto');
const { createWorker } = require('../utils/recruiterEmailWorker');
const context = require('../utils/requestContext');
test('email lookup claims and results are scoped, leased, and persisted after completion', async () => {
  const userId = new mongoose.Types.ObjectId();
  const job = { _id: new mongoose.Types.ObjectId(), company: 'Example Employer', hrName: 'Alex Sample' };
  let lease, persisted;
  const Model = {
    async findOneAndUpdate(filter, update) { assert.equal(filter.userId, userId); assert.equal(filter.status, 'HR_Found'); assert.deepEqual(filter.isDeleted, { $ne: true }); lease = update.$set['hrEmailLookup.lease']; return job; },
    async updateOne(filter, update) { assert.equal(filter.userId, userId); assert.equal(filter._id, job._id); assert.equal(filter['hrEmailLookup.lease'], lease); assert.equal(filter.company, job.company); persisted = update; }
  };
  const worker = createWorker({ Model, active: async id => id === userId, lookup: async (doc, id) => { assert.equal(id, userId); assert.equal(context.getStore().userId, String(userId)); await new Promise(resolve => setImmediate(resolve)); return { state: 'complete', email: `hr@${crypto.randomUUID()}.invalid`, recipients: [{ email: `hr@${crypto.randomUUID()}.invalid`, deliverabilityScore: 65 }], evidence: { inferred: true }, reason: 'Inferred, not mailbox-confirmed' }; } });
  assert.equal(await worker(userId), true); assert.equal(persisted.$set['hrEmailLookup.state'], 'complete'); assert.ok(persisted.$set.emailRecipient); assert.ok('hrEmailLookup.lease' in persisted.$unset);
});
test('inactive accounts are not processed and failures get a durable retry state', async () => {
  const userId = new mongoose.Types.ObjectId(); let queries = 0, result;
  const Model = { async findOneAndUpdate() { queries++; return { _id: new mongoose.Types.ObjectId(), company: 'Employer', hrName: 'Alex Sample' }; }, async updateOne(filter, update) { assert.equal(filter.userId, userId); assert.equal(filter.status, 'HR_Found'); result = update; } };
  const inactive = createWorker({ Model, active: async () => false });
  assert.equal(await inactive(userId), false); assert.equal(queries, 0);
  const worker = createWorker({ Model, active: async () => true, lookup: async () => { throw new Error('Provider failed'); } });
  await worker(userId); assert.equal(result.$set['hrEmailLookup.state'], 'failed'); assert.ok(result.$set['hrEmailLookup.retryAt'] > new Date());
});
test('resolved employers persist even when an email domain still needs correction', async () => {
  const userId = new mongoose.Types.ObjectId();
  let changed;
  const worker = createWorker({ active: async () => true, Model: {
    async findOneAndUpdate() { return { _id: new mongoose.Types.ObjectId(), company: 'Unknown employer', hrName: 'Alex Sample' }; },
    async updateOne(filter, update) { assert.equal(filter.company, 'Unknown employer'); assert.equal(filter.userId, userId); changed = update.$set; }
  }, lookup: async () => ({ state: 'not_found', reason: 'Add the official domain', recipients: [], resolvedEmployer: { company: 'Resolved Employer', snippet: 'Experience: Resolved Employer', source: 'Search', sourceUrl: `https://www.linkedin.com/in/${crypto.randomUUID()}`, employerEvidence: 'Experience: Resolved Employer' } }) });
  await worker(userId);
  assert.equal(changed.company, 'Resolved Employer'); assert.equal(changed['hrEmailLookup.state'], 'not_found'); assert.equal(changed['hrEvidence.currentEmployer'], 'Resolved Employer');
  assert.equal(changed.emailRecipient, undefined);
});
