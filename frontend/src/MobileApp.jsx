import React from 'react';
import { NAV, API_BASE } from './useAppLogic.jsx';

export default function MobileApp(props) {
  const {
    tab, setTab,
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
    handleLogout,
    updateStatus,
    handleBatchDelete,
    handleBatchSend,
    handleProfileSave,
    handleResumeUpload,
    handleFetchJobs,
    addFetchQuery,
    removeFetchQuery
  } = props;

  const [isScrolled, setIsScrolled] = React.useState(false);

  return (
    <div className="mobile-app-container">
      {/* Batch Overlay */}
      {batchState.active && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(9,9,11,0.95)', backdropFilter: 'blur(10px)', zIndex: 9999, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <h2 style={{ fontSize: '24px', fontWeight: '700', marginBottom: '10px', color: 'var(--accent)', textAlign: 'center' }}>Auto-Applying...<br/>({batchState.currentIndex} / {batchState.total})</h2>
          {batchState.currentJob && <div style={{ marginBottom: '20px', fontSize: '16px', color: 'var(--text-2)', textAlign: 'center' }}>Target: <span style={{color: 'var(--text-1)'}}>{batchState.currentJob.company}</span></div>}
          <div style={{ width: '100%', height: '8px', background: 'var(--surface-3)', borderRadius: '4px', overflow: 'hidden', marginBottom: '20px' }}>
            <div style={{ width: `${(batchState.currentIndex / batchState.total) * 100}%`, height: '100%', background: 'var(--accent)', transition: 'width 0.3s' }} />
          </div>
          <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '16px', width: '100%', height: '250px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {batchState.logs.map((log, idx) => (
              <div key={idx} className="log-item" style={{ fontFamily: 'monospace', fontSize: '12px', color: 'var(--text-2)' }}>
                <span style={{ color: 'var(--accent)', marginRight: '6px' }}>&gt;</span> {log}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toast && <div className={`toast ${toast.type}`}>{toast.msg}</div>}

      {/* Main Content Area (Scrollable) */}
      <div className="mobile-content-area" onScroll={(e) => setIsScrolled(e.target.scrollTop > 20)}>
        
        {/* Top Header */}
        <div className={`mobile-header ${isScrolled ? 'scrolled-up' : ''}`}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <div className="mobile-brand">
              <span className="brand-icon">⚡</span>
              <span>JobFinder</span>
              <span className="brand-ai">AI</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <button 
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer' }}
              >
                {theme === 'dark' ? '☀️' : '🌙'}
              </button>
              <button onClick={handleLogout} style={{ background: 'none', border: 'none', color: 'var(--error)', fontSize: '12px', cursor: 'pointer' }}>
                Logout
              </button>
            </div>
          </div>
          <h1 className="mobile-page-title">{NAV.find(n => n.id === tab)?.label || tab}</h1>
          {tab !== 'resume' && tab !== 'single_drafter' && (
            <p className="mobile-subtitle">{activeJobs.length} results found</p>
          )}
        </div>

        {tab === 'analytics' && (
          <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px', overflowY: 'auto' }}>
            <h2 style={{ fontSize: '20px', fontWeight: 600 }}>Email Analytics Dashboard</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div style={{ background: 'var(--surface-2)', padding: '16px', borderRadius: 'var(--radius)', border: '1px solid var(--border)', textAlign: 'center' }}>
                <div style={{ fontSize: '13px', color: 'var(--text-2)', marginBottom: '8px' }}>Total Sent</div>
                <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--blue)' }}>{jobs.filter(j => j.status === 'Sent' || j.status === 'Opened').length}</div>
              </div>
              <div style={{ background: 'var(--surface-2)', padding: '16px', borderRadius: 'var(--radius)', border: '1px solid var(--border)', textAlign: 'center' }}>
                <div style={{ fontSize: '13px', color: 'var(--text-2)', marginBottom: '8px' }}>Total Opened</div>
                <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--yellow)' }}>{jobs.filter(j => j.status === 'Opened').length}</div>
              </div>
              <div style={{ background: 'var(--surface-2)', padding: '16px', borderRadius: 'var(--radius)', border: '1px solid var(--border)', textAlign: 'center' }}>
                <div style={{ fontSize: '13px', color: 'var(--text-2)', marginBottom: '8px' }}>Links Clicked</div>
                <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--purple)' }}>{jobs.reduce((acc, job) => acc + (job.clickedLinks ? job.clickedLinks.length : 0), 0)}</div>
              </div>
              <div style={{ background: 'var(--surface-2)', padding: '16px', borderRadius: 'var(--radius)', border: '1px solid var(--border)', textAlign: 'center' }}>
                <div style={{ fontSize: '13px', color: 'var(--text-2)', marginBottom: '8px' }}>Open Rate</div>
                <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--green)' }}>
                  {jobs.filter(j => j.status === 'Sent' || j.status === 'Opened').length > 0 
                    ? Math.round((jobs.filter(j => j.status === 'Opened').length / jobs.filter(j => j.status === 'Sent' || j.status === 'Opened').length) * 100) + '%'
                    : '0%'}
                </div>
              </div>
            </div>
            
            <h3 style={{ fontSize: '16px', marginTop: '12px' }}>Recently Opened</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {jobs.filter(j => j.status === 'Opened').slice(0, 5).map(job => (
                <div key={job.id} style={{ background: 'var(--surface-2)', padding: '16px', borderRadius: 'var(--radius)', border: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '14px' }}>{job.company}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-2)' }}>{job.role} - {job.emailRecipient}</div>
                  </div>
                  <div style={{ color: 'var(--yellow)', fontSize: '12px', fontWeight: 600 }}>Opened</div>
                </div>
              ))}
              {jobs.filter(j => j.status === 'Opened').length === 0 && (
                <div style={{ color: 'var(--text-3)', fontStyle: 'italic', fontSize: '13px' }}>No emails have been opened yet.</div>
              )}
            </div>
          </div>
        )}

        {tab === 'followups' && (
          <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px', overflowY: 'auto' }}>
            <h2 style={{ fontSize: '20px', fontWeight: 600 }}>Pending Follow Ups</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {jobs.flatMap(job => 
                (job.followUps || [])
                  .filter(f => !f.sent)
                  .map(f => (
                    <div key={`${job.id}-${f.day}`} style={{ background: 'var(--surface-2)', padding: '16px', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '16px' }}>{job.company}</div>
                          <div style={{ fontSize: '13px', color: 'var(--text-2)' }}>Day {f.day} Follow Up</div>
                        </div>
                        <button 
                          className="btn btn-primary"
                          style={{ padding: '6px 12px', fontSize: '13px' }}
                          onClick={async () => {
                            const res = await fetch(`${API_BASE}/api/send-followup`, {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                              body: JSON.stringify({ jobId: job.id, day: f.day })
                            });
                            if (res.ok) {
                              const fToUpdate = job.followUps.find(fu => fu.day === f.day);
                              if(fToUpdate) fToUpdate.sent = true;
                              setJobs([...jobs]);
                            }
                          }}
                        >
                          Send
                        </button>
                      </div>
                      <div style={{ background: 'var(--surface-3)', padding: '12px', borderRadius: '8px', fontSize: '13px', whiteSpace: 'pre-wrap', color: 'var(--text-2)' }}>
                        {f.draft}
                      </div>
                    </div>
                  ))
              )}
              {jobs.flatMap(j => (j.followUps || []).filter(f => !f.sent)).length === 0 && (
                <div style={{ color: 'var(--text-3)', fontStyle: 'italic', fontSize: '14px' }}>No pending follow ups at this time.</div>
              )}
            </div>
          </div>
        )}

        {tab === 'applications' && (
          <div className="mobile-actions-panel">
            {selectedJobs.length > 0 ? (
              <div className="mobile-selection-bar">
                <span style={{ fontWeight: 600, color: 'var(--accent)' }}>{selectedJobs.length} selected</span>
                <div style={{ flex: 1 }} />
                {batchProgress !== null ? (
                   <span className="spinner"></span>
                ) : (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button className="btn btn-primary" style={{ background: 'var(--error)', borderColor: 'var(--error)', padding: '6px 12px', fontSize: '13px' }} onClick={handleBatchDelete}>Delete</button>
                    <button className="btn btn-primary" style={{ padding: '6px 12px', fontSize: '13px' }} onClick={handleBatchSend}>Auto-Apply 🚀</button>
                  </div>
                )}
                <button className="btn btn-ghost" style={{ padding: '6px 12px', fontSize: '13px', marginLeft: '8px' }} onClick={() => setSelectedJobs([])}>Cancel</button>
              </div>
            ) : (
              <div className="mobile-tools-grid">
                <div style={{ gridColumn: 'span 2' }}>
                   <div style={{display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px'}}>
                      {fetchQueries.map((q, idx) => (
                        <span key={idx} className="mobile-chip">
                          {q}
                          <button onClick={() => removeFetchQuery(q)}>&times;</button>
                        </span>
                      ))}
                    </div>
                    <form onSubmit={addFetchQuery} style={{ display: 'flex', gap: '8px' }}>
                      <input type="text" className="form-input" style={{ flex: 1 }} placeholder="Role..." value={fetchQuery} onChange={e => setFetchQuery(e.target.value)} />
                      <button type="submit" className="btn btn-primary">+</button>
                    </form>
                </div>
                <button className="btn btn-primary" onClick={handleFetchJobs} disabled={fetching || fetchQueries.length === 0} style={{ gridColumn: 'span 2' }}>
                  {fetching ? <span className="spinner"></span> : 'Auto-Scrape Jobs ✨'}
                </button>
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
              <select className="form-input" style={{ flex: 1 }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="All">All Statuses</option>
                <option value="Found">Found</option>
                <option value="Drafting">Drafting</option>
              </select>
              <div className="search-wrapper" style={{ flex: 1, margin: 0 }}>
                <span className="search-icon">🔍</span>
                <input type="text" className="search-input" placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
            </div>
            {activeJobs.length > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', padding: '0 4px' }}>
                <button 
                  className="btn btn-ghost" 
                  style={{ padding: '6px 12px', fontSize: '13px', background: 'var(--surface-3)', borderRadius: '6px', color: 'var(--text-1)' }} 
                  onClick={() => {
                    if (selectedJobs.length === activeJobs.length) {
                      setSelectedJobs([]);
                    } else {
                      setSelectedJobs(activeJobs.map(j => j.id));
                    }
                  }}
                >
                  {selectedJobs.length === activeJobs.length ? 'Deselect All' : 'Select All'}
                </button>
                <span style={{ fontSize: '12px', color: 'var(--text-3)', fontWeight: '500' }}>{activeJobs.length} jobs found</span>
              </div>
            )}
          </div>
        )}

        {tab === 'applied' && (
          <div className="mobile-actions-panel" style={{ display: 'flex', gap: '10px' }}>
            <div className="search-wrapper" style={{ flex: 1, margin: 0 }}>
              <span className="search-icon">🔍</span>
              <input type="text" className="search-input" placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>
        )}

        {(tab === 'applications' || tab === 'applied') && (
          <div className="mobile-job-list">
             {loading ? (
                <div className="empty-state"><span className="loading-spinner"></span><h3>Loading...</h3></div>
              ) : activeJobs.length === 0 ? (
                <div className="empty-state"><div className="empty-icon">📭</div><h3>No jobs found</h3></div>
              ) : (
                activeJobs.map(job => (
                  <div className={`mobile-job-card ${selectedJobs.includes(job.id) ? 'selected' : ''}`} key={job.id} onClick={() => { if(tab === 'applications') toggleSelectJob(job.id); }}>
                    {tab === 'applications' && (
                       <div className="mobile-card-checkbox">
                         <input type="checkbox" checked={selectedJobs.includes(job.id)} onChange={() => {}} />
                       </div>
                    )}
                    <div className="mobile-card-content">
                      <div className="mobile-card-header">
                         <div className="company-avatar" style={{ width: '32px', height: '32px', fontSize: '12px' }}>{job.company.substring(0,2).toUpperCase()}</div>
                         <div className="mobile-card-title">
                            <h3>{job.company}</h3>
                            <p>{job.role}</p>
                         </div>
                      </div>
                      <div className="mobile-card-footer">
                        <span className="mobile-card-date">
                          {tab === 'applied'
                            ? `Sent: ${new Date(job.sentAt || job.updatedAt || job.createdAt || Date.now()).toLocaleString([], {year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute:'2-digit'})}`
                            : `Found: ${new Date(job.createdAt || Date.now()).toLocaleString([], {year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute:'2-digit'})}`
                          }
                        </span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          {tab === 'applied' && (
                            <span className={`badge ${job.status.toLowerCase()}`}>
                              {job.status}
                            </span>
                          )}
                          {job.tracked && <span style={{ fontSize: '12px' }}>🎯</span>}
                        </div>
                      </div>
                      <div className="mobile-card-actions">
                         <button className="icon-btn" onClick={(e) => { e.stopPropagation(); job.applyLink ? window.open(job.applyLink, '_blank') : alert('No link'); }}>
                           <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                         </button>
                         {(job.emailDraft || job.status === 'Sent' || job.status === 'Opened') && (
                            <button className="icon-btn text-accent" onClick={(e) => { e.stopPropagation(); setSelectedMail(job); }}>
                              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
                            </button>
                         )}
                         <button className="icon-btn text-danger" onClick={(e) => { e.stopPropagation(); handleDelete(job.id); }}>
                           <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                         </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
          </div>
        )}

        {tab === 'resume' && (
          <div className="mobile-form-section">
            
            {/* 1. Resume Upload (Simple) */}
            <div style={{marginBottom: '24px'}}>
              <h2 className="mobile-section-title">Resume Upload</h2>
              <div style={{display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap'}}>
                <label className="btn btn-secondary" style={{cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '8px 16px', background: 'var(--surface-3)', border: '1px solid var(--border)', borderRadius: 'var(--radius)'}}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
                  Choose File
                  <input type="file" accept="application/pdf" onChange={handleResumeUpload} style={{display: 'none'}} />
                </label>
                {profile.resumeFilename ? (
                  <span style={{fontSize: '13px', color: 'var(--text-1)'}}>
                    {profile.resumeFilename}
                  </span>
                ) : (
                  <span style={{fontSize: '13px', color: 'var(--text-3)'}}>
                    No file chosen
                  </span>
                )}
              </div>
              {profile.skills && profile.skills.length > 0 && (
                <div style={{ marginTop: '12px', fontSize: '13px', color: 'var(--text-3)' }}>
                  Extracted {profile.skills.length} skills. Level: {profile.experienceLevel}
                </div>
              )}
            </div>

            {/* 2. Personal Information */}
            <h2 className="mobile-section-title" style={{paddingTop: '20px', borderTop: '1px solid var(--border)'}}>Personal Info</h2>
            <form onSubmit={handleProfileSave} className="mobile-form">
              <label className="mobile-label">Full Name</label>
              <input className="form-input" value={profile.name} onChange={e => setProfile({...profile, name: e.target.value})} />
              
              <label className="mobile-label">Job Title</label>
              <input className="form-input" value={profile.title} onChange={e => setProfile({...profile, title: e.target.value})} />
              
              <label className="mobile-label">Phone Number</label>
              <input className="form-input" value={profile.phone} onChange={e => setProfile({...profile, phone: e.target.value})} />
              
              <label className="mobile-label">LinkedIn URL</label>
              <input className="form-input" value={profile.linkedin} onChange={e => setProfile({...profile, linkedin: e.target.value})} />
              
              <label className="mobile-label">GitHub URL</label>
              <input className="form-input" value={profile.github || ''} onChange={e => setProfile({...profile, github: e.target.value})} />
              
              <label className="mobile-label">Experience Level</label>
              <input className="form-input" value={profile.experienceLevel || ''} onChange={e => setProfile({...profile, experienceLevel: e.target.value})} placeholder="e.g. Junior, Mid, Senior" />
              
              <label className="mobile-label">Custom AI Tone</label>
              <select className="form-input" value={profile.tone || 'Professional'} onChange={e => setProfile({...profile, tone: e.target.value})}>
                <option value="Professional">Professional & Formal</option>
                <option value="Confident & Direct">Confident & Direct</option>
                <option value="Enthusiastic & Friendly">Enthusiastic & Friendly</option>
                <option value="Short & Punchy">Short & Punchy</option>
              </select>
              
              <button type="submit" className="btn btn-primary" style={{marginTop: '12px'}} disabled={savingProfile}>
                {savingProfile ? <span className="spinner"></span> : 'Save Changes'}
              </button>
            </form>

            {/* 4. Email Connection */}
            <h2 className="mobile-section-title" style={{ marginTop: '30px', paddingTop: '20px', borderTop: '1px solid var(--border)' }}>Email Connection</h2>
            <div className="mobile-card" style={{padding: '16px'}}>
              {profile.emailUser ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', background: 'rgba(34, 197, 94, 0.2)', color: '#4ade80', padding: '8px 12px', borderRadius: '6px', fontSize: '14px', fontWeight: 'bold' }}>✓ {profile.emailUser}</div>
                  <button onClick={handleLogout} type="button" className="btn btn-ghost" style={{ textAlign: 'center', width: '100%' }}>Logout</button>
                </div>
              ) : (
                <div style={{display: 'flex', flexDirection: 'column', gap: '12px'}}>
                  <span style={{color: 'var(--text-2)', fontSize: '13px'}}>No account connected for sending emails.</span>
                  <a href={`${API_BASE}/api/auth/google`} className="btn btn-primary" style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}>Sign in with Google</a>
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'single_drafter' && (
          <div className="mobile-form-section">
            <p style={{ color: 'var(--text-2)', fontSize: '13px', marginBottom: '20px' }}>Paste a JD, and the AI will draft and send a highly personalized cold email instantly.</p>
            <form onSubmit={async (e) => {
              e.preventDefault();
              setFetching(true);
              try {
                const formData = new FormData(e.target);
                const data = Object.fromEntries(formData);
                const res = await fetch(`${API_BASE}/api/single-draft`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` }, body: JSON.stringify(data) });
                const result = await res.json();
                if (result.success) { notify('Email Sent! 🚀'); e.target.reset(); loadJobs(); } else { notify(result.error || 'Failed to send', 'error'); }
              } catch (err) { notify('Error', 'error'); }
              setFetching(false);
            }} className="mobile-form">
              <label className="mobile-label">Company Name</label>
              <input name="company" className="form-input" placeholder="e.g. Google (Optional)" />
              
              <label className="mobile-label">Role</label>
              <input name="role" className="form-input" placeholder="e.g. Engineer (Optional)" />
              
              <label className="mobile-label">Recipient Email</label>
              <input name="recipientEmail" type="email" required className="form-input" placeholder="e.g. hr@google.com" />
              
              <label className="mobile-label">Job Description</label>
              <textarea name="jd" required className="form-input" style={{ minHeight: '200px' }} placeholder="Paste JD here..."></textarea>
              
              <button type="submit" className="btn btn-primary" style={{ padding: '14px' }} disabled={fetching}>
                {fetching ? <span className="spinner"></span> : 'Draft & Send 🚀'}
              </button>
            </form>
          </div>
        )}
      </div>

      {/* Bottom Navigation */}
      <div className="bottom-nav">
        {NAV.map(n => (
          <div key={n.id} className={`bottom-nav-item ${tab === n.id ? 'active' : ''}`} onClick={() => setTab(n.id)}>
            <span className="bottom-nav-icon">{n.icon}</span>
            <span className="bottom-nav-label">{n.label.split(' ')[0]}</span>
          </div>
        ))}
      </div>
      
      {/* Modals for Mail */}
      {selectedMail && (
        <div className="mobile-modal-overlay">
          <div className="mobile-modal">
            <div className="mobile-modal-header">
              <h3>Sent Mail</h3>
              <button onClick={() => setSelectedMail(null)}>&times;</button>
            </div>
            <div className="mobile-modal-content">
               <div style={{ background: 'var(--surface-3)', padding: '12px', borderRadius: '6px', marginBottom: '16px', fontSize: '13px' }}>
                  <div><strong>To:</strong> {selectedMail.emailRecipient || 'Unknown'}</div>
                  <div><strong>Tracked:</strong> {selectedMail.tracked ? 'Yes' : 'No'}</div>
               </div>
               <div style={{ whiteSpace: 'pre-wrap', lineHeight: '1.5' }}>
                  {selectedMail.emailDraft || 'No draft found.'}
               </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
