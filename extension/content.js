// Content Script Bootstrap & Event Coordinator for AI Job Copilot
// Coordinates: domUtils.js, coverLetterTemplate.js, formAutofill.js, questionsHandler.js, atsOutreach.js, sidebarUi.js

(() => {
  if (window.__aiJobCopilotLoaded) return;
  window.__aiJobCopilotLoaded = true;

  console.log('[AI Job Copilot] Modular content script active on:', window.location.href);

  // ── 1. Chrome Runtime Message Listener ──────────────────────────────────────
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'DO_AUTOFILL') {
      if (typeof autofillForm === 'function') {
        autofillForm().then(res => sendResponse(res));
      } else {
        sendResponse({ success: false, message: 'Autofill module loading' });
      }
      return true;
    }
    if (request.action === 'OPEN_SIDEBAR') {
      window.__ai_copilot_force_enabled = true;
      if (typeof injectSidebar === 'function') injectSidebar();
      if (typeof openSidebar === 'function') openSidebar(request.tab || 'autofill');
      sendResponse({ success: true });
      return true;
    }
    if (request.action === 'EXTRACT_JOB_INFO') {
      if (typeof extractJobDetails === 'function') {
        sendResponse(extractJobDetails());
      } else {
        sendResponse({ company: '', role: '', description: '' });
      }
      return true;
    }
  });

  // ── 2. High-Performance Debounced Audit Scheduler ───────────────────────────
  let auditDebounceTimer = null;
  function scheduleAudit(delay = 250, force = false) {
    if (typeof isExtensionValid === 'function' && !isExtensionValid()) return;
    if (typeof isJobPortal === 'function' && !isJobPortal()) return;
    if (window.isAutofilling) return;

    clearTimeout(auditDebounceTimer);
    auditDebounceTimer = setTimeout(() => {
      try {
        if (typeof isExtensionValid === 'function' && !isExtensionValid()) return;
        if (!window.isAutofilling && (typeof isJobPortal === 'function' && isJobPortal())) {
          if (typeof refreshAuditList === 'function') refreshAuditList(force);
          if (typeof checkAndDisplayErrors === 'function') checkAndDisplayErrors(force);
        }
      } catch (err) {
        console.warn('[Copilot Audit Timer Notice]', err);
      }
    }, delay);
  }

  // ── 3. Initialization Lifecycle ─────────────────────────────────────────────
  function initCopilot() {
    if (typeof isExtensionValid === 'function' && !isExtensionValid()) return;
    if (typeof isJobPortal === 'function' && !isJobPortal()) return;

    if (typeof injectSidebar === 'function') injectSidebar();
    if (typeof injectAiFieldButtons === 'function') injectAiFieldButtons();
    scheduleAudit(50, true);
    setTimeout(() => scheduleAudit(600, true), 600);
    setTimeout(() => scheduleAudit(1500, true), 1500);
    setTimeout(() => scheduleAudit(3000, true), 3000);
  }

  // Run initial bootstrap
  initCopilot();
  if (typeof initBrainListener === 'function') initBrainListener();

  // ── 4. Live Form Input, Change, Focus, Click & Scroll Listeners ─────────────
  document.addEventListener('input', (e) => {
    if (window.isAutofilling) return;
    const target = e.target;
    if (!target || target.closest('#ai-copilot-sidebar') || target.closest('#ai-copilot-dock-tab')) return;
    scheduleAudit(200);
  }, { passive: true });

  document.addEventListener('change', (e) => {
    if (window.isAutofilling) return;
    const target = e.target;
    if (!target || target.closest('#ai-copilot-sidebar') || target.closest('#ai-copilot-dock-tab')) return;
    scheduleAudit(50, true);
  }, { passive: true });

  document.addEventListener('focusin', (e) => {
    if (window.isAutofilling) return;
    const target = e.target;
    if (!target || target.closest('#ai-copilot-sidebar') || target.closest('#ai-copilot-dock-tab')) return;
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) {
      scheduleAudit(150, true);
    }
  }, { passive: true });

  document.addEventListener('click', (e) => {
    if (window.isAutofilling) return;
    const target = e.target;
    if (!target || target.closest('#ai-copilot-sidebar') || target.closest('#ai-copilot-dock-tab')) return;
    const isInteractive = target.closest('button, a, [role="button"], [role="tab"], input, select, textarea, summary');
    if (isInteractive) {
      scheduleAudit(200, true);
    }
  }, { passive: true });

  let scrollAuditTimer = null;
  window.addEventListener('scroll', () => {
    if (window.isAutofilling) return;
    clearTimeout(scrollAuditTimer);
    scrollAuditTimer = setTimeout(() => {
      scheduleAudit(100);
    }, 250);
  }, { passive: true });

  // ── 5. MutationObserver for Dynamic ATS Steps & SPAs ─────────────────────────
  const observer = new MutationObserver((mutations) => {
    if (typeof isExtensionValid === 'function' && !isExtensionValid()) {
      try { observer.disconnect(); } catch (_) { }
      return;
    }

    // If sidebar hasn't been injected yet (e.g. single-page app dynamically rendered content)
    if (!document.getElementById('ai-copilot-sidebar')) {
      if (typeof isJobPortal === 'function' && isJobPortal()) {
        initCopilot();
      }
      return;
    }

    if ((typeof isJobPortal === 'function' && !isJobPortal()) || window.isAutofilling) return;

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
      if (typeof isExtensionValid === 'function' && !isExtensionValid()) return;
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
    if (typeof isExtensionValid === 'function' && !isExtensionValid()) return;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => scheduleAudit(100), 100);
  }, { passive: true });

  // Periodic poll for late-loading dynamic SPAs
  let checks = 0;
  const pollTimer = setInterval(() => {
    if (typeof isExtensionValid === 'function' && !isExtensionValid()) {
      clearInterval(pollTimer);
      return;
    }
    if (!window.isAutofilling) {
      if (typeof isJobPortal === 'function' && isJobPortal()) {
        initCopilot();
      }
      scheduleAudit(50);
    }
    checks++;
    if (checks > 6) clearInterval(pollTimer);
  }, 1000);

  // ── 7. Gmail Compose Markdown Link Auto-Converter ──────────────────────────
  if (window.location.hostname === 'mail.google.com') {
    function formatGmailComposeMarkdownLinks() {
      const composeBoxes = document.querySelectorAll('div[aria-label*="Message Body"], div[role="textbox"][contenteditable="true"]');
      composeBoxes.forEach(box => {
        if (!box) return;
        const html = box.innerHTML;
        // Check if box contains markdown links e.g. [LinkedIn](url) | [GitHub](url) | [Portfolio](url)
        if (/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/i.test(html)) {
          const enhancedHtml = html.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/gi, (m, label, url) => {
            const cleanUrl = url.trim();
            const cleanLabel = label.trim();
            return `<a href="${cleanUrl}" target="_blank" style="color: #1155cc; text-decoration: underline; font-weight: 500;">${cleanLabel}</a>`;
          });
          box.innerHTML = enhancedHtml;
          box.dispatchEvent(new Event('input', { bubbles: true }));
        }
      });
    }

    const gmailObserver = new MutationObserver(() => formatGmailComposeMarkdownLinks());
    gmailObserver.observe(document.body || document.documentElement, { childList: true, subtree: true });
    setInterval(formatGmailComposeMarkdownLinks, 1000);
  }

  window.scheduleAudit = scheduleAudit;
  window.AiCopilot = window.AiCopilot || {};
  window.AiCopilot.scheduleAudit = scheduleAudit;
})();
