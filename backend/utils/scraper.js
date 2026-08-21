const axios = require('axios');
const cheerio = require('cheerio');
const { callAIWithRetry } = require('./ai');

async function scrapeJobsFree(query, location = 'India') {
  const jobs = [];
  
  if (!process.env.SERPER_API_KEY) {
    console.error('SERPER_API_KEY is missing. Free scraping requires Google Dorking via Serper.');
    return jobs;
  }

  // We use Serper to find jobs on LinkedIn, Indeed, and Naukri posted recently (tbs=qdr:d for last 24h, since 8h isn't a direct param, we filter later if needed or just use d)
  const dorkQueries = [
    `site:linkedin.com/jobs/view "${query}" "${location}"`,
    `site:in.indeed.com/viewjob "${query}" "${location}"`,
    `site:naukri.com/job-listings "${query}" "${location}"`
  ];

  for (const q of dorkQueries) {
    try {
      const res = await axios.post('https://google.serper.dev/search', {
        q: q,
        tbs: "qdr:d", // Past 24 hours
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
            jobs.push({
              company,
              role,
              jd: fullJD,
              applyLink: url,
              location: location,
              source: source,
              publishedAt: new Date(), // It's from last 24h
            });
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
async function findHROnLinkedIn(company) {
  if (!process.env.SERPER_API_KEY) return null;

  try {
    const query = `site:linkedin.com/in/ "HR" OR "Talent Acquisition" OR "Recruiter" "${company}"`;
    const res = await axios.post('https://google.serper.dev/search', {
      q: query,
      num: 3
    }, {
      headers: {
        'X-API-KEY': process.env.SERPER_API_KEY,
        'Content-Type': 'application/json'
      }
    });

    const organic = res.data.organic || [];
    if (organic.length > 0) {
      // Pick the first one
      return {
        name: organic[0].title.split(' - ')[0] || 'HR Manager',
        linkedinUrl: organic[0].link,
        snippet: organic[0].snippet
      };
    }
  } catch (err) {
    console.error('[Scraper] Error finding HR:', err.message);
  }
  return null;
}

module.exports = { scrapeJobsFree, findHROnLinkedIn };
