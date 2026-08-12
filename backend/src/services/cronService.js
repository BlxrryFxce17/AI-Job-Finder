const cron = require('node-cron');
const { google } = require('googleapis');
const Job = require('../models/Job');
const Profile = require('../models/Profile');
const User = require('../models/User');
const { callAIWithRetry } = require('./aiService');
const { sendEmailViaAPI, createFollowupMailOptions } = require('./emailService');
const config = require('../config');
const logger = require('../utils/logger');

/**
 * Check Gmail for reply from a specific recipient
 */
async function checkGmailForReply(user, recipientEmail) {
  if (!user.googleRefreshToken) {
    return false;
  }

  try {
    const oauth2Client = new google.auth.OAuth2(config.googleClientId, config.googleClientSecret);
    oauth2Client.setCredentials({ refresh_token: user.googleRefreshToken });
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    const res = await gmail.users.messages.list({
      userId: 'me',
      q: `from:${recipientEmail} to:me`,
      maxResults: 1,
    });

    return res.data.messages && res.data.messages.length > 0;
  } catch (err) {
    logger.error('[Cron] Error checking Gmail for reply', { error: err.message });
    return false;
  }
}

/**
 * Initialize follow-up cron job - runs daily at 9:00 AM
 */
function initFollowupCron() {
  // Schedule: '0 9 * * *' = daily at 9:00 AM
  cron.schedule('0 9 * * *', async () => {
    logger.info('[Cron] Starting daily follow-up check...');
    try {
      const users = await User.find({ googleRefreshToken: { $exists: true, $ne: null } });

      for (const user of users) {
        const profile = await Profile.findOne({ userId: user._id });
        if (!profile) {
          continue;
        }

        const jobs = await Job.find({
          userId: user._id,
          status: { $in: ['Sent', 'Opened'] },
        });

        for (const job of jobs) {
          if (!job.emailRecipient) {
            continue;
          }

          const daysSinceSent = Math.floor(
            (Date.now() - new Date(job.updatedAt).getTime()) / (1000 * 60 * 60 * 24)
          );

          // Determine which follow-up day to send (Day 3 or Day 6)
          let targetDay = 0;
          if (daysSinceSent >= 6) {
            targetDay = 6;
          } else if (daysSinceSent >= 3) {
            targetDay = 3;
          }

          if (targetDay === 0) {
            continue;
          }

          // Check if already drafted/sent this follow-up
          const existingFollowUp = job.followUps && job.followUps.find(f => f.day === targetDay);
          if (existingFollowUp) {
            continue;
          }

          // Check if recruiter replied
          const hasReplied = await checkGmailForReply(user, job.emailRecipient);
          if (hasReplied) {
            job.status = 'Replied';
            await job.save();
            logger.info('[Cron] Recruiter replied, marking as Replied', { company: job.company });
            continue;
          }

          // Generate follow-up draft
          logger.info('[Cron] Generating follow-up', { company: job.company, day: targetDay });

          const prompt = `Write a short, polite, and confident Day ${targetDay} follow-up email to the hiring manager at ${job.company} for the ${job.role} position.
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
            const draft = res.text
              .replace(/```(?:html|json|markdown)?\s*([\s\S]*?)```/g, '$1')
              .trim();

            const mailOptions = createFollowupMailOptions({
              from: user.email || config.emailUser,
              to: job.emailRecipient,
              subject: `Follow-up: Application for ${job.role} - ${profile.name}`,
              draft,
              profile: { ...profile.toObject(), userId: user._id },
              jobId: job.id,
              baseUrl: config.publicUrl,
            });

            await sendEmailViaAPI(user, mailOptions);

            if (!job.followUps) {
              job.followUps = [];
            }
            job.followUps.push({
              draft,
              day: targetDay,
              sent: true,
            });
            await job.save();

            logger.info('[Cron] Successfully sent follow-up', {
              company: job.company,
              day: targetDay,
            });
          } catch (err) {
            logger.error('[Cron] Failed to generate/send follow-up', {
              error: err.message,
              company: job.company,
            });
          }
        }
      }
      logger.info('[Cron] Follow-up check complete.');
    } catch (err) {
      logger.error('[Cron] Error during follow-up check', { error: err.message });
    }
  });

  logger.info('[Cron] Follow-up cron job initialized (runs daily at 9:00 AM)');
}

module.exports = {
  initFollowupCron,
  checkGmailForReply,
};
