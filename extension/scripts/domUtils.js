// DOM Utilities, Platform Detection, Messaging & Shared State
// Part of AI Job Copilot Chrome Extension

(() => {
  'use strict';

  console.log('[AI Job Copilot] domUtils.js v1.0.1 initialized (location bug resolved)');

  // ── Global Shared State & Accessors ──────────────────────────────────────────
  window.AiCopilotState = window.AiCopilotState || {
    cachedProfile: null,
    cachedBrainRules: [],
    sidebarOpen: false,
    isFormFillingActive: false,
    currentActiveStep: null,
    currentAtsScoreData: null
  };

  // Provide seamless global accessors for state variables
  if (!('cachedProfile' in window)) {
    Object.defineProperty(window, 'cachedProfile', {
      get: () => window.AiCopilotState.cachedProfile,
      set: (v) => { window.AiCopilotState.cachedProfile = v; },
      configurable: true
    });
  }
  if (!('cachedBrainRules' in window)) {
    Object.defineProperty(window, 'cachedBrainRules', {
      get: () => window.AiCopilotState.cachedBrainRules,
      set: (v) => { window.AiCopilotState.cachedBrainRules = v; },
      configurable: true
    });
  }
  if (!('sidebarOpen' in window)) {
    Object.defineProperty(window, 'sidebarOpen', {
      get: () => window.AiCopilotState.sidebarOpen,
      set: (v) => { window.AiCopilotState.sidebarOpen = v; },
      configurable: true
    });
  }
  if (!('isFormFillingActive' in window)) {
    Object.defineProperty(window, 'isFormFillingActive', {
      get: () => window.AiCopilotState.isFormFillingActive,
      set: (v) => { window.AiCopilotState.isFormFillingActive = v; },
      configurable: true
    });
  }
  if (!('currentActiveStep' in window)) {
    Object.defineProperty(window, 'currentActiveStep', {
      get: () => window.AiCopilotState.currentActiveStep,
      set: (v) => { window.AiCopilotState.currentActiveStep = v; },
      configurable: true
    });
  }
  if (!('currentAtsScoreData' in window)) {
    Object.defineProperty(window, 'currentAtsScoreData', {
      get: () => window.AiCopilotState.currentAtsScoreData,
      set: (v) => { window.AiCopilotState.currentAtsScoreData = v; },
      configurable: true
    });
  }

  // Restore saved sidebar width preference
  try {
    chrome.storage?.local?.get?.(['copilot_sidebar_width'], (res) => {
      if (res?.copilot_sidebar_width) {
        document.documentElement.style.setProperty('--ai-copilot-sidebar-width', `${res.copilot_sidebar_width}px`);
      }
    });
  } catch (_) {}


  // ── Safe Chrome Messaging ────────────────────────────────────────────────────────────────────────────
  function isExtensionValid() {
    try {
      return Boolean(typeof chrome !== 'undefined' && chrome?.runtime && chrome.runtime.id);
    } catch (_) {
      return false;
    }
  }

  // Wraps chrome.runtime.sendMessage so that if the extension is reloaded / invalidated
  // while the content script is still alive, calls degrade gracefully to null instead of
  // throwing "Uncaught Error: Extension context invalidated".
  function safeMsg(msg) {
    return new Promise((resolve) => {
      try {
        if (!isExtensionValid()) {
          resolve(null);
          return;
        }
        chrome.runtime.sendMessage(msg, (response) => {
          try {
            if (chrome?.runtime?.lastError) {
              // Swallow: context invalidated, message channel closed, etc.
              resolve(null);
            } else {
              resolve(response);
            }
          } catch (_) {
            resolve(null);
          }
        });
      } catch (e) {
        // sendMessage itself throws if context is already gone
        resolve(null);
      }
    });
  }

  // Cached profile and brain rules
  let cachedProfile = null;
  let cachedBrainRules = [];
  let sidebarOpen = false;

  // Restore saved sidebar width preference
  try {
    if (isExtensionValid()) {
      chrome.storage?.local?.get?.(['copilot_sidebar_width'], (res) => {
        try {
          if (res?.copilot_sidebar_width) {
            document.documentElement.style.setProperty('--ai-copilot-sidebar-width', `${res.copilot_sidebar_width}px`);
          }
        } catch (_) { }
      });
    }
  } catch (_) { }

  // Pre-load candidate profile immediately so checklists and autofill have data from frame 1
  try {
    safeMsg({ action: 'GET_PROFILE' }).then(res => {
      if (res?.success && res.profile) {
        cachedProfile = res.profile;
        if (typeof scheduleAudit === 'function') scheduleAudit(50, true);
        else if (window.scheduleAudit) window.scheduleAudit(50, true);
      }
    });
  } catch (_) { }

  // Helper: detect if current page is a Google Form
  function isGoogleForm() {
    const host = window.location.hostname.toLowerCase();
    const path = window.location.pathname.toLowerCase();
    return (host === 'docs.google.com' && path.includes('/forms/')) || host === 'forms.gle';
  }

  // Helper: compute the next nearest Monday (skip if today is Fri/Sat/Sun → use Monday after next)
  function getNextMondayDateObj() {
    const now = new Date();
    const day = now.getDay(); // 0=Sun,1=Mon,...6=Sat
    let daysUntilMonday = (8 - day) % 7;
    if (daysUntilMonday === 0) daysUntilMonday = 7; // if today is Monday, next Monday
    // If today is Friday(5), Saturday(6), or Sunday(0) → too soon, skip to Monday after next
    if (day === 0 || day === 5 || day === 6) {
      daysUntilMonday += 7;
    }
    return new Date(now.getTime() + daysUntilMonday * 24 * 60 * 60 * 1000);
  }

  function getNextMonday() {
    const target = getNextMondayDateObj();
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    return `${months[target.getMonth()]} ${target.getDate()}, ${target.getFullYear()}`;
  }

  // Format next Monday matching the input field's expected format (MM/DD/YYYY, YYYY-MM-DD, DD/MM/YYYY)
  function getFormattedNextMonday(input) {
    const target = getNextMondayDateObj();
    const mm = String(target.getMonth() + 1).padStart(2, '0');
    const dd = String(target.getDate()).padStart(2, '0');
    const yyyy = String(target.getFullYear());

    if (!input) return `${mm}/${dd}/${yyyy}`;

    if (input.type === 'date') {
      return `${yyyy}-${mm}-${dd}`;
    }

    const placeholder = (input.placeholder || '').toLowerCase();
    const ariaLabel = (input.getAttribute('aria-label') || '').toLowerCase();
    const label = (getLabelText(input) || '').toLowerCase();
    const hints = `${placeholder} ${ariaLabel} ${label} ${(input.name || '')} ${(input.id || '')}`.toLowerCase();

    if (hints.includes('dd/mm/yyyy') || hints.includes('dd-mm-yyyy') || hints.includes('dd.mm.yyyy')) {
      return `${dd}/${mm}/${yyyy}`;
    }
    if (hints.includes('yyyy-mm-dd') || hints.includes('yyyy/mm/dd')) {
      return `${yyyy}-${mm}-${dd}`;
    }
    if (hints.includes('month') || hints.includes('mmmm')) {
      const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
      return `${months[target.getMonth()]} ${target.getDate()}, ${target.getFullYear()}`;
    }

    // Default standard ATS date format (MM/DD/YYYY as seen on SuccessFactors)
    return `${mm}/${dd}/${yyyy}`;
  }

  // Helper: check if an element is a non-application modal (cookie banner, chat widget, search bar, etc.)
  function isNonApplicationModal(el) {
    if (!el) return true;
    if (el.closest('#ai-copilot-sidebar') || el.closest('#ai-copilot-dock-tab')) return true;

    // Check ID, class, role, and ARIA label for known non-application widgets
    const sig = `${el.id} ${el.className} ${el.getAttribute('aria-label') || ''} ${el.getAttribute('role') || ''}`.toLowerCase();
    const badKeywords = [
      'cookie', 'consent', 'gdpr', 'privacy', 'onetrust', 'cc-window', 'c-bns', 'optanon',
      'intercom', 'crisp', 'drift', 'zendesk', 'messenger', 'chat-widget', 'hubspot',
      'search-modal', 'search-dialog', 'nav-modal', 'menu-modal', 'newsletter', 'subscribe',
      'feedback-modal', 'rollbar', 'sentry', 'survey', 'announcement', 'alert-dialog', 'toast'
    ];
    if (badKeywords.some(k => sig.includes(k))) return true;

    // Check innerText: if it is exclusively about cookies or privacy settings without application/resume signals
    const text = (el.innerText || '').slice(0, 300).toLowerCase();
    if ((text.includes('cookie') || text.includes('we use cookies')) && !text.includes('resume') && !text.includes('apply')) {
      return true;
    }

    return false;
  }

  // Helper: check if a container contains candidate application form signals
  function hasApplicationFormSignals(container) {
    if (!container) return false;
    // 1. File upload for resume / CV
    if (container.querySelector('input[type="file"], [data-automation-id*="upload" i], [class*="upload" i]')) return true;

    // 2. Candidate inputs
    const inputs = Array.from(container.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]), textarea, select'));
    if (inputs.length === 0) return false;

    return inputs.some(inp => {
      const ident = `${inp.name} ${inp.id} ${inp.placeholder} ${inp.getAttribute('aria-label')} ${getLabelText(inp)}`.toLowerCase();
      return ['first_name', 'firstname', 'last_name', 'lastname', 'full_name', 'email', 'phone', 'resume', 'cv', 'cover_letter', 'experience', 'salary', 'notice period', 'work authorization', 'legal right to work'].some(k => ident.includes(k));
    });
  }

  // 1. Detect active overlay application modal (LinkedIn Easy Apply, YC Reach Out, Greenhouse modal, etc.)
  function getActiveApplicationModal() {
    function isModalVisible(m) {
      if (!m) return false;
      const rect = m.getBoundingClientRect?.();
      if (rect && rect.width > 50 && rect.height > 50) return true;
      return isElementVisible(m);
    }

    // 1. LinkedIn Easy Apply Modal
    const linkedinModal = document.querySelector(
      '.jobs-easy-apply-modal, [data-test-modal-id="easy-apply-modal"], .jobs-easy-apply-content, .artdeco-modal:has(.jobs-easy-apply-content), .artdeco-modal:has([data-test-modal-id="easy-apply-modal"]), .artdeco-modal:has(.jobs-easy-apply-modal), .artdeco-modal:has(h2[id*="apply" i]), .artdeco-modal:has(h3[id*="apply" i]), .artdeco-modal[role="dialog"]'
    );
    if (linkedinModal && isModalVisible(linkedinModal) && hasApplicationFormSignals(linkedinModal)) return linkedinModal;

    // 2. YC / Work at a Startup Modal
    const ycModal = document.querySelector('[role="dialog"]:has(textarea), .modal:has(textarea), .modal-dialog:has(textarea)');
    if (ycModal && isModalVisible(ycModal) && !isNonApplicationModal(ycModal)) return ycModal;

    // 3. Generic ATS Application Modal (Strictly validated for candidate inputs, never cookie/chat popups)
    const generalModal = Array.from(document.querySelectorAll('[role="dialog"], .modal, .portal-modal, .dialog, .popup-modal'))
      .find(m => {
        if (isNonApplicationModal(m)) return false;
        if (!isModalVisible(m)) return false;
        return hasApplicationFormSignals(m);
      });
    if (generalModal) return generalModal;

    return null;
  }

  // 1. Universal ATS & Job Application Page Detector (Semantic Full-Page Understanding)
  function isJobPortal() {
    if (window.__ai_copilot_force_enabled) return true;
    if (window.__ai_copilot_is_job_portal !== undefined) return window.__ai_copilot_is_job_portal;

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
      const isJob = jobFormKeywords.some(kw => bodyText.includes(kw));
      if (isJob) window.__ai_copilot_is_job_portal = true;
      return isJob;
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

    // Y Combinator & Work at a Startup (Comprehensive support for all YC hiring properties)
    if (host === 'workatastartup.com' || host.endsWith('.workatastartup.com')) {
      window.__ai_copilot_is_job_portal = true;
      return true;
    }
    if (host === 'ycombinator.com' || host.endsWith('.ycombinator.com')) {
      if (host === 'news.ycombinator.com') {
        return path.includes('/jobs') || path.includes('/item') || /hiring/i.test(title);
      }
      const isYc = path.includes('/jobs') || path.includes('/companies') || path.includes('/apply') || path.includes('/cofounder') || host.startsWith('account.') || host.startsWith('bookface.');
      if (isYc) window.__ai_copilot_is_job_portal = true;
      return isYc;
    }

    // 2. Known Enterprise ATS & Job Application Platforms (Always match)
    const knownAtsDomains = [
      'workatastartup.com',
      'ycombinator.com',
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
      'eightfold.ai',
      'personio',
      'rippling',
      'cornerstoneondemand',
      'jobylon',
      'careerplug'
    ];
    if (knownAtsDomains.some(d => host.includes(d))) {
      window.__ai_copilot_is_job_portal = true;
      return true;
    }

    // 2.5. Universal DOM ATS Footprints (Catches custom domains & white-labeled portals)
    const atsFootprints = [
      '[data-automation-id]', // Workday
      '#application_form', // Greenhouse
      'form.application-form', // Lever
      '.ashby-application-form', // Ashby
      '[data-test="job-application"]', // SmartRecruiters
      '#tluForm', // Taleo
      '.iCIMS_App', // iCIMS
      '.bamboo-form', // BambooHR
      '#apply-form', // Generic
      'form[action*="apply" i]' // Generic apply action
    ];
    if (atsFootprints.some(selector => document.querySelector(selector))) {
      window.__ai_copilot_is_job_portal = true;
      return true;
    }

    // Job boards: Match when on job view, search, feeds, or application pages
    if (host.includes('linkedin.com')) {
      return path.includes('/jobs') || path.includes('/job-apply') ||
        !!document.querySelector('.jobs-easy-apply-modal, [data-test-modal-id="easy-apply-modal"], .jobs-easy-apply-content, button.jobs-apply-button, .jobs-search-results-list');
    }
    if (host.includes('indeed.com')) {
      return path.includes('/jobs') || path.includes('/viewjob') || path.includes('/apply') || path.includes('/m/');
    }
    if (host.includes('naukri.com')) {
      return true; // Naukri is dedicated exclusively to job discovery and applications
    }
    if (host.includes('glassdoor.com')) {
      return path.includes('/job') || path.includes('/apply');
    }

    // 3. Career Subdomains (Any company domain)
    if (/^(careers?|jobs?|talent|recruiting|apply|hire|work|join|vacancies)\./i.test(host)) {
      window.__ai_copilot_is_job_portal = true;
      return true;
    }

    // 4. Career URL Path Patterns (Supports standard and custom company portals)
    const jobKeywords = [
      'careers', 'career', 'jobs', 'job', 'openings', 'opening', 'positions', 'position',
      'postings', 'posting', 'apply', 'application', 'job-apply', 'candidate-portal',
      'applicant-portal', 'join-us', 'work-with-us', 'vacancies', 'vacancy', 'opportunities',
      'requisition', 'hire', 'p/'
    ];
    if (jobKeywords.some(kw => path.includes('/' + kw + '/') || path.endsWith('/' + kw) || path.includes('/' + kw))) {
      window.__ai_copilot_is_job_portal = true;
      return true;
    }

    // 5. Query Parameter Indicators
    if (/([?&])(gh_jid|jobid|job_id|lever-origin|ashby_jid|posting_id|postingid|requisition_id|job_posting_id)=/i.test(url)) {
      window.__ai_copilot_is_job_portal = true;
      return true;
    }

    // 6. Page Title Job Indicators
    if (/\b(job application|job opening|apply for|career opportunity|submit application|candidate application|careers?|jobs?|openings?|position|we are hiring|join our team)\b/i.test(title)) {
      window.__ai_copilot_is_job_portal = true;
      return true;
    }

    // 7. Universal Candidate Form Controls Detection in DOM (Works on ANY site)
    const hasCvUpload = !!document.querySelector('input[type="file"][name*="resume" i], input[type="file"][id*="resume" i], input[type="file"][data-automation-id*="resume" i], input[type="file"][accept*="pdf" i], input[type="file"][name*="cv" i], input[type="file"][id*="cv" i]');
    const hasNameField = !!document.querySelector('input[name*="firstname" i], input[id*="firstname" i], input[name*="first_name" i], input[id*="first_name" i], input[data-automation-id*="firstname" i], input[name*="name" i], input[id*="name" i], input[autocomplete*="name" i]');
    const hasEmailField = !!document.querySelector('input[type="email"], input[name*="email" i], input[id*="email" i]');
    const hasPhoneField = !!document.querySelector('input[type="tel"], input[name*="phone" i], input[id*="phone" i]');

    if ((hasNameField && (hasEmailField || hasPhoneField)) || (hasCvUpload && (hasEmailField || hasNameField))) {
      window.__ai_copilot_is_job_portal = true;
      return true;
    }

    // 8. Universal Semantic Full-Page Reading (Read text across the entire page)
    try {
      const pageText = (document.body?.innerText || '').slice(0, 15000).toLowerCase();

      // Signals for role / job opening details
      const roleSignals = [
        'job description', 'about the role', 'responsibilities', 'qualifications',
        'requirements', "what you'll do", "who you are", 'what you bring',
        'benefits & perks', 'equal opportunity employer', 'employment type', 'salary range'
      ];
      const hasRoleContext = roleSignals.some(s => pageText.includes(s));

      // Signals for candidate application actions
      const applySignals = [
        'apply now', 'apply for this job', 'submit application', 'apply with linkedin',
        'apply with indeed', 'attach resume', 'upload resume', 'upload cv', 'personal details',
        'contact information', 'screening questions', 'work authorization', 'notice period',
        'salary expectations', 'cover letter', 'how did you hear about this role'
      ];
      const hasApplyAction = applySignals.some(s => pageText.includes(s));

      if (hasRoleContext && hasApplyAction) {
        window.__ai_copilot_is_job_portal = true;
        return true;
      }
    } catch (_) { }

    return false;
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

  // 5. Job Details Extractor from Page (Intelligent Multi-Strategy Detection)
  const JOB_PORTAL_BLACKLIST = [
    'firstoffer', 'first offer', 'firstoffer.online',
    'wellfound', 'angellist', 'angel list',
    'y combinator', 'work at a startup', 'yc',
    'linkedin', 'indeed', 'glassdoor',
    'naukri', 'naukri.com', 'foundit', 'monster',
    'cutshort', 'instahyre', 'hirist', 'shine', 'freshersworld',
    'hiringcafe', 'otta', 'built in', 'builtin',
    'internshala', 'unstop', 'cuvette', 'techfetch', 'dice',
    'ziprecruiter', 'google jobs', 'remoteok', 'weworkremotely',
    'jobicy', 'simplyhired', 'careerbuilder', 'join.com',
    'breezy', 'greenhouse', 'lever', 'workday', 'ashby',
    'smartrecruiters', 'workable', 'recruitee', 'jobvite', 'bamboohr',
    'applytojob', 'taleo', 'icims', 'myworkdayjobs'
  ];

  function isPortalName(str) {
    if (!str || typeof str !== 'string') return true;
    const clean = str.trim().toLowerCase();
    if (!clean || clean.length < 2 || clean === 'company' || clean === 'hiring company' || clean === 'unknown' || clean === 'applicant') return true;
    const alphaNum = clean.replace(/[^a-z0-9]/g, '');
    const hostCore = (window.location.hostname || '').toLowerCase().replace(/^(?:www|jobs?|careers?)\./i, '').split('.')[0];
    if (hostCore && (alphaNum === hostCore || clean.includes(hostCore))) return true;

    for (const p of JOB_PORTAL_BLACKLIST) {
      const pClean = p.replace(/[^a-z0-9]/g, '');
      if (alphaNum === pClean || clean === p) return true;
      if (alphaNum.length <= pClean.length + 3 && pClean.length <= alphaNum.length + 3 && alphaNum.includes(pClean)) return true;
    }
    return false;
  }

  function extractFromJsonLd() {
    try {
      const scripts = document.querySelectorAll('script[type="application/ld+json"]');
      for (const s of scripts) {
        try {
          const raw = s.textContent?.trim();
          if (!raw) continue;
          const parsed = JSON.parse(raw);
          const items = Array.isArray(parsed) ? parsed : (parsed['@graph'] || [parsed]);
          for (const item of items) {
            if (!item) continue;
            const t = (item['@type'] || '').toString();
            if (t.includes('JobPosting')) {
              let comp = '';
              const org = item.hiringOrganization || item.hiringOrganizationName;
              if (typeof org === 'string') comp = org;
              else if (org && typeof org === 'object') comp = org.name || org.legalName || '';

              const title = item.title || item.name || '';
              let desc = item.description || '';
              if (desc.includes('<')) {
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = desc;
                desc = tempDiv.innerText || tempDiv.textContent || desc;
              }
              const skills = item.skills || item.experienceRequirements || '';
              return {
                company: comp?.trim(),
                role: title?.trim(),
                description: desc?.trim(),
                skills: typeof skills === 'string' ? skills : (Array.isArray(skills) ? skills.join(', ') : '')
              };
            }
          }
        } catch (_) {}
      }
    } catch (_) {}
    return null;
  }

  function extractFromTitleAndUrl() {
    const candidates = [
      decodeURIComponent(window.location.pathname || '').replace(/^\/+|\/+$/g, '').replace(/[-_]/g, ' '),
      document.title || ''
    ];

    for (const text of candidates) {
      if (!text || text.length < 5) continue;

      // Pattern 1: Role at Company (e.g. "Software Fullstack Developer Intern at GreedyGame")
      const atMatch = text.match(/^(?:.*?\/\s*)?(.*?)\s+(?:at|@|with)\s+([A-Za-z0-9\s&.,'-]+?)(?:\s*[-–—|•·]|\s*$|\s*\(|\s*\[|\s*\d{4})/i);
      if (atMatch && atMatch[1] && atMatch[2]) {
        const potentialRole = atMatch[1].replace(/^(?:careers?|jobs?|openings?)\s*[-–—|•·:]\s*/i, '').trim();
        const potentialComp = atMatch[2].trim();
        if (!isPortalName(potentialComp) && potentialRole.length > 2) {
          return { role: potentialRole, company: potentialComp };
        }
      }

      // Pattern 2: Company is hiring Role (e.g. "GreedyGame is hiring Software Fullstack Developer Intern")
      const hiringMatch = text.match(/^([A-Za-z0-9\s&.,'-]+?)\s+(?:is\s+hiring|hiring\s+for)\s+(?:a\s+|an\s+)?(.*?)(?:\s*[-–—|•·]|\s*$)/i);
      if (hiringMatch && hiringMatch[1] && hiringMatch[2]) {
        const potentialComp = hiringMatch[1].trim();
        const potentialRole = hiringMatch[2].trim();
        if (!isPortalName(potentialComp) && potentialRole.length > 2) {
          return { role: potentialRole, company: potentialComp };
        }
      }

      // Pattern 3: Delimited by - | • – —
      const parts = text.split(/\s*[-–—|•·]\s*/).map(p => p.trim()).filter(Boolean);
      if (parts.length >= 2) {
        const isPart0Role = /developer|engineer|intern|designer|manager|architect|lead|analyst|specialist|consultant|fullstack|frontend|backend/i.test(parts[0]);
        const isPart1Role = /developer|engineer|intern|designer|manager|architect|lead|analyst|specialist|consultant|fullstack|frontend|backend/i.test(parts[1]);

        if (isPart0Role && !isPortalName(parts[1])) {
          return { role: parts[0], company: parts[1].replace(/careers?|jobs?/i, '').trim() };
        } else if (isPart1Role && !isPortalName(parts[0])) {
          return { role: parts[1], company: parts[0].replace(/careers?|jobs?/i, '').trim() };
        }
      }
    }
    return null;
  }

  function extractCompanyFromDom() {
    // 1. Check Schema.org / Microdata
    const metaHiringOrg = document.querySelector('[itemprop="hiringOrganization"] [itemprop="name"], [itemprop="hiringOrganization"], [data-company], [data-company-name="true"], [data-automation-id="companyName"]');
    if (metaHiringOrg) {
      const c = metaHiringOrg.textContent?.trim();
      if (c && !isPortalName(c)) return c;
    }

    // 2. Check company links: a[href*="/company/"], a[href*="/companies/"], a[href*="/employer/"]
    const companyLinks = Array.from(document.querySelectorAll('a[href*="/company/"], a[href*="/companies/"], a[href*="/employer/"]'))
      .filter(a => !a.closest('#ai-copilot-sidebar') && !a.closest('#ai-copilot-dock-tab'));
    for (const a of companyLinks) {
      const txt = a.textContent?.trim();
      if (txt && txt.length >= 2 && txt.length < 50 && !isPortalName(txt)) {
        return txt;
      }
    }

    // 3. Check text before h1 or inside h1 container
    const h1 = document.querySelector('h1, [class*="job-title" i], [class*="role-title" i]');
    if (h1 && h1.parentElement) {
      // Check previous siblings of h1 (like company badge "[GR] GreedyGame")
      let prev = h1.previousElementSibling;
      while (prev) {
        const txt = prev.textContent?.trim();
        if (txt && txt.length >= 2 && txt.length < 40 && !isPortalName(txt)) {
          const cleanTxt = txt.replace(/^[A-Z]{1,3}\s+/, '').trim();
          if (cleanTxt && !isPortalName(cleanTxt)) return cleanTxt;
        }
        prev = prev.previousElementSibling;
      }

      // Check text in section matching "at <Company>" or "- at <Company> ·"
      const parentText = h1.parentElement.innerText || '';
      const atMatch = parentText.match(/(?:at|@)\s+([A-Z][A-Za-z0-9\s&.,'-]{1,35}?)(?:\s*[·•–—|-]|\s*,|\s*\n|\s*$)/);
      if (atMatch && atMatch[1] && !isPortalName(atMatch[1])) {
        return atMatch[1].trim();
      }
    }

    // 4. Check elements with company class
    const compElements = Array.from(document.querySelectorAll('[class*="company" i], [class*="employer" i]'))
      .filter(el => !el.closest('#ai-copilot-sidebar') && !el.closest('#ai-copilot-dock-tab') && !el.closest('form'));
    for (const el of compElements) {
      if (el.children.length > 3 || (el.textContent?.trim().length || 0) > 60) continue;
      const txt = el.textContent?.trim();
      if (txt && txt.length >= 2 && !isPortalName(txt) && !txt.toLowerCase().includes('job') && !txt.toLowerCase().includes('filter')) {
        return txt;
      }
    }

    // 5. Check breadcrumbs
    const breadcrumb = document.querySelector('.breadcrumb, [class*="breadcrumb" i], nav[aria-label*="breadcrumb" i]');
    if (breadcrumb) {
      const bcText = breadcrumb.innerText || '';
      const bcMatch = bcText.match(/(?:at|@)\s+([A-Za-z0-9\s&.,'-]{2,35})/i);
      if (bcMatch && !isPortalName(bcMatch[1])) return bcMatch[1].trim();
    }

    return '';
  }

  function cleanRole(rawRole) {
    if (!rawRole) return '';
    let r = rawRole.trim();
    r = r.replace(/\s*[-–—|]\s*(?:FirstOffer|LinkedIn|Indeed|Naukri|Glassdoor|Wellfound|Cutshort|Instahyre|Hirist).*$/i, '');
    r = r.replace(/\s+(?:at|@|with)\s+[A-Za-z0-9\s&.,'-]+$/i, '');
    r = r.replace(/\s*\(Batch\s*[^\)]*\)/i, '');
    r = r.replace(/\s*[-–—]\s*Batch\s*[\d/]+/i, '');
    return r.trim();
  }

  function extractDescriptionAndSkills() {
    let description = '';
    const skills = [];

    // 1. Collect skills from pills / badges / tags
    const skillPills = Array.from(document.querySelectorAll('.pill, .tag, .badge, [class*="pill" i], [class*="tag" i], [class*="badge" i], [class*="skill" i]'))
      .filter(p => !p.closest('#ai-copilot-sidebar') && !p.closest('#ai-copilot-dock-tab'))
      .map(p => p.textContent.trim())
      .filter(t => t.length >= 2 && t.length < 35 && !t.includes('\n') && !/apply|applied|save|share|report|login|sign/i.test(t));
    if (skillPills.length > 0) {
      skills.push(...Array.from(new Set(skillPills)));
    }

    // 2. Look for specialized JD containers
    const jdContainers = Array.from(document.querySelectorAll(
      '.job-details, .job-description, .post-body, .company-overview, ' +
      '[class*="job-details" i], [class*="jobDescription" i], [class*="job-description" i], ' +
      '[class*="description" i], [class*="opportunity" i], [class*="prose" i], article, main'
    )).filter(c => !c.closest('#ai-copilot-sidebar') && !c.closest('#ai-copilot-dock-tab'));

    if (jdContainers.length > 0) {
      const sorted = jdContainers.sort((a, b) => (b.innerText?.length || 0) - (a.innerText?.length || 0));
      description = sorted[0].innerText || '';
    }

    // 3. Look for explicit headings ("ABOUT THE OPPORTUNITY", "REQUIRED SKILLS", etc.)
    const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, [class*="heading" i], [class*="title" i]'))
      .filter(h => !h.closest('#ai-copilot-sidebar') && !h.closest('#ai-copilot-dock-tab'));

    const structuredSections = [];
    for (const h of headings) {
      const hText = h.textContent?.trim();
      if (!hText) continue;
      if (/about the opportunity|required skills|skills required|key skills|requirements|responsibilities|qualifications|about the role|what you'll do|what you will do|about the company/i.test(hText)) {
        let sibling = h.nextElementSibling;
        let secContent = '';
        while (sibling && !/^H[1-4]$/i.test(sibling.tagName) && !sibling.querySelector('h1, h2, h3, h4')) {
          secContent += (sibling.innerText || sibling.textContent || '') + '\n';
          sibling = sibling.nextElementSibling;
        }
        if (secContent.trim()) {
          structuredSections.push(`${hText.toUpperCase()}:\n${secContent.trim()}`);
        }
      }
    }

    if (structuredSections.length > 0) {
      description = structuredSections.join('\n\n') + '\n\n' + (description.length > 2500 ? description.slice(0, 2500) : description);
    }

    if (!description || description.length < 50) {
      description = document.body.innerText.slice(0, 2500);
    }

    if (skills.length > 0) {
      description += '\n\nKey Skills & Technologies: ' + Array.from(new Set(skills)).slice(0, 20).join(', ');
    }

    return { description: description.trim(), skills };
  }

  function extractJobDetails() {
    let company = '';
    let role = '';
    let description = '';
    let jobLocation = '';
    let pageEmail = '';

    try {
      const host = window.location.hostname.toLowerCase();
      const url = window.location.href.toLowerCase();

      // FirstOffer (firstoffer.online)
      if (host.includes('firstoffer')) {
        const h1 = document.querySelector('h1, [class*="job-title" i], [class*="title" i]');
        if (h1 && h1.textContent?.trim()) {
          role = cleanRole(h1.textContent);
        }

        // Try Next.js __NEXT_DATA__
        try {
          const nextScript = document.getElementById('__NEXT_DATA__');
          if (nextScript) {
            const nData = JSON.parse(nextScript.textContent || '{}');
            const pProps = nData?.props?.pageProps;
            const jData = pProps?.job || pProps?.jobData || pProps?.post || pProps?.opening || pProps?.data;
            if (jData && typeof jData === 'object') {
              if (jData.company_name || jData.company) company = jData.company_name || jData.company;
              if (!role && (jData.title || jData.role)) role = jData.title || jData.role;
              if (!description && (jData.description || jData.jd)) description = jData.description || jData.jd;
              if (!jobLocation && jData.location) jobLocation = jData.location;
              if (!pageEmail && (jData.apply_email || jData.email)) pageEmail = jData.apply_email || jData.email;
            }
          }
        } catch (_) {}

        // Try Breadcrumb: "Home / Fresher Jobs / Forward Deployed Engineer at persistence.dev"
        if (!company) {
          const bc = document.querySelector('.breadcrumb, [class*="breadcrumb" i], nav');
          if (bc) {
            const bcText = bc.textContent || '';
            const m = bcText.match(/(?:at|@)\s+([a-zA-Z0-9._-]+)/i);
            if (m && !isPortalName(m[1])) company = m[1].trim();
          }
        }

        // Try company element directly preceding h1 or in header
        if (!company && h1 && h1.parentElement) {
          let prev = h1.previousElementSibling;
          while (prev) {
            const txt = prev.textContent?.trim();
            if (txt && txt.length >= 2 && txt.length < 50 && !isPortalName(txt)) {
              const cleaned = txt.replace(/^[A-Z]{1,3}\s+/, '').trim();
              if (cleaned && !isPortalName(cleaned)) {
                company = cleaned;
                break;
              }
            }
            prev = prev.previousElementSibling;
          }
        }

        // Try URL or title: "Forward Deployed Engineer at persistence.dev"
        if (!company) {
          const pathOrTitle = (window.location.pathname + ' ' + (document.title || '')).replace(/[-_]/g, ' ');
          const atM = pathOrTitle.match(/\bat\s+([a-zA-Z0-9._-]+\.[a-zA-Z]{2,}|[a-zA-Z0-9&.' -]{2,30})\b/i);
          if (atM && !isPortalName(atM[1])) company = atM[1].trim();
        }

        // Try location badge
        if (!jobLocation) {
          const badges = Array.from(document.querySelectorAll('[class*="badge" i], [class*="pill" i], [class*="tag" i], span, div'))
            .filter(el => !el.closest('#ai-copilot-sidebar'));
          for (const b of badges) {
            const txt = b.textContent?.trim();
            if (txt && /^(bangalore|bengaluru|mumbai|pune|hyderabad|delhi|noida|gurgaon|remote|chennai|san francisco|new york|london)$/i.test(txt)) {
              jobLocation = txt;
              break;
            }
          }
        }
      }
      // Workday
      else if (host.includes('workday') || url.includes('workday') || !!document.querySelector('[data-automation-id]')) {
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
        const modal = getActiveApplicationModal();
        const modalHeader = modal?.querySelector('h3#jobs-apply-header, h2.artdeco-modal__header, .t-16.t-bold, h3, h2');
        const modalTitle = modalHeader?.textContent?.trim() || '';

        role = document.querySelector('.job-details-jobs-unified-top-card__job-title, h1.jobs-unified-top-card__job-title, h1.t-24, .top-card-layout__title, a.job-card-list__title--link')?.textContent?.trim() ||
          (modalTitle && !modalTitle.toLowerCase().includes('apply') && !modalTitle.toLowerCase().includes('step') ? modalTitle : '') || '';

        company = document.querySelector('.job-details-jobs-unified-top-card__company-name, .jobs-unified-top-card__company-name, .topcard__flavor, a[href*="/company/"]')?.textContent?.trim() || '';

        description = document.querySelector('.jobs-description__content, .jobs-box__html-content, #job-details, .jobs-description')?.innerText || '';
      }
      // Indeed
      else if (host.includes('indeed.com')) {
        role = document.querySelector('h1.jobsearch-JobInfoHeader-title, .jobsearch-JobInfoHeader-title')?.textContent || '';
        company = document.querySelector('[data-company-name="true"], .jobsearch-CompanyInfoContainer a, .jobsearch-JobInfoHeader-companyName')?.textContent || '';
        description = document.querySelector('#jobDescriptionText')?.innerText || '';
      }
      // Naukri
      else if (host.includes('naukri.com')) {
        role = document.querySelector('h1.styles_jd-header-title__rZwM1, .jd-header-title, h1[title]')?.textContent || '';
        company = document.querySelector('.styles_jd-header-comp-name__MvqAI a, .comp-name, a.pad-rt-8')?.textContent || '';
        description = document.querySelector('.styles_JDC__dang-inner-html__h0K4t, .job-desc')?.innerText || '';
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
        const formDesc = document.querySelector('.freebirdFormviewerViewHeaderDescription, .m7sMe');
        description = formDesc?.innerText || document.body.innerText.slice(0, 2000);
      }
      // Y Combinator & Work at a Startup
      else if (host.includes('workatastartup.com') || host.includes('ycombinator.com')) {
        const roleElem = document.querySelector('.job-title, [class*="job-title" i], [class*="role-title" i], .posting-headline, h1');
        if (roleElem) {
          role = roleElem.textContent.trim().replace(/\s*[-–—|]\s*(Work at a Startup|Y Combinator|YC).*$/i, '').trim();
        }

        const modalHeader = document.querySelector('h1, h2, h3, [role="dialog"] h3, .modal h3');
        const reachMatch = modalHeader?.textContent?.match(/Reach out to the team at\s+([A-Za-z0-9\s&]+)/i);
        if (reachMatch) company = reachMatch[1].trim();

        if (!company) {
          const aboutHeadings = Array.from(document.querySelectorAll('h2, h3, h4, .company-name, [class*="company-name" i]'));
          for (const h of aboutHeadings) {
            const txt = h.textContent.trim();
            const m = txt.match(/^About\s+([A-Za-z0-9\s&]+)/i);
            if (m && !m[1].toLowerCase().includes('the role') && !m[1].toLowerCase().includes('our products') && !m[1].toLowerCase().includes('us')) {
              company = m[1].trim();
              break;
            }
          }
        }

        if (!company) {
          const compLink = document.querySelector('a[href*="/companies/"], .company-name, [class*="company" i] a');
          if (compLink) company = compLink.textContent.replace(/\s*\([A-Z]\d+\)/i, '').trim();
        }
      }

      // ── Universal Multi-Strategy Extraction for Portals & Direct Career Sites ──
      if (!company || isPortalName(company)) {
        const jsonLd = extractFromJsonLd();
        if (jsonLd) {
          if (jsonLd.company && !isPortalName(jsonLd.company)) company = jsonLd.company;
          if (!role && jsonLd.role) role = jsonLd.role;
          if (!description && jsonLd.description) description = jsonLd.description;
        }
      }

      if (!company || isPortalName(company) || !role) {
        const titleUrlInfo = extractFromTitleAndUrl();
        if (titleUrlInfo) {
          if (!company || isPortalName(company)) company = titleUrlInfo.company;
          if (!role) role = titleUrlInfo.role;
        }
      }

      if (!company || isPortalName(company)) {
        const domComp = extractCompanyFromDom();
        if (domComp && !isPortalName(domComp)) {
          company = domComp;
        }
      }

      if (!role) {
        const h1 = document.querySelector('h1, [class*="job-title" i], [class*="role-title" i], [data-automation-id*="jobTitle" i]');
        if (h1) role = h1.textContent.trim();
      }

      role = cleanRole(role);

      if (!description || description.length < 100) {
        const extractedDesc = extractDescriptionAndSkills();
        description = extractedDesc.description;
      }

      if (isPortalName(company)) {
        company = '';
      }

      const EMAIL_BLACKLIST = [
        'support@firstoffer.online', 'help@wellfound.com', 'support@linkedin.com',
        'support@indeed.com', 'help@naukri.com', 'feedback@', 'privacy@',
        'legal@', 'abuse@', 'security@', 'postmaster@', 'noreply@', 'no-reply@',
        'donotreply@', 'example@', 'domain@', 'test@', 'user@', 'yourname@',
        'email@', 'name@', 'sentry.io', 'w3.org', 'schema.org', 'github.com',
        'google.com', 'cloudflare.com', 'wixpress.com'
      ];

      function isValidJobEmail(emailStr) {
        if (!emailStr || typeof emailStr !== 'string') return false;
        const clean = emailStr.toLowerCase().trim().replace(/[.,;!?)]+$/, '');
        if (!/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(clean)) return false;
        if (clean.length < 6 || clean.length > 70) return false;
        for (const b of EMAIL_BLACKLIST) {
          if (b.endsWith('@') ? clean.startsWith(b) : clean.includes(b)) return false;
        }
        return true;
      }

      function extractEmailFromPage(desc = '', targetComp = '') {
        try {
          // 1. High priority: check buttons/links with text like "apply via email", "email apply", "apply by email"
          const applyButtons = Array.from(document.querySelectorAll('a, button, [role="button"]'))
            .filter(el => !el.closest('#ai-copilot-sidebar'));
          for (const btn of applyButtons) {
            const btnText = (btn.textContent || '').trim();
            if (/apply\s+via\s+email|apply\s+by\s+email|email\s+apply|send\s+email|contact\s+recruiter|mail\s+application/i.test(btnText)) {
              const href = btn.getAttribute('href') || btn.href || '';
              if (href && href.includes('mailto:')) {
                const raw = href.replace(/^.*mailto:/i, '').split('?')[0].trim();
                if (isValidJobEmail(raw)) return raw.toLowerCase();
              }
              for (const attr of ['data-email', 'data-mailto', 'data-href', 'data-url', 'data-action', 'onclick']) {
                const val = btn.getAttribute(attr) || '';
                const m = val.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
                if (m && isValidJobEmail(m[1])) return m[1].toLowerCase();
              }
            }
          }

          // 2. Scan all mailto links on page
          const mailtoLinks = Array.from(document.querySelectorAll('a[href*="mailto:" i]'))
            .filter(a => !a.closest('#ai-copilot-sidebar'));
          for (const a of mailtoLinks) {
            const href = a.getAttribute('href') || a.href || '';
            const raw = href.replace(/^.*mailto:/i, '').split('?')[0].trim();
            if (isValidJobEmail(raw)) return raw.toLowerCase();
          }

          // 3. Scan elements with data-email or data-mailto
          const emailElems = Array.from(document.querySelectorAll('[data-email], [data-mailto]'))
            .filter(el => !el.closest('#ai-copilot-sidebar'));
          for (const el of emailElems) {
            const val = el.getAttribute('data-email') || el.getAttribute('data-mailto') || '';
            if (isValidJobEmail(val)) return val.toLowerCase().trim();
          }

          // 4. High-priority contextual regex ("send resume to ...", "apply at ...", "share your cv with ...")
          const priorityRegex = /(?:send|email|forward|share|submit|reach|contact|write|apply|mail)(?:\s+[\w\s]{0,25})?\s*(?:to|at|via)?\s*[:\-]?\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi;
          let match;
          const textSources = [desc, document.body?.innerText || ''];
          for (const text of textSources) {
            if (!text) continue;
            while ((match = priorityRegex.exec(text)) !== null) {
              if (isValidJobEmail(match[1])) return match[1].toLowerCase().replace(/[.,;!?)]+$/, '');
            }
          }

          // 5. If company name is a domain (like "persistence.dev") or company is known:
          if (targetComp && targetComp.includes('.')) {
            const domain = targetComp.toLowerCase().trim();
            const domainRegex = new RegExp(`\\b([a-zA-Z0-9._%+-]+@${domain.replace('.', '\\.')})\\b`, 'i');
            const dMatch = (document.body?.innerText || '').match(domainRegex);
            if (dMatch && isValidJobEmail(dMatch[1])) return dMatch[1].toLowerCase();
          }

          // 6. Scan description and main job container for any valid email
          if (desc) {
            const anyEmailRegex = /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g;
            while ((match = anyEmailRegex.exec(desc)) !== null) {
              if (isValidJobEmail(match[0])) return match[0].toLowerCase().replace(/[.,;!?)]+$/, '');
            }
          }

          const container = document.querySelector('[class*="job-description" i], [class*="job-details" i], [class*="posting" i], main, article, #content, .content');
          if (container) {
            const anyEmailRegex = /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g;
            const cText = container.innerText || '';
            while ((match = anyEmailRegex.exec(cText)) !== null) {
              if (isValidJobEmail(match[0])) return match[0].toLowerCase().replace(/[.,;!?)]+$/, '');
            }
          }
        } catch (e) {
          console.warn('[AI Copilot] extractEmailFromPage error:', e);
        }
        return '';
      }

      if (!pageEmail) {
        pageEmail = extractEmailFromPage(description, company);
      }
    } catch (err) {
      console.warn('[AI Copilot] Error in extractJobDetails:', err);
    }

    return {
      company: (company || 'Company').trim(),
      role: (role || 'Software Engineer').trim(),
      description: (description || '').trim(),
      location: (typeof jobLocation === 'string' ? jobLocation : '').trim(),
      email: pageEmail || ''
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
      if (!element) return '';

      // 1. Google Forms & modern card-based forms: inspect question card header first
      const gfBlock = element.closest('.Qr7Oae, [role="listitem"], .freebirdFormviewerComponentsQuestionBaseRoot, .freebirdFormviewerViewNumberedItemContainer');
      if (gfBlock) {
        const heading = gfBlock.querySelector('.M7eMe, [role="heading"], .freebirdFormviewerComponentsQuestionBaseTitle, .c2gUWb, .HoL3Ez');
        if (heading && heading.textContent.trim()) {
          return heading.textContent.replace(/\s*\*+\s*$/, '').trim();
        }
      }

      // 1.5 Explicit ID-based label for React portals
      if (element.id) {
        try {
          const explicitLabel = document.querySelector(`label[for="${CSS.escape(element.id)}"]`);
          if (explicitLabel) {
            const inner = explicitLabel.querySelector('.application-label, [class*="label" i], .text, legend');
            const target = inner && inner !== element && !inner.contains(element) ? inner : explicitLabel;
            const clone = target.cloneNode(true);
            clone.querySelectorAll('input, select, textarea, button, script, style, [class*="dropdown" i]').forEach(n => n.remove());
            const txt = clone.textContent.trim();
            if (txt) {
              const res = txt.replace(/[\s\*\:\?✱•★]+$/, '').trim();
              if (res) return res;
            }
          }
        } catch (_) {}
      }

      // 2. Explicit HTML labels
      if (element.labels && element.labels.length > 0) {
        const lbl = element.labels[0];
        const inner = lbl.querySelector('.application-label, [class*="label" i], .text, legend');
        if (inner && inner !== element && !inner.contains(element)) {
          const txt = inner.textContent.trim();
          if (txt) return txt.replace(/[\s\*\:\?✱•★]+$/, '').trim();
        }
        const clone = lbl.cloneNode(true);
        clone.querySelectorAll('input, select, textarea, button, script, style, [class*="dropdown" i]').forEach(n => n.remove());
        const txt = clone.textContent.trim();
        if (txt) {
          const res = txt.replace(/[\s\*\:\?✱•★]+$/, '').trim();
          if (res) return res;
        }
      }
      const parentLabel = element.closest('label');
      if (parentLabel) {
        const inner = parentLabel.querySelector('.application-label, [class*="label" i], .text, legend');
        if (inner && inner !== element && !inner.contains(element)) {
          const txt = inner.textContent.trim();
          if (txt) return txt.replace(/[\s\*\:\?✱•★]+$/, '').trim();
        }
        const clone = parentLabel.cloneNode(true);
        clone.querySelectorAll('input, select, textarea, button, script, style, [class*="dropdown" i]').forEach(n => n.remove());
        const txt = clone.textContent.trim();
        if (txt) {
          const res = txt.replace(/[\s\*\:\?✱•★]+$/, '').trim();
          if (res) return res;
        }
      }

      // 3. ARIA labelledby reference lookup
      const labelledBy = element.getAttribute('aria-labelledby');
      if (labelledBy) {
        const labelEl = document.getElementById(labelledBy.split(' ')[0]);
        if (labelEl && labelEl.textContent.trim()) {
          return labelEl.textContent.replace(/[\s\*\:\?✱•★]+$/, '').trim();
        }
      }

      // 4. aria-label fallback (if it's not generic)
      const ariaLabel = element.getAttribute('aria-label');
      if (ariaLabel && !['your answer', 'answer', 'text', 'input', 'textarea'].includes(ariaLabel.toLowerCase().trim())) {
        return ariaLabel.replace(/[\s\*\:\?✱•★]+$/, '').trim();
      }

      // 5. Preceding sibling element (skipping our injected buttons or wrappers)
      let prev = element.previousElementSibling;
      while (prev && (prev.classList?.contains('ai-copilot-field-btn') || prev.id?.startsWith('ai-copilot') || prev.tagName === 'BUTTON')) {
        prev = prev.previousElementSibling;
      }
      if (prev) {
        const txt = prev.textContent.trim();
        if (txt.length > 1 && txt.length < 600 && !prev.querySelector('input, select, textarea')) {
          return txt.replace(/[\s\*\:\?✱•★]+$/, '').trim();
        }
      }

      // 6. Check table row structures (SAP SuccessFactors, Taleo, Oracle ATS)
      const tr = element.closest('tr');
      if (tr) {
        const th = tr.querySelector('th, td.label, td[class*="label" i], td[class*="title" i], td:first-child');
        if (th && th !== element.closest('td')) {
          const txt = th.textContent.trim();
          if (txt.length > 1 && txt.length < 600) return txt.replace(/[\s\*\:\?✱•★]+$/, '').trim();
        }
      }

      // 7. Robust Container & Ancestor Lookup (Workday, Greenhouse, Lever, Ashby, Pinpoint, custom company portals)
      let curr = element.parentElement;
      while (curr && curr !== document.body && curr !== document.documentElement) {
        const candidateLabel = curr.querySelector(
          '.application-label, label, .label, [class*="label" i], [class*="title" i], [class*="question" i], [class*="prompt" i], [data-automation-id*="label"], dt, th, h1, h2, h3, h4, h5, h6, legend, p.font-semibold, p.font-bold'
        );
        if (candidateLabel && candidateLabel !== element && !candidateLabel.contains(element)) {
          const txt = candidateLabel.textContent.trim();
          if (txt.length > 1 && txt.length < 600) {
            return txt.replace(/[\s\*\:\?✱•★]+$/, '').trim();
          }
        }
        curr = curr.parentElement;
      }

      // 8. Card text line scan: look for question sentence ending with '?' or prompt phrases
      const card = element.closest('.Qr7Oae, [role="listitem"], fieldset, [class*="card" i], [class*="group" i], [class*="question" i]') || element.parentElement?.parentElement;
      if (card) {
        const lines = (card.innerText || '').split('\n').map(l => l.trim()).filter(Boolean);
        const qLine = lines.find(l => 
          (l.includes('?') || /^(what|which|describe|explain|how|why|do you|tell us|give one)\b/i.test(l)) &&
          !l.toLowerCase().includes('words minimum') &&
          !l.toLowerCase().includes('characters minimum') &&
          l.length > 5 && l.length < 600
        );
        if (qLine) return qLine.replace(/\s*\*+\s*$/, '').trim();
      }
    } catch (_) { }
    return '';
  }

  // Check if form element is currently visible on active page / step
  function isElementVisible(el) {
    if (!el) return false;
    if (el.tagName === 'SELECT' || (el.tagName === 'INPUT' && el.style.opacity === '0')) {
      const parent = el.parentElement;
      if (parent && (parent.offsetParent !== null || parent.offsetWidth > 0)) {
        return true;
      }
    }
    if (el.closest('[style*="display: none"], [style*="display:none"]')) {
      if (el.tagName === 'SELECT') {
        const wrapper = el.closest('.sapMSelect, .ui-selectmenu, .custom-select, .form-group, td, tr, div');
        if (wrapper && (wrapper.offsetParent !== null || wrapper.offsetWidth > 0)) {
          return true;
        }
      }
      return false;
    }
    const rect = el.getBoundingClientRect?.();
    if (rect && (rect.width > 0 || rect.height > 0)) {
      return true;
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

  // Deep query selector that penetrates shadow DOMs (Useful for Web Components)
  window.querySelectorAllDeep = function(selector, root = document) {
    const elements = Array.from(root.querySelectorAll(selector));
    const shadowHosts = Array.from(root.querySelectorAll('*')).filter(el => el.shadowRoot);
    shadowHosts.forEach(host => {
      elements.push(...window.querySelectorAllDeep(selector, host.shadowRoot));
    });
    return elements;
  };

  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
  window.sleep = sleep;

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

  // Set full native value on input or textarea with proper framework events and error clearing
  function setNativeValue(element, value) {
    if (!element) return;
    const str = String(value ?? '');
    try {
      const prototype = Object.getPrototypeOf(element);
      const prototypeValueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
      if (prototypeValueSetter) {
        prototypeValueSetter.call(element, str);
      } else {
        element.value = str;
      }
    } catch (_) {
      element.value = str;
    }
    element.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    element.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
    element.dispatchEvent(new Event('blur', { bubbles: true }));

    // Clear validation error if present (Google Forms, Workday, Greenhouse)
    try {
      const container = element.closest('.Qr7Oae, [role="listitem"], .form-group, .field');
      if (container) {
        const errorEl = container.querySelector('[role="alert"], .dDABCe, .RHiLvd, .error, .invalid-feedback');
        if (errorEl) errorEl.style.display = 'none';
      }
    } catch (_) { }
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
      if (!text || text.length < 4 || errors.includes(text)) return;

      const lower = text.toLowerCase();
      // Ignore positive / progress notifications (e.g. file upload success alerts)
      if (
        lower.includes('successfully') ||
        lower.includes('uploading') ||
        lower.includes('in progress') ||
        lower.includes('saved') ||
        lower.includes('complete') ||
        lower.includes('success')
      ) {
        return;
      }

      errors.push(text);
    });

    return errors;
  }

  function getCleanFieldLabel(inp) {
    // 0. YC Work at a Startup & Startup Outreach Textarea
    if (inp.tagName === 'TEXTAREA') {
      const ph = (inp.placeholder || '').toLowerCase();
      const parentCard = inp.closest('.modal, [role="dialog"], [class*="modal" i], div:has(> textarea)') || inp.parentElement;
      const cardText = (parentCard?.textContent || '').toLowerCase();
      if (
        ph.includes('hi! my name is') ||
        ph.includes('what i\'m looking for') ||
        ph.includes('what im looking for') ||
        ph.includes('little bit about me') ||
        cardText.includes('reach out to the team') ||
        cardText.includes('start a conversation') ||
        cardText.includes('share something about you') ||
        cardText.includes('notes to founders') ||
        cardText.includes('note to founders') ||
        cardText.includes('why are you a good fit')
      ) {
        return 'Founder Outreach Note';
      }
    }

    if (inp.type === 'checkbox') {
      const container = inp.closest('.form-group, fieldset, [data-automation-id*="group" i], [class*="group" i], label, div');
      const text = ((getLabelText(inp) || '') + ' ' + (container?.textContent || '') + ' ' + (inp.name || '') + ' ' + (inp.id || '')).toLowerCase();
      if (text.includes('relocat') || text.includes('location preference') || text.includes('open to relocating') || text.includes('update your profile so companies')) {
        return 'Willing to Relocate (Update Profile)';
      }
      if (text.includes('term') || text.includes('condition') || text.includes('privacy') || text.includes('policy')) {
        return 'Terms & Conditions (Consent)';
      }
      if (text.includes('certif') || text.includes('accura') || text.includes('truthful') || text.includes('declaration')) {
        return 'Certification of Accuracy';
      }
      if (text.includes('acknowledg') || text.includes('consent') || text.includes('agree')) {
        return 'Acknowledgment & Consent';
      }
      if (text.includes('process') && (text.includes('personal') || text.includes('information') || text.includes('future') || text.includes('opportunities'))) {
        return 'Data Processing & Opportunities Consent';
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

    // In-Person / Location Custom Question Input
    if (inp.tagName === 'INPUT' && inp.type !== 'checkbox' && inp.type !== 'radio' && inp.type !== 'file') {
      const qContext = ((getLabelText(inp) || '') + ' ' + (inp.previousElementSibling?.textContent || '') + ' ' + (inp.parentElement?.textContent || '')).toLowerCase();
      if (qContext.includes('join us in person') || qContext.includes('in person in') || qContext.includes('work from office') || qContext.includes('able to join us')) {
        return 'In-Person / Office Availability';
      }
    }

    let raw = getLabelText(inp) || inp.placeholder || inp.name || inp.getAttribute('data-automation-id') || inp.id;
    if (!raw) return 'Application Field';

    // Strip bracket notation e.g. application[first_name] -> first_name, and nested application_form[application][first_name] -> first_name
    raw = raw.replace(/^(?:application_form|application|candidate|job_application|applicant)(?:\[[^\]]+\])*\[([^\]]+)\]$/i, '$1');
    // Strip prefixes like application_form_application_
    raw = raw.replace(/^(?:application_form_application_|application_|candidate_|job_application_|applicant_)/i, '');

    let cleaned = raw
      .replace(/[\*\:\?✱•★]/g, '')
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
      .replace(/^(?:town)$/i, 'City')
      .replace(/^(?:postcode|postalcode|post_code)$/i, 'Postal Code')
      .replace(/^(?:summary|personal_summary|professional_summary)$/i, 'Professional Summary')
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
      .replace(/single-line-text-form-component-formElement-urn-li-jobs-applyformcommon-easyApplyFormElement-[^\s]+-phoneNumber-country-code/gi, 'Phone Country Code')
      .replace(/single-line-text-form-component-formElement-urn-li-jobs-applyformcommon-easyApplyFormElement-[^\s]+-phoneNumber/gi, 'Mobile Phone Number')
      .replace(/single-line-text-form-component-formElement-urn-li-jobs-applyformcommon-easyApplyFormElement-[^\s]+-city/gi, 'City')
      .replace(/single-line-text-form-component-formElement-urn-li-jobs-applyformcommon-easyApplyFormElement-[^\s]+-emailAddress/gi, 'Email Address')
      .replace(/single-line-text-form-component-formElement-urn-li-jobs-applyformcommon-easyApplyFormElement-[^\s]+-firstName/gi, 'First Name')
      .replace(/single-line-text-form-component-formElement-urn-li-jobs-applyformcommon-easyApplyFormElement-[^\s]+-lastName/gi, 'Last Name')
      .replace(/phoneNumber-country-code|country-code|countrycode/gi, 'Phone Country Code')
      .replace(/phoneNumber|phonenumber/gi, 'Mobile Phone Number')
      .replace(/emailAddress|emailaddress/gi, 'Email Address')
      .replace(/_/g, ' ')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .trim();

    const expMatch = cleaned.match(/how many years of(?: work)? experience do you have with\s+([^?]+)/i);
    if (expMatch) {
      return `Years of Experience (${expMatch[1].trim()})`;
    }

    if (cleaned.length > 40) {
      return cleaned.slice(0, 40).trim();
    }

    // Capitalize words nicely
    return cleaned.replace(/\b\w/g, c => c.toUpperCase());
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

  function getElementFieldConstraints(el) {
    const res = { maxLength: null, minWords: null, minChars: null };
    if (!el) return res;

    // 1. Max Length from attributes
    const attrMax = el.getAttribute('maxlength') || el.getAttribute('data-max-length') || el.getAttribute('data-limit') || el.getAttribute('max-length');
    if (attrMax) {
      const parsed = parseInt(attrMax, 10);
      if (!isNaN(parsed) && parsed > 0 && parsed < 50000) res.maxLength = parsed;
    }
    if (!res.maxLength && el.maxLength && typeof el.maxLength === 'number' && el.maxLength > 0 && el.maxLength < 50000) {
      res.maxLength = el.maxLength;
    }

    // 2. Min Length / Words from attributes
    const attrMin = el.getAttribute('minlength') || el.getAttribute('data-min-length') || el.getAttribute('data-min-words');
    if (attrMin) {
      const parsed = parseInt(attrMin, 10);
      if (!isNaN(parsed) && parsed > 0 && parsed < 5000) {
        if (el.getAttribute('data-min-words') || attrMin.toLowerCase().includes('word')) {
          res.minWords = parsed;
        } else {
          res.minChars = parsed;
        }
      }
    }

    // 3. Scan container & surrounding label text for limits
    try {
      const container = el.closest('.Qr7Oae, [role="listitem"], .form-group, .field, [class*="question" i], [class*="form-item" i], [class*="card" i], [class*="row" i], fieldset, form') || el.parentElement?.parentElement || el.parentElement;
      if (container) {
        const text = container.textContent || '';

        // Max limit pattern in text
        if (!res.maxLength) {
          const matchMax = text.match(/(?:max|maximum|limit(?:\s+of)?)\s*[:]?\s*(\d{2,4})\s*(?:char|character|word)/i);
          if (matchMax && matchMax[1]) {
            const num = parseInt(matchMax[1], 10);
            if (!isNaN(num) && num > 20 && num < 5000) {
              res.maxLength = text.toLowerCase().includes('word') ? num * 6 : num;
            }
          }
        }

        // Min word/char patterns in text
        // E.g. "43 / 50 words minimum", "50 words minimum", "at least 50 words", "must be at least 50 words", "minimum of 50 words"
        const minPatterns = [
          /\b(\d{1,4})\s*\/\s*(\d{1,4})\s*(?:words?|chars?|characters?)\s*minimum/i,
          /\b(\d{2,4})\s*(?:words?|chars?|characters?)\s*minimum/i,
          /minimum\s*(?:of\s*)?(\d{2,4})\s*(?:words?|chars?|characters?)/i,
          /(?:at\s*least|min)\s*(\d{2,4})\s*(?:words?|chars?|characters?)/i,
          /must\s*be\s*at\s*least\s*(\d{2,4})\s*(?:words?|chars?|characters?)/i
        ];

        for (const pattern of minPatterns) {
          const m = text.match(pattern);
          if (m) {
            const valStr = m[2] || m[1];
            const val = parseInt(valStr, 10);
            if (!isNaN(val) && val >= 5 && val < 2000) {
              const isWord = m[0].toLowerCase().includes('word');
              if (isWord) {
                res.minWords = Math.max(res.minWords || 0, val);
              } else {
                res.minChars = Math.max(res.minChars || 0, val);
              }
              break;
            }
          }
        }
      }
    } catch (_) { }

    return res;
  }

  function getElementMaxLength(el) {
    return getElementFieldConstraints(el).maxLength;
  }



  // Export to window and window.AiCopilot
  window.getActiveApplicationModal = getActiveApplicationModal;
  window.isExtensionValid = isExtensionValid;
  window.safeMsg = safeMsg;
  window.isGoogleForm = isGoogleForm;
  window.getNextMondayDateObj = getNextMondayDateObj;
  window.getNextMonday = getNextMonday;
  window.getFormattedNextMonday = getFormattedNextMonday;
  window.isJobPortal = isJobPortal;
  window.setNativeValue = setNativeValue;
  window.formatPhoneForWorkday = formatPhoneForWorkday;
  window.showToast = showToast;
  window.extractJobDetails = extractJobDetails;
  window.matches = matches;
  window.matchesExactWord = matchesExactWord;
  window.getRadioQuestionContainer = getRadioQuestionContainer;
  window.getLabelText = getLabelText;
  window.isElementVisible = isElementVisible;
  window.setNativeChar = setNativeChar;
  window.detectPageErrors = detectPageErrors;
  window.getCleanFieldLabel = getCleanFieldLabel;
  window.escapeHtml = escapeHtml;
  window.getElementFieldConstraints = getElementFieldConstraints;
  window.getElementMaxLength = getElementMaxLength;
  window.sleep = sleep;

  window.AiCopilot = window.AiCopilot || {};
  Object.assign(window.AiCopilot, {
    getActiveApplicationModal,
    isExtensionValid,
    safeMsg,
    isGoogleForm,
    getNextMondayDateObj,
    getNextMonday,
    getFormattedNextMonday,
    isJobPortal,
    setNativeValue,
    formatPhoneForWorkday,
    showToast,
    extractJobDetails,
    matches,
    matchesExactWord,
    getRadioQuestionContainer,
    getLabelText,
    isElementVisible,
    setNativeChar,
    detectPageErrors,
    getCleanFieldLabel,
    escapeHtml,
    getElementFieldConstraints,
    getElementMaxLength,
    sleep
  });
})();
