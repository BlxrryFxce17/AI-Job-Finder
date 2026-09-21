const express = require('express');
const router = express.Router();
const multer = require('multer');
const pdfParse = require('pdf-parse');
const requireAuth = require('../middleware/requireAuth');
const Profile = require('../models/Profile');
const User = require('../models/User');
const Job = require('../models/Job');
const { callAIWithRetry } = require('../utils/ai');

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

// 2. Fetch Autofill Profile for Active User
router.get('/profile', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('email');
    const profile = await Profile.findOne({ userId: req.user.id });

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found. Please configure your profile first.' });
    }

    const fullName = (profile.name || '').trim();
    const nameParts = fullName.split(/\s+/);
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';

    // Clean top repos
    const topRepos = (profile.githubInsights?.repos || []).slice(0, 8).map(r => ({
      name: r.name,
      description: r.description || '',
      language: r.language || '',
      url: r.url || (profile.github ? `${profile.github.replace(/\/$/, '')}/${r.name}` : ''),
      stars: r.stars || 0
    }));

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
      return !key.startsWith('prof-') && !key.startsWith('ai-') && key.length > 1;
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
router.post('/generate-answer', requireAuth, async (req, res) => {
  try {
    const { question, jobDescription, role, company } = req.body;

    if (!question || !question.trim()) {
      return res.status(400).json({ error: 'Question text is required' });
    }

    const profile = await Profile.findOne({ userId: req.user.id });
    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    const topSkills = (profile.skills || []).slice(0, 10).join(', ');
    const userRepos = (profile.githubInsights?.repos || [])
      .slice(0, 5)
      .map(r => `- ${r.name} (${r.language || 'Code'}): ${r.description || 'Production software system'}`)
      .join('\n');

    const prompt = `You are ${profile.name}, applying to ${company || 'a company'}${role ? ` for ${role}` : ''}.
Answer this screening question directly. Write in first person.

QUESTION: "${question}"

JOB CONTEXT: ${role || 'Software Engineer'} at ${company || 'target company'}. ${jobDescription ? jobDescription.slice(0, 600) : ''}

YOUR REAL BACKGROUND:
- Title: ${profile.title || 'Full Stack Engineer'}
- Skills: ${topSkills || 'JavaScript, React, Node.js, Python'}
- Projects: ${userRepos || 'web apps and automation systems'}

RULES:
- Start with the answer. No filler ("Certainly", "As a developer", "Here is").
- Keep it SHORT: 2-4 sentences for simple questions, max 1 short paragraph for behavioral ones.
- Sound like a real human, not AI. Casual professional tone.
- Reference 1-2 real projects or skills when relevant.
- NO bullet points. NO "I'm passionate about" or "I thrive in" or similar cliches.
- If asked about a bug or technical scenario, give a specific realistic example.`;

    const answer = await callAIWithRetry(prompt, 3, 2000, {
      action: 'Extension Question Answer',
      userId: req.user.id
    });

    const cleanedAnswer = answer ? answer.replace(/^["']|["']$/g, '').trim() : '';
    res.json({ success: true, answer: cleanedAnswer });
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

module.exports = router;
