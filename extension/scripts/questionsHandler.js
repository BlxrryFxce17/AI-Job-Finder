// In-Sidebar Screening Questions & Floating AI Field Buttons
// Part of AI Job Copilot Chrome Extension

(() => {
  'use strict';

  const sleep = window.sleep || ((ms) => new Promise(resolve => setTimeout(resolve, ms)));


  // 14. In-Sidebar Screening Questions UI (Integrated in Autofill Tab)
  function refreshQuestionsUI() {
    const list = document.getElementById('ai-qa-list');
    const badge = document.getElementById('ai-qa-count-badge');
    const fillAllBtn = document.getElementById('ai-btn-gen-all-qa');
    if (!list) return;

    const detectedQuestions = [];

    // 1. Google Forms: scan structured .Qr7Oae cards
    if (isGoogleForm()) {
      const gfBlocks = window.querySelectorAllDeep('.Qr7Oae, [role="listitem"]');
      gfBlocks.forEach((block, idx) => {
        if (block.closest('#ai-copilot-sidebar')) return;
        const heading = block.querySelector('.M7eMe, [role="heading"], .freebirdFormviewerComponentsQuestionBaseTitle');
        let rawTitle = heading?.textContent?.replace(/[\*\:\?]/g, '')?.replace(/\(required[^\)]*\)/gi, '')?.trim() || '';
        if (!rawTitle) return;

        // Check if there is subtitle / instructions
        const subtext = block.querySelector('.jfdAEb, .gH2Standard, .OabDMe, .freebirdFormviewerComponentsQuestionBaseHelpText')?.textContent?.trim() || '';
        const fullPrompt = subtext ? `${rawTitle} (${subtext})` : rawTitle;

        // Find textarea or input inside this card
        const textarea = block.querySelector('textarea.KHxj8b, textarea');
        const textInput = block.querySelector('input.whsOnd, input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"])');

        const isCoreIdentity = ['first name', 'last name', 'full name', 'email', 'phone', 'mobile', 'linkedin', 'github', 'portfolio', 'resume', 'cv', 'website'].some(k => rawTitle.toLowerCase() === k || rawTitle.toLowerCase().startsWith(k));

        if (textarea) {
          detectedQuestions.push({
            element: textarea,
            title: fullPrompt,
            shortTitle: rawTitle,
            type: 'textarea',
            block
          });
        } else if (textInput && !isCoreIdentity) {
          const isOpenEnded = ['why', 'describe', 'explain', 'tell us', 'what makes', 'reason', 'challenge', 'project', 'approach', 'achievement', 'experience', 'background', 'pitch', 'summary', 'introduce', 'how would', 'how did', 'how do', 'share', 'overview', 'interests', 'goals'].some(k => rawTitle.toLowerCase().includes(k));
          if (isOpenEnded) {
            detectedQuestions.push({
              element: textInput,
              title: fullPrompt,
              shortTitle: rawTitle,
              type: 'input',
              block
            });
          }
        }
      });
    }

    // 2. General ATS & Web Applications: scan textareas and open-ended text inputs
    if (detectedQuestions.length === 0) {
      const textareas = window.querySelectorAllDeep('textarea')
        .filter(ta => !ta.closest('#ai-copilot-sidebar') && !ta.closest('#ai-copilot-dock-tab') && isElementVisible(ta));

      textareas.forEach((ta, idx) => {
        const title = (getLabelText(ta) || ta.getAttribute('aria-label') || ta.placeholder || `Application Question #${idx + 1}`).trim();
        detectedQuestions.push({
          element: ta,
          title,
          shortTitle: title,
          type: 'textarea'
        });
      });

      // Also scan open-ended inputs that are not already captured
      const inputs = window.querySelectorAllDeep('input[type="text"], input:not([type])')
        .filter(inp => !inp.closest('#ai-copilot-sidebar') && !inp.closest('#ai-copilot-dock-tab') && isElementVisible(inp));

      inputs.forEach(inp => {
        const label = (getLabelText(inp) || inp.getAttribute('aria-label') || inp.placeholder || '').toLowerCase();
        const isOpenEnded = ['why', 'describe', 'explain', 'tell us', 'challenge', 'project', 'approach', 'achievement', 'experience', 'background', 'pitch', 'summary', 'introduce', 'how would', 'share'].some(k => label.includes(k));
        const isCore = ['name', 'email', 'phone', 'url', 'linkedin', 'github', 'portfolio', 'salary', 'date', 'zip', 'city'].some(k => label === k || label.startsWith(k));
        if (isOpenEnded && !isCore && !detectedQuestions.some(d => d.element === inp)) {
          const title = (getLabelText(inp) || inp.getAttribute('aria-label') || inp.placeholder || 'Screening Question').trim();
          detectedQuestions.push({
            element: inp,
            title,
            shortTitle: title,
            type: 'input'
          });
        }
      });
    }

    // Update count badge & fill all button
    if (badge) {
      badge.textContent = `${detectedQuestions.length} Question${detectedQuestions.length === 1 ? '' : 's'}`;
    }
    if (fillAllBtn) {
      fillAllBtn.style.display = detectedQuestions.length >= 2 ? 'inline-block' : 'none';
    }

    if (detectedQuestions.length === 0) {
      list.innerHTML = `
        <div class="ai-empty-state" style="text-align: center; padding: 14px 8px; color: #64748b; font-size: 11px;">
          <div style="font-size: 18px; margin-bottom: 4px;">✓</div>
          <div>No open-ended screening questions detected on this page.</div>
        </div>
      `;
      return;
    }

    list.innerHTML = '';
    detectedQuestions.forEach((item, idx) => {
      const constraints = getElementFieldConstraints(item.element);
      const currentVal = (item.element.value || '').trim();
      const isAnswered = currentVal.length > 0;

      let constraintsLabel = '';
      if (constraints.minWords) constraintsLabel += ` <span style="color:#d97706;font-size:9.5px;font-weight:600;">(Min ${constraints.minWords} words)</span>`;
      if (constraints.maxLength) constraintsLabel += ` <span style="color:#64748b;font-size:9.5px;">(Max ${constraints.maxLength} chars)</span>`;

      const card = document.createElement('div');
      card.className = 'ai-qa-card';
      card.style.cssText = 'background: rgba(15, 23, 42, 0.65); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 8px; padding: 10px 12px; margin-bottom: 8px;';

      card.innerHTML = `
        <div class="ai-qa-question-header" style="display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; cursor: pointer; margin-bottom: 6px;" title="Click to scroll to and highlight this field">
          <div class="ai-qa-question-title" style="font-size: 11.5px; font-weight: 600; color: #f8fafc; line-height: 1.4; flex: 1 1 auto;">
            <span style="color: #38bdf8; font-weight: 700; margin-right: 4px;">Q${idx + 1}.</span>
            <span>${escapeHtml(item.title)}</span>
            ${constraintsLabel}
          </div>
          <span class="ai-qa-status-pill ${isAnswered ? 'filled' : 'empty'}" style="font-size: 9.5px; font-weight: 600; padding: 2px 6px; border-radius: 4px; white-space: nowrap; flex-shrink: 0; ${isAnswered ? 'background: rgba(16, 185, 129, 0.15); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.3);' : 'background: rgba(245, 158, 11, 0.15); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.3);'}">
            ${isAnswered ? '✓ Answered' : 'Pending'}
          </span>
        </div>
        <div class="ai-qa-actions" style="margin-top: 6px;">
          <button type="button" class="ai-sb-btn ai-qa-gen-btn" data-idx="${idx}" style="height: 28px; width: 100%; box-sizing: border-box; background: rgba(56, 189, 248, 0.12); border: 1px solid rgba(56, 189, 248, 0.3); color: #38bdf8; border-radius: 6px; padding: 0 10px; font-size: 11px; font-weight: 600; display: inline-flex; align-items: center; justify-content: center; gap: 5px; cursor: pointer;">
            <span>✨</span>
            <span>${isAnswered ? 'Regenerate & Refill Answer' : 'Generate & Fill Answer'}</span>
          </button>
        </div>
      `;

      list.appendChild(card);

      // Click question header to scroll to and focus field
      card.querySelector('.ai-qa-question-header')?.addEventListener('click', () => {
        const scrollTarget = item.block || item.element;
        if (scrollTarget && typeof scrollTarget.scrollIntoView === 'function') {
          scrollTarget.scrollIntoView({ behavior: 'smooth', block: 'center' });
          scrollTarget.classList.add('ai-field-typing-focus');
          try { item.element.focus?.(); } catch (_) { }
          setTimeout(() => {
            try { scrollTarget.classList.remove('ai-field-typing-focus'); } catch (_) { }
          }, 1800);
        }
      });

      // Click button to generate answer
      const btn = card.querySelector('.ai-qa-gen-btn');
      btn?.addEventListener('click', async (e) => {
        e.stopPropagation();
        await generateAndFillQuestion(item, btn, constraints);
      });
    });

    // Wire up "⚡ Fill All" button
    if (fillAllBtn) {
      fillAllBtn.onclick = async () => {
        fillAllBtn.disabled = true;
        fillAllBtn.textContent = '⏳ Filling...';
        showToast('⚡ Generating answers for all screening questions...', 'info', 2500);

        for (let i = 0; i < detectedQuestions.length; i++) {
          const item = detectedQuestions[i];
          const btn = list.querySelectorAll('.ai-qa-gen-btn')[i];
          const constraints = getElementFieldConstraints(item.element);
          await generateAndFillQuestion(item, btn, constraints);
          await sleep(350);
        }

        fillAllBtn.disabled = false;
        fillAllBtn.textContent = '⚡ Fill All';
        showToast('✓ All screening questions filled successfully!', 'success');
      };
    }
  }

  async function generateAndFillQuestion(item, btn, constraints) {
    if (!btn || !item?.element) return;
    btn.disabled = true;
    btn.innerHTML = '<span>⏳</span><span>Drafting answer...</span>';

    try {
      const jobInfo = extractJobDetails();
      const res = await safeMsg({
        action: 'GENERATE_ANSWER',
        payload: {
          question: item.title,
          company: jobInfo.company,
          role: jobInfo.role,
          location: jobInfo.location,
          jobDescription: jobInfo.description,
          maxLength: constraints.maxLength,
          minWords: constraints.minWords,
          minChars: constraints.minChars
        }
      });

      if (res?.success && res.answer) {
        setNativeValue(item.element, res.answer);
        item.element.dispatchEvent(new Event('input', { bubbles: true }));
        item.element.dispatchEvent(new Event('change', { bubbles: true }));
        item.element.dispatchEvent(new Event('blur', { bubbles: true }));

        btn.innerHTML = '<span>✓</span><span>Filled!</span>';
        showToast('✓ Screening answer inserted!', 'success');
        setTimeout(() => {
          btn.disabled = false;
          btn.innerHTML = '<span>✨</span><span>Regenerate Answer</span>';
          refreshQuestionsUI();
          refreshAuditList(true);
        }, 1200);
      } else {
        showToast(res?.error || 'Failed to generate answer', 'error');
        btn.disabled = false;
        btn.innerHTML = '<span>✨</span><span>Generate & Fill Answer</span>';
      }
    } catch (err) {
      showToast('Error generating answer: ' + err.message, 'error');
      btn.disabled = false;
      btn.innerHTML = '<span>✨</span><span>Generate & Fill Answer</span>';
    }
  }

  // 15. In-Field AI Answer Buttons
  function injectAiFieldButtons() {
    const activeModal = typeof getActiveApplicationModal === 'function' ? getActiveApplicationModal() : null;
    const scope = activeModal || document;
    const candidates = window.querySelectorAllDeep('textarea, input.whsOnd', scope)
      .filter(el => {
        if (el.closest('#ai-copilot-sidebar') || el.closest('#ai-copilot-dock-tab')) return false;
        if (el.dataset.aiCopilotInjected) return false;
        const q = (getLabelText(el) || el.getAttribute('aria-label') || el.placeholder || '').toLowerCase();

        // Exclude all URL, link, repo, resume, and profile fields from AI essay buttons
        const isUrlOrLink = ['link', 'url', 'repository', 'repo', 'github', 'linkedin', 'portfolio', 'cv', 'resume', 'résumé', 'website', 'drive', 'http'].some(k => q.includes(k));
        if (isUrlOrLink) return false;

        if (el.tagName === 'INPUT') {
          const isOpen = ['describe', 'explain', 'tell us', 'why', 'summary', 'bug', 'challenge', 'trace', 'schema', 'webhook'].some(k => q.includes(k));
          if (!isOpen) return false;
        }
        return true;
      });

    candidates.forEach(ta => {
      ta.dataset.aiCopilotInjected = 'true';

      const isPitchField = ta.tagName === 'TEXTAREA' && (
        (ta.placeholder || '').toLowerCase().includes('hi! my name is') ||
        (getLabelText(ta) || '').toLowerCase().includes('reach out') ||
        (getLabelText(ta) || '').toLowerCase().includes('founder')
      );

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ai-copilot-field-btn';
      btn.innerHTML = isPitchField ? '<span>✨</span><span>AI Draft Pitch</span>' : '<span>✨</span><span>AI Answer</span>';
      btn.title = 'Generate a tailored answer using your resume & GitHub projects';

      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();

        btn.disabled = true;
        btn.innerHTML = '<span>⏳</span><span>Drafting...</span>';

        const jobInfo = extractJobDetails();
        let questionText = getLabelText(ta);
        if (!questionText) {
          const card = ta.closest('.Qr7Oae, [role="listitem"], fieldset, [class*="card" i], [class*="group" i], [class*="question" i]') || ta.parentElement?.parentElement;
          if (card) {
            const lines = (card.innerText || '').split('\n').map(l => l.trim()).filter(Boolean);
            const qLine = lines.find(l => (l.includes('?') || /^(what|which|describe|explain|how|why|do you|tell us)\b/i.test(l)) && !l.toLowerCase().includes('words minimum'));
            if (qLine) questionText = qLine;
          }
        }
        questionText = (questionText || ta.getAttribute('aria-label') || ta.placeholder || ta.title || 'Screening Question').replace(/\s*\*+\s*$/, '').trim();
        const constraints = getElementFieldConstraints(ta);

        console.log('[AI Copilot] Generating answer for:', questionText, constraints);

        try {
          const res = await safeMsg({
            action: 'GENERATE_ANSWER',
            payload: {
              question: questionText,
              company: jobInfo.company,
              role: jobInfo.role,
              location: jobInfo.location,
              jobDescription: jobInfo.description,
              maxLength: constraints.maxLength,
              minWords: constraints.minWords,
              minChars: constraints.minChars
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

      if (isGoogleForm()) {
        const qBlock = ta.closest('.Qr7Oae, [role="listitem"]');
        const header = qBlock?.querySelector('.M4DNQ');
        if (header && !header.querySelector('.ai-copilot-field-btn')) {
          btn.style.marginLeft = 'auto';
          btn.style.display = 'inline-flex';
          btn.style.marginTop = '4px';
          header.appendChild(btn);
        } else if (ta.parentNode) {
          ta.parentNode.insertBefore(btn, ta);
        }
      } else if (ta.parentNode) {
        ta.parentNode.insertBefore(btn, ta);
      }
    });
  }


  // Export to window and window.AiCopilot
  window.refreshQuestionsUI = refreshQuestionsUI;
  window.generateAndFillQuestion = generateAndFillQuestion;
  window.injectAiFieldButtons = injectAiFieldButtons;

  window.AiCopilot = window.AiCopilot || {};
  Object.assign(window.AiCopilot, {
    refreshQuestionsUI,
    generateAndFillQuestion,
    injectAiFieldButtons
  });
})();
