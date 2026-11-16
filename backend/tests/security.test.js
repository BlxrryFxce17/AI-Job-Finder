const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex');
const jwt = require('jsonwebtoken');
const { sendEmailViaAPI } = require('../utils/email');
const mongoose = require('mongoose');
let router;
before(() => {
  require('../models/User').findOne = filter => ({ select: async () => ({ _id: filter._id }) });
  router = require('../routes/extensionRoutes');
});
function request(path, method = 'GET', headers = {}) {
  return new Promise((resolve, reject) => {
    const req = { url: path, method, headers, body: {} };
    const res = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(body) { resolve({ status: this.statusCode, json: async () => body }); }
    };
    router.handle(req, res, error => reject(error || new Error('Route not handled')));
  });
}
test('extension endpoints reject unauthenticated requests before accessing data or sending', async () => {
  for (const [method, path] of [['GET', '/profile'], ['GET', '/ai-config'], ['POST', '/send-outreach-email'], ['POST', '/generate-answer'], ['POST', '/draft-email'], ['POST', '/generate-cover-letter']]) {
    const response = await request(path, method);
    assert.equal(response.status, 401, path);
  }
});
test('authenticated config exposes capabilities without credentials', async () => {
  const token = jwt.sign({ id: new mongoose.Types.ObjectId().toString() }, process.env.JWT_SECRET);
  const response = await request('/ai-config', 'GET', { authorization: `Bearer ${token}` });
  assert.equal(response.status, 200);
  const config = await response.json();
  assert.equal('groqKey' in config, false);
  assert.equal('geminiKey' in config, false);
  assert.equal(typeof config.groqConfigured, 'boolean');
});
test('dispatch rejects missing owners, multiple recipients, BCC and orphan replies before network calls', async () => {
  const user = { _id: new mongoose.Types.ObjectId() };
  const domain = `${crypto.randomUUID()}.invalid`;
  const to = `careers@${domain}`;
  await assert.rejects(sendEmailViaAPI(null, { to }), /authenticated sender/);
  await assert.rejects(sendEmailViaAPI(user, { to: `${to},hr@${domain}` }), /one recipient/);
  await assert.rejects(sendEmailViaAPI(user, { to, bcc: to }), /one recipient/);
  await assert.rejects(sendEmailViaAPI(user, { to, subject: 'Re: Application', text: 'Following up' }), /original thread/);
});
