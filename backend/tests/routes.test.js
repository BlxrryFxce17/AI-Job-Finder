const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex');
const User = require('../models/User');
const Profile = require('../models/Profile');
const Job = require('../models/Job');
const Blocklist = require('../models/Blocklist');
const { trackingLink, resumeLink } = require('../utils/signedLinks');

function invoke(router, url, { method = 'GET', body = {}, owner, query = {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = { method, url, body, query, headers: owner ? { authorization: `Bearer ${jwt.sign({ id: String(owner) }, process.env.JWT_SECRET)}` } : {} };
    const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, set() { return this; }, setHeader() {}, json(data) { resolve({ status: this.statusCode, data }); }, send(data) { resolve({ status: this.statusCode, data }); }, redirect(url) { resolve({ status: 302, url }); } };
    router.handle(req, res, error => reject(error || new Error('Unhandled route')));
  });
}
test('signed tracking binds the tenant and ignores injected redirect destinations', async () => {
  const owner = new mongoose.Types.ObjectId();
  const jobId = crypto.randomUUID();
  let update;
  Job.updateOne = async (filter, mutation) => { update = { filter, mutation }; };
  const router = require('../routes/trackingRoutes');
  const link = new URL(trackingLink('https://app.invalid', owner, jobId, 'https://portfolio.invalid'));
  const response = await invoke(router, link.pathname.replace('/api', ''), { query: { token: link.searchParams.get('token'), url: 'https://attacker.invalid' } });
  assert.equal(response.url, 'https://portfolio.invalid');
  assert.equal(update.filter.userId, String(owner));
  assert.deepEqual(update.filter.status.$in, ['Sent', 'Opened']);
  update = null;
  const bad = await invoke(router, `/track-click/${jobId}`, { query: { token: 'invalid' } });
  assert.equal(bad.status, 400); assert.equal(update, null);
});
test('resume downloads reject userId-only access and query only the signed owner', async () => {
  const owner = new mongoose.Types.ObjectId();
  const other = new mongoose.Types.ObjectId();
  let requestedOwner;
  Profile.findOne = async filter => { requestedOwner = filter.userId; return { resumePdf: Buffer.from('test PDF'), resumeFilename: 'resume.pdf' }; };
  const router = require('../routes/profileRoutes');
  const denied = await invoke(router, '/resume-pdf', { query: { userId: String(owner) } });
  assert.equal(denied.status, 401); assert.equal(requestedOwner, undefined);
  const link = new URL(resumeLink('https://app.invalid', owner));
  const allowed = await invoke(router, '/resume-pdf', { query: { token: link.searchParams.get('token'), userId: String(other) } });
  assert.equal(allowed.status, 200); assert.equal(requestedOwner, String(owner));
});
test('manual follow-ups recover original headers, reject another tenant, and stop after replies or bounces', async () => {
  const owner = new mongoose.Types.ObjectId();
  const other = new mongoose.Types.ObjectId();
  const job = { _id: new mongoose.Types.ObjectId(), id: crypto.randomUUID(), userId: owner, status: 'Sent', company: 'Employer', role: 'Engineer', emailSubject: 'Original application subject', emailRecipient: `careers@${crypto.randomUUID()}.invalid`, followUps: [{ day: 3, draft: 'Hi Employer Team,\n\nIs there an update on this role?', sent: false }], async save() {} };
  User.findOne = filter => ({ select: async () => ({ _id: filter._id }) });
  User.findById = async id => ({ _id: id, email: `candidate@${crypto.randomUUID()}.invalid`, googleRefreshToken: crypto.randomUUID() });
  Profile.findOne = async filter => { assert.equal(filter.userId, String(owner)); return { userId: owner, name: 'Candidate', portfolio: 'https://portfolio.invalid' }; };
  Job.findOne = async filter => String(filter.userId) === String(owner) ? job : null;
  const email = require('../utils/email');
  let replied = false; let recover = true; let sends = 0; let envelope;
  const root = `<${crypto.randomUUID()}@mail.invalid>`;
  const thread = crypto.randomUUID();
  email.checkGmailForReply = async () => replied;
  email.findThreadForRecipient = async () => recover ? { threadId: thread, rfcMessageId: root, subject: job.emailSubject } : null;
  email.sendEmailViaAPI = async (user, mail) => { sends++; envelope = mail; };
  const router = require('../routes/followupRoutes');
  const send = (user = owner) => invoke(router, '/send-followup', { method: 'POST', owner: user, body: { jobId: job.id, day: 3 } });
  assert.equal((await send(other)).status, 404);
  recover = false; assert.equal((await send()).status, 409); assert.equal(sends, 0);
  recover = true; assert.equal((await send()).status, 200);
  assert.equal(envelope.threadId, thread); assert.equal(envelope.inReplyTo, root); assert.equal(envelope.references, root); assert.equal(envelope.subject, `Re: ${job.emailSubject}`);
  job.followUps[0].sent = false; replied = true;
  assert.equal((await send()).status, 409); assert.equal(job.status, 'Replied');
  job.status = 'Bounced'; replied = false;
  assert.equal((await send()).status, 409); assert.equal(sends, 1);
});
test('email and domain blocklists apply only to their owner', async () => {
  const owner = new mongoose.Types.ObjectId(); const other = new mongoose.Types.ObjectId();
  const address = `careers@${crypto.randomUUID()}.invalid`;
  const rules = [{ userId: owner, type: 'domain', value: address.split('@')[1] }];
  Blocklist.findOne = async filter => rules.find(rule => String(rule.userId) === String(filter.userId) && filter.$or.some(condition => condition.type === rule.type && condition.value === rule.value));
  const { enforceBlocklist } = require('../utils/blocklistGuard');
  await assert.rejects(enforceBlocklist(owner, address), /blocklist/);
  await enforceBlocklist(other, address);
  rules[0].type = 'email'; rules[0].value = address;
  await assert.rejects(enforceBlocklist(owner, address.toUpperCase()), /blocklist/);
});
