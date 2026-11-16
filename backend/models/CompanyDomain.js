const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, required: true },
  companyKey: { type: String, required: true },
  company: { type: String, required: true },
  domain: { type: String, required: true },
  aliases: [String],
  source: { type: String, enum: ['user', 'job-page'], required: true },
  evidenceUrl: String
}, { timestamps: true });
schema.index({ userId: 1, companyKey: 1 }, { unique: true });
module.exports = mongoose.model('CompanyDomain', schema);
