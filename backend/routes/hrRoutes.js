const express = require('express');
const router = express.Router();
const Job = require('../models/Job');
const { searchRecruiters, canonicalProfile } = require('../utils/recruiterDiscovery');
const { savedDomain } = require('../utils/companyDomains');
const { jobFilter } = require('../utils/jobIdentity');
const requireAuth = require('../middleware/requireAuth');
const worker = require('../utils/recruiterEmailWorker');
const { shouldExclude, noEmailFilter } = require('../utils/recruiterExclusions');
router.use(requireAuth);
function createSearchHandler({ Model = Job, search = searchRecruiters, queue = worker.kick, getDomain = savedDomain } = {}) {
return async function searchHandler(req, res) {
  const mode = req.body.mode || 'role';
  const query = req.body.query;
  const locations = req.body.locations || (req.body.location ? [req.body.location] : ['India']);
  if (!['company', 'role'].includes(mode) || typeof query !== 'string' || !query.trim() || query.length > 150 || !Array.isArray(locations) || locations.length > 3 || locations.some(l => typeof l !== 'string' || l.length > 100)) return res.status(400).json({ error: 'Choose a company or role search, a query, and up to three locations' });
  const controller = new AbortController();
  res.on('close', () => { if (!res.writableEnded) controller.abort(); });
  const userId = req.user.id;
  const saved = mode === 'company' ? await getDomain(query, userId) : null;
  const options = { mode, query: query.trim(), locations, aliases: saved ? [saved.company, ...(saved.aliases || [])] : [], signal: controller.signal };
  const result = await search(options);
  if (controller.signal.aborted) return;
  // Include deleted/contacted profiles in identity matching so exclusions survive repeat searches.
  const history = await Model.find({ userId, $or: [{ hrLinkedIn: { $exists: true, $ne: '' } }, { hrProfileKey: { $exists: true } }] }).sort({ sentAt: -1, updatedAt: -1 }).lean();
  const previous = new Map();
  for (const job of history) { const key = canonicalProfile(job.hrLinkedIn || job.hrProfileKey); if (key && (!previous.has(key) || job.isDeleted || shouldExclude(job))) previous.set(key, job); }
  let created = 0, refreshed = 0, excluded = 0;
  const jobs = [];
  await Model.init();
  for (const lead of result.profiles) {
    if (controller.signal.aborted) break;
    const prior = previous.get(lead.link);
    if (prior?.isDeleted) { excluded++; continue; }
    if (prior && shouldExclude(prior)) {
      // Check current state atomically so a concurrent successful lookup/edit wins.
      await Model.updateOne({ ...noEmailFilter(userId), _id: prior._id }, { $set: { isDeleted: true } });
      excluded++; continue;
    }
    const evidence = { sourceTitle: lead.sourceTitle, score: lead.score, reasons: lead.reasons, source: lead.source, sourceUrl: lead.sourceUrl, snippet: lead.snippet, employerEvidence: lead.employerEvidence, observedAt: lead.observedAt, sourcePublishedAt: lead.publishedAt, status: 'search-evidence', currentEmployer: lead.company, mode, query: options.query, requestedLocation: locations.join(', ') };
    if (prior) {
      const changes = { hrEvidence: evidence };
      if (prior.hrEvidence?.status === 'user-confirmed-employer') Object.assign(changes.hrEvidence, { status: 'user-confirmed-employer', currentEmployer: prior.company, employerEvidence: prior.hrEvidence.employerEvidence });
      if (prior.status === 'HR_Found' && lead.company && prior.hrEvidence?.status !== 'user-confirmed-employer') {
        Object.assign(changes, { company: lead.company, role: lead.role, hrName: lead.name, location: lead.location || prior.location });
        if (prior.company !== lead.company) Object.assign(changes, { emailRecipient: '', allRecipients: [], hrEmailEvidence: {}, hrEmailLookup: { state: 'queued', attempts: 0 }, deliverabilityScore: 0, deliverabilityStatus: 'unverified' });
        if (!prior.emailRecipient && (!prior.hrEmailLookup?.state || prior.hrEmailLookup.state === 'needs_employer')) changes.hrEmailLookup = { state: 'queued', attempts: 0 };
      }
      if (prior.status === 'HR_Found' && !prior.emailRecipient && !prior.hrEmailLookup?.state) changes.hrEmailLookup = { state: 'queued', attempts: 0 };
      await Model.updateOne({ _id: prior._id, userId, isDeleted: { $ne: true } }, { $set: changes });
      jobs.push({ ...prior, ...changes }); refreshed++; continue;
    }
    try {
      const job = await Model.create({ userId, id: require('crypto').randomUUID(), hrProfileKey: lead.link, hrName: lead.name, hrLinkedIn: lead.link, company: lead.company || 'Unknown employer', role: lead.role, jd: lead.snippet, location: lead.location || 'Location not confirmed', applyLink: lead.link, status: 'HR_Found', source: `LinkedIn search (${lead.source})`, hrEvidence: evidence, hrEmailLookup: { state: 'queued', attempts: 0, error: lead.company ? '' : 'Resolving current employer before email lookup' } });
      jobs.push(job); created++;
    } catch (err) { if (err.code !== 11000) throw err; refreshed++; }
  }
  queue(userId);
  if (controller.signal.aborted) return;
  res.json({ success: true, count: created, refreshed, excluded, jobs, diagnostics: result.diagnostics, message: `${created} new, ${refreshed} existing, ${excluded} excluded profiles. ${result.message}` });
};
}
const searchHandler = createSearchHandler();
router.post('/search', searchHandler);
function createEmployerHandler({ Model = Job, Domains = require('../models/CompanyDomain'), checkMx = require('../utils/verifier').checkMxRecords, queue = worker.kick } = {}) {
  return async (req, res) => {
    const { company, domain = '' } = req.body;
    if (typeof company !== 'string' || !require('../utils/recruiterDiscovery').validEmployer(company.trim()) || typeof domain !== 'string' || domain.length > 250) return res.status(400).json({ error: 'Enter the recruiter’s actual current employer' });
    const job = await Model.findOne({ ...jobFilter(req.user.id, req.body.jobId), isDeleted: { $ne: true } });
    if (!job?.hrLinkedIn) return res.status(404).json({ error: 'Recruiter profile not found' });
    if (job.status !== 'HR_Found') return res.status(409).json({ error: 'Contacted application history is preserved' });
    let host;
    if (domain.trim()) {
      try { host = new URL(domain.includes('://') ? domain : `https://${domain}`).hostname.replace(/^www\./, '').toLowerCase(); } catch { return res.status(400).json({ error: 'Enter a valid company email domain' }); }
      if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(host) || require('../utils/email').isJobBoardOrAtsDomain(host, company)) return res.status(400).json({ error: 'Use the employer email domain, not LinkedIn or a job board' });
      const mx = await checkMx(host);
      if (!mx.valid) return res.status(400).json({ error: mx.reason || 'The domain has no active mail servers' });
      const { companyKey } = require('../utils/companyDomains');
      await Domains.findOneAndUpdate({ userId: req.user.id, companyKey: companyKey(company) }, { $set: { company: company.trim(), domain: host, source: 'user', evidenceUrl: `https://${host}` } }, { upsert: true, returnDocument: 'after' });
    }
    const result = await Model.updateOne({ _id: job._id, userId: req.user.id, status: 'HR_Found', isDeleted: { $ne: true } }, { $set: { company: company.trim(), 'hrEvidence.status': 'user-confirmed-employer', 'hrEvidence.currentEmployer': company.trim(), 'hrEvidence.employerEvidence': 'Current employer supplied by the user', hrEmailLookup: { state: 'queued', attempts: 0, error: '' }, emailRecipient: '', allRecipients: [], hrEmailEvidence: {}, deliverabilityStatus: 'unverified', deliverabilityScore: 0 } });
    if (!result.matchedCount) return res.status(409).json({ error: 'The recruiter record changed. Refresh before editing.' });
    queue(req.user.id);
    res.json({ success: true, message: 'Employer saved. Email lookup is queued.' });
  };
}
router.put('/employer', createEmployerHandler());
router.post('/email-lookup', async (req, res) => {
  const job = await Job.findOne({ ...jobFilter(req.user.id, req.body.jobId), isDeleted: { $ne: true } });
  if (!job || !job.hrLinkedIn) return res.status(404).json({ error: 'Recruiter profile not found' });
  if (job.status !== 'HR_Found') return res.status(409).json({ error: 'This recruiter has already been contacted. Contact details were preserved.' });
  if (job.hrEmailLookup?.state === 'running' && job.hrEmailLookup.leaseUntil > new Date()) return res.status(409).json({ error: 'Email lookup is already running' });
  await Job.updateOne({ _id: job._id, userId: req.user.id, isDeleted: { $ne: true } }, { $set: { 'hrEmailLookup.state': 'queued', 'hrEmailLookup.attempts': 0, 'hrEmailLookup.error': '' } });
  worker.kick(req.user.id);
  res.json({ success: true, message: 'Email lookup queued. The profile will update when it finishes.' });
});
router.searchHandler = searchHandler;
router.createSearchHandler = createSearchHandler;
router.createEmployerHandler = createEmployerHandler;
module.exports = router;
