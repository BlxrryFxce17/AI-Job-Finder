const express = require('express');
const router = express.Router();
const multer = require('multer');
const pdfParse = require('pdf-parse');
const User = require('../models/User');
const Profile = require('../models/Profile');
const requireAuth = require('../middleware/requireAuth');
const { callAIWithRetry } = require('../utils/ai');

const upload = multer({ storage: multer.memoryStorage() });

async function getProfile(userId) {
  let profile = await Profile.findOne({ userId });
  if (!profile) {
    profile = new Profile({ userId });
    await profile.save();
  }
  return profile;
}

router.get('/', requireAuth, async (req, res) => {
  try {
    const profile = await getProfile(req.user.id);
    const user = await User.findById(req.user.id);
    const profileObj = profile.toObject();
    delete profileObj.resumePdf;

    const responseData = {
      ...profileObj,
      emailUser: user.email 
    };
    res.json(responseData || {});
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

router.put('/', requireAuth, async (req, res) => {
  try {
    const profile = await getProfile(req.user.id);

    const allowedFields = ['name', 'title', 'phone', 'linkedin', 'github', 'tone', 'experienceLevel', 'enableFlex', 'aiInstructions'];
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
});

router.post('/resume', requireAuth, upload.single('resume'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const dataBuffer = req.file.buffer;
    const data = await pdfParse(dataBuffer);

    const profile = await getProfile(req.user.id);
    profile.resumeText = data.text;

    try {
      console.log('[Resume Parse] Extracting details with AI...');
      const prompt = `Extract the core skills (max 10), top 3 achievements, experience level (e.g., Junior, Mid, Senior), full name, current professional title (e.g., Software Engineer), phone number, LinkedIn URL, and GitHub URL from this resume text. 
Return ONLY a valid JSON object with the following structure:
{"skills": ["skill1", "skill2"], "achievements": ["achievement1", "achievement2"], "experienceLevel": "Senior", "name": "John Doe", "title": "Developer", "phone": "1234567890", "linkedin": "url", "github": "url"}
Resume text:
${data.text.substring(0, 4000)}
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
    res.setHeader('Content-Disposition', `inline; filename="${profile.resumeFilename}"`);
    res.send(profile.resumePdf);
  } catch (err) {
    res.status(500).send('Failed to fetch resume.');
  }
});

module.exports = router;
