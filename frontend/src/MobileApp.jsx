import React from 'react';
import { NAV, API_BASE } from './useAppLogic.jsx';

function cleanEmailBody(body) {
  if (!body) return { clean: '', quoted: '' };
  
  // Collapse excessive blank lines
  const normalized = body.replace(/(\r?\n\s*){3,}/g, '\n\n');
  const lines = normalized.split(/\r?\n/);
  const cleanLines = [];
  const quotedLines = [];
  let inQuote = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    const stripped = trimmed.replace(/^[-=_—\s]+|[-=_—\s]+$/g, '').trim();

    if (!inQuote) {
      // 1. Check for Zoho (---- On ... wrote ----), Gmail, Outlook, Thunderbird headers
      if (/^On\s+.+wrote\b/i.test(stripped) ||
          /^On\s+.+wrote\b/i.test(trimmed) ||
          /^(original message|forwarded message)/i.test(stripped) ||
          /^-+\s*Original Message\s*-+/i.test(trimmed) ||
          /^-+\s*Forwarded message\s*-+/i.test(trimmed) ||
          /^_{10,}$/.test(trimmed) ||
          /^-{10,}$/.test(trimmed) ||
          trimmed.startsWith('>') ||
          trimmed.startsWith('&gt;')) {
        inQuote = true;
      }
      // 2. Multi-line "On ... \n ... wrote" or "---- On ... \n ... wrote ----"
      else if (/^(On\s+|[-=_—]+\s*On\s+)/i.test(trimmed)) {
        for (let j = 1; j <= 3 && (i + j) < lines.length; j++) {
          const nextTrimmed = lines[i + j].trim();
          const nextStripped = nextTrimmed.replace(/^[-=_—\s]+|[-=_—\s]+$/g, '').trim();
          if (/wrote\b/i.test(nextStripped) || /wrote\b/i.test(nextTrimmed)) {
            inQuote = true;
            break;
          }
        }
      }
      // 3. Outlook style header: "From: ... \n Sent: ... \n To: ... \n Subject: ..."
      else if (/^From:\s*.+@.+/i.test(trimmed) && i + 1 < lines.length && /^(Sent|Date):\s*/i.test(lines[i + 1].trim())) {
        inQuote = true;
      }
    }

    if (inQuote) {
      quotedLines.push(line);
    } else {
      cleanLines.push(line);
    }
  }

  while (cleanLines.length > 0 && cleanLines[cleanLines.length - 1].trim() === '') {
    cleanLines.pop();
  }

  return {
    clean: cleanLines.join('\n').trim() || body.trim(),
    quoted: quotedLines.join('\n').trim()
  };
}

function MobileEmailMessageBody({ text, quotedText }) {
  const parsed = React.useMemo(() => cleanEmailBody(text), [text]);
  const displayClean = parsed.clean;
  const quote = quotedText || parsed.quoted;

  return (
    <div>
      <div style={{ fontSize: '13px', lineHeight: '1.5', whiteSpace: 'pre-wrap', color: 'var(--text-1)', wordBreak: 'break-word', overflowWrap: 'break-word' }}>
        {displayClean}
      </div>
      {quote && (
        <details style={{ marginTop: '8px' }}>
          <summary style={{
            cursor: 'pointer',
            color: 'var(--text-3)',
            fontSize: '10px',
            userSelect: 'none',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            padding: '2px 6px',
            borderRadius: '4px',
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid var(--border)'
          }}>
            ··· Show quoted text
          </summary>
          <div style={{
            marginTop: '6px',
            padding: '8px 10px',
            background: 'rgba(0,0,0,0.2)',
            borderRadius: '6px',
            fontSize: '11px',
            lineHeight: '1.4',
            color: 'var(--text-3)',
            whiteSpace: 'pre-wrap',
            borderLeft: '2px solid var(--border)',
            wordBreak: 'break-word'
          }}>
            {quote}
          </div>
        </details>
      )}
    </div>
  );
}

function FollowUpRow({ job, f, API_BASE, token, setJobs, jobs, notify }) {
  const [expanded, setExpanded] = React.useState(false);
  const [sending, setSending] = React.useState(false);

  return (
    <div style={{
      background: 'var(--surface-2)',
      borderRadius: '8px',
      border: '1px solid var(--border)',
      overflow: 'hidden',
      marginBottom: '8px',
    }}>
      <div 
        style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '8px', cursor: 'pointer' }}
        onClick={() => setExpanded(!expanded)}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ flex: 1, minWidth: 0, paddingRight: '8px' }}>
            <div style={{ fontWeight: 600, fontSize: '15px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{job.company}</div>
            <div style={{ fontSize: '13px', color: 'var(--text-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{job.role}</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{
                background: f.day === 3 ? 'var(--blue-bg)' : 'var(--purple-bg)',
                color: f.day === 3 ? 'var(--blue)' : 'var(--purple)',
                padding: '2px 8px', borderRadius: '100px', fontSize: '10px', fontWeight: 600
              }}>Day {f.day}</span>
              {f.sent && (
                <span style={{
                  background: 'var(--green-bg, rgba(74, 222, 128, 0.15))',
                  color: 'var(--green, #4ade80)',
                  border: '1px solid rgba(74, 222, 128, 0.3)',
                  padding: '2px 7px',
                  borderRadius: '100px',
                  fontSize: '10px',
                  fontWeight: 600
                }}>
                  ✓ Sent
                </span>
              )}
            </div>
            <div style={{ color: 'var(--text-3)', transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', fontSize: '12px' }}>
              ▼
            </div>
          </div>
        </div>
        
        <div style={{ fontSize: '13px', color: 'var(--text-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {f.draft ? f.draft.replace(/\n/g, ' ') : 'No draft content'}
        </div>
      </div>

      {expanded && (
        <div style={{ borderTop: '1px solid var(--border)', background: 'var(--surface-1)' }}>
          <div style={{ 
            padding: '16px', 
            fontSize: '13px', 
            lineHeight: '1.6', 
            whiteSpace: 'pre-wrap', 
            color: 'var(--text-1)' 
          }}>
            {f.draft}
          </div>
          <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
            {f.sent ? (
              <>
                <span style={{ fontSize: '11px', color: 'var(--text-3)' }}>
                  Sent to: <strong style={{ color: 'var(--text-2)' }}>{job.emailRecipient || job.recruiterEmail || 'Recruiter'}</strong>
                </span>
                <button
                  className="btn btn-secondary"
                  style={{ padding: '6px 12px', fontSize: '12px' }}
                  onClick={async (e) => {
                    e.stopPropagation();
                    if (!window.confirm(`Resend Day ${f.day} follow-up?`)) return;
                    try {
                      const res = await fetch(`${API_BASE}/api/send-followup`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                        body: JSON.stringify({ jobId: job.id, day: f.day })
                      });
                      if (res.ok) {
                        notify('Follow-up re-sent successfully!', 'success');
                      } else {
                        notify('Failed to resend follow-up', 'error');
                      }
                    } catch (err) {
                      notify('Failed to resend follow-up', 'error');
                    }
                  }}
                >
                  Resend ✈️
                </button>
              </>
            ) : (
              <button
                className="btn btn-primary"
                style={{ width: '100%', padding: '8px', fontSize: '13px' }}
                disabled={sending}
                onClick={async (e) => {
                  e.stopPropagation();
                  setSending(true);
                  try {
                    const res = await fetch(`${API_BASE}/api/send-followup`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                      body: JSON.stringify({ jobId: job.id, day: f.day })
                    });
                    if (res.ok) {
                      const fToUpdate = job.followUps.find(fu => fu.day === f.day);
                      if (fToUpdate) fToUpdate.sent = true;
                      setJobs([...jobs]);
                      notify('Follow-up sent successfully!', 'success');
                    } else {
                      const errData = await res.json().catch(() => ({}));
                      notify(errData.error || 'Failed to send follow-up', 'error');
                    }
                  } catch (err) {
                    notify('Failed to send follow-up', 'error');
                  } finally {
                    setSending(false);
                  }
                }}
              >
                {sending ? <span className="spinner" style={{ width: '12px', height: '12px' }}></span> : 'Send ✈️'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

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
    paginatedJobs,
    currentPage, setCurrentPage,
    totalPages,
    theme, setTheme,
    notify,
    loadJobs,
    loadProfile,
    toggleSelectJob,
    logout,
    updateStatus,
    handleBatchDelete,
    handleBatchSend,
    handleProfileSave,
    handleResumeUpload,
    handleFetchJobs,
    addFetchQuery,
    removeFetchQuery,
    exportToCSV,
    useApify,
    setUseApify,
    appliedViewType,
    setAppliedViewType,
    sourceFilter,
    setSourceFilter,
    experienceFilter,
    setExperienceFilter,
    handlePurgeSeniorJobs,
    getJobLevel,
    isSeniorJob,
    extractPackage,
    extractWorkMode,
    parseRoleDisplay
  } = props;

  const [isScrolled, setIsScrolled] = React.useState(false);
  const [activeReplyIndex, setActiveReplyIndex] = React.useState(null);
  const [draftOptions, setDraftOptions] = React.useState([]);
  const [selectedDraft, setSelectedDraft] = React.useState('');
  const [sendingReply, setSendingReply] = React.useState(false);
  const [showMoreMenu, setShowMoreMenu] = React.useState(false);
  const [inboxCategoryFilter, setInboxCategoryFilter] = React.useState('All');
  const [inboxSearch, setInboxSearch] = React.useState('');
  const [draftingIntent, setDraftingIntent] = React.useState(null);
  const [updatingJobStatus, setUpdatingJobStatus] = React.useState(false);

  // HR Dashboard State for Mobile
  const [hrFilter, setHrFilter] = React.useState('all');
  const [copyingNoteId, setCopyingNoteId] = React.useState(null);
  const [discoveringHrId, setDiscoveringHrId] = React.useState(null);
  const [editingEmailId, setEditingEmailId] = React.useState(null);
  const [connectedJobIds, setConnectedJobIds] = React.useState([]);

  // Follow-Up Tab Filter & Search States
  const [followUpStatus, setFollowUpStatus] = React.useState('pending');
  const [followUpDay, setFollowUpDay] = React.useState('all');
  const [followUpSearch, setFollowUpSearch] = React.useState('');
  const [followUpLimit, setFollowUpLimit] = React.useState(30);

  // Separate thread linking & scanner states for mobile
  const [inboxGmailQuery, setInboxGmailQuery] = React.useState('');
  const [showLinkModal, setShowLinkModal] = React.useState(false);
  const [linkingJobId, setLinkingJobId] = React.useState('');
  const [linkingSearch, setLinkingSearch] = React.useState('');
  const [linkingLoading, setLinkingLoading] = React.useState(false);
  const [isCreatingNewJob, setIsCreatingNewJob] = React.useState(false);
  const [newJobCompany, setNewJobCompany] = React.useState('');
  const [newJobRole, setNewJobRole] = React.useState('');

  const openLinkModal = () => {
    if (activeReplyIndex === null || !props.inboxReplies || !props.inboxReplies[activeReplyIndex]) return;
    const currentReply = props.inboxReplies[activeReplyIndex];
    let guessedCompany = '';
    let guessedRole = '';

    const fromFull = currentReply.fromFull || '';
    if (fromFull.includes('<')) {
      const displayName = fromFull.split('<')[0].replace(/["']/g, '').replace(/human resources|hiring team|recruiting|careers/gi, '').trim();
      if (displayName.length >= 2) guessedCompany = displayName;
    }

    const subj = currentReply.subject || '';
    const atMatch = subj.match(/(?:at|to|with|@)\s+([A-Za-z0-9\s&]+?)(?:\s*[-–|:]|\s*$)/i);
    if (atMatch && atMatch[1].trim().length > 2) {
      guessedCompany = atMatch[1].trim();
    }

    const roleMatch = subj.match(/(?:for|as|role|position)\s+([A-Za-z0-9\s&/]+?)(?:\s*[-–|:]|\s*$)/i);
    if (roleMatch && roleMatch[1].trim().length > 2) {
      guessedRole = roleMatch[1].trim();
    }

    setNewJobCompany(guessedCompany);
    setNewJobRole(guessedRole || 'Software Engineer');
    setLinkingJobId(currentReply.matchedJob?.id || '');
    setLinkingSearch('');
    setIsCreatingNewJob(false);
    setShowLinkModal(true);
  };

  const handleLinkJob = async ({ jobId = null, createNew = false, company = '', role = '' }) => {
    if (activeReplyIndex === null || !props.inboxReplies || !props.inboxReplies[activeReplyIndex]) return;
    const currentReply = props.inboxReplies[activeReplyIndex];
    setLinkingLoading(true);

    try {
      const token = localStorage.getItem('token') || '';
      const res = await fetch(`${API_BASE}/api/inbox/link-job`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          jobId,
          createNew,
          company,
          role,
          messageId: currentReply.messageId,
          threadId: currentReply.threadId,
          fromEmail: currentReply.from
        })
      });

      const data = await res.json();
      if (res.ok && data.matchedJob) {
        notify(`🎉 Successfully linked to ${data.matchedJob.company}!`, 'success');
        currentReply.matchedJob = data.matchedJob;
        setShowLinkModal(false);
        setIsCreatingNewJob(false);
        setLinkingJobId('');
        if (props.loadJobs) props.loadJobs();
      } else {
        notify(data.error || 'Failed to link job', 'error');
      }
    } catch (err) {
      console.error(err);
      notify('Error linking job application', 'error');
    } finally {
      setLinkingLoading(false);
    }
  };

  const CATEGORY_MAP = {
    Interview: {
      label: 'Interview Invite',
      icon: '🎉',
      bg: 'rgba(16, 185, 129, 0.12)',
      color: '#10b981',
      border: 'rgba(16, 185, 129, 0.3)'
    },
    Assessment: {
      label: 'Tech Assessment',
      icon: '📝',
      bg: 'rgba(168, 85, 247, 0.12)',
      color: '#c084fc',
      border: 'rgba(168, 85, 247, 0.3)'
    },
    Info_Request: {
      label: 'Recruiter Inquiry',
      icon: '💬',
      bg: 'rgba(59, 130, 246, 0.12)',
      color: '#60a5fa',
      border: 'rgba(59, 130, 246, 0.3)'
    },
    Rejection: {
      label: 'Not Moving Forward',
      icon: '❌',
      bg: 'rgba(239, 68, 68, 0.1)',
      color: '#f87171',
      border: 'rgba(239, 68, 68, 0.25)'
    },
    General: {
      label: 'Recruiter Reply',
      icon: '📩',
      bg: 'rgba(148, 163, 184, 0.12)',
      color: '#94a3b8',
      border: 'rgba(148, 163, 184, 0.25)'
    }
  };

  const handleDraftWithIntent = async (intent = 'general') => {
    if (activeReplyIndex === null || !props.inboxReplies || !props.inboxReplies[activeReplyIndex]) return;
    const currentReply = props.inboxReplies[activeReplyIndex];
    setDraftingIntent(intent);
    try {
      const res = await fetch(`${API_BASE}/api/inbox/draft-reply`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token') || ''}`
        },
        body: JSON.stringify({
          from: currentReply.from,
          subject: currentReply.subject,
          body: currentReply.body || currentReply.snippet,
          intent
        })
      });
      const data = await res.json();
      if (data.drafts && data.drafts.length > 0) {
        setDraftOptions(data.drafts);
        setSelectedDraft(data.drafts[0]);
        notify(`✨ Generated ${data.drafts.length} AI reply options!`, 'success');
      } else {
        notify('Failed to generate drafts.', 'error');
      }
    } catch (err) {
      notify('Error generating draft.', 'error');
    }
    setDraftingIntent(null);
  };

  const handleUpdateJobStatus = async (jobId, newStatus) => {
    setUpdatingJobStatus(true);
    try {
      const res = await fetch(`${API_BASE}/api/inbox/update-status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token') || ''}`
        },
        body: JSON.stringify({ jobId, status: newStatus })
      });
      if (res.ok) {
        notify(`Application marked as "${newStatus}"!`, 'success');
        if (setJobs) {
          setJobs(prev => prev.map(j => j.id === jobId ? { ...j, status: newStatus } : j));
        }
        if (props.inboxReplies && props.inboxReplies[activeReplyIndex]?.matchedJob) {
          props.inboxReplies[activeReplyIndex].matchedJob.status = newStatus;
        }
      } else {
        notify('Failed to update status', 'error');
      }
    } catch (err) {
      notify('Error updating status', 'error');
    }
    setUpdatingJobStatus(false);
  };

  const handleConnectWithNote = async (job) => {
    setCopyingNoteId(job.id);
    const targetUrl = job.hrLinkedIn || `https://www.linkedin.com/search/results/all/?keywords=${encodeURIComponent((job.hrName || '') + ' ' + (job.company || ''))}`;
    try {
      const res = await props.apiFetch(`${API_BASE}/api/generate-linkedin-note`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hrName: job.hrName, company: job.company, role: job.role })
      });
      const data = await res.json();
      if (data.note) {
        await navigator.clipboard.writeText(data.note);
        notify('📋 Note copied & LinkedIn opened! Hit Paste (Ctrl+V) on LinkedIn, then Mark Invite Sent below.');
        window.open(targetUrl, '_blank');
        setConnectedJobIds(prev => [...new Set([...prev, job.id])]);
      }
    } catch (err) {
      const defaultNote = `Hi ${job.hrName ? job.hrName.split(' ')[0] : 'there'}, I'm interested in the role at ${job.company} and would love to connect!`;
      await navigator.clipboard.writeText(defaultNote);
      notify('📋 Note copied & LinkedIn opened!');
      window.open(targetUrl, '_blank');
      setConnectedJobIds(prev => [...new Set([...prev, job.id])]);
    } finally {
      setCopyingNoteId(null);
    }
  };

  const handleDeepDiscoverHrEmail = async (job) => {
    setDiscoveringHrId(job.id);
    try {
      notify(`🔍 Scanning web & pattern databases for ${job.hrName}...`, 'info');
      const res = await props.apiFetch(`${API_BASE}/api/discover-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company: job.company,
          jd: job.jd || '',
          failedEmails: job.failedEmails || [],
          hrName: job.hrName,
          hrLinkedInUrl: job.hrLinkedIn
        })
      });
      const data = await res.json();
      if (data && data.email) {
        await props.apiFetch(`${API_BASE}/api/jobs/${job.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ emailRecipient: data.email })
        });
        setJobs(prev => prev.map(j => j.id === job.id ? { ...j, emailRecipient: data.email } : j));
        notify(`🎉 Found verified email for ${job.hrName}: ${data.email}!`, 'success');
      } else {
        notify(`No verified email found for ${job.hrName}. Try LinkedIn outreach!`, 'warning');
      }
    } catch (err) {
      notify('Error scanning for email', 'error');
    } finally {
      setDiscoveringHrId(null);
    }
  };

  const handleSaveInlineEmail = async (jobId) => {
    try {
      await props.apiFetch(`${API_BASE}/api/jobs/${jobId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emailRecipient: editEmailVal.trim() })
      });
      setJobs(prev => prev.map(j => j.id === jobId ? { ...j, emailRecipient: editEmailVal.trim() } : j));
      notify('Email updated successfully!');
      setEditingEmailId(null);
    } catch (err) {
      notify('Failed to update email', 'error');
    }
  };

  return (
    <div className="mobile-app-container">
      {/* Batch Progress Modal */}
      {batchState.active && (
        <div style={{ position: 'fixed', top: '16px', left: '16px', right: '16px', background: '#0c0c0c', border: '1px solid #333', borderRadius: '8px', zIndex: 9999, display: 'flex', flexDirection: 'column', boxShadow: '0 10px 30px rgba(0,0,0,0.8)', overflow: 'hidden', color: '#00ff00', fontFamily: 'monospace' }}>
          <div style={{ background: '#1a1a1a', padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #333' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ color: '#00ff00', fontWeight: 'bold' }}>root@kali:~#</span>
              <span style={{ fontSize: '12px', color: '#fff' }}>batch-apply.sh ({batchState.currentIndex}/{batchState.total})</span>
            </div>
            <button onClick={props.cancelBatch} style={{ background: 'transparent', border: 'none', color: 'var(--error)', cursor: 'pointer', padding: '0 4px', fontSize: '14px', fontWeight: 'bold' }} title="Cancel Batch">
              ✕
            </button>
          </div>
          <div style={{ padding: '12px' }}>
            {batchState.currentJob && (
              <div style={{ fontSize: '12px', color: '#888', marginBottom: '8px', display: 'flex', justifyContent: 'space-between' }}>
                <span>Target: <span style={{ color: '#fff' }}>{batchState.currentJob.company}</span></span>
                <span style={{ color: '#00ff00' }}>[{Math.round((batchState.currentIndex / batchState.total) * 100)}%]</span>
              </div>
            )}
            <div style={{ width: '100%', height: '2px', background: '#333' }}>
              <div style={{ width: `${(batchState.currentIndex / batchState.total) * 100}%`, height: '100%', background: '#00ff00', transition: 'width 0.2s' }} />
            </div>
          </div>
          <div style={{ background: '#0c0c0c', padding: '12px', height: '120px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {batchState.logs.map((log, idx) => {
               const isError = log.includes('Error') || log.includes('Failed');
               const isSuccess = log.includes('Successfully');
               let color = '#00ff00';
               if (isError) color = '#ff0000';
               if (isSuccess) color = '#00aaff';
               return (
                 <div key={idx} style={{ fontSize: '11px', color, lineHeight: 1.4 }}>
                   <span style={{ color: '#555' }}>$</span> {log}
                 </div>
               );
            })}
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
              <button onClick={logout} style={{ background: 'none', border: 'none', color: 'var(--error)', fontSize: '12px', cursor: 'pointer' }}>
                Logout
              </button>
            </div>
          </div>
          <h1 className="mobile-page-title">{NAV.find(n => n.id === tab)?.label || tab}</h1>
          
          {tab === 'applied' && (
            <div style={{ display: 'flex', background: 'var(--surface-3)', borderRadius: '20px', padding: '4px', gap: '4px', border: '1px solid var(--border)', marginTop: '8px' }}>
              {['All', 'Jobs', 'HR'].map(type => (
                <button 
                  key={type}
                  onClick={() => setAppliedViewType(type)}
                  style={{
                    flex: 1,
                    padding: '6px 0',
                    borderRadius: '16px',
                    border: 'none',
                    background: appliedViewType === type ? 'var(--accent)' : 'transparent',
                    color: appliedViewType === type ? '#fff' : 'var(--text-2)',
                    fontSize: '13px',
                    fontWeight: appliedViewType === type ? '600' : '400',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  {type}
                </button>
              ))}
            </div>
          )}

          {tab !== 'resume' && tab !== 'single_drafter' && tab !== 'inbox' && (
            <p className="mobile-subtitle">{activeJobs.length} results found</p>
          )}
        </div>

        {tab === 'inbox' && (() => {
          const categoryCounts = {
            All: props.inboxReplies?.length || 0,
            Interview: 0,
            Assessment: 0,
            Info_Request: 0,
            Rejection: 0,
            General: 0
          };
          (props.inboxReplies || []).forEach(r => {
            const cat = r.categoryInfo?.category || 'General';
            if (categoryCounts[cat] !== undefined) categoryCounts[cat]++;
            else categoryCounts.General++;
          });

          const filteredReplies = (props.inboxReplies || [])
            .filter(r => {
              const cat = r.categoryInfo?.category || 'General';
              if (inboxCategoryFilter !== 'All' && cat !== inboxCategoryFilter) return false;
              if (inboxSearch.trim()) {
                const q = inboxSearch.toLowerCase().trim();
                const fromStr = (r.from || '').toLowerCase();
                const subjectStr = (r.subject || '').toLowerCase();
                const snippetStr = (r.snippet || '').toLowerCase();
                const companyStr = (r.matchedJob?.company || '').toLowerCase();
                const roleStr = (r.matchedJob?.role || '').toLowerCase();
                if (!fromStr.includes(q) && !subjectStr.includes(q) && !snippetStr.includes(q) && !companyStr.includes(q) && !roleStr.includes(q)) {
                  return false;
                }
              }
              return true;
            })
            .sort((a, b) => {
              const timeA = a.timestamp || (a.date ? new Date(a.date).getTime() : 0);
              const timeB = b.timestamp || (b.date ? new Date(b.date).getTime() : 0);
              return timeB - timeA;
            });

          const currentReply = activeReplyIndex !== null ? props.inboxReplies[activeReplyIndex] : null;

          return (
            <>
              {/* Inbox Top Bar */}
              <div style={{ padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  {activeReplyIndex !== null && (
                    <button 
                      className="btn btn-ghost" 
                      onClick={() => {
                        setActiveReplyIndex(null);
                        setDraftOptions([]);
                        setSelectedDraft('');
                      }}
                      style={{ padding: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
                    </button>
                  )}
                  <div>
                    <h2 style={{ fontSize: '17px', fontWeight: 600, margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                      Smart Inbox
                      <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '10px', background: 'rgba(59, 130, 246, 0.15)', color: 'var(--blue, #3b82f6)', fontWeight: 600 }}>AI</span>
                    </h2>
                  </div>
                </div>
                <button
                  className="btn btn-ghost"
                  onClick={props.fetchInbox}
                  disabled={props.inboxLoading}
                  style={{ padding: '6px 10px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px', border: '1px solid var(--border)', background: 'var(--surface-1)' }}
                >
                  {props.inboxLoading ? <span className="spinner"></span> : <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>}
                  <span>{props.inboxLoading ? 'Syncing...' : 'Sync'}</span>
                </button>
              </div>

              {/* Mobile Search & Category Chips (when in list view) */}
              {activeReplyIndex === null && (
                <div style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-1)' }}>
                  <div style={{ padding: '10px 16px' }}>
                    <div style={{ position: 'relative', width: '100%' }}>
                      <input
                        type="text"
                        placeholder="Search sender, company, role..."
                        value={inboxSearch}
                        onChange={(e) => setInboxSearch(e.target.value)}
                        className="input"
                        style={{
                          paddingLeft: '32px',
                          paddingRight: inboxSearch ? '28px' : '10px',
                          height: '34px',
                          fontSize: '13px',
                          width: '100%',
                          borderRadius: '8px',
                          background: 'var(--surface-2)',
                          border: '1px solid var(--border)'
                        }}
                      />
                      <svg style={{ position: 'absolute', left: '10px', top: '9px', color: 'var(--text-3)' }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                      {inboxSearch && (
                        <button
                          onClick={() => setInboxSearch('')}
                          style={{ position: 'absolute', right: '6px', top: '7px', background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', fontSize: '13px' }}
                        >✕</button>
                      )}
                    </div>
                  </div>

                  {/* Filter Pills */}
                  <div style={{ display: 'flex', gap: '6px', padding: '0 16px 10px', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                    {[
                      { key: 'All', label: 'All', count: categoryCounts.All },
                      { key: 'Interview', label: '🎉 Interviews', count: categoryCounts.Interview, highlight: '#10b981' },
                      { key: 'Assessment', label: '📝 Assessments', count: categoryCounts.Assessment, highlight: '#a855f7' },
                      { key: 'Info_Request', label: '💬 Inquiries', count: categoryCounts.Info_Request, highlight: '#3b82f6' },
                      { key: 'Rejection', label: '❌ Rejections', count: categoryCounts.Rejection, highlight: '#ef4444' },
                      { key: 'General', label: '📩 General', count: categoryCounts.General }
                    ].map(tabItem => {
                      const isSelected = inboxCategoryFilter === tabItem.key;
                      return (
                        <button
                          key={tabItem.key}
                          onClick={() => setInboxCategoryFilter(tabItem.key)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '4px 10px',
                            borderRadius: '16px',
                            fontSize: '11px',
                            fontWeight: isSelected ? 600 : 500,
                            cursor: 'pointer',
                            whiteSpace: 'nowrap',
                            border: isSelected ? `1px solid ${tabItem.highlight || 'var(--accent)'}` : '1px solid var(--border)',
                            background: isSelected ? (tabItem.highlight ? `${tabItem.highlight}20` : 'var(--accent-bg, rgba(211,74,54,0.15))') : 'var(--surface-2)',
                            color: isSelected ? (tabItem.highlight || 'var(--text-1)') : 'var(--text-2)'
                          }}
                        >
                          <span>{tabItem.label}</span>
                          <span style={{
                            fontSize: '10px',
                            padding: '0 4px',
                            borderRadius: '8px',
                            background: isSelected ? (tabItem.highlight ? `${tabItem.highlight}30` : 'rgba(255,255,255,0.15)') : 'var(--surface-3)',
                            color: isSelected ? (tabItem.highlight || '#ffffff') : 'var(--text-3)'
                          }}>{tabItem.count}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div style={{ paddingBottom: '20px' }}>
                {props.inboxLoading && (!props.inboxReplies || props.inboxReplies.length === 0) ? (
                  <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-3)' }}>
                    <div className="spinner" style={{ margin: '0 auto 12px' }}></div>
                    <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-1)' }}>Syncing replies...</div>
                  </div>
                ) : props.inboxReplies && props.inboxReplies.length > 0 ? (
                  
                  activeReplyIndex !== null && currentReply ? (
                    /* --- Mobile Detail View --- */
                    <div style={{ padding: '16px' }}>
                      {/* Header info */}
                      <div style={{ marginBottom: '14px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', marginBottom: '8px' }}>
                          <h1 style={{ fontSize: '17px', fontWeight: 600, color: 'var(--text-1)', margin: 0, lineHeight: 1.3 }}>
                            {currentReply.subject}
                          </h1>
                          {(() => {
                            const catStyle = CATEGORY_MAP[currentReply.categoryInfo?.category] || CATEGORY_MAP.General;
                            return (
                              <span style={{
                                padding: '3px 8px',
                                borderRadius: '6px',
                                fontSize: '11px',
                                fontWeight: 600,
                                background: catStyle.bg,
                                color: catStyle.color,
                                border: `1px solid ${catStyle.border}`,
                                whiteSpace: 'nowrap',
                                flexShrink: 0
                              }}>
                                {catStyle.icon} {currentReply.categoryInfo?.label ? currentReply.categoryInfo.label.replace(/^[\p{Emoji}\s]+/u, '') : catStyle.label}
                              </span>
                            );
                          })()}
                        </div>

                        {/* Matched Job context card */}
                        {currentReply.matchedJob ? (
                          <div style={{
                            padding: '10px 12px',
                            background: 'var(--surface-2)',
                            border: '1px solid var(--border)',
                            borderRadius: '8px',
                            marginBottom: '12px'
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '6px' }}>
                              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-1)' }}>
                                🏢 {currentReply.matchedJob.company} — <span style={{ fontWeight: 400, color: 'var(--text-2)' }}>{currentReply.matchedJob.role}</span>
                              </div>
                              <button
                                className="btn btn-ghost"
                                onClick={openLinkModal}
                                style={{ fontSize: '10px', padding: '2px 6px', height: '22px', border: '1px solid var(--border)' }}
                              >
                                Change
                              </button>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginTop: '6px' }}>
                              <span style={{ fontSize: '11px', color: 'var(--text-3)' }}>Job Status:</span>
                              <select
                                className="input"
                                value={currentReply.matchedJob.status || 'Replied'}
                                disabled={updatingJobStatus}
                                onChange={(e) => handleUpdateJobStatus(currentReply.matchedJob.id, e.target.value)}
                                style={{
                                  fontSize: '11px',
                                  padding: '2px 6px',
                                  height: '26px',
                                  borderRadius: '6px',
                                  background: 'var(--surface-1)',
                                  border: '1px solid var(--border)',
                                  color: 'var(--text-1)',
                                  fontWeight: 600
                                }}
                              >
                                <option value="Replied">📩 Replied</option>
                                <option value="Interview Scheduled">🎉 Interview</option>
                                <option value="Assessment Taken">📝 Assessment</option>
                                <option value="Offer Received">💼 Offer</option>
                                <option value="Rejected">❌ Rejected</option>
                              </select>
                            </div>
                          </div>
                        ) : (
                          <div style={{
                            padding: '10px 12px',
                            background: 'rgba(234, 179, 8, 0.08)',
                            border: '1px solid rgba(234, 179, 8, 0.25)',
                            borderRadius: '8px',
                            marginBottom: '12px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '8px'
                          }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <div style={{ fontSize: '12px', fontWeight: 600, color: '#facc15', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <span>⚠️</span>
                                <span>Separate Recruiter Thread</span>
                              </div>
                              <button
                                className="btn btn-primary"
                                onClick={openLinkModal}
                                style={{ fontSize: '11px', padding: '4px 10px' }}
                              >
                                🔗 Link Job
                              </button>
                            </div>
                            <div style={{ fontSize: '11px', color: 'var(--text-3)' }}>
                              From: <strong style={{ color: 'var(--text-2)' }}>{currentReply.from}</strong>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* AI Reply Intent Bar */}
                      {!(currentReply.threadMessages && currentReply.threadMessages.length > 0 && currentReply.threadMessages[currentReply.threadMessages.length - 1].isMe) && (
                        <div style={{
                          background: 'linear-gradient(135deg, rgba(211, 74, 54, 0.08) 0%, rgba(59, 130, 246, 0.08) 100%)',
                          border: '1px solid rgba(211, 74, 54, 0.25)',
                          borderRadius: '10px',
                          padding: '12px',
                          marginBottom: '16px'
                        }}>
                          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-1)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span>✨ AI Reply Copilot</span>
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                            <button
                              className="btn"
                              disabled={draftingIntent !== null}
                              onClick={() => handleDraftWithIntent('interview_accept')}
                              style={{
                                padding: '8px 6px',
                                fontSize: '11px',
                                fontWeight: 600,
                                borderRadius: '6px',
                                background: 'rgba(16, 185, 129, 0.15)',
                                color: '#10b981',
                                border: '1px solid rgba(16, 185, 129, 0.35)',
                                textAlign: 'center'
                              }}
                            >
                              {draftingIntent === 'interview_accept' ? 'Drafting...' : '🎉 Accept Interview'}
                            </button>

                            <button
                              className="btn"
                              disabled={draftingIntent !== null}
                              onClick={() => handleDraftWithIntent('info_confirm')}
                              style={{
                                padding: '8px 6px',
                                fontSize: '11px',
                                fontWeight: 600,
                                borderRadius: '6px',
                                background: 'rgba(168, 85, 247, 0.15)',
                                color: '#c084fc',
                                border: '1px solid rgba(168, 85, 247, 0.35)',
                                textAlign: 'center'
                              }}
                            >
                              {draftingIntent === 'info_confirm' ? 'Drafting...' : '📋 Confirm Details'}
                            </button>

                            <button
                              className="btn"
                              disabled={draftingIntent !== null}
                              onClick={() => handleDraftWithIntent('polite_inquiry')}
                              style={{
                                padding: '8px 6px',
                                fontSize: '11px',
                                fontWeight: 600,
                                borderRadius: '6px',
                                background: 'rgba(59, 130, 246, 0.15)',
                                color: '#60a5fa',
                                border: '1px solid rgba(59, 130, 246, 0.35)',
                                textAlign: 'center'
                              }}
                            >
                              {draftingIntent === 'polite_inquiry' ? 'Drafting...' : '💬 Ask Questions'}
                            </button>

                            <button
                              className="btn"
                              disabled={draftingIntent !== null}
                              onClick={() => handleDraftWithIntent('general')}
                              style={{
                                padding: '8px 6px',
                                fontSize: '11px',
                                fontWeight: 600,
                                borderRadius: '6px',
                                background: 'var(--surface-2)',
                                color: 'var(--text-1)',
                                border: '1px solid var(--border)',
                                textAlign: 'center'
                              }}
                            >
                              {draftingIntent === 'general' ? 'Drafting...' : '✍️ General Reply'}
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Thread Messages */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '20px' }}>
                        {currentReply.threadMessages && currentReply.threadMessages.length > 0 ? (
                          currentReply.threadMessages.map((tMsg, idx) => (
                            <div key={idx} style={{ 
                              padding: '14px', 
                              borderRadius: '8px', 
                              background: tMsg.isMe ? 'var(--surface-2)' : 'var(--surface-1)',
                              border: tMsg.isMe ? '1px solid rgba(59, 130, 246, 0.3)' : '1px solid var(--border)',
                              marginLeft: tMsg.isMe ? '20px' : '0',
                              marginRight: tMsg.isMe ? '0' : '20px'
                            }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                <span style={{ fontWeight: 600, fontSize: '12px', color: tMsg.isMe ? 'var(--blue, #3b82f6)' : 'var(--text-1)' }}>
                                  {tMsg.isMe ? 'Me' : tMsg.from}
                                </span>
                                <span style={{ fontSize: '11px', color: 'var(--text-3)' }}>{tMsg.date.substring(0, 16)}</span>
                              </div>
                              <MobileEmailMessageBody text={tMsg.body} quotedText={tMsg.quotedText} />
                            </div>
                          ))
                        ) : (
                          <div style={{ 
                            padding: '14px', 
                            borderRadius: '8px', 
                            background: 'var(--surface-1)', 
                            border: '1px solid var(--border)' 
                          }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                              <span style={{ fontWeight: 600, fontSize: '13px' }}>{currentReply.from}</span>
                              <span style={{ fontSize: '11px', color: 'var(--text-3)' }}>{currentReply.date.substring(0, 16)}</span>
                            </div>
                            <MobileEmailMessageBody text={currentReply.body || currentReply.snippet} quotedText={currentReply.quotedText} />
                          </div>
                        )}
                      </div>

                      {/* AI Drafts Bottom Sheet / Modal */}
                      {draftOptions && draftOptions.length > 0 && (
                        <div style={{
                          position: 'fixed',
                          top: 0, left: 0, right: 0, bottom: 0,
                          backgroundColor: 'rgba(0,0,0,0.7)',
                          backdropFilter: 'blur(3px)',
                          zIndex: 9999,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          padding: '16px'
                        }}>
                          <div style={{
                            background: 'var(--surface-1)',
                            width: '100%',
                            maxHeight: '90vh',
                            overflowY: 'auto',
                            borderRadius: '12px',
                            padding: '20px',
                            boxShadow: '0 10px 30px rgba(0,0,0,0.6)',
                            border: '1px solid var(--border)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '16px'
                          }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <h3 style={{ fontSize: '16px', fontWeight: 600, margin: 0 }}>✨ AI Draft Reply</h3>
                              <button className="btn btn-ghost" onClick={() => { setDraftOptions([]); setSelectedDraft(''); }} style={{ padding: '6px' }}>
                                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                              </button>
                            </div>
                            <div style={{ display: 'flex', gap: '6px' }}>
                              {draftOptions.map((draft, idx) => (
                                <button
                                  key={idx}
                                  className="btn"
                                  style={{ 
                                    flex: 1, 
                                    padding: '8px 4px', 
                                    fontSize: '11px', 
                                    fontWeight: 600, 
                                    textAlign: 'center',
                                    background: selectedDraft === draft ? 'var(--accent, #d34a36)' : 'var(--surface-2)',
                                    color: selectedDraft === draft ? '#ffffff' : 'var(--text-2)',
                                    border: selectedDraft === draft ? '1px solid var(--accent, #d34a36)' : '1px solid var(--border)',
                                    borderRadius: '6px'
                                  }}
                                  onClick={() => setSelectedDraft(draft)}
                                >
                                  Option {idx + 1}
                                </button>
                              ))}
                            </div>
                            {selectedDraft && (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                <textarea
                                  className="input"
                                  style={{ width: '100%', minHeight: '180px', padding: '12px', fontSize: '13px', lineHeight: '1.5', resize: 'vertical', background: 'var(--surface-2)', color: 'var(--text-1)', border: '1px solid var(--border)', borderRadius: '8px' }}
                                  value={selectedDraft}
                                  onChange={(e) => setSelectedDraft(e.target.value)}
                                />
                                <div style={{ display: 'flex', gap: '8px' }}>
                                  <button className="btn btn-ghost" style={{ flex: 1, padding: '10px', fontSize: '12px' }} onClick={() => { setDraftOptions([]); setSelectedDraft(''); }}>Cancel</button>
                                  <button 
                                    className="btn btn-primary"
                                    style={{ flex: 2, padding: '10px', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                                    disabled={sendingReply || !selectedDraft.trim()}
                                    onClick={async () => {
                                      setSendingReply(true);
                                      try {
                                        const res = await fetch(`${API_BASE}/api/inbox/send-reply`, {
                                          method: 'POST',
                                          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token') || ''}` },
                                          body: JSON.stringify({
                                            to: currentReply.fromFull || currentReply.from,
                                            subject: currentReply.subject,
                                            body: selectedDraft,
                                            messageId: currentReply.messageId,
                                            threadId: currentReply.threadId
                                          })
                                        });
                                        if (res.ok) {
                                          notify('🚀 Reply sent successfully via Gmail!', 'success');
                                          setDraftOptions([]);
                                          setSelectedDraft('');
                                          props.fetchInbox();
                                        } else {
                                          notify('Failed to send reply', 'error');
                                        }
                                      } catch (err) {
                                        notify('Error sending reply', 'error');
                                      }
                                      setSendingReply(false);
                                    }}
                                  >
                                    {sendingReply ? <span className="spinner"></span> : <span>🚀</span>}
                                    <span>{sendingReply ? 'Sending...' : 'Send via Gmail'}</span>
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    /* --- Mobile List View --- */
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      {filteredReplies.length > 0 ? (
                        filteredReplies.map((reply, i) => {
                          const realIndex = props.inboxReplies.indexOf(reply);
                          const catStyle = CATEGORY_MAP[reply.categoryInfo?.category] || CATEGORY_MAP.General;
                          const fromClean = reply.from.split('<')[0].trim() || reply.from;

                          return (
                            <div 
                              key={i} 
                              onClick={() => setActiveReplyIndex(realIndex)}
                              style={{ 
                                padding: '12px 16px', 
                                borderBottom: '1px solid var(--border)', 
                                cursor: 'pointer',
                                background: 'var(--surface-1)'
                              }}
                            >
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', paddingRight: '8px' }}>
                                  {fromClean}
                                </div>
                                <div style={{ fontSize: '11px', color: 'var(--text-3)', flexShrink: 0 }}>
                                  {new Date(reply.date).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                                </div>
                              </div>

                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                                <span style={{
                                  fontSize: '10px',
                                  padding: '1px 6px',
                                  borderRadius: '4px',
                                  fontWeight: 600,
                                  background: catStyle.bg,
                                  color: catStyle.color,
                                  border: `1px solid ${catStyle.border}`,
                                  flexShrink: 0
                                }}>
                                  {catStyle.icon} {reply.categoryInfo?.label ? reply.categoryInfo.label.replace(/^[\p{Emoji}\s]+/u, '') : catStyle.label}
                                </span>

                                {reply.matchedJob ? (
                                  <span style={{ fontSize: '11px', color: 'var(--blue, #3b82f6)', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    🏢 {reply.matchedJob.company}
                                  </span>
                                ) : (
                                  <span style={{ fontSize: '9px', padding: '1px 5px', borderRadius: '3px', background: 'rgba(234, 179, 8, 0.15)', color: '#facc15', border: '1px solid rgba(234, 179, 8, 0.3)', fontWeight: 600 }}>
                                    Unlinked
                                  </span>
                                )}
                              </div>

                              <div style={{ fontWeight: 500, fontSize: '12px', color: 'var(--text-1)', marginBottom: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {reply.subject}
                              </div>
                              <div style={{ fontSize: '12px', color: 'var(--text-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {reply.snippet}
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <div style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--text-3)' }}>
                          <div style={{ fontSize: '24px', marginBottom: '6px' }}>🔍</div>
                          <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-2)' }}>No matching replies</div>
                          <button
                            className="btn btn-ghost"
                            onClick={() => { setInboxCategoryFilter('All'); setInboxSearch(''); }}
                            style={{ marginTop: '12px', fontSize: '12px', border: '1px solid var(--border)' }}
                          >
                            Reset Filters
                          </button>
                        </div>
                      )}
                    </div>
                  )
                ) : (
                  <div style={{ padding: '50px 20px', textAlign: 'center', color: 'var(--text-3)' }}>
                    <div style={{ fontSize: '32px', marginBottom: '12px' }}>📬</div>
                    <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-1)', marginBottom: '6px' }}>
                      Smart Inbox is Monitoring
                    </div>
                    <div style={{ fontSize: '12px', lineHeight: 1.5, marginBottom: '20px' }}>
                      Recruiter replies to your outreach will appear here with automatic category classification and 1-click tailored responses.
                    </div>
                    <button
                      className="btn btn-primary"
                      onClick={props.fetchInbox}
                      disabled={props.inboxLoading}
                      style={{ padding: '8px 16px', fontSize: '12px' }}
                    >
                      {props.inboxLoading ? 'Checking...' : 'Check For Replies'}
                    </button>
                    </div>
                  )}
              {/* Link Recruiter Thread to Application Modal (Mobile) */}
              {showLinkModal && (
                <div style={{
                  position: 'fixed',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  background: 'rgba(0, 0, 0, 0.75)',
                  backdropFilter: 'blur(6px)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 9999,
                  padding: '16px'
                }}>
                  <div style={{
                    background: 'var(--surface-2)',
                    border: '1px solid var(--border)',
                    borderRadius: '14px',
                    width: '100%',
                    maxWidth: '480px',
                    maxHeight: '85vh',
                    display: 'flex',
                    flexDirection: 'column',
                    boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
                    overflow: 'hidden'
                  }}>
                    {/* Header */}
                    <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ minWidth: 0, paddingRight: '8px' }}>
                        <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-1)' }}>
                          🔗 Link to Application
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          From: {currentReply?.from}
                        </div>
                      </div>
                      <button
                        onClick={() => setShowLinkModal(false)}
                        className="btn btn-ghost"
                        style={{ padding: '4px 8px', fontSize: '14px' }}
                      >✕</button>
                    </div>

                    {/* Body */}
                    <div style={{ padding: '16px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '14px' }}>
                      {/* Mode Toggle */}
                      <div style={{ display: 'flex', gap: '6px', background: 'var(--surface-1)', padding: '3px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                        <button
                          onClick={() => setIsCreatingNewJob(false)}
                          style={{
                            flex: 1,
                            padding: '6px 8px',
                            fontSize: '11px',
                            fontWeight: !isCreatingNewJob ? 600 : 500,
                            borderRadius: '6px',
                            border: 'none',
                            background: !isCreatingNewJob ? 'var(--surface-2)' : 'transparent',
                            color: !isCreatingNewJob ? 'var(--text-1)' : 'var(--text-3)'
                          }}
                        >
                          Existing Job
                        </button>
                        <button
                          onClick={() => setIsCreatingNewJob(true)}
                          style={{
                            flex: 1,
                            padding: '6px 8px',
                            fontSize: '11px',
                            fontWeight: isCreatingNewJob ? 600 : 500,
                            borderRadius: '6px',
                            border: 'none',
                            background: isCreatingNewJob ? 'var(--surface-2)' : 'transparent',
                            color: isCreatingNewJob ? 'var(--text-1)' : 'var(--text-3)'
                          }}
                        >
                          Create New Job
                        </button>
                      </div>

                      {!isCreatingNewJob ? (
                        <>
                          {/* Search */}
                          <div>
                            <input
                              type="text"
                              placeholder="Search application company or role..."
                              value={linkingSearch}
                              onChange={(e) => setLinkingSearch(e.target.value)}
                              className="input"
                              style={{ width: '100%', height: '34px', fontSize: '12px', borderRadius: '8px', background: 'var(--surface-1)', border: '1px solid var(--border)', marginBottom: '8px' }}
                            />
                            {/* List */}
                            <div style={{ maxHeight: '180px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--surface-1)' }}>
                              {(props.jobs || [])
                                .filter(j => {
                                  if (!linkingSearch.trim()) return true;
                                  const q = linkingSearch.toLowerCase().trim();
                                  return (j.company || '').toLowerCase().includes(q) || (j.role || '').toLowerCase().includes(q);
                                })
                                .slice(0, 40)
                                .map(j => {
                                  const isSelected = linkingJobId === j.id;
                                  return (
                                    <div
                                      key={j.id}
                                      onClick={() => setLinkingJobId(j.id)}
                                      style={{
                                        padding: '8px 12px',
                                        borderBottom: '1px solid var(--border)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        background: isSelected ? 'rgba(59, 130, 246, 0.15)' : 'transparent'
                                      }}
                                    >
                                      <div style={{ minWidth: 0 }}>
                                        <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                          {j.company}
                                        </div>
                                        <div style={{ fontSize: '10px', color: 'var(--text-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                          {j.role}
                                        </div>
                                      </div>
                                      <span style={{ fontSize: '9px', padding: '1px 5px', borderRadius: '4px', background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                                        {j.status}
                                      </span>
                                    </div>
                                  );
                                })}
                            </div>
                          </div>
                        </>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                          <div>
                            <label style={{ fontSize: '11px', color: 'var(--text-2)', display: 'block', marginBottom: '2px' }}>Company Name *</label>
                            <input
                              type="text"
                              value={newJobCompany}
                              onChange={(e) => setNewJobCompany(e.target.value)}
                              placeholder="Company name"
                              className="input"
                              style={{ width: '100%', height: '34px', fontSize: '12px', borderRadius: '6px' }}
                            />
                          </div>
                          <div>
                            <label style={{ fontSize: '11px', color: 'var(--text-2)', display: 'block', marginBottom: '2px' }}>Role Title</label>
                            <input
                              type="text"
                              value={newJobRole}
                              onChange={(e) => setNewJobRole(e.target.value)}
                              placeholder="Role title"
                              className="input"
                              style={{ width: '100%', height: '34px', fontSize: '12px', borderRadius: '6px' }}
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Footer */}
                    <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: '8px', background: 'var(--surface-1)' }}>
                      <button className="btn btn-ghost" onClick={() => setShowLinkModal(false)} style={{ fontSize: '11px', padding: '6px 10px' }}>
                        Cancel
                      </button>
                      {!isCreatingNewJob ? (
                        <button
                          className="btn btn-primary"
                          disabled={!linkingJobId || linkingLoading}
                          onClick={() => handleLinkJob({ jobId: linkingJobId })}
                          style={{ fontSize: '11px', padding: '6px 12px' }}
                        >
                          {linkingLoading ? 'Linking...' : 'Link Job'}
                        </button>
                      ) : (
                        <button
                          className="btn btn-primary"
                          disabled={!newJobCompany.trim() || linkingLoading}
                          onClick={() => handleLinkJob({ createNew: true, company: newJobCompany, role: newJobRole })}
                          style={{ fontSize: '11px', padding: '6px 12px' }}
                        >
                          {linkingLoading ? 'Creating...' : 'Create & Link'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}
              </div>
            </>
          );
        })()}

        {tab === 'followups' && (() => {
          const allFollowUps = jobs.flatMap(job =>
            (job.followUps || []).map(f => ({ job, f }))
          );

          const pendingCount = allFollowUps.filter(item => !item.f.sent).length;
          const sentCount = allFollowUps.filter(item => item.f.sent).length;
          const totalCount = allFollowUps.length;

          const filteredFollowUps = allFollowUps.filter(({ job, f }) => {
            if (followUpStatus === 'pending' && f.sent) return false;
            if (followUpStatus === 'sent' && !f.sent) return false;

            if (followUpDay === '3' && f.day !== 3) return false;
            if (followUpDay === '6' && f.day < 6) return false;

            if (followUpSearch.trim()) {
              const q = followUpSearch.toLowerCase().trim();
              const matchCompany = (job.company || '').toLowerCase().includes(q);
              const matchRole = (job.role || '').toLowerCase().includes(q);
              const matchRecipient = (job.emailRecipient || '').toLowerCase().includes(q);
              const matchDraft = (f.draft || '').toLowerCase().includes(q);
              if (!matchCompany && !matchRole && !matchRecipient && !matchDraft) return false;
            }

            return true;
          });

          return (
            <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px', overflowY: 'auto' }}>
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                <div>
                  <h2 style={{ fontSize: '20px', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    Follow Ups
                    <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-3)', background: 'var(--surface-3)', padding: '2px 7px', borderRadius: '10px' }}>
                      {filteredFollowUps.length}
                    </span>
                  </h2>
                  <p style={{ color: 'var(--text-2)', fontSize: '12px', margin: '2px 0 0 0' }}>
                    Automate Day 3 & 6 recruiter check-ins
                  </p>
                </div>
                <button className="btn btn-primary" style={{ padding: '7px 12px', fontSize: '12px', flexShrink: 0 }} onClick={async () => {
                  setFetching(true);
                  try {
                    const res = await fetch(`${API_BASE}/api/check-followups`, {
                      method: 'POST',
                      headers: { 'Authorization': `Bearer ${localStorage.getItem('token') || ''}` }
                    });
                    const result = await res.json();
                    if (result.success) {
                      notify(`Drafted ${result.draftedCount} new follow-ups.`);
                      loadJobs();
                    } else {
                      notify(result.error || 'Failed to check', 'error');
                    }
                  } catch (err) {
                    notify('An error occurred', 'error');
                  }
                  setFetching(false);
                }} disabled={fetching}>
                  {fetching ? <span className="spinner"></span> : '🔄 Check'}
                </button>
              </div>

              {/* Auto Follow-Up Toggle Switch for Mobile */}
              <div
                onClick={async () => {
                  const nextVal = profile?.enableAutoFollowUp === false ? true : false;
                  const updatedProfile = { ...profile, enableAutoFollowUp: nextVal };
                  setProfile(updatedProfile);
                  try {
                    const token = localStorage.getItem('token') || '';
                    const res = await fetch(`${API_BASE}/api/profile`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                      body: JSON.stringify({ enableAutoFollowUp: nextVal })
                    });
                    if (res.ok) {
                      notify(nextVal 
                        ? '⚡ Auto-Send enabled!' 
                        : '⏸️ Auto-Send paused (drafts saved in memory)', 
                        'success'
                      );
                    } else {
                      notify('Failed to update setting', 'error');
                    }
                  } catch (err) {
                    notify('Failed to update setting', 'error');
                  }
                }}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  background: profile?.enableAutoFollowUp !== false 
                    ? 'linear-gradient(135deg, rgba(34, 197, 94, 0.08) 0%, rgba(38, 41, 45, 0.8) 100%)' 
                    : 'var(--surface-2)',
                  padding: '8px 12px',
                  borderRadius: '10px',
                  border: `1px solid ${profile?.enableAutoFollowUp !== false ? 'rgba(34, 197, 94, 0.35)' : 'var(--border)'}`,
                  cursor: 'pointer',
                  userSelect: 'none'
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{
                      width: '6px',
                      height: '6px',
                      borderRadius: '50%',
                      background: profile?.enableAutoFollowUp !== false ? '#22c55e' : '#6C7278',
                      boxShadow: profile?.enableAutoFollowUp !== false ? '0 0 6px rgba(34, 197, 94, 0.8)' : 'none',
                      flexShrink: 0
                    }} />
                    <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-1)' }}>
                      Auto-Followups
                    </span>
                    <span style={{
                      fontSize: '9px',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                      padding: '1px 5px',
                      borderRadius: '4px',
                      background: profile?.enableAutoFollowUp !== false ? 'rgba(34, 197, 94, 0.15)' : 'rgba(108, 114, 120, 0.2)',
                      color: profile?.enableAutoFollowUp !== false ? '#4ade80' : 'var(--text-3)',
                      border: `1px solid ${profile?.enableAutoFollowUp !== false ? 'rgba(34, 197, 94, 0.3)' : 'transparent'}`
                    }}>
                      {profile?.enableAutoFollowUp !== false ? 'Active' : 'Paused'}
                    </span>
                  </div>
                  <span style={{ fontSize: '10px', color: 'var(--text-3)', paddingLeft: '12px' }}>
                    {profile?.enableAutoFollowUp !== false ? 'Autonomously dispatches Day 3 & 6' : 'Drafts saved in memory • manual send'}
                  </span>
                </div>

                <div
                  style={{
                    position: 'relative',
                    width: '38px',
                    height: '20px',
                    borderRadius: '10px',
                    background: profile?.enableAutoFollowUp !== false ? '#22c55e' : 'var(--surface-4, #3A3D43)',
                    padding: '2px',
                    transition: 'background 0.2s',
                    flexShrink: 0,
                    border: `1px solid ${profile?.enableAutoFollowUp !== false ? 'rgba(34, 197, 94, 0.6)' : 'rgba(255, 255, 255, 0.1)'}`
                  }}
                >
                  <div style={{
                    width: '14px',
                    height: '14px',
                    borderRadius: '50%',
                    background: '#fff',
                    transform: profile?.enableAutoFollowUp !== false ? 'translateX(18px)' : 'translateX(0)',
                    transition: 'transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.3)'
                  }} />
                </div>
              </div>

              {/* Status Toggle Buttons */}
              <div style={{
                display: 'flex',
                background: 'var(--surface-2)',
                borderRadius: '8px',
                padding: '3px',
                gap: '3px',
                border: '1px solid var(--border)'
              }}>
                {[
                  { id: 'pending', label: '⏳ Pending', count: pendingCount },
                  { id: 'sent', label: '✓ Sent', count: sentCount },
                  { id: 'all', label: '📋 All', count: totalCount }
                ].map(item => {
                  const active = followUpStatus === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => { setFollowUpStatus(item.id); setFollowUpLimit(30); }}
                      style={{
                        flex: 1,
                        padding: '6px 8px',
                        borderRadius: '6px',
                        border: 'none',
                        fontSize: '12px',
                        fontWeight: active ? 600 : 500,
                        background: active ? 'var(--accent)' : 'transparent',
                        color: active ? '#fff' : 'var(--text-2)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '5px',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <span>{item.label}</span>
                      <span style={{
                        fontSize: '10px',
                        padding: '1px 5px',
                        borderRadius: '10px',
                        background: active ? 'rgba(255,255,255,0.25)' : 'var(--surface-3)',
                        color: active ? '#fff' : 'var(--text-3)',
                        fontWeight: 600
                      }}>
                        {item.count}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Day Filter & Search Bar */}
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <div style={{
                  display: 'flex',
                  background: 'var(--surface-2)',
                  borderRadius: '8px',
                  padding: '2px',
                  gap: '2px',
                  border: '1px solid var(--border)',
                  flexShrink: 0
                }}>
                  {[
                    { id: 'all', label: 'All' },
                    { id: '3', label: 'Day 3' },
                    { id: '6', label: 'Day 6+' }
                  ].map(dayItem => {
                    const active = followUpDay === dayItem.id;
                    return (
                      <button
                        key={dayItem.id}
                        onClick={() => { setFollowUpDay(dayItem.id); setFollowUpLimit(30); }}
                        style={{
                          padding: '5px 8px',
                          borderRadius: '5px',
                          border: 'none',
                          fontSize: '11px',
                          fontWeight: active ? 600 : 500,
                          background: active ? 'var(--surface-4, #3A3D43)' : 'transparent',
                          color: active ? 'var(--text-1)' : 'var(--text-3)',
                          cursor: 'pointer'
                        }}
                      >
                        {dayItem.label}
                      </button>
                    );
                  })}
                </div>

                <div className="search-wrapper" style={{ flex: 1, minWidth: 0 }}>
                  <span className="search-icon" style={{ fontSize: '12px' }}>🔍</span>
                  <input
                    type="text"
                    className="search-input"
                    placeholder="Search..."
                    value={followUpSearch}
                    onChange={(e) => { setFollowUpSearch(e.target.value); setFollowUpLimit(30); }}
                    style={{ fontSize: '12px', padding: '6px 26px 6px 26px' }}
                  />
                  {followUpSearch && (
                    <button
                      onClick={() => setFollowUpSearch('')}
                      style={{ background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', padding: '0 4px', fontSize: '10px' }}
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>

              {/* Follow Up List */}
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {filteredFollowUps.slice(0, followUpLimit).map(({ job, f }) => (
                  <FollowUpRow
                    key={`${job.id}-${f.day}`}
                    job={job}
                    f={f}
                    API_BASE={API_BASE}
                    token={localStorage.getItem('token') || ''}
                    setJobs={setJobs}
                    jobs={jobs}
                    notify={notify}
                  />
                ))}

                {filteredFollowUps.length === 0 && (
                  <div style={{
                    padding: '32px 16px',
                    textAlign: 'center',
                    background: 'var(--surface-2)',
                    borderRadius: '8px',
                    border: '1px solid var(--border)',
                    color: 'var(--text-3)',
                    marginTop: '8px'
                  }}>
                    <div style={{ fontSize: '24px', marginBottom: '8px' }}>📭</div>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-2)', marginBottom: '2px' }}>
                      No {followUpStatus === 'all' ? '' : followUpStatus} follow-ups
                    </div>
                    <div style={{ fontSize: '12px' }}>
                      {followUpSearch ? 'Try a different search term' : 'Click "Check" to scan for due follow-ups.'}
                    </div>
                  </div>
                )}

                {filteredFollowUps.length > followUpLimit && (
                  <div style={{ textAlign: 'center', marginTop: '12px', marginBottom: '16px' }}>
                    <button
                      className="btn btn-secondary"
                      onClick={() => setFollowUpLimit(prev => prev + 30)}
                      style={{ padding: '8px 16px', fontSize: '12px' }}
                    >
                      Load More ({filteredFollowUps.length - followUpLimit} remaining)
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })()}

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
                    <button className="btn btn-primary" style={{ background: 'var(--error)', borderColor: 'var(--error)', padding: '6px 12px', fontSize: '13px' }} onClick={() => handleBatchDelete()}>Delete</button>
                    <button className="btn btn-primary" style={{ padding: '6px 12px', fontSize: '13px' }} onClick={() => handleBatchSend()}>Auto-Apply 🚀</button>
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
                <div style={{ gridColumn: 'span 2', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                    <label style={{ fontSize: '13px', color: 'var(--text-2)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <input type="checkbox" checked={useApify} onChange={e => setUseApify(e.target.checked)} style={{ accentColor: 'var(--accent)' }} />
                      Deep Scraper
                    </label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '12px', color: 'var(--text-2)' }}>Exp:</span>
                      <select className="form-input" style={{ width: 'auto', fontSize: '12px', padding: '4px 8px' }} value={experienceFilter} onChange={(e) => setExperienceFilter(e.target.value)}>
                        <option value="All">🎯 All</option>
                        <option value="Junior">🟢 Junior</option>
                        <option value="Mid">🟡 Mid</option>
                        <option value="Senior">🟣 Senior</option>
                      </select>
                    </div>
                  </div>
                  <button className="btn btn-primary" onClick={handleFetchJobs} disabled={fetching || fetchQueries.length === 0}>
                    {fetching ? <span className="spinner"></span> : experienceFilter !== 'All' ? `Auto-Scrape ${experienceFilter} Jobs ✨` : 'Auto-Scrape Jobs ✨'}
                  </button>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: '8px', marginTop: '14px', flexWrap: 'wrap' }}>
              <div className="search-wrapper" style={{ flex: 1, minWidth: '160px', margin: 0 }}>
                <span className="search-icon">🔍</span>
                <input type="text" className="search-input" placeholder="Search company or role..." value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <select className="form-input" style={{ width: 'auto', flexShrink: 0 }} value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)}>
                <option value="All">🌐 All Portals</option>
                <option value="LinkedIn">💼 LinkedIn</option>
                <option value="Indeed">🔍 Indeed</option>
                <option value="Naukri">⚡ Naukri</option>
                <option value="Adzuna">🎯 Adzuna</option>
                <option value="Other">📝 Other</option>
              </select>
            </div>
            {jobs.some(j => isSeniorJob(j.role, j.jd)) && (
              <div style={{ marginTop: '10px' }}>
                <button
                  className="btn btn-ghost"
                  onClick={handlePurgeSeniorJobs}
                  style={{
                    fontSize: '11px',
                    padding: '5px 10px',
                    color: 'var(--error, #ef4444)',
                    borderColor: 'rgba(239, 68, 68, 0.35)',
                    background: 'rgba(239, 68, 68, 0.08)',
                    borderRadius: '6px',
                    width: '100%'
                  }}
                >
                  🧹 Purge Ineligible Senior Roles
                </button>
              </div>
            )}
            {activeJobs.length > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '14px', padding: '0 4px' }}>
                <button 
                  className="btn btn-ghost" 
                  style={{ padding: '6px 12px', fontSize: '12px', background: 'var(--surface-3)', borderRadius: '6px', color: 'var(--text-1)' }} 
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
          <div className="mobile-actions-panel" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div className="search-wrapper" style={{ margin: 0 }}>
              <span className="search-icon">🔍</span>
              <input type="text" className="search-input" placeholder="Search company or role..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <select className="form-input" style={{ flex: 1 }} value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)}>
                <option value="All">🌐 All Portals</option>
                <option value="LinkedIn">💼 LinkedIn</option>
                <option value="Indeed">🔍 Indeed</option>
                <option value="Naukri">⚡ Naukri</option>
                <option value="Adzuna">🎯 Adzuna</option>
                <option value="Other">📝 Other</option>
              </select>
              <select className="form-input" style={{ flex: 1 }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="All">📊 All Statuses</option>
                <option value="Sent">🟢 Sent</option>
                <option value="Opened">📬 Opened</option>
                <option value="Replied">💬 Replied</option>
                <option value="Bounced">🔴 Bounced</option>
              </select>
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
                paginatedJobs.map(job => (
                  <div className={`mobile-job-card ${selectedJobs.includes(job.id) ? 'selected' : ''}`} key={job.id} onClick={() => { if(tab === 'applications') toggleSelectJob(job.id); }}>
                    {tab === 'applications' && (
                       <div className="mobile-card-checkbox">
                         <input type="checkbox" checked={selectedJobs.includes(job.id)} onChange={() => {}} />
                       </div>
                    )}
                    <div className="mobile-card-content">
                      <div className="mobile-card-header">
                         <div className="company-avatar" style={{ width: '32px', height: '32px', fontSize: '12px' }}>{(job.company || 'XX').substring(0,2).toUpperCase()}</div>
                         <div className="mobile-card-title">
                            <h3 style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                              {job.company || 'Unknown Company'}
                              {job.source && job.source !== 'Manual' && (
                                <span className={`source-pill source-${(job.source || '').toLowerCase()}`}>
                                  <img src={`https://www.google.com/s2/favicons?domain=${(job.source || '').toLowerCase()}.com&sz=16`} alt={job.source} style={{width: 10, height: 10, borderRadius: '2px'}} />
                                  {job.source}
                                </span>
                              )}
                            </h3>
                            <p style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                              <span>{parseRoleDisplay ? parseRoleDisplay(job.role).title : job.role}</span>
                              {tab === 'applications' && (() => {
                                const lvl = getJobLevel(job);
                                const lvlClass = lvl === 'Senior' ? 'level-senior' : lvl === 'Junior' ? 'level-junior' : 'level-mid';
                                return (
                                  <span className={`level-pill ${lvlClass}`} style={{ fontSize: '9px', padding: '1px 5px' }}>
                                    {lvl === 'Junior' ? '🟢 Jr' : lvl === 'Senior' ? '🟣 Sr' : '🟡 Mid'}
                                  </span>
                                );
                              })()}
                            </p>
                         </div>
                      </div>
                      {tab === 'applications' && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', padding: '0 12px 6px 12px' }}>
                          <span style={{ fontSize: '11px', color: 'var(--text-2)', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                            📍 {job.location || 'India'}
                          </span>
                          {(() => {
                            const wm = extractWorkMode(job.location, job.jd);
                            return wm ? (
                              <span style={{ fontSize: '10px', color: 'var(--text-3)', fontWeight: 500 }}>
                                {wm === 'Remote' ? '🏠 Remote' : wm === 'Hybrid' ? '🏢 Hybrid' : '🏢 On-site'}
                              </span>
                            ) : null;
                          })()}
                          {(() => {
                            const pkg = extractPackage(job.salary, job.jd);
                            return pkg ? (
                              <span style={{
                                fontSize: '10px',
                                fontWeight: 600,
                                color: '#10b981',
                                background: 'rgba(16, 185, 129, 0.12)',
                                border: '1px solid rgba(16, 185, 129, 0.25)',
                                padding: '1px 6px',
                                borderRadius: '10px'
                              }}>
                                💰 {pkg}
                              </span>
                            ) : null;
                          })()}
                        </div>
                      )}
                      <div className="mobile-card-footer">
                        <span className="mobile-card-date">
                          {tab === 'applied'
                            ? `Sent: ${new Date(job.sentAt || job.updatedAt || job.createdAt || Date.now()).toLocaleString([], {year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute:'2-digit'})}`
                            : `Found: ${new Date(job.createdAt || Date.now()).toLocaleString([], {year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute:'2-digit'})}`
                          }
                        </span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          {tab === 'applied' && (
                            <span className={`badge ${(job.status || 'applied').toLowerCase()}`}>
                              {job.status || 'Applied'}
                            </span>
                          )}
                          {job.tracked && <span style={{ fontSize: '12px' }}>🎯</span>}
                        </div>
                      </div>
                      <div className="mobile-card-actions">
                         <button className="icon-btn" onClick={(e) => { e.stopPropagation(); job.applyLink ? window.open(job.applyLink, '_blank') : alert('No link'); }}>
                           <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                         </button>
                         {job.hrLinkedIn && (
                           <button className="icon-btn text-accent" onClick={(e) => { e.stopPropagation(); window.open(job.hrLinkedIn, '_blank'); }}>
                             <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"></path><rect x="2" y="9" width="4" height="12"></rect><circle cx="4" cy="4" r="2"></circle></svg>
                           </button>
                         )}
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
              {totalPages > 1 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 12px', borderTop: '1px solid var(--border)', marginTop: '8px' }}>
                  <span style={{ fontSize: '12px', color: 'var(--text-3)' }}>
                    Page {currentPage} of {totalPages}
                  </span>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button className="btn btn-secondary" style={{ padding: '6px 10px', fontSize: '12px' }} disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)}>Prev</button>
                    <button className="btn btn-secondary" style={{ padding: '6px 10px', fontSize: '12px' }} disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)}>Next</button>
                  </div>
                </div>
              )}
          </div>
        )}

        {tab === 'resume' && (
          <div className="mobile-form-section">
            
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '20px' }}>
              <button className="btn btn-secondary" onClick={exportToCSV} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', background: 'var(--surface-3)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: '13px' }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                Export CSV
              </button>
            </div>
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
                  <button onClick={logout} type="button" className="btn btn-ghost" style={{ textAlign: 'center', width: '100%' }}>Logout</button>
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

        {tab === 'ai_settings' && (
          <div className="mobile-form-section">
            <h2 className="mobile-section-title">AI Prompt Settings</h2>
            
            <form onSubmit={handleProfileSave} className="mobile-form">
              <div className="mobile-card" style={{ padding: '16px', marginBottom: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <input 
                    type="checkbox" 
                    id="enableFlexMobile"
                    checked={profile.enableFlex !== false} 
                    onChange={e => setProfile({ ...profile, enableFlex: e.target.checked })}
                    style={{ width: '20px', height: '20px' }}
                  />
                  <label htmlFor="enableFlexMobile" style={{ fontWeight: '600', color: 'var(--text-1)' }}>
                    Enable "The Flex" Postscript
                  </label>
                </div>
                <div style={{ fontSize: '13px', color: 'var(--text-2)', marginTop: '8px', paddingLeft: '32px' }}>
                  Appends: <i>"P.S. I'm highly passionate about automation and software engineering..."</i>
                </div>
              </div>

              <div className="mobile-card" style={{ padding: '16px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: 'var(--text-1)' }}>Custom AI Instructions</label>
                <div style={{ fontSize: '13px', color: 'var(--text-2)', marginBottom: '12px' }}>Add any custom rules, constraints, or formats.</div>
                <textarea 
                  className="form-input" 
                  style={{ width: '100%', height: '150px' }} 
                  placeholder="e.g. Always mention that I am willing to relocate..."
                  value={profile.aiInstructions || ''} 
                  onChange={e => setProfile({ ...profile, aiInstructions: e.target.value })} 
                />
              </div>

              <button type="submit" className="btn btn-primary" style={{ marginTop: '20px', width: '100%', padding: '14px' }} disabled={savingProfile}>
                {savingProfile ? <span className="spinner"></span> : 'Save AI Settings'}
              </button>
            </form>
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
        
        {tab === 'applied' && (
          <div className="mobile-actions-panel" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div className="search-wrapper" style={{ margin: 0 }}>
              <span className="search-icon">🔍</span>
              <input type="text" className="search-input" placeholder="Search company or role..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <select className="form-input" style={{ flex: 1 }} value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)}>
                <option value="All">🌐 All Portals</option>
                <option value="LinkedIn">💼 LinkedIn</option>
                <option value="Indeed">🔍 Indeed</option>
                <option value="Naukri">⚡ Naukri</option>
                <option value="Adzuna">🎯 Adzuna</option>
                <option value="Other">📝 Other</option>
              </select>
              <select className="form-input" style={{ flex: 1 }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="All">📊 All Statuses</option>
                <option value="Sent">🟢 Email Sent</option>
                <option value="Opened">📬 Email Opened</option>
                <option value="Replied">💬 Email Replied</option>
                <option value="Bounced">🔴 Email Bounced</option>
                <option value="LinkedIn_Sent">💼 LinkedIn Invite Sent</option>
                <option value="LinkedIn_Connected">🤝 LinkedIn Connected</option>
                <option value="LinkedIn_Replied">💬 LinkedIn Replied</option>
              </select>
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
                paginatedJobs.map(job => (
                  <div className={`mobile-job-card ${selectedJobs.includes(job.id) ? 'selected' : ''}`} key={job.id} onClick={() => { if(tab === 'applications') toggleSelectJob(job.id); }}>
                    {tab === 'applications' && (
                       <div className="mobile-card-checkbox">
                         <input type="checkbox" checked={selectedJobs.includes(job.id)} onChange={() => {}} />
                       </div>
                    )}
                    <div className="mobile-card-content">
                      <div className="mobile-card-header">
                         <div className="company-avatar" style={{ width: '32px', height: '32px', fontSize: '12px' }}>{(job.company || 'XX').substring(0,2).toUpperCase()}</div>
                         <div className="mobile-card-title">
                            <h3 style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                              {job.company || 'Unknown Company'}
                              {job.source && job.source !== 'Manual' && (
                                <span className={`source-pill source-${(job.source || '').toLowerCase()}`}>
                                  <img src={`https://www.google.com/s2/favicons?domain=${job.source.toLowerCase()}.com&sz=16`} alt={job.source} style={{width: 10, height: 10, borderRadius: '2px'}} />
                                  {job.source}
                                </span>
                              )}
                            </h3>
                            <p style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                              <span>{parseRoleDisplay ? parseRoleDisplay(job.role).title : job.role}</span>
                              {tab === 'applications' && (() => {
                                const lvl = getJobLevel(job);
                                const lvlClass = lvl === 'Senior' ? 'level-senior' : lvl === 'Junior' ? 'level-junior' : 'level-mid';
                                return (
                                  <span className={`level-pill ${lvlClass}`} style={{ fontSize: '9px', padding: '1px 5px' }}>
                                    {lvl === 'Junior' ? '🟢 Jr' : lvl === 'Senior' ? '🟣 Sr' : '🟡 Mid'}
                                  </span>
                                );
                              })()}
                            </p>
                         </div>
                      </div>
                      {tab === 'applications' && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', padding: '0 12px 6px 12px' }}>
                          <span style={{ fontSize: '11px', color: 'var(--text-2)', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                            📍 {job.location || 'India'}
                          </span>
                          {(() => {
                            const wm = extractWorkMode(job.location, job.jd);
                            return wm ? (
                              <span style={{ fontSize: '10px', color: 'var(--text-3)', fontWeight: 500 }}>
                                {wm === 'Remote' ? '🏠 Remote' : wm === 'Hybrid' ? '🏢 Hybrid' : '🏢 On-site'}
                              </span>
                            ) : null;
                          })()}
                          {(() => {
                            const pkg = extractPackage(job.salary, job.jd);
                            return pkg ? (
                              <span style={{
                                fontSize: '10px',
                                fontWeight: 600,
                                color: '#10b981',
                                background: 'rgba(16, 185, 129, 0.12)',
                                border: '1px solid rgba(16, 185, 129, 0.25)',
                                padding: '1px 6px',
                                borderRadius: '10px'
                              }}>
                                💰 {pkg}
                              </span>
                            ) : null;
                          })()}
                        </div>
                      )}
                      <div className="mobile-card-footer">
                        <span className="mobile-card-date">
                          {tab === 'applied'
                            ? `Sent: ${new Date(job.sentAt || job.updatedAt || job.createdAt || Date.now()).toLocaleString([], {year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute:'2-digit'})}`
                            : `Found: ${new Date(job.createdAt || Date.now()).toLocaleString([], {year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute:'2-digit'})}`
                          }
                        </span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          {tab === 'applied' && (
                            (job.status || '').startsWith('LinkedIn') ? (
                              <select
                                value={job.status}
                                onClick={e => e.stopPropagation()}
                                onChange={(e) => updateStatus(job.id, e.target.value)}
                                style={{
                                  fontSize: '11px',
                                  fontWeight: 600,
                                  padding: '2px 6px',
                                  borderRadius: '6px',
                                  background: 'rgba(10, 102, 194, 0.15)',
                                  color: '#38bdf8',
                                  border: '1px solid rgba(10, 102, 194, 0.4)',
                                  cursor: 'pointer'
                                }}
                              >
                                <option value="LinkedIn_Sent" style={{ background: 'var(--surface-2)', color: 'var(--text-1)' }}>💼 Invite Sent</option>
                                <option value="LinkedIn_Connected" style={{ background: 'var(--surface-2)', color: 'var(--text-1)' }}>🤝 Connected</option>
                                <option value="LinkedIn_Replied" style={{ background: 'var(--surface-2)', color: 'var(--text-1)' }}>💬 Replied</option>
                              </select>
                            ) : (
                              <span className={`badge ${job.status.toLowerCase()}`}>
                                {job.status}
                              </span>
                            )
                          )}
                          {job.tracked && <span style={{ fontSize: '12px' }}>🎯</span>}
                        </div>
                      </div>
                      <div className="mobile-card-actions">
                         <button className="icon-btn" onClick={(e) => { e.stopPropagation(); job.applyLink ? window.open(job.applyLink, '_blank') : alert('No link'); }}>
                           <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                         </button>
                         {job.hrLinkedIn && (
                           <button className="icon-btn text-accent" onClick={(e) => { e.stopPropagation(); window.open(job.hrLinkedIn, '_blank'); }}>
                             <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"></path><rect x="2" y="9" width="4" height="12"></rect><circle cx="4" cy="4" r="2"></circle></svg>
                           </button>
                         )}
                         <button className="icon-btn text-danger" onClick={async (e) => { 
                           e.stopPropagation(); 
                           try {
                             await fetch(`${API_BASE}/api/jobs/${job.id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${localStorage.getItem('token') || ''}` } });
                             setJobs(p => p.filter(j => j.id !== job.id));
                             notify('Job deleted');
                           } catch(e) { notify('Delete failed', 'error'); }
                         }}>
                           <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                         </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
          </div>
        )}

        {tab === 'hr_dashboard' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (fetching) return;
                setFetching(true);
                try {
                  const effectiveQuery = (fetchQuery || fetchQueries[0] || 'software engineer').trim();
                  const res = await props.apiFetch(`${API_BASE}/api/jobs/scrape-hr`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token') || ''}` },
                    body: JSON.stringify({
                      query: effectiveQuery,
                      experience: experienceFilter !== 'All' ? experienceFilter : ''
                    })
                  });
                  const result = await res.json();
                  if (result.success) {
                    notify(`Discovered ${result.count} new HR leads for "${effectiveQuery}"!`);
                    loadJobs();
                  } else {
                    notify(result.error || 'Failed to find HRs', 'error');
                  }
                } catch (err) {
                  notify('An error occurred while finding HRs', 'error');
                } finally {
                  setFetching(false);
                }
              }}
              className="mobile-actions-panel"
              style={{ display: 'flex', gap: '8px' }}
            >
              <input
                type="text"
                className="form-input"
                style={{ flex: 1 }}
                placeholder="Role, Skill, or Company..."
                value={fetchQuery}
                onChange={e => setFetchQuery(e.target.value)}
              />
              <button type="submit" className="btn btn-primary" style={{ padding: '8px 14px' }} disabled={fetching}>
                {fetching ? <span className="spinner"></span> : 'Discover 🚀'}
              </button>
            </form>

            {/* Sub-Filters for HR Leads on Mobile */}
            {(() => {
              const allHrJobs = jobs.filter(j => j.status === 'HR_Found');
              const withEmailCount = allHrJobs.filter(j => !!j.emailRecipient).length;
              const noEmailCount = allHrJobs.filter(j => !j.emailRecipient).length;
              return (
                <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', padding: '0 4px' }}>
                  {[
                    { id: 'all', label: `All (${allHrJobs.length})` },
                    { id: 'with_email', label: `✉️ With Email (${withEmailCount})` },
                    { id: 'no_email', label: `💼 LinkedIn (${noEmailCount})` }
                  ].map(f => (
                    <button
                      key={f.id}
                      onClick={() => setHrFilter(f.id)}
                      style={{
                        padding: '5px 12px',
                        borderRadius: '12px',
                        fontSize: '11px',
                        fontWeight: hrFilter === f.id ? 600 : 400,
                        border: '1px solid',
                        borderColor: hrFilter === f.id ? 'var(--accent)' : 'var(--border)',
                        background: hrFilter === f.id ? 'var(--surface-3)' : 'var(--surface-2)',
                        color: hrFilter === f.id ? 'var(--text-1)' : 'var(--text-2)',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              );
            })()}

            <div className="mobile-actions-panel">
              {selectedJobs.length > 0 ? (
                <div className="mobile-selection-bar">
                  <span style={{ fontWeight: 600, color: 'var(--accent)' }}>{selectedJobs.length} selected</span>
                  <div style={{ flex: 1 }} />
                  {batchProgress !== null ? (
                     <span className="spinner"></span>
                  ) : (
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button className="btn btn-primary" style={{ background: 'var(--error)', borderColor: 'var(--error)', padding: '6px 12px', fontSize: '13px' }} onClick={() => handleBatchDelete()}>Delete</button>
                      <button className="btn btn-primary" style={{ padding: '6px 12px', fontSize: '13px' }} onClick={() => handleBatchSend()}>Send 🚀</button>
                    </div>
                  )}
                  <button className="btn btn-ghost" style={{ padding: '6px 12px', fontSize: '13px', marginLeft: '8px' }} onClick={() => setSelectedJobs([])}>Cancel</button>
                </div>
              ) : (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 4px' }}>
                  <button 
                    className="btn btn-ghost" 
                    style={{ padding: '6px 12px', fontSize: '13px', background: 'var(--surface-3)', borderRadius: '6px', color: 'var(--text-1)' }} 
                    onClick={() => {
                      const hrJobs = jobs.filter(j => j.status === 'HR_Found');
                      if (selectedJobs.length === hrJobs.length && hrJobs.length > 0) setSelectedJobs([]);
                      else setSelectedJobs(hrJobs.map(j => j.id));
                    }}
                  >
                    {selectedJobs.length === jobs.filter(j => j.status === 'HR_Found').length && jobs.filter(j => j.status === 'HR_Found').length > 0 ? 'Deselect All' : 'Select All'}
                  </button>
                  <span style={{ fontSize: '12px', color: 'var(--text-3)', fontWeight: '500' }}>{jobs.filter(j => j.status === 'HR_Found').length} HRs found</span>
                </div>
              )}
            </div>

            <div className="mobile-job-list" style={{ marginTop: '0', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {jobs.filter(j => {
                if (j.status !== 'HR_Found') return false;
                if (hrFilter === 'with_email') return !!j.emailRecipient;
                if (hrFilter === 'no_email') return !j.emailRecipient;
                return true;
              }).length === 0 ? (
                 <div className="empty-state"><div className="empty-icon">📭</div><h3>No HRs found</h3></div>
              ) : (
                 jobs.filter(j => {
                   if (j.status !== 'HR_Found') return false;
                   if (hrFilter === 'with_email') return !!j.emailRecipient;
                   if (hrFilter === 'no_email') return !j.emailRecipient;
                   return true;
                 }).map(job => {
                   const linkedInTargetUrl = job.hrLinkedIn || `https://www.linkedin.com/search/results/all/?keywords=${encodeURIComponent((job.hrName || '') + ' ' + (job.company || ''))}`;
                   const hasEmail = !!job.emailRecipient;

                   return (
                    <div className={`mobile-job-card ${selectedJobs.includes(job.id) ? 'selected' : ''}`} key={job.id} onClick={() => toggleSelectJob(job.id)} style={{ flexDirection: 'column', gap: '10px' }}>
                      <div style={{ display: 'flex', width: '100%', alignItems: 'flex-start', gap: '10px' }}>
                        <div className="mobile-card-checkbox" style={{ marginTop: '2px' }}>
                          <input type="checkbox" checked={selectedJobs.includes(job.id)} onChange={() => {}} />
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h3 style={{ fontSize: '14px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                              {job.hrName || 'Unknown Recruiter'}
                              {job.source && (
                                <span className={`source-pill source-${job.source.toLowerCase()}`} style={{ padding: '1px 6px', fontSize: '9px' }}>
                                  {job.source}
                                </span>
                              )}
                            </h3>
                            <button
                              className="icon-btn text-danger"
                              style={{ padding: '2px' }}
                              onClick={async (e) => { 
                                e.stopPropagation(); 
                                try {
                                  await fetch(`${API_BASE}/api/jobs/${job.id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${localStorage.getItem('token') || ''}` } });
                                  setJobs(p => p.filter(j => j.id !== job.id));
                                  notify('Lead deleted');
                                } catch(e) { notify('Delete failed', 'error'); }
                              }}
                            >
                              ✕
                            </button>
                          </div>
                          <div style={{ fontSize: '12px', color: 'var(--accent)', fontWeight: 600, marginTop: '2px' }}>🏢 {job.company}</div>
                          <div style={{ fontSize: '11px', color: 'var(--text-2)', marginTop: '1px' }}>
                            <span style={{ color: 'var(--text-3)' }}>Role: </span>{job.role}
                          </div>
                        </div>
                      </div>

                      {/* Email Box / Inline Editor on Mobile */}
                      <div style={{
                        fontSize: '11px',
                        background: 'var(--surface-1)',
                        padding: '6px 10px',
                        borderRadius: '6px',
                        border: '1px solid var(--border)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '6px'
                      }} onClick={e => e.stopPropagation()}>
                        {editingEmailId === job.id ? (
                          <div style={{ display: 'flex', width: '100%', gap: '6px' }}>
                            <input
                              type="email"
                              className="form-input"
                              style={{ flex: 1, padding: '3px 6px', fontSize: '11px' }}
                              value={editEmailVal}
                              onChange={(e) => setEditEmailVal(e.target.value)}
                              placeholder="hr@company.com"
                              autoFocus
                            />
                            <button className="btn btn-primary" style={{ padding: '3px 8px', fontSize: '10px' }} onClick={() => handleSaveInlineEmail(job.id)}>Save</button>
                            <button className="btn btn-ghost" style={{ padding: '3px 6px', fontSize: '10px' }} onClick={() => setEditingEmailId(null)}>✕</button>
                          </div>
                        ) : (
                          <>
                            <span style={{ color: hasEmail ? 'var(--text-1)' : 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              ✉️ {hasEmail ? job.emailRecipient : 'Email: Not Found'}
                            </span>
                            <button
                              onClick={() => {
                                setEditingEmailId(job.id);
                                setEditEmailVal(job.emailRecipient || '');
                              }}
                              style={{ background: 'transparent', border: 'none', color: 'var(--accent)', fontSize: '10px', cursor: 'pointer', textDecoration: 'underline' }}
                            >
                              {hasEmail ? '✏️ Edit' : '+ Add'}
                            </button>
                          </>
                        )}
                      </div>

                      {/* Action buttons on Mobile */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', width: '100%' }} onClick={e => e.stopPropagation()}>
                        {/* Unified Connect with AI Note Button */}
                        <button
                          className="btn"
                          style={{ width: '100%', padding: '7px', fontSize: '11px', background: '#0a66c2', color: '#fff', borderRadius: '6px', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                          onClick={() => handleConnectWithNote(job)}
                          disabled={copyingNoteId === job.id}
                        >
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/>
                          </svg>
                          {copyingNoteId === job.id ? (
                            <>
                              <span className="spinner" style={{ width: '10px', height: '10px' }}></span>
                              Opening & Copying...
                            </>
                          ) : (
                            '💼 Connect with AI Note'
                          )}
                        </button>

                        {hasEmail ? (
                          <button className="btn btn-primary" style={{ width: '100%', padding: '7px', fontSize: '11px' }} onClick={() => handleBatchSend([job.id])}>
                            ✉️ Send Mail
                          </button>
                        ) : (
                          <button
                            className="btn btn-ghost"
                            style={{ width: '100%', padding: '7px', fontSize: '11px', border: '1px dashed var(--accent)', color: 'var(--accent)' }}
                            onClick={() => handleDeepDiscoverHrEmail(job)}
                            disabled={discoveringHrId === job.id}
                          >
                            {discoveringHrId === job.id ? 'Scanning...' : '🔍 Deep Scan for Email'}
                          </button>
                        )}

                        {/* Revealed Only After Clicking Connect */}
                        {connectedJobIds.includes(job.id) && (
                          <button
                            className="btn btn-ghost"
                            style={{
                              width: '100%',
                              fontSize: '10px',
                              padding: '6px',
                              borderRadius: '6px',
                              color: '#38bdf8',
                              borderColor: 'rgba(10, 102, 194, 0.4)',
                              background: 'rgba(10, 102, 194, 0.1)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '4px',
                              fontWeight: 600
                            }}
                            onClick={async () => {
                              await updateStatus(job.id, 'LinkedIn_Sent');
                              notify(`💼 Marked as LinkedIn Invite Sent! Moved to Applied tab.`);
                            }}
                          >
                            ✓ Mark Invite Sent (Move to Applied)
                          </button>
                        )}
                      </div>
                    </div>
                   );
                 })
              )}
            </div>
          </div>
        )}
      </div>

      {/* Bottom Navigation */}
      {showMoreMenu && (
        <div className="mobile-more-menu-overlay" onClick={() => setShowMoreMenu(false)} style={{ position: 'fixed', inset: 0, zIndex: 4998, background: 'rgba(0,0,0,0.5)' }}>
          <div className="mobile-more-menu" onClick={e => e.stopPropagation()} style={{ position: 'absolute', bottom: '70px', left: 0, right: 0, background: 'var(--surface-2)', borderTopLeftRadius: '24px', borderTopRightRadius: '24px', borderTop: '1px solid var(--border)', padding: '24px 16px 32px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', boxShadow: '0 -10px 40px rgba(0,0,0,0.8)' }}>
            <div style={{ gridColumn: '1 / -1', textAlign: 'center', color: 'var(--text-3)', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px', fontWeight: 'bold' }}>More Options</div>
            {NAV.slice(4).map(n => (
              <button key={n.id} onClick={() => { setTab(n.id); setShowMoreMenu(false); }} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', padding: '20px 12px', background: 'var(--surface-3)', border: `1px solid ${tab === n.id ? 'var(--accent)' : 'var(--border)'}`, borderRadius: '16px', color: tab === n.id ? 'var(--accent)' : 'var(--text-1)', boxShadow: '0 4px 12px rgba(0,0,0,0.2)', transition: 'all 0.2s' }}>
                <div style={{ transform: 'scale(1.2)' }}>{n.icon}</div>
                <span style={{ fontSize: '14px', fontWeight: '500' }}>{n.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="bottom-nav">
        {NAV.slice(0, 4).map(n => (
          <div key={n.id} className={`bottom-nav-item ${tab === n.id ? 'active' : ''}`} onClick={() => { setTab(n.id); setShowMoreMenu(false); }}>
            <span className="bottom-nav-icon">{n.icon}</span>
            <span className="bottom-nav-label">{n.label.split(' ')[0]}</span>
          </div>
        ))}
        <div className={`bottom-nav-item ${showMoreMenu || NAV.slice(4).some(n => n.id === tab) ? 'active' : ''}`} onClick={() => setShowMoreMenu(!showMoreMenu)}>
          <span className="bottom-nav-icon">
             <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>
          </span>
          <span className="bottom-nav-label">More</span>
        </div>
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
