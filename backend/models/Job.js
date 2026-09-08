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
  hrName: { type: String, default: '' },
  hrLinkedIn: { type: String, default: '' },
  failedEmails: { type: [String], default: [] },
  publishedAt: { type: Date, default: Date.now },
  tracked: { type: Boolean, default: false },
  clickedLinks: [String],
  followUps: [{
    draft: String,
    day: Number,
    sent: { type: Boolean, default: false }
  }],
  source: { type: String, default: 'Manual' },
  experienceLevel: { type: String, default: '' },
  salary: { type: String, default: '' },
  recruiterEmail: { type: String, default: '' },
  matchedThreadId: { type: String, default: '' },
  lastRepliedAt: { type: Date },
  deliverabilityScore: { type: Number, default: 0 },
  deliverabilityStatus: { type: String, default: 'unverified' }, // 'deliverable', 'risky', 'undeliverable', 'unverified'
  deliverabilityReason: { type: String, default: '' },
  isDeleted: { type: Boolean, default: false },
  deletedAt: { type: Date }
}, { timestamps: true });

// Compound indexes for lightning-fast querying and sorting
jobSchema.index({ userId: 1, isDeleted: 1 });
jobSchema.index({ userId: 1, createdAt: -1 });
jobSchema.index({ userId: 1, status: 1 });
jobSchema.index({ userId: 1, emailRecipient: 1 });
jobSchema.index({ userId: 1, company: 1, role: 1, isDeleted: 1 });
jobSchema.index({ id: 1 });

module.exports = mongoose.model('Job', jobSchema);
