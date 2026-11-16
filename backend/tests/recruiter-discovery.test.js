const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { canonicalProfile, parseRecruiter, rankRecruiter, buildQueries, searchRecruiters } = require('../utils/recruiterDiscovery');
const profile = (slug = crypto.randomUUID()) => `https://www.linkedin.com/in/${slug}`;
test('LinkedIn identities normalize country URLs and tracking parameters, and reject spoofed hosts', () => {
  assert.equal(canonicalProfile('https://in.linkedin.com/in/Sample-Person/?trk=search'), 'https://www.linkedin.com/in/sample-person');
  for (const url of ['https://evil.invalid/?url=linkedin.com/in/person', 'https://linkedin.com.evil.invalid/in/person', 'https://www.linkedin.com/posts/person', 'https://www.linkedin.com/in/name%2Fother', 'javascript:alert(1)']) assert.equal(canonicalProfile(url), null);
});
test('recruiter parsing keeps employer evidence and does not invent employers or locations', () => {
  const found = parseRecruiter({ title: 'Alex Sample - Technical Recruiter at Example Systems | LinkedIn', snippet: 'Hiring Python developers. Location: Pune.', link: profile(), provider: 'Serper' });
  assert.equal(found.company, 'Example Systems'); assert.equal(found.location, 'Pune'); assert.ok(found.employerEvidence);
  const unknown = parseRecruiter({ title: 'Alex Sample - Technical Recruiter | LinkedIn', snippet: 'Technical recruiting and software hiring', link: profile() });
  assert.equal(unknown.company, ''); assert.equal(unknown.location, '');
  const slogan = parseRecruiter({ title: 'Alex Sample - Technical Recruiter - We are hiring!', link: profile() });
  assert.equal(slogan.company, '');
  assert.equal(parseRecruiter({ title: 'Alex Sample - Technical Recruiter - Helping companies grow', link: profile() }).company, '');
  assert.equal(parseRecruiter({ title: 'Alex Sample - Technical Recruiter - Systems', link: profile() }).company, '');
  assert.equal(parseRecruiter({ title: 'Hiring Team - Technical Recruiter at Employer', link: profile() }), null);
});
test('company and specialty searches use different evidence and correctly grouped queries', () => {
  const lead = { name: 'Alex Sample', role: 'Technical Recruiter', company: 'Example Systems', snippet: 'Hiring Python developers in Pune', link: profile() };
  assert.ok(rankRecruiter(lead, { mode: 'company', query: 'Example Systems', locations: ['Pune'] }));
  assert.equal(rankRecruiter(lead, { mode: 'company', query: 'Other employer', locations: [] }), null);
  assert.ok(rankRecruiter(lead, { mode: 'role', query: 'Python developer', locations: ['Pune'] }));
  assert.equal(rankRecruiter(lead, { mode: 'role', query: 'mechanical engineer', locations: [] }), null);
  const company = buildQueries({ mode: 'company', query: 'Example Systems', aliases: ['Example Brand'], locations: ['Pune', 'Mumbai'] });
  assert.equal(company.length, 2); assert.ok(company[0].includes('("Example Systems" OR "Example Brand")')); assert.ok(company[0].includes('"Pune"'));
});
test('search falls back after irrelevant results, keeps same-name distinct people, and never pads results', async () => {
  const urls = [profile(), profile()];
  let calls = 0;
  const http = { post: async url => {
    calls++;
    if (url.includes('tavily')) return { data: { results: [{ title: 'Alex Sample - Technical Recruiter at Other Employer', url: profile(), content: 'Python recruiting' }] } };
    return { data: { organic: urls.map(link => ({ title: 'Alex Sample - Technical Recruiter at Example Systems', link, snippet: 'Hiring Python developers' })) } };
  } };
  const found = await searchRecruiters({ mode: 'company', query: 'Example Systems', locations: [] }, { http, keys: { TAVILY_API_KEY: 'test-only', SERPER_API_KEY: 'test-only' }, record: () => {} });
  assert.equal(calls, 2); assert.equal(found.profiles.length, 2); assert.notEqual(found.profiles[0].link, found.profiles[1].link);
  const empty = await searchRecruiters({ mode: 'role', query: 'Python developer', locations: [] }, { keys: {}, record: () => {} });
  assert.equal(empty.profiles.length, 0); assert.ok(empty.diagnostics.every(d => d.status === 'not_configured'));
});
test('provider credit errors are visible and not replaced with directory leads', async () => {
  const result = await searchRecruiters({ mode: 'role', query: 'Python developer', locations: ['India'] }, { keys: { SERPER_API_KEY: 'test-only' }, http: { post: async () => { throw { response: { status: 429 } }; } }, record: () => {} });
  assert.equal(result.profiles.length, 0); assert.ok(result.diagnostics.some(d => d.status === 'rate_limited'));
});
