const express = require('express');
const router = express.Router();
const axios = require('axios');
const Job = require('../models/Job');
const User = require('../models/User');
const Profile = require('../models/Profile');
const requireAuth = require('../middleware/requireAuth');
const { callAIWithRetry } = require('../utils/ai');
const { sendEmailViaAPI, discoverEmailForJob, resolveCompanyDomain, getInboxReplies, verifyEmail, formatEmailTextToHtml, cleanDraftEmailText, stripSignOff, getEffectivePortfolio, buildSignatureLinks, buildPlainTextSignature, extractPortfolioUrl } = require('../utils/email');
const { findHROnLinkedIn } = require('../utils/scraper');
const { generateTailoredResumePDF } = require('../utils/pdfGenerator');

async function getProfile(userId, includePdf = false) {
  let query = Profile.findOne({ userId });
  if (!includePdf) {
    query = query.select('-resumePdf');
  }
  let profile = await query;
  if (!profile) {
    profile = new Profile({ userId });
    await profile.save();
  }
  if (profile && !profile.portfolio) {
    const eff = getEffectivePortfolio(profile);
    if (eff && !eff.includes('github.com/')) {
      profile.portfolio = eff;
      await Profile.updateOne({ _id: profile._id }, { $set: { portfolio: eff } }).catch(() => {});
    }
  }
  return profile;
}

// Attach user resume PDF to mail options if available
async function attachResumeToMailOptions(mailOptions, profile, userId) {
  if (!mailOptions.attachments) mailOptions.attachments = [];

  let resumeBuffer = profile?.resumePdf;
  let resumeFilename = profile?.resumeFilename || 'resume.pdf';

  // If resume buffer is not loaded, fetch directly from database
  if (!resumeBuffer && (userId || profile?.userId || profile?._id)) {
    const targetUserId = userId || profile?.userId || profile?._id;
    const fullProf = await Profile.findOne({ $or: [{ userId: targetUserId }, { _id: targetUserId }] }).select('resumePdf resumeFilename');
    if (fullProf && fullProf.resumePdf) {
      resumeBuffer = fullProf.resumePdf;
      resumeFilename = fullProf.resumeFilename || resumeFilename;
    }
  }

  if (resumeBuffer && resumeBuffer.length > 0) {
    const filename = resumeFilename.toLowerCase().endsWith('.pdf') ? resumeFilename : `${resumeFilename}.pdf`;
    mailOptions.attachments.push({
      filename,
      content: resumeBuffer,
      contentType: 'application/pdf'
    });
    console.log(`📎 [Email Dispatch] Attached user CV: "${filename}" (${(resumeBuffer.length / 1024).toFixed(1)} KB)`);
    return true;
  } else {
    console.warn(`⚠️ [Email Dispatch] No resume PDF found to attach for user: ${userId || profile?.userId}`);
    return false;
  }
}

// ── Intelligent JD-to-Repo Matching Engine ────────────────────────
// Extracts tech keywords from the JD, scores each repo for relevance,
// and returns a formatted string with the best-matched repos + deeper README context.
const TECH_KEYWORDS = [
  // Languages
  'javascript','typescript','python','java','go','golang','rust','ruby','php','swift',
  'kotlin','c++','c#','csharp','dart','scala','elixir','lua','r','zig','haskell','sql',
  // Frontend
  'react','vue','angular','svelte','next','nextjs','next.js','nuxt','gatsby','remix',
  'tailwind','css','html','sass','scss','webpack','vite','expo','react native',
  // Backend
  'node','nodejs','node.js','express','fastapi','flask','django','spring','rails',
  'laravel','gin','fiber','actix','nest','nestjs','graphql','rest','api','grpc',
  // Data / DB
  'postgres','postgresql','mysql','mongodb','mongo','redis','elasticsearch','opensearch',
  'dynamodb','supabase','firebase','prisma','sequelize','mongoose','sqlite','cassandra',
  // DevOps / Infra
  'docker','kubernetes','k8s','aws','gcp','azure','terraform','ci/cd','cicd',
  'github actions','jenkins','nginx','linux','serverless','lambda','vercel','netlify',
  // AI / ML
  'ai','ml','machine learning','deep learning','llm','gpt','openai','langchain',
  'transformer','pytorch','tensorflow','nlp','computer vision','gemini','groq',
  // Mobile
  'mobile','ios','android','react native','flutter','expo','swiftui',
  // General
  'microservices','monorepo','full-stack','fullstack','backend','frontend','devops',
  'scraper','scraping','automation','bot','cli','saas','erp','crm','e-commerce',
  'real-time','realtime','websocket','socket','streaming','queue','kafka','rabbitmq'
];

function buildGitInsightText(profile, jd, role, company) {
  if (!profile.githubInsights || !Array.isArray(profile.githubInsights.repos) || profile.githubInsights.repos.length === 0) {
    return '';
  }

  const allRepos = (profile.githubInsights.repos || []).map(r => (r && r.toObject ? r.toObject() : r));
  const jdText = `${jd || ''} ${role || ''} ${company || ''}`.toLowerCase();

  // 1. Find which tech keywords appear in this JD
  const jdKeywords = TECH_KEYWORDS.filter(kw => {
    const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(?:^|[\\s,;/()\\-])${escaped}(?:[\\s,;/()\\-.]|$)`, 'i').test(jdText);
  });

  // 2. Score each repo against JD keywords
  const scoredRepos = allRepos.map(r => {
    const name = r.name || '';
    const repoUrl = r.url || (profile.github ? `${profile.github.replace(/\/$/, '')}/${name}` : `https://github.com/${profile.githubInsights.username}/${name}`);
    const searchable = `${name} ${r.language || ''} ${r.description || ''} ${(r.topics || []).join(' ')} ${r.readmeSnippet || ''}`.toLowerCase();
    let relevance = 0;
    const matchedKeywords = [];

    for (const kw of jdKeywords) {
      if (searchable.includes(kw)) {
        relevance += 10;
        matchedKeywords.push(kw);
      }
    }

    // Bonus signals
    if (r.readmeSnippet) relevance += 3;
    if (r.stars > 0) relevance += Math.min(r.stars * 2, 10);
    if (!r.fork) relevance += 2;
    if (r.description && r.description.length > 20) relevance += 2;

    // User confirmed / pinned repo priority
    const isUserConfirmed = Array.isArray(profile.selectedRepoNames) && profile.selectedRepoNames.includes(name);
    if (isUserConfirmed) {
      relevance += 50; // Priority for user's confirmed repos
    }

    return { ...r, name, url: repoUrl, relevance, matchedKeywords, isUserConfirmed };
  });

  // 3. Sort by relevance, pick top matches
  scoredRepos.sort((a, b) => b.relevance - a.relevance);

  // 3. Prioritize user pinned repos first, sorted by relevance to JD keywords
  const userPinnedRepos = scoredRepos.filter(r => r.isUserConfirmed);
  const otherScoredRepos = scoredRepos.filter(r => !r.isUserConfirmed);

  // Provide all user pinned repos (up to 12) + top matching unpinned repos
  const finalRepos = userPinnedRepos.length > 0
    ? [...userPinnedRepos, ...otherScoredRepos.slice(0, 3)].slice(0, 12)
    : scoredRepos.slice(0, 6);

  // 4. Build rich context — deeper README for highly relevant repos
  const repoLines = finalRepos.map(r => {
    const matchInfo = r.matchedKeywords && r.matchedKeywords.length > 0
      ? ` [MATCHES JD STACK: ${r.matchedKeywords.slice(0, 5).join(', ')}]`
      : '';
    const pinnedInfo = r.isUserConfirmed ? ' [USER CONFIRMED FOR EMAIL LINKS]' : '';
    const readmeDepth = r.relevance >= 10 ? 400 : 180;
    const archSnippet = r.readmeSnippet
      ? `\n    Architecture Notes: ${r.readmeSnippet.slice(0, readmeDepth).replace(/\n/g, ' ').trim()}${r.readmeSnippet.length > readmeDepth ? '...' : ''}`
      : '';
    return `- Project "${r.name}" (Repo URL: ${r.url}, Language: ${r.language || 'Multi-stack'}${r.stars > 0 ? `, ★${r.stars}` : ''}): ${r.description || 'Production software system'}${pinnedInfo}${matchInfo}${archSnippet}`;
  }).join('\n');

  const matchSummary = jdKeywords.length > 0
    ? `\nJD Tech Stack Detected: [${jdKeywords.slice(0, 12).join(', ')}] — repos below were auto-matched to this stack.`
    : '';

  console.log(`[GitHub Match] JD keywords: [${jdKeywords.join(', ')}] → matched ${finalRepos.length} repos (${finalRepos.map(r => r.name).join(', ')})`);

  const sampleRepo = finalRepos[0];
  const sampleRepoUrl = sampleRepo ? sampleRepo.url : (profile.github ? `${profile.github.replace(/\/$/, '')}/AI-Job-Finder` : 'https://github.com');
  const sampleRepoName = sampleRepo ? sampleRepo.name : 'AI Job Finder';

  // Configured link count from profile
  const maxLinks = typeof profile.githubRepoLinkCount === 'number' ? profile.githubRepoLinkCount : 2;

  let linkInstruction = '';
  if (maxLinks === 0) {
    linkInstruction = `- USER PREFERENCE CONFIGURED: ZERO REPO LINKS. DO NOT include any repository links or URLs in the email body. Only cite candidate architectural experience by project name without hyperlinks.`;
  } else if (maxLinks === 1) {
    linkInstruction = `- USER PREFERENCE CONFIGURED: EXACTLY 1 REPO LINK PER EMAIL.
- Prioritize projects marked [USER CONFIRMED FOR EMAIL LINKS]. Select the single best-matching project that aligns most closely with this target company's JD requirements.
- Seamlessly embed ONLY that 1 project link as clean markdown: [ProjectName](RepoUrl) directly into the sentence describing the architecture.
- NEVER write raw URLs like "${sampleRepoUrl}" or "https://github.com/..." directly in the text.
- Do NOT include more than 1 link.`;
  } else {
    linkInstruction = `- USER PREFERENCE CONFIGURED: UP TO ${maxLinks} REPO LINKS PER EMAIL.
- The candidate has prioritized repositories marked [USER CONFIRMED FOR EMAIL LINKS]. From these confirmed projects, dynamically select up to ${maxLinks} projects that have the strongest technical alignment with this specific role and tech stack.
- When citing projects, seamlessly embed up to ${maxLinks} clean markdown links: [ProjectName](RepoUrl) directly into the sentences describing their architecture.
- NEVER write raw URLs like "${sampleRepoUrl}" or "https://github.com/..." directly in the text.
- NEVER write awkward phrases like "You can inspect the architecture at https://...".
- Seamlessly integrate them: e.g. "• **[ProjectName](RepoUrl)**: Engineered a [system] with [real mechanism], preventing [specific issue]."
- Limit project links strictly to ${maxLinks} max in the body so the email remains authentic, focused, and maintains 100% email deliverability.`;
  }

  return `\n── VERIFIED GITHUB PORTFOLIO (@${profile.githubInsights.username}) ──${matchSummary}
${repoLines}
Verified Core Languages: ${profile.githubInsights.topLanguages?.join(', ') || 'Various'}

IMPORTANT LINK & CITATION RULES:
${linkInstruction}`;
}


router.post('/verify-email', requireAuth, async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required' });
  const result = await verifyEmail(email);
  res.json(result);
});

router.post('/discover-email', requireAuth, async (req, res) => {
  const { company, jd, failedEmails = [], hrName = null, hrLinkedInUrl = null, applyLink = null, location = 'India' } = req.body;
  if (!company) return res.status(400).json({ error: 'Company name required' });
  
  let effectiveHrName = hrName;
  let effectiveHrLinkedIn = hrLinkedInUrl;

  // If no HR recruiter was associated with the job yet, attempt to find the local HR recruiter for this company
  if (!effectiveHrName && company && company !== 'Direct Recruiter / Agency') {
    try {
      const discoveredHr = await findHROnLinkedIn(company, location || 'India');
      if (discoveredHr && discoveredHr.name) {
        effectiveHrName = discoveredHr.name;
        effectiveHrLinkedIn = discoveredHr.linkedinUrl || '';
      }
    } catch (hrErr) {
      console.warn('[Discover Email] Could not discover HR on LinkedIn:', hrErr.message);
    }
  }

  const domain = await resolveCompanyDomain(company, applyLink);
  const result = await discoverEmailForJob(company, domain, jd, failedEmails, callAIWithRetry, effectiveHrName, effectiveHrLinkedIn, applyLink);
  res.json({
    ...result,
    hrName: effectiveHrName,
    hrLinkedIn: effectiveHrLinkedIn
  });
});

router.post('/generate-linkedin-note', requireAuth, async (req, res) => {
  const { hrName, company, role } = req.body;
  try {
    const profile = await getProfile(req.user.id);
    const firstName = hrName ? hrName.split(' ')[0] : 'there';
    const candidateFirstName = profile.name ? profile.name.split(' ')[0] : 'a developer';

    // Clean role: shorten long titles (e.g. "New College Grad - Embedded Firmware Engineer" -> "Firmware Engineer")
    const shortRole = role ? role.replace(/^(New College Grad\s*[-–]\s*|Senior\s+|Junior\s+|Lead\s+)/i, '').split('-')[0].trim() : 'open';
    const skillsSnippet = profile.skills && profile.skills.length > 0 ? profile.skills.slice(0, 3).join(', ') : 'modern full-stack systems';

    const prompt = `You are an elite tech recruiter copywriter. Write an ultra-compelling, high-converting LinkedIn connection note from developer ${candidateFirstName} to recruiter ${firstName} regarding the ${shortRole} role at ${company}.

CRITICAL RULES:
1. STRICTLY between 130 and 180 characters total (hard character limit is 200).
2. Start with "Hi ${firstName},"
3. DO NOT use generic clichés like "I'm excited about" or "would love to learn more" or "passionate about".
4. Position ${candidateFirstName} as a strong software builder (${skillsSnippet}) eager to share relevant work/portfolio for the ${shortRole} opening.
5. Return ONLY the final raw note text, strictly under 185 characters, no quotes or markdown.`;

    const response = await callAIWithRetry(prompt);
    let note = response.text.replace(/["`]/g, '').trim();
    if (note.length > 195) {
      note = `Hi ${firstName}, I'm an engineer building scalable software & UI systems. I'd love to connect and share my work for the ${shortRole} role at ${company}!`;
    }
    res.json({ note });
  } catch (err) {
    const firstName = hrName ? hrName.split(' ')[0] : 'there';
    res.json({ 
      note: `Hi ${firstName}, I build scalable software and UI systems. Would love to connect and share my work for the role at ${company || 'your team'}!` 
    });
  }
});

router.post('/generate-email', requireAuth, async (req, res) => {
  const { company, role, type, jd } = req.body;

  try {
    const profile = await getProfile(req.user.id);
    const tone = profile.tone || 'Professional';
    const skillsText = profile.skills && profile.skills.length > 0 ? `Core Skills: ${profile.skills.join(', ')}` : '';
    const achText = profile.achievements && profile.achievements.length > 0 ? `Key Achievements:\n- ${profile.achievements.join('\n- ')}` : '';

    const gitInsightText = buildGitInsightText(profile, jd, role, company);

    const targetCompany = company || 'the company';
    const targetRole = role || 'the open role';

    const prompt = `You are an elite software engineer ("${profile.name}") writing a sharp, compelling cold email to the technical hiring team at ${targetCompany} for the "${targetRole}" position. 
Context: ${type}
Tone: Confident, crisp, intellectually rigorous engineer talking to another technical lead. (ZERO corporate sycophancy, zero generic cover-letter filler).
Here is the official Job Description:
"""
${jd || 'Not provided'}
"""
Here is ${profile.name}'s Resume:
"""
${profile.resumeText || 'No resume available'}
"""
${skillsText}
${achText}
${profile.portfolio ? `Candidate Portfolio / Website: ${profile.portfolio}` : ''}
${profile.github ? `Candidate GitHub: ${profile.github}` : ''}
${profile.linkedin ? `Candidate LinkedIn: ${profile.linkedin}` : ''}
${gitInsightText}

CRITICAL RULES FOR HIGH-CONVERTING, IMPRESSIVE ENGINEERING OUTREACH:
1. THE OPENING HOOK (ZERO FLATTERY, HIGH TECHNICAL RELEVANCE):
   - NEVER open with empty corporate praise like "Your mission to simplify ecosystems...", "I was excited to see...", or "I am writing to express interest in...". Tech leads delete these instantly.
   - Start immediately with a sharp, technically grounded 1-2 sentence hook. State the open role and directly reference the core engineering challenge or tech stack from the Job Description.
   - Example opening: "Hi team, I noticed your opening for ${targetRole} working with [specific technology/stack from JD]. As a developer focused on [candidate's core specialty, e.g. resilient full-stack systems / distributed backends], I wanted to share how my recent architectural work maps directly to what you're scaling."

2. TANGIBLE TECHNICAL PROOF & CLEAN PROJECT CITATIONS:
   - Provide 2-3 crisp, high-impact bullet points. Each bullet must highlight a REAL architectural decision, mechanism, or tradeoff from the candidate's actual projects or skills.
   - CLEAN REPO CITATIONS:
     - When referencing a project from the candidate's verified GitHub, cite it cleanly as a markdown link: [ProjectName](repo_url).
     - NEVER write raw URLs like "https://github.com/..." directly in the text.
     - NEVER write awkward phrases like "You can inspect the architecture at https://...".
     - Seamlessly embed it: e.g. "• **[ProjectName](repo_url)**: Engineered a [system description] with [real mechanism], preventing [specific race condition or bottleneck]."
   - ABSOLUTE BAN ON FAKE METRICS & AI CLICHÉS:
     - NEVER fabricate generic percentages like "reduced latency by ~20%", "improved throughput by 15%", or generic filler claims. Technical hiring managers instantly spot this as AI-generated slop.
     - Ground technical claims in REAL engineering mechanisms: optimistic state updates, schema validation (Zod/Pydantic), connection pooling, idempotent API handlers, exponential backoff with jitter, retry queues, Redis caching layers, concurrent state synchronization, background worker pools.

3. AUTHENTIC, CONFIDENT HUMAN VOICE:
   - Avoid stiff, robotic category headers with colons like "• Resilient API Orchestration:" or "• Query Optimization & Latency:".
   - Instead, make the bullet titles natural and project-centric:
     e.g. "• **[Fabrica](url)**: Built a B2B platform..." or "• **Autonomous Resiliency**: Architected an autonomous multi-LLM pipeline..."
   - Frame capabilities around core engineering principles: strongly typed architectures, OOP/modular design, dependency injection, relational schema design, query optimization, and resilient API construction.

4. CRISP LENGTH & CLOSING:
   - Total email body between 110 and 160 words total. Hiring managers spend 5 seconds scanning.
   - End with a sharp, 1-sentence wrap-up: "I've attached my CV for further technical context and would love to chat through how I can contribute to ${targetCompany}'s engineering goals."
   - Followed naturally by: "You can view my CV here."
   ${profile.enableFlex !== false ? '- ALWAYS include this exact postscript right before the end: "P.S. I prioritize high-leverage automation—in fact, this entire outreach was discovered, tech-stack verified, and drafted by an autonomous multi-LLM pipeline I architected from scratch."' : ''}

5. STRICTLY ZERO SIGN-OFF OR CLOSING VALEDICTION:
   - DO NOT include any sign-off whatsoever (NO "Best regards", "Sincerely", "Warm regards", "Cheers", "Thanks", "Respectfully", and DO NOT include your name or "[Your Name]" at the end). The backend dispatch system autonomously appends the candidate's verified signature block and portfolio links. End immediately on the last sentence of your email body.

6. ABSOLUTELY ZERO PLACEHOLDER TOKENS:
   - NEVER output bracketed placeholders like [Your Name], [Name], [Candidate Name], [Link to Portfolio], [Your City], [Phone], [Company Name], [Role], [Date], etc. Always use the candidate's real details provided in this prompt or omit the mention cleanly.

7. OUTPUT FORMAT:
COMPANY: [Extracted Company Name or "${targetCompany}"]
ROLE: [Extracted Job Title or "${targetRole}"]
SUBJECT: [Exact subject requested in JD if any, e.g. "HN Software Engineer", or default "Application for [Role] - ${profile.name}"]
BODY:
[If company is unknown/generic, start with: Dear Hiring Manager,]
[Otherwise start with: Dear Hiring Manager at [Extracted Company Name],]

[Start of email body without any conversational filler or markdown blocks]`;

    const response = await callAIWithRetry(prompt);
    let rawText = response.text.replace(/```(?:html|json|markdown)?\s*([\s\S]*?)```/g, '$1').trim();

    let extractedCompany = company;
    let extractedRole = role;
    let extractedSubject = null;
    let draftText = rawText;

    const companyMatch = rawText.match(/COMPANY:\s*(.*)/i);
    const roleMatch = rawText.match(/ROLE:\s*(.*)/i);
    const subjectMatch = rawText.match(/SUBJECT:\s*(.*)/i);
    const bodyMatch = rawText.match(/BODY:\s*([\s\S]*)/i);

    if (companyMatch) extractedCompany = companyMatch[1].trim() || extractedCompany;
    if (roleMatch) extractedRole = roleMatch[1].trim() || extractedRole;
    if (subjectMatch) extractedSubject = subjectMatch[1].trim();
    if (bodyMatch) draftText = bodyMatch[1].trim();

    const emailStartMatch = draftText.match(/(?:Here is the email.*?:|Here's the email.*?:|Here is the cold email.*?:|Subject:.*?\n)\n*/i);
    if (emailStartMatch) {
      draftText = draftText.substring(emailStartMatch.index + emailStartMatch[0].length);
    }
    draftText = cleanDraftEmailText(draftText.trim(), profile, extractedCompany, extractedRole, { preserveMarkdownLinks: true });
    draftText = stripSignOff(draftText, profile);

    res.json({ draft: draftText, company: extractedCompany, role: extractedRole, subject: extractedSubject });
  } catch (error) {
    console.error('Error generating email:', error);
    res.status(500).json({ error: 'Failed to generate email' });
  }
});



router.post('/send-email', requireAuth, async (req, res) => {
  const { jobId, to, subject, body } = req.body;

  try {
    const job = await Job.findOne({ id: jobId, userId: req.user.id });
    const profile = await getProfile(req.user.id, true);
    const user = await User.findById(req.user.id);

    const baseUrl = process.env.PUBLIC_URL;
    const resumeLinkUrl = baseUrl ? `${baseUrl}/api/profile/resume-pdf?userId=${req.user.id}` : null;

    const trackClick = (url) => (baseUrl && url) ? `${baseUrl}/api/track-click/${jobId}?url=${encodeURIComponent(url)}` : (url || '');
    const linksHtml = buildSignatureLinks(profile, trackClick);
    const trackingPixel = baseUrl ? `<img src="${baseUrl}/api/track-open/${jobId}" width="1" height="1" style="display:none;" />` : '';

    const cleanBodyHtml = stripSignOff(cleanDraftEmailText(body, profile, job?.company, job?.role, { preserveMarkdownLinks: true }), profile);
    const formattedDraft = formatEmailTextToHtml(cleanBodyHtml, resumeLinkUrl);

    const htmlBody = `
      <div style="font-family: Arial, sans-serif; font-size: 14px; color: #333; line-height: 1.6;">
        ${formattedDraft}
        <br/><br/>
        Yours Sincerely,<br/>
        <b>${profile.name}</b><br/>
        ${profile.title}<br/>
        ${profile.phone ? `📞 ${profile.phone}<br/>` : ''}
        ${linksHtml}
        <br/>
        ${trackingPixel}
      </div>
    `;

    const cleanBodyPlain = stripSignOff(cleanDraftEmailText(body, profile, job?.company, job?.role, { preserveMarkdownLinks: false }), profile);
    const plainTextSignature = buildPlainTextSignature(profile);
    const fullPlainText = `${cleanBodyPlain}\n\n${plainTextSignature}`;

    const mailOptions = {
      from: user.email || process.env.EMAIL_USER,
      to: (to || '').trim(),
      subject: subject || (job ? `Application for ${job.role} - ${profile.name}` : 'Job Application'),
      text: fullPlainText,
      html: htmlBody,
      attachments: []
    };

    await attachResumeToMailOptions(mailOptions, profile, req.user.id);

    const info = await sendEmailViaAPI(user, mailOptions);
    
    if (job) {
      job.status = 'Sent';
      job.sentAt = new Date();
      job.tracked = !!baseUrl;
      job.emailDraft = fullPlainText; // Save the final cleaned draft with full signature sent
      if (to && to !== job.emailRecipient) {
        job.emailRecipient = to; // Update if changed manually
      }
      job.deliverabilityStatus = 'deliverable';
      await job.save();
    }

    res.json({ success: true, tracked: !!baseUrl, emailDraft: fullPlainText, message: 'Email sent successfully!', messageId: info.messageId });
  } catch (error) {
    console.error('Error sending email:', error);
    res.status(500).json({ error: error.message || 'Failed to send email. Check credentials.' });
  }
});

router.post('/single-draft', requireAuth, async (req, res) => {
  const { company, role, jd, recipientEmail } = req.body;

  try {
    const profile = await getProfile(req.user.id, true);
    const user = await User.findById(req.user.id);

    const tone = profile.tone || 'Professional';
    const skillsText = profile.skills && profile.skills.length > 0 ? `Core Skills: ${profile.skills.join(', ')}` : '';
    const achText = profile.achievements && profile.achievements.length > 0 ? `Key Achievements:\n- ${profile.achievements.join('\n- ')}` : '';

    const gitInsightText = buildGitInsightText(profile, jd, role, company);

    const targetCompany = company || 'the company';
    const targetRole = role || 'the open role';

    const prompt = `You are an elite software engineer ("${profile.name}") writing a sharp, compelling cold email to the technical hiring team at ${targetCompany} for the "${targetRole}" position. 
Context: Cold Outreach / Networking
Tone: Confident, crisp, intellectually rigorous engineer talking to another technical lead. (ZERO corporate sycophancy, zero generic cover-letter filler).
Here is the official Job Description:
"""
${jd}
"""
Here is ${profile.name}'s Resume:
"""
${profile.resumeText || 'No resume available'}
"""
${skillsText}
${achText}
${gitInsightText}

CRITICAL RULES FOR HIGH-CONVERTING, IMPRESSIVE ENGINEERING OUTREACH:
1. THE OPENING HOOK (ZERO FLATTERY, HIGH TECHNICAL RELEVANCE):
   - NEVER open with empty corporate praise like "Your mission to simplify ecosystems...", "I was excited to see...", or "I am writing to express interest in...". Tech leads delete these instantly.
   - Start immediately with a sharp, technically grounded 1-2 sentence hook. State the open role and directly reference the core engineering challenge or tech stack from the Job Description.
   - Example opening: "Hi team, I noticed your opening for ${targetRole} working with [specific technology/stack from JD]. As a developer focused on [candidate's core specialty, e.g. resilient full-stack systems / distributed backends], I wanted to share how my recent architectural work maps directly to what you're scaling."

2. TANGIBLE TECHNICAL PROOF & CLEAN PROJECT CITATIONS:
   - Provide 2-3 crisp, high-impact bullet points. Each bullet must highlight a REAL architectural decision, mechanism, or tradeoff from the candidate's actual projects or skills.
   - CLEAN REPO CITATIONS:
     - When referencing a project from the candidate's verified GitHub, cite it cleanly as a markdown link: [ProjectName](repo_url).
     - NEVER write raw URLs like "https://github.com/..." directly in the text.
     - NEVER write awkward phrases like "You can inspect the architecture at https://...".
     - Seamlessly embed it: e.g. "• **[ProjectName](repo_url)**: Engineered a [system description] with [real mechanism], preventing [specific race condition or bottleneck]."
   - ABSOLUTE BAN ON FAKE METRICS & AI CLICHÉS:
     - NEVER fabricate generic percentages like "reduced latency by ~20%", "improved throughput by 15%", or generic filler claims. Technical hiring managers instantly spot this as AI-generated slop.
     - Ground technical claims in REAL engineering mechanisms: optimistic state updates, schema validation (Zod/Pydantic), connection pooling, idempotent API handlers, exponential backoff with jitter, retry queues, Redis caching layers, concurrent state synchronization, background worker pools.

3. AUTHENTIC, CONFIDENT HUMAN VOICE:
   - Avoid stiff, robotic category headers with colons like "• Resilient API Orchestration:" or "• Query Optimization & Latency:".
   - Instead, make the bullet titles natural and project-centric:
     e.g. "• **[Fabrica](url)**: Built a B2B platform..." or "• **Autonomous Resiliency**: Architected an autonomous multi-LLM pipeline..."
   - Frame capabilities around core engineering principles: strongly typed architectures, OOP/modular design, dependency injection, relational schema design, query optimization, and resilient API construction.

4. CRISP LENGTH & CLOSING:
   - Total email body between 110 and 160 words total. Hiring managers spend 5 seconds scanning.
   - End with a sharp, 1-sentence wrap-up: "I've attached my CV for further technical context and would love to chat through how I can contribute to ${targetCompany}'s engineering goals."
   - Followed naturally by: "You can view my CV here."
   ${profile.enableFlex !== false ? '- ALWAYS include this exact postscript right before the end: "P.S. I prioritize high-leverage automation—in fact, this entire outreach was discovered, tech-stack verified, and drafted by an autonomous multi-LLM pipeline I architected from scratch."' : ''}

5. STRICTLY ZERO SIGN-OFF OR CLOSING VALEDICTION:
   - DO NOT include any sign-off whatsoever (NO "Best regards", "Sincerely", "Warm regards", "Cheers", "Thanks", "Respectfully", and DO NOT include your name or "[Your Name]" at the end). The backend dispatch system autonomously appends the candidate's verified signature block and portfolio links. End immediately on the last sentence of your email body.

6. ABSOLUTELY ZERO PLACEHOLDER TOKENS:
   - NEVER output bracketed placeholders like [Your Name], [Name], [Candidate Name], [Link to Portfolio], [Your City], [Phone], [Company Name], [Role], [Date], etc. Always use the candidate's real details provided in this prompt or omit the mention cleanly.

7. OUTPUT FORMAT:
COMPANY: [Extracted Company Name or "${targetCompany}"]
ROLE: [Extracted Job Title or "${targetRole}"]
SUBJECT: [Exact subject requested in JD if any, e.g. "HN Software Engineer", or default "Application for [Role] - ${profile.name}"]
BODY:
[If company is unknown/generic, start with: Dear Hiring Manager,]
[Otherwise start with: Dear Hiring Manager at [Extracted Company Name],]

[Start of email body without any conversational filler or markdown blocks]`;

    const response = await callAIWithRetry(prompt);
    let rawText = response.text.replace(/```(?:html|json|markdown)?\s*([\s\S]*?)```/g, '$1').trim();

    let extractedCompany = company || 'Unknown Company';
    let extractedRole = role || 'General Position';
    let extractedSubject = null;
    let draftText = rawText;

    const companyMatch = rawText.match(/COMPANY:\s*(.*)/i);
    const roleMatch = rawText.match(/ROLE:\s*(.*)/i);
    const subjectMatch = rawText.match(/SUBJECT:\s*(.*)/i);
    const bodyMatch = rawText.match(/BODY:\s*([\s\S]*)/i);

    if (companyMatch) extractedCompany = companyMatch[1].trim() || extractedCompany;
    if (roleMatch) extractedRole = roleMatch[1].trim() || extractedRole;
    if (subjectMatch) extractedSubject = subjectMatch[1].trim();
    if (bodyMatch) draftText = bodyMatch[1].trim();

    const emailStartMatch = draftText.match(/(?:Here is the email.*?:|Here's the email.*?:|Here is the cold email.*?:|Subject:.*?\n)\n*/i);
    if (emailStartMatch) {
      draftText = draftText.substring(emailStartMatch.index + emailStartMatch[0].length).trim();
    }
    const cleanBodyPlain = stripSignOff(cleanDraftEmailText(draftText, profile, extractedCompany, extractedRole, { preserveMarkdownLinks: false }), profile);
    const plainTextSignature = buildPlainTextSignature(profile);
    const fullPlainText = `${cleanBodyPlain}\n\n${plainTextSignature}`;
    const cleanBodyHtml = stripSignOff(cleanDraftEmailText(draftText, profile, extractedCompany, extractedRole, { preserveMarkdownLinks: true }), profile);

    let finalRecipientEmail = (recipientEmail || '').trim();
    if (!finalRecipientEmail && jd) {
      const emailMatch = jd.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/);
      if (emailMatch) finalRecipientEmail = emailMatch[0];
    }

    const emailSubject = extractedSubject || `Application for ${extractedRole} - ${profile.name}`;

    if (!finalRecipientEmail) {
      return res.json({
        success: true,
        draft: fullPlainText,
        company: extractedCompany,
        role: extractedRole,
        subject: emailSubject,
        message: 'Draft generated successfully! Add a recipient email to send directly.'
      });
    }

    const baseUrl = process.env.PUBLIC_URL;
    const resumeLinkUrl = baseUrl ? `${baseUrl}/api/profile/resume-pdf?userId=${req.user.id}` : null;
    const jobId = Date.now().toString() + Math.random().toString().substring(2, 6);
    const trackClick = (url) => (baseUrl && url) ? `${baseUrl}/api/track-click/${jobId}?url=${encodeURIComponent(url)}` : (url || '');
    const trackingPixel = baseUrl ? `<img src="${baseUrl}/api/track-open/${jobId}" width="1" height="1" style="display:none;" />` : '';

    const formattedDraft = formatEmailTextToHtml(cleanBodyHtml, resumeLinkUrl);
    const linksHtml = buildSignatureLinks(profile, trackClick);
    const htmlBody = `
      <div style="font-family: Arial, sans-serif; font-size: 14px; color: #333; line-height: 1.6;">
        ${formattedDraft}
        <br/><br/>
        Yours Sincerely,<br/>
        <b>${profile.name}</b><br/>
        ${profile.title}<br/>
        ${profile.phone ? `📞 ${profile.phone}<br/>` : ''}
        ${linksHtml}
        <br/>
        ${trackingPixel}
      </div>
    `;

    const mailOptions = {
      from: user.email || process.env.EMAIL_USER,
      to: finalRecipientEmail,
      subject: emailSubject,
      text: fullPlainText,
      html: htmlBody,
      attachments: []
    };

    await attachResumeToMailOptions(mailOptions, profile, req.user.id);

    await sendEmailViaAPI(user, mailOptions);

    const newJob = new Job({
      userId: req.user.id,
      id: jobId,
      company: extractedCompany,
      role: extractedRole,
      jd: jd,
      status: 'Sent',
      emailRecipient: finalRecipientEmail,
      emailDraft: fullPlainText,
      tracked: !!baseUrl,
      sentAt: new Date()
    });
    await newJob.save();

    res.json({ success: true, message: 'Email sent and job tracked!', job: newJob });
  } catch (error) {
    console.error('Error in Single Mail Drafter:', error.message || error);
    res.status(500).json({ error: error.message || 'Failed to draft and send email.' });
  }
});

router.post('/test-email', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    const profile = await getProfile(req.user.id, true);
    const myEmail = user.email || process.env.EMAIL_USER;
    if (!myEmail) return res.status(500).json({ error: 'EMAIL_USER not configured in backend' });

    const company = "TestCorp";
    const role = "Senior Software Engineer";
    const jd = "We are looking for a senior developer with 5+ years of experience in React, Node.js, and MongoDB. Must be passionate about AI and automation.";

    const prompt = `You are an elite, highly persuasive software engineer ("${profile.name}") writing a cold email to the hiring manager at ${company} for the "${role}" position. 
Context: Cold Outreach / Networking
Here is the official Job Description:
"""
${jd}
"""
Here is ${profile.name}'s Resume:
"""
${profile.resumeText || 'No resume available'}
"""

INSTRUCTIONS FOR THE EMAIL DRAFT:
1. DEEP JD ANALYSIS: Internally identify the top 2-3 most critical technical requirements mentioned in the Job Description. DO NOT OUTPUT THIS ANALYSIS in your response.
2. VALUE MAPPING: Explicitly map those exact JD requirements to specific, quantifiable achievements from ${profile.name}'s resume. DO NOT OUTPUT THIS MAPPING process in your response.
3. TONE & STRUCTURE: Keep it concise, confident, and highly impressive. Do not use generic filler (e.g., "I hope this email finds you well"). Start with a strong hook, deliver the value proposition (the mapped skills), and end with a soft call to action.
${profile.enableFlex !== false ? '4. THE FLEX: ALWAYS include this exact postscript right before the sign-off: "P.S. I\'m highly passionate about automation and software engineering—in fact, I built the AI web-scraper and autonomous agent that found this job and drafted this email!"' : ''}
5. THE RESUME LINK: You MUST include the exact phrase "You can view my CV here." somewhere naturally towards the end of the email (before the postscript). DO NOT add any URLs, colons, or markdown links after this phrase. Just the exact phrase and a period. 
6. STRICTLY NO SIGN-OFF: Output body only, absolutely NO closing valediction (NO "Best regards", "Sincerely", "Thanks", "Warm regards"), and NO candidate name or "[Your Name]" at the bottom.
7. ZERO PLACEHOLDERS: NEVER use bracketed placeholder tokens like [Your Name], [Your City], [Link], etc.
8. OUTPUT STRICTLY the final email content (body only, no signature, no name). No conversational filler, no internal thoughts, no analysis, and NO MARKDOWN BLOCKS (like \`\`\`email).
9. CRITICAL: The very first word of your output MUST be "Dear", "Hi", or the start of the email body. NEVER write "I have crafted...", "Here is the email...", or any conversational intro. Any intro text will break our automated pipeline.
${profile.aiInstructions ? `\nEXTRA CUSTOM INSTRUCTIONS:\n${profile.aiInstructions}` : ''}`;

    const response = await callAIWithRetry(prompt);

    let draftText = response.text;
    const emailStartMatch = draftText.match(/(?:Here is the email.*?:|Here's the email.*?:|Here is the cold email.*?:|Subject:.*?\n)\n*/i);
    if (emailStartMatch) {
      draftText = draftText.substring(emailStartMatch.index + emailStartMatch[0].length);
    }
    const cleanBodyPlain = stripSignOff(cleanDraftEmailText(draftText.trim(), profile, company, role, { preserveMarkdownLinks: false }), profile);
    const cleanBodyHtml = stripSignOff(cleanDraftEmailText(draftText.trim(), profile, company, role, { preserveMarkdownLinks: true }), profile);

    const baseUrl = process.env.PUBLIC_URL;
    const resumeLinkUrl = baseUrl ? `${baseUrl}/api/profile/resume-pdf?userId=${req.user.id}` : null;
    const formattedDraft = formatEmailTextToHtml(cleanBodyHtml, resumeLinkUrl);

    const testJobId = Date.now().toString();
    const trackClick = (url) => (baseUrl && url) ? `${baseUrl}/api/track-click/${testJobId}?url=${encodeURIComponent(url)}` : (url || '');
    const trackingPixel = baseUrl ? `<img src="${baseUrl}/api/track-open/${testJobId}" width="1" height="1" style="display:none;" />` : '';

    const linksHtml = buildSignatureLinks(profile, trackClick);
    const htmlBody = `
      <div style="font-family: Arial, sans-serif; font-size: 14px; color: #333; line-height: 1.6;">
        ${formattedDraft}
        <br/><br/>
        Yours Sincerely,<br/>
        <b>${profile.name}</b><br/>
        ${profile.title}<br/>
        ${profile.phone ? `📞 ${profile.phone}<br/>` : ''}
        ${linksHtml}
        <br/>
        ${trackingPixel}
      </div>
    `;

    const fullPlainText = `${cleanBodyPlain}\n\n${buildPlainTextSignature(profile)}`;

    const mailOptions = {
      from: myEmail,
      to: myEmail,
      subject: `[TEST EMAIL] Application for ${role} at ${company}`,
      text: fullPlainText,
      html: htmlBody,
      attachments: []
    };

    await attachResumeToMailOptions(mailOptions, profile, req.user.id);

    await sendEmailViaAPI(user, mailOptions);

    const testJob = new Job({
      userId: req.user.id,
      id: testJobId,
      company: company,
      role: role,
      jd: jd,
      status: 'Sent',
      emailDraft: fullPlainText,
      emailRecipient: myEmail,
      tracked: !!baseUrl,
      sentAt: new Date()
    });
    await testJob.save();

    res.json({ success: true, message: 'Test email sent to yourself and added to jobs!' });
  } catch (err) {
    console.error('Test Email Error:', err);
    res.status(500).json({ error: 'Failed to send test email' });
  }
});

function classifyEmailCategory(subject = '', body = '', snippet = '') {
  const text = `${subject} ${body} ${snippet}`.toLowerCase();
  
  if (/\b(interview|round|schedule|screening|zoom|google meet|teams link|calendar invite|availability|call with|chat with|shortlist|discuss the role|phone screen|lets connect|let's connect|lets talk|let's talk|connect on|reschedule)\b/i.test(text)) {
    return { category: 'Interview', label: '🎉 Interview Invite', color: '#10b981', bg: 'rgba(16, 185, 129, 0.15)', border: 'rgba(16, 185, 129, 0.3)' };
  }
  if (/\b(assignment|assessment|hackerrank|leetcode|codility|take[- ]home|test link|coding challenge|task|technical evaluation)\b/i.test(text)) {
    return { category: 'Assessment', label: '📝 Tech Assessment', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)', border: 'rgba(245, 158, 11, 0.3)' };
  }
  if (/\b(notice period|current ctc|expected ctc|resume|salary expectations|portfolio|experience details|relocation|years of experience|preference of location|comfortable to relocate)\b/i.test(text)) {
    return { category: 'Info_Request', label: '💬 Recruiter Inquiry', color: '#38bdf8', bg: 'rgba(56, 189, 248, 0.15)', border: 'rgba(56, 189, 248, 0.3)' };
  }
  if (/\b(unfortunately|regret to inform|pursue other candidates|not moving forward|position has been filled|not a match|cannot offer|filled the position)\b/i.test(text)) {
    return { category: 'Rejection', label: '❌ Not Moving Forward', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.15)', border: 'rgba(239, 68, 68, 0.3)' };
  }
  return { category: 'General', label: '📩 Direct Reply', color: '#a78bfa', bg: 'rgba(167, 139, 250, 0.15)', border: 'rgba(167, 139, 250, 0.3)' };
}

function findMatchingJob(emailItem, jobs, userEmail = '') {
  const myEmail = (userEmail || '').toLowerCase().trim();

  // Collect all non-user email addresses and domains involved in this thread
  const threadEmails = new Set();
  const threadDomains = new Set();

  const addEmail = (raw) => {
    if (!raw) return;
    const clean = (raw.match(/<([^>]+)>/)?.[1] || raw).toLowerCase().trim();
    if (clean && clean !== myEmail) {
      threadEmails.add(clean);
      if (clean.includes('@')) {
        const d = clean.split('@')[1].toLowerCase().trim();
        threadDomains.add(d);
      }
    }
  };

  addEmail(emailItem.from);
  addEmail(emailItem.fromFull);

  if (Array.isArray(emailItem.threadMessages)) {
    for (const tm of emailItem.threadMessages) {
      addEmail(tm.from);
    }
  }

  const fromName = (emailItem.fromFull || emailItem.from || '').toLowerCase();
  const subjectLower = (emailItem.subject || '').toLowerCase();

  const genericDomains = [
    'gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'icloud.com',
    'naukri.com', 'internshala.com', 'atlassian.net', 'wellfound.com', 'linkedin.com',
    'workablemail.com', 'myworkday.com', 'workday.com', 'greenhouse.io', 'lever.co',
    'smartrecruiters.com', 'ashbyhq.com', 'jobvite.com', 'icims.com', 'bamboohr.com'
  ];

  for (const j of jobs) {
    // 1. Explicit thread linkage (manual link or previously confirmed thread)
    if (j.matchedThreadId && emailItem.threadId && j.matchedThreadId === emailItem.threadId) {
      return j;
    }

    // 2. Exact Recruiter Email match in thread participants (excluding user's own email)
    const r1 = j.emailRecipient ? j.emailRecipient.toLowerCase().trim() : '';
    const r2 = j.recruiterEmail ? j.recruiterEmail.toLowerCase().trim() : '';
    if (r1 && r1 !== myEmail && threadEmails.has(r1)) {
      return j;
    }
    if (r2 && r2 !== myEmail && threadEmails.has(r2)) {
      return j;
    }

    // 3. Exact corporate company domain match (e.g. neerinteractives.com)
    if (j.emailRecipient && j.emailRecipient.includes('@')) {
      const jDomain = j.emailRecipient.split('@')[1].toLowerCase().trim();
      if (!genericDomains.includes(jDomain) && threadDomains.has(jDomain)) {
        return j;
      }
    }

    // 4. Company Name match (strictly word-bounded, avoiding false positives like 'soft' in 'software')
    if (j.company && j.company.trim().length >= 3) {
      const compRaw = j.company.toLowerCase().trim();
      const compClean = compRaw
        .replace(/\b(enterprises|technologies|solutions|software|systems|services|pvt|ltd|limited|private|llc|inc|corp|corporation|group|india|manufacturing|kft)\b/gi, '')
        .trim();

      // Words to ignore as company names because they are generic words
      const genericWords = ['career', 'creed', 'soft', 'solution', 'service', 'enterprise', 'system', 'tech', 'financial', 'global', 'staffing', 'consulting', 'hr'];
      const testNames = [compRaw, compClean].filter(n => n && n.length >= 4 && !genericWords.includes(n));

      for (const name of testNames) {
        const regex = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
        if (regex.test(subjectLower) || regex.test(fromName)) {
          return j;
        }
      }
    }

    // 5. Specific Role match ONLY IF company is also referenced
    if (j.role && j.role.trim().length >= 6 && j.company && j.company.trim().length >= 3) {
      const roleClean = j.role.toLowerCase().trim();
      const compClean = j.company.toLowerCase().trim();
      if (subjectLower.includes(roleClean) && subjectLower.includes(compClean)) {
        return j;
      }
    }
  }

  return null;
}

const inboxCache = new Map(); // userId -> { timestamp, data }

router.get('/inbox', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user || !user.googleRefreshToken) {
      return res.status(400).json({ error: 'No Google account connected.' });
    }

    const searchQuery = (req.query.q || '').trim();
    const forceRefresh = req.query.force === 'true';

    // Serve from fast 30s cache if not searching and not forcing refresh
    const cacheKey = req.user.id;
    const cached = inboxCache.get(cacheKey);
    if (!forceRefresh && !searchQuery && cached && (Date.now() - cached.timestamp < 30000)) {
      return res.json({ success: true, replies: cached.data });
    }

    // Get all jobs sorted by most recently sent / created FIRST
    const jobs = await Job.find({ userId: req.user.id, isDeleted: { $ne: true } }).sort({ sentAt: -1, createdAt: -1, _id: -1 });

    const hrEmails = [...new Set(jobs.map(j => j.emailRecipient || j.recruiterEmail).filter(Boolean))];
    const companyDomains = [...new Set(jobs.map(j => {
      if (j.emailRecipient && j.emailRecipient.includes('@')) {
        return j.emailRecipient.split('@')[1].toLowerCase().trim();
      }
      return null;
    }).filter(Boolean))];

    const replies = await getInboxReplies(user, {
      hrEmails,
      searchQuery,
      companyDomains
    });
    
    // Enrich with classification, company link, and update status
    const enrichedReplies = [];
    for (const r of replies) {
      const fromEmail = (r.from.match(/<([^>]+)>/)?.[1] || r.from).toLowerCase().trim();

      // Aggregate thread messages for accurate classification context
      let classificationBody = r.body || r.snippet || '';
      if (Array.isArray(r.threadMessages) && r.threadMessages.length > 0) {
        classificationBody = r.threadMessages
          .filter(tm => !tm.isMe)
          .map(tm => tm.body)
          .join(' ');
      }
      const category = classifyEmailCategory(r.subject, classificationBody, r.snippet);

      // Match to job with multi-tiered heuristics (excluding candidate's own email from recruiter matches)
      const matchedJob = findMatchingJob(r, jobs, user.email);

      // ONLY list emails that belong to jobs used with AI Job Finder!
      // (If user explicitly typed a search in the scanner, allow showing it so they can link it)
      if (!matchedJob && !searchQuery) {
        continue;
      }

      // Auto-update job status to Replied if it was Sent or Opened
      if (matchedJob && ['Sent', 'Opened'].includes(matchedJob.status)) {
        await Job.updateOne(
          { _id: matchedJob._id },
          { 
            status: 'Replied',
            recruiterEmail: fromEmail,
            lastRepliedAt: new Date(),
            ...(r.threadId && !matchedJob.matchedThreadId ? { matchedThreadId: r.threadId } : {})
          }
        );
        matchedJob.status = 'Replied';
      }

      enrichedReplies.push({
        ...r,
        categoryInfo: category,
        matchedJob: matchedJob ? {
          id: matchedJob.id,
          company: matchedJob.company,
          role: matchedJob.role,
          status: matchedJob.status,
          emailRecipient: matchedJob.emailRecipient || fromEmail
        } : null
      });
    }

    // Sort all replies strictly newest-first (latest timestamp at index 0)
    enrichedReplies.sort((a, b) => {
      const timeA = a.timestamp || (a.date ? new Date(a.date).getTime() : 0);
      const timeB = b.timestamp || (b.date ? new Date(b.date).getTime() : 0);
      return timeB - timeA;
    });

    // Cache the enriched replies for 30s to prevent rapid quota depletion
    if (!searchQuery) {
      inboxCache.set(cacheKey, { timestamp: Date.now(), data: enrichedReplies });
    }

    res.json({ replies: enrichedReplies });
  } catch (err) {
    console.error('Error fetching inbox:', err);
    res.status(500).json({ error: 'Failed to fetch inbox replies' });
  }
});

router.post('/inbox/link-job', requireAuth, async (req, res) => {
  try {
    const { jobId, messageId, threadId, fromEmail, createNew, company, role } = req.body;

    let targetJob = null;
    if (createNew) {
      if (!company || !company.trim()) {
        return res.status(400).json({ error: 'Company name is required to create a new application record.' });
      }
      targetJob = new Job({
        userId: req.user.id,
        id: 'manual-' + Date.now(),
        company: company.trim(),
        role: (role || 'Job Applicant').trim(),
        emailRecipient: (fromEmail || '').trim(),
        recruiterEmail: (fromEmail || '').trim(),
        status: 'Replied',
        sentAt: new Date(),
        lastRepliedAt: new Date(),
        matchedThreadId: threadId || ''
      });
      await targetJob.save();
    } else if (jobId) {
      targetJob = await Job.findOne({ id: jobId, userId: req.user.id });
      if (!targetJob) {
        targetJob = await Job.findOne({ _id: jobId, userId: req.user.id });
      }
      if (!targetJob) {
        return res.status(404).json({ error: 'Job application not found.' });
      }

      targetJob.status = 'Replied';
      if (fromEmail) {
        targetJob.recruiterEmail = fromEmail.trim();
        if (!targetJob.emailRecipient) {
          targetJob.emailRecipient = fromEmail.trim();
        }
      }
      if (threadId) {
        targetJob.matchedThreadId = threadId;
      }
      targetJob.lastRepliedAt = new Date();
      await targetJob.save();
    } else {
      return res.status(400).json({ error: 'Please provide a jobId or specify createNew: true.' });
    }

    inboxCache.delete(req.user.id);

    res.json({
      success: true,
      message: `Successfully linked to ${targetJob.company}!`,
      matchedJob: {
        id: targetJob.id,
        company: targetJob.company,
        role: targetJob.role,
        status: targetJob.status,
        emailRecipient: targetJob.emailRecipient,
        recruiterEmail: targetJob.recruiterEmail
      }
    });
  } catch (err) {
    console.error('Error linking job application:', err);
    res.status(500).json({ error: 'Failed to link job application' });
  }
});

router.post('/inbox/draft-reply', requireAuth, async (req, res) => {
  try {
    const { from, subject, body, intent = 'general' } = req.body;
    const profile = await getProfile(req.user.id);

    let intentGuidance = 'Draft 3 distinct, highly professional, and concise replies to this email.';
    if (intent === 'interview_accept') {
      intentGuidance = 'Express sincere gratitude and enthusiasm for the interview invitation. Confirm availability and propose 2-3 specific time windows (morning and afternoon) over the coming 2-3 business days. Mention looking forward to discussing your engineering skills.';
    } else if (intent === 'info_confirm') {
      intentGuidance = 'Politely and clearly confirm your details: available to start immediately or on short 15-day notice, current location, open and flexible to discuss compensation according to standard benchmarks, and attach/reiterate your portfolio/GitHub.';
    } else if (intent === 'polite_inquiry') {
      intentGuidance = 'Thank the recruiter warmly, confirm interest in the role, and ask 1-2 thoughtful, insightful questions regarding the team technical stack, engineering culture, or next steps in the process.';
    }

    const prompt = `You are an elite software engineer named ${profile.name || 'Akash V'}.
Candidate Title: ${profile.title || 'Software Developer'}
Candidate Skills: ${(profile.skills || []).join(', ') || 'React, Node.js, Python, MongoDB'}
Candidate Phone: ${profile.phone || ''}
Candidate Location: ${profile.location || 'India'}
Candidate Portfolio: ${profile.portfolio || ''}
Candidate GitHub: ${profile.github || ''}
Candidate LinkedIn: ${profile.linkedin || ''}

You just received the following email from a hiring manager or recruiter:
From: ${from}
Subject: ${subject}
Message:
"""
${body}
"""

Goal / Objective:
${intentGuidance}

CRITICAL FORMATTING & WRITING INSTRUCTIONS:
- Write strictly in clean, human, professional PLAIN TEXT for an email body.
- NEVER USE MARKDOWN BOLDING (NEVER use ** or __). Never output asterisks like **Availability:** or **Location:**.
- If listing points, use clean standard bullet symbols (• ) or dashes (- ). NEVER use * or ** for lists.
- If the recruiter asks for work samples, live demos, portfolio, personal website, or code links, naturally include the candidate's portfolio (${profile.portfolio || ''}) or GitHub (${profile.github || ''}).
- NEVER use placeholder brackets like [Your City, Country], [Link to Portfolio], [Your Name], etc. Use the candidate's real details provided above or omit placeholder text entirely.
- STRICTLY NO SIGN-OFF OR SENDER NAME: Output strictly the reply message body. Do NOT include "Best regards", "Sincerely", "Thanks", "Warmly", or the candidate's name at the end. The backend system automatically attaches the signature.

Draft 3 distinct options (Option 1: Warm & Enthusiastic, Option 2: Direct & Professional, Option 3: Confident & Concise).
Separate each draft using the exact delimiter "===DRAFT===" on its own line.
Do not include any conversational text, explanations, or markdown code fences. Return ONLY the drafts separated by the delimiter.`;

    const response = await callAIWithRetry(prompt, 3, 2000);
    let rawText = response.text.replace(/```(?:html|json|markdown)?\s*([\s\S]*?)```/g, '$1').trim();
    
    let draftOptions = rawText
      .split(/(?:={2,}\s*(?:DRAFT|OPTION)?\s*\d*\s*={2,}|(?:\n|^)(?:Option\s+\d+|Draft\s+\d+)\s*[:\-])/i)
      .map(s => s.trim())
      .filter(s => s.length > 25);
    
    // Fallback just in case it uses multi-newlines
    if (draftOptions.length < 2) {
      const fallbackOptions = rawText.split(/\n\s*\n\s*\n/).map(s => s.trim()).filter(s => s.length > 25);
      if (fallbackOptions.length >= 2) {
        draftOptions = fallbackOptions.slice(0, 3);
      }
    }

    if (draftOptions.length === 0 && rawText.length > 20) {
      draftOptions = [rawText];
    }
    draftOptions = draftOptions.slice(0, 3).map(draft => stripSignOff(cleanDraftEmailText(draft, profile), profile));

    res.json({ drafts: draftOptions });
  } catch (err) {
    console.error('Error drafting inbox reply:', err);
    res.status(500).json({ error: 'Failed to draft replies' });
  }
});

router.post('/inbox/send-reply', requireAuth, async (req, res) => {
  try {
    const { to, subject, body, messageId, threadId } = req.body;
    const user = await User.findById(req.user.id);
    const profile = await getProfile(req.user.id);

    const cleanBody = stripSignOff(cleanDraftEmailText(body, profile), profile);
    const formattedDraft = formatEmailTextToHtml(cleanBody);
    const linksHtml = buildSignatureLinks(profile);
    
    const htmlBody = `
      <div style="font-family: Arial, sans-serif; font-size: 14px; color: #333; line-height: 1.6;">
        ${formattedDraft}
        <br/><br/>
        Yours Sincerely,<br/>
        <b>${profile.name}</b><br/>
        ${profile.title}<br/>
        ${profile.phone ? `📞 ${profile.phone}<br/>` : ''}
        ${linksHtml}
      </div>
    `;

    const plainTextSignature = buildPlainTextSignature(profile);
    const fullPlainText = `${cleanBody}\n\n${plainTextSignature}`;

    const mailOptions = {
      from: user.email || process.env.EMAIL_USER,
      to,
      subject: subject.startsWith('Re:') ? subject : `Re: ${subject}`,
      text: fullPlainText,
      html: htmlBody,
      inReplyTo: messageId,
      references: [messageId],
      threadId: threadId
    };

    const info = await sendEmailViaAPI(user, mailOptions);
    res.json({ success: true, message: 'Reply sent successfully!', messageId: info.messageId });
  } catch (err) {
    console.error('Error sending inbox reply:', err);
    res.status(500).json({ error: 'Failed to send reply' });
  }
});

router.post('/inbox/update-status', requireAuth, async (req, res) => {
  try {
    const { jobId, status } = req.body;
    if (!jobId || !status) return res.status(400).json({ error: 'jobId and status required' });
    await Job.updateOne({ id: jobId, userId: req.user.id }, { status });
    res.json({ success: true, status });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update job status' });
  }
});

router.classifyEmailCategory = classifyEmailCategory;
module.exports = router;
