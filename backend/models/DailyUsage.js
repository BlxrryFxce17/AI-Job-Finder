const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, required: true },
  day: { type: String, required: true },
  email: { type: Number, default: 0 },
  ai: { type: Number, default: 0 }
});
schema.index({ userId: 1, day: 1 }, { unique: true });
module.exports = mongoose.model('DailyUsage', schema);
