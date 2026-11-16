const crypto = require('node:crypto');
const Dispatch = require('../models/Dispatch');
const { reserveUsage, getActiveUser, controlsFor, inQuietHours, localDay } = require('./safetyControls');

function validateEnvelope(user, mail) {
  if (!user || !(user._id || user.id)) throw new Error('An authenticated sender is required.');
  if (typeof mail.to !== 'string' || !/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(mail.to.trim()) || mail.cc || mail.bcc) throw new Error('Send exactly one recipient per email without CC or BCC.');
  if (typeof mail.subject !== 'string' || !mail.subject.trim() || /[\r\n]/.test(mail.subject)) throw new Error('A valid subject is required');
  if (!mail.text?.trim()) throw new Error('Email body is required');
  if (/attach(?:ed|ing)?\s+(?:my |the |a |your )?(?:resume|cv)|(?:resume|cv)\s+(?:is )?attached/i.test(mail.text) && !mail.attachments?.length) throw new Error('Upload a resume or remove the statement that it is attached.');
  const placeholders = require('./draftPlaceholders').unresolvedPlaceholders(mail.text);
  if (placeholders.length) throw new Error(`Draft has unresolved fields: ${placeholders.join(', ')}. Add those details to your profile or draft.`);
  if (/^re:/i.test(mail.subject) && (!mail.threadId || !/^<[^<>\s]+@[^<>\s]+>$/.test(mail.inReplyTo || '') || !mail.references)) throw new Error('Replies require the original thread and RFC message headers.');
}
function fingerprint(mail, options) {
  // Explicit keys identify an application or a follow-up even when its text is edited.
  const identity = options.idempotencyKey || [mail.to.toLowerCase().trim(), mail.subject.trim(), mail.text.trim(), mail.inReplyTo || ''].join('\n');
  return crypto.createHash('sha256').update(identity).digest('hex');
}
function createDispatcher({ Model = Dispatch, reserve = reserveUsage, activeUser = getActiveUser } = {}) {
  return async function dispatch(user, mail, options, transport) {
    validateEnvelope(user, mail);
    const userId = user._id || user.id;
    const account = await activeUser(userId);
    await Model.init();
    const key = fingerprint(mail, options);
    const lease = crypto.randomUUID();
    let record;
    try {
      record = await Model.create({ userId, key, lease, leaseUntil: new Date(Date.now() + 10 * 60_000), recipient: mail.to.trim(), subject: mail.subject, jobId: options.jobId, kind: options.kind || 'outreach', rfcMessageId: `<${crypto.randomUUID()}@${user.email?.split('@')[1] || 'mail.local'}>` });
    } catch (err) {
      if (err.code !== 11000) throw err;
      const existing = await Model.findOne({ userId, key });
      if (existing?.state === 'sent') return { messageId: existing.messageId, threadId: existing.threadId, rfcMessageId: existing.rfcMessageId, alreadySent: true };
      record = await Model.findOneAndUpdate({ userId, key, $or: [{ state: 'failed' }, { state: 'preparing', leaseUntil: { $lt: new Date() } }] }, { $set: { state: 'preparing', lease, leaseUntil: new Date(Date.now() + 10 * 60_000), error: '' } }, { new: true });
      if (!record) throw Object.assign(new Error('This email is already sending or has an uncertain delivery outcome. Check Safety & activity before retrying.'), { status: 409 });
    }
    const filter = { _id: record._id, userId, lease };
    let submitting = false;
    mail.messageId = record.rfcMessageId;
    try {
      if (!record.quotaReserved || record.quotaDay !== localDay(controlsFor(account).timezone)) {
        const reservation = await reserve(userId, 'email');
        await Model.updateOne(filter, { $set: { quotaReserved: true, quotaDay: reservation.day } });
      }
      const info = await transport(user, mail, { ...options, beforeSubmit: async () => {
        // Recheck the global pause immediately before the irreversible operation.
        const current = await activeUser(userId);
        const controls = controlsFor(current);
        if (controls.paused || inQuietHours(controls)) throw new Error('Sending is paused');
        const changed = await Model.updateOne({ ...filter, state: { $in: ['preparing', 'submitting'] } }, { $set: { state: 'submitting' } });
        if (!changed.modifiedCount && !changed.matchedCount) throw new Error('Dispatch claim expired');
        submitting = true;
        await options.onState?.('sending');
      } });
      await Model.updateOne(filter, { $set: { state: 'sent', messageId: info.messageId, threadId: info.threadId, sentAt: new Date(), error: '' } });
      return { ...info, rfcMessageId: record.rfcMessageId };
    } catch (err) {
      await Model.updateOne(filter, { $set: { state: submitting ? 'unknown' : 'failed', error: err.message } }).catch(() => {});
      if (submitting) throw new Error('Delivery outcome is uncertain. Check sent mail in Safety & activity before retrying.');
      throw err;
    }
  };
}
module.exports = { createDispatcher, validateEnvelope, fingerprint };
