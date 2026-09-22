// Popup Controller for AI Job Application Copilot & Autofill

document.addEventListener('DOMContentLoaded', async () => {
  const statusBadge = document.getElementById('statusBadge');
  const statusText = document.getElementById('statusText');
  const noticeBanner = document.getElementById('noticeBanner');
  const profileSection = document.getElementById('profileSection');
  const authSection = document.getElementById('authSection');
  const actionsSection = document.getElementById('actionsSection');

  const profileName = document.getElementById('profileName');
  const profileRole = document.getElementById('profileRole');
  const profileEmail = document.getElementById('profileEmail');
  const profilePhone = document.getElementById('profilePhone');
  const profileLinks = document.getElementById('profileLinks');
  const skillsContainer = document.getElementById('skillsContainer');

  const btnAutoSync = document.getElementById('btnAutoSync');
  const btnToggleManualToken = document.getElementById('btnToggleManualToken');
  const manualTokenBox = document.getElementById('manualTokenBox');
  const tokenInput = document.getElementById('tokenInput');
  const btnSaveManualToken = document.getElementById('btnSaveManualToken');
  const btnOpenSidebarCurrentTab = document.getElementById('btnOpenSidebarCurrentTab');
  const btnAutofillCurrentTab = document.getElementById('btnAutofillCurrentTab');
  const btnLogJobCurrentTab = document.getElementById('btnLogJobCurrentTab');
  const toggleFloatingWidget = document.getElementById('toggleFloatingWidget');

  btnOpenSidebarCurrentTab?.addEventListener('click', async () => {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!activeTab || !activeTab.id) return;
    try {
      await chrome.tabs.sendMessage(activeTab.id, { action: 'OPEN_SIDEBAR' });
      window.close();
    } catch (err) {
      try {
        await chrome.scripting.executeScript({
          target: { tabId: activeTab.id, allFrames: true },
          files: ['content.js']
        });
        await chrome.scripting.insertCSS({
          target: { tabId: activeTab.id, allFrames: true },
          files: ['content.css']
        });
        setTimeout(async () => {
          await chrome.tabs.sendMessage(activeTab.id, { action: 'OPEN_SIDEBAR' });
          window.close();
        }, 250);
      } catch (injectErr) {
        showNotice('Please refresh your job application tab to open the sidebar.', 'warning');
      }
    }
  });

  function showNotice(msg, type = 'info', duration = 3500) {
    noticeBanner.textContent = msg;
    noticeBanner.className = `notice ${type}`;
    noticeBanner.style.display = 'flex';
    if (duration > 0) {
      setTimeout(() => {
        noticeBanner.style.display = 'none';
      }, duration);
    }
  }

  // Load floating widget preference
  chrome.storage.local.get(['show_floating_widget'], (res) => {
    toggleFloatingWidget.checked = res.show_floating_widget !== false;
  });

  toggleFloatingWidget.addEventListener('change', (e) => {
    chrome.storage.local.set({ show_floating_widget: e.target.checked });
  });

  // Toggle manual token box
  btnToggleManualToken.addEventListener('click', () => {
    manualTokenBox.style.display = manualTokenBox.style.display === 'block' ? 'none' : 'block';
  });

  // Save manual token
  btnSaveManualToken.addEventListener('click', async () => {
    const val = tokenInput.value.trim();
    if (!val) {
      showNotice('Please enter a valid token', 'error');
      return;
    }
    const res = await chrome.runtime.sendMessage({ action: 'SAVE_TOKEN', payload: { token: val } });
    if (res?.success) {
      showNotice('Token saved! Verifying connection...', 'success');
      manualTokenBox.style.display = 'none';
      await init();
    }
  });

  // Auto-sync token from active web app session
  btnAutoSync.addEventListener('click', async () => {
    btnAutoSync.disabled = true;
    btnAutoSync.textContent = 'Syncing...';
    try {
      const res = await chrome.runtime.sendMessage({ action: 'AUTO_SYNC_TOKEN' });
      if (res?.success) {
        showNotice('✓ Synced account from web app!', 'success');
        await init();
      } else {
        showNotice(res?.error || 'Could not find active session on web app', 'error', 5000);
      }
    } catch (err) {
      showNotice('Sync error: ' + err.message, 'error');
    } finally {
      btnAutoSync.disabled = false;
      btnAutoSync.innerHTML = '<span>🔄</span><span>Auto-Sync Token from Web App</span>';
    }
  });

  // 1-Click Autofill Active Page
  btnAutofillCurrentTab.addEventListener('click', async () => {
    btnAutofillCurrentTab.disabled = true;
    btnAutofillCurrentTab.innerHTML = '<span>⏳</span><span>Filling Form...</span>';
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.id) throw new Error('No active tab');

      const res = await chrome.tabs.sendMessage(tab.id, { action: 'DO_AUTOFILL' });
      if (res?.success) {
        showNotice(`✓ Autofilled ${res.fieldsFilled || 0} fields on this page!`, 'success');
      } else {
        showNotice(res?.message || 'No supported application form detected on this page.', 'info');
      }
    } catch (err) {
      showNotice('Form autofill failed: ' + (err.message || 'Make sure page is fully loaded'), 'error');
    } finally {
      btnAutofillCurrentTab.disabled = false;
      btnAutofillCurrentTab.innerHTML = '<span>⚡</span><span>Autofill Application Form</span>';
    }
  });

  // Log Current Job to Tracker
  btnLogJobCurrentTab.addEventListener('click', async () => {
    btnLogJobCurrentTab.disabled = true;
    btnLogJobCurrentTab.innerHTML = '<span>⏳</span><span>Logging Job...</span>';
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.id) throw new Error('No active tab');

      // Request job info extraction from page
      const pageInfo = await chrome.tabs.sendMessage(tab.id, { action: 'EXTRACT_JOB_INFO' }).catch(() => ({}));
      
      const company = pageInfo?.company || extractCompanyFromUrl(tab.url) || tab.title.split(/[-|]/)[0]?.trim() || 'Unknown Company';
      const role = pageInfo?.role || tab.title.split(/[-|]/)[1]?.trim() || 'Software Engineer';

      const res = await chrome.runtime.sendMessage({
        action: 'LOG_JOB',
        payload: {
          company,
          role,
          url: tab.url,
          status: 'Applied',
          notes: 'Auto-logged via Chrome Extension'
        }
      });

      if (res?.success) {
        showNotice(`✓ Logged "${company}" to Applied Jobs!`, 'success');
      } else {
        showNotice(res?.error || 'Failed to log job', 'error');
      }
    } catch (err) {
      showNotice('Error logging job: ' + err.message, 'error');
    } finally {
      btnLogJobCurrentTab.disabled = false;
      btnLogJobCurrentTab.innerHTML = '<span>💾</span><span>Log Job to Applied Tracker</span>';
    }
  });

  function extractCompanyFromUrl(urlStr) {
    try {
      const u = new URL(urlStr);
      // greenhouse: boards.greenhouse.io/company
      if (u.hostname.includes('greenhouse.io')) {
        const parts = u.pathname.split('/').filter(Boolean);
        if (parts[0]) return formatSlug(parts[0]);
      }
      // lever: jobs.lever.co/company
      if (u.hostname.includes('lever.co')) {
        const parts = u.pathname.split('/').filter(Boolean);
        if (parts[0]) return formatSlug(parts[0]);
      }
      // ashby: jobs.ashbyhq.com/company
      if (u.hostname.includes('ashbyhq.com')) {
        const parts = u.pathname.split('/').filter(Boolean);
        if (parts[0]) return formatSlug(parts[0]);
      }
      return u.hostname.replace(/^www\./, '').split('.')[0];
    } catch (_) {
      return '';
    }
  }

  function formatSlug(slug) {
    return slug.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }

  // Initializer
  async function init() {
    statusBadge.className = 'status-badge offline';
    statusText.textContent = 'Connecting...';

    const statusRes = await chrome.runtime.sendMessage({ action: 'GET_STATUS' });

    if (!statusRes?.success) {
      statusBadge.className = 'status-badge offline';
      statusText.textContent = 'Backend Offline';
      authSection.style.display = 'block';
      profileSection.style.display = 'none';
      actionsSection.style.display = 'none';
      return;
    }

    if (!statusRes.authenticated) {
      // Try silent auto-sync from localhost:5173
      const syncAttempt = await chrome.runtime.sendMessage({ action: 'AUTO_SYNC_TOKEN' });
      if (syncAttempt?.success) {
        return init(); // Re-run with synced token
      }

      statusBadge.className = 'status-badge offline';
      statusText.textContent = 'Not Synced';
      authSection.style.display = 'block';
      profileSection.style.display = 'none';
      actionsSection.style.display = 'none';
      return;
    }

    // Authenticated & Connected!
    statusBadge.className = 'status-badge online';
    statusText.textContent = 'Connected (v1.0)';
    authSection.style.display = 'none';
    profileSection.style.display = 'block';
    actionsSection.style.display = 'block';

    // Load candidate profile
    const profileRes = await chrome.runtime.sendMessage({ action: 'GET_PROFILE' });
    if (profileRes?.success && profileRes.profile) {
      const p = profileRes.profile;
      profileName.textContent = p.fullName || 'Candidate';
      profileRole.textContent = p.title || `${p.experienceLevel || 'Mid'} Software Engineer`;
      profileEmail.textContent = p.email || 'Email not set';
      profilePhone.textContent = p.phone || 'Phone not set';

      const linksArr = [];
      if (p.github) linksArr.push('GitHub');
      if (p.linkedin) linksArr.push('LinkedIn');
      if (p.portfolio) linksArr.push('Portfolio');
      if (p.resumeUrl) linksArr.push('CV Drive');
      profileLinks.textContent = linksArr.length > 0 ? linksArr.join(' • ') : 'No links configured';

      // Render skill chips
      skillsContainer.innerHTML = '';
      if (Array.isArray(p.skills) && p.skills.length > 0) {
        p.skills.slice(0, 6).forEach(sk => {
          const chip = document.createElement('span');
          chip.className = 'skill-chip';
          chip.textContent = sk;
          skillsContainer.appendChild(chip);
        });
      }
    }
  }

  await init();
});
