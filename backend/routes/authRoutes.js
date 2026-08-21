const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { google } = require('googleapis');
const User = require('../models/User');
const Profile = require('../models/Profile');

const isProd = process.env.NODE_ENV === 'production';
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  isProd && process.env.PUBLIC_URL ? `${process.env.PUBLIC_URL}/api/auth/google/callback` : 'http://localhost:5000/api/auth/google/callback'
);

const JWT_SECRET = process.env.JWT_SECRET;

async function getProfile(userId) {
  let profile = await Profile.findOne({ userId });
  if (!profile) {
    profile = new Profile({ userId });
    await profile.save();
  }
  return profile;
}

router.get('/google', (req, res) => {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return res.status(500).json({ error: 'Google OAuth2 is not configured in backend .env' });
  }
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://mail.google.com/'],
    prompt: 'consent'
  });
  res.redirect(url);
});

router.get('/google/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).send('No code provided');

  try {
    const { tokens } = await oauth2Client.getToken(code);

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

    await getProfile(user._id);

    const token = jwt.sign({ id: user._id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });

    const redirectUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    res.redirect(`${redirectUrl}/?token=${token}`);
  } catch (err) {
    console.error('OAuth callback error:', err);
    res.status(500).send('Authentication failed');
  }
});

module.exports = router;
