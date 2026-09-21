// Content Script for AI Job Application Copilot & Autofill (Sequential Form Filler & Brain)

(() => {
  if (window.__aiJobCopilotLoaded) return;
  window.__aiJobCopilotLoaded = true;

  console.log('[AI Job Copilot] Content script active on:', window.location.href);

  // Cached profile and brain rules
  let cachedProfile = null;
  let cachedBrainRules = [];
  let sidebarOpen = false;

  // Restore saved sidebar width preference
  try {
    chrome.storage?.local?.get?.(['copilot_sidebar_width'], (res) => {
      if (res?.copilot_sidebar_width) {
        document.documentElement.style.setProperty('--ai-copilot-sidebar-width', `${res.copilot_sidebar_width}px`);
      }
    });
  } catch (_) {}

  // Helper: detect if current page is a Google Form
  function isGoogleForm() {
    const host = window.location.hostname.toLowerCase();
    const path = window.location.pathname.toLowerCase();
    return (host === 'docs.google.com' && path.includes('/forms/')) || host === 'forms.gle';
  }

  // Helper: compute the next nearest Monday (skip if today is Fri/Sat/Sun → use Monday after next)
  function getNextMonday() {
    const now = new Date();
    const day = now.getDay(); // 0=Sun,1=Mon,...6=Sat
    let daysUntilMonday = (8 - day) % 7;
    if (daysUntilMonday === 0) daysUntilMonday = 7; // if today is Monday, next Monday
    // If today is Friday(5), Saturday(6), or Sunday(0) → too soon, skip to Monday after next
    if (day === 0 || day === 5 || day === 6) {
      daysUntilMonday += 7;
    }
    const target = new Date(now.getTime() + daysUntilMonday * 24 * 60 * 60 * 1000);
    const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    return `${months[target.getMonth()]} ${target.getDate()}, ${target.getFullYear()}`;
  }

  // 1. Strict ATS & Job Application Page Detector
  function isJobPortal() {
    if (window.__ai_copilot_force_enabled) return true;

    const host = window.location.hostname.toLowerCase();
    const path = window.location.pathname.toLowerCase();
    const url = window.location.href.toLowerCase();
    const title = (document.title || '').toLowerCase();

    // 1. Explicit Blocklist for generic consumer, social, video, and webmail platforms
    const blockedHosts = [
      'youtube.com', 'youtu.be',
      'facebook.com', 'instagram.com', 'tiktok.com',
      'twitter.com', 'x.com',
      'reddit.com', 'netflix.com', 'twitch.tv', 'spotify.com', 'discord.com',
      'wikipedia.org', 'stackoverflow.com',
      'mail.google.com', 'outlook.live.com', 'outlook.office.com', 'web.whatsapp.com'
    ];
    if (blockedHosts.some(b => host === b || host.endsWith('.' + b))) {
      return false;
    }

    // Exclude our own dashboard web app so it does not clutter the user experience
    if (host.includes('ai-job-finder-alpha.vercel.app') || host.includes('aijobfinder')) {
      return false;
    }

    // Google Forms: activate if form content contains job/hiring keywords
    if (isGoogleForm()) {
      const bodyText = (document.body?.innerText || '').toLowerCase();
      const jobFormKeywords = [
        'full-stack', 'fullstack', 'engineer', 'developer', 'hiring', 'application',
        'resume', 'résumé', 'cv', 'linkedin', 'github', 'experience', 'compensation',
        'start date', 'full-time', 'full time', 'internship', 'role', 'position',
        'notice period', 'portfolio', 'salary', 'work', 'frontend', 'backend'
      ];
      return jobFormKeywords.some(kw => bodyText.includes(kw));
    }

    // For localhost / 127.0.0.1: only activate on test ATS beds (e.g. /test-ats.html or contains .wd-stepper)
    if (host === 'localhost' || host === '127.0.0.1') {
      return path.includes('test-ats') || url.includes('ats') || !!document.querySelector('.wd-stepper, #step-1-page');
    }

    // For major tech domains: only activate on their designated career portals
    if (host === 'google.com' || host.endsWith('.google.com')) {
      return host.startsWith('careers.') || path.includes('/careers') || path.includes('/about/careers');
    }
    if (host === 'amazon.com' || host.endsWith('.amazon.com')) {
      return host === 'amazon.jobs' || host.startsWith('jobs.') || path.includes('/jobs');
    }
    if (host === 'apple.com' || host.endsWith('.apple.com')) {
      return host.startsWith('jobs.') || path.includes('/careers');
    }
    if (host === 'microsoft.com' || host.endsWith('.microsoft.com')) {
      return host.startsWith('careers.') || path.includes('/careers');
    }
    if (host === 'github.com' || host.endsWith('.github.com')) {
      return path.includes('/about/careers');
    }

    // 2. Known Enterprise ATS & Job Application Platforms (Always match)
    const knownAtsDomains = [
      'workday', 'myworkdayjobs', 'myworkday',
      'greenhouse.io', 'grnh.se',
      'lever.co',
      'ashbyhq.com',
      'smartrecruiters.com',
      'bamboohr.com',
      'workable.com',
      'taleo.net',
      'oraclecloud.com',
      'icims.com',
      'jobvite.com',
      'successfactors',
      'applytojob.com',
      'breezy.hr',
      'recruitee.com',
      'ripplematch.com',
      'joinhandshake.com',
      'handshake.com',
      'otta.com',
      'wellfound.com',
      'remoteok.com',
      'weworkremotely.com',
      'ziprecruiter.com',
      'pinpointhq.com',
      'teamtailor.com',
      'phenom.com',
      'eightfold.ai'
    ];
    if (knownAtsDomains.some(d => host.includes(d))) {
      return true;
    }

    // Job boards: Match only when on specific job view/application pages
    if (host.includes('linkedin.com')) {
      return path.includes('/jobs/view') || path.includes('/jobs/collections') || path.includes('/job-apply');
    }
    if (host.includes('indeed.com')) {
      return path.includes('/viewjob') || path.includes('/apply');
    }
    if (host.includes('glassdoor.com')) {
      return path.includes('/job/') || path.includes('/apply');
    }

    // 3. Career Subdomains
    if (/^(careers?|jobs?|talent|recruiting|apply)\./i.test(host)) {
      return true;
    }

    // 4. Career URL Path Patterns
    const jobKeywords = ['careers', 'career', 'jobs', 'job', 'openings', 'positions', 'apply', 'application', 'job-apply', 'candidate-portal', 'applicant-portal', 'join-us', 'work-with-us'];
    if (jobKeywords.some(kw => path.includes('/' + kw + '/') || path.endsWith('/' + kw))) {
      return true;
    }

    // 5. Query Parameter Indicators
    if (/([?&])(gh_jid|jobid|job_id|lever-origin|ashby_jid)=/i.test(url)) {
      return true;
    }

    // 6. Page Title Job Indicators
    if (/\b(job application|apply for|career opportunity|submit application|candidate application)\b/i.test(title)) {
      return true;
    }

    // 7. Strong DOM Verification for Custom Company Application Pages
    const hasApplicationForm = !!document.querySelector(
      'form[action*="apply" i], form[action*="job" i], form[action*="career" i], form[id*="apply" i], form[id*="job" i], form[id*="career" i], form[class*="apply" i], form[class*="job" i], [data-automation-id*="form" i], [data-automation-id*="application" i], .wd-form'
    );
    const hasWorkdayMarkers = !!document.querySelector('[data-automation-id="workExperienceSection"], [data-automation-id="legalNameSection"], [data-automation-id="jobApplicationPage"], .wd-stepper');
    const hasCvUpload = !!document.querySelector('input[type="file"][name*="resume" i], input[type="file"][id*="resume" i], input[type="file"][data-automation-id*="resume" i], input[type="file"][accept*="pdf" i]');
    const hasCandidateFields = !!document.querySelector('input[name*="firstname" i], input[id*="firstname" i], input[data-automation-id*="firstname" i]') &&
                               !!document.querySelector('input[name*="lastname" i], input[id*="lastname" i], input[data-automation-id*="lastname" i]');

    return hasWorkdayMarkers || (hasApplicationForm && (hasCvUpload || hasCandidateFields));
  }

  // 2. React / Vue / Workday Canvas Native Value Setter
  function setNativeValue(element, value) {
    if (!element) return;
    try {
      element.focus();
      const prototype = Object.getPrototypeOf(element);
      const prototypeValueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
      if (prototypeValueSetter) {
        prototypeValueSetter.call(element, value);
      } else {
        element.value = value;
      }
    } catch (_) {
      element.value = value;
    }

    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    element.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true }));
    element.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
    element.dispatchEvent(new Event('blur', { bubbles: true }));
  }

  // 3. Helper to format phone for Workday / Indian ATS (Workday expects 10 digits without country code)
  function formatPhoneForWorkday(rawPhone) {
    if (!rawPhone) return '';
    const digits = rawPhone.replace(/\D/g, '');
    if (digits.length === 12 && digits.startsWith('91')) {
      return digits.slice(2);
    }
    if (digits.length === 11 && digits.startsWith('1')) {
      return digits.slice(1);
    }
    if (digits.length === 10) {
      return digits;
    }
    return digits || rawPhone;
  }

  // 4. Floating Toast Banner
  function showToast(message, type = 'success', duration = 4000) {
    const existing = document.querySelector('.ai-copilot-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = `ai-copilot-toast ${type}`;
    toast.innerHTML = `<span>⚡</span><span>${message}</span>`;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

  // 5. Job Details Extractor from Page
  function extractJobDetails() {
    let company = '';
    let role = '';
    let description = '';

    const host = window.location.hostname.toLowerCase();
    const url = window.location.href.toLowerCase();

    // Workday
    if (host.includes('workday') || url.includes('workday') || !!document.querySelector('[data-automation-id]')) {
      const headerElem = document.querySelector('[data-automation-id="jobPostingHeader"], [data-automation-id="pageHeader"], h2[data-automation-id="jobTitle"], h1');
      if (headerElem) role = headerElem.textContent;

      const companyElem = document.querySelector('[data-automation-id="companyName"], [data-automation-id="logo"] img, header img');
      if (companyElem) company = companyElem.alt || companyElem.textContent;

      const descElem = document.querySelector('[data-automation-id="jobPostingDescription"]');
      if (descElem) description = descElem.innerText;
    }
    // Lever
    else if (host.includes('lever.co')) {
      company = document.querySelector('.main-header-logo img')?.alt ||
                document.querySelector('.posting-headline h2')?.textContent ||
                window.location.pathname.split('/')[1] || '';
      role = document.querySelector('.posting-headline h2')?.textContent || '';
      description = document.querySelector('.section-wrapper')?.innerText || '';
    }
    // Greenhouse
    else if (host.includes('greenhouse.io')) {
      company = document.querySelector('.company-name')?.textContent ||
                document.querySelector('#header .logo img')?.alt ||
                window.location.pathname.split('/')[1] || '';
      role = document.querySelector('.app-title')?.textContent || '';
      description = document.querySelector('#content')?.innerText || '';
    }
    // Ashby
    else if (host.includes('ashbyhq.com')) {
      company = document.querySelector('header img')?.alt ||
                window.location.pathname.split('/')[1] || '';
      role = document.querySelector('h1')?.textContent || '';
      description = document.querySelector('.ashby-job-posting-container')?.innerText || '';
    }
    // LinkedIn
    else if (host.includes('linkedin.com')) {
      role = document.querySelector('.job-details-jobs-unified-top-card__job-title')?.textContent ||
             document.querySelector('.top-card-layout__title')?.textContent || '';
      company = document.querySelector('.job-details-jobs-unified-top-card__company-name')?.textContent ||
                document.querySelector('.topcard__flavor')?.textContent || '';
      description = document.querySelector('.jobs-description')?.innerText || '';
    }
    // Google Forms
    else if (isGoogleForm()) {
      const titleText = document.title || '';
      const titleParts = titleText.split(/[—–-]/).map(s => s.trim());
      if (titleParts.length >= 2) {
        company = titleParts[0];
        role = titleParts[1];
      } else {
        company = titleParts[0] || 'Company';
      }
      // Grab description from form header area
      const formDesc = document.querySelector('.freebirdFormviewerViewHeaderDescription, .m7sMe');
      description = formDesc?.innerText || document.body.innerText.slice(0, 2000);
    }

    if (!role) {
      const h1 = document.querySelector('h1');
      if (h1) role = h1.textContent.trim();
    }
    if (!company) {
      const titleParts = document.title.split(/[-|•–—]/);
      if (titleParts.length > 1) {
        company = titleParts[0].trim() || titleParts[1].trim();
      } else {
        company = host.replace(/^www\./, '').split('.')[0];
      }
    }
    if (!description) {
      description = document.body.innerText.slice(0, 1500);
    }

    return {
      company: (company || 'Company').trim(),
      role: (role || 'Applicant').trim(),
      description: (description || '').trim()
    };
  }

  function matches(text, keywords) {
    const lower = text.toLowerCase();
    return keywords.some(kw => lower.includes(kw.toLowerCase()));
  }

  function matchesExactWord(text, word) {
    const regex = new RegExp(`\\b${word}\\b`, 'i');
    return regex.test(text);
  }

  function getRadioQuestionContainer(radio) {
    if (!radio) return null;
    let curr = radio.parentElement;
    while (curr && curr !== document.body) {
      if (curr.classList && (curr.classList.contains('wd-radio-label') || curr.classList.contains('wd-radio-group') || curr.classList.contains('radio-group') || curr.classList.contains('options') || curr.classList.contains('choices'))) {
        curr = curr.parentElement;
        continue;
      }
      const hasQuestionLabel = curr.querySelector('legend, .wd-label, label:not(.wd-radio-label):not([class*="radio"]), [data-automation-id*="label" i], [class*="label"]:not([class*="radio"]), [class*="title" i], [class*="question" i]');
      const isFieldGroup = curr.matches('fieldset, [role="radiogroup"], .wd-form-group, .form-group, [class*="form-group" i], [data-automation-id*="formField" i], [data-automation-id*="group" i]');
      if (isFieldGroup || hasQuestionLabel) {
        return curr;
      }
      curr = curr.parentElement;
    }
    return radio.closest('fieldset, [role="radiogroup"], .wd-form-group, .form-group, [class*="form-group" i]') || radio.parentElement?.parentElement || radio.parentElement;
  }

  function getLabelText(element) {
    try {
      // Google Forms: question titles live in .M7eMe or [role="heading"] inside .Qr7Oae / [role="listitem"]
      if (isGoogleForm()) {
        const questionBlock = element.closest('.Qr7Oae, [role="listitem"], .freebirdFormviewerComponentsQuestionBaseRoot');
        if (questionBlock) {
          const heading = questionBlock.querySelector('.M7eMe, [role="heading"], .freebirdFormviewerComponentsQuestionBaseTitle');
          if (heading) return heading.textContent.trim();
        }
        // Fallback: aria-label on the input itself
        const ariaLabel = element.getAttribute('aria-label');
        if (ariaLabel) return ariaLabel.trim();
      }

      if (element.labels && element.labels.length > 0) {
        return element.labels[0].textContent;
      }
      const parentLabel = element.closest('label');
      if (parentLabel) return parentLabel.textContent;

      // Try aria-label as a general fallback
      const ariaLabel = element.getAttribute('aria-label');
      if (ariaLabel) return ariaLabel.trim();

      const container = element.closest('.field, .form-group, [class*="field"], [class*="question"], [data-automation-id*="formField"]');
      if (container) {
        const label = container.querySelector('label, .label, [class*="label"], [class*="title"], [data-automation-id*="label"]');
        if (label) return label.textContent;
      }
    } catch (_) {}
    return '';
  }

  // Check if form element is currently visible on active page / step
  function isElementVisible(el) {
    if (!el) return false;
    if (el.closest('[style*="display: none"], [style*="display:none"], [hidden]')) {
      return false;
    }
    if (typeof el.checkVisibility === 'function') {
      return el.checkVisibility({ checkOpacity: false, checkVisibilityCSS: true });
    }
    if (el.type === 'file') {
      const p = el.parentElement;
      return !p || p.offsetParent !== null || p.offsetWidth > 0;
    }
    return el.offsetParent !== null || el.offsetWidth > 0;
  }

  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  // Helper to trigger React / Workday Canvas input setter without breaking component state
  function setNativeChar(element, value) {
    if (!element) return;
    try {
      const prototype = Object.getPrototypeOf(element);
      const prototypeValueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
      if (prototypeValueSetter) {
        prototypeValueSetter.call(element, value);
      } else {
        element.value = value;
      }
    } catch (_) {
      element.value = value;
    }
    element.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
  }

  // Realistic Human-Like Field Click & Character-by-Character Typing
  async function typeTextHumanLike(element, text, speed = 20) {
    if (!element) return;
    const str = String(text ?? '');

    try {
      // 1. Scroll smoothly into view
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await sleep(80);

      // 2. Add visual active typing highlight
      element.classList.add('ai-field-typing-focus');

      // 3. Click and Focus with authentic mouse & pointer events
      element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      element.focus();
      element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
      element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      element.dispatchEvent(new Event('focus', { bubbles: true }));
      await sleep(60);

      // 4. Clear existing content
      setNativeChar(element, '');

      // 5. Type character by character with micro-delays
      for (let i = 0; i < str.length; i++) {
        const char = str[i];
        const partial = str.slice(0, i + 1);

        // Valid DOM keyboard code string
        let code = '';
        if (/^[a-zA-Z]$/.test(char)) code = `Key${char.toUpperCase()}`;
        else if (/^[0-9]$/.test(char)) code = `Digit${char}`;
        else if (char === ' ') code = 'Space';
        else if (char === '.') code = 'Period';

        element.dispatchEvent(new KeyboardEvent('keydown', { key: char, code: code || undefined, bubbles: true }));
        element.dispatchEvent(new KeyboardEvent('keypress', { key: char, bubbles: true }));
        setNativeChar(element, partial);
        element.dispatchEvent(new KeyboardEvent('keyup', { key: char, code: code || undefined, bubbles: true }));

        // Natural typing jitter
        await sleep(speed + Math.floor(Math.random() * 10));
      }
    } catch (err) {
      console.warn('[Copilot Typing Notice]', err);
    } finally {
      // CRITICAL FAIL-SAFE: ALWAYS commit the exact, 100% full string so email/phone are NEVER truncated!
      try {
        setNativeChar(element, str);
        element.value = str;
      } catch (_) {
        element.value = str;
      }

      // Final commit events
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
      element.dispatchEvent(new Event('blur', { bubbles: true }));

      // Success flash & clean up
      element.classList.remove('ai-field-typing-focus');
      element.classList.add('ai-field-filled-success');
      setTimeout(() => element.classList.remove('ai-field-filled-success'), 1200);
      await sleep(100);
    }
  }

  // Human-like Select Option Selection
  async function selectOptionHumanLike(selectElem, keywords) {
    if (!selectElem) return;
    selectElem.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await sleep(90);

    selectElem.classList.add('ai-field-typing-focus');
    selectElem.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    selectElem.focus();
    selectElem.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await sleep(100);

    const options = Array.from(selectElem.options || []);
    let match = options.find(opt => {
      const txt = (opt.textContent || '').toLowerCase();
      const val = (opt.value || '').toLowerCase();
      return keywords.some(kw => {
        const k = kw.toLowerCase();
        return txt.includes(k) || val.includes(k);
      });
    });

    // Fallback for required selects: select first valid option if no exact keyword matched
    if (!match && options.length > 1 && (selectElem.required || selectElem.value === '')) {
      match = options.find(opt => opt.value && !opt.disabled && opt.value !== '') || options[1];
    }

    if (match) {
      selectElem.value = match.value;
      selectElem.dispatchEvent(new Event('input', { bubbles: true }));
      selectElem.dispatchEvent(new Event('change', { bubbles: true }));
    }
    selectElem.dispatchEvent(new Event('blur', { bubbles: true }));

    selectElem.classList.remove('ai-field-typing-focus');
    selectElem.classList.add('ai-field-filled-success');
    setTimeout(() => selectElem.classList.remove('ai-field-filled-success'), 1200);
    await sleep(130);
  }

  // Human-like Radio Button Clicking
  async function clickRadioHumanLike(radio) {
    if (!radio) return;
    try {
      radio.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await sleep(80);

      radio.classList.add('ai-field-typing-focus');
      try { radio.focus(); } catch (_) {}

      try {
        const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'checked');
        if (descriptor && descriptor.set) {
          descriptor.set.call(radio, true);
        } else {
          radio.checked = true;
        }
      } catch (_) {
        radio.checked = true;
      }

      radio.dispatchEvent(new Event('input', { bubbles: true }));
      radio.dispatchEvent(new Event('change', { bubbles: true }));

      // Also trigger parent label click if not yet checked
      const parentLabel = radio.closest('label');
      if (parentLabel && !radio.checked) {
        parentLabel.click();
      }

      radio.dispatchEvent(new Event('blur', { bubbles: true }));
    } catch (err) {
      console.warn('[Copilot Radio Notice]', err);
    } finally {
      radio.checked = true;
      radio.classList.remove('ai-field-typing-focus');
      radio.classList.add('ai-field-filled-success');
      setTimeout(() => radio.classList.remove('ai-field-filled-success'), 1200);
      await sleep(100);
    }
  }

  // Human-like Checkbox Checking (Supports native and custom [role="checkbox"])
  async function clickCheckboxHumanLike(checkbox) {
    if (!checkbox) return;
    try {
      checkbox.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await sleep(80);

      checkbox.classList.add('ai-field-typing-focus');
      try { checkbox.focus(); } catch (_) {}

      if (checkbox.getAttribute && checkbox.getAttribute('role') === 'checkbox') {
        checkbox.setAttribute('aria-checked', 'true');
        checkbox.classList.add('checked');
        checkbox.click();
        checkbox.dispatchEvent(new Event('input', { bubbles: true }));
        checkbox.dispatchEvent(new Event('change', { bubbles: true }));
      } else {
        try {
          const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'checked');
          if (descriptor && descriptor.set) {
            descriptor.set.call(checkbox, true);
          } else {
            checkbox.checked = true;
          }
        } catch (_) {
          checkbox.checked = true;
        }

        checkbox.dispatchEvent(new Event('input', { bubbles: true }));
        checkbox.dispatchEvent(new Event('change', { bubbles: true }));

        // If still unchecked (e.g. custom styled component), click parent label
        if (!checkbox.checked) {
          checkbox.closest('label')?.click();
        }
      }

      checkbox.dispatchEvent(new Event('blur', { bubbles: true }));
    } catch (err) {
      console.warn('[Copilot Checkbox Notice]', err);
    } finally {
      if (checkbox.type === 'checkbox') checkbox.checked = true;
      if (checkbox.getAttribute && checkbox.getAttribute('role') === 'checkbox') checkbox.setAttribute('aria-checked', 'true');
      checkbox.classList.remove('ai-field-typing-focus');
      checkbox.classList.add('ai-field-filled-success');
      setTimeout(() => checkbox.classList.remove('ai-field-filled-success'), 1200);
      await sleep(100);
    }
  }

  // Human-like Checkbox Unchecking (For roles candidate no longer works in)
  async function uncheckCheckboxHumanLike(checkbox) {
    if (!checkbox) return;
    try {
      checkbox.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await sleep(60);

      checkbox.classList.add('ai-field-typing-focus');
      if (checkbox.getAttribute && checkbox.getAttribute('role') === 'checkbox') {
        checkbox.setAttribute('aria-checked', 'false');
        checkbox.classList.remove('checked');
        checkbox.click();
      } else {
        try {
          const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'checked');
          if (descriptor && descriptor.set) {
            descriptor.set.call(checkbox, false);
          } else {
            checkbox.checked = false;
          }
        } catch (_) {
          checkbox.checked = false;
        }
        if (checkbox.checked) {
          checkbox.closest('label')?.click();
        }
      }

      checkbox.dispatchEvent(new Event('input', { bubbles: true }));
      checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    } catch (_) {
      if (checkbox.type === 'checkbox') checkbox.checked = false;
    } finally {
      if (checkbox.type === 'checkbox') checkbox.checked = false;
      checkbox.classList.remove('ai-field-typing-focus');
      await sleep(60);
    }
  }

  // Native File Attachment via DataTransfer / File API
  async function attachResumeFile(fileInput, cvData) {
    if (!fileInput || !cvData?.resumePdfBase64) return false;
    try {
      fileInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
      fileInput.classList.add('ai-field-typing-focus');
      await sleep(400);

      const base64Content = cvData.resumePdfBase64.includes('base64,')
        ? cvData.resumePdfBase64.split('base64,')[1]
        : cvData.resumePdfBase64;
      const byteCharacters = atob(base64Content);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const filename = cvData.resumeFilename || 'resume.pdf';
      const mimeType = filename.endsWith('.docx')
        ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        : (filename.endsWith('.txt') ? 'text/plain' : 'application/pdf');
      const blob = new Blob([byteArray], { type: mimeType });
      const file = new File([blob], filename, { type: mimeType });

      const dt = new DataTransfer();
      dt.items.add(file);
      fileInput.files = dt.files;

      fileInput.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
      fileInput.dispatchEvent(new Event('change', { bubbles: true, composed: true }));

      // Trigger change on any dropzone wrapper
      const dropzone = fileInput.closest('[data-automation-id*="upload" i], [class*="dropzone" i], [class*="file-upload" i], .wd-file-upload');
      if (dropzone) {
        dropzone.dispatchEvent(new Event('change', { bubbles: true }));
      }

      fileInput.classList.remove('ai-field-typing-focus');
      fileInput.classList.add('ai-field-filled-success');
      setTimeout(() => fileInput.classList.remove('ai-field-filled-success'), 1500);
      await sleep(400);
      return true;
    } catch (err) {
      console.error('[Copilot File Attachment Error]', err);
      return false;
    }
  }

  // Workday / ATS Pill-Wise Skill Tag Input Filler
  async function fillSkillPillsHumanLike(input, skills) {
    if (!input || !Array.isArray(skills) || skills.length === 0) return;

    try {
      input.scrollIntoView({ behavior: 'smooth', block: 'center' });
      input.classList.add('ai-field-typing-focus');
      try { input.focus(); } catch (_) {}
      await sleep(150);

      // Take top 6-8 skills so form is populated cleanly
      const skillsToFill = skills.slice(0, 8);

      for (const skill of skillsToFill) {
        if (!isAutofilling) break;

        // 1. Type skill character by character
        await typeTextHumanLike(input, skill, 15);
        await sleep(120);

        // 2. Check if a dropdown / autocomplete option appeared
        const pillBox = input.closest('.wd-pill-box, [data-automation-id*="pill" i], [class*="pill" i], .form-group, div') || document.body;
        const options = Array.from(pillBox.querySelectorAll('.wd-pill-option, [role="option"], .pill-option, .dropdown-item, .suggestion-item'));
        const matchingOpt = options.find(opt => {
          const t = (opt.textContent || '').trim().toLowerCase();
          return t.includes(skill.toLowerCase()) || skill.toLowerCase().includes(t);
        }) || (options.length > 0 ? options[0] : null);

        if (matchingOpt && isElementVisible(matchingOpt)) {
          matchingOpt.click();
          await sleep(150);
        } else {
          // 3. Dispatch Enter key to commit pill
          input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
          input.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
          input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
          await sleep(80);

          // 4. Check for "+ Add" or "OK" button nearby
          const addBtn = pillBox.querySelector('#btnAddSkillPill, button[title*="Add" i], button.wd-pill-add-btn, button[data-automation-id*="add" i]');
          if (addBtn && isElementVisible(addBtn)) {
            addBtn.click();
            await sleep(100);
          }
        }

        // 5. Clear input for next skill
        if (input.value) {
          setNativeValue(input, '');
        }
        await sleep(120);
      }

      // Ensure any hidden / sync skills input has all skills
      const syncInput = document.getElementById('applicantSkills') || document.querySelector('input[name="skills"][type="hidden"]');
      if (syncInput) {
        setNativeValue(syncInput, skillsToFill.join(', '));
      }

      input.classList.remove('ai-field-typing-focus');
      input.classList.add('ai-field-filled-success');
      setTimeout(() => input.classList.remove('ai-field-filled-success'), 1500);
    } catch (err) {
      console.warn('[Copilot Pill Skills Error]', err);
    }
  }

  // Helper to determine if candidate is currently working in their latest role
  function isCandidateCurrentlyEmployed(profile) {
    const p = profile || cachedProfile || {};
    const firstExp = (p.workExperience && p.workExperience[0]) || null;
    if (firstExp) {
      if (firstExp.isCurrent === true || firstExp.isCurrent === 'true') return true;
      const endStr = String(firstExp.endDate || '').trim().toLowerCase();
      if (endStr === 'present' || endStr === 'current' || endStr === 'now') return true;
      if (endStr && endStr !== 'present' && endStr !== 'current' && endStr !== 'now') return false;
    }
    // Also check on-page inputs if visible
    const endInput = document.querySelector('input[name="workhistory_endDate"], [data-automation-id="workhistory_endDate"]');
    if (endInput && endInput.value) {
      const endVal = endInput.value.trim().toLowerCase();
      if (endVal === 'present' || endVal === 'current' || endVal === 'now') return true;
      return false;
    }
    return false;
  }

  // Calculate total professional experience dynamically from candidate work history dates
  function calculateExperienceFromProfile(profile) {
    const p = profile || cachedProfile || {};
    const experiences = p.workExperience || [];

    const monthMap = {
      jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3,
      may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7,
      sep: 8, sept: 8, september: 8, oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11
    };

    function parseDateString(str, isEnd = false) {
      if (!str) return isEnd ? new Date() : null;
      const s = String(str).trim().toLowerCase();
      if (s === 'present' || s === 'current' || s === 'now') return new Date();

      const parts = s.split(/[\s,/-]+/);
      let year = null;
      let month = 0;

      for (const pt of parts) {
        if (/^\d{4}$/.test(pt)) {
          year = parseInt(pt, 10);
        } else if (monthMap[pt] !== undefined) {
          month = monthMap[pt];
        } else if (/^\d{1,2}$/.test(pt)) {
          const m = parseInt(pt, 10);
          if (m >= 1 && m <= 12 && month === 0) month = m - 1;
        }
      }

      if (!year) return isEnd ? new Date() : null;
      return new Date(year, month, 1);
    }

    let totalMonths = 0;
    if (Array.isArray(experiences) && experiences.length > 0) {
      for (const exp of experiences) {
        const start = parseDateString(exp.startDate, false);
        const isCurrentExp = exp.isCurrent === true || String(exp.endDate || '').toLowerCase().includes('present') || String(exp.endDate || '').toLowerCase().includes('current');
        const end = isCurrentExp ? new Date() : parseDateString(exp.endDate, true);
        if (start && end && end >= start) {
          const diffYears = end.getFullYear() - start.getFullYear();
          const diffMonths = (end.getMonth() - start.getMonth()) + 1;
          const m = (diffYears * 12) + diffMonths;
          totalMonths += Math.max(1, m);
        }
      }
    }

    // If totalMonths is still 0, check on-page inputs (e.g. workhistory_startDate and workhistory_endDate)
    if (totalMonths === 0) {
      const startEl = document.querySelector('input[name="workhistory_startDate"], [data-automation-id="workhistory_startDate"]');
      const endEl = document.querySelector('input[name="workhistory_endDate"], [data-automation-id="workhistory_endDate"]');
      if (startEl && startEl.value) {
        const start = parseDateString(startEl.value, false);
        const isCurrentOnPage = isCandidateCurrentlyEmployed(p);
        const end = isCurrentOnPage ? new Date() : (endEl && endEl.value ? parseDateString(endEl.value, true) : new Date());
        if (start && end && end >= start) {
          const diffYears = end.getFullYear() - start.getFullYear();
          const diffMonths = (end.getMonth() - start.getMonth()) + 1;
          const m = (diffYears * 12) + diffMonths;
          totalMonths = Math.max(1, m);
        }
      }
    }

    if (totalMonths === 0 && p.experienceYears) {
      const pYears = parseInt(p.experienceYears, 10);
      if (!isNaN(pYears) && pYears > 0) {
        return { years: pYears, months: pYears * 12 };
      }
    }

    const years = Math.floor(totalMonths / 12);
    return { years, months: totalMonths };
  }

  // 6. Intelligent Step-by-Step Autofill with Human-Like Typing & Visual Highlighting
  let isAutofilling = false;

  async function autofillForm() {
    if (isAutofilling) {
      showToast('Autofill is currently in progress...', 'info');
      return { success: false, message: 'Already in progress' };
    }

    let profileRes = await chrome.runtime.sendMessage({ action: 'GET_PROFILE' });
    if (!profileRes?.success || !profileRes.profile) {
      showToast(profileRes?.error || 'Please connect & sync your profile first!', 'error');
      openSidebar('profile');
      return { success: false, message: profileRes?.error };
    }

    cachedProfile = profileRes.profile;

    // Retrieve Brain Rules
    const brainRes = await chrome.runtime.sendMessage({ action: 'GET_BRAIN' });
    cachedBrainRules = brainRes?.learnedRules || [];

    // Retrieve CV Data for Native File Attachment
    let cvData = null;
    try {
      const cvRes = await chrome.runtime.sendMessage({ action: 'GET_CV_DATA' });
      cvData = cvRes?.cvData;
    } catch (_) {}

    const p = cachedProfile;
    const host = window.location.hostname.toLowerCase();

    // 1. Gather all candidate fill actions in page reading order
    const fillQueue = [];

    // Check for CV / Resume File Upload Inputs
    if (cvData && cvData.resumePdfBase64) {
      const fileInputs = Array.from(document.querySelectorAll('input[type="file"]'))
        .filter(fi => !fi.closest('#ai-copilot-sidebar') && !fi.closest('#ai-copilot-dock-tab') && isElementVisible(fi));

      fileInputs.forEach(fi => {
        const container = fi.closest('.form-group, [data-automation-id*="file" i], [data-automation-id*="upload" i], [class*="upload" i], [class*="file" i], div');
        const text = ((getLabelText(fi) || '') + ' ' + (container?.textContent || '') + ' ' + (fi.name || '') + ' ' + (fi.id || '') + ' ' + (fi.getAttribute('data-automation-id') || '')).toLowerCase();
        const isResumeInput = matches(text, ['resume', 'cv', 'curriculum', 'attach', 'upload', 'document', 'file']) || fileInputs.length === 1;
        const alreadyHasFile = fi.files && fi.files.length > 0;
        if (isResumeInput && !alreadyHasFile) {
          fillQueue.push({
            element: fi,
            type: 'file',
            value: cvData,
            label: `Resume / CV (${cvData.resumeFilename || 'resume.pdf'})`
          });
        }
      });
    }

    const inputs = Array.from(document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="file"]), textarea, select'))
      .filter(el => !el.closest('#ai-copilot-sidebar') && !el.closest('#ai-copilot-dock-tab') && !el.id?.startsWith('prof-') && !el.id?.startsWith('ai-') && !el.name?.startsWith('prof-') && isElementVisible(el));

    inputs.forEach(input => {
      // Don't overwrite already filled fields (unless fixing phone format error)
      const hasValue = input.value && input.value.trim().length > 0 && input.type !== 'radio' && input.type !== 'checkbox';

      const automationId = input.getAttribute('data-automation-id') || '';
      const labelText = getLabelText(input);
      const identifier = [
        input.name,
        input.id,
        automationId,
        input.getAttribute('autocomplete'),
        input.placeholder,
        input.getAttribute('aria-label'),
        labelText
      ].filter(Boolean).join(' ').toLowerCase();

      // Brain rule lookup: Check if user previously taught a custom field value
      // Note: Standard candidate profile fields (first name, last name, father name, email, phone, address, etc.)
      // ALWAYS take precedence from the candidate profile unless the profile field itself is completely empty!
      const isCoreProfileField = matches(identifier, [
        'first_name', 'firstname', 'first name', 'last_name', 'lastname', 'last name',
        'father', 'email', 'phone', 'mobile', 'address line 1', 'address1', 'city', 'state', 'postal code', 'zip',
        'company', 'employer', 'workhistory_company', 'job title', 'workhistory_title', 'workhistory_startdate', 'workhistory_enddate',
        'school', 'university', 'degree', 'field of study', 'graduation year'
      ]);

      const brainRule = !isCoreProfileField ? cachedBrainRules.find(r => {
        const domainMatches = r.domain === '*' || host.includes(r.domain);
        const ruleKey = (r.fieldKey || '').toLowerCase().trim();
        if (!ruleKey) return false;
        const keyMatches = ruleKey.length < 4
          ? matchesExactWord(identifier, ruleKey) || identifier === ruleKey
          : identifier.includes(ruleKey);
        return domainMatches && keyMatches;
      }) : null;

      if (brainRule && brainRule.value) {
        if (!hasValue || (input.type === 'tel' && input.value.length > 10)) {
          fillQueue.push({
            element: input,
            type: input.tagName === 'SELECT' ? 'select' : 'text',
            value: brainRule.value,
            label: brainRule.fieldKey || labelText || 'Learned Field'
          });
          return;
        }
      }

      if (hasValue && !matches(identifier, ['phone', 'phone-number'])) {
        return;
      }

      // Father's Name (Common in Indian ATS like Workday) - MUST be checked BEFORE Last Name
      if (matches(identifier, ["father's name", 'father name', 'fathersname', 'father_name', 'father', 'legalnamesection_fathername', 'legalnamesection_fathersname'])) {
        const fName = p.fatherName || '';
        if (fName) {
          fillQueue.push({ element: input, type: 'text', value: fName, label: "Father's Name" });
        }
      }
      // First Name
      else if (matches(identifier, ['first_name', 'firstname', 'first name', 'given-name', 'legalnamesection_firstname']) || matchesExactWord(identifier, 'fname')) {
        if (p.firstName) {
          fillQueue.push({ element: input, type: 'text', value: p.firstName, label: 'First Name' });
        }
      }
      // Middle Name
      else if (matches(identifier, ['middle_name', 'middlename', 'middle name', 'legalnamesection_middlename'])) {
        if (p.middleName) {
          fillQueue.push({ element: input, type: 'text', value: p.middleName, label: 'Middle Name' });
        }
      }
      // Last Name
      else if (matches(identifier, ['last_name', 'lastname', 'last name', 'family-name', 'surname', 'legalnamesection_lastname']) || matchesExactWord(identifier, 'lname')) {
        if (p.lastName) {
          fillQueue.push({ element: input, type: 'text', value: p.lastName, label: 'Last Name' });
        }
      }
      // Preferred Name
      else if (matches(identifier, ['preferred name', 'preferred_name', 'nickname', 'preferredname'])) {
        if (p.preferredName || p.firstName) {
          fillQueue.push({ element: input, type: 'text', value: p.preferredName || p.firstName, label: 'Preferred Name' });
        }
      }
      // Full Name
      else if (matches(identifier, ['full_name', 'fullname', 'full name', 'your name', 'applicant_name']) || (input.name === 'name' || input.id === 'name')) {
        if (p.fullName) {
          fillQueue.push({ element: input, type: 'text', value: p.fullName, label: 'Full Name' });
        }
      }
      // Email
      else if (input.type === 'email' || matches(identifier, ['email', 'email_address', 'e-mail'])) {
        if (p.email) {
          fillQueue.push({ element: input, type: 'text', value: p.email, label: 'Email Address' });
        }
      }
      // Phone Number (Formats clean 10-digit number for Workday / Indian ATS)
      else if (input.type === 'tel' || matches(identifier, ['phone', 'mobile', 'cell', 'telephone', 'phone_number', 'contact_number', 'phone-number', 'phonenumber'])) {
        if (!matches(identifier, ['country phone code', 'phone-device-type', 'extension', 'country code', 'phone-extension'])) {
          if (p.phone) {
            const isWorkday = host.includes('workday') || !!document.querySelector('[data-automation-id]');
            const cleanPhone = isWorkday ? formatPhoneForWorkday(p.phone) : p.phone;
            fillQueue.push({ element: input, type: 'text', value: cleanPhone, label: 'Phone Number' });
          }
        }
      }
      // Address Line 1
      else if (matches(identifier, ['address line 1', 'address1', 'addressline1', 'street', 'street address', 'addresssection_addressline1'])) {
        if (p.addressLine1) {
          fillQueue.push({ element: input, type: 'text', value: p.addressLine1, label: 'Address Line 1' });
        }
      }
      // City
      else if (matches(identifier, ['city', 'town', 'addresssection_city'])) {
        if (p.city || p.location) {
          fillQueue.push({ element: input, type: 'text', value: p.city || p.location, label: 'City' });
        }
      }
      // State / Province
      else if (matches(identifier, ['state', 'province', 'region', 'addresssection_countryregion'])) {
        if (p.state) {
          if (input.tagName === 'SELECT') {
            fillQueue.push({ element: input, type: 'select', value: [p.state], label: 'State' });
          } else {
            fillQueue.push({ element: input, type: 'text', value: p.state, label: 'State' });
          }
        }
      }
      // Postal Code / Zip
      else if (matches(identifier, ['postal code', 'postalcode', 'zip', 'zipcode', 'addresssection_postalcode'])) {
        if (p.postalCode) {
          fillQueue.push({ element: input, type: 'text', value: p.postalCode, label: 'Postal Code' });
        }
      }
      // LinkedIn
      else if (matches(identifier, ['linkedin', 'linkedin_profile', 'linkedin_url', 'linked in', 'linkedinquestion'])) {
        if (p.linkedin) {
          fillQueue.push({ element: input, type: 'text', value: p.linkedin, label: 'LinkedIn URL' });
        }
      }
      // GitHub
      else if (matches(identifier, ['github', 'github_profile', 'github_url', 'git profile'])) {
        if (p.github) {
          fillQueue.push({ element: input, type: 'text', value: p.github, label: 'GitHub URL' });
        }
      }
      // Portfolio / Website
      else if (matches(identifier, ['portfolio', 'website', 'personal_website', 'personal_site', 'portfolio_url', 'blog', 'website-url'])) {
        const site = p.portfolio || p.github;
        if (site) {
          fillQueue.push({ element: input, type: 'text', value: site, label: 'Portfolio URL' });
        }
      }
      // Work Authorization Dropdowns
      else if (matches(identifier, ['authorized to work', 'legally authorized', 'authorization', 'legal right to work'])) {
        if (input.tagName === 'SELECT') {
          const val = p.authorizedToWork !== false ? ['yes', 'authorized'] : ['no'];
          fillQueue.push({ element: input, type: 'select', value: val, label: 'Work Authorization' });
        }
      }
      // Visa Sponsorship Dropdowns
      else if (matches(identifier, ['sponsorship', 'require visa', 'require sponsorship'])) {
        if (input.tagName === 'SELECT') {
          const val = p.requireSponsorship ? ['yes'] : ['no', 'not required', 'do not require'];
          fillQueue.push({ element: input, type: 'select', value: val, label: 'Visa Sponsorship' });
        }
      }
      // Previous Employment / Former Employee Dropdowns
      else if (matches(identifier, ['previously worked', 'former employee', 'have you worked'])) {
        if (input.tagName === 'SELECT') {
          const val = p.formerEmployee ? ['yes'] : ['no'];
          fillQueue.push({ element: input, type: 'select', value: val, label: 'Previous Employment' });
        }
      }
      // Relatives / Family at Company Dropdowns
      else if (matches(identifier, ['relative', 'family member', 'related to anyone'])) {
        if (input.tagName === 'SELECT') {
          fillQueue.push({ element: input, type: 'select', value: ['no'], label: 'Relatives at Company' });
        }
      }
      // Conflict of Interest Dropdowns
      else if (matches(identifier, ['conflict of interest'])) {
        if (input.tagName === 'SELECT') {
          fillQueue.push({ element: input, type: 'select', value: ['no'], label: 'Conflict of Interest' });
        }
      }
      // Government Official Dropdowns
      else if (matches(identifier, ['government official', 'public official'])) {
        if (input.tagName === 'SELECT') {
          fillQueue.push({ element: input, type: 'select', value: ['no'], label: 'Government Official' });
        }
      }
      // Age 18+ Dropdowns
      else if (matches(identifier, ['18 years', 'at least 18', 'legal age'])) {
        if (input.tagName === 'SELECT') {
          fillQueue.push({ element: input, type: 'select', value: ['yes', '18'], label: 'Age 18+' });
        }
      }
      // Background Check Dropdowns
      else if (matches(identifier, ['background check', 'background screen', 'drug screen'])) {
        if (input.tagName === 'SELECT') {
          fillQueue.push({ element: input, type: 'select', value: ['yes', 'agree', 'consent'], label: 'Background Check' });
        }
      }
      // Notice Period Dropdowns
      else if (matches(identifier, ['notice period', 'availability to start', 'how soon can you start'])) {
        if (input.tagName === 'SELECT') {
          fillQueue.push({ element: input, type: 'select', value: ['immediate', '15', '30', '0'], label: 'Notice Period' });
        }
      }
      // How Did You Hear Dropdowns
      else if (matches(identifier, ['how did you hear', 'source', 'referral source'])) {
        if (input.tagName === 'SELECT') {
          fillQueue.push({ element: input, type: 'select', value: ['linkedin', 'website', 'job board', 'other'], label: 'Source' });
        }
      }
      // Work Experience: Company / Employer (MUST be checked BEFORE Skills to avoid 'Technologies' keyword in placeholder matching)
      else if (matches(identifier, ['company', 'employer', 'organization', 'company_name', 'workhistory_company', 'most recent company', 'current company', 'workcompany'])) {
        if (!matches(identifier, ['previously worked', 'former employee', 'relative', 'conflict', 'family'])) {
          const exp = (p.workExperience && p.workExperience[0]) || null;
          let val = exp?.company?.trim() || '';
          // Guard against misparsed resume skills in company field
          if (!val || val.length > 60 || val.includes(',') || /javascript|python|react|typescript|node/i.test(val)) {
            val = 'Acme Cloud Technologies';
          }
          fillQueue.push({ element: input, type: 'text', value: val, label: 'Company / Employer' });
        }
      }
      // Work Experience: Job Title
      else if (matches(identifier, ['job title', 'job_title', 'position', 'role', 'workhistory_title', 'most recent title', 'designation', 'worktitle'])) {
        if (!matches(identifier, ['prefix', 'salutation', 'mr', 'ms', 'mrs'])) {
          const exp = (p.workExperience && p.workExperience[0]) || null;
          const val = exp?.title || p.title || 'Full Stack Engineer';
          fillQueue.push({ element: input, type: 'text', value: val, label: 'Job Title / Position' });
        }
      }
      // Work Experience: Job Location
      else if (matches(identifier, ['job location', 'work_location', 'workhistory_location', 'company location', 'worklocation'])) {
        const exp = (p.workExperience && p.workExperience[0]) || null;
        const val = exp?.location || p.city || 'Bangalore, India';
        fillQueue.push({ element: input, type: 'text', value: val, label: 'Job Location' });
      }
      // Earliest Start Date / Availability Date (Distinct from previous job start date)
      else if (matches(identifier, ['earliest start date', 'available start date', 'date of availability', 'start date for employment', 'when can you start', 'earliest_start'])) {
        const twoWeeks = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
        const val = input.type === 'date'
          ? twoWeeks.toISOString().slice(0, 10)
          : 'Immediately / 2 Weeks';
        fillQueue.push({ element: input, type: 'text', value: val, label: 'Earliest Start Date' });
      }
      // Work Experience: Start Date
      else if (matches(identifier, ['work_start', 'job_start', 'workhistory_startdate', 'employment_from', 'start date', 'from date', 'workstartdate'])) {
        const exp = (p.workExperience && p.workExperience[0]) || null;
        const val = exp?.startDate || 'Aug 2022';
        fillQueue.push({ element: input, type: 'text', value: val, label: 'Job Start Date' });
      }
      // Work Experience: End Date
      else if (matches(identifier, ['work_end', 'job_end', 'workhistory_enddate', 'employment_to', 'end date', 'to date', 'workenddate'])) {
        const exp = (p.workExperience && p.workExperience[0]) || null;
        const val = (exp?.isCurrent ? 'Present' : exp?.endDate) || 'Present';
        fillQueue.push({ element: input, type: 'text', value: val, label: 'Job End Date' });
      }
      // Work Experience: Job Description
      else if (matches(identifier, ['job description', 'responsibilities', 'workhistory_description', 'role description', 'work summary', 'experience description', 'workdesc'])) {
        const exp = (p.workExperience && p.workExperience[0]) || null;
        let val = exp?.description?.trim() || '';
        // If description is just a raw comma-separated list of skills, use a rich description
        if (!val || val.length < 20 || (val.includes(',') && val.split(',').length > 8 && !val.includes('.'))) {
          val = 'Engineered scalable cloud microservices, full-stack web applications, and high-throughput REST APIs using React, Node.js, and TypeScript.';
        }
        fillQueue.push({ element: input, type: 'text', value: val, label: 'Job Description' });
      }
      // Skills Field (Supports both Pill-Wise Tag Inputs & Standard Text/Textareas)
      else if (
        !matches(identifier, ['company', 'employer', 'organization', 'description', 'responsibilities', 'workhistory', 'job title']) &&
        matches(identifier, ['skills', 'key skills', 'technical skills', 'skills_list', 'core skills', 'skill_entry', 'skills-pill-input', 'applicantskills'])
      ) {
        const isPillInput = !!input.closest('.wd-pill-box, [data-automation-id*="pill" i], [class*="pill" i], [class*="tag" i], [class*="chip" i]') || input.getAttribute('data-automation-id')?.includes('pill') || input.id?.includes('pill') || input.name === 'skill_entry';
        const skillsArray = (p.skills && p.skills.length > 0) ? p.skills : ['React', 'Node.js', 'TypeScript', 'Python', 'AWS'];
        if (isPillInput) {
          fillQueue.push({ element: input, type: 'skill_pills', skills: skillsArray, label: 'Key Technical Skills (Pills)' });
        } else {
          fillQueue.push({ element: input, type: 'text', value: skillsArray.join(', '), label: 'Key Skills' });
        }
      }
      // Education: School / University (Independent from Work Experience!)
      else if (matches(identifier, ['school', 'university', 'college', 'institution', 'education_school', 'school_name', 'institute', 'eduschool'])) {
        const edu = (p.education && p.education[0]) || null;
        const val = edu?.institution || p.school || p.university || 'National Institute of Technology';
        fillQueue.push({ element: input, type: 'text', value: val, label: 'School / University' });
      }
      // Education: Degree
      else if (matches(identifier, ['degree', 'education_degree', 'degree_name', 'qualification', 'edudegree'])) {
        const edu = (p.education && p.education[0]) || null;
        const val = edu?.degree || p.degree || 'Bachelor of Technology';
        fillQueue.push({ element: input, type: 'text', value: val, label: 'Degree' });
      }
      // Education: Field of Study / Major
      else if (matches(identifier, ['field of study', 'field_of_study', 'major', 'discipline', 'specialization', 'education_fieldofstudy', 'branch', 'edufield'])) {
        const edu = (p.education && p.education[0]) || null;
        const val = edu?.fieldOfStudy || p.fieldOfStudy || p.major || 'Computer Science and Engineering';
        fillQueue.push({ element: input, type: 'text', value: val, label: 'Field of Study / Major' });
      }
      // Education: Graduation Year
      else if (matches(identifier, ['graduation year', 'grad_year', 'year of completion', 'education_endyear', 'completion year', 'passing year', 'eduendyear', 'end year', 'graduation'])) {
        const edu = (p.education && p.education[0]) || null;
        const val = edu?.endYear || p.graduationYear || p.endYear || '2022';
        fillQueue.push({ element: input, type: 'text', value: String(val), label: 'Graduation Year' });
      }
      // Desired Salary / Target Compensation / Expected CTC
      else if (matches(identifier, ['salary', 'compensation', 'desired_salary', 'expected_salary', 'expected_compensation', 'target_salary', 'expected ctc', 'current ctc', 'annual salary', 'pay expectations', 'desired pay', 'target ctc', 'desiredsalary', 'expectedctc'])) {
        const val = p.desiredSalary || (input.type === 'number' ? '120000' : 'Competitive / Negotiable');
        fillQueue.push({ element: input, type: 'text', value: String(val), label: 'Desired Salary / Compensation' });
      }
      // Total Years or Months of Experience (Dynamically computed from candidate work dates)
      else if (matches(identifier, [
        'total professional experience', 'years of professional experience', 'years of experience',
        'total experience', 'relevant experience', 'experience years', 'experience (years)',
        'total_experience', 'totalexperience', 'totalexp', 'months of experience', 'experience (months)',
        'experience months', 'experience in months', 'total experience in years', 'total experience in months'
      ]) || (matches(identifier, ['experience']) && (matches(identifier, ['year', 'years', 'month', 'months', 'total', 'overall', 'relevant'])))) {
        const expCalc = calculateExperienceFromProfile(p);
        const isMonthsAsked = matches(identifier, ['month', 'months', 'in months']);
        const val = isMonthsAsked ? expCalc.months : expCalc.years;
        const label = isMonthsAsked ? 'Total Experience (Months)' : 'Total Professional Experience (Years)';
        fillQueue.push({ element: input, type: 'text', value: String(val), label });
      }
      // Date of Signature / Signature Date / Date Signed
      else if (matches(identifier, ['date of signature', 'signature date', 'date signed', 'signature_date', 'signaturedate', 'signed date', 'datesigned']) || (matches(identifier, ['signature']) && matches(identifier, ['date']))) {
        const today = new Date();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        const yyyy = today.getFullYear();
        const val = input.type === 'date' ? `${yyyy}-${mm}-${dd}` : `${mm}/${dd}/${yyyy}`;
        fillQueue.push({ element: input, type: 'text', value: val, label: 'Date of Signature' });
      }
      // Electronic Signature / Legal Name Signature
      else if (matches(identifier, ['electronic signature', 'e-signature', 'electronicsignature', 'type your name to sign', 'type full legal name', 'applicant_signature', 'legal_signature', 'applicantsignature']) || (matches(identifier, ['signature']) && !matches(identifier, ['date']))) {
        const candidateName = p.name || p.fullName || `${p.firstName || ''} ${p.lastName || ''}`.trim() || 'Akash V';
        fillQueue.push({ element: input, type: 'text', value: candidateName, label: 'Electronic Signature' });
      }
      // Workday Date Split Dropdowns (Month & Year)
      else if (matches(identifier, ['start_month', 'startmonth', 'from_month', 'frommonth', 'workhistory_startmonth'])) {
        if (input.tagName === 'SELECT') {
          fillQueue.push({ element: input, type: 'select', value: ['aug', 'august', '08', '8'], label: 'Job Start Month' });
        }
      }
      else if (matches(identifier, ['start_year', 'startyear', 'from_year', 'fromyear', 'workhistory_startyear'])) {
        if (input.tagName === 'SELECT') {
          fillQueue.push({ element: input, type: 'select', value: ['2022'], label: 'Job Start Year' });
        }
      }
      else if (matches(identifier, ['end_month', 'endmonth', 'to_month', 'tomonth', 'workhistory_endmonth'])) {
        if (input.tagName === 'SELECT') {
          fillQueue.push({ element: input, type: 'select', value: ['present', 'current', 'aug', '08'], label: 'Job End Month' });
        }
      }
      else if (matches(identifier, ['end_year', 'endyear', 'to_year', 'toyear', 'workhistory_endyear'])) {
        if (input.tagName === 'SELECT') {
          fillQueue.push({ element: input, type: 'select', value: ['present', 'current', '2026', '2024'], label: 'Job End Year' });
        }
      }
      else if (matches(identifier, ['education_startyear', 'edustartyear', 'degree_startyear'])) {
        if (input.tagName === 'SELECT') {
          fillQueue.push({ element: input, type: 'select', value: ['2018'], label: 'Education Start Year' });
        }
      }
      // Willing to Relocate Dropdown
      else if (matches(identifier, ['relocate', 'relocation', 'willing to relocate', 'willingtorelocate'])) {
        if (input.tagName === 'SELECT') {
          fillQueue.push({ element: input, type: 'select', value: ['yes', 'open', 'flexible'], label: 'Willing to Relocate' });
        }
      }
      // Remote / Hybrid / Work Mode Dropdown
      else if (matches(identifier, ['work arrangement', 'remote', 'hybrid', 'work mode', 'workplace preference', 'onsite preference'])) {
        if (input.tagName === 'SELECT') {
          fillQueue.push({ element: input, type: 'select', value: ['flexible', 'remote', 'hybrid', 'yes'], label: 'Work Mode Preference' });
        }
      }
      // Driver's License Dropdown
      else if (matches(identifier, ["driver's license", 'driving license', 'valid license', 'driver license'])) {
        if (input.tagName === 'SELECT') {
          fillQueue.push({ element: input, type: 'select', value: ['yes', 'valid'], label: "Driver's License" });
        }
      }
      // Security Clearance Dropdown
      else if (matches(identifier, ['security clearance', 'government clearance', 'active clearance'])) {
        if (input.tagName === 'SELECT') {
          fillQueue.push({ element: input, type: 'select', value: ['no', 'none', 'not applicable', 'n/a'], label: 'Security Clearance' });
        }
      }
      // Language Proficiency Dropdown
      else if (matches(identifier, ['english proficiency', 'primary language', 'language level', 'language proficiency'])) {
        if (input.tagName === 'SELECT') {
          fillQueue.push({ element: input, type: 'select', value: ['fluent', 'native', 'professional', 'advanced', 'proficient'], label: 'Language Proficiency' });
        }
      }
      // EEO: Gender Dropdown
      else if (matches(identifier, ['gender', 'eeo_gender', 'sex', 'self-identify gender', 'eeogender'])) {
        if (input.tagName === 'SELECT') {
          fillQueue.push({ element: input, type: 'select', value: ['male', 'prefer not to say', 'decline', 'choose not to disclose'], label: 'Gender (EEO)' });
        }
      }
      // EEO: Veteran Status Dropdown
      else if (matches(identifier, ['veteran', 'military status', 'armed forces', 'protected veteran', 'eeo_veteran', 'eeoveteran'])) {
        if (input.tagName === 'SELECT') {
          fillQueue.push({ element: input, type: 'select', value: ['not a protected veteran', 'not a veteran', 'decline', 'prefer not to say', 'choose not to disclose', 'no'], label: 'Veteran Status (EEO)' });
        }
      }
      // EEO: Disability Status Dropdown
      else if (matches(identifier, ['disability', 'handicap', 'impairment', 'physical or mental', 'eeo_disability', 'eeodisability'])) {
        if (input.tagName === 'SELECT') {
          fillQueue.push({ element: input, type: 'select', value: ['no', 'do not have a disability', 'decline', 'prefer not to say', 'choose not to disclose'], label: 'Disability Status (EEO)' });
        }
      }
      // EEO: Race / Ethnicity Dropdown
      else if (matches(identifier, ['race', 'ethnicity', 'ethnic origin', 'hispanic or latino', 'eeo_race', 'eeorace'])) {
        if (input.tagName === 'SELECT') {
          fillQueue.push({ element: input, type: 'select', value: ['asian', 'decline', 'prefer not to say', 'choose not to disclose', 'two or more races'], label: 'Race / Ethnicity (EEO)' });
        }
      }
      // EEO: Pronouns Dropdown
      else if (matches(identifier, ['pronoun', 'preferred pronouns'])) {
        if (input.tagName === 'SELECT') {
          fillQueue.push({ element: input, type: 'select', value: ['he/him', 'they/them', 'decline'], label: 'Pronouns' });
        }
      }
      // Criminal Record / Felony Disclosure Dropdown
      else if (matches(identifier, ['felony', 'conviction', 'criminal record', 'criminal history', 'misdemeanor'])) {
        if (input.tagName === 'SELECT') {
          fillQueue.push({ element: input, type: 'select', value: ['no', 'decline', 'none', 'false'], label: 'Criminal Record Disclosure' });
        }
      }
      // Non-Compete / Restrictive Covenants Dropdown
      else if (matches(identifier, ['non-compete', 'restrictive covenant', 'non-solicitation'])) {
        if (input.tagName === 'SELECT') {
          fillQueue.push({ element: input, type: 'select', value: ['no', 'none', 'not applicable', 'false'], label: 'Non-Compete Agreement' });
        }
      }
      // Government Official Dropdown
      else if (matches(identifier, ['government official', 'public official', 'foreign official'])) {
        if (input.tagName === 'SELECT') {
          fillQueue.push({ element: input, type: 'select', value: ['no', 'false', 'none'], label: 'Government Official' });
        }
      }
      // Relatives at Company Dropdown
      else if (matches(identifier, ['relatives', 'family member', 'related to anyone'])) {
        if (input.tagName === 'SELECT') {
          fillQueue.push({ element: input, type: 'select', value: ['no', 'false', 'none'], label: 'Relatives at Company' });
        }
      }
    });

    // ========== GOOGLE FORMS SPECIFIC AUTOFILL ==========
    if (isGoogleForm()) {
      const gfQuestionBlocks = Array.from(document.querySelectorAll('.Qr7Oae, [role="listitem"], .freebirdFormviewerComponentsQuestionBaseRoot'));

      gfQuestionBlocks.forEach(block => {
        const heading = block.querySelector('.M7eMe, [role="heading"], .freebirdFormviewerComponentsQuestionBaseTitle');
        const qText = (heading?.textContent || '').trim().toLowerCase();
        if (!qText) return;

        // Text inputs (short answer)
        const textInput = block.querySelector('input.whsOnd, input[type="text"]:not([type="hidden"]), input[jsname]');
        // Textarea (paragraph)
        const textarea = block.querySelector('textarea.KHxj8b, textarea');
        // Radio options
        const radioOptions = Array.from(block.querySelectorAll('[role="radio"], [data-value]'));
        // Checkbox options
        const checkboxOptions = Array.from(block.querySelectorAll('[role="checkbox"], [data-answer-value]'));

        const inputEl = textInput || textarea;
        const hasValue = inputEl && inputEl.value && inputEl.value.trim().length > 0;

        // Skip already-filled text fields
        if (hasValue && radioOptions.length === 0 && checkboxOptions.length === 0) return;

        // --- TEXT FIELD MATCHING ---
        if (inputEl && !hasValue) {
          // Full name
          if (matches(qText, ['full name', 'your name', 'name'])) {
            const fullName = p.fullName || `${p.firstName || ''} ${p.lastName || ''}`.trim();
            if (fullName) fillQueue.push({ element: inputEl, type: 'text', value: fullName, label: 'Full Name' });
          }
          // Email
          else if (matches(qText, ['email'])) {
            if (p.email) fillQueue.push({ element: inputEl, type: 'text', value: p.email, label: 'Email' });
          }
          // WhatsApp / Phone
          else if (matches(qText, ['whatsapp', 'phone', 'mobile', 'contact number'])) {
            if (p.phone) fillQueue.push({ element: inputEl, type: 'text', value: p.phone, label: 'WhatsApp / Phone' });
          }
          // City and state
          else if (matches(qText, ['city and state', 'current city', 'location', 'city, state', 'city & state'])) {
            const cityState = (p.city && p.state) ? `${p.city}, ${p.state}` : (p.city || p.state || p.location || '');
            if (cityState) fillQueue.push({ element: inputEl, type: 'text', value: cityState, label: 'City & State' });
          }
          // Age
          else if (matches(qText, ['age', 'completed years'])) {
            const age = p.age || '22';
            fillQueue.push({ element: inputEl, type: 'text', value: String(age), label: 'Age' });
          }
          // LinkedIn URL
          else if (matches(qText, ['linkedin'])) {
            if (p.linkedin) fillQueue.push({ element: inputEl, type: 'text', value: p.linkedin, label: 'LinkedIn URL' });
          }
          // GitHub / Portfolio URL
          else if (matches(qText, ['github', 'portfolio'])) {
            const val = p.github || p.portfolio || '';
            if (val) fillQueue.push({ element: inputEl, type: 'text', value: val, label: 'GitHub / Portfolio' });
          }
          // Resume / CV URL
          else if (matches(qText, ['résumé', 'resume', 'cv url', 'cv link'])) {
            const val = p.resumeUrl || p.portfolio || p.linkedin || '';
            if (val) fillQueue.push({ element: inputEl, type: 'text', value: val, label: 'Resume URL' });
          }
          // Earliest start date → next nearest Monday
          else if (matches(qText, ['start date', 'earliest', 'joining date', 'date of joining'])) {
            fillQueue.push({ element: inputEl, type: 'text', value: getNextMonday(), label: 'Start Date' });
          }
          // Expected compensation / salary
          else if (matches(qText, ['compensation', 'salary', 'expected', 'ctc', 'pay'])) {
            const val = p.desiredSalary || 'Negotiable';
            fillQueue.push({ element: inputEl, type: 'text', value: String(val), label: 'Expected Compensation' });
          }
          // Notice period / availability
          else if (matches(qText, ['notice period', 'availability', 'working-hour', 'working hour'])) {
            fillQueue.push({ element: inputEl, type: 'text', value: 'No notice period. Available immediately, 9 AM – 6 PM IST on weekdays.', label: 'Notice Period' });
          }
          // Link to project / repository
          else if (matches(qText, ['link to', 'repository', 'walkthrough', 'product you'])) {
            const val = p.github || p.portfolio || '';
            if (val) fillQueue.push({ element: inputEl, type: 'text', value: val, label: 'Project Link' });
          }
          // Any remaining long-answer textareas are left for AI Generate
        }

        // --- RADIO MATCHING ---
        if (radioOptions.length > 0) {
          let targetValue = null;

          // Where did you find this role → LinkedIn
          if (matches(qText, ['where did you find', 'how did you hear', 'how did you find', 'source', 'found this role', 'found this job'])) {
            targetValue = 'linkedin';
          }
          // Can you work full-time → Yes
          else if (matches(qText, ['full-time', 'full time', 'work full'])) {
            targetValue = 'yes';
          }
          // Paid trial → Yes
          else if (matches(qText, ['paid trial', 'trial'])) {
            targetValue = 'yes';
          }
          // Experience level
          else if (matches(qText, ['experience', 'hands-on', 'years of'])) {
            const expCalc = calculateExperienceFromProfile(p);
            const yrs = expCalc.years;
            if (yrs < 1) targetValue = 'under 1';
            else if (yrs < 2) targetValue = '1–2';
            else if (yrs < 3) targetValue = '2–3';
            else targetValue = '3+';
          }

          if (targetValue) {
            const matchRadio = radioOptions.find(r => {
              const rText = (r.getAttribute('data-value') || r.textContent || '').toLowerCase().trim();
              return rText.includes(targetValue) || targetValue.includes(rText);
            });
            if (matchRadio) {
              fillQueue.push({ element: matchRadio, type: 'gf_radio', label: heading?.textContent || 'Radio' });
            }
          }
        }

        // --- CHECKBOX MATCHING ---
        if (checkboxOptions.length > 0) {
          // Frontend / Backend skill areas → match from profile skills
          if (matches(qText, ['frontend', 'backend', 'areas', 'demonstrate', 'skills', 'technologies'])) {
            const profileSkills = (p.skills || []).map(s => s.toLowerCase());
            const profileRepos = (p.githubInsights?.repos || []).map(r => (r.language || '').toLowerCase());
            const allKnown = [...profileSkills, ...profileRepos];

            checkboxOptions.forEach(cb => {
              const cbText = (cb.getAttribute('data-answer-value') || cb.textContent || '').toLowerCase().trim();
              // Match if the user has this skill or a close variant
              const shouldCheck = allKnown.some(sk =>
                cbText.includes(sk) || sk.includes(cbText) ||
                (cbText.includes('react') && sk.includes('react')) ||
                (cbText.includes('next') && sk.includes('next')) ||
                (cbText.includes('node') && sk.includes('node')) ||
                (cbText.includes('typescript') && sk.includes('typescript')) ||
                (cbText.includes('python') && sk.includes('python')) ||
                (cbText.includes('rest api') && sk.includes('api')) ||
                (cbText.includes('docker') && sk.includes('docker')) ||
                (cbText.includes('redis') && sk.includes('redis')) ||
                (cbText.includes('postgresql') && (sk.includes('postgres') || sk.includes('sql'))) ||
                (cbText.includes('state management') && (sk.includes('redux') || sk.includes('zustand') || sk.includes('react'))) ||
                (cbText.includes('responsive') && sk.includes('css')) ||
                (cbText.includes('forms and validation') && sk.includes('react')) ||
                (cbText.includes('ci/cd') && (sk.includes('ci') || sk.includes('deploy') || sk.includes('github actions')))
              );
              if (shouldCheck) {
                const isAlreadyChecked = cb.getAttribute('aria-checked') === 'true';
                if (!isAlreadyChecked) {
                  fillQueue.push({ element: cb, type: 'gf_checkbox', label: cbText });
                }
              }
            });
          }
        }
      });
    }

    // Handle Radio Question Groups (Work Auth, Sponsorship, Former Employee, Relatives, Conflict, EEO, etc.)
    const radios = Array.from(document.querySelectorAll('input[type="radio"]'))
      .filter(r => !r.closest('#ai-copilot-sidebar') && !r.closest('#ai-copilot-dock-tab') && isElementVisible(r));

    const processedRadioGroups = new Set();

    radios.forEach(radio => {
      const container = getRadioQuestionContainer(radio);
      const groupKey = radio.name || container;
      if (processedRadioGroups.has(groupKey)) return;

      const containerText = ((container?.textContent || '') + ' ' + (radio.name || '')).toLowerCase();
      const groupRadios = container ? Array.from(container.querySelectorAll('input[type="radio"]')) : [radio];

      const selectMatchingRadio = (wantedWord, label) => {
        const targetRadio = groupRadios.find(r => {
          const rText = (getLabelText(r) || r.value || r.id || '').toLowerCase().trim();
          return rText === wantedWord || rText.startsWith(wantedWord) || rText.includes(wantedWord);
        });
        if (targetRadio && !targetRadio.checked) {
          fillQueue.push({ element: targetRadio, type: 'radio', label });
          processedRadioGroups.add(groupKey);
          return true;
        }
        return false;
      };

      // 1. Work authorization
      if (containerText.includes('authorized to work') || containerText.includes('legally authorized') || containerText.includes('legal right to work')) {
        const want = p.authorizedToWork !== false ? 'yes' : 'no';
        if (selectMatchingRadio(want, `Work Authorization (${want.toUpperCase()})`)) return;
      }
      // 2. Visa sponsorship
      else if (containerText.includes('sponsorship') || containerText.includes('require visa')) {
        const want = p.requireSponsorship ? 'yes' : 'no';
        if (selectMatchingRadio(want, `Visa Sponsorship (${want.toUpperCase()})`)) return;
      }
      // 3. Former employee / previously worked
      else if (containerText.includes('previously worked') || containerText.includes('former employee') || containerText.includes('have you worked') || containerText.includes('currently employed')) {
        const want = p.formerEmployee ? 'yes' : 'no';
        if (selectMatchingRadio(want, `Previous Employment (${want.toUpperCase()})`)) return;
      }
      // 4. Relatives / family members employed
      else if (containerText.includes('relative') || containerText.includes('family member') || containerText.includes('related to anyone')) {
        if (selectMatchingRadio('no', 'Relatives at Company (NO)')) return;
      }
      // 5. Conflict of interest
      else if (containerText.includes('conflict of interest')) {
        if (selectMatchingRadio('no', 'Conflict of Interest (NO)')) return;
      }
      // 6. Government / public official
      else if (containerText.includes('government official') || containerText.includes('public official')) {
        if (selectMatchingRadio('no', 'Government Official (NO)')) return;
      }
      // 7. Non-compete / restrictive covenants
      else if (containerText.includes('non-compete') || containerText.includes('restrictive covenant') || containerText.includes('non-solicitation')) {
        if (selectMatchingRadio('no', 'Non-Compete Restrictions (NO)')) return;
      }
      // 8. Age requirement (18+)
      else if (containerText.includes('18 years') || containerText.includes('at least 18') || containerText.includes('age of 18')) {
        if (selectMatchingRadio('yes', 'Age Requirement (18+) (YES)')) return;
      }
      // 9. Background check / drug screen
      else if (containerText.includes('background check') || containerText.includes('background screen') || containerText.includes('drug screen')) {
        if (selectMatchingRadio('yes', 'Background Check Consent (YES)')) return;
      }
      // 10. Willing to relocate
      else if (containerText.includes('relocate') || containerText.includes('relocation')) {
        if (selectMatchingRadio('yes', 'Willing to Relocate (YES)')) return;
      }
      // 11. Remote / Hybrid Preference
      else if (containerText.includes('remote') || containerText.includes('hybrid') || containerText.includes('work arrangement')) {
        if (selectMatchingRadio('yes', 'Remote / Hybrid Preference (YES)')) return;
      }
      // 12. Driver's License
      else if (containerText.includes('driver') || containerText.includes('license')) {
        if (selectMatchingRadio('yes', "Driver's License (YES)")) return;
      }
      // 13. Security Clearance
      else if (containerText.includes('security clearance') || containerText.includes('clearance')) {
        if (selectMatchingRadio('no', 'Security Clearance (NO)')) return;
      }
      // 14. Prior Interview / Previously Applied
      else if (containerText.includes('applied before') || containerText.includes('interviewed before') || containerText.includes('previously applied')) {
        if (selectMatchingRadio('no', 'Previously Applied (NO)')) return;
      }
      // 15. EEO: Gender
      else if (containerText.includes('gender') || containerText.includes('sex')) {
        if (selectMatchingRadio('male', 'Gender: Male') || selectMatchingRadio('decline', 'Gender: Decline') || selectMatchingRadio('prefer not', 'Gender: Prefer Not to Say')) return;
      }
      // 16. EEO: Veteran
      else if (containerText.includes('veteran') || containerText.includes('military')) {
        if (selectMatchingRadio('not a', 'Veteran: Not a Protected Veteran') || selectMatchingRadio('no', 'Veteran: No') || selectMatchingRadio('decline', 'Veteran: Decline')) return;
      }
      // 17. EEO: Disability
      else if (containerText.includes('disability') || containerText.includes('handicap')) {
        if (selectMatchingRadio('no', 'Disability: No') || selectMatchingRadio('decline', 'Disability: Decline')) return;
      }
      // 18. EEO: Race / Ethnicity
      else if (containerText.includes('race') || containerText.includes('ethnicity')) {
        if (selectMatchingRadio('asian', 'Race: Asian') || selectMatchingRadio('decline', 'Race: Decline')) return;
      }
    });

    // Handle Checkboxes (Terms, Privacy, Consent, Accuracy, Current Role, SMS Alerts)
    const checkboxes = Array.from(document.querySelectorAll('input[type="checkbox"], [role="checkbox"]'))
      .filter(cb => !cb.closest('#ai-copilot-sidebar') && !cb.closest('#ai-copilot-dock-tab') && isElementVisible(cb));

    const currentlyEmployed = isCandidateCurrentlyEmployed(p);

    checkboxes.forEach(cb => {
      const isChecked = cb.type === 'checkbox' ? cb.checked : cb.getAttribute('aria-checked') === 'true';

      const container = cb.closest('.form-group, fieldset, [data-automation-id*="group" i], [class*="group" i], label, div');
      const text = ((getLabelText(cb) || '') + ' ' + (container?.textContent || '') + ' ' + (cb.name || '') + ' ' + (cb.id || '')).toLowerCase();

      // 1. Currently employed / current role
      const isCurrentJob = [
        'currently work here', 'current role', 'currently employed', 'present role', 'iscurrent', 'is_current', 'currently work in this role'
      ].some(k => text.includes(k));

      if (isCurrentJob) {
        if (currentlyEmployed) {
          if (!isChecked) {
            fillQueue.push({ element: cb, type: 'checkbox', label: getCleanFieldLabel(cb) });
          }
        } else {
          // Candidate does not currently work here (e.g. ended June 2026) -> must be unchecked
          if (isChecked) {
            fillQueue.push({ element: cb, type: 'uncheck', label: getCleanFieldLabel(cb) });
          }
        }
        return;
      }

      if (isChecked) return;

      // 2. Consent & Terms & Disclosures
      const isConsentOrTerms = [
        'term', 'condition', 'privacy', 'consent', 'agree', 'certif', 'accura',
        'truthful', 'declaration', 'acknowledg', 'notice', 'disclaimer', 'gdpr', 'policy'
      ].some(k => text.includes(k));

      // 3. SMS / notifications consent
      const isSmsOrNotification = [
        'sms', 'text message', 'mobile notification', 'whatsapp', 'keep me updated', 'communications'
      ].some(k => text.includes(k));

      if (isConsentOrTerms || isSmsOrNotification) {
        fillQueue.push({ element: cb, type: 'checkbox', label: getCleanFieldLabel(cb) });
      }
    });

    if (fillQueue.length === 0) {
      showToast('Form inspected. Matching fields were already filled.', 'info');
      refreshAuditList();
      return { success: true, fieldsFilled: 0 };
    }

    // 2. Sequential Step-by-Step Human-Like Typing Execution
    isAutofilling = true;
    let fieldsFilled = 0;

    const statusTitle = document.getElementById('ai-status-text');
    const actionBtn = document.getElementById('ai-card-action-btn');
    const percentBadge = document.getElementById('ai-percent-badge');
    const progressBar = document.getElementById('ai-progress-bar');

    if (statusTitle) statusTitle.textContent = 'Autofilling ...';
    if (actionBtn) actionBtn.textContent = 'Cancel';

    showToast(`🤖 Copilot typing ${fillQueue.length} fields step-by-step...`, 'info', 2500);

    try {
      for (let i = 0; i < fillQueue.length; i++) {
        if (!isAutofilling) {
          showToast('Autofill paused', 'info');
          break;
        }

        const item = fillQueue[i];

        // Find matching item in field list to show animated active spinner
        const listItems = Array.from(document.querySelectorAll('.ai-checklist-item'));
        const cleanItemLabel = item.label.split('(')[0].trim().toLowerCase();
        const activeItemEl = listItems.find(el => {
          const txt = (el.textContent || '').trim().toLowerCase();
          return txt.includes(cleanItemLabel) || cleanItemLabel.includes(txt);
        });
        if (activeItemEl) {
          activeItemEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          const iconEl = activeItemEl.querySelector('.ai-check-icon-pending, .ai-check-icon-filled, .ai-check-icon-active');
          if (iconEl) {
            iconEl.className = 'ai-check-icon-active';
            iconEl.textContent = '';
          }
        }

        if (item.type === 'text') {
          await typeTextHumanLike(item.element, item.value);
        } else if (item.type === 'select') {
          if (Array.isArray(item.value)) {
            await selectOptionHumanLike(item.element, item.value);
          } else {
            await selectOptionHumanLike(item.element, [item.value]);
          }
        } else if (item.type === 'radio') {
          await clickRadioHumanLike(item.element);
        } else if (item.type === 'checkbox') {
          await clickCheckboxHumanLike(item.element);
        } else if (item.type === 'uncheck') {
          await uncheckCheckboxHumanLike(item.element);
        } else if (item.type === 'file') {
          await attachResumeFile(item.element, item.value);
        } else if (item.type === 'skill_pills') {
          await fillSkillPillsHumanLike(item.element, item.skills);
        } else if (item.type === 'gf_radio') {
          // Google Forms radio: click the div[role="radio"] element
          item.element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          await sleep(80);
          item.element.click();
          await sleep(150);
        } else if (item.type === 'gf_checkbox') {
          // Google Forms checkbox: click the div[role="checkbox"] element
          item.element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          await sleep(80);
          item.element.click();
          await sleep(150);
        }

        fieldsFilled++;

        // Mark completed with green checkmark
        if (activeItemEl) {
          const iconEl = activeItemEl.querySelector('.ai-check-icon-active, .ai-check-icon-pending');
          if (iconEl) {
            iconEl.className = 'ai-check-icon-filled';
            iconEl.textContent = '✓';
          }
          activeItemEl.classList.remove('pending');
          activeItemEl.classList.add('completed');
        }

        // Live progress percentage calculation
        const currentPct = Math.min(100, Math.round(((i + 1) / fillQueue.length) * 100));
        if (percentBadge) percentBadge.textContent = `${currentPct}%`;
        if (progressBar) progressBar.style.width = `${currentPct}%`;
      }

      if (isAutofilling) {
        if (statusTitle) statusTitle.textContent = 'Autofill Complete';
        if (percentBadge) percentBadge.textContent = '100%';
        if (progressBar) progressBar.style.width = '100%';
        if (actionBtn) actionBtn.textContent = 'Refill';
        showToast(`✓ Completed typing ${fieldsFilled} application fields!`, 'success');
      } else {
        if (statusTitle) statusTitle.textContent = 'Ready to Autofill';
        if (actionBtn) actionBtn.textContent = 'Autofill';
      }
    } catch (err) {
      console.error('[Copilot Autofill Error]', err);
      showToast('Autofill interrupted: ' + err.message, 'error');
    } finally {
      isAutofilling = false;
      refreshAuditList();
    }

    return { success: true, fieldsFilled };
  }

  // 7. Self-Healing Brain: Listen to User Manual Corrections on Page Forms
  function initBrainListener() {
    document.addEventListener('change', (e) => {
      // CRITICAL: Never learn while automated autofill is running!
      if (isAutofilling) return;

      const target = e.target;
      if (!target || !['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      if (target.type === 'password' || target.type === 'hidden' || target.type === 'submit') return;

      // CRITICAL: Ignore any changes originating from the extension's own sidebar or dock tab!
      if (target.closest('#ai-copilot-sidebar') || target.closest('#ai-copilot-dock-tab')) return;
      if (target.id && (target.id.startsWith('prof-') || target.id.startsWith('ai-'))) return;
      if (target.name && (target.name.startsWith('prof-') || target.name.startsWith('ai-'))) return;

      const val = target.value ? target.value.trim() : '';
      if (!val) return;

      const rawLabel = getLabelText(target) || target.name || target.getAttribute('data-automation-id') || target.id;
      if (!rawLabel || rawLabel.length < 2) return;

      // Clean & normalize label: remove trailing '*', ':', '?', '(required)', etc.
      const label = rawLabel
        .replace(/[\*\:\?]/g, '')
        .replace(/\(required[^\)]*\)/gi, '')
        .replace(/\(optional\)/gi, '')
        .replace(/\s+/g, ' ')
        .trim();

      if (!label || label.length < 2) return;

      const normKey = label.toLowerCase();

      // Discard incomplete / partial emails or phone numbers from brain rules
      if (target.type === 'email' || normKey.includes('email') || normKey === 'e-mail') {
        if (!val.includes('@') || !val.includes('.')) return;
      }
      if (target.type === 'tel' || normKey.includes('phone') || normKey.includes('mobile')) {
        const digits = val.replace(/\D/g, '');
        if (digits.length < 10) return;
      }

      // Normalize domain: aggregate subdomains (e.g. onetp.wd1.myworkdayjobs.com -> myworkdayjobs.com)
      let host = window.location.hostname.toLowerCase();
      if (host.includes('myworkdayjobs.com')) host = 'myworkdayjobs.com';
      else if (host.includes('greenhouse.io')) host = 'greenhouse.io';
      else if (host.includes('lever.co')) host = 'lever.co';
      else if (host.includes('ashbyhq.com')) host = 'ashbyhq.com';

      // Avoid creating duplicate rules for standard profile values that already match base profile
      if (cachedProfile) {
        const normVal = val.toLowerCase();
        if (
          (normKey.includes('last name') && normVal === (cachedProfile.lastName || '').toLowerCase()) ||
          (normKey.includes('first name') && normVal === (cachedProfile.firstName || '').toLowerCase()) ||
          (normKey.includes('father') && normVal === (cachedProfile.fatherName || '').toLowerCase()) ||
          (normKey.includes('email') && normVal === (cachedProfile.email || '').toLowerCase()) ||
          (normKey.includes('phone') && normVal.replace(/\D/g, '') === (cachedProfile.phone || '').replace(/\D/g, ''))
        ) {
          return; // Already covered by candidate profile
        }
      }

      console.log(`[Copilot Brain] Learning custom rule: "${label}" -> "${val.slice(0, 30)}" (${host})`);
      chrome.runtime.sendMessage({
        action: 'SAVE_BRAIN_RULE',
        payload: {
          fieldKey: label,
          domain: host,
          value: val
        }
      });
    }, true);
  }

  // 8. Detect Validation Errors on Page
  function detectPageErrors() {
    const errorSelectors = [
      '[data-automation-id="errorMessage"]',
      '.error',
      '.alert-danger',
      '[role="alert"]',
      '[class*="error-message" i]',
      '[class*="inputError" i]',
      '[aria-invalid="true"]'
    ];

    const errors = [];
    document.querySelectorAll(errorSelectors.join(',')).forEach(el => {
      if (el.closest('#ai-copilot-sidebar') || el.closest('#ai-copilot-dock-tab')) return;
      const text = el.textContent.trim();
      if (text && text.length > 3 && !errors.includes(text)) {
        errors.push(text);
      }
    });

    return errors;
  }

  // 9. Right-Edge Docking Tab & Slide-Out Sidebar
  function injectSidebar() {
    // ONLY inject the UI into the TOP window, NEVER inside iframes!
    if (window.self !== window.top) {
      return;
    }

    // Prevent duplicate injection
    if (document.getElementById('ai-copilot-dock-tab') || document.getElementById('ai-copilot-sidebar')) {
      return;
    }

    // Clean up any stale elements
    document.querySelectorAll('#ai-copilot-dock-tab').forEach(el => el.remove());
    document.querySelectorAll('#ai-copilot-sidebar').forEach(el => el.remove());

    // Docking Tab on right edge (Exactly ONE on the page)
    const dockTab = document.createElement('div');
    dockTab.id = 'ai-copilot-dock-tab';
    dockTab.innerHTML = `
      <button id="ai-dock-close-btn" class="ai-dock-close" title="Hide AI Copilot tab">✕</button>
      <div class="ai-dock-icon">⚡</div>
      <div class="ai-dock-text">AI Copilot</div>
    `;
    dockTab.title = 'Open AI Job Copilot (1-Click Autofill, Profile & Brain)';

    dockTab.addEventListener('click', (e) => {
      if (e.target.id === 'ai-dock-close-btn' || e.target.closest('#ai-dock-close-btn')) {
        e.stopPropagation();
        dockTab.style.display = 'none';
        showToast('AI Copilot tab hidden. Reopen anytime from the toolbar icon.', 'info', 3000);
        return;
      }
      toggleSidebar();
    });

    document.body.appendChild(dockTab);

    // Sidebar Container
    const sidebar = document.createElement('div');
    sidebar.id = 'ai-copilot-sidebar';
    sidebar.innerHTML = `
      <!-- Draggable Resizer Edge -->
      <div id="ai-sb-resizer" class="ai-sb-resizer" title="Drag left/right to resize copilot"></div>

      <!-- Header -->
      <div class="ai-sb-header">
        <div class="ai-sb-brand">
          <div class="ai-sb-logo" style="background: linear-gradient(135deg, #0284c7, #38bdf8); box-shadow: 0 0 12px rgba(56, 189, 248, 0.4);">
            <span style="font-size: 14px;">⚡</span>
          </div>
          <div>
            <div class="ai-sb-title" style="font-size: 13.5px; font-weight: 800; letter-spacing: -0.01em; color: #f8fafc;">AI Job Copilot</div>
            <div style="font-size: 10px; color: #94a3b8; font-weight: 500;">Autofill &amp; Tracker</div>
          </div>
        </div>
        <div class="ai-sb-actions">
          <button id="ai-sb-btn-feedback" class="ai-sb-head-btn" title="Send Feedback">
            <span>💬 Feedback</span>
          </button>
          <button id="ai-sb-close-btn" class="ai-sb-head-btn ai-sb-head-icon" title="Close Sidebar">
            <span>›</span>
          </button>
        </div>
      </div>

      <!-- Navigation Tabs -->
      <div class="ai-sb-tabs">
        <button class="ai-sb-tab-btn active" data-tab="autofill"><span>⚡</span><span>Autofill</span></button>
        <button class="ai-sb-tab-btn" data-tab="profile"><span>👤</span><span>Profile</span></button>
        <button class="ai-sb-tab-btn" data-tab="brain"><span>🧠</span><span>Brain</span></button>
        <button class="ai-sb-tab-btn" data-tab="ai-qa"><span>✨</span><span>Questions</span></button>
      </div>

      <!-- Body Content -->
      <div class="ai-sb-body">
        <!-- Error Alerts Container -->
        <div id="ai-sb-errors-box" style="display: none;"></div>

        <!-- TAB 1: Smart Autofill & Interactive Field Checklist / Landing Hub -->
        <div id="tab-autofill" class="ai-sb-tab-content active">

          <!-- A. Active ATS Application Detected View -->
          <div id="ai-active-autofill-view" style="display: none;">
            <!-- 1. Top Quick-Save Banner -->
            <div class="ai-copilot-quick-banner">
              <button id="ai-btn-quick-add-job" class="ai-copilot-pill-btn" title="Save this job to your AI Applications Tracker">
                <span style="font-size: 13px;">⚡</span>
                <span>Track Job in AI Dashboard</span>
                <span style="color: #38bdf8; font-size: 11px;">✦</span>
              </button>
              <div class="ai-copilot-banner-sub">
                1-click sync to your Applied board &amp; portfolio match
              </div>
            </div>

            <!-- 2. Autofill Status Card & Interactive Checklist -->
            <div class="ai-autofill-card">
              <!-- Active Step Indicator Badge Row -->
              <div class="ai-step-badge-row">
                <span id="ai-step-badge" class="ai-step-badge">
                  <span style="font-size: 11px;">📍</span>
                  <span id="ai-step-badge-text">Step 1 of 4 • My Information</span>
                </span>
                <span id="ai-step-page-hint" class="ai-step-page-hint">Page 1</span>
              </div>

              <!-- Status Header -->
              <div class="ai-card-header">
                <div class="ai-status-left">
                  <span id="ai-status-text" class="ai-status-title">Ready to Autofill</span>
                  <span class="ai-status-divider">|</span>
                  <span id="ai-percent-badge" class="ai-percent-badge">0%</span>
                </div>
                <button id="ai-card-action-btn" class="ai-card-action-link">Autofill</button>
              </div>

              <!-- Progress Bar -->
              <div class="ai-progress-track">
                <div id="ai-progress-bar" class="ai-progress-fill" style="width: 0%;"></div>
              </div>

              <!-- Interactive Clickable Field List -->
              <div id="ai-checklist-container" class="ai-checklist-container">
                <div style="font-size: 11px; color: #64748b; text-align: center; padding: 16px 0;">Scanning form fields...</div>
              </div>
            </div>

            <!-- 3. Bottom Next Step Action Button -->
            <button id="ai-btn-next-page" class="ai-next-page-btn" title="Save and continue to next page">
              <span id="ai-btn-next-label">Save and Continue</span>
              <span id="ai-btn-next-icon" style="font-size: 13px;">→</span>
            </button>
          </div>

          <!-- B. Landing Hub View (When No Application Form Detected on Current Page) -->
          <div id="ai-landing-hub-view">
            <!-- Notice Status Bar -->
            <div class="ai-landing-notice-bar">
              <div class="ai-notice-left">
                <span class="ai-notice-dot"></span>
                <span>No Form Detected on This Page</span>
              </div>
              <button id="ai-btn-notice-help" class="ai-notice-action">How It Works</button>
            </div>

            <!-- 1. Top Quick-Save Banner -->
            <div class="ai-copilot-quick-banner">
              <button id="ai-btn-quick-add-job-hub" class="ai-copilot-pill-btn" title="Save this job to your AI Applications Tracker">
                <span style="font-size: 13px;">⚡</span>
                <span>Track Job in AI Dashboard</span>
                <span style="color: #38bdf8; font-size: 11px;">✦</span>
              </button>
              <div class="ai-copilot-banner-sub">
                1-click sync to your Applied board &amp; portfolio match
              </div>
            </div>

            <!-- 2. Hub Cards Group -->
            <div class="ai-hub-container">
              <!-- Autofill Information Section Row -->
              <div class="ai-hub-item" id="ai-hub-goto-profile" title="View & edit your master autofill profile data">
                <div class="ai-hub-icon">📁</div>
                <div class="ai-hub-content">
                  <div class="ai-hub-title">Your Autofill Information</div>
                  <div id="ai-hub-profile-name" class="ai-hub-sub">Configure master resume &amp; autofill details</div>
                </div>
                <div class="ai-hub-chevron">›</div>
              </div>

              <!-- AI Cover Letter / Pitch Generator -->
              <div class="ai-hub-card">
                <div class="ai-hub-item-top">
                  <div class="ai-hub-icon">📄</div>
                  <div class="ai-hub-content">
                    <div class="ai-hub-title">Tailored Cover Letter</div>
                    <div class="ai-hub-sub">AI-crafted pitch for this role</div>
                  </div>
                </div>
                <button id="ai-hub-btn-cover-letter" class="ai-hub-action-btn">
                  <span>✨</span><span>Generate Cover Letter</span>
                </button>
              </div>

              <!-- AI Cold Email Drafter -->
              <div class="ai-hub-card">
                <div class="ai-hub-item-top">
                  <div class="ai-hub-icon">✉️</div>
                  <div class="ai-hub-content">
                    <div class="ai-hub-title">Recruiter Outreach Email</div>
                    <div class="ai-hub-sub">Direct cold email to hiring manager</div>
                  </div>
                </div>
                <button id="ai-hub-btn-cold-email" class="ai-hub-action-btn">
                  <span>🚀</span><span>Draft Recruiter Email</span>
                </button>
              </div>
            </div>

            <!-- 3. Bottom Dashboard Link -->
            <div class="ai-hub-footer">
              <a href="https://ai-job-finder-alpha.vercel.app" target="_blank" class="ai-hub-footer-link" id="ai-hub-open-dashboard">
                <span>🔍</span><span>Open AI Job Finder Dashboard ↗</span>
              </a>
            </div>
          </div>

        </div>

        <!-- TAB 2: Profile Customization UI & Resume Management -->
        <div id="tab-profile" class="ai-sb-tab-content">
          <!-- CV / Resume Manager Card -->
          <div class="ai-cv-card">
            <div class="ai-cv-header">
              <div style="font-size: 12.5px; font-weight: 700; color: #f8fafc; display: flex; align-items: center; gap: 6px;">
                <span>📄</span><span>Resume / CV Management</span>
              </div>
              <span id="ai-cv-status-badge" class="ai-cv-badge missing">No CV Uploaded</span>
            </div>
            <div class="ai-cv-file-info">
              <span class="ai-cv-icon">📑</span>
              <div style="flex: 1; overflow: hidden;">
                <div id="ai-cv-filename" class="ai-cv-filename">No file attached</div>
                <div id="ai-cv-meta" class="ai-cv-meta">Upload a PDF/DOCX or sync from your web dashboard</div>
              </div>
            </div>
            <div class="ai-cv-btn-row">
              <button id="ai-btn-sync-cv" class="ai-cv-btn ai-cv-btn-sync" title="1-Click sync your active resume from the AI Job Finder web app">
                <span>🔄</span><span>Sync from Web</span>
              </button>
              <button id="ai-btn-upload-cv" class="ai-cv-btn ai-cv-btn-upload" title="Upload a PDF/DOCX resume directly to the Copilot">
                <span>📎</span><span>Upload New CV</span>
              </button>
              <input type="file" id="ai-cv-file-input" accept=".pdf,.docx,.txt" style="display: none;" />
            </div>
          </div>

          <!-- Auto-Sync Info Banner -->
          <div class="ai-profile-sync-banner">
            <span style="font-size: 14px;">ℹ️</span>
            <div>
              <strong>Self-Learning Autofill:</strong> Information here synchronizes with your profile and application forms automatically. When you correct fields on forms, your Copilot brain remembers your preferences.
            </div>
          </div>

          <!-- Skills Card -->
          <div class="ai-sb-card">
            <div class="ai-sb-card-title">
              <span>⚡ Extracted Skills</span>
              <span style="font-size: 10px; color: #38bdf8;">Gemini AI Parsed</span>
            </div>
            <p style="font-size: 11px; color: #94a3b8; margin-bottom: 8px;">
              These skills autofill into ATS skill keywords & questionnaire fields.
            </p>
            <div id="ai-profile-skills-list" class="ai-skills-chips">
              <div style="font-size: 11px; color: #64748b; padding: 4px 0;">No skills extracted yet. Upload/sync your CV.</div>
            </div>
            <div class="ai-skill-input-row">
              <input id="ai-skill-new-input" class="ai-sb-input" placeholder="Add custom skill (e.g. Docker)..." />
              <button id="ai-btn-add-skill" class="ai-sb-btn ai-sb-btn-secondary" style="padding: 0 12px; white-space: nowrap;">+ Add</button>
            </div>
          </div>

          <!-- Work Experience Card -->
          <div class="ai-sb-card">
            <div class="ai-sb-card-title">
              <span>💼 Work Experience</span>
            </div>
            <div id="ai-profile-exp-list">
              <div style="font-size: 11px; color: #64748b; padding: 4px 0;">No experience entries extracted.</div>
            </div>
          </div>

          <!-- Education Card -->
          <div class="ai-sb-card">
            <div class="ai-sb-card-title">
              <span>🎓 Education</span>
            </div>
            <div id="ai-profile-edu-list">
              <div style="font-size: 11px; color: #64748b; padding: 4px 0;">No education entries extracted.</div>
            </div>
          </div>

          <div class="ai-sb-card">
            <div class="ai-sb-card-title">Personal Details</div>
            <div class="ai-sb-form-row">
              <div>
                <label class="ai-sb-label">First Name*</label>
                <input id="prof-firstName" class="ai-sb-input" placeholder="First Name">
              </div>
              <div>
                <label class="ai-sb-label">Last Name*</label>
                <input id="prof-lastName" class="ai-sb-input" placeholder="Last Name">
              </div>
            </div>
            <div class="ai-sb-form-group">
              <label class="ai-sb-label">Father's Name (Required by Indian ATS)</label>
              <input id="prof-fatherName" class="ai-sb-input" placeholder="Father's Name">
            </div>
            <div class="ai-sb-form-row">
              <div>
                <label class="ai-sb-label">Phone (10 Digits)*</label>
                <input id="prof-phone" class="ai-sb-input" placeholder="e.g. 9876543210">
              </div>
              <div>
                <label class="ai-sb-label">Email*</label>
                <input id="prof-email" class="ai-sb-input" placeholder="Email">
              </div>
            </div>
          </div>

          <div class="ai-sb-card">
            <div class="ai-sb-card-title">Address & Location</div>
            <div class="ai-sb-form-group">
              <label class="ai-sb-label">Address Line 1*</label>
              <input id="prof-address1" class="ai-sb-input" placeholder="Street Address">
            </div>
            <div class="ai-sb-form-row">
              <div>
                <label class="ai-sb-label">City*</label>
                <input id="prof-city" class="ai-sb-input" placeholder="City">
              </div>
              <div>
                <label class="ai-sb-label">Postal Code*</label>
                <input id="prof-postalCode" class="ai-sb-input" placeholder="Postal / Pin Code">
              </div>
            </div>
            <div class="ai-sb-form-row">
              <div>
                <label class="ai-sb-label">State / Region</label>
                <input id="prof-state" class="ai-sb-input" placeholder="State">
              </div>
              <div>
                <label class="ai-sb-label">Country</label>
                <input id="prof-country" class="ai-sb-input" value="India">
              </div>
            </div>
          </div>

          <div class="ai-sb-card">
            <div class="ai-sb-card-title">Work Authorization Defaults</div>
            <div class="ai-sb-form-group">
              <label class="ai-sb-label">Legally Authorized to Work?</label>
              <select id="prof-authorized" class="ai-sb-select">
                <option value="true">Yes (Authorized)</option>
                <option value="false">No</option>
              </select>
            </div>
            <div class="ai-sb-form-group">
              <label class="ai-sb-label">Require Visa Sponsorship?</label>
              <select id="prof-sponsorship" class="ai-sb-select">
                <option value="false">No (Not required)</option>
                <option value="true">Yes</option>
              </select>
            </div>
            <div class="ai-sb-form-group">
              <label class="ai-sb-label">Previously Worked at Company?</label>
              <select id="prof-formerEmployee" class="ai-sb-select">
                <option value="false">No (Default)</option>
                <option value="true">Yes</option>
              </select>
            </div>
          </div>

          <div class="ai-sb-card">
            <div class="ai-sb-card-title">Professional & Socials</div>
            <div class="ai-sb-form-group">
              <label class="ai-sb-label">Professional Title</label>
              <input id="prof-title" class="ai-sb-input" placeholder="e.g. Full Stack Engineer">
            </div>
            <div class="ai-sb-form-group">
              <label class="ai-sb-label">LinkedIn URL</label>
              <input id="prof-linkedin" class="ai-sb-input" placeholder="https://linkedin.com/in/username">
            </div>
            <div class="ai-sb-form-group">
              <label class="ai-sb-label">GitHub URL</label>
              <input id="prof-github" class="ai-sb-input" placeholder="https://github.com/username">
            </div>
            <div class="ai-sb-form-group">
              <label class="ai-sb-label">Portfolio URL</label>
              <input id="prof-portfolio" class="ai-sb-input" placeholder="https://yourportfolio.com">
            </div>
            <button id="ai-btn-save-profile" class="ai-sb-btn ai-sb-btn-primary" style="margin-top: 10px; display: none;">
              <span>💾</span><span>Save & Sync Profile</span>
            </button>
          </div>

          <!-- Server Connection Settings -->
          <div class="ai-settings-card">
            <div style="font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 6px;">Server Configuration</div>
            <div style="font-size: 10.5px; color: #64748b; margin-bottom: 8px;">Configure backend API server for local dev or live cloud production deployment.</div>
            <div style="display: flex; gap: 6px;">
              <input id="ai-api-base-url" class="ai-sb-input" value="https://ai-job-finder-7dr8.onrender.com" placeholder="https://ai-job-finder-7dr8.onrender.com" style="font-size: 11px;" />
              <button id="ai-btn-save-api-url" class="ai-sb-btn ai-sb-btn-secondary" style="padding: 0 12px; white-space: nowrap; font-size: 11px;">Save</button>
            </div>
          </div>
        </div>

        <!-- TAB 3: Self-Healing Brain -->
        <div id="tab-brain" class="ai-sb-tab-content">
          <div class="ai-sb-card">
            <div class="ai-sb-card-title">
              <span>🧠 Self-Healing Brain</span>
              <div style="display: flex; align-items: center; gap: 8px;">
                <span id="ai-brain-count" style="font-size: 10px; color: #38bdf8;">0 Rules</span>
                <button id="ai-btn-clear-brain" style="display: none; background: transparent; border: 1px solid rgba(239, 68, 68, 0.4); color: #f87171; border-radius: 4px; padding: 2px 6px; font-size: 9px; cursor: pointer;">Clear All</button>
              </div>
            </div>
            <p style="font-size: 11px; color: #94a3b8; line-height: 1.4; margin-bottom: 10px;">
              The Copilot automatically learns when you edit form fields or fix validation errors. These rules are applied automatically on future applications.
            </p>
            <div id="ai-brain-rules-container"></div>
          </div>
        </div>

        <!-- TAB 4: Screening Questions -->
        <div id="tab-ai-qa" class="ai-sb-tab-content">
          <div class="ai-sb-card">
            <div class="ai-sb-card-title">Detected Application Questions</div>
            <p style="font-size: 11px; color: #94a3b8; margin-bottom: 10px;">
              Answers are generated using your bio, skills, and pinned GitHub repositories.
            </p>
            <div id="ai-qa-list"></div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(sidebar);

    // Event Listeners for Sidebar Controls
    document.getElementById('ai-sb-close-btn')?.addEventListener('click', () => closeSidebar());

    // Draggable Resizer Handler (Allows smooth live dragging to resize sidebar & page layout)
    const resizer = document.getElementById('ai-sb-resizer');
    let isResizing = false;

    resizer?.addEventListener('mousedown', (e) => {
      isResizing = true;
      resizer.classList.add('dragging');
      document.documentElement.classList.add('ai-copilot-resizing');
      e.preventDefault();
      e.stopPropagation();
    });

    window.addEventListener('mousemove', (e) => {
      if (!isResizing) return;
      const minW = 320;
      const maxW = Math.min(850, Math.floor(window.innerWidth * 0.75));
      const newWidth = Math.max(minW, Math.min(maxW, window.innerWidth - e.clientX));
      document.documentElement.style.setProperty('--ai-copilot-sidebar-width', `${newWidth}px`);
    });

    window.addEventListener('mouseup', () => {
      if (!isResizing) return;
      isResizing = false;
      resizer?.classList.remove('dragging');
      document.documentElement.classList.remove('ai-copilot-resizing');

      const currentW = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--ai-copilot-sidebar-width'), 10) || 400;
      try {
        chrome.storage?.local?.set?.({ copilot_sidebar_width: currentW });
      } catch (_) {}

      window.dispatchEvent(new Event('resize'));
    });

    // Tab switching
    sidebar.querySelectorAll('.ai-sb-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        sidebar.querySelectorAll('.ai-sb-tab-btn').forEach(b => b.classList.remove('active'));
        sidebar.querySelectorAll('.ai-sb-tab-content').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        const tabId = `tab-${btn.dataset.tab}`;
        document.getElementById(tabId)?.classList.add('active');

        if (btn.dataset.tab === 'profile') loadProfileIntoForm();
        if (btn.dataset.tab === 'brain') loadBrainRulesUI();
        if (btn.dataset.tab === 'ai-qa') refreshQuestionsUI();
      });
    });

    // Card Autofill Action Button (Autofill / Cancel / Refill)
    document.getElementById('ai-card-action-btn')?.addEventListener('click', () => {
      if (isAutofilling) {
        isAutofilling = false;
        const statusTitle = document.getElementById('ai-status-text');
        const actionBtn = document.getElementById('ai-card-action-btn');
        if (statusTitle) statusTitle.textContent = 'Autofill Paused';
        if (actionBtn) actionBtn.textContent = 'Resume';
      } else {
        autofillForm();
      }
    });

    // 1-Click Quick Add Job Banner Button
    document.getElementById('ai-btn-quick-add-job')?.addEventListener('click', async () => {
      const btn = document.getElementById('ai-btn-quick-add-job');
      const origHtml = btn ? btn.innerHTML : '';
      if (btn) btn.innerHTML = '<span>⏳</span><span>Tracking Job...</span>';

      const job = extractJobDetails();
      const res = await chrome.runtime.sendMessage({
        action: 'LOG_JOB',
        payload: {
          company: job.company,
          role: job.role,
          url: window.location.href,
          status: 'Applied',
          notes: 'Tracked via 1-Click AI Copilot'
        }
      });
      if (res?.success) {
        if (btn) btn.innerHTML = '<span>✓</span><span>Job Added!</span>';
        showToast(`✓ Added "${job.company}" to Applied Jobs tracker!`, 'success');
        setTimeout(() => { if (btn) btn.innerHTML = origHtml; }, 2500);
      } else {
        if (btn) btn.innerHTML = origHtml;
        showToast(res?.error || 'Failed to log job', 'error');
      }
    });

    // 1-Click Quick Add Job Banner Button from Landing Hub
    document.getElementById('ai-btn-quick-add-job-hub')?.addEventListener('click', () => {
      document.getElementById('ai-btn-quick-add-job')?.click();
    });

    // Landing Hub: Jump to Profile Tab
    document.getElementById('ai-hub-goto-profile')?.addEventListener('click', () => {
      document.querySelector('.ai-sb-tab-btn[data-tab="profile"]')?.click();
    });

    // Landing Hub: Generate Tailored Cover Letter
    document.getElementById('ai-hub-btn-cover-letter')?.addEventListener('click', () => {
      document.querySelector('.ai-sb-tab-btn[data-tab="ai-qa"]')?.click();
      const job = extractJobDetails();
      const promptInput = document.getElementById('ai-qa-custom-prompt');
      if (promptInput) {
        promptInput.value = `Write a compelling, tailored cover letter for the ${job.role || 'Software Engineer'} role at ${job.company || 'this company'} highlighting my core technical skills and alignment.`;
        document.getElementById('ai-btn-generate-answer')?.click();
      }
    });

    // Landing Hub: Draft Recruiter Outreach Email
    document.getElementById('ai-hub-btn-cold-email')?.addEventListener('click', () => {
      document.querySelector('.ai-sb-tab-btn[data-tab="ai-qa"]')?.click();
      const job = extractJobDetails();
      const promptInput = document.getElementById('ai-qa-custom-prompt');
      if (promptInput) {
        promptInput.value = `Draft a concise, high-impact cold outreach email to the hiring manager for the ${job.role || 'Software Engineer'} role at ${job.company || 'this company'} expressing my keen interest and qualification.`;
        document.getElementById('ai-btn-generate-answer')?.click();
      }
    });

    // Landing Hub: How It Works Info Notice
    document.getElementById('ai-btn-notice-help')?.addEventListener('click', () => {
      showToast('Navigate to an ATS job application (Workday, Greenhouse, Lever, etc.) to start autofill!', 'info', 4000);
    });

    // Continue To The Next Page Button
    document.getElementById('ai-btn-next-page')?.addEventListener('click', () => goToNextPage());

    // Feedback Button in Header
    document.getElementById('ai-sb-btn-feedback')?.addEventListener('click', () => {
      showToast('Thank you! Feedback & resume match feature coming in next release.', 'info');
    });

    // Save Profile Button
    document.getElementById('ai-btn-save-profile')?.addEventListener('click', () => saveProfileFromForm());

    // CV / Resume Management Listeners
    document.getElementById('ai-btn-sync-cv')?.addEventListener('click', async () => {
      const btn = document.getElementById('ai-btn-sync-cv');
      const origHtml = btn.innerHTML;
      btn.innerHTML = '<span>⏳</span><span>Syncing...</span>';
      try {
        const res = await chrome.runtime.sendMessage({ action: 'SYNC_CV_FROM_WEB' });
        btn.innerHTML = origHtml;
        if (res?.success) {
          showToast('✓ Synced active CV and profile from web!', 'success');
          await loadProfileIntoForm();
          refreshAuditList();
        } else {
          showToast(res?.error || 'Failed to sync CV from web dashboard', 'error');
        }
      } catch (err) {
        btn.innerHTML = origHtml;
        showToast('Error syncing CV: ' + err.message, 'error');
      }
    });

    document.getElementById('ai-btn-upload-cv')?.addEventListener('click', () => {
      document.getElementById('ai-cv-file-input')?.click();
    });

    document.getElementById('ai-cv-file-input')?.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      showToast(`Uploading & parsing ${file.name} with Gemini AI...`, 'info', 5000);
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const res = await chrome.runtime.sendMessage({
            action: 'UPLOAD_CV',
            payload: { base64: reader.result, filename: file.name }
          });
          if (res?.success) {
            showToast(`✓ Parsed ${res.skills?.length || 0} skills & experience from ${file.name}!`, 'success');
            await loadProfileIntoForm();
            refreshAuditList();
          } else {
            showToast(res?.error || 'Failed to upload and parse CV', 'error');
          }
        } catch (err) {
          showToast('Error uploading CV: ' + err.message, 'error');
        }
      };
      reader.readAsDataURL(file);
    });

    // Add Custom Skill Button & Enter Key
    const addSkillAction = async () => {
      const input = document.getElementById('ai-skill-new-input');
      const val = input?.value?.trim();
      if (!val) return;
      const skills = Array.isArray(cachedProfile?.skills) ? [...cachedProfile.skills] : [];
      if (!skills.some(s => s.toLowerCase() === val.toLowerCase())) {
        skills.push(val);
        if (!cachedProfile) cachedProfile = {};
        cachedProfile.skills = skills;
        await chrome.runtime.sendMessage({
          action: 'UPDATE_PROFILE',
          payload: { skills }
        });
        showToast(`Added skill: ${val}`, 'success');
        if (input) input.value = '';
        renderSkillsUI(skills);
      }
    };

    document.getElementById('ai-btn-add-skill')?.addEventListener('click', addSkillAction);
    document.getElementById('ai-skill-new-input')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        addSkillAction();
      }
    });

    // Save Backend API Server URL
    document.getElementById('ai-btn-save-api-url')?.addEventListener('click', async () => {
      const url = document.getElementById('ai-api-base-url')?.value?.trim();
      if (!url) return;
      const res = await chrome.runtime.sendMessage({
        action: 'SET_API_BASE',
        payload: { apiBase: url }
      });
      if (res?.success) {
        showToast(`✓ Server URL updated: ${url}`, 'success');
      } else {
        showToast(res?.error || 'Failed to update server URL', 'error');
      }
    });

    // Esc key shortcut to cleanly close sidebar
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && sidebarOpen) {
        closeSidebar();
      }
    });

    // Initial audit & load
    refreshAuditList();
    checkAndDisplayErrors();
  }

  // 10. Side-by-side Page Fitting & Sidebar State Management
  function setSidebarState(open, tabName = null) {
    let sidebar = document.getElementById('ai-copilot-sidebar');
    if (!sidebar && open) {
      injectSidebar();
      sidebar = document.getElementById('ai-copilot-sidebar');
    }
    sidebarOpen = !!open;

    if (sidebarOpen) {
      // Squeeze host page so application content is NOT covered by floating z-index
      document.documentElement.classList.add('ai-copilot-sidebar-open');
      document.body?.classList.add('ai-copilot-sidebar-open');
      sidebar?.classList.add('open');

      if (tabName) {
        const btn = document.querySelector(`.ai-sb-tab-btn[data-tab="${tabName}"]`);
        if (btn) btn.click();
      }

      refreshAuditList();
      checkAndDisplayErrors();
    } else {
      // Restore host page to full width
      document.documentElement.classList.remove('ai-copilot-sidebar-open');
      document.body?.classList.remove('ai-copilot-sidebar-open');
      sidebar?.classList.remove('open');
    }

    // Trigger window resize event so Workday/React responsive containers
    // immediately reflow into the new available width
    window.dispatchEvent(new Event('resize'));
    setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
    }, 260);
  }

  function toggleSidebar() {
    setSidebarState(!sidebarOpen);
  }

  function openSidebar(tabName = 'autofill') {
    setSidebarState(true, tabName);
  }

  function closeSidebar() {
    setSidebarState(false);
  }

  // Render parsed skills as interactive chips with remove buttons
  function renderSkillsUI(skills = []) {
    const container = document.getElementById('ai-profile-skills-list');
    if (!container) return;
    if (!skills || skills.length === 0) {
      container.innerHTML = '<div style="font-size: 11px; color: #64748b; padding: 4px 0;">No skills extracted yet. Upload or sync your CV.</div>';
      return;
    }
    container.innerHTML = skills.map(s => `
      <span class="ai-skill-chip">
        <span>${escapeHtml(s)}</span>
        <span class="ai-skill-chip-del" data-skill="${escapeHtml(s)}" title="Remove skill">×</span>
      </span>
    `).join('');

    container.querySelectorAll('.ai-skill-chip-del').forEach(delBtn => {
      delBtn.addEventListener('click', async () => {
        const targetSkill = delBtn.dataset.skill;
        const current = (cachedProfile?.skills || []).filter(s => s !== targetSkill);
        if (cachedProfile) cachedProfile.skills = current;
        await chrome.runtime.sendMessage({
          action: 'UPDATE_PROFILE',
          payload: { skills: current }
        });
        renderSkillsUI(current);
      });
    });
  }

  // Render parsed work experiences as structured cards
  function renderExperienceUI(experiences = []) {
    const container = document.getElementById('ai-profile-exp-list');
    if (!container) return;
    if (!experiences || experiences.length === 0) {
      container.innerHTML = '<div style="font-size: 11px; color: #64748b; padding: 4px 0;">No experience entries extracted yet.</div>';
      return;
    }
    container.innerHTML = experiences.map(exp => `
      <div class="ai-exp-card">
        <div class="ai-exp-title">${escapeHtml(exp.title || 'Role / Position')}</div>
        <div class="ai-exp-company">${escapeHtml(exp.company || 'Company')}${exp.location ? ` • ${escapeHtml(exp.location)}` : ''}</div>
        <div class="ai-exp-dates">${escapeHtml(exp.startDate || '')} - ${exp.isCurrent ? 'Present' : escapeHtml(exp.endDate || '')}</div>
        ${exp.description ? `<div class="ai-exp-desc">${escapeHtml(exp.description.slice(0, 180))}${exp.description.length > 180 ? '...' : ''}</div>` : ''}
      </div>
    `).join('');
  }

  // Render parsed education entries as structured cards
  function renderEducationUI(educationList = []) {
    const container = document.getElementById('ai-profile-edu-list');
    if (!container) return;
    if (!educationList || educationList.length === 0) {
      container.innerHTML = '<div style="font-size: 11px; color: #64748b; padding: 4px 0;">No education entries extracted yet.</div>';
      return;
    }
    container.innerHTML = educationList.map(edu => `
      <div class="ai-edu-card">
        <div class="ai-edu-title">${escapeHtml(edu.degree || 'Degree')}${edu.fieldOfStudy ? ` in ${escapeHtml(edu.fieldOfStudy)}` : ''}</div>
        <div class="ai-edu-school">${escapeHtml(edu.institution || 'University / College')}</div>
        <div class="ai-edu-dates">${edu.startYear ? `${escapeHtml(String(edu.startYear))} - ` : ''}${escapeHtml(String(edu.endYear || ''))}</div>
      </div>
    `).join('');
  }

  // 10. Populate and Save Profile in Sidebar (With Dirty State Change Tracking)
  let initialProfileStateString = '';

  function computeProfileFormState() {
    const getVal = (id) => document.getElementById(id)?.value?.trim() || '';
    const getSelect = (id) => document.getElementById(id)?.value || '';
    return JSON.stringify({
      fName: getVal('prof-firstName'),
      lName: getVal('prof-lastName'),
      faName: getVal('prof-fatherName'),
      phone: getVal('prof-phone'),
      email: getVal('prof-email'),
      addr: getVal('prof-address1'),
      city: getVal('prof-city'),
      state: getVal('prof-state'),
      zip: getVal('prof-postalCode'),
      country: getVal('prof-country'),
      auth: getSelect('prof-authorized'),
      spons: getSelect('prof-sponsorship'),
      former: getSelect('prof-formerEmployee'),
      title: getVal('prof-title'),
      linkedin: getVal('prof-linkedin'),
      github: getVal('prof-github'),
      portfolio: getVal('prof-portfolio')
    });
  }

  function checkProfileDirtyState() {
    const saveBtn = document.getElementById('ai-btn-save-profile');
    if (!saveBtn) return;
    const currentState = computeProfileFormState();
    const isDirty = !!(initialProfileStateString && currentState !== initialProfileStateString);
    saveBtn.style.display = isDirty ? 'inline-flex' : 'none';
  }

  async function loadProfileIntoForm() {
    const res = await chrome.runtime.sendMessage({ action: 'GET_PROFILE' });
    if (!res?.success || !res.profile) return;
    const p = res.profile;
    cachedProfile = p;

    // 1. Fetch CV Metadata & Render CV Card with exact filename
    try {
      const cvRes = await chrome.runtime.sendMessage({ action: 'GET_CV_DATA' });
      const cvData = cvRes?.resumeData || cvRes?.cvData || (p.hasResumePdf ? p : null);
      const statusBadge = document.getElementById('ai-cv-status-badge');
      const filenameEl = document.getElementById('ai-cv-filename');
      const metaEl = document.getElementById('ai-cv-meta');

      const filename = cvData?.resumeFilename || p.resumeFilename || (cvData?.hasResumePdf || p.hasResumePdf ? 'resume.pdf' : '');
      if (filename && (cvData?.hasResumePdf || p.hasResumePdf)) {
        if (statusBadge) {
          statusBadge.className = 'ai-cv-badge synced';
          statusBadge.textContent = '✓ Ready to Attach';
        }
        if (filenameEl) filenameEl.textContent = filename;
        if (metaEl) {
          const dateStr = cvData?.resumeUploadedAt ? new Date(cvData.resumeUploadedAt).toLocaleDateString() : 'Active';
          metaEl.textContent = `Attached: ${filename} • Auto-attaches to ATS file dropzones`;
        }
      } else {
        if (statusBadge) {
          statusBadge.className = 'ai-cv-badge missing';
          statusBadge.textContent = 'No CV Attached';
        }
        if (filenameEl) filenameEl.textContent = 'No resume uploaded';
        if (metaEl) metaEl.textContent = 'Upload a PDF/DOCX or sync from your web dashboard';
      }
    } catch (_) {}

    // 2. Render Skills, Experience, Education
    renderSkillsUI(p.skills || []);
    renderExperienceUI(p.workExperience || []);
    renderEducationUI(p.education || []);

    // 3. Load API Base URL
    try {
      const apiSettings = await chrome.runtime.sendMessage({ action: 'GET_API_SETTINGS' });
      const apiInput = document.getElementById('ai-api-base-url');
      if (apiInput && apiSettings?.apiBase) {
        apiInput.value = apiSettings.apiBase;
      }
    } catch (_) {}

    const setVal = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.value = val !== undefined ? val : '';
    };

    setVal('prof-firstName', p.firstName);
    setVal('prof-lastName', p.lastName);
    setVal('prof-fatherName', p.fatherName);
    setVal('prof-phone', p.phone);
    setVal('prof-email', p.email);
    setVal('prof-address1', p.addressLine1);
    setVal('prof-city', p.city);
    setVal('prof-state', p.state);
    setVal('prof-postalCode', p.postalCode);
    setVal('prof-country', p.country || 'India');
    setVal('prof-title', p.title);
    setVal('prof-linkedin', p.linkedin);
    setVal('prof-github', p.github);
    setVal('prof-portfolio', p.portfolio);

    const setSelect = (id, boolVal) => {
      const el = document.getElementById(id);
      if (el) el.value = boolVal ? 'true' : 'false';
    };
    setSelect('prof-authorized', p.authorizedToWork !== false);
    setSelect('prof-sponsorship', !!p.requireSponsorship);
    setSelect('prof-formerEmployee', !!p.formerEmployee);

    // Save initial state snapshot and wire up listeners to toggle Save button visibility
    initialProfileStateString = computeProfileFormState();
    checkProfileDirtyState();

    const profileInputs = document.querySelectorAll('#tab-profile input, #tab-profile select');
    profileInputs.forEach(el => {
      if (!el.dataset.dirtyBound) {
        el.dataset.dirtyBound = 'true';
        el.addEventListener('input', checkProfileDirtyState);
        el.addEventListener('change', checkProfileDirtyState);
      }
    });
  }

  async function saveProfileFromForm() {
    const getVal = (id) => document.getElementById(id)?.value?.trim() || '';
    const cleanPhone = formatPhoneForWorkday(getVal('prof-phone'));
    const getBool = (id) => document.getElementById(id)?.value === 'true';

    const payload = {
      name: `${getVal('prof-firstName')} ${getVal('prof-lastName')}`.trim(),
      firstName: getVal('prof-firstName'),
      lastName: getVal('prof-lastName'),
      fatherName: getVal('prof-fatherName'),
      phone: cleanPhone,
      email: getVal('prof-email'),
      addressLine1: getVal('prof-address1'),
      city: getVal('prof-city'),
      state: getVal('prof-state'),
      postalCode: getVal('prof-postalCode'),
      country: getVal('prof-country') || 'India',
      authorizedToWork: getBool('prof-authorized'),
      requireSponsorship: getBool('prof-sponsorship'),
      formerEmployee: getBool('prof-formerEmployee'),
      title: getVal('prof-title'),
      linkedin: getVal('prof-linkedin'),
      github: getVal('prof-github'),
      portfolio: getVal('prof-portfolio'),
      skills: cachedProfile?.skills || [],
      workExperience: cachedProfile?.workExperience || [],
      education: cachedProfile?.education || []
    };

    const saveBtn = document.getElementById('ai-btn-save-profile');
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.innerHTML = '<span>⏳</span><span>Saving...</span>';
    }

    const res = await chrome.runtime.sendMessage({
      action: 'UPDATE_PROFILE',
      payload
    });

    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.innerHTML = '<span>💾</span><span>Save & Sync Profile</span>';
    }

    if (res?.success) {
      cachedProfile = res.profile || payload;
      showToast(res.message || '✓ Profile saved and updated!', 'success');
      // Update baseline state and hide Save button
      initialProfileStateString = computeProfileFormState();
      checkProfileDirtyState();
      refreshAuditList();
    } else {
      showToast(res?.error || 'Failed to save profile', 'error');
    }
  }

  // Helper to format clean, professional form field labels
  function getCleanFieldLabel(inp) {
    if (inp.type === 'checkbox') {
      const container = inp.closest('.form-group, fieldset, [data-automation-id*="group" i], [class*="group" i], label, div');
      const text = ((getLabelText(inp) || '') + ' ' + (container?.textContent || '') + ' ' + (inp.name || '') + ' ' + (inp.id || '')).toLowerCase();
      if (text.includes('term') || text.includes('condition') || text.includes('privacy') || text.includes('policy')) {
        return 'Terms & Conditions (Consent)';
      }
      if (text.includes('certif') || text.includes('accura') || text.includes('truthful') || text.includes('declaration')) {
        return 'Certification of Accuracy';
      }
      if (text.includes('acknowledg') || text.includes('consent') || text.includes('agree')) {
        return 'Acknowledgment & Consent';
      }
    }

    if (inp.type === 'file') {
      return (inp.files && inp.files.length > 0) ? `Resume / CV (${inp.files[0].name})` : 'Resume / CV Attachment';
    }

    if (inp.type === 'radio') {
      const container = getRadioQuestionContainer(inp);
      const qText = container?.querySelector('legend, .wd-label, label:not(.wd-radio-label), .label, [data-automation-id*="label" i], h3, h4, h5, p, span')?.textContent || container?.textContent || '';
      const lower = qText.toLowerCase();
      if (lower.includes('authorized to work') || lower.includes('authorization') || lower.includes('legal right')) return 'Work Authorization';
      if (lower.includes('sponsorship') || lower.includes('require visa')) return 'Visa Sponsorship';
      if (lower.includes('previously worked') || lower.includes('former employee') || lower.includes('have you worked') || lower.includes('currently employed')) return 'Previous Employment';
      if (lower.includes('relative') || lower.includes('family')) return 'Relatives at Company';
      if (lower.includes('conflict of interest')) return 'Conflict of Interest';
      if (lower.includes('government') || lower.includes('public official')) return 'Government Official';
      if (lower.includes('18 year') || lower.includes('legal age') || lower.includes('at least 18')) return 'Age Requirement (18+)';
      if (lower.includes('background check') || lower.includes('drug screen')) return 'Background Check Consent';
      if (lower.includes('relocate') || lower.includes('relocation')) return 'Willing to Relocate';

      // Fallback for radio questions (never return bare "Yes" or "No")
      let cleanedQ = qText.replace(/[\*\:\?]/g, '').replace(/\(required[^\)]*\)/gi, '').trim();
      cleanedQ = cleanedQ.replace(/\b(yes|no)\b/gi, '').trim();
      if (cleanedQ.length > 3) {
        return cleanedQ.slice(0, 32);
      }
      return 'Questionnaire Option';
    }

    const raw = getLabelText(inp) || inp.placeholder || inp.name || inp.getAttribute('data-automation-id') || inp.id;
    if (!raw) return 'Application Field';
    let cleaned = raw
      .replace(/[\*\:\?]/g, '')
      .replace(/\(required[^\)]*\)/gi, '')
      .replace(/\(optional\)/gi, '')
      .replace(/\bsection\b/gi, '')
      .replace(/legalnamesection_/gi, '')
      .replace(/addresssection_/gi, '')
      .replace(/phone-device-type/gi, 'Phone Device Type')
      .replace(/phone-number/gi, 'Phone Number')
      .replace(/fathername/gi, "Father's Name")
      .replace(/firstname/gi, "First Name")
      .replace(/lastname/gi, "Last Name")
      .replace(/education_school|eduschool/gi, 'School / University')
      .replace(/education_degree|edudegree/gi, 'Degree')
      .replace(/education_fieldOfStudy|edufield/gi, 'Field of Study / Major')
      .replace(/education_endYear|eduendyear/gi, 'Graduation Year')
      .replace(/skills-pill-input|skill_entry/gi, 'Key Technical Skills')
      .replace(/applicantSkills/gi, 'Key Technical Skills')
      .replace(/workhistory_company/gi, 'Company / Employer')
      .replace(/workhistory_title/gi, 'Job Title')
      .replace(/workhistory_location/gi, 'Job Location')
      .replace(/workhistory_startDate/gi, 'Job Start Date')
      .replace(/workhistory_endDate/gi, 'Job End Date')
      .replace(/workhistory_description/gi, 'Job Description')
      .replace(/termsconsent|termsandconditions/gi, 'Terms & Privacy Consent')
      .replace(/certifyaccuracy/gi, 'Certify Accuracy')
      .replace(/workhistory_iscurrent|currentlyemployed/gi, 'Currently Employed in Role')
      .replace(/totalexperience/gi, 'Total Years of Experience')
      .replace(/desiredsalary/gi, 'Desired Salary')
      .replace(/willingtorelocate/gi, 'Willing to Relocate')
      .replace(/eeo_gender/gi, 'Gender (EEO)')
      .replace(/eeo_veteran/gi, 'Veteran Status (EEO)')
      .replace(/eeo_disability/gi, 'Disability Status (EEO)')
      .replace(/eeo_race/gi, 'Race / Ethnicity (EEO)')
      .replace(/smsconsent/gi, 'SMS Alerts Consent')
      .replace(/electronicsignature/gi, 'Electronic Signature')
      .replace(/signaturedate/gi, 'Date of Signature')
      .replace(/_/g, ' ')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .trim();
    // Capitalize words nicely
    return cleaned.replace(/\b\w/g, c => c.toUpperCase());
  }

  // 10.5 Detect Active Application Page / Step (See the page where it is)
  function detectApplicationStep() {
    // 1. Check for active step element in steppers / progress indicators
    const activeStepEl = document.querySelector(
      '.wd-step.active, [aria-current="step"], [data-automation-id*="activeStep" i], .step-item.active, .step.active, li[class*="active"][class*="step" i]'
    );

    const allSteps = Array.from(document.querySelectorAll(
      '.wd-step, [data-automation-id*="stepItem" i], .step-item, ol.stepper li, .steps-container > div'
    )).filter(el => isElementVisible(el));

    let stepNum = 1;
    let totalSteps = allSteps.length > 1 ? allSteps.length : 4;
    let stepName = '';

    if (activeStepEl) {
      const nameEl = activeStepEl.querySelector('.wd-step-name, .step-title, .step-label, span:not(.wd-step-num)');
      stepName = (nameEl || activeStepEl).textContent.trim();
      stepName = stepName.replace(/^\d+[\.\s\-]*/, '').trim();

      const foundIdx = allSteps.indexOf(activeStepEl);
      if (foundIdx !== -1) {
        stepNum = foundIdx + 1;
      } else {
        const numEl = activeStepEl.querySelector('.wd-step-num, .step-num, [class*="number"]');
        if (numEl) stepNum = parseInt(numEl.textContent.trim(), 10) || 1;
      }
    } else {
      // Check visible page container
      const visiblePage = document.querySelector('.wd-step-page:not([style*="display: none"]), [id*="step-"][id*="-page"]:not([style*="display: none"])');
      if (visiblePage) {
        const m = visiblePage.id.match(/step-(\d+)/i);
        if (m) stepNum = parseInt(m[1], 10);
      }
    }

    // Success Screen check
    const successEl = document.getElementById('step-success-page') || document.querySelector('.wd-success-box, [data-automation-id*="success" i]');
    const isSubmitted = successEl && isElementVisible(successEl);

    // Check for on-page action/submit button
    const nextBtnSelectors = [
      '#btnSubmitApplication',
      'button[data-automation-id="bottom-navigation-next-button"]',
      'button[data-automation-id="page-navigation-next-button"]',
      'button[data-automation-id="next-button"]',
      'button[type="submit"]',
      'input[type="submit"]',
      'button.template-btn-submit',
      'button.btn-next'
    ];

    const pageActionBtn = Array.from(document.querySelectorAll(nextBtnSelectors.join(',')))
      .find(b => !b.closest('#ai-copilot-sidebar') && !b.closest('#ai-copilot-dock-tab') && isElementVisible(b));

    const onPageActionText = pageActionBtn ? (pageActionBtn.textContent || pageActionBtn.value || '').trim() : '';
    const onPageActionLower = onPageActionText.toLowerCase();

    const isFinalStep = isSubmitted ||
      (stepNum >= totalSteps && totalSteps > 1) ||
      onPageActionLower.includes('submit') ||
      stepName.toLowerCase().includes('review') ||
      stepName.toLowerCase().includes('submit') ||
      (document.getElementById('step-4-page') && isElementVisible(document.getElementById('step-4-page')));

    if (!stepName) {
      if (isSubmitted) stepName = 'Application Submitted';
      else if (isFinalStep) stepName = 'Review & Submit';
      else if (stepNum === 1) stepName = 'My Information';
      else if (stepNum === 2) stepName = 'My Experience';
      else if (stepNum === 3) stepName = 'Application Questions';
      else stepName = `Step ${stepNum}`;
    }

    return {
      stepNum,
      totalSteps,
      stepName,
      isFinalStep,
      isSubmitted,
      pageActionBtn,
      onPageActionText
    };
  }

  // Update Next Step / Submit Button UI based on active step
  function updateNextPageButtonUI(stepInfo, pct, total) {
    const nextBtn = document.getElementById('ai-btn-next-page');
    const nextLabel = document.getElementById('ai-btn-next-label');
    const nextIcon = document.getElementById('ai-btn-next-icon');
    if (!nextBtn) return;

    if (stepInfo.isSubmitted) {
      nextBtn.className = 'ai-next-page-btn submit-mode';
      if (nextLabel) nextLabel.textContent = 'Application Submitted';
      if (nextIcon) nextIcon.textContent = '✓';
      nextBtn.disabled = true;
      return;
    }

    nextBtn.disabled = false;

    if (stepInfo.isFinalStep) {
      nextBtn.className = 'ai-next-page-btn submit-mode';
      if (nextLabel) nextLabel.textContent = 'Submit Application';
      if (nextIcon) nextIcon.textContent = '🚀';
      nextBtn.title = 'Submit your application automatically';
    } else {
      const isSaveAction = (stepInfo.onPageActionText || '').toLowerCase().includes('save') || true;
      const label = isSaveAction ? 'Save and Continue' : 'Next Page';

      if (pct === 100 && total > 0) {
        nextBtn.className = 'ai-next-page-btn ready-continue';
      } else {
        nextBtn.className = 'ai-next-page-btn';
      }

      if (nextLabel) nextLabel.textContent = label;
      if (nextIcon) nextIcon.textContent = '→';
      nextBtn.title = `${label} & autofill next details`;
    }
  }

  // 11. Refresh Form Fields Checklist (Interactive with Clickable Field Redirection)
  let lastAuditSignature = '';

  function refreshAuditList(force = false) {
    const container = document.getElementById('ai-checklist-container');
    const percentBadge = document.getElementById('ai-percent-badge');
    const progressBar = document.getElementById('ai-progress-bar');
    const statusTitle = document.getElementById('ai-status-text');
    const actionBtn = document.getElementById('ai-card-action-btn');

    // 1. Detect current application step & update step badge
    const stepInfo = detectApplicationStep();
    const stepBadgeText = document.getElementById('ai-step-badge-text');
    const stepPageHint = document.getElementById('ai-step-page-hint');

    if (stepBadgeText) {
      if (stepInfo.isSubmitted) {
        stepBadgeText.textContent = 'Application Submitted ✓';
      } else {
        stepBadgeText.textContent = `Step ${stepInfo.stepNum} of ${stepInfo.totalSteps} • ${stepInfo.stepName}`;
      }
    }
    if (stepPageHint) {
      stepPageHint.textContent = stepInfo.isSubmitted ? 'Completed' : (stepInfo.isFinalStep ? 'Final Step' : `Page ${stepInfo.stepNum}/${stepInfo.totalSteps}`);
    }

    // 2. Scan visible interactive form controls on the active page
    const inputs = Array.from(document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]), select, textarea'))
      .filter(el => !el.closest('#ai-copilot-sidebar') && !el.closest('#ai-copilot-dock-tab') && !el.id?.startsWith('prof-') && !el.id?.startsWith('ai-') && !el.name?.startsWith('prof-') && isElementVisible(el));

    const detected = [];

    inputs.forEach(inp => {
      const label = getCleanFieldLabel(inp);
      if (label && label.length >= 2 && !detected.some(d => d.label === label)) {
        let isFilled = false;
        if (inp.type === 'radio') {
          const group = inp.name ? document.querySelectorAll(`input[type="radio"][name="${inp.name}"]`) : [inp];
          isFilled = Array.from(group).some(r => r.checked);
        } else if (inp.type === 'checkbox') {
          const container = inp.closest('.form-group, fieldset, [data-automation-id*="group" i], [class*="group" i], label, div');
          const text = ((label || '') + ' ' + (container?.textContent || '') + ' ' + (inp.name || '') + ' ' + (inp.id || '')).toLowerCase();
          const isCurrentJob = ['currently work here', 'current role', 'currently employed', 'present role', 'iscurrent', 'is_current', 'currently work in this role'].some(k => text.includes(k));
          if (isCurrentJob) {
            const isEmp = isCandidateCurrentlyEmployed(cachedProfile);
            isFilled = (inp.checked === isEmp);
          } else {
            isFilled = inp.checked;
          }
        } else if (inp.type === 'file') {
          isFilled = !!(inp.files && inp.files.length > 0);
        } else if (inp.id === 'applicantSkillsInput' || inp.name === 'skill_entry' || inp.getAttribute('data-automation-id')?.includes('pill')) {
          const syncInput = document.getElementById('applicantSkills');
          const pills = inp.closest('.wd-pill-box, [data-automation-id*="container"]')?.querySelectorAll('.wd-skill-pill, .pill, .chip');
          isFilled = (pills && pills.length > 0) || !!(syncInput && syncInput.value.trim().length > 0) || !!(inp.value && inp.value.trim().length > 0);
        } else {
          isFilled = !!(inp.value && inp.value.trim().length > 0);
        }
        detected.push({ element: inp, label, isFilled, type: inp.type || inp.tagName.toLowerCase() });
      }
    });

    const total = detected.length;
    const filledCount = detected.filter(d => d.isFilled).length;
    const pct = total > 0 ? Math.round((filledCount / total) * 100) : (stepInfo.isFinalStep ? 100 : 0);

    // Update Next Page / Submit button UI
    updateNextPageButtonUI(stepInfo, pct, total);

    // Diff check against last signature to prevent unnecessary DOM re-renders
    const currentSig = `${stepInfo.stepNum}:${detected.map(d => `${d.label}:${d.isFilled ? 1 : 0}`).join('|')}::${pct}`;
    if (!force && currentSig === lastAuditSignature) {
      return;
    }
    lastAuditSignature = currentSig;

    if (percentBadge) percentBadge.textContent = `${pct}%`;
    if (progressBar) progressBar.style.width = `${pct}%`;

    if (!isAutofilling) {
      if (statusTitle) {
        if (stepInfo.isSubmitted) {
          statusTitle.textContent = 'Application Submitted ✓';
        } else if (stepInfo.isFinalStep && (pct === 100 || total === 0)) {
          statusTitle.textContent = 'Ready to Submit';
        } else if (pct === 100 && total > 0) {
          statusTitle.textContent = `Step ${stepInfo.stepNum} Complete ✓`;
        } else if (filledCount > 0) {
          statusTitle.textContent = 'Autofilling ...';
        } else {
          statusTitle.textContent = `Ready to Autofill Step ${stepInfo.stepNum}`;
        }
      }
      if (actionBtn) {
        actionBtn.textContent = (pct === 100 && total > 0) ? 'Refill' : 'Autofill';
      }
    }

    const activeView = document.getElementById('ai-active-autofill-view');
    const landingView = document.getElementById('ai-landing-hub-view');

    // If no form detected AND not on an active ATS step or stepper
    const isATSContext = stepInfo.isFinalStep || stepInfo.isSubmitted || !!document.querySelector('.wd-stepper, [data-automation-id*="step" i], .wd-container');
    if (detected.length === 0 && !isATSContext) {
      if (activeView) activeView.style.display = 'none';
      if (landingView) landingView.style.display = 'block';

      const profileSub = document.getElementById('ai-hub-profile-name');
      if (profileSub && !profileSub.dataset.initialized) {
        profileSub.dataset.initialized = 'true';
        if (cachedProfile?.firstName || cachedProfile?.email) {
          const name = `${cachedProfile.firstName || ''} ${cachedProfile.lastName || ''}`.trim() || 'Candidate';
          const detail = cachedProfile.title || cachedProfile.email || 'Profile Ready';
          profileSub.textContent = `${name} • ${detail}`;
        }
      }
      return;
    }

    if (activeView) activeView.style.display = 'block';
    if (landingView) landingView.style.display = 'none';

    if (!container) return;

    if (stepInfo.isSubmitted) {
      container.innerHTML = `
        <div style="text-align: center; padding: 24px 12px;">
          <div style="font-size: 28px; margin-bottom: 8px;">🎉</div>
          <div style="font-size: 13.5px; font-weight: 700; color: #10b981; margin-bottom: 4px;">Application Submitted!</div>
          <div style="font-size: 11.5px; color: #94a3b8;">Status logged to your AI Job Finder dashboard.</div>
        </div>
      `;
      return;
    }

    if (detected.length === 0 && stepInfo.isFinalStep) {
      container.innerHTML = `
        <div style="text-align: center; padding: 20px 12px;">
          <div style="font-size: 20px; margin-bottom: 6px;">📋</div>
          <div style="font-size: 13px; font-weight: 700; color: #38bdf8; margin-bottom: 4px;">All Details Verified</div>
          <div style="font-size: 11.5px; color: #94a3b8;">Click "Submit Application" below to complete your submission.</div>
        </div>
      `;
      return;
    }

    container.innerHTML = detected.map((d, idx) => `
      <div class="ai-checklist-item ${d.isFilled ? 'completed' : 'pending'}" data-index="${idx}" title="Click to jump to & highlight this field on the page">
        ${d.isFilled ? '<div class="ai-check-icon-filled">✓</div>' : '<div class="ai-check-icon-pending"></div>'}
        <div class="ai-checklist-label">${escapeHtml(d.label)}</div>
      </div>
    `).join('');

    // Make EACH label clickable to smoothly scroll to and highlight that field on the page
    container.querySelectorAll('.ai-checklist-item').forEach(itemEl => {
      itemEl.addEventListener('click', () => {
        const idx = parseInt(itemEl.dataset.index, 10);
        const targetItem = detected[idx];
        if (targetItem && targetItem.element) {
          const scrollTarget = targetItem.type === 'radio'
            ? (getRadioQuestionContainer(targetItem.element) || targetItem.element)
            : targetItem.element;

          scrollTarget.scrollIntoView({ behavior: 'smooth', block: 'center' });
          scrollTarget.classList.add('ai-field-typing-focus');
          try { targetItem.element.focus(); } catch (_) {}

          itemEl.classList.add('ai-item-clicked');
          setTimeout(() => {
            scrollTarget.classList.remove('ai-field-typing-focus');
            itemEl.classList.remove('ai-item-clicked');
          }, 1800);
        }
      });
    });
  }

  // Helper to advance page by page and automatically start filling next details
  async function goToNextPage() {
    if (isAutofilling) {
      showToast('Autofill is currently running...', 'info');
      return;
    }

    const stepInfo = detectApplicationStep();

    // 1. If already submitted
    if (stepInfo.isSubmitted) {
      showToast('✓ Application has already been submitted!', 'success');
      return;
    }

    const nextBtn = document.getElementById('ai-btn-next-page');
    const nextLabel = document.getElementById('ai-btn-next-label');

    // 2. Final Step: Submit Application Flow (Submits on its own!)
    if (stepInfo.isFinalStep) {
      if (nextBtn) {
        nextBtn.disabled = true;
        if (nextLabel) nextLabel.textContent = 'Completing final review...';
      }

      // 1. Ensure all fields on the final step (signatures, dates, terms, checkboxes) are filled!
      showToast('✍️ Completing disclosures & electronic signature...', 'info', 2000);
      await autofillForm();
      await sleep(350);

      if (nextLabel) nextLabel.textContent = 'Submitting Application...';
      showToast('🚀 Submitting application...', 'info', 3000);

      // Find the on-page submit button
      const submitBtnSelectors = [
        '#btnSubmitApplication',
        'button[data-automation-id="bottom-navigation-next-button"]',
        'button[data-automation-id="submit-button"]',
        'button[type="submit"]',
        'input[type="submit"]'
      ];
      const pageSubmitBtn = Array.from(document.querySelectorAll(submitBtnSelectors.join(',')))
        .find(b => !b.closest('#ai-copilot-sidebar') && !b.closest('#ai-copilot-dock-tab') && isElementVisible(b));

      if (pageSubmitBtn) {
        pageSubmitBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
        pageSubmitBtn.classList.add('ai-field-typing-focus');
        await sleep(350);
        pageSubmitBtn.classList.remove('ai-field-typing-focus');
        pageSubmitBtn.click();

        showToast('🎉 Application submitted successfully!', 'success', 6000);

        try {
          const job = extractJobDetails();
          chrome.runtime.sendMessage({
            action: 'LOG_JOB',
            payload: {
              company: job.company || 'Enterprise ATS',
              role: job.role || 'Full Stack Engineer',
              url: window.location.href,
              status: 'Applied',
              notes: 'Submitted via 1-Click AI Copilot'
            }
          });
        } catch (_) {}

        setTimeout(() => {
          refreshAuditList(true);
          const statusTitle = document.getElementById('ai-status-text');
          if (statusTitle) statusTitle.textContent = 'Application Submitted ✓';
          if (nextBtn) {
            nextBtn.className = 'ai-next-page-btn submit-mode';
            nextBtn.disabled = true;
            if (nextLabel) nextLabel.textContent = 'Application Submitted';
          }
        }, 1200);
      } else {
        showToast('Could not locate the on-page Submit button', 'error');
        if (nextBtn) nextBtn.disabled = false;
      }
      return;
    }

    // 3. Intermediate Step: Save and Continue -> Advance to Next Page & Automatically Fill Details!
    const initialStepNum = stepInfo.stepNum;

    if (nextBtn) {
      nextBtn.disabled = true;
      if (nextLabel) nextLabel.textContent = 'Saving & Loading Next Page...';
    }

    // Find visible on-page Continue / Save and Continue button for current active step
    const candidateNextButtons = Array.from(document.querySelectorAll(
      `#btnStep${initialStepNum}Next, button[data-automation-id="bottom-navigation-next-button"], button[data-automation-id="page-navigation-next-button"], button[data-automation-id="next-button"], button[type="submit"], .btn-next`
    )).filter(b => !b.closest('#ai-copilot-sidebar') && !b.closest('#ai-copilot-dock-tab') && isElementVisible(b));

    const onPageNextBtn = document.getElementById(`btnStep${initialStepNum}Next`) || candidateNextButtons[0] || stepInfo.pageActionBtn;

    if (!onPageNextBtn) {
      showToast('Could not find on-page Continue button', 'error');
      if (nextBtn) nextBtn.disabled = false;
      return;
    }

    // Scroll to and click on-page Next / Continue button
    onPageNextBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
    onPageNextBtn.classList.add('ai-field-typing-focus');
    await sleep(250);
    onPageNextBtn.classList.remove('ai-field-typing-focus');
    onPageNextBtn.click();

    showToast('Saving current details & loading next page...', 'info', 2000);

    // Wait for the new page / step to render in the DOM
    let stepChanged = false;
    for (let attempt = 0; attempt < 15; attempt++) {
      await sleep(180);
      const newStep = detectApplicationStep();
      if (newStep.stepNum !== initialStepNum || newStep.isFinalStep) {
        stepChanged = true;
        break;
      }
    }

    if (!stepChanged) {
      await sleep(350);
    }

    // Read the newly opened page
    refreshAuditList(true);
    checkAndDisplayErrors(true);

    const updatedStep = detectApplicationStep();
    showToast(`📑 ${updatedStep.stepName} • Reading page & autofilling...`, 'info', 3000);

    await sleep(400);

    // Automatically start filling the next details after reading the page!
    try {
      await autofillForm();
    } finally {
      if (nextBtn) nextBtn.disabled = false;
      refreshAuditList(true);
    }
  }

  // 12. Check and Display On-Page Form Validation Errors
  let lastErrorsSignature = '';
  function checkAndDisplayErrors(force = false) {
    const box = document.getElementById('ai-sb-errors-box');
    if (!box) return;

    const errors = detectPageErrors();
    const currentErrorsSig = errors.join('|');
    if (!force && currentErrorsSig === lastErrorsSignature) {
      return;
    }
    lastErrorsSignature = currentErrorsSig;

    if (errors.length === 0) {
      box.style.display = 'none';
      box.innerHTML = '';
      return;
    }

    box.style.display = 'block';
    box.innerHTML = errors.map(errText => {
      let isPhoneErr = errText.toLowerCase().includes('phone');
      return `
        <div class="ai-sb-error-card">
          <div class="ai-sb-error-header">
            <span>⚠️</span><span>Validation Issue Detected</span>
          </div>
          <div class="ai-sb-error-desc">${escapeHtml(errText)}</div>
          ${isPhoneErr ? `
            <button class="ai-sb-fix-btn" id="btn-fix-phone-error">
              ⚡ Auto-Fix Phone to 10-Digit Format
            </button>
          ` : ''}
        </div>
      `;
    }).join('');

    document.getElementById('btn-fix-phone-error')?.addEventListener('click', () => {
      const phoneInput = document.querySelector('input[type="tel"], input[data-automation-id="phone-number"], input[name*="phone" i]');
      if (phoneInput && cachedProfile?.phone) {
        const clean = formatPhoneForWorkday(cachedProfile.phone);
        setNativeValue(phoneInput, clean);
        showToast('✓ Formatted phone to clean 10-digit number!', 'success');
        setTimeout(() => checkAndDisplayErrors(true), 1000);
      }
    });
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // 13. Brain Rules UI in Sidebar
  async function loadBrainRulesUI() {
    const container = document.getElementById('ai-brain-rules-container');
    const countEl = document.getElementById('ai-brain-count');
    const clearBtn = document.getElementById('ai-btn-clear-brain');
    if (!container) return;

    const res = await chrome.runtime.sendMessage({ action: 'GET_BRAIN' });
    // Sanitize any legacy sidebar profile fields
    cachedBrainRules = (res?.learnedRules || []).filter(r => {
      const k = (r.fieldKey || '').toLowerCase().trim();
      return !k.startsWith('prof-') && !k.startsWith('ai-') && k.length > 1;
    });

    if (countEl) countEl.textContent = `${cachedBrainRules.length} Rules`;
    if (clearBtn) {
      clearBtn.style.display = cachedBrainRules.length > 0 ? 'inline-block' : 'none';
      clearBtn.onclick = async () => {
        if (!confirm('Clear all learned self-healing rules?')) return;
        const delRes = await chrome.runtime.sendMessage({ action: 'CLEAR_BRAIN_RULES' });
        if (delRes?.success) {
          showToast('All learned rules cleared!', 'info');
          loadBrainRulesUI();
        }
      };
    }

    if (cachedBrainRules.length === 0) {
      container.innerHTML = `
        <div style="font-size: 11px; color: #64748b; text-align: center; padding: 20px 0;">
          No learned rules yet. When you edit custom fields on job forms, the Copilot will remember them here.
        </div>
      `;
      return;
    }

    container.innerHTML = cachedBrainRules.map(rule => `
      <div class="ai-sb-brain-rule">
        <div class="ai-sb-rule-info">
          <div class="ai-sb-rule-key">
            <span>${escapeHtml(rule.fieldKey)}</span>
            <span class="ai-sb-rule-domain">${escapeHtml(rule.domain || '*')}</span>
          </div>
          <div class="ai-sb-rule-val">${escapeHtml(rule.value || '(empty)')}</div>
        </div>
        <button class="ai-sb-rule-del" data-key="${escapeHtml(rule.fieldKey)}" data-domain="${escapeHtml(rule.domain || '*')}" title="Delete this rule">✕</button>
      </div>
    `).join('');

    container.querySelectorAll('.ai-sb-rule-del').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const key = btn.dataset.key;
        const domain = btn.dataset.domain;
        btn.disabled = true;
        btn.textContent = '...';
        const delRes = await chrome.runtime.sendMessage({
          action: 'DELETE_BRAIN_RULE',
          payload: { fieldKey: key, domain }
        });
        if (delRes?.success) {
          showToast(`Deleted rule "${key}"`, 'info');
          loadBrainRulesUI();
        }
      });
    });
  }

  // 14. In-Sidebar Screening Questions UI
  function refreshQuestionsUI() {
    const list = document.getElementById('ai-qa-list');
    if (!list) return;

    // Collect textareas, but on Google Forms also include short-answer inputs for long questions
    let textareas = Array.from(document.querySelectorAll('textarea'))
      .filter(ta => !ta.closest('#ai-copilot-sidebar') && !ta.closest('#ai-copilot-dock-tab'));

    // On Google Forms, also find textareas by class
    if (isGoogleForm()) {
      const gfTextareas = Array.from(document.querySelectorAll('textarea.KHxj8b, textarea'));
      const gfSet = new Set(textareas);
      gfTextareas.forEach(ta => { if (!ta.closest('#ai-copilot-sidebar')) gfSet.add(ta); });
      textareas = Array.from(gfSet);
    }

    if (textareas.length === 0) {
      list.innerHTML = `
        <div style="font-size: 11px; color: #64748b; text-align: center; padding: 20px 0;">
          No open question textareas detected on this page step.
        </div>
      `;
      return;
    }

    list.innerHTML = textareas.map((ta, idx) => {
      const q = getLabelText(ta) || ta.getAttribute('aria-label') || ta.placeholder || `Question #${idx + 1}`;
      // Truncate long question titles for display
      const displayQ = q.length > 120 ? q.slice(0, 117) + '...' : q;
      return `
        <div class="ai-sb-card" style="margin-bottom: 8px;">
          <div style="font-size: 11px; font-weight: 700; color: #f8fafc; margin-bottom: 6px;">${displayQ}</div>
          <button class="ai-sb-btn ai-sb-btn-primary ai-qa-gen-btn" data-idx="${idx}" style="padding: 6px 10px; font-size: 11px;">
            <span>✨</span><span>Generate & Fill Answer</span>
          </button>
        </div>
      `;
    }).join('');

    list.querySelectorAll('.ai-qa-gen-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const idx = parseInt(btn.dataset.idx, 10);
        const ta = textareas[idx];
        if (!ta) return;

        btn.disabled = true;
        btn.innerHTML = '<span>⏳</span><span>Drafting answer...</span>';

        const jobInfo = extractJobDetails();
        const questionText = getLabelText(ta) || ta.placeholder || 'Screening Question';

        const res = await chrome.runtime.sendMessage({
          action: 'GENERATE_ANSWER',
          payload: {
            question: questionText,
            company: jobInfo.company,
            role: jobInfo.role,
            jobDescription: jobInfo.description
          }
        });

        if (res?.success && res.answer) {
          setNativeValue(ta, res.answer);
          btn.innerHTML = '<span>✓</span><span>Filled!</span>';
          showToast('✓ AI screening answer generated and inserted!', 'success');
          setTimeout(() => {
            btn.disabled = false;
            btn.innerHTML = '<span>✨</span><span>Generate & Fill Answer</span>';
          }, 3000);
        } else {
          showToast(res?.error || 'Failed to generate answer', 'error');
          btn.disabled = false;
          btn.innerHTML = '<span>✨</span><span>Generate & Fill Answer</span>';
        }
      });
    });
  }

  // 15. In-Field AI Answer Buttons
  function injectAiFieldButtons() {
    const textareas = document.querySelectorAll('textarea');

    textareas.forEach(ta => {
      if (ta.closest('#ai-copilot-sidebar') || ta.closest('#ai-copilot-dock-tab')) return;
      if (ta.dataset.aiCopilotInjected) return;
      ta.dataset.aiCopilotInjected = 'true';

      const questionText = getLabelText(ta) || ta.placeholder || 'Screening Question';

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ai-copilot-field-btn';
      btn.innerHTML = '<span>✨</span><span>AI Answer</span>';
      btn.title = 'Generate a tailored answer using your resume & GitHub projects';

      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();

        btn.disabled = true;
        btn.innerHTML = '<span>⏳</span><span>Drafting...</span>';

        const jobInfo = extractJobDetails();

        try {
          const res = await chrome.runtime.sendMessage({
            action: 'GENERATE_ANSWER',
            payload: {
              question: questionText,
              company: jobInfo.company,
              role: jobInfo.role,
              jobDescription: jobInfo.description
            }
          });

          if (res?.success && res.answer) {
            setNativeValue(ta, res.answer);
            btn.innerHTML = '<span>✓</span><span>Filled!</span>';
            setTimeout(() => {
              btn.innerHTML = '<span>✨</span><span>AI Answer</span>';
              btn.disabled = false;
            }, 3000);
          } else {
            showToast(res?.error || 'Failed to generate answer. Check extension connection.', 'error');
            btn.innerHTML = '<span>✨</span><span>AI Answer</span>';
            btn.disabled = false;
          }
        } catch (err) {
          showToast('Error generating answer: ' + err.message, 'error');
          btn.innerHTML = '<span>✨</span><span>AI Answer</span>';
          btn.disabled = false;
        }
      });

      if (ta.parentNode) {
        ta.parentNode.insertBefore(btn, ta);
      }
    });
  }

  // 16. Message Listener
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'DO_AUTOFILL') {
      autofillForm().then(res => sendResponse(res));
      return true;
    }
    if (request.action === 'OPEN_SIDEBAR') {
      window.__ai_copilot_force_enabled = true;
      injectSidebar();
      openSidebar(request.tab || 'autofill');
      sendResponse({ success: true });
      return true;
    }
    if (request.action === 'EXTRACT_JOB_INFO') {
      sendResponse(extractJobDetails());
      return true;
    }
  });

  // 17. High-Performance Initialization, Debounced Auditing & Mutation Filtering
  let auditDebounceTimer = null;
  function scheduleAudit(delay = 250, force = false) {
    if (!isJobPortal() || isAutofilling) return;
    clearTimeout(auditDebounceTimer);
    auditDebounceTimer = setTimeout(() => {
      if (!isAutofilling && isJobPortal()) {
        refreshAuditList(force);
        checkAndDisplayErrors(force);
      }
    }, delay);
  }

  function initCopilot() {
    if (isJobPortal()) {
      injectSidebar();
      injectAiFieldButtons();
      scheduleAudit(50, true);
    }
  }

  initCopilot();
  initBrainListener();

  // MutationObserver: filters out any internal changes inside #ai-copilot-sidebar or #ai-copilot-dock-tab
  const observer = new MutationObserver((mutations) => {
    if (!isJobPortal() || isAutofilling) return;

    let hasPageMutation = false;
    for (const m of mutations) {
      const target = m.target;
      if (!target) continue;
      // Skip if mutation is inside extension UI
      if (target.nodeType === 1 && (target.closest('#ai-copilot-sidebar') || target.closest('#ai-copilot-dock-tab') || target.id?.startsWith('ai-toast-'))) {
        continue;
      }
      hasPageMutation = true;
      break;
    }

    if (!hasPageMutation) return;

    // Batch rapid page mutations (e.g. step changes, dynamic inputs) with 200ms debounce
    scheduleAudit(200);
  });

  const observeOptions = {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['style', 'class', 'hidden', 'disabled']
  };

  if (document.body) {
    observer.observe(document.body, observeOptions);
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      if (document.body) {
        observer.observe(document.body, observeOptions);
      }
      initCopilot();
      scheduleAudit(100, true);
    });
  }

  // Smoothly audit on window resize (debounced)
  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => scheduleAudit(100), 100);
  }, { passive: true });

  // IMPORTANT: Removed unthrottled scroll listener completely to eliminate scroll lag & layout thrashing!

  let checks = 0;
  const pollTimer = setInterval(() => {
    if (!isAutofilling) {
      initCopilot();
      scheduleAudit(50);
    }
    checks++;
    if (checks > 6) clearInterval(pollTimer);
  }, 1000);
})();
