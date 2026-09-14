const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const axios = require('axios');
const { ApifyClient } = require('apify-client');
const { google } = require('googleapis');
const Job = require('../models/Job');
const User = require('../models/User');
const requireAuth = require('../middleware/requireAuth');
const {
  scrapeJobsFree,
  findHROnLinkedIn,
  discoverHRProfiles,
  isInvalidCompany,
  normalizeCompanyKey,
  normalizeRoleKey,
  normalizeApplyUrl,
  extractLinkedInHandle,
  normalizeHrName,
  isOlderThan12Hours
} = require('../utils/scraper');
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
              job.hrLinkedIn,
              job.applyLink
            );
            if (emailRes && emailRes.email && (emailRes.deliverabilityScore >= 65 || emailRes.verification?.canAutoSend)) {
              job.emailRecipient = emailRes.email;
              job.deliverabilityScore = emailRes.deliverabilityScore || 80;
              job.deliverabilityStatus = emailRes.deliverabilityStatus || 'deliverable';
              job.deliverabilityReason = emailRes.deliverabilityReason || 'Verified corporate email';
              changed = true;
              console.log(`[Auto-Heal HR] Discovered email for ${job.hrName || job.company} at ${job.company}: ${emailRes.email}`);
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
    // Fetch non-deleted jobs
    const jobs = await Job.find({ userId: req.user.id, isDeleted: { $ne: true } })
      .sort({ sentAt: -1, publishedAt: -1, createdAt: -1, updatedAt: -1 })
      .lean();

    const seenKeys = new Map(); // key -> index in uniqueJobs
    const uniqueJobs = [];
    const duplicateIdsToPrune = [];

    const getJobPriority = (j) => {
      let score = 0;
      if (j.status === 'Sent') score += 100;
      else if (j.status === 'Drafting') score += 50;
      else if (j.status === 'Found' || j.status === 'HR_Found') score += 10;
      if (j.emailRecipient) score += 20;
      if (j.deliverabilityScore) score += j.deliverabilityScore / 10;
      if (j.sentAt) score += 5;
      return score;
    };

    for (const j of jobs) {
      const isHR = j.status === 'HR_Found' || !!j.hrLinkedIn || !!j.hrName;
      let primaryKey = '';
      let secondaryKey = '';

      if (isHR) {
        const handle = extractLinkedInHandle(j.hrLinkedIn || j.applyLink);
        if (handle) primaryKey = `hr_handle_${handle}`;
        const normName = normalizeHrName(j.hrName);
        const compKey = normalizeCompanyKey(j.company);
        if (normName) secondaryKey = `hr_name_${compKey || 'none'}_${normName}`;
      } else {
        const normUrl = normalizeApplyUrl(j.applyLink);
        if (normUrl) primaryKey = `job_url_${normUrl}`;
        const compKey = normalizeCompanyKey(j.company);
        const roleKey = normalizeRoleKey(j.role);
        if (compKey && roleKey) secondaryKey = `job_crole_${compKey}_${roleKey}`;
      }

      const matchedKey = (primaryKey && seenKeys.has(primaryKey))
        ? primaryKey
        : ((secondaryKey && seenKeys.has(secondaryKey)) ? secondaryKey : null);

      if (matchedKey) {
        const existingIdx = seenKeys.get(matchedKey);
        const existing = uniqueJobs[existingIdx];
        if (getJobPriority(j) > getJobPriority(existing)) {
          duplicateIdsToPrune.push(existing._id);
          uniqueJobs[existingIdx] = j;
          if (primaryKey) seenKeys.set(primaryKey, existingIdx);
          if (secondaryKey) seenKeys.set(secondaryKey, existingIdx);
        } else {
          duplicateIdsToPrune.push(j._id);
        }
      } else {
        const newIdx = uniqueJobs.length;
        uniqueJobs.push(j);
        if (primaryKey) seenKeys.set(primaryKey, newIdx);
        if (secondaryKey) seenKeys.set(secondaryKey, newIdx);
      }
    }

    // Soft-delete duplicate jobs in background
    if (duplicateIdsToPrune.length > 0) {
      Job.updateMany(
        { _id: { $in: duplicateIdsToPrune } },
        { $set: { isDeleted: true, deletedAt: new Date() } }
      ).catch(() => { });
    }

    const normalized = uniqueJobs.map(j => ({
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

router.post('/check-all-emails', requireAuth, async (req, res) => {
  const { scope = 'all', jobIds } = req.body;
  try {
    let queryFilter = { userId: req.user.id, isDeleted: { $ne: true } };

    if (Array.isArray(jobIds) && jobIds.length > 0) {
      queryFilter.$or = [
        { id: { $in: jobIds } },
        { _id: { $in: jobIds.filter(id => mongoose.Types.ObjectId.isValid(id)) } }
      ];
    } else {
      if (scope === 'jobs') {
        queryFilter.status = { $in: ['Found', 'Drafting'] };
      } else if (scope === 'hr') {
        queryFilter.status = 'HR_Found';
      } else {
        queryFilter.status = { $in: ['Found', 'Drafting', 'HR_Found'] };
      }
      queryFilter.$or = [
        { emailRecipient: { $in: ['', null] } },
        { deliverabilityScore: { $lt: 60 } },
        { deliverabilityStatus: { $in: ['undeliverable', 'unverified', 'unknown'] } }
      ];
    }

    const candidateJobs = await Job.find(queryFilter).limit(35);
    let checkedCount = 0;
    let foundCount = 0;
    const updatedJobs = [];

    // Process jobs in parallel batches of 5
    const batchSize = 5;
    for (let i = 0; i < candidateJobs.length; i += batchSize) {
      const slice = candidateJobs.slice(i, i + batchSize);
      await Promise.all(slice.map(async (job) => {
        if (!job.company || job.company === 'Direct Recruiter / Agency' || isInvalidCompany(job.company)) {
          return;
        }
        checkedCount++;
        try {
          const domain = await resolveCompanyDomain(job.company, job.applyLink);
          if (domain && domain !== 'unknown.com') {
            const emailRes = await discoverEmailForJob(
              job.company,
              domain,
              job.jd || '',
              job.failedEmails || [],
              callAIWithRetry,
              job.hrName || null,
              job.hrLinkedIn || null,
              job.applyLink || null
            );

            if (emailRes && emailRes.email && (emailRes.deliverabilityScore >= 65 || emailRes.verification?.canAutoSend)) {
              job.emailRecipient = emailRes.email;
              job.deliverabilityScore = emailRes.deliverabilityScore || 80;
              job.deliverabilityStatus = emailRes.deliverabilityStatus || 'deliverable';
              job.deliverabilityReason = emailRes.deliverabilityReason || 'Verified corporate email';
              await job.save();
              foundCount++;
              updatedJobs.push({
                id: job.id || job._id.toString(),
                emailRecipient: job.emailRecipient,
                deliverabilityScore: job.deliverabilityScore,
                deliverabilityStatus: job.deliverabilityStatus,
                deliverabilityReason: job.deliverabilityReason
              });
            } else if (!job.emailRecipient) {
              job.deliverabilityStatus = 'undeliverable';
              job.deliverabilityReason = emailRes?.deliverabilityReason || 'No verified recipient mailbox found';
              await job.save();
              updatedJobs.push({
                id: job.id || job._id.toString(),
                emailRecipient: '',
                deliverabilityScore: 0,
                deliverabilityStatus: job.deliverabilityStatus,
                deliverabilityReason: job.deliverabilityReason
              });
            }
          }
        } catch (jobErr) {
          console.warn(`[Check-All-Emails] Error checking ${job.company}:`, jobErr.message);
        }
      }));
    }

    res.json({
      success: true,
      checked: checkedCount,
      found: foundCount,
      updatedJobs
    });
  } catch (err) {
    console.error('Error checking all emails:', err);
    res.status(500).json({ error: 'Failed to check emails' });
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
    if (emailDraft !== undefined) {
      // If job already has a full signature saved and the incoming draft is missing it, preserve the full signature
      if (job.emailDraft && job.emailDraft.includes('Yours Sincerely') && !emailDraft.includes('Yours Sincerely')) {
        // keep full draft
      } else {
        job.emailDraft = emailDraft;
      }
    }
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
    queries = [req.body.query || 'junior software developer'];
  }

  // Check if current search or user profile targets junior positions
  const userProfile = await Profile.findOne({ userId: req.user.id });
  const userLevel = userProfile?.experienceLevel || '';
  const isJuniorSearch = targetExperience === 'Junior' || queries.some(q => shouldExcludeSenior(q, userLevel)) || shouldExcludeSenior('', userLevel);

  // Expand fresher searches to include corporate titles for better results
  const rawQueries = queries.map(q => (q || '').trim()).filter(Boolean);
  const searchQueriesList = [...rawQueries];

  const hasFresherQuery = rawQueries.some(q => q.toLowerCase().includes('fresher'));
  if (hasFresherQuery) {
    if (!rawQueries.some(q => q.toLowerCase().includes('associate'))) {
      searchQueriesList.push('associate software engineer');
    }
    if (!rawQueries.some(q => q.toLowerCase().includes('graduate'))) {
      searchQueriesList.push('graduate engineer trainee');
    }
  }
  const searchQueries = Array.from(new Set(searchQueriesList));

  // Pre-load existing jobs to prevent duplicates
  const allExistingJobs = await Job.find(
    { userId: req.user.id },
    { company: 1, role: 1, applyLink: 1, id: 1, hrLinkedIn: 1, hrName: 1 }
  ).lean();

  const existingCompanyRoles = new Set();
  const existingApplyUrls = new Set();
  const existingExternalIds = new Set();

  for (const ej of allExistingJobs) {
    const cKey = normalizeCompanyKey(ej.company);
    const rKey = normalizeRoleKey(ej.role);
    if (cKey && rKey) existingCompanyRoles.add(`${cKey}__${rKey}`);
    const uKey = normalizeApplyUrl(ej.applyLink);
    if (uKey) existingApplyUrls.add(uKey);
    if (ej.id) existingExternalIds.add(String(ej.id));
  }

  let totalAdded = 0;

  if (process.env.ADZUNA_APP_ID && process.env.ADZUNA_APP_KEY) {
    try {
      for (const what of searchQueries) {
        if (req.destroyed || req.socket?.destroyed) {
          console.log('[Fetch-Jobs] Request aborted by client. Halting scrape.');
          return;
        }
        for (const loc of targetLocations) {
          if (req.destroyed || req.socket?.destroyed) {
            console.log('[Fetch-Jobs] Request aborted by client. Halting scrape.');
            return;
          }
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
            // Fetch jobs from past 24 hours
            const fullUrl = `https://api.adzuna.com/v1/api/jobs/${country}/search/${page}?app_id=${process.env.ADZUNA_APP_ID}&app_key=${process.env.ADZUNA_APP_KEY}&what=${encodeURIComponent(searchQuery)}${whereParam}&results_per_page=20&max_days_old=1&sort_by=date`;

            const response = await axios.get(fullUrl);
            const apiJobs = response.data.results || [];
            if (apiJobs.length === 0) break; // No more results on subsequent pages

            for (const job of apiJobs) {
              // Skip listings older than 12 hours
              if (job.created) {
                const ageMs = Date.now() - new Date(job.created).getTime();
                if (!isNaN(ageMs) && ageMs > 12 * 60 * 60 * 1000) {
                  continue;
                }
              }

              const company = job.company?.display_name || 'Unknown';
              const role = job.title || 'Unknown Role';
              const jd = job.description || 'No description available';

              const detectedLevel = detectExperienceLevel(role, jd);

              // Filter by experience level
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

              // Skip duplicates
              const compKey = normalizeCompanyKey(company);
              const roleKey = normalizeRoleKey(role);
              const compRoleKey = `${compKey}__${roleKey}`;
              const normUrl = normalizeApplyUrl(job.redirect_url);
              const jobIdStr = job.id ? String(job.id) : null;

              if (
                (compKey && roleKey && existingCompanyRoles.has(compRoleKey)) ||
                (normUrl && existingApplyUrls.has(normUrl)) ||
                (jobIdStr && existingExternalIds.has(jobIdStr))
              ) {
                continue;
              }

              const rawPubDate = job.created ? new Date(job.created) : new Date();
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

              if (compKey && roleKey) existingCompanyRoles.add(compRoleKey);
              if (normUrl) existingApplyUrls.add(normUrl);
              if (jobIdStr) existingExternalIds.add(jobIdStr);
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
        const jd = job.description || job.jobDescription || 'No description available';
        const dateSnippet = job.date || job.postedAt || job.posted_time || job.postedDate || job.rawDate || '';

        // Skip listings older than 12 hours
        if (isOlderThan12Hours(dateSnippet) || isOlderThan12Hours(jd)) {
          continue;
        }

        const company = job.companyName || job.company || 'Unknown Apify Company';
        const role = job.title || job.positionName || job.role || 'Unknown Apify Role';
        const link = job.job_url_direct || job.job_url || job.url || job.applyLink || job.jobUrl || '';
        const loc = job.location || 'India';
        const detectedLevel = detectExperienceLevel(role, jd);

        // Filter by experience level
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

        let jobSource = 'Other';
        const rawSite = job.site || '';
        if (rawSite === 'linkedin' || link.includes('linkedin.com')) jobSource = 'LinkedIn';
        else if (rawSite === 'indeed' || link.includes('indeed.com')) jobSource = 'Indeed';

        // Skip duplicates
        const compKey = normalizeCompanyKey(company);
        const roleKey = normalizeRoleKey(role);
        const compRoleKey = `${compKey}__${roleKey}`;
        const normUrl = normalizeApplyUrl(link);
        const jobIdStr = job.id ? String(job.id) : null;

        if (
          (compKey && roleKey && existingCompanyRoles.has(compRoleKey)) ||
          (normUrl && existingApplyUrls.has(normUrl)) ||
          (jobIdStr && existingExternalIds.has(jobIdStr))
        ) {
          continue;
        }

        const apifySalary = job.salary || job.compensation || '';
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

        if (compKey && roleKey) existingCompanyRoles.add(compRoleKey);
        if (normUrl) existingApplyUrls.add(normUrl);
        if (jobIdStr) existingExternalIds.add(jobIdStr);
      }
    } catch (err) {
      console.error(`Error fetching Apify jobs:`, err.message);
    }
  }

  // Fetch jobs via JSearch (RapidAPI Google for Jobs: LinkedIn, Indeed, Naukri, Glassdoor)
  if (process.env.RAPIDAPI_KEY) {
    try {
      for (const what of searchQueries.slice(0, 3)) {
        for (const loc of targetLocations.slice(0, 2)) {
          const locStr = (loc && loc.toLowerCase() !== 'all india' && loc.toLowerCase() !== 'all') ? ` in ${loc}` : ' in India';
          const queryStr = `${what}${locStr}`;

          const jsearchRes = await axios.get('https://jsearch.p.rapidapi.com/search-v2', {
            params: {
              query: queryStr,
              num_pages: '1',
              date_posted: 'today'
            },
            headers: {
              'x-rapidapi-host': 'jsearch.p.rapidapi.com',
              'x-rapidapi-key': process.env.RAPIDAPI_KEY
            },
            timeout: 10000
          });

          const apiJobs = jsearchRes.data?.data?.jobs || [];
          for (const job of apiJobs) {
            // Check 12-hour freshness cutoff
            const postedDate = job.job_posted_at_datetime_utc ? new Date(job.job_posted_at_datetime_utc) : null;
            if (postedDate && !isNaN(postedDate.getTime())) {
              const ageMs = Date.now() - postedDate.getTime();
              if (ageMs > 12 * 60 * 60 * 1000) continue;
            }

            const company = job.employer_name || 'Unknown Company';
            const role = job.job_title || 'Unknown Role';
            const jd = job.job_description || 'No description available';

            // Filter by experience level
            const detectedLevel = detectExperienceLevel(role, jd);
            if (targetExperience && targetExperience !== 'All') {
              if (targetExperience === 'Junior' && isSeniorRole(role, jd)) continue;
              if (targetExperience === 'Senior' && isJuniorRole(role, jd)) continue;
              if (targetExperience === 'Mid' && (isSeniorRole(role, jd) || isJuniorRole(role, jd))) continue;
            } else if (isJuniorSearch && isSeniorRole(role, jd)) {
              continue;
            }

            // Deduplication
            const compKey = normalizeCompanyKey(company);
            const roleKey = normalizeRoleKey(role);
            const compRoleKey = `${compKey}__${roleKey}`;
            const normUrl = normalizeApplyUrl(job.job_apply_link);
            const jobIdStr = job.job_id ? String(job.job_id) : null;

            if (
              (compKey && roleKey && existingCompanyRoles.has(compRoleKey)) ||
              (normUrl && existingApplyUrls.has(normUrl)) ||
              (jobIdStr && existingExternalIds.has(jobIdStr))
            ) {
              continue;
            }

            let salary = '';
            if (job.job_min_salary || job.job_max_salary) {
              const curr = job.job_salary_currency || '₹';
              if (job.job_min_salary && job.job_max_salary) {
                salary = `${curr}${job.job_min_salary} - ${curr}${job.job_max_salary}`;
              } else if (job.job_min_salary) {
                salary = `${curr}${job.job_min_salary}+`;
              }
            }

            const jobPublisher = job.job_publisher || 'Google Jobs';

            const newJob = new Job({
              userId: req.user.id,
              id: job.job_id || Date.now().toString() + Math.random().toString().substring(2, 6),
              company,
              role,
              jd,
              status: 'Found',
              publishedAt: postedDate && !isNaN(postedDate.getTime()) ? postedDate : new Date(),
              applyLink: job.job_apply_link || '',
              location: job.job_city ? `${job.job_city}, ${job.job_country || 'India'}` : (loc !== 'All India' ? loc : 'India'),
              source: jobPublisher,
              experienceLevel: detectedLevel,
              salary
            });

            await newJob.save();
            totalAdded++;

            if (compKey && roleKey) existingCompanyRoles.add(compRoleKey);
            if (normUrl) existingApplyUrls.add(normUrl);
            if (jobIdStr) existingExternalIds.add(jobIdStr);
          }
        }
      }
    } catch (jsearchErr) {
      console.warn('[JSearch] Job search error:', jsearchErr.message);
    }
  }

  // Fallback search if no jobs found
  if (totalAdded === 0 && process.env.SERPER_API_KEY) {
    try {
      for (const what of searchQueries) {
        for (const loc of targetLocations) {
          const freeJobs = await scrapeJobsFree(what, loc, Array.from(existingCompanyRoles));
          for (const fj of freeJobs) {
            const compKey = normalizeCompanyKey(fj.company);
            const roleKey = normalizeRoleKey(fj.role);
            const compRoleKey = `${compKey}__${roleKey}`;
            const normUrl = normalizeApplyUrl(fj.applyLink);

            if (
              (compKey && roleKey && existingCompanyRoles.has(compRoleKey)) ||
              (normUrl && existingApplyUrls.has(normUrl))
            ) {
              continue;
            }

            const newJob = new Job({
              userId: req.user.id,
              id: Date.now().toString() + Math.random().toString().substring(2, 6),
              company: fj.company,
              role: fj.role,
              jd: fj.jd,
              status: 'Found',
              publishedAt: fj.publishedAt || new Date(),
              applyLink: fj.applyLink || '',
              location: fj.location || loc,
              source: fj.source || 'Other',
              experienceLevel: fj.experienceLevel || 'Mid',
              salary: fj.salary || ''
            });
            await newJob.save();
            totalAdded++;

            if (compKey && roleKey) existingCompanyRoles.add(compRoleKey);
            if (normUrl) existingApplyUrls.add(normUrl);
          }
        }
      }
    } catch (serperErr) {
      console.warn('[Fetch-Jobs] Serper fallback job search error:', serperErr.message);
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
    // Pre-load past HR leads to prevent duplicates
    const allUserJobs = await Job.find(
      { userId: req.user.id },
      { hrLinkedIn: 1, hrName: 1, company: 1, applyLink: 1, status: 1 }
    ).lean();

    const existingUrls = [];
    const existingHandles = new Set();
    const existingNames = new Set();
    const existingCompanyHr = new Set();

    for (const j of allUserJobs) {
      if (j.hrLinkedIn) {
        existingUrls.push(j.hrLinkedIn);
        const h = extractLinkedInHandle(j.hrLinkedIn);
        if (h) existingHandles.add(h);
      }
      if (j.applyLink && j.applyLink.includes('linkedin.com/in/')) {
        existingUrls.push(j.applyLink);
        const h = extractLinkedInHandle(j.applyLink);
        if (h) existingHandles.add(h);
      }
      if (j.hrName) {
        const n = normalizeHrName(j.hrName);
        if (n) {
          existingNames.add(n);
          const c = normalizeCompanyKey(j.company);
          if (c) existingCompanyHr.add(`${c}__${n}`);
        }
      }
    }

    console.log(`[Scrape-HR] Discovering fresh unique HR leads for query: "${query}", location: "${location}"...`);

    // Discover HR recruiters on LinkedIn
    let hrProfiles = await discoverHRProfiles(
      query,
      location,
      existingUrls,
      Array.from(existingNames),
      Array.from(existingHandles)
    );

    // Fallback search by company name if needed
    if (hrProfiles.length < 5) {
      try {
        const companyHr = await findHROnLinkedIn(query, location);
        if (companyHr && companyHr.name) {
          const normName = normalizeHrName(companyHr.name);
          const handle = extractLinkedInHandle(companyHr.linkedinUrl);
          if ((!normName || !existingNames.has(normName)) && (!handle || !existingHandles.has(handle))) {
            hrProfiles.unshift({
              name: companyHr.name,
              role: 'Talent Acquisition / HR Recruiter',
              company: query,
              link: companyHr.linkedinUrl,
              snippet: companyHr.snippet || `HR & Hiring for ${query}`,
              location: location
            });
          }
        }
      } catch (compErr) {
        console.error('[Scrape-HR] Company fallback HR error:', compErr.message);
      }
    }

    const results = [];

    // Save unique HR leads
    for (const hr of hrProfiles) {
      if (req.destroyed || req.socket?.destroyed) {
        console.log('[Scrape-HR] Request aborted by client. Halting HR lead processing.');
        return;
      }
      if (results.length >= 10) break; // Deliver up to 10 quality unique leads per run

      const normName = normalizeHrName(hr.name);
      if (!normName || existingNames.has(normName)) continue;

      const handle = extractLinkedInHandle(hr.link);
      if (handle && existingHandles.has(handle)) continue;

      const compKey = normalizeCompanyKey(hr.company);
      const compHrKey = `${compKey}__${normName}`;
      if (compKey && existingCompanyHr.has(compHrKey)) continue;

      existingNames.add(normName);
      if (handle) existingHandles.add(handle);
      if (compKey) existingCompanyHr.add(compHrKey);

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
              hr.link,
              hr.link
            );
            const timeoutPromise = new Promise(resolve => setTimeout(() => resolve({ email: null }), 8000));
            const emailRes = await Promise.race([emailPromise, timeoutPromise]);
            if (emailRes && emailRes.email && (emailRes.deliverabilityScore >= 65 || emailRes.verification?.canAutoSend)) {
              discoveredEmail = emailRes.email;
              deliverabilityScore = emailRes.deliverabilityScore || 80;
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

    console.log(`[Scrape-HR] Successfully discovered ${results.length} fresh unique HR leads!`);
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

