const dns = require('dns');
const dnsPromises = dns.promises;
const axios = require('axios');
const net = require('net');

// Set high-reliability DNS resolvers (Google & Cloudflare) to prevent Windows ECONNREFUSED issues
try {
  dns.setServers(['8.8.8.8', '1.1.1.1', '8.8.4.4']);
} catch (e) {
  // Ignore if runtime restricts setServers
}

const DUMMY_DOMAINS = [
  'example.com',
  'test.com',
  'sample.com',
  'domain.com',
  'email.com',
  'company.com',
  'yourcompany.com',
  'xyz.com',
  'null.com',
  'unknown.com'
];

const DISPOSABLE_DOMAINS = [
  'mailinator.com',
  'tempmail.com',
  'guerrillamail.com',
  '10minutemail.com',
  'throwawaymail.com',
  'yopmail.com',
  'sharklasers.com',
  'dispostable.com',
  'trashmail.com'
];

const PLACEHOLDER_USERNAMES = [
  'first.last',
  'firstlast',
  'first_last',
  'firstname.lastname',
  'firstname_lastname',
  'first.middle.last',
  'john.doe',
  'johndoe',
  'jane.doe',
  'janedoe',
  'doe.john',
  'username',
  'user',
  'name',
  'yourname',
  'sample',
  'test',
  'example',
  'someone',
  'xxx',
  'xxxx',
  'null',
  'undefined'
];

const NON_RECIPIENT_USERNAMES = [
  'noreply',
  'no-reply',
  'donotreply',
  'auto-reply',
  'automated',
  'mailer-daemon',
  'postmaster',
  'abuse',
  'security',
  'billing',
  'invoices',
  'support',
  'help',
  'admin',
  'root',
  'daemon'
];

const RECRUITING_INBOX_USERNAMES = [
  'careers',
  'career',
  'jobs',
  'job',
  'recruiting',
  'recruitment',
  'talent',
  'people',
  'apply',
  'resumes',
  'cv',
  'hr',
  'hrd',
  'hiring'
];

const GENERIC_BOT_USERNAMES = [
  ...NON_RECIPIENT_USERNAMES,
  ...RECRUITING_INBOX_USERNAMES,
  'info',
  'contact',
  'contactus',
  'team',
  'inquiries',
  'press',
  'sales',
  'mail',
  'office',
  'service',
  'hello',
  'work',
  'joinus',
  'hire'
];

/**
 * Checks if an email is a system bot, bounce handler, or non-deliverable mailbox.
 */
function isNonRecipientEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const user = email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
  return NON_RECIPIENT_USERNAMES.includes(user);
}

/**
 * Checks if an email is an official company hiring / talent acquisition mailbox.
 */
function isRecruitingEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const user = email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
  return RECRUITING_INBOX_USERNAMES.includes(user);
}

/**
 * Checks if an email is a generic shared inbox alias rather than a named individual.
 */
function isGenericEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const user = email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
  return GENERIC_BOT_USERNAMES.includes(user);
}

/**
 * Validates email format and rejects dummy/test domains and placeholder names.
 */
function validateEmailSyntax(email) {
  if (!email || typeof email !== 'string') return false;
  const trimmed = email.trim().toLowerCase();
  
  // RFC 5322 compatible regex
  const regex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
  if (!regex.test(trimmed)) return false;

  const parts = trimmed.split('@');
  if (parts.length !== 2) return false;
  const [userPart, domain] = parts;

  // Reject placeholder/sample usernames (e.g. first.last@company.com)
  if (PLACEHOLDER_USERNAMES.includes(userPart)) {
    return false;
  }

  // Reject fabricated / synthetic agency domains
  if (/\b(directrecruiteragency|sourcingstrategist|technicalrecruiter|juniordeveloper|softwaredeveloper)\b/i.test(domain)) {
    return false;
  }

  if (DUMMY_DOMAINS.includes(domain) || DISPOSABLE_DOMAINS.includes(domain)) {
    return false;
  }

  return true;
}

/**
 * Fallback to DNS-over-HTTPS via Cloudflare/Google if native UDP DNS fails or is blocked.
 */
async function checkMxRecordsDoH(domain) {
  try {
    const res = await axios.get(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=MX`, {
      headers: { 'Accept': 'application/dns-json' },
      timeout: 3500
    });
    const answers = res.data?.Answer;
    if (answers && answers.length > 0) {
      const mxList = answers
        .filter(a => a.type === 15) // Type 15 is MX
        .map(a => {
          const parts = (a.data || '').split(' ');
          return { priority: parseInt(parts[0], 10) || 10, exchange: (parts[1] || a.data || '').replace(/\.$/, '') };
        });
      if (mxList.length > 0) {
        return { valid: true, mxRecords: mxList };
      }
    }
    return { valid: false, reason: 'No MX records found via DoH' };
  } catch (err) {
    return { valid: false, reason: err.message };
  }
}

// In-Memory High-Performance Caches
const mxCache = new Map(); // domain -> { timestamp, data }
const disifyCache = new Map(); // email -> { timestamp, data }

/**
 * Checks if a domain has active DNS MX records (with 15-minute TTL cache).
 */
async function checkMxRecords(domain) {
  if (!domain) return { valid: false, reason: 'Missing domain' };
  const cleanDomain = domain.trim().toLowerCase();

  // Check cache first (15-min TTL)
  const cached = mxCache.get(cleanDomain);
  if (cached && (Date.now() - cached.timestamp < 15 * 60 * 1000)) {
    return cached.data;
  }

  let result = null;

  // Try Native Node.js DNS first
  try {
    const resolvePromise = dnsPromises.resolveMx(cleanDomain);
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('DNS lookup timeout')), 2500)
    );

    const mxRecords = await Promise.race([resolvePromise, timeoutPromise]);
    
    if (mxRecords && mxRecords.length > 0) {
      mxRecords.sort((a, b) => a.priority - b.priority);
      result = { valid: true, mxRecords };
    } else {
      result = { valid: false, reason: 'No MX records found' };
    }
  } catch (err) {
    // If native DNS fails with connection refusal or timeout, use HTTPS DNS fallback
    const dohResult = await checkMxRecordsDoH(cleanDomain);
    if (dohResult.valid) {
      result = dohResult;
    } else {
      result = { valid: false, reason: dohResult.reason || err.message };
    }
  }

  // Cache valid or invalid result for 15 minutes (prune if cache > 1000 items)
  if (mxCache.size > 1000) mxCache.clear();
  mxCache.set(cleanDomain, { timestamp: Date.now(), data: result });
  return result;
}

/**
 * Free open-source validation via Disify API with 30-minute TTL caching.
 * Detects format, disposable domains, role accounts, and active DNS.
 */
async function verifyWithDisify(email) {
  if (!email) return { skipped: true };
  const cleanEmail = email.trim().toLowerCase();

  // Check cache first (30-min TTL)
  const cached = disifyCache.get(cleanEmail);
  if (cached && (Date.now() - cached.timestamp < 30 * 60 * 1000)) {
    return cached.data;
  }

  try {
    const res = await axios.get(`https://disify.com/api/email/${encodeURIComponent(cleanEmail)}`, {
      timeout: 3000
    });
    const data = res.data;
    if (!data) return { skipped: true };

    const isDisposable = !!data.disposable;
    const hasDns = data.dns !== false;
    const isRole = !!data.role;

    const result = {
      verified: true,
      isDisposable,
      hasDns,
      isRole,
      signals: data.signals || []
    };

    if (disifyCache.size > 1000) disifyCache.clear();
    disifyCache.set(cleanEmail, { timestamp: Date.now(), data: result });
    return result;
  } catch (err) {
    return { skipped: true, error: err.message };
  }
}

let hunterRateLimitedUntil = 0;

/**
 * Verifies email deliverability using Hunter.io API if API key is present.
 */
async function verifyWithHunter(email) {
  const apiKey = process.env.HUNTER_API_KEY;
  if (!apiKey) return { skipped: true };

  // If rate limited, skip Hunter check until cooldown expires
  if (Date.now() < hunterRateLimitedUntil) {
    return { skipped: true, reason: 'Hunter API rate limited (cooldown active)' };
  }

  try {
    const url = `https://api.hunter.io/v2/email-verifier?email=${encodeURIComponent(email)}&api_key=${apiKey}`;
    const response = await axios.get(url, { timeout: 4500 });
    const data = response.data?.data;

    if (!data) {
      return { skipped: true, reason: 'No data returned from Hunter' };
    }

    const { status, score, result } = data;
    // Status can be: 'valid', 'invalid', 'accept_all', 'webmail', 'disposable', 'unknown'
    const isDeliverable = status === 'valid' || (status === 'accept_all' && (score || 0) >= 60);

    return {
      verified: true,
      isDeliverable,
      status: status || result,
      score: score || 0,
      details: data
    };
  } catch (err) {
    if (err.response && err.response.status === 429) {
      hunterRateLimitedUntil = Date.now() + 60 * 1000; // 60s cooldown
      console.warn('[Hunter Verifier] Rate limit reached (429). Falling back to multi-layer validation.');
    }
    return { skipped: true, error: err.message };
  }
}

/**
 * Direct zero-send SMTP Handshake probe on port 25.
 * Connects to MX server, sends HELO -> MAIL FROM -> RCPT TO, and checks response code.
 * Terminates with QUIT without ever sending an email body.
 */
function verifySmtpMailbox(email, mxHost, timeoutMs = 3500) {
  return new Promise((resolve) => {
    if (!mxHost) return resolve({ verified: false, reason: 'No MX host provided' });

    const socket = net.createConnection(25, mxHost);
    let step = 0;
    let resolved = false;

    const cleanup = (result) => {
      if (resolved) return;
      resolved = true;
      try {
        socket.write('QUIT\r\n');
        socket.end();
        socket.destroy();
      } catch (e) {}
      resolve(result);
    };

    socket.setTimeout(timeoutMs);

    socket.on('timeout', () => {
      cleanup({ verified: false, status: 'timeout', reason: 'SMTP port 25 connection timed out (likely ISP blocked)' });
    });

    socket.on('error', (err) => {
      cleanup({ verified: false, status: 'socket_error', reason: err.message });
    });

    socket.on('data', (data) => {
      const msg = data.toString();
      const code = parseInt(msg.substring(0, 3), 10);

      // Step 0: Server Greeting (220)
      if (step === 0 && code === 220) {
        step = 1;
        socket.write('EHLO verify-sender.net\r\n');
      }
      // Step 1: EHLO Response (250)
      else if (step === 1 && (code === 250 || code === 220)) {
        step = 2;
        socket.write('MAIL FROM:<check@verify-sender.net>\r\n');
      }
      // Step 2: MAIL FROM Response (250)
      else if (step === 2 && code === 250) {
        step = 3;
        socket.write(`RCPT TO:<${email}>\r\n`);
      }
      // Step 3: RCPT TO Response (Crucial test)
      else if (step === 3) {
        if (code === 250 || code === 251) {
          cleanup({ verified: true, isDeliverable: true, code, status: 'mailbox_confirmed', message: msg.trim() });
        } else if (code === 550 || code === 551 || code === 553 || code === 554) {
          cleanup({ verified: true, isDeliverable: false, code, status: 'mailbox_not_found', message: msg.trim() });
        } else if (code >= 400 && code < 500) {
          cleanup({ verified: false, isDeliverable: null, code, status: 'greylisted', message: msg.trim() });
        } else {
          cleanup({ verified: false, code, status: 'unknown_response', message: msg.trim() });
        }
      }
    });
  });
}

/**
 * Comprehensive 5-Layer Email Verification & Scoring Engine:
 * 1. Syntax check & dummy/synthetic domain exclusion
 * 2. DNS MX records resolution (with DoH fallback)
 * 3. Free Disify validation (disposable, format, dns)
 * 4. Deep API verification (Hunter.io) if configured
 * 5. Direct SMTP Handshake probe
 * 
 * Returns Deliverability Safety Object:
 * {
 *   isValid: boolean,       // true ONLY if safe to send without high bounce risk
 *   score: number,          // 0 to 100
 *   status: string,         // 'deliverable', 'risky', 'undeliverable'
 *   reason: string,
 *   canAutoSend: boolean
 * }
 */
async function verifyEmail(email, options = {}) {
  const isJdEmail = Boolean(options.isJdEmail || options.isFromJd); // True if email was explicitly written inside the Job Description

  if (!validateEmailSyntax(email)) {
    return {
      isValid: false,
      score: 0,
      deliverabilityScore: 0,
      status: 'undeliverable',
      reason: 'Invalid email syntax, placeholder, or synthetic domain',
      canAutoSend: false
    };
  }

  const cleanEmail = email.trim().toLowerCase();
  const domain = cleanEmail.split('@')[1];

  const finalizeResult = (res) => {
    const icon = res.status === 'deliverable' ? '✅' : res.status === 'risky' ? '⚠️' : '❌';
    console.log(`${icon} [Email Verifier] ${cleanEmail} -> ${res.status.toUpperCase()} (${res.score}%) | ${res.reason}`);
    return res;
  };

  // 1. Check MX records
  const mxResult = await checkMxRecords(domain);
  if (!mxResult.valid) {
    return finalizeResult({
      isValid: false,
      score: 0,
      deliverabilityScore: 0,
      status: 'undeliverable',
      reason: mxResult.reason || 'Domain has no active mail servers (No MX records)',
      canAutoSend: false
    });
  }

  const primaryMx = mxResult.mxRecords?.[0]?.exchange;

  // 2. Disify check (Disposable & Role filter)
  const disifyResult = await verifyWithDisify(cleanEmail);
  if (disifyResult.verified) {
    if (disifyResult.isDisposable) {
      return finalizeResult({
        isValid: false,
        score: 0,
        deliverabilityScore: 0,
        status: 'undeliverable',
        reason: 'Disposable / temporary email address',
        canAutoSend: false
      });
    }
    if (!disifyResult.hasDns) {
      return finalizeResult({
        isValid: false,
        score: 0,
        deliverabilityScore: 0,
        status: 'undeliverable',
        reason: 'Domain has no active DNS according to verification registry',
        canAutoSend: false
      });
    }
  }

  // 3. Hunter.io Deep Verification (if active)
  const hunterResult = await verifyWithHunter(cleanEmail);
  if (hunterResult.verified) {
    if (!hunterResult.isDeliverable) {
      const hScore = hunterResult.score || 10;
      return finalizeResult({
        isValid: false,
        score: hScore,
        deliverabilityScore: hScore,
        status: 'undeliverable',
        reason: `Email marked as non-deliverable by Hunter (${hunterResult.status})`,
        canAutoSend: false
      });
    }

    const hScore = Math.max(hunterResult.score || 90, 85);
    return finalizeResult({
      isValid: true,
      score: hScore,
      deliverabilityScore: hScore,
      status: 'deliverable',
      reason: `Verified deliverable by Hunter API (${hunterResult.status})`,
      canAutoSend: true
    });
  }

  // 4. Direct SMTP Handshake probe
  if (primaryMx) {
    const smtpResult = await verifySmtpMailbox(cleanEmail, primaryMx, 3000);
    if (smtpResult.verified) {
      if (smtpResult.isDeliverable === false) {
        return finalizeResult({
          isValid: false,
          score: 0,
          deliverabilityScore: 0,
          status: 'undeliverable',
          reason: `Mailbox does not exist on recipient server (550 User Unknown)`,
          canAutoSend: false
        });
      }
      if (smtpResult.isDeliverable === true) {
        return finalizeResult({
          isValid: true,
          score: 98,
          deliverabilityScore: 98,
          status: 'deliverable',
          reason: 'Confirmed deliverable by recipient mail server (250 OK)',
          canAutoSend: true
        });
      }
    }
  }

  // 5. Special Trusted Source: If the email was explicitly published in the official Job Description
  if (isJdEmail) {
    return finalizeResult({
      isValid: true,
      score: 90,
      deliverabilityScore: 90,
      status: 'deliverable',
      reason: 'Authentic contact point published directly in Job Description',
      canAutoSend: true
    });
  }

  // 6. Unconfirmed Mailbox Fallback
  // CRITICAL RULE: If only the domain's MX exists, but the individual mailbox could not be confirmed,
  // NEVER approve it blindly for auto-sending! That is what caused previous 550 bounces.
  return finalizeResult({
    isValid: false,
    score: 45,
    deliverabilityScore: 45,
    status: 'risky',
    reason: 'Active mail server found, but individual mailbox unconfirmed (Requires manual review to prevent bounce)',
    canAutoSend: false
  });
}

module.exports = {
  validateEmailSyntax,
  checkMxRecords,
  verifyWithHunter,
  verifyWithDisify,
  verifySmtpMailbox,
  verifyEmail,
  isGenericEmail,
  isNonRecipientEmail,
  isRecruitingEmail,
  NON_RECIPIENT_USERNAMES,
  RECRUITING_INBOX_USERNAMES,
  GENERIC_BOT_USERNAMES
};
