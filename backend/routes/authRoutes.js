const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { google } = require('googleapis');
const User = require('../models/User');
const Profile = require('../models/Profile');

const isProd = process.env.NODE_ENV === 'production';
const getBaseUrl = (url) => url && !url.startsWith('http') ? `https://${url}` : url;

const publicUrl = getBaseUrl(process.env.PUBLIC_URL);

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  isProd && publicUrl ? `${publicUrl}/api/auth/google/callback` : 'http://localhost:5000/api/auth/google/callback'
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
    scope: [
      'openid',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile',
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/gmail.readonly'
    ],
    prompt: 'consent select_account'
  });
  res.redirect(url);
});

router.get('/google/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).send('No code provided');

  try {
    const { tokens } = await oauth2Client.getToken(code);

    oauth2Client.setCredentials(tokens);
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const userInfoRes = await oauth2.userinfo.get();
    const email = userInfoRes.data.email;
    const name = userInfoRes.data.name;

    let user = await User.findOne({ email });
    if (!user) {
      user = new User({ email, name: name || '' });
    } else if (name && !user.name) {
      user.name = name;
    }
    user.googleRefreshToken = tokens.refresh_token || user.googleRefreshToken;
    user.googleAccessToken = tokens.access_token;
    user.googleTokenExpiry = tokens.expiry_date;
    await user.save();

    const profile = await getProfile(user._id);
    if (name && !profile.name) {
      profile.name = name;
      await profile.save();
    }

    const token = jwt.sign({ id: user._id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });

    const redirectUrl = getBaseUrl(process.env.FRONTEND_URL) || 'http://localhost:5173';
    res.redirect(`${redirectUrl}/?token=${token}`);
  } catch (err) {
    console.error('OAuth callback error:', err);
    res.status(500).send('Authentication failed');
  }
});

module.exports = router;
