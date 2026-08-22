const express = require('express');
const router = express.Router();
const axios = require('axios');
const { ApifyClient } = require('apify-client');
const { google } = require('googleapis');
const Job = require('../models/Job');
const User = require('../models/User');
const requireAuth = require('../middleware/requireAuth');
const { scrapeJobsFree, findHROnLinkedIn } = require('../utils/scraper');
const { discoverEmailForJob, sendEmailViaAPI } = require('../utils/email');
const { callAIWithRetry } = require('../utils/ai');
const Profile = require('../models/Profile');
const { generateTailoredResumePDF } = require('../utils/pdfGenerator');

router.get('/', requireAuth, async (req, res) => {
  try {
    const jobs = await Job.find({ userId: req.user.id }).sort({ publishedAt: -1, createdAt: -1 });
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
    res.status(500).json({ error: 'Failed to save job' });
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
    if (emailRecipient) job.emailRecipient = emailRecipient;
    if (emailDraft) job.emailDraft = emailDraft;
    if (tracked !== undefined) job.tracked = tracked;

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
  if (!Array.isArray(queries) || queries.length === 0) {
    queries = [req.body.query || 'junior software developer, fresher software engineer, entry level developer'];
  }

  let totalAdded = 0;

  if (process.env.ADZUNA_APP_ID && process.env.ADZUNA_APP_KEY) {
    try {
      for (const what of queries) {
        const page = Math.floor(Math.random() * 5) + 1;
        const url = `https://api.adzuna.com/v1/api/jobs/in/search/${page}?app_id=${process.env.ADZUNA_APP_ID}&app_key=${process.env.ADZUNA_APP_KEY}&what=${encodeURIComponent(what)}&results_per_page=20&max_days_old=30&sort_by=date`;

        const response = await axios.get(url);
        const apiJobs = response.data.results || [];

        for (const job of apiJobs) {
          const company = job.company?.display_name || 'Unknown';
          const role = job.title || 'Unknown Role';
          const jd = job.description || 'No description available';

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
              source: 'Adzuna'
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
          searchTerms: queries,
          location: "India",
          maxResults: 20
      });
      const { items } = await client.dataset(run.defaultDatasetId).listItems();
      
      for (const job of items) {
        const company = job.companyName || job.company || 'Unknown Apify Company';
        const role = job.title || job.positionName || job.role || 'Unknown Apify Role';
        const jd = job.description || job.jobDescription || 'No description available';
        const link = job.job_url_direct || job.job_url || job.url || job.applyLink || job.jobUrl || '';
        const loc = job.location || 'India';
        
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
            source: jobSource
          });
          await newJob.save();
          totalAdded++;
        }
      }
    } catch (err) {
      console.error(`Error fetching Apify jobs:`, err.message);
    }
  }

  res.json({ message: `Fetched and added ${totalAdded} new jobs.` });
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
              
              const emailRes = await discoverEmailForJob(job.company, domain, job.jd, job.failedEmails, callAIWithRetry, job.hrName);
              
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
  const query = req.body.query || 'software engineer';
  const location = req.body.location || 'India';
  
  try {
    const existingJobs = await Job.find({ userId: req.user.id }, { company: 1 });
    const excludeCompanies = existingJobs.map(j => (j.company || '').toLowerCase()).filter(Boolean);
    
    const freshJobs = await scrapeJobsFree(query, location, excludeCompanies);
    const results = [];
    
    // Randomize the jobs so we don't always pick the exact same top 5 if many are returned
    const shuffledJobs = freshJobs.sort(() => 0.5 - Math.random());
    
    // Limit to 5 to avoid timeouts/rate limits in a single request
    for (const job of shuffledJobs.slice(0, 5)) { 
      let domain = job.company.toLowerCase().replace(/[^a-z0-9]/g, '') + '.com';
      try {
        const clearbitRes = await axios.get(`https://autocomplete.clearbit.com/v1/companies/suggest?query=${encodeURIComponent(job.company)}`);
        if (clearbitRes.data && clearbitRes.data.length > 0) {
          domain = clearbitRes.data[0].domain;
        }
      } catch (err) { }
      
      const hrProfile = await findHROnLinkedIn(job.company);
      const emailRes = await discoverEmailForJob(job.company, domain, job.jd, [], callAIWithRetry, hrProfile ? hrProfile.name : null);
      
      const newJob = new Job({
        userId: req.user.id,
        id: Date.now().toString() + Math.random().toString().substring(2, 6),
        company: job.company,
        role: job.role,
        jd: job.jd,
        status: 'HR_Found',
        applyLink: job.applyLink,
        location: job.location,
        source: job.source,
        emailRecipient: emailRes.email || '',
        hrName: hrProfile ? hrProfile.name : '',
        hrLinkedIn: hrProfile ? hrProfile.linkedinUrl : '',
        publishedAt: job.publishedAt
      });
      await newJob.save();
      results.push(newJob);
    }
    
    res.json({ success: true, count: results.length, jobs: results });
  } catch (err) {
    console.error('HR Scrape Error', err);
    res.status(500).json({ error: 'Failed to scrape HRs' });
  }
});

module.exports = router;
