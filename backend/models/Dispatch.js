const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  key: { type: String, required: true },
  jobId: String,
  recipient: String,
  subject: String,
  kind: { type: String, default: 'outreach' },
  state: { type: String, enum: ['preparing', 'submitting', 'sent', 'failed', 'unknown'], default: 'preparing' },
  rfcMessageId: String,
  messageId: String,
  threadId: String,
  error: String,
  quotaDay: String,
  quotaReserved: { type: Boolean, default: false },
  lease: String,
  leaseUntil: Date,
  sentAt: Date
}, { timestamps: true });
schema.index({ userId: 1, key: 1 }, { unique: true });
schema.index({ userId: 1, createdAt: -1 });
module.exports = mongoose.model('Dispatch', schema);
