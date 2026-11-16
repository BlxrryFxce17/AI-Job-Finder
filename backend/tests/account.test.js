const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex');
const User = require('../models/User');
const Job = require('../models/Job');
const Profile = require('../models/Profile');
const Blocklist = require('../models/Blocklist');
const Dispatch = require('../models/Dispatch');
const DailyUsage = require('../models/DailyUsage');
const ApiUsage = require('../models/ApiUsage');
const CompanyDomain = require('../models/CompanyDomain');
const router = require('../routes/controlRoutes');
const owner = new mongoose.Types.ObjectId();
let deleting = false;
User.findOne = filter => ({ select: async () => ({ _id: filter._id, deleting }) });
function invoke(path, method = 'GET', body = {}, query = {}) {
  return new Promise((resolve, reject) => {
    const req = { url: path, originalUrl: `/api/controls${path}`, method, body, query, headers: { authorization: `Bearer ${jwt.sign({ id: String(owner) }, process.env.JWT_SECRET)}` } };
    const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, set() { return this; }, type() { return this; }, send(data) { resolve({ status: this.statusCode, data }); }, json(data) { resolve({ status: this.statusCode, data }); } };
    router.handle(req, res, err => reject(err || new Error('Unhandled request')));
  });
}
test('invalid limits and follow-up schedules are rejected before storage', async () => {
  assert.equal((await invoke('/settings', 'PUT', { dailyEmailLimit: -1 })).status, 400);
  assert.equal((await invoke('/settings', 'PUT', { followUpDays: [0, 100] })).status, 400);
  assert.equal((await invoke('/settings', 'PUT', { timezone: 'invalid-zone' })).status, 400);
  assert.deepEqual(router.validateControls({ followUpDays: [6, 3, 3] }).followUpDays, [3, 6]);
});
test('CSV export scopes the owner and escapes spreadsheet formulas and quotes', async () => {
  Job.find = filter => { assert.equal(filter.userId, String(owner)); return { lean: async () => [{ id: crypto.randomUUID(), company: '=FORMULA()', role: 'Role "with quotes"' }] }; };
  const result = await invoke('/export', 'GET', {}, { format: 'csv' });
  assert.equal(result.status, 200);
  assert.ok(result.data.includes("\"'=FORMULA()\""));
  assert.ok(result.data.includes('Role ""with quotes""'));
});
test('account deletion is explicit, pauses before deleting, and can finish after an in-flight send', async () => {
  const calls = [];
  let inFlight = true;
  User.updateOne = async (filter, update) => { calls.push('pause'); assert.equal(filter._id, String(owner)); assert.equal(update.$set['controls.paused'], true); deleting = true; };
  Dispatch.exists = async filter => { assert.equal(filter.userId, String(owner)); return inFlight; };
  for (const Model of [Job, Profile, Blocklist, ApiUsage, DailyUsage, Dispatch, CompanyDomain]) Model.deleteMany = async filter => { assert.equal(filter.userId, String(owner)); calls.push('delete'); };
  User.deleteOne = async filter => { assert.equal(filter._id, String(owner)); calls.push('delete account'); };
  assert.equal((await invoke('/account', 'DELETE')).status, 400); assert.deepEqual(calls, []);
  assert.equal((await invoke('/account', 'DELETE', { confirmation: 'DELETE MY ACCOUNT' })).status, 409);
  assert.deepEqual(calls, ['pause']);
  inFlight = false;
  assert.equal((await invoke('/account', 'DELETE', { confirmation: 'DELETE MY ACCOUNT' })).status, 200);
  assert.equal(calls.at(-1), 'delete account');
  assert.equal(calls.filter(c => c === 'delete').length, 7);
});
