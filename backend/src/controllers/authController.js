const { google } = require('googleapis');
const jwt = require('jsonwebtoken');
const config = require('../config');
const logger = require('../utils/logger');
const User = require('../models/User');
const Profile = require('../models/Profile');

// Initialize OAuth2 client
const isProd = config.nodeEnv === 'production';
const oauth2Client = new google.auth.OAuth2(
  config.googleClientId,
  config.googleClientSecret,
  isProd && config.publicUrl 
    ? `${config.publicUrl}/api/auth/google/callback` 
    : 'http://localhost:5000/api/auth/google/callback'
);

const googleAuth = async (req, res) => {
  if (!config.googleClientId || !config.googleClientSecret) {
    logger.error('[Auth] Google OAuth2 not configured');
    return res.status(500).json({ error: 'Google OAuth2 is not configured in backend .env' });
  }
  
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://mail.google.com/'],
    prompt: 'consent'
  });
  res.redirect(url);
};

const googleCallback = async (req, res) => {
  const { code } = req.query;
  if (!code) {
    return res.status(400).send('No code provided');
  }
  
  try {
    const { tokens } = await oauth2Client.getToken(code);
    
    // Automatically fetch their email address
    oauth2Client.setCredentials(tokens);
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    const profileRes = await gmail.users.getProfile({ userId: 'me' });
    const email = profileRes.data.emailAddress;
    
    let user = await User.findOne({ email });
    if (!user) {
      user = new User({ email });
    }
    user.googleRefreshToken = tokens.refresh_token || user.googleRefreshToken;
    user.googleAccessToken = tokens.access_token;
    user.googleTokenExpiry = tokens.expiry_date;
    await user.save();
    
    // Create profile if it doesn't exist
    await Profile.findOneAndUpdate(
      { userId: user._id },
      { $setOnInsert: { userId: user._id, emailUser: email } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    
    // Generate JWT
    const token = jwt.sign({ id: user._id, email: user.email }, config.jwtSecret, { expiresIn: '7d' });
    
    // Redirect back to frontend
    const redirectUrl = config.frontendUrl || 'http://localhost:5173';
    res.redirect(`${redirectUrl}/?token=${token}`);
  } catch (err) {
    logger.error('[Auth] OAuth callback error', { error: err.message });
    res.status(500).send('Authentication failed');
  }
};

module.exports = {
  googleAuth,
  googleCallback
};