const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const mongoose = require('mongoose');
const { unresolvedPlaceholders } = require('../utils/draftPlaceholders');
const { validateEnvelope } = require('../utils/dispatchService');
const { buildPlainTextSignature, isDomainLexicallyMatchingCompany } = require('../utils/email');

test('real signature and project links pass validation without confusing LinkedIn with Link', () => {
  const user = { _id: new mongoose.Types.ObjectId() };
  const signature = buildPlainTextSignature({ name: 'Candidate', linkedin: 'https://linkedin.com/in/candidate', github: 'https://github.com/candidate', portfolio: 'https://portfolio.invalid' });
  const text = `Hi Team,\n\nSee my [Email Automation](https://github.com/candidate/project) project.\n\n${signature}`;
  assert.deepEqual(unresolvedPlaceholders(text), []);
  assert.doesNotThrow(() => validateEnvelope(user, { to: `careers@${crypto.randomUUID()}.invalid`, subject: 'Application', text }));
});
test('real missing fields still fail and the error identifies them', () => {
  for (const placeholder of ['[Your Name]', '[Phone]', '[Link]', '[Insert Experience]', '[Company Name]', '[Email Address]']) assert.deepEqual(unresolvedPlaceholders(placeholder), [placeholder]);
  const mail = { to: `careers@${crypto.randomUUID()}.invalid`, subject: 'Application', text: 'Please contact me at [Email Address].' };
  assert.throws(() => validateEnvelope({ _id: new mongoose.Types.ObjectId() }, mail), /\[Email Address\]/);
  assert.deepEqual(unresolvedPlaceholders('[Your Name](https://portfolio.invalid)'), ['[Your Name]']);
  assert.deepEqual(unresolvedPlaceholders('[Email](https://portfolio.invalid/contact)'), []);
});
test('employer domain matching rejects unrelated name prefixes while retaining corporate suffixes', () => {
  assert.equal(isDomainLexicallyMatchingCompany('Renew', 'renewedvision.com'), false);
  assert.equal(isDomainLexicallyMatchingCompany('Envision Energy', 'envision-group.com'), true);
  assert.equal(isDomainLexicallyMatchingCompany('Ovitech Solutions', 'ovitechsolution.com'), true);
  assert.equal(isDomainLexicallyMatchingCompany('Enqos Software Technologies', 'enqos.com'), true);
  assert.equal(isDomainLexicallyMatchingCompany('Employer', 'unrelatedemployernews.com'), false);
  assert.equal(isDomainLexicallyMatchingCompany('Giant Eagle GCC', 'gianteagle.com'), true);
});

test('outreach accepts both identifiers and excludes archived custom-ID duplicates from lookup', async () => {
  process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex');
  const owner = new mongoose.Types.ObjectId();
  const id = crypto.randomUUID();
  const mongoId = new mongoose.Types.ObjectId();
  const job = { _id: mongoId, id, company: 'Envision Energy', role: 'Engineer', allRecipients: [], async save() {} };
  const profile = { userId: owner, name: crypto.randomUUID(), portfolio: 'https://portfolio.invalid' };
  const User = require('../models/User');
  const Job = require('../models/Job');
  let rules = [];
  require('../models/Blocklist').find = filter => { assert.equal(filter.userId, String(owner)); return { lean: async () => rules }; };
  User.findOne = filter => ({ select: async () => ({ _id: filter._id }) });
  User.findById = async () => ({ _id: owner, email: `sender@${crypto.randomUUID()}.invalid` });
  require('../models/Profile').findOne = () => ({ select: async () => profile });
  Job.findOne = async filter => {
    assert.equal(filter.userId, String(owner));
    assert.deepEqual(filter.isDeleted, { $ne: true });
    assert.ok(filter.$or.some(part => part.id === id || part._id === String(mongoId)));
    return job;
  };
  let submissions = 0;
  const email = require('../utils/email');
  email.sendEmailViaAPI = async (user, mail) => { if (mail.to.startsWith('reject-')) throw new Error('Verification failed'); submissions++; return { messageId: crypto.randomUUID(), threadId: crypto.randomUUID(), rfcMessageId: `<${crypto.randomUUID()}@mail.invalid>` }; };
  const router = require('../routes/emailRoutes');
  for (const jobId of [id, String(mongoId)]) {
    const result = await new Promise((resolve, reject) => {
      const req = { url: '/send-email', method: 'POST', headers: { authorization: `Bearer ${require('jsonwebtoken').sign({ id: String(owner) }, process.env.JWT_SECRET)}` }, body: { jobId, to: 'careers@envision-group.com', body: 'Hi Team,\n\nI am interested in the role.' } };
      const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(data) { resolve({ status: this.statusCode, data }); } };
      router.handle(req, res, error => reject(error || new Error('Unhandled route')));
    });
    assert.equal(result.status, 200); assert.equal(result.data.success, true);
  }
  assert.equal(submissions, 2); // Transport is mocked; no email or provider call occurs.
  const suffix = crypto.randomUUID();
  const blocked = `blocked-${suffix}@envision-group.com`;
  rules = [{ type: 'email', value: blocked, source: 'manual', reason: 'User excluded' }];
  const recipients = [`first-${suffix}@envision-group.com`, blocked, `reject-${suffix}@envision-group.com`, `second-${suffix}@envision-group.com`];
  const partial = await new Promise((resolve, reject) => {
    const req = { url: '/send-email', method: 'POST', headers: { authorization: `Bearer ${require('jsonwebtoken').sign({ id: String(owner) }, process.env.JWT_SECRET)}` }, body: { jobId: String(mongoId), recipients, body: 'Hi Team, I am interested in this role.' } };
    const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(data) { resolve({ status: this.statusCode, data }); } };
    router.handle(req, res, error => reject(error || new Error('Unhandled route')));
  });
  assert.equal(partial.status, 200); assert.equal(partial.data.partial, true);
  assert.equal(partial.data.sentCount, 2); assert.equal(partial.data.blockedCount, 1); assert.equal(partial.data.failedCount, 1);
  assert.ok(job.recipientResults.some(r => r.email === recipients[3] && r.status === 'sent'));

});
