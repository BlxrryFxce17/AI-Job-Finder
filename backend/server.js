require('dotenv').config();
const dns = require('dns');
// Set reliable public DNS servers to prevent SRV lookup failures (ESERVFAIL) on local network resolvers
try {
  dns.setServers(['8.8.8.8', '1.1.1.1', '8.8.4.4', '1.0.0.1']);
} catch (e) {}

const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const cron = require('node-cron');
const { callAIWithRetry } = require('./utils/ai');
const { checkGmailForReply, sendEmailViaAPI, formatEmailTextToHtml, cleanDraftEmailText, stripSignOff, generateFollowUpEmail, buildSignatureLinks, buildPlainTextSignature } = require('./utils/email');

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

// Keep-Alive Ping Endpoint
app.get('/api/ping', (req, res) => {
  res.status(200).send('pong');
});

// Follow-Up Cron Job: Runs daily at 9:00 AM
cron.schedule('0 9 * * *', async () => {
  console.log('[Cron] Starting daily follow-up check...');
  try {
    const users = await User.find({ googleRefreshToken: { $exists: true, $ne: null } });

    for (const user of users) {
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
                Yours Sincerely,<br/>
                <b>${profile.name}</b><br/>
                ${profile.title}<br/>
                ${profile.phone ? `📞 ${profile.phone}<br/>` : ''}
                ${linksHtml}
              </div>
            `;
            const mailOptions = {
              from: user.email || process.env.EMAIL_USER,
              to: job.emailRecipient,
              subject: `Re: Application for ${job.role} - ${profile.name}`,
              text: fullPlainText,
              html: htmlBody,
              replyTo: user.email || process.env.EMAIL_USER,
              inReplyTo: job.messageId || undefined,
              references: job.messageId ? [job.messageId] : undefined
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
});

app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
});
