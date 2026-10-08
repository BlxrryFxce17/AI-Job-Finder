const mongoose = require('mongoose');

const blocklistSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  value: { type: String, required: true },
  type: { type: String, enum: ['email', 'domain'], required: true },
  reason: { type: String, default: 'Manual block' },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Blocklist', blocklistSchema);
