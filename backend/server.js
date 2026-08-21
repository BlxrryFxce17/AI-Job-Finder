require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const cron = require('node-cron');
const { callAIWithRetry } = require('./utils/ai');
const { checkGmailForReply } = require('./utils/email');

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

const app = express();
const PORT = process.env.PORT || 5000;

// Security & Middleware
app.use(cors({
  origin: [process.env.PUBLIC_URL, 'http://localhost:5173'].filter(Boolean)
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Connect to MongoDB
if (process.env.MONGO_URI) {
  mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('✅ Connected to MongoDB Atlas'))
    .catch(err => console.error('❌ MongoDB Connection Error:', err));
} else {
  console.error('❌ MONGO_URI is missing from .env! App will not work without it.');
}

// Mount Routes
app.use('/api/auth', authRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api', emailRoutes); // discover-email, generate-email, send-email, single-draft, test-email
app.use('/api', trackingRoutes); // track-open, track-click
app.use('/api', followupRoutes); // send-followup, check-followups

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
        status: { $in: ['Sent', 'Opened'] }
      });

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
          const resAI = await callAIWithRetry(prompt, 3, 2000);
          let draft = resAI.text.replace(/```(?:html|json|markdown)?\s*([\s\S]*?)```/g, '$1').trim();

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
