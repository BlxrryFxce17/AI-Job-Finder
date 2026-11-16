// Retain unsuccessful profiles as soft-deleted identity records so searches
// cannot recreate them. Queued lookups and temporary failures remain visible.
function noEmailFilter(userId) {
  return {
    userId,
    status: 'HR_Found',
    hrLinkedIn: { $exists: true, $ne: '' },
    emailRecipient: { $in: ['', null] },
    $or: [
      { 'hrEmailLookup.state': { $in: ['not_found', 'needs_employer', 'blocked'] } },
      { 'hrEmailLookup.state': 'failed', 'hrEmailLookup.attempts': { $gte: 3 } }
    ]
  };
}
function shouldExclude(job) {
  if (job.status !== 'HR_Found' || !job.hrLinkedIn || job.emailRecipient?.trim()) return false;
  return ['not_found', 'needs_employer', 'blocked'].includes(job.hrEmailLookup?.state)
    || (job.hrEmailLookup?.state === 'failed' && job.hrEmailLookup.attempts >= 3);
}
module.exports = { noEmailFilter, shouldExclude };
