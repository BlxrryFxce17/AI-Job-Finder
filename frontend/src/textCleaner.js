export function getEffectivePortfolio(profile) {
  if (!profile) return '';
  if (profile.portfolio && typeof profile.portfolio === 'string' && profile.portfolio.trim()) {
    let p = profile.portfolio.trim();
    if (!/^https?:\/\//i.test(p)) p = `https://${p}`;
    return p;
  }
  if (profile.resumeText) {
    const kwMatch = profile.resumeText.match(/(?:portfolio|website|site|web|link|live)\s*[:\-–]\s*(?:https?:\/\/)?([a-zA-Z0-9][-a-zA-Z0-9]*\.[a-zA-Z0-9_.\/:-]+)/i);
    if (kwMatch) {
      let url = kwMatch[1].trim().replace(/[,;)\]]+$/, '');
      if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
      if (!/@|linkedin\.com|twitter\.com|x\.com/i.test(url)) return url;
    }
    const domainMatch = profile.resumeText.match(/(?<!@)\b(?:https?:\/\/)?((?:www\.)?[a-zA-Z0-9-]+\.(?:dev|me|io|app|site|vercel\.app|netlify\.app|pages\.dev|github\.io)(?:\/[^\s,;)]*)?)\b/i);
    if (domainMatch) {
      let url = domainMatch[1].trim().replace(/[,;)\]]+$/, '');
      if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
      if (!/@|linkedin\.com|twitter\.com|x\.com/i.test(url)) return url;
    }
  }
  let ghUser = profile.githubInsights?.username || '';
  if (!ghUser && profile.github) {
    const m = profile.github.match(/github\.com\/([a-zA-Z0-9_-]+)/i);
    if (m && m[1] && !['settings', 'pulls', 'issues', 'notifications'].includes(m[1].toLowerCase())) {
      ghUser = m[1];
    }
  }
  if (ghUser) return `https://${ghUser}.github.io`;
  return profile.github || '';
}

/**
 * Utility function to clean email drafts from raw markdown artifacts.
 * Strips raw bolding (**, __), standardizes bullet points, strips rogue asterisks,
 * and fills or removes bracket placeholders like [Your City, Country] or [Link to Portfolio].
 */
export function cleanDraftText(text, profile = {}) {
  if (!text) return '';
  let cleaned = String(text);

  // 1. Remove markdown bold **text** or __text__
  cleaned = cleaned.replace(/\*\*(.*?)\*\*/g, '$1');
  cleaned = cleaned.replace(/__(.*?)__/g, '$1');

  // 2. Convert bullet points like '* ', '- ', '+ ' at start of line to standard bullet '• '
  cleaned = cleaned.replace(/^([ \t]*)[*+-][ \t]+/gm, '$1• ');

  // 3. Remove single italic asterisks or underscores around words
  cleaned = cleaned.replace(/(?<!\w)\*([^*\n]+)\*(?!\w)/g, '$1');
  cleaned = cleaned.replace(/(?<!\w)_([^_\n]+)_(?!\w)/g, '$1');

  // 4. Strip any rogue double asterisks or stray asterisks
  cleaned = cleaned.replace(/\*\*/g, '');
  cleaned = cleaned.replace(/(^|[^\w])\*(?=[^\w]|$)/g, '$1');

  // 5. Clean up bracket placeholders using profile if provided
  const loc = (profile && profile.location) || 'India';
  const github = (profile && profile.github) || '';
  const linkedin = (profile && profile.linkedin) || '';
  const portfolio = getEffectivePortfolio(profile);

  cleaned = cleaned.replace(/\[(?:Your\s+)?(?:City|Location)(?:,\s*Country)?\]/gi, loc);
  if (portfolio) {
    cleaned = cleaned.replace(/\[(?:Link\s+to\s+)?(?:Portfolio|Website|Portfolio\s+Website)(?:\s+URL)?\]/gi, portfolio);
  } else {
    cleaned = cleaned.replace(/\[(?:Link\s+to\s+)?(?:Portfolio|Website|Portfolio\s+Website)(?:\s+URL)?\]/gi, 'available upon request');
  }
  if (github) {
    cleaned = cleaned.replace(/\[(?:Link\s+to\s+)?GitHub\]/gi, github);
  } else {
    cleaned = cleaned.replace(/\[(?:Link\s+to\s+)?GitHub\]/gi, 'available upon request');
  }
  cleaned = cleaned.replace(/\[(?:Your\s+)?Name\]/gi, (profile && profile.name) || 'Akash V');
  cleaned = cleaned.replace(/\[(?:Your\s+)?Phone(?:\s+Number)?\]/gi, (profile && profile.phone) || '');

  // 6. Clean up raw markdown links [Label](URL) so no bracketed markdown leaks into plain text or email
  cleaned = cleaned.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (match, label, url) => {
    const trimmedLabel = label.trim();
    const cleanUrl = url.trim().replace(/\/$/, '');
    const userGithub = (profile && profile.github ? profile.github.trim().replace(/\/$/, '') : '').toLowerCase();

    // Check if the URL is just the root github profile (e.g. https://github.com/BlxrryFxce17)
    if (userGithub && cleanUrl.toLowerCase() === userGithub) {
      // Check if label matches a project repo in profile, e.g. "AI Job Finder"
      const repos = (profile && profile.githubInsights && Array.isArray(profile.githubInsights.repos)) ? profile.githubInsights.repos : [];
      const matched = repos.find(r => 
        (r.name && r.name.toLowerCase().replace(/[-_]/g, ' ') === trimmedLabel.toLowerCase().replace(/[-_]/g, ' ')) ||
        (r.name && trimmedLabel.toLowerCase().includes(r.name.toLowerCase().replace(/[-_]/g, ' ')))
      );
      if (matched && matched.url) {
        return `${trimmedLabel} (${matched.url})`;
      }
      // If label looks like a project name, try slugifying to repo url
      if (/^[A-Za-z0-9\s_-]+$/.test(trimmedLabel) && trimmedLabel.length < 35) {
        const repoSlug = trimmedLabel.replace(/\s+/g, '-');
        return `${trimmedLabel} (${cleanUrl}/${repoSlug})`;
      }
      return trimmedLabel;
    }

    return `${trimmedLabel} (${cleanUrl})`;
  });

  // 7. Clean any stray brackets around words e.g. [AI Job Finder]
  cleaned = cleaned.replace(/\[([A-Za-z0-9\s._-]+)\](?!\()/g, '$1');

  // 8. Ensure signature is present and includes portfolio link
  if (profile && (profile.name || profile.github || profile.linkedin || portfolio)) {
    if (!cleaned.includes('Yours Sincerely')) {
      const links = [];
      if (linkedin) links.push(`LinkedIn: ${linkedin}`);
      if (github) links.push(`GitHub: ${github}`);
      if (portfolio) links.push(`Portfolio: ${portfolio}`);
      const phoneLine = profile.phone ? `📞 ${profile.phone}\n` : '';
      const linksLine = links.length > 0 ? links.join(' | ') : '';
      cleaned = `${cleaned.trim()}\n\nYours Sincerely,\n${profile.name || 'Akash V'}\n${profile.title || 'Software Developer'}\n${phoneLine}${linksLine}`;
    } else if (portfolio && !/portfolio/i.test(cleaned)) {
      if (/(?:GitHub|LinkedIn):[^\r\n]+/i.test(cleaned)) {
        cleaned = cleaned.replace(/((?:GitHub|LinkedIn):[^\r\n]+)/i, (m) => `${m} | Portfolio: ${portfolio}`);
      } else {
        cleaned = `${cleaned.trim()}\nPortfolio: ${portfolio}`;
      }
    }
  }

  return cleaned.trim();
}

