const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const mongoose = require('mongoose');
const { parseRecruiter, buildQueries } = require('../utils/recruiterDiscovery');
const { resolveRecruiterEmployer } = require('../utils/recruiterEmployer');
const { createRecruiterEmailFinder } = require('../utils/recruiterEmailFinder');
const profile = () => `https://www.linkedin.com/in/${crypto.randomUUID()}`;
test('labelled LinkedIn experience and company fields supply employer evidence', () => {
  for (const snippet of ['Experience: Example Group · Education: College · Location: India', 'Current company: Example Group | Location: Pune']) {
    const found = parseRecruiter({ title: 'Alex Sample - Technical Recruiter | LinkedIn', snippet, link: profile() });
    assert.equal(found.company, 'Example Group'); assert.ok(found.employerEvidence);
  }
  const past = parseRecruiter({ title: 'Alex Sample - Technical Recruiter | LinkedIn', snippet: 'Previous Experience: Example Group · Education: College', link: profile() });
  assert.equal(past.company, '');
  assert.ok(buildQueries({ mode: 'role', query: 'software engineer', locations: ['All India'] })[0].includes('"India"'));
});
test('employer resolution uses stored evidence before spending search requests', async () => {
  const job = { hrName: 'Alex Sample', role: 'Technical Recruiter', hrLinkedIn: profile(), hrEvidence: { snippet: 'Experience: Example Group · Location: India' } };
  const result = await resolveRecruiterEmployer(job, new mongoose.Types.ObjectId(), { http: { post: async () => { throw new Error('Must not search'); } }, record: () => {} });
  assert.equal(result.company, 'Example Group');
});
test('follow-up employer search requires the exact profile URL and matching name', async () => {
  const link = profile(); let calls = 0;
  const job = { hrName: 'Alex Sample', role: 'Technical Recruiter', hrLinkedIn: link, company: 'Unknown employer' };
  const result = await resolveRecruiterEmployer(job, new mongoose.Types.ObjectId(), { keys: { TAVILY_API_KEY: 'test-only' }, record: () => {}, http: { post: async () => {
    calls++; return { data: { results: [
      { title: 'Alex Sample - Recruiter at Wrong Employer', url: profile(), content: 'Recruiter' },
      { title: 'Different Person - Recruiter at Wrong Employer', url: link, content: 'Recruiter' },
      { title: 'Alex Sample - Recruiter | LinkedIn', url: link, content: 'Experience: Correct Employer · Education: College' }
    ] } };
  } } });
  assert.equal(calls, 1); assert.equal(result.company, 'Correct Employer'); assert.equal(result.sourceUrl, link);
});
test('unknown-employer email lookup resolves the company and then verifies addresses', async () => {
  const domain = `${crypto.randomUUID()}.invalid`;
  const finder = createRecruiterEmailFinder({ employer: async () => ({ company: 'Resolved Employer', snippet: 'Technical recruiter at Resolved Employer', employerEvidence: 'Experience: Resolved Employer' }), resolve: async company => { assert.equal(company, 'Resolved Employer'); return domain; }, rules: async () => [], history: async () => [], pages: async () => [], search: async () => [], hunter: async () => null, verify: async () => ({ isValid: true, status: 'deliverable', deliverabilityScore: 65, reason: 'Active MX, mailbox unconfirmed' }) });
  const result = await finder({ company: 'Unknown employer', hrName: 'Alex Sample', hrLinkedIn: profile() }, new mongoose.Types.ObjectId());
  assert.equal(result.state, 'complete'); assert.equal(result.resolvedEmployer.company, 'Resolved Employer'); assert.ok(result.email.endsWith(`@${domain}`));
});
test('unresolved employer and provider limits are visible without fabricating an email', async () => {
  const finder = createRecruiterEmailFinder({ employer: async () => ({ diagnostics: ['Search quota reached'] }), resolve: async () => { throw new Error('Must not guess a domain'); } });
  const result = await finder({ company: 'Unknown employer', hrName: 'Alex Sample', hrLinkedIn: profile() }, new mongoose.Types.ObjectId());
  assert.equal(result.state, 'needs_employer'); assert.deepEqual(result.recipients, []); assert.ok(result.diagnostics.includes('Search quota reached'));
});
test('inline company corrections are tenant scoped, validate MX and queue a fresh lookup', async () => {
  const userId = new mongoose.Types.ObjectId().toString();
  const id = new mongoose.Types.ObjectId();
  const job = { _id: id, status: 'HR_Found', hrLinkedIn: profile() };
  let changed, saved, queued;
  const handler = require('../routes/hrRoutes').createEmployerHandler({ Model: { async findOne(filter) { assert.equal(filter.userId, userId); return job; }, async updateOne(filter, update) { assert.equal(filter.userId, userId); assert.equal(filter.status, 'HR_Found'); changed = update.$set; return { matchedCount: 1 }; } }, Domains: { async findOneAndUpdate(filter, update) { assert.equal(filter.userId, userId); saved = update.$set; } }, checkMx: async () => ({ valid: true }), queue: user => { queued = user; } });
  const result = await new Promise(resolve => handler({ user: { id: userId }, body: { jobId: String(id), company: 'Confirmed Employer', domain: 'employer.invalid' } }, { status() { return this; }, json: resolve }));
  assert.equal(result.success, true); assert.equal(changed.company, 'Confirmed Employer'); assert.equal(changed.hrEmailLookup.state, 'queued'); assert.equal(saved.domain, 'employer.invalid'); assert.equal(queued, userId);
});
