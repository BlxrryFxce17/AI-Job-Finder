const mongoose = require('mongoose');

const profileSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  name: { type: String, default: '' },
  title: { type: String, default: '' },
  phone: { type: String, default: '' },
  linkedin: { type: String, default: '' },
  github: { type: String, default: '' },
  portfolio: { type: String, default: '' },
  githubToken: { type: String, default: '' },
  resumeText: { type: String, default: '' },
  resumePdf: { type: Buffer },
  skills: { type: [String], default: [] },
  achievements: { type: [String], default: [] },
  experienceLevel: { type: String, default: '' },
  tone: { type: String, default: 'Professional' },
  enableFlex: { type: Boolean, default: true },
  enableAutoFollowUp: { type: Boolean, default: true },
  aiInstructions: { type: String, default: '' },
  resumeFilename: { type: String, default: '' },
  githubRepoLinkCount: { type: Number, default: 2 },
  selectedRepoNames: [{ type: String }],
  githubInsights: {
    username: { type: String, default: '' },
    avatarUrl: { type: String, default: '' },
    bio: { type: String, default: '' },
    publicRepos: { type: Number, default: 0 },
    followers: { type: Number, default: 0 },
    totalStars: { type: Number, default: 0 },
    topLanguages: [{ type: String }],
    repos: [{
      name: { type: String },
      description: { type: String },
      language: { type: String },
      stars: { type: Number, default: 0 },
      forks: { type: Number, default: 0 },
      topics: [{ type: String }],
      url: { type: String },
      readmeSnippet: { type: String, default: '' },
      updatedAt: { type: Date }
    }],
    lastSyncedAt: { type: Date }
  }
});

module.exports = mongoose.model('Profile', profileSchema);
