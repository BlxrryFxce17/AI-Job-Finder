const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET; // Remove fallback to enforce security

const requireAuth = (req, res, next) => {
  if (!JWT_SECRET) {
    console.error('CRITICAL: JWT_SECRET is not set in environment variables!');
    return res.status(500).json({ error: 'Server misconfiguration' });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'No authorization header' });
  
  const token = authHeader.split(' ')[1];
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

module.exports = requireAuth;
