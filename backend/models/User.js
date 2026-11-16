const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  deleting: { type: Boolean, default: false },
  controls: {
    dailyEmailLimit: { type: Number, default: 25, min: 0, max: 200 },
    dailyAiLimit: { type: Number, default: 50, min: 0, max: 1000 },
    paused: { type: Boolean, default: false },
    quietStart: { type: String, default: '' },
    quietEnd: { type: String, default: '' },
    timezone: { type: String, default: 'Asia/Kolkata' },
    followUpDays: { type: [Number], default: [3, 6] },
    autoFollowUp: { type: Boolean, default: false }
  },
  email: { type: String, required: true, unique: true },
  name: { type: String },
  googleRefreshToken: { type: String, default: '' },
  googleAccessToken: { type: String, default: '' },
  googleTokenExpiry: { type: Number, default: 0 },
  gmailAppPassword: { type: String, default: '' }
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
