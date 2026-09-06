const express = require('express');
const router = express.Router();
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
          job.company === 'Direct Recruiter / Agency'
        ) {
          job.emailRecipient = '';
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
            if (emailRes && emailRes.email) {
              job.emailRecipient = emailRes.email;
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
    await sanitizeExistingHRLeads(req.user.id);
    const jobs = await Job.find({ userId: req.user.id }).sort({ sentAt: -1, publishedAt: -1, createdAt: -1, updatedAt: -1 });
    res.json(jobs);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch jobs' });
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
    const job = await Job.findOne({ id, userId: req.user.id });
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

    await job.save();
    res.json(job);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update job' });
  }
});

router.delete('/:id', requireAuth, async (req, res) => {
  try {
    await Job.deleteOne({ id: req.params.id, userId: req.user.id });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete job' });
  }
});

router.post('/bulk-delete', requireAuth, async (req, res) => {
  try {
    const { jobIds } = req.body;
    if (!Array.isArray(jobIds) || jobIds.length === 0) {
      return res.status(400).json({ error: 'No job IDs provided' });
    }

    const result = await Job.deleteMany({
      id: { $in: jobIds },
      userId: req.user.id
    });

    res.json({ success: true, deletedCount: result.deletedCount });
  } catch (err) {
    console.error('Error in bulk-delete:', err);
    res.status(500).json({ error: 'Failed to delete jobs' });
  }
});

router.post('/fetch-jobs', requireAuth, async (req, res) => {
  let queries = req.body.queries || [];
  const useApify = req.body.useApify || false;
  const targetExperience = req.body.experience || ''; // 'Junior', 'Mid', 'Senior', or 'All'

  if (!Array.isArray(queries) || queries.length === 0) {
    queries = [req.body.query || 'software developer'];
  }

  // Check if current search or user profile targets junior positions
  const userProfile = await Profile.findOne({ userId: req.user.id });
  const userLevel = userProfile?.experienceLevel || '';
  const isJuniorSearch = targetExperience === 'Junior' || queries.some(q => shouldExcludeSenior(q, userLevel)) || shouldExcludeSenior('', userLevel);

  // Tailor queries for external API search based on targetExperience
  let searchQueries = [...queries];
  if (targetExperience === 'Junior') {
    searchQueries = queries.map(q => {
      const lower = q.toLowerCase();
      if (/\b(junior|jr|entry|fresher|freshers|intern|internship|associate|trainee|graduate)\b/i.test(lower)) return q;
      return `junior ${q}`;
    });
  } else if (targetExperience === 'Senior') {
    searchQueries = queries.map(q => {
      const lower = q.toLowerCase();
      if (/\b(senior|sr|lead|principal|staff|architect)\b/i.test(lower)) return q;
      return `senior ${q}`;
    });
  }

  let totalAdded = 0;

  if (process.env.ADZUNA_APP_ID && process.env.ADZUNA_APP_KEY) {
    try {
      for (const what of searchQueries) {
        const page = Math.floor(Math.random() * 5) + 1;
        const url = `https://api.adzuna.com/v1/api/jobs/in/search/${page}?app_id=${process.env.ADZUNA_APP_ID}&app_key=${process.env.ADZUNA_APP_KEY}&what=${encodeURIComponent(what)}&results_per_page=20&max_days_old=30&sort_by=date`;

        const response = await axios.get(url);
        const apiJobs = response.data.results || [];

        for (const job of apiJobs) {
          const company = job.company?.display_name || 'Unknown';
          const role = job.title || 'Unknown Role';
          const jd = job.description || 'No description available';

          const detectedLevel = detectExperienceLevel(role, jd);

          // Strict Experience Filtering:
          // Filter out jobs that do not match the selected experience option
          if (targetExperience && targetExperience !== 'All') {
            if (detectedLevel !== targetExperience) {
              console.log(`[Adzuna Filter] Dropping ${detectedLevel} job "${role}" (target: ${targetExperience})`);
              continue;
            }
            if (targetExperience === 'Junior' && isSeniorRole(role, jd)) {
              console.log(`[Adzuna Filter] Dropping senior role "${role}" for Junior search`);
              continue;
            }
            if (targetExperience === 'Senior' && isJuniorRole(role, jd)) {
              console.log(`[Adzuna Filter] Dropping junior role "${role}" for Senior search`);
              continue;
            }
            if (targetExperience === 'Mid' && (isSeniorRole(role, jd) || isJuniorRole(role, jd))) {
              console.log(`[Adzuna Filter] Dropping non-mid role "${role}" for Mid search`);
              continue;
            }
          } else if (isJuniorSearch && isSeniorRole(role, jd)) {
            console.log(`[Adzuna Filter] Filtered out senior role "${role}" for junior search`);
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

          const exists = await Job.findOne({ company, role, userId: req.user.id });
          if (!exists) {
            const newJob = new Job({
              userId: req.user.id,
              id: job.id || Date.now().toString() + Math.random(),
              company: company,
              role: role,
              jd: jd,
              status: 'Found',
              publishedAt: job.created ? new Date(job.created) : new Date(),
              applyLink: job.redirect_url || '',
              location: job.location?.display_name || 'India',
              source: 'Adzuna',
              experienceLevel: detectedLevel,
              salary: salary
            });
            await newJob.save();
            totalAdded++;
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
      const run = await client.actor("openclawai/job-board-scraper").call({
        searchTerms: searchQueries,
        location: "India",
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
        const apifySalary = job.salary || job.pay || job.salaryRange || job.compensation || '';

        const detectedLevel = detectExperienceLevel(role, jd);

        // Strict Experience Filtering:
        // Filter out jobs that do not match the selected experience option
        if (targetExperience && targetExperience !== 'All') {
          if (detectedLevel !== targetExperience) {
            console.log(`[Apify Filter] Dropping ${detectedLevel} job "${role}" (target: ${targetExperience})`);
            continue;
          }
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

        const exists = await Job.findOne({ company, role, userId: req.user.id });
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
  res.json({ message: `Fetched and added ${totalAdded} new ${expLabel}jobs.` });
});

router.get('/check-bounces', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user || !user.googleRefreshToken) {
      return res.json({ newBounces: 0 });
    }

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );
    oauth2Client.setCredentials({ refresh_token: user.googleRefreshToken });
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    const searchRes = await gmail.users.messages.list({
      userId: 'me',
      q: 'from:mailer-daemon@googlemail.com is:unread',
    });

    const messages = searchRes.data.messages || [];
    let newBouncesCount = 0;

    for (const msg of messages) {
      try {
        const msgRes = await gmail.users.messages.get({
          userId: 'me',
          id: msg.id,
          format: 'full',
        });

        const headers = msgRes.data.payload.headers;
        let failedRecipient = null;

        const xFailed = headers.find(h => h.name.toLowerCase() === 'x-failed-recipients');
        if (xFailed) {
          failedRecipient = xFailed.value;
        } else {
          const snippet = msgRes.data.snippet || '';
          const match = snippet.match(/Delivery to the following recipient failed permanently:\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i);
          if (match) {
            failedRecipient = match[1];
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

            // Auto-retry: Try to discover a new email and resend
            try {
              let domain = job.company.toLowerCase().replace(/[^a-z0-9]/g, '') + '.com';
              try {
                const clearbitRes = await axios.get(`https://autocomplete.clearbit.com/v1/companies/suggest?query=${encodeURIComponent(job.company)}`);
                if (clearbitRes.data && clearbitRes.data.length > 0) {
                  domain = clearbitRes.data[0].domain;
                }
              } catch (err) { }

              const emailRes = await discoverEmailForJob(job.company, domain, job.jd, job.failedEmails, callAIWithRetry, job.hrName, job.hrLinkedIn);

              if (emailRes.email && emailRes.email.toLowerCase() !== failedRecipient) {
                const profile = await Profile.findOne({ userId: user._id });
                const baseUrl = process.env.PUBLIC_URL;

                const trackClick = (url) => (baseUrl && url) ? `${baseUrl}/api/track-click/${job.id}?url=${encodeURIComponent(url)}` : (url || '');
                const linkedInUrl = trackClick(profile.linkedin);
                const githubUrl = trackClick(profile.github);
                const trackingPixel = baseUrl ? `<img src="${baseUrl}/api/track-open/${job.id}" width="1" height="1" style="display:none;" />` : '';

                let formattedDraft = (job.emailDraft || '').replace(/\n/g, '<br/>');
                formattedDraft = formattedDraft.replace('You can view my CV here.', 'I have attached my CV to this email for your reference.');

                const htmlBody = `
                  <div style="font-family: Arial, sans-serif; font-size: 14px; color: #333; line-height: 1.6;">
                    ${formattedDraft}
                    <br/><br/>
                    Yours Sincerely,<br/>
                    <b>${profile.name}</b><br/>
                    ${profile.title}<br/>
                    📞 ${profile.phone}<br/>
                    🔗 <a href="${linkedInUrl}">LinkedIn</a> | 💻 <a href="${githubUrl}">GitHub</a>
                    <br/>
                    ${trackingPixel}
                  </div>
                `;

                const mailOptions = {
                  from: user.email || process.env.EMAIL_USER,
                  to: emailRes.email,
                  subject: `Application for ${job.role} - ${profile.name}`,
                  html: htmlBody,
                  attachments: []
                };

                if (profile.resumePdf) {
                  mailOptions.attachments.push({ filename: profile.resumeFilename || 'resume.pdf', content: profile.resumePdf });
                }

                await sendEmailViaAPI(user, mailOptions);

                job.emailRecipient = emailRes.email;
                job.status = 'Sent';
                await job.save();
                console.log(`[Auto-Retry] Successfully re-sent application for ${job.company} to new email: ${emailRes.email}`);
              }
            } catch (retryErr) {
              console.error('[Auto-Retry] Error re-sending bounced email:', retryErr.message);
            }
          }
        }

        await gmail.users.messages.modify({
          userId: 'me',
          id: msg.id,
          requestBody: { removeLabelIds: ['UNREAD'] }
        });
      } catch (innerErr) { }
    }

    res.json({ newBounces: newBouncesCount });
  } catch (err) {
    res.status(500).json({ error: 'Failed to check bounces' });
  }
});

router.post('/scrape-hr', requireAuth, async (req, res) => {
  const query = (req.body.query || 'software engineer').trim();
  const location = (req.body.location || 'India').trim();
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
            if (emailRes && emailRes.email) {
              discoveredEmail = emailRes.email;
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
    const jobs = await Job.find({ userId: req.user.id });
    const seniorIds = [];
    for (const job of jobs) {
      if (job.experienceLevel === 'Senior' || isSeniorRole(job.role, job.jd)) {
        seniorIds.push(job._id);
      }
    }
    if (seniorIds.length === 0) {
      return res.json({ success: true, deletedCount: 0, message: 'No senior roles found.' });
    }
    const result = await Job.deleteMany({ _id: { $in: seniorIds }, userId: req.user.id });
    res.json({ success: true, deletedCount: result.deletedCount, message: `Successfully removed ${result.deletedCount} senior roles.` });
  } catch (err) {
    console.error('Error in purge-senior:', err);
    res.status(500).json({ error: 'Failed to purge senior jobs' });
  }
});

module.exports = router;

