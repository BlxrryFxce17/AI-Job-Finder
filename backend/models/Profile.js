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
  workExperience: [{
    company: { type: String, default: '' },
    title: { type: String, default: '' },
    location: { type: String, default: '' },
    startDate: { type: String, default: '' },
    endDate: { type: String, default: '' },
    isCurrent: { type: Boolean, default: false },
    description: { type: String, default: '' }
  }],
  education: [{
    institution: { type: String, default: '' },
    degree: { type: String, default: '' },
    fieldOfStudy: { type: String, default: '' },
    startYear: { type: String, default: '' },
    endYear: { type: String, default: '' },
    grade: { type: String, default: '' }
  }],
  tone: { type: String, default: 'Professional' },
  enableFlex: { type: Boolean, default: true },
  enableAutoFollowUp: { type: Boolean, default: true },
  aiInstructions: { type: String, default: '' },
  resumeFilename: { type: String, default: '' },
  fatherName: { type: String, default: '' },
  preferredName: { type: String, default: '' },
  addressLine1: { type: String, default: '' },
  city: { type: String, default: '' },
  state: { type: String, default: '' },
  postalCode: { type: String, default: '' },
  country: { type: String, default: 'India' },
  authorizedToWork: { type: Boolean, default: true },
  requireSponsorship: { type: Boolean, default: false },
  formerEmployee: { type: Boolean, default: false },
  learnedRules: [{
    fieldKey: { type: String, required: true },
    domain: { type: String, default: '*' },
    value: { type: String, default: '' },
    updatedAt: { type: Date, default: Date.now }
  }],
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
