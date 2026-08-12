const jwt = require('jsonwebtoken');
const config = require('../config');
const logger = require('../utils/logger');
const User = require('../models/User');

const requireAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No authorization header' });
    }
    
    const token = authHeader.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }
    
    const payload = jwt.verify(token, config.jwtSecret);
    
    // Optional: verify user still exists
    const user = await User.findById(payload.id).select('-googleRefreshToken -googleAccessToken');
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }
    
    req.user = payload;
    req.userDoc = user;
    next();
  } catch (err) {
    logger.warn('Auth error', { error: err.message });
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token' });
    }
    res.status(401).json({ error: 'Authentication failed' });
  }
};

module.exports = { requireAuth };