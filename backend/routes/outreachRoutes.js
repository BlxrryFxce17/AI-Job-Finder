const express = require('express');
const router = express.Router();
const requireAuth = require('../middleware/requireAuth');
const Job = require('../models/Job');
const Profile = require('../models/Profile');
const Blocklist = require('../models/Blocklist');
const CompanyDomain = require('../models/CompanyDomain');
const { jobFilter } = require('../utils/jobIdentity');
const { partitionRecipients } = require('../utils/recipientBatch');
const { scoreJob } = require('../utils/jobRelevance');
const { companyKey, savedDomain } = require('../utils/companyDomains');
router.use(requireAuth);
router.post('/prepare', async (req, res) => {
  const job = await Job.findOne({ ...jobFilter(req.user.id, req.body.jobId), isDeleted: { $ne: true } }).lean();
  if (!job) return res.status(404).json({ error: 'Application not found' });
  const [profile, rules] = await Promise.all([Profile.findOne({ userId: req.user.id }).select('-resumePdf').lean(), Blocklist.find({ userId: req.user.id }).lean()]);
  const relevance = scoreJob(job, profile || {});
  if (req.body.recipients !== undefined && !Array.isArray(req.body.recipients)) return res.status(400).json({ error: 'Recipients must be a list' });
  const recipients = req.body.recipients || (job.allRecipients?.length ? job.allRecipients : job.emailRecipient ? [{ email: job.emailRecipient }] : []);
  const result = partitionRecipients(recipients, rules);
  if (job.company && !['company', 'unknown company', 'unknown', 'the team', 'the engineering team', 'direct recruiter / agency'].includes(job.company.trim().toLowerCase())) {
    const { isDomainLexicallyMatchingCompany } = require('../utils/email');
    const saved = result.allowed.some(r => !isDomainLexicallyMatchingCompany(job.company, r.email.split('@')[1])) ? await savedDomain(job.company, req.user.id) : null;
    const mismatched = result.allowed.filter(r => !isDomainLexicallyMatchingCompany(job.company, r.email.split('@')[1]) && !(saved && (r.email.split('@')[1] === saved.domain || r.email.split('@')[1]?.endsWith('.' + saved.domain))));
    for (const rec of mismatched) result.blocked.push({ email: rec.email, status: 'blocked', source: 'employer-match', reason: `Email domain does not match ${job.company}. Save a corrected company domain or rediscover its contact.` });
    result.allowed = result.allowed.filter(r => !mismatched.includes(r));
  }
  // Recipient statuses are durable across retries. Never queue a sent or uncertain address again.
  const previous = job.recipientResults || [];
  const completed = result.allowed.filter(r => previous.some(p => p.email === r.email && ['sent', 'unknown'].includes(p.status)));
  result.allowed = result.allowed.filter(r => !completed.includes(r));
  res.json({ ...result, completed, relevance, emailLookupState: job.hrEmailLookup?.state });
});
router.get('/domains', async (req, res) => {
  res.json({ domains: await CompanyDomain.find({ userId: req.user.id }).sort({ updatedAt: -1 }).lean() });
});
router.put('/domains', async (req, res) => {
  const { company, domain, aliases = [] } = req.body;
  if (typeof company !== 'string' || !companyKey(company) || company.length > 200 || typeof domain !== 'string' || !Array.isArray(aliases) || aliases.length > 10 || aliases.some(a => typeof a !== 'string' || a.length > 200)) return res.status(400).json({ error: 'Provide a company, its official email domain, and up to ten aliases' });
  let cleanDomain;
  try { cleanDomain = new URL(domain.includes('://') ? domain : `https://${domain}`).hostname.replace(/^www\./, '').toLowerCase(); } catch { return res.status(400).json({ error: 'Invalid domain' }); }
  const { isJobBoardOrAtsDomain } = require('../utils/email');
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(cleanDomain) || isJobBoardOrAtsDomain(cleanDomain, company)) return res.status(400).json({ error: 'Use the employer email domain, not a job board or applicant-tracking domain' });
  const mx = await require('../utils/verifier').checkMxRecords(cleanDomain);
  if (!mx.valid) return res.status(400).json({ error: mx.reason || 'This domain has no active mail servers' });
  const item = await CompanyDomain.findOneAndUpdate({ userId: req.user.id, companyKey: companyKey(company) }, { $set: { company: company.trim(), domain: cleanDomain, aliases: [...new Set(aliases.map(companyKey).filter(Boolean))], source: 'user', evidenceUrl: `https://${cleanDomain}` } }, { upsert: true, returnDocument: 'after', runValidators: true });
  res.json({ item });
});
router.delete('/domains/:id', async (req, res) => {
  await CompanyDomain.deleteOne({ _id: req.params.id, userId: req.user.id });
  res.json({ success: true });
});
module.exports = router;
