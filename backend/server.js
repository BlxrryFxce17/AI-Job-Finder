require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { GoogleGenAI } = require('@google/genai');
const Groq = require('groq-sdk');
const imaps = require('imap-simple');
const { simpleParser } = require('mailparser');
const nodemailer = require('nodemailer');
const pdfParse = require('pdf-parse');
const mongoose = require('mongoose');
const multer = require('multer');
const { google } = require('googleapis');

const upload = multer({ storage: multer.memoryStorage() });

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Initialize AI Engines
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const gemini = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Google OAuth2 Client
// We check if we are running locally vs production to set the correct redirect URI
const isProd = process.env.NODE_ENV === 'production';
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  isProd && process.env.PUBLIC_URL ? `${process.env.PUBLIC_URL}/api/auth/google/callback` : 'http://localhost:5000/api/auth/google/callback'
);

// Connect to MongoDB
if (process.env.MONGO_URI) {
  mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('✅ Connected to MongoDB Atlas'))
    .catch(err => console.error('❌ MongoDB Connection Error:', err));
} else {
  console.error('❌ MONGO_URI is missing from .env! App will not work without it.');
}

// Mongoose Job Schema
const jobSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  company: { type: String, required: true },
  role: { type: String, required: true },
  jd: { type: String, default: '' },
  status: { type: String, default: 'Found' },
  applyLink: { type: String, default: '' },
  location: { type: String, default: '' },
  emailDraft: { type: String, default: '' },
  emailRecipient: { type: String, default: '' },
  failedEmails: { type: [String], default: [] },
  tracked: { type: Boolean, default: false },
  clickedLinks: { type: [String], default: [] }
}, { timestamps: true });

const Job = mongoose.model('Job', jobSchema);

const profileSchema = new mongoose.Schema({
  name: { type: String, default: '' },
  title: { type: String, default: '' },
  phone: { type: String, default: '' },
  linkedin: { type: String, default: '' },
  github: { type: String, default: '' },
  resumeText: { type: String, default: '' },
  resumeFilename: { type: String, default: '' },
  resumePdf: { type: Buffer },
  emailUser: { type: String, default: '' },
  googleRefreshToken: { type: String, default: '' },
  googleAccessToken: { type: String, default: '' },
  googleTokenExpiry: { type: Number, default: 0 }
});

const Profile = mongoose.model('Profile', profileSchema);

const callAIWithRetry = async (prompt, retries = 5, delayMs = 3000) => {
  for (let i = 0; i < retries; i++) {
    try {
      console.log(`[AI] Attempt ${i + 1}/${retries}: Trying Gemini...`);
      const response = await gemini.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
      });
      return { text: response.text };
    } catch (geminiErr) {
      console.warn(`[Gemini API] Failed:`, geminiErr.message || geminiErr);
      console.log(`[AI] Attempt ${i + 1}/${retries}: Falling back to Groq Llama-3...`);
      try {
        const completion = await groq.chat.completions.create({
          messages: [{ role: 'user', content: prompt }],
          model: 'llama-3.1-8b-instant',
        });
        return { text: completion.choices[0]?.message?.content || '' };
      } catch (groqErr) {
        console.warn(`[Groq API] Failed:`, groqErr.message || groqErr);
        if (i < retries - 1) {
          console.log(`[AI] Both engines failed. Waiting ${delayMs / 1000}s before retry...`);
          await new Promise(res => setTimeout(res, delayMs));
          delayMs += 3000;
        } else {
          throw new Error(`All AI engines failed after ${retries} attempts.`);
        }
      }
    }
  }
};

async function getProfile() {
  if (mongoose.connection.readyState !== 1) return null;
  let profile = await Profile.findOne();
  if (!profile) {
    profile = new Profile();
    await profile.save();
  }
  return profile;
}

// Call on startup once DB connects
mongoose.connection.once('open', () => getProfile());

// OAuth2 Endpoints
app.get('/api/auth/google', (req, res) => {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return res.status(500).json({ error: 'Google OAuth2 is not configured in backend .env' });
  }
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://mail.google.com/'],
    prompt: 'consent'
  });
  res.redirect(url);
});

app.get('/api/auth/google/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).send('No code provided');
  
  try {
    const { tokens } = await oauth2Client.getToken(code);
    const profile = await getProfile();
    profile.googleRefreshToken = tokens.refresh_token || profile.googleRefreshToken;
    profile.googleAccessToken = tokens.access_token;
    profile.googleTokenExpiry = tokens.expiry_date;
    
    // Automatically fetch their email address
    oauth2Client.setCredentials(tokens);
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    const profileRes = await gmail.users.getProfile({ userId: 'me' });
    profile.emailUser = profileRes.data.emailAddress;
    
    await profile.save();
    
    // Redirect back to frontend
    res.redirect('http://localhost:5173/'); 
  } catch (err) {
    console.error('OAuth callback error:', err);
    res.status(500).send('Authentication failed');
  }
});

async function createTransporter(profile) {
  const userEmail = profile.emailUser || process.env.EMAIL_USER;
  
  if (profile.googleRefreshToken) {
    return nodemailer.createTransport({
      service: 'gmail',
      auth: {
        type: 'OAuth2',
        user: userEmail,
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        refreshToken: profile.googleRefreshToken,
      }
    });
  } else {
    return nodemailer.createTransport({
      service: 'gmail',
      auth: { user: userEmail, pass: process.env.EMAIL_PASS }
    });
  }
}

// Endpoints

app.get('/api/profile', async (req, res) => {
  try {
    const profile = await getProfile();
    res.json(profile || {});
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

app.put('/api/profile', async (req, res) => {
  try {
    const profile = await getProfile();
    Object.assign(profile, req.body);
    await profile.save();
    res.json(profile);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

app.post('/api/profile/resume', upload.single('resume'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const dataBuffer = req.file.buffer;
    const data = await pdfParse(dataBuffer);

    const profile = await getProfile();
    profile.resumeText = data.text;
    profile.resumeFilename = req.file.originalname;
    profile.resumePdf = dataBuffer;
    await profile.save();

    // We omit the large buffer when returning the profile to frontend
    const profileObj = profile.toObject();
    delete profileObj.resumePdf;

    res.json({ success: true, profile: profileObj });
  } catch (err) {
    res.status(500).json({ error: 'Failed to upload and parse resume' });
  }
});

app.get('/api/profile/resume-pdf', async (req, res) => {
  try {
    const profile = await getProfile();
    if (!profile || !profile.resumePdf) {
      return res.status(404).send('No resume uploaded.');
    }
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${profile.resumeFilename}"`);
    res.send(profile.resumePdf);
  } catch (err) {
    res.status(500).send('Failed to fetch resume.');
  }
});

app.get('/api/jobs', async (req, res) => {
  try {
    const jobs = await Job.find().sort({ createdAt: -1 });
    res.json(jobs);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch jobs' });
  }
});

app.post('/api/jobs', async (req, res) => {
  try {
    const job = new Job({ ...req.body, id: Date.now().toString() });
    await job.save();
    res.json(job);
  } catch (err) {
    res.status(500).json({ error: 'Failed to save job' });
  }
});

app.put('/api/jobs/:id', async (req, res) => {
  const { id } = req.params;
  const { status, emailRecipient, emailDraft, tracked } = req.body;

  try {
    const job = await Job.findOne({ id });
    if (!job) return res.status(404).json({ error: 'Job not found' });

    if (status) job.status = status;
    if (emailRecipient) job.emailRecipient = emailRecipient;
    if (emailDraft) job.emailDraft = emailDraft;
    if (tracked !== undefined) job.tracked = tracked;

    await job.save();
    res.json(job);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update job' });
  }
});

app.delete('/api/jobs/:id', async (req, res) => {
  try {
    await Job.deleteOne({ id: req.params.id });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete job' });
  }
});

// Auto-Fetch Jobs via Adzuna API
app.post('/api/fetch-jobs', async (req, res) => {
  let queries = req.body.queries || [];
  if (!Array.isArray(queries) || queries.length === 0) {
    queries = [req.body.query || 'junior software developer, fresher software engineer, entry level developer'];
  }

  if (!process.env.ADZUNA_APP_ID || !process.env.ADZUNA_APP_KEY) {
    return res.status(500).json({ error: 'ADZUNA_APP_ID or ADZUNA_APP_KEY is not set in backend .env' });
  }

  try {
    let totalAdded = 0;

    for (const what of queries) {
      const page = Math.floor(Math.random() * 5) + 1;
      const url = `https://api.adzuna.com/v1/api/jobs/in/search/${page}?app_id=${process.env.ADZUNA_APP_ID}&app_key=${process.env.ADZUNA_APP_KEY}&what=${encodeURIComponent(what)}&results_per_page=20`;
      
      try {
        const response = await axios.get(url);
        const apiJobs = response.data.results || [];
        
        for (const job of apiJobs) {
          const company = job.company?.display_name || 'Unknown';
          const role = job.title || 'Unknown Role';
          const jd = job.description || 'No description available';
    
          // Avoid duplicates
          const exists = await Job.findOne({ company, role });
          if (!exists) {
            const newJob = new Job({
              id: job.id || Date.now().toString() + Math.random(),
              company: company,
              role: role,
              jd: jd,
              status: 'Found',
              applyLink: job.redirect_url || '',
              location: job.location?.display_name || 'India',
            });
            await newJob.save();
            totalAdded++;
          }
        }
      } catch (err) {
        console.error(`Error fetching for query "${what}":`, err.message);
      }
    }

    res.json({ message: `Fetched and added ${totalAdded} new jobs across ${queries.length} searches.` });
  } catch (error) {
    console.error('Error in fetch jobs:', error.message);
    res.status(500).json({ error: 'Failed to fetch jobs from Adzuna API' });
  }
});


// Abstracted Email Discovery logic
async function discoverEmailForJob(company, domain, jd, failedEmails = []) {
  let discoveredEmail = null;
  let source = '';

  // Tier 1: JD Scraper + AI Judge
  if (jd && jd.length > 0) {
    const emailRegex = /[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}/g;
    const foundEmails = jd.match(emailRegex);
    if (foundEmails && foundEmails.length > 0) {
      try {
        const prompt = `You are an AI Email Judge. Extracted emails: ${foundEmails.join(', ')}. Which ONE is most likely the Recruiter or HR contact? Ignore generic support emails. Return ONLY the email address, or "NONE".`;
        const response = await callAIWithRetry(prompt);
        const aiJudgment = response.text.trim();
        const emailMatch = aiJudgment.match(/[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}/);
        if (emailMatch) {
          discoveredEmail = emailMatch[0];
          source = 'Tier 1 (JD Scraper + AI)';
        }
      } catch (err) { }
    }
  }

  // Tier 2: Hunter.io API
  if (!discoveredEmail && process.env.HUNTER_API_KEY) {
    try {
      const hRes = await axios.get(`https://api.hunter.io/v2/domain-search?domain=${domain}&api_key=${process.env.HUNTER_API_KEY}&department=hr`);
      const emails = hRes.data?.data?.emails;
      if (emails && emails.length > 0) {
        discoveredEmail = emails[0].value;
        source = 'Tier 2 (Hunter.io)';
      }
    } catch (err) { }
  }

  // Tier 3: Serper.dev (Google Dorking) + AI Judge
  if (!discoveredEmail && process.env.SERPER_API_KEY) {
    try {
      const sRes = await axios.post('https://google.serper.dev/search', {
        q: `"${company}" "careers" OR "hr" OR "recruiter" email "@${domain}"`
      }, {
        headers: { 'X-API-KEY': process.env.SERPER_API_KEY, 'Content-Type': 'application/json' }
      });
      const snippets = sRes.data?.organic?.map(r => r.snippet).join(' ') || '';
      const emailRegex = /[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}/g;
      const foundEmails = snippets.match(emailRegex);
      if (foundEmails && foundEmails.length > 0) {
        const prompt = `You are an AI Email Judge. Extracted emails: ${foundEmails.join(', ')}. Which ONE is most likely the Recruiter or HR contact? Ignore generic support emails. Return ONLY the email address, or "NONE".`;
        const response = await callAIWithRetry(prompt);
        const aiJudgment = response.text.trim();
        const emailMatch = aiJudgment.match(/[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}/);
        if (emailMatch) {
          discoveredEmail = emailMatch[0];
          source = 'Tier 3 (Google Dorking + AI)';
        }
      }
    } catch (err) { }
  }

  if (discoveredEmail && failedEmails.includes(discoveredEmail)) {
    discoveredEmail = null;
  }

  // Tier 4: Fallback
  if (!discoveredEmail) {
    const fallbackPrefixes = ['careers', 'hr', 'recruiting', 'jobs', 'talent', 'people'];
    for (const prefix of fallbackPrefixes) {
      const guess = `${prefix}@${domain}`;
      if (!failedEmails.includes(guess)) {
        discoveredEmail = guess;
        source = 'Tier 4 (Fallback Smart)';
        break;
      }
    }
  }

  console.log(`[Email Discovery] ${company} -> ${discoveredEmail} (${source})`);
  return { email: discoveredEmail, source };
}

// Email Discovery Engine API
app.post('/api/discover-email', async (req, res) => {
  const { company, jd, failedEmails = [] } = req.body;
  if (!company) return res.status(400).json({ error: 'Company name required' });
  const domain = company.toLowerCase().replace(/[^a-z0-9]/g, '') + '.com';

  const result = await discoverEmailForJob(company, domain, jd, failedEmails);
  res.json(result);
});

// IMAP Bounce Checker
app.get('/api/check-bounces', async (req, res) => {
  const profile = await getProfile();
  const userEmail = profile?.emailUser || process.env.EMAIL_USER;
  const userPass = process.env.EMAIL_PASS;
  
  // NOTE: IMAP simple might not support OAuth2 natively in this configuration. 
  // We'll keep using process.env for IMAP unless they use app passwords, 
  // but for now, we just skip check-bounces if no pass is provided.
  if (!userPass && !profile?.googleRefreshToken) {
    return res.status(500).json({ error: 'IMAP requires App Password or OAuth2 (OAuth2 IMAP not fully implemented)' });
  }

  const config = {
    imap: {
      user: process.env.EMAIL_USER,
      password: process.env.EMAIL_PASS,
      host: 'imap.gmail.com',
      port: 993,
      tls: true,
      tlsOptions: { rejectUnauthorized: false },
      authTimeout: 3000
    }
  };

  try {
    const connection = await imaps.connect(config);
    await connection.openBox('INBOX');

    // Search for unread emails from Mailer Daemon
    const searchCriteria = ['UNSEEN', ['FROM', 'mailer-daemon@googlemail.com']];
    const fetchOptions = { bodies: [''], markSeen: true }; const messages = await connection.search(searchCriteria, fetchOptions);
    let newBouncesCount = 0;

    for (const item of messages) {
      const all = item.parts.find(p => p.which === '');
      const mail = await simpleParser(all.body);

      const text = mail.text || '';
      const match = text.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6})/g);

      if (match) {
        for (const email of match) {
          const job = await Job.findOne({ emailRecipient: email, status: 'Sent' });
          if (job) {
            if (!job.failedEmails.includes(email)) {
              job.failedEmails.push(email);
            }

            // Auto Retry
            const domain = job.company.toLowerCase().replace(/[^a-z0-9]/g, '') + '.com';
            const { email: newEmail } = await discoverEmailForJob(job.company, domain, job.jd, job.failedEmails);

            if (newEmail) {
              const profile = await getProfile();
              const transporter = await createTransporter(profile);

              const baseUrl = process.env.PUBLIC_URL;
              const trackClick = (url) => baseUrl ? `${baseUrl}/api/track-click/${job.id}?url=${encodeURIComponent(url)}` : url;
              const linkedInUrl = trackClick(profile.linkedin);
              const githubUrl = trackClick(profile.github);
              const trackingPixel = baseUrl ? `<img src="${baseUrl}/api/track-open/${job.id}" width="1" height="1" style="display:none;" />` : '';

              let formattedDraft = job.emailDraft.replace(/\n/g, '<br/>');
              if (baseUrl) {
                const resumeLinkUrl = trackClick(`${baseUrl}/api/profile/resume-pdf`);
                formattedDraft = formattedDraft.replace('You can view my CV here.', `<a href="${resumeLinkUrl}">You can view my CV here.</a>`);
              } else {
                formattedDraft = formattedDraft.replace('You can view my CV here.', 'I have attached my CV to this email for your reference.');
              }

              const htmlBody = `
                <div style="font-family: Arial, sans-serif; font-size: 14px; color: #333; line-height: 1.6;">
                  ${formattedDraft}
                  <br/><br/>
                  <b>${profile.name}</b><br/>
                  ${profile.title}<br/>
                  📞 ${profile.phone}<br/>
                  🔗 <a href="${linkedInUrl}">LinkedIn</a> | 💻 <a href="${githubUrl}">GitHub</a>
                  <br/>
                  ${trackingPixel}
                </div>
              `;

              const mailOptions = {
                from: process.env.EMAIL_USER,
                to: newEmail,
                subject: `Application for ${job.role}`,
                html: htmlBody,
                attachments: []
              };
              if (!baseUrl && profile.resumePdf) {
                mailOptions.attachments.push({ filename: profile.resumeFilename || 'resume.pdf', content: profile.resumePdf });
              }
              await transporter.sendMail(mailOptions);
              job.emailRecipient = newEmail;
              console.log(`[Auto-Retry] Resent ${job.company} to ${newEmail}`);
            } else {
              job.status = 'Bounced';
              job.emailRecipient = '';
              console.log(`[Auto-Retry] Failed for ${job.company} - no more fallbacks`);
            }
            await job.save();
            newBouncesCount++;
          }
        }
      }
    }

    connection.end();
    res.json({ message: `Checked bounces`, newBounces: newBouncesCount });
  } catch (err) {
    console.error('IMAP Error:', err.message);
    res.status(500).json({ error: 'IMAP connection failed' });
  }
});

app.post('/api/test-email', async (req, res) => {
  try {
    const profile = await getProfile();
    const myEmail = process.env.EMAIL_USER;
    if (!myEmail) return res.status(500).json({ error: 'EMAIL_USER not configured in backend' });

    const company = "TestCorp";
    const role = "Senior Software Engineer";
    const jd = "We are looking for a senior developer with 5+ years of experience in React, Node.js, and MongoDB. Must be passionate about AI and automation.";
    
    // Draft
    const prompt = `You are an elite, highly persuasive software engineer ("${profile.name}") writing a cold email to the hiring manager at ${company} for the "${role}" position. 
Context: Cold Outreach / Networking
Here is the official Job Description:
"""
${jd}
"""
Here is ${profile.name}'s Resume:
"""
${profile.resumeText || 'No resume available'}
"""

INSTRUCTIONS FOR THE EMAIL DRAFT:
1. DEEP JD ANALYSIS: Internally identify the top 2-3 most critical technical requirements mentioned in the Job Description. DO NOT OUTPUT THIS ANALYSIS in your response.
2. VALUE MAPPING: Explicitly map those exact JD requirements to specific, quantifiable achievements from ${profile.name}'s resume. DO NOT OUTPUT THIS MAPPING process in your response.
3. TONE & STRUCTURE: Keep it concise, confident, and highly impressive. Do not use generic filler (e.g., "I hope this email finds you well"). Start with a strong hook, deliver the value proposition (the mapped skills), and end with a soft call to action.
4. THE FLEX: ALWAYS include this exact postscript right before the sign-off: "P.S. I'm highly passionate about automation and software engineering—in fact, I built the AI web-scraper and autonomous agent that found this job and drafted this email!"
5. THE RESUME LINK: You MUST include the exact phrase "You can view my CV here." somewhere naturally towards the end of the email (before the postscript). 
6. OUTPUT STRICTLY the final email content (body only, no signature, no name). No conversational filler, no internal thoughts, no analysis, and NO MARKDOWN BLOCKS (like \`\`\`email).
7. CRITICAL: DO NOT start your response with "Here is the email..." or "Subject:...". Start IMMEDIATELY with the very first word of the email body.`;

    const response = await callAIWithRetry(prompt);
    let draftText = response.text;
    const emailStartMatch = draftText.match(/(?:Here is the email.*?:|Here's the email.*?:|Here is the cold email.*?:|Subject:.*?\n)\n*/i);
    if (emailStartMatch) {
      draftText = draftText.substring(emailStartMatch.index + emailStartMatch[0].length);
    }
    draftText = draftText.trim();

    // Send
    const transporter = await createTransporter(profile);

    // Generate Tracked Links only if PUBLIC_URL is set
    const baseUrl = process.env.PUBLIC_URL;
    const testJobId = Date.now().toString();
    const trackClick = (url) => baseUrl ? `${baseUrl}/api/track-click/${testJobId}?url=${encodeURIComponent(url)}` : url;
    const trackingPixel = baseUrl ? `<img src="${baseUrl}/api/track-open/${testJobId}" width="1" height="1" style="display:none;" />` : '';

    let formattedDraft = draftText.replace(/\n/g, '<br/>');
    if (baseUrl) {
      const resumeLinkUrl = trackClick(`${baseUrl}/api/profile/resume-pdf`);
      formattedDraft = formattedDraft.replace('You can view my CV here.', `<a href="${resumeLinkUrl}">You can view my CV here.</a>`);
    } else {
      formattedDraft = formattedDraft.replace('You can view my CV here.', 'I have attached my CV to this email for your reference.');
    }

    const htmlBody = `
      <div style="font-family: Arial, sans-serif; font-size: 14px; color: #333; line-height: 1.6;">
        ${formattedDraft}
        <br/><br/>
        <b>${profile.name}</b><br/>
        ${profile.title}<br/>
        📞 ${profile.phone}<br/>
        🔗 <a href="${trackClick(profile.linkedin)}">LinkedIn</a> | 💻 <a href="${trackClick(profile.github)}">GitHub</a>
        <br/>
        ${trackingPixel}
      </div>
    `;

    const mailOptions = {
      from: myEmail,
      to: myEmail,
      subject: `[TEST EMAIL] Application for ${role} at ${company}`,
      html: htmlBody,
      attachments: []
    };

    if (!baseUrl && profile.resumePdf) {
      mailOptions.attachments.push({ filename: profile.resumeFilename || 'resume.pdf', content: profile.resumePdf });
    }

    await transporter.sendMail(mailOptions);

    // Save to Database so it shows in the table
    const testJob = new Job({
      id: testJobId,
      company: company,
      role: role,
      jd: jd,
      status: 'Sent',
      emailDraft: draftText,
      emailRecipient: myEmail,
      tracked: !!baseUrl
    });
    await testJob.save();

    res.json({ success: true, message: 'Test email sent to yourself and added to jobs!' });
  } catch (err) {
    console.error('Test Email Error:', err);
    res.status(500).json({ error: 'Failed to send test email' });
  }
});

app.post('/api/generate-email', async (req, res) => {
  const { company, role, type, jd } = req.body;

  if (!process.env.GEMINI_API_KEY) {
    return res.status(500).json({ error: 'GEMINI_API_KEY is not set in backend .env' });
  }

  try {
    const profile = await getProfile();
    const prompt = `You are an elite, highly persuasive software engineer ("${profile.name}") writing a cold email to the hiring manager at ${company} for the "${role}" position. 
Context: ${type}
Here is the official Job Description:
"""
${jd || 'Not provided'}
"""
Here is ${profile.name}'s Resume:
"""
${profile.resumeText || 'No resume available'}
"""

INSTRUCTIONS FOR THE EMAIL DRAFT:
1. DEEP JD ANALYSIS: Internally identify the top 2-3 most critical technical requirements mentioned in the Job Description. DO NOT OUTPUT THIS ANALYSIS in your response.
2. VALUE MAPPING: Explicitly map those exact JD requirements to specific, quantifiable achievements from ${profile.name}'s resume. DO NOT OUTPUT THIS MAPPING process in your response.
3. TONE & STRUCTURE: Keep it concise, confident, and highly impressive. Do not use generic filler (e.g., "I hope this email finds you well"). Start with a strong hook, deliver the value proposition (the mapped skills), and end with a soft call to action.
4. THE FLEX: ALWAYS include this exact postscript right before the sign-off: "P.S. I'm highly passionate about automation and software engineering—in fact, I built the AI web-scraper and autonomous agent that found this job and drafted this email!"
5. THE RESUME LINK: You MUST include the exact phrase "You can view my CV here." somewhere naturally towards the end of the email (before the postscript). 
6. OUTPUT STRICTLY the final email content (body only, no signature, no name). No conversational filler, no internal thoughts, no analysis, and NO MARKDOWN BLOCKS (like \`\`\`email).
7. CRITICAL: DO NOT start your response with "Here is the email..." or "Subject:...". Start IMMEDIATELY with the very first word of the email body.`;

    const response = await callAIWithRetry(prompt);

    // Clean up any accidental conversational filler from the AI
    let draftText = response.text;

    // If the AI still outputs "Here's the email content:" or similar, strip everything before it
    const emailStartMatch = draftText.match(/(?:Here is the email.*?:|Here's the email.*?:|Here is the cold email.*?:|Subject:.*?\n)\n*/i);
    if (emailStartMatch) {
      draftText = draftText.substring(emailStartMatch.index + emailStartMatch[0].length);
    }

    draftText = draftText.trim();
    
    res.json({ draft: draftText });
  } catch (error) {
    console.error('Error generating email:', error);
    res.status(500).json({ error: 'Failed to generate email' });
  }
});

app.post('/api/send-email', async (req, res) => {
  const { jobId, to, subject, body } = req.body;

  try {
    const job = await Job.findOne({ id: jobId });
    const profile = await getProfile();
    const transporter = await createTransporter(profile);
    const baseUrl = process.env.PUBLIC_URL;

    // Generate Tracked Links only if PUBLIC_URL is set
    const trackClick = (url) => baseUrl ? `${baseUrl}/api/track-click/${jobId}?url=${encodeURIComponent(url)}` : url;
    const linkedInUrl = trackClick(profile.linkedin);
    const githubUrl = trackClick(profile.github);
    const trackingPixel = baseUrl ? `<img src="${baseUrl}/api/track-open/${jobId}" width="1" height="1" style="display:none;" />` : '';

    let formattedDraft = body.replace(/\n/g, '<br/>');
    if (baseUrl) {
      const resumeLinkUrl = trackClick(`${baseUrl}/api/profile/resume-pdf`);
      formattedDraft = formattedDraft.replace('You can view my CV here.', `<a href="${resumeLinkUrl}">You can view my CV here.</a>`);
    } else {
      formattedDraft = formattedDraft.replace('You can view my CV here.', 'I have attached my CV to this email for your reference.');
    }

    // Create HTML Body
    const htmlBody = `
      <div style="font-family: Arial, sans-serif; font-size: 14px; color: #333; line-height: 1.6;">
        ${formattedDraft}
        <br/><br/>
        <b>${profile.name}</b><br/>
        ${profile.title}<br/>
        📞 ${profile.phone}<br/>
        🔗 <a href="${linkedInUrl}">LinkedIn</a> | 💻 <a href="${githubUrl}">GitHub</a>
        <br/>
        ${trackingPixel}
      </div>
    `;

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to,
      subject: subject || 'Job Application',
      html: htmlBody,
      attachments: []
    };

    if (!baseUrl && profile.resumePdf) {
      mailOptions.attachments.push({ filename: profile.resumeFilename || 'resume.pdf', content: profile.resumePdf });
    }

    const info = await transporter.sendMail(mailOptions);
    res.json({ success: true, tracked: !!baseUrl, message: 'Email sent successfully!', messageId: info.messageId });
  } catch (error) {
    console.error('Error sending email:', error);
    res.status(500).json({ error: 'Failed to send email. Check credentials.' });
  }
});

// Single Mail Drafter Endpoint
app.post('/api/single-draft', async (req, res) => {
  const { company, role, jd, recipientEmail } = req.body;
  
  try {
    const profile = await getProfile();
    
    const prompt = `You are an elite, highly persuasive software engineer ("${profile.name}") writing a cold email to the hiring manager at ${company} for the "${role}" position. 
Context: Cold Outreach / Networking
Here is the official Job Description:
"""
${jd}
"""
Here is ${profile.name}'s Resume:
"""
${profile.resumeText || 'No resume available'}
"""

INSTRUCTIONS FOR THE EMAIL DRAFT:
1. DEEP JD ANALYSIS: Internally identify the top 2-3 most critical technical requirements mentioned in the Job Description. DO NOT OUTPUT THIS ANALYSIS in your response.
2. VALUE MAPPING: Explicitly map those exact JD requirements to specific, quantifiable achievements from ${profile.name}'s resume. DO NOT OUTPUT THIS MAPPING process in your response.
3. TONE & STRUCTURE: Keep it concise, confident, and highly impressive. Start with a strong hook, deliver the value proposition, and end with a soft call to action.
4. THE FLEX: ALWAYS include this exact postscript right before the sign-off: "P.S. I'm highly passionate about automation and software engineering—in fact, I built the AI web-scraper and autonomous agent that found this job and drafted this email!"
5. THE RESUME LINK: You MUST include the exact phrase "You can view my CV here." somewhere naturally towards the end of the email (before the postscript). 
6. OUTPUT STRICTLY the final email content (body only, no signature, no name). No conversational filler, no internal thoughts, no analysis, and NO MARKDOWN BLOCKS (like \`\`\`email).
7. CRITICAL: DO NOT start your response with "Here is the email..." or "Subject:...". Start IMMEDIATELY with the very first word of the email body.`;

    const response = await callAIWithRetry(prompt);
    let draftText = response.text.trim();
    const emailStartMatch = draftText.match(/(?:Here is the email.*?:|Here's the email.*?:|Here is the cold email.*?:|Subject:.*?\n)\n*/i);
    if (emailStartMatch) {
      draftText = draftText.substring(emailStartMatch.index + emailStartMatch[0].length).trim();
    }

    const baseUrl = process.env.PUBLIC_URL;
    let formattedDraft = draftText.replace(/\n/g, '<br/>');
    
    const jobId = Date.now().toString() + Math.random().toString().substring(2, 6);
    const trackClick = (url) => baseUrl ? `${baseUrl}/api/track-click/${jobId}?url=${encodeURIComponent(url)}` : url;
    const trackingPixel = baseUrl ? `<img src="${baseUrl}/api/track-open/${jobId}" width="1" height="1" style="display:none;" />` : '';

    if (baseUrl) {
      const resumeLinkUrl = trackClick(`${baseUrl}/api/profile/resume-pdf`);
      formattedDraft = formattedDraft.replace('You can view my CV here.', `<a href="${resumeLinkUrl}">You can view my CV here.</a>`);
    } else {
      formattedDraft = formattedDraft.replace('You can view my CV here.', 'I have attached my CV to this email for your reference.');
    }

    const linkedInUrl = trackClick(profile.linkedin);
    const githubUrl = trackClick(profile.github);
    const htmlBody = `
      <div style="font-family: Arial, sans-serif; font-size: 14px; color: #333; line-height: 1.6;">
        ${formattedDraft}
        <br/><br/>
        <b>${profile.name}</b><br/>
        ${profile.title}<br/>
        📞 ${profile.phone}<br/>
        🔗 <a href="${linkedInUrl}">LinkedIn</a> | 💻 <a href="${githubUrl}">GitHub</a>
        <br/>
        ${trackingPixel}
      </div>
    `;

    const transporter = await createTransporter(profile);
    const mailOptions = {
      from: profile.emailUser || process.env.EMAIL_USER,
      to: recipientEmail,
      subject: `Application for ${role}`,
      html: htmlBody,
      attachments: []
    };

    if (!baseUrl && profile.resumePdf) {
      mailOptions.attachments.push({ filename: profile.resumeFilename || 'resume.pdf', content: profile.resumePdf });
    }

    await transporter.sendMail(mailOptions);

    const newJob = new Job({
      id: jobId,
      company: company,
      role: role,
      jd: jd,
      status: 'Sent',
      emailRecipient: recipientEmail,
      emailDraft: draftText,
      tracked: !!baseUrl
    });
    await newJob.save();

    res.json({ success: true, message: 'Email sent and job tracked!', job: newJob });
  } catch (error) {
    console.error('Error in Single Mail Drafter:', error);
    res.status(500).json({ error: 'Failed to draft and send email.' });
  }
});

// Email Tracking Endpoints
app.get('/api/track-open/:jobId', async (req, res) => {
  const { jobId } = req.params;

  try {
    const job = await Job.findOne({ id: jobId });
    if (job && job.status !== 'Bounced') {
      job.status = 'Opened';
      await job.save();
      console.log(`[Tracking] Email opened for job: ${job.company}`);
    }
  } catch (err) { }

  // Return a 1x1 transparent GIF
  const buf = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
  res.writeHead(200, {
    'Content-Type': 'image/gif',
    'Content-Length': buf.length,
    'Cache-Control': 'no-cache, no-store, must-revalidate',
  });
  res.end(buf);
});

app.get('/api/track-click/:jobId', async (req, res) => {
  const { jobId } = req.params;
  const { url } = req.query;

  try {
    const job = await Job.findOne({ id: jobId });
    if (job && job.status !== 'Bounced') {
      job.status = 'Opened';
      if (url && !job.clickedLinks.includes(url)) {
        job.clickedLinks.push(url);
      }
      await job.save();
      console.log(`[Tracking] Link clicked for job: ${job.company} -> ${url}`);
    }
  } catch (err) { }

  if (url) {
    res.redirect(url);
  } else {
    try {
      const profile = await getProfile();
      res.redirect(profile.linkedin || '/');
    } catch {
      res.redirect('/');
    }
  }
});

app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
});
