const { google } = require('googleapis');
const MailComposer = require('nodemailer/lib/mail-composer');
const nodemailer = require('nodemailer');
const axios = require('axios');
const { verifyEmail, checkMxRecords, validateEmailSyntax, verifyWithHunter, isGenericEmail, isNonRecipientEmail, isRecruitingEmail } = require('./verifier');
const { 
  getLearnedMemory, 
  learnFromVerifiedEmail, 
  learnDeadDomain, 
  generateEmailWithPattern 
} = require('./learningEngine');

async function resolveCompanyDomain(company, applyLink = null) {
  if (!company) return 'unknown.com';

  // 1. Scrambled URL in company name (e.g. httpswwwicloudemscomvlog)
  const urlMatch = company.match(/(?:https?:\/\/)?(?:www\.)?([a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+)/i);
  if (urlMatch) return urlMatch[1].toLowerCase();
  const concatenatedMatch = company.match(/^https?www?([a-zA-Z0-9-]+?)(?:com|in|org|net|io)(.*)/i);
  if (concatenatedMatch) {
    return concatenatedMatch[1].toLowerCase() + '.com';
  }

  // 2. Direct ATS / careers website from applyLink
  if (applyLink) {
    try {
      const parsed = new URL(applyLink);
      const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
      const genericBoards = ['linkedin.com', 'indeed.com', 'naukri.com', 'adzuna.com', 'glassdoor.com', 'internshala.com', 'google.com', 'apify.com'];
      if (!genericBoards.some(gb => host.includes(gb))) {
        const mx = await checkMxRecords(host);
        if (mx.valid) return host;
      }
    } catch(e) {}
  }

  // 3. Clearbit Autocomplete
  try {
    const clearbitRes = await axios.get(`https://autocomplete.clearbit.com/v1/companies/suggest?query=${encodeURIComponent(company)}`, { timeout: 3000 });
    if (clearbitRes.data && clearbitRes.data.length > 0 && clearbitRes.data[0].domain) {
      const cbDomain = clearbitRes.data[0].domain.toLowerCase();
      const mx = await checkMxRecords(cbDomain);
      if (mx.valid) return cbDomain;
    }
  } catch (err) { }

  // 3.5. Serper Google Search for Company Official Website (Ultra-high accuracy for regional & mid-sized firms)
  if (process.env.SERPER_API_KEY) {
    try {
      const serperRes = await axios.post('https://google.serper.dev/search', {
        q: `${company} official website`,
        num: 4
      }, {
        headers: { 'X-API-KEY': process.env.SERPER_API_KEY, 'Content-Type': 'application/json' },
        timeout: 4000
      });
      const organic = serperRes.data?.organic || [];
      const nonCompany = ['linkedin.', 'facebook.', 'glassdoor.', 'indeed.', 'zaubacorp.', 'tofler.', 'ambitionbox.', 'instahyre.', 'wikipedia.', 'naukri.', 'youtube.', 'twitter.', 'instagram.', 'zoominfo.'];
      for (const o of organic) {
        try {
          const u = new URL(o.link);
          const host = u.hostname.replace(/^www\./, '').toLowerCase();
          if (!nonCompany.some(nc => host.includes(nc))) {
            const mx = await checkMxRecords(host);
            if (mx.valid) return host;
          }
        } catch(e) {}
      }
    } catch(err) { }
  }

  // 4. Candidate domain generation with legal suffix stripping
  const cleanName = company.toLowerCase()
    .replace(/^https?:\/\/(?:www\.)?/i, '')
    .replace(/^httpswww/i, '')
    .replace(/\b(enterprises|technologies|solutions|software|systems|services|pvt|ltd|limited|private|llc|inc|corp|corporation|group|india)\b/gi, '')
    .replace(/[^a-z0-9]/g, '');

  const fullClean = company.toLowerCase().replace(/[^a-z0-9]/g, '');

  const candidates = [
    cleanName ? `${cleanName}.com` : null,
    fullClean ? `${fullClean}.com` : null,
    cleanName ? `${cleanName}.in` : null,
    cleanName ? `${cleanName}.co.in` : null,
    cleanName ? `${cleanName}.io` : null,
    fullClean ? `${fullClean}.in` : null
  ].filter(Boolean);

  for (const dom of candidates) {
    const mx = await checkMxRecords(dom);
    if (mx.valid) return dom;
  }

  return candidates[0] || `${fullClean}.com`;
}

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

            // Filter out system delivery daemon bounces
            if (/mailer-daemon|postmaster|daemon@|bounce@/i.test(rawFromEmail)) {
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
  if (!cleanDomain || cleanDomain.includes('unknown') || cleanDomain.startsWith('http')) {
    cleanDomain = await resolveCompanyDomain(company, applyLink);
  }

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
      }
    } else {
      await learnDeadDomain(company, cleanDomain);
    }
  }

  // Helper to test and accept candidate email
  async function testCandidate(candidate, sourceName, allowDomainMismatch = false) {
    if (!candidate || failedEmails.includes(candidate)) return false;
    
    // Strict Filter: Block system non-recipient inboxes (noreply@, mailer-daemon@, support@, etc.)
    if (isNonRecipientEmail(candidate)) {
      console.log(`[Email Rejected] Discarded non-recipient address "${candidate}"`);
      return false;
    }

    // Strict Domain Match: Prevent cross-company contamination (e.g. premiergp.com for MAK)
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

  // Tier 1: JD Scraper (Authentic Direct Recruiter or Official Hiring Inboxes in Job Description)
  if (!discoveredEmail && jd && jd.length > 0) {
    const emailRegex = /[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}/g;
    const foundEmails = jd.match(emailRegex);
    if (foundEmails && foundEmails.length > 0) {
      const validFound = foundEmails.filter(e => !isNonRecipientEmail(e) && !failedEmails.includes(e));
      if (validFound.length > 0) {
        // 1. First priority: Real named personal recruiter contact in JD
        const personalEmails = validFound.filter(e => !isGenericEmail(e));
        for (const pEmail of personalEmails) {
          if (await testCandidate(pEmail, 'Tier 1 (JD Named Contact)', true)) {
            break;
          }
        }
        // 2. Second priority: Official hiring inboxes explicitly published in the JD
        if (!discoveredEmail) {
          for (const cEmail of validFound) {
            if (await testCandidate(cEmail, 'Tier 1 (JD Official Hiring Inbox)', true)) {
              break;
            }
          }
        }
      }
    }
  }

  // Tier 1.2: Advanced Deep Web Search (OSINT & LinkedIn Contact Info with STRICT Domain Matching)
  if (!discoveredEmail && hrName && process.env.SERPER_API_KEY) {
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
        const validEmails = foundEmails.filter(e => !isNonRecipientEmail(e) && !failedEmails.includes(e));
        if (validEmails.length > 0) {
          for (const em of validEmails) {
            if (await testCandidate(em, 'Tier 1.2 (LinkedIn Recruiter OSINT)', false)) {
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
            if (await testCandidate(em.value, 'Tier 2 (Hunter.io Verified)')) {
              break;
            }
          }
        }
      }
    } catch (err) { }
  }

  // Tier 1.5: HR Name Permutations (Corporate Email Patterns - Hunter Verified Only)
  if (!discoveredEmail && hrName && domainMx.valid && process.env.HUNTER_API_KEY) {
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
        if (!failedEmails.includes(guess) && !isNonRecipientEmail(guess)) {
          const hCheck = await verifyWithHunter(guess);
          if (hCheck.verified && hCheck.isDeliverable) {
            discoveredEmail = guess;
            source = 'Tier 1.5 (HR Name Permutation [Hunter Verified])';
            break;
          }
        }
      }
    }
  }

  // Tier 3: Google Dorking for Company Recruiter on Company Domain
  if (!discoveredEmail && process.env.SERPER_API_KEY && domainMx.valid) {
    try {
      const sRes = await axios.post('https://google.serper.dev/search', {
        q: `"${company}" ("recruiter" OR "talent acquisition" OR "hiring") email "@${cleanDomain}"`
      }, {
        headers: { 'X-API-KEY': process.env.SERPER_API_KEY, 'Content-Type': 'application/json' }
      });
      const snippets = sRes.data?.organic?.map(r => r.snippet).join(' ') || '';
      const emailRegex = /[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}/g;
      const foundEmails = snippets.match(emailRegex);
      if (foundEmails && foundEmails.length > 0) {
        const validEmails = foundEmails.filter(e => !isNonRecipientEmail(e) && !failedEmails.includes(e));
        for (const em of validEmails) {
          if (await testCandidate(em, 'Tier 3 (Company Recruiter Dorking)', false)) {
            break;
          }
        }
      }
    } catch (err) { }
  }

  // Tier 4: Verified Company Recruiting Inboxes Fallback (Resilient Safety Net)
  // When no individual personal email is indexed on the web, use the company's designated recruiting inbox.
  const isInvalidDomain = /\b(sourcingstrategist|technicalrecruiter|juniordeveloper|softwaredeveloper|softwareengineer|talentacquisition)\b/i.test(cleanDomain || '');
  if (!discoveredEmail && domainMx.valid && cleanDomain && !isInvalidDomain) {
    const fallbackInboxes = [
      `careers@${cleanDomain}`,
      `hr@${cleanDomain}`,
      `talent@${cleanDomain}`,
      `jobs@${cleanDomain}`,
      `hiring@${cleanDomain}`
    ];
    for (const candidate of fallbackInboxes) {
      if (!failedEmails.includes(candidate)) {
        discoveredEmail = candidate;
        source = 'Tier 4 (Company Hiring Inbox [MX Verified])';
        verificationInfo = { isValid: true, status: 'mx_valid', reason: 'Official company hiring inbox on active MX server' };
        break;
      }
    }
  }

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
  resolveCompanyDomain,
  verifyEmail,
  checkMxRecords,
  validateEmailSyntax
};

