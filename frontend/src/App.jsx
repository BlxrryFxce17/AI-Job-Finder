import React, { useState, useEffect } from 'react';
import './index.css';

const NAV = [
  { id: 'applications', label: 'My Applications', icon: '⚡' },
  { id: 'applied', label: 'Mail Applied Jobs', icon: '📬' },
  { id: 'draft', label: 'Application Draft', icon: '✏️' },
  { id: 'resume', label: 'My Resume', icon: '📄' },
  { id: 'referrals', label: 'Referrals', icon: '🔗' },
];

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export default function App() {
  const [tab, setTab] = useState('applications');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [fetchQuery, setFetchQuery] = useState('software developer');
  const [fetching, setFetching] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newJob, setNewJob] = useState({ company: '', role: '', status: 'Sent' });
  const [toast, setToast] = useState(null);
  
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
               updateStatus(job.id, 'Sent', discoveredEmail, genData.draft);
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
    
    // Auto-refresh jobs every 5 seconds for real-time tracking updates
    const trackingInterval = setInterval(loadJobs, 5000);
    return () => clearInterval(trackingInterval);
  }, []);

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

  const updateStatus = async (id, status, emailRecipient = null, emailDraft = null) => {
    try {
      const body = { status };
      if (emailRecipient) body.emailRecipient = emailRecipient;
      if (emailDraft) body.emailDraft = emailDraft;

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
    setFetching(true);
    try {
      const r = await fetch(`${API_BASE}/api/fetch-jobs`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: fetchQuery })
      });
      const d = await r.json();
      notify(d.message || 'Jobs fetched');
      loadJobs();
    } catch { notify('Failed to fetch from Adzuna', 'error'); }
    finally { setFetching(false); }
  };

  const activeJobs = jobs.filter(j => {
    if (tab === 'applications') return j.status === 'Found' || j.status === 'Drafting';
    if (tab === 'applied') return ['Sent', 'Opened', 'Bounced'].includes(j.status);
    return true;
  }).filter(j => 
    j.company.toLowerCase().includes(search.toLowerCase()) || 
    j.role.toLowerCase().includes(search.toLowerCase())
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
          {sidebarOpen ? '◀' : '▶'}
        </div>
        
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
            <div className="avatar">AI</div>
            <div className="user-details">
              <h4>Akash</h4>
              <p>Pro Member</p>
            </div>
          </div>
          <button className="upgrade-btn">View Profile</button>
        </div>
      </div>

      {/* Main Content */}
      <div className="main-content">
        <div className="top-header">
          <div className="page-title">
            <h1 style={{textTransform: 'capitalize'}}>{NAV.find(n => n.id === tab)?.label || tab}</h1>
            <p>{activeJobs.length} results found</p>
          </div>
          <div className="header-actions">
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
                <input 
                  type="text" 
                  className="form-input flex-grow" 
                  placeholder="e.g. software engineer in new york" 
                  value={fetchQuery}
                  onChange={e => setFetchQuery(e.target.value)}
                />
                <button className="btn btn-primary" onClick={handleFetchJobs} disabled={fetching}>
                  {fetching ? <span className="spinner"></span> : 'Auto-Scrape Fresh Jobs ✨'}
                </button>
                <button className="btn btn-ghost" onClick={() => setShowAddForm(!showAddForm)}>
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
                    <th>Date Found</th>
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
                      </td>
                      <td>
                        <div className="flex gap-2">
                          <button className="btn btn-ghost" onClick={() => handleDelete(job.id)} style={{padding: '4px 10px'}}>
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
      </div>


    </div>
  );
}
