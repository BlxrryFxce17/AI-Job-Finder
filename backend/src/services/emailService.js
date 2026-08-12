const { google } = require('googleapis');
const nodemailer = require('nodemailer');
const MailComposer = require('nodemailer/lib/mail-composer');
const config = require('../config');
const logger = require('../utils/logger');

/**
 * Send email using Gmail API (preferred) or SMTP fallback
 */
async function sendEmailViaAPI(user, mailOptions) {
  const userEmail = user.email || config.emailUser;

  if (user.googleRefreshToken) {
    // Use Gmail API (works on Render - uses HTTPS port 443)
    logger.debug('[Email] Sending via Gmail API');
    const oauth2Client = new google.auth.OAuth2(config.googleClientId, config.googleClientSecret);
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
      requestBody: { raw: encodedMessage },
    });
    return { messageId: res.data.id };
  } else {
    // Fallback to SMTP (may be blocked on Render Free tier)
    logger.warn(
      '[Email] No Google Refresh Token. Falling back to SMTP which may be blocked on Render Free Tier.'
    );
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: userEmail, pass: config.emailPass },
    });
    return await transporter.sendMail(mailOptions);
  }
}

/**
 * Build tracked HTML email body
 */
function buildTrackedHtmlBody({ draftText, profile, jobId, baseUrl, recipientEmail }) {
  const trackClick = url =>
    baseUrl && url
      ? `${baseUrl}/api/track-click/${jobId}?url=${encodeURIComponent(url)}`
      : url || '';

  const trackingPixel = baseUrl
    ? `<img src="${baseUrl}/api/track-open/${jobId}" width="1" height="1" style="display:none;" />`
    : '';

  let formattedDraft = draftText.replace(/\n/g, '<br/>');

  if (baseUrl) {
    const resumeLinkUrl = trackClick(`${baseUrl}/api/profile/resume-pdf?userId=${profile.userId}`);
    formattedDraft = formattedDraft.replace(
      'You can view my CV here.',
      `<a href="${resumeLinkUrl}">You can view my CV here.</a>`
    );
  } else {
    formattedDraft = formattedDraft.replace(
      'You can view my CV here.',
      'I have attached my CV to this email for your reference.'
    );
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

  return htmlBody;
}

/**
 * Create mail options for job application
 */
function createJobMailOptions({ from, to, subject, htmlBody, profile, baseUrl }) {
  const mailOptions = {
    from,
    to,
    subject,
    html: htmlBody,
    attachments: [],
  };

  // Attach resume if no tracking URL available
  if (!baseUrl && profile.resumePdf) {
    mailOptions.attachments.push({
      filename: profile.resumeFilename || 'resume.pdf',
      content: profile.resumePdf,
    });
  }

  return mailOptions;
}

/**
 * Create mail options for follow-up
 */
function createFollowupMailOptions({ from, to, subject, draft, profile, jobId, baseUrl }) {
  const trackClick = url =>
    baseUrl && url
      ? `${baseUrl}/api/track-click/${jobId}?url=${encodeURIComponent(url)}`
      : url || '';

  const trackingPixel = baseUrl
    ? `<img src="${baseUrl}/api/track-open/${jobId}" width="1" height="1" style="display:none;" />`
    : '';

  let formattedDraft = draft.replace(/\n/g, '<br/>');

  if (baseUrl) {
    const resumeLinkUrl = trackClick(`${baseUrl}/api/profile/resume-pdf?userId=${profile.userId}`);
    formattedDraft = formattedDraft.replace(
      'You can view my CV here.',
      `<a href="${resumeLinkUrl}">You can view my CV here.</a>`
    );
  } else {
    formattedDraft = formattedDraft.replace(
      'You can view my CV here.',
      'I have attached my CV to this email for your reference.'
    );
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
    from,
    to,
    subject,
    html: htmlBody,
    attachments: [],
  };

  if (!baseUrl && profile.resumePdf) {
    mailOptions.attachments.push({
      filename: profile.resumeFilename || 'resume.pdf',
      content: profile.resumePdf,
    });
  }

  return mailOptions;
}

module.exports = {
  sendEmailViaAPI,
  buildTrackedHtmlBody,
  createJobMailOptions,
  createFollowupMailOptions,
};
