const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { createRecruiterLookup } = require('../utils/recruiterLookup');

test('batch discovery saves unsuccessful lookups and hides the profile within its tenant', async () => {
  for (const state of ['not_found', 'needs_employer']) {
    const job = { _id: crypto.randomUUID(), id: crypto.randomUUID(), userId: crypto.randomUUID(), status: 'HR_Found', company: 'Unknown employer', hrName: 'Sample Recruiter', hrLinkedIn: `https://www.linkedin.com/in/${crypto.randomUUID()}` };
    let changed, response;
    const handler = createRecruiterLookup({ Model: {
      findOne(filter) { assert.equal(filter.userId, job.userId); assert.deepEqual(filter.isDeleted, { $ne: true }); return { lean: async () => job }; },
      async updateOne(filter, update) { assert.equal(filter.userId, job.userId); assert.equal(filter._id, job._id); assert.equal(filter.status, 'HR_Found'); assert.deepEqual(filter.emailRecipient, { $in: ['', null] }); changed = update.$set; return { matchedCount: 1 }; }
    }, lookup: async (input, userId) => { assert.equal(input, job); assert.equal(userId, job.userId); return { state, recipients: [], reason: 'No address found' }; } });
    await handler({ user: { id: job.userId }, body: { jobId: job.id, hrLinkedInUrl: job.hrLinkedIn } }, { json(value) { response = value; } });
    assert.equal(changed.isDeleted, true);
    assert.equal(changed['hrEmailLookup.state'], state);
    assert.equal(response.excluded, true);
  }
});

test('successful batch discovery saves addresses and never hides a recruiter for sending limits', async () => {
  const job = { _id: crypto.randomUUID(), userId: crypto.randomUUID(), status: 'HR_Found', hrLinkedIn: `https://www.linkedin.com/in/${crypto.randomUUID()}` };
  const email = `hr@${crypto.randomUUID()}.invalid`;
  let changes, response;
  const handler = createRecruiterLookup({ Model: {
    find() { return { lean: async () => [job] }; },
    async updateOne(filter, update) { assert.equal(filter.userId, job.userId); changes = update.$set; return { matchedCount: 1 }; }
  }, lookup: async () => ({ state: 'complete', email, recipients: [{ email, deliverabilityScore: 65 }], reason: 'Found address' }) });
  await handler({ user: { id: job.userId }, body: { hrLinkedInUrl: job.hrLinkedIn + '/?trk=search' } }, { json(value) { response = value; } });
  assert.equal(changes.emailRecipient, email);
  assert.equal(changes.isDeleted, undefined);
  assert.equal(response.excluded, false);
});

test('a missing or contacted job is rejected before lookup and concurrent changes prevent exclusion', async () => {
  let calls = 0;
  for (const job of [null, { status: 'Sent', hrLinkedIn: 'https://www.linkedin.com/in/sample' }]) {
    const handler = createRecruiterLookup({ Model: { findOne: () => ({ lean: async () => job }) }, lookup: async () => { calls++; } });
    let status;
    await handler({ user: { id: crypto.randomUUID() }, body: { jobId: crypto.randomUUID(), hrLinkedInUrl: 'https://www.linkedin.com/in/sample' } }, { status(value) { status = value; return this; }, json() {} });
    assert.equal(status, job ? 409 : 404);
  }
  assert.equal(calls, 0);
  const job = { _id: crypto.randomUUID(), status: 'HR_Found', hrLinkedIn: 'https://www.linkedin.com/in/sample' };
  const handler = createRecruiterLookup({ Model: { find: () => ({ lean: async () => [job] }), updateOne: async () => ({ matchedCount: 0 }) }, lookup: async () => ({ state: 'not_found', recipients: [] }) });
  let response;
  await handler({ user: { id: crypto.randomUUID() }, body: { hrLinkedInUrl: job.hrLinkedIn } }, { json(value) { response = value; } });
  assert.equal(response.excluded, false);
});
