// Intelligent Sequential Form Autofill & Brain Learner Engine
// Part of AI Job Copilot Chrome Extension

(() => {
  'use strict';

  const sleep = window.sleep || ((ms) => new Promise(resolve => setTimeout(resolve, ms)));

  const isElementVisible = (el) => {
    if (typeof window.isElementVisible === 'function') return window.isElementVisible(el);
    if (!el) return false;
    if (el.closest('[style*="display: none"], [style*="display:none"], [hidden]')) return false;
    const style = window.getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
  };


  function getPriorityRepoUrl(p, contextText = '') {
    if (!p) return '';

    // 1. User explicitly entered a Featured Project / Repo URL in the sidebar profile tab
    if (p.projectUrl && p.projectUrl.includes('/')) {
      let u = p.projectUrl.trim();
      if (!u.startsWith('http')) u = 'https://' + u;
      return u;
    }

    // 2. Check priority repos selected in the web app Profile tab (selectedRepoNames)
    const priorityNames = Array.isArray(p.selectedRepoNames) ? p.selectedRepoNames : [];
    const allRepos = Array.isArray(p.repos) ? p.repos : (p.githubInsights?.repos || []);
    const ghBase = (p.github || '').replace(/\/$/, '');

    const priorityObjects = priorityNames.map(name => {
      const found = allRepos.find(r => (r.name || '').toLowerCase() === name.toLowerCase());
      if (found) return found;
      return ghBase ? { name, url: `${ghBase}/${name}` } : null;
    }).filter(Boolean);

    if (priorityObjects.length > 0) {
      const lowerCtx = (contextText || '').toLowerCase();
      if (lowerCtx) {
        const match = priorityObjects.find(r => {
          const n = (r.name || '').toLowerCase();
          const d = (r.description || '').toLowerCase();
          return lowerCtx.includes(n) || (d && lowerCtx.includes(d.slice(0, 20)));
        });
        if (match) {
          let u = match.url || (ghBase ? `${ghBase}/${match.name}` : '');
          if (u && !u.startsWith('http')) u = 'https://' + u;
          return u;
        }
      }
      let topPriority = priorityObjects[0];
      let u = topPriority.url || (ghBase ? `${ghBase}/${topPriority.name}` : '');
      if (u && !u.startsWith('http')) u = 'https://' + u;
      return u;
    }

    // 3. Fallback to first repo from allRepos
    if (allRepos.length > 0) {
      const candidate = allRepos[0];
      let u = candidate.url || (ghBase ? `${ghBase}/${candidate.name}` : '');
      if (u && !u.startsWith('http')) u = 'https://' + u;
      return u;
    }

    return ghBase || p.portfolio || '';
  }

  // Generate a strong ATS-compatible password if none saved
  // Requirements: uppercase, lowercase, number, special char, 8+ chars
  function generateStrongPassword() {
    const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const lower = 'abcdefghjkmnpqrstuvwxyz';
    const nums = '23456789';
    const spec = '@#$!%^&*';
    const pick = (s) => s[Math.floor(Math.random() * s.length)];
    // Build: 2 upper, 3 lower, 2 num, 1 special → shuffle
    const chars = [
      pick(upper), pick(upper),
      pick(lower), pick(lower), pick(lower),
      pick(nums), pick(nums),
      pick(spec)
    ];
    // Fisher-Yates shuffle
    for (let i = chars.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [chars[i], chars[j]] = [chars[j], chars[i]];
    }
    return chars.join('');
  }

  // Fast, Reliable & Authentic Human-Like Field Setting (JobRight Style)
  async function typeTextHumanLike(element, text, speed = 10) {
    if (!element) return;
    const str = String(text ?? '');

    try {
      // 1. Scroll into view if needed (smooth & safe for modals)
      const activeModal = typeof getActiveApplicationModal === 'function' ? getActiveApplicationModal() : null;
      try {
        if (activeModal && activeModal.contains(element)) {
          element.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        } else {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      } catch (_) { }

      // 2. Add visual active typing highlight
      element.classList.add('ai-field-typing-focus');

      // 3. Focus & authentic user interactions
      element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      try { element.focus({ preventScroll: true }); } catch (_) { element.focus(); }
      element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
      element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      element.dispatchEvent(new Event('focus', { bubbles: true }));

      // 4. Native value setter (compatible with React, Vue, Angular, Workday)
      setNativeValue(element, str);

      // 5. Authentic synthetic events
      element.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
      element.dispatchEvent(new Event('change', { bubbles: true, composed: true }));

      // Crisp pacing delay between fields (JobRight style)
      await sleep(25);

      // 6. LinkedIn & ATS Typeahead / Autocomplete Commit (City, Location, Company fields)
      if (element.classList.contains('artdeco-typeahead__input') || element.closest('.artdeco-typeahead, .jobs-easy-apply-modal')) {
        await sleep(60);
        const suggestion = document.querySelector('.artdeco-typeahead__results-list li, .artdeco-typeahead__result, [role="option"], .jobs-easy-apply-modal .artdeco-typeahead__results-list [role="option"]');
        if (suggestion) {
          suggestion.click();
        } else {
          element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
          element.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
        }
      }
    } catch (err) {
      console.warn('[Copilot Typing Notice]', err);
    } finally {
      // 7. Ensure final value is committed & blur dispatched
      try {
        setNativeValue(element, str);
        element.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
        element.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
        element.dispatchEvent(new Event('blur', { bubbles: true, composed: true }));
      } catch (_) { }

      element.classList.remove('ai-field-typing-focus');
      element.classList.add('ai-field-filled-success');
      setTimeout(() => element.classList.remove('ai-field-filled-success'), 600);
    }
  }

  // Helper: check if a select option is a dummy/placeholder (e.g. "No Selection", "Select...", "--", "-1")
  function isPlaceholderOption(opt) {
    if (!opt) return true;
    const txt = (opt.textContent || '').trim().toLowerCase();
    const val = (opt.value || '').trim().toLowerCase();
    if (!val || val === '-1' || val === '0' || val === 'none' || val === 'null' || val === 'select' || val === 'no_selection' || val === 'noselection') return true;
    if (!txt) return true;
    if (
      txt === 'no selection' ||
      txt === 'none' ||
      txt === '--' ||
      txt === '---' ||
      txt.startsWith('no selection') ||
      txt.startsWith('select') ||
      txt.startsWith('choose') ||
      txt.startsWith('please select') ||
      txt === 'select one' ||
      txt === 'select an option' ||
      txt === 'not specified' ||
      txt === 'n/a'
    ) return true;
    return false;
  }

  // Set native value on select element and trigger framework events (React, Angular, SAP UI5, jQuery)
  function setSelectValueNative(selectElem, option) {
    if (!selectElem || !option) return;

    // 1. Update option DOM attributes
    Array.from(selectElem.options || []).forEach(opt => {
      opt.selected = (opt === option);
      if (opt !== option) opt.removeAttribute('selected');
    });
    option.setAttribute('selected', 'selected');
    option.selected = true;

    // 2. Use HTMLSelectElement prototype setters
    try {
      const prototypeValueSetter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')?.set;
      if (prototypeValueSetter) {
        prototypeValueSetter.call(selectElem, option.value);
      } else {
        selectElem.value = option.value;
      }
    } catch (_) {
      selectElem.value = option.value;
    }

    try {
      const prototypeIndexSetter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'selectedIndex')?.set;
      const idx = Array.from(selectElem.options).indexOf(option);
      if (prototypeIndexSetter && idx >= 0) {
        prototypeIndexSetter.call(selectElem, idx);
      } else if (idx >= 0) {
        selectElem.selectedIndex = idx;
      }
    } catch (_) { }

    // 3. Dispatch standard input & change events
    selectElem.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    selectElem.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
    selectElem.dispatchEvent(new UIEvent('change', { bubbles: true, cancelable: true }));

    // 4. Trigger onchange if present
    try {
      if (typeof selectElem.onchange === 'function') selectElem.onchange();
    } catch (_) { }

    // 5. Trigger jQuery change if jQuery is loaded on page
    try {
      if (window.jQuery) {
        window.jQuery(selectElem).trigger('change');
      }
    } catch (_) { }

    // 6. Update UI wrapper display labels if present (SAP UI5, jQuery UI selectmenu)
    try {
      const container = selectElem.closest('.sapMSelect, .ui-selectmenu-button, .form-group, .select-wrapper, div');
      if (container) {
        const displayLabel = container.querySelector('.sapMSltLabel, .ui-selectmenu-text, .select-value');
        if (displayLabel && displayLabel !== selectElem) {
          displayLabel.textContent = option.textContent.trim();
        }
      }
    } catch (_) { }
  }

  // Fast & Accurate Select Option Selection (JobRight Style)
  async function selectOptionHumanLike(selectElem, keywords) {
    if (!selectElem) return;
    try { selectElem.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (_) {}

    selectElem.classList.add('ai-field-typing-focus');
    selectElem.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    selectElem.focus();
    selectElem.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    const allOptions = Array.from(selectElem.options || []);
    // Exclude placeholder / dummy options from candidate matches
    const validOptions = allOptions.filter(opt => !isPlaceholderOption(opt));
    const searchOptions = validOptions.length > 0 ? validOptions : allOptions;

    let match = null;

    // Pass 1: Exact match on text or value
    for (const kw of keywords) {
      const k = kw.toLowerCase().trim();
      match = searchOptions.find(opt => {
        const txt = (opt.textContent || '').trim().toLowerCase();
        const val = (opt.value || '').trim().toLowerCase();
        return txt === k || val === k;
      });
      if (match) break;
    }

    // Pass 2: Whole word boundary match (e.g. "no", "yes", "english (us)")
    if (!match) {
      for (const kw of keywords) {
        const k = kw.toLowerCase().trim();
        const regex = new RegExp(`(^|\\b|\\()${k.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}(\\b|\\)|$)`, 'i');
        match = searchOptions.find(opt => {
          const txt = (opt.textContent || '').trim().toLowerCase();
          const val = (opt.value || '').trim().toLowerCase();
          return regex.test(txt) || regex.test(val);
        });
        if (match) break;
      }
    }

    // Pass 3: Starts with match
    if (!match) {
      for (const kw of keywords) {
        const k = kw.toLowerCase().trim();
        match = searchOptions.find(opt => {
          const txt = (opt.textContent || '').trim().toLowerCase();
          const val = (opt.value || '').trim().toLowerCase();
          return txt.startsWith(k) || val.startsWith(k);
        });
        if (match) break;
      }
    }

    // Pass 4: Substring match (require kw to have length >= 3 to avoid false positives)
    if (!match) {
      for (const kw of keywords) {
        const k = kw.toLowerCase().trim();
        if (k.length < 3) continue;
        match = searchOptions.find(opt => {
          const txt = (opt.textContent || '').trim().toLowerCase();
          const val = (opt.value || '').trim().toLowerCase();
          return txt.includes(k) || val.includes(k);
        });
        if (match) break;
      }
    }

    // Fallback: If no match found and select is required or unselected, select first valid non-placeholder option
    if (!match && validOptions.length > 0 && (selectElem.required || isPlaceholderOption(allOptions[selectElem.selectedIndex]))) {
      match = validOptions[0];
    }

    if (match) {
      setSelectValueNative(selectElem, match);
    }
    selectElem.dispatchEvent(new Event('blur', { bubbles: true }));

    selectElem.classList.remove('ai-field-typing-focus');
    selectElem.classList.add('ai-field-filled-success');
    setTimeout(() => selectElem.classList.remove('ai-field-filled-success'), 600);
    await sleep(25);
  }

  // ── Smart Combobox / ARIA Listbox Option Selector ──────────────────────────────────────
  // For SAP SuccessFactors, Workday, Oracle HCM and other custom combobox widgets that render
  // an ARIA listbox dropdown instead of a native <select>. Reads all visible options, picks the
  // best keyword match, and commits the selection via click + keyboard events.
  async function selectComboboxOptionHumanLike(element, keywords) {
    if (!element) return false;

    // First, try to find an associated hidden <select> and use native select logic
    const hiddenSelect =
      element.closest('.sapMSelect, .ui-selectmenu, [class*="select" i]')?.querySelector('select') ||
      element.closest('label')?.querySelector('select') ||
      (element.id && document.querySelector(`select[aria-labelledby="${element.id}"]`)) ||
      element.parentElement?.querySelector('select');

    if (hiddenSelect && hiddenSelect.options && hiddenSelect.options.length > 1) {
      await selectOptionHumanLike(hiddenSelect, keywords);
      // Try to sync the display input
      const selectedOpt = hiddenSelect.options[hiddenSelect.selectedIndex];
      if (selectedOpt && !isPlaceholderOption(selectedOpt)) {
        try { setNativeValue(element, selectedOpt.textContent.trim()); } catch (_) { }
      }
      return true;
    }

    try {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      element.classList.add('ai-field-typing-focus');
      await sleep(80);

      // Open the dropdown
      element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      element.focus();
      element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      element.dispatchEvent(new Event('focus', { bubbles: true }));
      await sleep(300); // wait for listbox to appear in DOM

      // Find the popup listbox (tries multiple selector patterns)
      const listboxSelectors = [
        '[role="listbox"]',
        'ul.ui-autocomplete',
        '.sapMSelectList',
        '.sapMComboBoxList',
        '.sapMComboBoxPicker',
        '.sapMSelectListItem',
        '[class*="select-list" i]',
        '[class*="dropdown-list" i]',
        '[class*="options-list" i]'
      ];

      let listbox = null;
      for (const sel of listboxSelectors) {
        const candidates = window.querySelectorAllDeep(sel).filter(el => isElementVisible(el));
        if (candidates.length > 0) { listbox = candidates[candidates.length - 1]; break; }
      }

      if (listbox) {
        // Gather all option elements from the listbox
        const optionEls = Array.from(listbox.querySelectorAll(
          '[role="option"], li, .sapMSelectListItem, .sapMLIText, .sapMComboBoxListItem'
        )).filter(el => isElementVisible(el) && el.textContent.trim().length > 0);

        let matchEl = null;
        // Pass 1: exact text match
        for (const kw of keywords) {
          const k = kw.toLowerCase().trim();
          matchEl = optionEls.find(el => el.textContent.trim().toLowerCase() === k);
          if (matchEl) break;
        }
        // Pass 2: starts-with match
        if (!matchEl) {
          for (const kw of keywords) {
            const k = kw.toLowerCase().trim();
            matchEl = optionEls.find(el => el.textContent.trim().toLowerCase().startsWith(k));
            if (matchEl) break;
          }
        }
        // Pass 3: includes match (keyword length >= 3)
        if (!matchEl) {
          for (const kw of keywords) {
            const k = kw.toLowerCase().trim();
            if (k.length < 3) continue;
            matchEl = optionEls.find(el => el.textContent.trim().toLowerCase().includes(k));
            if (matchEl) break;
          }
        }

        if (matchEl) {
          matchEl.scrollIntoView({ block: 'nearest' });
          matchEl.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
          matchEl.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
          matchEl.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
          matchEl.click();
          await sleep(150);
          element.dispatchEvent(new Event('change', { bubbles: true }));
          element.dispatchEvent(new Event('blur', { bubbles: true }));
          element.classList.remove('ai-field-typing-focus');
          element.classList.add('ai-field-filled-success');
          setTimeout(() => element.classList.remove('ai-field-filled-success'), 1200);
          return true;
        }
      }

      // Fallback: type the first keyword and navigate with ArrowDown + Enter
      const fallbackText = keywords[0] || '';
      if (fallbackText) {
        setNativeValue(element, fallbackText);
        element.dispatchEvent(new Event('input', { bubbles: true }));
        await sleep(300);
        element.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', keyCode: 40, bubbles: true }));
        await sleep(100);
        element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
        await sleep(100);
        element.dispatchEvent(new Event('change', { bubbles: true }));
        element.dispatchEvent(new Event('blur', { bubbles: true }));
      }
    } catch (err) {
      console.warn('[Copilot Combobox Selector Notice]', err);
    } finally {
      element.classList.remove('ai-field-typing-focus');
      await sleep(80);
    }
    return false;
  }

  // ── Smart Datepicker / Calendar Selector ──────────────────────────────────────────────────
  // Handles both native <input type="date"> and SAP / custom calendar datepicker inputs.
  // For the latter, tries to open the calendar popup and click the correct day cell.
  async function selectDatepickerHumanLike(element, dateObj) {
    if (!element) return;
    const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
    const dd = String(dateObj.getDate()).padStart(2, '0');
    const yyyy = String(dateObj.getFullYear());

    try { element.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (_) {}
    element.classList.add('ai-field-typing-focus');
    await sleep(80);

    // Native date input
    if (element.type === 'date') {
      setNativeValue(element, `${yyyy}-${mm}-${dd}`);
      element.classList.remove('ai-field-typing-focus');
      element.classList.add('ai-field-filled-success');
      setTimeout(() => element.classList.remove('ai-field-filled-success'), 1200);
      return;
    }

    // Determine format from placeholder/hints
    const formattedDate = getFormattedNextMonday(element);

    // First, clear and type the formatted date
    element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    element.focus();
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await sleep(60);
    setNativeValue(element, formattedDate);
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    await sleep(150);

    // Try to find and click the calendar icon to open the date picker UI
    const container = element.closest(
      '[class*="date" i], [class*="picker" i], [data-automation-id*="date" i], ' +
      '.sapMDateTimeInput, .sapMInputBase, td, .form-group, div'
    );
    const calIconSelectors = [
      `[id="${element.id}-icon"]`,
      `[id^="${element.id}-"][id$="-icon"]`,
      'button[title*="Pick" i]', 'button[title*="Calendar" i]', 'button[title*="date" i]',
      '.sapUiCalIcon', '.sapMInputBaseIconContainer button', '[class*="calIcon" i]',
      '[class*="date-icon" i]', '[class*="calendar-icon" i]', '[class*="picker-icon" i]',
      'input + button', 'input ~ button', 'input + span button'
    ];

    let calIcon = null;
    for (const sel of calIconSelectors) {
      try {
        calIcon = container ? container.querySelector(sel) : null;
        if (!calIcon) calIcon = document.querySelector(sel);
        if (calIcon && isElementVisible(calIcon)) break;
        calIcon = null;
      } catch (_) { }
    }

    if (calIcon) {
      calIcon.click();
      await sleep(500);

      // Find the calendar popup
      const calPopup = document.querySelector(
        '.sapUiCalContent, .sapMCalContent, .sapMDatePickerPopup, [class*="calendar" i][role="dialog"], ' +
        '[class*="datepicker-popup" i], [class*="date-picker" i][role="dialog"]'
      );

      if (calPopup && isElementVisible(calPopup)) {
        // Find the day cell for our target date
        const targetDay = dateObj.getDate();
        const dayCells = Array.from(calPopup.querySelectorAll(
          '[class*="day" i]:not([class*="disabled" i]):not([class*="other" i]), ' +
          '[data-sap-day], td[class*="day" i], span[class*="day-number" i]'
        )).filter(el => isElementVisible(el));

        let dayCell = dayCells.find(el => {
          const t = (el.getAttribute('data-sap-day') || el.textContent || '').trim();
          // data-sap-day format: YYYYMMDD
          if (el.getAttribute('data-sap-day')) {
            const sapDay = el.getAttribute('data-sap-day');
            return sapDay.endsWith(`${yyyy}${mm}${dd}`.slice(-2)) && sapDay.includes(yyyy + mm);
          }
          return t === String(targetDay) || t === dd;
        });

        if (dayCell) {
          dayCell.scrollIntoView({ block: 'nearest' });
          dayCell.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
          dayCell.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
          dayCell.click();
          await sleep(200);
        } else {
          // Close the popup and keep the typed value
          document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
          await sleep(100);
        }
      }
    }

    element.dispatchEvent(new Event('blur', { bubbles: true }));
    element.classList.remove('ai-field-typing-focus');
    element.classList.add('ai-field-filled-success');
    setTimeout(() => element.classList.remove('ai-field-filled-success'), 1200);
  }

  // Human-like Autocomplete / Combobox (SuccessFactors, Workday, jQuery UI, SAP UI5)
  async function typeComboboxHumanLike(element, text) {
    if (!element) return;
    const str = String(text ?? '').trim();
    if (!str) return;

    try {
      try { element.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (_) {}
      await sleep(80);
      element.classList.add('ai-field-typing-focus');
      element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      element.focus();
      element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await sleep(60);

      setNativeChar(element, '');
      for (let i = 0; i < str.length; i++) {
        const char = str[i];
        const partial = str.slice(0, i + 1);
        element.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }));
        element.dispatchEvent(new KeyboardEvent('keypress', { key: char, bubbles: true }));
        setNativeChar(element, partial);
        element.dispatchEvent(new KeyboardEvent('keyup', { key: char, bubbles: true }));
        await sleep(25);
      }

      setNativeChar(element, str);
      element.value = str;
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));

      // Wait 300ms for autocomplete dropdown menu to populate in the DOM
      await sleep(300);

      // 1. Look for matching item in any floating dropdown / autocomplete list in the DOM
      const listItems = window.querySelectorAllDeep([
        'ul.ui-autocomplete:not([style*="display: none"]) li',
        '.ui-menu-item',
        '[role="listbox"] [role="option"]',
        '.sapMSelectListItem',
        '.sapMComboBoxListItem',
        '.dropdown-menu li',
        '.tt-suggestion',
        '[class*="autocomplete" i] li'
      ].join(', ')).filter(li => isElementVisible(li));

      let clicked = false;
      if (listItems.length > 0) {
        const matchLi = listItems.find(li => (li.textContent || '').toLowerCase().includes(str.toLowerCase())) || listItems[0];
        if (matchLi) {
          matchLi.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
          matchLi.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
          matchLi.click();
          clicked = true;
          await sleep(150);
        }
      }

      // 2. If no menu item was clicked, simulate keyboard navigation (ArrowDown + Enter)
      if (!clicked) {
        element.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40, which: 40, bubbles: true }));
        await sleep(80);
        element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
        element.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
        await sleep(100);
      }

      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
      element.dispatchEvent(new Event('blur', { bubbles: true }));
    } catch (err) {
      console.warn('[Copilot Combobox Notice]', err);
    } finally {
      element.classList.remove('ai-field-typing-focus');
      element.classList.add('ai-field-filled-success');
      setTimeout(() => element.classList.remove('ai-field-filled-success'), 1200);
      await sleep(100);
    }
  }

  // Fast & Authentic Radio Button Clicking (JobRight Style)
  async function clickRadioHumanLike(radio) {
    if (!radio) return;
    try {
      try { radio.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (_) {}
      radio.classList.add('ai-field-typing-focus');
      try { radio.focus(); } catch (_) { }

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
      setTimeout(() => radio.classList.remove('ai-field-filled-success'), 600);
      await sleep(20);
    }
  }

  // Fast & Authentic Checkbox Checking (JobRight Style)
  async function clickCheckboxHumanLike(checkbox) {
    if (!checkbox) return;
    try {
      try { checkbox.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (_) {}
      checkbox.classList.add('ai-field-typing-focus');
      try { checkbox.focus(); } catch (_) { }

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
      setTimeout(() => checkbox.classList.remove('ai-field-filled-success'), 600);
      await sleep(20);
    }
  }

  // Fast Checkbox Unchecking (For roles candidate no longer works in)
  async function uncheckCheckboxHumanLike(checkbox) {
    if (!checkbox) return;
    try {
      try { checkbox.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (_) {}
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
      await sleep(20);
    }
  }

  // Native File Attachment via DataTransfer / File API
  // documentType: 'resume' | 'cover_letter' | 'additional'
  async function attachDocumentFile(fileInput, base64Data, filename, documentType) {
    if (!fileInput || !base64Data) return false;
    try {
      // For hidden file inputs inside upload tile cards, use the container scroll position
      const tileContainer = fileInput.closest(
        '[class*="uploadTile" i], [class*="upload-tile" i], [class*="attachment-card" i], ' +
        '[class*="file-upload" i], [data-automation-id*="upload" i]'
      );
      const scrollTarget = tileContainer || fileInput;
      try { scrollTarget.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (_) {}
      await sleep(300);

      // If the file input is hidden inside a tile, try clicking the tile's (+) button first
      if (tileContainer && !isElementVisible(fileInput)) {
        const plusBtn = tileContainer.querySelector(
          'button, [role="button"], [class*="add" i], [class*="plus" i], [class*="browse" i]'
        );
        if (plusBtn && isElementVisible(plusBtn)) {
          plusBtn.click();
          await sleep(400);
        }
      }

      fileInput.classList.add('ai-field-typing-focus');

      const base64Content = base64Data.includes('base64,')
        ? base64Data.split('base64,')[1]
        : base64Data;
      const byteCharacters = atob(base64Content);
      const byteArray = new Uint8Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteArray[i] = byteCharacters.charCodeAt(i);
      }
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
      const dropzone = fileInput.closest(
        '[data-automation-id*="upload" i], [class*="dropzone" i], [class*="file-upload" i], .wd-file-upload'
      );
      if (dropzone) {
        dropzone.dispatchEvent(new Event('change', { bubbles: true }));
        dropzone.dispatchEvent(new Event('drop', { bubbles: true }));
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

  // Legacy wrapper used by existing callsites (always attaches as resume)
  async function attachResumeFile(fileInput, cvData) {
    if (!fileInput || !cvData?.resumePdfBase64) return false;
    return attachDocumentFile(
      fileInput,
      cvData.resumePdfBase64,
      cvData.resumeFilename || 'resume.pdf',
      'resume'
    );
  }

  // Classify a file input's document slot type based on surrounding label / container text
  function classifyFileInputSlot(fi) {
    const container = fi.closest(
      '[class*="uploadTile" i], [class*="upload-tile" i], [class*="attachment-card" i], ' +
      '[class*="file-upload" i], [data-automation-id*="upload" i], .form-group, div'
    );
    const rawText = [
      getLabelText(fi) || '',
      container?.textContent || '',
      fi.name || '',
      fi.id || '',
      fi.getAttribute('data-automation-id') || '',
      fi.getAttribute('aria-label') || ''
    ].join(' ').toLowerCase();

    const isCoverLetter = /cover.?letter|covering.?letter|letter.?of.?interest|motivation.?letter/.test(rawText);
    const isResume = /resume|\bcv\b|curriculum.?vitae/.test(rawText);
    const isAdditional = /additional|other.?doc|portfolio|transcript|certification|attachment/.test(rawText);

    if (isCoverLetter) return 'cover_letter';
    if (isResume) return 'resume';
    if (isAdditional) return 'additional';
    return 'resume'; // default fallback
  }

  // Build a plain-text cover letter blob from profile + job info
  function buildCoverLetterText(profile, jobInfo) {
    const p = profile || {};
    const name = [p.firstName, p.lastName].filter(Boolean).join(' ') || 'Applicant';
    const role = jobInfo?.role || 'Software Engineer';
    const company = jobInfo?.company || 'the company';
    const skills = (p.skills || []).slice(0, 6).join(', ') || 'software development';
    const exp = p.workExperience?.[0];
    const expStr = exp ? `at ${exp.company} as ${exp.title}` : 'across multiple domains';
    const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    return [
      `${name}`,
      `${p.email || ''} | ${p.phone || ''} | ${p.city || ''}`,
      `${today}`,
      ``,
      `Hiring Manager`,
      `${company}`,
      ``,
      `Dear Hiring Manager,`,
      ``,
      `I am writing to express my strong interest in the ${role} position at ${company}. With hands-on experience ${expStr}, I have developed deep expertise in ${skills}, which I believe aligns closely with your requirements.`,
      ``,
      `In my previous roles, I have consistently delivered high-impact, scalable solutions—architecting end-to-end systems, optimising backend performance, and driving meaningful product outcomes. I am particularly drawn to ${company}'s mission and excited about the opportunity to contribute to your engineering goals.`,
      ``,
      `I would welcome the opportunity to discuss how my background, skills, and passion for technology can benefit ${company}. Thank you for your time and consideration.`,
      ``,
      `Sincerely,`,
      `${name}`
    ].join('\n');
  }

  // Convert a plain-text cover letter to a PDF-ready base64 string using a minimal PDF structure
  function textToPdfBase64(text) {
    // Build a minimal valid PDF with the cover letter text embedded
    const lines = text.split('\n');
    let pageContent = '';
    let y = 750;
    for (const line of lines) {
      const safeText = line.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
      pageContent += `BT /F1 11 Tf 50 ${y} Td (${safeText}) Tj ET\n`;
      y -= 16;
      if (y < 50) break; // prevent overflow
    }
    const stream = pageContent;
    const streamLen = stream.length;
    const pdf = [
      '%PDF-1.4',
      '1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj',
      '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj',
      '3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Resources<</Font<</F1<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>>>>>/Contents 4 0 R>>endobj',
      `4 0 obj<</Length ${streamLen}>>\nstream\n${stream}\nendstream\nendobj`,
      'xref', '0 5',
      '0000000000 65535 f ',
      '0000000009 00000 n ',
      '0000000058 00000 n ',
      '0000000115 00000 n ',
      '0000000266 00000 n ',
      'trailer<</Size 5/Root 1 0 R>>',
      'startxref', '406', '%%EOF'
    ].join('\n');
    // Encode to base64
    const bytes = [];
    for (let i = 0; i < pdf.length; i++) bytes.push(pdf.charCodeAt(i));
    let binary = '';
    for (const b of bytes) binary += String.fromCharCode(b);
    return btoa(binary);
  }

  // Fast Workday / ATS Pill-Wise Skill Tag Input Filler (JobRight Style)
  async function fillSkillPillsHumanLike(input, skills) {
    if (!input || !Array.isArray(skills) || skills.length === 0) return;

    try {
      try { input.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (_) {}
      input.classList.add('ai-field-typing-focus');
      try { input.focus(); } catch (_) { }

      // Take top 6 skills
      const skillsToFill = skills.slice(0, 6);

      for (const skill of skillsToFill) {
        if (!isAutofilling) break;

        // 1. Direct value assignment
        setNativeValue(input, skill);
        input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
        await sleep(30);

        // 2. Check for dropdown/autocomplete options in the DOM
        const dropdownSelectors = [
          '.wd-pill-option',
          '.pill-option',
          '[role="listbox"] [role="option"]',
          '[role="option"]',
          'ul.ui-autocomplete li',
          '.dropdown-item',
          '.suggestion-item'
        ];

        let matchingOpt = null;
        for (const sel of dropdownSelectors) {
          const candidates = window.querySelectorAllDeep(sel).filter(el => isElementVisible(el));
          if (candidates.length > 0) {
            matchingOpt = candidates.find(opt => {
              const t = (opt.textContent || '').trim().toLowerCase();
              return t.includes(skill.toLowerCase()) || skill.toLowerCase().includes(t.slice(0, 10));
            }) || candidates[0];
            break;
          }
        }

        if (matchingOpt && isElementVisible(matchingOpt)) {
          matchingOpt.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
          matchingOpt.click();
          await sleep(35);
        } else {
          // No dropdown — commit via Enter key
          input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
          input.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
          input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
          await sleep(30);

          // Check for and click an Add button if present
          const pillBox = input.closest('.wd-pill-box, [data-automation-id*="pill" i], [class*="pill" i], .form-group') || input.parentElement;
          const addBtn = pillBox?.querySelector('#btnAddSkillPill, button.wd-pill-add-btn, button[title*="Add" i]');
          if (addBtn && isElementVisible(addBtn)) {
            addBtn.click();
            await sleep(25);
          }
        }

        // Clear input for next skill entry
        try {
          if (input.value && input.value.trim().length > 0) {
            setNativeValue(input, '');
            input.dispatchEvent(new Event('input', { bubbles: true }));
          }
        } catch (_) { }
        await sleep(20);
      }

      // Sync hidden skills input if present
      const syncInput = document.getElementById('applicantSkills') || document.querySelector('input[name="skills"][type="hidden"]');
      if (syncInput) {
        setNativeValue(syncInput, skillsToFill.join(', '));
      }

      input.classList.remove('ai-field-typing-focus');
      input.classList.add('ai-field-filled-success');
      setTimeout(() => input.classList.remove('ai-field-filled-success'), 800);
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

  // Auto-expand collapsed sections AND click Workday/ATS section "Add" buttons
  // (e.g. Work Experience > Add, Education > Add, Certifications > Add)
  async function expandAndActivateSections(p) {
    try {
      // 1. Click "Expand all" buttons if present
      const expandAllBtn = window.querySelectorAllDeep('a, button, [role="button"], span')
        .find(el => {
          const t = (el.textContent || '').trim().toLowerCase();
          return (t === 'expand all' || t.includes('expand all')) && isElementVisible(el);
        });
      if (expandAllBtn) {
        expandAllBtn.click();
        await sleep(50);
      }

      // 2. Expand individual collapsed accordion headers
      const collapsedHeaders = window.querySelectorAllDeep('[aria-expanded="false"], .collapsed, [class*="accordion-header" i]:not([class*="expanded" i])');
      collapsedHeaders.forEach(h => {
        if (isElementVisible(h) && h.getAttribute('aria-expanded') === 'false') {
          try { h.click(); } catch (_) { }
        }
      });
      if (collapsedHeaders.length > 0) await sleep(50);

      // 3. Workday / ATS section "Add" button logic
      const sectionDefs = [
        {
          keywords: ['work experience', 'employment history', 'professional experience'],
          dataAutomationIds: ['workExperienceSection', 'workExperience', 'employment-section'],
          fill: () => {
            const exp = (p?.workExperience && p.workExperience[0]) || null;
            return exp ? [
              { kw: ['job title', 'position', 'role', 'title'], val: exp.title || p?.title || 'Full Stack Engineer' },
              { kw: ['company', 'employer', 'organization'], val: exp.company || 'Acme Technologies' },
              { kw: ['start date', 'from', 'job_start', 'workstartdate'], val: exp.startDate || 'Aug 2022' },
              { kw: ['end date', 'to', 'job_end', 'workenddate'], val: exp.isCurrent ? 'Present' : (exp.endDate || 'Present') },
              { kw: ['description', 'responsibilities', 'job description'], val: exp.description?.trim() || 'Engineered scalable full-stack systems using React, Node.js, and TypeScript.' },
              { kw: ['location', 'city', 'work location'], val: exp.location || p?.city || 'Bangalore, India' },
            ] : [];
          }
        },
        {
          keywords: ['education', 'academic', 'qualification'],
          dataAutomationIds: ['educationSection', 'education', 'education-section'],
          fill: () => {
            const edu = (p?.education && p.education[0]) || null;
            return edu ? [
              { kw: ['school', 'university', 'college', 'institution'], val: edu.institution || p?.school || 'National Institute of Technology' },
              { kw: ['degree', 'qualification'], val: edu.degree || 'Bachelor of Technology' },
              { kw: ['field of study', 'major', 'specialization', 'discipline'], val: edu.fieldOfStudy || edu.major || 'Computer Science and Engineering' },
              { kw: ['start date', 'from', 'school_start'], val: edu.startDate || '2018' },
              { kw: ['end date', 'to', 'graduation', 'year of passing', 'school_end'], val: edu.endDate || edu.graduationYear || '2022' },
              { kw: ['gpa', 'cgpa', 'grade', 'percentage', 'score'], val: p?.cgpa ? String(p.cgpa) : '8.5' },
            ] : [];
          }
        },
        {
          keywords: ['certifications', 'certification', 'licenses', 'credentials'],
          dataAutomationIds: ['certificationSection', 'certifications', 'license-section'],
          fill: () => {
            const cert = (p?.certifications && p.certifications[0]) || null;
            return cert ? [
              { kw: ['certification name', 'certificate name', 'name', 'title'], val: cert.name || 'AWS Certified Developer' },
              { kw: ['issuing organization', 'issuer', 'organization', 'issued by'], val: cert.issuer || 'Amazon Web Services' },
              { kw: ['issue date', 'date issued', 'start date', 'date obtained'], val: cert.issueDate || '2023' },
              { kw: ['expiry', 'expiration', 'end date', 'valid through'], val: cert.expiryDate || 'No Expiry' },
            ] : [];
          }
        },
        {
          keywords: ['languages', 'language spoken', 'language skills'],
          dataAutomationIds: ['languageSection', 'languages', 'language-section'],
          fill: () => [
            { kw: ['language', 'language name'], val: 'English' },
            { kw: ['proficiency', 'level', 'spoken level', 'written level'], val: 'Fluent' },
          ]
        }
      ];

      // Find which sections are currently showing only an "Add" button (not yet expanded)
      for (const sectionDef of sectionDefs) {
        let sectionEl = null;
        for (const aid of sectionDef.dataAutomationIds) {
          sectionEl = document.querySelector(`[data-automation-id="${aid}"], [data-automation-id*="${aid}" i]`);
          if (sectionEl && isElementVisible(sectionEl)) break;
          sectionEl = null;
        }
        if (!sectionEl) {
          const headings = window.querySelectorAllDeep('h2, h3, h4, h5, [class*="section-title" i], [class*="sectionTitle" i], [class*="group-header" i], legend');
          const hMatch = headings.find(h => {
            const t = (h.textContent || '').trim().toLowerCase();
            return sectionDef.keywords.some(k => t.includes(k)) && isElementVisible(h);
          });
          if (hMatch) sectionEl = hMatch.closest('section, fieldset, [class*="section" i], [class*="group" i]') || hMatch.parentElement;
        }

        if (!sectionEl) continue;

        // Check if the section already has inputs visible
        const hasVisibleSubForm = window.querySelectorAllDeep(
          'input:not([type="hidden"]):not([type="submit"]):not([type="button"]), textarea, select',
          sectionEl
        ).some(el => isElementVisible(el));

        if (hasVisibleSubForm) continue; // Form already expanded

        // Find and click the Add button STRICTLY inside this section
        const addBtn = window.querySelectorAllDeep(
          'button, [role="button"], a',
          sectionEl
        ).find(btn => {
          const t = (btn.textContent || btn.getAttribute('aria-label') || btn.title || '').trim().toLowerCase();
          return (t === 'add' || t.startsWith('add ') || t === '+ add' || t === 'add new' || t === 'add entry') && isElementVisible(btn);
        });

        if (addBtn) {
          addBtn.click();
          await sleep(100);

          // Pre-fill the newly expanded sub-form fields
          const fields = sectionDef.fill();
          if (fields.length > 0) {
            const subInputs = window.querySelectorAllDeep(
              'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="file"]):not([type="checkbox"]):not([type="radio"]), textarea, select',
              sectionEl
            ).filter(el => isElementVisible(el));

            for (const subInput of subInputs) {
              if (!isAutofilling) break;
              const labelStr = (getLabelText(subInput) + ' ' + (subInput.name || '') + ' ' + (subInput.id || '') + ' ' + (subInput.getAttribute('data-automation-id') || '') + ' ' + (subInput.placeholder || '')).toLowerCase();
              const fieldDef = fields.find(f => f.kw.some(k => labelStr.includes(k)));
              if (!fieldDef) continue;
              if (subInput.tagName === 'SELECT') {
                await selectOptionHumanLike(subInput, [fieldDef.val]);
              } else {
                await typeTextHumanLike(subInput, fieldDef.val);
              }
              await sleep(20);
            }
          }
        }
      }
    } catch (err) {
      console.warn('[Copilot Section Expand Notice]', err);
    }
  }

  // ── ATS Account Creation Page Auto-Fill ────────────────────────────────────────────────────────────────────────
  // Detects "Create Account" / "Sign In" pages on ATS portals and fills
  // email, password, verify-password, and consent checkbox automatically.
  // Uses profile email + stored atsPassword. Auto-generates a strong password
  // if none is saved and persists it back to the profile.
  async function detectAndFillCreateAccount(p) {
    if (!p) return false;

    // Detect create account page by page-level signals
    const bodyText = (document.body?.innerText || '').toLowerCase().slice(0, 3000);
    const isCreateAccount = (
      bodyText.includes('create account') ||
      bodyText.includes('candidate home account') ||
      bodyText.includes('create a candidate') ||
      bodyText.includes('password requirements') ||
      bodyText.includes('verify new password') ||
      bodyText.includes('verify password') ||
      (bodyText.includes('create') && bodyText.includes('account') && document.querySelector('input[type="password"]'))
    );

    if (!isCreateAccount) return false;

    // Make sure we are NOT on a simple "sign in" page where an account already exists
    // (i.e. if page has both email + password but NOT a verify/confirm password field,
    //  it's likely a login page rather than a registration page)
    const allPassInputs = window.querySelectorAllDeep('input[type="password"]').filter(isElementVisible);
    if (allPassInputs.length < 1) return false; // no password field at all

    const email = p.email || '';
    if (!email) return false;

    let password = p.atsPassword;
    let generatedNew = false;
    if (!password || password.length < 8) {
      password = generateStrongPassword();
      generatedNew = true;
    }

    showToast(`🔐 Filling account creation form for ${email}...`, 'info', 2500);
    await sleep(300);

    // Find the email field
    const emailInput = window.querySelectorAllDeep('input[type="email"], input[name*="email" i], input[id*="email" i], input[placeholder*="email" i], input[autocomplete="email"]')
      .filter(isElementVisible)[0];

    // Find the password fields
    const passInputs = window.querySelectorAllDeep('input[type="password"]').filter(isElementVisible);
    const passwordInput = passInputs[0] || null; // first = new password
    const verifyInput = passInputs[1] || null; // second = verify / confirm

    // Fill email
    if (emailInput) {
      await typeTextHumanLike(emailInput, email);
      await sleep(200);
    }

    // Fill password
    if (passwordInput) {
      passwordInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
      passwordInput.classList.add('ai-field-typing-focus');
      passwordInput.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      passwordInput.focus();
      passwordInput.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await sleep(80);
      setNativeValue(passwordInput, password);
      passwordInput.dispatchEvent(new Event('input', { bubbles: true }));
      passwordInput.dispatchEvent(new Event('change', { bubbles: true }));
      passwordInput.classList.remove('ai-field-typing-focus');
      passwordInput.classList.add('ai-field-filled-success');
      setTimeout(() => passwordInput.classList.remove('ai-field-filled-success'), 1200);
      await sleep(200);
    }

    // Fill verify/confirm password
    if (verifyInput) {
      verifyInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
      verifyInput.classList.add('ai-field-typing-focus');
      verifyInput.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      verifyInput.focus();
      verifyInput.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await sleep(80);
      setNativeValue(verifyInput, password);
      verifyInput.dispatchEvent(new Event('input', { bubbles: true }));
      verifyInput.dispatchEvent(new Event('change', { bubbles: true }));
      verifyInput.classList.remove('ai-field-typing-focus');
      verifyInput.classList.add('ai-field-filled-success');
      setTimeout(() => verifyInput.classList.remove('ai-field-filled-success'), 1200);
      await sleep(150);
    }

    // Check consent checkboxes
    const consentBoxes = window.querySelectorAllDeep('input[type="checkbox"], [role="checkbox"]')
      .filter(cb => {
        if (!isElementVisible(cb)) return false;
        const lbl = (getLabelText(cb) + ' ' + (cb.closest('label, div')?.textContent || '')).toLowerCase();
        return lbl.includes('consent') || lbl.includes('agree') || lbl.includes('understand') || lbl.includes('privacy') || lbl.includes('personal data');
      });
    for (const cb of consentBoxes) {
      const isChecked = cb.type === 'checkbox' ? cb.checked : cb.getAttribute('aria-checked') === 'true';
      if (!isChecked) {
        await clickCheckboxHumanLike(cb);
        await sleep(100);
      }
    }

    // Save generated password back to profile so it persists
    if (generatedNew) {
      try {
        if (cachedProfile) cachedProfile.atsPassword = password;
        await safeMsg({ action: 'UPDATE_PROFILE', payload: { atsPassword: password } });
        showToast(`✓ Created account! Password saved: ${password}\n(copy this!)`, 'success', 6000);
      } catch (_) { }
    } else {
      showToast('✓ Account form filled! Click Submit to create account.', 'success', 3000);
    }

    return true;
  }

  // Compatibility shim: sync function for callers that don't await
  function expandCollapsedSections() {
    try {
      const expandAllBtn = window.querySelectorAllDeep('a, button, [role="button"], span')
        .find(el => {
          const t = (el.textContent || '').trim().toLowerCase();
          return t.includes('expand all') && isElementVisible(el);
        });
      if (expandAllBtn) expandAllBtn.click();

      const collapsedHeaders = window.querySelectorAllDeep('[aria-expanded="false"]');
      collapsedHeaders.forEach(h => {
        if (isElementVisible(h)) try { h.click(); } catch (_) { }
      });
    } catch (_) { }
  }

  // Dynamically estimate realistic fresher salary based on country, location, and input field type
  function getEstimatedSalary(input, p) {
    const labelContext = (
      (input?.getAttribute('aria-label') || '') + ' ' +
      (input?.placeholder || '') + ' ' +
      (input?.name || '') + ' ' +
      (getLabelText(input) || '') + ' ' +
      (input?.closest('.Qr7Oae, [role="listitem"], .form-group, .field')?.textContent || '')
    ).toLowerCase();

    const isCurrent = labelContext.includes('current') || labelContext.includes('present') || labelContext.includes('existing');
    const isMonthly = labelContext.includes('month') || labelContext.includes('monthly') || labelContext.includes('per month') || labelContext.includes('pm') || labelContext.includes('/mo');
    const isNumeric = input?.type === 'number' || input?.getAttribute('inputmode') === 'numeric' || (input?.getAttribute('pattern') && /^\d+$/.test(input.getAttribute('pattern')));
    const country = (p?.country || 'India').trim().toLowerCase();

    const isFresher = !p?.workExperience || p.workExperience.length === 0 || (p.experienceLevel || '').toLowerCase().includes('fresher') || (p.experienceLevel || '').toLowerCase().includes('entry') || (p.title || '').toLowerCase().includes('trainee') || (p.title || '').toLowerCase().includes('graduate');

    // If asking for CURRENT salary and user is a fresher
    if (isCurrent && isFresher) {
      return '0';
    }

    if (p && p.desiredSalary && !isMonthly && !isCurrent) {
      return String(p.desiredSalary);
    }

    // Check page text for currency or location signals
    const pageText = (document.body?.innerText || '').slice(0, 3500).toLowerCase();
    const isIndia = country === 'india' || pageText.includes('inr') || pageText.includes('₹') || pageText.includes('lpa') || pageText.includes('india') || pageText.includes('bangalore') || pageText.includes('bengaluru') || pageText.includes('chennai') || pageText.includes('gurgaon') || pageText.includes('pune') || pageText.includes('hyderabad') || pageText.includes('noida') || pageText.includes('mumbai');
    const isUS = pageText.includes('usd') || pageText.includes('$') || pageText.includes('united states') || pageText.includes('usa');
    const isUK = pageText.includes('gbp') || pageText.includes('£') || pageText.includes('united kingdom');
    const isEU = pageText.includes('eur') || pageText.includes('€') || pageText.includes('europe') || pageText.includes('germany');

    if (isIndia) {
      if (isMonthly) {
        if (isFresher) {
          return isNumeric ? '45000' : '₹40,000 - ₹50,000 / month';
        } else {
          return isNumeric ? '75000' : '₹70,000 - ₹85,000 / month';
        }
      }
      if (isFresher) {
        return isNumeric ? '500000' : '5,00,000 - 6,00,000 INR (5 LPA)';
      } else {
        return isNumeric ? '800000' : '8,00,000 - 10,00,000 INR';
      }
    }

    if (isUS) {
      if (isMonthly) {
        return isNumeric ? (isFresher ? '6000' : '9500') : (isFresher ? '$6,000 / month' : '$9,500 / month');
      }
      if (isFresher) {
        return isNumeric ? '70000' : '$70,000 - $80,000 / year';
      } else {
        return isNumeric ? '110000' : '$100,000 - $120,000 / year';
      }
    }

    if (isUK) {
      return isNumeric ? '35000' : '£35,000 - £42,000 / year';
    }

    if (isEU) {
      return isNumeric ? '45000' : '€45,000 - €52,000 / year';
    }

    // Realistic fallback
    if (isMonthly) {
      return isNumeric ? '45000' : '₹40,000 - ₹50,000 / month';
    }
    return isNumeric ? '500000' : 'Competitive / Negotiable';
  }

  // 6. Intelligent Step-by-Step Autofill with Human-Like Typing & Visual Highlighting
  let isAutofilling = false;
  if (!('isAutofilling' in window)) {
    Object.defineProperty(window, 'isAutofilling', {
      get: () => isAutofilling,
      set: (v) => { isAutofilling = v; },
      configurable: true
    });
  }

    // Helper to generate a compelling, human founder pitch note (>= 50 chars for YC)
  function buildFounderOutreachNote(profile, jobInfo) {
    const candidateName = profile?.fullName || `${profile?.firstName || ''} ${profile?.lastName || ''}`.trim() || profile?.name || 'Candidate';
    const compName = jobInfo?.company || 'your';
    const roleName = jobInfo?.role || 'Full-Stack Developer';
    const title = profile?.title || 'Full-Stack & AI Engineer';
    const skills = (profile?.skills && profile.skills.length > 0) ? profile.skills.slice(0, 5).join(', ') : 'TypeScript, React, Node.js, and Python';
    const cleanComp = compName.replace(/\s*\([A-Z]\d+\)/i, '').trim();

    return `Hi ${cleanComp} team,\n\nI\'m ${candidateName}, a ${title} specializing in ${skills}. I am very drawn to the ${roleName} role at ${cleanComp}.\n\nMy engineering background focuses on building resilient full-stack architectures and high-performance applications with strict type safety and dependable state management. I thrive in high-ownership startup environments where I can partner closely with founders to design and ship reliable product features end-to-end.\n\nI would love the opportunity to connect and discuss how my skills and proactive approach can contribute to ${cleanComp}.\n\nBest regards,\n${candidateName}`;
  }

  async function autofillForm() {
    if (isAutofilling) {
      if (Date.now() - (window.__lastAutofillStartTime || 0) > 8000) {
        console.warn('[Copilot] Resetting stuck autofill lock');
        isAutofilling = false;
        window.isAutofilling = false;
      } else {
        showToast('Autofill is currently in progress...', 'info');
        return { success: false, message: 'Already in progress' };
      }
    }
    window.__lastAutofillStartTime = Date.now();

    // Fast parallel fetch for candidate profile, brain rules, and CV attachment data
    const [profileRes, brainRes, cvRes] = await Promise.all([
      (cachedProfile && (cachedProfile.firstName || cachedProfile.email))
        ? Promise.resolve({ success: true, profile: cachedProfile })
        : safeMsg({ action: 'GET_PROFILE' }),
      (cachedBrainRules && cachedBrainRules.length > 0)
        ? Promise.resolve({ learnedRules: cachedBrainRules })
        : safeMsg({ action: 'GET_BRAIN' }),
      safeMsg({ action: 'GET_CV_DATA' }).catch(() => null)
    ]);

    if (!profileRes?.success || !profileRes.profile) {
      showToast(profileRes?.error || 'Please connect & sync your profile first!', 'error');
      openSidebar('profile');
      return { success: false, message: profileRes?.error };
    }

    cachedProfile = profileRes.profile;
    cachedBrainRules = brainRes?.learnedRules || [];
    const cvData = cvRes?.cvData || null;

    const p = cachedProfile;
    const host = window.location.hostname.toLowerCase();

    // Auto-expand collapsed sections if needed
    expandCollapsedSections();
    await expandAndActivateSections(p);

    // Fast check for ATS Create Account / Sign-In registration pages
    if (document.querySelector('input[type="password"]')) {
      await detectAndFillCreateAccount(p);
    }

    // 1. Gather all candidate fill actions in page reading order
    const fillQueue = [];

    // Scope strictly to active overlay modal (LinkedIn Easy Apply, YC Reach Out) to prevent touching background inputs
    let activeModal = typeof getActiveApplicationModal === 'function' ? getActiveApplicationModal() : null;
    let scope = activeModal || document;

    // Safety fallback: if activeModal was selected but contains no interactive candidate inputs, fall back to document
    if (activeModal) {
      const modalInputs = window.querySelectorAllDeep('input:not([type="hidden"]), select, textarea', activeModal)
        .filter(el => !el.closest('#ai-copilot-sidebar') && !el.closest('#ai-copilot-dock-tab') && isElementVisible(el));
      if (modalInputs.length === 0) {
        scope = document;
        activeModal = null;
      }
    }

    // Check for CV / Resume / Cover Letter / Additional Document File Upload Inputs
    // Finds BOTH visible file inputs AND hidden inputs inside visual upload tile cards
    if (cvData && cvData.resumePdfBase64) {
      // Find all file inputs, including hidden ones inside upload-tile containers
      const fileInputsAll = window.querySelectorAllDeep('input[type="file"]', scope)
        .filter(fi => !fi.closest('#ai-copilot-sidebar') && !fi.closest('#ai-copilot-dock-tab'));

      // Also scan for upload tile cards that expose the hidden input inside
      const tileCandidates = window.querySelectorAllDeep(
        '[class*="uploadTile" i], [class*="upload-tile" i], [class*="attachment-card" i], ' +
        '[class*="AttachmentTile" i], [data-automation-id*="upload" i]', scope
      ).filter(tile => {
        if (tile.closest('#ai-copilot-sidebar') || tile.closest('#ai-copilot-dock-tab')) return false;
        // Must be visible and contain a hidden file input
        const hiddenFi = tile.querySelector('input[type="file"]');
        return hiddenFi && isElementVisible(tile);
      });

      // Merge: prefer tile-based inputs, then visible normal inputs
      const seenInputs = new Set();
      const fileInputsCombined = [];

      // Add hidden inputs inside tiles first
      tileCandidates.forEach(tile => {
        const fi = tile.querySelector('input[type="file"]');
        if (fi && !seenInputs.has(fi)) {
          seenInputs.add(fi);
          fileInputsCombined.push(fi);
        }
      });
      // Add remaining visible inputs
      fileInputsAll.forEach(fi => {
        if (!seenInputs.has(fi) && isElementVisible(fi)) {
          seenInputs.add(fi);
          fileInputsCombined.push(fi);
        }
      });

      const jobInfo = extractJobDetails();

      fileInputsCombined.forEach(fi => {
        const alreadyHasFile = fi.files && fi.files.length > 0;
        if (alreadyHasFile) return;

        const slotType = classifyFileInputSlot(fi);

        if (slotType === 'resume') {
          fillQueue.push({
            element: fi,
            type: 'file_resume',
            base64: cvData.resumePdfBase64,
            filename: cvData.resumeFilename || 'resume.pdf',
            label: `Resume / CV (${cvData.resumeFilename || 'resume.pdf'})`
          });
        } else if (slotType === 'cover_letter') {
          // Use stored cover letter if available, otherwise generate from profile
          const storedCl = cvData.coverLetterBase64;
          if (storedCl) {
            fillQueue.push({
              element: fi,
              type: 'file_cover_letter',
              base64: storedCl,
              filename: cvData.coverLetterFilename || 'Cover_Letter.pdf',
              label: 'Cover Letter (Stored)'
            });
          } else {
            // Generate a tailored cover letter PDF on the fly
            const clText = buildCoverLetterText(cachedProfile, jobInfo);
            const clBase64 = textToPdfBase64(clText);
            fillQueue.push({
              element: fi,
              type: 'file_cover_letter',
              base64: clBase64,
              filename: 'Cover_Letter.pdf',
              label: 'Cover Letter (AI Tailored)'
            });
          }
        } else if (slotType === 'additional') {
          // Attach resume as additional document fallback
          fillQueue.push({
            element: fi,
            type: 'file_resume',
            base64: cvData.resumePdfBase64,
            filename: cvData.resumeFilename || 'resume.pdf',
            label: 'Additional Document'
          });
        }
      });
    }

    const inputs = window.querySelectorAllDeep('input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="file"]), textarea, select', scope)
      .filter(el => !el.closest('#ai-copilot-sidebar') && !el.closest('#ai-copilot-dock-tab') && !el.id?.startsWith('prof-') && !el.id?.startsWith('ai-') && !el.name?.startsWith('prof-') && isElementVisible(el));

    inputs.forEach(input => {
      // On Google Forms, skip standard field matching — handled by dedicated Google Forms section below
      if (isGoogleForm() && input.closest('.Qr7Oae, [role="listitem"], .freebirdFormviewerComponentsQuestionBaseRoot')) return;

      // Don't overwrite already filled fields (properly recognizing select placeholder options like "No Selection", -1, 0, or "Select...")
      let hasValue = false;
      if (input.tagName === 'SELECT') {
        const selectedOpt = input.selectedIndex >= 0 ? input.options[input.selectedIndex] : null;
        hasValue = !isPlaceholderOption(selectedOpt);
      } else if (input.type !== 'radio' && input.type !== 'checkbox') {
        hasValue = input.value && input.value.trim().length > 0;
      }

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
        const fullName = p.fullName || p.name || `${p.firstName || ''} ${p.lastName || ''}`.trim();
        if (fullName) {
          fillQueue.push({ element: input, type: 'text', value: fullName, label: 'Full Name' });
        }
      }
      // Email
      else if (input.type === 'email' || matches(identifier, ['email', 'email_address', 'e-mail'])) {
        if (p.email) {
          fillQueue.push({ element: input, type: 'text', value: p.email, label: 'Email Address' });
        }
      }
      // Phone Country Code (LinkedIn Easy Apply select, country phone code dropdown)
      else if (matches(identifier, ['phone country code', 'country phone code', 'phone-country-code', 'phonecountrycode', 'country code', 'country_code']) && input.tagName === 'SELECT') {
        const countryTargets = ['+91', 'india (+91)', 'india', '91'];
        if (p.country && p.country.toLowerCase() !== 'india') {
          countryTargets.unshift(p.country.toLowerCase());
        }
        fillQueue.push({ element: input, type: 'select', value: countryTargets, label: 'Phone Country Code' });
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
        const addrVal = p.addressLine1 || p.address;
        if (addrVal) {
          fillQueue.push({ element: input, type: 'text', value: addrVal, label: 'Address Line 1' });
        }
      }
      // City & Current Location (Lever location-input, general ATS city/location)
      else if (matches(identifier, ['city', 'town', 'location', 'current location', 'present location', 'candidate location', 'addresssection_city']) || input.name === 'location' || input.id === 'location-input') {
        const locVal = p.city || p.location || (p.state ? `${p.state}, ${p.country || 'India'}` : 'Bangalore, India');
        if (locVal) {
          fillQueue.push({ element: input, type: 'text', value: locVal, label: 'Current Location' });
        }
      }
      // Country / Region (CRITICAL: Must be handled so State / Province options unlock)
      else if (matches(identifier, ['country', 'country/region', 'addresssection_countrycode', 'addresssection_country', 'candidate_country'])) {
        const countryVal = p.country || 'India';
        if (input.tagName === 'SELECT') {
          fillQueue.push({ element: input, type: 'select', value: [countryVal, 'India', 'IND', 'IN'], label: 'Country' });
        } else {
          fillQueue.push({ element: input, type: 'combobox', value: countryVal, label: 'Country' });
        }
      }
      // State / Province (Supports autocomplete combobox & native select)
      else if (matches(identifier, ['state', 'province', 'region', 'addresssection_countryregion', 'state/province'])) {
        if (p.state) {
          if (input.tagName === 'SELECT') {
            fillQueue.push({ element: input, type: 'select', value: [p.state], label: 'State / Province' });
          } else {
            fillQueue.push({ element: input, type: 'combobox', value: p.state, label: 'State / Province' });
          }
        }
      }
      // Postal Code / Zip (supports UK postcode, US zip, Indian pincode)
      else if (matches(identifier, ['postal code', 'postalcode', 'postcode', 'post_code', 'pin code', 'pincode', 'zip', 'zipcode', 'addresssection_postalcode'])) {
        const zipVal = p.postalCode || p.zipCode || p.zip || p.pincode;
        if (zipVal) {
          fillQueue.push({ element: input, type: 'text', value: zipVal, label: 'Postal Code' });
        }
      }
      // Professional / Personal Summary / Bio (Pinpoint ATS application[summary], custom company portals)
      else if (matches(identifier, ['summary', 'personal summary', 'professional summary', 'bio', 'about yourself', 'candidate summary', 'profile summary', 'candidate_summary'])) {
        const summaryVal = p.summary || p.about || `${p.title || 'Engineer'} with expertise in ${(p.skills || ['full-stack engineering', 'modern cloud systems']).slice(0, 5).join(', ')}.`;
        fillQueue.push({ element: input, type: 'text', value: summaryVal, label: 'Professional Summary' });
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
      // Resume / CV Drive Link (Google Drive / Cloud Shareable Link)
      else if (matches(identifier, ['resume url', 'cv url', 'résumé / cv url', 'resume link', 'cv link', 'shareable link', 'drive link', 'resume_url', 'cv_url', 'link to resume', 'link to cv'])) {
        let val = p.resumeUrl || p.cvUrl || p.resumeDriveUrl || '';
        if (val && !val.startsWith('http://') && !val.startsWith('https://')) val = 'https://' + val;
        if (val) fillQueue.push({ element: input, type: 'text', value: val, label: 'Resume / CV Drive Link' });
      }
      // Project / Repository URL (Different from root GitHub profile, uses web app priority repos)
      else if (matches(identifier, ['link to one', 'link to real', 'repository', 'repo url', 'repository url', 'project url', 'walkthrough', 'code repository', 'github repo', 'product url'])) {
        let val = getPriorityRepoUrl(p, identifier);
        fillQueue.push({ element: input, type: 'text', value: val, label: 'Repository / Project Link' });
      }
      // Preferred Language Dropdown / Text
      else if (matches(identifier, ['preferred language', 'preferred_language', 'language preference', 'communication language', 'preferred language/dialect'])) {
        const isAriaCombobox = input.getAttribute('role') === 'combobox' || input.getAttribute('aria-haspopup') === 'listbox' || input.classList.contains('sapMInputBaseInner');
        if (input.tagName === 'SELECT') {
          fillQueue.push({ element: input, type: 'select', value: ['english (us)', 'english us', 'en_us', 'english'], label: 'Preferred Language' });
        } else if (isAriaCombobox) {
          fillQueue.push({ element: input, type: 'aria_combobox', value: ['english (us)', 'english us', 'english'], label: 'Preferred Language' });
        } else {
          fillQueue.push({ element: input, type: 'text', value: 'English (US)', label: 'Preferred Language' });
        }
      }
      // Work Authorization (Dropdown / Text / Radio / ARIA Combobox)
      else if (matches(identifier, ['authorized to work', 'legally authorized', 'authorization', 'legal right to work', 'work in the country'])) {
        const val = p.authorizedToWork !== false ? ['yes', 'authorized', 'yes, i am authorized', 'yes - i am authorized'] : ['no'];
        const isAriaCombobox = input.getAttribute('role') === 'combobox' || input.getAttribute('aria-haspopup') === 'listbox' || input.classList.contains('sapMInputBaseInner');
        if (input.tagName === 'SELECT') {
          fillQueue.push({ element: input, type: 'select', value: val, label: 'Work Authorization' });
        } else if (isAriaCombobox) {
          fillQueue.push({ element: input, type: 'aria_combobox', value: val, label: 'Work Authorization' });
        } else {
          fillQueue.push({ element: input, type: 'text', value: 'Yes', label: 'Work Authorization' });
        }
      }
      // Visa Status (e.g. "If not, what is your VISA status?")
      else if (matches(identifier, ['visa status', 'what is your visa', 'if not, what is your visa'])) {
        const country = (p.country || 'India').trim().toLowerCase();
        const jobInfo = extractJobDetails();
        const jobLoc = `${jobInfo.location || ''} ${jobInfo.description || ''}`.toLowerCase();
        const isIndiaJob = jobLoc.includes('india') || host.includes('.in') || jobLoc.includes('bengaluru') || jobLoc.includes('bangalore') || jobLoc.includes('chennai') || jobLoc.includes('pune') || jobLoc.includes('mumbai') || jobLoc.includes('hyderabad') || jobLoc.includes('gurgaon') || jobLoc.includes('noida') || jobLoc.includes('delhi');

        let visaVal;
        if (country === 'india') {
          if (isIndiaJob || !jobInfo.location) {
            visaVal = 'Citizen of India (Authorized to work with no visa sponsorship required)';
          } else {
            visaVal = 'Indian Citizen (Will require visa sponsorship / work permit to work on-site)';
          }
        } else {
          visaVal = p.authorizedToWork !== false ? `Citizen of ${p.country || 'India'} (Authorized to work)` : 'Will require visa sponsorship';
        }
        fillQueue.push({ element: input, type: 'text', value: visaVal, label: 'Visa Status' });
      }
      // Visa Sponsorship Dropdowns
      else if (matches(identifier, ['sponsorship', 'require visa', 'require sponsorship'])) {
        const val = p.requireSponsorship ? ['yes'] : ['no', 'not required', 'do not require'];
        if (input.tagName === 'SELECT') {
          fillQueue.push({ element: input, type: 'select', value: val, label: 'Visa Sponsorship' });
        } else {
          fillQueue.push({ element: input, type: 'text', value: 'No', label: 'Visa Sponsorship' });
        }
      }
      // Previous Employment / Current or Previous Employee (e.g. "I am a CURRENT or PREVIOUS Employee of...")
      else if (matches(identifier, ['current or previous employee', 'current or former employee', 'previously worked', 'former employee', 'have you worked', 'employed by ingersoll', 'employed by gardner', 'previous employee'])) {
        const val = p.formerEmployee ? ['yes'] : ['no'];
        const isAriaCombobox = input.getAttribute('role') === 'combobox' || input.getAttribute('aria-haspopup') === 'listbox' || input.classList.contains('sapMInputBaseInner');
        if (input.tagName === 'SELECT') {
          fillQueue.push({ element: input, type: 'select', value: val, label: 'Previous Employment' });
        } else if (isAriaCombobox) {
          fillQueue.push({ element: input, type: 'aria_combobox', value: val, label: 'Previous Employment' });
        } else {
          fillQueue.push({ element: input, type: 'text', value: 'No', label: 'Previous Employment' });
        }
      }
      // Relatives / Family at Company Dropdowns
      else if (matches(identifier, ['relative', 'family member', 'related to anyone'])) {
        if (input.tagName === 'SELECT') {
          fillQueue.push({ element: input, type: 'select', value: ['no'], label: 'Relatives at Company' });
        } else {
          fillQueue.push({ element: input, type: 'text', value: 'No', label: 'Relatives at Company' });
        }
      }
      // Conflict of Interest Dropdowns
      else if (matches(identifier, ['conflict of interest'])) {
        if (input.tagName === 'SELECT') {
          fillQueue.push({ element: input, type: 'select', value: ['no'], label: 'Conflict of Interest' });
        } else {
          fillQueue.push({ element: input, type: 'text', value: 'No', label: 'Conflict of Interest' });
        }
      }
      // Government Official Dropdowns
      else if (matches(identifier, ['government official', 'public official'])) {
        if (input.tagName === 'SELECT') {
          fillQueue.push({ element: input, type: 'select', value: ['no'], label: 'Government Official' });
        } else {
          fillQueue.push({ element: input, type: 'text', value: 'No', label: 'Government Official' });
        }
      }
      // Age 18+ (Dropdown / Text)
      else if (matches(identifier, ['18 years', 'at least 18', 'legal age', 'currently 18', '18 years or older'])) {
        if (input.tagName === 'SELECT') {
          fillQueue.push({ element: input, type: 'select', value: ['yes', '18'], label: 'Age 18+' });
        } else {
          fillQueue.push({ element: input, type: 'text', value: 'Yes', label: 'Age 18+' });
        }
      }
      // Title / Salutation
      else if (matches(identifier, ['title/salutation', 'salutation', 'prefix'])) {
        if (input.tagName === 'SELECT') {
          fillQueue.push({ element: input, type: 'select', value: ['mr.', 'mr', 'none', 'select'], label: 'Title/Salutation' });
        }
      }
      // Employee Referral
      else if (matches(identifier, ['who referred you', 'employee referral', 'referral name', 'referral - who'])) {
        fillQueue.push({ element: input, type: 'text', value: 'N/A', label: 'Employee Referral' });
      }
      // Available to start / Date of availability (supports MM/DD/YYYY, YYYY-MM-DD, native date picker, SAP calendar)
      else if (matches(identifier, ['available to start', 'when are you available', 'availability to start', 'start date for employment', 'when can you start', 'when are you available to start'])) {
        if (input.tagName === 'SELECT') {
          fillQueue.push({ element: input, type: 'select', value: ['immediate', 'immediately', '15 days', '0 days'], label: 'Available to Start' });
        } else {
          // Use smart datepicker handler for all non-select inputs
          fillQueue.push({ element: input, type: 'datepicker', dateObj: getNextMondayDateObj(), label: 'Available to Start' });
        }
      }
      // Background Check Dropdowns
      else if (matches(identifier, ['background check', 'background screen', 'drug screen'])) {
        if (input.tagName === 'SELECT') {
          fillQueue.push({ element: input, type: 'select', value: ['yes', 'agree', 'consent'], label: 'Background Check' });
        } else {
          fillQueue.push({ element: input, type: 'text', value: 'Yes', label: 'Background Check' });
        }
      }
      // Notice Period Dropdowns / Text
      else if (matches(identifier, ['notice period', 'notice_period', 'how soon can you start'])) {
        if (input.tagName === 'SELECT') {
          fillQueue.push({ element: input, type: 'select', value: ['immediate', '15', '30', '0'], label: 'Notice Period' });
        } else {
          fillQueue.push({ element: input, type: 'text', value: 'Immediate / 0 days', label: 'Notice Period' });
        }
      }
      // Current Salary
      else if (matches(identifier, ['current salary', 'current ctc', 'current compensation', 'current_salary'])) {
        const isNumeric = input.type === 'number' || input.getAttribute('inputmode') === 'numeric';
        fillQueue.push({ element: input, type: 'text', value: isNumeric ? '0' : '0 (Fresher)', label: 'Current Salary' });
      }
      // Current Organisation / Current Company (Lever org-input, general ATS)
      else if (matches(identifier, ['current organisation', 'current organization', 'current employer', 'present company', 'current company', 'current_company']) || input.name === 'org' || input.id === 'org' || input.getAttribute('data-qa') === 'org-input') {
        const exp = (p.workExperience && p.workExperience[0]) || null;
        const val = exp?.company?.trim() || 'Fresher / Student';
        fillQueue.push({ element: input, type: 'text', value: val, label: 'Current Organisation' });
      }
      // Tenure in Organisation
      else if (matches(identifier, ['tenure in the organisation', 'tenure in the organization', 'tenure', 'length of service'])) {
        fillQueue.push({ element: input, type: 'text', value: '0 months (Fresher)', label: 'Tenure in Organisation' });
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
      else if (matches(identifier, ['earliest start date', 'available start date', 'date of availability', 'earliest_start'])) {
        if (input.tagName === 'SELECT') {
          fillQueue.push({ element: input, type: 'select', value: ['immediate', 'immediately', '2 weeks', '14 days'], label: 'Earliest Start Date' });
        } else {
          fillQueue.push({ element: input, type: 'datepicker', dateObj: getNextMondayDateObj(), label: 'Earliest Start Date' });
        }
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
      // YC & Startup Founder Note / Cover Letter Textarea / Pitch
      else if (
        input.tagName === 'TEXTAREA' &&
        (
          matches(identifier, ['reach out', 'start a conversation', 'share something about you', 'interests you', 'founder', 'founders', 'note to', 'message to', 'cover letter', 'why are you a good fit', 'why should we hire', 'about yourself', 'what you are looking for', 'pitch']) ||
          (input.placeholder && matches(input.placeholder.toLowerCase(), ['hi! my name is', 'my name is', 'little bit about me', "what i'm looking for", 'tell us why', 'why you'])) ||
          !!input.closest('.modal, [role="dialog"], [class*="modal" i]')
        )
      ) {
        const jobInfo = extractJobDetails();
        const note = buildFounderOutreachNote(p, jobInfo);
        fillQueue.push({ element: input, type: 'text', value: note, label: 'Founder Outreach Note' });
      }
      // In-Person / Work From Office / Location Availability (Lever dropdown/text, general ATS)
      else if (matches(identifier, ['join us in person', 'in person in', 'work from office', 'able to join us', 'in-person', 'onsite in', 'on-site in', 'comfortable with working', 'working from bangalore', 'working from office'])) {
        if (input.tagName === 'SELECT') {
          fillQueue.push({ element: input, type: 'select', value: ['yes', 'open', 'comfortable'], label: 'In-Person / Office Availability' });
        } else {
          fillQueue.push({ element: input, type: 'text', value: 'Yes', label: 'In-Person / Office Availability' });
        }
      }
      // Notice Period (Dropdown / Text - Common across Lever, Pinpoint, Workday, Naukri, Indian & Global ATS)
      else if (matches(identifier, ['notice period', 'notice_period', 'notice-period', 'availability for joining', 'joining time', 'how soon can you join'])) {
        if (input.tagName === 'SELECT') {
          fillQueue.push({ element: input, type: 'select', value: ['immediate', '0 - 15', '0 - 7', '15 - 30', 'serving', 'immediate joiner', '15 days', '30 days', '1 month'], label: 'Notice Period' });
        } else {
          fillQueue.push({ element: input, type: 'text', value: 'Immediate / 15 Days', label: 'Notice Period' });
        }
      }
      // Willing to Relocate Checkbox
      else if (input.type === 'checkbox' && matches(identifier, ['relocat', 'location preference', 'open to relocating', 'willing to relocate'])) {
        fillQueue.push({ element: input, type: 'checkbox', checked: true, label: 'Willing to Relocate' });
      }
      // Skills Field — Smart detection: pill/tag input, Workday multi-value input ("No Items"), or plain text
      else if (
        !matches(identifier, ['company', 'employer', 'organization', 'description', 'responsibilities', 'workhistory', 'job title']) &&
        matches(identifier, ['skills', 'key skills', 'technical skills', 'skills_list', 'core skills', 'skill_entry', 'skills-pill-input', 'applicantskills'])
      ) {
        const skillsArray = (p.skills && p.skills.length > 0) ? p.skills : ['React', 'Node.js', 'TypeScript', 'Python', 'AWS'];

        // Detect Workday multi-value input (shows "No Items." placeholder, or has [data-automation-id*="multi-select"]
        // or the container has a "No items" text node)
        const container = input.closest(
          '[class*="multi" i], [class*="pill" i], [class*="tag" i], [class*="chip" i], ' +
          '[data-automation-id*="multi" i], [data-automation-id*="pill" i], .form-group, div'
        );
        const containerText = (container?.textContent || '').toLowerCase();
        const isMultiValueInput = (
          containerText.includes('no items') ||
          container?.querySelector('[class*="no-items" i], [class*="noItems" i], [class*="emptyList" i]') ||
          input.getAttribute('data-automation-id')?.includes('multi') ||
          input.closest('[data-automation-id*="multiSelectContainer" i]') ||
          input.closest('[class*="multi-select" i]') ||
          input.closest('[class*="multiSelect" i]')
        );

        // Detect pill/tag box: input is inside a pill container
        const isPillInput = (
          !!input.closest('.wd-pill-box, [data-automation-id*="pill" i], [class*="pill" i], [class*="tag" i], [class*="chip" i]') ||
          input.getAttribute('data-automation-id')?.includes('pill') ||
          input.id?.includes('pill') ||
          input.name === 'skill_entry'
        );

        // Detect plain textarea or simple text input (no dropdown behavior)
        const isPlainText = input.tagName === 'TEXTAREA' || (
          input.type === 'text' &&
          !isPillInput && !isMultiValueInput &&
          !input.getAttribute('role')?.includes('combobox') &&
          !input.getAttribute('aria-haspopup')
        );

        if (isPillInput || isMultiValueInput) {
          // Both pill inputs and Workday multi-value inputs: type each skill + Enter
          fillQueue.push({ element: input, type: 'skill_pills', skills: skillsArray, label: 'Key Technical Skills (Pills/Multi)' });
        } else if (isPlainText) {
          // Simple text field or textarea: join all skills as comma-separated string
          fillQueue.push({ element: input, type: 'text', value: skillsArray.join(', '), label: 'Key Skills' });
        } else {
          // Combobox-style skills: try pill behavior first
          fillQueue.push({ element: input, type: 'skill_pills', skills: skillsArray, label: 'Key Technical Skills' });
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
      // Current Salary / Current CTC / Current Monthly Salary
      else if (matches(identifier, ['current salary', 'current monthly salary', 'current ctc', 'current pay', 'present salary', 'present ctc', 'current compensation']) || (identifier.includes('current') && matches(identifier, ['salary', 'ctc', 'pay', 'compensation']))) {
        const val = getEstimatedSalary(input, p);
        fillQueue.push({ element: input, type: 'text', value: String(val), label: 'Current Salary' });
      }
      // Desired Salary / Target Compensation / Expected CTC (dynamically inferred without hardcoding)
      else if (matches(identifier, ['desired salary', 'expected salary', 'target salary', 'desired_salary', 'expected_salary', 'target_salary', 'expected ctc', 'annual salary', 'pay expectations', 'desired pay', 'target ctc', 'desiredsalary', 'expectedctc', 'compensation', 'salary'])) {
        const val = getEstimatedSalary(input, p);
        if (input.tagName === 'SELECT') {
          fillQueue.push({ element: input, type: 'select', value: ['10 - 15', '15 - 20', '10-15', '15-20', '< 10', '12', '15', '10', '12 lpa', '15 lpa', String(val)], label: 'Expected CTC' });
        } else {
          fillQueue.push({ element: input, type: 'text', value: String(val), label: 'Desired Salary / Compensation' });
        }
      }
      // Total Years or Months of Experience (Dynamically computed from candidate work dates)
      else if (matches(identifier, [
        'total professional experience', 'years of professional experience', 'years of experience',
        'total experience', 'relevant experience', 'experience years', 'experience (years)',
        'total_experience', 'totalexperience', 'totalexp', 'months of experience', 'experience (months)',
        'experience months', 'experience in months', 'total experience in years', 'total experience in months',
        'total relevant experience', 'what is your total relevant experience'
      ]) || (matches(identifier, ['experience']) && (matches(identifier, ['year', 'years', 'month', 'months', 'total', 'overall', 'relevant'])))) {
        const expCalc = calculateExperienceFromProfile(p);
        const isMonthsAsked = matches(identifier, ['month', 'months', 'in months']);
        const val = isMonthsAsked ? expCalc.months : expCalc.years;
        const label = isMonthsAsked ? 'Total Experience (Months)' : 'Total Professional Experience (Years)';
        fillQueue.push({ element: input, type: 'text', value: String(val), label });
      }
      // Entrance Rank / Competitive Exam Rank (e.g. "State your rank in Advanced JEE ?")
      else if (matches(identifier, ['rank in advanced jee', 'jee rank', 'jee advanced', 'entrance rank', 'state your rank'])) {
        fillQueue.push({ element: input, type: 'text', value: 'N/A', label: 'Entrance Rank / JEE' });
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
      // Electronic Signature / Typed Signature / Legal Name Signature
      else if (matches(identifier, ['typed signature', 'electronic signature', 'e-signature', 'electronicsignature', 'type your name to sign', 'type full legal name', 'applicant_signature', 'legal_signature', 'applicantsignature']) || (matches(identifier, ['signature']) && !matches(identifier, ['date']))) {
        const candidateName = p.name || p.fullName || `${p.firstName || ''} ${p.lastName || ''}`.trim() || '';
        if (candidateName) {
          fillQueue.push({ element: input, type: 'text', value: candidateName, label: 'Typed Signature' });
        }
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
      // EEO: Sexual Orientation Dropdown (Pinpoint ATS & modern company forms)
      else if (matches(identifier, ['sexual orientation', 'sexual_orientation', 'sexual-orientation'])) {
        if (input.tagName === 'SELECT') {
          fillQueue.push({ element: input, type: 'select', value: ['prefer not to say', 'choose not to disclose', 'decline', 'heterosexual', 'straight'], label: 'Sexual Orientation (EEO)' });
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
      const gfQuestionBlocks = window.querySelectorAllDeep('.Qr7Oae, [role="listitem"], .freebirdFormviewerComponentsQuestionBaseRoot');

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
            let val = p.linkedin || '';
            if (val && !val.startsWith('http://') && !val.startsWith('https://')) val = 'https://' + val;
            if (val) fillQueue.push({ element: inputEl, type: 'text', value: val, label: 'LinkedIn URL' });
          }
          // GitHub / Portfolio URL
          else if (matches(qText, ['github', 'portfolio'])) {
            let val = p.github || p.portfolio || '';
            if (val && !val.startsWith('http://') && !val.startsWith('https://')) val = 'https://' + val;
            if (val) fillQueue.push({ element: inputEl, type: 'text', value: val, label: 'GitHub / Portfolio' });
          }
          // Resume / CV URL (shareable link)
          else if (matches(qText, ['résumé', 'resume', 'cv url', 'cv link', 'shareable link', 'drive link'])) {
            let val = p.resumeUrl || p.cvUrl || p.resumeDriveUrl || '';
            if (val && !val.startsWith('http://') && !val.startsWith('https://')) val = 'https://' + val;
            if (val) fillQueue.push({ element: inputEl, type: 'text', value: val, label: 'Resume URL' });
          }
          // Earliest start date → next nearest Monday
          else if (matches(qText, ['start date', 'earliest', 'joining date', 'date of joining'])) {
            fillQueue.push({ element: inputEl, type: 'text', value: getNextMonday(), label: 'Start Date' });
          }
          // Current Monthly / Current Salary
          else if (matches(qText, ['current monthly salary', 'current salary', 'current ctc', 'current pay', 'present salary', 'present ctc']) || (qText.includes('current') && matches(qText, ['salary', 'ctc', 'pay', 'compensation']))) {
            const isNumOnly = inputEl.type === 'number' || inputEl.getAttribute('inputmode') === 'numeric';
            const val = isNumOnly ? '0' : '0 (Fresher / Recent Graduate)';
            fillQueue.push({ element: inputEl, type: 'text', value: val, label: 'Current Salary' });
          }
          // Expected monthly compensation in INR (e.g. ₹45,000 - ₹50,000 / month for fresher)
          else if (matches(qText, ['monthly compensation', 'per month', 'monthly salary', 'monthly in inr', 'compensation in inr'])) {
            const isNumOnly = inputEl.type === 'number' || inputEl.getAttribute('inputmode') === 'numeric';
            const val = isNumOnly ? '45000' : '₹45,000 – ₹50,000 / month (Negotiable)';
            fillQueue.push({ element: inputEl, type: 'text', value: val, label: 'Monthly Compensation' });
          }
          // Expected compensation / salary (Dynamic estimation)
          else if (matches(qText, ['compensation', 'salary', 'expected', 'ctc', 'pay'])) {
            const val = getEstimatedSalary(inputEl, p);
            fillQueue.push({ element: inputEl, type: 'text', value: String(val), label: 'Expected Compensation' });
          }
          // Notice period / availability
          else if (matches(qText, ['notice period', 'availability', 'working-hour', 'working hour'])) {
            fillQueue.push({ element: inputEl, type: 'text', value: 'No notice period. Available immediately, 9 AM – 6 PM IST on weekdays.', label: 'Notice Period' });
          }
          // Link to project / repository (Different from root GitHub profile, uses web app priority repos)
          else if (matches(qText, ['link to one', 'link to', 'repository', 'walkthrough', 'product you', 'product, repository', 'repo url', 'code repository'])) {
            let val = getPriorityRepoUrl(p, qText);
            fillQueue.push({ element: inputEl, type: 'text', value: val, label: 'Project Link' });
          }
          // Open-ended screening questions (technical essays, design questions, architecture)
          else if (textarea || matches(qText, ['describe', 'explain', 'what', 'give one', 'how', 'show or', 'state your', 'built', 'bug', 'webhook', 'schema', 'system', 'trace'])) {
            const rawQ = (heading?.textContent || qText).replace(/\*$/, '').trim();
            fillQueue.push({
              element: inputEl,
              type: 'ai_generate',
              question: rawQ,
              label: rawQ.slice(0, 32)
            });
          }
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
          // How soon can you join if selected / notice period
          else if (matches(qText, ['how soon', 'join', 'start date', 'when can you', 'availability', 'notice period', 'earliest'])) {
            targetValue = 'within 1 week';
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
              return rText.includes(targetValue) || targetValue.includes(rText) ||
                (targetValue === 'within 1 week' && (rText.includes('1 week') || rText.includes('immediate') || rText.includes('immediately') || rText.includes('within 1'))) ||
                (targetValue === '1–2' && (rText.includes('1-2') || rText.includes('1–2') || rText.includes('1 to 2'))) ||
                (targetValue === 'under 1' && (rText.includes('under 1') || rText.includes('< 1') || rText.includes('less than 1')));
            });
            if (matchRadio) {
              fillQueue.push({ element: matchRadio, type: 'gf_radio', label: heading?.textContent || 'Radio' });
            }
          }
        }

        // --- CHECKBOX MATCHING ---
        if (checkboxOptions.length > 0) {
          // Consent / Confirmation checkbox (e.g. "I confirm that the information provided by me is accurate and complete...")
          if (matches(qText, ['confirm', 'consent', 'accurate and complete', 'terms', 'privacy', 'acknowledge', 'truthful', 'certify', 'agreement'])) {
            checkboxOptions.forEach(cb => {
              const isAlreadyChecked = cb.getAttribute('aria-checked') === 'true' || cb.checked;
              if (!isAlreadyChecked) {
                fillQueue.push({ element: cb, type: 'gf_checkbox', label: 'Consent / Confirmation' });
              }
            });
          }
          // Frontend / Backend skill areas → match from profile skills
          else if (matches(qText, ['frontend', 'backend', 'areas', 'demonstrate', 'skills', 'technologies'])) {
            const profileSkills = (p.skills || []).map(s => s.toLowerCase());
            const profileRepos = (p.githubInsights?.repos || []).map(r => (r.language || '').toLowerCase());
            const allKnown = [...profileSkills, ...profileRepos];

            checkboxOptions.forEach(cb => {
              const cbText = (cb.getAttribute('data-answer-value') || cb.textContent || '').toLowerCase().trim();
              if (cbText.includes('other') || cbText.includes('__other')) return;
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
    const radios = window.querySelectorAllDeep('input[type="radio"]', scope)
      .filter(r => !r.closest('#ai-copilot-sidebar') && !r.closest('#ai-copilot-dock-tab') && isElementVisible(r));

    const processedRadioGroups = new Set();

    radios.forEach(radio => {
      const container = getRadioQuestionContainer(radio);
      const groupKey = radio.name || container;
      if (processedRadioGroups.has(groupKey)) return;

      const containerText = ((container?.textContent || '') + ' ' + (radio.name || '')).toLowerCase();
      const groupRadios = container ? window.querySelectorAllDeep('input[type="radio"]', container) : [radio];

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
      if (containerText.includes('authorized to work') || containerText.includes('legally authorized') || containerText.includes('legal right to work') || containerText.includes('work in the country')) {
        const want = p.authorizedToWork !== false ? 'yes' : 'no';
        if (selectMatchingRadio(want, `Work Authorization (${want.toUpperCase()})`)) return;
      }
      // 2. Visa sponsorship
      else if (containerText.includes('sponsorship') || containerText.includes('require visa')) {
        const want = p.requireSponsorship ? 'yes' : 'no';
        if (selectMatchingRadio(want, `Visa Sponsorship (${want.toUpperCase()})`)) return;
      }
      // 3. Former employee / previously worked / Current or previous employee
      else if (
        containerText.includes('previously worked') ||
        containerText.includes('former employee') ||
        containerText.includes('have you worked') ||
        containerText.includes('currently employed') ||
        containerText.includes('current or previous employee') ||
        containerText.includes('previous employee') ||
        containerText.includes('employed by ingersoll') ||
        containerText.includes('employed by gardner')
      ) {
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
      else if (containerText.includes('18 years') || containerText.includes('at least 18') || containerText.includes('age of 18') || containerText.includes('currently 18') || containerText.includes('18 years or older')) {
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
      // 10b. Commute / On-Site Setting / In-Person (LinkedIn Easy Apply, Lever & Custom ATS)
      else if (containerText.includes('commute') || containerText.includes('commuting') || containerText.includes('on-site') || containerText.includes('in-person') || containerText.includes('comfortable commuting') || containerText.includes('comfortable with working') || containerText.includes('working from') || containerText.includes('work from office')) {
        if (selectMatchingRadio('yes', 'Commute / On-Site (YES)')) return;
      }
      // 10c. Pass-out / Graduation year eligibility (e.g. "Which Year pass out are you ? Is it 2025 or 2026 ?")
      else if (containerText.includes('pass out') || containerText.includes('passout') || containerText.includes('graduating') || containerText.includes('batch of') || containerText.includes('2025 or 2026')) {
        if (selectMatchingRadio('yes', 'Passout Year / Batch Eligibility (YES)')) return;
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
    const checkboxes = window.querySelectorAllDeep('input[type="checkbox"], [role="checkbox"]', scope)
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

    // Ensure Country is processed before State/Province so dependent state lists unlock
    fillQueue.sort((a, b) => {
      const aIsCountry = (a.label || '').toLowerCase().includes('country');
      const bIsCountry = (b.label || '').toLowerCase().includes('country');
      if (aIsCountry && !bIsCountry) return -1;
      if (!aIsCountry && bIsCountry) return 1;
      return 0;
    });

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
          try { activeItemEl?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' }); } catch (_) {}
          const iconEl = activeItemEl.querySelector('.ai-check-icon-pending, .ai-check-icon-filled, .ai-check-icon-active');
          if (iconEl) {
            iconEl.className = 'ai-check-icon-active';
            iconEl.textContent = '';
          }
        }

        if (item.type === 'text') {
          await typeTextHumanLike(item.element, item.value);
        } else if (item.type === 'combobox') {
          await typeComboboxHumanLike(item.element, item.value);
          if ((item.label || '').toLowerCase().includes('country')) {
            await sleep(60);
          }
        } else if (item.type === 'select') {
          if (Array.isArray(item.value)) {
            await selectOptionHumanLike(item.element, item.value);
          } else {
            await selectOptionHumanLike(item.element, [item.value]);
          }
          if ((item.label || '').toLowerCase().includes('country')) {
            await sleep(60);
          }
        } else if (item.type === 'radio') {
          await clickRadioHumanLike(item.element);
        } else if (item.type === 'checkbox') {
          await clickCheckboxHumanLike(item.element);
        } else if (item.type === 'uncheck') {
          await uncheckCheckboxHumanLike(item.element);
        } else if (item.type === 'file') {
          await attachResumeFile(item.element, item.value);
        } else if (item.type === 'file_resume' || item.type === 'file_cover_letter') {
          await attachDocumentFile(item.element, item.base64, item.filename, item.type === 'file_resume' ? 'resume' : 'cover_letter');
        } else if (item.type === 'aria_combobox') {
          await selectComboboxOptionHumanLike(item.element, Array.isArray(item.value) ? item.value : [item.value]);
        } else if (item.type === 'datepicker') {
          await selectDatepickerHumanLike(item.element, item.dateObj || getNextMondayDateObj());
        } else if (item.type === 'skill_pills') {
          await fillSkillPillsHumanLike(item.element, item.skills);
        } else if (item.type === 'gf_radio') {
          // Google Forms radio: click the label / div[role="radio"] element
          try { item.element.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (_) {}
          const clickTarget = item.element.closest('.docssharedWizToggleLabeledContainer, label') || item.element.querySelector('.vd3tt, .AB7Lab') || item.element;
          clickTarget.click();
          item.element.click();
          item.element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
          await sleep(40);
        } else if (item.type === 'gf_checkbox') {
          // Google Forms checkbox: click the label / div[role="checkbox"] element
          try { item.element.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (_) {}
          const clickTarget = item.element.closest('.docssharedWizToggleLabeledContainer, label') || item.element.querySelector('.vd3tt, .uHMk6b') || item.element;
          clickTarget.click();
          item.element.click();
          item.element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
          await sleep(40);
        } else if (item.type === 'ai_generate') {
          try {
            try { item.element.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (_) {}
            item.element.classList.add('ai-field-typing-focus');
            const jobInfo = extractJobDetails();
            const constraints = getElementFieldConstraints(item.element);
            const res = await safeMsg({
              action: 'GENERATE_ANSWER',
              payload: {
                question: item.question,
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
            }
          } catch (err) {
            console.warn('[Copilot] AI field generation notice:', err);
          } finally {
            item.element.classList.remove('ai-field-typing-focus');
            await sleep(50);
          }
        }

        // Google Forms: clear validation errors after each field fill
        if (isGoogleForm()) {
          const questionBlock = item.element.closest('.Qr7Oae, [role="listitem"]');
          if (questionBlock) {
            const errorDiv = questionBlock.querySelector('[role="alert"], .dDABCe, .RHiLvd');
            if (errorDiv) errorDiv.style.display = 'none';
          }
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
      refreshAuditList(true);
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

      // DO NOT learn long essays or dynamic screening questions into the Brain!
      // AI-generated technical questions, architecture walkthroughs, and coding prompts
      // must remain dynamic and be tailored to each specific job description and company!
      if (
        target.tagName === 'TEXTAREA' ||
        val.length > 120 ||
        matches(normKey, [
          'describe', 'explain', 'what exactly', 'trace', 'webhook', 'schema', 'bug', 'architecture',
          'walkthrough', 'challenge', 'tell us', 'how have you', 'give one', 'show or', 'built',
          'coding assistant', 'creative workflow', 'product-data', 'marketplace', 'e-commerce',
          'idempotency', 'first three things', 'price or stock', 'difficult bug'
        ])
      ) {
        return;
      }

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
      safeMsg({
        action: 'SAVE_BRAIN_RULE',
        payload: {
          fieldKey: label,
          domain: host,
          value: val
        }
      });
    }, true);
  }

  // 10.5 Detect Active Application Page / Step (See the page where it is)
  function detectApplicationStep() {
    // 1. Check for active step element in steppers / progress indicators
    const activeStepEl = document.querySelector(
      '.wd-step.active, [aria-current="step"], [data-automation-id*="activeStep" i], .step-item.active, .step.active, li[class*="active"][class*="step" i]'
    );

    const allSteps = window.querySelectorAllDeep(
      '.wd-step, [data-automation-id*="stepItem" i], .step-item, ol.stepper li, .steps-container > div'
    ).filter(el => isElementVisible(el));

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

    // 1b. LinkedIn Easy Apply Modal Step Detection
    const activeModal = typeof getActiveApplicationModal === 'function' ? getActiveApplicationModal() : null;
    const isLinkedIn = window.location.hostname.includes('linkedin.com') || !!document.querySelector('.jobs-easy-apply-modal, [data-test-modal-id="easy-apply-modal"], .jobs-easy-apply-content');

    let pageActionBtn = null;

    if (isLinkedIn && activeModal) {
      // Step title from modal header
      const headerTitle = activeModal.querySelector('h3#jobs-apply-header, h2.artdeco-modal__header, .jobs-easy-apply-modal h3, .t-16.t-bold, h3, h2');
      if (headerTitle && headerTitle.textContent.trim()) {
        stepName = headerTitle.textContent.replace(/[\*\:\?]/g, '').trim();
      }

      // Check for section subheader (e.g. "Additional Questions", "Contact info", "Work experience")
      const subHeader = activeModal.querySelector('h3, h4, .jobs-easy-apply-modal h3, .jobs-easy-apply-modal h4, .t-16');
      if (subHeader && subHeader.textContent.trim()) {
        const subTxt = subHeader.textContent.replace(/[\*\:\?]/g, '').trim();
        if (subTxt.length > 2 && !subTxt.toLowerCase().includes('apply to')) {
          stepName = subTxt;
        }
      }

      // Page text counter e.g. "3/4 pages" or "Step 3 of 4"
      const modalText = activeModal.innerText || activeModal.textContent || '';
      const pageMatch = modalText.match(/(\d+)\s*\/\s*(\d+)\s*pages?/i);
      if (pageMatch) {
        stepNum = parseInt(pageMatch[1], 10);
        totalSteps = parseInt(pageMatch[2], 10);
      } else {
        // Progress bar / meter
        const progressMeter = activeModal.querySelector('.artdeco-completeness-meter-bar, progress, [aria-valuenow]');
        if (progressMeter) {
          const val = parseInt(progressMeter.getAttribute('aria-valuenow') || progressMeter.value, 10);
          if (val) {
            totalSteps = 4;
            if (val <= 25) stepNum = 1;
            else if (val <= 50) stepNum = 2;
            else if (val <= 75) stepNum = 3;
            else stepNum = 4;
          }
        }
      }

      // LinkedIn action buttons inside the modal footer
      const linkedinSubmit = activeModal.querySelector('button[aria-label="Submit application"], button[aria-label="Submit"]');
      const linkedinReview = activeModal.querySelector('button[aria-label="Review your application"], button[aria-label="Review"]');
      const linkedinNext = activeModal.querySelector('button[aria-label="Continue to next step"], button[data-easy-apply-next-button], footer button.artdeco-button--primary');

      if (linkedinSubmit && isElementVisible(linkedinSubmit)) {
        pageActionBtn = linkedinSubmit;
      } else if (linkedinReview && isElementVisible(linkedinReview)) {
        pageActionBtn = linkedinReview;
      } else if (linkedinNext && isElementVisible(linkedinNext)) {
        pageActionBtn = linkedinNext;
      }
    }

    // Check for on-page action/submit button (Standard ATS)
    if (!pageActionBtn) {
      const nextBtnSelectors = [
        '#btnSubmitApplication',
        'button[data-automation-id="bottom-navigation-next-button"]',
        'button[data-automation-id="page-navigation-next-button"]',
        'button[data-automation-id="next-button"]',
        'button[type="submit"]',
        'input[type="submit"]',
        'button.template-btn-submit',
        'button.btn-next',
        'div[role="button"][jsname="M2CFlb"]',
        'div[role="button"][jsname="OCpkoe"]',
        '.uArJ5e.UQuaGc'
      ];

      pageActionBtn = window.querySelectorAllDeep(nextBtnSelectors.join(','))
        .find(b => !b.closest('#ai-copilot-sidebar') && !b.closest('#ai-copilot-dock-tab') && isElementVisible(b));
    }

    if (!pageActionBtn && isGoogleForm()) {
      pageActionBtn = window.querySelectorAllDeep('div[role="button"]')
        .find(b => {
          if (b.closest('#ai-copilot-sidebar') || b.closest('#ai-copilot-dock-tab') || !isElementVisible(b)) return false;
          const t = (b.textContent || '').trim().toLowerCase();
          return t === 'submit' || t === 'next' || t.includes('submit');
        });
    }

    if (!pageActionBtn) {
      // YC Work at a Startup modal / single-page application button
      const modalBtn = window.querySelectorAllDeep('.modal button, [role="dialog"] button, button')
        .find(b => {
          if (b.closest('#ai-copilot-sidebar') || b.closest('#ai-copilot-dock-tab') || !isElementVisible(b)) return false;
          const t = (b.textContent || '').trim().toLowerCase();
          return t === 'send' || t === 'send application' || t === 'submit application' || t === 'apply now';
        });
      if (modalBtn) pageActionBtn = modalBtn;
    }

    const onPageActionText = pageActionBtn ? (pageActionBtn.textContent || pageActionBtn.value || pageActionBtn.getAttribute('aria-label') || '').trim() : '';
    const onPageActionLower = onPageActionText.toLowerCase();

    const isFinalStep = isSubmitted ||
      (stepNum >= totalSteps && totalSteps > 1) ||
      onPageActionLower.includes('submit') ||
      onPageActionLower === 'send' ||
      onPageActionLower.includes('send') ||
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
    try {
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

      const detected = [];

      // 2. Google Forms Special Case: Scan structured .Qr7Oae question cards
      if (isGoogleForm()) {
        const gfBlocks = window.querySelectorAllDeep('.Qr7Oae, [role="listitem"]');
        gfBlocks.forEach(block => {
          const heading = block.querySelector('.M7eMe, [role="heading"], .freebirdFormviewerComponentsQuestionBaseTitle');
          let qLabel = heading?.textContent?.replace(/[\*\:\?]/g, '')?.trim() || '';
          qLabel = qLabel.replace(/\(required[^\)]*\)/gi, '').trim();
          if (!qLabel || qLabel.length < 2 || detected.some(d => d.label.toLowerCase() === qLabel.toLowerCase())) return;

          const textInput = block.querySelector('input.whsOnd, textarea.KHxj8b, textarea, input:not([type="hidden"])');
          const radioChecked = block.querySelector('[role="radio"][aria-checked="true"]');
          const radioGroup = block.querySelector('[role="radiogroup"], [role="radio"]');
          const checkboxChecked = block.querySelector('[role="checkbox"][aria-checked="true"]');
          const checkboxGroup = block.querySelector('[role="checkbox"]');

          let isFilled = false;
          let elem = textInput || radioGroup || checkboxGroup || block;
          let type = 'text';

          if (textInput) {
            isFilled = !!(textInput.value && textInput.value.trim().length > 0);
            type = textInput.tagName.toLowerCase();
          } else if (radioGroup) {
            isFilled = !!radioChecked;
            type = 'radio';
          } else if (checkboxGroup) {
            isFilled = !!checkboxChecked;
            type = 'checkbox';
          }

          detected.push({ element: elem, label: qLabel, isFilled, type });
        });
      }

      // 3. Scan visible interactive form controls on the active page (General ATS & Active Modal)
      let activeModal = typeof getActiveApplicationModal === 'function' ? getActiveApplicationModal() : null;
      let scope = activeModal || document;

      // Safe fallback: if activeModal contains 0 candidate inputs, fall back to document immediately
      if (activeModal) {
        const testInputs = window.querySelectorAllDeep('input:not([type="hidden"]), select, textarea', activeModal)
          .filter(el => !el.closest('#ai-copilot-sidebar') && !el.closest('#ai-copilot-dock-tab') && isElementVisible(el));
        if (testInputs.length === 0) {
          scope = document;
          activeModal = null;
        }
      }

      if (detected.length === 0) {
        let inputs = window.querySelectorAllDeep('input:not([type="hidden"]):not([type="submit"]):not([type="button"]), select, textarea', scope)
          .filter(el => !el.closest('#ai-copilot-sidebar') && !el.closest('#ai-copilot-dock-tab') && !el.id?.startsWith('prof-') && !el.id?.startsWith('ai-') && !el.name?.startsWith('prof-') && isElementVisible(el));

        // If scoped modal found 0 inputs, fall back to full document scan
        if (inputs.length === 0 && scope !== document) {
          scope = document;
          activeModal = null;
          inputs = window.querySelectorAllDeep('input:not([type="hidden"]):not([type="submit"]):not([type="button"]), select, textarea', scope)
            .filter(el => !el.closest('#ai-copilot-sidebar') && !el.closest('#ai-copilot-dock-tab') && !el.id?.startsWith('prof-') && !el.id?.startsWith('ai-') && !el.name?.startsWith('prof-') && isElementVisible(el));
        }

        inputs.forEach(inp => {
          const label = getCleanFieldLabel(inp);
          if (label && label.length >= 2 && !detected.some(d => d.label === label)) {
            let isFilled = false;
            if (inp.type === 'radio') {
              const group = inp.name ? window.querySelectorAllDeep(`input[type="radio"][name="${inp.name}"]`) : [inp];
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
            } else if (inp.tagName === 'SELECT') {
              const selectedOpt = inp.selectedIndex >= 0 ? inp.options[inp.selectedIndex] : null;
              isFilled = !isPlaceholderOption(selectedOpt);
            } else if (label === 'Founder Outreach Note') {
              isFilled = !!(inp.value && inp.value.trim().length >= 50);
            } else {
              isFilled = !!(inp.value && inp.value.trim().length > 0);
            }
            detected.push({ element: inp, label, isFilled, type: inp.type || inp.tagName.toLowerCase() });
          }
        });
      }

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
      const isATSContext = isGoogleForm() || !!activeModal || stepInfo.isFinalStep || stepInfo.isSubmitted || !!document.querySelector('.wd-stepper, [data-automation-id*="step" i], .wd-container, .freebirdFormviewerViewFormCard');
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
              : (targetItem.element.closest?.('.Qr7Oae, [role="listitem"]') || targetItem.element);

            if (scrollTarget && typeof scrollTarget.scrollIntoView === 'function') {
              if (activeModal && activeModal.contains(scrollTarget)) {
                scrollTarget.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
              } else {
                scrollTarget.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }
              scrollTarget.classList.add('ai-field-typing-focus');
              try { targetItem.element.focus?.({ preventScroll: true }); } catch (_) { }

              itemEl.classList.add('ai-item-clicked');
              setTimeout(() => {
                try {
                  scrollTarget.classList.remove('ai-field-typing-focus');
                  itemEl.classList.remove('ai-item-clicked');
                } catch (_) { }
              }, 1800);
            }
          }
        });
      });

      // Keep screening questions synced at the bottom of Autofill tab
      refreshQuestionsUI();
    } catch (err) {
      console.warn('[Copilot Audit Notice]', err);
    }
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
      const pageSubmitBtn = window.querySelectorAllDeep(submitBtnSelectors.join(','))
        .find(b => !b.closest('#ai-copilot-sidebar') && !b.closest('#ai-copilot-dock-tab') && isElementVisible(b));

      if (pageSubmitBtn) {
        try { pageSubmitBtn.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (_) {}
        pageSubmitBtn.classList.add('ai-field-typing-focus');
        await sleep(350);
        pageSubmitBtn.classList.remove('ai-field-typing-focus');
        pageSubmitBtn.click();

        showToast('🎉 Application submitted successfully!', 'success', 6000);

        try {
          const job = extractJobDetails();
          safeMsg({
            action: 'LOG_JOB',
            payload: {
              company: job.company || 'Enterprise ATS',
              role: job.role || 'Full Stack Engineer',
              url: window.location.href,
              status: 'Applied',
              notes: 'Submitted via 1-Click AI Copilot'
            }
          });
        } catch (_) { }

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
    const candidateNextButtons = window.querySelectorAllDeep(
      `#btnStep${initialStepNum}Next, button[data-automation-id="bottom-navigation-next-button"], button[data-automation-id="page-navigation-next-button"], button[data-automation-id="next-button"], button[type="submit"], .btn-next`
    ).filter(b => !b.closest('#ai-copilot-sidebar') && !b.closest('#ai-copilot-dock-tab') && isElementVisible(b));

    const onPageNextBtn = document.getElementById(`btnStep${initialStepNum}Next`) || candidateNextButtons[0] || stepInfo.pageActionBtn;

    if (!onPageNextBtn) {
      showToast('Could not find on-page Continue button', 'error');
      if (nextBtn) nextBtn.disabled = false;
      return;
    }

    // Scroll to and click on-page Next / Continue button
    try { onPageNextBtn.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (_) {}
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


  // Export to window and window.AiCopilot
  window.getPriorityRepoUrl = getPriorityRepoUrl;
  window.typeTextHumanLike = typeTextHumanLike;
  window.isPlaceholderOption = isPlaceholderOption;
  window.setSelectValueNative = setSelectValueNative;
  window.selectOptionHumanLike = selectOptionHumanLike;
  window.selectComboboxOptionHumanLike = selectComboboxOptionHumanLike;
  window.selectDatepickerHumanLike = selectDatepickerHumanLike;
  window.typeComboboxHumanLike = typeComboboxHumanLike;
  window.clickRadioHumanLike = clickRadioHumanLike;
  window.clickCheckboxHumanLike = clickCheckboxHumanLike;
  window.uncheckCheckboxHumanLike = uncheckCheckboxHumanLike;
  window.attachDocumentFile = attachDocumentFile;
  window.attachResumeFile = attachResumeFile;
  window.classifyFileInputSlot = classifyFileInputSlot;
  window.buildCoverLetterText = buildCoverLetterText;
  window.textToPdfBase64 = textToPdfBase64;
  window.fillSkillPillsHumanLike = fillSkillPillsHumanLike;
  window.isCandidateCurrentlyEmployed = isCandidateCurrentlyEmployed;
  window.calculateExperienceFromProfile = calculateExperienceFromProfile;
  window.expandAndActivateSections = expandAndActivateSections;
  window.detectAndFillCreateAccount = detectAndFillCreateAccount;
  window.generateStrongPassword = generateStrongPassword;
  window.expandCollapsedSections = expandCollapsedSections;
  window.getEstimatedSalary = getEstimatedSalary;
  window.autofillForm = autofillForm;
  window.initBrainListener = initBrainListener;
  window.detectApplicationStep = detectApplicationStep;
  window.updateNextPageButtonUI = updateNextPageButtonUI;
  window.refreshAuditList = refreshAuditList;
  window.goToNextPage = goToNextPage;

  window.AiCopilot = window.AiCopilot || {};
  Object.assign(window.AiCopilot, {
    getPriorityRepoUrl,
    typeTextHumanLike,
    isPlaceholderOption,
    setSelectValueNative,
    selectOptionHumanLike,
    selectComboboxOptionHumanLike,
    selectDatepickerHumanLike,
    typeComboboxHumanLike,
    clickRadioHumanLike,
    clickCheckboxHumanLike,
    uncheckCheckboxHumanLike,
    attachDocumentFile,
    attachResumeFile,
    classifyFileInputSlot,
    buildCoverLetterText,
    textToPdfBase64,
    fillSkillPillsHumanLike,
    isCandidateCurrentlyEmployed,
    calculateExperienceFromProfile,
    expandAndActivateSections,
    detectAndFillCreateAccount,
    generateStrongPassword,
    expandCollapsedSections,
    getEstimatedSalary,
    autofillForm,
    initBrainListener,
    detectApplicationStep,
    updateNextPageButtonUI,
    refreshAuditList,
    goToNextPage
  });
})();
