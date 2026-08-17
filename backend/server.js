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
const MailComposer = require('nodemailer/lib/mail-composer');
const cron = require('node-cron');

const upload = multer({ storage: multer.memoryStorage() });

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

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

const jwt = require('jsonwebtoken');

// Mongoose User Schema
const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  name: { type: String },
  googleRefreshToken: { type: String, default: '' },
  googleAccessToken: { type: String, default: '' },
  googleTokenExpiry: { type: Number, default: 0 }
}, { timestamps: true });

const User = mongoose.model('User', userSchema);

// Mongoose Job Schema
const jobSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  sentAt: { type: Date },
  id: { type: String, required: true },
  company: { type: String, default: 'Unknown Company' },
  role: { type: String, default: 'General Position' },
  jd: { type: String, default: '' },
  status: { type: String, default: 'Found' },
  applyLink: { type: String, default: '' },
  location: { type: String, default: '' },
  emailDraft: { type: String, default: '' },
  emailRecipient: { type: String, default: '' },
  failedEmails: { type: [String], default: [] },
  publishedAt: { type: Date, default: Date.now },
  tracked: { type: Boolean, default: false },
  clickedLinks: [String],
  followUps: [{
    draft: String,
    day: Number,
    sent: { type: Boolean, default: false }
  }]
}, { timestamps: true });

const Job = mongoose.model('Job', jobSchema);

const profileSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  name: { type: String, default: '' },
  title: { type: String, default: '' },
  phone: { type: String, default: '' },
  linkedin: { type: String, default: '' },
  github: { type: String, default: '' },
  resumeText: { type: String, default: '' },
  resumePdf: { type: Buffer },
  skills: { type: [String], default: [] },
  achievements: { type: [String], default: [] },
  experienceLevel: { type: String, default: '' },
  tone: { type: String, default: 'Professional' },
  enableFlex: { type: Boolean, default: true },
  aiInstructions: { type: String, default: '' }
});

const Profile = mongoose.model('Profile', profileSchema);

const callAIWithRetry = async (prompt, retries = 5, delayMs = 3000) => {
  for (let i = 0; i < retries; i++) {
    try {
      console.log(`[AI] Attempt ${i + 1}/${retries}: Trying Groq (Llama-3)...`);
      const completion = await groq.chat.completions.create({
        messages: [{ role: 'user', content: prompt }],
        model: 'openai/gpt-oss-20b',
      });
      return { text: completion.choices[0]?.message?.content || '' };
    } catch (groqErr) {
      console.warn(`[Groq API] Failed:`, groqErr.message || groqErr);
      console.log(`[AI] Attempt ${i + 1}/${retries}: Falling back to Gemini...`);
      try {
        const response = await gemini.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: prompt,
        });
        return { text: response.text };
      } catch (geminiErr) {
        console.warn(`[Gemini API] Failed:`, geminiErr.message || geminiErr);
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

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key-replace-in-prod';

const requireAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'No authorization header' });
  const token = authHeader.split(' ')[1];
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

async function getProfile(userId) {
  if (mongoose.connection.readyState !== 1) return null;
  let profile = await Profile.findOne({ userId });
  if (!profile) {
    profile = new Profile({ userId });
    await profile.save();
  }
  return profile;
}

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

    // Automatically fetch their email address
    oauth2Client.setCredentials(tokens);
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    const profileRes = await gmail.users.getProfile({ userId: 'me' });
    const email = profileRes.data.emailAddress;

    let user = await User.findOne({ email });
    if (!user) {
      user = new User({ email });
    }
    user.googleRefreshToken = tokens.refresh_token || user.googleRefreshToken;
    user.googleAccessToken = tokens.access_token;
    user.googleTokenExpiry = tokens.expiry_date;
    await user.save();

    // Create profile if it doesn't exist
    await getProfile(user._id);

    // Generate JWT
    const token = jwt.sign({ id: user._id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });

    // Redirect back to frontend
    const redirectUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    res.redirect(`${redirectUrl}/?token=${token}`);
  } catch (err) {
    console.error('OAuth callback error:', err);
    res.status(500).send('Authentication failed');
  }
});

async function sendEmailViaAPI(user, mailOptions) {
  const userEmail = user.email || process.env.EMAIL_USER;

  if (user.googleRefreshToken) {
    // Render blocks SMTP ports 25, 465, 587. We MUST use the Gmail API (Port 443 HTTP)
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );
    oauth2Client.setCredentials({ refresh_token: user.googleRefreshToken });
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    // Compile raw MIME string
    const mail = new MailComposer(mailOptions);
    const messageBuffer = await mail.compile().build();

    // Base64URL encode the message
    const encodedMessage = messageBuffer
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const res = await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encodedMessage,
      },
    });
    return { messageId: res.data.id };
  } else {
    // Fallback to SMTP if using App Passwords (will hang on Render Free)
    console.warn('[Warning] No Google Refresh Token found. Falling back to SMTP which may be blocked on Render Free Tier.');
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: userEmail, pass: process.env.EMAIL_PASS }
    });
    return await transporter.sendMail(mailOptions);
  }
}

// Endpoints

app.get('/api/profile', requireAuth, async (req, res) => {
  try {
    const profile = await getProfile(req.user.id);
    const user = await User.findById(req.user.id);
    const profileObj = profile.toObject();
    delete profileObj.resumePdf; // Don't send raw PDF binary to frontend

    const responseData = {
      ...profileObj,
      emailUser: user.email // Attach email from user model for frontend
    };
    res.json(responseData || {});
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

app.put('/api/profile', requireAuth, async (req, res) => {
  try {
    const profile = await getProfile(req.user.id);

    // Safely update only allowed fields
    const allowedFields = ['name', 'title', 'phone', 'linkedin', 'github', 'tone', 'experienceLevel', 'enableFlex', 'aiInstructions'];
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        profile[field] = req.body[field];
      }
    }

    await profile.save();
    const user = await User.findById(req.user.id);
    const profileObj = profile.toObject();
    delete profileObj.resumePdf;
    res.json({ ...profileObj, emailUser: user.email });
  } catch (err) {
    console.error('Profile Update Error:', err);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

app.post('/api/profile/resume', requireAuth, upload.single('resume'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const dataBuffer = req.file.buffer;
    const data = await pdfParse(dataBuffer);

    const profile = await getProfile(req.user.id);
    profile.resumeText = data.text;

    try {
      console.log('[Resume Parse] Extracting details with AI...');
      const prompt = `Extract the core skills (max 10), top 3 achievements, experience level (e.g., Junior, Mid, Senior), full name, current professional title (e.g., Software Engineer), phone number, LinkedIn URL, and GitHub URL from this resume text. 
Return ONLY a valid JSON object with the following structure:
{"skills": ["skill1", "skill2"], "achievements": ["achievement1", "achievement2"], "experienceLevel": "Senior", "name": "John Doe", "title": "Developer", "phone": "1234567890", "linkedin": "url", "github": "url"}
Resume text:
${data.text.substring(0, 4000)}
`;
      const response = await callAIWithRetry(prompt, 3, 2000);
      let jsonStr = response.text;
      const match = jsonStr.match(/```(?:json)?([\s\S]*?)```/);
      if (match) jsonStr = match[1].trim();
      const parsedData = JSON.parse(jsonStr);

      profile.skills = parsedData.skills || [];
      profile.achievements = parsedData.achievements || [];
      profile.experienceLevel = parsedData.experienceLevel || '';

      if (parsedData.name) profile.name = parsedData.name;
      if (parsedData.title) profile.title = parsedData.title;
      if (parsedData.phone) profile.phone = parsedData.phone;
      if (parsedData.linkedin) profile.linkedin = parsedData.linkedin;
      if (parsedData.github) profile.github = parsedData.github;

      console.log('[Resume Parse] Extracted successfully.');
    } catch (aiErr) {
      console.error('[Resume Parse] AI extraction failed:', aiErr.message);
    }

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
    const { userId } = req.query;
    if (!userId) return res.status(400).send('Missing userId');
    const profile = await Profile.findOne({ userId });
    if (!profile || !profile.resumePdf) {
      return res.status(404).send('No resume uploaded.');
    }
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${profile.resumeFilename}"`);
    res.send(profile.resumePdf);
  } catch (err) {
    res.status(500).send('Failed to fetch resume.');
  }
});

app.get('/api/jobs', requireAuth, async (req, res) => {
  try {
    const jobs = await Job.find({ userId: req.user.id }).sort({ publishedAt: -1, createdAt: -1 });
    res.json(jobs);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch jobs' });
  }
});

app.post('/api/jobs', requireAuth, async (req, res) => {
  try {
    const job = new Job({ ...req.body, id: Date.now().toString(), userId: req.user.id });
    await job.save();
    res.json(job);
  } catch (err) {
    res.status(500).json({ error: 'Failed to save job' });
  }
});

app.put('/api/jobs/:id', requireAuth, async (req, res) => {
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

app.delete('/api/jobs/:id', requireAuth, async (req, res) => {
  try {
    await Job.deleteOne({ id: req.params.id, userId: req.user.id });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete job' });
  }
});

// Auto-Fetch Jobs via Adzuna API
app.post('/api/fetch-jobs', requireAuth, async (req, res) => {
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
      const url = `https://api.adzuna.com/v1/api/jobs/in/search/${page}?app_id=${process.env.ADZUNA_APP_ID}&app_key=${process.env.ADZUNA_APP_KEY}&what=${encodeURIComponent(what)}&results_per_page=20&max_days_old=30&sort_by=date`;

      try {
        const response = await axios.get(url);
        const apiJobs = response.data.results || [];

        for (const job of apiJobs) {
          const company = job.company?.display_name || 'Unknown';
          const role = job.title || 'Unknown Role';
          const jd = job.description || 'No description available';

          // Avoid duplicates
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
app.post('/api/discover-email', requireAuth, async (req, res) => {
  const { company, jd, failedEmails = [] } = req.body;
  if (!company) return res.status(400).json({ error: 'Company name required' });
  
  let domain = company.toLowerCase().replace(/[^a-z0-9]/g, '') + '.com';
  try {
    const clearbitRes = await axios.get(`https://autocomplete.clearbit.com/v1/companies/suggest?query=${encodeURIComponent(company)}`);
    if (clearbitRes.data && clearbitRes.data.length > 0) {
      domain = clearbitRes.data[0].domain;
      console.log(`[Email Discovery] Found real domain for ${company}: ${domain}`);
    }
  } catch (err) {
    console.warn(`[Email Discovery] Clearbit API failed for ${company}, using fallback domain: ${domain}`);
  }

  const result = await discoverEmailForJob(company, domain, jd, failedEmails);
  res.json(result);
});

// Gmail API Bounce Checker
app.get('/api/check-bounces', requireAuth, async (req, res) => {
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

    // Search for unread bounce messages
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

        // Try to find X-Failed-Recipients header first
        const xFailed = headers.find(h => h.name.toLowerCase() === 'x-failed-recipients');
        if (xFailed) {
          failedRecipient = xFailed.value;
        } else {
          // Fallback to searching the snippet for common patterns
          const snippet = msgRes.data.snippet || '';
          const match = snippet.match(/Delivery to the following recipient failed permanently:\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i);
          if (match) {
            failedRecipient = match[1];
          }
        }

        if (failedRecipient) {
          failedRecipient = failedRecipient.trim().toLowerCase();
          
          // Find and update the job in MongoDB
          const updatedJobs = await Job.updateMany(
            { 
              userId: user._id, 
              emailRecipient: new RegExp(`^${failedRecipient}$`, 'i'),
              status: { $ne: 'Bounced' }
            },
            { $set: { status: 'Bounced' } }
          );

          if (updatedJobs.modifiedCount > 0) {
            newBouncesCount += updatedJobs.modifiedCount;
          }
        }

        // Remove the UNREAD label so we don't process it again
        await gmail.users.messages.modify({
          userId: 'me',
          id: msg.id,
          requestBody: {
            removeLabelIds: ['UNREAD']
          }
        });
      } catch (innerErr) {
        console.error('Error processing bounce message:', innerErr);
      }
    }

    res.json({ newBounces: newBouncesCount });
  } catch (err) {
    console.error('Error in /api/check-bounces:', err);
    res.status(500).json({ error: 'Failed to check bounces' });
  }
});

app.post('/api/test-email', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    const profile = await getProfile(req.user.id);
    const myEmail = user.email || process.env.EMAIL_USER;
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
${profile.enableFlex !== false ? '4. THE FLEX: ALWAYS include this exact postscript right before the sign-off: "P.S. I\'m highly passionate about automation and software engineering—in fact, I built the AI web-scraper and autonomous agent that found this job and drafted this email!"' : ''}
5. THE RESUME LINK: You MUST include the exact phrase "You can view my CV here." somewhere naturally towards the end of the email (before the postscript). DO NOT add any URLs, colons, or markdown links after this phrase. Just the exact phrase and a period. 
6. OUTPUT STRICTLY the final email content (body only, no signature, no name). No conversational filler, no internal thoughts, no analysis, and NO MARKDOWN BLOCKS (like \`\`\`email).
7. CRITICAL: The very first word of your output MUST be "Dear", "Hi", or the start of the email body. NEVER write "I have crafted...", "Here is the email...", or any conversational intro. Any intro text will break our automated pipeline.
${profile.aiInstructions ? `\nEXTRA CUSTOM INSTRUCTIONS:\n${profile.aiInstructions}` : ''}`;

    console.log('[Test Email] Drafting AI content...');
    const response = await callAIWithRetry(prompt);
    console.log('[Test Email] Draft generated successfully.');

    let draftText = response.text;
    const emailStartMatch = draftText.match(/(?:Here is the email.*?:|Here's the email.*?:|Here is the cold email.*?:|Subject:.*?\n)\n*/i);
    if (emailStartMatch) {
      draftText = draftText.substring(emailStartMatch.index + emailStartMatch[0].length);
    }
    draftText = draftText.trim();

    // Generate Tracked Links only if PUBLIC_URL is set
    const baseUrl = process.env.PUBLIC_URL;
    const testJobId = Date.now().toString();
    const trackClick = (url) => (baseUrl && url) ? `${baseUrl}/api/track-click/${testJobId}?url=${encodeURIComponent(url)}` : (url || '');
    const trackingPixel = baseUrl ? `<img src="${baseUrl}/api/track-open/${testJobId}" width="1" height="1" style="display:none;" />` : '';

    let formattedDraft = draftText.replace(/\n/g, '<br/>');
    if (baseUrl) {
      const resumeLinkUrl = trackClick(`${baseUrl}/api/profile/resume-pdf?userId=${req.user.id}`);
      formattedDraft = formattedDraft.replace('You can view my CV here.', `<a href="${resumeLinkUrl}">You can view my CV here.</a>`);
    } else {
      formattedDraft = formattedDraft.replace('You can view my CV here.', 'I have attached my CV to this email for your reference.');
    }

    const htmlBody = `
      <div style="font-family: Arial, sans-serif; font-size: 14px; color: #333; line-height: 1.6;">
        ${formattedDraft}
        <br/><br/>
        Yours Sincerely,<br/>
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

    console.log('[Test Email] Sending email via API to', myEmail, '...');
    await sendEmailViaAPI(user, mailOptions);
    console.log('[Test Email] Sent successfully!');

    // Save to Database so it shows in the table
    const testJob = new Job({
      userId: req.user.id,
      id: testJobId,
      company: company,
      role: role,
      jd: jd,
      status: 'Sent',
      emailDraft: draftText,
      emailRecipient: myEmail,
      tracked: !!baseUrl,
      sentAt: new Date()
    });
    await testJob.save();

    res.json({ success: true, message: 'Test email sent to yourself and added to jobs!' });
  } catch (err) {
    console.error('Test Email Error:', err);
    res.status(500).json({ error: 'Failed to send test email' });
  }
});

app.post('/api/send-followup', requireAuth, async (req, res) => {
  const { jobId, day } = req.body;
  try {
    const job = await Job.findOne({ userId: req.user.id, id: jobId });
    if (!job) return res.status(404).json({ error: 'Job not found' });

    const followUp = job.followUps.find(f => f.day === day);
    if (!followUp) return res.status(404).json({ error: 'Follow up not found' });

    const user = await User.findById(req.user.id);
    const profile = await getProfile(req.user.id);

    let formattedDraft = followUp.draft.replace(/\n/g, '<br/>');
    const baseUrl = process.env.PUBLIC_URL;
    const trackClick = (url) => (baseUrl && url) ? `${baseUrl}/api/track-click/${job.id}?url=${encodeURIComponent(url)}` : (url || '');
    const linkedInUrl = trackClick(profile.linkedin);
    const githubUrl = trackClick(profile.github);
    const trackingPixel = baseUrl ? `<img src="${baseUrl}/api/track-open/${job.id}" width="1" height="1" style="display:none;" />` : '';

    if (baseUrl) {
      const resumeLinkUrl = trackClick(`${baseUrl}/api/profile/resume-pdf?userId=${user._id}`);
      formattedDraft = formattedDraft.replace('You can view my CV here.', `<a href="${resumeLinkUrl}">You can view my CV here.</a>`);
    } else {
      formattedDraft = formattedDraft.replace('You can view my CV here.', 'I have attached my CV to this email for your reference.');
    }

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
      from: `"${profile.name}" <${user.email || process.env.EMAIL_USER}>`,
      to: job.emailRecipient,
      subject: `Re: Application for ${job.role} - ${profile.name}`,
      text: followUp.draft,
      html: htmlBody,
      attachments: []
    };
    if (!baseUrl && profile.resumePdf) {
      mailOptions.attachments.push({ filename: profile.resumeFilename || 'resume.pdf', content: profile.resumePdf });
    }

    await sendEmailViaAPI(user, mailOptions);

    followUp.sent = true;
    await job.save();

    res.json({ success: true, message: 'Follow up sent!' });
  } catch (err) {
    console.error('Send Follow-up Error:', err);
    res.status(500).json({ error: 'Failed to send follow up' });
  }
});

app.post('/api/generate-email', requireAuth, async (req, res) => {
  const { company, role, type, jd } = req.body;

  if (!process.env.GEMINI_API_KEY) {
    return res.status(500).json({ error: 'GEMINI_API_KEY is not set in backend .env' });
  }

  try {
    const profile = await getProfile(req.user.id);
    const tone = profile.tone || 'Professional';
    const skillsText = profile.skills && profile.skills.length > 0 ? `Core Skills: ${profile.skills.join(', ')}` : '';
    const achText = profile.achievements && profile.achievements.length > 0 ? `Key Achievements:\n- ${profile.achievements.join('\n- ')}` : '';

    const targetCompany = company || 'the company';
    const targetRole = role || 'the open role';

    const prompt = `You are an elite, highly persuasive software engineer ("${profile.name}") writing a cold email to the hiring manager at ${targetCompany} for the "${targetRole}" position. 
Context: ${type}
Tone: ${tone}
Here is the official Job Description:
"""
${jd || 'Not provided'}
"""
Here is ${profile.name}'s Resume:
"""
${profile.resumeText || 'No resume available'}
"""
${skillsText}
${achText}

INSTRUCTIONS FOR THE EMAIL DRAFT:
1. DEEP JD ANALYSIS: Internally identify the top 2-3 most critical technical requirements mentioned in the Job Description. DO NOT OUTPUT THIS ANALYSIS in your response.
2. VALUE MAPPING: Explicitly map those exact JD requirements to specific, quantifiable achievements from ${profile.name}'s resume. DO NOT OUTPUT THIS MAPPING process in your response.
3. TONE & STRUCTURE: Keep it concise, confident, and highly impressive. Do not use generic filler (e.g., "I hope this email finds you well"). Start with a strong hook, deliver the value proposition (the mapped skills), and end with a soft call to action.
${profile.enableFlex !== false ? '4. THE FLEX: ALWAYS include this exact postscript right before the end of your text: "P.S. I\'m highly passionate about automation and software engineering—in fact, I built the AI web-scraper and autonomous agent that found this job and drafted this email!"' : ''}
5. THE RESUME LINK: You MUST include the exact phrase "You can view my CV here." somewhere naturally towards the end of the email (before the postscript). DO NOT add any URLs, colons, or markdown links after this phrase. Just the exact phrase and a period. 
6. NO SIGN-OFF: DO NOT include any sign-off whatsoever (no "Best regards", "Sincerely", or your name). The backend system will automatically append the signature.
7. OUTPUT FORMAT: You MUST output the response EXACTLY in the following format so our system can parse it. If the exact company name or job role was not provided, you MUST extract them from the Job Description.
${profile.aiInstructions ? `\nEXTRA CUSTOM INSTRUCTIONS:\n${profile.aiInstructions}` : ''}

COMPANY: [Extracted Company Name or "Unknown Company"]
ROLE: [Extracted Job Title or "General Position"]
BODY:
[If company is unknown/generic, start with: Dear Hiring Manager,]
[Otherwise start with: Dear Hiring Manager at [Extracted Company Name],]

[Start of email body without any conversational filler or markdown blocks]`;

    const response = await callAIWithRetry(prompt);
    let rawText = response.text.replace(/```(?:html|json|markdown)?\s*([\s\S]*?)```/g, '$1').trim();

    let extractedCompany = company;
    let extractedRole = role;
    let draftText = rawText;

    const companyMatch = rawText.match(/COMPANY:\s*(.*)/i);
    const roleMatch = rawText.match(/ROLE:\s*(.*)/i);
    const bodyMatch = rawText.match(/BODY:\s*([\s\S]*)/i);

    if (companyMatch) extractedCompany = companyMatch[1].trim() || extractedCompany;
    if (roleMatch) extractedRole = roleMatch[1].trim() || extractedRole;
    if (bodyMatch) draftText = bodyMatch[1].trim();

    // Clean up any accidental conversational filler from the AI in the draft
    const emailStartMatch = draftText.match(/(?:Here is the email.*?:|Here's the email.*?:|Here is the cold email.*?:|Subject:.*?\n)\n*/i);
    if (emailStartMatch) {
      draftText = draftText.substring(emailStartMatch.index + emailStartMatch[0].length);
    }
    draftText = draftText.trim();

    res.json({ draft: draftText, company: extractedCompany, role: extractedRole });
  } catch (error) {
    console.error('Error generating email:', error);
    res.status(500).json({ error: 'Failed to generate email' });
  }
});

app.post('/api/send-email', requireAuth, async (req, res) => {
  const { jobId, to, subject, body } = req.body;

  try {
    const job = await Job.findOne({ id: jobId, userId: req.user.id });
    const profile = await getProfile(req.user.id);
    const user = await User.findById(req.user.id);

    const baseUrl = process.env.PUBLIC_URL;

    // Generate Tracked Links only if PUBLIC_URL is set
    const trackClick = (url) => (baseUrl && url) ? `${baseUrl}/api/track-click/${jobId}?url=${encodeURIComponent(url)}` : (url || '');
    const linkedInUrl = trackClick(profile.linkedin);
    const githubUrl = trackClick(profile.github);
    const trackingPixel = baseUrl ? `<img src="${baseUrl}/api/track-open/${jobId}" width="1" height="1" style="display:none;" />` : '';

    let formattedDraft = body.replace(/\n/g, '<br/>');
    if (baseUrl) {
      const resumeLinkUrl = trackClick(`${baseUrl}/api/profile/resume-pdf?userId=${req.user.id}`);
      formattedDraft = formattedDraft.replace('You can view my CV here.', `<a href="${resumeLinkUrl}">You can view my CV here.</a>`);
    } else {
      formattedDraft = formattedDraft.replace('You can view my CV here.', 'I have attached my CV to this email for your reference.');
    }

    // Create HTML Body
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
      to,
      subject: subject || (job ? `Application for ${job.role} - ${profile.name}` : 'Job Application'),
      html: htmlBody,
      attachments: []
    };

    if (!baseUrl && profile.resumePdf) {
      mailOptions.attachments.push({ filename: profile.resumeFilename || 'resume.pdf', content: profile.resumePdf });
    }

    console.log(`[Batch/Send Email] Sending to ${to} for job ${jobId}...`);
    const info = await sendEmailViaAPI(user, mailOptions);
    console.log(`[Batch/Send Email] Sent successfully! MessageId: ${info.messageId}`);
    res.json({ success: true, tracked: !!baseUrl, message: 'Email sent successfully!', messageId: info.messageId });
  } catch (error) {
    console.error('Error sending email:', error);
    res.status(500).json({ error: 'Failed to send email. Check credentials.' });
  }
});

// Single Mail Drafter Endpoint
app.post('/api/single-draft', requireAuth, async (req, res) => {
  const { company, role, jd, recipientEmail } = req.body;

  try {
    const profile = await getProfile(req.user.id);
    const user = await User.findById(req.user.id);

    const tone = profile.tone || 'Professional';
    const skillsText = profile.skills && profile.skills.length > 0 ? `Core Skills: ${profile.skills.join(', ')}` : '';
    const achText = profile.achievements && profile.achievements.length > 0 ? `Key Achievements:\n- ${profile.achievements.join('\n- ')}` : '';

    const targetCompany = company || 'the company';
    const targetRole = role || 'the open role';

    const prompt = `You are an elite, highly persuasive software engineer ("${profile.name}") writing a cold email to the hiring manager at ${targetCompany} for the "${targetRole}" position. 
Context: Cold Outreach / Networking
Tone: ${tone}
Here is the official Job Description:
"""
${jd}
"""
Here is ${profile.name}'s Resume:
"""
${profile.resumeText || 'No resume available'}
"""
${skillsText}
${achText}

INSTRUCTIONS FOR THE EMAIL DRAFT:
1. DEEP JD ANALYSIS: Internally identify the top 2-3 most critical technical requirements mentioned in the Job Description. DO NOT OUTPUT THIS ANALYSIS in your response.
2. VALUE MAPPING: Explicitly map those exact JD requirements to specific, quantifiable achievements from ${profile.name}'s resume. DO NOT OUTPUT THIS MAPPING process in your response.
3. TONE & STRUCTURE: Keep it concise, confident, and highly impressive. Start with a strong hook, deliver the value proposition, and end with a soft call to action.
${profile.enableFlex !== false ? '4. THE FLEX: ALWAYS include this exact postscript right before the end of your text: "P.S. I\'m highly passionate about automation and software engineering—in fact, I built the AI web-scraper and autonomous agent that found this job and drafted this email!"' : ''}
5. THE RESUME LINK: You MUST include the exact phrase "You can view my CV here." somewhere naturally towards the end of the email (before the postscript). DO NOT add any URLs, colons, or markdown links after this phrase. Just the exact phrase and a period. 
6. NO SIGN-OFF: DO NOT include any sign-off whatsoever (no "Best regards", "Sincerely", or your name). The backend system will automatically append the signature.
7. OUTPUT FORMAT: You MUST output the response EXACTLY in the following format so our system can parse it. If the exact company name or job role was not provided, you MUST extract them from the Job Description.
${profile.aiInstructions ? `\nEXTRA CUSTOM INSTRUCTIONS:\n${profile.aiInstructions}` : ''}

COMPANY: [Extracted Company Name or "Unknown Company"]
ROLE: [Extracted Job Title or "General Position"]
BODY:
[If company is unknown/generic, start with: Dear Hiring Manager,]
[Otherwise start with: Dear Hiring Manager at [Extracted Company Name],]

[Start of email body without any conversational filler or markdown blocks]`;

    console.log('[Single Draft] Generating AI draft for', targetCompany, '...');
    const response = await callAIWithRetry(prompt);
    console.log('[Single Draft] Draft generated successfully.');

    let rawText = response.text.replace(/```(?:html|json|markdown)?\s*([\s\S]*?)```/g, '$1').trim();

    let extractedCompany = company || 'Unknown Company';
    let extractedRole = role || 'General Position';
    let draftText = rawText;

    const companyMatch = rawText.match(/COMPANY:\s*(.*)/i);
    const roleMatch = rawText.match(/ROLE:\s*(.*)/i);
    const bodyMatch = rawText.match(/BODY:\s*([\s\S]*)/i);

    if (companyMatch) extractedCompany = companyMatch[1].trim() || extractedCompany;
    if (roleMatch) extractedRole = roleMatch[1].trim() || extractedRole;
    if (bodyMatch) draftText = bodyMatch[1].trim();

    const emailStartMatch = draftText.match(/(?:Here is the email.*?:|Here's the email.*?:|Here is the cold email.*?:|Subject:.*?\n)\n*/i);
    if (emailStartMatch) {
      draftText = draftText.substring(emailStartMatch.index + emailStartMatch[0].length).trim();
    }

    const baseUrl = process.env.PUBLIC_URL;
    let formattedDraft = draftText.replace(/\n/g, '<br/>');

    const jobId = Date.now().toString() + Math.random().toString().substring(2, 6);
    const trackClick = (url) => (baseUrl && url) ? `${baseUrl}/api/track-click/${jobId}?url=${encodeURIComponent(url)}` : (url || '');
    const trackingPixel = baseUrl ? `<img src="${baseUrl}/api/track-open/${jobId}" width="1" height="1" style="display:none;" />` : '';

    if (baseUrl) {
      const resumeLinkUrl = trackClick(`${baseUrl}/api/profile/resume-pdf?userId=${req.user.id}`);
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
      to: recipientEmail,
      subject: `Application for ${extractedRole} - ${profile.name}`,
      html: htmlBody,
      attachments: []
    };

    if (!baseUrl && profile.resumePdf) {
      mailOptions.attachments.push({ filename: profile.resumeFilename || 'resume.pdf', content: profile.resumePdf });
    }

    await sendEmailViaAPI(user, mailOptions);

    const newJob = new Job({
      userId: req.user.id,
      id: jobId,
      company: extractedCompany,
      role: extractedRole,
      jd: jd,
      status: 'Sent',
      emailRecipient: recipientEmail,
      emailDraft: draftText,
      tracked: !!baseUrl,
      sentAt: new Date()
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
  const userAgent = req.headers['user-agent'] || '';

  // User-Agent filtering to ignore common bots
  const botAgents = ['googleimageproxy', 'applemail/proxy', 'barracuda', 'mimecast', 'yahoomailproxy'];
  const isBot = botAgents.some(bot => userAgent.toLowerCase().includes(bot));

  try {
    const job = await Job.findOne({ id: jobId });

    // Time-Delay check (ignore opens within 15 seconds of sending)
    const timeSinceSent = job && job.sentAt ? Date.now() - job.sentAt.getTime() : 16000;

    if (job && job.status !== 'Bounced') {
      if (!isBot && timeSinceSent > 15000) {
        job.status = 'Opened';
        await job.save();
        console.log(`[Tracking] Email opened for job: ${job.company}`);
      } else {
        console.log(`[Tracking] Ignored bot/early open for ${job.company} (Bot: ${isBot}, MsDelay: ${timeSinceSent})`);
      }
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
    let finalUrl = url;
    if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
      finalUrl = 'https://' + finalUrl;
    }
    res.redirect(finalUrl);
  } else {
    try {
      const profile = await getProfile();
      res.redirect(profile.linkedin || '/');
    } catch {
      res.redirect('/');
    }
  }
});

async function checkGmailForReply(user, recipientEmail) {
  if (!user.googleRefreshToken) return false;

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  oauth2Client.setCredentials({ refresh_token: user.googleRefreshToken });
  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

  try {
    const res = await gmail.users.messages.list({
      userId: 'me',
      q: `from:${recipientEmail} to:me`,
      maxResults: 1
    });

    return res.data.messages && res.data.messages.length > 0;
  } catch (err) {
    console.error('Error checking Gmail for reply:', err);
    return false;
  }
}

app.post('/api/check-followups', requireAuth, async (req, res) => {
  console.log('[Manual Check] Starting manual follow-up check for user', req.user.id);
  try {
    const user = await User.findById(req.user.id);
    if (!user || !user.googleRefreshToken) {
      return res.status(400).json({ error: 'No Google account connected for checking replies' });
    }
    const profile = await getProfile(user._id);
    if (!profile) return res.status(404).json({ error: 'Profile not found' });

    const jobs = await Job.find({
      userId: user._id,
      status: { $in: ['Sent', 'Opened'] }
    });

    let draftedCount = 0;

    for (const job of jobs) {
      if (!job.emailRecipient) continue;

      const daysSinceSent = Math.floor((Date.now() - new Date(job.sentAt || job.createdAt).getTime()) / (1000 * 60 * 60 * 24));
      const targetDay = daysSinceSent >= 6 ? 6 : daysSinceSent >= 3 ? 3 : 0;

      if (targetDay === 0) continue;

      const existingFollowUp = job.followUps && job.followUps.find(f => f.day === targetDay);
      if (existingFollowUp) continue;

      const hasReplied = await checkGmailForReply(user, job.emailRecipient);
      if (hasReplied) {
        job.status = 'Replied';
        await job.save();
        continue;
      }

      console.log(`[Manual Check] Generating Day ${targetDay} follow-up for ${job.company}`);
      const companyTarget = job.company && job.company.toLowerCase() !== 'unknown company' && job.company.toLowerCase() !== 'unknown' ? `at ${job.company}` : '';
      const prompt = `Write a short, polite, and confident Day ${targetDay} follow-up email to the hiring manager ${companyTarget} for the ${job.role} position.
Original Email Context:
"""
${job.emailDraft}
"""
Guidelines:
- If Day 3: Reiterate interest and ask if they need more info.
- If Day 6: Final polite bump, mentioning you're still highly interested.
- Tone: ${profile.tone || 'Professional'}
- Output ONLY the body of the email, starting with exactly "Dear Hiring Manager at ${job.company},". No subject, no sign-off, no markdown blocks.`;

      try {
        const resAI = await callAIWithRetry(prompt, 3, 2000);
        let draft = resAI.text.replace(/\`\`\`(?:html|json|markdown)?\s*([\s\S]*?)\`\`\`/g, '$1').trim();

        let formattedDraft = draft.replace(/\n/g, '<br/>');
        const baseUrl = process.env.PUBLIC_URL;
        const trackClick = (url) => (baseUrl && url) ? `${baseUrl}/api/track-click/${job.id}?url=${encodeURIComponent(url)}` : (url || '');
        const linkedInUrl = trackClick(profile.linkedin);
        const githubUrl = trackClick(profile.github);
        const trackingPixel = baseUrl ? `<img src="${baseUrl}/api/track-open/${job.id}" width="1" height="1" style="display:none;" />` : '';

        if (baseUrl) {
          const resumeLinkUrl = trackClick(`${baseUrl}/api/profile/resume-pdf?userId=${user._id}`);
          formattedDraft = formattedDraft.replace('You can view my CV here.', `<a href="${resumeLinkUrl}">You can view my CV here.</a>`);
        } else {
          formattedDraft = formattedDraft.replace('You can view my CV here.', 'I have attached my CV to this email for your reference.');
        }

        if (!job.followUps) job.followUps = [];
        job.followUps.push({
          draft,
          day: targetDay,
          sent: false
        });
        await job.save();
        draftedCount++;
      } catch (err) {
        console.error('[Manual Check] Failed to generate follow-up:', err);
      }
    }
    res.json({ success: true, draftedCount });
  } catch (err) {
    console.error('[Manual Check] Error:', err);
    res.status(500).json({ error: 'Failed to check follow-ups manually' });
  }
});

// Follow-Up Cron Job: Runs daily at 9:00 AM
cron.schedule('0 9 * * *', async () => {
  console.log('[Cron] Starting daily follow-up check...');
  try {
    const users = await User.find({ googleRefreshToken: { $exists: true, $ne: null } });

    for (const user of users) {
      const profile = await getProfile(user._id);
      if (!profile) continue;

      const jobs = await Job.find({
        userId: user._id,
        status: { $in: ['Sent', 'Opened'] }
      });

      for (const job of jobs) {
        if (!job.emailRecipient) continue;

        const daysSinceSent = Math.floor((Date.now() - new Date(job.sentAt || job.createdAt).getTime()) / (1000 * 60 * 60 * 24));
        const targetDay = daysSinceSent >= 6 ? 6 : daysSinceSent >= 3 ? 3 : 0;

        if (targetDay === 0) continue;

        // Check if already drafted/sent this follow-up
        const existingFollowUp = job.followUps && job.followUps.find(f => f.day === targetDay);
        if (existingFollowUp) continue;

        // Check if recruiter replied
        const hasReplied = await checkGmailForReply(user, job.emailRecipient);
        if (hasReplied) {
          job.status = 'Replied';
          await job.save();
          continue;
        }

        // Generate follow-up draft
        console.log(`[Cron] Generating Day ${targetDay} follow-up for ${job.company}`);
        const companyTarget = job.company && job.company.toLowerCase() !== 'unknown company' && job.company.toLowerCase() !== 'unknown' ? `at ${job.company}` : '';
        const prompt = `Write a short, polite, and confident Day ${targetDay} follow-up email to the hiring manager ${companyTarget} for the ${job.role} position.
Original Email Context:
"""
${job.emailDraft}
"""
Guidelines:
- If Day 3: Reiterate interest and ask if they need more info.
- If Day 6: Final polite bump, mentioning you're still highly interested.
- Tone: ${profile.tone || 'Professional'}
- Output ONLY the body of the email, starting with exactly "Dear Hiring Manager at ${job.company},". No subject, no sign-off, no markdown blocks.`;

        try {
          const res = await callAIWithRetry(prompt, 3, 2000);
          let draft = res.text.replace(/```(?:html|json|markdown)?\s*([\s\S]*?)```/g, '$1').trim();

          let formattedDraft = draft.replace(/\n/g, '<br/>');
          const baseUrl = process.env.PUBLIC_URL;
          const trackClick = (url) => (baseUrl && url) ? `${baseUrl}/api/track-click/${job.id}?url=${encodeURIComponent(url)}` : (url || '');
          const linkedInUrl = trackClick(profile.linkedin);
          const githubUrl = trackClick(profile.github);
          const trackingPixel = baseUrl ? `<img src="${baseUrl}/api/track-open/${job.id}" width="1" height="1" style="display:none;" />` : '';

          if (baseUrl) {
            const resumeLinkUrl = trackClick(`${baseUrl}/api/profile/resume-pdf?userId=${user._id}`);
            formattedDraft = formattedDraft.replace('You can view my CV here.', `<a href="${resumeLinkUrl}">You can view my CV here.</a>`);
          } else {
            formattedDraft = formattedDraft.replace('You can view my CV here.', 'I have attached my CV to this email for your reference.');
          }

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

          if (!job.followUps) job.followUps = [];
          job.followUps.push({
            draft,
            day: targetDay,
            sent: false
          });
          await job.save();
          console.log(`[Cron] Successfully drafted Day ${targetDay} follow-up for ${job.company}`);
        } catch (err) {
          console.error('[Cron] Failed to generate follow-up:', err);
        }
      }
    }
    console.log('[Cron] Follow-up check complete.');
  } catch (err) {
    console.error('[Cron] Error during follow-up check:', err);
  }
});

app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
});
