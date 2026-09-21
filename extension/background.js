// Background Service Worker for AI Job Application Copilot & Autofill
const DEFAULT_API_BASE = 'https://ai-job-finder-7dr8.onrender.com';
const PRODUCTION_WEB_APP = 'https://ai-job-finder-alpha.vercel.app';

async function getStoredSettings() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['ai_job_token', 'ai_job_api_base'], (items) => {
      resolve({
        token: items.ai_job_token || null,
        apiBase: items.ai_job_api_base || DEFAULT_API_BASE
      });
    });
  });
}

function getDefaultProfileTemplate() {
  return {
    fullName: '',
    firstName: '',
    lastName: '',
    fatherName: '',
    preferredName: '',
    email: '',
    phone: '',
    addressLine1: '',
    city: '',
    state: '',
    postalCode: '',
    country: 'India',
    authorizedToWork: true,
    requireSponsorship: false,
    formerEmployee: false,
    title: '',
    linkedin: '',
    github: '',
    portfolio: '',
    skills: []
  };
}

// Resilient API Fetch with Production Cloud & Local Fallback (Auto-detects active server)
async function apiFetch(endpoint, options = {}, preferredBase = DEFAULT_API_BASE) {
  const bases = [
    preferredBase,
    'http://127.0.0.1:5000',
    'http://localhost:5000',
    DEFAULT_API_BASE
  ];
  let lastErr = null;
  for (const base of Array.from(new Set(bases.filter(Boolean)))) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3500);
      const res = await fetch(`${base}${endpoint}`, {
        ...options,
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        return await res.json();
      }
      const errJson = await res.json().catch(() => null);
      if (errJson && (errJson.error || errJson.message)) {
        throw new Error(errJson.error || errJson.message);
      }
      throw new Error(`Server returned HTTP ${res.status}`);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error('Failed to reach backend');
}

// 1. Message Dispatcher
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  handleRequest(request, sender)
    .then(res => sendResponse(res))
    .catch(err => sendResponse({ success: false, error: err.message || 'Unknown background error' }));
  return true; // Keep channel open for async response
});

async function handleRequest(request, sender) {
  const { action, payload } = request;
  const { token, apiBase } = await getStoredSettings();

  switch (action) {
    case 'GET_STATUS': {
      try {
        const headers = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;
        let data = null;
        try {
          data = await apiFetch('/api/extension/status', { headers }, apiBase);
        } catch (_) {
          // Graceful fallback for standard endpoints before extensionRoutes is deployed to Render
          try {
            const prof = await apiFetch('/api/profile', { headers }, apiBase);
            data = {
              success: true,
              server: 'AI Job Finder (Cloud Live)',
              version: '1.0.0',
              authenticated: !!(prof?.profile || prof?._id || prof?.name),
              userEmail: prof?.profile?.email || prof?.email || null
            };
          } catch (_) {
            await apiFetch('/api/ping', {}, apiBase);
            data = {
              success: true,
              server: 'AI Job Finder (Cloud Live)',
              version: '1.0.0',
              authenticated: false,
              userEmail: null
            };
          }
        }
        return { success: true, ...data, hasLocalToken: !!token };
      } catch (err) {
        return { success: false, error: 'Cannot reach backend at ' + apiBase };
      }
    }

    case 'GET_PROFILE': {
      const local = await new Promise(r => chrome.storage.local.get(['ai_copilot_local_profile'], r));
      let localProfile = local.ai_copilot_local_profile || null;

      if (!token) {
        return {
          success: true,
          profile: localProfile || getDefaultProfileTemplate(),
          isLocal: true
        };
      }

      try {
        let data = null;
        try {
          data = await apiFetch('/api/extension/profile', {
            headers: { 'Authorization': `Bearer ${token}` }
          }, apiBase);
        } catch (_) {
          data = await apiFetch('/api/profile', {
            headers: { 'Authorization': `Bearer ${token}` }
          }, apiBase);
          if (data && (data.profile || data.userId || data._id)) {
            data = { success: true, profile: data.profile || data };
          }
        }

        if (data?.success && data.profile) {
          const merged = { ...data.profile, ...(localProfile || {}) };
          chrome.storage.local.set({ ai_copilot_local_profile: merged });
          return { success: true, profile: merged };
        }
        return {
          success: true,
          profile: localProfile || getDefaultProfileTemplate(),
          isLocal: true
        };
      } catch (err) {
        return {
          success: true,
          profile: localProfile || getDefaultProfileTemplate(),
          isLocal: true
        };
      }
    }

    case 'UPDATE_PROFILE': {
      const current = await new Promise(r => chrome.storage.local.get(['ai_copilot_local_profile'], r));
      const updated = { ...(current.ai_copilot_local_profile || {}), ...(payload || {}) };
      await new Promise(r => chrome.storage.local.set({ ai_copilot_local_profile: updated }, r));

      let serverSynced = false;
      if (token) {
        try {
          const data = await apiFetch('/api/extension/profile', {
            method: 'PUT',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload || {})
          }, apiBase);
          if (data?.success) serverSynced = true;
        } catch (syncErr) {
          console.warn('[Copilot Background] Cloud sync failed, saved locally:', syncErr.message);
        }
      }

      return {
        success: true,
        message: serverSynced ? '✓ Profile saved and synced to cloud!' : '✓ Profile saved locally in extension!',
        profile: updated
      };
    }

    case 'GET_BRAIN': {
      // Sanitize rules helper (purge any accidental sidebar profile field keys or malformed email/phone overrides)
      const sanitizeBrainRules = (arr) => (arr || []).filter(r => {
        const k = (r.fieldKey || '').toLowerCase().trim();
        const v = (r.value || '').trim();
        if (k.startsWith('prof-') || k.startsWith('ai-') || k.length < 2) return false;
        // Purge malformed email / phone numbers
        if ((k.includes('email') || k === 'e-mail') && (!v.includes('@') || !v.includes('.'))) return false;
        if ((k.includes('phone') || k.includes('mobile')) && v.replace(/\D/g, '').length < 10) return false;
        return true;
      });

      // Return local cache first (sanitized)
      const localData = await new Promise(r => chrome.storage.local.get(['ai_copilot_brain_rules'], r));
      let localRules = sanitizeBrainRules(localData.ai_copilot_brain_rules);
      chrome.storage.local.set({ ai_copilot_brain_rules: localRules });

      if (!token) {
        return { success: true, learnedRules: localRules };
      }
      try {
        const data = await apiFetch('/api/extension/brain', {
          headers: { 'Authorization': `Bearer ${token}` }
        }, apiBase);
        if (data?.success && data.learnedRules) {
          const remoteRules = sanitizeBrainRules(data.learnedRules);
          const merged = [...localRules];
          remoteRules.forEach(r => {
            if (!merged.some(m => m.fieldKey === r.fieldKey && m.domain === r.domain)) {
              merged.push(r);
            }
          });
          const cleanMerged = sanitizeBrainRules(merged);
          chrome.storage.local.set({ ai_copilot_brain_rules: cleanMerged });
          return { success: true, learnedRules: cleanMerged };
        }
        return { success: true, learnedRules: localRules };
      } catch (err) {
        return { success: true, learnedRules: localRules };
      }
    }

    case 'SAVE_BRAIN_RULE': {
      const fieldKey = (payload?.fieldKey || '').toLowerCase().trim();
      const domain = (payload?.domain || '*').toLowerCase().trim();
      const value = payload?.value || '';

      // Ignore sidebar profile input IDs or empty keys
      if (!fieldKey || fieldKey.startsWith('prof-') || fieldKey.startsWith('ai-') || fieldKey.length < 2) {
        return { success: false, error: 'Sidebar profile fields cannot be saved as brain rules' };
      }

      // Do not save malformed emails or incomplete phone numbers as brain rules
      const valTrimmed = (value || '').trim();
      if ((fieldKey.includes('email') || fieldKey === 'e-mail') && (!valTrimmed.includes('@') || !valTrimmed.includes('.'))) {
        return { success: false, error: 'Incomplete email cannot be saved as brain rule' };
      }
      if ((fieldKey.includes('phone') || fieldKey.includes('mobile')) && valTrimmed.replace(/\D/g, '').length < 10) {
        return { success: false, error: 'Incomplete phone number cannot be saved as brain rule' };
      }

      const localData = await new Promise(r => chrome.storage.local.get(['ai_copilot_brain_rules'], r));
      const sanitize = (arr) => (arr || []).filter(r => {
        const k = (r.fieldKey || '').toLowerCase().trim();
        const v = (r.value || '').trim();
        if (k.startsWith('prof-') || k.startsWith('ai-') || k.length < 2) return false;
        if ((k.includes('email') || k === 'e-mail') && (!v.includes('@') || !v.includes('.'))) return false;
        if ((k.includes('phone') || k.includes('mobile')) && v.replace(/\D/g, '').length < 10) return false;
        return true;
      });
      const rules = sanitize(localData.ai_copilot_brain_rules);

      const idx = rules.findIndex(r => r.fieldKey === fieldKey && r.domain === domain);
      if (idx !== -1) {
        rules[idx].value = value;
        rules[idx].updatedAt = new Date().toISOString();
      } else {
        rules.push({ fieldKey, domain, value, updatedAt: new Date().toISOString() });
      }
      await new Promise(r => chrome.storage.local.set({ ai_copilot_brain_rules: rules }, r));

      if (token) {
        try {
          await apiFetch('/api/extension/brain', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ fieldKey, domain, value })
          }, apiBase);
        } catch (_) {}
      }
      return { success: true, learnedRules: rules };
    }

    case 'DELETE_BRAIN_RULE': {
      const fieldKey = (payload?.fieldKey || '').toLowerCase().trim();
      const domain = (payload?.domain || '*').toLowerCase().trim();

      const localData = await new Promise(r => chrome.storage.local.get(['ai_copilot_brain_rules'], r));
      const rules = (localData.ai_copilot_brain_rules || []).filter(
        r => !(r.fieldKey.toLowerCase() === fieldKey && (domain === '*' || r.domain.toLowerCase() === domain))
      );
      await new Promise(r => chrome.storage.local.set({ ai_copilot_brain_rules: rules }, r));

      if (token) {
        try {
          await apiFetch('/api/extension/brain', {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ fieldKey, domain })
          }, apiBase);
        } catch (_) {}
      }
      return { success: true, learnedRules: rules };
    }

    case 'CLEAR_BRAIN_RULES': {
      await new Promise(r => chrome.storage.local.set({ ai_copilot_brain_rules: [] }, r));
      if (token) {
        try {
          await apiFetch('/api/extension/brain', {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ clearAll: true })
          }, apiBase);
        } catch (_) {}
      }
      return { success: true, learnedRules: [] };
    }

    case 'GENERATE_ANSWER': {
      // Try backend first, then fallback to direct Gemini call
      if (token) {
        try {
          const data = await apiFetch('/api/extension/generate-answer', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload || {})
          }, apiBase);
          if (data?.success && data?.answer) return data;
        } catch (_backendErr) {
          console.warn('[Copilot] Backend generate-answer failed, trying direct Gemini fallback:', _backendErr.message);
        }
      }

      // Direct Gemini API fallback (works without backend)
      try {
        const GEMINI_KEY = 'AIzaSyAhMPJFHJeUcaT4VTFc7VKxLHqFzXJSJPQ';
        const localData = await new Promise(r => chrome.storage.local.get(['ai_copilot_local_profile'], r));
        const profile = localData.ai_copilot_local_profile || {};

        const topSkills = (profile.skills || []).slice(0, 8).join(', ');
        const repos = (profile.githubInsights?.repos || profile.topRepos || [])
          .slice(0, 4)
          .map(r => `${r.name} (${r.language || 'Code'}): ${r.description || 'production app'}`)
          .join('; ');
        const workExp = (profile.workExperience || []).slice(0, 2)
          .map(w => `${w.title || 'Engineer'} at ${w.company || 'startup'}: ${(w.description || '').slice(0, 100)}`)
          .join('; ');

        const { question, company, role, jobDescription } = payload || {};

        const prompt = `You are ${profile.name || profile.fullName || 'the applicant'}, applying to ${company || 'a company'} for ${role || 'a role'}.
Answer this application question directly and concisely. Write in first person.

QUESTION: "${question}"

YOUR REAL BACKGROUND:
- Skills: ${topSkills || 'React, Node.js, TypeScript, Python'}
- Projects: ${repos || 'full-stack web apps and automation tools'}
- Work: ${workExp || 'software engineering'}

RULES:
- Be direct. Start with the answer, no filler like "Certainly" or "As a developer".
- Keep it SHORT: 2-4 sentences for simple questions, max 1 paragraph for complex ones.
- Sound like a real person, not ChatGPT. Use casual professional tone.
- Reference your actual projects/skills when relevant.
- NO bullet points unless the question asks for a list.
- If asked about a bug, give a specific real-sounding example.
- Do NOT say "I'm passionate about" or "I thrive in" or similar cliches.`;

        const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.7, maxOutputTokens: 400 }
          })
        });

        if (!geminiRes.ok) {
          throw new Error(`Gemini API returned ${geminiRes.status}`);
        }

        const geminiData = await geminiRes.json();
        const answer = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        const cleanedAnswer = answer.replace(/^["']|["']$/g, '').trim();

        if (cleanedAnswer) {
          return { success: true, answer: cleanedAnswer };
        }
        throw new Error('Empty response from Gemini');
      } catch (fallbackErr) {
        return { success: false, error: 'Failed to generate answer: ' + fallbackErr.message };
      }
    }

    case 'LOG_JOB': {
      if (!token) {
        return { success: false, error: 'Not authenticated. Please sync your token first.' };
      }
      try {
        let data = null;
        try {
          data = await apiFetch('/api/extension/log-job', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload || {})
          }, apiBase);
        } catch (_) {
          // Graceful fallback to standard /api/jobs
          data = await apiFetch('/api/jobs', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              company: payload?.company || 'Unknown Company',
              role: payload?.title || payload?.role || 'Full Stack Engineer',
              location: payload?.location || 'Remote',
              applyUrl: payload?.url || payload?.applyUrl || '',
              status: 'Applied',
              source: 'AI Job Copilot'
            })
          }, apiBase);
        }
        return data;
      } catch (err) {
        return { success: false, error: 'Failed to log job: ' + err.message };
      }
    }

    case 'SAVE_TOKEN': {
      const newToken = payload?.token ? payload.token.trim() : null;
      await new Promise((resolve) => {
        chrome.storage.local.set({ ai_job_token: newToken }, resolve);
      });
      return { success: true, token: newToken };
    }

    case 'AUTO_SYNC_TOKEN': {
      try {
        const allowedPatterns = [
          'http://localhost:5173/*',
          'http://127.0.0.1:5173/*',
          'https://ai-job-finder-alpha.vercel.app/*',
          'https://*.vercel.app/*'
        ];
        const tabs = await chrome.tabs.query({ url: allowedPatterns });
        if (!tabs || tabs.length === 0) {
          return {
            success: false,
            error: 'AI Job Finder is not open. Please open either http://localhost:5173 or https://ai-job-finder-alpha.vercel.app in a browser tab and log in.'
          };
        }

        const targetTab = tabs[0];
        const results = await chrome.scripting.executeScript({
          target: { tabId: targetTab.id },
          func: () => localStorage.getItem('token') || sessionStorage.getItem('token')
        });

        const foundToken = results?.[0]?.result;
        if (foundToken) {
          await new Promise((resolve) => {
            chrome.storage.local.set({ ai_job_token: foundToken }, resolve);
          });
          return { success: true, token: foundToken, message: 'Successfully synced token from AI Job Finder!' };
        } else {
          return { success: false, error: 'No active login token found in web app tab. Please log in first.' };
        }
      } catch (err) {
        return { success: false, error: 'Auto-sync failed: ' + err.message };
      }
    }

    case 'TRIGGER_AUTOFILL_ACTIVE_TAB': {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!activeTab || !activeTab.id) {
        return { success: false, error: 'No active tab found' };
      }
      try {
        const response = await chrome.tabs.sendMessage(activeTab.id, { action: 'DO_AUTOFILL' });
        return response;
      } catch (err) {
        // Tab was likely open before extension loaded; inject content script dynamically
        try {
          await chrome.scripting.executeScript({
            target: { tabId: activeTab.id, allFrames: true },
            files: ['content.js']
          });
          await chrome.scripting.insertCSS({
            target: { tabId: activeTab.id, allFrames: true },
            files: ['content.css']
          });
          await new Promise(r => setTimeout(r, 250));
          const retryResponse = await chrome.tabs.sendMessage(activeTab.id, { action: 'DO_AUTOFILL' });
          return retryResponse;
        } catch (injectErr) {
          return { success: false, error: 'Could not connect to page: ' + (injectErr.message || err.message) + '. Please refresh the tab.' };
        }
      }
    }

    case 'GET_CV_DATA': {
      // 1. Return locally cached CV data if available
      const local = await new Promise(r => chrome.storage.local.get(['ai_copilot_resume_data'], r));
      if (local?.ai_copilot_resume_data?.hasResumePdf) {
        return { success: true, resumeData: local.ai_copilot_resume_data };
      }

      // 2. Fetch from backend if authenticated
      if (token) {
        try {
          const data = await apiFetch('/api/extension/resume', {
            headers: { 'Authorization': `Bearer ${token}` }
          }, apiBase);
          if (data?.success && data.hasResumePdf) {
            chrome.storage.local.set({ ai_copilot_resume_data: data });
            return { success: true, resumeData: data };
          }
        } catch (_) {}
      }

      return { success: true, resumeData: local?.ai_copilot_resume_data || { hasResumePdf: false } };
    }

    case 'SYNC_CV_FROM_WEB': {
      if (!token) {
        return { success: false, error: 'Please connect and sync your account first' };
      }
      try {
        const data = await apiFetch('/api/extension/resume', {
          headers: { 'Authorization': `Bearer ${token}` }
        }, apiBase);

        if (!data?.success || !data.hasResumePdf) {
          return { success: false, error: 'No resume PDF found in your AI Job Finder web account. Please upload one first!' };
        }

        // Cache resume data locally for fast offline access & 1-click ATS attachment
        await new Promise(r => chrome.storage.local.set({ ai_copilot_resume_data: data }, r));

        // Also merge parsed skills, workExperience, and education into the local profile
        const localProf = await new Promise(r => chrome.storage.local.get(['ai_copilot_local_profile'], r));
        const updatedProf = {
          ...(localProf.ai_copilot_local_profile || {}),
          hasResumePdf: true,
          resumeFilename: data.resumeFilename || 'resume.pdf',
          skills: data.skills || [],
          workExperience: data.workExperience || [],
          education: data.education || []
        };
        await new Promise(r => chrome.storage.local.set({ ai_copilot_local_profile: updatedProf }, r));

        return {
          success: true,
          message: `✓ Synced "${data.resumeFilename || 'Resume'}" from AI Job Finder!`,
          resumeData: data,
          profile: updatedProf
        };
      } catch (err) {
        return { success: false, error: 'Failed to sync CV from web: ' + err.message };
      }
    }

    case 'UPLOAD_CV': {
      const { base64, filename } = payload || {};
      if (!base64) {
        return { success: false, error: 'No resume data provided' };
      }

      // Try uploading to backend to get AI parsing
      let parsedResponse = null;
      if (token) {
        try {
          parsedResponse = await apiFetch('/api/extension/resume-upload', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ base64, filename: filename || 'resume.pdf' })
          }, apiBase);
        } catch (uploadErr) {
          console.warn('[Copilot Background] Cloud parse failed, saving locally:', uploadErr.message);
        }
      }

      const resumeData = {
        hasResumePdf: true,
        resumeFilename: filename || 'resume.pdf',
        resumePdfBase64: base64,
        skills: parsedResponse?.profile?.skills || [],
        workExperience: parsedResponse?.profile?.workExperience || [],
        education: parsedResponse?.profile?.education || [],
        uploadedAt: new Date().toISOString()
      };

      await new Promise(r => chrome.storage.local.set({ ai_copilot_resume_data: resumeData }, r));

      // Update local profile
      const localProf = await new Promise(r => chrome.storage.local.get(['ai_copilot_local_profile'], r));
      const updatedProf = {
        ...(localProf.ai_copilot_local_profile || {}),
        hasResumePdf: true,
        resumeFilename: filename || 'resume.pdf',
        ...(parsedResponse?.profile || {})
      };
      if (resumeData.skills.length > 0) updatedProf.skills = resumeData.skills;
      if (resumeData.workExperience.length > 0) updatedProf.workExperience = resumeData.workExperience;
      if (resumeData.education.length > 0) updatedProf.education = resumeData.education;

      await new Promise(r => chrome.storage.local.set({ ai_copilot_local_profile: updatedProf }, r));

      return {
        success: true,
        message: parsedResponse?.message || `✓ Uploaded and attached "${filename || 'resume.pdf'}"!`,
        resumeData,
        profile: updatedProf
      };
    }

    case 'GET_API_SETTINGS': {
      return {
        success: true,
        apiBase: apiBase || DEFAULT_API_BASE,
        isLive: !apiBase.includes('localhost') && !apiBase.includes('127.0.0.1'),
        hasToken: !!token
      };
    }

    case 'SET_API_BASE': {
      const newBase = (payload?.apiBase || '').trim().replace(/\/+$/, '');
      if (!newBase) {
        return { success: false, error: 'Server URL cannot be empty' };
      }
      await new Promise(r => chrome.storage.local.set({ ai_job_api_base: newBase }, r));
      return { success: true, apiBase: newBase, message: `✓ API Server URL updated to ${newBase}` };
    }

    default:
      return { success: false, error: 'Unknown action: ' + action };
  }
}
