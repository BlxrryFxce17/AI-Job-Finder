const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const mongoose = require('mongoose');
const { partitionRecipients, runRecipientBatch, blockSource } = require('../utils/recipientBatch');
const { scoreJob } = require('../utils/jobRelevance');
const { extractEmployerWebsites, isPublicIpv4, companyKey, savedDomain } = require('../utils/companyDomains');

test('recipient preparation deduplicates and preserves block source, reason, and date', () => {
  const domain = `${crypto.randomUUID()}.invalid`;
  const date = new Date();
  const result = partitionRecipients([`hr@${domain}`, `HR@${domain}`, `careers@${domain}`, `talent@${domain}`], [{ type: 'email', value: `hr@${domain}`, source: 'bounce', reason: 'Mailbox bounced', createdAt: date }]);
  assert.equal(result.allowed.length, 2); assert.equal(result.blocked.length, 1);
  assert.equal(result.blocked[0].source, 'bounce'); assert.equal(result.blocked[0].blockedAt, date);
  const allBlocked = partitionRecipients(result.allowed, [{ type: 'domain', value: domain, source: 'manual', reason: 'Excluded employer' }]);
  assert.equal(allBlocked.allowed.length, 0); assert.equal(allBlocked.blocked.length, 2);
  assert.equal(blockSource({ reason: 'Automatic: Email bounced' }), 'bounce');
  assert.equal(blockSource({ reason: 'Old imported rule' }), 'legacy');
});
test('one failure does not abort multiple-recipient sequential delivery or hide accepted messages', async () => {
  const domain = `${crypto.randomUUID()}.invalid`;
  const recipients = ['first', 'failed', 'second', 'uncertain'].map(name => ({ email: `${name}@${domain}` }));
  let active = 0; let peak = 0;
  const saved = [];
  const result = await runRecipientBatch(recipients, async rec => {
    active++; peak = Math.max(peak, active);
    await new Promise(resolve => setImmediate(resolve)); active--;
    if (rec.email.startsWith('failed@')) throw new Error('Verification failed');
    if (rec.email.startsWith('uncertain@')) throw new Error('Delivery outcome is uncertain');
    return { messageId: crypto.randomUUID() };
  }, { paceMs: 0, blocked: [{ email: `blocked@${domain}`, status: 'blocked', reason: 'Manual rule' }], onResult: async result => saved.push(result) });
  assert.equal(peak, 1); assert.equal(result.sentCount, 2); assert.equal(result.failedCount, 2); assert.equal(result.blockedCount, 1);
  assert.equal(result.partial, true); assert.equal(result.success, true); assert.equal(saved.length, 4);
});
test('a result-persistence error does not convert an accepted email into a failed send', async () => {
  const result = await runRecipientBatch([{ email: `hr@${crypto.randomUUID()}.invalid` }], async () => ({ messageId: crypto.randomUUID() }), { paceMs: 0, onResult: async () => { throw new Error('DB unavailable'); } });
  assert.equal(result.sentCount, 1); assert.equal(result.failedCount, 0); assert.equal(result.persistenceWarnings.length, 1);
});
test('job relevance is profile based, supports multiple disciplines, and leaves ambiguous roles available', () => {
  const software = { title: 'Software Developer', skills: ['React', 'Node.js'] };
  assert.equal(scoreJob({ role: 'Civil Project Engineer', jd: 'Water treatment design' }, software).excluded, true);
  const aligned = scoreJob({ role: 'Junior Software Engineer', jd: 'React and Node.js' }, software);
  assert.equal(aligned.excluded, false); assert.ok(aligned.score >= 75); assert.equal(aligned.matchedSkills.length, 2);
  assert.equal(scoreJob({ role: 'Graduate Engineer Trainee' }, software).excluded, false);
  assert.equal(scoreJob({ role: 'Mechanical Engineer' }, { ...software, excludeUnrelatedJobs: false }).excluded, false);
  assert.equal(scoreJob({ role: 'Mechanical Engineer' }, { title: 'Mechanical Engineer', skills: ['SolidWorks'] }).excluded, false);
  assert.equal(scoreJob({ role: 'Software Engineer' }, {}).excluded, false);
});
test('official employer metadata is accepted only for the named organization', () => {
  const company = crypto.randomUUID();
  const html = `<script type="application/ld+json">${JSON.stringify({ '@type': 'JobPosting', hiringOrganization: { name: company, sameAs: 'https://brand.invalid/about' } })}</script>`;
  const found = extractEmployerWebsites(html, 'https://jobs.invalid/posting', company);
  assert.equal(found[0].domain, 'brand.invalid'); assert.equal(found[0].confirmed, true);
  assert.equal(extractEmployerWebsites(html, 'https://jobs.invalid/posting', 'Other employer').length, 0);
  assert.equal(companyKey('Example Pvt Ltd'), companyKey('Example'));
});
test('job-page fetching rejects private network ranges', () => {
  for (const address of ['127.0.0.1', '10.0.0.1', '172.16.0.1', '192.168.1.1', '169.254.169.254', '100.64.1.1', '0.0.0.0', '::1']) assert.equal(isPublicIpv4(address), false, address);
  assert.equal(isPublicIpv4('8.8.8.8'), true);
});
test('saved domains and aliases are always queried inside the requesting tenant', async () => {
  const ids = [new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId()];
  const CompanyDomain = require('../models/CompanyDomain');
  CompanyDomain.findOne = filter => ({ lean: async () => {
    assert.ok(ids.some(id => String(id) === String(filter.userId)));
    assert.ok(filter.$or.some(condition => condition.aliases === companyKey('Brand Alias')));
    return { domain: `${filter.userId}.invalid` };
  } });
  const first = await savedDomain('Brand Alias', ids[0]); const second = await savedDomain('Brand Alias', ids[1]);
  assert.notEqual(first.domain, second.domain);
});

test('pre-draft preparation scopes every lookup, filters blocked and completed recipients, and reports relevance', async () => {
  process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex');
  const owner = new mongoose.Types.ObjectId();
  const jobId = crypto.randomUUID();
  const domain = `${crypto.randomUUID()}.invalid`;
  const recipients = ['blocked', 'sent', 'unknown', 'allowed'].map(local => ({ email: `${local}@${domain}` }));
  require('../models/User').findOne = filter => ({ select: async () => ({ _id: filter._id }) });
  require('../models/Job').findOne = filter => {
    assert.equal(filter.userId, String(owner)); assert.deepEqual(filter.isDeleted, { $ne: true });
    return { lean: async () => ({ id: jobId, role: 'Civil Engineer', allRecipients: recipients, recipientResults: [{ email: recipients[1].email, status: 'sent' }, { email: recipients[2].email, status: 'unknown' }] }) };
  };
  require('../models/Profile').findOne = filter => {
    assert.equal(filter.userId, String(owner));
    return { select: () => ({ lean: async () => ({ title: 'Software Developer', skills: ['React'] }) }) };
  };
  require('../models/Blocklist').find = filter => {
    assert.equal(filter.userId, String(owner));
    return { lean: async () => [{ type: 'email', value: recipients[0].email, source: 'manual', reason: 'Excluded' }] };
  };
  const router = require('../routes/outreachRoutes');
  const result = await new Promise((resolve, reject) => {
    const req = { url: '/prepare', method: 'POST', headers: { authorization: `Bearer ${require('jsonwebtoken').sign({ id: String(owner) }, process.env.JWT_SECRET)}` }, body: { jobId } };
    const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(data) { resolve({ status: this.statusCode, data }); } };
    router.handle(req, res, error => reject(error || new Error('Unhandled request')));
  });
  assert.equal(result.status, 200); assert.equal(result.data.allowed.length, 1); assert.equal(result.data.allowed[0].email, recipients[3].email);
  assert.equal(result.data.blocked.length, 1); assert.equal(result.data.completed.length, 2); assert.equal(result.data.relevance.excluded, true);
});
