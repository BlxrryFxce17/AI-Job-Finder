const dns = require('dns');
const dnsPromises = dns.promises;
const axios = require('axios');

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
  'null.com'
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

const GENERIC_BOT_USERNAMES = [
  'careers',
  'career',
  'jobs',
  'job',
  'recruiting',
  'recruitment',
  'talent',
  'people',
  'info',
  'contact',
  'contactus',
  'support',
  'admin',
  'help',
  'apply',
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
  'hire',
  'hiring',
  'resumes',
  'cv',
  'hr',
  'hrd',
  'noreply',
  'no-reply',
  'donotreply',
  'auto-reply',
  'automated',
  'mailer-daemon',
  'postmaster'
];

/**
 * Checks if an email is a generic bot / shared inbox alias rather than a real person.
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
  
  // Basic RFC 5322 compatible regex
  const regex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
  if (!regex.test(trimmed)) return false;

  const parts = trimmed.split('@');
  if (parts.length !== 2) return false;
  const [userPart, domain] = parts;

  // Reject placeholder/sample usernames (e.g. first.last@company.com extracted from blog posts)
  if (PLACEHOLDER_USERNAMES.includes(userPart)) {
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
          return { priority: parseInt(parts[0], 10) || 10, exchange: parts[1] || a.data };
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

/**
 * Checks if a domain has active DNS MX records.
 */
async function checkMxRecords(domain) {
  if (!domain) return { valid: false, reason: 'Missing domain' };
  const cleanDomain = domain.trim().toLowerCase();

  // Try Native Node.js DNS first
  try {
    const resolvePromise = dnsPromises.resolveMx(cleanDomain);
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('DNS lookup timeout')), 2500)
    );

    const mxRecords = await Promise.race([resolvePromise, timeoutPromise]);
    
    if (mxRecords && mxRecords.length > 0) {
      mxRecords.sort((a, b) => a.priority - b.priority);
      return { valid: true, mxRecords };
    }
    return { valid: false, reason: 'No MX records found' };
  } catch (err) {
    // If native DNS fails with connection refusal or timeout, use HTTPS DNS fallback
    const dohResult = await checkMxRecordsDoH(cleanDomain);
    if (dohResult.valid) {
      return dohResult;
    }
    return { valid: false, reason: dohResult.reason || err.message };
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
    const response = await axios.get(url, { timeout: 5000 });
    const data = response.data?.data;

    if (!data) {
      return { skipped: true, reason: 'No data returned from Hunter' };
    }

    const { status, score, result } = data;
    // Status can be: 'valid', 'invalid', 'accept_all', 'webmail', 'disposable', 'unknown'
    const isDeliverable = status === 'valid' || (status === 'accept_all' && (score || 0) >= 50);

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
      console.warn('[Hunter Verifier] Rate limit reached (429). Falling back to DNS/MX validation for 60s.');
    } else {
      console.warn(`[Hunter Verifier] Verification skipped for ${email}: ${err.message}`);
    }
    return { skipped: true, error: err.message };
  }
}

/**
 * Comprehensive email verification pipeline:
 * 1. Syntax check & dummy domain exclusion
 * 2. DNS MX records resolution (with DoH fallback)
 * 3. Deep API verification (Hunter.io) if configured
 */
async function verifyEmail(email) {
  if (!validateEmailSyntax(email)) {
    return {
      isValid: false,
      score: 0,
      status: 'invalid_syntax',
      reason: 'Invalid email syntax or dummy domain'
    };
  }

  const cleanEmail = email.trim().toLowerCase();
  const domain = cleanEmail.split('@')[1];

  // 1. Check MX records
  const mxResult = await checkMxRecords(domain);
  if (!mxResult.valid) {
    return {
      isValid: false,
      score: 0,
      status: 'no_mx_records',
      reason: mxResult.reason || 'Domain cannot receive emails (No MX records)'
    };
  }

  // 2. Deep API Verification (if Hunter API Key is available)
  const hunterResult = await verifyWithHunter(cleanEmail);
  if (hunterResult.verified) {
    if (!hunterResult.isDeliverable) {
      return {
        isValid: false,
        score: hunterResult.score,
        status: hunterResult.status,
        reason: `Email marked as ${hunterResult.status} by Hunter.io (score: ${hunterResult.score}%)`
      };
    }

    return {
      isValid: true,
      score: hunterResult.score,
      status: hunterResult.status,
      details: hunterResult.details
    };
  }

  // Fallback: Valid MX server found
  return {
    isValid: true,
    score: 75,
    status: 'mx_valid',
    reason: 'Valid MX mail server found'
  };
}

module.exports = {
  validateEmailSyntax,
  checkMxRecords,
  verifyWithHunter,
  verifyEmail,
  isGenericEmail,
  GENERIC_BOT_USERNAMES
};
