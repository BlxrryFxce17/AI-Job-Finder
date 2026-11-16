const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET; // Remove fallback to enforce security

const requireAuth = async (req, res, next) => {
  if (!JWT_SECRET) {
    console.error('CRITICAL: JWT_SECRET is not set in environment variables!');
    return res.status(500).json({ error: 'Server misconfiguration' });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'No authorization header' });
  
  if (typeof authHeader !== 'string' || !/^Bearer \S+$/i.test(authHeader)) return res.status(401).json({ error: 'Invalid authorization header' });
  const token = authHeader.split(' ')[1];
  try {
    const payload = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
    if (!payload || typeof payload.id !== 'string' || !/^[a-f0-9]{24}$/i.test(payload.id)) return res.status(401).json({ error: 'Invalid token identity' });
    const account = await require('../models/User').findOne({ _id: payload.id }).select('_id deleting');
    if (!account) return res.status(401).json({ error: 'Account is unavailable' });
    const deletingAccount = req.method === 'DELETE' && (req.originalUrl || req.url).split('?')[0].endsWith('/controls/account');
    if (account.deleting && !deletingAccount) return res.status(403).json({ error: 'Account deletion is in progress. Retry deletion to finish.' });
    req.user = payload;
    require('../utils/requestContext').run({ userId: payload.id }, next);
  } catch (err) {
    if (!['JsonWebTokenError', 'TokenExpiredError', 'NotBeforeError'].includes(err.name)) return next(err);
    res.status(401).json({ error: 'Invalid token' });
  }
};

module.exports = requireAuth;
