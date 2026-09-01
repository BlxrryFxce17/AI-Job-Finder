const { google } = require('googleapis');
const MailComposer = require('nodemailer/lib/mail-composer');
const nodemailer = require('nodemailer');
const axios = require('axios');
const { verifyEmail, checkMxRecords, validateEmailSyntax, verifyWithHunter, isGenericEmail } = require('./verifier');
const { 
  getLearnedMemory, 
  learnFromVerifiedEmail, 
  learnDeadDomain, 
  generateEmailWithPattern 
} = require('./learningEngine');

async function sendEmailViaAPI(user, mailOptions) {
  const recipient = (mailOptions.to || '').trim();
  
  // Pre-send safety check to protect sender domain reputation
  const verification = await verifyEmail(recipient);
  if (!verification.isValid) {
    throw new Error(`Email send aborted: ${recipient} failed verification (${verification.reason || 'Invalid or non-deliverable mailbox'})`);
  }

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
        threadId: mailOptions.threadId || undefined
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

async function getInboxReplies(user, hrEmails) {
  if (!user.googleRefreshToken || !hrEmails || hrEmails.length === 0) return [];

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  oauth2Client.setCredentials({ refresh_token: user.googleRefreshToken });
  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

  try {
    // Batch HR emails into chunks of 15 to prevent Gmail API 400 Bad Request (URL length limits)
    const validHrEmails = hrEmails.filter(Boolean);
    const chunkSize = 15;
    let allMessageSummaries = [];

    for (let i = 0; i < validHrEmails.length; i += chunkSize) {
      const chunk = validHrEmails.slice(i, i + chunkSize);
      const fromQuery = chunk.map(email => `from:${email.trim()}`).join(' OR ');
      const query = `to:me (${fromQuery})`;

      try {
        const res = await gmail.users.messages.list({
          userId: 'me',
          q: query,
          maxResults: 15
        });
        if (res.data.messages && res.data.messages.length > 0) {
          allMessageSummaries.push(...res.data.messages);
        }
      } catch (chunkErr) {
        console.warn('[Gmail Inbox Check] Warning in chunk search:', chunkErr.message);
      }
    }

    if (allMessageSummaries.length === 0) return [];

    // Deduplicate messages by id
    const uniqueMsgIds = new Set();
    const uniqueMessages = allMessageSummaries.filter(m => {
      if (uniqueMsgIds.has(m.id)) return false;
      uniqueMsgIds.add(m.id);
      return true;
    });

    const replies = [];
    for (const msg of uniqueMessages.slice(0, 20)) {
      const msgData = await gmail.users.messages.get({
        userId: 'me',
        id: msg.id,
        format: 'full'
      });
      
      const payload = msgData.data.payload;
      const headers = payload.headers;
      
      const autoSubmitted = headers.find(h => h.name.toLowerCase() === 'auto-submitted')?.value || '';
      if (autoSubmitted && autoSubmitted.toLowerCase() !== 'no') {
        continue;
      }

      const subject = headers.find(h => h.name.toLowerCase() === 'subject')?.value || 'No Subject';
      const from = headers.find(h => h.name.toLowerCase() === 'from')?.value || '';
      const date = headers.find(h => h.name.toLowerCase() === 'date')?.value || '';
      
      let snippet = msgData.data.snippet;
      let bodyText = '';
      
      if (payload.parts) {
        const textPart = payload.parts.find(p => p.mimeType === 'text/plain');
        if (textPart && textPart.body && textPart.body.data) {
           bodyText = Buffer.from(textPart.body.data, 'base64').toString('utf8');
        }
      } else if (payload.body && payload.body.data) {
        bodyText = Buffer.from(payload.body.data, 'base64').toString('utf8');
      }

      const emailMatch = from.match(/<([^>]+)>/);
      const rawFromEmail = emailMatch ? emailMatch[1] : from;
      
      if (/no-?reply|donotreply|bounce/i.test(rawFromEmail)) {
        continue;
      }

      // Fetch full thread to get all messages (sent & received)
      const threadData = await gmail.users.threads.get({
        userId: 'me',
        id: msg.threadId,
        format: 'full'
      });
      
      const threadMessages = [];
      if (threadData.data && threadData.data.messages) {
        for (const tMsg of threadData.data.messages) {
           const tPayload = tMsg.payload;
           const tHeaders = tPayload.headers;
           const tFrom = tHeaders.find(h => h.name.toLowerCase() === 'from')?.value || '';
           const tDate = tHeaders.find(h => h.name.toLowerCase() === 'date')?.value || '';
           let tBody = tMsg.snippet;
           if (tPayload.parts) {
             const tp = tPayload.parts.find(p => p.mimeType === 'text/plain');
             if (tp && tp.body && tp.body.data) tBody = Buffer.from(tp.body.data, 'base64').toString('utf8');
           } else if (tPayload.body && tPayload.body.data) {
             tBody = Buffer.from(tPayload.body.data, 'base64').toString('utf8');
           }
           threadMessages.push({
             id: tMsg.id,
             from: tFrom,
             date: tDate,
             body: tBody || tMsg.snippet,
             isMe: tFrom.includes(user.email || 'me') // Basic check for sent messages
           });
        }
      }

      replies.push({
        messageId: msg.id,
        threadId: msg.threadId,
        from: rawFromEmail,
        fromFull: from,
        subject,
        date,
        snippet,
        body: bodyText || snippet,
        threadMessages
      });
    }

    return replies;
  } catch (err) {
    console.error('Error fetching inbox replies:', err);
    return [];
  }
}

async function discoverEmailForJob(company, domain, jd, failedEmails = [], callAIWithRetry, hrName = null, hrLinkedInUrl = null) {
  let discoveredEmail = null;
  let source = '';
  let verificationInfo = null;

  let cleanDomain = (domain || '').toLowerCase().trim();

  // Dynamic Learning Engine: Check learned company memory first
  const learnedMemory = await getLearnedMemory(company);
  if (learnedMemory) {
    if (learnedMemory.verifiedDomain && (!cleanDomain || cleanDomain.includes('unknown'))) {
      cleanDomain = learnedMemory.verifiedDomain;
    }
    // If domain is already known dead, abort early
    if (learnedMemory.deadDomains && learnedMemory.deadDomains.includes(cleanDomain)) {
      console.log(`[Email Discovery] ${company} (${cleanDomain}) -> NONE (Known Dead Domain from Memory)`);
      return { email: null, source: 'Blacklisted Dead Domain (Memory)' };
    }
  }

  const domainMx = await checkMxRecords(cleanDomain);
  if (!domainMx.valid) {
    await learnDeadDomain(company, cleanDomain);
  }

  // Helper to test and accept candidate email
  async function testCandidate(candidate, sourceName) {
    if (!candidate || failedEmails.includes(candidate)) return false;
    
    // Strict Real-Person Filter: Block generic / shared inboxes (careers@, jobs@, info@, recruiting@, etc.)
    if (isGenericEmail(candidate)) {
      console.log(`[Email Rejected] Discarded generic bot inbox "${candidate}" (Looking for real person only)`);
      return false;
    }

    const result = await verifyEmail(candidate);
    if (result.isValid) {
      discoveredEmail = candidate;
      source = `${sourceName} [Verified]`;
      verificationInfo = result;
      return true;
    }
    console.log(`[Email Rejected] Candidate ${candidate} failed verification: ${result.reason || result.status}`);
    return false;
  }

  // Tier 0: Dynamic Learned Pattern (Instant High-Confidence Hit on Real HR Name)
  if (!discoveredEmail && hrName && domainMx.valid && learnedMemory?.learnedPattern && learnedMemory?.patternConfidence >= 50) {
    const memoryEmail = generateEmailWithPattern(hrName, cleanDomain, learnedMemory.learnedPattern);
    if (memoryEmail) {
      await testCandidate(memoryEmail, `Tier 0 (Learned Memory: ${learnedMemory.learnedPattern})`);
    }
  }

  // Tier 1: JD Scraper + AI Judge (Real Person Only)
  if (!discoveredEmail && jd && jd.length > 0) {
    const emailRegex = /[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}/g;
    const foundEmails = jd.match(emailRegex);
    if (foundEmails && foundEmails.length > 0) {
      const nonGenericFound = foundEmails.filter(e => !isGenericEmail(e));
      if (nonGenericFound.length > 0) {
        try {
          const prompt = `You are an AI Email Judge. Extracted emails: ${nonGenericFound.join(', ')}. Which ONE is an actual real human Recruiter, HR or Hiring Manager? Strictly ignore generic company inboxes (careers@, jobs@, info@, contact@). Return ONLY the real person's email, or "NONE".`;
          const response = await callAIWithRetry(prompt);
          const aiJudgment = response.text.trim();
          const emailMatch = aiJudgment.match(/[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}/);
          if (emailMatch && !isGenericEmail(emailMatch[0])) {
            await testCandidate(emailMatch[0], 'Tier 1 (JD Scraper + AI)');
          }
        } catch (err) { }
      }
    }
  }

  // Tier 1.2: Advanced Deep Web Search (OSINT & LinkedIn Contact Info)
  if (!discoveredEmail && hrName && process.env.SERPER_API_KEY) {
    try {
      const linkedInSlug = hrLinkedInUrl ? hrLinkedInUrl.split('/in/')[1]?.split('/')[0]?.split('?')[0] : '';
      const queries = [
        `"${hrName}" "contact info" "email"`,
        `"${hrName}" "${company}" ("@${cleanDomain}" OR "@gmail.com" OR "email")`,
        `"${hrName}" "HR" OR "Recruiter" "email" ("@${cleanDomain}" OR "@gmail.com")`,
        linkedInSlug ? `"${linkedInSlug}" ("@${cleanDomain}" OR "@gmail.com" OR "email")` : null,
        `site:twitter.com "${hrName}" "${company}" ("@gmail.com" OR "@${cleanDomain}")`
      ].filter(Boolean);
      
      let allSnippets = '';
      
      const searchPromises = queries.map(q => 
        axios.post('https://google.serper.dev/search', { q, num: 3 }, {
          headers: { 'X-API-KEY': process.env.SERPER_API_KEY, 'Content-Type': 'application/json' }
        }).catch(() => null)
      );
      
      const results = await Promise.all(searchPromises);
      
      results.forEach(sRes => {
        if (sRes && sRes.data && sRes.data.organic) {
          allSnippets += sRes.data.organic.map(r => r.snippet).join(' ') + ' ';
        }
      });

      const emailRegex = /[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}/g;
      const foundEmails = allSnippets.match(emailRegex);
      if (foundEmails && foundEmails.length > 0) {
        const validEmails = foundEmails.filter(e => !e.includes('example.com') && !e.includes('email.com') && !isGenericEmail(e) && !failedEmails.includes(e));
        if (validEmails.length > 0) {
          const prompt = `You are an AI Email Judge. We did an advanced search for the email of "${hrName}" at "${company}". Extracted emails: ${validEmails.join(', ')}. Which ONE is an authentic direct personal or corporate email for "${hrName}"? Prioritize corporate @${cleanDomain} or real personal @gmail.com. Return ONLY the email address, or "NONE".`;
          const response = await callAIWithRetry(prompt);
          const aiJudgment = response.text.trim();
          const emailMatch = aiJudgment.match(/[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}/);
          if (emailMatch && !isGenericEmail(emailMatch[0])) {
            await testCandidate(emailMatch[0], 'Tier 1.2 (LinkedIn Contact Info + OSINT)');
          }
        }
      }
    } catch(err) {}
  }

  // Tier 2: Hunter.io API (Strictly Real Person Emails Only)
  if (!discoveredEmail && process.env.HUNTER_API_KEY && domainMx.valid) {
    try {
      const hRes = await axios.get(`https://api.hunter.io/v2/domain-search?domain=${cleanDomain}&api_key=${process.env.HUNTER_API_KEY}&department=hr`);
      const emails = hRes.data?.data?.emails;
      if (emails && emails.length > 0) {
        for (const em of emails) {
          if (!isGenericEmail(em.value) && em.confidence >= 50 && await testCandidate(em.value, 'Tier 2 (Hunter.io Real Person)')) {
            break;
          }
        }
      }
    } catch (err) { }
  }

  // Tier 1.5: HR Name Permutations (Corporate Email Patterns - e.g. preethi.s@kone.com)
  if (!discoveredEmail && hrName && domainMx.valid) {
    const parts = hrName.toLowerCase().replace(/[^a-z0-9 ]/g, '').split(' ').filter(Boolean);
    if (parts.length >= 2) {
      const first = parts[0];
      const last = parts[parts.length - 1];
      const guesses = [
        `${first}.${last}@${cleanDomain}`,      // john.doe@company.com
        `${first}.${last[0]}@${cleanDomain}`,   // john.d@company.com (e.g. preethi.s@kone.com)
        `${first[0]}.${last}@${cleanDomain}`,   // j.doe@company.com
        `${first[0]}${last}@${cleanDomain}`,    // jdoe@company.com
        `${first}${last}@${cleanDomain}`,       // johndoe@company.com
        `${first}_${last}@${cleanDomain}`,      // john_doe@company.com
        `${last}.${first}@${cleanDomain}`,      // doe.john@company.com
        `${first}@${cleanDomain}`               // john@company.com
      ];
      for (const guess of guesses) {
        if (!failedEmails.includes(guess) && !isGenericEmail(guess)) {
          if (process.env.HUNTER_API_KEY) {
            const hCheck = await verifyWithHunter(guess);
            if (hCheck.verified && hCheck.isDeliverable) {
              discoveredEmail = guess;
              source = 'Tier 1.5 (HR Name Permutation [Hunter Verified])';
              break;
            }
          } else {
            // MX valid baseline for real HR name
            discoveredEmail = guess;
            source = 'Tier 1.5 (HR Name Permutation [MX Verified])';
            break;
          }
        }
      }
    } else if (parts.length === 1) {
      const guess = `${parts[0]}@${cleanDomain}`;
      if (!failedEmails.includes(guess) && !isGenericEmail(guess)) {
        if (process.env.HUNTER_API_KEY) {
          const hCheck = await verifyWithHunter(guess);
          if (hCheck.verified && hCheck.isDeliverable) {
            discoveredEmail = guess;
            source = 'Tier 1.5 (HR Name Guess [Hunter Verified])';
          }
        } else {
          discoveredEmail = guess;
          source = 'Tier 1.5 (HR Name Guess [MX Verified])';
        }
      }
    }
  }

  // Tier 3: Serper.dev (Google Dorking) for Named Recruiters
  if (!discoveredEmail && process.env.SERPER_API_KEY && domainMx.valid) {
    try {
      const sRes = await axios.post('https://google.serper.dev/search', {
        q: `"${company}" "recruiter" OR "talent acquisition" email "@${cleanDomain}"`
      }, {
        headers: { 'X-API-KEY': process.env.SERPER_API_KEY, 'Content-Type': 'application/json' }
      });
      const snippets = sRes.data?.organic?.map(r => r.snippet).join(' ') || '';
      const emailRegex = /[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}/g;
      const foundEmails = snippets.match(emailRegex);
      if (foundEmails && foundEmails.length > 0) {
        const nonGenericFound = foundEmails.filter(e => !isGenericEmail(e));
        if (nonGenericFound.length > 0) {
          const prompt = `You are an AI Email Judge. Extracted emails: ${nonGenericFound.join(', ')}. Which ONE is a real human recruiter or hiring manager (e.g. firstname.lastname@${cleanDomain})? Ignore generic shared inboxes. Return ONLY the person's email address, or "NONE".`;
          const response = await callAIWithRetry(prompt);
          const aiJudgment = response.text.trim();
          const emailMatch = aiJudgment.match(/[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}/);
          if (emailMatch && !isGenericEmail(emailMatch[0])) {
            await testCandidate(emailMatch[0], 'Tier 3 (Google Dorking + AI)');
          }
        }
      }
    } catch (err) { }
  }

  // Note: Tier 4 (Generic careers@/jobs@ fallback) has been REMOVED to guarantee only real personal inboxes!

  // Dynamic Learning: If an email is verified and accepted, learn it
  if (discoveredEmail) {
    await learnFromVerifiedEmail(company, cleanDomain, discoveredEmail, hrName);
  }

  console.log(`[Email Discovery] ${company} (${cleanDomain}) -> ${discoveredEmail || 'NONE'} (${source || 'No valid MX/Email'})`);
  return { email: discoveredEmail, source, verification: verificationInfo };
}

module.exports = {
  sendEmailViaAPI,
  checkGmailForReply,
  getInboxReplies,
  discoverEmailForJob,
  verifyEmail,
  checkMxRecords,
  validateEmailSyntax
};

