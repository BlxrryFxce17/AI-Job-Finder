const jwt = require('jsonwebtoken');

function sign(purpose, claims, expiresIn) {
  if (!process.env.JWT_SECRET) throw new Error('Signing is not configured');
  return jwt.sign({ ...claims, purpose }, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn });
}
function verify(token, purpose) {
  const claims = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
  if (claims.purpose !== purpose || !claims.userId) throw new Error('Invalid link');
  return claims;
}
function resumeLink(baseUrl, userId) {
  if (!baseUrl) return null;
  return `${baseUrl.replace(/\/$/, '')}/api/profile/resume-pdf?token=${encodeURIComponent(sign('resume', { userId: String(userId) }, '7d'))}`;
}
function trackingLink(baseUrl, userId, jobId, url) {
  if (!baseUrl || !jobId) return url || '';
  const purpose = url ? 'click' : 'open';
  const token = sign(purpose, { userId: String(userId), jobId: String(jobId), ...(url ? { url } : {}) }, '90d');
  return `${baseUrl.replace(/\/$/, '')}/api/track-${purpose}/${encodeURIComponent(jobId)}?token=${encodeURIComponent(token)}`;
}
module.exports = { sign, verify, resumeLink, trackingLink };
