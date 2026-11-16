const express = require('express');
const router = express.Router();
const crypto = require('node:crypto');
const { google } = require('googleapis');
const requireAuth = require('../middleware/requireAuth');
const User = require('../models/User');
const Profile = require('../models/Profile');
const Job = require('../models/Job');
const Dispatch = require('../models/Dispatch');
const DailyUsage = require('../models/DailyUsage');
const ApiUsage = require('../models/ApiUsage');
const Blocklist = require('../models/Blocklist');
const { controlsFor, localDay, getActiveUser } = require('../utils/safetyControls');
const { jobFilter } = require('../utils/jobIdentity');

router.use(requireAuth);
function validateControls(input) {
  const result = {};
  for (const [field, max] of [['dailyEmailLimit', 200], ['dailyAiLimit', 1000]]) {
    if (input[field] !== undefined) {
      if (!Number.isInteger(input[field]) || input[field] < 0 || input[field] > max) throw new Error(`${field} must be between 0 and ${max}`);
      result[field] = input[field];
    }
  }
  for (const field of ['paused', 'autoFollowUp']) {
    if (input[field] !== undefined) { if (typeof input[field] !== 'boolean') throw new Error(`Invalid ${field}`); result[field] = input[field]; }
  }
  for (const field of ['quietStart', 'quietEnd']) {
    if (input[field] !== undefined) { if (typeof input[field] !== 'string' || (input[field] && !/^([01]\d|2[0-3]):[0-5]\d$/.test(input[field]))) throw new Error('Invalid quiet hours'); result[field] = input[field]; }
  }
  if (input.timezone !== undefined) { if (typeof input.timezone !== 'string' || input.timezone.length > 100) throw new Error('Invalid timezone'); new Intl.DateTimeFormat('en', { timeZone: input.timezone }).format(); result.timezone = input.timezone; }
  if (input.followUpDays !== undefined) {
    if (!Array.isArray(input.followUpDays) || input.followUpDays.length > 3 || input.followUpDays.some(d => !Number.isInteger(d) || d < 1 || d > 60)) throw new Error('Choose up to three follow-up days between 1 and 60');
    result.followUpDays = [...new Set(input.followUpDays)].sort((a, b) => a - b);
  }
  return result;
}
router.get('/', async (req, res) => {
  const userId = req.user.id;
  const user = await getActiveUser(userId);
  const controls = controlsFor(user);
  const [jobs, activity, usage] = await Promise.all([
    Job.find({ userId, isDeleted: { $ne: true } }).select('id company role status sentAt followUps emailRecipient deliverabilityScore deliverabilityReason').lean(),
    Dispatch.find({ userId }).sort({ createdAt: -1 }).limit(100).lean(),
    DailyUsage.findOne({ userId, day: localDay(controls.timezone) }).lean()
  ]);
  const contacted = jobs.filter(j => j.sentAt);
  const replied = jobs.filter(j => ['Replied', 'Interview', 'Interviewing', 'Offer', 'Hired'].includes(j.status));
  const due = jobs.filter(j => ['Sent', 'Opened'].includes(j.status) && j.followUps?.some(f => !f.sent));
  res.json({ controls, usage: { email: usage?.email || 0, ai: usage?.ai || 0 }, metrics: { applications: contacted.length, replies: replied.length, interviews: jobs.filter(j => /interview/i.test(j.status)).length, followUpsDue: due.length, replyRate: contacted.length ? Math.round(replied.length * 100 / contacted.length) : 0 }, activity, due });
});
router.put('/settings', async (req, res) => {
  let changes;
  try { changes = validateControls(req.body); } catch (err) { return res.status(400).json({ error: err.message }); }
  const user = await User.findOneAndUpdate({ _id: req.user.id, deleting: { $ne: true } }, { $set: Object.fromEntries(Object.entries(changes).map(([key, value]) => [`controls.${key}`, value])) }, { new: true, runValidators: true });
  if (!user) return res.status(404).json({ error: 'Account not found' });
  res.json({ controls: controlsFor(user) });
});
router.get('/export', async (req, res) => {
  const userId = req.user.id;
  const jobs = await Job.find({ userId }).lean();
  res.set('Cache-Control', 'no-store');
  if (req.query.format === 'csv') {
    const escape = value => { let text = value == null ? '' : String(value); if (/^[\s]*[=+@-]/.test(text)) text = `'${text}`; return `"${text.replace(/"/g, '""')}"`; };
    const fields = ['id', 'company', 'role', 'status', 'emailRecipient', 'sentAt', 'deliverabilityScore', 'deliverabilityReason', 'isDeleted'];
    res.set('Content-Disposition', 'attachment; filename="applications.csv"');
    return res.type('text/csv').send('\uFEFF' + [fields.join(','), ...jobs.map(j => fields.map(f => escape(j[f])).join(','))].join('\r\n'));
  }
  const [profile, blocklist, activity, companyDomains] = await Promise.all([Profile.findOne({ userId }).select('-resumePdf -githubToken').lean(), Blocklist.find({ userId }).lean(), Dispatch.find({ userId }).lean(), require('../models/CompanyDomain').find({ userId }).lean()]);
  res.set('Content-Disposition', 'attachment; filename="my-job-data.json"');
  res.json({ exportedAt: new Date(), profile, jobs, blocklist, activity, companyDomains });
});
router.get('/duplicates', async (req, res) => {
  // Only unsent records with exactly the same application URL are suggested.
  const jobs = await Job.find({ userId: req.user.id, isDeleted: { $ne: true }, sentAt: { $exists: false }, status: { $in: ['Found', 'Drafting', 'HR_Found'] } }).sort({ createdAt: 1 }).lean();
  const groups = new Map();
  for (const job of jobs) {
    if (!job.applyLink) continue;
    let url;
    try { url = new URL(job.applyLink); } catch { continue; }
    url.hash = '';
    const key = `${url.href}|${job.company?.trim().toLowerCase()}|${job.role?.trim().toLowerCase()}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(job);
  }
  res.json({ groups: [...groups.values()].filter(g => g.length > 1) });
});
router.post('/archive-duplicates', async (req, res) => {
  const ids = req.body.ids;
  if (!Array.isArray(ids) || !ids.length || ids.length > 100 || ids.some(id => typeof id !== 'string')) return res.status(400).json({ error: 'Choose 1–100 duplicate records' });
  const batch = crypto.randomUUID();
  const result = await Job.updateMany({ userId: req.user.id, id: { $in: ids }, sentAt: { $exists: false }, status: { $in: ['Found', 'Drafting', 'HR_Found'] }, isDeleted: { $ne: true } }, { $set: { isDeleted: true, deletedAt: new Date(), archiveBatch: batch } });
  res.json({ archived: result.modifiedCount, undoToken: batch });
});
router.post('/undo-archive', async (req, res) => {
  if (typeof req.body.undoToken !== 'string' || !req.body.undoToken) return res.status(400).json({ error: 'An archive batch is required' });
  const result = await Job.updateMany({ userId: req.user.id, archiveBatch: req.body.undoToken }, { $set: { isDeleted: false }, $unset: { deletedAt: 1, archiveBatch: 1 } });
  res.json({ restored: result.modifiedCount });
});
router.put('/followup', async (req, res) => {
  const { jobId, day, draft } = req.body;
  if (!Number.isInteger(day) || typeof draft !== 'string' || !draft.trim() || draft.length > 10000) return res.status(400).json({ error: 'A day and a draft are required' });
  const result = await Job.updateOne({ ...jobFilter(req.user.id, jobId), followUps: { $elemMatch: { day, sent: false } } }, { $set: { 'followUps.$.draft': draft.trim() } });
  if (!result.matchedCount) return res.status(409).json({ error: 'This follow-up is missing or already sent' });
  res.json({ success: true });
});
router.post('/reconcile/:id', async (req, res) => {
  const record = await Dispatch.findOne({ _id: req.params.id, userId: req.user.id });
  if (!record) return res.status(404).json({ error: 'Send record not found' });
  if (!['unknown', 'submitting'].includes(record.state)) return res.json({ state: record.state });
  const user = await getActiveUser(req.user.id);
  if (!user.googleRefreshToken) return res.status(409).json({ error: 'Connect Gmail to check delivery. Do not resend until you have checked Sent mail.' });
  const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
  auth.setCredentials({ refresh_token: user.googleRefreshToken });
  const gmail = google.gmail({ version: 'v1', auth });
  const found = await gmail.users.messages.list({ userId: 'me', q: `in:sent rfc822msgid:${record.rfcMessageId.replace(/[<>]/g, '')}`, maxResults: 1 });
  const message = found.data.messages?.[0];
  if (!message) return res.json({ state: record.state, message: 'No sent message found yet. Delivery remains uncertain; automatic retry stays blocked.' });
  await Dispatch.updateOne({ _id: record._id, userId: req.user.id }, { $set: { state: 'sent', messageId: message.id, threadId: message.threadId, sentAt: new Date(), error: '' } });
  if (record.jobId && record.kind !== 'followup') {
    await Job.updateOne({ userId: req.user.id, id: record.jobId, 'recipientResults.email': record.recipient }, { $set: { 'recipientResults.$.status': 'sent', 'recipientResults.$.reason': '', 'recipientResults.$.messageId': message.id, 'recipientResults.$.threadId': message.threadId } });
    await Job.updateOne({ userId: req.user.id, id: record.jobId, 'allRecipients.email': record.recipient }, { $set: { 'allRecipients.$.status': 'sent' } });
    const current = await Job.findOne({ userId: req.user.id, id: record.jobId }).lean();
    if (current?.recipientResults?.length) {
      const sentCount = current.recipientResults.filter(r => r.status === 'sent').length;
      const blockedCount = current.recipientResults.filter(r => r.status === 'blocked').length;
      const failedCount = current.recipientResults.filter(r => ['failed', 'unknown'].includes(r.status)).length;
      const partial = sentCount > 0 && blockedCount + failedCount > 0;
      await Job.updateOne({ userId: req.user.id, _id: current._id }, { $set: { sendSummary: { sentCount, blockedCount, failedCount, partial }, pipelineStage: partial ? 'partial' : 'sent', pipelineError: partial ? current.pipelineError : '' } });
    }
  }
  res.json({ state: 'sent', message: 'Gmail confirmed this email was sent. Its recipient result has been updated.' });
});
router.delete('/account', async (req, res) => {
  if (req.body.confirmation !== 'DELETE MY ACCOUNT') return res.status(400).json({ error: 'Type DELETE MY ACCOUNT to confirm' });
  const userId = req.user.id;
  // Tombstone first so new dispatches and in-flight preparations cannot submit.
  await User.updateOne({ _id: userId }, { $set: { deleting: true, 'controls.paused': true } });
  const active = await Dispatch.exists({ userId, state: 'submitting', updatedAt: { $gt: new Date(Date.now() - 5 * 60_000) } });
  if (active) return res.status(409).json({ error: 'Sending has been stopped. An email is finishing; retry account deletion in five minutes.' });
  for (const Model of [Job, Profile, Blocklist, ApiUsage, DailyUsage, Dispatch, require('../models/CompanyDomain')]) await Model.deleteMany({ userId });
  await User.deleteOne({ _id: userId });
  res.json({ success: true });
});
router.validateControls = validateControls;
module.exports = router;
