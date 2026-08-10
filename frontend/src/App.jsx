import React, { useState, useEffect } from 'react';
import './index.css';

const NAV = [
  { id: 'applications', label: 'My Applications', icon: '⚡' },
  { id: 'applied', label: 'Mail Applied Jobs', icon: '📬' },
  { id: 'single_drafter', label: 'Single Mail Drafter', icon: '✉️' },
  { id: 'resume', label: 'Profile Settings', icon: '⚙️' },
];

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export default function App() {
  const [tab, setTab] = useState('applications');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [fetchQuery, setFetchQuery] = useState('');
  const [fetchQueries, setFetchQueries] = useState(['software developer']);
  const [fetching, setFetching] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newJob, setNewJob] = useState({ company: '', role: '', status: 'Sent' });
  const [toast, setToast] = useState(null);
  const [testingEmail, setTestingEmail] = useState(false);
  const [selectedMail, setSelectedMail] = useState(null);
  const [selectedJobDetails, setSelectedJobDetails] = useState(null);
  
  // Profile State
  const [profile, setProfile] = useState({ name: 'Loading...', title: '', phone: '', linkedin: '', github: '', resumeFilename: '', emailUser: '' });
  const [savingProfile, setSavingProfile] = useState(false);
  
  // Batch Selection
  const [selectedJobs, setSelectedJobs] = useState([]);
  const [batchProgress, setBatchProgress] = useState(null);
  const [batchState, setBatchState] = useState({ active: false, currentIndex: 0, total: 0, currentJob: null, logs: [] });

  const toggleSelectJob = (id) => {
    setSelectedJobs(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);
  };

  const handleBatchSend = async () => {
    if (selectedJobs.length === 0) return;
    setBatchProgress(0);
    setBatchState({ active: true, currentIndex: 0, total: selectedJobs.length, currentJob: null, logs: [] });
    
    for (let i = 0; i < selectedJobs.length; i++) {
      const jobId = selectedJobs[i];
      const job = jobs.find(j => j.id === jobId);
      if (!job) continue;

      setBatchState(prev => ({ ...prev, currentIndex: i + 1, currentJob: job, logs: [...prev.logs, `[${job.company}] Starting processing...`] }));

      try {
        setBatchState(prev => ({ ...prev, logs: [...prev.logs, `[${job.company}] Discovering HR email...`] }));
        const discRes = await fetch(`${API_BASE}/api/discover-email`, {
           method: 'POST', headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify({ company: job.company, jd: job.jd })
        });
        const discData = await discRes.json();
        const discoveredEmail = discData.email || '';
        
        setBatchState(prev => ({ ...prev, logs: [...prev.logs, `[${job.company}] Found email: ${discoveredEmail || 'None'}. Drafting...`] }));
        const genRes = await fetch(`${API_BASE}/api/generate-email`, {
           method: 'POST', headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify({ company: job.company, role: job.role, jd: job.jd, emailType: 'Cold Outreach / Networking' })
        });
        const genData = await genRes.json();
        
        if (discoveredEmail && genData.draft) {
            setBatchState(prev => ({ ...prev, logs: [...prev.logs, `[${job.company}] Draft ready. Sending...`] }));
            const sendRes = await fetch(`${API_BASE}/api/send-email`, {
               method: 'POST', headers: { 'Content-Type': 'application/json' },
               body: JSON.stringify({ jobId: job.id, body: genData.draft, to: discoveredEmail })
            });
            const sendData = await sendRes.json();
            if (sendData.success) {
               updateStatus(job.id, 'Sent', discoveredEmail, genData.draft, sendData.tracked);
               setBatchState(prev => ({ ...prev, logs: [...prev.logs, `[${job.company}] Successfully sent! 🚀`] }));
            } else {
               setBatchState(prev => ({ ...prev, logs: [...prev.logs, `[${job.company}] Failed to send.`] }));
            }
        } else {
            setBatchState(prev => ({ ...prev, logs: [...prev.logs, `[${job.company}] Skipped (no email or draft).`] }));
        }
      } catch (err) {
        console.error(err);
        setBatchState(prev => ({ ...prev, logs: [...prev.logs, `[${job.company}] Error occurred: ${err.message}`] }));
      }
      setBatchProgress(((i + 1) / selectedJobs.length) * 100);
    }
    
    setBatchState(prev => ({ ...prev, logs: [...prev.logs, `Batch complete! Closing in 3 seconds...`] }));
    notify('Batch complete!');
    setTimeout(() => {
        setBatchProgress(null);
        setSelectedJobs([]);
        setBatchState(prev => ({ ...prev, active: false }));
        setTab('applied');
        loadJobs();
    }, 3000);
  };

  useEffect(() => { 
    loadJobs(); 
    loadProfile();
    
    // Auto-refresh jobs every 5 seconds for real-time tracking updates
    const trackingInterval = setInterval(loadJobs, 5000);
    return () => clearInterval(trackingInterval);
  }, []);

  useEffect(() => {
    setStatusFilter('All');
  }, [tab]);

  const loadProfile = async () => {
    try {
      const r = await fetch(`${API_BASE}/api/profile`);
      const p = await r.json();
      setProfile(p);
    } catch (err) { }
  };

  const handleProfileSave = async (e) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      const r = await fetch(`${API_BASE}/api/profile`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile)
      });
      const p = await r.json();
      setProfile(p);
      notify('Profile updated successfully!');
    } catch { notify('Failed to update profile', 'error'); }
    finally { setSavingProfile(false); }
  };

  const handleResumeUpload = async (e) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const formData = new FormData();
    formData.append('resume', e.target.files[0]);
    notify('Uploading & Parsing Resume...', 'info');
    try {
      const r = await fetch(`${API_BASE}/api/profile/resume`, {
        method: 'POST', body: formData
      });
      const data = await r.json();
      if (data.success) {
        setProfile(data.profile);
        notify('Resume parsed and saved!');
      } else {
        notify('Failed to parse resume', 'error');
      }
    } catch { notify('Failed to upload resume', 'error'); }
  };

  // Bounce Checker Polling
  useEffect(() => {
    const checkBounces = async () => {
      try {
        const r = await fetch(`${API_BASE}/api/check-bounces`);
        const d = await r.json();
        if (d.newBounces > 0) {
          notify(`Detected ${d.newBounces} bounced email(s)!`, 'error');
          loadJobs();
        }
      } catch (err) { }
    };
    const interval = setInterval(checkBounces, 30000);
    return () => clearInterval(interval);
  }, []);

  const notify = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const loadJobs = async () => {
    try {
      const r = await fetch(`${API_BASE}/api/jobs`);
      const d = await r.json();
      setJobs(d);
    } catch { notify('Cannot reach backend', 'error'); }
    finally { setLoading(false); }
  };

  const handleAddJob = async e => {
    e.preventDefault();
    try {
      const r = await fetch(`${API_BASE}/api/jobs`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newJob),
      });
      const d = await r.json();
      setJobs(p => [...p, d]);
      setShowAddForm(false);
      setNewJob({ company: '', role: '', status: 'Sent' });
      notify('Job added!');
    } catch { notify('Failed to add job', 'error'); }
  };

  const updateStatus = async (id, status, emailRecipient = null, emailDraft = null, tracked = null) => {
    try {
      const body = { status };
      if (emailRecipient) body.emailRecipient = emailRecipient;
      if (emailDraft) body.emailDraft = emailDraft;
      if (tracked !== null) body.tracked = tracked;

      const r = await fetch(`${API_BASE}/api/jobs/${id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const updatedJob = await r.json();
      setJobs(p => p.map(j => j.id === id ? updatedJob : j));
    } catch { notify('Failed to update status', 'error'); }
  };

  const handleDelete = async (id) => {
    try {
      await fetch(`${API_BASE}/api/jobs/${id}`, { method: 'DELETE' });
      setJobs(p => p.filter(j => j.id !== id));
      notify('Job deleted');
    } catch { notify('Failed to delete job', 'error'); }
  };

  const handleFetchJobs = async () => {
    if (fetchQueries.length === 0) {
      notify('Please add at least one search query', 'error');
      return;
    }
    setFetching(true);
    try {
      const r = await fetch(`${API_BASE}/api/fetch-jobs`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ queries: fetchQueries })
      });
      const d = await r.json();
      notify(d.message || 'Jobs fetched');
      loadJobs();
    } catch { notify('Failed to fetch from Adzuna', 'error'); }
    finally { setFetching(false); }
  };

  const addFetchQuery = (e) => {
    e.preventDefault();
    if (fetchQuery.trim() && !fetchQueries.includes(fetchQuery.trim())) {
      setFetchQueries([...fetchQueries, fetchQuery.trim()]);
      setFetchQuery('');
    }
  };

  const removeFetchQuery = (q) => {
    setFetchQueries(fetchQueries.filter(item => item !== q));
  };

  const handleTestEmail = async () => {
    setTestingEmail(true);
    notify('Drafting and sending test email...', 'info');
    try {
      const r = await fetch(`${API_BASE}/api/test-email`, { method: 'POST' });
      const d = await r.json();
      if (d.success) {
        notify('Test email sent to your inbox!');
        loadJobs();
      } else {
        notify(d.error || 'Failed to send test email', 'error');
      }
    } catch {
      notify('Network error testing email', 'error');
    }
    setTestingEmail(false);
  };

  const activeJobs = jobs.filter(j => {
    if (tab === 'applications') return j.status === 'Found' || j.status === 'Drafting';
    if (tab === 'applied') return ['Sent', 'Opened', 'Bounced'].includes(j.status);
    return true;
  }).filter(j => 
    (statusFilter === 'All' || j.status === statusFilter) &&
    (j.company.toLowerCase().includes(search.toLowerCase()) || 
    j.role.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="dashboard-container">
      {/* Batch Overlay Splash Screen */}
      {batchState.active && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(9, 9, 11, 0.95)', backdropFilter: 'blur(10px)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
          color: 'var(--text-1)'
        }}>
          <h2 style={{fontSize: '28px', fontWeight: '700', marginBottom: '10px', color: 'var(--accent)'}}>
            Auto-Applying... ({batchState.currentIndex} / {batchState.total})
          </h2>
          {batchState.currentJob && (
            <div style={{marginBottom: '30px', fontSize: '18px', color: 'var(--text-2)'}}>
              Current Target: <span style={{fontWeight: '600', color: 'var(--text-1)'}}>{batchState.currentJob.company}</span> - {batchState.currentJob.role}
            </div>
          )}
          
          <div style={{width: '600px', height: '10px', background: 'var(--surface-3)', borderRadius: '5px', overflow: 'hidden', marginBottom: '30px'}}>
            <div style={{width: `${(batchState.currentIndex / batchState.total) * 100}%`, height: '100%', background: 'var(--accent)', transition: 'width 0.3s ease-out'}} />
          </div>

          <div style={{
            background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
            padding: '24px', width: '600px', height: '300px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px',
            boxShadow: '0 10px 30px rgba(0,0,0,0.5)'
          }}>
            {batchState.logs.map((log, idx) => (
              <div key={idx} style={{fontFamily: 'monospace', fontSize: '13px', color: 'var(--text-2)'}}>
                <span style={{color: 'var(--accent)', marginRight: '8px'}}>&gt;</span> {log}
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
              <div className="avatar" style={{background: 'var(--accent)', color: '#fff'}}>{profile.name.substring(0,1).toUpperCase()}</div>
              <div className="user-details">
                <h4>{profile.name}</h4>
                <p>{profile.title || 'Pro Member'}</p>
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
            <h1 style={{textTransform: 'capitalize'}}>{NAV.find(n => n.id === tab)?.label || tab}</h1>
            <p>{activeJobs.length} results found</p>
          </div>
          <div className="header-actions">
            {tab !== 'resume' && (
              <select 
                className="form-input" 
                style={{width: '140px', padding: '6px 12px', marginRight: '10px'}}
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="All">All Statuses</option>
                {tab === 'applications' ? (
                  <>
                    <option value="Found">Found</option>
                    <option value="Drafting">Drafting</option>
                  </>
                ) : (
                  <>
                    <option value="Sent">Sent</option>
                    <option value="Opened">Opened</option>
                    <option value="Bounced">Bounced</option>
                  </>
                )}
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
          </div>
        </div>

        {tab === 'applications' && (
          <div className="add-job-bar">
            {selectedJobs.length > 0 ? (
              <div style={{display: 'flex', alignItems: 'center', width: '100%', gap: '15px'}}>
                <span style={{fontWeight: 600, color: 'var(--accent)'}}>{selectedJobs.length} selected</span>
                {batchProgress !== null ? (
                  <div style={{flex: 1, height: '8px', background: 'var(--surface-4)', borderRadius: '4px', overflow: 'hidden'}}>
                    <div style={{width: `${batchProgress}%`, height: '100%', background: 'var(--accent)', transition: 'width 0.3s'}} />
                  </div>
                ) : (
                  <button className="btn btn-primary" onClick={handleBatchSend}>
                    Auto-Apply to Selected 🚀
                  </button>
                )}
                <button className="btn btn-ghost" style={{marginLeft: 'auto'}} onClick={() => setSelectedJobs([])}>Cancel</button>
              </div>
            ) : (
              <>
                <button className="btn btn-primary" onClick={handleTestEmail} disabled={testingEmail} style={{background: 'var(--surface-4)', color: 'var(--text-1)'}}>
                  {testingEmail ? <span className="spinner"></span> : 'Send Test Email 🧪'}
                </button>
                <div style={{display: 'flex', flexDirection: 'column', gap: '8px', flexGrow: 1}}>
                  <div style={{display: 'flex', flexWrap: 'wrap', gap: '6px'}}>
                    {fetchQueries.map((q, idx) => (
                      <span key={idx} style={{background: 'var(--accent-glow)', color: 'var(--accent)', padding: '4px 10px', borderRadius: '16px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px'}}>
                        {q}
                        <button onClick={() => removeFetchQuery(q)} style={{background: 'transparent', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontWeight: 'bold'}}>&times;</button>
                      </span>
                    ))}
                  </div>
                  <form onSubmit={addFetchQuery} style={{display: 'flex', gap: '10px'}}>
                    <input 
                      type="text" 
                      className="form-input flex-grow" 
                      placeholder="Type a role & press Enter..." 
                      value={fetchQuery}
                      onChange={e => setFetchQuery(e.target.value)}
                    />
                    <button type="submit" className="btn btn-ghost" style={{padding: '6px 12px'}}>Add</button>
                  </form>
                </div>
                <button className="btn btn-primary" onClick={handleFetchJobs} disabled={fetching || fetchQueries.length === 0} style={{alignSelf: 'flex-end'}}>
                  {fetching ? <span className="spinner"></span> : 'Auto-Scrape Fresh Jobs ✨'}
                </button>
                <button className="btn btn-ghost" onClick={() => setShowAddForm(!showAddForm)} style={{alignSelf: 'flex-end'}}>
                  + Manual Add
                </button>
              </>
            )}
          </div>
        )}

        {showAddForm && (
          <form className="add-job-bar" style={{background: 'var(--surface-3)'}} onSubmit={handleAddJob}>
            <input className="form-input flex-grow" placeholder="Company Name" value={newJob.company} onChange={e => setNewJob({...newJob, company: e.target.value})} required />
            <input className="form-input flex-grow" placeholder="Role" value={newJob.role} onChange={e => setNewJob({...newJob, role: e.target.value})} required />
            <button type="submit" className="btn btn-primary">Save Job</button>
          </form>
        )}

        {tab === 'resume' ? (
          <div className="profile-section" style={{padding: '24px', background: 'var(--surface-2)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', flex: 1, overflowY: 'auto', margin: '20px 28px'}}>
            <h2 style={{fontSize: '20px', marginBottom: '20px', color: 'var(--text-1)'}}>Personal Information</h2>
            <form onSubmit={handleProfileSave} style={{display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '600px'}}>
              <div style={{display: 'flex', gap: '16px'}}>
                <div style={{flex: 1}}>
                  <label style={{display: 'block', marginBottom: '8px', color: 'var(--text-2)', fontSize: '13px'}}>Full Name</label>
                  <input className="form-input" style={{width: '100%'}} value={profile.name} onChange={e => setProfile({...profile, name: e.target.value})} />
                </div>
                <div style={{flex: 1}}>
                  <label style={{display: 'block', marginBottom: '8px', color: 'var(--text-2)', fontSize: '13px'}}>Job Title</label>
                  <input className="form-input" style={{width: '100%'}} value={profile.title} onChange={e => setProfile({...profile, title: e.target.value})} />
                </div>
              </div>
              <div>
                <label style={{display: 'block', marginBottom: '8px', color: 'var(--text-2)', fontSize: '13px'}}>Phone Number</label>
                <input className="form-input" style={{width: '100%'}} value={profile.phone} onChange={e => setProfile({...profile, phone: e.target.value})} />
              </div>
              <div>
                <label style={{display: 'block', marginBottom: '8px', color: 'var(--text-2)', fontSize: '13px'}}>LinkedIn URL</label>
                <input className="form-input" style={{width: '100%'}} value={profile.linkedin} onChange={e => setProfile({...profile, linkedin: e.target.value})} />
              </div>
              <div>
                <label style={{display: 'block', marginBottom: '8px', color: 'var(--text-2)', fontSize: '13px'}}>GitHub URL</label>
                <input className="form-input" style={{width: '100%'}} value={profile.github} onChange={e => setProfile({...profile, github: e.target.value})} />
              </div>
              <button type="submit" className="btn btn-primary" style={{alignSelf: 'flex-start', marginTop: '8px'}} disabled={savingProfile}>
                {savingProfile ? <span className="spinner"></span> : 'Save Changes'}
              </button>
            </form>

              <div style={{marginTop: '40px', paddingTop: '30px', borderTop: '1px solid var(--border)'}}>
                <h2 style={{fontSize: '20px', marginBottom: '20px', color: 'var(--text-1)'}}>Email Settings</h2>
                <div style={{background: 'var(--surface-3)', padding: '20px', borderRadius: 'var(--radius)'}}>
                  <p style={{marginBottom: '16px', color: 'var(--text-2)'}}>
                    Connect your Gmail account to send emails directly from the app using Google OAuth2.
                  </p>
                  {profile.emailUser ? (
                    <div style={{display: 'flex', alignItems: 'center', gap: '12px'}}>
                      <div style={{background: 'rgba(34, 197, 94, 0.2)', color: '#4ade80', padding: '6px 12px', borderRadius: '4px', fontSize: '13px', fontWeight: 'bold'}}>✓ Connected</div>
                      <span style={{color: 'var(--text-1)'}}>{profile.emailUser}</span>
                      <a href={`${API_BASE}/api/auth/google`} className="btn btn-ghost" style={{marginLeft: 'auto'}}>Reconnect</a>
                    </div>
                  ) : (
                    <a href={`${API_BASE}/api/auth/google`} className="btn btn-primary" style={{display: 'inline-block', textDecoration: 'none'}}>Sign in with Google</a>
                  )}
                </div>
              </div>

              <div style={{marginTop: '40px', paddingTop: '30px', borderTop: '1px solid var(--border)'}}>
              <h2 style={{fontSize: '20px', marginBottom: '20px', color: 'var(--text-1)'}}>Resume Settings</h2>
              <div style={{background: 'var(--surface-3)', padding: '20px', borderRadius: 'var(--radius)'}}>
                <p style={{marginBottom: '16px', color: 'var(--text-2)'}}>
                  Current Resume: <strong style={{color: 'var(--text-1)'}}>{profile.resumeFilename || 'None uploaded'}</strong>
                </p>
                <input type="file" accept="application/pdf" onChange={handleResumeUpload} style={{color: 'var(--text-2)'}} />
                <p style={{fontSize: '12px', color: 'var(--text-3)', marginTop: '12px'}}>
                  Uploading a new PDF will automatically extract and parse the text for the AI context.
                </p>
              </div>
            </div>
          </div>
        ) : tab === 'single_drafter' ? (
          <div className="single-drafter-section" style={{padding: '24px', background: 'var(--surface-2)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', flex: 1, overflowY: 'auto', margin: '20px 28px'}}>
            <h2 style={{fontSize: '20px', marginBottom: '8px', color: 'var(--text-1)'}}>Single Mail Drafter</h2>
            <p style={{color: 'var(--text-2)', marginBottom: '24px', fontSize: '14px'}}>Paste a Job Description below, and the AI will draft and send a highly personalized cold email instantly.</p>
            
            <form onSubmit={async (e) => {
              e.preventDefault();
              setFetching(true);
              try {
                const formData = new FormData(e.target);
                const data = Object.fromEntries(formData);
                const res = await fetch(`${API_BASE}/api/single-draft`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
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
            }} style={{display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '800px'}}>
              <div style={{display: 'flex', gap: '16px'}}>
                <div style={{flex: 1}}>
                  <label style={{display: 'block', marginBottom: '8px', color: 'var(--text-2)', fontSize: '13px'}}>Company Name</label>
                  <input name="company" required className="form-input" style={{width: '100%'}} placeholder="e.g. Google" />
                </div>
                <div style={{flex: 1}}>
                  <label style={{display: 'block', marginBottom: '8px', color: 'var(--text-2)', fontSize: '13px'}}>Role / Job Title</label>
                  <input name="role" required className="form-input" style={{width: '100%'}} placeholder="e.g. Senior Software Engineer" />
                </div>
              </div>
              <div>
                <label style={{display: 'block', marginBottom: '8px', color: 'var(--text-2)', fontSize: '13px'}}>Recipient Email</label>
                <input name="recipientEmail" type="email" required className="form-input" style={{width: '100%'}} placeholder="e.g. hiring@google.com" />
              </div>
              <div>
                <label style={{display: 'block', marginBottom: '8px', color: 'var(--text-2)', fontSize: '13px'}}>Job Description</label>
                <textarea name="jd" required className="form-input" style={{width: '100%', minHeight: '300px', resize: 'vertical'}} placeholder="Paste the full job description here..."></textarea>
              </div>
              <button type="submit" className="btn btn-primary" style={{alignSelf: 'flex-start', padding: '12px 24px', fontSize: '15px'}} disabled={fetching}>
                {fetching ? <span className="spinner"></span> : 'Draft & Send Email 🚀'}
              </button>
            </form>
          </div>
        ) : (
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
                      <th style={{width: '40px'}}>
                        <input 
                          type="checkbox" 
                          onChange={(e) => {
                            if (e.target.checked) setSelectedJobs(activeJobs.map(j => j.id));
                            else setSelectedJobs([]);
                          }}
                          checked={activeJobs.length > 0 && selectedJobs.length === activeJobs.length}
                        />
                      </th>
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
                        <td>
                          <input 
                            type="checkbox" 
                            checked={selectedJobs.includes(job.id)} 
                            onChange={() => toggleSelectJob(job.id)} 
                          />
                        </td>
                        <td>
                          <div className="company-cell">
                            <div className="company-avatar">{job.company.substring(0,2).toUpperCase()}</div>
                            {job.company}
                          </div>
                        </td>
                        <td className="role-cell">{job.role}</td>
                        <td className="date-cell">{new Date(job.createdAt || Date.now()).toLocaleDateString()}</td>
                        <td>
                          <div style={{display: 'flex', alignItems: 'center'}}>
                            <select 
                              className={`status-select badge ${job.status.toLowerCase()}`}
                              value={job.status}
                              onChange={(e) => updateStatus(job.id, e.target.value)}
                            >
                              <option value="Found">Found</option>
                              <option value="Drafting">Drafting</option>
                              <option value="Sent">Sent</option>
                              <option value="Opened">Opened</option>
                              <option value="Bounced">Bounced</option>
                            </select>
                            {job.tracked && (
                              <span style={{fontSize: '14px', marginLeft: '6px', cursor: 'help'}} title="Link Tracking Enabled">
                                🎯
                              </span>
                            )}
                            {job.clickedLinks && job.clickedLinks.length > 0 && (
                              <div style={{display: 'flex', gap: '6px', marginLeft: '8px', alignItems: 'center'}}>
                                {job.clickedLinks.map((link, idx) => {
                                  if (link.includes('linkedin.com')) return <span key={idx} title="LinkedIn Clicked" style={{cursor: 'help', display: 'flex'}}><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="#0a66c2"><path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/></svg></span>;
                                  if (link.includes('github.com')) return <span key={idx} title="GitHub Clicked" style={{cursor: 'help', display: 'flex'}}><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg></span>;
                                  if (link.includes('resume-pdf')) return <span key={idx} title="Resume Downloaded" style={{cursor: 'help', display: 'flex'}}><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg></span>;
                                  return <span key={idx} title="Link Clicked" style={{fontSize: '14px', cursor: 'help'}}>🔗</span>;
                                })}
                              </div>
                            )}
                          </div>
                        </td>
                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-start' }}>
                            <button className="btn btn-ghost" onClick={() => job.applyLink ? window.open(job.applyLink, '_blank') : alert('No URL available for this job')} style={{padding: '4px 10px', fontSize: '11px'}}>
                              View Job
                            </button>
                            {(job.emailDraft || job.status === 'Sent' || job.status === 'Opened') && (
                              <button className="btn btn-primary" onClick={() => setSelectedMail(job)} style={{padding: '4px 10px', fontSize: '11px'}}>
                                Show Mail
                              </button>
                            )}
                            <button className="btn btn-ghost" onClick={() => handleDelete(job.id)} style={{padding: '4px 10px', fontSize: '11px'}}>
                              Delete
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
        )}
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
            <div style={{padding: '16px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
              <h3 style={{margin: 0, color: 'var(--text-1)'}}>Sent Mail - {selectedMail.company}</h3>
              <button onClick={() => setSelectedMail(null)} style={{background: 'transparent', border: 'none', color: 'var(--text-2)', cursor: 'pointer', fontSize: '20px'}}>×</button>
            </div>
            <div style={{padding: '24px', overflowY: 'auto', flex: 1, color: 'var(--text-2)', fontSize: '14px', whiteSpace: 'pre-wrap', lineHeight: 1.6}}>
              <div style={{marginBottom: '16px', padding: '12px', background: 'var(--surface-3)', borderRadius: '6px', fontSize: '13px'}}>
                <div><strong>To:</strong> {selectedMail.emailRecipient || 'Unknown'}</div>
                <div><strong>Tracked:</strong> {selectedMail.tracked ? 'Yes 🎯' : 'No'}</div>
                {selectedMail.clickedLinks && selectedMail.clickedLinks.length > 0 && (
                  <div style={{marginTop: '8px'}}>
                    <strong>Clicked Links:</strong>
                    <ul style={{margin: '4px 0 0', paddingLeft: '20px'}}>
                      {selectedMail.clickedLinks.map((link, i) => (
                        <li key={i}><a href={link} target="_blank" rel="noreferrer" style={{color: 'var(--accent)'}}>{link}</a></li>
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
            <div style={{padding: '16px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
              <h3 style={{margin: 0, color: 'var(--text-1)'}}>Job Details - {selectedJobDetails.company}</h3>
              <button onClick={() => setSelectedJobDetails(null)} style={{background: 'transparent', border: 'none', color: 'var(--text-2)', cursor: 'pointer', fontSize: '20px'}}>×</button>
            </div>
            <div style={{padding: '24px', overflowY: 'auto', flex: 1, color: 'var(--text-2)', fontSize: '14px', whiteSpace: 'pre-wrap', lineHeight: 1.6}}>
              <div style={{marginBottom: '16px', padding: '12px', background: 'var(--surface-3)', borderRadius: '6px', fontSize: '13px'}}>
                <div><strong>Role:</strong> {selectedJobDetails.role}</div>
                {selectedJobDetails.location && <div><strong>Location:</strong> {selectedJobDetails.location}</div>}
                {selectedJobDetails.applyLink && <div><strong>Link:</strong> <a href={selectedJobDetails.applyLink} target="_blank" rel="noreferrer" style={{color: 'var(--accent)'}}>{selectedJobDetails.applyLink}</a></div>}
              </div>
              <h4 style={{color: 'var(--text-1)', marginBottom: '10px'}}>Job Description</h4>
              {selectedJobDetails.jd ? selectedJobDetails.jd : 'No job description available.'}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
