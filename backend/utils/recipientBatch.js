function normalizeRecipients(recipients) {
  const seen = new Set();
  return (Array.isArray(recipients) ? recipients : []).map(r => typeof r === 'string' ? { email: r } : { ...r }).filter(r => {
    r.email = String(r.email || '').trim().toLowerCase();
    if (!r.email || seen.has(r.email)) return false;
    seen.add(r.email); return true;
  });
}
function blockSource(rule) {
  if (rule.source && rule.source !== 'legacy') return rule.source;
  if (/automatic.*bounc|bounc.*automatic/i.test(rule.reason || '')) return 'bounce';
  if (/manual/i.test(rule.reason || '')) return 'manual';
  return 'legacy';
}
function partitionRecipients(recipients, rules) {
  const allowed = [], blocked = [];
  for (const rec of normalizeRecipients(recipients)) {
    const domain = rec.email.split('@')[1];
    const rule = rules.find(r => r.value?.toLowerCase() === (r.type === 'email' ? rec.email : domain));
    if (rule) blocked.push({ email: rec.email, status: 'blocked', reason: rule.reason || 'Personal blocklist', source: blockSource(rule), blockedAt: rule.createdAt, ruleId: rule._id });
    else allowed.push(rec);
  }
  return { allowed, blocked };
}
async function runRecipientBatch(recipients, send, { blocked = [], paceMs = 1200, onResult = async () => {} } = {}) {
  const results = [...blocked];
  const persistenceWarnings = [];
  const normalized = normalizeRecipients(recipients);
  for (let index = 0; index < normalized.length; index++) {
    const rec = normalized[index];
    let result;
    try {
      const info = await send(rec, index);
      result = { email: rec.email, status: 'sent', ...info };
    } catch (err) {
      result = { email: rec.email, status: /uncertain|already sending/i.test(err.message) ? 'unknown' : /blocklist/i.test(err.message) ? 'blocked' : 'failed', reason: err.message };
    }
    results.push(result);
    // Persist each result independently; provider acceptance must survive a later failure.
    try { await onResult(result); } catch (err) { persistenceWarnings.push(`${result.email}: ${err.message}`); }
    if (index < normalized.length - 1 && paceMs) await new Promise(resolve => setTimeout(resolve, paceMs));
  }
  const sentCount = results.filter(r => r.status === 'sent').length;
  const blockedCount = results.filter(r => r.status === 'blocked').length;
  const failedCount = results.filter(r => ['failed', 'unknown'].includes(r.status)).length;
  return { results, persistenceWarnings, sentCount, blockedCount, failedCount, partial: sentCount > 0 && sentCount < results.length, success: sentCount > 0 };
}
module.exports = { normalizeRecipients, partitionRecipients, blockSource, runRecipientBatch };
