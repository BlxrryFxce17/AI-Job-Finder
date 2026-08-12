const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true },
    name: { type: String },
    googleRefreshToken: { type: String, default: '' },
    googleAccessToken: { type: String, default: '' },
    googleTokenExpiry: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// Indexes (email already has unique index from unique: true)
userSchema.index({ googleRefreshToken: 1 });

module.exports = mongoose.model('User', userSchema);
