const express = require('express');
const router = express.Router();
const Job = require('../models/Job');
const Profile = require('../models/Profile');

async function getProfile() {
  const profile = await Profile.findOne();
  return profile || {};
}

router.get('/track-open/:jobId', async (req, res) => {
  const { jobId } = req.params;
  const userAgent = req.headers['user-agent'] || '';

  const botAgents = ['googleimageproxy', 'applemail/proxy', 'barracuda', 'mimecast', 'yahoomailproxy'];
  const isBot = botAgents.some(bot => userAgent.toLowerCase().includes(bot));

  try {
    const job = await Job.findOne({ id: jobId });

    const timeSinceSent = job && job.sentAt ? Date.now() - job.sentAt.getTime() : 16000;

    if (job && job.status !== 'Bounced') {
      if (!isBot && timeSinceSent > 15000) {
        job.status = 'Opened';
        await job.save();
        console.log(`[Tracking] Email opened for job: ${job.company}`);
      } else {
        console.log(`[Tracking] Ignored bot/early open for ${job.company} (Bot: ${isBot}, MsDelay: ${timeSinceSent})`);
      }
    }
  } catch (err) { }

  const buf = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
  res.writeHead(200, {
    'Content-Type': 'image/gif',
    'Content-Length': buf.length,
    'Cache-Control': 'no-cache, no-store, must-revalidate',
  });
  res.end(buf);
});

router.get('/track-click/:jobId', async (req, res) => {
  const { jobId } = req.params;
  const { url } = req.query;

  try {
    const job = await Job.findOne({ id: jobId });
    if (job && job.status !== 'Bounced') {
      job.status = 'Opened';
      if (url && !job.clickedLinks.includes(url)) {
        job.clickedLinks.push(url);
      }
      await job.save();
      console.log(`[Tracking] Link clicked for job: ${job.company} -> ${url}`);
    }
  } catch (err) { }

  if (url) {
    let finalUrl = url;
    if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
      finalUrl = 'https://' + finalUrl;
    }
    res.redirect(finalUrl);
  } else {
    try {
      const profile = await getProfile();
      res.redirect(profile.linkedin || '/');
    } catch {
      res.redirect('/');
    }
  }
});

module.exports = router;
