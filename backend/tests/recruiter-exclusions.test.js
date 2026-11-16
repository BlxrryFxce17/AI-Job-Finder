const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { noEmailFilter, shouldExclude } = require('../utils/recruiterExclusions');
const { createWorker } = require('../utils/recruiterEmailWorker');
const { createSearchHandler } = require('../routes/hrRoutes');

const lead = () => ({ _id: crypto.randomUUID(), userId: crypto.randomUUID(), status: 'HR_Found', hrLinkedIn: `https://www.linkedin.com/in/${crypto.randomUUID()}`, company: 'Example Employer', hrName: 'Sample Recruiter', emailRecipient: '' });

test('only unsuccessful, uncontacted recruiters without email are excluded', () => {
  const job = lead();
  for (const state of ['not_found', 'needs_employer', 'blocked', 'failed']) {
    const record = { ...job, hrEmailLookup: { state, attempts: 3 } };
    assert.equal(shouldExclude(record), true);
    assert.equal(shouldExclude({ ...record, status: 'Sent' }), false);
    assert.equal(shouldExclude({ ...record, emailRecipient: `hr@${crypto.randomUUID()}.invalid` }), false);
  }
  for (const state of ['queued', 'running', 'complete', 'failed', undefined]) assert.equal(shouldExclude({ ...job, hrEmailLookup: { state, attempts: 1 } }), false);
  assert.equal(noEmailFilter(job.userId).userId, job.userId);
});

test('worker retains a hidden identity record after an unsuccessful lookup or exhausted retries', async () => {
  for (const state of ['not_found', 'needs_employer', 'blocked', 'failed']) {
    const job = { ...lead(), hrEmailLookup: { attempts: 3 } };
    let update;
    await createWorker({ active: async () => true, Model: {
      async findOneAndUpdate(filter) { assert.equal(filter.userId, job.userId); return job; },
      async updateOne(filter, value) {
        assert.equal(filter.userId, job.userId);
        assert.equal(filter._id, job._id);
        assert.equal(filter.status, 'HR_Found');
        assert.ok(filter['hrEmailLookup.lease']);
        assert.deepEqual(filter.emailRecipient, { $in: ['', null] });
        update = value.$set;
      }
    }, lookup: async () => { if (state === 'failed') throw new Error('Unavailable'); return { state, recipients: [], reason: 'No address' }; } })(job.userId);
    assert.equal(update.isDeleted, true);
    assert.equal(update['hrEmailLookup.state'], state);
  }
});

test('repeat search excludes failed profiles, including canonical URL variants, without recreating them', async () => {
  const job = { ...lead(), hrEmailLookup: { state: 'not_found' } };
  const canonical = job.hrLinkedIn;
  job.hrLinkedIn += '/?trk=public';
  let updated;
  const Model = {
    async init() {},
    find(filter) { assert.equal(filter.userId, job.userId); return { sort: () => ({ lean: async () => [job] }) }; },
    async updateOne(filter, change) { assert.equal(filter.userId, job.userId); assert.equal(filter._id, job._id); assert.deepEqual(filter.emailRecipient, { $in: ['', null] }); updated = change; },
    async create() { assert.fail('Excluded recruiters must not be recreated'); }
  };
  const handler = createSearchHandler({ Model, queue() {}, search: async () => ({ profiles: [{ link: canonical, company: 'New Employer' }], diagnostics: [], message: 'Done' }) });
  let response;
  await handler({ user: { id: job.userId }, body: { query: 'engineering', mode: 'role' } }, { on() {}, json(value) { response = value; } });
  assert.equal(response.excluded, 1);
  assert.equal(response.count, 0);
  assert.deepEqual(response.jobs, []);
  assert.equal(updated.$set.isDeleted, true);
});
