const axios = require('axios');
const cheerio = require('cheerio');
const { GoogleGenAI } = require('@google/genai');
const { callAIWithRetry, recordApiUsage } = require('./ai');
const { isSeniorRole, detectExperienceLevel, shouldExcludeSenior } = require('./jobFilter');

// Track Serper quota cooldown
let serperCreditsExhaustedUntil = 0;

// Check if a date string is older than cutoff (default 72 hours / 3 days)
function isOlderThan12Hours(text, maxHours = 72) {
  if (!text || typeof text !== 'string') return false;
  const lower = text.toLowerCase().trim();

  // Weeks or months ago (definitely old)
  if (/\b(?:[1-9]\d*)\s*(?:weeks?|months?|yrs?|years?)\s*ago\b/i.test(lower)) return true;
  if (/\b(?:last\s+month)\b/i.test(lower)) return true;

  // Days ago check (allow up to 3 days ago)
  const dayMatch = lower.match(/\b(\d+)\s*(?:days?|d)\s*ago\b/i);
  if (dayMatch) {
    const days = parseInt(dayMatch[1], 10);
    if (!isNaN(days) && days > Math.ceil(maxHours / 24)) return true;
  }

  // Hours ago (e.g. "13 hours ago", "18h ago")
  const hourMatch = lower.match(/\b(\d+)\s*(?:hours?|hrs?|h)\s*ago\b/i);
  if (hourMatch) {
    const hours = parseInt(hourMatch[1], 10);
    if (!isNaN(hours) && hours > maxHours) return true;
  }

  // Absolute date string
  const parsedDate = new Date(text);
  if (!isNaN(parsedDate.getTime())) {
    const ageMs = Date.now() - parsedDate.getTime();
    if (ageMs > maxHours * 60 * 60 * 1000) return true;
  }

  return false;
}

// Normalize company name for duplicate checking
function normalizeCompanyKey(name) {
  if (!name || typeof name !== 'string') return '';
  return name
    .toLowerCase()
    .replace(/\b(inc|incorporated|corp|corporation|ltd|limited|pvt|private|llc|gmbh|technologies|technology|solutions|services|group|systems|software|global|india|careers)\b/gi, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

// Normalize job role for duplicate checking
function normalizeRoleKey(title) {
  if (!title || typeof title !== 'string') return '';
  return title
    .toLowerCase()
    .replace(/\s*[-–—(].*$/, '') // remove suffixes like "- Remote" or "(0-2 Yrs)"
    .replace(/\b(remote|wfh|hybrid|fulltime|full-time|contract|urgent|immediate)\b/gi, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

// Normalize job URL by removing tracking parameters
function normalizeApplyUrl(url) {
  if (!url || typeof url !== 'string') return '';
  try {
    const parsed = new URL(url);
    parsed.searchParams.delete('utm_source');
    parsed.searchParams.delete('utm_medium');
    parsed.searchParams.delete('utm_campaign');
    parsed.searchParams.delete('utm_term');
    parsed.searchParams.delete('utm_content');
    parsed.searchParams.delete('ref');
    parsed.searchParams.delete('source');
    parsed.searchParams.delete('se');
    parsed.hash = '';
    return (parsed.origin + parsed.pathname).toLowerCase().replace(/\/+$/, '');
  } catch (e) {
    return url.split('?')[0].toLowerCase().replace(/\/+$/, '');
  }
}

// Extract LinkedIn username handle from profile URL
function extractLinkedInHandle(url) {
  if (!url || typeof url !== 'string') return '';
  const match = url.match(/linkedin\.com\/in\/([a-zA-Z0-9_-]+)/i);
  return match ? match[1].toLowerCase().trim() : '';
}

// Normalize HR name by removing titles, pronouns, and credentials
function normalizeHrName(name) {
  if (!name || typeof name !== 'string') return '';
  return name
    .toLowerCase()
    .replace(/\s*\([^)]*\)/g, '') // remove (he/him), (she/her), (hiring)
    .replace(/[-–—/|]/g, ' ') // convert separators to spaces
    .replace(/\b(mba|phr|sphr|shrm|cp|scp|pmp|cpc|recruiter|hr|talent|hiring|lead|manager|director)\b/gi, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function scrapeJobsFree(query, location = 'India', excludeCompanies = []) {
  const jobs = [];
  
  // Search jobs via Tavily if available (searches LinkedIn, Naukri, Indeed)
  if (process.env.TAVILY_API_KEY) {
    try {
      const tavilyRes = await axios.post('https://api.tavily.com/search', {
        api_key: process.env.TAVILY_API_KEY,
        query: `(site:linkedin.com/jobs/view OR site:naukri.com/job-listings OR site:indeed.com/viewjob) "${query}" "${location}"`,
        max_results: 15
      }, { timeout: 9000 });
      recordApiUsage({ service: 'Tavily', action: 'Job Search', creditsUsed: 1, status: 'success' });

      const results = tavilyRes.data?.results || [];
      for (const res of results) {
        const url = res.url || '';
        const titleSnippet = res.title || '';
        const descSnippet = res.content || '';

        let company = 'Unknown Company';
        let role = titleSnippet.split('|')[0].split('-')[0].trim() || 'Software Engineer';
        if (titleSnippet.includes(' hiring ')) {
          const parts = titleSnippet.split(' hiring ');
          company = parts[0].trim();
          role = parts[1].split(' in ')[0].trim();
        } else if (titleSnippet.includes(' at ')) {
          const parts = titleSnippet.split(' at ');
          role = parts[0].trim();
          company = parts[1].split('|')[0].split('-')[0].trim();
        }

        const compKey = normalizeCompanyKey(company);
        if (compKey && excludeCompanies.some(ex => ex.length > 2 && (compKey.includes(ex) || ex.includes(compKey)))) {
          continue;
        }

        let source = 'Other';
        if (url.includes('linkedin.com')) source = 'LinkedIn';
        else if (url.includes('indeed.com')) source = 'Indeed';
        else if (url.includes('naukri.com')) source = 'Naukri';

        jobs.push({
          company: (company && !isInvalidCompany(company)) ? company : 'Tech Company',
          role,
          jd: descSnippet,
          applyLink: url,
          location: location,
          source,
          experienceLevel: detectExperienceLevel(role, descSnippet),
          publishedAt: new Date()
        });
      }
    } catch (tavilyErr) {
      console.warn('[Scraper] Tavily jobs search error:', tavilyErr.message);
    }
  }

  if (!process.env.SERPER_API_KEY || Date.now() < serperCreditsExhaustedUntil) {
    return jobs;
  }

  const excludeSenior = shouldExcludeSenior(query);
  const seniorNegativeDorks = excludeSenior ? '-senior -sr -lead -principal -staff -architect -manager -director' : '';

  // Google Dorking for recent job postings (strictly past 24 hours, filtered to <= 12 hours)
  const dorkQueries = [
    `site:linkedin.com/jobs/view "${query}" "India" ${seniorNegativeDorks}`.trim(),
    `site:in.indeed.com/viewjob "${query}" "India" ${seniorNegativeDorks}`.trim(),
    `site:naukri.com/job-listings "${query}" "India" ${seniorNegativeDorks}`.trim()
  ];

  for (const q of dorkQueries) {
    try {
      let dynamicQuery = q;
      if (excludeCompanies.length > 0) {
        const shuffledExclusions = [...excludeCompanies].sort(() => 0.5 - Math.random());
        const exclusions = shuffledExclusions.slice(0, 5).map(c => `-"${c}"`).join(' ');
        dynamicQuery = `${q} ${exclusions}`;
      }

      const res = await axios.post('https://google.serper.dev/search', {
        q: dynamicQuery,
        tbs: "qdr:d", // Strictly past 24 hours
        num: 10
      }, {
        headers: {
          'X-API-KEY': process.env.SERPER_API_KEY,
          'Content-Type': 'application/json'
        }
      });

      const organic = res.data.organic || [];
      
      for (const result of organic) {
        try {
          const url = result.link;
          const titleSnippet = result.title || '';
          const descSnippet = result.snippet || '';
          const dateSnippet = result.date || '';

          // Strictly enforce < 12 hours max freshness
          if (isOlderThan12Hours(dateSnippet) || isOlderThan12Hours(descSnippet)) {
            continue;
          }

          // Deduce Source
          let source = 'Other';
          if (url.includes('linkedin.com')) source = 'LinkedIn';
          else if (url.includes('indeed.com')) source = 'Indeed';
          else if (url.includes('naukri.com')) source = 'Naukri';

          // Fast structured parsing for Company & Role from search snippets (instant, avoids 5s hanging requests on Cloudflare/bot-blocked sites)
          let fullJD = descSnippet;
          let company = 'Unknown Company';
          let role = titleSnippet.split(' - ')[0] || titleSnippet;

          const cleanTitle = titleSnippet.replace(/\s*[-–—|]\s*(?:LinkedIn|Indeed|Naukri|Glassdoor).*$/i, '').trim();

          if (cleanTitle.includes(' hiring ')) {
            const parts = cleanTitle.split(' hiring ');
            company = parts[0].trim();
            role = parts[1].split(/\s+in\s+/i)[0].split(/\s*[-–—|]\s*/)[0].trim();
          } else if (/\bat\b/i.test(cleanTitle)) {
            const parts = cleanTitle.split(/\bat\b/i);
            role = parts[0].replace(/\s*[-–—|]\s*.*$/, '').trim();
            company = parts[1].split(/\s+in\s+/i)[0].split(/\s*[-–—|]\s*/)[0].trim();
          } else {
            const parts = cleanTitle.split(/\s*[-–—|]\s*/);
            if (parts.length >= 2) {
              role = parts[0].trim();
              company = parts[1].trim();
            }
          }

          if (company !== 'Unknown Company' && role) {
            // Clean up company name prefix fluff
            company = company
              .replace(/^(?:jobs|careers?|hiring|openings?|opportunity)\s+(?:at|for|in|with)\s+/i, '')
              .replace(/\s*[-–—].*$/, '')
              .trim();

            if (isInvalidCompany(company)) {
              company = 'Unknown Company';
            }

            // If searching for junior jobs, skip senior roles detected in title or JD
            if (excludeSenior && isSeniorRole(role, fullJD)) {
              console.log(`[Scraper] Excluded senior role for junior search: "${role}" at ${company}`);
              continue;
            }

            if (company !== 'Unknown Company') {
              const companyLower = company.toLowerCase();
              const isDuplicate = excludeCompanies.some(ex => ex.length > 2 && (companyLower.includes(ex) || ex.includes(companyLower)));
              
              if (!isDuplicate) {
                jobs.push({
                  company,
                  role,
                  jd: fullJD,
                  applyLink: url,
                  location: location,
                  source: source,
                  experienceLevel: detectExperienceLevel(role, fullJD),
                  publishedAt: new Date(), // It's from last 24h
                });
              }
            }
          }
        } catch (jobErr) {
          console.error('[Scraper] Error parsing a job result', jobErr.message);
        }
      }
    } catch (err) {
      if (err.response?.data?.message === 'Not enough credits' || err.response?.status === 400) {
        serperCreditsExhaustedUntil = Date.now() + 60 * 60 * 1000;
        console.warn('[Scraper] Serper API credits exhausted (status 400). Pausing Serper requests.');
        break;
      }
      console.warn(`[Scraper] Error searching ${q}:`, err.message);
    }
  }

  // Tier 3: Gemini Search Grounding fallback if fewer than 5 jobs found
  if (jobs.length < 5 && process.env.GEMINI_API_KEY) {
    try {
      console.log(`[Scraper] Discovering jobs via Gemini Google Search Grounding for "${query}" in ${location}...`);
      const gemini = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const prompt = `Search Google for 8 active job openings for "${query}" in ${location}.
Return a valid JSON array of objects:
[
  {
    "company": "Company Name",
    "role": "Job Title",
    "jd": "Brief job description or requirements",
    "applyLink": "Direct job apply URL",
    "location": "${location}",
    "source": "LinkedIn"
  }
]
Return ONLY valid JSON array.`;

      const geminiPromise = gemini.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: { tools: [{ googleSearch: {} }] }
      });
      const timeoutPromise = new Promise(resolve => setTimeout(() => resolve(null), 18000));
      const response = await Promise.race([geminiPromise, timeoutPromise]);

      if (response && response.text) {
        let text = response.text || '';
        const match = text.match(/```(?:json)?([\s\S]*?)```/);
        if (match) text = match[1].trim();
        const jsonMatch = text.match(/\[\s*\{[\s\S]*\}\s*\]/);
        if (jsonMatch) text = jsonMatch[0];
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            if (item.company && item.role && item.applyLink) {
              const compKey = normalizeCompanyKey(item.company);
              if (compKey && excludeCompanies.some(ex => ex.length > 2 && (compKey.includes(ex) || ex.includes(compKey)))) continue;
              jobs.push({
                company: item.company.trim(),
                role: item.role.trim(),
                jd: item.jd || `${item.role} opening at ${item.company}`,
                applyLink: item.applyLink.trim(),
                location: item.location || location,
                source: item.applyLink.includes('linkedin.com') ? 'LinkedIn' : (item.applyLink.includes('naukri.com') ? 'Naukri' : 'Other'),
                experienceLevel: detectExperienceLevel(item.role, item.jd || ''),
                salary: '',
                publishedAt: new Date()
              });
            }
          }
        }
      }
    } catch (geminiJobErr) {
      console.warn('[Scraper] Gemini Job Discovery error:', geminiJobErr.message);
    }
  }

  return jobs;
}

const KNOWN_INVALID_COMPANIES = new Set([
  'sourcing strategist',
  'technical recruiter',
  'junior software developer',
  'software developer',
  'software engineer',
  '6+ years experience',
  'talent acquisition',
  'it & engineering talent acquisition',
  'data',
  'tech company',
  'tech partner',
  'linkedin',
  'independent',
  'freelance',
  'self employed',
  'unknown',
  'direct recruiter',
  'direct recruiter / agency',
  'recruiter / agency',
  'agency',
  'confidential',
  'hiring company',
  'leading mnc',
  'job consultant',
  'placement agency'
]);

function isInvalidCompany(comp) {
  if (!comp || typeof comp !== 'string') return true;
  const lower = comp.toLowerCase().trim();
  if (lower.length < 2 || lower.length > 50) return true;
  if (KNOWN_INVALID_COMPANIES.has(lower)) return true;
  if (/\b(recruiter\s*\/\s*agency|sourcing\s*strategist|confidential|placement\s*agency|hiring\s*company)\b/i.test(lower)) {
    return true;
  }
  return false;
}

async function findHROnLinkedIn(company, location = 'India') {
  const result = await require('./recruiterDiscovery').searchRecruiters({ mode: 'company', query: company, locations: [location] });
  const first = result.profiles[0];
  return first ? { ...first, linkedinUrl: first.link } : null;
}
async function discoverHRProfiles(query = 'software engineer', location = 'India', existingUrls = []) {
  const { searchRecruiters, canonicalProfile } = require('./recruiterDiscovery');
  const result = await searchRecruiters({ mode: 'role', query, locations: Array.isArray(location) ? location : [location] });
  const seen = new Set(existingUrls.map(canonicalProfile).filter(Boolean));
  return result.profiles.filter(profile => !seen.has(profile.link));
}
module.exports = { scrapeJobsFree, findHROnLinkedIn, discoverHRProfiles, isInvalidCompany, normalizeCompanyKey, normalizeRoleKey, normalizeApplyUrl, extractLinkedInHandle, normalizeHrName, isOlderThan12Hours };
