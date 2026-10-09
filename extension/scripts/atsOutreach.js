// ATS Match Analysis, Recruiter Email Discovery, Cold Outreach & Cover Letter Controller
// Part of AI Job Copilot Chrome Extension

(() => {
  'use strict';


  // 13.5. ATS Match, Recruiter Outreach, Cover Letter & Persona Engine
  // =========================================================================

  let currentAtsScoreData = null;

  async function getActivePersona() {
    try {
      const data = await new Promise(r => chrome.storage.local.get(['ai_active_persona'], r));
      return data.ai_active_persona || 'fullstack';
    } catch (_) {
      return 'fullstack';
    }
  }

  async function initPersonaSwitcher() {
    const pSelect = document.getElementById('ai-persona-select');
    if (!pSelect) return;
    const persona = await getActivePersona();
    pSelect.value = persona;
    updatePersonaBadges(persona);

    pSelect.addEventListener('change', async (e) => {
      const selected = e.target.value;
      await chrome.storage.local.set({ ai_active_persona: selected });
      const personaLabels = {
        fullstack: 'Full-Stack Engineer',
        backend: 'Backend Engineer',
        frontend: 'Frontend Engineer',
        mobile: 'Mobile / ML Engineer'
      };
      showToast(`🎭 Switched persona to ${personaLabels[selected] || selected}`, 'info', 2500);
      updatePersonaBadges(selected);
      // Auto re-analyze ATS match if match tab is active
      const matchTab = document.getElementById('tab-match');
      if (matchTab && matchTab.classList.contains('active') && currentAtsScoreData) {
        analyzeAtsMatch();
      }
    });
  }

  function updatePersonaBadges(persona) {
    const personaLabels = {
      fullstack: 'Full-Stack',
      backend: 'Backend',
      frontend: 'Frontend',
      mobile: 'Mobile / ML'
    };
    const label = personaLabels[persona] || 'Full-Stack';
    const letterBadge = document.getElementById('ai-letter-persona-badge');
    if (letterBadge) letterBadge.textContent = label;
  }

  function initMatchTabUI() {
    try {
      const job = extractJobDetails();
      const roleElem = document.getElementById('ai-ats-target-role');
      const compElem = document.getElementById('ai-ats-target-company');
      if (roleElem) roleElem.textContent = job.role || 'Software Engineer';
      if (compElem) compElem.textContent = job.company || 'Target Company';

      // Pre-fill subject line if empty or if containing default placeholder
      const subjectInp = document.getElementById('ai-outreach-subject');
      const cName = cachedProfile?.name || cachedProfile?.firstName || 'Candidate';
      if (subjectInp && (!subjectInp.value || subjectInp.value.includes('Software Engineer - Your Name') || subjectInp.value.includes('Your Name'))) {
        subjectInp.value = `Application: ${job.role || 'Software Engineer'} – ${cName}`;
      }

      // Auto-attach detected email from page if present
      const emailInp = document.getElementById('ai-recruiter-email');
      const hint = document.getElementById('ai-email-hint');
      const badge = document.getElementById('ai-email-source-badge');
      if (emailInp && job.email) {
        if (!emailInp.value || emailInp.value === 'recruiter@company.com') {
          emailInp.value = job.email;
        }
        if (badge) {
          badge.style.display = 'inline-block';
          badge.textContent = 'Found on Page';
          badge.style.background = 'rgba(16, 185, 129, 0.2)';
          badge.style.color = '#34d399';
        }
        if (hint) {
          hint.textContent = `✓ Auto-attached contact email directly from this page: ${job.email}`;
          hint.style.color = '#34d399';
        }
      }

      // Auto-analyze once if not analyzed yet
      if (!currentAtsScoreData) {
        analyzeAtsMatch();
      }

      // Auto-draft cold outreach email if empty
      const bodyTa = document.getElementById('ai-outreach-body');
      if (bodyTa && !bodyTa.value) {
        draftOutreachEmail();
      }
    } catch (err) {
      console.warn('[AI Copilot] Error in initMatchTabUI:', err);
    }
  }

  async function analyzeAtsMatch() {
    const btn = document.getElementById('ai-btn-calc-match');
    const resultsBox = document.getElementById('ai-ats-results-box');
    const statusText = document.getElementById('ai-ats-status-text');
    const scoreBadge = document.getElementById('ai-ats-score-badge');
    const scoreNum = document.getElementById('ai-ats-score-num');
    const scoreCircle = document.getElementById('ai-ats-score-circle');
    const statsSub = document.getElementById('ai-ats-stats-sub');
    const matchedChips = document.getElementById('ai-matched-chips');
    const missingChips = document.getElementById('ai-missing-chips');
    const matchedCount = document.getElementById('ai-matched-count');
    const missingCount = document.getElementById('ai-missing-count');
    const adviceText = document.getElementById('ai-ats-advice-text');

    const job = extractJobDetails();
    const persona = await getActivePersona();

    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span>⏳</span><span>Scanning...</span>';
    }
    if (resultsBox) resultsBox.style.display = 'block';
    if (statusText) statusText.textContent = 'Analyzing skills & JD keywords...';

    try {
      const res = await safeMsg({
        action: 'CALCULATE_MATCH_SCORE',
        payload: {
          jobDescription: job.description,
          role: job.role,
          company: job.company,
          persona,
          profile: cachedProfile || {}
        }
      });

      if (res?.success) {
        currentAtsScoreData = res;
        const score = res.score || 70;
        if (scoreNum) scoreNum.textContent = `${score}%`;
        if (scoreBadge) {
          scoreBadge.textContent = `${score}% Match`;
          scoreBadge.style.display = 'inline-block';
        }

        // Color theme based on score
        let color = '#10b981'; // Green
        let statusMsg = 'Excellent Alignment!';
        if (score < 60) {
          color = '#f59e0b'; // Amber
          statusMsg = 'Actionable Gaps Detected';
        } else if (score < 80) {
          color = '#0284c7'; // Blue
          statusMsg = 'Strong Alignment';
        }

        if (scoreCircle) {
          scoreCircle.style.borderColor = color;
          scoreCircle.style.boxShadow = `0 0 16px ${color}33`;
        }
        if (statusText) {
          statusText.textContent = statusMsg;
          statusText.style.color = color;
        }
        if (statsSub) {
          statsSub.textContent = `${res.matchedCount || 0} of ${res.totalKeywordsCount || 0} core keywords matched`;
        }

        // Render matched chips
        if (matchedChips) {
          const matched = res.matchedKeywords || [];
          if (matchedCount) matchedCount.textContent = matched.length;
          if (matched.length > 0) {
            matchedChips.innerHTML = matched.map(kw => `
              <span class="ai-kw-chip ai-kw-matched">✓ ${escapeHtml(kw)}</span>
            `).join('');
          } else {
            matchedChips.innerHTML = '<span class="ai-empty-hint">No direct keyword overlap found.</span>';
          }
        }

        // Render missing chips
        if (missingChips) {
          const missing = res.missingKeywords || [];
          if (missingCount) missingCount.textContent = missing.length;
          if (missing.length > 0) {
            missingChips.innerHTML = missing.map(kw => `
              <span class="ai-kw-chip ai-kw-missing" title="Add this to your resume or cover letter">+ ${escapeHtml(kw)}</span>
            `).join('');
          } else {
            missingChips.innerHTML = '<span class="ai-kw-chip ai-kw-matched" style="background: rgba(16,185,129,0.1); border-color: rgba(16,185,129,0.25);">✓ All critical tech stack requirements covered!</span>';
          }
        }

        // Render advice
        if (adviceText) {
          adviceText.textContent = res.advice || 'Align your project bullet points with the required technologies to maximize automated pass rates.';
        }
      } else {
        if (statusText) statusText.textContent = 'Could not calculate score: ' + (res?.error || 'Unknown error');
      }
    } catch (err) {
      if (statusText) statusText.textContent = 'Score calculation error: ' + err.message;
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<span>⚡</span><span>Re-Analyze</span>';
      }
    }
  }

  async function discoverRecruiterEmail() {
    const btn = document.getElementById('ai-btn-find-email');
    const input = document.getElementById('ai-recruiter-email');
    const hint = document.getElementById('ai-email-hint');
    const badge = document.getElementById('ai-email-source-badge');

    const job = extractJobDetails();

    // Prioritize direct email found on the current job page
    if (job.email) {
      if (input) input.value = job.email;
      if (badge) {
        badge.style.display = 'inline-block';
        badge.textContent = 'Found on Page';
        badge.style.background = 'rgba(16, 185, 129, 0.2)';
        badge.style.color = '#34d399';
      }
      if (hint) {
        hint.textContent = `✓ Auto-attached contact email directly from this job posting: ${job.email}`;
        hint.style.color = '#34d399';
      }
      showToast(`✓ Attached email from page: ${job.email}`, 'success');
      return;
    }

    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span>⏳</span><span>Finding...</span>';
    }

    try {
      const res = await safeMsg({
        action: 'DISCOVER_EMAIL',
        payload: {
          company: job.company,
          role: job.role,
          jobDescription: job.description
        }
      });

      if (res?.success && res.email) {
        if (input) input.value = res.email;
        if (badge) {
          badge.style.display = 'inline-block';
          badge.textContent = res.source || 'Verified';
        }
        if (hint) {
          hint.textContent = `✓ Found contact email via ${res.source || 'company records'} (${res.confidence || 'verified'})`;
          hint.style.color = '#34d399';
        }
        showToast(`✓ Found email: ${res.email}`, 'success');
      } else {
        if (hint) {
          hint.textContent = 'Could not auto-detect email. Enter the recruiter email manually above.';
          hint.style.color = '#f59e0b';
        }
        showToast('No public recruiter email found on page. You can type it in.', 'info');
      }
    } catch (err) {
      if (hint) hint.textContent = 'Discovery failed: ' + err.message;
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<span>🔍</span><span>Find Email</span>';
      }
    }
  }

  async function draftOutreachEmail() {
    const btn = document.getElementById('ai-btn-draft-outreach');
    const subjectInp = document.getElementById('ai-outreach-subject');
    const bodyTa = document.getElementById('ai-outreach-body');

    const job = extractJobDetails();
    const persona = await getActivePersona();
    const candidateName = cachedProfile?.name || cachedProfile?.firstName || 'Candidate';

    // Auto-attach page email to input if not already populated
    const emailInp = document.getElementById('ai-recruiter-email');
    if (emailInp && !emailInp.value && job.email) {
      emailInp.value = job.email;
      const badge = document.getElementById('ai-email-source-badge');
      const hint = document.getElementById('ai-email-hint');
      if (badge) {
        badge.style.display = 'inline-block';
        badge.textContent = 'Found on Page';
        badge.style.background = 'rgba(16, 185, 129, 0.2)';
        badge.style.color = '#34d399';
      }
      if (hint) {
        hint.textContent = `✓ Auto-attached contact email from page: ${job.email}`;
        hint.style.color = '#34d399';
      }
    }

    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span>⏳</span><span>Drafting...</span>';
    }

    try {
      const res = await safeMsg({
        action: 'DRAFT_OUTREACH_EMAIL',
        payload: {
          company: job.company,
          role: job.role,
          jobDescription: job.description,
          persona,
          candidateName,
          profile: cachedProfile || {}
        }
      });

      if (res?.success) {
        if (subjectInp && res.subject) subjectInp.value = res.subject;
        if (bodyTa && res.body) {
          bodyTa.value = res.body;
          updateOutreachStats();
        }
        showToast('✓ Cold outreach drafted! You can edit it before sending.', 'success');
      } else {
        showToast(res?.error || 'Failed to draft email', 'error');
      }
    } catch (err) {
      showToast('Drafting error: ' + err.message, 'error');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<span>✨</span><span>Re-Draft Email</span>';
      }
    }
  }

  function updateOutreachStats() {
    const bodyTa = document.getElementById('ai-outreach-body');
    const countSpan = document.getElementById('ai-outreach-word-count');
    if (!bodyTa || !countSpan) return;
    const text = bodyTa.value.trim();
    const words = text ? text.split(/\s+/).filter(Boolean).length : 0;
    countSpan.textContent = `${words} words`;
    if (words >= 75 && words <= 160) {
      countSpan.style.color = '#34d399';
    } else if (words > 200) {
      countSpan.style.color = '#f59e0b';
    } else {
      countSpan.style.color = '#94a3b8';
    }
  }

  async function sendDirectOutreachEmail() {
    const emailInp = document.getElementById('ai-recruiter-email');
    const subjectInp = document.getElementById('ai-outreach-subject');
    const bodyTa = document.getElementById('ai-outreach-body');
    const sendBtn = document.getElementById('ai-btn-send-outreach');
    const statusBox = document.getElementById('ai-outreach-status-box');

    const recipient = (emailInp?.value || '').trim();
    const subject = (subjectInp?.value || '').trim();
    const body = (bodyTa?.value || '').trim();
    const job = extractJobDetails();

    if (!recipient || !recipient.includes('@') || !recipient.includes('.')) {
      if (emailInp) emailInp.focus();
      showToast('Please enter a valid recipient email address first', 'error');
      return;
    }
    if (!subject) {
      if (subjectInp) subjectInp.focus();
      showToast('Please enter an email subject', 'error');
      return;
    }
    if (!body) {
      if (bodyTa) bodyTa.focus();
      showToast('Please draft or enter the email body before sending', 'error');
      return;
    }

    if (sendBtn) {
      sendBtn.disabled = true;
      sendBtn.innerHTML = '<span>⏳</span><span>Sending Email with CV...</span>';
    }
    if (statusBox) {
      statusBox.style.display = 'block';
      statusBox.style.background = 'rgba(56, 189, 248, 0.1)';
      statusBox.style.color = '#38bdf8';
      statusBox.textContent = 'Connecting to email dispatcher and attaching CV...';
    }

    try {
      const res = await safeMsg({
        action: 'SEND_OUTREACH_EMAIL',
        payload: {
          recipientEmail: recipient,
          subject,
          body,
          company: job.company,
          role: job.role,
          url: window.location.href
        }
      });

      if (res?.success) {
        if (statusBox) {
          statusBox.style.background = 'rgba(16, 185, 129, 0.15)';
          statusBox.style.color = '#34d399';
          statusBox.innerHTML = `✓ <strong>Email Delivered!</strong> Sent to <code>${escapeHtml(recipient)}</code> with your verified resume PDF attached. Application logged to dashboard.`;
        }
        if (sendBtn) {
          sendBtn.innerHTML = '<span>✓</span><span>Email Sent!</span>';
          sendBtn.style.background = 'linear-gradient(135deg, #059669, #10b981)';
        }
        showToast(`✓ Email sent to ${recipient}!`, 'success', 4000);
      } else {
        if (statusBox) {
          statusBox.style.background = 'rgba(239, 68, 68, 0.15)';
          statusBox.style.color = '#f87171';
          statusBox.innerHTML = `⚠ Failed: ${escapeHtml(res?.error || 'Email could not be dispatched')}. You can use "Open in Gmail" below as fallback.`;
        }
        if (sendBtn) {
          sendBtn.disabled = false;
          sendBtn.innerHTML = '<span>🚀</span><span>Retry Sending Email</span>';
        }
        showToast(res?.error || 'Failed to send email', 'error');
      }
    } catch (err) {
      if (statusBox) {
        statusBox.style.background = 'rgba(239, 68, 68, 0.15)';
        statusBox.style.color = '#f87171';
        statusBox.textContent = 'Error: ' + err.message;
      }
      if (sendBtn) {
        sendBtn.disabled = false;
        sendBtn.innerHTML = '<span>🚀</span><span>Retry Sending Email</span>';
      }
    }
  }

  function formatDraftToHtml(text) {
    if (!text) return '';
    let html = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // Convert markdown links [Label](url) into styled clickable HTML anchors
    html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/gi, (m, label, url) => {
      const cleanUrl = url.trim();
      const cleanLabel = label.trim();
      return `<a href="${cleanUrl}" target="_blank" style="color: #1155cc; text-decoration: underline; font-weight: 500;">${cleanLabel}</a>`;
    });

    return html.replace(/\n/g, '<br/>');
  }

  async function openInGmailDraft() {
    const emailInp = document.getElementById('ai-recruiter-email');
    const subjectInp = document.getElementById('ai-outreach-subject');
    const bodyTa = document.getElementById('ai-outreach-body');

    const to = (emailInp?.value || '').trim();
    const su = (subjectInp?.value || '').trim();
    const body = (bodyTa?.value || '').trim();

    // Auto-copy rich HTML to clipboard so user can also Ctrl+V directly if preferred
    try {
      const htmlBody = formatDraftToHtml(body);
      const blobHtml = new Blob([htmlBody], { type: 'text/html' });
      const blobText = new Blob([body], { type: 'text/plain' });
      await navigator.clipboard.write([
        new ClipboardItem({ 'text/html': blobHtml, 'text/plain': blobText })
      ]);
    } catch (_) {}

    const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(to)}&su=${encodeURIComponent(su)}&body=${encodeURIComponent(body)}`;
    window.open(gmailUrl, '_blank');
    showToast('✉️ Opening Gmail draft... (Hyperlinks auto-formatted)', 'info');
  }

  async function copyOutreachEmail() {
    const su = (document.getElementById('ai-outreach-subject')?.value || '').trim();
    const body = (document.getElementById('ai-outreach-body')?.value || '').trim();
    const plainText = `Subject: ${su}\n\n${body}`;

    try {
      const htmlBody = `<div><strong>Subject: ${su}</strong><br/><br/>${formatDraftToHtml(body)}</div>`;
      const blobHtml = new Blob([htmlBody], { type: 'text/html' });
      const blobText = new Blob([plainText], { type: 'text/plain' });
      await navigator.clipboard.write([
        new ClipboardItem({ 'text/html': blobHtml, 'text/plain': blobText })
      ]);
      showToast('📋 Copied with clickable hyperlinks (LinkedIn, GitHub, Portfolio)!', 'success');
    } catch (e) {
      navigator.clipboard.writeText(plainText);
      showToast('📋 Outreach message copied to clipboard!', 'success');
    }
  }

  // ── Cover Letter Methods ───────────────────────────────────────────────────
  function initCoverLetterTabUI() {
    try {
      getActivePersona().then(p => updatePersonaBadges(p));
      const text = document.getElementById('ai-cover-letter-text')?.value?.trim();
      if (!text) {
        generateCoverLetter();
      }
    } catch (err) {
      console.warn('[AI Copilot] Error in initCoverLetterTabUI:', err);
    }
  }

  async function resolveCandidateProfileForLetter() {
    let p = window.AiCopilotState?.cachedProfile || cachedProfile;
    if (!p || !p.name || p.name === 'Candidate Name' || p.name === 'Candidate') {
      try {
        const pRes = await safeMsg({ action: 'GET_PROFILE' });
        if (pRes?.profile) {
          cachedProfile = pRes.profile;
          p = pRes.profile;
        }
      } catch (_) {}
    }

    // Check sidebar profile input values if loaded in DOM
    const nameFromInput = (document.getElementById('prof-name')?.value || 
      [document.getElementById('prof-firstName')?.value, document.getElementById('prof-lastName')?.value].filter(Boolean).join(' ') || '').trim();
    const emailFromInput = (document.getElementById('prof-email')?.value || '').trim();
    const phoneFromInput = (document.getElementById('prof-phone')?.value || '').trim();
    const locationFromInput = (document.getElementById('prof-location')?.value || 
      [document.getElementById('prof-city')?.value, document.getElementById('prof-state')?.value].filter(Boolean).join(', ') || '').trim();

    const name = nameFromInput || p?.name || [p?.firstName, p?.lastName].filter(Boolean).join(' ') || 'Candidate';
    const address = locationFromInput || p?.location || [p?.city, p?.state, p?.country].filter(Boolean).join(', ') || p?.addressLine1 || '';
    const contact = [emailFromInput || p?.email, phoneFromInput || p?.phone].filter(Boolean).join(' | ');

    return { name, address, contact };
  }

  async function generateCoverLetter() {
    const btn = document.getElementById('ai-btn-gen-cover-letter');
    const textTa = document.getElementById('ai-cover-letter-text');
    const job = extractJobDetails();
    const persona = await getActivePersona();
    const candidate = await resolveCandidateProfileForLetter();

    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span>⏳</span><span>Generating Tailored Letter...</span>';
    }

    try {
      const res = await safeMsg({
        action: 'GENERATE_COVER_LETTER',
        payload: {
          company: job.company,
          role: job.role,
          jobDescription: job.description,
          persona,
          candidateName: candidate.name,
          profile: cachedProfile || {}
        }
      });

      if (res?.success && res.coverLetter) {
        if (textTa) {
          textTa.value = res.coverLetter;
          updateCoverLetterStats();
        }
        if (res.candidateName) {
          if (!cachedProfile) cachedProfile = {};
          cachedProfile.name = res.candidateName;
          if (res.candidateEmail) cachedProfile.email = res.candidateEmail;
          if (res.candidatePhone) cachedProfile.phone = res.candidatePhone;
          if (res.candidateLocation) cachedProfile.location = res.candidateLocation;
        }
        showToast('✓ Tailored cover letter generated!', 'success');
      } else {
        showToast(res?.error || 'Failed to generate cover letter', 'error');
      }
    } catch (err) {
      showToast('Cover letter error: ' + err.message, 'error');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<span>⚡</span><span>Regenerate Letter</span>';
      }
    }
  }

  function updateCoverLetterStats() {
    const textTa = document.getElementById('ai-cover-letter-text');
    const statsSpan = document.getElementById('ai-cover-letter-stats');
    if (!textTa || !statsSpan) return;
    const text = textTa.value.trim();
    const words = text ? text.split(/\s+/).filter(Boolean).length : 0;
    const chars = text.length;
    statsSpan.textContent = `${words} words • ${chars} chars`;
  }

  async function downloadCoverLetterPdfDirect() {
    const rawBody = (document.getElementById('ai-cover-letter-text')?.value || '').trim();
    if (!rawBody) {
      showToast('Please generate or write your cover letter first', 'error');
      return;
    }

    const job = extractJobDetails();
    const candidate = await resolveCandidateProfileForLetter();
    const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    if (window.CoverLetterTemplate?.downloadCoverLetterPdf) {
      const fileName = window.CoverLetterTemplate.downloadCoverLetterPdf({
        name: candidate.name,
        address: candidate.address,
        contact: candidate.contact,
        date,
        company: job.company,
        role: job.role,
        rawBody
      });
      showToast(`✓ Downloaded ${fileName}`, 'success');
    } else {
      showToast('Cover letter module loading, please retry', 'info');
    }
  }

  async function printCoverLetterHtml() {
    const rawBody = (document.getElementById('ai-cover-letter-text')?.value || '').trim();
    if (!rawBody) {
      showToast('Please generate or write your cover letter first', 'error');
      return;
    }

    const job = extractJobDetails();
    const candidate = await resolveCandidateProfileForLetter();
    const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    if (window.CoverLetterTemplate?.printCoverLetterHtml) {
      window.CoverLetterTemplate.printCoverLetterHtml({
        name: candidate.name,
        address: candidate.address,
        contact: candidate.contact,
        date,
        company: job.company,
        role: job.role,
        rawBody
      });
      showToast('🖨️ Opening print preview...', 'info', 2500);
    } else {
      showToast('Cover letter module loading, please retry', 'info');
    }
  }

  async function downloadCoverLetterTxt() {
    const rawBody = (document.getElementById('ai-cover-letter-text')?.value || '').trim();
    if (!rawBody) {
      showToast('Cover letter is empty', 'error');
      return;
    }

    const job = extractJobDetails();
    const candidate = await resolveCandidateProfileForLetter();
    const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    if (window.CoverLetterTemplate?.downloadCoverLetterTxt) {
      const fileName = window.CoverLetterTemplate.downloadCoverLetterTxt({
        name: candidate.name,
        address: candidate.address,
        contact: candidate.contact,
        date,
        company: job.company,
        role: job.role,
        rawBody
      });
      showToast(`📄 Downloaded ${fileName}`, 'success');
    }
  }

  function copyCoverLetter() {
    const letter = (document.getElementById('ai-cover-letter-text')?.value || '').trim();
    if (!letter) {
      showToast('Cover letter is empty', 'error');
      return;
    }
    navigator.clipboard.writeText(letter);
    showToast('📋 Cover letter copied to clipboard!', 'success');
  }


  // Export to window and window.AiCopilot
  window.getActivePersona = getActivePersona;
  window.initPersonaSwitcher = initPersonaSwitcher;
  window.updatePersonaBadges = updatePersonaBadges;
  window.initMatchTabUI = initMatchTabUI;
  window.analyzeAtsMatch = analyzeAtsMatch;
  window.discoverRecruiterEmail = discoverRecruiterEmail;
  window.draftOutreachEmail = draftOutreachEmail;
  window.updateOutreachStats = updateOutreachStats;
  window.sendDirectOutreachEmail = sendDirectOutreachEmail;
  window.openInGmailDraft = openInGmailDraft;
  window.copyOutreachEmail = copyOutreachEmail;
  window.initCoverLetterTabUI = initCoverLetterTabUI;
  window.generateCoverLetter = generateCoverLetter;
  window.updateCoverLetterStats = updateCoverLetterStats;
  window.downloadCoverLetterPdfDirect = downloadCoverLetterPdfDirect;
  window.printCoverLetterHtml = printCoverLetterHtml;
  window.downloadCoverLetterTxt = downloadCoverLetterTxt;
  window.copyCoverLetter = copyCoverLetter;

  window.AiCopilot = window.AiCopilot || {};
  Object.assign(window.AiCopilot, {
    getActivePersona,
    initPersonaSwitcher,
    updatePersonaBadges,
    initMatchTabUI,
    analyzeAtsMatch,
    discoverRecruiterEmail,
    draftOutreachEmail,
    updateOutreachStats,
    sendDirectOutreachEmail,
    openInGmailDraft,
    copyOutreachEmail,
    initCoverLetterTabUI,
    generateCoverLetter,
    updateCoverLetterStats,
    downloadCoverLetterPdfDirect,
    printCoverLetterHtml,
    downloadCoverLetterTxt,
    copyCoverLetter
  });
})();
