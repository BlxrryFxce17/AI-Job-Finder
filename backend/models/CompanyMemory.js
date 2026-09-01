const mongoose = require('mongoose');

const companyMemorySchema = new mongoose.Schema({
  companyKey: { type: String, required: true, unique: true, index: true }, // Lowercase alphanumeric key
  displayName: { type: String, default: '' },
  verifiedDomain: { type: String, default: '' },
  deadDomains: { type: [String], default: [] },
  learnedPattern: { type: String, default: '' }, // 'first.last', 'firstlast', 'f.last', 'first', etc.
  patternConfidence: { type: Number, default: 50 }, // 0 to 100
  successfulRecipients: { type: [String], default: [] },
  bouncedRecipients: { type: [String], default: [] },
  totalSent: { type: Number, default: 0 },
  totalOpened: { type: Number, default: 0 },
  totalBounced: { type: Number, default: 0 }
}, { timestamps: true });

module.exports = mongoose.model('CompanyMemory', companyMemorySchema);
