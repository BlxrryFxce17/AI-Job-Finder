const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const mongoose = require('mongoose');
process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex');
const { sign, verify, resumeLink, trackingLink } = require('../utils/signedLinks');
const { inQuietHours, localDay, defaults } = require('../utils/safetyControls');
const { jobFilter } = require('../utils/jobIdentity');
const { factualOutreach } = require('../utils/candidateFacts');
test('download and tracking tokens bind owner, purpose, destination, and expiry', () => {
  const owner = new mongoose.Types.ObjectId().toString();
  const jobId = crypto.randomUUID();
  const url = new URL(resumeLink('https://app.invalid', owner));
  assert.equal(verify(url.searchParams.get('token'), 'resume').userId, owner);
  assert.throws(() => verify(url.searchParams.get('token'), 'open'), /Invalid link/);
  const expired = sign('resume', { userId: owner }, -1);
  assert.throws(() => verify(expired, 'resume'), /expired/);
  assert.throws(() => verify(url.searchParams.get('token') + 'x', 'resume'));
  const click = new URL(trackingLink('https://app.invalid', owner, jobId, 'https://portfolio.invalid/project'));
  assert.equal(verify(click.searchParams.get('token'), 'click').url, 'https://portfolio.invalid/project');
  assert.equal(verify(click.searchParams.get('token'), 'click').jobId, jobId);
});
test('quiet hours work across midnight and daily buckets use the configured timezone', () => {
  const controls = { ...defaults, timezone: 'Asia/Kolkata', quietStart: '22:00', quietEnd: '07:00' };
  assert.equal(inQuietHours(controls, new Date('2026-01-01T18:00:00Z')), true);
  assert.equal(inQuietHours(controls, new Date('2026-01-01T03:00:00Z')), false);
  assert.equal(localDay('Asia/Kolkata', new Date('2026-01-01T20:00:00Z')), '2026-01-02');
  assert.equal(localDay('UTC', new Date('2026-01-01T20:00:00Z')), '2026-01-01');
});
test('job lookups preserve tenant scope and support UUIDs and Mongo IDs', () => {
  const userId = new mongoose.Types.ObjectId();
  const uuid = crypto.randomUUID();
  assert.deepEqual(jobFilter(userId, uuid), { userId, $or: [{ id: uuid }] });
  const objectId = new mongoose.Types.ObjectId().toString();
  assert.equal(jobFilter(userId, objectId).$or[1]._id, objectId);
  assert.throws(() => jobFilter(userId, { $ne: null }));
});
test('factual fallback does not invent skills, projects, availability, or accomplishments', () => {
  const empty = factualOutreach({}, 'Employer', 'Engineer');
  assert.doesNotMatch(empty, /TypeScript|React|built|immediate|deployed|attached/i);
  const skill = crypto.randomUUID();
  const text = factualOutreach({ skills: [skill], achievements: ['Documented achievement'] }, 'Employer', 'Engineer');
  assert.ok(text.includes(skill)); assert.ok(text.includes('Documented achievement'));
});
