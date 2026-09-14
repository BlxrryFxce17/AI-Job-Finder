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

// Remove email sign-off and trailing names
export function stripSignOff(text, profile = {}) {
  if (!text || typeof text !== 'string') return '';
  let cleaned = text.trim();

  // 1. Remove closing valedictions (e.g. "Best regards,", "Sincerely,")
  cleaned = cleaned.replace(
    /(?:\r?\n\s*)+(?:Yours\s+(?:Sincerely|Faithfully|Truly)|Sincerely|Best\s+regards|Warm\s+regards|Kind\s+regards|With\s+(?:warm\s+|kind\s+)?regards|Regards|Best|Cheers|Warmly|Respectfully|Cordially|Many\s+thanks|With\s+thanks|Thank\s+you|Thanks|Talk\s+soon|Best\s+wishes)\b[,.\s!]*[\s\S]*$/i,
    ''
  ).trim();

  // 2. Remove trailing name placeholders (e.g. "[Your Name]")
  cleaned = cleaned.replace(
    /(?:\r?\n\s*)+(?:\[(?:Your\s+|Candidate\s+|Applicant\s+|My\s+|Insert\s+)?(?:Full\s+|First\s+)?Name\]|(?:Your|Candidate|Applicant)\s+Name)[\s\S]*$/i,
    ''
  ).trim();

  // 3. Remove candidate name if printed on its own trailing line
  if (profile && profile.name && profile.name.trim().length >= 2) {
    const escapedName = profile.name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const trailingNameRegex = new RegExp(`(?:\\r?\\n\\s*)+(?:${escapedName})[,.\\s]*$`, 'i');
    cleaned = cleaned.replace(trailingNameRegex, '').trim();
  }

  return cleaned;
}

// Clean draft text of markdown artifacts and placeholders
export function cleanDraftText(text, profile = {}, options = {}) {
  if (!text) return '';
  const { includeSignature = true, company = '', role = '', preserveMarkdownLinks = false } = options;
  let cleaned = String(text);

  // 1. Remove bold formatting (**text**)
  cleaned = cleaned.replace(/\*\*(.*?)\*\*/g, '$1');
  cleaned = cleaned.replace(/__(.*?)__/g, '$1');

  // 2. Normalize bullet points
  cleaned = cleaned.replace(/^([ \t]*)[*+-][ \t]+/gm, '$1• ');

  // 3. Remove italic markers
  cleaned = cleaned.replace(/(?<!\w)\*([^*\n]+)\*(?!\w)/g, '$1');
  cleaned = cleaned.replace(/(?<!\w)_([^_\n]+)_(?!\w)/g, '$1');

  // 4. Remove stray asterisks
  cleaned = cleaned.replace(/\*\*/g, '');
  cleaned = cleaned.replace(/(^|[^\w])\*(?=[^\w]|$)/g, '$1');

  // 5. Replace bracket placeholders with profile info
  const loc = (profile && profile.location) || 'India';
  const github = (profile && profile.github) || '';
  const linkedin = (profile && profile.linkedin) || '';
  const portfolio = getEffectivePortfolio(profile);
  const candName = (profile && profile.name) || 'Akash V';
  const phone = (profile && profile.phone) || '';
  const title = (profile && profile.title) || '';

  // Name
  cleaned = cleaned.replace(/\[(?:Your\s+|Candidate\s+|Applicant\s+|My\s+|Insert\s+)?(?:Full\s+|First\s+)?Name\]/gi, candName);
  cleaned = cleaned.replace(/\b\[Your\s+Name\]\b/gi, candName);

  // Location
  cleaned = cleaned.replace(/\[(?:Your\s+)?(?:City|Location)(?:,\s*Country)?\]/gi, loc);

  // Portfolio / Website
  if (portfolio) {
    cleaned = cleaned.replace(/\[(?:Link\s+to\s+)?(?:Portfolio|Website|Portfolio\s+Website)(?:\s+URL)?\]/gi, portfolio);
  } else {
    cleaned = cleaned.replace(/\[(?:Link\s+to\s+)?(?:Portfolio|Website|Portfolio\s+Website)(?:\s+URL)?\]/gi, '');
  }

  // GitHub
  if (github) {
    cleaned = cleaned.replace(/\[(?:Link\s+to\s+)?GitHub\]/gi, github);
  } else {
    cleaned = cleaned.replace(/\[(?:Link\s+to\s+)?GitHub\]/gi, '');
  }

  // LinkedIn
  if (linkedin) {
    cleaned = cleaned.replace(/\[(?:Link\s+to\s+)?LinkedIn\]/gi, linkedin);
  } else {
    cleaned = cleaned.replace(/\[(?:Link\s+to\s+)?LinkedIn\]/gi, '');
  }

  // Phone
  if (phone) {
    cleaned = cleaned.replace(/\[(?:Your\s+|My\s+)?Phone(?:\s+Number)?\]/gi, phone);
  } else {
    cleaned = cleaned.replace(/\[(?:Your\s+|My\s+)?Phone(?:\s+Number)?\]/gi, '');
  }

  // Title
  if (title) {
    cleaned = cleaned.replace(/\[(?:Your\s+|Current\s+)?(?:Job\s+Title|Title|Position)\]/gi, title);
  }

  // Company / Role
  if (company && typeof company === 'string' && company.toLowerCase() !== 'unknown company') {
    cleaned = cleaned.replace(/\[(?:Target\s+)?Company(?:\s+Name)?\]/gi, company);
  }
  if (role && typeof role === 'string' && role.toLowerCase() !== 'general position') {
    cleaned = cleaned.replace(/\[(?:Target\s+)?(?:Job\s+Title|Role|Position)\]/gi, role);
  }

  // Other bracket placeholders
  cleaned = cleaned.replace(/\[(?:Insert|Link\s+to)\s+[^\]]+\]/gi, '');

  // 6. Handle markdown and bare links
  if (preserveMarkdownLinks) {
    // Clean any bare GitHub URLs to markdown links so modal and HTML renderers format them cleanly
    cleaned = cleaned.replace(/(?<!\]\()https?:\/\/(?:www\.)?github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)(?![^)]*\))/gi, (match, owner, repo) => {
      const cleanRepo = repo.replace(/[.,;!?)]+$/, '');
      return `[${cleanRepo}](https://github.com/${owner}/${cleanRepo})`;
    });
  } else {
    // Convert markdown links [Label](URL) to plain text
    cleaned = cleaned.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (match, label, url) => {
      const trimmedLabel = label.trim();
      const cleanUrl = url.trim().replace(/\/$/, '');
      const ghRepoMatch = cleanUrl.match(/^https?:\/\/(?:www\.)?github\.com\/([^/]+)\/([^/]+)\/?$/i);
      if (ghRepoMatch) {
        return `${trimmedLabel} (github.com/${ghRepoMatch[1]}/${ghRepoMatch[2]})`;
      }
      return `${trimmedLabel} (${cleanUrl})`;
    });

    // Clean any remaining bare GitHub URLs for plain text display
    cleaned = cleaned.replace(/https?:\/\/(?:www\.)?github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)/gi, (match, owner, repo) => {
      const cleanRepo = repo.replace(/[.,;!?)]+$/, '');
      return `${cleanRepo} (github.com/${owner}/${cleanRepo})`;
    });
  }

  // 7. Remove brackets around words e.g. [AI Job Finder] -> AI Job Finder
  cleaned = cleaned.replace(/\[([A-Za-z0-9\s._-]+)\](?!\()/g, '$1');

  // 8. Strip trailing sign-off before signature check
  cleaned = stripSignOff(cleaned, profile);

  // 9. Append standard signature if requested
  if (includeSignature && profile && (profile.name || profile.github || profile.linkedin || portfolio)) {
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

// Clean follow-up draft and omit signature
export function cleanFollowUpDraft(text, profile = {}, company = '', role = '') {
  return cleanDraftText(text, profile, { includeSignature: false, company, role });
}

