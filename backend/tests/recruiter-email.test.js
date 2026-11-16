const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const mongoose = require('mongoose');
const { createRecruiterEmailFinder, extractEmails, nameMatchesEmail, publicationMatches } = require('../utils/recruiterEmailFinder');
function fixture(extra = {}) {
  const domain = `${crypto.randomUUID()}.invalid`;
  const userId = new mongoose.Types.ObjectId();
  const verified = [];
  const job = { company: 'Example Employer', hrName: 'Alex Sample', hrLinkedIn: `https://www.linkedin.com/in/${crypto.randomUUID()}`, jd: '' };
  const finder = createRecruiterEmailFinder({ employer: async () => ({ diagnostics: [] }), resolve: async () => domain, rules: async () => [], pages: async () => [], search: async () => [], hunter: async () => null, history: async () => [], verify: async email => { verified.push(email); return { isValid: true, status: 'deliverable', deliverabilityScore: 65, reason: 'MX active; mailbox unconfirmed' }; }, ...extra });
  return { domain, userId, job, finder, verified };
}
test('email extraction supports long suffixes and obfuscation without accepting unrelated domains', () => {
  assert.deepEqual(extractEmails('alex [at] employer [dot] technology; other@unrelated.invalid', 'employer.technology'), ['alex@employer.technology']);
  assert.equal(nameMatchesEmail('Alex Sample', 'other.person@employer.invalid'), false);
  assert.equal(nameMatchesEmail('Alex Sample', 'a.sample@employer.invalid'), true);
  assert.equal(publicationMatches('Alex Sample', 'a.sample@employer.invalid', 'Contact a.sample@employer.invalid'), false);
  assert.equal(publicationMatches('Alex Sample', 'a.sample@employer.invalid', 'Alex Sample: a.sample@employer.invalid'), true);
});
test('published recruiter addresses win over guesses and retain source evidence', async () => {
  const f = fixture();
  const finder = createRecruiterEmailFinder({ resolve: async () => f.domain, rules: async () => [], pages: async () => [{ url: `https://${f.domain}/team`, text: `Alex Sample: alex.sample@${f.domain}` }], search: async () => [], hunter: async () => null, history: async () => [], verify: async () => ({ isValid: true, status: 'deliverable', deliverabilityScore: 90, reason: 'SMTP mailbox confirmed' }) });
  const result = await finder(f.job, f.userId);
  assert.equal(result.email, `alex.sample@${f.domain}`); assert.equal(result.evidence.inferred, false); assert.equal(result.evidence.mailboxConfirmed, true); assert.equal(result.evidence.method, 'published-employer-page');
  assert.equal(result.recipients.length, 6); // One personal contact plus the existing five department inboxes.
});
test('pattern-only addresses remain explicitly inferred and unconfirmed', async () => {
  const f = fixture(); const result = await f.finder(f.job, f.userId);
  assert.equal(result.evidence.inferred, true); assert.equal(result.evidence.mailboxConfirmed, false); assert.equal(result.evidence.personMatched, false);
  assert.equal(result.evidence.score, 65); assert.ok(result.reason.includes('Inferred'));
});
test('domain blocklists stop lookup before public-source or verification requests', async () => {
  const f = fixture(); let requests = 0;
  const finder = createRecruiterEmailFinder({ resolve: async () => f.domain, rules: async () => [{ type: 'domain', value: f.domain, reason: 'Excluded employer' }], pages: async () => { requests++; return []; }, verify: async () => { requests++; } });
  const result = await finder(f.job, f.userId);
  assert.equal(result.state, 'blocked'); assert.equal(requests, 0);
});
test('wrong-person and cross-company addresses are not accepted as named recruiter contacts', async () => {
  const f = fixture();
  const finder = createRecruiterEmailFinder({ resolve: async () => f.domain, rules: async () => [], pages: async () => [{ url: `https://${f.domain}/team`, text: `other.person@${f.domain} alex.sample@unrelated.invalid` }], search: async () => [], hunter: async () => null, history: async () => [], verify: async email => { assert.ok(!email.startsWith('other.person@')); assert.ok(email.endsWith(`@${f.domain}`)); return { isValid: false, deliverabilityScore: 0, status: 'undeliverable' }; } });
  const result = await finder(f.job, f.userId); assert.equal(result.email, ''); assert.equal(result.state, 'not_found');
});
test('unknown employers hold email lookup rather than substituting a fabricated company', async () => {
  const f = fixture(); const result = await f.finder({ ...f.job, company: 'Unknown employer' }, f.userId);
  assert.equal(result.state, 'needs_employer'); assert.equal(f.verified.length, 0);
});
