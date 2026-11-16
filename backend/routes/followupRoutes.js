const { resumeLink, trackingLink } = require('../utils/signedLinks');
const express = require('express');
const router = express.Router();
const Job = require('../models/Job');
const mongoose = require('mongoose');
const User = require('../models/User');
const Profile = require('../models/Profile');
const requireAuth = require('../middleware/requireAuth');
const { callAIWithRetry } = require('../utils/ai');
const {
  sendEmailViaAPI,
  checkGmailForReply,
  findThreadForRecipient,
  formatEmailTextToHtml,
  cleanDraftEmailText,
  stripSignOff,
  generateFollowUpEmail,
  getEffectivePortfolio,
  buildSignatureLinks,
  buildPlainTextSignature,
  extractPortfolioUrl
} = require('../utils/email');

async function getProfile(userId) {
  let profile = await Profile.findOne({ userId });
  if (!profile) {
    profile = new Profile({ userId });
    await profile.save();
  }
  if (profile && !profile.portfolio) {
    const eff = getEffectivePortfolio(profile);
    if (eff && !eff.includes('github.com/')) {
      profile.portfolio = eff;
      await Profile.updateOne({ _id: profile._id }, { $set: { portfolio: eff } }).catch(() => {});
    }
  }
  return profile;
}

router.post('/send-followup', requireAuth, async (req, res) => {
  const { jobId, day } = req.body;
  try {
    const job = await Job.findOne({ userId: req.user.id, isDeleted: { $ne: true }, $or: [{ id: jobId }, ...(mongoose.isObjectIdOrHexString(jobId) ? [{ _id: jobId }] : [])] });
    if (!job) return res.status(404).json({ error: 'Job not found' });

    const followUp = job.followUps.find(f => f.day === day);
    if (!followUp) return res.status(404).json({ error: 'Follow up not found' });

    if (followUp.sent) return res.status(409).json({ error: 'Follow-up already sent' });
    if (!['Sent', 'Opened'].includes(job.status)) return res.status(409).json({ error: 'This application is no longer eligible for follow-ups' });

    const user = await User.findById(req.user.id);
    const profile = await getProfile(req.user.id);

    if (user.googleRefreshToken && await checkGmailForReply(user, job.emailRecipient)) {
      job.status = 'Replied'; await job.save();
      return res.status(409).json({ error: 'The recruiter has replied. Follow-up stopped.' });
    }
    if (typeof req.body.draft === 'string' && req.body.draft.trim()) followUp.draft = req.body.draft.trim();
    const baseUrl = process.env.PUBLIC_URL;
    const trackClick = (url) => trackingLink(baseUrl, req.user.id, job.id, url);
    const trackingPixel = baseUrl ? `<img src="${trackingLink(baseUrl, req.user.id, job.id)}" width="1" height="1" style="display:none;" />` : '';

    const resumeLinkUrl = resumeLink(baseUrl, req.user.id);
    const cleanBody = stripSignOff(cleanDraftEmailText(followUp.draft, profile, job.company, job.role), profile);
    const formattedDraft = formatEmailTextToHtml(cleanBody, resumeLinkUrl);
    const linksHtml = buildSignatureLinks(profile, trackClick);

    const htmlBody = `
      <div style="font-family: Arial, sans-serif; font-size: 14px; color: #333; line-height: 1.6;">
        ${formattedDraft}
        <br/><br/>
        Best Regards,<br/>
        ${profile.name ? `<b>${profile.name}</b><br/>` : ''}
        ${profile.title ? `${profile.title}<br/>` : ''}
        ${profile.phone ? `📞 ${profile.phone}<br/>` : ''}
        ${linksHtml}
        <br/>
        ${trackingPixel}
      </div>
    `;

    const plainTextSignature = buildPlainTextSignature(profile);
    const fullPlainText = `${cleanBody}\n\n${plainTextSignature}`;

    if ((!job.matchedThreadId || !/^<[^<>\s]+@[^<>\s]+>$/.test(job.rfcMessageId || '')) && user.googleRefreshToken) {
      try {
        const threadInfo = await findThreadForRecipient(user, job.emailRecipient, { role: job.role, company: job.company });
        if (threadInfo) {
          if (!job.matchedThreadId && threadInfo.threadId) job.matchedThreadId = threadInfo.threadId;
          if (threadInfo.rfcMessageId) job.rfcMessageId = threadInfo.rfcMessageId;
                  if (threadInfo.subject) job.emailSubject = threadInfo.subject;
        }
      } catch (_) {}
    }

    if (!job.matchedThreadId || !/^<[^<>\s]+@[^<>\s]+>$/.test(job.rfcMessageId || '')) {
      return res.status(409).json({ error: 'Original email thread could not be recovered. Follow-up was not sent.' });
    }

    const mailOptions = {
      from: `"${profile.name}" <${user.email || process.env.EMAIL_USER}>`,
      to: job.emailRecipient,
      subject: `Re: ${job.emailSubject || `Application for ${job.role} - ${profile.name}`}`,
      text: fullPlainText,
      html: htmlBody,
      attachments: [],
      threadId: job.matchedThreadId || undefined,
      inReplyTo: job.rfcMessageId || undefined,
      references: job.rfcMessageId || undefined,
      messageId: `<${require('crypto').randomUUID()}@${(user.email || 'aijobfinder').split('@')[1] || 'aijobfinder.local'}>`
    };
    if (!baseUrl && profile.resumePdf) {
      mailOptions.attachments.push({ filename: profile.resumeFilename || 'resume.pdf', content: profile.resumePdf });
    }

    await sendEmailViaAPI(user, mailOptions, { jobId: job.id, kind: 'followup', idempotencyKey: `followup:${job._id}:${day}` });

    followUp.sent = true;
    await job.save();

    res.json({ success: true, message: 'Follow up sent!' });
  } catch (err) {
    console.error('Send Follow-up Error:', err);
    res.status(500).json({ error: 'Failed to send follow up' });
  }
});

router.post('/check-followups', requireAuth, async (req, res) => {
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
      isDeleted: { $ne: true },
      status: { $in: ['Sent', 'Opened'] }
    });

    let draftedCount = 0;

    for (const job of jobs) {
      if (!job.emailRecipient) continue;

      const daysSinceSent = Math.floor((Date.now() - new Date(job.sentAt || job.createdAt).getTime()) / (1000 * 60 * 60 * 24));
      const targetDay = require('../utils/safetyControls').controlsFor(user).followUpDays.filter(day => daysSinceSent >= day).at(-1) || 0;

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
      try {
        const draft = await generateFollowUpEmail({
          job,
          targetDay,
          profile,
          callAIWithRetry
        });

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

module.exports = router;
