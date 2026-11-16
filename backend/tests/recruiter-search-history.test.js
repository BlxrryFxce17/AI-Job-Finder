const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const crypto = require('node:crypto');
const { createSearchHandler } = require('../routes/hrRoutes');
test('repeated recruiter searches preserve contacted/deleted profiles and deduplicate by URL, not name', async () => {
  const userId = new mongoose.Types.ObjectId().toString();
  const links = Array.from({ length: 4 }, () => `https://www.linkedin.com/in/${crypto.randomUUID()}`);
  const history = [{ _id: new mongoose.Types.ObjectId(), id: crypto.randomUUID(), hrLinkedIn: links[0], company: 'Previous Employer', status: 'Replied', emailRecipient: `contact@${crypto.randomUUID()}.invalid` }, { _id: new mongoose.Types.ObjectId(), hrLinkedIn: links[1], isDeleted: true }];
  const created = [], updates = [];
  const Model = {
    async init() {},
    find(filter) { assert.equal(filter.userId, userId); assert.equal(filter.isDeleted, undefined); return { sort: () => ({ lean: async () => history }) }; },
    async updateOne(filter, update) { assert.equal(filter.userId, userId); updates.push(update); },
    async create(doc) { assert.equal(doc.userId, userId); created.push(doc); return doc; }
  };
  let queued;
  const handler = createSearchHandler({ Model, getDomain: async () => null, queue: id => { queued = id; }, search: async options => {
    assert.equal(options.mode, 'company');
    return { diagnostics: [], message: 'Found source-supported profiles', profiles: links.map(link => ({ link, name: 'Alex Sample', role: 'Technical Recruiter', company: 'Current Employer', snippet: 'Recruiting software engineers', source: 'Search', score: 80, reasons: ['Employer evidence'], observedAt: new Date() })) };
  } });
  const response = await new Promise(resolve => handler({ user: { id: userId }, body: { mode: 'company', query: 'Current Employer', locations: ['India'] } }, { on() {}, json: resolve, status() { return this; } }));
  assert.equal(response.count, 2); assert.equal(response.refreshed, 1); assert.equal(response.excluded, 1);
  assert.equal(created.length, 2); assert.notEqual(created[0].hrProfileKey, created[1].hrProfileKey);
  assert.equal(updates[0].$set.status, undefined); assert.equal(updates[0].$set.emailRecipient, undefined); assert.equal(updates[0].$set.company, undefined);
  assert.equal(response.jobs[0].status, 'Replied'); assert.equal(queued, userId);
});
test('invalid company/role modes fail before provider calls', async () => {
  const handler = createSearchHandler({ search: async () => { throw new Error('Must not search'); } });
  let status;
  await handler({ body: { mode: 'unknown', query: 'Example' } }, { status(code) { status = code; return this; }, json() {} });
  assert.equal(status, 400);
});
