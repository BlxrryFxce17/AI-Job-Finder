const mongoose = require('mongoose');

const jobSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  sentAt: { type: Date },
  id: { type: String, required: true },
  company: { type: String, default: 'Unknown Company' },
  role: { type: String, default: 'General Position' },
  jd: { type: String, default: '' },
  status: { type: String, default: 'Found' },
  applyLink: { type: String, default: '' },
  location: { type: String, default: '' },
  emailDraft: { type: String, default: '' },
  emailRecipient: { type: String, default: '' },
  failedEmails: { type: [String], default: [] },
  publishedAt: { type: Date, default: Date.now },
  tracked: { type: Boolean, default: false },
  clickedLinks: [String],
  followUps: [{
    draft: String,
    day: Number,
    sent: { type: Boolean, default: false }
  }],
  source: { type: String, default: 'Manual' }
}, { timestamps: true });

module.exports = mongoose.model('Job', jobSchema);
