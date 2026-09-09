const { google } = require('googleapis');
const MailComposer = require('nodemailer/lib/mail-composer');
const nodemailer = require('nodemailer');
const axios = require('axios');
const { verifyEmail, checkMxRecords, validateEmailSyntax, verifyWithHunter, isGenericEmail, isNonRecipientEmail, isRecruitingEmail } = require('./verifier');
const { 
  getLearnedMemory, 
  learnFromVerifiedEmail, 
  learnDeadDomain, 
  learnFromOpen,
  learnFromBounce,
  generateEmailWithPattern 
} = require('./learningEngine');

// In-Memory Domain Resolution Cache (1-hour TTL)
const domainResolutionCache = new Map(); // companyKey -> { timestamp, domain }
let serperCreditsExhaustedUntil = 0;

/**
 * Checks if a domain belongs to a job aggregator, job board, ATS platform, or social network.
 * These domains must NEVER be treated as the employer's official email domain.
 */
function isJobBoardOrAtsDomain(host) {
  if (!host || typeof host !== 'string') return false;
  const clean = host.toLowerCase().trim().replace(/^www\./, '');
  const jobBoardPattern = /\b(adzuna|indeed|naukri|linkedin|glassdoor|internshala|foundit|monster|shine|timesjobs|hirist|instahyre|cuvette|unstop|wellfound|angel\.co|ziprecruiter|simplyhired|careerbuilder|dice|apify|google|facebook|twitter|instagram|youtube|wikipedia|github|medium|zaubacorp|tofler|ambitionbox|zoominfo|greenhouse|lever|workday|myworkdayjobs|smartrecruiters|ashbyhq|breezy|recruitee|jobvite|bamboohr|workable)\b/i;
  return jobBoardPattern.test(clean);
}

async function resolveCompanyDomain(company, applyLink = null) {
  if (!company || typeof company !== 'string') return null;

  const rawComp = company.trim();
  const lowerComp = rawComp.toLowerCase();

  // Check cache first
  const cacheKey = `${lowerComp}|${applyLink || ''}`;
  const cached = domainResolutionCache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp < 60 * 60 * 1000) && !isJobBoardOrAtsDomain(cached.domain)) {
    return cached.domain;
  }

  const finalizeDomain = (dom) => {
    if (dom && isJobBoardOrAtsDomain(dom)) dom = null;
    if (domainResolutionCache.size > 2000) domainResolutionCache.clear();
    domainResolutionCache.set(cacheKey, { timestamp: Date.now(), domain: dom });
    return dom;
  };

  // Filter out generic placeholder phrases
  const genericPlaceholders = [
    'direct recruiter', 'recruiter / agency', 'agency', 'confidential', 
    'hiring company', 'leading mnc', 'stealth startup', 'unknown company',
    'sourcing strategist', 'technical recruiter', 'talent acquisition'
  ];
  if (genericPlaceholders.some(p => lowerComp.includes(p))) {
    return finalizeDomain(null);
  }

  // 1. Scrambled URL in company name (e.g. httpswwwicloudemscomvlog or company.com)
  const urlMatch = rawComp.match(/(?:https?:\/\/)?(?:www\.)?([a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+)/i);
  if (urlMatch) {
    const host = urlMatch[1].toLowerCase();
    if (!isJobBoardOrAtsDomain(host)) {
      const mx = await checkMxRecords(host);
      if (mx.valid) return finalizeDomain(host);
    }
  }

  // 2. Direct company website from applyLink (strictly filter out job boards & ATS platforms)
  if (applyLink) {
    try {
      const parsed = new URL(applyLink);
      const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
      if (!isJobBoardOrAtsDomain(host)) {
        const mx = await checkMxRecords(host);
        if (mx.valid) return finalizeDomain(host);
      }
    } catch(e) {}
  }

  // Clean company name: strip prefix fluff like "Jobs at", "Hiring for", legal suffixes
  let cleanName = rawComp
    .replace(/^(?:jobs|careers?|hiring|openings?|opportunity)\s+(?:at|for|in|with)\s+/i, '')
    .replace(/\b(enterprises|technologies|solutions|software|systems|services|pvt|ltd|limited|private|llc|inc|corp|corporation|group|india)\b/gi, '')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleanName || cleanName.length < 2) {
    cleanName = rawComp.replace(/[^a-zA-Z0-9]/g, '');
  }

  // 3. Clearbit Autocomplete (Free company domain lookup)
  try {
    const clearbitRes = await axios.get(`https://autocomplete.clearbit.com/v1/companies/suggest?query=${encodeURIComponent(cleanName || rawComp)}`, { timeout: 3500 });
    if (clearbitRes.data && clearbitRes.data.length > 0) {
      for (const entry of clearbitRes.data) {
        if (entry && entry.domain) {
          const cbDomain = entry.domain.toLowerCase().trim();
          if (!isJobBoardOrAtsDomain(cbDomain)) {
            const mx = await checkMxRecords(cbDomain);
            if (mx.valid) return finalizeDomain(cbDomain);
          }
        }
      }
    }
  } catch (err) { }

  // 4. Serper Google Search for Company Official Website (High precision)
  if (process.env.SERPER_API_KEY && Date.now() > serperCreditsExhaustedUntil) {
    try {
      const serperRes = await axios.post('https://google.serper.dev/search', {
        q: `"${cleanName}" official website`,
        num: 4
      }, {
        headers: { 'X-API-KEY': process.env.SERPER_API_KEY, 'Content-Type': 'application/json' },
        timeout: 3000
      });
      const organic = serperRes.data?.organic || [];
      for (const o of organic) {
        try {
          const u = new URL(o.link);
          const host = u.hostname.replace(/^www\./, '').toLowerCase();
          if (!isJobBoardOrAtsDomain(host)) {
            const mx = await checkMxRecords(host);
            if (mx.valid) return finalizeDomain(host);
          }
        } catch(e) {}
      }
    } catch(err) {
      if (err.response?.status === 400 || err.response?.data?.message?.includes('credit')) {
        serperCreditsExhaustedUntil = Date.now() + 30 * 60 * 1000;
      }
    }
  }

  // 5. Candidate domain generation with legal suffix stripping - strictly require MX validation
  const compactName = cleanName.toLowerCase().replace(/[^a-z0-9]/g, '');
  const fullCompact = rawComp.toLowerCase().replace(/[^a-z0-9]/g, '');

  const candidates = [
    compactName ? `${compactName}.com` : null,
    compactName ? `${compactName}.in` : null,
    compactName ? `${compactName}.co.in` : null,
    compactName ? `${compactName}.io` : null,
    (fullCompact && fullCompact !== compactName) ? `${fullCompact}.com` : null,
    (fullCompact && fullCompact !== compactName) ? `${fullCompact}.in` : null
  ].filter(Boolean);

  for (const dom of candidates) {
    if (!isJobBoardOrAtsDomain(dom)) {
      const mx = await checkMxRecords(dom);
      if (mx.valid) return finalizeDomain(dom);
    }
  }

  // NEVER return an unverified synthetic domain to prevent bounces
  return finalizeDomain(null);
}

async function sendEmailViaAPI(user, mailOptions) {
  const recipient = (mailOptions.to || '').trim();
  if (!recipient) {
    console.warn('❌ [Send Guard] Aborted: Recipient address is empty');
    throw new Error('Email send aborted: Recipient email address is empty.');
  }

  console.log(`\n======================================================`);
  console.log(`📤 [Outbound Outreach] Preparing email to: ${recipient}`);
  console.log(`🛡️ [Deliverability Guard] Pre-send reputation check initiated...`);

  // Strict Deliverability Guard: Protect sender domain reputation from bounces (>5% bounce rate causes blacklisting)
  const verification = await verifyEmail(recipient);
  if (!verification.isValid || (verification.deliverabilityScore != null && verification.deliverabilityScore < 60) || verification.status === 'undeliverable') {
    console.error(`🛑 [Deliverability Guard] BLOCKED: "${recipient}"`);
    console.error(`   Status: ${verification.status} | Score: ${verification.deliverabilityScore}%`);
    console.error(`   Reason: ${verification.reason || 'High bounce risk'}`);
    console.error(`   Protection: Send aborted to shield domain from ESP blacklisting.`);
    console.log(`======================================================\n`);
    throw new Error(`Email send blocked by Deliverability Guard: "${recipient}" failed verification (Status: ${verification.status}, Score: ${verification.deliverabilityScore}%, Reason: ${verification.reason || 'High bounce risk'}). Sending aborted to protect domain reputation.`);
  }

  const domain = recipient.split('@')[1];
  if (domain) {
    const mxCheck = await checkMxRecords(domain);
    if (!mxCheck.valid) {
      console.error(`🛑 [Deliverability Guard] Domain @${domain} has no active MX servers.`);
      console.log(`======================================================\n`);
      throw new Error(`Email send aborted: Domain @${domain} has no active mail servers (MX records).`);
    }
  }

  console.log(`✅ [Deliverability Guard] APPROVED for dispatch! (Score: ${verification.deliverabilityScore}%, Status: ${verification.status})`);
  console.log(`======================================================\n`);

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

function stripQuotedEmailText(text) {
  if (!text) return { clean: '', quoted: '' };
  
  // Collapse excessive empty lines (more than 2 consecutive newlines)
  const normalized = text.replace(/(\r?\n\s*){3,}/g, '\n\n');
  const lines = normalized.split(/\r?\n/);
  const cleanLines = [];
  const quotedLines = [];
  let inQuote = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    const stripped = trimmed.replace(/^[-=_—\s]+|[-=_—\s]+$/g, '').trim();

    if (!inQuote) {
      // 1. Check for Zoho (---- On ... wrote ----), Gmail, Outlook, Thunderbird headers
      if (/^On\s+.+wrote\b/i.test(stripped) ||
          /^On\s+.+wrote\b/i.test(trimmed) ||
          /^(original message|forwarded message)/i.test(stripped) ||
          /^-+\s*Original Message\s*-+/i.test(trimmed) ||
          /^-+\s*Forwarded message\s*-+/i.test(trimmed) ||
          /^_{10,}$/.test(trimmed) ||
          /^-{10,}$/.test(trimmed) ||
          trimmed.startsWith('>') ||
          trimmed.startsWith('&gt;')) {
        inQuote = true;
      }
      // 2. Multi-line "On ... \n ... wrote" or "---- On ... \n ... wrote ----"
      else if (/^(On\s+|[-=_—]+\s*On\s+)/i.test(trimmed)) {
        for (let j = 1; j <= 3 && (i + j) < lines.length; j++) {
          const nextTrimmed = lines[i + j].trim();
          const nextStripped = nextTrimmed.replace(/^[-=_—\s]+|[-=_—\s]+$/g, '').trim();
          if (/wrote\b/i.test(nextStripped) || /wrote\b/i.test(nextTrimmed)) {
            inQuote = true;
            break;
          }
        }
      }
      // 3. Outlook style header: "From: ... \n Sent: ... \n To: ... \n Subject: ..."
      else if (/^From:\s*.+@.+/i.test(trimmed) && i + 1 < lines.length && /^(Sent|Date):\s*/i.test(lines[i + 1].trim())) {
        inQuote = true;
      }
    }

    if (inQuote) {
      quotedLines.push(line);
    } else {
      cleanLines.push(line);
    }
  }

  while (cleanLines.length > 0 && cleanLines[cleanLines.length - 1].trim() === '') {
    cleanLines.pop();
  }

  return {
    clean: cleanLines.join('\n').trim(),
    quoted: quotedLines.join('\n').trim()
  };
}

function extractBodyFromPayload(payload) {
  if (!payload) return '';

  function findPart(p, mimeType) {
    if (p.mimeType === mimeType && p.body && p.body.data) {
      return Buffer.from(p.body.data, 'base64').toString('utf8');
    }
    if (p.parts && p.parts.length > 0) {
      for (const sub of p.parts) {
        const found = findPart(sub, mimeType);
        if (found) return found;
      }
    }
    return null;
  }

  // 1. Try to find text/plain anywhere in the multipart tree
  const plainText = findPart(payload, 'text/plain');
  if (plainText) return plainText;

  // 2. Try to find text/html anywhere in the multipart tree
  const htmlText = findPart(payload, 'text/html');
  if (htmlText) {
    return htmlText
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<br\s*[\/]?>/gi, '\n')
      .replace(/<\/div>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/\n\s*\n\s*\n/g, '\n\n')
      .trim();
  }

  // 3. Direct body data
  if (payload.body && payload.body.data) {
    return Buffer.from(payload.body.data, 'base64').toString('utf8');
  }

  return '';
}

async function getInboxReplies(user, options = {}) {
  if (!user.googleRefreshToken) return [];

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  oauth2Client.setCredentials({ refresh_token: user.googleRefreshToken });
  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

  try {
    // Support legacy array signature or options object
    let hrEmails = [];
    let searchQuery = '';
    let companyDomains = [];

    if (Array.isArray(options)) {
      hrEmails = options;
    } else if (typeof options === 'object' && options !== null) {
      hrEmails = options.hrEmails || [];
      searchQuery = (options.searchQuery || '').trim();
      companyDomains = options.companyDomains || [];
    }

    const validHrEmails = (hrEmails || []).filter(Boolean);
    let allMessageSummaries = [];

    // Query Collection
    const queryList = [];

    // 1. If explicit user search query is provided
    if (searchQuery) {
      queryList.push(`to:me (${searchQuery}) newer_than:180d -from:postmaster -from:mailer-daemon`);
    }

    // 2. Direct replies to outreach sent by AI Job Finder or recruitment updates
    queryList.push('to:me ("Re: Application for" OR "RE: Application for" OR "Application for" OR subject:Application) newer_than:90d -from:postmaster -from:mailer-daemon');

    // 3. Chunked known HR emails (top 60, in chunks of 15)
    const chunkSize = 15;
    const topHrEmails = validHrEmails.slice(0, 60);
    for (let i = 0; i < topHrEmails.length; i += chunkSize) {
      const chunk = topHrEmails.slice(i, i + chunkSize);
      const fromQuery = chunk.map(email => `from:${email.trim()}`).join(' OR ');
      queryList.push(`to:me (${fromQuery}) newer_than:90d`);
    }

    // 4. Top applied company domains (top 40 domains, in chunks of 10)
    const validDomains = (companyDomains || []).filter(d => d && !['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'icloud.com'].includes(d)).slice(0, 40);
    for (let i = 0; i < validDomains.length; i += 10) {
      const dChunk = validDomains.slice(i, i + 10);
      const domQuery = dChunk.map(d => `from:${d.trim()}`).join(' OR ');
      queryList.push(`to:me (${domQuery}) newer_than:90d`);
    }

    // Execute list queries in parallel
    const listPromises = queryList.map(q => 
      gmail.users.messages.list({ userId: 'me', q, maxResults: 60 })
        .then(res => res.data.messages || [])
        .catch(err => {
          console.warn('[Gmail Search Query Warning]', err.message);
          return [];
        })
    );

    const queryResults = await Promise.all(listPromises);
    for (const msgs of queryResults) {
      if (msgs && msgs.length > 0) {
        allMessageSummaries.push(...msgs);
      }
    }

    if (allMessageSummaries.length === 0) return [];

    // Deduplicate immediately by unique threadId for quota-safe batch fetching
    const uniqueThreadIds = [...new Set(allMessageSummaries.map(m => m.threadId).filter(Boolean))].slice(0, 40);
    const myEmail = (user.email || '').toLowerCase().trim();

    // Concurrently fetch thread details in gentle batches of 6 with 150ms pause to stay well below Google's quota
    const threadBatchSize = 6;
    const replies = [];

    for (let i = 0; i < uniqueThreadIds.length; i += threadBatchSize) {
      if (i > 0) {
        await new Promise(res => setTimeout(res, 150));
      }
      const batchIds = uniqueThreadIds.slice(i, i + threadBatchSize);
      const batchResults = await Promise.all(
        batchIds.map(async (threadId) => {
          try {
            const getThreadWithRetry = async (attempt = 1) => {
              try {
                return await gmail.users.threads.get({
                  userId: 'me',
                  id: threadId,
                  format: 'full'
                });
              } catch (apiErr) {
                if (attempt < 2 && (apiErr.message || '').includes('Quota exceeded')) {
                  await new Promise(r => setTimeout(r, 1200));
                  return await gmail.users.threads.get({
                    userId: 'me',
                    id: threadId,
                    format: 'full'
                  });
                }
                throw apiErr;
              }
            };

            const threadData = await getThreadWithRetry();
            const msgs = threadData.data?.messages || [];
            if (msgs.length === 0) return null;

            const multiMessages = [];
            for (const tMsg of msgs) {
              const tPayload = tMsg.payload || {};
              const tHeaders = tPayload.headers || [];
              const tFrom = tHeaders.find(h => h.name.toLowerCase() === 'from')?.value || '';
              const tDate = tHeaders.find(h => h.name.toLowerCase() === 'date')?.value || '';
              const tInternalDate = parseInt(tMsg.internalDate || '0', 10);
              const tParsedDate = tDate ? new Date(tDate).getTime() : 0;

              const extractedBody = extractBodyFromPayload(tPayload);
              const rawBody = extractedBody || tMsg.snippet || '';
              const { clean, quoted } = stripQuotedEmailText(rawBody);
              const isMe = myEmail && tFrom.toLowerCase().includes(myEmail);

              multiMessages.push({
                id: tMsg.id,
                from: tFrom,
                date: tDate,
                timestamp: tParsedDate || tInternalDate || 0,
                body: clean || rawBody,
                quotedText: quoted,
                isMe
              });
            }

            multiMessages.sort((a, b) => a.timestamp - b.timestamp);

            // Skip unreplied outbound applications (threads that only contain 1 message sent by the user)
            if (multiMessages.length === 1 && multiMessages[0].isMe) {
              return null;
            }

            // Extract subject
            let subject = 'No Subject';
            for (const m of msgs) {
              const s = (m.payload?.headers || []).find(h => h.name.toLowerCase() === 'subject')?.value;
              if (s) { subject = s; break; }
            }

            const latestMsg = multiMessages[multiMessages.length - 1];

            // If candidate replied last, find the recruiter counterparty to display
            let displayFrom = latestMsg.from;
            let displayFromFull = latestMsg.from;
            let recruiterSnippet = (latestMsg.body || '').slice(0, 200);
            let recruiterBody = latestMsg.body;

            if (latestMsg.isMe && multiMessages.length > 1) {
              for (let idx = multiMessages.length - 1; idx >= 0; idx--) {
                const tm = multiMessages[idx];
                if (!tm.isMe) {
                  displayFromFull = tm.from;
                  const match = tm.from.match(/<([^>]+)>/);
                  displayFrom = (match ? match[1] : tm.from).toLowerCase().trim();
                  recruiterSnippet = (tm.body || '').slice(0, 200);
                  recruiterBody = tm.body;
                  break;
                }
              }
            }

            const rawFromEmail = (displayFrom.match(/<([^>]+)>/)?.[1] || displayFrom).toLowerCase().trim();

            // Intercept delivery failure notices and mark bounced jobs
            const isDeliveryFailure = /mailer-daemon|postmaster|daemon@|bounce@/i.test(rawFromEmail) ||
              /Delivery Status Notification \(Failure\)|Undelivered Mail Returned to Sender|Mail delivery failed/i.test(subject);

            if (isDeliveryFailure) {
              const bounceContent = `${subject} ${recruiterSnippet} ${recruiterBody || ''} ${latestMsg.quotedText || ''}`;
              const emailRegex = /\b([a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6})\b/g;
              const matches = bounceContent.match(emailRegex) || [];
              const bouncedEmails = [...new Set(matches.map(m => m.toLowerCase().trim()))]
                .filter(m => !m.includes('googlemail') && !m.includes('google.com') && !m.includes('postmaster') && !m.includes('mailer-daemon') && m !== myEmail);

              if (bouncedEmails.length > 0) {
                try {
                  const Job = require('../models/Job');
                  for (const bEmail of bouncedEmails) {
                    const matchedJob = await Job.findOne({
                      userId: user._id || user.id,
                      $or: [{ emailRecipient: bEmail }, { recruiterEmail: bEmail }]
                    });
                    if (matchedJob) {
                      matchedJob.status = 'Bounced';
                      matchedJob.deliverabilityStatus = 'bounced';
                      matchedJob.deliverabilityReason = '550 Mailbox Not Found / Recipient does not exist';
                      await matchedJob.save();
                      console.log(`🚨 [Bounce Interceptor] Job for "${matchedJob.company}" marked as Bounced (${bEmail})`);
                      await learnFromBounce(matchedJob.company, bEmail);
                    }
                  }
                } catch (bErr) {
                  console.warn('[Bounce Interceptor Warning]', bErr.message);
                }
              }
              return null;
            }

            // Filter no-reply ONLY IF it lacks recruitment or job context
            const isNoReply = /no-?reply|donotreply/i.test(rawFromEmail);
            const hasRecruitingKeywords = /interview|assessment|coding|test|application|shortlist|candidate|hiring|recruiter|invitation|offer|discussion|screening|schedule/i.test(subject + ' ' + recruiterSnippet);
            if (isNoReply && !hasRecruitingKeywords) {
              return null;
            }

            return {
              messageId: latestMsg.id,
              threadId: threadId,
              from: rawFromEmail,
              fromFull: displayFromFull,
              subject,
              date: latestMsg.date,
              timestamp: latestMsg.timestamp,
              snippet: recruiterSnippet || (latestMsg.body || '').slice(0, 200),
              body: recruiterBody || latestMsg.body,
              threadMessages: multiMessages
            };
          } catch (threadErr) {
            console.warn('[Gmail Thread Detail Warning]', threadErr.message);
            return null;
          }
        })
      );

      for (const item of batchResults) {
        if (item) replies.push(item);
      }
    }

    // Sort strictly newest-first (latest timestamp at index 0)
    replies.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    return replies;
  } catch (err) {
    console.error('Error fetching inbox replies:', err);
    return [];
  }
}

async function discoverEmailForJob(company, domain, jd, failedEmails = [], callAIWithRetry, hrName = null, hrLinkedInUrl = null, applyLink = null) {
  let discoveredEmail = null;
  let source = '';
  let verificationInfo = null;

  let cleanDomain = (domain || '').toLowerCase().trim();
  if (!cleanDomain || cleanDomain.includes('unknown') || isJobBoardOrAtsDomain(cleanDomain) || cleanDomain.startsWith('http') || cleanDomain.includes('recruiter') || cleanDomain.includes('agency')) {
    cleanDomain = await resolveCompanyDomain(company, applyLink);
  }

  if (!cleanDomain) {
    console.log(`[Email Discovery] ${company} -> NONE (No verified domain resolved)`);
    return { email: null, source: 'No verified domain resolved', verification: null };
  }

  // Dynamic Learning Engine: Check learned company memory first
  const learnedMemory = await getLearnedMemory(company);
  if (learnedMemory) {
    if (learnedMemory.verifiedDomain && (!cleanDomain || cleanDomain.includes('unknown') || isJobBoardOrAtsDomain(cleanDomain))) {
      cleanDomain = learnedMemory.verifiedDomain;
    }
    // If domain is already known dead, abort early
    if (learnedMemory.deadDomains && learnedMemory.deadDomains.includes(cleanDomain)) {
      console.log(`[Email Discovery] ${company} (${cleanDomain}) -> NONE (Known Dead Domain from Memory)`);
      return { email: null, source: 'Blacklisted Dead Domain (Memory)', verification: null };
    }
  }

  let domainMx = await checkMxRecords(cleanDomain);
  if (!domainMx.valid) {
    const alternativeDomain = await resolveCompanyDomain(company, applyLink);
    if (alternativeDomain && alternativeDomain !== cleanDomain) {
      const altMx = await checkMxRecords(alternativeDomain);
      if (altMx.valid) {
        cleanDomain = alternativeDomain;
        domainMx = altMx;
      } else {
        await learnDeadDomain(company, cleanDomain);
        return { email: null, source: 'Invalid MX domain', verification: null };
      }
    } else {
      await learnDeadDomain(company, cleanDomain);
      return { email: null, source: 'Invalid MX domain', verification: null };
    }
  }

  const isGenericOrgName = !hrName || /\b(talent|acquisition|recruitment|recruiter|hiring|team|lead|manager|human resources|resources|staffing|agency)\b/i.test(hrName) || hrName.toLowerCase().includes(company.toLowerCase());

  // Helper to test and accept candidate email
  async function testCandidate(candidate, sourceName, isExplicitJd = false, allowDomainMismatch = false) {
    if (!candidate || failedEmails.includes(candidate.toLowerCase().trim())) return false;
    
    // Strict Filter: Block system non-recipient inboxes (noreply@, mailer-daemon@, support@, etc.)
    if (isNonRecipientEmail(candidate)) {
      console.log(`[Email Rejected] Discarded non-recipient address "${candidate}"`);
      return false;
    }

    // Strict Domain Match: Prevent cross-company contamination
    const candidateDomain = (candidate.split('@')[1] || '').toLowerCase().trim();
    if (!allowDomainMismatch && cleanDomain && candidateDomain) {
      const cleanRoot = cleanDomain.split('.')[0];
      const candidateRoot = candidateDomain.split('.')[0];
      const isDomainMatch = candidateDomain === cleanDomain ||
        candidateDomain.endsWith('.' + cleanDomain) ||
        cleanDomain.endsWith('.' + candidateDomain) ||
        (cleanRoot.length >= 3 && candidateRoot.includes(cleanRoot));
      
      const isPersonalMail = ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com'].includes(candidateDomain);
      if (isPersonalMail) {
        if (!hrName) return false;
        const hrFirstName = hrName.toLowerCase().split(' ')[0];
        if (!candidate.toLowerCase().includes(hrFirstName)) {
          console.log(`[Email Rejected] Personal email ${candidate} does not match recruiter name ${hrName}`);
          return false;
        }
      } else if (!isDomainMatch) {
        console.log(`[Email Rejected] Domain mismatch for "${candidate}" (expected "${cleanDomain}", got "${candidateDomain}")`);
        return false;
      }
    }

    const result = await verifyEmail(candidate, { isFromJd: isExplicitJd, hrName: isGenericOrgName ? null : hrName });
    // Require strict deliverability confirmation to prevent bounces:
    // Explicit JD emails allowed if isValid === true and deliverabilityScore >= 60.
    // Inferred/scraped emails require deliverabilityScore >= 65 and isValid === true.
    const threshold = isExplicitJd ? 60 : 65;
    if (result.isValid && result.deliverabilityScore >= threshold && result.status !== 'undeliverable') {
      discoveredEmail = candidate.trim();
      source = `${sourceName} [Verified ${result.deliverabilityScore}%]`;
      verificationInfo = result;
      return true;
    }
    console.log(`[Email Rejected] Candidate ${candidate} failed deliverability check (Status: ${result.status}, Score: ${result.deliverabilityScore}%, Reason: ${result.reason})`);
    return false;
  }

  // Tier 0: Dynamic Learned Pattern (Instant High-Confidence Hit on Real HR Name)
  if (!discoveredEmail && hrName && domainMx.valid && learnedMemory?.learnedPattern && learnedMemory?.patternConfidence >= 50) {
    const memoryEmail = generateEmailWithPattern(hrName, cleanDomain, learnedMemory.learnedPattern);
    if (memoryEmail) {
      await testCandidate(memoryEmail, `Tier 0 (Learned Memory: ${learnedMemory.learnedPattern})`, false, false);
    }
  }

  // Tier 1: JD Scraper (Authentic Direct Recruiter or Official Hiring Inboxes in Job Description)
  if (!discoveredEmail && jd && jd.length > 0) {
    const emailRegex = /[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}/g;
    const foundEmails = jd.match(emailRegex);
    if (foundEmails && foundEmails.length > 0) {
      const validFound = foundEmails.filter(e => !isNonRecipientEmail(e) && !failedEmails.includes(e.toLowerCase().trim()));
      if (validFound.length > 0) {
        // 1. First priority: Real named personal recruiter contact in JD
        const personalEmails = validFound.filter(e => !isGenericEmail(e));
        for (const pEmail of personalEmails) {
          if (await testCandidate(pEmail, 'Tier 1 (JD Named Contact)', true, true)) {
            break;
          }
        }
        // 2. Second priority: Official hiring inboxes explicitly published in the JD
        if (!discoveredEmail) {
          for (const cEmail of validFound) {
            if (await testCandidate(cEmail, 'Tier 1 (JD Official Hiring Inbox)', true, true)) {
              break;
            }
          }
        }
      }
    }
  }

  // Tier 1.2: Advanced Deep Web Search (OSINT & LinkedIn Contact Info with STRICT Domain Matching)
  if (!discoveredEmail && hrName && !isGenericOrgName && process.env.SERPER_API_KEY && domainMx.valid && Date.now() > serperCreditsExhaustedUntil) {
    try {
      const linkedInSlug = hrLinkedInUrl ? hrLinkedInUrl.split('/in/')[1]?.split('/')[0]?.split('?')[0] : '';
      const queries = [
        `"${hrName}" "${company}" ("@${cleanDomain}" OR "email")`,
        `"${hrName}" "HR" OR "Recruiter" "email" "@${cleanDomain}"`,
        linkedInSlug ? `"${linkedInSlug}" "@${cleanDomain}"` : null
      ].filter(Boolean);
      
      let allSnippets = '';
      
      const searchPromises = queries.map(q => 
        axios.post('https://google.serper.dev/search', { q, num: 3 }, {
          headers: { 'X-API-KEY': process.env.SERPER_API_KEY, 'Content-Type': 'application/json' },
          timeout: 3000
        }).catch((err) => {
          if (err.response?.status === 400 || err.response?.data?.message?.includes('credit')) {
            serperCreditsExhaustedUntil = Date.now() + 30 * 60 * 1000;
          }
          return null;
        })
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
        const validEmails = foundEmails.filter(e => !isNonRecipientEmail(e) && !failedEmails.includes(e.toLowerCase().trim()));
        if (validEmails.length > 0) {
          for (const em of validEmails) {
            if (await testCandidate(em, 'Tier 1.2 (LinkedIn Recruiter OSINT)', false, false)) {
              break;
            }
          }
        }
      }
    } catch(err) {}
  }

  // Tier 2: Hunter.io API (When credits are available)
  if (!discoveredEmail && process.env.HUNTER_API_KEY && domainMx.valid) {
    try {
      const hRes = await axios.get(`https://api.hunter.io/v2/domain-search?domain=${cleanDomain}&api_key=${process.env.HUNTER_API_KEY}&department=hr`);
      const emails = hRes.data?.data?.emails;
      if (emails && emails.length > 0) {
        for (const em of emails) {
          if (!isNonRecipientEmail(em.value) && (em.confidence || 0) >= 50) {
            if (await testCandidate(em.value, 'Tier 2 (Hunter.io Verified)', false, false)) {
              break;
            }
          }
        }
      }
    } catch (err) { }
  }

  // Tier 1.5: HR Name Permutations (Corporate Email Patterns for genuine personal recruiter names)
  if (!discoveredEmail && hrName && !isGenericOrgName && domainMx.valid) {
    const parts = hrName.toLowerCase().replace(/[^a-z0-9 ]/g, '').split(' ').filter(Boolean);
    if (parts.length >= 2) {
      const first = parts[0];
      const last = parts[parts.length - 1];
      const guesses = [
        `${first}.${last}@${cleanDomain}`,
        `${first}.${last[0]}@${cleanDomain}`,
        `${first[0]}.${last}@${cleanDomain}`,
        `${first[0]}${last}@${cleanDomain}`,
        `${first}${last}@${cleanDomain}`,
        `${first}@${cleanDomain}`
      ];
      for (const guess of guesses) {
        if (!failedEmails.includes(guess.toLowerCase().trim()) && !isNonRecipientEmail(guess)) {
          if (await testCandidate(guess, 'Tier 1.5 (HR Name Permutation)', false, false)) {
            break;
          }
        }
      }
    }
  }

  // Tier 3: Google Dorking for Company Recruiter on Company Domain
  if (!discoveredEmail && process.env.SERPER_API_KEY && domainMx.valid && Date.now() > serperCreditsExhaustedUntil) {
    try {
      const sRes = await axios.post('https://google.serper.dev/search', {
        q: `"${company}" ("recruiter" OR "talent acquisition" OR "hiring") email "@${cleanDomain}"`
      }, {
        headers: { 'X-API-KEY': process.env.SERPER_API_KEY, 'Content-Type': 'application/json' },
        timeout: 3000
      });
      const snippets = sRes.data?.organic?.map(r => r.snippet).join(' ') || '';
      const emailRegex = /[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}/g;
      const foundEmails = snippets.match(emailRegex);
      if (foundEmails && foundEmails.length > 0) {
        const validEmails = foundEmails.filter(e => !isNonRecipientEmail(e) && !failedEmails.includes(e.toLowerCase().trim()));
        for (const em of validEmails) {
          if (await testCandidate(em, 'Tier 3 (Company Recruiter Dorking)', false, false)) {
            break;
          }
        }
      }
    } catch (err) {
      if (err.response?.status === 400 || err.response?.data?.message?.includes('credit')) {
        serperCreditsExhaustedUntil = Date.now() + 30 * 60 * 1000;
      }
    }
  }

  // Tier 4: Company Recruitment Inboxes (Standard corporate talent & recruitment inboxes)
  const isInvalidDomain = /\b(sourcingstrategist|technicalrecruiter|juniordeveloper|softwaredeveloper|softwareengineer|talentacquisition|directrecruiter|recruiteragency)\b/i.test(cleanDomain || '');
  if (!discoveredEmail && domainMx.valid && cleanDomain && !isInvalidDomain) {
    const candidateInboxes = [
      `careers@${cleanDomain}`,
      `jobs@${cleanDomain}`,
      `talent@${cleanDomain}`,
      `recruitment@${cleanDomain}`,
      `hr@${cleanDomain}`
    ];
    for (const candidate of candidateInboxes) {
      if (await testCandidate(candidate, 'Tier 4 (Company Careers Inbox)', false, false)) {
        break;
      }
    }
  }

  // Dynamic Learning: If an email is verified and accepted, learn it
  if (discoveredEmail) {
    await learnFromVerifiedEmail(company, cleanDomain, discoveredEmail, hrName);
    console.log(`[Email Discovery] ${company} (${cleanDomain}) -> ${discoveredEmail} (${source})`);
    return { 
      email: discoveredEmail, 
      source, 
      deliverabilityScore: verificationInfo?.deliverabilityScore || 85,
      deliverabilityStatus: verificationInfo?.status || 'deliverable',
      deliverabilityReason: verificationInfo?.reason || 'Verified deliverable mailbox',
      verification: verificationInfo 
    };
  }

  console.log(`[Email Discovery] ${company} (${cleanDomain}) -> NONE (Zero deliverable inboxes confirmed. Blocked guessing to prevent bounce)`);
  return { 
    email: null, 
    source: 'No deliverable mailbox discovered', 
    deliverabilityScore: 0,
    deliverabilityStatus: 'undeliverable',
    deliverabilityReason: 'No verified recipient mailbox found. Recommend using company application link or LinkedIn outreach to prevent email bouncing.',
    verification: null 
  };
}

function formatEmailTextToHtml(rawText, resumeLinkUrl = null) {
  if (!rawText) return '';
  
  let text = String(rawText).trim();

  // 1. Separate P.S. into its own paragraph if squished (using word boundary so https:// is not matched)
  text = text.replace(/(^|[^\n])\s*(\b[Pp]\.?[Ss]\.?(?:\s*:|(?=\s)))/g, '$1\n\n$2');

  // 2. Format bullet points starting with - or * or •
  const lines = text.split(/\r?\n/);
  const formattedLines = lines.map(line => {
    const trimmed = line.trim();
    if (/^[-*•]\s+/.test(trimmed)) {
      return `&bull; ${trimmed.replace(/^[-*•]\s+/, '')}`;
    }
    return trimmed;
  });
  text = formattedLines.join('\n');

  // 3. Convert markdown bold **text** or __text__ to <b>text</b>
  text = text.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
  text = text.replace(/__(.*?)__/g, '<b>$1</b>');

  // 4. Convert markdown italic *text* or _text_ to <i>text</i>
  text = text.replace(/(?<![\w*])\*([^*\n]+)\*(?![\w*])/g, '<i>$1</i>');
  text = text.replace(/(?<![\w_])_([^_\n]+)_(?![\w_])/g, '<i>$1</i>');

  // 5. Clean up any remaining unmatched double asterisks
  text = text.replace(/\*\*/g, '');

  // 6. Convert markdown links [text](url) to styled HTML links
  text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (match, label, url) => {
    let targetUrl = url.trim();
    // If url is root GitHub profile (e.g. https://github.com/BlxrryFxce17), resolve to repo URL
    if (/^https?:\/\/(www\.)?github\.com\/[^/]+\/?$/i.test(targetUrl)) {
      const slug = label.trim().replace(/\s+/g, '-');
      targetUrl = `${targetUrl.replace(/\/$/, '')}/${slug}`;
    }
    return `<a href="${targetUrl}" target="_blank" style="color: #0284c7; text-decoration: underline; font-weight: 500;">${label}</a>`;
  });

  // 7. Clean up any remaining unmatched square brackets e.g. [AI Job Finder]
  text = text.replace(/\[([A-Za-z0-9\s._-]+)\]/g, '$1');

  // 8. Handle CV / Resume link text
  if (resumeLinkUrl) {
    text = text.replace('You can view my CV here.', `<a href="${resumeLinkUrl}">You can view my CV here.</a>`);
  } else {
    text = text.replace('You can view my CV here.', 'I have attached my CV to this email for your reference.');
  }

  // 9. Convert newlines to HTML <br/>
  let html = text.replace(/\n/g, '<br/>');

  // Clean up excess consecutive <br/> tags
  html = html.replace(/(<br\s*[\/]?>\s*){3,}/gi, '<br/><br/>');

  return html;
}

function cleanDraftEmailText(text, profile = {}) {
  if (!text) return '';
  let cleaned = String(text);

  // 1. Remove markdown bold **text** or __text__
  cleaned = cleaned.replace(/\*\*(.*?)\*\*/g, '$1');
  cleaned = cleaned.replace(/__(.*?)__/g, '$1');

  // 2. Convert bullet points like '* ', '- ', '+ ' at start of line to standard bullet '• '
  cleaned = cleaned.replace(/^([ \t]*)[*+-][ \t]+/gm, '$1• ');

  // 3. Remove single italic asterisks or underscores around words
  cleaned = cleaned.replace(/(?<!\w)\*([^*\n]+)\*(?!\w)/g, '$1');
  cleaned = cleaned.replace(/(?<!\w)_([^_\n]+)_(?!\w)/g, '$1');

  // 4. Strip any rogue double asterisks or stray asterisks
  cleaned = cleaned.replace(/\*\*/g, '');
  cleaned = cleaned.replace(/(^|[^\w])\*(?=[^\w]|$)/g, '$1');

  // 5. Replace common placeholder brackets if profile data is available
  const loc = (profile && profile.location) || 'India';
  const github = (profile && profile.github) || '';
  const linkedin = (profile && profile.linkedin) || '';
  const portfolio = (profile && (profile.portfolio || profile.github || profile.linkedin)) || '';

  cleaned = cleaned.replace(/\[(?:Your\s+)?(?:City|Location)(?:,\s*Country)?\]/gi, loc);
  if (portfolio) {
    cleaned = cleaned.replace(/\[(?:Link\s+to\s+)?Portfolio\]/gi, portfolio);
  } else {
    cleaned = cleaned.replace(/\[(?:Link\s+to\s+)?Portfolio\]/gi, 'available upon request');
  }
  if (github) {
    cleaned = cleaned.replace(/\[(?:Link\s+to\s+)?GitHub\]/gi, github);
  } else {
    cleaned = cleaned.replace(/\[(?:Link\s+to\s+)?GitHub\]/gi, 'available upon request');
  }
  cleaned = cleaned.replace(/\[(?:Your\s+)?Name\]/gi, (profile && profile.name) || 'Akash V');
  cleaned = cleaned.replace(/\[(?:Your\s+)?Phone(?:\s+Number)?\]/gi, (profile && profile.phone) || '');

  // 6. Clean up raw markdown links [Label](URL) so no bracketed markdown leaks into plain text or email
  cleaned = cleaned.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (match, label, url) => {
    const trimmedLabel = label.trim();
    const cleanUrl = url.trim().replace(/\/$/, '');
    const userGithub = (profile && profile.github ? profile.github.trim().replace(/\/$/, '') : '').toLowerCase();

    // Check if the URL is just the root github profile (e.g. https://github.com/BlxrryFxce17)
    if (userGithub && cleanUrl.toLowerCase() === userGithub) {
      // Check if label matches a project repo in profile, e.g. "AI Job Finder"
      const repos = (profile && profile.githubInsights && Array.isArray(profile.githubInsights.repos)) ? profile.githubInsights.repos : [];
      const matched = repos.find(r => 
        (r.name && r.name.toLowerCase().replace(/[-_]/g, ' ') === trimmedLabel.toLowerCase().replace(/[-_]/g, ' ')) ||
        (r.name && trimmedLabel.toLowerCase().includes(r.name.toLowerCase().replace(/[-_]/g, ' ')))
      );
      if (matched && matched.url) {
        return `${trimmedLabel} (${matched.url})`;
      }
      // If label looks like a project name, try slugifying to repo url
      if (/^[A-Za-z0-9\s_-]+$/.test(trimmedLabel) && trimmedLabel.length < 35) {
        const repoSlug = trimmedLabel.replace(/\s+/g, '-');
        return `${trimmedLabel} (${cleanUrl}/${repoSlug})`;
      }
      return trimmedLabel;
    }

    return `${trimmedLabel} (${cleanUrl})`;
  });

  // 7. Clean any stray brackets around words e.g. [AI Job Finder]
  cleaned = cleaned.replace(/\[([A-Za-z0-9\s._-]+)\](?!\()/g, '$1');

  return cleaned.trim();
}

function stripSignOff(text) {
  if (!text || typeof text !== 'string') return '';
  return text.replace(/(?:\r?\n\s*)+(?:Yours\s+Sincerely|Sincerely|Best\s+regards|Warm\s+regards|Kind\s+regards|Regards|Best|Cheers)[\s\S]*$/i, '').trim();
}

function extractPortfolioUrl(resumeText) {
  if (!resumeText || typeof resumeText !== 'string') return '';
  // 1. Explicit keyword with optional protocol: e.g. "portfolio: https://akash.dev" or "website: akash.vercel.app"
  const kwMatch = resumeText.match(/(?:portfolio|website|site|web|link|live)\s*[:\-–]\s*(?:https?:\/\/)?([a-zA-Z0-9][-a-zA-Z0-9]*\.[a-zA-Z0-9_.\/:-]+)/i);
  if (kwMatch) {
    let url = kwMatch[1].trim().replace(/[,;)\]]+$/, '');
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    if (!/@|linkedin\.com|twitter\.com|x\.com/i.test(url)) {
      return url;
    }
  }

  // 2. Common developer portfolio domain patterns with or without https://
  const domainMatch = resumeText.match(/(?<!@)\b(?:https?:\/\/)?((?:www\.)?[a-zA-Z0-9-]+\.(?:dev|me|io|app|site|vercel\.app|netlify\.app|pages\.dev|github\.io)(?:\/[^\s,;)]*)?)\b/i);
  if (domainMatch) {
    let url = domainMatch[1].trim().replace(/[,;)\]]+$/, '');
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    if (!/@|linkedin\.com|twitter\.com|x\.com/i.test(url)) {
      return url;
    }
  }

  return '';
}

function getEffectivePortfolio(profile) {
  if (!profile) return '';
  if (profile.portfolio && typeof profile.portfolio === 'string' && profile.portfolio.trim()) {
    let p = profile.portfolio.trim();
    if (!/^https?:\/\//i.test(p)) p = `https://${p}`;
    return p;
  }
  const extracted = extractPortfolioUrl(profile.resumeText);
  if (extracted) return extracted;

  // Derive GitHub Pages portfolio URL from username if available
  let ghUser = profile.githubInsights?.username || '';
  if (!ghUser && profile.github) {
    const m = profile.github.match(/github\.com\/([a-zA-Z0-9_-]+)/i);
    if (m && m[1] && !['settings', 'pulls', 'issues', 'notifications'].includes(m[1].toLowerCase())) {
      ghUser = m[1];
    }
  }
  if (ghUser) {
    return `https://${ghUser}.github.io`;
  }

  return profile.github || '';
}

function buildSignatureLinks(profile, trackClick = (url) => url) {
  const links = [];
  const portfolioUrl = getEffectivePortfolio(profile);
  
  if (profile && profile.linkedin) links.push(`🔗 <a href="${trackClick(profile.linkedin)}">LinkedIn</a>`);
  if (profile && profile.github) links.push(`💻 <a href="${trackClick(profile.github)}">GitHub</a>`);
  if (portfolioUrl) links.push(`🌐 <a href="${trackClick(portfolioUrl)}">Portfolio</a>`);
  
  if (links.length === 0) {
    if (profile && profile.linkedin) links.push(`🔗 <a href="${trackClick(profile.linkedin || '')}">LinkedIn</a>`);
    if (profile && profile.github) links.push(`💻 <a href="${trackClick(profile.github || '')}">GitHub</a>`);
    if (portfolioUrl) links.push(`🌐 <a href="${trackClick(portfolioUrl)}">Portfolio</a>`);
  }
  return links.join(' | ');
}

function buildPlainTextSignature(profile) {
  const portfolioUrl = getEffectivePortfolio(profile);
  const links = [];
  if (profile && profile.linkedin) links.push(`LinkedIn: ${profile.linkedin}`);
  if (profile && profile.github) links.push(`GitHub: ${profile.github}`);
  if (portfolioUrl) links.push(`Portfolio: ${portfolioUrl}`);

  const phoneLine = profile && profile.phone ? `📞 ${profile.phone}\n` : '';
  const linksLine = links.length > 0 ? `${links.join(' | ')}` : '';
  return `\n\nYours Sincerely,\n${profile?.name || 'Akash V'}\n${profile?.title || 'Software Developer'}\n${phoneLine}${linksLine}`.trim();
}

module.exports = {
  sendEmailViaAPI,
  checkGmailForReply,
  getInboxReplies,
  discoverEmailForJob,
  resolveCompanyDomain,
  verifyEmail,
  checkMxRecords,
  validateEmailSyntax,
  formatEmailTextToHtml,
  cleanDraftEmailText,
  stripSignOff,
  getEffectivePortfolio,
  buildSignatureLinks,
  buildPlainTextSignature,
  extractPortfolioUrl
};



