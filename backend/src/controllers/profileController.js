const multer = require('multer');
const Profile = require('../models/Profile');
const User = require('../models/User');
const { parseResume } = require('../services/resumeService');
const logger = require('../utils/logger');

// Multer configuration with file size limit (5MB)
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'), false);
    }
  }
});

const getProfile = async (req, res) => {
  try {
    const profile = await Profile.findOne({ userId: req.user.id });
    const user = await User.findById(req.user.id);
    
    if (!profile) {
      return res.json({});
    }
    
    const profileObj = profile.toObject();
    delete profileObj.resumePdf; // Don't send raw PDF binary to frontend
    
    const responseData = {
      ...profileObj,
      emailUser: user.email // Attach email from user model for frontend
    };
    res.json(responseData);
  } catch (err) {
    logger.error('[Profile] Failed to fetch profile', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
};

const updateProfile = async (req, res) => {
  try {
    const profile = await Profile.findOne({ userId: req.user.id });
    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }
    
    // Safely update only allowed fields
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
    logger.error('[Profile] Update error', { error: err.message });
    res.status(500).json({ error: 'Failed to update profile' });
  }
};

const uploadResume = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const parsedData = await parseResume(req.file.buffer, req.file.originalname);

    const profile = await Profile.findOneAndUpdate(
      { userId: req.user.id },
      { $set: parsedData },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    // We omit the large buffer when returning the profile to frontend
    const profileObj = profile.toObject();
    delete profileObj.resumePdf;

    res.json({ success: true, profile: profileObj });
  } catch (err) {
    logger.error('[Profile] Resume upload error', { error: err.message });
    res.status(500).json({ error: 'Failed to upload and parse resume' });
  }
};

const getResumePdf = async (req, res) => {
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
    logger.error('[Profile] Resume PDF fetch error', { error: err.message });
    res.status(500).send('Failed to fetch resume.');
  }
};

module.exports = {
  getProfile,
  updateProfile,
  uploadResume,
  getResumePdf,
  upload // Export multer middleware
};