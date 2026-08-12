const mongoose = require('mongoose');

const profileSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  name: { type: String, default: '' },
  title: { type: String, default: '' },
  phone: { type: String, default: '' },
  linkedin: { type: String, default: '' },
  github: { type: String, default: '' },
  resumeText: { type: String, default: '' },
  resumePdf: { type: Buffer },
  resumeFilename: { type: String, default: '' },
  skills: { type: [String], default: [] },
  achievements: { type: [String], default: [] },
  experienceLevel: { type: String, default: '' },
  tone: { type: String, default: 'Professional' },
  enableFlex: { type: Boolean, default: true },
  aiInstructions: { type: String, default: '' },
  emailUser: { type: String, default: '' }
}, { timestamps: true });

module.exports = mongoose.model('Profile', profileSchema);