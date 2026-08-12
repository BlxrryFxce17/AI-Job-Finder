const Job = require('../models/Job');
const Profile = require('../models/Profile');
const User = require('../models/User');
const { callAIWithRetry } = require('../services/aiService');
const {
  discoverEmailForJob,
  getCompanyDomain,
  sanitizeAiInstructions,
} = require('../services/emailDiscoveryService');
const {
  sendEmailViaAPI,
  buildTrackedHtmlBody,
  createJobMailOptions,
  createFollowupMailOptions,
} = require('../services/emailService');
const { fetchAndSaveJobs } = require('../services/jobFetchService');
const { google } = require('googleapis');
const config = require('../config');
const logger = require('../utils/logger');
const { logAudit, AUDIT_ACTIONS } = require('../services/auditService');

const getJobs = async (req, res) => {
  try {
    const { cursor, limit = 20, status, search } = req.query;
    const userId = req.user.id;
    const parsedLimit = Math.min(parseInt(limit, 10), 100);

    // Build filter
    const filter = { userId };

    if (status && status !== 'All') {
      filter.status = status;
    }

    if (search) {
      filter.$or = [
        { company: { $regex: search, $options: 'i' } },
        { role: { $regex: search, $options: 'i' } },
      ];
    }

    // Cursor-based pagination
    if (cursor) {
      const cursorDate = new Date(cursor);
      if (!isNaN(cursorDate.getTime())) {
        filter.$or = [
          { publishedAt: { $lt: cursorDate } },
          { publishedAt: cursorDate, _id: { $lt: cursor } },
        ];
      }
    }

    const jobs = await Job.find(filter)
      .sort({ publishedAt: -1, _id: -1 })
      .limit(parsedLimit + 1); // Fetch one extra to check if there's more

    const hasMore = jobs.length > parsedLimit;
    if (hasMore) {
      jobs.pop();
    } // Remove the extra item

    const nextCursor =
      hasMore && jobs.length > 0 ? jobs[jobs.length - 1].publishedAt.toISOString() : null;

    res.json({ jobs, nextCursor, hasMore });
  } catch (err) {
    logger.error('[Jobs] Failed to fetch jobs', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch jobs' });
  }
};

const createJob = async (req, res) => {
  try {
    const job = new Job({ ...req.body, id: Date.now().toString(), userId: req.user.id });
    await job.save();
    res.json(job);
  } catch (err) {
    logger.error('[Jobs] Failed to save job', { error: err.message });
    res.status(500).json({ error: 'Failed to save job' });
  }
};

const updateJob = async (req, res) => {
  const { id } = req.params;
  const { status, emailRecipient, emailDraft, tracked } = req.body;

  try {
    const job = await Job.findOne({ id, userId: req.user.id });
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    if (status) {
      if (status === 'Sent' && job.status !== 'Sent') {
        job.sentAt = new Date();
      }
      job.status = status;
    }
    if (emailRecipient) {
      job.emailRecipient = emailRecipient;
    }
    if (emailDraft) {
      job.emailDraft = emailDraft;
    }
    if (tracked !== undefined) {
      job.tracked = tracked;
    }

    await job.save();
    res.json(job);
  } catch (err) {
    logger.error('[Jobs] Failed to update job', { error: err.message });
    res.status(500).json({ error: 'Failed to update job' });
  }
};

const deleteJob = async (req, res) => {
  try {
    await Job.deleteOne({ id: req.params.id, userId: req.user.id });
    res.json({ success: true });
  } catch (err) {
    logger.error('[Jobs] Failed to delete job', { error: err.message });
    res.status(500).json({ error: 'Failed to delete job' });
  }
};

const fetchJobs = async (req, res) => {
  const queries = req.body.queries || [];

  try {
    const totalAdded = await fetchAndSaveJobs(req.user.id, queries);
    res.json({
      message: `Fetched and added ${totalAdded} new jobs across ${queries.length} searches.`,
    });
  } catch (error) {
    logger.error('[Jobs] Error in fetch jobs', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch jobs from Adzuna API' });
  }
};

const discoverEmail = async (req, res) => {
  const { company, jd, failedEmails = [] } = req.body;
  if (!company) {
    return res.status(400).json({ error: 'Company name required' });
  }

  const domain = getCompanyDomain(company);
  const result = await discoverEmailForJob(company, domain, jd, failedEmails);
  res.json(result);
};

const generateEmail = async (req, res) => {
  const { company, role, type, jd } = req.body;

  if (!config.geminiApiKey && !config.groqApiKey) {
    return res.status(500).json({ error: 'No AI API keys configured' });
  }

  try {
    const profile = await Profile.findOne({ userId: req.user.id });
    if (!profile) {
      return res
        .status(404)
        .json({ error: 'Profile not found. Please complete your profile first.' });
    }

    const tone = profile.tone || 'Professional';
    const skillsText =
      profile.skills && profile.skills.length > 0
        ? `Core Skills: ${profile.skills.join(', ')}`
        : '';
    const achText =
      profile.achievements && profile.achievements.length > 0
        ? `Key Achievements:\n- ${profile.achievements.join('\n- ')}`
        : '';

    const targetCompany = company || 'the company';
    const targetRole = role || 'the open role';

    const prompt = `You are an elite, highly persuasive software engineer ("${profile.name}") writing a cold email to the hiring manager at ${targetCompany} for the "${targetRole}" position. 
Context: ${type}
Tone: ${tone}
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

INSTRUCTIONS FOR THE EMAIL DRAFT:
1. DEEP JD ANALYSIS: Internally identify the top 2-3 most critical technical requirements mentioned in the Job Description. DO NOT OUTPUT THIS ANALYSIS in your response.
2. VALUE MAPPING: Explicitly map those exact JD requirements to specific, quantifiable achievements from ${profile.name}'s resume. DO NOT OUTPUT THIS MAPPING process in your response.
3. TONE & STRUCTURE: Keep it concise, confident, and highly impressive. Do not use generic filler (e.g., "I hope this email finds you well"). Start with a strong hook, deliver the value proposition (the mapped skills), and end with a soft call to action.
${profile.enableFlex !== false ? '4. THE FLEX: ALWAYS include this exact postscript right before the end of your text: "P.S. I\'m highly passionate about automation and software engineering—in fact, I built the AI web-scraper and autonomous agent that found this job and drafted this email!"' : ''}
5. THE RESUME LINK: You MUST include the exact phrase "You can view my CV here." somewhere naturally towards the end of the email (before the postscript). DO NOT add any URLs, colons, or markdown links after this phrase. Just the exact phrase and a period. 
6. NO SIGN-OFF: DO NOT include any sign-off whatsoever (no "Best regards", "Sincerely", or your name). The backend system will automatically append the signature.
7. OUTPUT FORMAT: You MUST output the response EXACTLY in the following format so our system can parse it. If the exact company name or job role was not provided, you MUST extract them from the Job Description.
${profile.aiInstructions ? `\nEXTRA CUSTOM INSTRUCTIONS:\n${sanitizeAiInstructions(profile.aiInstructions)}` : ''}

COMPANY: [Extracted Company Name or "Unknown Company"]
ROLE: [Extracted Job Title or "General Position"]
BODY:
Dear Hiring Manager at [Extracted Company Name],

[Start of email body without any conversational filler or markdown blocks]`;

    const response = await callAIWithRetry(prompt);
    const rawText = response.text
      .replace(/```(?:html|json|markdown)?\s*([\s\S]*?)```/g, '$1')
      .trim();

    let extractedCompany = company;
    let extractedRole = role;
    let draftText = rawText;

    const companyMatch = rawText.match(/COMPANY:\s*(.*)/i);
    const roleMatch = rawText.match(/ROLE:\s*(.*)/i);
    const bodyMatch = rawText.match(/BODY:\s*([\s\S]*)/i);

    if (companyMatch) {
      extractedCompany = companyMatch[1].trim() || extractedCompany;
    }
    if (roleMatch) {
      extractedRole = roleMatch[1].trim() || extractedRole;
    }
    if (bodyMatch) {
      draftText = bodyMatch[1].trim();
    }

    // Clean up any accidental conversational filler from the AI in the draft
    const emailStartMatch = draftText.match(
      /(?:Here is the email.*?:|Here's the email.*?:|Here is the cold email.*?:|Subject:.*?\n)\n*/i
    );
    if (emailStartMatch) {
      draftText = draftText.substring(emailStartMatch.index + emailStartMatch[0].length);
    }
    draftText = draftText.trim();

    res.json({ draft: draftText, company: extractedCompany, role: extractedRole });
  } catch (error) {
    logger.error('[Jobs] Error generating email', { error: error.message });
    res.status(500).json({ error: 'Failed to generate email' });
  }
};

const sendEmail = async (req, res) => {
  const { jobId, to, subject, body } = req.body;

  try {
    const job = await Job.findOne({ id: jobId, userId: req.user.id });
    const profile = await Profile.findOne({ userId: req.user.id });
    const user = await User.findById(req.user.id);

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    const htmlBody = buildTrackedHtmlBody({
      draftText: body,
      profile: { ...profile.toObject(), userId: req.user.id },
      jobId,
      baseUrl: config.publicUrl,
      recipientEmail: to,
    });

    const mailOptions = createJobMailOptions({
      from: user.email || config.emailUser,
      to,
      subject:
        subject || (job ? `Application for ${job.role} - ${profile.name}` : 'Job Application'),
      htmlBody,
      profile,
      baseUrl: config.publicUrl,
    });

    logger.info('[Jobs] Sending email', { to, jobId });
    const info = await sendEmailViaAPI(user, mailOptions);
    logger.info('[Jobs] Email sent successfully', { messageId: info.messageId });

    // Audit log
    await logAudit({
      userId: req.user.id,
      action: AUDIT_ACTIONS.EMAIL_SEND,
      resourceType: 'Job',
      resourceId: jobId,
      details: { to, subject, tracked: !!config.publicUrl },
      req,
      success: true,
    });

    // Update job status
    if (job) {
      job.status = 'Sent';
      job.emailRecipient = to;
      job.emailDraft = body;
      job.tracked = !!config.publicUrl;
      job.sentAt = new Date();
      await job.save();
    }

    res.json({
      success: true,
      tracked: !!config.publicUrl,
      message: 'Email sent successfully!',
      messageId: info.messageId,
    });
  } catch (error) {
    logger.error('[Jobs] Error sending email', { error: error.message });
    res.status(500).json({ error: 'Failed to send email. Check credentials.' });
  }
};

const singleDraft = async (req, res) => {
  const { company, role, jd, recipientEmail } = req.body;

  try {
    const profile = await Profile.findOne({ userId: req.user.id });
    const user = await User.findById(req.user.id);

    if (!profile) {
      return res
        .status(404)
        .json({ error: 'Profile not found. Please complete your profile first.' });
    }

    const tone = profile.tone || 'Professional';
    const skillsText =
      profile.skills && profile.skills.length > 0
        ? `Core Skills: ${profile.skills.join(', ')}`
        : '';
    const achText =
      profile.achievements && profile.achievements.length > 0
        ? `Key Achievements:\n- ${profile.achievements.join('\n- ')}`
        : '';

    const targetCompany = company || 'the company';
    const targetRole = role || 'the open role';

    const prompt = `You are an elite, highly persuasive software engineer ("${profile.name}") writing a cold email to the hiring manager at ${targetCompany} for the "${targetRole}" position. 
Context: Cold Outreach / Networking
Tone: ${tone}
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

INSTRUCTIONS FOR THE EMAIL DRAFT:
1. DEEP JD ANALYSIS: Internally identify the top 2-3 most critical technical requirements mentioned in the Job Description. DO NOT OUTPUT THIS ANALYSIS in your response.
2. VALUE MAPPING: Explicitly map those exact JD requirements to specific, quantifiable achievements from ${profile.name}'s resume. DO NOT OUTPUT THIS MAPPING process in your response.
3. TONE & STRUCTURE: Keep it concise, confident, and highly impressive. Start with a strong hook, deliver the value proposition, and end with a soft call to action.
${profile.enableFlex !== false ? '4. THE FLEX: ALWAYS include this exact postscript right before the end of your text: "P.S. I\'m highly passionate about automation and software engineering—in fact, I built the AI web-scraper and autonomous agent that found this job and drafted this email!"' : ''}
5. THE RESUME LINK: You MUST include the exact phrase "You can view my CV here." somewhere naturally towards the end of the email (before the postscript). DO NOT add any URLs, colons, or markdown links after this phrase. Just the exact phrase and a period. 
6. NO SIGN-OFF: DO NOT include any sign-off whatsoever (no "Best regards", "Sincerely", or your name). The backend system will automatically append the signature.
7. OUTPUT FORMAT: You MUST output the response EXACTLY in the following format so our system can parse it. If the exact company name or job role was not provided, you MUST extract them from the Job Description.
${profile.aiInstructions ? `\nEXTRA CUSTOM INSTRUCTIONS:\n${sanitizeAiInstructions(profile.aiInstructions)}` : ''}

COMPANY: [Extracted Company Name or "Unknown Company"]
ROLE: [Extracted Job Title or "General Position"]
BODY:
Dear Hiring Manager at [Extracted Company Name],

[Start of email body without any conversational filler or markdown blocks]`;

    logger.info('[Single Draft] Generating AI draft', { company: targetCompany });
    const response = await callAIWithRetry(prompt);
    logger.info('[Single Draft] Draft generated successfully');

    const rawText = response.text
      .replace(/```(?:html|json|markdown)?\s*([\s\S]*?)```/g, '$1')
      .trim();

    let extractedCompany = company || 'Unknown Company';
    let extractedRole = role || 'General Position';
    let draftText = rawText;

    const companyMatch = rawText.match(/COMPANY:\s*(.*)/i);
    const roleMatch = rawText.match(/ROLE:\s*(.*)/i);
    const bodyMatch = rawText.match(/BODY:\s*([\s\S]*)/i);

    if (companyMatch) {
      extractedCompany = companyMatch[1].trim() || extractedCompany;
    }
    if (roleMatch) {
      extractedRole = roleMatch[1].trim() || extractedRole;
    }
    if (bodyMatch) {
      draftText = bodyMatch[1].trim();
    }

    const emailStartMatch = draftText.match(
      /(?:Here is the email.*?:|Here's the email.*?:|Here is the cold email.*?:|Subject:.*?\n)\n*/i
    );
    if (emailStartMatch) {
      draftText = draftText.substring(emailStartMatch.index + emailStartMatch[0].length).trim();
    }

    // Build and send email
    const htmlBody = buildTrackedHtmlBody({
      draftText,
      profile: { ...profile.toObject(), userId: req.user.id },
      jobId: Date.now().toString() + Math.random().toString().substring(2, 6),
      baseUrl: config.publicUrl,
      recipientEmail,
    });

    const mailOptions = createJobMailOptions({
      from: user.email || config.emailUser,
      to: recipientEmail,
      subject: `Application for ${extractedRole} - ${profile.name}`,
      htmlBody,
      profile,
      baseUrl: config.publicUrl,
    });

    await sendEmailViaAPI(user, mailOptions);

    // Audit log
    await logAudit({
      userId: req.user.id,
      action: AUDIT_ACTIONS.EMAIL_SEND,
      resourceType: 'Job',
      resourceId: newJob.id,
      details: {
        to: recipientEmail,
        subject: `Application for ${extractedRole} - ${profile.name}`,
        singleDraft: true,
      },
      req,
      success: true,
    });

    // Save to database
    const newJob = new Job({
      userId: req.user.id,
      id: Date.now().toString() + Math.random().toString().substring(2, 6),
      company: extractedCompany,
      role: extractedRole,
      jd: jd,
      status: 'Sent',
      emailRecipient: recipientEmail,
      emailDraft: draftText,
      tracked: !!config.publicUrl,
      sentAt: new Date(),
    });
    await newJob.save();

    res.json({ success: true, message: 'Email sent and job tracked!', job: newJob });
  } catch (error) {
    logger.error('[Jobs] Error in Single Mail Drafter', { error: error.message });
    res.status(500).json({ error: 'Failed to draft and send email.' });
  }
};

const testEmail = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    const profile = await Profile.findOne({ userId: req.user.id });
    const myEmail = user.email || config.emailUser;

    if (!myEmail) {
      return res.status(500).json({ error: 'EMAIL_USER not configured in backend' });
    }
    if (!profile) {
      return res
        .status(404)
        .json({ error: 'Profile not found. Please complete your profile first.' });
    }

    const company = 'TestCorp';
    const role = 'Senior Software Engineer';
    const jd =
      'We are looking for a senior developer with 5+ years of experience in React, Node.js, and MongoDB. Must be passionate about AI and automation.';

    // Draft
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
6. OUTPUT STRICTLY the final email content (body only, no signature, no name). No conversational filler, no internal thoughts, no analysis, and NO MARKDOWN BLOCKS (like \`\`\`email).
7. CRITICAL: The very first word of your output MUST be "Dear", "Hi", or the start of the email body. NEVER write "I have crafted...", "Here is the email...", or any conversational intro. Any intro text will break our automated pipeline.
${profile.aiInstructions ? `\nEXTRA CUSTOM INSTRUCTIONS:\n${sanitizeAiInstructions(profile.aiInstructions)}` : ''}`;

    logger.info('[Test Email] Drafting AI content...');
    const response = await callAIWithRetry(prompt);
    logger.info('[Test Email] Draft generated successfully.');

    let draftText = response.text;
    const emailStartMatch = draftText.match(
      /(?:Here is the email.*?:|Here's the email.*?:|Here is the cold email.*?:|Subject:.*?\n)\n*/i
    );
    if (emailStartMatch) {
      draftText = draftText.substring(emailStartMatch.index + emailStartMatch[0].length);
    }
    draftText = draftText.trim();

    const htmlBody = buildTrackedHtmlBody({
      draftText,
      profile: { ...profile.toObject(), userId: req.user.id },
      jobId: Date.now().toString(),
      baseUrl: config.publicUrl,
      recipientEmail: myEmail,
    });

    const mailOptions = createJobMailOptions({
      from: myEmail,
      to: myEmail,
      subject: `[TEST EMAIL] Application for ${role} at ${company}`,
      htmlBody,
      profile,
      baseUrl: config.publicUrl,
    });

    logger.info('[Test Email] Sending email via API', { to: myEmail });
    await sendEmailViaAPI(user, mailOptions);
    logger.info('[Test Email] Sent successfully!');

    // Audit log
    await logAudit({
      userId: req.user.id,
      action: AUDIT_ACTIONS.TEST_EMAIL_SEND,
      resourceType: 'Job',
      resourceId: testJob.id,
      details: { to: myEmail, company, role },
      req,
      success: true,
    });

    // Save to Database so it shows in the table
    const testJob = new Job({
      userId: req.user.id,
      id: Date.now().toString(),
      company: company,
      role: role,
      jd: jd,
      status: 'Sent',
      emailDraft: draftText,
      emailRecipient: myEmail,
      tracked: !!config.publicUrl,
      sentAt: new Date(),
    });
    await testJob.save();

    res.json({ success: true, message: 'Test email sent to yourself and added to jobs!' });
  } catch (err) {
    logger.error('[Jobs] Test Email Error', { error: err.message });
    res.status(500).json({ error: 'Failed to send test email' });
  }
};

const sendFollowup = async (req, res) => {
  const { jobId, day } = req.body;
  try {
    const job = await Job.findOne({ userId: req.user.id, id: jobId });
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const followUp = job.followUps.find(f => f.day === day);
    if (!followUp) {
      return res.status(404).json({ error: 'Follow up not found' });
    }

    const user = await User.findById(req.user.id);
    const profile = await Profile.findOne({ userId: req.user.id });

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    const mailOptions = createFollowupMailOptions({
      from: `"${profile.name}" <${user.email || config.emailUser}>`,
      to: job.emailRecipient,
      subject: `Follow-up: Application for ${job.role} - ${profile.name}`,
      draft: followUp.draft,
      profile: { ...profile.toObject(), userId: req.user.id },
      jobId,
      baseUrl: config.publicUrl,
    });

    await sendEmailViaAPI(user, mailOptions);

    // Audit log
    await logAudit({
      userId: req.user.id,
      action: AUDIT_ACTIONS.FOLLOWUP_SEND,
      resourceType: 'Job',
      resourceId: jobId,
      details: { to: job.emailRecipient, day },
      req,
      success: true,
    });

    followUp.sent = true;
    await job.save();

    res.json({ success: true, message: 'Follow up sent!' });
  } catch (err) {
    logger.error('[Jobs] Send Follow-up Error', { error: err.message });
    res.status(500).json({ error: 'Failed to send follow up' });
  }
};

const checkBounces = async (req, res) => {
  // IMAP Bounce Checker (Disabled for OAuth2 Multi-Tenant)
  // TODO: Refactor to use Gmail API instead of IMAP with App Passwords
  res.json({ newBounces: 0 });
};

module.exports = {
  getJobs,
  createJob,
  updateJob,
  deleteJob,
  fetchJobs,
  discoverEmail,
  generateEmail,
  sendEmail,
  singleDraft,
  testEmail,
  sendFollowup,
  checkBounces,
};
