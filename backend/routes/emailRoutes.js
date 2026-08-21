const express = require('express');
const router = express.Router();
const axios = require('axios');
const Job = require('../models/Job');
const User = require('../models/User');
const Profile = require('../models/Profile');
const requireAuth = require('../middleware/requireAuth');
const { callAIWithRetry } = require('../utils/ai');
const { sendEmailViaAPI, discoverEmailForJob, getInboxReplies } = require('../utils/email');
const { generateTailoredResumePDF } = require('../utils/pdfGenerator');

async function getProfile(userId) {
  let profile = await Profile.findOne({ userId });
  if (!profile) {
    profile = new Profile({ userId });
    await profile.save();
  }
  return profile;
}

router.post('/discover-email', requireAuth, async (req, res) => {
  const { company, jd, failedEmails = [] } = req.body;
  if (!company) return res.status(400).json({ error: 'Company name required' });
  
  let domain = company.toLowerCase().replace(/[^a-z0-9]/g, '') + '.com';
  try {
    const clearbitRes = await axios.get(`https://autocomplete.clearbit.com/v1/companies/suggest?query=${encodeURIComponent(company)}`);
    if (clearbitRes.data && clearbitRes.data.length > 0) {
      domain = clearbitRes.data[0].domain;
    }
  } catch (err) { }

  const result = await discoverEmailForJob(company, domain, jd, failedEmails, callAIWithRetry);
  res.json(result);
});

router.post('/generate-email', requireAuth, async (req, res) => {
  const { company, role, type, jd } = req.body;

  try {
    const profile = await getProfile(req.user.id);
    const tone = profile.tone || 'Professional';
    const skillsText = profile.skills && profile.skills.length > 0 ? `Core Skills: ${profile.skills.join(', ')}` : '';
    const achText = profile.achievements && profile.achievements.length > 0 ? `Key Achievements:\n- ${profile.achievements.join('\n- ')}` : '';

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
${profile.aiInstructions ? `\nEXTRA CUSTOM INSTRUCTIONS:\n${profile.aiInstructions}` : ''}

COMPANY: [Extracted Company Name or "Unknown Company"]
ROLE: [Extracted Job Title or "General Position"]
BODY:
[If company is unknown/generic, start with: Dear Hiring Manager,]
[Otherwise start with: Dear Hiring Manager at [Extracted Company Name],]

[Start of email body without any conversational filler or markdown blocks]`;

    const response = await callAIWithRetry(prompt);
    let rawText = response.text.replace(/```(?:html|json|markdown)?\s*([\s\S]*?)```/g, '$1').trim();

    let extractedCompany = company;
    let extractedRole = role;
    let draftText = rawText;

    const companyMatch = rawText.match(/COMPANY:\s*(.*)/i);
    const roleMatch = rawText.match(/ROLE:\s*(.*)/i);
    const bodyMatch = rawText.match(/BODY:\s*([\s\S]*)/i);

    if (companyMatch) extractedCompany = companyMatch[1].trim() || extractedCompany;
    if (roleMatch) extractedRole = roleMatch[1].trim() || extractedRole;
    if (bodyMatch) draftText = bodyMatch[1].trim();

    const emailStartMatch = draftText.match(/(?:Here is the email.*?:|Here's the email.*?:|Here is the cold email.*?:|Subject:.*?\n)\n*/i);
    if (emailStartMatch) {
      draftText = draftText.substring(emailStartMatch.index + emailStartMatch[0].length);
    }
    draftText = draftText.trim();

    res.json({ draft: draftText, company: extractedCompany, role: extractedRole });
  } catch (error) {
    console.error('Error generating email:', error);
    res.status(500).json({ error: 'Failed to generate email' });
  }
});

router.post('/send-email', requireAuth, async (req, res) => {
  const { jobId, to, subject, body } = req.body;

  try {
    const job = await Job.findOne({ id: jobId, userId: req.user.id });
    const profile = await getProfile(req.user.id);
    const user = await User.findById(req.user.id);

    const baseUrl = process.env.PUBLIC_URL;

    const trackClick = (url) => (baseUrl && url) ? `${baseUrl}/api/track-click/${jobId}?url=${encodeURIComponent(url)}` : (url || '');
    const linkedInUrl = trackClick(profile.linkedin);
    const githubUrl = trackClick(profile.github);
    const trackingPixel = baseUrl ? `<img src="${baseUrl}/api/track-open/${jobId}" width="1" height="1" style="display:none;" />` : '';

    let formattedDraft = body.replace(/\n/g, '<br/>');
    formattedDraft = formattedDraft.replace('You can view my CV here.', 'I have attached my CV to this email for your reference.');

    const htmlBody = `
      <div style="font-family: Arial, sans-serif; font-size: 14px; color: #333; line-height: 1.6;">
        ${formattedDraft}
        <br/><br/>
        Yours Sincerely,<br/>
        <b>${profile.name}</b><br/>
        ${profile.title}<br/>
        📞 ${profile.phone}<br/>
        🔗 <a href="${linkedInUrl}">LinkedIn</a> | 💻 <a href="${githubUrl}">GitHub</a>
        <br/>
        ${trackingPixel}
      </div>
    `;

    const mailOptions = {
      from: user.email || process.env.EMAIL_USER,
      to: (to || '').trim(),
      subject: subject || (job ? `Application for ${job.role} - ${profile.name}` : 'Job Application'),
      html: htmlBody,
      attachments: []
    };

    try {
      if (profile.resumeText || profile.skills?.length > 0) {
        const pdfBuffer = await generateTailoredResumePDF(profile, job ? job.role : 'Software Engineer', job ? job.jd : '');
        mailOptions.attachments.push({ filename: `${profile.name.replace(/\s+/g, '_')}_CV.pdf`, content: pdfBuffer });
      } else if (profile.resumePdf) {
        mailOptions.attachments.push({ filename: profile.resumeFilename || 'resume.pdf', content: profile.resumePdf });
      }
    } catch (pdfErr) {
      console.error('Failed to generate tailored PDF, falling back to original:', pdfErr);
      if (profile.resumePdf) {
        mailOptions.attachments.push({ filename: profile.resumeFilename || 'resume.pdf', content: profile.resumePdf });
      }
    }

    const info = await sendEmailViaAPI(user, mailOptions);
    
    if (job) {
      job.status = 'Sent';
      job.sentAt = new Date();
      job.tracked = !!baseUrl;
      job.emailDraft = body; // Save the final draft sent
      if (to && to !== job.emailRecipient) {
        job.emailRecipient = to; // Update if changed manually
      }
      await job.save();
    }

    res.json({ success: true, tracked: !!baseUrl, message: 'Email sent successfully!', messageId: info.messageId });
  } catch (error) {
    console.error('Error sending email:', error);
    res.status(500).json({ error: 'Failed to send email. Check credentials.' });
  }
});

router.post('/single-draft', requireAuth, async (req, res) => {
  const { company, role, jd, recipientEmail } = req.body;

  try {
    const profile = await getProfile(req.user.id);
    const user = await User.findById(req.user.id);

    const tone = profile.tone || 'Professional';
    const skillsText = profile.skills && profile.skills.length > 0 ? `Core Skills: ${profile.skills.join(', ')}` : '';
    const achText = profile.achievements && profile.achievements.length > 0 ? `Key Achievements:\n- ${profile.achievements.join('\n- ')}` : '';

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
${profile.aiInstructions ? `\nEXTRA CUSTOM INSTRUCTIONS:\n${profile.aiInstructions}` : ''}

COMPANY: [Extracted Company Name or "Unknown Company"]
ROLE: [Extracted Job Title or "General Position"]
BODY:
[If company is unknown/generic, start with: Dear Hiring Manager,]
[Otherwise start with: Dear Hiring Manager at [Extracted Company Name],]

[Start of email body without any conversational filler or markdown blocks]`;

    const response = await callAIWithRetry(prompt);
    let rawText = response.text.replace(/```(?:html|json|markdown)?\s*([\s\S]*?)```/g, '$1').trim();

    let extractedCompany = company || 'Unknown Company';
    let extractedRole = role || 'General Position';
    let draftText = rawText;

    const companyMatch = rawText.match(/COMPANY:\s*(.*)/i);
    const roleMatch = rawText.match(/ROLE:\s*(.*)/i);
    const bodyMatch = rawText.match(/BODY:\s*([\s\S]*)/i);

    if (companyMatch) extractedCompany = companyMatch[1].trim() || extractedCompany;
    if (roleMatch) extractedRole = roleMatch[1].trim() || extractedRole;
    if (bodyMatch) draftText = bodyMatch[1].trim();

    const emailStartMatch = draftText.match(/(?:Here is the email.*?:|Here's the email.*?:|Here is the cold email.*?:|Subject:.*?\n)\n*/i);
    if (emailStartMatch) {
      draftText = draftText.substring(emailStartMatch.index + emailStartMatch[0].length).trim();
    }

    const baseUrl = process.env.PUBLIC_URL;
    let formattedDraft = draftText.replace(/\n/g, '<br/>');

    const jobId = Date.now().toString() + Math.random().toString().substring(2, 6);
    const trackClick = (url) => (baseUrl && url) ? `${baseUrl}/api/track-click/${jobId}?url=${encodeURIComponent(url)}` : (url || '');
    const trackingPixel = baseUrl ? `<img src="${baseUrl}/api/track-open/${jobId}" width="1" height="1" style="display:none;" />` : '';


    formattedDraft = formattedDraft.replace('You can view my CV here.', 'I have attached my CV to this email for your reference.');

    const linkedInUrl = trackClick(profile.linkedin);
    const githubUrl = trackClick(profile.github);
    const htmlBody = `
      <div style="font-family: Arial, sans-serif; font-size: 14px; color: #333; line-height: 1.6;">
        ${formattedDraft}
        <br/><br/>
        Yours Sincerely,<br/>
        <b>${profile.name}</b><br/>
        ${profile.title}<br/>
        📞 ${profile.phone}<br/>
        🔗 <a href="${linkedInUrl}">LinkedIn</a> | 💻 <a href="${githubUrl}">GitHub</a>
        <br/>
        ${trackingPixel}
      </div>
    `;

    const mailOptions = {
      from: user.email || process.env.EMAIL_USER,
      to: recipientEmail,
      subject: `Application for ${extractedRole} - ${profile.name}`,
      html: htmlBody,
      attachments: []
    };

    try {
      if (profile.resumeText || profile.skills?.length > 0) {
        const pdfBuffer = await generateTailoredResumePDF(profile, extractedRole, jd);
        mailOptions.attachments.push({ filename: `${profile.name.replace(/\s+/g, '_')}_CV.pdf`, content: pdfBuffer });
      } else if (profile.resumePdf) {
        mailOptions.attachments.push({ filename: profile.resumeFilename || 'resume.pdf', content: profile.resumePdf });
      }
    } catch (pdfErr) {
      console.error('Failed to generate tailored PDF, falling back to original:', pdfErr);
      if (profile.resumePdf) {
        mailOptions.attachments.push({ filename: profile.resumeFilename || 'resume.pdf', content: profile.resumePdf });
      }
    }

    await sendEmailViaAPI(user, mailOptions);

    const newJob = new Job({
      userId: req.user.id,
      id: jobId,
      company: extractedCompany,
      role: extractedRole,
      jd: jd,
      status: 'Sent',
      emailRecipient: recipientEmail,
      emailDraft: draftText,
      tracked: !!baseUrl,
      sentAt: new Date()
    });
    await newJob.save();

    res.json({ success: true, message: 'Email sent and job tracked!', job: newJob });
  } catch (error) {
    console.error('Error in Single Mail Drafter:', error);
    res.status(500).json({ error: 'Failed to draft and send email.' });
  }
});

router.post('/test-email', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    const profile = await getProfile(req.user.id);
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
6. OUTPUT STRICTLY the final email content (body only, no signature, no name). No conversational filler, no internal thoughts, no analysis, and NO MARKDOWN BLOCKS (like \`\`\`email).
7. CRITICAL: The very first word of your output MUST be "Dear", "Hi", or the start of the email body. NEVER write "I have crafted...", "Here is the email...", or any conversational intro. Any intro text will break our automated pipeline.
${profile.aiInstructions ? `\nEXTRA CUSTOM INSTRUCTIONS:\n${profile.aiInstructions}` : ''}`;

    const response = await callAIWithRetry(prompt);

    let draftText = response.text;
    const emailStartMatch = draftText.match(/(?:Here is the email.*?:|Here's the email.*?:|Here is the cold email.*?:|Subject:.*?\n)\n*/i);
    if (emailStartMatch) {
      draftText = draftText.substring(emailStartMatch.index + emailStartMatch[0].length);
    }
    draftText = draftText.trim();

    const baseUrl = process.env.PUBLIC_URL;
    const testJobId = Date.now().toString();
    const trackClick = (url) => (baseUrl && url) ? `${baseUrl}/api/track-click/${testJobId}?url=${encodeURIComponent(url)}` : (url || '');
    const trackingPixel = baseUrl ? `<img src="${baseUrl}/api/track-open/${testJobId}" width="1" height="1" style="display:none;" />` : '';

    let formattedDraft = draftText.replace(/\n/g, '<br/>');
    formattedDraft = formattedDraft.replace('You can view my CV here.', 'I have attached my CV to this email for your reference.');

    const htmlBody = `
      <div style="font-family: Arial, sans-serif; font-size: 14px; color: #333; line-height: 1.6;">
        ${formattedDraft}
        <br/><br/>
        Yours Sincerely,<br/>
        <b>${profile.name}</b><br/>
        ${profile.title}<br/>
        📞 ${profile.phone}<br/>
        🔗 <a href="${trackClick(profile.linkedin)}">LinkedIn</a> | 💻 <a href="${trackClick(profile.github)}">GitHub</a>
        <br/>
        ${trackingPixel}
      </div>
    `;

    const mailOptions = {
      from: myEmail,
      to: myEmail,
      subject: `[TEST EMAIL] Application for ${role} at ${company}`,
      html: htmlBody,
      attachments: []
    };

    try {
      if (profile.resumeText || profile.skills?.length > 0) {
        const pdfBuffer = await generateTailoredResumePDF(profile, role, jd);
        mailOptions.attachments.push({ filename: `${profile.name.replace(/\s+/g, '_')}_CV.pdf`, content: pdfBuffer });
      } else if (profile.resumePdf) {
        mailOptions.attachments.push({ filename: profile.resumeFilename || 'resume.pdf', content: profile.resumePdf });
      }
    } catch (pdfErr) {
      console.error('Failed to generate tailored PDF, falling back to original:', pdfErr);
      if (profile.resumePdf) {
        mailOptions.attachments.push({ filename: profile.resumeFilename || 'resume.pdf', content: profile.resumePdf });
      }
    }

    await sendEmailViaAPI(user, mailOptions);

    const testJob = new Job({
      userId: req.user.id,
      id: testJobId,
      company: company,
      role: role,
      jd: jd,
      status: 'Sent',
      emailDraft: draftText,
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

router.get('/inbox', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user || !user.googleRefreshToken) {
      return res.status(400).json({ error: 'No Google account connected.' });
    }

    // Get all unique HR emails we've sent to
    const jobs = await Job.find({ userId: req.user.id, emailRecipient: { $exists: true, $ne: null } });
    const hrEmails = [...new Set(jobs.map(j => j.emailRecipient))];

    if (hrEmails.length === 0) {
      return res.json({ replies: [] });
    }

    const replies = await getInboxReplies(user, hrEmails);
    res.json({ replies });
  } catch (err) {
    console.error('Error fetching inbox:', err);
    res.status(500).json({ error: 'Failed to fetch inbox replies' });
  }
});

router.post('/inbox/draft-reply', requireAuth, async (req, res) => {
  try {
    const { from, subject, body } = req.body;
    const profile = await getProfile(req.user.id);

    const prompt = `You are an elite software engineer named ${profile.name}. 
You just received the following reply from a hiring manager/recruiter:
From: ${from}
Subject: ${subject}
Message:
"""
${body}
"""

Please draft 3 distinct, highly professional, and concise replies to this email. 
Separate each draft using the exact delimiter "===DRAFT===" on its own line.
Do not include any conversational text, internal thoughts, JSON, or markdown blocks. Just the 3 drafts separated by the delimiter.`;

    const response = await callAIWithRetry(prompt, 3, 2000);
    let rawText = response.text.replace(/```(?:html|json|markdown)?\s*([\s\S]*?)```/g, '$1').trim();
    
    let draftOptions = rawText.split('===DRAFT===').map(s => s.trim()).filter(s => s.length > 20).slice(0, 3);
    
    // Fallback just in case it still uses newlines
    if (draftOptions.length < 2) {
      const fallbackOptions = rawText.split(/\n\s*\n/).map(s => s.trim()).filter(s => s.length > 20);
      if (fallbackOptions.length >= 2) {
        draftOptions = fallbackOptions.slice(0, 3);
      }
    }

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

    const formattedDraft = body.replace(/\n/g, '<br/>');
    
    const htmlBody = `
      <div style="font-family: Arial, sans-serif; font-size: 14px; color: #333; line-height: 1.6;">
        ${formattedDraft}
        <br/><br/>
        Yours Sincerely,<br/>
        <b>${profile.name}</b><br/>
        ${profile.title}<br/>
        📞 ${profile.phone}
      </div>
    `;

    const mailOptions = {
      from: user.email || process.env.EMAIL_USER,
      to,
      subject: subject.startsWith('Re:') ? subject : `Re: ${subject}`,
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

module.exports = router;
