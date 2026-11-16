const axios = require('axios');
const cheerio = require('cheerio');
const { deducePattern, generateEmailWithPattern } = require('./learningEngine');
const { fetchPublicPage } = require('./companyDomains');
const { partitionRecipients } = require('./recipientBatch');
const fold = value => String(value || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]/g, '');
function nameMatchesEmail(name, email) {
  const parts = String(name || '').trim().split(/\s+/).map(fold).filter(Boolean);
  if (parts.length < 2) return false;
  const first = parts[0], last = parts.at(-1), local = fold(String(email).split('@')[0]);
  return [first + last, first[0] + last, first + last[0], last + first, last + first[0]].includes(local);
}
function publicationMatches(name, email, text) {
  if (!nameMatchesEmail(name, email)) return false;
  const parts = name.trim().split(/\s+/).map(fold).filter(Boolean);
  const local = fold(email.split('@')[0]);
  if (local === parts[0] + parts.at(-1) || local === parts.at(-1) + parts[0]) return true;
  const index = String(text).toLowerCase().indexOf(email.toLowerCase());
  const surrounding = index < 0 ? text : String(text).slice(Math.max(0, index - 250), index + email.length + 250);
  return fold(surrounding).includes(fold(name));
}
function extractEmails(text, domain) {
  const normalized = String(text || '').replace(/\s*(?:\[at\]|\(at\))\s*/gi, '@').replace(/\s*(?:\[dot\]|\(dot\))\s*/gi, '.');
  return [...new Set((normalized.match(/[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,63}/gi) || []).map(e => e.toLowerCase().replace(/[.,;]+$/, '')))].filter(email => email.split('@')[1] === domain || email.split('@')[1]?.endsWith('.' + domain));
}
async function officialContactPages(domain) {
  const root = await fetchPublicPage(`https://${domain}`);
  const $ = cheerio.load(root.html);
  const pages = [{ url: root.url, text: $.text() + ' ' + $('a[href^="mailto:"]').map((_, a) => $(a).attr('href')).get().join(' ') }];
  const urls = new Set();
  $('a[href]').each((_, a) => {
    try { const u = new URL($(a).attr('href'), root.url); if (u.hostname.replace(/^www\./, '') === domain && /careers|contact|team|about|recruit/i.test(u.pathname)) { u.hash = ''; urls.add(u.href); } } catch {}
  });
  for (const url of [...urls].slice(0, 3)) {
    try { const page = await fetchPublicPage(url); const doc = cheerio.load(page.html); pages.push({ url: page.url, text: doc.text() + ' ' + doc('a[href^="mailto:"]').map((_, a) => doc(a).attr('href')).get().join(' ') }); } catch {}
  }
  return pages;
}
async function publicContacts(name, company, domain, userId) {
  const q = `"${name.replace(/"/g, '')}" "${company.replace(/"/g, '')}" "@${domain}"`;
  if (process.env.SERPER_API_KEY) {
    const result = await axios.post('https://google.serper.dev/search', { q, num: 5 }, { headers: { 'X-API-KEY': process.env.SERPER_API_KEY }, timeout: 6000 });
    require('./ai').recordApiUsage({ userId, service: 'Serper', action: 'Recruiter Contact Search', status: 'success' });
    return (result.data?.organic || []).map(item => ({ url: item.link, text: `${item.title || ''} ${item.snippet || ''}` }));
  }
  if (process.env.TAVILY_API_KEY) {
    const result = await axios.post('https://api.tavily.com/search', { api_key: process.env.TAVILY_API_KEY, query: q, max_results: 5 }, { timeout: 7000 });
    require('./ai').recordApiUsage({ userId, service: 'Tavily', action: 'Recruiter Contact Search', status: 'success' });
    return (result.data?.results || []).map(item => ({ url: item.url, text: `${item.title || ''} ${item.content || ''}` }));
  }
  return [];
}
async function hunterContact(name, domain, userId) {
  if (!process.env.HUNTER_API_KEY) return null;
  const parts = name.trim().split(/\s+/);
  const result = await axios.get('https://api.hunter.io/v2/email-finder', { params: { api_key: process.env.HUNTER_API_KEY, domain, first_name: parts[0], last_name: parts.at(-1) }, timeout: 7000 });
  require('./ai').recordApiUsage({ userId, service: 'Hunter', action: 'Recruiter Name And Domain Lookup', status: 'success' });
  return result.data?.data?.email ? { email: result.data.data.email, url: result.data.data.sources?.[0]?.uri || '', method: 'provider-name-domain' } : null;
}
function createRecruiterEmailFinder(overrides = {}) {
  return async function find(job, userId) {
    if (!userId) throw new Error('An authenticated user is required');
    const emailUtils = require('./email');
    const verify = overrides.verify || emailUtils.verifyEmail;
    const resolve = overrides.resolve || emailUtils.resolveCompanyDomain;
    const getRules = overrides.rules || (async () => require('../models/Blocklist').find({ userId }).lean());
    const getHistory = overrides.history || (async domain => require('../models/Job').find({ userId, 'hrEmailEvidence.domain': domain, 'hrEmailEvidence.inferred': false, 'hrEmailEvidence.mailboxConfirmed': true }).select('hrName emailRecipient').limit(30).lean());
    if (!job.hrName) return { state: 'needs_employer', reason: 'Add the recruiter name before looking up an email.', recipients: [] };
    let employerResolution;
    if (!job.company || /^(?:unknown employer|unknown company|direct recruiter(?:\s*\/\s*agency)?|recruiter\s*\/\s*agency)$/i.test(job.company)) {
      employerResolution = await (overrides.employer || require('./recruiterEmployer').resolveRecruiterEmployer)(job, userId);
      if (!employerResolution?.company) return { state: 'needs_employer', reason: 'The current employer could not be confirmed from this profile. Add the company on this card to continue.', recipients: [], diagnostics: employerResolution?.diagnostics || [] };
      const plain = job.toObject ? job.toObject() : job;
      job = { ...plain, company: employerResolution.company, jd: employerResolution.snippet || job.jd };
    }
    const finish = result => ({ ...result, ...(employerResolution?.company ? { resolvedEmployer: employerResolution } : {}) });
    const diagnostics = [...(employerResolution?.diagnostics || [])];
    const issue = (provider, err) => [402, 429].includes(err.response?.status) || /credit|quota/i.test(err.response?.data?.message || '') ? `${provider} quota or rate limit reached` : err.code === 'ECONNABORTED' ? `${provider} timed out` : `${provider} failed`;
    if (!overrides.search && !process.env.SERPER_API_KEY && !process.env.TAVILY_API_KEY) diagnostics.push('Public contact search is not configured');
    if (!overrides.hunter && !process.env.HUNTER_API_KEY) diagnostics.push('Name-and-domain provider lookup is not configured');
    const domain = await resolve(job.company, job.hrEvidence?.employerWebsite || null);
    if (!domain) return finish({ state: 'not_found', reason: 'Employer found, but its email domain could not be confirmed. Add the official domain on this card.', recipients: [], diagnostics });
    const rules = await getRules();
    const domainBlocked = rules.find(r => r.type === 'domain' && r.value?.toLowerCase() === domain);
    if (domainBlocked) return finish({ state: 'blocked', reason: domainBlocked.reason || 'Employer domain is on your blocklist', recipients: [] });
    const candidates = [], seen = new Set();
    const add = (email, method, url, inferred = false) => {
      email = String(email || '').toLowerCase().trim();
      if (seen.has(email) || !extractEmails(email, domain).includes(email) || (job.failedEmails || []).includes(email)) return;
      if (!partitionRecipients([{ email }], rules).allowed.length) return;
      seen.add(email); candidates.push({ email, method, sourceUrl: url || '', inferred });
    };
    for (const email of extractEmails(job.jd, domain)) if (publicationMatches(job.hrName, email, job.jd)) add(email, 'published-profile-snippet', job.hrLinkedIn);
    try {
      for (const page of await (overrides.pages || officialContactPages)(domain)) {
        for (const email of extractEmails(page.text, domain)) if (publicationMatches(job.hrName, email, page.text)) add(email, 'published-employer-page', page.url);
      }
    } catch { diagnostics.push('Employer contact pages could not be read'); }
    try {
      for (const page of await (overrides.search || publicContacts)(job.hrName, job.company, domain, userId)) {
        if (!page.text.toLowerCase().includes(job.hrName.toLowerCase())) continue;
        for (const email of extractEmails(page.text, domain)) if (publicationMatches(job.hrName, email, page.text)) add(email, 'published-search-result', page.url);
      }
    } catch (err) { diagnostics.push(issue('Public contact search', err)); }
    try { const found = await (overrides.hunter || hunterContact)(job.hrName, domain, userId); if (found && nameMatchesEmail(job.hrName, found.email)) add(found.email, found.method, found.url); } catch (err) { diagnostics.push(issue('Name-and-domain lookup', err)); }
    const published = candidates.length;
    const confirmedHistory = await getHistory(domain);
    for (const previous of confirmedHistory) {
      const pattern = deducePattern(previous.hrName, previous.emailRecipient);
      if (pattern) { add(generateEmailWithPattern(job.hrName, domain, pattern), 'pattern-from-your-confirmed-contacts', '', true); break; }
    }
    const names = job.hrName.split(/\s+/).map(fold).filter(Boolean);
    if (names.length >= 2) {
      const first = names[0], last = names.at(-1);
      for (const local of [`${first}.${last}`, `${first[0]}${last}`, `${first}${last}`]) add(`${local}@${domain}`, 'inferred-name-pattern', '', true);
    }
    let primary = null;
    const recipients = [];
    for (const candidate of candidates.slice(0, Math.max(published, 3) + 1)) {
      try {
        const result = await verify(candidate.email, { hrName: job.hrName });
        if (!result.isValid || result.status === 'undeliverable' || result.deliverabilityScore < 65) continue;
        primary = { ...candidate, domain, personMatched: !candidate.inferred, mailboxConfirmed: /mailbox.*confirmed|confirmed.*mailbox|hunter/i.test(result.reason || '') && result.deliverabilityScore >= 85, score: result.deliverabilityScore, reason: result.reason, checkedAt: new Date() };
        recipients.push({ email: candidate.email, hrName: job.hrName, type: 'recruiter', deliverabilityScore: result.deliverabilityScore, reason: `${candidate.method}: ${result.reason}`, status: 'pending' });
        break;
      } catch { diagnostics.push('A candidate mailbox could not be verified'); }
    }
    // Preserve the existing multi-inbox behavior; clearly distinguish department addresses.
    for (const local of ['careers', 'hr', 'talent', 'recruitment', 'jobs']) {
      const address = `${local}@${domain}`;
      if (!partitionRecipients([{ email: address }], rules).allowed.length || (job.failedEmails || []).includes(address)) continue;
      try {
        const result = await verify(address);
        if (result.isValid && result.deliverabilityScore >= 65 && result.status !== 'undeliverable') recipients.push({ email: address, hrName: '', type: 'department', deliverabilityScore: result.deliverabilityScore, reason: result.reason, status: 'pending' });
      } catch {}
    }
    return finish({ state: recipients.length ? 'complete' : 'not_found', email: primary?.email || recipients[0]?.email || '', recipients, evidence: primary || { domain, method: 'department-only', personMatched: false, mailboxConfirmed: false, checkedAt: new Date() }, reason: primary ? `${primary.inferred ? 'Inferred recruiter address' : 'Source-supported recruiter address'}; ${primary.reason}` : recipients.length ? 'Department inboxes found; no individual recruiter mailbox confirmed' : 'No unblocked mailbox passed verification', diagnostics });
  };
}
module.exports = { createRecruiterEmailFinder, nameMatchesEmail, publicationMatches, extractEmails };
