const CompanyMemory = require('../models/CompanyMemory');

/**
 * Normalizes company name into a clean search key.
 * e.g. "Thermo Fisher Scientific Inc." -> "thermofisher"
 */
function normalizeCompany(name) {
  if (!name || typeof name !== 'string') return '';
  return name
    .toLowerCase()
    .replace(/\b(inc|incorporated|corp|corporation|ltd|limited|pvt|private|llc|gmbh|solutions|technologies|services|consulting|group|systems)\b/gi, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

/**
 * Deduces email pattern format given HR Name and their actual email.
 * e.g. "Kaustubh Kande" + "kaustubh.kande@synechron.com" -> "first.last"
 */
function deducePattern(hrName, email) {
  if (!hrName || !email) return null;
  const parts = hrName.toLowerCase().replace(/[^a-z0-9 ]/g, '').split(' ').filter(Boolean);
  if (parts.length < 2) return null;

  const first = parts[0];
  const last = parts[parts.length - 1];
  const emailUser = email.split('@')[0].toLowerCase();

  if (emailUser === `${first}.${last}`) return 'first.last';
  if (emailUser === `${first}${last}`) return 'firstlast';
  if (emailUser === `${first}_${last}`) return 'first_last';
  if (emailUser === `${first[0]}.${last}`) return 'f.last';
  if (emailUser === `${first[0]}${last}`) return 'flast';
  if (emailUser === `${first[0]}_${last}`) return 'f_last';
  if (emailUser === `${first}.${last[0]}`) return 'first.l';
  if (emailUser === `${first}${last[0]}`) return 'firstl';
  if (emailUser === `${last}.${first}`) return 'last.first';
  if (emailUser === `${last}${first}`) return 'lastfirst';
  if (emailUser === first) return 'first';

  return null;
}

/**
 * Generates an email address for an HR name using a learned pattern.
 */
function generateEmailWithPattern(hrName, domain, pattern) {
  if (!hrName || !domain || !pattern) return null;
  const parts = hrName.toLowerCase().replace(/[^a-z0-9 ]/g, '').split(' ').filter(Boolean);
  if (parts.length < 1) return null;

  const first = parts[0];
  const last = parts.length > 1 ? parts[parts.length - 1] : '';

  let user = '';
  switch (pattern) {
    case 'first.last':
      user = last ? `${first}.${last}` : first;
      break;
    case 'firstlast':
      user = last ? `${first}${last}` : first;
      break;
    case 'first_last':
      user = last ? `${first}_${last}` : first;
      break;
    case 'f.last':
      user = last ? `${first[0]}.${last}` : first;
      break;
    case 'flast':
      user = last ? `${first[0]}${last}` : first;
      break;
    case 'f_last':
      user = last ? `${first[0]}_${last}` : first;
      break;
    case 'first.l':
      user = last ? `${first}.${last[0]}` : first;
      break;
    case 'firstl':
      user = last ? `${first}${last[0]}` : first;
      break;
    case 'last.first':
      user = last ? `${last}.${first}` : first;
      break;
    case 'lastfirst':
      user = last ? `${last}${first}` : first;
      break;
    case 'first':
      user = first;
      break;
    default:
      user = last ? `${first}.${last}` : first;
  }

  return `${user}@${domain}`;
}

/**
 * Memory query: Retrieves learned company knowledge.
 */
async function getLearnedMemory(company) {
  const key = normalizeCompany(company);
  if (!key) return null;
  try {
    return await CompanyMemory.findOne({ companyKey: key });
  } catch (err) {
    return null;
  }
}

/**
 * Learns from a verified discovery or send.
 */
async function learnFromVerifiedEmail(company, domain, email, hrName = null) {
  const key = normalizeCompany(company);
  if (!key || !domain || !email) return;

  try {
    let memory = await CompanyMemory.findOne({ companyKey: key });
    if (!memory) {
      memory = new CompanyMemory({
        companyKey: key,
        displayName: company,
        verifiedDomain: domain,
        successfulRecipients: [email]
      });
    } else {
      if (domain && !memory.verifiedDomain) memory.verifiedDomain = domain;
      if (!memory.successfulRecipients.includes(email)) {
        memory.successfulRecipients.push(email);
      }
    }

    // Deduce and store pattern if HR Name is available
    if (hrName) {
      const pattern = deducePattern(hrName, email);
      if (pattern) {
        memory.learnedPattern = pattern;
        memory.patternConfidence = Math.min(100, (memory.patternConfidence || 50) + 15);
        console.log(`🧠 [Self-Learning] Learned email pattern for "${company}": "${pattern}"`);
      }
    }

    await memory.save();
  } catch (err) {
    console.error('Error saving company memory:', err.message);
  }
}

/**
 * Learns dead domains to never query or guess them again.
 */
async function learnDeadDomain(company, domain) {
  const key = normalizeCompany(company);
  if (!key || !domain) return;

  try {
    let memory = await CompanyMemory.findOne({ companyKey: key });
    if (!memory) {
      memory = new CompanyMemory({
        companyKey: key,
        displayName: company,
        deadDomains: [domain]
      });
    } else {
      if (!memory.deadDomains.includes(domain)) {
        memory.deadDomains.push(domain);
      }
    }
    await memory.save();
    console.log(`🧠 [Self-Learning] Blacklisted dead domain "${domain}" for "${company}"`);
  } catch (err) {}
}

/**
 * Learns from email opens (High positive signal).
 */
async function learnFromOpen(company, email) {
  const key = normalizeCompany(company);
  if (!key) return;

  try {
    const memory = await CompanyMemory.findOne({ companyKey: key });
    if (memory) {
      memory.totalOpened = (memory.totalOpened || 0) + 1;
      memory.patternConfidence = 95; // Confirmed deliverable & read
      await memory.save();
      console.log(`🧠 [Self-Learning] Reinforced deliverability memory for "${company}" (Opened)`);
    }
  } catch (err) {}
}

/**
 * Learns from bounces (Negative signal: invalidates bad email & lowers pattern confidence).
 */
async function learnFromBounce(company, failedEmail) {
  const key = normalizeCompany(company);
  if (!key || !failedEmail) return;

  try {
    let memory = await CompanyMemory.findOne({ companyKey: key });
    if (memory) {
      if (!memory.bouncedRecipients.includes(failedEmail)) {
        memory.bouncedRecipients.push(failedEmail);
      }
      memory.totalBounced = (memory.totalBounced || 0) + 1;
      memory.patternConfidence = Math.max(0, (memory.patternConfidence || 50) - 30);
      await memory.save();
      console.log(`🧠 [Self-Learning] Recorded bounce for "${company}" -> ${failedEmail}`);
    }
  } catch (err) {}
}

module.exports = {
  normalizeCompany,
  deducePattern,
  generateEmailWithPattern,
  getLearnedMemory,
  learnFromVerifiedEmail,
  learnDeadDomain,
  learnFromOpen,
  learnFromBounce
};
