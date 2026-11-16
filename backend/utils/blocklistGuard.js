const Blocklist = require('../models/Blocklist');
async function enforceBlocklist(userId, recipient) {
  const email = recipient.trim().toLowerCase();
  const blocked = await Blocklist.findOne({ userId, $or: [{ type: 'email', value: email }, { type: 'domain', value: email.split('@')[1] }] });
  if (blocked) throw new Error(`Email send aborted: "${email}" is on your personal blocklist.`);
}
module.exports = { enforceBlocklist };
