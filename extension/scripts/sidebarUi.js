// Slide-Out Sidebar UI, Tab Navigation, Draggable Resizer & Profile Sync
// Part of AI Job Copilot Chrome Extension

(() => {
  'use strict';


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

    const mountTarget = document.documentElement || document.body;
    mountTarget.appendChild(dockTab);

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
          <div class="ai-sb-actions" style="display: flex; align-items: center; gap: 6px;">
            <select id="ai-persona-select" class="ai-persona-select" title="Active Persona Profile">
              <option value="fullstack">⚡ Full-Stack</option>
              <option value="backend">🛠️ Backend</option>
              <option value="frontend">🎨 Frontend</option>
              <option value="mobile">📱 Mobile / ML</option>
            </select>
            <button id="ai-sb-close-btn" class="ai-sb-head-btn ai-sb-head-icon" title="Close Sidebar">
              <span>›</span>
            </button>
          </div>
        </div>

        <!-- Navigation Tabs -->
        <div class="ai-sb-tabs">
          <button class="ai-sb-tab-btn active" data-tab="autofill"><span>⚡</span><span>Autofill</span></button>
          <button class="ai-sb-tab-btn" data-tab="match"><span>🎯</span><span>ATS &amp; Outreach</span></button>
          <button class="ai-sb-tab-btn" data-tab="cover-letter"><span>📄</span><span>Cover Letter</span></button>
          <button class="ai-sb-tab-btn" data-tab="profile"><span>👤</span><span>Profile</span></button>
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

              <!-- 3. AI Screening Questions Section (In-Tab AI Answers) -->
              <div id="ai-qa-autofill-section" class="ai-sb-card" style="margin-top: 12px;">
                <div class="ai-sb-card-title" style="display: flex; align-items: center; justify-content: space-between;">
                  <div style="display: flex; align-items: center; gap: 6px;">
                    <span>✨</span>
                    <span>Screening Questions</span>
                  </div>
                  <div style="display: flex; align-items: center; gap: 6px;">
                    <span id="ai-qa-count-badge" style="font-size: 10px; padding: 2px 7px; border-radius: 9999px; background: rgba(56, 189, 248, 0.15); color: #38bdf8; font-weight: 600;">0 Questions</span>
                    <button id="ai-btn-gen-all-qa" type="button" style="display: none; height: 22px; background: rgba(56, 189, 248, 0.2); border: 1px solid rgba(56, 189, 248, 0.4); color: #38bdf8; border-radius: 4px; padding: 0 8px; font-size: 10px; font-weight: 600; cursor: pointer;">⚡ Fill All</button>
                  </div>
                </div>
                <p style="font-size: 10.5px; color: #94a3b8; line-height: 1.4; margin-bottom: 10px;">
                  Answers tailored to this role using your verified projects &amp; skills.
                </p>
                <div id="ai-qa-list"></div>
              </div>

              <!-- 4. Bottom Next Step Action Button -->
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
                  <span id="ai-landing-notice-text">Job Posting Active • Scroll to Form</span>
                </div>
                <button id="ai-btn-scan-form" class="ai-notice-action" title="Scan page & scroll to application form">⚡ Scan Form</button>
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
              <label class="ai-sb-label">Father's Name</label>
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
            <div class="ai-sb-form-group">
              <label class="ai-sb-label">ATS Portal Password <span style="font-size:9.5px;color:#64748b;">(used to auto-create accounts on job portals)</span></label>
              <div style="display:flex;gap:6px;align-items:center;">
                <input id="prof-atsPassword" class="ai-sb-input" type="password" placeholder="Min 8 chars, e.g. Copilot@2025" autocomplete="new-password" style="flex:1;">
                <button type="button" id="prof-atsPassword-toggle" style="background:transparent;border:1px solid rgba(148,163,184,0.3);border-radius:6px;padding:4px 8px;color:#94a3b8;cursor:pointer;font-size:11px;white-space:nowrap;" title="Show/Hide Password">👁</button>
              </div>
              <div style="font-size:9.5px;color:#64748b;margin-top:3px;">Leave blank to auto-generate a strong password. Saved securely in local storage only.</div>
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
            <div class="ai-sb-form-group">
              <label class="ai-sb-label">Resume / CV Drive Link (Google Drive / Shareable Link)</label>
              <input id="prof-resumeUrl" class="ai-sb-input" placeholder="https://drive.google.com/file/d/...">
            </div>
            <div class="ai-sb-form-group">
              <label class="ai-sb-label">Featured Project / Repo URL</label>
              <input id="prof-projectUrl" class="ai-sb-input" placeholder="https://github.com/username/project">
            </div>
            <button id="ai-btn-save-profile" class="ai-sb-btn ai-sb-btn-primary" disabled style="margin-top: 12px; width: 100%; opacity: 0.4; cursor: not-allowed; transition: opacity 0.18s, box-shadow 0.18s;">
              <span>💾</span><span>Save Changes</span>
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



        <!-- TAB 2: ATS Resume Match & Recruiter Outreach -->
        <div id="tab-match" class="ai-sb-tab-content">
          <!-- Real-Time ATS Resume Match Card -->
          <div class="ai-sb-card">
            <div class="ai-sb-card-title">
              <span>🎯 ATS Resume Match</span>
              <span id="ai-ats-score-badge" class="ai-score-badge" style="display: none;">0%</span>
            </div>
            <p style="font-size: 11px; color: #94a3b8; line-height: 1.4; margin-bottom: 12px;">
              Scans role requirements against your resume &amp; active persona to calculate pass-rate and detect missing keyword gaps.
            </p>

            <div class="ai-job-context-bar" style="background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 8px; padding: 8px 10px; margin-bottom: 12px; display: flex; align-items: center; justify-content: space-between;">
              <div style="overflow: hidden; padding-right: 8px;">
                <div id="ai-ats-target-role" style="font-size: 12px; font-weight: 700; color: #f8fafc; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">Target Role</div>
                <div id="ai-ats-target-company" style="font-size: 10.5px; color: #38bdf8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">Target Company</div>
              </div>
              <button id="ai-btn-calc-match" class="ai-sb-btn ai-sb-btn-primary" style="padding: 6px 12px; font-size: 11px; font-weight: 700; flex-shrink: 0;">
                <span>⚡</span><span>Analyze Match</span>
              </button>
            </div>

            <!-- ATS Score Gauge Result (Shown after click) -->
            <div id="ai-ats-results-box" style="display: none;">
              <!-- Score meter row -->
              <div class="ai-ats-gauge-container">
                <div class="ai-ats-score-circle" id="ai-ats-score-circle">
                  <span id="ai-ats-score-num">--</span>
                  <span class="ai-ats-score-label">MATCH</span>
                </div>
                <div class="ai-ats-score-summary">
                  <div id="ai-ats-status-text" style="font-size: 13px; font-weight: 700; color: #f8fafc;">Scanning Job...</div>
                  <div id="ai-ats-stats-sub" style="font-size: 11px; color: #94a3b8; margin-top: 2px;">0 of 0 core skills aligned</div>
                </div>
              </div>

              <!-- Keyword Chips Section -->
              <div style="margin-top: 12px;">
                <div style="font-size: 10.5px; font-weight: 700; text-transform: uppercase; color: #10b981; letter-spacing: 0.04em; margin-bottom: 6px;">
                  ✓ Matched Keywords (<span id="ai-matched-count">0</span>)
                </div>
                <div id="ai-matched-chips" class="ai-keyword-chips-container">
                  <span class="ai-empty-hint">Click analyze to see matching keywords</span>
                </div>
              </div>

              <div style="margin-top: 12px;">
                <div style="font-size: 10.5px; font-weight: 700; text-transform: uppercase; color: #f59e0b; letter-spacing: 0.04em; margin-bottom: 6px;">
                  ⚠ Missing / Recommended Keywords (<span id="ai-missing-count">0</span>)
                </div>
                <div id="ai-missing-chips" class="ai-keyword-chips-container">
                  <span class="ai-empty-hint">No missing keywords detected</span>
                </div>
              </div>

              <!-- Actionable Advice Card -->
              <div id="ai-ats-advice-box" class="ai-advice-card" style="margin-top: 12px;">
                <div style="font-size: 11px; font-weight: 700; color: #38bdf8; margin-bottom: 4px;">💡 Optimization Advice</div>
                <div id="ai-ats-advice-text" style="font-size: 11px; color: #cbd5e1; line-height: 1.4;">
                  Analyze the job to get tailored keyword placement guidance.
                </div>
              </div>
            </div>
          </div>

          <!-- In-Sidebar Recruiter Email Discovery & 1-Click Direct Outreach -->
          <div class="ai-sb-card" style="margin-top: 12px;">
            <div class="ai-sb-card-title">
              <span>🚀 Recruiter Email &amp; Cold Outreach</span>
              <span id="ai-email-source-badge" style="display: none; font-size: 9.5px; padding: 2px 7px; border-radius: 9999px; background: rgba(16, 185, 129, 0.15); color: #34d399; font-weight: 600;">Verified</span>
            </div>
            <p style="font-size: 11px; color: #94a3b8; line-height: 1.4; margin-bottom: 12px;">
              Find hiring contact, draft a high-converting cold email tailored to this role, and send directly from this sidebar with your CV attached.
            </p>

            <!-- Recruiter Email Input & Find Button -->
            <div class="ai-sb-form-group" style="margin-bottom: 10px;">
              <label class="ai-sb-label">Recruiter / Hiring Contact Email</label>
              <div style="display: flex; gap: 6px; width: 100%;">
                <input id="ai-recruiter-email" class="ai-sb-input" placeholder="recruiter@company.com" style="flex: 1 1 0; min-width: 0; width: auto; height: 34px; box-sizing: border-box; background: rgba(15, 23, 42, 0.85); color: #f8fafc; border: 1px solid rgba(255, 255, 255, 0.14); border-radius: 6px; padding: 0 10px; font-size: 11.5px;" />
                <button id="ai-btn-find-email" class="ai-sb-btn" style="height: 34px; box-sizing: border-box; background: rgba(56, 189, 248, 0.15); border: 1px solid rgba(56, 189, 248, 0.35); color: #38bdf8; border-radius: 6px; padding: 0 12px; font-size: 11px; font-weight: 600; white-space: nowrap; display: inline-flex; align-items: center; justify-content: center; gap: 4px; cursor: pointer; flex-shrink: 0; width: auto;">
                  <span>🔍</span><span>Find Email</span>
                </button>
              </div>
              <div id="ai-email-hint" style="font-size: 10px; color: #64748b; margin-top: 3px;">Enter recruiter email or click Find Email to auto-discover.</div>
            </div>

            <!-- Generate Cold Email Button -->
            <div style="display: flex; justify-content: flex-end; margin-bottom: 8px;">
              <button id="ai-btn-draft-outreach" class="ai-sb-btn" style="height: 28px; box-sizing: border-box; background: rgba(139, 92, 246, 0.15); border: 1px solid rgba(139, 92, 246, 0.35); color: #c084fc; border-radius: 6px; padding: 0 12px; font-size: 11px; font-weight: 600; display: inline-flex; align-items: center; justify-content: center; gap: 4px; cursor: pointer; width: auto;">
                <span>✨</span><span>Re-Draft Email</span>
              </button>
            </div>

            <!-- Subject Line Input -->
            <div class="ai-sb-form-group" style="margin-bottom: 10px;">
              <label class="ai-sb-label">Email Subject</label>
              <input id="ai-outreach-subject" class="ai-sb-input" placeholder="Application: Software Engineer – Your Name" style="width: 100%; box-sizing: border-box; height: 34px; background: rgba(15, 23, 42, 0.85); color: #f8fafc; border: 1px solid rgba(255, 255, 255, 0.14); border-radius: 6px; padding: 0 10px; font-size: 11.5px; display: block;" />
            </div>

            <!-- Email Body Textarea -->
            <div class="ai-sb-form-group" style="margin-bottom: 10px;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                <label class="ai-sb-label" style="margin-bottom: 0;">Email Body (Editable)</label>
                <span id="ai-outreach-word-count" style="font-size: 10px; color: #94a3b8; font-weight: 500;">0 words</span>
              </div>
              <textarea id="ai-outreach-body" class="ai-sb-textarea" rows="7" placeholder="Click 'Generate Cold Email' or write your message here..." style="width: 100%; min-width: 100%; max-width: 100%; box-sizing: border-box; background: rgba(15, 23, 42, 0.85); color: #f8fafc; border: 1px solid rgba(255, 255, 255, 0.14); border-radius: 8px; padding: 10px 12px; font-size: 11.5px; line-height: 1.55; min-height: 140px; display: block; resize: vertical;"></textarea>
            </div>

            <!-- Email Action Buttons -->
            <div style="display: flex; flex-direction: column; gap: 8px; width: 100%;">
              <button id="ai-btn-send-outreach" class="ai-sb-btn ai-sb-btn-primary" style="height: 38px; width: 100%; box-sizing: border-box; background: linear-gradient(135deg, #0284c7 0%, #2563eb 100%); color: #ffffff; border: 1px solid rgba(56, 189, 248, 0.35); border-radius: 8px; padding: 0 14px; font-size: 12px; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: space-between; box-shadow: 0 3px 12px rgba(2, 132, 199, 0.3);">
                <span>🚀 Send Email Directly</span>
                <span style="font-size: 10px; opacity: 0.85; font-weight: 500;">(CV Attached)</span>
              </button>

              <div style="display: flex; gap: 6px; width: 100%;">
                <button id="ai-btn-gmail-outreach" class="ai-sb-btn" style="flex: 1 1 0; height: 34px; box-sizing: border-box; background: rgba(239, 68, 68, 0.14); border: 1px solid rgba(239, 68, 68, 0.3); color: #f87171; border-radius: 6px; padding: 0 10px; font-size: 11px; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 5px;">
                  <span>✉️</span><span>Open in Gmail</span>
                </button>
                <button id="ai-btn-copy-outreach" class="ai-sb-btn" style="flex: 1 1 0; height: 34px; box-sizing: border-box; background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(255, 255, 255, 0.15); color: #f8fafc; border-radius: 6px; padding: 0 14px; font-size: 11px; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 5px;">
                  <span>📋</span><span>Copy</span>
                </button>
              </div>
            </div>

            <!-- Send Status Message Box -->
            <div id="ai-outreach-status-box" style="display: none; margin-top: 10px; padding: 8px 10px; border-radius: 6px; font-size: 11px;"></div>
          </div>
        </div>

        <!-- TAB 3: Instant Tailored Cover Letter Generator -->
        <div id="tab-cover-letter" class="ai-sb-tab-content">
          <div class="ai-sb-card">
            <div class="ai-sb-card-title">
              <span>📄 Tailored Cover Letter</span>
              <span id="ai-letter-persona-badge" style="font-size: 10px; padding: 2px 8px; border-radius: 9999px; background: rgba(56, 189, 248, 0.15); color: #38bdf8; font-weight: 600;">Full-Stack</span>
            </div>
            <p style="font-size: 11px; color: #94a3b8; line-height: 1.4; margin-bottom: 12px;">
              Generates a tailored, corporate-standard 3-paragraph letter highlighting your verified projects and skills.
            </p>

            <div style="display: flex; gap: 8px; margin-bottom: 12px;">
              <button id="ai-btn-gen-cover-letter" class="ai-sb-btn ai-sb-btn-primary" style="height: 36px; width: 100%; box-sizing: border-box; background: linear-gradient(135deg, #0284c7 0%, #2563eb 100%); color: #ffffff; border: 1px solid rgba(56, 189, 248, 0.35); border-radius: 8px; padding: 0 14px; font-size: 11.5px; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px;">
                <span>⚡</span><span>Generate Tailored Letter</span>
              </button>
            </div>

            <!-- Editable Letter Textarea -->
            <div class="ai-sb-form-group" style="margin-bottom: 10px;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                <label class="ai-sb-label" style="margin-bottom: 0;">Cover Letter (Live Editable)</label>
                <span id="ai-cover-letter-stats" style="font-size: 10px; color: #94a3b8; font-weight: 500;">0 words • 0 chars</span>
              </div>
              <textarea id="ai-cover-letter-text" class="ai-sb-textarea" rows="13" placeholder="Click 'Generate Tailored Letter' to create your customized cover letter..." style="width: 100%; min-width: 100%; max-width: 100%; box-sizing: border-box; background: rgba(15, 23, 42, 0.85); color: #f8fafc; border: 1px solid rgba(255, 255, 255, 0.14); border-radius: 8px; padding: 10px 12px; font-size: 11.5px; line-height: 1.55; min-height: 220px; display: block; resize: vertical; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;"></textarea>
            </div>

            <!-- Action Toolbar (Direct PDF Download, Clean Print, TXT, Copy) -->
            <div style="display: flex; gap: 6px; width: 100%;">
              <button id="ai-btn-pdf-cover-letter" class="ai-sb-btn" style="flex: 1.1 1 0; height: 34px; box-sizing: border-box; background: rgba(16, 185, 129, 0.18); border: 1px solid rgba(16, 185, 129, 0.4); color: #34d399; border-radius: 6px; padding: 0 8px; font-size: 11px; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 4px;" title="Direct 1-Click PDF Download: company_role_CoverLetter.pdf">
                <span>📥</span><span>PDF</span>
              </button>
              <button id="ai-btn-print-cover-letter" class="ai-sb-btn" style="flex: 0.9 1 0; height: 34px; box-sizing: border-box; background: rgba(56, 189, 248, 0.15); border: 1px solid rgba(56, 189, 248, 0.35); color: #38bdf8; border-radius: 6px; padding: 0 8px; font-size: 11px; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 4px;" title="Clean Print Preview (No browser headers/footers)">
                <span>🖨️</span><span>Print</span>
              </button>
              <button id="ai-btn-txt-cover-letter" class="ai-sb-btn" style="flex: 0.8 1 0; height: 34px; box-sizing: border-box; background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(255, 255, 255, 0.15); color: #f8fafc; border-radius: 6px; padding: 0 8px; font-size: 11px; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 4px;" title="Download as plain text">
                <span>📄</span><span>.TXT</span>
              </button>
              <button id="ai-btn-copy-cover-letter" class="ai-sb-btn" style="flex: 0.8 1 0; height: 34px; box-sizing: border-box; background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(255, 255, 255, 0.15); color: #f8fafc; border-radius: 6px; padding: 0 8px; font-size: 11px; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 4px;" title="Copy to clipboard">
                <span>📋</span><span>Copy</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    mountTarget.appendChild(sidebar);

    // Host focus-trap & inert immunity:
    // Prevents LinkedIn Artdeco modal or other portals from adding aria-hidden or inert to the Copilot
    const immuneObserver = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === 'attributes') {
          const t = m.target;
          if (t && (t.id === 'ai-copilot-sidebar' || t.id === 'ai-copilot-dock-tab')) {
            if (t.hasAttribute('aria-hidden')) {
              t.removeAttribute('aria-hidden');
            }
            if (t.inert) {
              t.inert = false;
            }
          }
        }
      }
    });
    immuneObserver.observe(sidebar, { attributes: true, attributeFilter: ['aria-hidden', 'inert'] });
    immuneObserver.observe(dockTab, { attributes: true, attributeFilter: ['aria-hidden', 'inert'] });

    // Stop event bubbling to host page backdrop overlays (prevents click-away close and focus hijacking)
    sidebar.addEventListener('mousedown', (e) => e.stopPropagation());
    sidebar.addEventListener('click', (e) => e.stopPropagation());
    dockTab.addEventListener('mousedown', (e) => e.stopPropagation());

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
        if (isExtensionValid()) {
          chrome.storage?.local?.set?.({ copilot_sidebar_width: currentW });
        }
      } catch (_) { }

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

        if (btn.dataset.tab === 'autofill') {
          refreshAuditList(true);
          refreshQuestionsUI();
        }
        if (btn.dataset.tab === 'profile') loadProfileIntoForm();
        if (btn.dataset.tab === 'match') initMatchTabUI();
        if (btn.dataset.tab === 'cover-letter') initCoverLetterTabUI();
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
      const res = await safeMsg({
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
      document.querySelector('.ai-sb-tab-btn[data-tab="cover-letter"]')?.click();
      generateCoverLetter();
    });

    // Landing Hub: Draft Recruiter Outreach Email
    document.getElementById('ai-hub-btn-cold-email')?.addEventListener('click', () => {
      document.querySelector('.ai-sb-tab-btn[data-tab="match"]')?.click();
      draftOutreachEmail();
    });

    // Landing Hub: How It Works Info Notice
    document.getElementById('ai-btn-notice-help')?.addEventListener('click', () => {
      showToast('Navigate to an ATS job application (Workday, Greenhouse, Lever, etc.) to start autofill!', 'info', 4000);
    });

    // Landing Hub: Scan page & scroll to application form / trigger apply
    document.getElementById('ai-btn-scan-form')?.addEventListener('click', () => {
      const formEls = window.querySelectorAllDeep('form, [class*="application-form" i], [class*="application" i], #application-form, [data-qa="additional-cards"], [data-qa="btn-apply"], [data-qa="input-resume"]');
      const formEl = formEls.length > 0 ? formEls[0] : null;
      if (formEl) {
        formEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else {
        const applyBtn = window.querySelectorAllDeep('a, button, [role="button"]')
          .find(el => !el.closest('#ai-copilot-sidebar') && !el.closest('#ai-copilot-dock-tab') && /^(apply|apply now|apply for this job|submit application)$/i.test((el.textContent || '').trim()));
        if (applyBtn) {
          applyBtn.click();
        }
      }
      showToast('Scanning page for application fields...', 'info', 2000);
      setTimeout(() => {
        if (typeof refreshAuditList === 'function') refreshAuditList(true);
      }, 300);
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
        const res = await safeMsg({ action: 'SYNC_CV_FROM_WEB' });
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
          const res = await safeMsg({
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
        await safeMsg({
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
      const res = await safeMsg({
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

    // 13.5. Feature Event Listeners
    initPersonaSwitcher();

    // ATS Match Calculation
    document.getElementById('ai-btn-calc-match')?.addEventListener('click', () => analyzeAtsMatch());

    // Recruiter Email Discovery
    document.getElementById('ai-btn-find-email')?.addEventListener('click', () => discoverRecruiterEmail());

    // Draft Outreach Email
    document.getElementById('ai-btn-draft-outreach')?.addEventListener('click', () => draftOutreachEmail());

    // Word count update for outreach body
    document.getElementById('ai-outreach-body')?.addEventListener('input', () => updateOutreachStats());

    // Send Outreach Directly
    document.getElementById('ai-btn-send-outreach')?.addEventListener('click', () => sendDirectOutreachEmail());

    // Open in Gmail Draft
    document.getElementById('ai-btn-gmail-outreach')?.addEventListener('click', () => openInGmailDraft());

    // Copy Outreach Message
    document.getElementById('ai-btn-copy-outreach')?.addEventListener('click', () => copyOutreachEmail());

    // Generate Tailored Cover Letter
    document.getElementById('ai-btn-gen-cover-letter')?.addEventListener('click', () => generateCoverLetter());

    // Word count update for cover letter text
    document.getElementById('ai-cover-letter-text')?.addEventListener('input', () => updateCoverLetterStats());

    // Direct 1-Click PDF Download (company_role_CoverLetter.pdf)
    document.getElementById('ai-btn-pdf-cover-letter')?.addEventListener('click', () => downloadCoverLetterPdfDirect());

    // Clean Print Preview (No browser headers/footers)
    document.getElementById('ai-btn-print-cover-letter')?.addEventListener('click', () => printCoverLetterHtml());

    // Download .TXT
    document.getElementById('ai-btn-txt-cover-letter')?.addEventListener('click', () => downloadCoverLetterTxt());

    // Copy Cover Letter
    document.getElementById('ai-btn-copy-cover-letter')?.addEventListener('click', () => copyCoverLetter());

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

    if (sidebar && document.documentElement) {
      document.documentElement.appendChild(sidebar);
    }
    if (sidebar) {
      if (sidebar.hasAttribute('aria-hidden')) sidebar.removeAttribute('aria-hidden');
      if (sidebar.inert) sidebar.inert = false;
    }

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
        await safeMsg({
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
      atsPassword: getVal('prof-atsPassword'),
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
      portfolio: getVal('prof-portfolio'),
      resumeUrl: getVal('prof-resumeUrl'),
      projectUrl: getVal('prof-projectUrl')
    });
  }

  function checkProfileDirtyState() {
    const saveBtn = document.getElementById('ai-btn-save-profile');
    if (!saveBtn) return;
    const currentState = computeProfileFormState();
    const isDirty = !!(initialProfileStateString && currentState !== initialProfileStateString);
    saveBtn.disabled = !isDirty;
    saveBtn.style.opacity = isDirty ? '1' : '0.4';
    saveBtn.style.cursor = isDirty ? 'pointer' : 'not-allowed';
    saveBtn.style.boxShadow = isDirty ? '0 0 0 2px rgba(99,102,241,0.4)' : 'none';
  }

  async function loadProfileIntoForm() {
    const res = await safeMsg({ action: 'GET_PROFILE' });
    if (!res?.success || !res.profile) return;
    const p = res.profile;
    cachedProfile = p;

    // 1. Fetch CV Metadata & Render CV Card with exact filename
    try {
      const cvRes = await safeMsg({ action: 'GET_CV_DATA' });
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
    } catch (_) { }

    // 2. Render Skills, Experience, Education
    renderSkillsUI(p.skills || []);
    renderExperienceUI(p.workExperience || []);
    renderEducationUI(p.education || []);

    // 3. Load API Base URL
    try {
      const apiSettings = await safeMsg({ action: 'GET_API_SETTINGS' });
      const apiInput = document.getElementById('ai-api-base-url');
      if (apiInput && apiSettings?.apiBase) {
        apiInput.value = apiSettings.apiBase;
      }
    } catch (_) { }

    const setVal = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.value = val !== undefined ? val : '';
    };

    setVal('prof-firstName', p.firstName);
    setVal('prof-lastName', p.lastName);
    setVal('prof-fatherName', p.fatherName);
    setVal('prof-phone', p.phone);
    setVal('prof-email', p.email);
    setVal('prof-atsPassword', p.atsPassword || '');
    setVal('prof-address1', p.addressLine1);
    setVal('prof-city', p.city);
    setVal('prof-state', p.state);
    setVal('prof-postalCode', p.postalCode);
    setVal('prof-country', p.country || 'India');
    setVal('prof-title', p.title);
    setVal('prof-linkedin', p.linkedin);
    setVal('prof-github', p.github);
    setVal('prof-portfolio', p.portfolio);
    setVal('prof-resumeUrl', p.resumeUrl || p.cvUrl || p.resumeDriveUrl || p.resumeLink || '');
    setVal('prof-projectUrl', p.projectUrl || p.repoUrl || getPriorityRepoUrl(p));

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

    // Wire up the show/hide password toggle
    const pwToggle = document.getElementById('prof-atsPassword-toggle');
    const pwInput = document.getElementById('prof-atsPassword');
    if (pwToggle && pwInput && !pwToggle.dataset.bound) {
      pwToggle.dataset.bound = 'true';
      pwToggle.addEventListener('click', () => {
        if (pwInput.type === 'password') {
          pwInput.type = 'text';
          pwToggle.textContent = '🙈';
        } else {
          pwInput.type = 'password';
          pwToggle.textContent = '👁';
        }
      });
    }
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
      atsPassword: getVal('prof-atsPassword'),
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
      resumeUrl: getVal('prof-resumeUrl'),
      cvUrl: getVal('prof-resumeUrl'),
      resumeDriveUrl: getVal('prof-resumeUrl'),
      projectUrl: getVal('prof-projectUrl'),
      repoUrl: getVal('prof-projectUrl'),
      skills: cachedProfile?.skills || [],
      workExperience: cachedProfile?.workExperience || [],
      education: cachedProfile?.education || []
    };

    const saveBtn = document.getElementById('ai-btn-save-profile');
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.innerHTML = '<span>⏳</span><span>Saving...</span>';
    }

    const res = await safeMsg({
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


  // 12. Check and Display On-Page Form Validation Errors
  let lastErrorsSignature = '';
  function checkAndDisplayErrors(force = false) {
    try {
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
    } catch (err) {
      console.warn('[Copilot Errors Notice]', err);
    }
  }

  // 13. Brain Rules UI in Sidebar
  async function loadBrainRulesUI() {
    const container = document.getElementById('ai-brain-rules-container');
    const countEl = document.getElementById('ai-brain-count');
    const clearBtn = document.getElementById('ai-btn-clear-brain');
    if (!container) return;

    const res = await safeMsg({ action: 'GET_BRAIN' });
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
        const delRes = await safeMsg({ action: 'CLEAR_BRAIN_RULES' });
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
        const delRes = await safeMsg({
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



  // Export to window and window.AiCopilot
  window.injectSidebar = injectSidebar;
  window.setSidebarState = setSidebarState;
  window.toggleSidebar = toggleSidebar;
  window.openSidebar = openSidebar;
  window.closeSidebar = closeSidebar;
  window.renderSkillsUI = renderSkillsUI;
  window.renderExperienceUI = renderExperienceUI;
  window.renderEducationUI = renderEducationUI;
  window.computeProfileFormState = computeProfileFormState;
  window.checkProfileDirtyState = checkProfileDirtyState;
  window.loadProfileIntoForm = loadProfileIntoForm;
  window.saveProfileFromForm = saveProfileFromForm;
  window.checkAndDisplayErrors = checkAndDisplayErrors;
  window.loadBrainRulesUI = loadBrainRulesUI;

  window.AiCopilot = window.AiCopilot || {};
  Object.assign(window.AiCopilot, {
    injectSidebar,
    setSidebarState,
    toggleSidebar,
    openSidebar,
    closeSidebar,
    renderSkillsUI,
    renderExperienceUI,
    renderEducationUI,
    computeProfileFormState,
    checkProfileDirtyState,
    loadProfileIntoForm,
    saveProfileFromForm,
    checkAndDisplayErrors,
    loadBrainRulesUI
  });
})();
