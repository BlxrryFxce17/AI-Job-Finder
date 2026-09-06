import React, { useState, useEffect, useRef } from 'react';

import { BarChart3, Briefcase, MailCheck, RotateCw, Mail, User, Settings, Inbox } from 'lucide-react';

export const NAV = [
  { id: 'applications', label: 'Jobs Search', icon: <Briefcase size={20} /> },
  { id: 'hr_dashboard', label: 'HR Discovery', icon: <User size={20} /> },
  { id: 'single_drafter', label: 'Email Drafter', icon: <Mail size={20} /> },
  { id: 'applied', label: 'Applied Jobs', icon: <MailCheck size={20} /> },
  { id: 'followups', label: 'Follow Ups', icon: <RotateCw size={20} /> },
  { id: 'inbox', label: 'Smart Inbox', icon: <Inbox size={20} /> },
  { id: 'resume', label: 'Profile Settings', icon: <User size={20} /> },
  { id: 'ai_settings', label: 'AI Settings', icon: <Settings size={20} /> },
];

export const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000';

// Senior role detection helpers
export const isSeniorJob = (role = '', jd = '') => {
  const SENIOR_TITLE_REGEX = /\b(sr\.?|senior|lead|principal|staff|architect|director|vp|vice president|manager|head of|sde[- ]?(3|iii)|engineer[- ]?(3|iii)|level[- ]?3)\b/i;
  const SENIOR_EXP_REGEX = /(?:5\+|[5-9]|\d{2})\+?\s*(?:-\s*\d+\s*)?(?:years?|yrs?)(?:\s+of)?\s+experience|minimum\s+(?:of\s+)?(?:5|[6-9]|\d{2})\+?\s*(?:years?|yrs?)/i;
  return SENIOR_TITLE_REGEX.test(role) || SENIOR_EXP_REGEX.test(jd);
};

// Junior role detection helpers
export const isJuniorJob = (role = '', jd = '') => {
  if (isSeniorJob(role, jd)) return false;
  const JUNIOR_TITLE_REGEX = /\b(jr\.?|junior|entry|entry[- ]level|fresher|freshers|intern|internship|associate|trainee|graduate|grad|sde[- ]?(1|i)\b|engineer[- ]?(1|i)\b|level[- ]?1)\b/i;
  const JUNIOR_EXP_REGEX = /(?:0[- ](?:to[- ])?[1-2]|0\+?|[1-2])\s*(?:years?|yrs?)(?:\s+of)?\s+experience|\b(freshers?|no experience|entry[- ]level|recent graduates?)\b/i;
  return JUNIOR_TITLE_REGEX.test(role) || JUNIOR_EXP_REGEX.test(jd);
};

export const getJobLevel = (job) => {
  if (!job) return 'Mid';
  if (isSeniorJob(job.role || '', job.jd || '')) return 'Senior';
  if (isJuniorJob(job.role || '', job.jd || '')) return 'Junior';
  if (job.experienceLevel && ['Junior', 'Mid', 'Senior'].includes(job.experienceLevel)) {
    return job.experienceLevel;
  }
  return 'Mid';
};

const isJuniorQuery = (q = '') => {
  return /\b(jr\.?|junior|entry|entry[- ]level|fresher|freshers|intern|internship|associate|trainee|graduate)\b/i.test(q);
};

export const extractPackage = (salaryStr = '', jd = '') => {
  if (salaryStr && salaryStr.trim()) return salaryStr.trim();
  if (!jd) return '';

  // 1. LPA / Lacs / Lakhs patterns (e.g. 4-8 LPA, 6 LPA, 5.5 to 8 Lakhs, INR 6,00,000 - 10,00,000 PA)
  const lpaMatch = jd.match(/(?:(?:INR|Rs\.?|₹)\s*)?(\d+(?:\.\d+)?\s*(?:-|to)\s*\d+(?:\.\d+)?|\d+(?:\.\d+)?)\s*(?:LPA|Lacs?|Lakhs?)(?:\s*(?:per\s+annum|P\.?A\.?))?/i);
  if (lpaMatch) return lpaMatch[0].trim();

  // 2. Rupee monthly ranges (e.g. ₹25,000 - ₹45,000 / month, 30k - 50k / month)
  const rupeeKMatch = jd.match(/(?:(?:INR|Rs\.?|₹)\s*)?(\d+k)\s*(?:-|to)\s*(?:(?:INR|Rs\.?|₹)\s*)?(\d+k)(?:\s*(?:\/|per\s+)?(?:month|mo|pm|year|yr|annum))?/i);
  if (rupeeKMatch) return rupeeKMatch[0].trim();

  const rupeeMonthlyMatch = jd.match(/(?:(?:INR|Rs\.?|₹)\s*)(\d{1,3}(?:,\d{3})+)\s*(?:-|to)\s*(?:(?:INR|Rs\.?|₹)\s*)?(\d{1,3}(?:,\d{3})+)(?:\s*(?:\/|per\s+)?(?:month|mo|pm))?/i);
  if (rupeeMonthlyMatch) return rupeeMonthlyMatch[0].trim();

  // 3. Annual rupee ranges (e.g. ₹4,00,000 - ₹7,00,000)
  const rupeeAnnualMatch = jd.match(/(?:(?:INR|Rs\.?|₹)\s*)(\d{1,3}(?:,\d{3})+)\s*(?:-|to)\s*(?:(?:INR|Rs\.?|₹)\s*)?(\d{1,3}(?:,\d{3})+)(?:\s*(?:per\s+annum|P\.?A\.?|PA|\/yr))?/i);
  if (rupeeAnnualMatch) return rupeeAnnualMatch[0].trim();

  // 4. Foreign currency rates (e.g. $50k - $80k, $40 - $60 / hr, $60,000 - $90,000)
  const foreignMatch = jd.match(/(?:[\$€£]|USD|EUR|GBP)\s*(\d+(?:,\d{3})*(?:k)?)\s*(?:-|to)\s*(?:[\$€£]|USD|EUR|GBP)?\s*(\d+(?:,\d{3})*(?:k)?)(?:\s*(?:\/|per\s+)?(?:yr|year|hr|hour))?/i);
  if (foreignMatch) return foreignMatch[0].trim();

  return '';
};

export const extractWorkMode = (location = '', jd = '') => {
  const text = `${location} ${jd}`.toLowerCase();
  if (/\bremote\b|work from home|\bwfh\b/i.test(text)) return 'Remote';
  if (/\bhybrid\b/i.test(text)) return 'Hybrid';
  if (/\bon-?site\b|\bin-?office\b/i.test(text)) return 'On-site';
  return '';
};

export const parseRoleDisplay = (rawRole = '') => {
  if (!rawRole) return { title: 'General Position', meta: [] };
  let cleaned = rawRole.replace(/^(?:[A-Za-z0-9&., ]+\s+)?(?:Hiring|Hiring For|Urgent Opening For|Looking For)\s*:\s*/i, '').trim();
  if (cleaned.includes('|')) {
    const parts = cleaned.split('|').map(p => p.trim()).filter(Boolean);
    const title = parts[0];
    const meta = parts.slice(1);
    return { title, meta };
  }
  return { title: cleaned, meta: [] };
};

export function useAppLogic() {
  const [token, setToken] = useState(localStorage.getItem('token') || null);
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'dark');
  
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);
  
  const [tab, setTab] = useState('applications');
  const [sidebarOpen, setSidebarOpen] = useState(window.innerWidth > 768);
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [sourceFilter, setSourceFilter] = useState('All');
  const [experienceFilter, setExperienceFilter] = useState('All');
  const [fetchQuery, setFetchQuery] = useState('');
  const [fetchQueries, setFetchQueries] = useState(['software developer']);
  const [fetching, setFetching] = useState(false);
  const [useApify, setUseApify] = useState(false);
  const [appliedViewType, setAppliedViewType] = useState('All');
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

  // Inbox State
  const [inboxReplies, setInboxReplies] = useState([]);
  const [inboxLoading, setInboxLoading] = useState(false);

  const notify = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Helper for authenticated fetch
  const apiFetch = async (url, options = {}) => {
    const headers = { ...options.headers };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(url, { ...options, headers });
    if (res.status === 401) {
      logout();
      throw new Error('Unauthorized');
    }
    return res;
  };

  const logout = () => {
    localStorage.removeItem('token');
    setToken(null);
    setJobs([]);
    setProfile({ name: 'Loading...', title: '', phone: '', linkedin: '', github: '', resumeFilename: '', emailUser: '' });
  };

  const [showTutorial, setShowTutorial] = useState(() => {
    return localStorage.getItem('token') && !localStorage.getItem('tutorialSeen');
  });

  const completeTutorial = () => {
    localStorage.setItem('tutorialSeen', 'true');
    setShowTutorial(false);
    setTab('resume');
  };

  useEffect(() => {
    // Check for token in URL parameters (OAuth callback)
    const urlParams = new URLSearchParams(window.location.search);
    const urlToken = urlParams.get('token');
    if (urlToken) {
      localStorage.setItem('token', urlToken);
      setToken(urlToken);
      if (!localStorage.getItem('tutorialSeen')) {
        setShowTutorial(true);
      } else {
        setTab('resume'); // Redirect to profile page on fresh login
      }
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  const loadJobs = async () => {
    if (!token) return;
    try {
      const r = await apiFetch(`${API_BASE}/api/jobs`);
      const d = await r.json();
      setJobs(d);
    } catch { notify('Cannot reach backend', 'error'); }
    finally { setLoading(false); }
  };

  const loadProfile = async () => {
    if (!token) return;
    try {
      const r = await apiFetch(`${API_BASE}/api/profile`);
      const p = await r.json();
      setProfile(p);
      if (p.experienceLevel && isJuniorQuery(p.experienceLevel)) {
        setExperienceFilter(prev => prev === 'All' ? 'Junior' : prev);
        setFetchQueries(prev => (prev.length === 1 && prev[0] === 'software developer') ? ['junior software developer', 'fresher software engineer'] : prev);
      }
    } catch (err) { }
  };

  useEffect(() => { 
    if (token) {
      loadJobs(); 
      loadProfile();
      
      // Auto-refresh jobs every 5 seconds for real-time tracking updates
      const trackingInterval = setInterval(loadJobs, 5000);
      return () => clearInterval(trackingInterval);
    } else {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    setStatusFilter('All');
  }, [tab]);

  // Bounce Checker Polling
  useEffect(() => {
    const checkBounces = async () => {
      if (!token) return;
      try {
        const r = await apiFetch(`${API_BASE}/api/jobs/check-bounces`);
        const d = await r.json();
        if (d.newBounces > 0) {
          notify(`Detected ${d.newBounces} bounced email(s)!`, 'error');
          loadJobs();
        }
      } catch (err) { }
    };
    if (token) {
      const interval = setInterval(checkBounces, 30000);
      return () => clearInterval(interval);
    }
  }, [token]);

  const toggleSelectJob = (id) => {
    setSelectedJobs(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);
  };

  const updateStatus = async (id, status, emailRecipient = null, emailDraft = null, tracked = null) => {
    try {
      const body = { status };
      if (emailRecipient) body.emailRecipient = emailRecipient;
      if (emailDraft) body.emailDraft = emailDraft;
      if (tracked !== null) body.tracked = tracked;

      const r = await apiFetch(`${API_BASE}/api/jobs/${id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const updatedJob = await r.json();
      setJobs(p => p.map(j => j.id === id ? updatedJob : j));
    } catch { notify('Failed to update status', 'error'); }
  };

  const batchQueueRef = useRef([]);
  const isBatchingRef = useRef(false);

  const handleBatchSend = async (jobIds = null) => {
    const jobsToProcess = jobIds || selectedJobs;
    if (jobsToProcess.length === 0) return;
    
    batchQueueRef.current = [...batchQueueRef.current, ...jobsToProcess];
    
    if (isBatchingRef.current) {
        setBatchState(prev => ({ 
            ...prev, 
            total: prev.currentIndex + batchQueueRef.current.length, 
            logs: [...prev.logs, `Added ${jobsToProcess.length} job(s) to the queue...`] 
        }));
        return;
    }
    
    isBatchingRef.current = true;
    setBatchProgress(0);
    setBatchState({ active: true, currentIndex: 0, total: batchQueueRef.current.length, currentJob: null, logs: [] });
    
    let processed = 0;
    
    while (batchQueueRef.current.length > 0 && isBatchingRef.current) {
      const jobId = batchQueueRef.current.shift();
      const job = jobs.find(j => j.id === jobId);
      if (!job) continue;

      processed++;
      setBatchState(prev => ({ ...prev, currentIndex: processed, currentJob: job, logs: [...prev.logs, `[${job.company}] Starting processing...`] }));

      try {
        let discoveredEmail = job.emailRecipient;
        if (!discoveredEmail) {
          setBatchState(prev => ({ ...prev, logs: [...prev.logs, `[${job.company}] Discovering HR email...`] }));
          const discRes = await apiFetch(`${API_BASE}/api/discover-email`, {
             method: 'POST', headers: { 'Content-Type': 'application/json' },
             body: JSON.stringify({
               company: job.company,
               jd: job.jd,
               hrName: job.hrName || null,
               hrLinkedInUrl: job.hrLinkedIn || null,
               applyLink: job.applyLink || null,
               failedEmails: job.failedEmails || []
             })
          });
          const discData = await discRes.json();
          discoveredEmail = discData.email || '';
        }
        
        setBatchState(prev => ({ ...prev, logs: [...prev.logs, `[${job.company}] Found email: ${discoveredEmail || 'None'}. Drafting...`] }));
        const genRes = await apiFetch(`${API_BASE}/api/generate-email`, {
           method: 'POST', headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify({ company: job.company, role: job.role, jd: job.jd, emailType: 'Cold Outreach / Networking' })
        });
        const genData = await genRes.json();
        
        if (discoveredEmail && genData.draft) {
            setBatchState(prev => ({ ...prev, logs: [...prev.logs, `[${job.company}] Draft ready. Sending...`] }));
            const sendRes = await apiFetch(`${API_BASE}/api/send-email`, {
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
      // Calculate progress based on total originally queued + newly queued
      setBatchState(prev => {
        setBatchProgress((processed / prev.total) * 100);
        return prev;
      });
    }

    if (isBatchingRef.current) {
      setBatchState(prev => ({ ...prev, logs: [...prev.logs, `All queued tasks complete! Closing in 3 seconds...`] }));
      notify('Queue complete!');
      setTimeout(() => {
        isBatchingRef.current = false;
        setBatchProgress(null);
        setSelectedJobs([]);
        setBatchState(prev => ({ ...prev, active: false }));
        loadJobs();
      }, 3000);
    }
  };

  const cancelBatch = () => {
    batchQueueRef.current = [];
    isBatchingRef.current = false;
    setBatchState(prev => ({ ...prev, active: false, logs: [...prev.logs, '🛑 Batch cancelled by user.'] }));
    notify('Batch processing cancelled', 'info');
  };

  const handleProfileSave = async (e) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      const r = await apiFetch(`${API_BASE}/api/profile`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile)
      });
      const p = await r.json();
      setProfile(p);
      notify('Profile saved successfully');
    } catch { notify('Failed to save profile', 'error'); }
    finally { setSavingProfile(false); }
  };

  const handleResumeUpload = async (e) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const formData = new FormData();
    formData.append('resume', e.target.files[0]);
    notify('Uploading & Parsing Resume...', 'info');
    try {
      const r = await apiFetch(`${API_BASE}/api/profile/resume`, {
        method: 'POST', body: formData // don't set Content-Type header so browser sets multipart/form-data with boundary
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

  const handleDelete = async (id) => {
    try {
      await apiFetch(`${API_BASE}/api/jobs/${id}`, { method: 'DELETE' });
      setJobs(p => p.filter(j => j.id !== id));
      notify('Job deleted');
    } catch { notify('Failed to delete job', 'error'); }
  };

  const handleBatchDelete = async () => {
    if (!selectedJobs.length) return;
    if (!confirm(`Delete ${selectedJobs.length} selected jobs?`)) return;
    
    setLoading(true);
    for (const id of selectedJobs) {
      await apiFetch(`${API_BASE}/api/jobs/${id}`, { method: 'DELETE' });
    }
    setJobs(jobs.filter(j => !selectedJobs.includes(j.id)));
    setSelectedJobs([]);
    setLoading(false);
    notify(`${selectedJobs.length} jobs deleted`);
  };

  const fetchInbox = async (searchQuery = '') => {
    setInboxLoading(true);
    try {
      const qParam = searchQuery && searchQuery.trim() ? `?q=${encodeURIComponent(searchQuery.trim())}` : '';
      const res = await apiFetch(`${API_BASE}/api/inbox${qParam}`);
      if (res.ok) {
        const data = await res.json();
        setInboxReplies(data.replies || []);
      }
    } catch (e) {
      console.error(e);
      notify('Failed to load inbox', 'error');
    } finally {
      setInboxLoading(false);
    }
  };

  useEffect(() => {
    if (tab === 'inbox' && inboxReplies.length === 0) {
      fetchInbox();
    }
  }, [tab]);

  const handleFetchJobs = async () => {
    if (fetchQueries.length === 0) {
      notify('Please add at least one search query', 'error');
      return;
    }
    setFetching(true);
    try {
      const r = await apiFetch(`${API_BASE}/api/jobs/fetch-jobs`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          queries: fetchQueries,
          useApify,
          experience: experienceFilter
        })
      });
      const d = await r.json();
      notify(d.message || 'Jobs fetched');
      loadJobs();
    } catch { notify('Failed to fetch jobs', 'error'); }
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

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  useEffect(() => {
    setCurrentPage(1);
  }, [search, statusFilter, sourceFilter, tab]);

  const trimmedSearch = (search || '').trim();

  const activeJobs = (jobs || []).filter(j => {
    if (!j) return false;
    if (tab === 'applications') return j.status === 'Found' || j.status === 'Drafting';
    if (tab === 'applied') {
      const isAppliedStatus = ['Sent', 'Opened', 'Bounced', 'Replied', 'LinkedIn_Sent', 'LinkedIn_Connected', 'LinkedIn_Replied'].includes(j.status);
      if (!isAppliedStatus) return false;
      if (appliedViewType === 'HR') return !!j.hrName;
      if (appliedViewType === 'Jobs') return !j.hrName;
      return true;
    }
    return true;
  }).filter(j => {
    // 1. Status Filter
    if (statusFilter !== 'All' && j.status !== statusFilter) return false;

    // 2. Source / Portal Filter
    if (sourceFilter !== 'All' && (!j.source || j.source.toLowerCase() !== sourceFilter.toLowerCase())) return false;

    // 3. Search Box Tokenized Matching
    if (!trimmedSearch) return true;

    const searchTokens = trimmedSearch.split(/\s+/).filter(Boolean);
    const roleLower = (j.role || '').toLowerCase();
    const companyLower = (j.company || '').toLowerCase();
    const jdLower = (j.jd || '').toLowerCase();
    const locLower = (j.location || '').toLowerCase();

    return searchTokens.every(token => {
      // If token is a junior indicator, verify the job is junior
      if (/\b(jr\.?|junior|entry|fresher|intern|associate)\b/i.test(token)) {
        return isJuniorJob(j.role, j.jd) || roleLower.includes(token);
      }
      return roleLower.includes(token) || companyLower.includes(token) || locLower.includes(token) || jdLower.includes(token);
    });
  }).sort((a, b) => {
    if (tab === 'applied') {
      const timeA = new Date(a.sentAt || a.updatedAt || a.createdAt || 0).getTime();
      const timeB = new Date(b.sentAt || b.updatedAt || b.createdAt || 0).getTime();
      return timeB - timeA; // Latest sent first
    }
    const timeA = new Date(a.publishedAt || a.createdAt || a.updatedAt || 0).getTime();
    const timeB = new Date(b.publishedAt || b.createdAt || b.updatedAt || 0).getTime();
    return timeB - timeA; // Latest found first
  });

  const paginatedJobs = activeJobs.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  const totalPages = Math.ceil(activeJobs.length / itemsPerPage);

  const handlePurgeSeniorJobs = async () => {
    if (!window.confirm("Are you sure you want to remove all Senior/Lead job postings that you are not qualified for?")) {
      return;
    }
    try {
      const res = await apiFetch(`${API_BASE}/api/jobs/purge-senior`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        notify(data.message || `Removed ${data.deletedCount} senior roles.`);
        loadJobs();
      } else {
        notify(data.error || 'Failed to remove senior jobs', 'error');
      }
    } catch (err) {
      notify('Failed to purge senior jobs', 'error');
    }
  };

  const exportToCSV = () => {
    if (jobs.length === 0) {
      notify('No jobs to export', 'error');
      return;
    }
    const headers = ['Company', 'Role', 'Email', 'Status', 'Date Found', 'Date Sent'];
    const rows = jobs.map(j => [
      `"${(j.company || '').replace(/"/g, '""')}"`,
      `"${(j.role || '').replace(/"/g, '""')}"`,
      `"${j.emailRecipient || ''}"`,
      `"${j.status || ''}"`,
      `"${j.createdAt ? new Date(j.createdAt).toLocaleDateString() : ''}"`,
      `"${j.sentAt ? new Date(j.sentAt).toLocaleDateString() : ''}"`
    ]);
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'job_pipeline.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    notify('Exported successfully');
  };

  return {
    token, logout, apiFetch, // Exposed new auth-related properties
    tab, setTab,
    sidebarOpen, setSidebarOpen,
    jobs, setJobs,
    loading, setLoading,
    search, setSearch,
    statusFilter, setStatusFilter,
    sourceFilter, setSourceFilter,
    experienceFilter, setExperienceFilter,
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
    showTutorial,
    completeTutorial,
    batchState, setBatchState,
    activeJobs,
    paginatedJobs,
    currentPage, setCurrentPage,
    totalPages,
    theme, setTheme,
    
    notify,
    loadJobs,
    loadProfile,
    toggleSelectJob,
    updateStatus,
    handleBatchSend,
    cancelBatch,
    handleProfileSave,
    handleResumeUpload,
    handleDelete,
    handleBatchDelete,
    handlePurgeSeniorJobs,
    getJobLevel,
    isSeniorJob,
    isJuniorJob,
    extractPackage,
    extractWorkMode,
    parseRoleDisplay,
    handleFetchJobs,
    addFetchQuery,
    removeFetchQuery,
    exportToCSV,
    useApify,
    setUseApify,
    appliedViewType,
    setAppliedViewType,
    inboxReplies,
    inboxLoading,
    fetchInbox
  };
}


