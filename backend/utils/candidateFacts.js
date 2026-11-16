function evidence(profile) {
  const projects = (profile.githubInsights?.repos || []).filter(r => r.name && r.description).slice(0, 2).map(r => `${r.name}: ${r.description}`);
  const achievements = (profile.achievements || []).filter(Boolean).slice(0, 2);
  return [...projects, ...achievements].join(' ');
}
function factualOutreach(profile, company, role, hrName) {
  const greeting = hrName ? `Hi ${hrName.trim().split(/\s+/)[0]},` : `Hi ${company} Team,`;
  const skills = (profile.skills || []).filter(Boolean).slice(0, 4).join(', ');
  const facts = evidence(profile);
  return `${greeting}\n\nI'm interested in the ${role} role at ${company}.${skills ? ` My listed skills include ${skills}.` : ''}${facts ? `\n\n${facts}` : ''}\n\nWould you be open to discussing whether my background fits the role?`;
}
function reviewWarnings(text, profile) {
  const warnings = [];
  if (!profile.name) warnings.push('Add your name to your profile.');
  if (!profile.skills?.length) warnings.push('No confirmed skills are saved.');
  if (/\d+(?:\.\d+)?\s*%|\b\d+[kKmM]\b/.test(text)) warnings.push('Check every metric against your actual experience.');
  if (/immediately|notice period|available|salary|compensation/i.test(text)) warnings.push('Confirm availability and compensation statements before sending.');
  if (/\[[^\]]+\](?!\()/.test(text)) warnings.push('Check for unfilled placeholders.');
  return warnings;
}
module.exports = { evidence, factualOutreach, reviewWarnings };
