const axios = require('axios');
const cheerio = require('cheerio');
const dns = require('node:dns').promises;
const https = require('node:https');
const CompanyDomain = require('../models/CompanyDomain');
const context = require('./requestContext');
const companyKey = value => String(value || '').toLowerCase().replace(/\b(inc|ltd|limited|private|pvt|llc|corporation)\b/g, '').replace(/[^a-z0-9]/g, '');
async function savedDomain(company, userId = context.getStore()?.userId) {
  if (!userId || !companyKey(company)) return null;
  return CompanyDomain.findOne({ userId, $or: [{ companyKey: companyKey(company) }, { aliases: companyKey(company) }] }).lean();
}
function isPublicIpv4(address) {
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some(p => !Number.isInteger(p) || p < 0 || p > 255)) return false;
  const [a, b] = parts;
  return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || (a === 198 && [18, 19].includes(b)));
}
async function fetchPublicPage(url, redirects = 0) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || (parsed.port && parsed.port !== '443') || redirects > 3) throw new Error('Only public HTTPS job pages are supported');
  const addresses = await dns.lookup(parsed.hostname, { all: true, family: 4 });
  if (!addresses.length || addresses.some(a => !isPublicIpv4(a.address))) throw new Error('Private network destinations are not supported');
  const agent = new https.Agent({ lookup(host, options, callback) { callback(null, options?.all ? [addresses[0]] : addresses[0].address, addresses[0].family); } });
  const result = await axios.get(parsed.href, { timeout: 5000, maxRedirects: 0, maxContentLength: 1024 * 1024, proxy: false, httpsAgent: agent, responseType: 'text', validateStatus: status => status >= 200 && status < 400 });
  if (result.status >= 300 && result.headers.location) return fetchPublicPage(new URL(result.headers.location, parsed).href, redirects + 1);
  return { html: result.data, url: parsed.href };
}
function extractEmployerWebsites(html, pageUrl, company) {
  const $ = cheerio.load(html);
  const results = [];
  const add = (value, confirmed) => {
    if (typeof value !== 'string') return;
    try { const url = new URL(value, pageUrl); if (url.protocol === 'https:') results.push({ domain: url.hostname.replace(/^www\./, '').toLowerCase(), evidenceUrl: pageUrl, confirmed }); } catch {}
  };
  const visit = value => {
    if (Array.isArray(value)) return value.forEach(visit);
    if (!value || typeof value !== 'object') return;
    const orgs = Array.isArray(value.hiringOrganization) ? value.hiringOrganization : [value.hiringOrganization];
    for (const org of orgs) if (org && companyKey(org.name) === companyKey(company)) {
      add(org.url, true); for (const link of Array.isArray(org.sameAs) ? org.sameAs : [org.sameAs]) add(link, true);
    }
    if (value['@graph']) visit(value['@graph']);
  };
  $('script[type="application/ld+json"]').each((_, element) => { try { visit(JSON.parse($(element).text())); } catch {} });
  $('a[href]').each((_, element) => { if (/company website|visit.*website|about.*company|careers/i.test($(element).text())) add($(element).attr('href'), false); });
  return [...new Map(results.map(item => [item.domain, item])).values()];
}
async function domainFromJobPage(company, applyLink, matches, isBoard, checkMx) {
  if (!applyLink) return null;
  try {
    const page = await fetchPublicPage(applyLink);
    const candidates = extractEmployerWebsites(page.html, page.url, company);
    for (const candidate of candidates) {
      if (isBoard(candidate.domain, company) || (!candidate.confirmed && !matches(company, candidate.domain))) continue;
      if (!(await checkMx(candidate.domain)).valid) continue;
      const userId = context.getStore()?.userId;
      if (candidate.confirmed && userId) await CompanyDomain.findOneAndUpdate({ userId, companyKey: companyKey(company), source: { $ne: 'user' } }, { $set: { company, domain: candidate.domain, source: 'job-page', evidenceUrl: page.url } }, { upsert: true }).catch(() => {});
      return candidate.domain;
    }
  } catch { /* Other discovery sources can still succeed when a job portal blocks fetches. */ }
  return null;
}
module.exports = { fetchPublicPage, companyKey, savedDomain, isPublicIpv4, extractEmployerWebsites, domainFromJobPage };
