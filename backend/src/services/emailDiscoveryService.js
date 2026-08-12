const axios = require('axios');
const config = require('../config');
const logger = require('../utils/logger');
const { callAIWithRetry } = require('./aiService');

// Company domain mapping for common companies
const COMPANY_DOMAIN_MAP = {
  'google': 'google.com',
  'microsoft': 'microsoft.com',
  'amazon': 'amazon.com',
  'apple': 'apple.com',
  'meta': 'meta.com',
  'facebook': 'meta.com',
  'netflix': 'netflix.com',
  'tesla': 'tesla.com',
  'uber': 'uber.com',
  'airbnb': 'airbnb.com',
  'stripe': 'stripe.com',
  'shopify': 'shopify.com',
  'spotify': 'spotify.com',
  'twitter': 'twitter.com',
  'x': 'x.com',
  'linkedin': 'linkedin.com',
  'github': 'github.com',
  'gitlab': 'gitlab.com',
  'atlassian': 'atlassian.com',
  'salesforce': 'salesforce.com',
  'oracle': 'oracle.com',
  'ibm': 'ibm.com',
  'intel': 'intel.com',
  'nvidia': 'nvidia.com',
  'amd': 'amd.com',
  'adobe': 'adobe.com',
  'jpmorgan': 'jpmorganchase.com',
  'j.p. morgan': 'jpmorganchase.com',
  'citibank': 'citibank.com',
  'citi': 'citibank.com',
  'goldman sachs': 'goldmansachs.com',
  'morgan stanley': 'morganstanley.com',
  'bank of america': 'bankofamerica.com',
  'wells fargo': 'wellsfargo.com',
};

function getCompanyDomain(company) {
  const normalized = company.toLowerCase().trim();
  
  // Check exact matches first
  if (COMPANY_DOMAIN_MAP[normalized]) {
    return COMPANY_DOMAIN_MAP[normalized];
  }
  
  // Check partial matches
  for (const [key, domain] of Object.entries(COMPANY_DOMAIN_MAP)) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return domain;
    }
  }
  
  // Fallback: sanitize company name to domain format
  return normalized.replace(/[^a-z0-9]/g, '') + '.com';
}

/**
 * Sanitize user-provided AI instructions to prevent prompt injection
 */
function sanitizeAiInstructions(instructions) {
  if (!instructions || typeof instructions !== 'string') return '';
  
  // Remove potential prompt injection patterns
  const dangerousPatterns = [
    /ignore\s+previous\s+instructions/gi,
    /ignore\s+all\s+(previous\s+)?(instructions|prompts)/gi,
    /disregard\s+(previous\s+)?(instructions|prompts)/gi,
    /forget\s+(everything|all\s+previous)/gi,
    /system\s*:/gi,
    /assistant\s*:/gi,
    /user\s*:/gi,
    /```/g, // Remove markdown code blocks
    /<\/?[a-z]+>/gi, // Remove HTML tags
  ];
  
  let sanitized = instructions;
  for (const pattern of dangerousPatterns) {
    sanitized = sanitized.replace(pattern, '');
  }
  
  // Limit length and trim
  sanitized = sanitized.trim().substring(0, 500);
  
  // Only allow alphanumeric, basic punctuation, and common symbols
  sanitized = sanitized.replace(/[^\w\s.,!?@#$%&*()\-_=+\[\]{}|;:'"\/\\<>~`]/g, '');
  
  return sanitized;
}

/**
 * Discover email for a job using multiple tiers
 */
async function discoverEmailForJob(company, domain, jd, failedEmails = []) {
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
      } catch (err) {
        logger.warn('[Email Discovery] Tier 1 failed', { error: err.message });
      }
    }
  }
  
  // Tier 2: Hunter.io API
  if (!discoveredEmail && config.hunterApiKey) {
    try {
      const hRes = await axios.get(`https://api.hunter.io/v2/domain-search?domain=${domain}&api_key=${config.hunterApiKey}&department=hr`);
      const emails = hRes.data?.data?.emails;
      if (emails && emails.length > 0) {
        discoveredEmail = emails[0].value;
        source = 'Tier 2 (Hunter.io)';
      }
    } catch (err) {
      logger.warn('[Email Discovery] Tier 2 failed', { error: err.message });
    }
  }
  
  // Tier 3: Serper.dev (Google Dorking) + AI Judge
  if (!discoveredEmail && config.serperApiKey) {
    try {
      const sRes = await axios.post('https://google.serper.dev/search', {
        q: `"${company}" "careers" OR "hr" OR "recruiter" email "@${domain}"`
      }, {
        headers: { 'X-API-KEY': config.serperApiKey, 'Content-Type': 'application/json' }
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
    } catch (err) {
      logger.warn('[Email Discovery] Tier 3 failed', { error: err.message });
    }
  }
  
  // Filter out failed emails
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
  
  logger.info('[Email Discovery] Result', { company, email: discoveredEmail, source });
  return { email: discoveredEmail, source };
}

module.exports = {
  getCompanyDomain,
  sanitizeAiInstructions,
  discoverEmailForJob
};