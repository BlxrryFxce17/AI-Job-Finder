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
    resumeUrl: '',
    projectUrl: '',
    selectedRepoNames: [],
    skills: []
  };
}

// Resilient API Fetch with Production Cloud & Local Fallback (Prioritizes local running server)
async function apiFetch(endpoint, options = {}, preferredBase = null) {
  const isAiGen = endpoint.includes('generate-answer');
  const timeoutMs = isAiGen ? 15000 : 2500;

  // Always try local development server first when running, then preferredBase, then remote
  const bases = [
    'http://127.0.0.1:5000',
    'http://localhost:5000',
    preferredBase,
    DEFAULT_API_BASE
  ];

  let lastErr = null;
  for (const base of Array.from(new Set(bases.filter(Boolean)))) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
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

// Adaptive, role-specific, JD-grounded cover letter generator
function generateAdaptiveCoverLetter(payload) {
  const { company, role, jobDescription, candidateName, profile } = payload || {};
  const cName = candidateName || profile?.name || 'Akash V.';
  const cComp = (company || 'your company').trim();
  const cRole = (role || 'Software Engineer').trim();
  const jd = (jobDescription || '').toLowerCase();
  const roleLower = cRole.toLowerCase();

  // 1. Detect role specialization
  const isFrontend = roleLower.includes('front') || roleLower.includes('react') || roleLower.includes('ui') || roleLower.includes('web dev') || jd.includes('frontend') || jd.includes('react');
  const isBackend = roleLower.includes('back') || roleLower.includes('node') || roleLower.includes('api') || roleLower.includes('platform') || roleLower.includes('database') || roleLower.includes('system');
  const isMobile = roleLower.includes('mobile') || roleLower.includes('flutter') || roleLower.includes('react native') || roleLower.includes('android') || roleLower.includes('ios');
  const isAI = roleLower.includes('ai') || roleLower.includes('ml') || roleLower.includes('machine learning');

  // 2. Extract specific tech stack keywords from JD
  const techKeywords = [];
  if (jd.includes('typescript') || jd.includes('type-safe')) techKeywords.push('TypeScript');
  if (jd.includes('react')) techKeywords.push('React');
  if (jd.includes('next.js') || jd.includes('nextjs')) techKeywords.push('Next.js');
  if (jd.includes('node') || jd.includes('express')) techKeywords.push('Node.js');
  if (jd.includes('tailwind')) techKeywords.push('Tailwind CSS');
  if (jd.includes('redux') || jd.includes('zustand') || jd.includes('state management')) techKeywords.push('state management');
  if (jd.includes('api') || jd.includes('rest') || jd.includes('graphql')) techKeywords.push('RESTful APIs');
  if (jd.includes('sql') || jd.includes('postgres') || jd.includes('mongodb')) techKeywords.push('relational schemas');
  if (jd.includes('docker') || jd.includes('ci/cd')) techKeywords.push('CI/CD pipelines');

  const techStackPhrase = techKeywords.length >= 2
    ? techKeywords.slice(0, 3).join(', ')
    : (isFrontend ? 'TypeScript, React, and modern CSS' : 'TypeScript, Node.js, and scalable APIs');

  // 3. Domain detection
  let domainFocus = 'building high-quality, resilient software';
  if (jd.includes('api') && (jd.includes('management') || jd.includes('platform') || cComp.toLowerCase().includes('yappes'))) {
    domainFocus = 'simplifying API integration and building developer-first platform infrastructure';
  } else if (jd.includes('fintech') || jd.includes('payment') || jd.includes('banking')) {
    domainFocus = 'delivering secure, zero-latency financial technology solutions';
  } else if (jd.includes('health') || jd.includes('clinical') || jd.includes('patient')) {
    domainFocus = 'transforming healthcare workflows through intuitive, reliable digital systems';
  } else if (jd.includes('ai') || jd.includes('machine learning') || jd.includes('automation') || isAI) {
    domainFocus = 'harnessing artificial intelligence and automation to solve mission-critical workflows';
  } else if (jd.includes('developer') || jd.includes('devops') || jd.includes('cloud')) {
    domainFocus = 'empowering engineering teams with robust developer tooling and cloud architectures';
  } else if (isFrontend) {
    domainFocus = 'crafting seamless, high-performance user experiences that scale';
  }

  // 4. Construct bespoke 3-paragraph body (no redundant salutation or closing line in raw body)
  let p1, p2, p3;

  if (isFrontend) {
    p1 = `I am writing to express my strong enthusiasm for the ${cRole} position at ${cComp}. With hands-on experience building performant client-side architectures, modular component systems, and responsive web interfaces using ${techStackPhrase}, I am drawn to ${cComp}'s mission in ${domainFocus}. I thrive at the intersection of intuitive UI engineering and robust state synchronization, and I am eager to contribute immediately to your product deliverables.`;

    p2 = `Throughout my personal work, I have focused on solving real-world frontend and client-side engineering challenges. In developing modern web applications, I have architected reactive interfaces featuring real-time DOM mutation handling, dynamic component composition, and live multi-step state synchronization without UI latency. Additionally, I prioritize accessible design and comprehensive error boundaries to ensure reliable performance across varied devices and network constraints. These experiences have instilled in me a deep commitment to web vitals, accessible component design, and predictable client state.`;

    p3 = `What excites me about ${cComp} is the opportunity to tackle meaningful technical challenges alongside a high-execution engineering team. My proactive approach to code quality, defensive edge-case handling, and rapid feature iteration ensures I can make a direct, positive impact from my first sprint. I welcome the opportunity to discuss how my frontend engineering background aligns with your team's objectives.`;
  } else if (isBackend) {
    p1 = `I am writing to express my strong interest in the ${cRole} position at ${cComp}. With hands-on experience designing high-throughput RESTful APIs, type-safe data services, and resilient distributed architectures using ${techStackPhrase}, I am inspired by ${cComp}'s work in ${domainFocus}. I am eager to leverage my systems background to support your team's scalability and reliability goals.`;

    p2 = `In my engineering work, I have concentrated on solving high-concurrency and data integrity challenges. I have engineered high-availability services featuring asynchronous queue orchestration, rate-limited external API integrations, and defensive data persistence across dynamic external schemas. Furthermore, I prioritize atomic database transactions, strict type contracts, and comprehensive error logging to ensure zero data loss and deterministic recovery under peak load. These experiences reinforced my commitment to predictable state transitions, clean API contracts, and defensive error boundaries.`;

    p3 = `I thrive in collaborative engineering environments that value technical curiosity, proactive ownership, and pragmatic system design. I am confident that my technical skills and disciplined problem-solving mindset will allow me to contribute meaningfully to ${cComp}'s infrastructure from day one. I welcome the opportunity to connect and discuss how my background matches your team's needs.`;
  } else if (isMobile) {
    p1 = `I am writing to express my strong enthusiasm for the ${cRole} position at ${cComp}. With hands-on experience designing cross-platform client applications, offline-first data synchronization, and responsive mobile interfaces using ${techStackPhrase}, I am drawn to ${cComp}'s vision in ${domainFocus}. I am eager to bring this holistic mobile perspective to your engineering team.`;

    p2 = `My recent work demonstrates my focus on mobile client reliability and performance. I have built applications emphasizing offline-first local data synchronization, reactive state management, and strict memory constraint management in low-bandwidth environments. I pair this with clean background task orchestration and defensive crash analytics to ensure consistent user experience under constrained hardware conditions. These experiences honed my ability to build fluid, battery-conscious mobile interfaces that handle edge cases cleanly.`;

    p3 = `I am excited by the prospect of contributing to ${cComp}'s product roadmap. I bring a strong engineering discipline, rapid adaptability, and a commitment to polished user interactions. I look forward to the opportunity to discuss how my mobile background can support your upcoming releases.`;
  } else {
    // Full-Stack / SDE
    p1 = `I am writing to express my strong enthusiasm for the ${cRole} opportunity at ${cComp}. With a versatile background spanning responsive frontend interfaces, type-safe REST APIs, and asynchronous data pipelines using ${techStackPhrase}, I am drawn to ${cComp}'s focus on ${domainFocus}. I enjoy taking full ownership of features from database schemas to polished user experiences, and I am excited about the chance to contribute to your engineering team.`;

    p2 = `Across my technical initiatives, I have focused on solving real-world engineering bottlenecks across both client and server boundaries. I have built end-to-end applications pairing reactive user interfaces with asynchronous worker queues, structured relational databases, and resilient REST APIs. I emphasize end-to-end type safety, optimistic UI updates with graceful fallback states, and atomic database consistency. These projects taught me to balance rapid iteration with rigorous edge-case handling, scalable component design, and database integrity.`;

    p3 = `What draws me to ${cComp} is your dedication to engineering excellence and building high-impact products. I bring a self-driven work ethic, high execution velocity, and a passion for continuous learning. I would love the chance to discuss how my full-stack background and technical capabilities can help advance your team's product goals.`;
  }

  const letter = [p1, p2, p3].join('\n\n');
  const wordCount = letter.split(/\s+/).filter(Boolean).length;
  return {
    success: true,
    coverLetter: letter,
    wordCount
  };
}

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

      try {
        const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
        let data = null;
        try {
          data = await apiFetch('/api/extension/profile', { headers }, apiBase);
        } catch (_) {
          if (token) {
            try {
              data = await apiFetch('/api/profile', { headers }, apiBase);
              if (data && (data.profile || data.userId || data._id)) {
                data = { success: true, profile: data.profile || data };
              }
            } catch (_) {}
          }
        }

        if (data?.success && data.profile) {
          const merged = { ...data.profile };
          if (localProfile) {
            for (const [k, v] of Object.entries(localProfile)) {
              if (v !== undefined && v !== null && v !== '') {
                merged[k] = v;
              }
            }
          }
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

      // DO NOT save long text essays or dynamic screening questions into the Brain
      if (valTrimmed.length > 150 || /describe|explain|trace|webhook|schema|architecture|walkthrough|challenge|tell us|give one|built|coding assistant/i.test(fieldKey)) {
        return { success: false, error: 'Dynamic screening questions are not stored as static brain rules' };
      }

      const localData = await new Promise(r => chrome.storage.local.get(['ai_copilot_brain_rules'], r));
      const sanitize = (arr) => (arr || []).filter(r => {
        const k = (r.fieldKey || '').toLowerCase().trim();
        const v = (r.value || '').trim();
        if (k.startsWith('prof-') || k.startsWith('ai-') || k.length < 2) return false;
        if ((k.includes('email') || k === 'e-mail') && (!v.includes('@') || !v.includes('.'))) return false;
        if ((k.includes('phone') || k.includes('mobile')) && v.replace(/\D/g, '').length < 10) return false;
        if (v.length > 150 || /describe|explain|trace|webhook|schema|architecture|walkthrough|challenge|tell us|give one|built|coding assistant/i.test(k)) return false;
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
        } catch (_) { }
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
        } catch (_) { }
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
        } catch (_) { }
      }
      return { success: true, learnedRules: [] };
    }

    case 'GENERATE_ANSWER': {
      // Build the prompt from local profile (used by all fallbacks)
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
      const { question, company, role, jobDescription, maxLength, minWords, minChars } = payload || {};

      if (!question || !question.trim()) {
        return { success: false, error: 'Question text is empty' };
      }

      const qLower = (question || '').toLowerCase().trim();

      // 1. Repository / Project / Walkthrough URL (e.g. "Link to one real full-stack product, repository, or sanitized walkthrough")
      if (
        qLower.includes('link to one real') ||
        qLower.includes('link to one') ||
        (qLower.includes('link') && (qLower.includes('repository') || qLower.includes('product') || qLower.includes('walkthrough') || qLower.includes('project') || qLower.includes('code'))) ||
        qLower.includes('repo url') ||
        qLower.includes('repository url') ||
        qLower.includes('github repo')
      ) {
        const priorityNames = Array.isArray(profile.selectedRepoNames) ? profile.selectedRepoNames : [];
        const allRepos = Array.isArray(profile.repos) ? profile.repos : (profile.githubInsights?.repos || []);
        const ghBase = (profile.github || '').replace(/\/$/, '');

        let repoUrl = profile.projectUrl || profile.repoUrl || null;

        if (!repoUrl && priorityNames.length > 0) {
          const priorityMatch = priorityNames.map(name => {
            const found = allRepos.find(r => (r.name || '').toLowerCase() === name.toLowerCase());
            return found ? (found.url || (ghBase ? `${ghBase}/${found.name}` : '')) : (ghBase ? `${ghBase}/${name}` : '');
          }).find(Boolean);
          if (priorityMatch) repoUrl = priorityMatch;
        }

        if (!repoUrl && allRepos.length > 0) {
          const candidate = allRepos[0];
          repoUrl = candidate.url || (ghBase ? `${ghBase}/${candidate.name}` : '');
        }

        if (!repoUrl) {
          repoUrl = profile.projectUrl || ghBase || profile.portfolio || '';
        }

        if (repoUrl && !repoUrl.startsWith('http')) repoUrl = 'https://' + repoUrl;
        return { success: true, answer: repoUrl };
      }

      // 2. Resume / CV URL (shareable link)
      if (
        qLower.includes('resume') ||
        qLower.includes('résumé') ||
        qLower.includes('cv url') ||
        qLower.includes('cv link') ||
        qLower.includes('drive link') ||
        (qLower.includes('shareable link') && !qLower.includes('project'))
      ) {
        let cvUrl = profile.resumeUrl || profile.cvUrl || profile.resumeDriveUrl || '';
        if (cvUrl && !cvUrl.startsWith('http')) cvUrl = 'https://' + cvUrl;
        return { success: true, answer: cvUrl };
      }

      // 3. LinkedIn URL
      if (qLower.includes('linkedin') && (qLower.includes('url') || qLower.includes('link') || qLower.includes('profile'))) {
        let liUrl = profile.linkedin || '';
        if (liUrl && !liUrl.startsWith('http')) liUrl = 'https://' + liUrl;
        return { success: true, answer: liUrl };
      }

      // 4. GitHub URL
      if (qLower.includes('github') && (qLower.includes('url') || qLower.includes('link') || qLower.includes('profile'))) {
        let ghUrl = profile.github || '';
        if (ghUrl && !ghUrl.startsWith('http')) ghUrl = 'https://' + ghUrl;
        return { success: true, answer: ghUrl };
      }

      // 5. Portfolio URL
      if (qLower.includes('portfolio') && (qLower.includes('url') || qLower.includes('link') || qLower.includes('site'))) {
        let pUrl = profile.portfolio || profile.github || '';
        if (pUrl && !pUrl.startsWith('http')) pUrl = 'https://' + pUrl;
        return { success: true, answer: pUrl };
      }

      const maxChars = maxLength && !isNaN(Number(maxLength)) && Number(maxLength) > 20 ? Number(maxLength) : null;
      const { location } = payload || {};

      // 6. Visa Status / Work Authorization / Sponsorship / Citizenship
      const isVisaOrAuth =
        qLower.includes('visa') ||
        qLower.includes('authorized to work') ||
        qLower.includes('work authorization') ||
        qLower.includes('sponsorship') ||
        qLower.includes('citizenship') ||
        qLower.includes('citizen') ||
        qLower.includes('work permit') ||
        qLower.includes('right to work') ||
        qLower.includes('immigration');

      if (isVisaOrAuth) {
        const candidateCountry = (profile.country || 'India').trim();
        const isIndian = candidateCountry.toLowerCase() === 'india';
        const jobContext = `${location || ''} ${jobDescription || ''} ${company || ''} ${role || ''}`.toLowerCase();
        const isIndiaJob = jobContext.includes('india') || jobContext.includes('bengaluru') || jobContext.includes('bangalore') || jobContext.includes('chennai') || jobContext.includes('pune') || jobContext.includes('mumbai') || jobContext.includes('hyderabad') || jobContext.includes('gurgaon') || jobContext.includes('noida') || jobContext.includes('delhi');
        const isUSJob = jobContext.includes('united states') || jobContext.includes('usa') || jobContext.includes('us citizen') || jobContext.includes('us work');

        let visaAnswer = '';
        if (isIndian) {
          if (isIndiaJob || (!isUSJob && !location)) {
            visaAnswer = `I am a citizen of India with full legal authorization to work in India, and I do not require any visa sponsorship for positions located in India.`;
          } else {
            visaAnswer = `I am an Indian citizen currently located in India. For on-site positions in this country, I would require employment visa sponsorship, but I am also fully eligible and equipped to work remotely.`;
          }
        } else {
          visaAnswer = profile.authorizedToWork !== false
            ? `I am a citizen of ${candidateCountry} with full authorization to work, and do not require visa sponsorship.`
            : `I am currently based in ${candidateCountry} and will require work visa sponsorship for on-site employment.`;
        }

        if (maxChars && visaAnswer.length > maxChars) {
          visaAnswer = visaAnswer.slice(0, maxChars).trim();
        }
        return { success: true, answer: visaAnswer };
      }

      // 7. Salary / Compensation / CTC (Dynamic fresher estimation)
      const isSalaryOrComp =
        qLower.includes('salary') ||
        qLower.includes('compensation') ||
        qLower.includes('ctc') ||
        qLower.includes('pay expectation') ||
        qLower.includes('desired pay') ||
        qLower.includes('target pay') ||
        qLower.includes('desired salary') ||
        qLower.includes('expected salary');

      if (isSalaryOrComp) {
        if (profile.desiredSalary) {
          return { success: true, answer: String(profile.desiredSalary) };
        }
        const jobContext = `${location || ''} ${jobDescription || ''} ${company || ''} ${role || ''}`.toLowerCase();
        const isIndiaJob = jobContext.includes('india') || jobContext.includes('inr') || jobContext.includes('₹') || jobContext.includes('lpa') || jobContext.includes('bengaluru') || jobContext.includes('bangalore') || jobContext.includes('chennai') || jobContext.includes('pune') || jobContext.includes('mumbai') || jobContext.includes('hyderabad') || jobContext.includes('gurgaon');
        const isUSJob = jobContext.includes('united states') || jobContext.includes('usa') || jobContext.includes('usd') || jobContext.includes('$');

        const isFresher = !profile.workExperience || profile.workExperience.length === 0 || (profile.experienceLevel || '').toLowerCase().includes('fresher') || (profile.experienceLevel || '').toLowerCase().includes('entry') || (profile.title || '').toLowerCase().includes('trainee') || (profile.title || '').toLowerCase().includes('graduate');

        let salaryAnswer = '';
        if (isIndiaJob || (!isUSJob && (profile.country || 'India').toLowerCase() === 'india')) {
          salaryAnswer = isFresher
            ? `As an entry-level engineer / fresher, my expected compensation is in the range of ₹5,00,000 to ₹6,00,000 per annum (around 5 LPA), and I am open to negotiation based on company standards and role responsibilities.`
            : `My expected compensation is in the range of ₹8,00,000 to ₹10,00,000 per annum, open to negotiation based on company standards.`;
        } else if (isUSJob) {
          salaryAnswer = isFresher
            ? `As an entry-level engineer, my expected compensation is in the range of $70,000 to $80,000 per year, open to discussion based on company bands.`
            : `My expected compensation is in the range of $100,000 to $120,000 per year, open to negotiation based on the role and benefits.`;
        } else {
          salaryAnswer = `Competitive and negotiable based on standard company compensation bands for this role and location.`;
        }

        if (maxChars && salaryAnswer.length > maxChars) {
          salaryAnswer = salaryAnswer.slice(0, maxChars).trim();
        }
        return { success: true, answer: salaryAnswer };
      }

      // 8. Notice Period / Availability / Start Date
      const isNoticeOrAvailability =
        qLower.includes('notice period') ||
        qLower.includes('start date') ||
        qLower.includes('available to start') ||
        qLower.includes('when are you available') ||
        qLower.includes('how soon can you start') ||
        qLower.includes('availability to start');

      if (isNoticeOrAvailability) {
        let noticeAnswer = `I have 0 days notice period as a recent graduate / fresher, and can join immediately or by the next upcoming Monday.`;
        if (maxChars && noticeAnswer.length > maxChars) {
          noticeAnswer = noticeAnswer.slice(0, maxChars).trim();
        }
        return { success: true, answer: noticeAnswer };
      }

      // Smart Question Intent Classification
      const isFounderNote = /\b(reach out|start a conversation|share something about you|why .* interests you|note to founder|message to founder|message to team|why are you a good fit|what you\'re looking for|why do you want to join|pitch)\b/i.test(qLower) ||
        (qLower.includes('hi! my name is') || qLower.includes("what i'm looking for"));
      const isSkills = /\b(best skills|better than most|top qualities|top 3 qualities|what are you good at|technologies you are|core competencies|key strengths|what sets you apart|superpower|list down.*technologies)\b/i.test(qLower);
      const isComplex = /\b(complex|biggest product|biggest feature|scale of the product|scale|most challenging project|high volume|architecture|throughput)\b/i.test(qLower);
      const isTechChallenge = /\b(technological challenge|technical challenge|challenge where you|difficult bug|problem you solved|hardest bug|bottleneck|obstacle)\b/i.test(qLower);
      const isSocialImpact = /\b(vulnerable|society|social|real-world challenges|help people|humanitarian|underprivileged|community|ethics|impact on society|marginalized)\b/i.test(qLower);
      const isWhyCompany = /\b(why do you want to work|why this company|why join|why should we hire|what excites you|interest in (this|our))\b/i.test(qLower);
      const isTeamwork = /\b(conflict|disagree|disagreement|teamwork|working with others|pressure|tight deadline|difficult colleague)\b/i.test(qLower);

      let intentGuidance = '';
      if (isSkills) {
        intentGuidance = `SPECIALIZED GUIDANCE FOR THIS QUESTION:
- The question is asking for core technical skills and engineering advantages where you are better than most.
- Focus directly on: TypeScript/JavaScript systems programming, backend architecture, ACID transaction consistency in relational databases, and defensive error handling across asynchronous workflows.
- Core differentiator: Explain WHY you are better than most (writing strictly typed, maintainable systems that anticipate edge cases and concurrency issues rather than superficial happy-path code).
- STRICT CONSTRAINT: Focus strictly on the technical domain asked by the question. Do not introduce irrelevant mobile frameworks when answering web or systems questions.`;
      } else if (isComplex) {
        intentGuidance = `SPECIALIZED GUIDANCE FOR THIS QUESTION:
- The question is asking for your MOST COMPLEX PRODUCT / FEATURE and its SCALE.
- Focus directly on: Production systems, automated job tracking platforms, distributed web copilot architectures, or backend worker services.
- Architectural scale details: Asynchronous background worker queues, DOM heuristic engines parsing dynamic schemas, session persistence, and secure OAuth dispatch under strict browser sandboxing.
- Discuss concurrency, throughput, DOM mutation handling, and fault tolerance.`;
      } else if (isTechChallenge) {
        intentGuidance = `SPECIALIZED GUIDANCE FOR THIS QUESTION:
- The question is asking to describe a SPECIFIC TECHNOLOGICAL CHALLENGE and how it was solved.
- State the exact technical bottleneck (e.g. eliminating race conditions in concurrent state synchronization, handling flaky DOM mutations in browser extensions, or optimizing offline cache consistency), the engineering solution, and the measurable outcome.`;
      } else if (isSocialImpact) {
        intentGuidance = `SPECIALIZED GUIDANCE FOR THIS QUESTION:
- The question is asking whether technology can solve real-world challenges for the most VULNERABLE IN SOCIETY.
- This is a philosophical and humanitarian question about social impact and ethics.
- DO NOT open with "I built an app". Answer the humanitarian question with conviction, maturity, and insight.
- Address how engineering reduces bureaucratic friction, healthcare disparities, and administrative overhead that disproportionately burden under-resourced communities.`;
      } else if (isWhyCompany) {
        intentGuidance = `SPECIALIZED GUIDANCE FOR THIS QUESTION:
- Explain genuine excitement about ${company || 'the hiring company'} and the ${role || 'engineering'} role.
- Connect your type-safe full-stack background to high-standards systems and real-world user impact.`;
      }

      function getBenchmarkAnswer() {
        if (isFounderNote) {
          const cName = profile.fullName || `${profile.firstName || ''} ${profile.lastName || ''}`.trim() || 'Akash V';
          const comp = company ? company.replace(/\s*\([A-Z]\d+\)/i, '').trim() : 'your';
          const r = role || 'Full-Stack Developer';
          return `Hi ${comp} team,\n\nI\'m ${cName}, a Full-Stack & AI Engineer specializing in TypeScript, React, Node.js, and Python. I am very interested in the ${r} position at ${comp}.\n\nMy engineering background centers on building resilient full-stack systems and high-performance product architectures (including offline-first mobile apps and asynchronous data pipelines). I thrive in high-ownership startup environments where I can partner closely with founders to design and ship reliable product features end-to-end.\n\nI would love the opportunity to connect and discuss how my skills and proactive approach can contribute to ${comp}.\n\nBest regards,\n${cName}`;
        }
        if (isSkills) {
          return "My strongest engineering advantage is architecting resilient full-stack systems and high-throughput asynchronous pipelines using TypeScript and Node.js. While many engineers focus primarily on surface-level feature delivery, I prioritize deep type safety, relational data integrity via atomic SQL transactions, and rigorous error boundaries across distributed workflows. This disciplined, defensive approach prevents silent production failures and ensures predictable, maintainable state management under high concurrent load.";
        }
        if (isComplex) {
          return "The most complex system I engineered is an automated multi-portal job discovery and application platform. Architecturally, it coordinates an asynchronous Node.js worker pipeline handling dynamic DOM heuristics, cross-portal session persistence, and OAuth token dispatch across hundreds of varied ATS schemas. Managing asynchronous background queues, flaky client DOM mutations, and rate limits under strict browser security constraints required resilient, fault-tolerant event engineering.";
        }
        if (isTechChallenge) {
          return "A significant technological challenge I solved was eliminating race conditions and UI latency during high-concurrency client-server state synchronization. Under intermittent network conditions, conflicting payload mutations caused state drift. I architected an optimistic UI update layer paired with an idempotent transactional retry queue and defensive schema validation, ensuring atomic data consistency and seamless recovery without data loss.";
        }
        if (isSocialImpact) {
          return "Yes, technology creates its most meaningful impact when eliminating systemic friction and digital divides for vulnerable populations. In public healthcare and municipal services, administrative overhead, manual paperwork, and fragmented systems disproportionately harm under-resourced communities. By engineering lightweight, offline-first applications and automated data pipelines, software can remove bureaucratic bottlenecks, reduce transcription errors, and deliver reliable, high-standard digital services directly to underserved and marginalized individuals.";
        }
        if (isWhyCompany) {
          return `I am excited about this role because ${company || 'your team'} prioritizes building impactful, high-reliability products that solve substantive real-world problems. My background in building type-safe full-stack architectures and resilient asynchronous pipelines directly aligns with your technical standards. I want to contribute to high-performance systems, take ownership of complex features, and collaborate with an engineering team that values clean code, performance, and user-centric architecture.`;
        }
        if (isTeamwork) {
          return "I approach teamwork and technical disagreements by focusing on objective data, clear documentation, and end-user impact rather than personal ego. When conflicting architectural trade-offs arise, I build quick prototypes, benchmark latency and memory metrics, and facilitate open code reviews to align the team. Clear, transparent communication and empathetic collaboration always result in superior system design, higher code quality, and faster consensus under tight delivery deadlines.";
        }
        return null;
      }

      function isQualityAnswer(text) {
        if (!text || typeof text !== 'string') return false;
        const words = text.trim().split(/\s+/).filter(Boolean).length;
        const lower = text.toLowerCase();

        // 1. If the webpage explicitly requested a minimum word count (e.g. 50 words minimum)
        if (effectiveMinWords && words < effectiveMinWords) {
          return false; // AI response fell short of the page's required minimum
        }

        // 2. Must be a substantive response (at least 20 words)
        if (words < 20) return false;

        // 3. Reject canned repetitive project openers on general questions (skills, why company, social impact, teamwork)
        if (/^(i built|in my project|for my project|during my project|through my project)\b/i.test(lower.trim())) {
          if (!isComplex && !isTechChallenge && !qLower.includes('project')) {
            return false;
          }
        }

        return true;
      }

      // Smart length guidance: handles minWords (e.g. 50 words minimum) and enforces 65-85 words
      const effectiveMinWords = minWords && !isNaN(Number(minWords)) && Number(minWords) > 5 ? Number(minWords) : null;
      let lengthRule = '';
      if (effectiveMinWords) {
        const targetMin = Math.max(effectiveMinWords + 8, 65);
        const targetMax = Math.max(effectiveMinWords + 25, 85);
        lengthRule = `WORD COUNT REQUIREMENT: Must be AT LEAST ${effectiveMinWords + 2} words (NEVER fewer than ${effectiveMinWords} words; target ${targetMin} to ${targetMax} words total).`;
      } else if (maxChars && maxChars < 350) {
        lengthRule = `STRICT CHARACTER LIMIT: Total length MUST be under ${maxChars - 10} characters. Keep it brief, crisp, and finish all sentences completely.`;
      } else {
        lengthRule = `LENGTH: 65 to 85 words (around 420 to 550 characters). Never write fewer than 58 words so you safely exceed 50-word minimum application thresholds.`;
      }

      // Collect available portfolio repos dynamically from profile
      const allCandidateRepos = (
        (profile.githubInsights?.repos && profile.githubInsights.repos.length > 0)
          ? profile.githubInsights.repos
          : (profile.repos || profile.topRepos || [])
      );

      let reposPortfolioText = '';
      if (allCandidateRepos.length > 0) {
        reposPortfolioText = allCandidateRepos.slice(0, 8).map(r => 
          `- ${r.name} (${r.language || 'Full Stack'}): ${r.description || 'Production web/software application'}`
        ).join('\n');
      } else if (profile.workExperience && profile.workExperience.length > 0) {
        reposPortfolioText = profile.workExperience.slice(0, 3).map(w =>
          `- ${w.title} at ${w.company}: ${w.description || 'Software engineering and systems development'}`
        ).join('\n');
      } else {
        const pSkills = (profile.skills && profile.skills.length ? profile.skills : ['TypeScript', 'Node.js', 'React', 'PostgreSQL']).slice(0, 6).join(', ');
        reposPortfolioText = `- Production Web & API Systems (${pSkills}): Full-stack applications featuring responsive interfaces, asynchronous queues, and resilient database integration.
- Scalable Backend Services (${pSkills}): High-availability REST services with atomic transactions, schema validation, and defensive error boundaries.`;
      }

      const aiPrompt = `You are an expert software engineer candidate answering an interview screening question directly on a job application form.
Write in first person ("I"). Write intelligently, authentically, and conversationally.

QUESTION TO ANSWER:
"${question}"

TARGET ROLE & COMPANY:
${role || 'Software Engineer'} at ${company || 'the hiring company'}

CANDIDATE TECHNICAL BACKGROUND:
- Primary Technologies: ${topSkills || 'TypeScript, Node.js, Express, React, PostgreSQL, MongoDB, Python'}
- Real Projects & Experience:
${reposPortfolioText}

${intentGuidance ? intentGuidance + '\n\n' : ''}CRITICAL RULES — READ CAREFULLY:
1. ANSWER THE QUESTION FIRST AND DIRECTLY:
   - Your very first sentence MUST answer the question directly.
   - NEVER begin your answer with "I built [Project name]" or "In my project [Project name]". That is a canned, spammy response and looks completely fake.
   - If asked about your best skills: State your core technical proficiencies and explain WHY you are exceptionally good at them.
   - If asked about your biggest/most complex product: Focus on architectural complexity, worker queues, and scale.
   - If asked about helping the vulnerable in society: Answer the humanitarian and ethical question directly with insight.
2. DIVERSIFY YOUR TECHNICAL REFERENCES:
   - Do NOT fixate on or repeat a single project for every question. Reference the most relevant technologies, architectural patterns, and systems from your background that directly answer the prompt.
3. ${lengthRule}
4. TONE & STYLE: Natural, confident, direct, and pragmatic. No robotic fluff (never say "passionate", "thrive", "testament", "seamlessly", "in conclusion"). Never start with "Certainly" or "Here is".
5. NO MARKDOWN: Zero asterisks, no hashes, no bullet symbols. Plain text only.
6. FINISH ALL SENTENCES: Every sentence must end with a period. Never cut off mid-thought.`;

      function cleanHumanAnswer(text) {
        if (!text) return '';
        let cleaned = text.replace(/^["']|["']$/g, '').replace(/[*#_`]/g, '').trim();
        // Only clamp if an explicit maxChars limit was given by the webpage
        if (maxChars && cleaned.length > maxChars) {
          const sliced = cleaned.slice(0, maxChars);
          const lastSentenceEnd = Math.max(
            sliced.lastIndexOf('. '),
            sliced.lastIndexOf('.\n'),
            sliced.lastIndexOf('.'),
            sliced.lastIndexOf('!'),
            sliced.lastIndexOf('?')
          );
          if (lastSentenceEnd > 40) {
            cleaned = sliced.slice(0, lastSentenceEnd + 1).trim();
          } else {
            const lastSpace = sliced.lastIndexOf(' ');
            cleaned = (lastSpace > 0 ? sliced.slice(0, lastSpace) : sliced).trim();
            if (!/[.!?]$/.test(cleaned)) cleaned += '.';
          }
        }
        return cleaned;
      }

      // TIER 1: Try backend API 
      try {
        const data = await apiFetch('/api/extension/generate-answer', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
          },
          body: JSON.stringify({
            ...(payload || {}),
            profile
          })
        }, apiBase);
        if (data?.success && data?.answer) {
          const cleaned = cleanHumanAnswer(data.answer);
          if (isQualityAnswer(cleaned)) {
            return { success: true, answer: cleaned };
          }
        }
      } catch (_backendErr) {
        console.warn('[Copilot] Backend generate-answer failed:', _backendErr.message);
      }

      // TIER 2 & 3: Fallback using user-configured or dynamically retrieved keys from storage
      let storageData = await new Promise(r => chrome.storage.local.get(['ai_copilot_api_keys', 'groq_api_key', 'gemini_api_key'], r));
      let apiKeys = storageData.ai_copilot_api_keys || {};
      let groqKey = storageData.groq_api_key || apiKeys.groqKey || '';
      let geminiKey = storageData.gemini_api_key || apiKeys.geminiKey || '';

      // Auto-fetch keys dynamically from local backend if not yet in storage
      if (!groqKey && !geminiKey) {
        try {
          const configRes = await apiFetch('/api/extension/ai-config', { method: 'GET' }, apiBase);
          if (configRes?.success) {
            groqKey = configRes.groqKey || '';
            geminiKey = configRes.geminiKey || '';
            await new Promise(r => chrome.storage.local.set({ ai_copilot_api_keys: { groqKey, geminiKey } }, r));
          }
        } catch (_) { }
      }

      // TIER 2: Direct Groq API (fast, free, high quality)
      if (groqKey) {
        try {
          const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${groqKey}`
            },
            body: JSON.stringify({
              model: 'qwen/qwen3.8-27b',
              messages: [{ role: 'user', content: aiPrompt }],
              max_tokens: 300,
              temperature: 0.4
            })
          });
          if (groqRes.ok) {
            const groqData = await groqRes.json();
            const raw = groqData?.choices?.[0]?.message?.content || '';
            const answer = cleanHumanAnswer(raw);
            if (isQualityAnswer(answer)) return { success: true, answer };
          } else {
            const errText = await groqRes.text().catch(() => '');
            console.warn('[Copilot] Groq fallback returned', groqRes.status, errText);
          }
        } catch (groqErr) {
          console.warn('[Copilot] Groq fallback failed:', groqErr.message);
        }
      }

      // TIER 3: Direct Gemini API (gemini-2.5-flash)
      if (geminiKey) {
        try {
          const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: aiPrompt }] }],
              generationConfig: { temperature: 0.4, maxOutputTokens: 300 }
            })
          });
          if (geminiRes.ok) {
            const geminiData = await geminiRes.json();
            const raw = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || '';
            const answer = cleanHumanAnswer(raw);
            if (isQualityAnswer(answer)) return { success: true, answer };
          } else {
            const errText = await geminiRes.text().catch(() => '');
            console.warn('[Copilot] Gemini fallback returned', geminiRes.status, errText);
          }
        } catch (geminiErr) {
          console.warn('[Copilot] Gemini fallback failed:', geminiErr.message);
        }
      }

      // TIER 4: Guaranteed Adaptive Benchmark Fallback (Always 65-75 words, perfectly tailored to intent)
      const benchmark = getBenchmarkAnswer();
      if (benchmark) {
        let finalAns = benchmark;
        if (maxChars && finalAns.length > maxChars) {
          finalAns = finalAns.slice(0, maxChars).trim();
        }
        return { success: true, answer: finalAns };
      }

      return { success: false, error: 'Failed to generate tailored screening answer. Please check your backend or API keys.' };
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
        } catch (_) { }
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

    case 'CALCULATE_MATCH_SCORE': {
      try {
        const data = await apiFetch('/api/extension/match-score', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
          },
          body: JSON.stringify(payload || {})
        }, apiBase);
        return data;
      } catch (err) {
        // Local offline fallback calculation
        const jd = ((payload?.jobDescription || '') + ' ' + (payload?.role || '')).toLowerCase();
        const TECH_KEYWORDS = [
          'react', 'react.js', 'vue', 'vue.js', 'angular', 'next.js', 'nextjs', 'typescript', 'javascript',
          'node.js', 'nodejs', 'express', 'nest.js', 'python', 'django', 'fastapi', 'java', 'spring',
          'golang', 'go', 'c++', 'c#', '.net', 'sql', 'postgresql', 'postgres', 'mysql', 'mongodb',
          'redis', 'graphql', 'rest api', 'restful', 'docker', 'kubernetes', 'aws', 'gcp', 'azure',
          'git', 'ci/cd', 'kafka', 'microservices', 'tailwind', 'redux', 'flutter', 'dart'
        ];
        const candidateText = [
          JSON.stringify(payload?.profile?.skills || []),
          JSON.stringify(payload?.profile?.workExperience || []),
          payload?.profile?.bio || '',
          payload?.persona || ''
        ].join(' ').toLowerCase();

        const jdKeywords = TECH_KEYWORDS.filter(kw => jd.includes(kw));
        if (jdKeywords.length === 0) {
          return {
            success: true,
            score: 75,
            matchedKeywords: ['Full-Stack Development', 'Problem Solving', 'Engineering Best Practices'],
            missingKeywords: [],
            totalKeywordsCount: 3,
            matchedCount: 3,
            advice: 'Job description has broad requirements. Highlight end-to-end full-stack experience and engineering rigor.'
          };
        }
        const matched = jdKeywords.filter(kw => candidateText.includes(kw));
        const missing = jdKeywords.filter(kw => !candidateText.includes(kw));
        const score = Math.min(96, Math.max(35, Math.round((matched.length / jdKeywords.length) * 100)));
        return {
          success: true,
          score,
          matchedKeywords: matched.slice(0, 15),
          missingKeywords: missing.slice(0, 15),
          totalKeywordsCount: jdKeywords.length,
          matchedCount: matched.length,
          advice: missing.length > 0
            ? `Consider emphasizing ${missing.slice(0, 3).join(', ')} in your application or interview notes.`
            : 'Strong alignment with tech stack! You are well-positioned for this role.'
        };
      }
    }

    case 'DISCOVER_EMAIL': {
      try {
        const data = await apiFetch('/api/extension/discover-email', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
          },
          body: JSON.stringify(payload || {})
        }, apiBase);
        return data;
      } catch (err) {
        return {
          success: false,
          error: 'Email discovery requires active backend: ' + err.message
        };
      }
    }

    case 'DRAFT_OUTREACH_EMAIL': {
      try {
        const data = await apiFetch('/api/extension/draft-email', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
          },
          body: JSON.stringify(payload || {})
        }, apiBase);
        return data;
      } catch (err) {
        // Fallback draft template if backend is busy or offline
        const { company, role, candidateName } = payload || {};
        const cName = candidateName || 'Candidate';
        const cComp = company || 'your engineering team';
        const cRole = role || 'Full-Stack Software Engineer';
        return {
          success: true,
          subject: `Application: ${cRole} – ${cName}`,
          body: `Hi ${cComp} Hiring Team,

I noticed your opening for ${cRole} and wanted to reach out directly.

With a strong foundation in building resilient TypeScript/Node.js web platforms and full-stack asynchronous systems, I have delivered production applications handling real-world concurrency, responsive client interfaces, and robust API workflows.

I would love the opportunity to discuss how my hands-on full-stack engineering skills can support ${cComp}'s upcoming engineering goals.

My resume is attached for your review. Are you available for a brief conversation this week?

Best regards,
${cName}`
        };
      }
    }

    case 'SEND_OUTREACH_EMAIL': {
      if (!token) {
        return {
          success: false,
          error: 'Please sync with your AI Job Finder account to send emails directly from the sidebar.'
        };
      }
      try {
        const data = await apiFetch('/api/extension/send-outreach-email', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(payload || {})
        }, apiBase);
        return data;
      } catch (err) {
        return { success: false, error: 'Failed to send outreach email: ' + err.message };
      }
    }

    case 'GENERATE_COVER_LETTER': {
      try {
        const data = await apiFetch('/api/extension/generate-cover-letter', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
          },
          body: JSON.stringify(payload || {})
        }, apiBase);
        if (data && data.success && data.coverLetter) {
          return data;
        }
        return generateAdaptiveCoverLetter(payload);
      } catch (err) {
        return generateAdaptiveCoverLetter(payload);
      }
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
