const express = require('express');
const router = express.Router();
const multer = require('multer');
const pdfParse = require('pdf-parse');
const User = require('../models/User');
const Profile = require('../models/Profile');
const requireAuth = require('../middleware/requireAuth');
const { callAIWithRetry } = require('../utils/ai');

const upload = multer({ storage: multer.memoryStorage() });

async function getProfile(userId, includePdf = false) {
  let query = Profile.findOne({ userId });
  if (!includePdf) {
    query = query.select('-resumePdf');
  }
  let profile = await query;
  if (!profile) {
    profile = new Profile({ userId });
    await profile.save();
  }
  return profile;
}

router.get('/', requireAuth, async (req, res) => {
  try {
    const profile = await getProfile(req.user.id, true);
    const user = await User.findById(req.user.id).select('email');

    // Auto-detect portfolio from existing resumePdf annotations or resumeText if not yet set
    if (!profile.portfolio) {
      let extractedPortfolio = '';
      if (profile.resumePdf) {
        try {
          const rawPdfStr = profile.resumePdf.toString('latin1');
          const uriRegex = /\/URI\s*\(([^)]+)\)/g;
          let m;
          while ((m = uriRegex.exec(rawPdfStr)) !== null) {
            const url = m[1].replace(/\\([()\\])/g, '$1').trim();
            if ((url.startsWith('http://') || url.startsWith('https://')) &&
              !url.includes('linkedin.com') &&
              !url.includes('github.com') &&
              !url.includes('twitter.com') &&
              !url.includes('x.com')) {
              extractedPortfolio = url;
              break;
            }
          }
        } catch (e) { }
      }

      if (!extractedPortfolio && profile.resumeText) {
        const portfolioMatch = profile.resumeText.match(/(?:portfolio|website|site|web|link|live)\s*[:\-–]\s*(https?:\/\/[^\s,;]+)/i) ||
          profile.resumeText.match(/\b(https?:\/\/(?:www\.)?[a-zA-Z0-9-]+\.(?:dev|me|io|app|site|vercel\.app|netlify\.app|pages\.dev)(?:\/[^\s,;]*)?)\b/i);
        if (portfolioMatch) extractedPortfolio = portfolioMatch[1].trim();
      }

      if (extractedPortfolio) {
        profile.portfolio = extractedPortfolio;
        await Profile.updateOne({ _id: profile._id }, { $set: { portfolio: extractedPortfolio } });
      }
    }

    const profileObj = profile.toObject();
    delete profileObj.resumePdf;

    const responseData = {
      ...profileObj,
      emailUser: user ? user.email : ''
    };
    res.json(responseData || {});
  } catch (err) {
    console.error('Failed to fetch profile:', err);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

const updateProfileHandler = async (req, res) => {
  try {
    const profile = await getProfile(req.user.id);

    const allowedFields = ['name', 'title', 'phone', 'linkedin', 'github', 'portfolio', 'githubToken', 'tone', 'experienceLevel', 'enableFlex', 'enableAutoFollowUp', 'aiInstructions'];
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        profile[field] = req.body[field];
      }
    }

    await profile.save();
    const user = await User.findById(req.user.id);
    const profileObj = profile.toObject();
    delete profileObj.resumePdf;
    res.json({ ...profileObj, emailUser: user.email });
  } catch (err) {
    console.error('Profile Update Error:', err);
    res.status(500).json({ error: 'Failed to update profile' });
  }
};

router.put('/', requireAuth, updateProfileHandler);
router.post('/', requireAuth, updateProfileHandler);

router.post('/resume', requireAuth, upload.single('resume'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const dataBuffer = req.file.buffer;
    const data = await pdfParse(dataBuffer);

    // Extract all embedded hyperlink annotations from PDF binary (e.g. /URI (https://...))
    const embeddedLinks = [];
    try {
      const rawPdfStr = dataBuffer.toString('latin1');
      const uriRegex = /\/URI\s*\(([^)]+)\)/g;
      let match;
      while ((match = uriRegex.exec(rawPdfStr)) !== null) {
        const url = match[1].replace(/\\([()\\])/g, '$1').trim();
        if ((url.startsWith('http://') || url.startsWith('https://')) && !embeddedLinks.includes(url)) {
          embeddedLinks.push(url);
        }
      }
      if (embeddedLinks.length > 0) {
        console.log(`[Resume Parse] Found ${embeddedLinks.length} embedded hyperlink annotations in PDF.`);
      }
    } catch (pdfLinkErr) {
      console.warn('[Resume Parse] Could not read PDF annotations:', pdfLinkErr.message);
    }

    const profile = await getProfile(req.user.id);
    profile.resumeText = data.text;

    try {
      console.log('[Resume Parse] Extracting details with AI...');
      const linksContext = embeddedLinks.length > 0
        ? `\n\nEmbedded Hyperlinks in Resume PDF:\n${embeddedLinks.join('\n')}`
        : '';

      const prompt = `Extract the core skills (max 10), top 3 achievements, experience level (e.g., Junior, Mid, Senior), full name, current professional title (e.g., Software Engineer), phone number, LinkedIn URL, GitHub URL, and personal portfolio / website / blog URL from this resume text and embedded links (if present). 
Return ONLY a valid JSON object with the following structure:
{"skills": ["skill1", "skill2"], "achievements": ["achievement1", "achievement2"], "experienceLevel": "Senior", "name": "John Doe", "title": "Developer", "phone": "1234567890", "linkedin": "url", "github": "url", "portfolio": "url or empty string"}
Resume text:
${data.text.substring(0, 4000)}${linksContext}
`;
      const response = await callAIWithRetry(prompt, 3, 2000);
      let jsonStr = response.text;
      const match = jsonStr.match(/```(?:json)?([\s\S]*?)```/);
      if (match) jsonStr = match[1].trim();
      const parsedData = JSON.parse(jsonStr);

      profile.skills = parsedData.skills || [];
      profile.achievements = parsedData.achievements || [];
      profile.experienceLevel = parsedData.experienceLevel || '';

      if (parsedData.name) profile.name = parsedData.name;
      if (parsedData.title) profile.title = parsedData.title;
      if (parsedData.phone) profile.phone = parsedData.phone;
      if (parsedData.linkedin) profile.linkedin = parsedData.linkedin;
      if (parsedData.github) profile.github = parsedData.github;
      if (parsedData.portfolio) profile.portfolio = parsedData.portfolio;

      // Direct fallback from embedded PDF hyperlink annotations
      if (!profile.portfolio && embeddedLinks.length > 0) {
        const portfolioLink = embeddedLinks.find(url =>
          !url.includes('linkedin.com') &&
          !url.includes('github.com') &&
          !url.includes('twitter.com') &&
          !url.includes('x.com')
        );
        if (portfolioLink) {
          profile.portfolio = portfolioLink.trim();
        }
      }

      if (!profile.linkedin && embeddedLinks.length > 0) {
        const lnk = embeddedLinks.find(url => url.includes('linkedin.com/in/'));
        if (lnk) profile.linkedin = lnk.trim();
      }

      if (!profile.github && embeddedLinks.length > 0) {
        const gh = embeddedLinks.find(url => url.includes('github.com/'));
        if (gh) profile.github = gh.trim();
      }

      // Regex fallback to capture personal portfolio / website URL from resume text if not yet set
      if (!profile.portfolio && data.text) {
        const portfolioMatch = data.text.match(/(?:portfolio|website|site|web|link|live)\s*[:\-–]\s*(https?:\/\/[^\s,;]+)/i) ||
          data.text.match(/\b(https?:\/\/(?:www\.)?[a-zA-Z0-9-]+\.(?:dev|me|io|app|site|vercel\.app|netlify\.app|pages\.dev)(?:\/[^\s,;]*)?)\b/i);
        if (portfolioMatch) {
          profile.portfolio = portfolioMatch[1].trim();
        }
      }

      console.log('[Resume Parse] Extracted successfully.');
    } catch (aiErr) {
      console.error('[Resume Parse] AI extraction failed:', aiErr.message);
    }

    profile.resumeFilename = req.file.originalname;
    profile.resumePdf = dataBuffer;
    await profile.save();

    const profileObj = profile.toObject();
    delete profileObj.resumePdf;

    res.json({ success: true, profile: profileObj });
  } catch (err) {
    res.status(500).json({ error: 'Failed to upload and parse resume' });
  }
});

router.get('/resume-pdf', async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) return res.status(400).send('Missing userId');
    const profile = await Profile.findOne({ userId });
    if (!profile || !profile.resumePdf) {
      return res.status(404).send('No resume uploaded.');
    }
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${profile.resumeFilename || 'resume.pdf'}"`);
    res.send(profile.resumePdf);
  } catch (err) {
    res.status(500).send('Failed to fetch resume.');
  }
});

const axios = require('axios');

router.post('/sync-github', requireAuth, async (req, res) => {
  try {
    const profile = await getProfile(req.user.id);
    const rawInput = (req.body && req.body.githubUrl) || profile.github;
    const providedToken = req.body && (req.body.githubToken || req.body.token);
    const activeToken = (providedToken || profile.githubToken || process.env.GITHUB_TOKEN || '').trim();

    if (providedToken) {
      profile.githubToken = providedToken.trim();
    }

    if (!rawInput) {
      return res.status(400).json({ error: 'Please provide a GitHub profile URL or username.' });
    }

    // Extract username from input
    let username = rawInput.trim();
    username = username.replace(/^https?:\/\/(www\.)?github\.com\//i, '');
    username = username.replace(/^@/, '');
    username = username.split('/')[0].trim();

    if (!username) {
      return res.status(400).json({ error: 'Could not parse a valid GitHub username.' });
    }

    console.log(`[GitHub Sync] Fetching deep public portfolio for @${username} (Auth: ${activeToken ? 'TOKEN' : 'UNAUTHENTICATED'})...`);

    const headers = {
      'User-Agent': 'AI-Job-Email-Drafter-Agent',
      'Accept': 'application/vnd.github.v3+json'
    };
    if (activeToken) {
      headers['Authorization'] = activeToken.startsWith('Bearer ') || activeToken.startsWith('token ')
        ? activeToken
        : `token ${activeToken}`;
    }

    // Helper to extract rate limit info
    const checkRateLimitError = (err) => {
      const isRate = err.response?.status === 403 && (
        err.response?.data?.message?.toLowerCase().includes('rate limit') ||
        err.message?.toLowerCase().includes('rate limit')
      );
      if (isRate) {
        const resetEpoch = err.response?.headers?.['x-ratelimit-reset'];
        const resetMinutes = resetEpoch ? Math.max(1, Math.ceil((resetEpoch * 1000 - Date.now()) / 60000)) : 60;
        return {
          isRateLimit: true,
          resetMinutes,
          message: `GitHub API rate limit reached (${activeToken ? '5,000/hr' : '60/hr unauthenticated limit'}). Limit resets in ~${resetMinutes} min. Add a free GitHub Token to get 5,000 requests/hr!`
        };
      }
      return null;
    };

    // 1. Fetch user info
    let userRes;
    try {
      userRes = await axios.get(`https://api.github.com/users/${username}`, { headers, timeout: 10000 });
    } catch (apiErr) {
      if (apiErr.response?.status === 404) {
        return res.status(404).json({ error: `GitHub user @${username} not found.` });
      }
      const rateInfo = checkRateLimitError(apiErr);
      if (rateInfo) {
        // If we already have cached repos in profile, return them with warning
        if (profile.githubInsights?.repos?.length > 0) {
          const profileObj = profile.toObject();
          delete profileObj.resumePdf;
          return res.json({
            success: true,
            warning: rateInfo.message,
            message: `Rate limit hit, but loaded ${profile.githubInsights.repos.length} previously indexed repositories.`,
            githubInsights: profile.githubInsights,
            profile: profileObj
          });
        }
        return res.status(429).json({ error: rateInfo.message, isRateLimit: true, resetMinutes: rateInfo.resetMinutes });
      }
      throw apiErr;
    }

    const userData = userRes.data;

    // 2. Fetch all public repositories (up to 100, sorted by recent activity)
    let reposRes;
    try {
      reposRes = await axios.get(`https://api.github.com/users/${username}/repos?sort=pushed&per_page=100`, { headers, timeout: 10000 });
    } catch (apiErr) {
      const rateInfo = checkRateLimitError(apiErr);
      if (rateInfo) {
        if (profile.githubInsights?.repos?.length > 0) {
          const profileObj = profile.toObject();
          delete profileObj.resumePdf;
          return res.json({
            success: true,
            warning: rateInfo.message,
            message: `Rate limit hit, showing ${profile.githubInsights.repos.length} cached repositories.`,
            githubInsights: profile.githubInsights,
            profile: profileObj
          });
        }
        return res.status(429).json({ error: rateInfo.message, isRateLimit: true, resetMinutes: rateInfo.resetMinutes });
      }
      throw apiErr;
    }
    const rawRepos = Array.isArray(reposRes.data) ? reposRes.data : [];

    // Filter out private repos and compute total stars
    let totalStars = 0;
    const langCount = {};
    for (const r of rawRepos) {
      if (!r.private) {
        totalStars += (r.stargazers_count || 0);
        if (r.language) {
          langCount[r.language] = (langCount[r.language] || 0) + 1;
        }
      }
    }

    const topLanguages = Object.entries(langCount)
      .sort((a, b) => b[1] - a[1])
      .map(([lang]) => lang)
      .slice(0, 8);

    // Filter and score repos: prioritize original repos, with description, stars, topics
    const validRepos = rawRepos.filter(r => !r.private);

    // 3. Deep README Fetching
    // Safe quota optimization:
    // If unauthenticated, only fetch READMEs for the top 6 repos so we only consume ~8 total API calls (out of 60).
    // If authenticated (has token), fetch top 25 repos.
    const maxReadmeFetches = activeToken ? 25 : 6;
    const prioritizedForReadme = [...validRepos]
      .sort((a, b) => {
        const scoreA = (a.stargazers_count || 0) * 5 + (a.forks_count || 0) * 3 + (a.fork ? 0 : 4);
        const scoreB = (b.stargazers_count || 0) * 5 + (b.forks_count || 0) * 3 + (b.fork ? 0 : 4);
        return scoreB - scoreA;
      })
      .slice(0, maxReadmeFetches);

    const readmeMap = {};
    let hitRateLimitDuringReadme = false;
    const chunkSize = 4;
    for (let i = 0; i < prioritizedForReadme.length; i += chunkSize) {
      if (hitRateLimitDuringReadme) break;
      const chunk = prioritizedForReadme.slice(i, i + chunkSize);
      await Promise.allSettled(chunk.map(async (r) => {
        try {
          const readmeRes = await axios.get(`https://api.github.com/repos/${username}/${r.name}/readme`, { headers, timeout: 6000 });
          if (readmeRes.data && readmeRes.data.content) {
            const rawMd = Buffer.from(readmeRes.data.content, 'base64').toString('utf8');
            // Clean markdown badges and HTML comments while preserving headers and structure
            const cleanSnippet = rawMd
              .replace(/\[!\[.*?\]\(.*?\)\]\(.*?\)|!\[.*?\]\(.*?\)/g, '')
              .replace(/<!--[\s\S]*?-->/g, '')
              .replace(/<[^>]+>/g, '')
              .replace(/\r?\n\s*\r?\n\s*\r?\n/g, '\n\n')
              .trim()
              .slice(0, 1500);
            readmeMap[r.name] = cleanSnippet;
          }
        } catch (err) {
          if (err.response?.status === 403 && err.response?.data?.message?.includes('rate limit')) {
            hitRateLimitDuringReadme = true;
          }
        }
      }));
    }

    const processedRepos = validRepos.map(r => {
      const readmeSnippet = readmeMap[r.name] || '';
      let score = (r.stargazers_count || 0) * 5 + (r.forks_count || 0) * 3;
      if (r.description && r.description.length > 15) score += 4;
      if (readmeSnippet) score += 5;
      if (r.topics && r.topics.length > 0) score += 3;
      if (r.language) score += 2;
      if (!r.fork) score += 3;

      return {
        name: r.name,
        description: r.description || (readmeSnippet ? readmeSnippet.slice(0, 150) + '...' : 'Open-source repository'),
        language: r.language || 'Code',
        stars: r.stargazers_count || 0,
        forks: r.forks_count || 0,
        topics: Array.isArray(r.topics) ? r.topics : [],
        url: r.html_url,
        readmeSnippet,
        updatedAt: r.pushed_at ? new Date(r.pushed_at) : new Date(r.updated_at),
        score
      };
    }).sort((a, b) => b.score - a.score);

    const finalRepos = processedRepos.map(({ score, ...r }) => r);

    profile.githubInsights = {
      username: userData.login || username,
      avatarUrl: userData.avatar_url || '',
      bio: userData.bio || '',
      publicRepos: userData.public_repos || validRepos.length,
      followers: userData.followers || 0,
      totalStars,
      topLanguages,
      repos: finalRepos,
      lastSyncedAt: new Date()
    };

    if (!profile.github) {
      profile.github = userData.html_url || `https://github.com/${username}`;
    }

    await profile.save();

    console.log(`[GitHub Sync] Deep sync complete for @${username}: ${finalRepos.length} public repos, ${Object.keys(readmeMap).length} READMEs analyzed.`);

    const profileObj = profile.toObject();
    delete profileObj.resumePdf;

    res.json({
      success: true,
      message: `Synced @${username}! Indexed ${finalRepos.length} public repositories, ${Object.keys(readmeMap).length} deep README files, and ${topLanguages.length} languages.`,
      githubInsights: profile.githubInsights,
      profile: profileObj
    });
  } catch (err) {
    console.error('Error syncing GitHub:', err.message);
    const isRate = err.response?.status === 403 && (
      err.response?.data?.message?.toLowerCase().includes('rate limit') ||
      err.message?.toLowerCase().includes('rate limit')
    );
    if (isRate) {
      const resetEpoch = err.response?.headers?.['x-ratelimit-reset'];
      const resetMinutes = resetEpoch ? Math.max(1, Math.ceil((resetEpoch * 1000 - Date.now()) / 60000)) : 60;
      return res.status(429).json({
        error: `GitHub rate limit reached. Resets in ~${resetMinutes} min. Add a free GitHub Token to get 5,000 requests/hr!`,
        isRateLimit: true,
        resetMinutes
      });
    }
    res.status(500).json({ error: err.response?.data?.message || err.message || 'Failed to sync GitHub profile.' });
  }
});

module.exports = router;
