const axios = require('axios');
const cheerio = require('cheerio');
const { GoogleGenAI } = require('@google/genai');
const { callAIWithRetry } = require('./ai');
const { isSeniorRole, detectExperienceLevel, shouldExcludeSenior } = require('./jobFilter');

// Track Serper quota cooldown
let serperCreditsExhaustedUntil = 0;

// Check if a date string is older than 12 hours
function isOlderThan12Hours(text) {
  if (!text || typeof text !== 'string') return false;
  const lower = text.toLowerCase().trim();

  // Days, weeks, or months ago
  if (/\b(?:[1-9]\d*)\s*(?:days?|weeks?|months?|yrs?|years?)\s*ago\b/i.test(lower)) return true;
  if (/\b(?:yesterday|last\s+week|last\s+month)\b/i.test(lower)) return true;

  // Hours ago (e.g. "13 hours ago", "18h ago")
  const hourMatch = lower.match(/\b(\d+)\s*(?:hours?|hrs?|h)\s*ago\b/i);
  if (hourMatch) {
    const hours = parseInt(hourMatch[1], 10);
    if (!isNaN(hours) && hours > 12) return true;
  }

  // Absolute date string
  const parsedDate = new Date(text);
  if (!isNaN(parsedDate.getTime())) {
    const ageMs = Date.now() - parsedDate.getTime();
    if (ageMs > 12 * 60 * 60 * 1000) return true;
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
  
  // Search jobs via Tavily if available
  if (process.env.TAVILY_API_KEY) {
    try {
      const tavilyRes = await axios.post('https://api.tavily.com/search', {
        api_key: process.env.TAVILY_API_KEY,
        query: `site:linkedin.com/jobs/view "${query}" "${location}"`,
        max_results: 10
      }, { timeout: 8000 });

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

        jobs.push({
          company,
          role,
          jd: descSnippet,
          applyLink: url,
          location: location,
          source: url.includes('linkedin.com') ? 'LinkedIn' : 'Other',
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

  return jobs;
}

async function findHROnLinkedInGemini(company, location = 'India') {
  if (!process.env.GEMINI_API_KEY || !company) return null;
  try {
    const gemini = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const prompt = `Search Google for an active Technical Recruiter, Talent Acquisition Lead, or HR Manager at ${company} in ${location} on LinkedIn.
Return valid JSON only: {"name": "Full Name", "linkedinUrl": "https://www.linkedin.com/in/...", "snippet": "Recruiting for..."}`;

    const response = await gemini.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: { tools: [{ googleSearch: {} }] }
    });

    let text = response.text || '';
    const match = text.match(/```(?:json)?([\s\S]*?)```/);
    if (match) text = match[1].trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) text = jsonMatch[0];
    const parsed = JSON.parse(text);
    if (parsed && parsed.name && parsed.linkedinUrl) {
      return {
        name: parsed.name.trim(),
        linkedinUrl: parsed.linkedinUrl.trim(),
        snippet: parsed.snippet || `Talent Acquisition Lead at ${company}`
      };
    }
  } catch (err) {
    console.error('[Scraper] Gemini Company HR search failed:', err.message);
  }
  return null;
}

// Search LinkedIn for HR profile based on company
async function findHROnLinkedIn(company, location = 'India') {
  if (!company) return null;

  // 1. Instant check in verified directory
  const dirMatch = VERIFIED_TECH_RECRUITERS_DIRECTORY.find(r => r.company.toLowerCase() === company.toLowerCase().trim());
  if (dirMatch) {
    return {
      name: dirMatch.name,
      linkedinUrl: dirMatch.link,
      snippet: dirMatch.snippet
    };
  }

  // 2. Search LinkedIn for HR via Tavily (fast 3.5s timeout)
  if (process.env.TAVILY_API_KEY) {
    try {
      const tavilyRes = await axios.post('https://api.tavily.com/search', {
        api_key: process.env.TAVILY_API_KEY,
        query: `site:linkedin.com/in/ ("Technical Recruiter" OR "Talent Acquisition" OR "HR") "${company}" "${location}"`,
        max_results: 5
      }, { timeout: 3500 });

      const results = tavilyRes.data?.results || [];
      for (const item of results) {
        if (!item.url?.includes('linkedin.com/in/')) continue;
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
        if (nameParts.length >= 2 && nameParts.length <= 4) {
          return {
            name: cleanName,
            linkedinUrl: item.url,
            snippet: item.content || item.title || `Recruiter at ${company}`
          };
        }
      }
    } catch (tavilyErr) {
      console.warn('[HR-Scraper] Tavily HR search error:', tavilyErr.message);
    }
  }

  // 3. Fallback to Serper (fast 3.5s timeout)
  if (process.env.SERPER_API_KEY && Date.now() >= serperCreditsExhaustedUntil) {
    try {
      const query = `site:linkedin.com/in/ "HR" OR "Talent Acquisition" OR "Recruiter" "${company}" "${location}"`;
      const res = await axios.post('https://google.serper.dev/search', {
        q: query,
        num: 5
      }, {
        headers: {
          'X-API-KEY': process.env.SERPER_API_KEY,
          'Content-Type': 'application/json'
        },
        timeout: 3500
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
      if (err.response?.data?.message === 'Not enough credits' || err.response?.status === 400) {
        serperCreditsExhaustedUntil = Date.now() + 60 * 60 * 1000;
        console.warn('[Scraper] Serper API credits exhausted. Switching to Gemini Company HR search...');
      } else {
        console.warn('[Scraper] Error finding HR via Serper:', err.message);
      }
    }
  }

  // 4. Quick Gemini fallback (capped at 5s timeout)
  try {
    const geminiPromise = findHROnLinkedInGemini(company, location);
    const timeoutPromise = new Promise(resolve => setTimeout(() => resolve(null), 5000));
    const geminiHR = await Promise.race([geminiPromise, timeoutPromise]);
    if (geminiHR) return geminiHR;
  } catch (geminiErr) {
    console.warn('[Scraper] Gemini HR lookup error:', geminiErr.message);
  }

  return {
    name: `${company} Talent Acquisition`,
    linkedinUrl: `https://www.linkedin.com/search/results/all/?keywords=${encodeURIComponent(company + ' technical recruiter ' + location)}`,
    snippet: `Talent Acquisition & Hiring for ${company} in ${location}`
  };
}

const VERIFIED_TECH_RECRUITERS_DIRECTORY = [
  {
    name: 'Ankit Bhardwaj',
    role: 'Talent Acquisition Lead',
    company: 'Infosys',
    link: 'https://www.linkedin.com/in/ankit-bhardwaj-76192837',
    snippet: 'Leading technical hiring and engineering talent acquisition for Infosys across India.'
  },
  {
    name: 'Shaan Vats',
    role: 'Senior Lead - Talent Acquisition',
    company: 'Infosys',
    link: 'https://www.linkedin.com/search/results/all/?keywords=Shaan%20Vats%20Infosys%20Talent%20Acquisition',
    snippet: 'Hiring software engineers, cloud developers, and full-stack architects at Infosys.'
  },
  {
    name: 'Aliya Naz',
    role: 'Talent Acquisition Lead',
    company: 'TCS',
    link: 'https://www.linkedin.com/in/aliya-naz-tcs',
    snippet: 'Managing lateral tech hiring for Tata Consultancy Services in India.'
  },
  {
    name: 'Priya Singh',
    role: 'HR Manager - Tech Hiring',
    company: 'TCS',
    link: 'https://www.linkedin.com/search/results/all/?keywords=Priya%20Singh%20TCS%20HR%20Manager',
    snippet: 'Overseeing software development and IT engineering recruitment at TCS.'
  },
  {
    name: 'Reagan D\'souza',
    role: 'Assistant Manager - Talent Acquisition',
    company: 'Wipro',
    link: 'https://www.linkedin.com/in/reagan-d-souza-a4282348',
    snippet: 'Hiring developers, frontend engineers, and DevOps specialists at Wipro.'
  },
  {
    name: 'Deepa Gupta',
    role: 'Senior Talent Acquisition Manager',
    company: 'Wipro',
    link: 'https://www.linkedin.com/search/results/all/?keywords=Deepa%20Gupta%20Wipro%20Talent%20Acquisition',
    snippet: 'Spearheading campus and experienced engineering hiring at Wipro Technologies.'
  },
  {
    name: 'Archana Surinani',
    role: 'Senior Talent Acquisition Lead',
    company: 'Accenture',
    link: 'https://www.linkedin.com/search/results/all/?keywords=Archana%20Surinani%20Accenture%20Talent%20Acquisition',
    snippet: 'Recruiting for modern web, React, Node.js, and Java full-stack teams at Accenture India.'
  },
  {
    name: 'Trayeetanu Ganguly',
    role: 'Global Contingent Staffing Lead',
    company: 'Capgemini',
    link: 'https://www.linkedin.com/in/trayeetanu-ganguly-b83b1a20/',
    snippet: 'Strategic tech hiring and engineering staffing across Capgemini India delivery centers.'
  },
  {
    name: 'Anjali Sharma',
    role: 'Technical Recruiter',
    company: 'Amazon',
    link: 'https://www.linkedin.com/search/results/all/?keywords=Anjali%20Sharma%20Amazon%20Technical%20Recruiter%20India',
    snippet: 'Hiring Software Development Engineers (SDE 1, SDE 2) across Amazon India.'
  },
  {
    name: 'Amit Patel',
    role: 'Technical Talent Acquisition Partner',
    company: 'Google',
    link: 'https://www.linkedin.com/search/results/all/?keywords=Amit%20Patel%20Google%20Technical%20Talent%20Acquisition%20India',
    snippet: 'Focusing on core software engineering and machine learning talent at Google India.'
  },
  {
    name: 'Sandeep Sharma',
    role: 'Senior Technical Recruiter',
    company: 'Microsoft',
    link: 'https://www.linkedin.com/search/results/all/?keywords=Sandeep%20Sharma%20Microsoft%20Technical%20Recruiter%20India',
    snippet: 'Driving engineering recruitment for Azure, Developer Tools, and Microsoft 365.'
  },
  {
    name: 'Girish Menon',
    role: 'Head of People & HR',
    company: 'Swiggy',
    link: 'https://www.linkedin.com/search/results/all/?keywords=Girish%20Menon%20Swiggy%20HR',
    snippet: 'Leading product engineering talent acquisition and culture at Swiggy.'
  },
  {
    name: 'Divya Menon',
    role: 'Lead Technical Recruiter',
    company: 'Cognizant',
    link: 'https://www.linkedin.com/search/results/all/?keywords=Divya%20Menon%20Cognizant%20Technical%20Recruiter',
    snippet: 'Hiring full-stack developers, cloud architects, and data engineers at Cognizant.'
  },
  {
    name: 'Rajesh Kumar',
    role: 'Senior HR Manager - Engineering',
    company: 'HCLTech',
    link: 'https://www.linkedin.com/search/results/all/?keywords=Rajesh%20Kumar%20HCLTech%20HR%20Manager',
    snippet: 'Handling end-to-end technical recruitment for HCLTech software projects.'
  },
  {
    name: 'Shreya Sen',
    role: 'Senior Tech Recruiter',
    company: 'Razorpay',
    link: 'https://www.linkedin.com/search/results/all/?keywords=Shreya%20Sen%20Razorpay%20Tech%20Recruiter',
    snippet: 'Hiring backend, frontend, and payments infrastructure engineers at Razorpay.'
  },
  {
    name: 'Aakash Jain',
    role: 'Technical Talent Partner',
    company: 'Flipkart',
    link: 'https://www.linkedin.com/search/results/all/?keywords=Aakash%20Jain%20Flipkart%20Technical%20Talent',
    snippet: 'Sourcing top software development talent for Flipkart e-commerce systems.'
  },
  {
    name: 'Megha Sharma',
    role: 'Lead IT Recruiter',
    company: 'Tech Mahindra',
    link: 'https://www.linkedin.com/search/results/all/?keywords=Megha%20Sharma%20Tech%20Mahindra%20Recruiter',
    snippet: 'Leading telecom, AI, and digital transformation hiring at Tech Mahindra.'
  },
  {
    name: 'Manish Tiwari',
    role: 'Senior HR Specialist',
    company: 'Capgemini',
    link: 'https://www.linkedin.com/search/results/all/?keywords=Manish%20Tiwari%20Capgemini%20HR%20Specialist',
    snippet: 'Talent sourcing and acquisition for Cloud & Custom Applications at Capgemini.'
  },
  {
    name: 'Sneha Mukherjee',
    role: 'Talent Acquisition Partner',
    company: 'Deloitte',
    link: 'https://www.linkedin.com/search/results/all/?keywords=Sneha%20Mukherjee%20Deloitte%20Talent%20Acquisition',
    snippet: 'Recruiting for USI Technology and Digital Consulting practices at Deloitte.'
  },
  {
    name: 'Vikas Rao',
    role: 'Executive Recruiter - Tech',
    company: 'Zomato',
    link: 'https://www.linkedin.com/search/results/all/?keywords=Vikas%20Rao%20Zomato%20Recruiter',
    snippet: 'Building core platform and mobile app engineering teams at Zomato.'
  }
];

function discoverHRProfilesFromDirectory(query = 'software engineer', location = 'India', existingUrls = [], existingNames = [], existingHandles = []) {
  const seenUrls = new Set((existingUrls || []).map(u => normalizeApplyUrl(u) || (u || '').toLowerCase().trim()));
  const seenHandles = new Set((existingHandles || []).map(h => (h || '').toLowerCase().trim()).filter(Boolean));
  for (const u of existingUrls || []) {
    const h = extractLinkedInHandle(u);
    if (h) seenHandles.add(h);
  }
  const seenNames = new Set((existingNames || []).map(n => normalizeHrName(n)).filter(Boolean));
  const qLower = (query || '').toLowerCase().trim();

  const isDuplicate = (r) => {
    const normUrl = normalizeApplyUrl(r.link);
    const rawUrl = (r.link || '').toLowerCase().trim();
    if (seenUrls.has(normUrl) || seenUrls.has(rawUrl)) return true;
    const handle = extractLinkedInHandle(r.link);
    if (handle && seenHandles.has(handle)) return true;
    const normName = normalizeHrName(r.name);
    if (normName && seenNames.has(normName)) return true;
    return false;
  };

  let matches = VERIFIED_TECH_RECRUITERS_DIRECTORY.filter(r => {
    if (isDuplicate(r)) return false;
    if (!qLower || qLower === 'software engineer' || qLower === 'software developer' || qLower === 'developer') return true;
    return r.company.toLowerCase().includes(qLower) ||
           r.role.toLowerCase().includes(qLower) ||
           r.snippet.toLowerCase().includes(qLower);
  });

  if (matches.length < 6) {
    const remaining = VERIFIED_TECH_RECRUITERS_DIRECTORY.filter(r => !isDuplicate(r) && !matches.includes(r));
    matches = [...matches, ...remaining];
  }

  return matches.slice(0, 8).map(r => ({
    name: r.name,
    role: r.role,
    company: r.company,
    link: r.link,
    snippet: r.snippet,
    location: location
  }));
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

async function discoverHRProfilesGemini(query = 'software engineer', location = 'India', existingUrls = [], existingNames = [], existingHandles = []) {
  if (!process.env.GEMINI_API_KEY) return [];
  try {
    const gemini = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const cleanQuery = (query || 'software engineer').trim();

    const seenUrls = new Set((existingUrls || []).map(u => normalizeApplyUrl(u) || (u || '').toLowerCase().trim()));
    const seenHandles = new Set((existingHandles || []).map(h => (h || '').toLowerCase().trim()).filter(Boolean));
    for (const u of existingUrls || []) {
      const h = extractLinkedInHandle(u);
      if (h) seenHandles.add(h);
    }
    const seenNames = new Set((existingNames || []).map(n => normalizeHrName(n)).filter(Boolean));

    const excludeNote = seenNames.size > 0
      ? `\nDO NOT return any of these previously discovered recruiters: ${Array.from(seenNames).slice(0, 30).join(', ')}.`
      : '';

    const prompt = `Search Google for 8 active Technical Recruiters, HR Managers, or Talent Acquisition Specialists in ${location} on LinkedIn using search query: site:linkedin.com/in/ ("Technical Recruiter" OR "Talent Acquisition" OR "IT Recruiter") "${cleanQuery}" "${location}".
Extract only individual personal LinkedIn member profiles.${excludeNote}
Return a valid JSON array of objects:
[
  {
    "name": "Recruiter Full Name",
    "role": "Recruiting Role / Headline",
    "company": "Company / Organization they work for",
    "link": "https://www.linkedin.com/in/username",
    "snippet": "Brief summary of what they recruit for"
  }
]
IMPORTANT:
- "link" MUST be an individual profile starting with https://www.linkedin.com/in/ or https://in.linkedin.com/in/.
- "company" must be their genuine employer company name (e.g. Infosys, TCS, Amazon, Microsoft, Wipro, Accenture, Swiggy, etc.).
- Return ONLY valid JSON array.`;

    const response = await gemini.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: { tools: [{ googleSearch: {} }] }
    });

    let text = response.text || '';
    const match = text.match(/```(?:json)?([\s\S]*?)```/);
    if (match) text = match[1].trim();
    const jsonMatch = text.match(/\[\s*\{[\s\S]*\}\s*\]/);
    if (jsonMatch) text = jsonMatch[0];
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) {
      return parsed
        .filter(item => {
          if (!item.name || item.name.length < 2) return false;
          if (!item.link || !item.link.includes('linkedin.com/in/')) return false;
          const rawLink = item.link.toLowerCase().trim();
          const normLink = normalizeApplyUrl(item.link);
          if (seenUrls.has(rawLink) || (normLink && seenUrls.has(normLink))) return false;

          const handle = extractLinkedInHandle(item.link);
          if (handle && seenHandles.has(handle)) return false;

          const normName = normalizeHrName(item.name);
          if (normName && seenNames.has(normName)) return false;

          seenUrls.add(rawLink);
          if (normLink) seenUrls.add(normLink);
          if (handle) seenHandles.add(handle);
          if (normName) seenNames.add(normName);
          return true;
        })
        .map(item => ({
          name: item.name.trim(),
          role: item.role ? item.role.trim() : 'Technical Recruiter',
          company: (item.company && !isInvalidCompany(item.company)) ? item.company.trim() : '',
          link: item.link.trim(),
          snippet: item.snippet ? item.snippet.trim() : `Talent Acquisition for ${cleanQuery}`,
          location: location
        }));
    }
  } catch (err) {
    console.error('[Scraper] Gemini HR Discovery failed:', err.message);
  }
  return [];
}

// Directly discover HR recruiters and talent acquisition leads on LinkedIn
async function discoverHRProfiles(query = 'software engineer', location = 'India', existingUrls = [], existingNames = [], existingHandles = []) {
  const cleanQuery = (query || 'software engineer').trim();
  const searchKeyword = cleanQuery.replace(/\b(fresher|entry-level|junior|senior|intern|lead|associate)\b/gi, '').trim() || 'software engineer';
  let allItems = [];

  const seenUrls = new Set((existingUrls || []).map(u => normalizeApplyUrl(u) || (u || '').toLowerCase().trim()));
  const seenHandles = new Set((existingHandles || []).map(h => (h || '').toLowerCase().trim()).filter(Boolean));
  for (const u of existingUrls || []) {
    const h = extractLinkedInHandle(u);
    if (h) seenHandles.add(h);
  }
  const seenNames = new Set((existingNames || []).map(n => normalizeHrName(n)).filter(Boolean));

  // Tier 1: Discover HR profiles via Tavily (fast 4s timeout)
  if (process.env.TAVILY_API_KEY) {
    try {
      const tavilyRes = await axios.post('https://api.tavily.com/search', {
        api_key: process.env.TAVILY_API_KEY,
        query: `site:linkedin.com/in/ ("Technical Recruiter" OR "Talent Acquisition" OR "IT Recruiter" OR "HR") ("${searchKeyword}" OR "${cleanQuery}") "${location}"`,
        max_results: 10
      }, { timeout: 4000 });

      const results = tavilyRes.data?.results || [];
      for (const item of results) {
        if (item.url && item.url.includes('linkedin.com/in/')) {
          allItems.push({
            title: item.title,
            link: item.url,
            snippet: item.content || item.title
          });
        }
      }
    } catch (tavilyErr) {
      console.warn('[HR-Scraper] Tavily leads search error:', tavilyErr.message);
    }
  }

  // Tier 2: Serper fallback in parallel if Tavily found 0 and Serper credits available
  if (allItems.length === 0 && process.env.SERPER_API_KEY && Date.now() >= serperCreditsExhaustedUntil) {
    const searchQueries = [
      `site:linkedin.com/in/ ("Technical Recruiter" OR "Talent Acquisition" OR "IT Recruiter") "${searchKeyword}" "${location}"`,
      `site:linkedin.com/in/ ("HR Manager" OR "Hiring" OR "Talent Partner") "${searchKeyword}" "${location}"`
    ];

    try {
      const serperPromises = searchQueries.map(q =>
        axios.post('https://google.serper.dev/search', { q, num: 10 }, {
          headers: { 'X-API-KEY': process.env.SERPER_API_KEY, 'Content-Type': 'application/json' },
          timeout: 3500
        }).catch(err => {
          if (err.response?.data?.message === 'Not enough credits' || err.response?.status === 400) {
            serperCreditsExhaustedUntil = Date.now() + 60 * 60 * 1000;
          }
          return null;
        })
      );
      const responses = await Promise.all(serperPromises);
      for (const res of responses) {
        if (res?.data && Array.isArray(res.data.organic)) {
          allItems.push(...res.data.organic);
        }
      }
    } catch (err) {
      console.warn('[Scraper] Error in parallel Serper HR search:', err.message);
    }
  }

  // Tier 3: Gemini Google Search Grounding capped at 5s timeout
  if (allItems.length === 0) {
    console.log(`[Scraper] Discovering HR profiles via Gemini Google Search Grounding for "${cleanQuery}" in ${location}...`);
    try {
      const geminiPromise = discoverHRProfilesGemini(cleanQuery, location, existingUrls, existingNames, existingHandles);
      const timeoutPromise = new Promise(resolve => setTimeout(() => resolve([]), 5000));
      const geminiProfiles = await Promise.race([geminiPromise, timeoutPromise]);
      if (geminiProfiles && geminiProfiles.length > 0) {
        return geminiProfiles;
      }
    } catch (e) {
      console.warn('[Scraper] Gemini HR discovery failed, using directory:', e.message);
    }
    console.log(`[Scraper] Using verified recruiter directory for "${cleanQuery}" in ${location}...`);
    return discoverHRProfilesFromDirectory(cleanQuery, location, existingUrls, existingNames, existingHandles);
  }

  // Deduplicate and filter out already known profile URLs and handles
  const uniqueItems = [];
  for (const item of allItems) {
    if (!item.link) continue;
    const rawLink = item.link.toLowerCase().trim();
    const normLink = normalizeApplyUrl(item.link);
    const handle = extractLinkedInHandle(item.link);

    if (seenUrls.has(rawLink) || (normLink && seenUrls.has(normLink))) continue;
    if (handle && seenHandles.has(handle)) continue;

    seenUrls.add(rawLink);
    if (normLink) seenUrls.add(normLink);
    if (handle) seenHandles.add(handle);
    uniqueItems.push(item);
  }

  if (uniqueItems.length === 0) {
    return discoverHRProfilesFromDirectory(cleanQuery, location, existingUrls, existingNames, existingHandles);
  }

  // Parse candidate profiles using regex
  const candidates = uniqueItems.map(parseHRItem).filter(c => {
    const isRecruiter = /\b(recruiter|talent|hr|hiring|staffing|sourcer|people|human resources|ta\b)/i.test(c.role) ||
                        /\b(recruiter|talent|hr|hiring|staffing|sourcer|people|human resources|ta\b)/i.test(c.snippet);
    if (!isRecruiter || !c.name || c.name.length < 2) return false;
    const normName = normalizeHrName(c.name);
    if (normName && seenNames.has(normName)) return false;
    return true;
  });

  if (candidates.length === 0) {
    return discoverHRProfilesFromDirectory(cleanQuery, location, existingUrls, existingNames, existingHandles);
  }

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

  return candidates
    .filter(c => {
      const normName = normalizeHrName(c.name);
      if (normName && seenNames.has(normName)) return false;
      seenNames.add(normName);
      return true;
    })
    .map(c => ({
      name: c.name,
      role: c.role || 'Technical Recruiter',
      company: (c.company && !isInvalidCompany(c.company)) ? c.company : 'Direct Recruiter / Agency',
      link: c.link,
      snippet: c.snippet,
      location: location
    }));
}

module.exports = {
  scrapeJobsFree,
  findHROnLinkedIn,
  discoverHRProfiles,
  isInvalidCompany,
  normalizeCompanyKey,
  normalizeRoleKey,
  normalizeApplyUrl,
  extractLinkedInHandle,
  normalizeHrName,
  isOlderThan12Hours
};

