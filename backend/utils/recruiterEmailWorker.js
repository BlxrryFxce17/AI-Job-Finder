const crypto = require('node:crypto');
const Job = require('../models/Job');
const User = require('../models/User');
const context = require('./requestContext');
const { shouldExclude } = require('./recruiterExclusions');
const findEmail = require('./recruiterEmailFinder').createRecruiterEmailFinder();
function createWorker({ Model = Job, lookup = findEmail, active = async userId => User.exists({ _id: userId, deleting: { $ne: true } }) } = {}) {
  return async function processOne(userId) {
    if (!userId || !await active(userId)) return false;
    const lease = crypto.randomUUID();
    const job = await Model.findOneAndUpdate({ userId, isDeleted: { $ne: true }, status: 'HR_Found', $or: [{ 'hrEmailLookup.state': 'queued' }, { 'hrEmailLookup.state': 'running', 'hrEmailLookup.leaseUntil': { $lt: new Date() } }, { 'hrEmailLookup.state': 'failed', 'hrEmailLookup.attempts': { $lt: 3 }, 'hrEmailLookup.retryAt': { $lte: new Date() } }] }, { $set: { 'hrEmailLookup.state': 'running', 'hrEmailLookup.lease': lease, 'hrEmailLookup.leaseUntil': new Date(Date.now() + 15 * 60_000), 'hrEmailLookup.error': '' }, $inc: { 'hrEmailLookup.attempts': 1 } }, { returnDocument: 'after', sort: { createdAt: 1 } });
    if (!job) return false;
    const filter = { _id: job._id, userId, company: job.company, hrName: job.hrName, isDeleted: { $ne: true }, status: 'HR_Found', 'hrEmailLookup.lease': lease };
    try {
      const result = await context.run({ userId: String(userId) }, () => lookup(job, userId));
      const changes = { 'hrEmailLookup.state': result.state, 'hrEmailLookup.error': result.reason, 'hrEmailLookup.checkedAt': new Date(), 'hrEmailLookup.diagnostics': result.diagnostics || [], deliverabilityReason: result.reason };
      if (result.resolvedEmployer?.company) Object.assign(changes, { company: result.resolvedEmployer.company, 'hrEvidence.currentEmployer': result.resolvedEmployer.company, 'hrEvidence.employerEvidence': result.resolvedEmployer.employerEvidence, 'hrEvidence.sourceTitle': result.resolvedEmployer.sourceTitle, 'hrEvidence.source': result.resolvedEmployer.source, 'hrEvidence.snippet': result.resolvedEmployer.snippet, jd: result.resolvedEmployer.snippet || job.jd, 'hrEvidence.sourceUrl': result.resolvedEmployer.sourceUrl, 'hrEvidence.observedAt': new Date() });
      if (result.recipients?.length) Object.assign(changes, { emailRecipient: result.email, allRecipients: result.recipients, deliverabilityScore: result.evidence?.score || result.recipients[0].deliverabilityScore, deliverabilityStatus: 'deliverable', hrEmailEvidence: result.evidence });
      if (!result.recipients?.length && shouldExclude({ status: job.status, hrLinkedIn: job.hrLinkedIn, emailRecipient: job.emailRecipient, hrEmailLookup: { state: result.state, attempts: job.hrEmailLookup?.attempts } })) changes.isDeleted = true;
      if (changes.isDeleted) filter.emailRecipient = { $in: ['', null] };
      await Model.updateOne(filter, { $set: changes, $unset: { 'hrEmailLookup.lease': 1, 'hrEmailLookup.leaseUntil': 1 } });
    } catch (err) {
      const changes = { 'hrEmailLookup.state': 'failed', 'hrEmailLookup.error': 'Email lookup failed. Check provider availability and retry.', 'hrEmailLookup.retryAt': new Date(Date.now() + 15 * 60_000) };
      if (shouldExclude({ status: job.status, hrLinkedIn: job.hrLinkedIn, emailRecipient: job.emailRecipient, hrEmailLookup: { state: 'failed', attempts: job.hrEmailLookup?.attempts } })) changes.isDeleted = true;
      if (changes.isDeleted) filter.emailRecipient = { $in: ['', null] };
      await Model.updateOne(filter, { $set: changes, $unset: { 'hrEmailLookup.lease': 1, 'hrEmailLookup.leaseUntil': 1 } });
    }
    return true;
  };
}
const processOne = createWorker();
const waiting = new Set();
let running = 0;
function kick(userId) {
  if (!userId) return;
  waiting.add(String(userId));
  pump();
}
function pump() {
  while (running < 2 && waiting.size) {
    const userId = waiting.values().next().value;
    waiting.delete(userId); running++;
    processOne(userId).then(worked => { if (worked) waiting.add(userId); }).catch(err => console.warn('[HR email worker]', err.message)).finally(() => { running--; pump(); });
  }
}
module.exports = { createWorker, kick };
