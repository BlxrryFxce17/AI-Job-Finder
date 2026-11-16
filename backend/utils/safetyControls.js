const User = require('../models/User');
const DailyUsage = require('../models/DailyUsage');
const context = require('./requestContext');
const defaults = { dailyEmailLimit: 25, dailyAiLimit: 50, paused: false, quietStart: '', quietEnd: '', timezone: 'Asia/Kolkata', followUpDays: [3, 6], autoFollowUp: false };
function controlsFor(user) { return { ...defaults, ...(user?.controls?.toObject ? user.controls.toObject() : user?.controls || {}) }; }
function localDay(timezone, now = new Date()) {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  return ['year', 'month', 'day'].map(type => p.find(part => part.type === type).value).join('-');
}
function inQuietHours(controls, now = new Date()) {
  if (!controls.quietStart || !controls.quietEnd || controls.quietStart === controls.quietEnd) return false;
  const clock = new Intl.DateTimeFormat('en-GB', { timeZone: controls.timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now);
  return controls.quietStart < controls.quietEnd ? clock >= controls.quietStart && clock < controls.quietEnd : clock >= controls.quietStart || clock < controls.quietEnd;
}
async function getActiveUser(userId) {
  const user = await User.findById(userId);
  if (!user || user.deleting) throw Object.assign(new Error('Account is unavailable'), { status: 403 });
  return user;
}
async function reserveUsage(userId, kind) {
  if (!userId) throw new Error('An authenticated account is required');
  if (!['email', 'ai'].includes(kind)) throw new Error('Invalid usage category');
  const user = await getActiveUser(userId);
  const controls = controlsFor(user);
  if (kind === 'email' && controls.paused) throw Object.assign(new Error('Sending is paused. Resume it in Safety & activity.'), { status: 409 });
  if (kind === 'email' && inQuietHours(controls)) throw Object.assign(new Error('Sending is paused during your quiet hours.'), { status: 409 });
  const day = localDay(controls.timezone);
  await DailyUsage.init();
  try { await DailyUsage.updateOne({ userId, day }, { $setOnInsert: { email: 0, ai: 0 } }, { upsert: true }); } catch (err) { if (err.code !== 11000) throw err; }
  const limit = controls[kind === 'email' ? 'dailyEmailLimit' : 'dailyAiLimit'];
  const result = await DailyUsage.findOneAndUpdate({ userId, day, [kind]: { $lt: limit } }, { $inc: { [kind]: 1 } }, { new: true });
  if (!result) throw Object.assign(new Error(`Daily ${kind === 'email' ? 'email' : 'AI request'} limit reached (${limit}).`), { status: 429 });
  return { day, controls };
}
async function reserveAI(userId) { return reserveUsage(userId || context.getStore()?.userId, 'ai'); }
module.exports = { defaults, controlsFor, localDay, inQuietHours, reserveUsage, reserveAI, getActiveUser };
