const disciplines = {
  software: /\b(software|developer|programmer|full.?stack|front.?end|back.?end|web|python|javascript|typescript|react|node\.?js|java|\.net|devops|data engineer|data scien|machine learning|qa|sdet|cybersecurity)\b/i,
  mechanical: /\b(mechanical|automotive|manufacturing|cad|solidworks|hvac|piping|thermodynamics)\b/i,
  civil: /\b(civil|structural|construction|water treatment|water solutions|site engineer|quantity survey)\b/i,
  electrical: /\b(electrical|power systems|power electronics|electrical design|renewable energy|solar|wind turbine|energy systems)\b/i,
  chemical: /\b(chemical|process engineer|petrochemical|chemistry)\b/i
};
function scoreJob(job, profile) {
  const background = `${profile.title || ''} ${(profile.skills || []).join(' ')} ${(profile.workExperience || []).map(w => w.title).join(' ')}`;
  const title = job.role || '';
  const text = `${title} ${job.jd || ''}`;
  const profileDomains = Object.entries(disciplines).filter(([, regex]) => regex.test(background)).map(([name]) => name);
  let jobDomains = Object.entries(disciplines).filter(([, regex]) => regex.test(title)).map(([name]) => name);
  if (!jobDomains.length) jobDomains = Object.entries(disciplines).filter(([, regex]) => regex.test(job.jd || '')).map(([name]) => name);
  // Only exclude clear, conflicting disciplines. A generic trainee title alone is not enough.
  const mismatch = profileDomains.length > 0 && jobDomains.length > 0 && !jobDomains.some(d => profileDomains.includes(d));
  const skills = (profile.skills || []).filter(skill => typeof skill === 'string' && skill.trim()).filter(skill => {
    const escaped = skill.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:$|[^a-z0-9])`, 'i').test(text);
  });
  const sameDomain = jobDomains.some(d => profileDomains.includes(d));
  const score = mismatch ? 10 : Math.min(100, 40 + (sameDomain ? 35 : 0) + skills.length * 8);
  const reason = mismatch ? `Role is in ${jobDomains.join(', ')}; your saved background is ${profileDomains.join(', ')}.` : skills.length ? `Matches saved skills: ${skills.slice(0, 5).join(', ')}.` : sameDomain ? 'Role matches your saved professional discipline.' : 'Not enough information for a confident discipline match.';
  return { score, excluded: mismatch && profile.excludeUnrelatedJobs !== false, reason, matchedSkills: skills, profileDomains, jobDomains };
}
module.exports = { scoreJob };
