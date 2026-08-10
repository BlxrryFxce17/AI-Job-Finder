import React from 'react';
import { NAV, API_BASE } from './useAppLogic';

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
    showAddForm, setShowAddForm,
    newJob, setNewJob,
    toast, setToast,
    testingEmail, setTestingEmail,
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
    handleAddJob,
    handleDelete,
    handleFetchJobs,
    addFetchQuery,
    removeFetchQuery,
    handleTestEmail
  } = props;

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
      <div className="mobile-content-area">
        
        {/* Top Header */}
        <div className="mobile-header">
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
              <button onClick={() => { window.location.href = '/logout'; }} style={{ background: 'none', border: 'none', color: 'var(--error)', fontSize: '12px', cursor: 'pointer' }}>
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
                  <button className="btn btn-primary" style={{ padding: '6px 12px', fontSize: '13px' }} onClick={handleBatchSend}>Auto-Apply 🚀</button>
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
                <button className="btn btn-ghost" onClick={handleTestEmail} disabled={testingEmail} style={{ background: 'var(--surface-3)' }}>
                  {testingEmail ? <span className="spinner"></span> : 'Test Email'}
                </button>
                <button className="btn btn-ghost" onClick={() => setShowAddForm(!showAddForm)} style={{ background: 'var(--surface-3)' }}>+ Add</button>
              </div>
            )}
            
            {showAddForm && (
              <form className="mobile-add-form" onSubmit={handleAddJob}>
                <input className="form-input" placeholder="Company" value={newJob.company} onChange={e => setNewJob({...newJob, company: e.target.value})} required />
                <input className="form-input" placeholder="Role" value={newJob.role} onChange={e => setNewJob({...newJob, role: e.target.value})} required />
                <button type="submit" className="btn btn-primary">Save Job</button>
              </form>
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
          </div>
        )}

        {tab === 'applied' && (
          <div className="mobile-actions-panel" style={{ display: 'flex', gap: '10px' }}>
            <select className="form-input" style={{ flex: 1 }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="All">All Statuses</option>
              <option value="Sent">Sent</option>
              <option value="Opened">Opened</option>
              <option value="Bounced">Bounced</option>
            </select>
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
                            ? `Sent: ${new Date(job.updatedAt || job.createdAt || Date.now()).toLocaleString([], {year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute:'2-digit'})}`
                            : `Found: ${new Date(job.createdAt || Date.now()).toLocaleString([], {year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute:'2-digit'})}`
                          }
                        </span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <select 
                            className={`status-select badge ${job.status.toLowerCase()}`}
                            value={job.status}
                            onChange={(e) => { e.stopPropagation(); updateStatus(job.id, e.target.value); }}
                            onClick={e => e.stopPropagation()}
                          >
                            <option value="Found">Found</option>
                            <option value="Drafting">Drafting</option>
                            <option value="Sent">Sent</option>
                            <option value="Opened">Opened</option>
                            <option value="Bounced">Bounced</option>
                          </select>
                          {job.tracked && <span style={{ fontSize: '12px' }}>🎯</span>}
                        </div>
                      </div>
                      <div className="mobile-card-actions">
                         <button className="btn btn-ghost" onClick={(e) => { e.stopPropagation(); job.applyLink ? window.open(job.applyLink, '_blank') : alert('No link'); }}>Link</button>
                         {(job.emailDraft || job.status === 'Sent' || job.status === 'Opened') && (
                            <button className="btn btn-primary" onClick={(e) => { e.stopPropagation(); setSelectedMail(job); }}>Mail</button>
                         )}
                         <button className="btn btn-ghost" onClick={(e) => { e.stopPropagation(); handleDelete(job.id); }} style={{color: 'var(--error)'}}>Del</button>
                      </div>
                    </div>
                  </div>
                ))
              )}
          </div>
        )}

        {tab === 'resume' && (
          <div className="mobile-form-section">
            <div style={{ background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.3)', padding: '12px', borderRadius: '8px', marginBottom: '20px' }}>
              <h3 style={{ color: '#60a5fa', margin: '0 0 6px 0', fontSize: '15px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '18px' }}>📄</span> Action Required: Upload Resume
              </h3>
              <p style={{ color: 'var(--text-2)', fontSize: '13px', margin: 0, lineHeight: '1.4' }}>
                The AI Email Drafter relies heavily on your resume. Please <strong>upload your latest PDF resume</strong> below to get the best results from the AI!
              </p>
            </div>
            <h2 className="mobile-section-title">Personal Info</h2>
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
              <input className="form-input" value={profile.github} onChange={e => setProfile({...profile, github: e.target.value})} />
              
              <label className="mobile-label">Custom AI Tone</label>
              <select className="form-input" value={profile.tone || 'Professional'} onChange={e => setProfile({...profile, tone: e.target.value})}>
                <option value="Professional">Professional & Formal</option>
                <option value="Confident & Direct">Confident & Direct</option>
                <option value="Enthusiastic & Friendly">Enthusiastic & Friendly</option>
                <option value="Short & Punchy">Short & Punchy</option>
              </select>
              
              <button type="submit" className="btn btn-primary" disabled={savingProfile}>
                {savingProfile ? <span className="spinner"></span> : 'Save Changes'}
              </button>
            </form>

            <h2 className="mobile-section-title" style={{ marginTop: '30px' }}>Email Connection</h2>
            <div className="mobile-card">
              <p style={{ color: 'var(--text-2)', fontSize: '13px', marginBottom: '16px' }}>Connect Gmail to send emails directly.</p>
              {profile.emailUser ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', background: 'rgba(34, 197, 94, 0.2)', color: '#4ade80', padding: '6px 12px', borderRadius: '4px', fontSize: '13px', fontWeight: 'bold' }}>✓ {profile.emailUser}</div>
                  <button onClick={() => { localStorage.removeItem('token'); window.location.href = '/'; }} type="button" className="btn btn-ghost" style={{ textAlign: 'center' }}>Logout</button>
                </div>
              ) : (
                <a href={`${API_BASE}/api/auth/google`} className="btn btn-primary" style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}>Sign in with Google</a>
              )}
            </div>

            <h2 className="mobile-section-title" style={{ marginTop: '30px' }}>Resume Upload</h2>
            <div className="mobile-card">
              <p style={{ color: 'var(--text-2)', fontSize: '13px', marginBottom: '16px' }}>Current: <strong style={{color:'var(--text-1)'}}>{profile.resumeFilename || 'None'}</strong></p>
              <input type="file" accept="application/pdf" onChange={handleResumeUpload} style={{ width: '100%', color: 'var(--text-2)' }} />
              {profile.skills && profile.skills.length > 0 && (
                <div style={{ marginTop: '20px' }}>
                  <div style={{ fontSize: '13px', color: 'var(--text-2)', marginBottom: '8px' }}>Extracted Skills ({profile.experienceLevel})</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {profile.skills.map((skill, idx) => (
                      <div key={idx} style={{ background: 'var(--accent-glow)', color: 'var(--accent)', padding: '4px 10px', borderRadius: '12px', fontSize: '12px', border: '1px solid var(--accent)' }}>
                        {skill}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {profile.achievements && profile.achievements.length > 0 && (
                <div style={{ marginTop: '20px' }}>
                  <div style={{ fontSize: '13px', color: 'var(--text-2)', marginBottom: '8px' }}>Top Achievements</div>
                  <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '13px', color: 'var(--text-1)' }}>
                    {profile.achievements.map((ach, idx) => <li key={idx} style={{marginBottom: '4px'}}>{ach}</li>)}
                  </ul>
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
                const res = await fetch(`${API_BASE}/api/single-draft`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
                const result = await res.json();
                if (result.success) { notify('Email Sent! 🚀'); e.target.reset(); loadJobs(); } else { notify(result.error || 'Failed to send', 'error'); }
              } catch (err) { notify('Error', 'error'); }
              setFetching(false);
            }} className="mobile-form">
              <label className="mobile-label">Company Name</label>
              <input name="company" required className="form-input" placeholder="e.g. Google" />
              
              <label className="mobile-label">Role</label>
              <input name="role" required className="form-input" placeholder="e.g. Engineer" />
              
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
