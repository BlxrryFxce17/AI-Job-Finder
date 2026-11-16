const mongoose = require('mongoose');

const jobSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  archiveBatch: String,
  sendSummary: { sentCount: Number, blockedCount: Number, failedCount: Number, partial: Boolean },
  recipientResults: [{ email: String, status: String, reason: String, messageId: String, threadId: String, rfcMessageId: String, sentAt: Date }],
  emailSubject: { type: String, default: '' },
  pipelineStage: { type: String, default: '' },
  pipelineError: { type: String, default: '' },
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
  allRecipients: [{
    email: { type: String, required: true },
    hrProfileKey: String,
  hrEvidence: { sourceTitle: String, score: Number, reasons: [String], source: String, sourceUrl: String, snippet: String, employerEvidence: String, currentEmployer: String, observedAt: Date, sourcePublishedAt: String, status: String, mode: String, query: String, requestedLocation: String, employerWebsite: String },
  hrEmailEvidence: { domain: String, email: String, method: String, sourceUrl: String, inferred: Boolean, personMatched: Boolean, mailboxConfirmed: Boolean, score: Number, reason: String, checkedAt: Date },
  hrEmailLookup: { state: String, attempts: { type: Number, default: 0 }, lease: String, leaseUntil: Date, retryAt: Date, error: String, checkedAt: Date, diagnostics: [String] },
  hrName: { type: String, default: '' },
    type: { type: String, default: 'inbox' },
    deliverabilityScore: { type: Number, default: 65 },
    status: { type: String, default: 'pending' },
    reason: String,
    sentAt: { type: Date }
  }],
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
  rfcMessageId: { type: String, default: '' },
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
jobSchema.index({ userId: 1, hrProfileKey: 1 }, { unique: true, partialFilterExpression: { hrProfileKey: { $type: 'string' } } });
jobSchema.index({ userId: 1, 'hrEmailLookup.state': 1 });

module.exports = mongoose.model('Job', jobSchema);
