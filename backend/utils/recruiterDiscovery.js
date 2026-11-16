const axios = require('axios');
const { recordApiUsage } = require('./ai');
const context = require('./requestContext');
const recruiterRole = /\b(?:technical recruiter|IT recruiter|recruit(?:er|ing|ment)(?: specialist| manager| lead| partner)?|talent acquisition(?: specialist| manager| lead| partner)?|talent partner|HR manager|HR executive|human resources(?: manager| specialist)?|sourcer|staffing(?: specialist| manager)?)\b/i;
function canonicalProfile(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || !/^(?:[a-z]{2,3}\.)?linkedin\.com$/.test(url.hostname.toLowerCase())) return null;
    const match = url.pathname.match(/^\/in\/([^/]+)\/?$/i);
    if (!match) return null;
    const slug = decodeURIComponent(match[1]).toLowerCase();
    if (!/^[\p{L}\p{N}._-]+$/u.test(slug)) return null;
    return `https://www.linkedin.com/in/${encodeURIComponent(slug)}`;
  } catch { return null; }
}
const normalized = value => String(value || '').normalize('NFKC').toLowerCase().replace(/\b(pvt|ltd|private|limited|inc|llc)\b/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
function phraseIn(text, phrase) { const a = normalized(text), b = normalized(phrase); return !!b && (` ${a} `).includes(` ${b} `); }
function validEmployer(value) {
  return typeof value === 'string' && value.trim().length >= 2 && value.length <= 100 && !['india', 'remote', 'bangalore', 'bengaluru', 'hyderabad', 'pune', 'mumbai', 'delhi', 'linkedin', 'unknown', 'talent acquisition', 'human resources', 'systems', 'solutions', 'technologies', 'technology', 'group', 'company', 'organization', 'global', 'services', 'consulting', 'staffing'].includes(value.toLowerCase().trim()) && !/^(?:helping|building|connecting|empowering|transforming|passionate|we |i |our |your )|\b(hiring|seeking|looking|opportunity|experience|years|recruiter|sourcing strategist|linkedin|open to work)\b|[!?]/i.test(value);
}
function parseRecruiter(item) {
  const link = canonicalProfile(item.url || item.link);
  if (!link) return null;
  const title = String(item.title || '').replace(/\s*[|–—-]\s*LinkedIn\s*$/i, '').trim();
  const snippet = String(item.content || item.snippet || '').slice(0, 1800);
  const parts = title.split(/\s+[–—-]\s+|\s*\|\s*/);
  const name = parts[0]?.replace(/\s*,\s*(?:MBA|PHR|SHRM.*)$/i, '').trim();
  if (!name || !/^[\p{L}\p{M} .'-]{3,90}$/u.test(name) || name.split(/\s+/).length < 2 || recruiterRole.test(name) || /\b(hiring|jobs|careers|team|opportunities)\b/i.test(name)) return null;
  const role = parts.slice(1).join(' ').match(recruiterRole)?.[0] || snippet.match(recruiterRole)?.[0];
  if (!role || /\b(seeking|looking for|aspiring)\s+(?:an?\s+)?(?:HR|recruit|talent)/i.test(title)) return null;
  let company = '';
  let employerEvidence = '';
  const headline = parts.slice(1).join(' - ');
  const at = headline.match(/\bat\s+([^|–—]+?)(?:\s+-\s+|$)/i);
  if (at && validEmployer(at[1]) && !/\b(former|previous|ex[- ]|previously)\b/i.test(headline)) { company = at[1].trim(); employerEvidence = headline; }
  if (!company && parts.length >= 3 && validEmployer(parts[2]) && !recruiterRole.test(parts[2]) && !/\b(former|previous|ex[- ])\b/i.test(headline)) { company = parts[2].trim(); employerEvidence = headline; }
  if (!company) {
    const current = snippet.match(/(?:currently\s+)?(?:technical recruiter|IT recruiter|recruiter|talent acquisition(?: specialist| manager)?|HR manager)\s+at\s+([^,.|\n]+)(?:[,.|\n]|$)/i);
    if (current && validEmployer(current[1]) && !/\b(former|previously|used to)\b/i.test(snippet.slice(Math.max(0, current.index - 25), current.index))) { company = current[1].trim(); employerEvidence = current[0]; }
  }
  if (!company) {
    // Indexed LinkedIn snippets frequently expose labelled fields rather than "Recruiter at ...".
    const labelled = snippet.match(/\b(?:current employer|current company|employer|company|organization)\s*:\s*([^·•|\n]+?)(?=\s+(?:Location|Education|Experience|Connections|Followers):|[·•|\n]|$)/i)
      || snippet.match(/\bExperience\s*:\s*([^·•|\n]+?)(?=\s+(?:Location|Education|Connections|Followers):|[·•|\n]|$)/i);
    if (labelled && validEmployer(labelled[1].trim()) && !/previous|former|past/i.test(snippet.slice(Math.max(0, labelled.index - 20), labelled.index))) {
      company = labelled[1].trim(); employerEvidence = labelled[0];
    }
  }
  return { name, role, company, link, snippet, employerEvidence, sourceTitle: title, source: item.provider, sourceUrl: link, observedAt: new Date(), publishedAt: item.date || null, location: item.location || snippet.match(/\bLocation:\s*([^|.\n]+)/i)?.[1]?.trim() || '' };
}
function rankRecruiter(lead, { mode, query, locations = [], aliases = [] }) {
  const evidence = `${lead.role} ${lead.snippet}`;
  const reasons = [];
  let score = 25;
  const companyMatch = [query, ...aliases].some(name => phraseIn(lead.company, name) || phraseIn(name, lead.company));
  if (mode === 'company') { if (!lead.company || !companyMatch) return null; score += 40; reasons.push('Employer named in search evidence'); }
  const tokens = normalized(query).split(' ').filter(t => t.length > 2 && !['junior', 'senior', 'fresher', 'engineer', 'developer', 'recruiter', 'technical'].includes(t));
  const matches = tokens.filter(token => phraseIn(evidence, token));
  const tech = /\b(technical|IT|software|engineering|developer|technology)\b/i.test(evidence);
  if (mode === 'role') {
    if (tokens.length && !matches.length) return null;
    if (!tokens.length && /software|developer|engineer|technical/i.test(query) && !tech) return null;
    score += Math.min(30, matches.length * 10 + (tech ? 15 : 0)); reasons.push(matches.length ? `Recruiting evidence mentions ${matches.join(', ')}` : 'Technical recruiting evidence');
  } else if (tech) { score += 10; reasons.push('Technical recruiting specialty'); }
  const location = locations.find(loc => !/^all(?: india)?$/i.test(loc) && phraseIn(`${lead.location} ${lead.snippet}`, loc));
  if (location) { score += 15; reasons.push('Requested location appears in evidence'); }
  if (/\b(hiring|recruiting for|open positions|openings)\b/i.test(lead.snippet)) { score += 10; reasons.push('Hiring language in source snippet'); }
  if (!lead.company) reasons.push('Current employer not confirmed; email lookup held');
  return { ...lead, score: Math.min(100, score), reasons, requestedLocation: locations.join(', '), location: lead.location || location || '', evidenceStatus: 'search-evidence' };
}
function buildQueries({ mode = 'role', query, locations = [], aliases = [] }) {
  const quote = value => `"${String(value).replace(/["\\\r\n]/g, ' ').trim()}"`;
  const target = mode === 'company' ? `(${[query, ...aliases].slice(0, 4).map(quote).join(' OR ')})` : quote(query.replace(/\b(junior|senior|fresher|entry.level)\b/gi, '').trim() || query);
  const locs = locations.length ? locations.slice(0, 3) : [''];
  return locs.map(raw => {
    const loc = /^all india$/i.test(raw) ? 'India' : /^all$/i.test(raw) ? '' : raw;
    return `site:linkedin.com/in/ ("Technical Recruiter" OR "Talent Acquisition" OR "IT Recruiter" OR "HR Manager") ${target}${loc ? ` ${quote(loc)}` : ''}`;
  });
}
async function searchRecruiters(options, { http = axios, keys = process.env, record = recordApiUsage } = {}) {
  const diagnostics = [], items = [];
  const queries = buildQueries(options);
  for (const [provider, key] of [['Tavily', keys.TAVILY_API_KEY], ['Serper', keys.SERPER_API_KEY]]) {
    if (!key) { diagnostics.push({ provider, status: 'not_configured', message: `${provider} search is not configured` }); continue; }
    let count = 0;
    for (const query of queries) {
      if (options.signal?.aborted) break;
      try {
        const response = provider === 'Tavily' ? await http.post('https://api.tavily.com/search', { api_key: key, query, max_results: 10 }, { timeout: 9000, signal: options.signal }) : await http.post('https://google.serper.dev/search', { q: query, num: 10 }, { headers: { 'X-API-KEY': key }, timeout: 6000, signal: options.signal });
        const found = provider === 'Tavily' ? response.data?.results || [] : response.data?.organic || [];
        items.push(...found.map(item => ({ ...item, provider }))); count += found.length;
        record({ userId: context.getStore()?.userId, service: provider, action: 'HR Discovery', status: 'success' });
      } catch (err) {
        const limited = [402, 429].includes(err.response?.status) || /credit|quota/i.test(err.response?.data?.message || '');
        diagnostics.push({ provider, status: options.signal?.aborted ? 'cancelled' : limited ? 'rate_limited' : 'error', message: limited ? `${provider} credits or rate limit reached` : options.signal?.aborted ? 'Search cancelled' : `${provider} search failed${err.code === 'ECONNABORTED' ? ' (timeout)' : ''}` });
        record({ userId: context.getStore()?.userId, service: provider, action: 'HR Discovery', status: 'failed' });
        if (limited) break;
      }
    }
    diagnostics.push({ provider, status: count ? 'ok' : 'empty', message: `${count} search results returned` });
    // Fall back based on relevant evidence, not raw search-result count.
    if (items.map(parseRecruiter).filter(Boolean).some(lead => rankRecruiter(lead, options))) break;
  }
  const unique = new Map();
  for (const item of items) {
    const parsed = parseRecruiter(item); const ranked = parsed && rankRecruiter(parsed, options);
    if (!ranked) continue;
    if (!unique.has(ranked.link) || unique.get(ranked.link).score < ranked.score) unique.set(ranked.link, ranked);
  }
  const profiles = [...unique.values()].sort((a, b) => b.score - a.score).slice(0, 20);
  return { profiles, diagnostics, message: profiles.length ? `${profiles.length} recruiter profiles match the search evidence` : diagnostics.some(d => ['error', 'rate_limited', 'not_configured'].includes(d.status)) ? 'No matching profiles found. Check the search-provider diagnostics.' : 'No matching recruiters found. Try a broader specialty or another location.' };
}
module.exports = { canonicalProfile, parseRecruiter, rankRecruiter, buildQueries, searchRecruiters, phraseIn, validEmployer };
