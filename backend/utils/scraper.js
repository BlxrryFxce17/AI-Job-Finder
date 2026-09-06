const axios = require('axios');
const cheerio = require('cheerio');
const { callAIWithRetry } = require('./ai');
const { isSeniorRole, detectExperienceLevel, shouldExcludeSenior } = require('./jobFilter');

async function scrapeJobsFree(query, location = 'India', excludeCompanies = []) {
  const jobs = [];
  
  if (!process.env.SERPER_API_KEY) {
    console.log('No SERPER_API_KEY, skipping free scrape.');
    return jobs;
  }

  const excludeSenior = shouldExcludeSenior(query);
  const seniorNegativeDorks = excludeSenior ? '-senior -sr -lead -principal -staff -architect -manager -director' : '';

  // Google Dorking for recent job postings (last 24 hours)
  const dorkQueries = [
    `site:linkedin.com/jobs/view "${query}" "India" ${seniorNegativeDorks}`.trim(),
    `site:in.indeed.com/viewjob "${query}" "India" ${seniorNegativeDorks}`.trim(),
    `site:naukri.com/job-listings "${query}" "India" ${seniorNegativeDorks}`.trim()
  ];

  for (const q of dorkQueries) {
    try {
      // Free tier Serper doesn't allow 'page' or 'num > 10' for 'site:' queries
      // We will inject recent exclusions into the query string to get fresh results
      let dynamicQuery = q;
      if (excludeCompanies.length > 0) {
        // Shuffle and pick 5 exclusions to dynamically shift search results without hitting limits
        const shuffledExclusions = [...excludeCompanies].sort(() => 0.5 - Math.random());
        const exclusions = shuffledExclusions.slice(0, 5).map(c => `-"${c}"`).join(' ');
        dynamicQuery = `${q} ${exclusions}`;
      }

      const res = await axios.post('https://google.serper.dev/search', {
        q: dynamicQuery,
        tbs: "qdr:w", // Expanded to Past week for wider net
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

          // Deduce Source
          let source = 'Other';
          if (url.includes('linkedin.com')) source = 'LinkedIn';
          else if (url.includes('indeed.com')) source = 'Indeed';
          else if (url.includes('naukri.com')) source = 'Naukri';

          // Fast HTML scrape for Company & full JD if possible
          // Some sites block axios (like Indeed/LinkedIn), so we rely heavily on the Google snippet and AI if HTML fails.
          let fullJD = descSnippet;
          let company = 'Unknown Company';
          let role = titleSnippet.split(' - ')[0] || titleSnippet;

          try {
            const htmlRes = await axios.get(url, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
              },
              timeout: 5000
            });
            const $ = cheerio.load(htmlRes.data);
            
            if (source === 'LinkedIn') {
              company = $('.topcard__org-name-link').text().trim() || company;
              role = $('.topcard__title').text().trim() || role;
              fullJD = $('.show-more-less-html__markup').text().trim() || fullJD;
            } else if (source === 'Indeed') {
              company = $('div[data-company-name="true"]').text().trim() || company;
              role = $('h1').text().trim() || role;
              fullJD = $('#jobDescriptionText').text().trim() || fullJD;
            } else if (source === 'Naukri') {
              company = $('.jd-header-comp-name').text().trim() || company;
              role = $('.jd-header-title').text().trim() || role;
              fullJD = $('.job-desc').text().trim() || fullJD;
            }
          } catch (htmlErr) {
            // Fallback to AI parsing the Google snippet if Axios is blocked (403/Captcha)
            const prompt = `Extract the Company Name and Job Title from this Google Search result snippet for a job posting. 
Snippet Title: ${titleSnippet}
Snippet Text: ${descSnippet}

Return ONLY valid JSON: {"company": "Extracted Company", "role": "Extracted Role"}`;
            try {
              const aiRes = await callAIWithRetry(prompt, 2, 1000);
              let jsonStr = aiRes.text.replace(/```(?:json)?\s*([\s\S]*?)```/g, '$1').trim();
              const parsed = JSON.parse(jsonStr);
              if (parsed.company) company = parsed.company;
              if (parsed.role) role = parsed.role;
            } catch (e) {}
          }

          if (company !== 'Unknown Company' && role) {
            // If searching for junior jobs, skip senior roles detected in title or JD
            if (excludeSenior && isSeniorRole(role, fullJD)) {
              console.log(`[Scraper] Excluded senior role for junior search: "${role}" at ${company}`);
              continue;
            }

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
        } catch (jobErr) {
          console.error('[Scraper] Error parsing a job result', jobErr.message);
        }
      }
    } catch (err) {
      console.error(`[Scraper] Error searching ${q}:`, err.message);
    }
  }

  return jobs;
}

// Search LinkedIn for HR profile based on company
async function findHROnLinkedIn(company, location = 'India') {
  if (!process.env.SERPER_API_KEY || !company) return null;

  try {
    const query = `site:linkedin.com/in/ "HR" OR "Talent Acquisition" OR "Recruiter" "${company}" "${location}"`;
    const res = await axios.post('https://google.serper.dev/search', {
      q: query,
      num: 5
    }, {
      headers: {
        'X-API-KEY': process.env.SERPER_API_KEY,
        'Content-Type': 'application/json'
      }
    });

    const organic = res.data.organic || [];
    for (const item of organic) {
      let rawTitle = item.title || '';
      let cleanName = rawTitle
        .split('|')[0]
        .split('-')[0]
        .split('–')[0]
        .split(':')[0]
        .replace(/\b(HR|Talent|Recruiter|Manager|Director|Lead|Executive|Head|Consultant|Specialist|LinkedIn)\b/gi, '')
        .replace(/[^a-zA-Z\s]/g, '')
        .trim();

      const nameParts = cleanName.split(/\s+/).filter(Boolean);
      // Valid personal name is typically 2-3 words
      if (nameParts.length >= 2 && nameParts.length <= 4) {
        return {
          name: cleanName,
          linkedinUrl: item.link,
          snippet: item.snippet
        };
      }
    }

    if (organic.length > 0) {
      const fallbackName = organic[0].title.split('|')[0].split('-')[0].trim();
      return {
        name: fallbackName,
        linkedinUrl: organic[0].link,
        snippet: organic[0].snippet
      };
    }
  } catch (err) {
    console.error('[Scraper] Error finding HR:', err.message);
  }
  return null;
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
  'unknown'
]);

function isInvalidCompany(comp) {
  if (!comp || typeof comp !== 'string') return true;
  const lower = comp.toLowerCase().trim();
  if (lower.length < 2 || lower.length > 50) return true;
  if (KNOWN_INVALID_COMPANIES.has(lower)) return true;
  if (/\b(recruiter|talent|acquisition|sourcer|strategist|developer|engineer|experience|years?|joiner|hiring|fresher)\b/i.test(lower)) {
    return true;
  }
  return false;
}

function parseHRItem(item) {
  const title = (item.title || '').replace(/\s*\|\s*LinkedIn$/i, '').replace(/\s*-\s*LinkedIn$/i, '').trim();
  const snippet = item.snippet || '';
  const link = item.link || '';

  const parts = title.split(/\s*[-–—|]\s*/);
  let name = parts[0]?.trim() || '';
  name = name.replace(/\b(HR|Talent|Recruiter|Manager|Head|Lead|Director|Specialist)\b/gi, '').trim();

  let role = parts[1]?.trim() || 'Technical Recruiter';
  let company = parts[2]?.trim() || '';

  if (/\bat\b/i.test(role) && !company) {
    const atParts = role.split(/\bat\b/i);
    role = atParts[0]?.trim();
    company = atParts[1]?.trim();
  }

  // If company looks like a job title or skill, invalidate it
  if (isInvalidCompany(company)) {
    company = '';
  }

  // Check snippet for company if company still empty
  if (!company) {
    const atMatch = snippet.match(/(?:at|with|for)\s+([A-Z][A-Za-z0-9\s&.,]+?)(?:\.|\s*[-–—]|,\s*(?:India|Bengaluru|Bangalore|Mumbai|Delhi|Hyderabad|Pune)|(?:\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4}))/i);
    if (atMatch && atMatch[1] && !isInvalidCompany(atMatch[1])) {
      company = atMatch[1].trim();
    }
  }

  // Clean company name of trailing locations or symbols
  company = company.replace(/\s*[-–—].*$/, '').replace(/\b(India|Bangalore|Bengaluru|Mumbai|Delhi|Gurgaon|Gurugram|Hyderabad|Pune|Area|LinkedIn)\b/gi, '').trim();
  if (isInvalidCompany(company)) {
    company = '';
  }

  return { name, role, company: company || '', link, snippet, rawTitle: title };
}

// Directly discover HR recruiters and talent acquisition leads on LinkedIn
async function discoverHRProfiles(query = 'software engineer', location = 'India', existingUrls = []) {
  if (!process.env.SERPER_API_KEY) {
    console.log('No SERPER_API_KEY, skipping HR profile search.');
    return [];
  }

  const cleanQuery = (query || 'software engineer').trim();
  const searchQueries = [
    `site:linkedin.com/in/ ("Technical Recruiter" OR "Talent Acquisition" OR "IT Recruiter") "${cleanQuery}" "${location}"`,
    `site:linkedin.com/in/ ("HR Manager" OR "Hiring" OR "Talent Partner") "${cleanQuery}" "${location}"`
  ];

  const allItems = [];
  for (const q of searchQueries) {
    try {
      const res = await axios.post('https://google.serper.dev/search', {
        q,
        num: 10
      }, {
        headers: {
          'X-API-KEY': process.env.SERPER_API_KEY,
          'Content-Type': 'application/json'
        },
        timeout: 8000
      });
      if (res.data && Array.isArray(res.data.organic)) {
        allItems.push(...res.data.organic);
      }
    } catch (err) {
      console.error(`[Scraper] Error in Serper HR search for "${q}":`, err.message);
    }
  }

  // Deduplicate and filter out already known profile URLs
  const seenUrls = new Set((existingUrls || []).map(u => (u || '').toLowerCase().trim()));
  const uniqueItems = [];
  for (const item of allItems) {
    if (!item.link) continue;
    const lowerLink = item.link.toLowerCase().trim();
    if (!seenUrls.has(lowerLink)) {
      seenUrls.add(lowerLink);
      uniqueItems.push(item);
    }
  }

  if (uniqueItems.length === 0) return [];

  // Parse candidate profiles using regex
  const candidates = uniqueItems.map(parseHRItem).filter(c => {
    const isRecruiter = /\b(recruiter|talent|hr|hiring|staffing|sourcer|people|human resources|ta\b)/i.test(c.role) ||
                        /\b(recruiter|talent|hr|hiring|staffing|sourcer|people|human resources|ta\b)/i.test(c.snippet);
    return isRecruiter && c.name && c.name.length >= 2;
  });

  if (candidates.length === 0) return [];

  // Single fast batch AI refinement to accurately extract Company and Role
  try {
    const prompt = `You are an expert at extracting recruiter data from Google Search LinkedIn snippets.
Extract the recruiter's exact personal Name, current professional Recruiting Role, and current corporate Employer (Company).

CRITICAL RULES:
1. "name": The person's first and last name only (e.g. "Priyanka Reddy", "Abish Balakrishnan", "Divyalakshmi K").
2. "role": Their professional recruiting title (e.g. "Senior Technical Recruiter", "Certified Technical Recruiter", "HR Manager").
3. "company": The actual business or corporate entity they work at (e.g. "Workcog Inc", "Numentica", "VIVA USA Inc", "Teknowiz", "Professional Peers").
   - Notice that headlines often contain buzzwords like "Sourcing Strategist" or "Data-Driven Hiring" which are NOT companies. Look closely at the snippet for the real company name!
   - NEVER use job titles or experience phrases (e.g. "6+ Years Experience") as company.
   - NEVER use "LinkedIn", "Data", "Tech Company", "India" as company.
   - If no distinct corporate employer name exists in the title or snippet, set "company": null.

Items:
${candidates.slice(0, 10).map((it, idx) => `[${idx}] Title: ${it.rawTitle || it.role}\nSnippet: ${it.snippet}`).join('\n\n')}

Return JSON array of objects: [{"index": number, "name": string, "role": string, "company": string | null}]
Return ONLY valid JSON array.`;

    const aiRes = await callAIWithRetry(prompt, 2, 900);
    const jsonMatch = aiRes.text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const refined = JSON.parse(jsonMatch[0]);
      if (Array.isArray(refined)) {
        refined.forEach(r => {
          if (candidates[r.index]) {
            if (r.name && r.name.length >= 2) candidates[r.index].name = r.name.trim();
            if (r.role) candidates[r.index].role = r.role.trim();
            if (r.company && !isInvalidCompany(r.company)) {
              candidates[r.index].company = r.company.trim();
            } else {
              candidates[r.index].company = '';
            }
          }
        });
      }
    }
  } catch (aiErr) {
    console.log('[Scraper] Batch AI HR refinement skipped:', aiErr.message);
  }

  return candidates.map(c => ({
    name: c.name,
    role: c.role || 'Technical Recruiter',
    company: (c.company && !isInvalidCompany(c.company)) ? c.company : 'Direct Recruiter / Agency',
    link: c.link,
    snippet: c.snippet,
    location: location
  }));
}

module.exports = { scrapeJobsFree, findHROnLinkedIn, discoverHRProfiles, isInvalidCompany };

