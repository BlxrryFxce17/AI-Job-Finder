const { google } = require('googleapis');
const MailComposer = require('nodemailer/lib/mail-composer');
const nodemailer = require('nodemailer');
const axios = require('axios');

async function sendEmailViaAPI(user, mailOptions) {
  const userEmail = user.email || process.env.EMAIL_USER;

  if (user.googleRefreshToken) {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );
    oauth2Client.setCredentials({ refresh_token: user.googleRefreshToken });
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    const mail = new MailComposer(mailOptions);
    const messageBuffer = await mail.compile().build();

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
    console.warn('[Warning] No Google Refresh Token found. Falling back to SMTP which may be blocked on Render Free Tier.');
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: userEmail, pass: process.env.EMAIL_PASS }
    });
    return await transporter.sendMail(mailOptions);
  }
}

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

async function discoverEmailForJob(company, domain, jd, failedEmails = [], callAIWithRetry, hrName = null) {
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

  // Tier 1.2: Deep Web Search for HR's explicit email
  if (!discoveredEmail && hrName && process.env.SERPER_API_KEY) {
    try {
      const q = `"${hrName}" "${company}" email`;
      const sRes = await axios.post('https://google.serper.dev/search', {
        q, num: 3
      }, {
        headers: { 'X-API-KEY': process.env.SERPER_API_KEY, 'Content-Type': 'application/json' }
      });
      const snippets = sRes.data?.organic?.map(r => r.snippet).join(' ') || '';
      const emailRegex = /[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}/g;
      const foundEmails = snippets.match(emailRegex);
      if (foundEmails && foundEmails.length > 0) {
        const validEmails = foundEmails.filter(e => !e.includes('example.com') && !e.includes('email.com') && !failedEmails.includes(e));
        if (validEmails.length > 0) {
          const prompt = `You are an AI Email Judge. We searched for the email of "${hrName}" at "${company}". Extracted emails: ${validEmails.join(', ')}. Which ONE is most likely their real email? Ignore generic support emails or completely unrelated domains unless it looks like an agency. Return ONLY the email address, or "NONE".`;
          const response = await callAIWithRetry(prompt);
          const aiJudgment = response.text.trim();
          const emailMatch = aiJudgment.match(/[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}/);
          if (emailMatch) {
            discoveredEmail = emailMatch[0];
            source = 'Tier 1.2 (Deep Web Search HR Name + AI)';
          }
        }
      }
    } catch(err) {}
  }

  // Tier 1.5: HR Name Permutations
  if (!discoveredEmail && hrName) {
    const parts = hrName.toLowerCase().replace(/[^a-z0-9 ]/g, '').split(' ').filter(Boolean);
    if (parts.length >= 2) {
      const first = parts[0];
      const last = parts[parts.length - 1];
      const guesses = [
        `${first}.${last}@${domain}`,
        `${first}${last}@${domain}`,
        `${first[0]}${last}@${domain}`,
        `${first}@${domain}`
      ];
      for (const guess of guesses) {
        if (!failedEmails.includes(guess)) {
          discoveredEmail = guess;
          source = 'Tier 1.5 (HR Name Permutation)';
          break;
        }
      }
    } else if (parts.length === 1) {
      const guess = `${parts[0]}@${domain}`;
      if (!failedEmails.includes(guess)) {
        discoveredEmail = guess;
        source = 'Tier 1.5 (HR Name Guess)';
      }
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

module.exports = { sendEmailViaAPI, checkGmailForReply, discoverEmailForJob };
