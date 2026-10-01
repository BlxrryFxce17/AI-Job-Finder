const express = require('express');
const router = express.Router();
const multer = require('multer');
const pdfParse = require('pdf-parse');
const requireAuth = require('../middleware/requireAuth');
const Profile = require('../models/Profile');
const User = require('../models/User');
const Job = require('../models/Job');
const { callAIWithRetry } = require('../utils/ai');
const {
  resolveCompanyDomain,
  discoverEmailForJob,
  sendEmailViaAPI,
  formatEmailTextToHtml,
  cleanDraftEmailText,
  stripSignOff,
  getEffectivePortfolio
} = require('../utils/email');

const upload = multer({ storage: multer.memoryStorage() });

// 1. Health / Status Check
router.get('/status', async (req, res) => {
  const authHeader = req.headers.authorization;
  let userEmail = null;
  let authenticated = false;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const jwt = require('jsonwebtoken');
      const token = authHeader.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id).select('email');
      if (user) {
        userEmail = user.email;
        authenticated = true;
      }
    } catch (_) {}
  }

  res.json({
    success: true,
    server: 'AI Job Finder & Autofill Engine',
    version: '1.0.0',
    authenticated,
    userEmail
  });
});

// Config for Extension AI Fallbacks (Groq + Gemini API keys)
router.get('/ai-config', (req, res) => {
  res.json({
    success: true,
    groqKey: process.env.GROQ_API_KEY || '',
    geminiKey: process.env.GEMINI_API_KEY || ''
  });
});

// 2. Fetch Autofill Profile for Active User
router.get('/profile', async (req, res) => {
  try {
    let userId = null;
    let user = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const jwt = require('jsonwebtoken');
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        userId = decoded.id;
        user = await User.findById(userId).select('email');
      } catch (_) {}
    }

    let profile = userId ? await Profile.findOne({ userId }) : null;
    if (!profile) {
      profile = await Profile.findOne().sort({ updatedAt: -1 });
    }

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found. Please configure your profile first.' });
    }

    if (!user && profile.userId) {
      try {
        user = await User.findById(profile.userId).select('email');
      } catch (_) {}
    }

    const fullName = (profile.name || '').trim();
    const nameParts = fullName.split(/\s+/);
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';

    // Clean top repos and prioritize user's selectedRepoNames from web app profile tab
    const priorityNames = Array.isArray(profile.selectedRepoNames) ? profile.selectedRepoNames : [];
    const allInsightRepos = (profile.githubInsights?.repos || []).map(r => ({
      name: r.name,
      description: r.description || '',
      language: r.language || '',
      url: r.url || (profile.github ? `${profile.github.replace(/\/$/, '')}/${r.name}` : ''),
      stars: r.stars || 0,
      isPriority: priorityNames.includes(r.name)
    }));

    allInsightRepos.sort((a, b) => (b.isPriority ? 1 : 0) - (a.isPriority ? 1 : 0));
    const topRepos = allInsightRepos.slice(0, 10);

    const effectiveProjectUrl = profile.projectUrl || (topRepos.length > 0 ? topRepos[0].url : (profile.github || ''));

    res.json({
      success: true,
      profile: {
        fullName,
        firstName,
        lastName,
        fatherName: profile.fatherName || '',
        preferredName: profile.preferredName || '',
        email: user?.email || profile.emailUser || '',
        phone: profile.phone || '',
        addressLine1: profile.addressLine1 || '',
        city: profile.city || '',
        state: profile.state || '',
        postalCode: profile.postalCode || '',
        country: profile.country || 'India',
        authorizedToWork: profile.authorizedToWork !== false,
        requireSponsorship: !!profile.requireSponsorship,
        formerEmployee: !!profile.formerEmployee,
        linkedin: profile.linkedin || '',
        github: profile.github || '',
        portfolio: profile.portfolio || '',
        resumeUrl: profile.resumeUrl || profile.cvUrl || '',
        projectUrl: effectiveProjectUrl,
        title: profile.title || '',
        experienceLevel: profile.experienceLevel || 'Mid',
        skills: profile.skills || [],
        workExperience: profile.workExperience || [],
        education: profile.education || [],
        achievements: profile.achievements || [],
        hasResumePdf: !!profile.resumePdf,
        resumeFilename: profile.resumeFilename || '',
        resumePdfBase64: profile.resumePdf ? profile.resumePdf.toString('base64') : null,
        selectedRepoNames: profile.selectedRepoNames || [],
        learnedRules: profile.learnedRules || [],
        repos: topRepos
      }
    });
  } catch (err) {
    console.error('[Extension API] Failed to fetch profile:', err);
    res.status(500).json({ error: 'Failed to retrieve profile data' });
  }
});

// 2b. Update Extended Profile from Extension Sidebar
router.put('/profile', requireAuth, async (req, res) => {
  try {
    let profile = await Profile.findOne({ userId: req.user.id });
    if (!profile) {
      profile = new Profile({ userId: req.user.id });
    }

    const {
      name,
      firstName,
      lastName,
      fatherName,
      preferredName,
      email,
      phone,
      addressLine1,
      city,
      state,
      postalCode,
      country,
      authorizedToWork,
      requireSponsorship,
      formerEmployee,
      linkedin,
      github,
      portfolio,
      resumeUrl,
      cvUrl,
      projectUrl,
      title,
      skills,
      workExperience,
      education
    } = req.body;

    const computedName = name || (firstName || lastName ? `${firstName || ''} ${lastName || ''}`.trim() : undefined);
    if (computedName !== undefined) profile.name = computedName;
    if (fatherName !== undefined) profile.fatherName = fatherName;
    if (preferredName !== undefined) profile.preferredName = preferredName;
    if (phone !== undefined) profile.phone = phone;
    if (addressLine1 !== undefined) profile.addressLine1 = addressLine1;
    if (city !== undefined) profile.city = city;
    if (state !== undefined) profile.state = state;
    if (postalCode !== undefined) profile.postalCode = postalCode;
    if (country !== undefined) profile.country = country;
    if (authorizedToWork !== undefined) profile.authorizedToWork = authorizedToWork;
    if (requireSponsorship !== undefined) profile.requireSponsorship = requireSponsorship;
    if (formerEmployee !== undefined) profile.formerEmployee = formerEmployee;
    if (linkedin !== undefined) profile.linkedin = linkedin;
    if (github !== undefined) profile.github = github;
    if (portfolio !== undefined) profile.portfolio = portfolio;
    if (resumeUrl !== undefined) profile.resumeUrl = resumeUrl;
    else if (cvUrl !== undefined) profile.resumeUrl = cvUrl;
    if (projectUrl !== undefined) profile.projectUrl = projectUrl;
    if (title !== undefined) profile.title = title;
    if (Array.isArray(skills)) profile.skills = skills;
    if (Array.isArray(workExperience)) profile.workExperience = workExperience;
    if (Array.isArray(education)) profile.education = education;

    await profile.save();
    res.json({ success: true, message: 'Profile updated successfully!', profile });
  } catch (err) {
    console.error('[Extension API] Failed to update profile:', err);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// 2c. Get Active Resume Data & Base64 Binary for 1-Click Attachment
router.get('/resume', requireAuth, async (req, res) => {
  try {
    const profile = await Profile.findOne({ userId: req.user.id });
    if (!profile) return res.status(404).json({ error: 'Profile not found' });

    res.json({
      success: true,
      hasResumePdf: !!profile.resumePdf,
      resumeFilename: profile.resumeFilename || 'resume.pdf',
      skills: profile.skills || [],
      workExperience: profile.workExperience || [],
      education: profile.education || [],
      resumePdfBase64: profile.resumePdf ? profile.resumePdf.toString('base64') : null
    });
  } catch (err) {
    console.error('[Extension API] Failed to fetch resume:', err);
    res.status(500).json({ error: 'Failed to retrieve resume data' });
  }
});

// 2d. Direct Resume Upload from Extension Sidebar (PDF or JSON with base64)
router.post('/resume-upload', requireAuth, upload.single('resume'), async (req, res) => {
  try {
    let dataBuffer = null;
    let filename = 'resume.pdf';

    if (req.file) {
      dataBuffer = req.file.buffer;
      filename = req.file.originalname || 'resume.pdf';
    } else if (req.body?.base64) {
      const cleanBase64 = req.body.base64.includes('base64,') 
        ? req.body.base64.split('base64,')[1] 
        : req.body.base64;
      dataBuffer = Buffer.from(cleanBase64, 'base64');
      filename = req.body.filename || 'resume.pdf';
    }

    if (!dataBuffer || dataBuffer.length === 0) {
      return res.status(400).json({ error: 'No resume file provided' });
    }

    let rawText = '';
    try {
      if (filename.toLowerCase().endsWith('.pdf') || dataBuffer.slice(0, 4).toString() === '%PDF') {
        const parsedPdf = await pdfParse(dataBuffer);
        rawText = parsedPdf.text || '';
      } else {
        rawText = dataBuffer.toString('utf8');
      }
    } catch (pdfErr) {
      console.warn('[Extension API] pdf-parse warning:', pdfErr.message);
      rawText = dataBuffer.toString('utf8');
    }

    let profile = await Profile.findOne({ userId: req.user.id });
    if (!profile) {
      profile = new Profile({ userId: req.user.id });
    }

    profile.resumePdf = dataBuffer;
    profile.resumeFilename = filename;
    profile.resumeText = rawText;

    // AI Extraction of structured skills, work experience, education, titles
    try {
      const prompt = `Extract all relevant professional details from this resume text:
1. Core skills (array of strings, e.g. ["React", "Node.js", "Python", "Docker"])
2. Full name
3. Current professional title
4. Phone number
5. LinkedIn URL, GitHub URL, and personal portfolio URL
6. Work experience list: array of objects with { "company": "Company Name", "title": "Job Title", "location": "City, Country or Remote", "startDate": "e.g. Jan 2022", "endDate": "e.g. Present", "isCurrent": true/false, "description": "Responsibilities/achievements" }
7. Education list: array of objects with { "institution": "University Name", "degree": "Degree (e.g. B.Tech)", "fieldOfStudy": "Major", "startYear": "2018", "endYear": "2022", "grade": "" }

Return ONLY a valid JSON object matching this schema:
{
  "skills": ["skill1", "skill2"],
  "name": "Full Name",
  "title": "Title",
  "phone": "Phone",
  "linkedin": "url",
  "github": "url",
  "portfolio": "url",
  "workExperience": [
    {
      "company": "Company",
      "title": "Role",
      "location": "Location",
      "startDate": "Start",
      "endDate": "End",
      "isCurrent": false,
      "description": "Details"
    }
  ],
  "education": [
    {
      "institution": "School",
      "degree": "Degree",
      "fieldOfStudy": "Field",
      "startYear": "Year",
      "endYear": "Year",
      "grade": ""
    }
  ]
}

Resume text:
${rawText.substring(0, 5000)}
`;
      const aiRes = await callAIWithRetry(prompt, 3, 2000);
      let jsonStr = aiRes.text;
      const match = jsonStr.match(/```(?:json)?([\s\S]*?)```/);
      if (match) jsonStr = match[1].trim();
      const parsed = JSON.parse(jsonStr);

      if (Array.isArray(parsed.skills) && parsed.skills.length > 0) profile.skills = parsed.skills;
      if (Array.isArray(parsed.workExperience) && parsed.workExperience.length > 0) profile.workExperience = parsed.workExperience;
      if (Array.isArray(parsed.education) && parsed.education.length > 0) profile.education = parsed.education;

      if (parsed.name && !profile.name) profile.name = parsed.name;
      if (parsed.title) profile.title = parsed.title;
      if (parsed.phone && !profile.phone) profile.phone = parsed.phone;
      if (parsed.linkedin && !profile.linkedin) profile.linkedin = parsed.linkedin;
      if (parsed.github && !profile.github) profile.github = parsed.github;
      if (parsed.portfolio && !profile.portfolio) profile.portfolio = parsed.portfolio;
    } catch (aiErr) {
      console.warn('[Extension Resume Parse] AI extraction notice:', aiErr.message);
    }

    await profile.save();

    res.json({
      success: true,
      message: `✓ Successfully uploaded & parsed "${filename}"!`,
      profile: {
        hasResumePdf: true,
        resumeFilename: filename,
        skills: profile.skills || [],
        workExperience: profile.workExperience || [],
        education: profile.education || [],
        resumePdfBase64: dataBuffer.toString('base64'),
        name: profile.name,
        title: profile.title,
        phone: profile.phone,
        linkedin: profile.linkedin,
        github: profile.github,
        portfolio: profile.portfolio
      }
    });
  } catch (err) {
    console.error('[Extension API] Failed to upload resume:', err);
    res.status(500).json({ error: 'Failed to process and parse resume file' });
  }
});

// 2c. Brain: Get & Save Learned Rules
router.get('/brain', requireAuth, async (req, res) => {
  try {
    const profile = await Profile.findOne({ userId: req.user.id });
    if (!profile) return res.json({ success: true, learnedRules: [] });

    // Auto-clean any legacy corrupted rules (e.g. sidebar profile fields like prof-* or ai-*)
    const initialLen = profile.learnedRules?.length || 0;
    profile.learnedRules = (profile.learnedRules || []).filter(r => {
      const key = (r.fieldKey || '').toLowerCase().trim();
      const val = (r.value || '').trim();
      const isEssay = val.length > 150 || /describe|explain|trace|webhook|schema|architecture|walkthrough|challenge|tell us|give one|built|coding assistant/i.test(key);
      return !key.startsWith('prof-') && !key.startsWith('ai-') && key.length > 1 && !isEssay;
    });

    if (profile.learnedRules.length !== initialLen) {
      await profile.save();
    }

    res.json({ success: true, learnedRules: profile.learnedRules });
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve brain rules' });
  }
});

router.post('/brain', requireAuth, async (req, res) => {
  try {
    const { fieldKey, domain, value } = req.body;
    if (!fieldKey || !fieldKey.trim()) {
      return res.status(400).json({ error: 'fieldKey is required' });
    }

    const normKey = fieldKey.toLowerCase().trim();
    // NEVER save sidebar profile input IDs as brain rules
    if (normKey.startsWith('prof-') || normKey.startsWith('ai-') || normKey.length < 2) {
      return res.status(400).json({ error: 'Sidebar profile fields cannot be saved as brain rules' });
    }

    // Do not save malformed emails or incomplete phone numbers
    const valTrimmed = (value || '').trim();

    // DO NOT save dynamic screening questions or long essays as static brain rules
    if (valTrimmed.length > 150 || /describe|explain|trace|webhook|schema|architecture|walkthrough|challenge|tell us|give one|built|coding assistant/i.test(normKey)) {
      return res.status(400).json({ error: 'Dynamic screening questions and essays are tailored per job and cannot be saved as static brain rules' });
    }
    if ((normKey.includes('email') || normKey === 'e-mail') && (!valTrimmed.includes('@') || !valTrimmed.includes('.'))) {
      return res.status(400).json({ error: 'Incomplete email cannot be saved as brain rule' });
    }
    if ((normKey.includes('phone') || normKey.includes('mobile')) && valTrimmed.replace(/\D/g, '').length < 10) {
      return res.status(400).json({ error: 'Incomplete phone number cannot be saved as brain rule' });
    }

    const normDomain = (domain || '*').toLowerCase().trim();

    // 1. Atomically remove any existing rule for this fieldKey/domain and purge corrupted entries
    await Profile.updateOne(
      { userId: req.user.id },
      {
        $pull: {
          learnedRules: {
            $or: [
              { fieldKey: normKey, domain: normDomain },
              { fieldKey: /^prof-/i },
              { fieldKey: /^ai-/i }
            ]
          }
        }
      }
    );

    // 2. Atomically push updated rule (prevents Mongoose VersionError concurrency conflicts)
    const updatedProfile = await Profile.findOneAndUpdate(
      { userId: req.user.id },
      {
        $push: {
          learnedRules: {
            fieldKey: normKey,
            domain: normDomain,
            value: value || '',
            updatedAt: new Date()
          }
        }
      },
      { new: true, runValidators: true, select: 'learnedRules' }
    );

    if (!updatedProfile) return res.status(404).json({ error: 'Profile not found' });

    res.json({
      success: true,
      message: `Learned preference for "${fieldKey}"!`,
      learnedRules: updatedProfile.learnedRules || []
    });
  } catch (err) {
    console.error('[Extension API] Failed to save brain rule:', err);
    res.status(500).json({ error: 'Failed to save learned rule' });
  }
});

router.delete('/brain', requireAuth, async (req, res) => {
  try {
    const { fieldKey, domain, clearAll } = req.body || {};

    if (clearAll) {
      const updated = await Profile.findOneAndUpdate(
        { userId: req.user.id },
        { $set: { learnedRules: [] } },
        { new: true, select: 'learnedRules' }
      );
      return res.json({ success: true, message: 'All brain rules cleared', learnedRules: [] });
    }

    if (!fieldKey) {
      return res.status(400).json({ error: 'fieldKey is required' });
    }

    const normKey = fieldKey.toLowerCase().trim();
    const normDomain = (domain || '*').toLowerCase().trim();

    const pullCondition = normDomain === '*'
      ? { fieldKey: normKey }
      : { fieldKey: normKey, domain: normDomain };

    const updated = await Profile.findOneAndUpdate(
      { userId: req.user.id },
      { $pull: { learnedRules: pullCondition } },
      { new: true, select: 'learnedRules' }
    );

    res.json({
      success: true,
      message: `Deleted rule "${fieldKey}"`,
      learnedRules: updated?.learnedRules || []
    });
  } catch (err) {
    console.error('[Extension API] Failed to delete brain rule:', err);
    res.status(500).json({ error: 'Failed to delete brain rule' });
  }
});

// 3. AI Screening Question Generator
router.post('/generate-answer', async (req, res) => {
  try {
    const { question, jobDescription, role, company, profile: clientProfile, maxLength, minWords, minChars } = req.body;

    if (!question || !question.trim()) {
      return res.status(400).json({ error: 'Question text is required' });
    }

    let userId = null;
    let profile = null;

    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const jwt = require('jsonwebtoken');
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        userId = decoded.id;
        profile = await Profile.findOne({ userId });
      } catch (_) {}
    }

    if (!profile && clientProfile) {
      profile = clientProfile;
    }

    if (!profile) {
      profile = await Profile.findOne().sort({ updatedAt: -1 });
    }

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found. Please sync your profile in the extension.' });
    }

    const qLower = (question || '').toLowerCase().trim();

    // 1. Repository / Project / Walkthrough link (e.g. "Link to one real full-stack product, repository, or sanitized walkthrough")
    if (
      qLower.includes('link to one real') ||
      qLower.includes('link to one') ||
      (qLower.includes('link') && (qLower.includes('repository') || qLower.includes('product') || qLower.includes('walkthrough') || qLower.includes('project') || qLower.includes('code'))) ||
      qLower.includes('repo url') ||
      qLower.includes('repository url') ||
      qLower.includes('github repo')
    ) {
      const priorityNames = Array.isArray(profile.selectedRepoNames) ? profile.selectedRepoNames : [];
      const allRepos = Array.isArray(profile.repos) ? profile.repos : (profile.githubInsights?.repos || []);
      const ghBase = (profile.github || '').replace(/\/$/, '');

      let repoUrl = profile.projectUrl || profile.repoUrl || null;

      if (!repoUrl && priorityNames.length > 0) {
        const priorityMatch = priorityNames.map(name => {
          const found = allRepos.find(r => (r.name || '').toLowerCase() === name.toLowerCase());
          return found ? (found.url || (ghBase ? `${ghBase}/${found.name}` : '')) : (ghBase ? `${ghBase}/${name}` : '');
        }).find(Boolean);
        if (priorityMatch) repoUrl = priorityMatch;
      }

      if (!repoUrl && allRepos.length > 0) {
        const candidate = allRepos[0];
        repoUrl = candidate.url || (ghBase ? `${ghBase}/${candidate.name}` : '');
      }

      if (!repoUrl) {
        repoUrl = profile.projectUrl || ghBase || profile.portfolio || '';
      }

      if (repoUrl && !repoUrl.startsWith('http')) repoUrl = 'https://' + repoUrl;
      return res.json({ success: true, answer: repoUrl });
    }

    // 2. Resume / CV URL (shareable link)
    if (
      qLower.includes('resume') ||
      qLower.includes('résumé') ||
      qLower.includes('cv url') ||
      qLower.includes('cv link') ||
      qLower.includes('drive link') ||
      (qLower.includes('shareable link') && !qLower.includes('project'))
    ) {
      let cvUrl = profile.resumeUrl || profile.cvUrl || profile.resumeDriveUrl || '';
      if (cvUrl && !cvUrl.startsWith('http')) cvUrl = 'https://' + cvUrl;
      return res.json({ success: true, answer: cvUrl });
    }

    // 3. LinkedIn URL
    if (qLower.includes('linkedin') && (qLower.includes('url') || qLower.includes('link') || qLower.includes('profile'))) {
      let liUrl = profile.linkedin || '';
      if (liUrl && !liUrl.startsWith('http')) liUrl = 'https://' + liUrl;
      return res.json({ success: true, answer: liUrl });
    }

    // 4. GitHub URL
    if (qLower.includes('github') && (qLower.includes('url') || qLower.includes('link') || qLower.includes('profile'))) {
      let ghUrl = profile.github || '';
      if (ghUrl && !ghUrl.startsWith('http')) ghUrl = 'https://' + ghUrl;
      return res.json({ success: true, answer: ghUrl });
    }

    // 5. Portfolio URL
    if (qLower.includes('portfolio') && (qLower.includes('url') || qLower.includes('link') || qLower.includes('site'))) {
      let pUrl = profile.portfolio || profile.github || '';
      if (pUrl && !pUrl.startsWith('http')) pUrl = 'https://' + pUrl;
      return res.json({ success: true, answer: pUrl });
    }

    const maxChars = maxLength && !isNaN(Number(maxLength)) && Number(maxLength) > 20 ? Number(maxLength) : null;
    const { location } = req.body;

    // 6. Visa Status / Work Authorization / Sponsorship / Citizenship
    const isVisaOrAuth =
      qLower.includes('visa') ||
      qLower.includes('authorized to work') ||
      qLower.includes('work authorization') ||
      qLower.includes('sponsorship') ||
      qLower.includes('citizenship') ||
      qLower.includes('citizen') ||
      qLower.includes('work permit') ||
      qLower.includes('right to work') ||
      qLower.includes('immigration');

    if (isVisaOrAuth) {
      const candidateCountry = (profile.country || 'India').trim();
      const isIndian = candidateCountry.toLowerCase() === 'india';

      const jobContext = `${location || ''} ${jobDescription || ''} ${company || ''} ${role || ''}`.toLowerCase();
      const isIndiaJob = jobContext.includes('india') || jobContext.includes('bengaluru') || jobContext.includes('bangalore') || jobContext.includes('chennai') || jobContext.includes('pune') || jobContext.includes('mumbai') || jobContext.includes('hyderabad') || jobContext.includes('gurgaon') || jobContext.includes('noida') || jobContext.includes('delhi');
      const isUSJob = jobContext.includes('united states') || jobContext.includes('usa') || jobContext.includes('us citizen') || jobContext.includes('us work');

      let visaAnswer = '';
      if (isIndian) {
        if (isIndiaJob || (!isUSJob && !location)) {
          visaAnswer = `I am a citizen of India with full legal authorization to work in India, and I do not require any visa sponsorship for positions located in India.`;
        } else {
          visaAnswer = `I am an Indian citizen currently located in India. For on-site positions in this country, I would require employment visa sponsorship, but I am also fully eligible and equipped to work remotely.`;
        }
      } else {
        visaAnswer = profile.authorizedToWork !== false
          ? `I am a citizen of ${candidateCountry} with full authorization to work, and do not require visa sponsorship.`
          : `I am currently based in ${candidateCountry} and will require work visa sponsorship for on-site employment.`;
      }

      if (maxChars && visaAnswer.length > maxChars) {
        visaAnswer = visaAnswer.slice(0, maxChars).trim();
      }
      return res.json({ success: true, answer: visaAnswer });
    }

    // 7. Salary / Compensation / CTC (Dynamic, realistic fresher guessing)
    const isSalaryOrComp =
      qLower.includes('salary') ||
      qLower.includes('compensation') ||
      qLower.includes('ctc') ||
      qLower.includes('pay expectation') ||
      qLower.includes('desired pay') ||
      qLower.includes('target pay') ||
      qLower.includes('desired salary') ||
      qLower.includes('expected salary');

    if (isSalaryOrComp) {
      if (profile.desiredSalary) {
        return res.json({ success: true, answer: String(profile.desiredSalary) });
      }

      const jobContext = `${location || ''} ${jobDescription || ''} ${company || ''} ${role || ''}`.toLowerCase();
      const isIndiaJob = jobContext.includes('india') || jobContext.includes('inr') || jobContext.includes('₹') || jobContext.includes('lpa') || jobContext.includes('bengaluru') || jobContext.includes('bangalore') || jobContext.includes('chennai') || jobContext.includes('pune') || jobContext.includes('mumbai') || jobContext.includes('hyderabad') || jobContext.includes('gurgaon');
      const isUSJob = jobContext.includes('united states') || jobContext.includes('usa') || jobContext.includes('usd') || jobContext.includes('$');

      const isFresher = !profile.workExperience || profile.workExperience.length === 0 || (profile.experienceLevel || '').toLowerCase().includes('fresher') || (profile.experienceLevel || '').toLowerCase().includes('entry') || (profile.title || '').toLowerCase().includes('trainee') || (profile.title || '').toLowerCase().includes('graduate');

      let salaryAnswer = '';
      if (isIndiaJob || (!isUSJob && (profile.country || 'India').toLowerCase() === 'india')) {
        salaryAnswer = isFresher
          ? `As an entry-level engineer / fresher, my expected compensation is in the range of ₹5,00,000 to ₹6,00,000 per annum (around 5 LPA), and I am open to negotiation based on company standards and role responsibilities.`
          : `My expected compensation is in the range of ₹8,00,000 to ₹10,00,000 per annum, open to negotiation based on company standards.`;
      } else if (isUSJob) {
        salaryAnswer = isFresher
          ? `As an entry-level engineer, my expected compensation is in the range of $70,000 to $80,000 per year, open to discussion based on company bands.`
          : `My expected compensation is in the range of $100,000 to $120,000 per year, open to negotiation based on the role and benefits.`;
      } else {
        salaryAnswer = `Competitive and negotiable based on standard company compensation bands for this role and location.`;
      }

      if (maxChars && salaryAnswer.length > maxChars) {
        salaryAnswer = salaryAnswer.slice(0, maxChars).trim();
      }
      return res.json({ success: true, answer: salaryAnswer });
    }

    // 8. Notice Period / Availability / Start Date
    const isNoticeOrAvailability =
      qLower.includes('notice period') ||
      qLower.includes('start date') ||
      qLower.includes('available to start') ||
      qLower.includes('when are you available') ||
      qLower.includes('how soon can you start') ||
      qLower.includes('availability to start');

    if (isNoticeOrAvailability) {
      let noticeAnswer = `I have 0 days notice period as a recent graduate / fresher, and can join immediately or by the next upcoming Monday.`;
      if (maxChars && noticeAnswer.length > maxChars) {
        noticeAnswer = noticeAnswer.slice(0, maxChars).trim();
      }
      return res.json({ success: true, answer: noticeAnswer });
    }

    // Smart Question Intent Classification
    const isSkills = /\b(best skills|better than most|top qualities|top 3 qualities|what are you good at|technologies you are|core competencies|key strengths|what sets you apart|superpower|list down.*technologies)\b/i.test(qLower);
    const isComplex = /\b(complex|biggest product|biggest feature|scale of the product|scale|most challenging project|high volume|architecture|throughput)\b/i.test(qLower);
    const isTechChallenge = /\b(technological challenge|technical challenge|challenge where you|difficult bug|problem you solved|hardest bug|bottleneck|obstacle)\b/i.test(qLower);
    const isSocialImpact = /\b(vulnerable|society|social|real-world challenges|help people|humanitarian|underprivileged|community|ethics|impact on society|marginalized)\b/i.test(qLower);
    const isWhyCompany = /\b(why do you want to work|why this company|why join|why should we hire|what excites you|interest in (this|our))\b/i.test(qLower);
    const isTeamwork = /\b(conflict|disagree|disagreement|teamwork|working with others|pressure|tight deadline|difficult colleague)\b/i.test(qLower);

    let intentGuidance = '';
    if (isSkills) {
      intentGuidance = `SPECIALIZED GUIDANCE FOR THIS QUESTION:
- The question is asking for core technical skills and engineering advantages where you are better than most.
- Focus directly on: TypeScript/JavaScript systems programming, backend architecture, ACID transaction consistency in relational databases, and defensive error handling across asynchronous workflows.
- Core differentiator: Explain WHY you are better than most (writing strictly typed, maintainable systems that anticipate edge cases and concurrency issues rather than superficial happy-path code).
- STRICT CONSTRAINT: Focus strictly on the technical domain asked by the question. Do not introduce irrelevant mobile frameworks when answering web or systems questions.`;
    } else if (isComplex) {
      intentGuidance = `SPECIALIZED GUIDANCE FOR THIS QUESTION:
- The question is asking for your MOST COMPLEX PRODUCT / FEATURE and its SCALE.
- Focus directly on: Production systems, automated job tracking platforms, distributed web copilot architectures, or backend worker services.
- Architectural scale details: Asynchronous background worker queues, DOM heuristic engines parsing dynamic schemas, session persistence, and secure OAuth dispatch under strict browser sandboxing.
- Discuss concurrency, throughput, DOM mutation handling, and fault tolerance.`;
    } else if (isTechChallenge) {
      intentGuidance = `SPECIALIZED GUIDANCE FOR THIS QUESTION:
- The question is asking to describe a SPECIFIC TECHNOLOGICAL CHALLENGE and how it was solved.
- State the exact technical bottleneck (e.g. eliminating race conditions in concurrent state synchronization, handling flaky DOM mutations in browser extensions, or optimizing offline cache consistency), the engineering solution, and the measurable outcome.`;
    } else if (isSocialImpact) {
      intentGuidance = `SPECIALIZED GUIDANCE FOR THIS QUESTION:
- The question is asking whether technology can solve real-world challenges for the most VULNERABLE IN SOCIETY.
- This is a philosophical and humanitarian question about social impact and ethics.
- DO NOT open with "I built an app". Answer the humanitarian question with conviction, maturity, and insight.
- Address how engineering reduces bureaucratic friction, healthcare disparities, and administrative overhead that disproportionately burden under-resourced communities.`;
    } else if (isWhyCompany) {
      intentGuidance = `SPECIALIZED GUIDANCE FOR THIS QUESTION:
- Explain genuine excitement about ${company || 'the hiring company'} and the ${role || 'engineering'} role.
- Connect your type-safe full-stack background to high-standards systems and real-world user impact.`;
    }

    function getBenchmarkAnswer() {
      if (isSkills) {
        return "My strongest engineering advantage is architecting resilient full-stack systems and high-throughput asynchronous pipelines using TypeScript and Node.js. While many engineers focus primarily on surface-level feature delivery, I prioritize deep type safety, relational data integrity via atomic SQL transactions, and rigorous error boundaries across distributed workflows. This disciplined, defensive approach prevents silent production failures and ensures predictable, maintainable state management under high concurrent load.";
      }
      if (isComplex) {
        return "The most complex system I engineered is an automated multi-portal job discovery and application platform. Architecturally, it coordinates an asynchronous Node.js worker pipeline handling dynamic DOM heuristics, cross-portal session persistence, and OAuth token dispatch across hundreds of varied ATS schemas. Managing asynchronous background queues, flaky client DOM mutations, and rate limits under strict browser security constraints required resilient, fault-tolerant event engineering.";
      }
      if (isTechChallenge) {
        return "A significant technological challenge I solved was eliminating race conditions and UI latency during high-concurrency client-server state synchronization. Under intermittent network conditions, conflicting payload mutations caused state drift. I architected an optimistic UI update layer paired with an idempotent transactional retry queue and defensive schema validation, ensuring atomic data consistency and seamless recovery without data loss.";
      }
      if (isSocialImpact) {
        return "Yes, technology creates its most meaningful impact when eliminating systemic friction and digital divides for vulnerable populations. In public healthcare and municipal services, administrative overhead, manual paperwork, and fragmented systems disproportionately harm under-resourced communities. By engineering lightweight, offline-first applications and automated data pipelines, software can remove bureaucratic bottlenecks, reduce transcription errors, and deliver reliable, high-standard digital services directly to underserved and marginalized individuals.";
      }
      if (isWhyCompany) {
        return `I am excited about this role because ${company || 'your team'} prioritizes building impactful, high-reliability products that solve substantive real-world problems. My background in building type-safe full-stack architectures and resilient asynchronous pipelines directly aligns with your technical standards. I want to contribute to high-performance systems, take ownership of complex features, and collaborate with an engineering team that values clean code, performance, and user-centric architecture.`;
      }
      if (isTeamwork) {
        return "I approach teamwork and technical disagreements by focusing on objective data, clear documentation, and end-user impact rather than personal ego. When conflicting architectural trade-offs arise, I build quick prototypes, benchmark latency and memory metrics, and facilitate open code reviews to align the team. Clear, transparent communication and empathetic collaboration always result in superior system design, higher code quality, and faster consensus under tight delivery deadlines.";
      }
      return null;
    }

    function isQualityAnswer(text) {
      if (!text || typeof text !== 'string') return false;
      const words = text.trim().split(/\s+/).filter(Boolean).length;
      const lower = text.toLowerCase();

      // 1. If the webpage explicitly requested a minimum word count (e.g. 50 words minimum)
      if (effectiveMinWords && words < effectiveMinWords) {
        return false; // AI response fell short of the page's required minimum
      }

      // 2. Must be a substantive response (at least 20 words)
      if (words < 20) return false;

      // 3. Reject canned repetitive project openers on general questions (skills, why company, social impact, teamwork)
      if (/^(i built|in my project|for my project|during my project|through my project)\b/i.test(lower.trim())) {
        if (!isComplex && !isTechChallenge && !qLower.includes('project')) {
          return false;
        }
      }

      return true;
    }

    const topSkills = (profile.skills || []).slice(0, 8).join(', ');

    // Smart length guidance: handles minWords (e.g. 50 words minimum) and enforces 65-85 words
    const effectiveMinWords = minWords && !isNaN(Number(minWords)) && Number(minWords) > 5 ? Number(minWords) : null;
    let lengthRule = '';
    if (effectiveMinWords) {
      const targetMin = Math.max(effectiveMinWords + 8, 65);
      const targetMax = Math.max(effectiveMinWords + 25, 85);
      lengthRule = `WORD COUNT REQUIREMENT: Must be AT LEAST ${effectiveMinWords + 2} words (NEVER fewer than ${effectiveMinWords} words; target ${targetMin} to ${targetMax} words total).`;
    } else if (maxChars && maxChars < 350) {
      lengthRule = `STRICT CHARACTER LIMIT: Total length MUST be under ${maxChars - 10} characters. Keep it brief, crisp, and finish all sentences completely.`;
    } else {
      lengthRule = `LENGTH: 65 to 85 words (around 420 to 550 characters). Never write fewer than 58 words so you safely exceed 50-word minimum application thresholds.`;
    }

    // Collect available portfolio repos dynamically from profile
    const allCandidateRepos = (
      (profile.githubInsights?.repos && profile.githubInsights.repos.length > 0)
        ? profile.githubInsights.repos
        : (profile.repos || profile.topRepos || [])
    );

    let reposPortfolioText = '';
    if (allCandidateRepos.length > 0) {
      reposPortfolioText = allCandidateRepos.slice(0, 8).map(r => 
        `- ${r.name} (${r.language || 'Full Stack'}): ${r.description || 'Production web/software application'}`
      ).join('\n');
    } else if (profile.workExperience && profile.workExperience.length > 0) {
      reposPortfolioText = profile.workExperience.slice(0, 3).map(w =>
        `- ${w.title} at ${w.company}: ${w.description || 'Software engineering and systems development'}`
      ).join('\n');
    } else {
      const pSkills = (profile.skills && profile.skills.length ? profile.skills : ['TypeScript', 'Node.js', 'React', 'PostgreSQL']).slice(0, 6).join(', ');
      reposPortfolioText = `- Production Web & API Systems (${pSkills}): Full-stack applications featuring responsive interfaces, asynchronous queues, and resilient database integration.
- Scalable Backend Services (${pSkills}): High-availability REST services with atomic transactions, schema validation, and defensive error boundaries.`;
    }

    const prompt = `You are an expert software engineer candidate answering an interview screening question directly on a job application form.
Write in first person ("I"). Write intelligently, authentically, and conversationally.

QUESTION TO ANSWER:
"${question}"

TARGET ROLE & COMPANY:
${role || 'Software Engineer'} at ${company || 'the hiring company'}

CANDIDATE TECHNICAL BACKGROUND:
- Primary Technologies: ${topSkills || 'TypeScript, Node.js, Express, React, PostgreSQL, MongoDB, Python'}
- Real Projects & Experience:
${reposPortfolioText}

${intentGuidance ? intentGuidance + '\n\n' : ''}CRITICAL RULES — READ CAREFULLY:
1. ANSWER THE QUESTION FIRST AND DIRECTLY:
   - Your very first sentence MUST answer the question directly.
   - NEVER begin your answer with "I built [Project name]" or "In my project [Project name]". That is a canned, spammy response and looks completely fake.
   - If asked about your best skills: State your core technical proficiencies and explain WHY you are exceptionally good at them.
   - If asked about your biggest/most complex product: Focus on architectural complexity, worker queues, and scale.
   - If asked about helping the vulnerable in society: Answer the humanitarian and ethical question directly with insight.
2. DIVERSIFY YOUR TECHNICAL REFERENCES:
   - Do NOT fixate on or repeat a single project for every question. Reference the most relevant technologies, architectural patterns, and systems from your background that directly answer the prompt.
3. ${lengthRule}
4. TONE & STYLE: Natural, confident, direct, and pragmatic. No robotic fluff (never say "passionate", "thrive", "testament", "seamlessly", "in conclusion"). Never start with "Certainly" or "Here is".
5. NO MARKDOWN: Zero asterisks, no hashes, no bullet symbols. Plain text only.
6. FINISH ALL SENTENCES: Every sentence must end with a period. Never cut off mid-thought.`;

    let finalAnswer = '';
    try {
      const answerObj = await callAIWithRetry(prompt, 3, 2000, {
        action: 'Extension Question Answer',
        userId: userId || req.user?.id || null
      });

      const rawAnswer = answerObj?.text || (typeof answerObj === 'string' ? answerObj : '');
      let cleanedAnswer = rawAnswer
        ? rawAnswer.replace(/^["']|["']$/g, '').replace(/[*#_`]/g, '').trim()
        : '';

      if (isQualityAnswer(cleanedAnswer)) {
        finalAnswer = cleanedAnswer;
      }
    } catch (err) {
      console.warn('[Extension API] AI generation error:', err.message);
    }

    if (!finalAnswer) {
      finalAnswer = getBenchmarkAnswer() || '';
    }

    // If maxChars constraint exists, strictly enforce safety clamp
    if (maxChars && finalAnswer.length > maxChars) {
      const sliced = finalAnswer.slice(0, maxChars);
      const lastSentenceEnd = Math.max(
        sliced.lastIndexOf('. '),
        sliced.lastIndexOf('.\n'),
        sliced.lastIndexOf('.'),
        sliced.lastIndexOf('!'),
        sliced.lastIndexOf('?')
      );
      if (lastSentenceEnd > 40) {
        finalAnswer = sliced.slice(0, lastSentenceEnd + 1).trim();
      } else {
        const lastSpace = sliced.lastIndexOf(' ');
        finalAnswer = (lastSpace > 0 ? sliced.slice(0, lastSpace) : sliced).trim();
        if (!/[.!?]$/.test(finalAnswer)) finalAnswer += '.';
      }
    }

    res.json({ success: true, answer: finalAnswer });
  } catch (err) {
    console.error('[Extension API] Failed to generate answer:', err);
    res.status(500).json({ error: err.message || 'Failed to generate answer' });
  }
});

// 4. Log Applied Job Directly to MongoDB
router.post('/log-job', requireAuth, async (req, res) => {
  try {
    const { company, role, url, status, notes } = req.body;
    if (!company || !company.trim()) {
      return res.status(400).json({ error: 'Company name is required' });
    }

    // Check if job already exists for user
    const existing = await Job.findOne({
      userId: req.user.id,
      company: new RegExp(`^${company.trim()}$`, 'i'),
      isDeleted: { $ne: true }
    });

    if (existing) {
      existing.status = status || 'Applied';
      if (url) existing.url = url;
      await existing.save();
      return res.json({ success: true, message: 'Job already existed; updated status to Applied', job: existing });
    }

    const newJob = new Job({
      userId: req.user.id,
      company: company.trim(),
      role: (role || 'Software Engineer').trim(),
      url: url || '',
      status: status || 'Applied',
      source: 'Browser Extension Autofill',
      notes: notes || 'Applied via Chrome Extension 1-Click Autofill',
      sentAt: new Date()
    });

    await newJob.save();
    res.json({ success: true, message: 'Job logged successfully to tracker!', job: newJob });
  } catch (err) {
    console.error('[Extension API] Failed to log job:', err);
    res.status(500).json({ error: 'Failed to log job' });
  }
});

// ── 5. ATS Resume Match & Keyword Gap Detector ─────────────────────────────
const TECH_KEYWORDS = [
  'javascript','typescript','python','java','go','golang','rust','ruby','php','swift',
  'kotlin','c++','c#','csharp','dart','scala','elixir','sql','nosql',
  'react','vue','angular','svelte','next','nextjs','next.js','nuxt','remix','tailwind','css','html',
  'node','nodejs','node.js','express','fastapi','flask','django','spring','nest','nestjs','graphql','rest','api','grpc',
  'postgres','postgresql','mysql','mongodb','mongo','redis','elasticsearch','dynamodb','supabase','firebase','prisma',
  'docker','kubernetes','k8s','aws','gcp','azure','terraform','ci/cd','cicd','github actions','jenkins','linux',
  'ai','ml','machine learning','deep learning','llm','gemini','openai','langchain','pytorch','tensorflow',
  'mobile','ios','android','react native','flutter',
  'microservices','monorepo','full-stack','fullstack','backend','frontend','distributed systems','system design',
  'automation','scraper','scraping','websocket','socket','queue','kafka','rabbitmq'
];

router.post('/match-score', async (req, res) => {
  try {
    const { role, company, jobDescription, profile: clientProfile, persona } = req.body;
    let userId = null;
    let profile = null;

    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const jwt = require('jsonwebtoken');
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        userId = decoded.id;
        profile = await Profile.findOne({ userId });
      } catch (_) {}
    }
    if (!profile && clientProfile) profile = clientProfile;
    if (!profile) profile = await Profile.findOne().sort({ updatedAt: -1 });

    const jdText = `${role || ''} ${company || ''} ${jobDescription || ''}`.toLowerCase();
    
    // Candidate's known skill inventory
    const candidateSkills = (profile?.skills || []).map(s => s.toLowerCase().trim());
    const candidateResumeText = (profile?.resumeText || '').toLowerCase();
    const candidateRepos = (profile?.githubInsights?.repos || profile?.repos || []).map(r => `${r.name || ''} ${r.language || ''} ${r.description || ''}`.toLowerCase()).join(' ');
    const candidateFullCorpus = `${candidateSkills.join(' ')} ${candidateResumeText} ${candidateRepos}`;

    // Extract JD technical keywords
    const jdFoundKeywords = [];
    for (const kw of TECH_KEYWORDS) {
      const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`(?:^|[\\s,;/()\\-])${escaped}(?:[\\s,;/()\\-.]|$)`, 'i');
      if (regex.test(jdText)) {
        jdFoundKeywords.push(kw);
      }
    }

    // Categorize matched vs missing
    const matched = [];
    const missing = [];

    for (const kw of jdFoundKeywords) {
      const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`(?:^|[\\s,;/()\\-])${escaped}(?:[\\s,;/()\\-.]|$)`, 'i');
      const isKnown = candidateSkills.some(cs => cs === kw || cs.includes(kw) || kw.includes(cs)) || regex.test(candidateFullCorpus);
      if (isKnown) {
        matched.push(kw);
      } else {
        missing.push(kw);
      }
    }

    // Calculate score
    const total = jdFoundKeywords.length;
    let score = 76; // Default healthy baseline
    if (total > 0) {
      const ratio = matched.length / total;
      score = Math.min(98, Math.max(35, Math.round(ratio * 100)));
      if (matched.includes('typescript') || matched.includes('node') || matched.includes('react') || matched.includes('javascript')) {
        score = Math.min(98, score + 6);
      }
    }

    // Tailored Recommendations
    const recommendations = [];
    if (missing.length > 0) {
      recommendations.push(`Mention experience or familiarity with ${missing.slice(0, 3).join(', ')} in your application answers to improve ATS keyword density.`);
    }
    if (score >= 80) {
      recommendations.push('High ATS alignment! Your core technical background matches the primary requirements for this opening.');
    } else {
      recommendations.push('Emphasize your type-safe architectures and scalable project implementations to offset missing specialized keywords.');
    }

    res.json({
      success: true,
      score,
      matched: Array.from(new Set(matched)),
      missing: Array.from(new Set(missing)),
      recommendations,
      role: role || 'Software Engineer',
      company: company || 'Company'
    });
  } catch (err) {
    console.error('[Extension API] Failed to calculate match score:', err);
    res.status(500).json({ error: err.message || 'Failed to calculate match score' });
  }
});

// ── 6. Discover Recruiter / Company Email ──────────────────────────────────
function isJobBoardOrAtsDomain(host) {
  if (!host || typeof host !== 'string') return false;
  const clean = host.toLowerCase().trim().replace(/^www\./, '');
  const jobBoardPattern = /\b(adzuna|indeed|naukri|linkedin|glassdoor|internshala|foundit|monster|shine|timesjobs|hirist|instahyre|cuvette|unstop|wellfound|angel\.co|ziprecruiter|simplyhired|careerbuilder|dice|apify|google|facebook|twitter|instagram|youtube|wikipedia|github|medium|zaubacorp|tofler|ambitionbox|zoominfo|greenhouse|lever|workday|myworkdayjobs|smartrecruiters|ashbyhq|breezy|recruitee|jobvite|bamboohr|workable)\b/i;
  return jobBoardPattern.test(clean);
}

router.post('/discover-email', async (req, res) => {
  try {
    const { company, role, jobDescription } = req.body;
    if (!company) return res.status(400).json({ error: 'Company name is required' });

    let domain = await resolveCompanyDomain(company);
    let emailResult = null;
    if (domain) {
      emailResult = await discoverEmailForJob(company, domain, null);
    }

    let finalEmail = emailResult?.email || null;
    let source = emailResult?.source || 'Domain Inferred';

    if (!finalEmail && jobDescription) {
      const emailMatch = jobDescription.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/);
      if (emailMatch && !isJobBoardOrAtsDomain(emailMatch[0].split('@')[1])) {
        finalEmail = emailMatch[0];
        source = 'Job Description Text';
      }
    }

    if (!finalEmail && domain) {
      finalEmail = `careers@${domain}`;
      source = 'Corporate Careers Address';
    }

    res.json({
      success: true,
      email: finalEmail,
      domain: domain || '',
      source: source || 'Discovered',
      deliverabilityScore: emailResult?.deliverabilityScore || (finalEmail ? 80 : 0)
    });
  } catch (err) {
    console.error('[Extension API] Failed to discover email:', err);
    res.status(500).json({ error: err.message || 'Failed to discover email' });
  }
});

// ── 7. Draft Cold Outreach Email (Using AI Webapp Engine) ──────────────────
router.post('/draft-email', async (req, res) => {
  try {
    const { company, role, jobDescription, recipientEmail, persona } = req.body;
    let userId = null;
    let profile = null;

    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const jwt = require('jsonwebtoken');
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        userId = decoded.id;
        profile = await Profile.findOne({ userId });
      } catch (_) {}
    }
    if (!profile) profile = await Profile.findOne().sort({ updatedAt: -1 });
    if (!profile) return res.status(404).json({ error: 'Profile not found. Please sync profile in extension.' });

    // Job Portal Blacklist for backend sanitization
    const BACKEND_PORTAL_BLACKLIST = [
      'firstoffer', 'firstoffer.online', 'first offer',
      'wellfound', 'angellist', 'angel list',
      'y combinator', 'work at a startup', 'yc',
      'linkedin', 'indeed', 'glassdoor',
      'naukri', 'naukri.com', 'foundit', 'monster',
      'cutshort', 'instahyre', 'hirist', 'shine', 'freshersworld',
      'hiringcafe', 'otta', 'built in', 'builtin',
      'internshala', 'unstop', 'cuvette', 'techfetch', 'dice',
      'ziprecruiter', 'google jobs', 'remoteok', 'weworkremotely',
      'jobicy', 'simplyhired', 'careerbuilder', 'join.com',
      'breezy', 'greenhouse', 'lever', 'workday', 'ashby',
      'smartrecruiters', 'workable', 'recruitee', 'jobvite', 'bamboohr'
    ];

    function isBackendPortalName(name) {
      if (!name || typeof name !== 'string') return true;
      const clean = name.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
      if (!clean || clean.length < 2 || clean === 'company' || clean === 'unknown') return true;
      for (const p of BACKEND_PORTAL_BLACKLIST) {
        const pClean = p.replace(/[^a-z0-9]/g, '');
        if (clean === pClean || (clean.length <= pClean.length + 3 && pClean.length <= clean.length + 3 && clean.includes(pClean))) return true;
      }
      return false;
    }

    function buildExtensionSignOff(p, candName) {
      const name = candName || p?.name || 'Akash V';
      const phone = (p?.phone || '').trim();
      const baseUrl = (process.env.PUBLIC_URL || 'https://ai-job-finder-7dr8.onrender.com').replace(/\/+$/, '');
      const clickId = Date.now().toString() + Math.random().toString().substring(2, 6);

      const trackClick = (url) => {
        if (!url) return '';
        const clean = url.trim();
        return baseUrl ? `${baseUrl}/api/track-click/${clickId}?url=${encodeURIComponent(clean)}` : clean;
      };

      const links = [];
      if (p?.linkedin) {
        links.push(`[LinkedIn](${trackClick(p.linkedin)})`);
      }
      if (p?.github) {
        links.push(`[GitHub](${trackClick(p.github)})`);
      }
      const portfolioUrl = getEffectivePortfolio(p);
      if (portfolioUrl) {
        links.push(`[Portfolio](${trackClick(portfolioUrl)})`);
      }

      const lines = ['Best,', name];
      if (phone) lines.push(phone);
      if (links.length > 0) lines.push(links.join(' | '));

      return lines.join('\n');
    }

    let targetCompany = (company || '').trim();
    if (isBackendPortalName(targetCompany)) {
      const jdMatch = (jobDescription || '').match(/(?:at|@)\s+([A-Z][A-Za-z0-9\s&.,'-]{1,35}?)(?:\s*[·•–—|-]|\s*[,.\n]|\s*$)/);
      if (jdMatch && !isBackendPortalName(jdMatch[1])) {
        targetCompany = jdMatch[1].trim();
      } else {
        targetCompany = 'the engineering team';
      }
    }

    const targetRole = (role || 'Software Engineer').trim();
    const candidateName = profile.name || 'Candidate';
    const signOffBlock = buildExtensionSignOff(profile, candidateName);

    let personaEmphasis = '';
    const lowerRole = targetRole.toLowerCase();
    if (lowerRole.includes('devops') || lowerRole.includes('sre') || lowerRole.includes('cloud') || lowerRole.includes('infrastructure') || lowerRole.includes('platform') || lowerRole.includes('reliability')) {
      personaEmphasis = 'DevOps / Infrastructure Engineering: Focus on CI/CD pipelines, Docker containerization, cloud deployment automation (AWS/GCP/Linux), shell/Python scripting, and zero-downtime reliability.';
    } else if (persona === 'backend' || lowerRole.includes('backend')) {
      personaEmphasis = 'Backend Engineering: Focus on high-throughput REST APIs, database persistence/indexing (SQL/PostgreSQL/MongoDB), caching, and resilient error recovery.';
    } else if (persona === 'frontend' || lowerRole.includes('frontend') || lowerRole.includes('ui')) {
      personaEmphasis = 'Frontend Engineering: Focus on modern React, Next.js, responsive component architecture, client-side state optimization, and polished UX.';
    } else if (persona === 'mobile' || lowerRole.includes('mobile') || lowerRole.includes('flutter') || lowerRole.includes('android') || lowerRole.includes('ios')) {
      personaEmphasis = 'Mobile Engineering: Focus on cross-platform Flutter/Dart or native development, offline-first data caching, and clean mobile UX performance.';
    } else {
      personaEmphasis = 'Full-Stack Software Engineering: Focus on full-lifecycle development across React/TypeScript frontend, robust Node.js backend services, and reliable database persistence.';
    }

    let outreachProjectsList = '';
    if (profile.githubInsights?.repos && profile.githubInsights.repos.length > 0) {
      outreachProjectsList = profile.githubInsights.repos.slice(0, 3).map(r =>
        `  * ${r.name} (${r.language || 'Full Stack'}): ${r.description || 'Production web/software application'}`
      ).join('\n');
    } else if (profile.workExperience && profile.workExperience.length > 0) {
      outreachProjectsList = profile.workExperience.slice(0, 2).map(w =>
        `  * ${w.title} at ${w.company}: ${w.description || 'Systems engineering and application delivery'}`
      ).join('\n');
    } else {
      const pSkills = (profile.skills || ['TypeScript', 'Node.js', 'React', 'PostgreSQL']).slice(0, 4).join(', ');
      outreachProjectsList = `  * Scalable Applications & Automation Tools (${pSkills})
  * Resilient Production Architectures (CI/CD, REST APIs, database persistence, asynchronous workflows)`;
    }

    const prompt = `You are a talented software engineer named ${candidateName} writing a direct, high-impact cold email to the engineering team at ${targetCompany} for the "${targetRole}" opening.
Discipline Focus: ${personaEmphasis}

Target Job Context:
${(jobDescription || '').slice(0, 1500)}

Candidate's Background & Projects:
- Top Skills: ${(profile.skills || ['TypeScript', 'Node.js', 'React', 'PostgreSQL', 'Docker', 'Python']).slice(0, 8).join(', ')}
- Verified Projects/Experience:
${outreachProjectsList}

GUIDELINES FOR A REAL, COMPELLING HUMAN EMAIL (ZERO AI SLOP):
1. SOUND LIKE A SHARP, EAGER DEVELOPER:
   - Talk directly to the technical team with genuine energy and clarity.
   - NO stiff robotic phrases ("I am writing to express my interest", "which aligns well with the layers you are likely using", "my passion for your innovative company", "I am a perfect fit").
2. CONCISE & PUNCHY (80 to 120 words total):
   - Paragraph 1 (The Hook): Say you noticed the ${targetRole} role at ${targetCompany} and wanted to reach out directly. State the 2-3 core technologies or tools you actively build with that directly tackle what this role demands.
   - Paragraph 2 (The Proof): Highlight a specific, tangible project or architecture you built (referencing your projects above). Explain in clear, technical terms what problem you solved (e.g. automated deployment pipelines, asynchronous data scraping, robust DB persistence, or reactive UI state).
   - Paragraph 3 (The Low-Friction Call-to-Action): "I've attached my resume and would welcome a quick 10-minute chat if my background looks like a match for what you're building."
3. STRICTLY NO BULLET POINTS: Write in 2-3 clean, readable paragraphs.
4. SIGN-OFF BLOCK:
${signOffBlock}

Output format:
SUBJECT: Application for ${targetRole} - ${candidateName}
BODY:
Hi ${targetCompany} Team,

[Email body here]

${signOffBlock}`;

    let subject = `Application for ${targetRole} - ${candidateName}`;
    let body = '';

    try {
      const aiRes = await callAIWithRetry(prompt, 3, 2000, { action: 'Draft Outreach Email', userId });
      const rawText = aiRes?.text || '';
      const subjectMatch = rawText.match(/SUBJECT:\s*(.*)/i);
      const bodyMatch = rawText.match(/BODY:\s*([\s\S]*)/i);
      if (subjectMatch) subject = subjectMatch[1].trim();
      if (bodyMatch) body = bodyMatch[1].trim();
      else body = rawText.replace(/SUBJECT:.*?\n/i, '').trim();
    } catch (err) {
      console.warn('[Extension API] AI draft error:', err.message);
    }

    if (body) {
      const cleanBody = stripSignOff(cleanDraftEmailText(body, profile, targetCompany, targetRole, { preserveMarkdownLinks: true }), profile);
      body = `${cleanBody}\n\n${signOffBlock}`;
    } else {
      const s1 = profile.skills?.[0] || 'TypeScript';
      const s2 = profile.skills?.[1] || 'Node.js';
      const s3 = profile.skills?.[2] || 'React';
      body = `Hi ${targetCompany} Team,\n\nI saw the opening for the ${targetRole} position and wanted to reach out directly. I've been actively developing full-stack web applications using ${s1}, ${s2}, and ${s3}, with a focus on building clean REST APIs and responsive user interfaces.\n\nRecently, I built and deployed full-stack projects handling real-time state, backend database persistence, and robust error handling. I'd love to bring this hands-on engineering mindset to ${targetCompany}.\n\nI've attached my resume and would love to chat if my background sounds like a fit for your team.\n\n${signOffBlock}`;
    }

    res.json({
      success: true,
      subject,
      body,
      recipientEmail: recipientEmail || '',
      company: targetCompany,
      role: targetRole
    });
  } catch (err) {
    console.error('[Extension API] Failed to draft email:', err);
    res.status(500).json({ error: err.message || 'Failed to draft email' });
  }
});

// ── 8. Send Outreach Email Directly (via Webapp Dispatcher) ───────────────
router.post('/send-outreach-email', async (req, res) => {
  try {
    const { to, subject, body, company, role, jd } = req.body;
    if (!to || !to.includes('@')) return res.status(400).json({ error: 'Valid recipient email is required' });
    if (!subject) return res.status(400).json({ error: 'Subject is required' });
    if (!body) return res.status(400).json({ error: 'Email body is required' });

    let userId = null;
    let user = null;
    let profile = null;

    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const jwt = require('jsonwebtoken');
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        userId = decoded.id;
        user = await User.findById(userId);
        profile = await Profile.findOne({ userId });
      } catch (_) {}
    }
    if (!user) user = await User.findOne().sort({ createdAt: -1 });
    if (!profile) profile = await Profile.findOne().sort({ updatedAt: -1 });

    const mailOptions = {
      from: user?.email || process.env.EMAIL_USER,
      to: to.trim(),
      subject: subject.trim(),
      text: body.trim(),
      html: `<div style="font-family: Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #1e293b;">
        ${formatEmailTextToHtml(body.trim())}
      </div>`,
      attachments: []
    };

    if (profile?.resumePdf) {
      mailOptions.attachments.push({
        filename: profile.resumeFilename || 'Resume.pdf',
        content: profile.resumePdf,
        contentType: 'application/pdf'
      });
    }

    await sendEmailViaAPI(user || {}, mailOptions);

    try {
      const newJob = new Job({
        userId: user?._id || profile?.userId,
        company: (company || 'Company').trim(),
        role: (role || 'Software Engineer').trim(),
        status: 'Sent',
        source: 'Extension Direct Outreach',
        emailRecipient: to.trim(),
        emailDraft: body.trim(),
        sentAt: new Date(),
        notes: `Direct email sent from Copilot sidebar to ${to.trim()}`
      });
      await newJob.save();
    } catch (_) {}

    res.json({
      success: true,
      message: `Email successfully sent to ${to.trim()} with CV attached!`
    });
  } catch (err) {
    console.error('[Extension API] Failed to send outreach email:', err);
    res.status(500).json({ error: err.message || 'Failed to send outreach email' });
  }
});

// ── 9. Tailored Cover Letter Generator ─────────────────────────────────────
router.post('/generate-cover-letter', async (req, res) => {
  try {
    const { company, role, jobDescription, persona } = req.body;
    let userId = null;
    let profile = null;

    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const jwt = require('jsonwebtoken');
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        userId = decoded.id;
        profile = await Profile.findOne({ userId });
      } catch (_) {}
    }
    if (!profile && req.body.profile) profile = req.body.profile;
    if (!profile) profile = await Profile.findOne().sort({ updatedAt: -1 });

    let targetCompany = (company || '').trim();
    if (isBackendPortalName(targetCompany)) {
      const jdMatch = (jobDescription || '').match(/(?:at|@)\s+([A-Z][A-Za-z0-9\s&.,'-]{1,35}?)(?:\s*[·•–—|-]|\s*[,.\n]|\s*$)/);
      if (jdMatch && !isBackendPortalName(jdMatch[1])) {
        targetCompany = jdMatch[1].trim();
      } else {
        targetCompany = 'the engineering team';
      }
    }
    const targetRole = role || 'Software Engineer';
    const candidateName = req.body.candidateName || profile?.name || 'Akash V.';
    const candidateEmail = profile?.email || req.body.candidateEmail || '';
    const candidatePhone = profile?.phone || req.body.candidatePhone || '';

    // Analyze role specialization
    const roleLower = targetRole.toLowerCase();
    let roleFocus = 'Full-Stack';
    if (roleLower.includes('front') || roleLower.includes('react') || roleLower.includes('ui') || roleLower.includes('web dev')) {
      roleFocus = 'Frontend Engineering & Client Architecture';
    } else if (roleLower.includes('back') || roleLower.includes('node') || roleLower.includes('api') || roleLower.includes('platform') || roleLower.includes('system')) {
      roleFocus = 'Backend Systems & API Architecture';
    } else if (roleLower.includes('mobile') || roleLower.includes('flutter') || roleLower.includes('react native') || roleLower.includes('android') || roleLower.includes('ios')) {
      roleFocus = 'Mobile & Cross-Platform Architecture';
    } else if (roleLower.includes('ml') || roleLower.includes('ai') || roleLower.includes('machine learning')) {
      roleFocus = 'AI/ML & Vision Systems';
    }

    const jdSample = (jobDescription || '').slice(0, 2500);

    let signatureProjectsText = '';
    if (profile?.githubInsights?.repos && profile.githubInsights.repos.length > 0) {
      signatureProjectsText = profile.githubInsights.repos.slice(0, 2).map((r, idx) =>
        `- Signature Project ${idx + 1}: ${r.name} (${r.language || 'Full Stack'} - ${r.description || 'Production software system'})`
      ).join('\n');
    } else if (profile?.workExperience && profile.workExperience.length > 0) {
      signatureProjectsText = profile.workExperience.slice(0, 2).map((w, idx) =>
        `- Experience Highlight ${idx + 1}: ${w.title} at ${w.company} (${w.description || 'Built scalable systems and client-facing features'})`
      ).join('\n');
    } else {
      const stack = (profile?.skills || ['TypeScript', 'Node.js', 'React', 'PostgreSQL']).slice(0, 5).join(', ');
      signatureProjectsText = `- Signature Focus: Scalable Web & Distributed Systems (Hands-on engineering using ${stack}, focusing on asynchronous workflows, database integrity, and high-performance UI state).`;
    }

    const prompt = `You are an exceptional software engineer crafting a bespoke, persuasive, and highly tailored cover letter for an application.
Candidate Identity: ${candidateName}
Target Role: ${targetRole}
Target Company: ${targetCompany}
Specialization Focus: ${roleFocus} (Active Persona: ${persona || 'fullstack'})

Target Job Description & Company Context:
${jdSample || 'Focus on modern, high-reliability software architecture, performant user interfaces, scalable services, and clean engineering standards.'}

Candidate Profile & Technical Accomplishments:
- Full Name: ${candidateName}
- Core Stack: ${(profile?.skills || ['TypeScript', 'JavaScript', 'React', 'Node.js', 'Express', 'PostgreSQL', 'MongoDB', 'Tailwind CSS']).slice(0, 10).join(', ')}
${signatureProjectsText}
- Engineering Mindset: Rigorous defensive error handling, modular component architecture, atomic transactions, and user-centric software delivery.

MANDATORY INSTRUCTIONS FOR RELEVANCE & UNIQUENESS:
1. DEEPLY GROUND IN THE JD & COMPANY:
   - Identify what ${targetCompany} actually builds or the technical domain of this role (e.g. APIs, platforms, SaaS, fintech, developer tooling) from the JD text.
   - Specifically weave in 3-4 keywords and technical requirements from their JD (e.g. state management, modular component design, RESTful APIs, type-safe data models, UI performance).
2. ALIGN WITH ROLE (${roleFocus}):
   - If Frontend: Focus on responsive client-side architecture, state management, web vitals, accessible component design, and dynamic DOM interaction.
   - If Backend: Focus on high-throughput API endpoints, database transaction integrity, asynchronous queue workers, and system reliability.
   - If Full-Stack: Connect robust backend data pipelines with responsive, type-safe client interfaces.
3. STRUCTURE (3 distinct paragraphs):
   - Paragraph 1 (Direct Hook & Alignment): State the exact role (${targetRole}) at ${targetCompany}, specifically explain why their engineering challenges or product domain resonate with you, and summarize your matching technical identity.
   - Paragraph 2 (Deep Technical Evidence): Showcase your hands-on achievements from your actual projects and background, directly connecting the technical hurdles you solved (e.g. state synchronization, resilient API design, DOM heuristics) to the exact requirements in their JD.
   - Paragraph 3 (Team Culture, Delivery & Forward Momentum): Reiterate your proactive ownership and eagerness to contribute immediately to ${targetCompany}'s upcoming sprints. Express your enthusiasm to discuss technical alignment.
4. STRICT TONE & FORMAT RULES:
   - Target word count: 200 to 260 words. Punchy, authentic, engineering-first.
   - NO cliches or generic fluff ("I am writing to express my eager desire", "esteemed organization", "perfect fit", "thrive in fast-paced").
   - NO markdown asterisks, no bullet points, no headers.
   - Output ONLY the 3 body paragraphs. Do NOT include header lines, addresses, dates, salutations ("Dear..."), or sign-offs ("Sincerely...", name) as the PDF/HTML formatter attaches those.`;

    let coverLetter = '';
    try {
      const aiRes = await callAIWithRetry(prompt, 3, 2000, { action: 'Generate Cover Letter', userId });
      coverLetter = (aiRes?.text || '').replace(/[*#_`]/g, '').trim();
    } catch (err) {
      console.warn('[Extension API] Cover letter AI error:', err.message);
    }

    if (!coverLetter) {
      // Role-aware intelligent fallback
      const isFrontend = roleFocus.includes('Frontend');
      const isBackend = roleFocus.includes('Backend');
      if (isFrontend) {
        coverLetter = `I am applying for the ${targetRole} position at ${targetCompany}. With hands-on experience building performant client-side architectures, modular component systems, and responsive web interfaces using TypeScript and React, I am really excited about what ${targetCompany} is building.

In my recent engineering projects, I have focused on solving real-world frontend challenges. I have architected reactive interfaces featuring real-time DOM updates, dynamic component composition, and smooth multi-step state management without UI latency. I prioritize accessible, mobile-first design and comprehensive error boundaries to ensure reliable performance across devices and network constraints.

What excites me about ${targetCompany} is the opportunity to tackle meaningful engineering challenges alongside a high-execution team. My proactive approach to code quality, edge-case testing, and rapid iteration allows me to make a direct impact from day one. I would love to discuss how my background aligns with your team's upcoming goals.`;
      } else if (isBackend) {
        coverLetter = `I am applying for the ${targetRole} position at ${targetCompany}. With hands-on experience designing RESTful APIs, type-safe data services, and resilient backend systems using TypeScript, Node.js, and relational databases, I am really drawn to ${targetCompany}'s technical focus.

In my software work, I have focused on building scalable, reliable services. I have engineered high-availability endpoints with asynchronous worker queues, clean database migrations, and defensive error logging to ensure data integrity under load. These experiences reinforced my commitment to predictable state transitions, clean API contracts, and defensive boundaries.

I thrive in collaborative environments that value technical curiosity, pragmatic system design, and continuous learning. I am confident that my problem-solving mindset will allow me to contribute meaningfully to ${targetCompany}'s infrastructure. I would welcome the opportunity to connect and discuss how my background matches your team's needs.`;
      } else {
        coverLetter = `I am applying for the ${targetRole} position at ${targetCompany}. With a versatile background spanning responsive frontend interfaces, clean REST APIs, and asynchronous data pipelines using TypeScript, React, and Node.js, I am excited about what ${targetCompany} is building.

Across my recent projects, I have taken ownership of features from database schemas to polished user interfaces. I build applications pairing reactive frontends with asynchronous worker queues, structured relational databases, and resilient APIs. I emphasize end-to-end type safety, optimistic UI updates, and atomic database consistency.

What draws me to ${targetCompany} is your team's commitment to building solid, high-impact products. I bring a self-driven work ethic, high execution velocity, and a passion for engineering fundamentals. I would love the chance to discuss how my full-stack background can help advance your team's product roadmap.`;
      }
    }

    const candidateLocation = [profile?.city, profile?.state, profile?.country].filter(Boolean).join(', ') || profile?.addressLine1 || profile?.location || '';
    const wordCount = coverLetter.split(/\s+/).filter(Boolean).length;
    res.json({
      success: true,
      coverLetter,
      wordCount,
      candidateName,
      candidateEmail,
      candidatePhone,
      candidateLocation,
      company: targetCompany,
      role: targetRole
    });
  } catch (err) {
    console.error('[Extension API] Failed to generate cover letter:', err);
    res.status(500).json({ error: err.message || 'Failed to generate cover letter' });
  }
});

module.exports = router;
