import React, { useState, useEffect } from 'react';
import './index.css';

const NAV = [
  { id: 'applications', label: 'My Applications', icon: '⚡' },
  { id: 'applied', label: 'Mail Applied Jobs', icon: '📬' },
  { id: 'draft', label: 'Application Draft', icon: '✏️' },
  { id: 'resume', label: 'My Resume', icon: '📄' },
  { id: 'referrals', label: 'Referrals', icon: '🔗' },
];

const API_BASE = import.meta.env.VITE_API_URL || ${API_BASE};

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
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Email drafter
  const [selJobId, setSelJobId] = useState('');
  const [emailType, setEmailType] = useState('Cold Outreach / Networking');
  const [draft, setDraft] = useState('');
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [recipient, setRecipient] = useState('');
  const [sendingEmail, setSendingEmail] = useState(false);

  // Batch Selection
  const [selectedJobs, setSelectedJobs] = useState([]);
  const [batchProgress, setBatchProgress] = useState(null);
  const [selectedSentJob, setSelectedSentJob] = useState(null);

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
        const r = await fetch(${API_BASE});
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
      const r = await fetch(${API_BASE});
      const d = await r.json();
      setJobs(d);
    } catch { notify('Cannot reach backend', 'error'); }
    finally { setLoading(false); }
  };

  const handleAddJob = async e => {
    e.preventDefault();
    try {
      const r = await fetch(${API_BASE}, {
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

      const r = await fetch(`${API_BASE}