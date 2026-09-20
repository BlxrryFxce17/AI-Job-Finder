const mongoose = require('mongoose');

const apiUsageSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false,
    index: true
  },
  service: {
    type: String,
    required: true,
    enum: ['Groq', 'Gemini', 'Tavily', 'Hunter', 'Adzuna', 'JSearch', 'Serper', 'Apify'],
    index: true
  },
  action: {
    type: String,
    default: 'General',
    index: true
  },
  model: {
    type: String,
    default: ''
  },
  promptTokens: {
    type: Number,
    default: 0
  },
  completionTokens: {
    type: Number,
    default: 0
  },
  totalTokens: {
    type: Number,
    default: 0
  },
  creditsUsed: {
    type: Number,
    default: 1
  },
  status: {
    type: String,
    enum: ['success', 'failed', 'fallback'],
    default: 'success'
  },
  meta: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: true
});

apiUsageSchema.index({ createdAt: -1 });
apiUsageSchema.index({ service: 1, createdAt: -1 });

module.exports = mongoose.model('ApiUsage', apiUsageSchema);
