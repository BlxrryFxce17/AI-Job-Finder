const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const axios = require('axios');
const { ApifyClient } = require('apify-client');
const { google } = require('googleapis');
const Job = require('../models/Job');
const User = require('../models/User');
const requireAuth = require('../middleware/requireAuth');
const { scrapeJobsFree, findHROnLinkedIn, discoverHRProfiles, isInvalidCompany } = require('../utils/scraper');
const { discoverEmailForJob, sendEmailViaAPI, resolveCompanyDomain } = require('../utils/email');
const { callAIWithRetry } = require('../utils/ai');
const { learnFromBounce } = require('../utils/learningEngine');
const Profile = require('../models/Profile');
const { generateTailoredResumePDF } = require('../utils/pdfGenerator');
const { isSeniorRole, isJuniorRole, detectExperienceLevel, shouldExcludeSenior } = require('../utils/jobFilter');

// Clean up any historical misparsed HR leads and auto-heal genuine company emails
async function sanitizeExistingHRLeads(userId) {
  try {
    const hrJobs = await Job.find({ userId, status: 'HR_Found' });
    for (const job of hrJobs) {
      let changed = false;

      // Fix invalid company names (e.g. titles or experience strings misclassified as companies)
      if (isInvalidCompany(job.company)) {
        job.company = 'Direct Recruiter / Agency';
        changed = true;
      }

      // Clean up role display (strip redundant query wrappers like "(junior software developer)")
      if (job.role && /\s*\([a-z\s-]+\)$/i.test(job.role)) {
        job.role = job.role.replace(/\s*\([a-z\s-]+\)$/i, '').trim();
        changed = true;
      }

      // Clear fake emails generated for invalid/fabricated domains
      if (job.emailRecipient) {
        const em = job.emailRecipient.toLowerCase();
        if (
          em.includes('@sourcingstrategist.') ||
          em.includes('@technicalrecruiter.') ||
          em.includes('@juniordeveloper.') ||
          em.includes('@softwaredeveloper.') ||
          em.includes('@talentacquisition.') ||
          em.includes('@directrecruiteragency.') ||
          em.includes('@directrecruiter.') ||
          em.includes('@recruiteragency.') ||
          job.company === 'Direct Recruiter / Agency'
        ) {
          job.emailRecipient = '';
          job.deliverabilityStatus = 'undeliverable';
          job.deliverabilityScore = 0;
          job.deliverabilityReason = 'Fabricated or synthetic agency domain removed';
          changed = true;
        }
      }

      // Auto-heal: If an HR lead has a genuine corporate employer but no email, discover their deliverable email
      if (!job.emailRecipient && job.company && job.company !== 'Direct Recruiter / Agency' && !isInvalidCompany(job.company)) {
        try {
          const domain = await resolveCompanyDomain(job.company, job.applyLink);
          if (domain && domain !== 'unknown.com') {
            const emailRes = await discoverEmailForJob(
              job.company,
              domain,
              job.jd || '',
              [],
              callAIWithRetry,
              job.hrName,
              job.hrLinkedIn
            );
            if (emailRes && emailRes.email && (emailRes.deliverabilityScore >= 70 || emailRes.verification?.canAutoSend)) {
              job.emailRecipient = emailRes.email;
              job.deliverabilityScore = emailRes.deliverabilityScore || 85;
              job.deliverabilityStatus = emailRes.deliverabilityStatus || 'deliverable';
              job.deliverabilityReason = emailRes.deliverabilityReason || 'Verified corporate email';
              changed = true;
              console.log(`[Auto-Heal HR] Discovered email for ${job.hrName} at ${job.company}: ${emailRes.email}`);
            }
          }
        } catch (healErr) { }
      }

      if (changed) {
        await job.save();
      }
    }
  } catch (err) {
    console.error('Error sanitizing HR leads:', err);
  }
}

router.get('/', requireAuth, async (req, res) => {
  try {
    // Ultra-fast query using lean() to bypass document overhead, filtering out soft-deleted jobs
    const jobs = await Job.find({ userId: req.user.id, isDeleted: { $ne: true } })
      .sort({ sentAt: -1, publishedAt: -1, createdAt: -1, updatedAt: -1 })
      .lean();
    const normalized = jobs.map(j => ({
      ...j,
      id: j.id || (j._id ? j._id.toString() : '')
    }));
    res.json(normalized);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch jobs' });
  }
});

router.post('/sanitize-leads', requireAuth, async (req, res) => {
  try {
    // Background task for cleaning/healing leads on demand without blocking GET /
    sanitizeExistingHRLeads(req.user.id).catch(() => { });
    res.json({ success: true, message: 'Lead sanitization running in background.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to start sanitization' });
  }
});

router.post('/', requireAuth, async (req, res) => {
  try {
    const job = new Job({ ...req.body, id: Date.now().toString(), userId: req.user.id });
    await job.save();
    res.json(job);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create job' });
  }
});

router.put('/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { status, emailRecipient, emailDraft, tracked } = req.body;

  try {
    const isObjectId = mongoose.Types.ObjectId.isValid(id);
    const filter = {
      userId: req.user.id,
      $or: [
        { id: String(id) },
        ...(isObjectId ? [{ _id: id }] : [])
      ]
    };
    const job = await Job.findOne(filter);
    if (!job) return res.status(404).json({ error: 'Job not found' });

    if (status) {
      if (status === 'Sent' && job.status !== 'Sent') {
        job.sentAt = new Date();
      }
      job.status = status;
    }
    if (emailRecipient !== undefined) job.emailRecipient = emailRecipient;
    if (emailDraft !== undefined) job.emailDraft = emailDraft;
    if (tracked !== undefined) job.tracked = tracked;
    if (req.body.role !== undefined) job.role = req.body.role;
    if (req.body.company !== undefined) job.company = req.body.company;
    if (req.body.jd !== undefined) job.jd = req.body.jd;
    if (req.body.applyLink !== undefined) job.applyLink = req.body.applyLink;
    if (req.body.location !== undefined) job.location = req.body.location;
    if (req.body.salary !== undefined) job.salary = req.body.salary;
    if (req.body.experienceLevel !== undefined) job.experienceLevel = req.body.experienceLevel;

    // Deliverability metadata updates
    if (req.body.deliverabilityScore !== undefined) job.deliverabilityScore = req.body.deliverabilityScore;
    if (req.body.deliverabilityStatus !== undefined) job.deliverabilityStatus = req.body.deliverabilityStatus;
    if (req.body.deliverabilityReason !== undefined) job.deliverabilityReason = req.body.deliverabilityReason;

    await job.save();
    res.json(job);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update job' });
  }
});

router.delete('/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  try {
    const isObjectId = mongoose.Types.ObjectId.isValid(id);
    const numId = Number(id);
    const isNum = !isNaN(numId) && String(id).trim() !== '';
    const filter = {
      userId: req.user.id,
      $or: [
        { id: String(id) },
        ...(isNum ? [{ id: numId }] : []),
        ...(isObjectId ? [{ _id: id }] : [])
      ]
    };
    const result = await Job.updateMany(
      filter,
      { $set: { isDeleted: true, deletedAt: new Date() } }
    );
    res.json({ success: true, deletedCount: result.modifiedCount });
  } catch (err) {
    console.error('Error in DELETE /api/jobs/:id:', err);
    res.status(500).json({ error: 'Failed to delete job' });
  }
});

const handleBulkDeleteJobs = async (req, res) => {
  try {
    const rawIds = req.body.jobIds || req.body.ids || [];
    if (!Array.isArray(rawIds) || rawIds.length === 0) {
      return res.status(400).json({ error: 'No job IDs provided' });
    }

    const stringIds = rawIds.map(String);
    const numberIds = rawIds.map(id => Number(id)).filter(n => !isNaN(n));
    const validObjectIds = rawIds.filter(id => mongoose.Types.ObjectId.isValid(id));

    const orConditions = [
      { id: { $in: stringIds } }
    ];
    if (numberIds.length > 0) {
      orConditions.push({ id: { $in: numberIds } });
    }
    if (validObjectIds.length > 0) {
      orConditions.push({ _id: { $in: validObjectIds } });
    }

    const filter = {
      userId: req.user.id,
      $or: orConditions
    };

    const result = await Job.updateMany(
      filter,
      { $set: { isDeleted: true, deletedAt: new Date() } }
    );
    res.json({ success: true, deletedCount: result.modifiedCount });
  } catch (err) {
    console.error('Error in bulk-delete:', err);
    res.status(500).json({ error: 'Failed to delete jobs' });
  }
};

router.post('/bulk-delete', requireAuth, handleBulkDeleteJobs);
router.delete('/bulk-delete', requireAuth, handleBulkDeleteJobs);

router.post('/fetch-jobs', requireAuth, async (req, res) => {
  let queries = req.body.queries || [];
  const useApify = req.body.useApify || false;
  const targetExperience = req.body.experience || ''; // 'Junior', 'Mid', 'Senior', or 'All'
  
  // Normalize locations: support array of locations or single location
  let rawLocations = req.body.locations;
  if (!rawLocations && req.body.location) {
    rawLocations = Array.isArray(req.body.location) ? req.body.location : [req.body.location];
  }
  if (!Array.isArray(rawLocations) || rawLocations.length === 0) {
    rawLocations = ['All India'];
  }
  const targetLocations = rawLocations.map(l => (l || '').trim()).filter(Boolean);

  if (!Array.isArray(queries) || queries.length === 0) {
    queries = [req.body.query || 'software developer'];
  }

  // Check if current search or user profile targets junior positions
  const userProfile = await Profile.findOne({ userId: req.user.id });
  const userLevel = userProfile?.experienceLevel || '';
  const isJuniorSearch = targetExperience === 'Junior' || queries.some(q => shouldExcludeSenior(q, userLevel)) || shouldExcludeSenior('', userLevel);

  // Only search what's in the searchbox, exactly as entered by the user
  const searchQueries = queries.map(q => (q || '').trim()).filter(Boolean);

  let totalAdded = 0;

  if (process.env.ADZUNA_APP_ID && process.env.ADZUNA_APP_KEY) {
    try {
      for (const what of searchQueries) {
        for (const loc of targetLocations) {
          let country = 'in';
          let whereParam = '';
          let isRemoteLocation = false;
          const lowerLoc = loc.toLowerCase();

          if (lowerLoc === 'remote' || lowerLoc === 'work from home' || lowerLoc === 'wfh') {
            isRemoteLocation = true;
          } else if (lowerLoc === 'us' || lowerLoc === 'usa' || lowerLoc === 'united states') {
            country = 'us';
          } else if (lowerLoc === 'uk' || lowerLoc === 'united kingdom' || lowerLoc === 'great britain') {
            country = 'gb';
          } else if (lowerLoc === 'canada') {
            country = 'ca';
          } else if (lowerLoc === 'australia') {
            country = 'au';
          } else if (lowerLoc && lowerLoc !== 'all' && lowerLoc !== 'all india' && lowerLoc !== 'india') {
            whereParam = `&where=${encodeURIComponent(loc)}`;
          }

          const searchQuery = isRemoteLocation ? `${what} remote` : what;
          // Determine how many pages to fetch based on query & location count
          const maxPages = (searchQueries.length * targetLocations.length > 4) ? 1 : 2;

          for (let page = 1; page <= maxPages; page++) {
            const url = `https://api.adzuna.com/v1/api/jobs/${country}/search/${page}?app_id=${process.env.ADZUNA_APP_KEY}&what=${encodeURIComponent(searchQuery)}${whereParam}&results_per_page=20&max_days_old=30&sort_by=date`.replace('app_key=undefined', `app_key=${process.env.ADZUNA_APP_KEY}`);
            const fullUrl = `https://api.adzuna.com/v1/api/jobs/${country}/search/${page}?app_id=${process.env.ADZUNA_APP_ID}&app_key=${process.env.ADZUNA_APP_KEY}&what=${encodeURIComponent(searchQuery)}${whereParam}&results_per_page=20&max_days_old=30&sort_by=date`;

            const response = await axios.get(fullUrl);
            const apiJobs = response.data.results || [];
            if (apiJobs.length === 0) break; // No more results on subsequent pages

            for (const job of apiJobs) {
              const company = job.company?.display_name || 'Unknown';
              const role = job.title || 'Unknown Role';
              const jd = job.description || 'No description available';

              const detectedLevel = detectExperienceLevel(role, jd);

              // Experience Filtering:
              if (targetExperience && targetExperience !== 'All') {
                if (targetExperience === 'Junior' && isSeniorRole(role, jd)) {
                  continue;
                }
                if (targetExperience === 'Senior' && isJuniorRole(role, jd)) {
                  continue;
                }
                if (targetExperience === 'Mid' && (isSeniorRole(role, jd) || isJuniorRole(role, jd))) {
                  continue;
                }
              } else if (isJuniorSearch && isSeniorRole(role, jd)) {
                continue;
              }

              let salary = '';
              if (job.salary_min || job.salary_max) {
                if (job.salary_min && job.salary_max && job.salary_min !== job.salary_max) {
                  salary = `₹${Math.round(job.salary_min).toLocaleString('en-IN')} - ₹${Math.round(job.salary_max).toLocaleString('en-IN')}`;
                } else if (job.salary_min) {
                  salary = `₹${Math.round(job.salary_min).toLocaleString('en-IN')}+`;
                } else if (job.salary_max) {
                  salary = `Up to ₹${Math.round(job.salary_max).toLocaleString('en-IN')}`;
                }
              }

              const escapedCompany = (company || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
              const escapedRole = (role || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
              const exists = await Job.findOne({
                userId: req.user.id,
                $or: [
                  { company: new RegExp(`^${escapedCompany}$`, 'i'), role: new RegExp(`^${escapedRole}$`, 'i') },
                  ...(job.redirect_url ? [{ applyLink: job.redirect_url }] : []),
                  ...(job.id ? [{ id: String(job.id) }] : [])
                ]
              });
              if (!exists) {
                const rawPubDate = job.created ? new Date(job.created) : new Date();
                // Prevent future dates caused by UTC to IST time offsets
                const safePublishedAt = (rawPubDate && !isNaN(rawPubDate.getTime()) && rawPubDate.getTime() <= Date.now()) ? rawPubDate : new Date();

                const newJob = new Job({
                  userId: req.user.id,
                  id: job.id || Date.now().toString() + Math.random(),
                  company: company,
                  role: role,
                  jd: jd,
                  status: 'Found',
                  publishedAt: safePublishedAt,
                  applyLink: job.redirect_url || '',
                  location: job.location?.display_name || (loc !== 'All India' ? loc : 'India'),
                  source: 'Adzuna',
                  experienceLevel: detectedLevel,
                  salary: salary
                });
                await newJob.save();
                totalAdded++;
              }
            }
          }
        }
      }
    } catch (err) {
      console.error(`Error fetching Adzuna jobs:`, err.message);
    }
  }

  if (process.env.APIFY_API_TOKEN && useApify) {
    try {
      const client = new ApifyClient({ token: process.env.APIFY_API_TOKEN });
      const apifyLocation = targetLocations.some(l => ['all', 'all india'].includes(l.toLowerCase()))
        ? "India"
        : targetLocations.join(', ');
      const run = await client.actor("openclawai/job-board-scraper").call({
        searchTerms: searchQueries,
        location: apifyLocation,
        maxResults: 20,
        sites: ["linkedin", "naukri", "indeed", "glassdoor", "cutshort", "instahyre"]
      });
      const { items } = await client.dataset(run.defaultDatasetId).listItems();

      for (const job of items) {
        const company = job.companyName || job.company || 'Unknown Apify Company';
        const role = job.title || job.positionName || job.role || 'Unknown Apify Role';
        const jd = job.description || job.jobDescription || 'No description available';
        const link = job.job_url_direct || job.job_url || job.url || job.applyLink || job.jobUrl || '';
        const loc = job.location || 'India';
        const detectedLevel = detectExperienceLevel(role, jd);

        // Experience Filtering:
        // Filter out jobs that do not match the selected experience option
        if (targetExperience && targetExperience !== 'All') {
          if (targetExperience === 'Junior' && isSeniorRole(role, jd)) {
            console.log(`[Apify Filter] Dropping senior role "${role}" for Junior search`);
            continue;
          }
          if (targetExperience === 'Senior' && isJuniorRole(role, jd)) {
            console.log(`[Apify Filter] Dropping junior role "${role}" for Senior search`);
            continue;
          }
          if (targetExperience === 'Mid' && (isSeniorRole(role, jd) || isJuniorRole(role, jd))) {
            console.log(`[Apify Filter] Dropping non-mid role "${role}" for Mid search`);
            continue;
          }
        } else if (isJuniorSearch && isSeniorRole(role, jd)) {
          console.log(`[Apify Filter] Filtered out senior role "${role}" for junior search`);
          continue;
        }

        let jobSource = 'Other';
        const rawSite = job.site || '';
        if (rawSite === 'linkedin' || link.includes('linkedin.com')) jobSource = 'LinkedIn';
        else if (rawSite === 'indeed' || link.includes('indeed.com')) jobSource = 'Indeed';

        const escapedApifyCompany = (company || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const escapedApifyRole = (role || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const exists = await Job.findOne({
          userId: req.user.id,
          $or: [
            { company: new RegExp(`^${escapedApifyCompany}$`, 'i'), role: new RegExp(`^${escapedRole}$`, 'i') },
            ...(link ? [{ applyLink: link }] : [])
          ]
        });
        if (!exists) {
          const newJob = new Job({
            userId: req.user.id,
            id: job.id || Date.now().toString() + Math.random(),
            company: company,
            role: role,
            jd: jd,
            status: 'Found',
            publishedAt: new Date(),
            applyLink: link,
            location: loc,
            source: jobSource,
            experienceLevel: detectedLevel,
            salary: apifySalary ? String(apifySalary).trim() : ''
          });
          await newJob.save();
          totalAdded++;
        }
      }
    } catch (err) {
      console.error(`Error fetching Apify jobs:`, err.message);
    }
  }

  const expLabel = targetExperience && targetExperience !== 'All' ? `${targetExperience} ` : '';
  const nonAllLocs = targetLocations.filter(l => !['all', 'all india'].includes(l.toLowerCase()));
  const locLabel = nonAllLocs.length > 0 ? ` in ${nonAllLocs.join(', ')}` : '';
  res.json({ message: `Fetched and added ${totalAdded} new ${expLabel}jobs${locLabel}.` });
});

const bounceScanCooldowns = new Map(); // userId -> lastScanTimestamp

router.get('/check-bounces', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user || !user.googleRefreshToken) {
      return res.json({ newBounces: 0 });
    }

    // Cooldown check: Only hit Gmail API at most once every 2 minutes per user to prevent quota exhaustion
    const lastScan = bounceScanCooldowns.get(req.user.id) || 0;
    if (Date.now() - lastScan < 120000) {
      return res.json({ newBounces: 0, cached: true });
    }
    bounceScanCooldowns.set(req.user.id, Date.now());

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );
    oauth2Client.setCredentials({ refresh_token: user.googleRefreshToken });
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    // Search only unread or recent bounce notifications (max 10) to stay well within quota limits
    const searchRes = await gmail.users.messages.list({
      userId: 'me',
      q: 'from:(mailer-daemon OR postmaster) is:unread newer_than:7d',
      maxResults: 10
    });

    const messages = searchRes.data.messages || [];
    let newBouncesCount = 0;
    const userEmail = (user.email || '').toLowerCase().trim();

    for (const msg of messages) {
      try {
        const msgRes = await gmail.users.messages.get({
          userId: 'me',
          id: msg.id,
          format: 'full',
        });

        const headers = msgRes.data.payload?.headers || [];
        let failedRecipient = null;

        const xFailed = headers.find(h => h.name.toLowerCase() === 'x-failed-recipients');
        if (xFailed && xFailed.value) {
          failedRecipient = xFailed.value;
        }

        if (!failedRecipient) {
          const snippet = msgRes.data.snippet || '';

          let bodyText = '';
          const { payload } = msgRes.data;
          if (payload?.body?.data) {
            bodyText = Buffer.from(payload.body.data, 'base64').toString('utf8');
          } else if (payload?.parts) {
            for (const part of payload.parts) {
              if (part?.body?.data) {
                bodyText += Buffer.from(part.body.data, 'base64').toString('utf8') + ' ';
              }
            }
          }

          const combinedText = snippet + ' ' + bodyText;

          const match1 = combinedText.match(/(?:wasn't delivered to|was not delivered to|delivery to\s*:?|recipient\s*:?)\s*<*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})>*/i);
          const match2 = combinedText.match(/Delivery to the following recipient failed permanently:\s*<*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})>*/i);
          const match3 = combinedText.match(/(?:Address not found.*?to\s+)<*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})>*/i);

          if (match1) failedRecipient = match1[1];
          else if (match2) failedRecipient = match2[1];
          else if (match3) failedRecipient = match3[1];
          else {
            const allEmails = combinedText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
            for (const candidate of allEmails) {
              const lower = candidate.toLowerCase().trim();
              if (lower !== userEmail && !lower.includes('googlemail.com') && !lower.includes('google.com') && !lower.includes('mailer-daemon') && !lower.includes('postmaster')) {
                failedRecipient = candidate;
                break;
              }
            }
          }
        }

        if (failedRecipient) {
          failedRecipient = failedRecipient.trim().toLowerCase();

          const bouncedJobs = await Job.find({
            userId: user._id,
            emailRecipient: new RegExp(`^${failedRecipient}$`, 'i'),
            status: { $ne: 'Bounced' }
          });

          for (const job of bouncedJobs) {
            if (!job.failedEmails.includes(failedRecipient)) {
              job.failedEmails.push(failedRecipient);
            }
            job.status = 'Bounced';
            await job.save();
            await learnFromBounce(job.company, failedRecipient);
            newBouncesCount++;
            console.log(`[Bounce Scanner] Marked application for ${job.company} (${failedRecipient}) as Bounced.`);
          }
        }

        // Mark processed bounce email as read in Gmail so it isn't polled again
        await gmail.users.messages.modify({
          userId: 'me',
          id: msg.id,
          requestBody: { removeLabelIds: ['UNREAD'] }
        }).catch(() => { });

      } catch (innerErr) {
        if ((innerErr.message || '').includes('Quota exceeded')) {
          console.warn('[Bounce Scanner] Gmail API quota limit reached. Pausing bounce checks.');
          break;
        }
      }
    }

    res.json({ newBounces: newBouncesCount });
  } catch (err) {
    if ((err.message || '').includes('Quota exceeded')) {
      return res.json({ newBounces: 0, quotaCooldown: true });
    }
    console.error('[Bounce Scanner Error]:', err.message);
    res.status(500).json({ error: 'Failed to check bounces' });
  }
});

router.post('/scrape-hr', requireAuth, async (req, res) => {
  const query = (req.body.query || 'software engineer').trim();
  const rawLoc = req.body.locations || req.body.location || 'India';
  const location = (Array.isArray(rawLoc) ? rawLoc.join(', ') : String(rawLoc)).trim();
  const targetExperience = req.body.experience || '';

  try {
    // 1. Get existing HR LinkedIn URLs and names to prevent duplicates
    const existingHrJobs = await Job.find(
      { userId: req.user.id, status: 'HR_Found' },
      { hrLinkedIn: 1, hrName: 1, company: 1 }
    );
    const existingUrls = existingHrJobs.map(j => j.hrLinkedIn).filter(Boolean);
    const existingNames = new Set(existingHrJobs.map(j => (j.hrName || '').toLowerCase().trim()));

    console.log(`[Scrape-HR] Discovering real HR leads for query: "${query}", location: "${location}"...`);

    // 2. Discover real HR recruiters directly on LinkedIn
    let hrProfiles = await discoverHRProfiles(query, location, existingUrls);

    // 3. If query could be a company name (e.g. "Google", "Amazon", "TCS", "Infosys") or fewer leads found:
    if (hrProfiles.length < 5) {
      try {
        const companyHr = await findHROnLinkedIn(query, location);
        if (companyHr && companyHr.name && !existingNames.has(companyHr.name.toLowerCase().trim())) {
          hrProfiles.unshift({
            name: companyHr.name,
            role: 'Talent Acquisition / HR Recruiter',
            company: query,
            link: companyHr.linkedinUrl,
            snippet: companyHr.snippet || `HR & Hiring for ${query}`,
            location: location
          });
        }
      } catch (compErr) {
        console.error('[Scrape-HR] Company fallback HR error:', compErr.message);
      }
    }

    const results = [];

    // 4. Save discovered HR leads and attempt fast email discovery in parallel
    for (const hr of hrProfiles) {
      if (results.length >= 10) break; // Deliver up to 10 quality leads per discovery run

      const lowerName = (hr.name || '').toLowerCase().trim();
      if (!lowerName || existingNames.has(lowerName)) continue;
      existingNames.add(lowerName);

      let discoveredEmail = '';
      let deliverabilityScore = 0;
      let deliverabilityStatus = 'unverified';
      let deliverabilityReason = '';

      const isGenuineCompany = hr.company && !isInvalidCompany(hr.company) && hr.company !== 'Direct Recruiter / Agency';
      if (isGenuineCompany) {
        try {
          const domain = await resolveCompanyDomain(hr.company, hr.link);
          if (domain && domain !== 'unknown.com') {
            const emailPromise = discoverEmailForJob(
              hr.company,
              domain,
              hr.snippet || '',
              [],
              callAIWithRetry,
              hr.name,
              hr.link
            );
            const timeoutPromise = new Promise(resolve => setTimeout(() => resolve({ email: null }), 6000));
            const emailRes = await Promise.race([emailPromise, timeoutPromise]);
            if (emailRes && emailRes.email && (emailRes.deliverabilityScore >= 70 || emailRes.verification?.canAutoSend)) {
              discoveredEmail = emailRes.email;
              deliverabilityScore = emailRes.deliverabilityScore || 85;
              deliverabilityStatus = emailRes.deliverabilityStatus || 'deliverable';
              deliverabilityReason = emailRes.deliverabilityReason || 'Verified corporate email';
            }
          }
        } catch (emailErr) {
          console.log('[Scrape-HR] Email discovery skipped for HR:', emailErr.message);
        }
      }

      const newJob = new Job({
        userId: req.user.id,
        id: Date.now().toString() + Math.random().toString().substring(2, 6),
        company: isGenuineCompany ? hr.company : 'Direct Recruiter / Agency',
        role: hr.role || 'Technical Recruiter',
        jd: hr.snippet || `Talent Acquisition & Hiring for ${query}${isGenuineCompany ? ' at ' + hr.company : ''}`,
        status: 'HR_Found',
        applyLink: hr.link || '',
        location: hr.location || location,
        source: 'LinkedIn',
        experienceLevel: targetExperience || 'Mid',
        emailRecipient: discoveredEmail,
        deliverabilityScore: deliverabilityScore || (discoveredEmail ? 80 : 0),
        deliverabilityStatus: deliverabilityStatus || (discoveredEmail ? 'deliverable' : 'unverified'),
        deliverabilityReason: deliverabilityReason || '',
        hrName: hr.name,
        hrLinkedIn: hr.link || '',
        publishedAt: new Date()
      });

      await newJob.save();
      results.push(newJob);
    }

    console.log(`[Scrape-HR] Successfully discovered ${results.length} new HR leads!`);
    res.json({ success: true, count: results.length, jobs: results });
  } catch (err) {
    console.error('[Scrape-HR] Error:', err);
    res.status(500).json({ error: 'Failed to discover HRs' });
  }
});

// Purge all Senior / Lead jobs for current user
router.post('/purge-senior', requireAuth, async (req, res) => {
  try {
    const jobs = await Job.find({ userId: req.user.id, isDeleted: { $ne: true } });
    const seniorIds = [];
    for (const job of jobs) {
      if (job.experienceLevel === 'Senior' || isSeniorRole(job.role, job.jd)) {
        seniorIds.push(job._id);
      }
    }
    if (seniorIds.length === 0) {
      return res.json({ success: true, deletedCount: 0, message: 'No senior roles found.' });
    }
    const result = await Job.updateMany(
      { _id: { $in: seniorIds }, userId: req.user.id },
      { $set: { isDeleted: true, deletedAt: new Date() } }
    );
    res.json({ success: true, deletedCount: result.modifiedCount, message: `Successfully removed ${result.modifiedCount} senior roles.` });
  } catch (err) {
    console.error('Error in purge-senior:', err);
    res.status(500).json({ error: 'Failed to purge senior jobs' });
  }
});

module.exports = router;

