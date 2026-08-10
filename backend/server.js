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

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Initialize AI Engines
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const gemini = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

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
  failedEmails: { type: [String], default: [] }
}, { timestamps: true });

const Job = mongoose.model('Job', jobSchema);

const callAIWithRetry = async (prompt, retries = 5, delayMs = 3000) => {
  for (let i = 0; i < retries; i++) {
    try {
      // 1. Primary: Gemini 2.5 Flash
      const response = await gemini.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
      });
      return { text: response.text };
    } catch (geminiErr) {
      if (geminiErr.status === 429 || geminiErr.status >= 500) {
        console.warn(`[Gemini API] Failed (${geminiErr.status}). Falling back to Groq Llama-3...`);
        try {
          // 2. Fallback: Groq Llama-3-70b
          const completion = await groq.chat.completions.create({
            messages: [{ role: 'user', content: prompt }],
            model: 'llama-3.1-8b-instant',
          });
          return { text: completion.choices[0]?.message?.content || '' };
        } catch (groqErr) {
          if (groqErr.status === 429 && i < retries - 1) {
            console.warn(`[Groq API] Rate Limit. Both AIs exhausted. Waiting ${delayMs/1000}s... (Attempt ${i+1}/${retries})`);
            await new Promise(res => setTimeout(res, delayMs));
            delayMs += 3000;
          } else {
            throw groqErr; // Total failure
          }
        }
      } else {
        throw geminiErr; // Non-retryable error
      }
    }
  }
};

let parsedResume = '';
const RESUME_PATH = path.join(__dirname, '../Akash_V_Resume.pdf');

// Parse PDF on startup
if (fs.existsSync(RESUME_PATH)) {
  const dataBuffer = fs.readFileSync(RESUME_PATH);
  pdfParse(dataBuffer).then(function(data) {
    parsedResume = data.text;
    console.log('Successfully parsed resume for AI context.');
  }).catch(err => console.error('Failed to parse resume PDF:', err));
} else {
  console.log('Resume PDF not found at', RESUME_PATH);
}

// Endpoints

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
  const { status, emailRecipient, emailDraft } = req.body;

  try {
    const job = await Job.findOne({ id });
    if (!job) return res.status(404).json({ error: 'Job not found' });

    if (status) job.status = status;
    if (emailRecipient) job.emailRecipient = emailRecipient;
    if (emailDraft) job.emailDraft = emailDraft;
    
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
  const what = req.body.query || 'junior software developer, fresher software engineer, entry level developer';

  if (!process.env.ADZUNA_APP_ID || !process.env.ADZUNA_APP_KEY) {
    return res.status(500).json({ error: 'ADZUNA_APP_ID or ADZUNA_APP_KEY is not set in backend .env' });
  }

  try {
    const url = `https://api.adzuna.com/v1/api/jobs/in/search/1?app_id=${process.env.ADZUNA_APP_ID}&app_key=${process.env.ADZUNA_APP_KEY}&what=${encodeURIComponent(what)}&results_per_page=20`;
    const response = await axios.get(url);
    const apiJobs = response.data.results || [];

    let addedCount = 0;
    
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
        addedCount++;
      }
    }

    res.json({ message: `Fetched and added ${addedCount} new jobs.` });
  } catch (error) {
    console.error('Error fetching jobs from Adzuna:', error.response ? error.response.data : error.message);
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
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    return res.status(500).json({ error: 'Email credentials not configured' });
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
    const fetchOptions = { bodies: [''], markSeen: true };    const messages = await connection.search(searchCriteria, fetchOptions);
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
              const transporter = nodemailer.createTransport({
                service: 'gmail',
                auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
              });

              const baseUrl = process.env.PUBLIC_URL || `http://localhost:${PORT}`;
              const trackClick = (url) => `${baseUrl}/api/track-click/${job.id}?url=${encodeURIComponent(url)}`;
              
              const htmlBody = `
                <div style="font-family: Arial, sans-serif; font-size: 14px; color: #333; line-height: 1.6;">
                  ${job.emailDraft.replace(/\n/g, '<br/>')}
                  <br/><br/>
                  <b>Akash V</b><br/>
                  Software Developer<br/>
                  📞 +91-8073765631<br/>
                  🔗 <a href="${trackClick('https://linkedin.com/in/akashv10/')}">LinkedIn</a> | 💻 <a href="${trackClick('https://github.com/BlxrryFxce17')}">GitHub</a>
                  <br/>
                  <img src="${baseUrl}/api/track-open/${job.id}" width="1" height="1" style="display:none;" />
                </div>
              `;

              const mailOptions = {
                from: process.env.EMAIL_USER,
                to: newEmail,
                subject: `Application for ${job.role}`,
                html: htmlBody,
                attachments: []
              };
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

app.post('/api/generate-email', async (req, res) => {
  const { company, role, type, jd } = req.body;

  if (!process.env.GEMINI_API_KEY) {
    return res.status(500).json({ error: 'GEMINI_API_KEY is not set in backend .env' });
  }

  try {
    const prompt = `You are an elite, highly persuasive software engineer ("Akash V") writing a cold email to the hiring manager at ${company} for the "${role}" position. 
Context: ${type}
Here is the official Job Description:
"""
${jd || 'Not provided'}
"""
Here is Akash's Resume:
"""
${parsedResume || 'No resume available'}
"""

INSTRUCTIONS FOR THE EMAIL DRAFT:
1. DEEP JD ANALYSIS: Internally identify the top 2-3 most critical technical requirements mentioned in the Job Description. DO NOT OUTPUT THIS ANALYSIS in your response.
2. VALUE MAPPING: Explicitly map those exact JD requirements to specific, quantifiable achievements from Akash's resume. DO NOT OUTPUT THIS MAPPING process in your response.
3. TONE & STRUCTURE: Keep it concise, confident, and highly impressive. Do not use generic filler (e.g., "I hope this email finds you well"). Start with a strong hook, deliver the value proposition (the mapped skills), and end with a soft call to action.
4. THE FLEX: ALWAYS include this exact postscript right before the sign-off: "P.S. I'm highly passionate about automation and software engineering—in fact, I built the AI web-scraper and autonomous agent that found this job and drafted this email!"
5. OUTPUT STRICTLY the final email content (body only, no signature, no name). No conversational filler, no internal thoughts, no analysis, and NO MARKDOWN BLOCKS (like \`\`\`email).
6. CRITICAL: DO NOT start your response with "Here is the email..." or "Subject:...". Start IMMEDIATELY with the very first word of the email body.`;

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

  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    return res.status(500).json({ error: 'Email credentials not configured in backend .env' });
  }

  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });

    const baseUrl = process.env.PUBLIC_URL || `http://localhost:${PORT}`;
    
    // Generate Tracked Links
    const trackClick = (url) => `${baseUrl}/api/track-click/${jobId}?url=${encodeURIComponent(url)}`;
    const linkedInUrl = trackClick('https://linkedin.com/in/akashv10/');
    const githubUrl = trackClick('https://github.com/BlxrryFxce17');
    
    // Create HTML Body
    const htmlBody = `
      <div style="font-family: Arial, sans-serif; font-size: 14px; color: #333; line-height: 1.6;">
        ${body.replace(/\n/g, '<br/>')}
        <br/><br/>
        <b>Akash V</b><br/>
        Software Developer<br/>
        📞 +91-8073765631<br/>
        🔗 <a href="${linkedInUrl}">LinkedIn</a> | 💻 <a href="${githubUrl}">GitHub</a>
        <br/>
        <img src="${baseUrl}/api/track-open/${jobId}" width="1" height="1" style="display:none;" />
      </div>
    `;

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to,
      subject: subject || 'Job Application',
      html: htmlBody,
      attachments: []
    };

    if (fs.existsSync(RESUME_PATH)) {
      mailOptions.attachments.push({
        filename: 'Akash_V_Resume.pdf',
        path: RESUME_PATH
      });
    }

    const info = await transporter.sendMail(mailOptions);
    res.json({ message: 'Email sent successfully!', messageId: info.messageId });
  } catch (error) {
    console.error('Error sending email:', error);
    res.status(500).json({ error: 'Failed to send email. Check credentials.' });
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
  } catch (err) {}

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
      await job.save();
      console.log(`[Tracking] Link clicked for job: ${job.company} -> ${url}`);
    }
  } catch (err) {}

  res.redirect(url || 'https://linkedin.com/in/akashv10/');
});

app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
});
