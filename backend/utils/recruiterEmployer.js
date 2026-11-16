const axios = require('axios');
const { canonicalProfile, parseRecruiter } = require('./recruiterDiscovery');
const { recordApiUsage } = require('./ai');
const nameKey = value => String(value || '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
function employerFromProfile(item, job) {
  const parsed = parseRecruiter(item) || parseRecruiter({ ...item, content: `${item.content || item.snippet || ''}\n${job.role || 'Recruiter'}` });
  if (!parsed?.company || parsed.link !== canonicalProfile(job.hrLinkedIn) || nameKey(parsed.name) !== nameKey(job.hrName)) return null;
  return { company: parsed.company, snippet: parsed.snippet, sourceTitle: parsed.sourceTitle, source: parsed.source, sourceUrl: parsed.sourceUrl, employerEvidence: parsed.employerEvidence };
}
async function resolveRecruiterEmployer(job, userId, { http = axios, keys = process.env, record = recordApiUsage } = {}) {
  const diagnostics = [];
  const stored = employerFromProfile({ title: job.hrEvidence?.sourceTitle || `${job.hrName} - ${job.role || 'Recruiter'}`, snippet: job.hrEvidence?.snippet || job.jd || '', link: job.hrLinkedIn, provider: job.hrEvidence?.source || 'Saved profile evidence' }, job);
  if (stored) return { ...stored, diagnostics };
  const profile = canonicalProfile(job.hrLinkedIn);
  if (!profile) return { diagnostics: ['A valid LinkedIn member profile is needed to resolve the employer'] };
  const quoteName = String(job.hrName || '').replace(/["\\\r\n]/g, ' ');
  const query = `site:linkedin.com/in/${new URL(profile).pathname.split('/').at(-1)} "${quoteName}" ("Experience" OR "Company" OR "Recruiter")`;
  for (const [provider, key] of [['Tavily', keys.TAVILY_API_KEY], ['Serper', keys.SERPER_API_KEY]]) {
    if (!key) { diagnostics.push(`${provider} employer search is not configured`); continue; }
    try {
      const response = provider === 'Tavily' ? await http.post('https://api.tavily.com/search', { api_key: key, query, max_results: 5 }, { timeout: 8000 }) : await http.post('https://google.serper.dev/search', { q: query, num: 5 }, { headers: { 'X-API-KEY': key }, timeout: 6000 });
      record({ userId, service: provider, action: 'Recruiter Employer Resolution', status: 'success' });
      const results = provider === 'Tavily' ? response.data?.results || [] : response.data?.organic || [];
      for (const item of results) {
        const employer = employerFromProfile({ ...item, provider }, job);
        if (employer) return { ...employer, diagnostics };
      }
      diagnostics.push(`${provider} did not return current-employer evidence for this exact profile`);
    } catch (err) {
      diagnostics.push([402, 429].includes(err.response?.status) || /credit|quota/i.test(err.response?.data?.message || '') ? `${provider} employer-search quota reached` : err.code === 'ECONNABORTED' ? `${provider} employer search timed out` : `${provider} employer search failed`);
    }
  }
  return { diagnostics };
}
module.exports = { employerFromProfile, resolveRecruiterEmployer };
