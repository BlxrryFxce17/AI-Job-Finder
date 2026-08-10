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
  
  // Email drafter
  const [selJobId, setSelJobId] = useState('');
  const [emailType, setEmailType] = useState('Cold Outreach / Networking');
  const [draft, setDraft] = useState('');
  const [generating, setGenerating] = useState(false);
  const [recipient, setRecipient] = useState('');
  const [sendingEmail, setSendingEmail] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);

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

  const handleGenerate = async (job) => {
    setGenerating(true);
    setPanelOpen(true);
    setSelJobId(job.id);
    setDraft('');
    setRecipient('');
    try {
      const discRes = await fetch(`${API_BASE}/api/discover-email`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company: job.company, jd: job.jd })
      });
      const discData = await discRes.json();
      setRecipient(discData.email || '');

      const genRes = await fetch(`${API_BASE}/api/generate-email`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company: job.company, role: job.role, jd: job.jd, emailType })
      });
      const genData = await genRes.json();
      setDraft(genData.draft);
    } catch { notify('Failed to generate email', 'error'); }
    finally { setGenerating(false); }
  };

  const handleSendEmail = async () => {
    setSendingEmail(true);
    try {
      const r = await fetch(`${API_BASE}/api/send-email`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: selJobId, recipient, draft })
      });
      const d = await r.json();
      if (d.success) {
        notify('Email sent successfully!');
        setPanelOpen(false);
        updateStatus(selJobId, 'Sent', recipient, draft);
      } else {
        notify(d.error || 'Failed to send', 'error');
      }
    } catch { notify('Error sending email', 'error'); }
    finally { setSendingEmail(false); }
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
            <h1 style={{textTransform: 'capitalize'}}>{tab.replace('-', ' ')}</h1>
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
                          {tab === 'applications' && (
                            <button className="btn btn-primary" onClick={() => handleGenerate(job)} style={{marginRight: '8px', padding: '4px 10px'}}>
                              Draft Email ✨
                            </button>
                          )}
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

      {/* Email Panel */}
      <div className={`email-panel ${panelOpen ? 'open' : 'closed'}`}>
        <div className="panel-header" onClick={() => setPanelOpen(!panelOpen)}>
          <div className="panel-title">AI Email Drafter</div>
          <div className="panel-toggle">{panelOpen ? '▶' : '◀'}</div>
        </div>
        
        {panelOpen && (
          <div className="panel-body">
            {generating ? (
              <div className="empty-state h-full">
                <span className="loading-spinner"></span>
                <p style={{marginTop: '10px'}}>Discovering HR email & generating draft...</p>
              </div>
            ) : (
              <>
                <div>
                  <span className="form-label">To (HR/Recruiter)</span>
                  <input 
                    type="text" 
                    className="form-input" 
                    style={{width: '100%', marginTop: '8px'}}
                    value={recipient}
                    onChange={e => setRecipient(e.target.value)}
                    placeholder="hr@company.com"
                  />
                </div>

                <div>
                  <span className="form-label">Email Type</span>
                  <select 
                    className="form-select" 
                    style={{width: '100%', marginTop: '8px'}}
                    value={emailType}
                    onChange={e => setEmailType(e.target.value)}
                  >
                    <option>Cold Outreach / Networking</option>
                    <option>Direct Application</option>
                    <option>Follow Up</option>
                  </select>
                </div>
                
                <div className="draft-area-wrapper">
                  <span className="form-label" style={{marginBottom: '8px', display: 'block'}}>Drafted Message</span>
                  <textarea 
                    className="draft-textarea"
                    value={draft}
                    onChange={e => setDraft(e.target.value)}
                  />
                </div>

                <div className="panel-actions">
                  <button className="btn btn-ghost" onClick={() => setPanelOpen(false)}>Cancel</button>
                  <button 
                    className="btn btn-primary" 
                    disabled={sendingEmail || !draft || !recipient}
                    onClick={handleSendEmail}
                  >
                    {sendingEmail ? <span className="spinner"></span> : 'Send & Track 🚀'}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

    </div>
  );
}
