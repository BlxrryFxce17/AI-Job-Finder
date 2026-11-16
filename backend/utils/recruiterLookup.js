const { canonicalProfile } = require('./recruiterDiscovery');
const { jobFilter } = require('./jobIdentity');
const { shouldExclude } = require('./recruiterExclusions');

// Batch outreach must persist discovery outcomes just like the background worker.
function createRecruiterLookup({ Model = require('../models/Job'), lookup = require('./recruiterEmailFinder').createRecruiterEmailFinder() } = {}) {
  return async (req, res) => {
    const userId = req.user.id;
    const key = canonicalProfile(req.body.hrLinkedInUrl);
    let job;
    if (req.body.jobId) {
      job = await Model.findOne({ ...jobFilter(userId, req.body.jobId), isDeleted: { $ne: true } }).lean();
      if (!job || canonicalProfile(job.hrLinkedIn) !== key) return res.status(404).json({ error: 'Recruiter profile not found' });
    } else {
      const jobs = await Model.find({ userId, status: 'HR_Found', isDeleted: { $ne: true }, hrLinkedIn: { $exists: true, $ne: '' } }).lean();
      job = jobs.find(item => canonicalProfile(item.hrLinkedIn) === key);
    }
    if (job && job.status !== 'HR_Found') return res.status(409).json({ error: 'Contacted recruiter history is preserved' });
    const input = job || { company: req.body.company, hrName: req.body.hrName, hrLinkedIn: req.body.hrLinkedInUrl, jd: req.body.jd || '', failedEmails: req.body.failedEmails || [] };
    const result = await lookup(input, userId);
    let excluded = false;
    if (job) {
      const changes = { 'hrEmailLookup.state': result.state, 'hrEmailLookup.error': result.reason, 'hrEmailLookup.checkedAt': new Date(), 'hrEmailLookup.diagnostics': result.diagnostics || [], deliverabilityReason: result.reason };
      if (result.resolvedEmployer?.company) Object.assign(changes, { company: result.resolvedEmployer.company, 'hrEvidence.currentEmployer': result.resolvedEmployer.company });
      if (result.recipients?.length) Object.assign(changes, { emailRecipient: result.email || result.recipients[0].email, allRecipients: result.recipients, hrEmailEvidence: result.evidence, deliverabilityScore: result.evidence?.score || result.recipients[0].deliverabilityScore || 0, deliverabilityStatus: 'deliverable' });
      else if (shouldExclude({ ...job, hrEmailLookup: { ...job.hrEmailLookup, state: result.state } })) changes.isDeleted = true;
      // Do not hide a newly edited/contacted profile or overwrite a worker that took a lease.
      const saved = await Model.updateOne({ _id: job._id, userId, status: 'HR_Found', isDeleted: { $ne: true }, company: job.company, hrName: job.hrName, emailRecipient: job.emailRecipient || { $in: ['', null] }, 'hrEmailLookup.lease': job.hrEmailLookup?.lease || { $in: ['', null] } }, { $set: changes });
      excluded = !!(changes.isDeleted && saved.matchedCount);
    }
    return res.json({ email: result.email || result.recipients?.[0]?.email || null, allRecipients: result.recipients || [], deliverabilityScore: result.evidence?.score || result.recipients?.[0]?.deliverabilityScore || 0, deliverabilityStatus: result.recipients?.length ? 'deliverable' : 'unverified', deliverabilityReason: result.reason, source: result.evidence?.method || result.state, hrName: input.hrName, hrLinkedIn: input.hrLinkedIn, hrEmailEvidence: result.evidence, diagnostics: result.diagnostics, excluded });
  };
}
module.exports = { createRecruiterLookup };
