const Job = require('../models/Job');
const config = require('../config');
const logger = require('../utils/logger');

const trackOpen = async (req, res) => {
  const { jobId } = req.params;
  const userAgent = req.headers['user-agent'] || '';

  // User-Agent filtering to ignore common bots
  const botAgents = [
    'googleimageproxy',
    'applemail/proxy',
    'barracuda',
    'mimecast',
    'yahoomailproxy',
  ];
  const isBot = botAgents.some(bot => userAgent.toLowerCase().includes(bot));

  try {
    const job = await Job.findOne({ id: jobId });

    // Time-Delay check (ignore opens within 15 seconds of sending)
    const timeSinceSent = job && job.sentAt ? Date.now() - job.sentAt.getTime() : 16000;

    if (job && job.status !== 'Bounced') {
      if (!isBot && timeSinceSent > 15000) {
        job.status = 'Opened';
        await job.save();
        logger.info('[Tracking] Email opened', { jobId, company: job.company });
      } else {
        logger.debug('[Tracking] Ignored bot/early open', {
          company: job.company,
          isBot,
          timeSinceSent,
        });
      }
    }
  } catch (err) {
    logger.error('[Tracking] Track open error', { error: err.message, jobId });
  }

  // Return a 1x1 transparent GIF
  const buf = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
  res.writeHead(200, {
    'Content-Type': 'image/gif',
    'Content-Length': buf.length,
    'Cache-Control': 'no-cache, no-store, must-revalidate',
  });
  res.end(buf);
};

const trackClick = async (req, res) => {
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
      logger.info('[Tracking] Link clicked', { jobId, company: job.company, url });
    }
  } catch (err) {
    logger.error('[Tracking] Track click error', { error: err.message, jobId });
  }

  if (url) {
    let finalUrl = url;
    if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
      finalUrl = 'https://' + finalUrl;
    }
    res.redirect(finalUrl);
  } else {
    // Fallback redirect
    res.redirect('/');
  }
};

module.exports = {
  trackOpen,
  trackClick,
};
