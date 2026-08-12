const mongoose = require('mongoose');

const jobSchema = new mongoose.Schema(
  {
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
    followUps: [
      {
        draft: String,
        day: Number,
        sent: { type: Boolean, default: false },
      },
    ],
  },
  { timestamps: true }
);

// Compound indexes for common query patterns
jobSchema.index({ userId: 1, status: 1 });
jobSchema.index({ userId: 1, publishedAt: -1 });
jobSchema.index({ userId: 1, createdAt: -1 });
jobSchema.index({ userId: 1, company: 1, role: 1 });
jobSchema.index({ id: 1, userId: 1 });
jobSchema.index({ emailRecipient: 1 });
jobSchema.index({ sentAt: 1 });
jobSchema.index({ tracked: 1 });
jobSchema.index({ 'followUps.day': 1, 'followUps.sent': 1 });

module.exports = mongoose.model('Job', jobSchema);
