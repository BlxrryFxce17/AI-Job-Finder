import { useState, useEffect } from 'react';

export const NAV = [
  { id: 'applications', label: 'My Applications', icon: '⚡' },
  { id: 'applied', label: 'Mail Applied Jobs', icon: '📬' },
  { id: 'single_drafter', label: 'Single Mail Drafter', icon: '✉️' },
  { id: 'resume', label: 'Profile Settings', icon: '⚙️' },
];

export const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export function useAppLogic() {
  const [tab, setTab] = useState('applications');
  const [sidebarOpen, setSidebarOpen] = useState(window.innerWidth > 768);
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

  const loadProfile = async () => {
    try {
      const r = await fetch(`${API_BASE}/api/profile`);
      const p = await r.json();
      setProfile(p);
    } catch (err) { }
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

  const toggleSelectJob = (id) => {
    setSelectedJobs(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);
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

  return {
    tab, setTab,
    sidebarOpen, setSidebarOpen,
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
  };
}
