const express = require('express');
const router = express.Router();
const Job = require('../models/Job');
const { verify } = require('../utils/signedLinks');
function trackedClaims(req, purpose) {
  const claims = verify(req.query.token, purpose);
  if (claims.jobId !== req.params.jobId) throw new Error('Invalid tracking link');
  return claims;
}
router.get('/track-open/:jobId', async (req, res) => {
  try {
    const claims = trackedClaims(req, 'open');
    const isBot = /googleimageproxy|applemail|barracuda|mimecast|yahoomailproxy/i.test(req.headers['user-agent'] || '');
    if (!isBot) await Job.updateOne({ userId: claims.userId, id: claims.jobId, isDeleted: { $ne: true }, status: { $in: ['Sent', 'Opened'] }, sentAt: { $lt: new Date(Date.now() - 15000) } }, { $set: { status: 'Opened' } });
  } catch { /* Invalid links do not mutate data; pixels always return an image. */ }
  const pixel = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
  res.set({ 'Content-Type': 'image/gif', 'Cache-Control': 'no-store' }).send(pixel);
});
router.get('/track-click/:jobId', async (req, res) => {
  let claims;
  try {
    claims = trackedClaims(req, 'click');
    const target = new URL(claims.url);
    if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password) throw new Error('Invalid destination');
  } catch { return res.status(400).send('This link is invalid or expired.'); }
  try {
    await Job.updateOne({ userId: claims.userId, id: claims.jobId, isDeleted: { $ne: true }, status: { $in: ['Sent', 'Opened'] } }, { $set: { status: 'Opened' }, $addToSet: { clickedLinks: claims.url } });
  } catch { /* Analytics failure must not break a valid signed destination. */ }
  res.redirect(claims.url);
});
module.exports = router;
