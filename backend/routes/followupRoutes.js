const express = require('express');
const router = express.Router();
const Job = require('../models/Job');
const User = require('../models/User');
const Profile = require('../models/Profile');
const requireAuth = require('../middleware/requireAuth');
const { callAIWithRetry } = require('../utils/ai');
const { sendEmailViaAPI, checkGmailForReply } = require('../utils/email');

async function getProfile(userId) {
  let profile = await Profile.findOne({ userId });
  if (!profile) {
    profile = new Profile({ userId });
    await profile.save();
  }
  return profile;
}

router.post('/send-followup', requireAuth, async (req, res) => {
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
