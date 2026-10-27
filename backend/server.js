require('dotenv').config();
const dns = require('dns');
// Set reliable public DNS servers to prevent SRV lookup failures (ESERVFAIL) on local network resolvers
try {
  dns.setServers(['8.8.8.8', '1.1.1.1', '8.8.4.4', '1.0.0.1']);
} catch (e) { }

const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const cron = require('node-cron');
const { callAIWithRetry } = require('./utils/ai');
const { checkGmailForReply, findThreadForRecipient, processBounces, sendEmailViaAPI, formatEmailTextToHtml, cleanDraftEmailText, stripSignOff, generateFollowUpEmail, buildSignatureLinks, buildPlainTextSignature } = require('./utils/email');

// Import Models
const User = require('./models/User');
const Profile = require('./models/Profile');
const Job = require('./models/Job');

// Import Routes
const authRoutes = require('./routes/authRoutes');
const profileRoutes = require('./routes/profileRoutes');
const jobRoutes = require('./routes/jobRoutes');
const emailRoutes = require('./routes/emailRoutes');
const trackingRoutes = require('./routes/trackingRoutes');
const followupRoutes = require('./routes/followupRoutes');
const aiRoutes = require('./routes/aiRoutes');
const extensionRoutes = require('./routes/extensionRoutes');
const blocklistRoutes = require('./routes/blocklistRoutes');

const app = express();
const PORT = process.env.PORT || 5000;

// Security & Middleware (Permits Web App & Chrome Extension)
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (origin.startsWith('chrome-extension://') || origin.startsWith('moz-extension://')) {
      return callback(null, true);
    }
    const allowed = [process.env.PUBLIC_URL, process.env.FRONTEND_URL, 'http://localhost:5173', 'http://127.0.0.1:5173'].filter(Boolean);
    if (allowed.length === 0 || allowed.includes(origin) || origin.startsWith('http://localhost:')) {
      return callback(null, true);
    }
    return callback(null, true);
  },
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Connect to MongoDB with Auto-Retry
async function connectToMongo(retries = 5, delay = 2000) {
  if (!process.env.MONGO_URI) {
    console.error('❌ MONGO_URI is missing from .env! App will not work without it.');
    return;
  }

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await mongoose.connect(process.env.MONGO_URI, {
        serverSelectionTimeoutMS: 5000
      });
      console.log('✅ Connected to MongoDB Atlas');
      return;
    } catch (err) {
      console.warn(`[MongoDB] Connection attempt ${attempt}/${retries} failed (${err.code || err.message}). Retrying in ${delay / 1000}s...`);
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, delay));
      } else {
        console.error('❌ MongoDB Connection Error after multiple retries:', err.message);
      }
    }
  }
}

connectToMongo();

// Mount Routes
app.use('/api/auth', authRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api', emailRoutes); // discover-email, generate-email, send-email, single-draft, test-email
app.use('/api', trackingRoutes); // track-open, track-click
app.use('/api', followupRoutes); // send-followup, check-followups
app.use('/api/ai', aiRoutes); // usage, credits, quotas, metrics
app.use('/api/extension', extensionRoutes); // Extension profile, AI question answer, log job
app.use('/api/blocklist', blocklistRoutes);

// Keep-Alive Ping Endpoint
app.get('/api/ping', (req, res) => {
  res.status(200).send('pong');
});

// Google OAuth Verification Mandatory Compliance Pages: Privacy Policy & Terms of Service
const renderPolicyPage = (title, contentHtml) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title} - AI Job Finder</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #1f2937; max-width: 800px; margin: 40px auto; padding: 0 20px; background-color: #f9fafb; }
    .card { background: #ffffff; border-radius: 12px; padding: 36px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06); }
    h1 { color: #111827; font-size: 28px; margin-bottom: 8px; }
    h2 { color: #1f2937; font-size: 20px; margin-top: 24px; border-bottom: 1px solid #e5e7eb; padding-bottom: 8px; }
    p, li { font-size: 15px; color: #4b5563; }
    .disclosure { background: #eff6ff; border-left: 4px solid #3b82f6; padding: 16px; margin: 20px 0; border-radius: 4px; font-weight: 500; }
    a { color: #2563eb; text-decoration: none; }
    a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="card">
    ${contentHtml}
  </div>
</body>
</html>
`;

app.get(['/privacy', '/api/privacy'], (req, res) => {
  const content = `
    <h1>Privacy Policy</h1>
    <p><em>Last updated: October 2026</em></p>
    <p>AI Job Finder ("we", "our", or "us") values your privacy. This policy describes how we handle and protect your personal information when you use our job application and email automation services.</p>
    
    <h2>1. Information We Collect</h2>
    <ul>
      <li><strong>Account Details:</strong> Your name and email address provided during authentication.</li>
      <li><strong>Candidate Profile:</strong> Your resume, contact details, portfolio links, and technical skill summaries that you voluntarily upload to tailor your applications.</li>
      <li><strong>Google Account Data:</strong> When you connect your Google Account via OAuth, we access your email address and request permissions strictly to send job applications and monitor replies from hiring teams.</li>
    </ul>

    <h2>2. How We Use Your Data</h2>
    <p>We use your information exclusively to:</p>
    <ul>
      <li>Draft personalized, role-specific job application emails.</li>
      <li>Send outreach emails to verified hiring managers and HR teams directly from your email account upon your approval.</li>
      <li>Detect responses from recruiters to keep your application pipeline updated.</li>
    </ul>

    <div class="disclosure">
      <strong>Google API Limited Use Disclosure:</strong><br/>
      AI Job Finder's use and transfer to any other app of information received from Google APIs will adhere to the <a href="https://developers.google.com/terms/api-services-user-data-policy#additional_requirements_for_specific_api_scopes" target="_blank" rel="noopener">Google API Services User Data Policy</a>, including the Limited Use requirements.
    </div>

    <h2>3. Data Protection & Security</h2>
    <p>Your OAuth refresh tokens and profile data are stored securely with enterprise-grade encryption. We do not sell, rent, or share your personal data or email contents with any third-party advertisers or data brokers.</p>

    <h2>4. Data Deletion & Revocation</h2>
    <p>You can revoke access to your Google Account at any time through your <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener">Google Security Settings</a>. You may also request deletion of your account and profile data by contacting us.</p>
  `;
  res.send(renderPolicyPage('Privacy Policy', content));
});

app.get(['/terms', '/api/terms'], (req, res) => {
  const content = `
    <h1>Terms of Service</h1>
    <p><em>Last updated: October 2026</em></p>
    <p>By accessing or using AI Job Finder, you agree to comply with and be bound by these Terms of Service.</p>
    
    <h2>1. Permitted Use</h2>
    <p>AI Job Finder is provided to assist individuals with job search automation, personalized email drafting, and tracking legitimate job outreach. You agree not to use the service for unsolicited spam, bulk scraping, harassment, or any activity that violates Google's Acceptable Use Policy.</p>

    <h2>2. User Responsibility</h2>
    <p>You maintain full control and responsibility over all outreach sent through your connected email account. It is your responsibility to review application drafts and ensure their accuracy before dispatching.</p>

    <h2>3. Disclaimer of Warranties</h2>
    <p>The platform is provided on an "as is" and "as available" basis without warranties of any kind. We do not guarantee interview offers or employment outcomes.</p>

    <h2>4. Changes to Terms</h2>
    <p>We reserve the right to modify these terms at any time. Continued use of the platform constitutes acceptance of updated terms.</p>
  `;
  res.send(renderPolicyPage('Terms of Service', content));
});

// Follow-Up Cron Job: Runs daily at 11:00 AM IST
cron.schedule('0 11 * * *', async () => {
  console.log('[Cron] Starting daily follow-up check...');
  try {
    const users = await User.find({ googleRefreshToken: { $exists: true, $ne: null } });

    for (const user of users) {
      // Process incoming bounces for this user
      await processBounces(user);

      const profile = await Profile.findOne({ userId: user._id });
      if (!profile) continue;

      const jobs = await Job.find({
        userId: user._id,
        isDeleted: { $ne: true },
        status: { $in: ['Sent', 'Opened'] }
      });

      for (const job of jobs) {
        if (!job.emailRecipient) continue;

        const daysSinceSent = Math.floor((Date.now() - new Date(job.sentAt || job.createdAt).getTime()) / (1000 * 60 * 60 * 24));
        const targetDay = daysSinceSent >= 6 ? 6 : daysSinceSent >= 3 ? 3 : 0;

        if (targetDay === 0) continue;

        const existingFollowUp = job.followUps && job.followUps.find(f => f.day === targetDay);

        if (existingFollowUp && existingFollowUp.sent) {
          continue; // Already sent this day's follow-up
        }

        const hasReplied = await checkGmailForReply(user, job.emailRecipient);
        if (hasReplied) {
          job.status = 'Replied';
          await job.save();
          continue;
        }

        let draftToSend = '';

        if (existingFollowUp && !existingFollowUp.sent) {
          draftToSend = existingFollowUp.draft;
        } else {
          console.log(`[Cron] Generating Day ${targetDay} follow-up for ${job.company}`);
          try {
            const draft = await generateFollowUpEmail({
              job,
              targetDay,
              profile,
              callAIWithRetry
            });
            draftToSend = draft;

            if (!job.followUps) job.followUps = [];
            job.followUps.push({
              draft: draftToSend,
              day: targetDay,
              sent: false
            });
            await job.save(); // Save the draft first just in case sending fails
            console.log(`[Cron] Successfully drafted Day ${targetDay} follow-up for ${job.company}`);
          } catch (err) {
            console.error('[Cron] Failed to generate follow-up:', err);
            continue;
          }
        }

        // Send the email automatically ONLY if auto follow-up is enabled in user profile
        if (profile.enableAutoFollowUp === false) {
          console.log(`[Cron] Auto follow-up is OFF for ${user.email}. Saved Day ${targetDay} draft in database/memory for ${job.company}, skipping auto-send.`);
          continue;
        }

        if (draftToSend) {
          try {
            console.log(`[Cron] Sending Day ${targetDay} follow-up to ${job.emailRecipient}`);
            const cleanBody = stripSignOff(cleanDraftEmailText(draftToSend, profile, job.company, job.role), profile);
            const plainTextSignature = buildPlainTextSignature(profile);
            const fullPlainText = `${cleanBody}\n\n${plainTextSignature}`;
            const linksHtml = buildSignatureLinks(profile);
            const formattedDraft = formatEmailTextToHtml(cleanBody);
            const htmlBody = `
              <div style="font-family: Arial, sans-serif; font-size: 14px; color: #333; line-height: 1.6;">
                ${formattedDraft}
                <br/><br/>
                Best Regards,<br/>
                ${profile.name ? `<b>${profile.name}</b><br/>` : ''}
                ${profile.title ? `${profile.title}<br/>` : ''}
                ${profile.phone ? `📞 ${profile.phone}<br/>` : ''}
                ${linksHtml}
              </div>
            `;

            if ((!job.matchedThreadId || !job.rfcMessageId) && user.googleRefreshToken) {
              try {
                const threadInfo = await findThreadForRecipient(user, job.emailRecipient, { role: job.role, company: job.company });
                if (threadInfo) {
                  if (!job.matchedThreadId && threadInfo.threadId) job.matchedThreadId = threadInfo.threadId;
                  if (!job.rfcMessageId && threadInfo.rfcMessageId) job.rfcMessageId = threadInfo.rfcMessageId;
                }
              } catch (_) {}
            }

            const mailOptions = {
              from: user.email || process.env.EMAIL_USER,
              to: job.emailRecipient,
              subject: `Re: Application for ${job.role} - ${profile.name}`,
              text: fullPlainText,
              html: htmlBody,
              replyTo: user.email || process.env.EMAIL_USER,
              threadId: job.matchedThreadId || undefined,
              inReplyTo: job.rfcMessageId || job.messageId || undefined,
              references: job.rfcMessageId || job.messageId || undefined,
              messageId: `<${require('crypto').randomUUID()}@${(user.email || 'aijobfinder').split('@')[1] || 'aijobfinder.local'}>`
            };

            const sendRes = await sendEmailViaAPI(user, mailOptions);

            // Mark as sent
            const fUpIndex = job.followUps.findIndex(f => f.day === targetDay);
            if (fUpIndex !== -1) {
              job.followUps[fUpIndex].sent = true;
              job.followUps[fUpIndex].sentAt = new Date();
              job.followUps[fUpIndex].messageId = sendRes.messageId || null;
            }
            await job.save();
            console.log(`[Cron] Successfully SENT Day ${targetDay} follow-up for ${job.company}`);
          } catch (sendErr) {
            console.error('[Cron] Failed to send follow-up:', sendErr);
          }
        }
      }
    }
    console.log('[Cron] Follow-up check complete.');

    // Heartbeat ping to UptimeRobot
    if (process.env.UPTIMEROBOT_HEARTBEAT_URL) {
      const https = require('https');
      https.get(process.env.UPTIMEROBOT_HEARTBEAT_URL, (res) => {
        console.log(`[Cron] Heartbeat sent to UptimeRobot (Status: ${res.statusCode})`);
      }).on('error', (err) => {
        console.error('[Cron] Failed to send heartbeat:', err.message);
      });
    }
  } catch (err) {
    console.error('[Cron] Error during follow-up check:', err);
  }
}, {
  scheduled: true,
  timezone: "Asia/Kolkata"
});

app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
});
