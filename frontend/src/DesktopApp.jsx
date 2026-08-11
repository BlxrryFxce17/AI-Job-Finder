import React from 'react';
import { NAV, API_BASE } from './useAppLogic.jsx';

export default function DesktopApp(props) {
  const {
    tab, setTab,
    sidebarOpen, setSidebarOpen,
    jobs, setJobs,
    loading, setLoading,
    search, setSearch,
    statusFilter, setStatusFilter,
    fetchQuery, setFetchQuery,
    fetchQueries, setFetchQueries,
    fetching, setFetching,
    toast, setToast,
    selectedMail, setSelectedMail,
    selectedJobDetails, setSelectedJobDetails,
    profile, setProfile,
    savingProfile, setSavingProfile,
    selectedJobs, setSelectedJobs,
    batchProgress, setBatchProgress,
    batchState, setBatchState,
    activeJobs,
    theme, setTheme,
    notify,
    loadJobs,
    loadProfile,
    toggleSelectJob,
    updateStatus,
    handleBatchSend,
    handleProfileSave,
    handleResumeUpload,
    handleFetchJobs,
    addFetchQuery,
    removeFetchQuery
  } = props;

  return (
    <div className="dashboard-container">
      {/* Batch Overlay Splash Screen */}
      {batchState.active && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(9, 9, 11, 0.95)', backdropFilter: 'blur(10px)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
          color: 'var(--text-1)'
        }}>
          <h2 style={{ fontSize: '28px', fontWeight: '700', marginBottom: '10px', color: 'var(--accent)' }}>
            Auto-Applying... ({batchState.currentIndex} / {batchState.total})
          </h2>
          {batchState.currentJob && (
            <div style={{ marginBottom: '30px', fontSize: '18px', color: 'var(--text-2)' }}>
              Current Target: <span style={{ fontWeight: '600', color: 'var(--text-1)' }}>{batchState.currentJob.company}</span> - {batchState.currentJob.role}
            </div>
          )}

          <div style={{ width: '600px', height: '10px', background: 'var(--surface-3)', borderRadius: '5px', overflow: 'hidden', marginBottom: '30px' }}>
            <div style={{ width: `${(batchState.currentIndex / batchState.total) * 100}%`, height: '100%', background: 'var(--accent)', transition: 'width 0.3s ease-out' }} />
          </div>

          <div style={{
            background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
            padding: '24px', width: '600px', height: '300px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px',
            boxShadow: '0 10px 30px rgba(0,0,0,0.5)'
          }}>
            {batchState.logs.map((log, idx) => (
              <div key={idx} className="log-item" style={{ fontFamily: 'monospace', fontSize: '13px', color: 'var(--text-2)' }}>
                <span style={{ color: 'var(--accent)', marginRight: '8px' }}>&gt;</span> {log}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toast && (
        <div className={`toast ${toast.type}`}>
          {toast.msg}
        </div>
      )}

      {/* Sidebar Overlay (Mobile Only) */}
      <div
        className={`sidebar-overlay ${sidebarOpen ? 'open' : ''}`}
        onClick={() => setSidebarOpen(false)}
      ></div>

      {/* Sidebar */}
      <div className={`sidebar ${sidebarOpen ? '' : 'collapsed'}`}>
        <div className="sidebar-toggle-btn" onClick={() => setSidebarOpen(!sidebarOpen)}>
          <svg
            width="16" height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ transform: sidebarOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.3s' }}
          >
            <polyline points="9 18 15 12 9 6"></polyline>
          </svg>
        </div>

        <div className="sidebar-scroll-area">
          <div className="brand">
            <span className="brand-icon">⚡</span>
            <span>JobFinder</span>
            <span className="brand-ai">AI</span>
          </div>

          <div className="nav-section-title">Menu</div>
          <ul className="nav-list">
            {NAV.map(n => (
              <li className="nav-item" key={n.id}>
                <div
                  className={`nav-link ${tab === n.id ? 'active' : ''}`}
                  onClick={() => setTab(n.id)}
                >
                  <span className="nav-icon">{n.icon}</span>
                  <span>{n.label}</span>
                </div>
              </li>
            ))}
          </ul>

          <div className="sidebar-stats">
            <div className="stats-title">Tracking Stats</div>
            <div className="stat-row">
              <span className="stat-label">Total Jobs</span>
              <span className="stat-value total">{jobs.length}</span>
            </div>
            <div className="stat-row">
              <span className="stat-label">Emails Sent</span>
              <span className="stat-value sent">{jobs.filter(j => j.status === 'Sent' || j.status === 'Opened' || j.status === 'Bounced').length}</span>
            </div>
            <div className="stat-row">
              <span className="stat-label">Opened</span>
              <span className="stat-value opened">{jobs.filter(j => j.status === 'Opened').length}</span>
            </div>
          </div>

          <div className="bottom-widget">
            <div className="user-info">
              <div className="avatar" style={{ background: 'var(--accent)', color: '#fff' }}>{profile.name.substring(0, 1).toUpperCase()}</div>
              <div className="user-details">
                <h4>{profile.name}</h4>
                <p>{profile.title || 'User'}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="main-content">
        <div className="top-header">
          <div className="mobile-hamburger" onClick={() => setSidebarOpen(!sidebarOpen)}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
          </div>
          <div className="page-title">
            <h1 style={{ textTransform: 'capitalize' }}>{NAV.find(n => n.id === tab)?.label || tab}</h1>
            {(tab === 'applications' || tab === 'applied') && (
              <p>{activeJobs.length} results found</p>
            )}
          </div>
          <div className="header-actions">
            <button
              className="btn btn-ghost"
              style={{ fontSize: '20px', padding: '8px', marginRight: '10px' }}
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
            >
              {theme === 'dark' ? '☀️' : '🌙'}
            </button>
            <button
              className="btn btn-ghost"
              style={{ fontSize: '14px', padding: '8px 16px', marginRight: '10px', color: 'var(--error)' }}
              onClick={handleLogout}
            >
              Logout
            </button>
            {(tab === 'applications' || tab === 'applied') && (
              <>
                {tab === 'applications' && (
                  <select
                    className="form-input"
                    style={{ width: '140px', padding: '6px 12px', marginRight: '10px' }}
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                  >
                    <option value="All">All Statuses</option>
                    <option value="Found">Found</option>
                    <option value="Drafting">Drafting</option>
                  </select>
                )}
                <div className="search-wrapper">
                  <span className="search-icon">🔍</span>
                  <input
                    type="text"
                    className="search-input"
                    placeholder="Search company or role..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
              </>
            )}
          </div>
        </div>

        {tab === 'analytics' && (
          <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '24px', overflowY: 'auto', flex: 1 }}>
            <h2 style={{ fontSize: '24px', fontWeight: 600 }}>Email Analytics Dashboard</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px' }}>
              <div style={{ background: 'var(--surface-2)', padding: '20px', borderRadius: 'var(--radius)', border: '1px solid var(--border)', textAlign: 'center' }}>
                <div style={{ fontSize: '14px', color: 'var(--text-2)', marginBottom: '8px' }}>Total Sent</div>
                <div style={{ fontSize: '32px', fontWeight: 700, color: 'var(--blue)' }}>{jobs.filter(j => j.status === 'Sent' || j.status === 'Opened').length}</div>
              </div>
              <div style={{ background: 'var(--surface-2)', padding: '20px', borderRadius: 'var(--radius)', border: '1px solid var(--border)', textAlign: 'center' }}>
                <div style={{ fontSize: '14px', color: 'var(--text-2)', marginBottom: '8px' }}>Total Opened</div>
                <div style={{ fontSize: '32px', fontWeight: 700, color: 'var(--yellow)' }}>{jobs.filter(j => j.status === 'Opened').length}</div>
              </div>
              <div style={{ background: 'var(--surface-2)', padding: '20px', borderRadius: 'var(--radius)', border: '1px solid var(--border)', textAlign: 'center' }}>
                <div style={{ fontSize: '14px', color: 'var(--text-2)', marginBottom: '8px' }}>Links Clicked</div>
                <div style={{ fontSize: '32px', fontWeight: 700, color: 'var(--purple)' }}>{jobs.reduce((acc, job) => acc + (job.clickedLinks ? job.clickedLinks.length : 0), 0)}</div>
              </div>
              <div style={{ background: 'var(--surface-2)', padding: '20px', borderRadius: 'var(--radius)', border: '1px solid var(--border)', textAlign: 'center' }}>
                <div style={{ fontSize: '14px', color: 'var(--text-2)', marginBottom: '8px' }}>Open Rate</div>
                <div style={{ fontSize: '32px', fontWeight: 700, color: 'var(--green)' }}>
                  {jobs.filter(j => j.status === 'Sent' || j.status === 'Opened').length > 0
                    ? Math.round((jobs.filter(j => j.status === 'Opened').length / jobs.filter(j => j.status === 'Sent' || j.status === 'Opened').length) * 100) + '%'
                    : '0%'}
                </div>
              </div>
            </div>

            <h3 style={{ fontSize: '18px', marginTop: '16px' }}>Recently Opened</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {jobs.filter(j => j.status === 'Opened').slice(0, 5).map(job => (
                <div key={job.id} style={{ background: 'var(--surface-2)', padding: '16px', borderRadius: 'var(--radius)', border: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px' }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontWeight: 600, wordBreak: 'break-word' }}>{job.company}</div>
                    <div style={{ fontSize: '13px', color: 'var(--text-2)', wordBreak: 'break-word' }}>{job.role} - {job.emailRecipient}</div>
                  </div>
                  <div style={{ color: 'var(--yellow)', fontSize: '13px', fontWeight: 600, flexShrink: 0 }}>Opened</div>
                </div>
              ))}
              {jobs.filter(j => j.status === 'Opened').length === 0 && (
                <div style={{ color: 'var(--text-3)', fontStyle: 'italic' }}>No emails have been opened yet.</div>
              )}
            </div>
          </div>
        )}

        {tab === 'followups' && (
          <div style={{ padding: '24px', flex: 1, overflowY: 'auto' }}>
            <h2 style={{ fontSize: '24px', fontWeight: 600, marginBottom: '24px' }}>Pending Follow Ups</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {jobs.flatMap(job =>
                (job.followUps || [])
                  .filter(f => !f.sent)
                  .map(f => (
                    <div key={`${job.id}-${f.day}`} style={{ background: 'var(--surface-2)', padding: '20px', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '18px' }}>{job.company}</div>
                          <div style={{ fontSize: '14px', color: 'var(--text-2)' }}>Day {f.day} Follow Up</div>
                        </div>
                        <button
                          className="btn btn-primary"
                          onClick={async () => {
                            const res = await fetch(`${API_BASE}/api/send-followup`, {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                              body: JSON.stringify({ jobId: job.id, day: f.day })
                            });
                            if (res.ok) {
                              const fToUpdate = job.followUps.find(fu => fu.day === f.day);
                              if (fToUpdate) fToUpdate.sent = true;
                              setJobs([...jobs]);
                            }
                          }}
                        >
                          Send Follow Up
                        </button>
                      </div>
                      <div style={{ background: 'var(--surface-3)', padding: '16px', borderRadius: '8px', fontSize: '13px', whiteSpace: 'pre-wrap', color: 'var(--text-2)' }}>
                        {f.draft}
                      </div>
                    </div>
                  ))
              )}
              {jobs.flatMap(j => (j.followUps || []).filter(f => !f.sent)).length === 0 && (
                <div style={{ color: 'var(--text-3)', fontStyle: 'italic' }}>No pending follow ups at this time.</div>
              )}
            </div>
          </div>
        )}

        {tab === 'applications' && (
          <div className="add-job-bar">
            {selectedJobs.length > 0 ? (
              <div style={{ display: 'flex', alignItems: 'center', width: '100%', gap: '15px' }}>
                <span style={{ fontWeight: 600, color: 'var(--accent)' }}>{selectedJobs.length} selected</span>
                {batchProgress !== null ? (
                  <div style={{ flex: 1, height: '8px', background: 'var(--surface-4)', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{ width: `${batchProgress}%`, height: '100%', background: 'var(--accent)', transition: 'width 0.3s' }} />
                  </div>
                ) : (
                  <button className="btn btn-primary" onClick={handleBatchSend}>
                    Auto-Apply to Selected 🚀
                  </button>
                )}
                <button className="btn btn-ghost" style={{ marginLeft: 'auto' }} onClick={() => setSelectedJobs([])}>Cancel</button>
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flexGrow: 1 }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {fetchQueries.map((q, idx) => (
                      <span key={idx} style={{ background: 'var(--accent-glow)', color: 'var(--accent)', padding: '4px 10px', borderRadius: '16px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {q}
                        <button onClick={() => removeFetchQuery(q)} style={{ background: 'transparent', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontWeight: 'bold' }}>&times;</button>
                      </span>
                    ))}
                  </div>
                  <form onSubmit={addFetchQuery} style={{ display: 'flex', gap: '10px' }}>
                    <input
                      type="text"
                      className="form-input flex-grow"
                      placeholder="Type a role & press Enter..."
                      value={fetchQuery}
                      onChange={e => setFetchQuery(e.target.value)}
                    />
                    <button type="submit" className="btn btn-ghost" style={{ padding: '6px 12px' }}>Add</button>
                  </form>
                </div>
                <button className="btn btn-primary" onClick={handleFetchJobs} disabled={fetching || fetchQueries.length === 0} style={{ alignSelf: 'flex-end' }}>
                  {fetching ? <span className="spinner"></span> : 'Auto-Scrape Fresh Jobs ✨'}
                </button>
              </>
            )}
          </div>
        )}

        {tab === 'resume' ? (
          <div className="profile-section" style={{ padding: '24px', background: 'var(--surface-2)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', flex: 1, overflowY: 'auto', margin: '20px 28px' }}>

            {/* 1. Resume Upload (Simple) */}
            <div style={{ marginBottom: '30px' }}>
              <h2 style={{ fontSize: '20px', marginBottom: '16px', color: 'var(--text-1)' }}>Resume Upload</h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <label className="btn btn-secondary" style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '10px 20px', background: 'var(--surface-3)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
                  Choose File
                  <input type="file" accept="application/pdf" onChange={handleResumeUpload} style={{ display: 'none' }} />
                </label>
                {profile.resumeFilename ? (
                  <span style={{ fontSize: '14px', color: 'var(--text-1)' }}>
                    {profile.resumeFilename}
                  </span>
                ) : (
                  <span style={{ fontSize: '14px', color: 'var(--text-3)' }}>
                    No file chosen
                  </span>
                )}
              </div>
              {profile.skills && profile.skills.length > 0 && (
                <div style={{ marginTop: '16px', fontSize: '13px', color: 'var(--text-3)' }}>
                  Extracted {profile.skills.length} skills. Level: {profile.experienceLevel}
                </div>
              )}
            </div>

            {/* 2. Personal Information */}
            <div style={{ paddingTop: '20px', borderTop: '1px solid var(--border)' }}>
              <h2 style={{ fontSize: '20px', marginBottom: '20px', color: 'var(--text-1)' }}>Personal Information</h2>
              <form onSubmit={handleProfileSave} style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '600px' }}>
                <div className="form-row">
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-2)', fontSize: '13px' }}>Full Name</label>
                    <input className="form-input" style={{ width: '100%' }} value={profile.name} onChange={e => setProfile({ ...profile, name: e.target.value })} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-2)', fontSize: '13px' }}>Job Title</label>
                    <input className="form-input" style={{ width: '100%' }} value={profile.title} onChange={e => setProfile({ ...profile, title: e.target.value })} />
                  </div>
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-2)', fontSize: '13px' }}>Phone Number</label>
                  <input className="form-input" style={{ width: '100%' }} value={profile.phone} onChange={e => setProfile({ ...profile, phone: e.target.value })} />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-2)', fontSize: '13px' }}>LinkedIn URL</label>
                  <input className="form-input" style={{ width: '100%' }} value={profile.linkedin} onChange={e => setProfile({ ...profile, linkedin: e.target.value })} />
                </div>
                <div className="form-row">
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-2)', fontSize: '13px' }}>GitHub URL</label>
                    <input className="form-input" style={{ width: '100%' }} value={profile.github || ''} onChange={e => setProfile({ ...profile, github: e.target.value })} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-2)', fontSize: '13px' }}>Experience Level</label>
                    <input className="form-input" style={{ width: '100%' }} value={profile.experienceLevel || ''} onChange={e => setProfile({ ...profile, experienceLevel: e.target.value })} placeholder="e.g. Junior, Mid, Senior" />
                  </div>
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-2)', fontSize: '13px' }}>Custom AI Tone</label>
                  <select className="form-input" style={{ width: '100%' }} value={profile.tone || 'Professional'} onChange={e => setProfile({ ...profile, tone: e.target.value })}>
                    <option value="Professional">Professional & Formal</option>
                    <option value="Confident & Direct">Confident & Direct</option>
                    <option value="Enthusiastic & Friendly">Enthusiastic & Friendly</option>
                    <option value="Short & Punchy">Short & Punchy</option>
                  </select>
                </div>

                {/* 3. Save Button */}
                <button type="submit" className="btn btn-primary" style={{ alignSelf: 'flex-start', marginTop: '16px', padding: '10px 24px' }} disabled={savingProfile}>
                  {savingProfile ? <span className="spinner"></span> : 'Save Changes'}
                </button>
              </form>
            </div>

            {/* 4. Email Connection */}
            <div style={{ marginTop: '40px', paddingTop: '30px', borderTop: '1px solid var(--border)' }}>
              <h2 style={{ fontSize: '20px', marginBottom: '16px', color: 'var(--text-1)' }}>Linked Google Account</h2>
              <div style={{ background: 'var(--surface-3)', padding: '20px', borderRadius: 'var(--radius)', maxWidth: '600px' }}>
                {profile.emailUser ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ background: 'rgba(34, 197, 94, 0.2)', color: '#4ade80', padding: '6px 12px', borderRadius: '4px', fontSize: '13px', fontWeight: 'bold' }}>✓ Connected</div>
                    <span style={{ color: 'var(--text-1)', fontWeight: '500' }}>{profile.emailUser}</span>
                    <button onClick={handleLogout} type="button" className="btn btn-ghost" style={{ marginLeft: 'auto' }}>Logout</button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-2)', fontSize: '14px' }}>No account connected for sending emails.</span>
                    <a href={`${API_BASE}/api/auth/google`} className="btn btn-primary" style={{ textDecoration: 'none' }}>Connect Google Account</a>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : tab === 'single_drafter' ? (
          <div className="single-drafter-section" style={{ padding: '24px', background: 'var(--surface-2)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', flex: 1, overflowY: 'auto', margin: '20px 28px' }}>
            <h2 style={{ fontSize: '20px', marginBottom: '8px', color: 'var(--text-1)' }}>Single Mail Drafter</h2>
            <p style={{ color: 'var(--text-2)', marginBottom: '24px', fontSize: '14px' }}>Paste a Job Description below, and the AI will draft and send a highly personalized cold email instantly.</p>

            <form onSubmit={async (e) => {
              e.preventDefault();
              setFetching(true);
              try {
                const formData = new FormData(e.target);
                const data = Object.fromEntries(formData);
                const res = await fetch(`${API_BASE}/api/single-draft`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
                  body: JSON.stringify(data)
                });
                const result = await res.json();
                if (result.success) {
                  notify('Email Drafted and Sent! 🚀');
                  e.target.reset();
                  loadJobs();
                } else {
                  notify(result.error || 'Failed to send', 'error');
                }
              } catch (err) {
                notify('An error occurred', 'error');
              }
              setFetching(false);
            }} style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '800px' }}>
              <div className="form-row">
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-2)', fontSize: '13px' }}>Company Name</label>
                  <input name="company" className="form-input" style={{ width: '100%' }} placeholder="e.g. Google (Optional)" />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-2)', fontSize: '13px' }}>Role / Job Title</label>
                  <input name="role" className="form-input" style={{ width: '100%' }} placeholder="e.g. Senior Software Engineer (Optional)" />
                </div>
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-2)', fontSize: '13px' }}>Recipient Email</label>
                <input name="recipientEmail" type="email" required className="form-input" style={{ width: '100%' }} placeholder="e.g. hiring@google.com" />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-2)', fontSize: '13px' }}>Job Description</label>
                <textarea name="jd" required className="form-input" style={{ width: '100%', minHeight: '300px', resize: 'vertical' }} placeholder="Paste the full job description here..."></textarea>
              </div>
              <button type="submit" className="btn btn-primary" style={{ alignSelf: 'flex-start', padding: '12px 24px', fontSize: '15px' }} disabled={fetching}>
                {fetching ? <span className="spinner"></span> : 'Draft & Send Email 🚀'}
              </button>
            </form>
          </div>
        ) : (tab === 'applications' || tab === 'applied') ? (
          <div className="table-section">
            <div className="table-wrapper">
              {loading ? (
                <div className="empty-state">
                  <span className="loading-spinner"></span>
                  <h3>Loading your jobs...</h3>
                </div>
              ) : activeJobs.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-icon">📭</div>
                  <h3>No jobs found</h3>
                  <p>You don't have any jobs in this section. Try scraping some from Adzuna!</p>
                </div>
              ) : (
                <table className="applications-table">
                  <thead>
                    <tr>
                      {tab !== 'applied' && (
                        <th style={{ width: '40px' }}>
                          <input
                            type="checkbox"
                            onChange={(e) => {
                              if (e.target.checked) setSelectedJobs(activeJobs.map(j => j.id));
                              else setSelectedJobs([]);
                            }}
                            checked={activeJobs.length > 0 && selectedJobs.length === activeJobs.length}
                          />
                        </th>
                      )}
                      <th>Company</th>
                      <th>Role</th>
                      <th>{tab === 'applied' ? 'Date Applied' : 'Date Found'}</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeJobs.map(job => (
                      <tr className="table-row" key={job.id}>
                        {tab !== 'applied' && (
                          <td>
                            <input
                              type="checkbox"
                              checked={selectedJobs.includes(job.id)}
                              onChange={() => toggleSelectJob(job.id)}
                            />
                          </td>
                        )}
                        <td>
                          <div className="company-cell">
                            <div className="company-avatar">{job.company.substring(0, 2).toUpperCase()}</div>
                            {job.company}
                          </div>
                        </td>
                        <td className="role-cell">{job.role}</td>
                        <td className="date-cell">
                          {tab === 'applied'
                            ? new Date(job.sentAt || job.updatedAt || job.createdAt || Date.now()).toLocaleString([], { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                            : new Date(job.publishedAt || job.createdAt || Date.now()).toLocaleString([], { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                          }
                        </td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center' }}>
                            {tab === 'applied' && (
                              <span className={`badge ${job.status.toLowerCase()}`}>
                                {job.status}
                              </span>
                            )}
                            {job.tracked && (
                              <span style={{ fontSize: '14px', marginLeft: '6px', cursor: 'help' }} title="Link Tracking Enabled">
                                🎯
                              </span>
                            )}
                            {job.clickedLinks && job.clickedLinks.length > 0 && (
                              <div style={{ display: 'flex', gap: '6px', marginLeft: '8px', alignItems: 'center' }}>
                                {job.clickedLinks.map((link, idx) => {
                                  if (link.includes('linkedin.com')) return <span key={idx} title="LinkedIn Clicked" style={{ cursor: 'help', display: 'flex' }}><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="#0a66c2"><path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z" /></svg></span>;
                                  if (link.includes('github.com')) return <span key={idx} title="GitHub Clicked" style={{ cursor: 'help', display: 'flex' }}><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" /></svg></span>;
                                  if (link.includes('resume-pdf')) return <span key={idx} title="Resume Downloaded" style={{ cursor: 'help', display: 'flex' }}><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg></span>;
                                  return <span key={idx} title="Link Clicked" style={{ fontSize: '14px', cursor: 'help' }}>🔗</span>;
                                })}
                              </div>
                            )}
                          </div>
                        </td>
                        <td>
                          <div style={{ display: 'flex', flexDirection: 'row', gap: '8px', alignItems: 'center' }}>
                            <button className="icon-btn" title="View Job" onClick={() => job.applyLink ? window.open(job.applyLink, '_blank') : alert('No URL available for this job')}>
                              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                            </button>
                            {(job.emailDraft || job.status === 'Sent' || job.status === 'Opened') && (
                              <button className="icon-btn text-accent" title="Show Mail" onClick={() => setSelectedMail(job)}>
                                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
                              </button>
                            )}
                            <button className="icon-btn text-danger" title="Delete" onClick={() => handleDelete(job.id)}>
                              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        ) : null}
      </div>

      {/* Show Mail Modal */}
      {selectedMail && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(9, 9, 11, 0.8)', backdropFilter: 'blur(5px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999
        }}>
          <div style={{
            background: 'var(--surface-2)', width: '600px', maxWidth: '90%', maxHeight: '80vh',
            borderRadius: 'var(--radius)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column',
            boxShadow: '0 10px 30px rgba(0,0,0,0.5)'
          }}>
            <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, color: 'var(--text-1)' }}>Sent Mail - {selectedMail.company}</h3>
              <button onClick={() => setSelectedMail(null)} style={{ background: 'transparent', border: 'none', color: 'var(--text-2)', cursor: 'pointer', fontSize: '20px' }}>×</button>
            </div>
            <div style={{ padding: '24px', overflowY: 'auto', flex: 1, color: 'var(--text-2)', fontSize: '14px', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
              <div style={{ marginBottom: '16px', padding: '12px', background: 'var(--surface-3)', borderRadius: '6px', fontSize: '13px' }}>
                <div><strong>To:</strong> {selectedMail.emailRecipient || 'Unknown'}</div>
                <div><strong>Tracked:</strong> {selectedMail.tracked ? 'Yes 🎯' : 'No'}</div>
                {selectedMail.clickedLinks && selectedMail.clickedLinks.length > 0 && (
                  <div style={{ marginTop: '8px' }}>
                    <strong>Clicked Links:</strong>
                    <ul style={{ margin: '4px 0 0', paddingLeft: '20px' }}>
                      {selectedMail.clickedLinks.map((link, i) => (
                        <li key={i}><a href={link} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>{link}</a></li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
              {selectedMail.emailDraft ? selectedMail.emailDraft : 'No draft saved for this job.'}
            </div>
          </div>
        </div>
      )}

      {/* View Job Modal */}
      {selectedJobDetails && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(9, 9, 11, 0.8)', backdropFilter: 'blur(5px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999
        }}>
          <div style={{
            background: 'var(--surface-2)', width: '600px', maxWidth: '90%', maxHeight: '80vh',
            borderRadius: 'var(--radius)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column',
            boxShadow: '0 10px 30px rgba(0,0,0,0.5)'
          }}>
            <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, color: 'var(--text-1)' }}>Job Details - {selectedJobDetails.company}</h3>
              <button onClick={() => setSelectedJobDetails(null)} style={{ background: 'transparent', border: 'none', color: 'var(--text-2)', cursor: 'pointer', fontSize: '20px' }}>×</button>
            </div>
            <div style={{ padding: '24px', overflowY: 'auto', flex: 1, color: 'var(--text-2)', fontSize: '14px', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
              <div style={{ marginBottom: '16px', padding: '12px', background: 'var(--surface-3)', borderRadius: '6px', fontSize: '13px' }}>
                <div><strong>Role:</strong> {selectedJobDetails.role}</div>
                {selectedJobDetails.location && <div><strong>Location:</strong> {selectedJobDetails.location}</div>}
                {selectedJobDetails.applyLink && <div><strong>Link:</strong> <a href={selectedJobDetails.applyLink} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>{selectedJobDetails.applyLink}</a></div>}
              </div>
              <h4 style={{ color: 'var(--text-1)', marginBottom: '10px' }}>Job Description</h4>
              {selectedJobDetails.jd ? selectedJobDetails.jd : 'No job description available.'}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
