import React from 'react';
import { NAV, API_BASE } from './useAppLogic.jsx';
import GitHubPortfolioCard from './GitHubPortfolioCard';
import { cleanDraftText } from './textCleaner';

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

function EmailMessageBody({ text, quotedText }) {
  const parsed = React.useMemo(() => cleanEmailBody(text), [text]);
  const displayClean = parsed.clean;
  const quote = quotedText || parsed.quoted;

  return (
    <div>
      <div style={{ fontSize: '14px', lineHeight: '1.6', whiteSpace: 'pre-wrap', color: 'var(--text-1)', wordBreak: 'break-word', overflowWrap: 'break-word' }}>
        {displayClean}
      </div>
      {quote && (
        <details style={{ marginTop: '10px' }}>
          <summary style={{
            cursor: 'pointer',
            color: 'var(--text-3)',
            fontSize: '11px',
            userSelect: 'none',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            padding: '3px 8px',
            borderRadius: '6px',
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid var(--border)'
          }}>
            ··· Show quoted text
          </summary>
          <div style={{
            marginTop: '8px',
            padding: '10px 14px',
            background: 'rgba(0,0,0,0.2)',
            borderRadius: '6px',
            fontSize: '12px',
            lineHeight: '1.5',
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
      borderRadius: '12px',
      border: '1px solid var(--border)',
      overflow: 'hidden',
      marginBottom: '12px',
      transition: 'border-color 0.2s',
    }}>
      <div
        style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', cursor: 'pointer' }}
        onClick={() => setExpanded(!expanded)}
      >
        {/* Left: Company & Role */}
        <div style={{ width: '250px', flexShrink: 0, paddingRight: '16px' }}>
          <div style={{ fontWeight: 600, fontSize: '15px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{job.company}</div>
          <div style={{ fontSize: '13px', color: 'var(--text-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{job.role}</div>
        </div>

        {/* Center: Badge & Preview */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '16px', minWidth: 0 }}>
          <span style={{
            background: f.day === 3 ? 'var(--blue-bg)' : 'var(--purple-bg)',
            color: f.day === 3 ? 'var(--blue)' : 'var(--purple)',
            padding: '4px 10px', borderRadius: '100px', fontSize: '11px', fontWeight: 600, flexShrink: 0
          }}>Day {f.day}</span>
          <div style={{ fontSize: '13px', color: 'var(--text-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', opacity: 0.8 }}>
            {f.draft ? f.draft.replace(/\n/g, ' ') : 'No draft content'}
          </div>
        </div>

        {/* Right: Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexShrink: 0, paddingLeft: '16px' }}>
          {f.sent ? (
            <span style={{
              background: 'var(--green-bg, rgba(74, 222, 128, 0.15))',
              color: 'var(--green, #4ade80)',
              border: '1px solid rgba(74, 222, 128, 0.3)',
              padding: '5px 12px',
              borderRadius: '8px',
              fontSize: '12px',
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px'
            }}>
              ✓ Sent
            </span>
          ) : (
            <button
              className="btn btn-primary"
              style={{ padding: '6px 16px', fontSize: '13px', borderRadius: '8px' }}
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
          <div style={{ color: 'var(--text-3)', transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', width: '20px', textAlign: 'center' }}>
            ▼
          </div>
        </div>
      </div>

      {/* Expanded Draft */}
      {expanded && (
        <div style={{
          padding: '20px',
          borderTop: '1px solid var(--border)',
          background: 'var(--surface-1)',
          fontSize: '13px',
          lineHeight: '1.6',
          whiteSpace: 'pre-wrap',
          color: 'var(--text-1)'
        }}>
          {f.draft}
          {f.sent && (
            <div style={{ marginTop: '14px', paddingTop: '12px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-3)' }}>
                Sent to: <strong style={{ color: 'var(--text-2)' }}>{job.emailRecipient || job.recruiterEmail || 'Recruiter'}</strong>
              </span>
              <button
                className="btn btn-secondary"
                style={{ padding: '4px 12px', fontSize: '12px' }}
                onClick={async (e) => {
                  e.stopPropagation();
                  if (!window.confirm(`Resend Day ${f.day} follow-up to ${job.emailRecipient || job.recruiterEmail || 'recruiter'}?`)) return;
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
            </div>
          )}
        </div>
      )}
    </div>
  );
}
const DraggableTerminal = ({ batchState, cancelBatch }) => {
  const [minimized, setMinimized] = React.useState(false);
  const [position, setPosition] = React.useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = React.useState(false);
  const [dragOffset, setDragOffset] = React.useState({ x: 0, y: 0 });
  const logsEndRef = React.useRef(null);

  React.useEffect(() => {
    setPosition({ x: window.innerWidth - 424, y: window.innerHeight - 300 });
  }, []);

  React.useEffect(() => {
    if (logsEndRef.current && !minimized) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [batchState.logs, minimized]);

  const handlePointerDown = (e) => {
    setIsDragging(true);
    setDragOffset({ x: e.clientX - position.x, y: e.clientY - position.y });
    e.target.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e) => {
    if (isDragging) {
      setPosition({ x: e.clientX - dragOffset.x, y: e.clientY - dragOffset.y });
    }
  };

  const handlePointerUp = (e) => {
    setIsDragging(false);
    e.target.releasePointerCapture(e.pointerId);
  };

  if (!batchState.active) return null;

  return (
    <div style={{
      position: 'fixed', left: position.x, top: position.y, width: '400px', background: '#0c0c0c',
      border: '1px solid #333', borderRadius: '8px', boxShadow: '0 20px 40px rgba(0,0,0,0.8)',
      display: 'flex', flexDirection: 'column', zIndex: 10000, overflow: 'hidden', color: '#00ff00', fontFamily: 'monospace'
    }}>
      <div
        onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp}
        style={{ background: '#1a1a1a', padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: isDragging ? 'grabbing' : 'grab', userSelect: 'none', borderBottom: '1px solid #333' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ color: '#00ff00', fontWeight: 'bold' }}>root@kali:~#</span>
          <span style={{ fontSize: '13px', color: '#fff' }}>batch-apply.sh ({batchState.currentIndex}/{batchState.total})</span>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button onClick={cancelBatch} style={{ background: 'transparent', border: 'none', color: 'var(--error)', cursor: 'pointer', padding: '0 4px', fontSize: '14px', fontWeight: 'bold' }} title="Cancel Batch">
            ✕
          </button>
          <button onClick={() => setMinimized(!minimized)} style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', padding: '0 4px', fontSize: '14px' }}>
            {minimized ? '🗖' : '🗕'}
          </button>
        </div>
      </div>

      {!minimized && (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
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
          <div style={{ padding: '12px', height: '180px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {batchState.logs.map((log, idx) => {
              const isError = log.includes('Error') || log.includes('Failed') || log.includes('blocked') || log.includes('🛑') || log.includes('❌');
              const isSuccess = log.includes('Successfully') || log.includes('Verified') || log.includes('✅') || log.includes('🚀');
              const isWarning = log.includes('Skipped') || log.includes('Deliverability Guard') || log.includes('🛡️') || log.includes('⚠️') || log.includes('⏩');
              const isInfo = log.includes('Initializing') || log.includes('Running') || log.includes('Generating') || log.includes('Dispatching');
              let color = '#00ff00';
              if (isError) color = '#ff4d4f';
              else if (isWarning) color = '#fbbf24';
              else if (isSuccess) color = '#34d399';
              else if (isInfo) color = '#38bdf8';
              return (
                <div key={idx} style={{ fontSize: '12px', color, lineHeight: 1.45, wordBreak: 'break-word', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace' }}>
                  <span style={{ color: '#666', marginRight: '4px' }}>$</span> {log}
                </div>
              );
            })}
            <div ref={logsEndRef} />
          </div>
        </div>
      )}
    </div>
  );
};

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
    syncingGithub,
    syncGithub,
    selectedJobs, setSelectedJobs,
    batchProgress, setBatchProgress,
    batchState, setBatchState,
    activeJobs,
    paginatedJobs,
    currentPage, setCurrentPage,
    totalPages,
    itemsPerPage, setItemsPerPage,
    theme, setTheme,
    notify,
    loadJobs,
    loadProfile,
    toggleSelectJob,
    logout,
    handleDelete,
    handleBatchDelete,
    updateStatus,
    handleBatchSend,
    handleProfileSave,
    handleResumeUpload,
    handleFetchJobs,
    addFetchQuery,
    removeFetchQuery,
    sourceFilter, setSourceFilter,
    experienceFilter, setExperienceFilter,
    locationFilter, setLocationFilter,
    selectedLocations = ['All India'], setSelectedLocations,
    toggleLocation, removeLocation, addCustomLocation,
    customLocation, setCustomLocation,
    handlePurgeSeniorJobs,
    getJobLevel,
    isSeniorJob,
    extractPackage,
    extractWorkMode,
    parseRoleDisplay,
    appliedViewType, setAppliedViewType,
    exportToCSV,
    useApify, setUseApify
  } = props;

  const [activeReplyIndex, setActiveReplyIndex] = React.useState(null);
  const [draftOptions, setDraftOptions] = React.useState([]);
  const [selectedDraft, setSelectedDraft] = React.useState('');
  const [sendingReply, setSendingReply] = React.useState(false);
  const [inboxCategoryFilter, setInboxCategoryFilter] = React.useState('All');
  const [inboxSearch, setInboxSearch] = React.useState('');
  const [draftingIntent, setDraftingIntent] = React.useState(null);
  const [updatingJobStatus, setUpdatingJobStatus] = React.useState(false);
  const [hrFilter, setHrFilter] = React.useState('all');
  const [hrQuery, setHrQuery] = React.useState('');
  const [hrLocation, setHrLocation] = React.useState(() => locationFilter || 'All India');
  const [customHrLocation, setCustomHrLocation] = React.useState('');
  const [hrLocations, setHrLocations] = React.useState(() => {
    try {
      const saved = localStorage.getItem('hr_selected_locations');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          const valid = parsed.filter(l => typeof l === 'string' && l.trim().length > 1);
          if (valid.length > 0) return valid;
        }
      }
    } catch (_) {}
    return ['All India'];
  });
  const [showHrLocationPicker, setShowHrLocationPicker] = React.useState(false);
  const [newCustomHrLoc, setNewCustomHrLoc] = React.useState('');
  const hrLocationPickerRef = React.useRef(null);

  const toggleHrLocation = (loc) => {
    setHrLocations(prev => {
      let next;
      if (loc === 'All India') {
        next = ['All India'];
      } else {
        const withoutAll = prev.filter(l => l !== 'All India');
        if (withoutAll.includes(loc)) {
          next = withoutAll.filter(l => l !== loc);
          if (next.length === 0) next = ['All India'];
        } else {
          next = [...withoutAll, loc];
        }
      }
      try { localStorage.setItem('hr_selected_locations', JSON.stringify(next)); } catch (_) {}
      return next;
    });
  };

  const removeHrLocation = (loc) => {
    setHrLocations(prev => {
      const next = prev.filter(l => l !== loc);
      const res = next.length === 0 ? ['All India'] : next;
      try { localStorage.setItem('hr_selected_locations', JSON.stringify(res)); } catch (_) {}
      return res;
    });
  };

  const addCustomHrLocation = (customLoc) => {
    const trimmed = (customLoc || '').trim();
    if (!trimmed || trimmed.length < 2) return;
    setHrLocations(prev => {
      const withoutAll = prev.filter(l => l !== 'All India');
      if (withoutAll.some(l => l.toLowerCase() === trimmed.toLowerCase())) return withoutAll;
      const next = [...withoutAll, trimmed];
      try { localStorage.setItem('hr_selected_locations', JSON.stringify(next)); } catch (_) {}
      return next;
    });
  };

  const [showLocationPicker, setShowLocationPicker] = React.useState(false);
  const [newCustomLoc, setNewCustomLoc] = React.useState('');
  const locationPickerRef = React.useRef(null);

  React.useEffect(() => {
    const handleClickOutside = (event) => {
      if (locationPickerRef.current && !locationPickerRef.current.contains(event.target)) {
        setShowLocationPicker(false);
      }
      if (hrLocationPickerRef.current && !hrLocationPickerRef.current.contains(event.target)) {
        setShowHrLocationPicker(false);
      }
    };
    if (showLocationPicker || showHrLocationPicker) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showLocationPicker, showHrLocationPicker]);

  const [copyingNoteId, setCopyingNoteId] = React.useState(null);
  const [discoveringHrId, setDiscoveringHrId] = React.useState(null);
  const [copiedEmailJobId, setCopiedEmailJobId] = React.useState(null);
  const [editingEmailId, setEditingEmailId] = React.useState(null);
  const [connectedJobIds, setConnectedJobIds] = React.useState([]);

  // Follow-Up Tab Filter & Search States
  const [followUpStatus, setFollowUpStatus] = React.useState('pending');
  const [followUpDay, setFollowUpDay] = React.useState('all');
  const [followUpSearch, setFollowUpSearch] = React.useState('');
  const [followUpLimit, setFollowUpLimit] = React.useState(50);

  // Separate thread linking & Gmail Scan states
  const [inboxGmailQuery, setInboxGmailQuery] = React.useState('');
  const [showLinkModal, setShowLinkModal] = React.useState(false);
  const [linkingJobId, setLinkingJobId] = React.useState('');
  const [linkingSearch, setLinkingSearch] = React.useState('');
  const [linkingLoading, setLinkingLoading] = React.useState(false);
  const [isCreatingNewJob, setIsCreatingNewJob] = React.useState(false);
  const [newJobCompany, setNewJobCompany] = React.useState('');
  const [newJobRole, setNewJobRole] = React.useState('');

  // Auto-clean selectedDraft if raw markdown asterisks or bullet markdown exist
  React.useEffect(() => {
    if (selectedDraft && (selectedDraft.includes('**') || selectedDraft.includes('__') || /(?:^|\n)\s*[*+-]\s+/m.test(selectedDraft))) {
      setSelectedDraft(prev => cleanDraftText(prev, props.profile));
    }
  }, [selectedDraft, props.profile]);

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

  const handleDraftWithIntent = async (intent = 'general', customInstructions = '') => {
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
          intent,
          customInstructions
        })
      });
      const data = await res.json();
      if (data.drafts && data.drafts.length > 0) {
        const cleaned = data.drafts.map(d => cleanDraftText(d, props.profile));
        setDraftOptions(cleaned);
        setSelectedDraft(cleaned[0]);
        notify(`✨ Generated ${cleaned.length} AI reply options!`, 'success');
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
      const targetLabel = job.hrName ? `${job.hrName} at ${job.company}` : (job.company || 'company');
      notify(`🔍 Scanning web & pattern databases for ${targetLabel}...`, 'info');
      const effectiveLoc = job.location || (locationFilter === 'Custom' ? customLocation : locationFilter) || 'India';
      const res = await props.apiFetch(`${API_BASE}/api/discover-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company: job.company,
          jd: job.jd,
          hrName: job.hrName,
          hrLinkedInUrl: job.hrLinkedIn,
          applyLink: job.applyLink,
          location: effectiveLoc,
          failedEmails: job.failedEmails || []
        })
      });
      const data = await res.json();
      if (data && data.email) {
        const updatePayload = {
          emailRecipient: data.email,
          deliverabilityScore: data.deliverabilityScore || 85,
          deliverabilityStatus: data.deliverabilityStatus || 'deliverable',
          deliverabilityReason: data.deliverabilityReason || 'Verified deliverable mailbox'
        };
        if (data.hrName && !job.hrName) updatePayload.hrName = data.hrName;
        if (data.hrLinkedIn && !job.hrLinkedIn) updatePayload.hrLinkedIn = data.hrLinkedIn;

        await props.apiFetch(`${API_BASE}/api/jobs/${job.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updatePayload)
        }).catch(() => { });

        setJobs(prev => prev.map(j => j.id === job.id ? {
          ...j,
          ...updatePayload
        } : j));
        notify(`🎉 Found & verified email: ${data.email}!`, 'success');
      } else {
        // Update job list immediately in DB and UI when email is not found
        const reason = data?.deliverabilityReason || 'No verified recipient mailbox found';
        const updatePayload = {
          emailRecipient: '',
          deliverabilityScore: 0,
          deliverabilityStatus: 'undeliverable',
          deliverabilityReason: reason
        };
        if (data?.hrName && !job.hrName) updatePayload.hrName = data.hrName;
        if (data?.hrLinkedIn && !job.hrLinkedIn) updatePayload.hrLinkedIn = data.hrLinkedIn;

        await props.apiFetch(`${API_BASE}/api/jobs/${job.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updatePayload)
        }).catch(() => { });

        setJobs(prev => prev.map(j => j.id === job.id ? {
          ...j,
          ...updatePayload
        } : j));
        notify(`No verified mailbox found for ${targetLabel}. Job list updated!`, 'warning');
      }
    } catch (err) {
      notify('Email discovery scan failed', 'error');
    } finally {
      setDiscoveringHrId(null);
    }
  };

  const formatTableDate = (rawDate) => {
    if (!rawDate) return { date: '—', time: '', isRecent: false };
    const d = new Date(rawDate);
    if (isNaN(d.getTime())) return { date: '—', time: '', isRecent: false };
    const now = new Date();
    // Guard against slight future timezone offsets (within 24h) and same day
    const isFutureOffset = d.getTime() > now.getTime() && (d.getTime() - now.getTime()) < 86400000;
    const isToday = d.toDateString() === now.toDateString() || isFutureOffset;
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const isYesterday = d.toDateString() === yesterday.toDateString();
    const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (isToday) return { date: 'Today', time: timeStr, isRecent: true };
    if (isYesterday) return { date: 'Yesterday', time: timeStr, isRecent: true };
    return {
      date: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined }),
      time: timeStr,
      isRecent: false
    };
  };

  return (
    <div className="dashboard-container">
      {/* Batch Progress Modal */}
      <DraggableTerminal batchState={batchState} cancelBatch={props.cancelBatch} />

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
          <div className="header-actions" style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'nowrap' }}>
            {(tab === 'applications' || tab === 'applied') && (
              <>
                {/* Search Bar */}
                <div className="search-wrapper" style={{ minWidth: '180px', maxWidth: '240px' }}>
                  <span className="search-icon">🔍</span>
                  <input
                    type="text"
                    className="search-input"
                    placeholder="Search company or role..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                  {search && (
                    <button
                      onClick={() => setSearch('')}
                      style={{ background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', padding: '0 6px', fontSize: '12px' }}
                      title="Clear search"
                    >
                      ✕
                    </button>
                  )}
                </div>

                {/* Job Portal / Source Filter */}
                <select
                  className="form-input"
                  style={{
                    width: 'auto',
                    padding: '7px 12px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '13px',
                    fontWeight: 500,
                    color: 'var(--text-1)',
                    background: sourceFilter !== 'All' ? 'var(--surface-3)' : 'var(--surface-2)',
                    borderColor: sourceFilter !== 'All' ? 'var(--accent)' : 'var(--border)'
                  }}
                  value={sourceFilter}
                  onChange={(e) => setSourceFilter(e.target.value)}
                  title="Filter by Job Portal"
                >
                  <option value="All" style={{ background: 'var(--surface-2)', color: 'var(--text-1)' }}>🌐 All Portals</option>
                  <option value="LinkedIn" style={{ background: 'var(--surface-2)', color: 'var(--text-1)' }}>💼 LinkedIn</option>
                  <option value="Indeed" style={{ background: 'var(--surface-2)', color: 'var(--text-1)' }}>🔍 Indeed</option>
                  <option value="Naukri" style={{ background: 'var(--surface-2)', color: 'var(--text-1)' }}>⚡ Naukri</option>
                  <option value="Adzuna" style={{ background: 'var(--surface-2)', color: 'var(--text-1)' }}>🎯 Adzuna</option>
                  <option value="Other" style={{ background: 'var(--surface-2)', color: 'var(--text-1)' }}>📝 Other / Direct</option>
                </select>

                {/* Purge Ineligible Senior Roles Button */}
                {tab === 'applications' && jobs.some(j => isSeniorJob(j.role, j.jd)) && (
                  <button
                    className="btn btn-ghost"
                    onClick={handlePurgeSeniorJobs}
                    style={{
                      fontSize: '12px',
                      padding: '6px 12px',
                      color: 'var(--error, #ef4444)',
                      borderColor: 'rgba(239, 68, 68, 0.35)',
                      background: 'rgba(239, 68, 68, 0.08)',
                      borderRadius: '8px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px'
                    }}
                    title="Remove all Senior and Lead roles from your search list"
                  >
                    🧹 Purge Senior Roles
                  </button>
                )}

                {/* Status Filter (Only in Applied Jobs) */}
                {tab === 'applied' && (
                  <select
                    className="form-input"
                    style={{
                      width: 'auto',
                      padding: '7px 12px',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontSize: '13px',
                      fontWeight: 500,
                      color: 'var(--text-1)',
                      background: statusFilter !== 'All' ? 'var(--surface-3)' : 'var(--surface-2)',
                      borderColor: statusFilter !== 'All' ? 'var(--accent)' : 'var(--border)'
                    }}
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    title="Filter by Status"
                  >
                    <option value="All" style={{ background: 'var(--surface-2)', color: 'var(--text-1)' }}>📊 All Statuses</option>
                    <option value="Sent" style={{ background: 'var(--surface-2)', color: 'var(--text-1)' }}>🟢 Email Sent</option>
                    <option value="Opened" style={{ background: 'var(--surface-2)', color: 'var(--text-1)' }}>📬 Email Opened</option>
                    <option value="Replied" style={{ background: 'var(--surface-2)', color: 'var(--text-1)' }}>💬 Email Replied</option>
                    <option value="Bounced" style={{ background: 'var(--surface-2)', color: 'var(--text-1)' }}>🔴 Email Bounced</option>
                    <option value="LinkedIn_Sent" style={{ background: 'var(--surface-2)', color: 'var(--text-1)' }}>💼 LinkedIn Invite Sent</option>
                    <option value="LinkedIn_Connected" style={{ background: 'var(--surface-2)', color: 'var(--text-1)' }}>🤝 LinkedIn Connected</option>
                    <option value="LinkedIn_Replied" style={{ background: 'var(--surface-2)', color: 'var(--text-1)' }}>💬 LinkedIn Replied</option>
                  </select>
                )}

                {/* Applied Jobs View Segment (All / Jobs / HR) */}
                {tab === 'applied' && (
                  <div style={{ display: 'flex', background: 'var(--surface-3)', borderRadius: '10px', padding: '3px', gap: '3px', border: '1px solid var(--border)' }}>
                    {['All', 'Jobs', 'HR'].map(type => (
                      <button
                        key={type}
                        onClick={() => setAppliedViewType(type)}
                        style={{
                          padding: '4px 12px',
                          borderRadius: '7px',
                          border: 'none',
                          background: appliedViewType === type ? 'var(--accent)' : 'transparent',
                          color: appliedViewType === type ? '#fff' : 'var(--text-2)',
                          fontSize: '12px',
                          fontWeight: appliedViewType === type ? '600' : '500',
                          cursor: 'pointer',
                          transition: 'all 0.2s'
                        }}
                      >
                        {type === 'All' ? 'All' : type === 'Jobs' ? '💼 Jobs' : '👤 HR Leads'}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}

            <div style={{ width: '1px', height: '22px', background: 'var(--border)', margin: '0 2px' }} />

            {/* Theme Toggle */}
            <button
              className="btn btn-ghost theme-toggle"
              style={{ padding: '7px 10px', borderRadius: '8px', minWidth: '36px' }}
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              title="Toggle Theme"
            >
              {theme === 'dark' ? '☀️' : '🌙'}
            </button>

            {/* Logout Button */}
            <button
              className="btn"
              style={{
                fontSize: '12px',
                padding: '7px 14px',
                borderRadius: '8px',
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                color: '#ef4444',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                cursor: 'pointer'
              }}
              onClick={logout}
              title="Sign Out"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                <polyline points="16 17 21 12 16 7"></polyline>
                <line x1="21" y1="12" x2="9" y2="12"></line>
              </svg>
              Logout
            </button>
          </div>
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
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--surface-1)', overflow: 'hidden' }}>

              {/* Inbox Header */}
              <div style={{
                padding: '16px 24px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderBottom: '1px solid var(--border)',
                background: 'var(--surface-2)',
                gap: '16px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  {activeReplyIndex !== null && (
                    <button
                      className="btn btn-ghost"
                      onClick={() => {
                        setActiveReplyIndex(null);
                        setDraftOptions([]);
                        setSelectedDraft('');
                      }}
                      style={{ padding: '8px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}
                      title="Back to replies"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
                      <span>Inbox</span>
                    </button>
                  )}
                  <div>
                    <h2 style={{ fontSize: '18px', fontWeight: 600, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                      Smart Inbox
                      <span style={{
                        fontSize: '11px',
                        padding: '2px 8px',
                        borderRadius: '100px',
                        background: 'rgba(59, 130, 246, 0.15)',
                        color: 'var(--blue, #3b82f6)',
                        border: '1px solid rgba(59, 130, 246, 0.25)',
                        fontWeight: 600
                      }}>AI Powered</span>
                    </h2>
                    {activeReplyIndex === null && (
                      <div style={{ fontSize: '12px', color: 'var(--text-3)', marginTop: '2px' }}>
                        {props.inboxReplies?.length || 0} recruiter conversations detected & classified
                      </div>
                    )}
                  </div>
                </div>

                {activeReplyIndex === null && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                    {/* Deep Scan Gmail Input */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <div style={{ position: 'relative', width: '240px' }}>
                        <input
                          type="text"
                          placeholder="Scan Gmail by recruiter/company..."
                          value={inboxGmailQuery}
                          onChange={(e) => setInboxGmailQuery(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              props.fetchInbox(inboxGmailQuery);
                            }
                          }}
                          className="input"
                          style={{
                            paddingLeft: '30px',
                            paddingRight: inboxGmailQuery ? '24px' : '8px',
                            height: '34px',
                            fontSize: '12px',
                            borderRadius: '8px',
                            background: 'var(--surface-1)',
                            border: '1px solid var(--border)'
                          }}
                        />
                        <span style={{ position: 'absolute', left: '9px', top: '8px', fontSize: '13px' }}>🔍</span>
                        {inboxGmailQuery && (
                          <button
                            onClick={() => {
                              setInboxGmailQuery('');
                              props.fetchInbox('');
                            }}
                            style={{ position: 'absolute', right: '6px', top: '7px', background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', fontSize: '12px', padding: '0 2px' }}
                          >✕</button>
                        )}
                      </div>
                      <button
                        className="btn btn-primary"
                        onClick={() => props.fetchInbox(inboxGmailQuery)}
                        disabled={props.inboxLoading}
                        style={{ height: '34px', padding: '0 12px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '5px' }}
                        title="Search Gmail directly for recruiter emails"
                      >
                        {props.inboxLoading ? <span className="spinner" style={{ width: '12px', height: '12px' }}></span> : <span>Scan</span>}
                      </button>
                    </div>

                    {/* Local Filter Search Input */}
                    <div style={{ position: 'relative', width: '220px' }}>
                      <input
                        type="text"
                        placeholder="Filter inbox list..."
                        value={inboxSearch}
                        onChange={(e) => setInboxSearch(e.target.value)}
                        className="input"
                        style={{
                          paddingLeft: '32px',
                          paddingRight: inboxSearch ? '24px' : '10px',
                          height: '34px',
                          fontSize: '12px',
                          width: '100%',
                          borderRadius: '8px',
                          background: 'var(--surface-1)',
                          border: '1px solid var(--border)'
                        }}
                      />
                      <svg style={{ position: 'absolute', left: '9px', top: '9px', color: 'var(--text-3)' }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
                      {inboxSearch && (
                        <button
                          onClick={() => setInboxSearch('')}
                          style={{ position: 'absolute', right: '6px', top: '7px', background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', fontSize: '12px', padding: '0 2px' }}
                        >✕</button>
                      )}
                    </div>

                    <button
                      className="btn btn-ghost"
                      onClick={() => props.fetchInbox('')}
                      disabled={props.inboxLoading}
                      style={{ height: '34px', padding: '0 12px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', background: 'var(--surface-1)', border: '1px solid var(--border)' }}
                      title="Refresh & sync all recent recruiter replies"
                    >
                      {props.inboxLoading ? <span className="spinner" style={{ width: '12px', height: '12px' }}></span> : <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /></svg>}
                      <span>{props.inboxLoading ? 'Syncing...' : 'Sync All'}</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Category Filter Pills (when in list view) */}
              {activeReplyIndex === null && (
                <div style={{
                  padding: '10px 24px',
                  display: 'flex',
                  gap: '8px',
                  borderBottom: '1px solid var(--border)',
                  background: 'var(--surface-1)',
                  overflowX: 'auto'
                }}>
                  {[
                    { key: 'All', label: 'All Replies', count: categoryCounts.All },
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
                          gap: '6px',
                          padding: '6px 14px',
                          borderRadius: '20px',
                          fontSize: '12px',
                          fontWeight: isSelected ? 600 : 500,
                          cursor: 'pointer',
                          border: isSelected ? `1px solid ${tabItem.highlight || 'var(--accent)'}` : '1px solid var(--border)',
                          background: isSelected ? (tabItem.highlight ? `${tabItem.highlight}20` : 'var(--accent-bg, rgba(211,74,54,0.15))') : 'var(--surface-2)',
                          color: isSelected ? (tabItem.highlight || 'var(--text-1)') : 'var(--text-2)',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        <span>{tabItem.label}</span>
                        <span style={{
                          fontSize: '11px',
                          padding: '1px 6px',
                          borderRadius: '10px',
                          background: isSelected ? (tabItem.highlight ? `${tabItem.highlight}30` : 'rgba(255,255,255,0.15)') : 'var(--surface-3)',
                          color: isSelected ? (tabItem.highlight || '#ffffff') : 'var(--text-3)'
                        }}>{tabItem.count}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Content Area */}
              <div style={{ flex: 1, overflowY: 'auto' }}>
                {props.inboxLoading && (!props.inboxReplies || props.inboxReplies.length === 0) ? (
                  <div style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--text-3)' }}>
                    <div className="spinner" style={{ margin: '0 auto 16px', width: '28px', height: '28px' }}></div>
                    <div style={{ fontSize: '15px', fontWeight: 500, color: 'var(--text-1)' }}>Syncing with Gmail...</div>
                    <div style={{ fontSize: '13px', marginTop: '4px' }}>Detecting incoming replies and matching them to your applications.</div>
                  </div>
                ) : props.inboxReplies && props.inboxReplies.length > 0 ? (

                  activeReplyIndex !== null && currentReply ? (
                    /* --- Enhanced Detail View --- */
                    <div style={{ padding: '24px 32px', maxWidth: '960px', margin: '0 auto' }}>

                      {/* Top Header Card */}
                      <div style={{
                        background: 'var(--surface-2)',
                        border: '1px solid var(--border)',
                        borderRadius: '12px',
                        padding: '20px 24px',
                        marginBottom: '20px'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', marginBottom: '14px' }}>
                          <h1 style={{ fontSize: '20px', fontWeight: 600, color: 'var(--text-1)', margin: 0, lineHeight: 1.3 }}>
                            {currentReply.subject}
                          </h1>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
                            {/* Open Exact Mail in Gmail Link */}
                            <a
                              href={currentReply.threadId ? `https://mail.google.com/mail/u/0/#all/${currentReply.threadId}` : (currentReply.messageId ? `https://mail.google.com/mail/u/0/#all/${currentReply.messageId}` : 'https://mail.google.com')}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="btn btn-secondary"
                              style={{
                                padding: '6px 12px',
                                fontSize: '12px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                textDecoration: 'none',
                                color: 'var(--text-1)',
                                background: 'var(--surface-3)',
                                border: '1px solid var(--border)',
                                borderRadius: '100px',
                                fontWeight: 500
                              }}
                              title="Open exact email thread in Gmail (new tab)"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                                <polyline points="15 3 21 3 21 9"></polyline>
                                <line x1="10" y1="14" x2="21" y2="3"></line>
                              </svg>
                              <span>Open in Gmail</span>
                            </a>

                            {/* Category Badge */}
                            {(() => {
                              const catStyle = CATEGORY_MAP[currentReply.categoryInfo?.category] || CATEGORY_MAP.General;
                              return (
                                <span style={{
                                  padding: '6px 12px',
                                  borderRadius: '100px',
                                  fontSize: '12px',
                                  fontWeight: 600,
                                  background: catStyle.bg,
                                  color: catStyle.color,
                                  border: `1px solid ${catStyle.border}`,
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '6px'
                                }}>
                                  <span>{catStyle.icon}</span>
                                  <span>{currentReply.categoryInfo?.label || catStyle.label}</span>
                                </span>
                              );
                            })()}
                          </div>
                        </div>

                        {/* Matched Job Link Banner & Status Sync */}
                        {currentReply.matchedJob ? (
                          <div style={{
                            padding: '12px 16px',
                            background: 'var(--surface-1)',
                            border: '1px solid var(--border)',
                            borderRadius: '8px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            flexWrap: 'wrap',
                            gap: '12px'
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <span style={{ fontSize: '18px' }}>🏢</span>
                              <div>
                                <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-1)' }}>
                                  {currentReply.matchedJob.company} — <span style={{ fontWeight: 400, color: 'var(--text-2)' }}>{currentReply.matchedJob.role}</span>
                                </div>
                                <div style={{ fontSize: '12px', color: 'var(--text-3)' }}>
                                  Application matched via company email domain or name
                                </div>
                              </div>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                              <span style={{ fontSize: '12px', color: 'var(--text-3)' }}>Status:</span>
                              <select
                                className="input"
                                value={currentReply.matchedJob.status || 'Replied'}
                                disabled={updatingJobStatus}
                                onChange={(e) => handleUpdateJobStatus(currentReply.matchedJob.id, e.target.value)}
                                style={{
                                  fontSize: '12px',
                                  padding: '4px 8px',
                                  borderRadius: '6px',
                                  height: '30px',
                                  background: 'var(--surface-2)',
                                  border: '1px solid var(--border)',
                                  color: 'var(--text-1)',
                                  fontWeight: 600,
                                  cursor: 'pointer'
                                }}
                              >
                                <option value="Replied">📩 Replied</option>
                                <option value="Interview Scheduled">🎉 Interview Scheduled</option>
                                <option value="Assessment Taken">📝 Assessment Taken</option>
                                <option value="Offer Received">💼 Offer Received</option>
                                <option value="Rejected">❌ Not Moving Forward</option>
                              </select>

                              <button
                                className="btn btn-ghost"
                                onClick={openLinkModal}
                                style={{ fontSize: '11px', padding: '4px 10px', height: '30px', display: 'flex', alignItems: 'center', gap: '4px', border: '1px solid var(--border)' }}
                                title="Link this email thread to a different application"
                              >
                                <span>🔗</span>
                                <span>Change Link</span>
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div style={{
                            padding: '14px 18px',
                            background: 'rgba(234, 179, 8, 0.08)',
                            border: '1px solid rgba(234, 179, 8, 0.25)',
                            borderRadius: '8px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '14px',
                            flexWrap: 'wrap'
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <span style={{ fontSize: '20px' }}>⚠️</span>
                              <div>
                                <div style={{ fontSize: '13px', fontWeight: 600, color: '#facc15', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <span>Separate Recruiter Thread</span>
                                  <span style={{ fontSize: '11px', fontWeight: 400, color: 'var(--text-3)' }}>• Not linked to an application yet</span>
                                </div>
                                <div style={{ fontSize: '12px', color: 'var(--text-3)', marginTop: '2px' }}>
                                  From: <strong style={{ color: 'var(--text-2)' }}>{currentReply.from}</strong> • {new Date(currentReply.date).toLocaleString()}
                                </div>
                              </div>
                            </div>

                            <button
                              className="btn btn-primary"
                              onClick={openLinkModal}
                              style={{ fontSize: '12px', padding: '6px 14px', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}
                            >
                              <span>🔗</span>
                              <span>Link to Job Application</span>
                            </button>
                          </div>
                        )}
                      </div>

                      {/* AI Reply Copilot Command Bar */}
                      {!(currentReply.threadMessages && currentReply.threadMessages.length > 0 && currentReply.threadMessages[currentReply.threadMessages.length - 1].isMe) && (
                        <div style={{
                          background: 'linear-gradient(135deg, rgba(211, 74, 54, 0.08) 0%, rgba(59, 130, 246, 0.08) 100%)',
                          border: '1px solid rgba(211, 74, 54, 0.25)',
                          borderRadius: '12px',
                          padding: '18px 22px',
                          marginBottom: '24px'
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{ fontSize: '18px' }}>✨</span>
                              <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-1)' }}>AI Reply Copilot</span>
                              <span style={{ fontSize: '12px', color: 'var(--text-3)' }}>— Choose an intent to draft instant responses tailored to your profile:</span>
                            </div>
                          </div>

                          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                            <button
                              className="btn"
                              disabled={draftingIntent !== null}
                              onClick={() => handleDraftWithIntent('interview_accept')}
                              style={{
                                padding: '8px 14px',
                                fontSize: '12px',
                                fontWeight: 600,
                                borderRadius: '8px',
                                background: 'rgba(16, 185, 129, 0.15)',
                                color: '#10b981',
                                border: '1px solid rgba(16, 185, 129, 0.35)',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px'
                              }}
                            >
                              {draftingIntent === 'interview_accept' ? <span className="spinner"></span> : <span>🎉</span>}
                              <span>Accept & Propose Availability</span>
                            </button>

                            <button
                              className="btn"
                              disabled={draftingIntent !== null}
                              onClick={() => handleDraftWithIntent('info_confirm')}
                              style={{
                                padding: '8px 14px',
                                fontSize: '12px',
                                fontWeight: 600,
                                borderRadius: '8px',
                                background: 'rgba(168, 85, 247, 0.15)',
                                color: '#c084fc',
                                border: '1px solid rgba(168, 85, 247, 0.35)',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px'
                              }}
                            >
                              {draftingIntent === 'info_confirm' ? <span className="spinner"></span> : <span>📋</span>}
                              <span>Confirm Notice & Salary</span>
                            </button>

                            <button
                              className="btn"
                              disabled={draftingIntent !== null}
                              onClick={() => handleDraftWithIntent('polite_inquiry')}
                              style={{
                                padding: '8px 14px',
                                fontSize: '12px',
                                fontWeight: 600,
                                borderRadius: '8px',
                                background: 'rgba(59, 130, 246, 0.15)',
                                color: '#60a5fa',
                                border: '1px solid rgba(59, 130, 246, 0.35)',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px'
                              }}
                            >
                              {draftingIntent === 'polite_inquiry' ? <span className="spinner"></span> : <span>💬</span>}
                              <span>Inquire About Tech Stack</span>
                            </button>

                            <button
                              className="btn"
                              disabled={draftingIntent !== null}
                              onClick={() => handleDraftWithIntent('general')}
                              style={{
                                padding: '8px 14px',
                                fontSize: '12px',
                                fontWeight: 600,
                                borderRadius: '8px',
                                background: 'var(--surface-2)',
                                color: 'var(--text-1)',
                                border: '1px solid var(--border)',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px'
                              }}
                            >
                              {draftingIntent === 'general' ? <span className="spinner"></span> : <span>✍️</span>}
                              <span>General Response</span>
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Thread Messages */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        {currentReply.threadMessages && currentReply.threadMessages.length > 0 ? (
                          currentReply.threadMessages.map((tMsg, idx) => (
                            <div key={idx} style={{
                              padding: '18px 20px',
                              borderRadius: '10px',
                              background: tMsg.isMe ? 'var(--surface-2)' : 'var(--surface-1)',
                              border: tMsg.isMe ? '1px solid rgba(59, 130, 246, 0.3)' : '1px solid var(--border)',
                              marginLeft: tMsg.isMe ? '48px' : '0',
                              marginRight: tMsg.isMe ? '0' : '48px',
                              boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                            }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '8px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <div style={{
                                    width: '26px',
                                    height: '26px',
                                    borderRadius: '50%',
                                    background: tMsg.isMe ? 'var(--blue, #3b82f6)' : 'var(--accent, #d34a36)',
                                    color: '#ffffff',
                                    fontSize: '11px',
                                    fontWeight: 700,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                  }}>
                                    {tMsg.isMe ? 'ME' : 'HR'}
                                  </div>
                                  <span style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-1)' }}>{tMsg.from}</span>
                                </div>
                                <span style={{ fontSize: '12px', color: 'var(--text-3)' }}>{tMsg.date}</span>
                              </div>
                              <EmailMessageBody text={tMsg.body} quotedText={tMsg.quotedText} />
                            </div>
                          ))
                        ) : (
                          <div style={{
                            padding: '20px 24px',
                            borderRadius: '10px',
                            background: 'var(--surface-1)',
                            border: '1px solid var(--border)',
                            boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                          }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '8px' }}>
                              <span style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-1)' }}>{currentReply.from}</span>
                              <span style={{ fontSize: '12px', color: 'var(--text-3)' }}>{currentReply.date}</span>
                            </div>
                            <EmailMessageBody text={currentReply.body || currentReply.snippet} quotedText={currentReply.quotedText} />
                          </div>
                        )}
                      </div>

                      {/* AI Drafts Selection Modal */}
                      {draftOptions && draftOptions.length > 0 && (
                        <div style={{
                          position: 'fixed',
                          top: 0, left: 0, right: 0, bottom: 0,
                          backgroundColor: 'rgba(0,0,0,0.7)',
                          backdropFilter: 'blur(4px)',
                          zIndex: 9999,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          padding: '20px'
                        }}>
                          <div style={{
                            background: 'var(--surface-1)',
                            width: '820px',
                            maxWidth: '96%',
                            borderRadius: '14px',
                            padding: '28px',
                            boxShadow: '0 20px 50px rgba(0,0,0,0.6)',
                            border: '1px solid var(--border)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '20px'
                          }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <div>
                                <h3 style={{ fontSize: '18px', fontWeight: 600, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <span>✨ Review AI Draft Reply</span>
                                </h3>
                                <div style={{ fontSize: '12px', color: 'var(--text-3)', marginTop: '2px' }}>
                                  Select an angle, tweak if needed, and send directly via your connected Gmail.
                                </div>
                              </div>
                              <button className="btn btn-ghost" onClick={() => { setDraftOptions([]); setSelectedDraft(''); }} style={{ padding: '6px' }}>
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
                              </button>
                            </div>

                            {/* Option Switcher */}
                            <div style={{ display: 'flex', gap: '10px' }}>
                              {draftOptions.map((draft, idx) => {
                                const isSelected = selectedDraft === draft;
                                const titles = ['Option 1: Enthusiastic', 'Option 2: Direct & Pro', 'Option 3: Concise'];
                                return (
                                  <button
                                    key={idx}
                                    className="btn"
                                    style={{
                                      flex: 1,
                                      padding: '12px',
                                      fontSize: '13px',
                                      fontWeight: 600,
                                      textAlign: 'center',
                                      background: isSelected ? 'var(--accent, #d34a36)' : 'var(--surface-2)',
                                      color: isSelected ? '#ffffff' : 'var(--text-2)',
                                      border: isSelected ? '1px solid var(--accent, #d34a36)' : '1px solid var(--border)',
                                      borderRadius: '8px',
                                      transition: 'all 0.15s ease'
                                    }}
                                    onClick={() => setSelectedDraft(cleanDraftText(draft, props.profile))}
                                  >
                                    {titles[idx] || `Option ${idx + 1}`}
                                  </button>
                                );
                              })}
                            </div>

                            {/* Editable text */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                              <textarea
                                className="input"
                                style={{
                                  width: '100%',
                                  minHeight: '220px',
                                  padding: '16px',
                                  fontSize: '14px',
                                  lineHeight: '1.6',
                                  resize: 'vertical',
                                  background: 'var(--surface-2)',
                                  color: 'var(--text-1)',
                                  border: '1px solid var(--border)',
                                  borderRadius: '8px',
                                  fontFamily: 'inherit'
                                }}
                                value={selectedDraft}
                                onChange={(e) => setSelectedDraft(e.target.value)}
                              />
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ fontSize: '12px', color: 'var(--text-3)' }}>
                                  Will be sent as a reply to this thread from your Gmail account.
                                </div>
                                <div style={{ display: 'flex', gap: '10px' }}>
                                  <button className="btn btn-ghost" onClick={() => { setDraftOptions([]); setSelectedDraft(''); }}>
                                    Cancel
                                  </button>
                                  <button
                                    className="btn btn-primary"
                                    disabled={sendingReply || !selectedDraft.trim()}
                                    onClick={async () => {
                                      setSendingReply(true);
                                      try {
                                        const res = await fetch(`${API_BASE}/api/inbox/send-reply`, {
                                          method: 'POST',
                                          headers: {
                                            'Content-Type': 'application/json',
                                            'Authorization': `Bearer ${localStorage.getItem('token') || ''}`
                                          },
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
                                    style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                                  >
                                    {sendingReply ? <span className="spinner"></span> : <span>🚀</span>}
                                    <span>{sendingReply ? 'Sending...' : 'Send Reply via Gmail'}</span>
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    /* --- Enhanced List View --- */
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
                                display: 'flex',
                                alignItems: 'center',
                                padding: '14px 24px',
                                borderBottom: '1px solid var(--border)',
                                cursor: 'pointer',
                                background: 'var(--surface-1)',
                                transition: 'background 0.15s ease'
                              }}
                              onMouseEnter={(e) => e.currentTarget.style.background = 'var(--surface-2)'}
                              onMouseLeave={(e) => e.currentTarget.style.background = 'var(--surface-1)'}
                            >
                              {/* Category Badge Pill */}
                              <div style={{ width: '150px', flexShrink: 0, paddingRight: '12px' }}>
                                <span style={{
                                  fontSize: '11px',
                                  padding: '4px 8px',
                                  borderRadius: '6px',
                                  fontWeight: 600,
                                  background: catStyle.bg,
                                  color: catStyle.color,
                                  border: `1px solid ${catStyle.border}`,
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  whiteSpace: 'nowrap'
                                }}>
                                  <span>{catStyle.icon}</span>
                                  <span>{reply.categoryInfo?.label ? reply.categoryInfo.label.replace(/^[\p{Emoji}\s]+/u, '') : catStyle.label}</span>
                                </span>
                              </div>

                              {/* Sender & Matched Job Context */}
                              <div style={{ width: '220px', flexShrink: 0, paddingRight: '16px' }}>
                                <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  {fromClean}
                                </div>
                                {reply.matchedJob ? (
                                  <div style={{ fontSize: '11px', color: 'var(--text-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <span style={{ color: 'var(--blue, #3b82f6)', fontWeight: 600 }}>{reply.matchedJob.company}</span>
                                    <span>•</span>
                                    <span>{reply.matchedJob.role}</span>
                                  </div>
                                ) : (
                                  <div style={{ fontSize: '11px', color: 'var(--text-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <span style={{ fontSize: '9px', padding: '1px 5px', borderRadius: '3px', background: 'rgba(234, 179, 8, 0.15)', color: '#facc15', border: '1px solid rgba(234, 179, 8, 0.3)', fontWeight: 600 }}>Unlinked</span>
                                    <span>{reply.from.includes('<') ? reply.from.match(/<([^>]+)>/)?.[1] : reply.from}</span>
                                  </div>
                                )}
                              </div>

                              {/* Subject + Snippet Preview */}
                              <div style={{ flex: 1, display: 'flex', alignItems: 'center', minWidth: 0, paddingRight: '16px' }}>
                                <span style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-1)', marginRight: '8px', whiteSpace: 'nowrap', flexShrink: 0 }}>
                                  {reply.subject}
                                </span>
                                <span style={{ fontSize: '13px', color: 'var(--text-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>
                                  — {reply.snippet}
                                </span>
                              </div>

                              {/* Date & Open in Gmail Link */}
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0, justifyContent: 'flex-end', minWidth: '135px' }}>
                                <span style={{ fontSize: '12px', color: 'var(--text-3)', fontWeight: 500 }}>
                                  {new Date(reply.date).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                                </span>
                                <a
                                  href={reply.threadId ? `https://mail.google.com/mail/u/0/#all/${reply.threadId}` : (reply.messageId ? `https://mail.google.com/mail/u/0/#all/${reply.messageId}` : 'https://mail.google.com')}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="btn btn-ghost"
                                  style={{
                                    fontSize: '11px',
                                    padding: '3px 8px',
                                    borderRadius: '6px',
                                    color: 'var(--text-2)',
                                    border: '1px solid var(--border)',
                                    background: 'var(--surface-2)',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    textDecoration: 'none'
                                  }}
                                  title="Open exact email in Gmail (new tab)"
                                >
                                  <span>Open</span>
                                  <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                                    <polyline points="15 3 21 3 21 9"></polyline>
                                    <line x1="10" y1="14" x2="21" y2="3"></line>
                                  </svg>
                                </a>
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <div style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--text-3)' }}>
                          <div style={{ fontSize: '32px', marginBottom: '8px' }}>🔍</div>
                          <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-2)' }}>No matching replies found</div>
                          <div style={{ fontSize: '13px', marginTop: '4px' }}>Try switching category filters or clearing your search term.</div>
                          <button
                            className="btn btn-ghost"
                            onClick={() => { setInboxCategoryFilter('All'); setInboxSearch(''); }}
                            style={{ marginTop: '16px', fontSize: '12px', border: '1px solid var(--border)' }}
                          >
                            Reset Filters
                          </button>
                        </div>
                      )}
                    </div>
                  )
                ) : (
                  /* Empty state when 0 replies detected yet */
                  <div style={{ padding: '60px 24px', maxWidth: '600px', margin: '0 auto', textAlign: 'center' }}>
                    <div style={{
                      width: '64px',
                      height: '64px',
                      borderRadius: '16px',
                      background: 'rgba(59, 130, 246, 0.1)',
                      color: 'var(--blue, #3b82f6)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      margin: '0 auto 20px',
                      fontSize: '32px'
                    }}>
                      📬
                    </div>
                    <h3 style={{ fontSize: '18px', fontWeight: 600, margin: '0 0 8px 0', color: 'var(--text-1)' }}>
                      Smart Inbox is Monitoring
                    </h3>
                    <p style={{ fontSize: '13px', color: 'var(--text-3)', lineHeight: 1.6, margin: '0 0 24px 0' }}>
                      When recruiters and hiring managers reply to your automated email outreach, Smart Inbox will automatically detect them, link them to the application company, classify them (Interviews, Assessments, Inquiries), and prepare 1-click tailored responses.
                    </p>
                    <div style={{ display: 'flex', justifyContent: 'center', gap: '12px' }}>
                      <button
                        className="btn btn-primary"
                        onClick={props.fetchInbox}
                        disabled={props.inboxLoading}
                        style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', fontSize: '13px' }}
                      >
                        {props.inboxLoading ? <span className="spinner"></span> : <span>🔄</span>}
                        <span>Check For New Replies</span>
                      </button>
                    </div>
                  </div>
                )}
                {/* Link Recruiter Thread to Application Modal */}
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
                    padding: '20px'
                  }}>
                    <div style={{
                      background: 'var(--surface-2)',
                      border: '1px solid var(--border)',
                      borderRadius: '14px',
                      width: '560px',
                      maxWidth: '100%',
                      maxHeight: '90vh',
                      display: 'flex',
                      flexDirection: 'column',
                      boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
                      overflow: 'hidden'
                    }}>
                      {/* Modal Header */}
                      <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: 'var(--text-1)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span>🔗</span>
                            <span>Link Recruiter Email to Application</span>
                          </h3>
                          <div style={{ fontSize: '12px', color: 'var(--text-3)', marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '440px' }}>
                            From: <strong style={{ color: 'var(--text-2)' }}>{currentReply?.from}</strong>
                          </div>
                        </div>
                        <button
                          onClick={() => setShowLinkModal(false)}
                          className="btn btn-ghost"
                          style={{ padding: '4px 8px', fontSize: '16px', color: 'var(--text-3)' }}
                        >✕</button>
                      </div>

                      {/* Modal Body */}
                      <div style={{ padding: '20px 22px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        {/* Mode Toggle */}
                        <div style={{ display: 'flex', gap: '8px', background: 'var(--surface-1)', padding: '4px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                          <button
                            onClick={() => setIsCreatingNewJob(false)}
                            style={{
                              flex: 1,
                              padding: '6px 12px',
                              fontSize: '12px',
                              fontWeight: !isCreatingNewJob ? 600 : 500,
                              borderRadius: '6px',
                              border: 'none',
                              cursor: 'pointer',
                              background: !isCreatingNewJob ? 'var(--surface-2)' : 'transparent',
                              color: !isCreatingNewJob ? 'var(--text-1)' : 'var(--text-3)',
                              boxShadow: !isCreatingNewJob ? '0 1px 3px rgba(0,0,0,0.2)' : 'none'
                            }}
                          >
                            Select Existing Application
                          </button>
                          <button
                            onClick={() => setIsCreatingNewJob(true)}
                            style={{
                              flex: 1,
                              padding: '6px 12px',
                              fontSize: '12px',
                              fontWeight: isCreatingNewJob ? 600 : 500,
                              borderRadius: '6px',
                              border: 'none',
                              cursor: 'pointer',
                              background: isCreatingNewJob ? 'var(--surface-2)' : 'transparent',
                              color: isCreatingNewJob ? 'var(--text-1)' : 'var(--text-3)',
                              boxShadow: isCreatingNewJob ? '0 1px 3px rgba(0,0,0,0.2)' : 'none'
                            }}
                          >
                            Create & Link New Application
                          </button>
                        </div>

                        {!isCreatingNewJob ? (
                          <>
                            {/* Suggested Match Card if any */}
                            {(() => {
                              if (!props.jobs || props.jobs.length === 0) return null;
                              const subjWords = (currentReply?.subject || '').toLowerCase().split(/[\s-]+/);
                              const fromWord = (currentReply?.from || '').toLowerCase().split('@')[0];
                              const suggested = props.jobs.find(j => {
                                if (!j.company) return false;
                                const cLower = j.company.toLowerCase();
                                return subjWords.some(w => w.length >= 4 && cLower.includes(w)) || (fromWord.length >= 4 && cLower.includes(fromWord));
                              });

                              if (!suggested) return null;

                              return (
                                <div style={{
                                  padding: '12px 14px',
                                  borderRadius: '8px',
                                  background: 'rgba(59, 130, 246, 0.1)',
                                  border: '1px solid rgba(59, 130, 246, 0.3)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  gap: '12px'
                                }}>
                                  <div>
                                    <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--blue, #3b82f6)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                      ✨ AI Suggested Match
                                    </div>
                                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-1)', marginTop: '2px' }}>
                                      {suggested.company} — <span style={{ fontWeight: 400, color: 'var(--text-2)' }}>{suggested.role}</span>
                                    </div>
                                  </div>
                                  <button
                                    className="btn btn-primary"
                                    disabled={linkingLoading}
                                    onClick={() => handleLinkJob({ jobId: suggested.id })}
                                    style={{ fontSize: '12px', padding: '6px 12px', whiteSpace: 'nowrap' }}
                                  >
                                    Link This
                                  </button>
                                </div>
                              );
                            })()}

                            {/* Search Input for Jobs */}
                            <div>
                              <label style={{ fontSize: '12px', color: 'var(--text-2)', marginBottom: '6px', display: 'block', fontWeight: 500 }}>
                                Choose application from your list:
                              </label>
                              <div style={{ position: 'relative', marginBottom: '10px' }}>
                                <input
                                  type="text"
                                  placeholder="Type to filter company or role..."
                                  value={linkingSearch}
                                  onChange={(e) => setLinkingSearch(e.target.value)}
                                  className="input"
                                  style={{
                                    paddingLeft: '32px',
                                    height: '36px',
                                    fontSize: '13px',
                                    width: '100%',
                                    borderRadius: '8px',
                                    background: 'var(--surface-1)',
                                    border: '1px solid var(--border)'
                                  }}
                                />
                                <span style={{ position: 'absolute', left: '10px', top: '9px', fontSize: '14px' }}>🔍</span>
                              </div>

                              {/* Scrollable Jobs List */}
                              <div style={{
                                maxHeight: '220px',
                                overflowY: 'auto',
                                border: '1px solid var(--border)',
                                borderRadius: '8px',
                                background: 'var(--surface-1)'
                              }}>
                                {(props.jobs || [])
                                  .filter(j => {
                                    if (!linkingSearch.trim()) return true;
                                    const q = linkingSearch.toLowerCase().trim();
                                    return (j.company || '').toLowerCase().includes(q) || (j.role || '').toLowerCase().includes(q);
                                  })
                                  .slice(0, 50)
                                  .map(j => {
                                    const isSelected = linkingJobId === j.id;
                                    return (
                                      <div
                                        key={j.id}
                                        onClick={() => setLinkingJobId(j.id)}
                                        style={{
                                          padding: '10px 14px',
                                          borderBottom: '1px solid var(--border)',
                                          display: 'flex',
                                          alignItems: 'center',
                                          justifyContent: 'space-between',
                                          cursor: 'pointer',
                                          background: isSelected ? 'rgba(59, 130, 246, 0.15)' : 'transparent',
                                          transition: 'background 0.1s ease'
                                        }}
                                      >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                                          <input
                                            type="radio"
                                            name="selectedJobRadio"
                                            checked={isSelected}
                                            onChange={() => setLinkingJobId(j.id)}
                                            style={{ cursor: 'pointer' }}
                                          />
                                          <div style={{ minWidth: 0 }}>
                                            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                              {j.company}
                                            </div>
                                            <div style={{ fontSize: '11px', color: 'var(--text-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                              {j.role} • {j.emailRecipient || 'No recipient stored'}
                                            </div>
                                          </div>
                                        </div>
                                        <span style={{
                                          fontSize: '10px',
                                          padding: '2px 6px',
                                          borderRadius: '4px',
                                          background: 'var(--surface-2)',
                                          color: 'var(--text-2)',
                                          border: '1px solid var(--border)',
                                          flexShrink: 0
                                        }}>
                                          {j.status}
                                        </span>
                                      </div>
                                    );
                                  })}
                              </div>
                            </div>
                          </>
                        ) : (
                          /* Create New Application Form */
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            <div style={{ fontSize: '12px', color: 'var(--text-3)', lineHeight: 1.4 }}>
                              Applied directly on a company career site or ATS portal? Add it here to track this email thread and enable AI reply drafting.
                            </div>

                            <div>
                              <label style={{ fontSize: '12px', color: 'var(--text-2)', marginBottom: '4px', display: 'block', fontWeight: 500 }}>
                                Company Name *
                              </label>
                              <input
                                type="text"
                                value={newJobCompany}
                                onChange={(e) => setNewJobCompany(e.target.value)}
                                placeholder="e.g. Unisys, Ashby, ElevenLabs"
                                className="input"
                                style={{ width: '100%', height: '36px', fontSize: '13px', borderRadius: '8px', background: 'var(--surface-1)', border: '1px solid var(--border)' }}
                              />
                            </div>

                            <div>
                              <label style={{ fontSize: '12px', color: 'var(--text-2)', marginBottom: '4px', display: 'block', fontWeight: 500 }}>
                                Role Title
                              </label>
                              <input
                                type="text"
                                value={newJobRole}
                                onChange={(e) => setNewJobRole(e.target.value)}
                                placeholder="e.g. Fullstack Developer, AI Engineer"
                                className="input"
                                style={{ width: '100%', height: '36px', fontSize: '13px', borderRadius: '8px', background: 'var(--surface-1)', border: '1px solid var(--border)' }}
                              />
                            </div>

                            <div style={{ fontSize: '11px', color: 'var(--text-3)' }}>
                              Recipient email will be recorded as: <strong style={{ color: 'var(--text-2)' }}>{currentReply?.from}</strong>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Modal Footer */}
                      <div style={{ padding: '14px 22px', borderTop: '1px solid var(--border)', background: 'var(--surface-1)', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                        <button
                          className="btn btn-ghost"
                          onClick={() => setShowLinkModal(false)}
                          style={{ fontSize: '12px', padding: '6px 14px' }}
                        >
                          Cancel
                        </button>

                        {!isCreatingNewJob ? (
                          <button
                            className="btn btn-primary"
                            disabled={!linkingJobId || linkingLoading}
                            onClick={() => handleLinkJob({ jobId: linkingJobId })}
                            style={{ fontSize: '12px', padding: '6px 16px', display: 'flex', alignItems: 'center', gap: '6px' }}
                          >
                            {linkingLoading ? <span className="spinner"></span> : <span>🔗</span>}
                            <span>Link Application</span>
                          </button>
                        ) : (
                          <button
                            className="btn btn-primary"
                            disabled={!newJobCompany.trim() || linkingLoading}
                            onClick={() => handleLinkJob({ createNew: true, company: newJobCompany, role: newJobRole })}
                            style={{ fontSize: '12px', padding: '6px 16px', display: 'flex', alignItems: 'center', gap: '6px' }}
                          >
                            {linkingLoading ? <span className="spinner"></span> : <span>➕</span>}
                            <span>Create & Link Application</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
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
            // Status filter
            if (followUpStatus === 'pending' && f.sent) return false;
            if (followUpStatus === 'sent' && !f.sent) return false;

            // Day filter
            if (followUpDay === '3' && f.day !== 3) return false;
            if (followUpDay === '6' && f.day < 6) return false;

            // Search filter
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
            <div style={{ padding: '24px', flex: 1, overflowY: 'auto' }}>
              {/* Header with Locked Alignment (Never Wraps or Shifts) */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '24px',
                gap: '16px',
                flexWrap: 'nowrap'
              }}>
                <div style={{ minWidth: 0, flex: 1, paddingRight: '12px' }}>
                  <h2 style={{ fontSize: '24px', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
                    Follow Up Outreach
                    <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-3)', background: 'var(--surface-3)', padding: '2px 8px', borderRadius: '12px' }}>
                      {filteredFollowUps.length} shown
                    </span>
                  </h2>
                  <p style={{ color: 'var(--text-2)', fontSize: '13px', margin: '4px 0 0 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    Track, trigger, and review Day 3 and Day 6 follow-up emails for jobs awaiting recruiter replies.
                  </p>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
                  {/* Auto-Followup Master Toggle (Locked 280px Card) */}
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
                            ? '⚡ Auto-Send enabled! Scheduled follow-ups will be sent autonomously.'
                            : '⏸️ Auto-Send paused! Follow-ups will be drafted and saved in memory for manual send.',
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
                      width: '280px',
                      height: '46px',
                      boxSizing: 'border-box',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      background: profile?.enableAutoFollowUp !== false
                        ? 'linear-gradient(135deg, rgba(34, 197, 94, 0.08) 0%, rgba(38, 41, 45, 0.8) 100%)'
                        : 'var(--surface-2)',
                      padding: '0 14px',
                      borderRadius: '10px',
                      border: `1px solid ${profile?.enableAutoFollowUp !== false ? 'rgba(34, 197, 94, 0.35)' : 'var(--border)'}`,
                      cursor: 'pointer',
                      userSelect: 'none',
                      transition: 'border-color 0.2s, background 0.2s',
                      flexShrink: 0
                    }}
                    title="Click anywhere to toggle automated follow-ups"
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', minWidth: 0, overflow: 'hidden' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{
                          width: '7px',
                          height: '7px',
                          borderRadius: '50%',
                          background: profile?.enableAutoFollowUp !== false ? '#22c55e' : '#6C7278',
                          boxShadow: profile?.enableAutoFollowUp !== false ? '0 0 8px rgba(34, 197, 94, 0.8)' : 'none',
                          flexShrink: 0
                        }} />
                        <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-1)', whiteSpace: 'nowrap' }}>
                          Auto Follow-ups
                        </span>
                        <span style={{
                          width: '52px',
                          textAlign: 'center',
                          fontSize: '10px',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          letterSpacing: '0.5px',
                          padding: '1px 0',
                          borderRadius: '4px',
                          background: profile?.enableAutoFollowUp !== false ? 'rgba(34, 197, 94, 0.15)' : 'rgba(108, 114, 120, 0.2)',
                          color: profile?.enableAutoFollowUp !== false ? '#4ade80' : 'var(--text-3)',
                          border: `1px solid ${profile?.enableAutoFollowUp !== false ? 'rgba(34, 197, 94, 0.3)' : 'transparent'}`,
                          flexShrink: 0
                        }}>
                          {profile?.enableAutoFollowUp !== false ? 'ACTIVE' : 'PAUSED'}
                        </span>
                      </div>
                      <span style={{ fontSize: '11px', color: 'var(--text-3)', paddingLeft: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {profile?.enableAutoFollowUp !== false
                          ? 'Auto-sends on Day 3 & 6'
                          : 'Saves in memory (Manual)'}
                      </span>
                    </div>

                    {/* Sleek Toggle Pill */}
                    <div
                      style={{
                        position: 'relative',
                        width: '40px',
                        height: '22px',
                        borderRadius: '11px',
                        background: profile?.enableAutoFollowUp !== false ? '#22c55e' : 'var(--surface-4, #3A3D43)',
                        padding: '2px',
                        transition: 'background 0.2s ease',
                        flexShrink: 0,
                        border: `1px solid ${profile?.enableAutoFollowUp !== false ? 'rgba(34, 197, 94, 0.6)' : 'rgba(255, 255, 255, 0.1)'}`,
                        marginLeft: '10px'
                      }}
                    >
                      <div style={{
                        width: '16px',
                        height: '16px',
                        borderRadius: '50%',
                        background: '#FFFFFF',
                        transform: profile?.enableAutoFollowUp !== false ? 'translateX(18px)' : 'translateX(0)',
                        transition: 'transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.35)'
                      }} />
                    </div>
                  </div>

                  <button
                    className="btn btn-primary"
                    onClick={async () => {
                      setFetching(true);
                      try {
                        const res = await fetch(`${API_BASE}/api/check-followups`, {
                          method: 'POST',
                          headers: { 'Authorization': `Bearer ${localStorage.getItem('token') || ''}` }
                        });
                        const result = await res.json();
                        if (result.success) {
                          notify(`Checked follow-ups! Drafted ${result.draftedCount} new follow-ups.`);
                          loadJobs();
                        } else {
                          notify(result.error || 'Failed to check follow-ups', 'error');
                        }
                      } catch (err) {
                        notify('An error occurred', 'error');
                      }
                      setFetching(false);
                    }}
                    disabled={fetching}
                    style={{
                      height: '46px',
                      boxSizing: 'border-box',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '0 18px',
                      borderRadius: '10px',
                      fontSize: '13px',
                      fontWeight: 600,
                      whiteSpace: 'nowrap',
                      flexShrink: 0
                    }}
                  >
                    {fetching ? <span className="spinner"></span> : '🔄 Check for Due Follow-Ups'}
                  </button>
                </div>
              </div>

              {/* Toolbar: Toggle Buttons & Search */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '24px',
                gap: '16px',
                flexWrap: 'wrap',
                background: 'var(--surface-2)',
                padding: '12px 16px',
                borderRadius: '12px',
                border: '1px solid var(--border)'
              }}>
                {/* Left: Status Toggle Buttons */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      Status:
                    </span>
                    <div style={{
                      display: 'inline-flex',
                      background: 'var(--surface-1)',
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
                            onClick={() => { setFollowUpStatus(item.id); setFollowUpLimit(50); }}
                            style={{
                              padding: '6px 14px',
                              borderRadius: '6px',
                              border: 'none',
                              fontSize: '13px',
                              fontWeight: active ? 600 : 500,
                              background: active ? 'var(--accent)' : 'transparent',
                              color: active ? '#fff' : 'var(--text-2)',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                              transition: 'all 0.15s ease'
                            }}
                          >
                            <span>{item.label}</span>
                            <span style={{
                              fontSize: '11px',
                              padding: '1px 7px',
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
                  </div>

                  {/* Day Toggle Buttons */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '1px', height: '22px', background: 'var(--border)', margin: '0 4px' }} />
                    <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      Schedule:
                    </span>
                    <div style={{
                      display: 'inline-flex',
                      background: 'var(--surface-1)',
                      borderRadius: '8px',
                      padding: '3px',
                      gap: '3px',
                      border: '1px solid var(--border)'
                    }}>
                      {[
                        { id: 'all', label: 'All Days' },
                        { id: '3', label: 'Day 3' },
                        { id: '6', label: 'Day 6+' }
                      ].map(item => {
                        const active = followUpDay === item.id;
                        return (
                          <button
                            key={item.id}
                            onClick={() => { setFollowUpDay(item.id); setFollowUpLimit(50); }}
                            style={{
                              padding: '5px 12px',
                              borderRadius: '6px',
                              border: 'none',
                              fontSize: '12px',
                              fontWeight: active ? 600 : 500,
                              background: active ? 'var(--surface-4, #3A3D43)' : 'transparent',
                              color: active ? 'var(--text-1)' : 'var(--text-3)',
                              cursor: 'pointer',
                              transition: 'all 0.15s ease'
                            }}
                          >
                            {item.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Right: Search Input */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div className="search-wrapper" style={{ minWidth: '220px' }}>
                    <span className="search-icon">🔍</span>
                    <input
                      type="text"
                      className="search-input"
                      placeholder="Search company, role..."
                      value={followUpSearch}
                      onChange={(e) => { setFollowUpSearch(e.target.value); setFollowUpLimit(50); }}
                    />
                    {followUpSearch && (
                      <button
                        onClick={() => setFollowUpSearch('')}
                        style={{ background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', padding: '0 6px', fontSize: '12px' }}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* List of Follow Ups */}
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
                    padding: '48px 24px',
                    textAlign: 'center',
                    background: 'var(--surface-2)',
                    borderRadius: '12px',
                    border: '1px solid var(--border)',
                    color: 'var(--text-3)'
                  }}>
                    <div style={{ fontSize: '32px', marginBottom: '12px' }}>📭</div>
                    <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-2)', marginBottom: '4px' }}>
                      No {followUpStatus === 'all' ? '' : followUpStatus} follow-ups found
                    </div>
                    <div style={{ fontSize: '13px' }}>
                      {followUpSearch ? 'Try clearing your search query' : 'Click "Check for Due Follow-Ups" to see if any 3-day or 6-day milestones are ready.'}
                    </div>
                  </div>
                )}

                {filteredFollowUps.length > followUpLimit && (
                  <div style={{ textAlign: 'center', marginTop: '16px', marginBottom: '24px' }}>
                    <button
                      className="btn btn-secondary"
                      onClick={() => setFollowUpLimit(prev => prev + 50)}
                      style={{ padding: '8px 24px', fontSize: '13px' }}
                    >
                      Load More ({filteredFollowUps.length - followUpLimit} remaining)
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {tab === 'hr_dashboard' && (
          <div style={{ padding: '24px', flex: 1, overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
              <div>
                <h2 style={{ fontSize: '24px', fontWeight: 600, margin: 0 }}>HR Discovery Dashboard</h2>
                <p style={{ color: 'var(--text-2)', fontSize: '14px', margin: '4px 0 0 0' }}>Find active HR recruiters & talent leads for any role, skill, or company.</p>
              </div>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                {selectedJobs.length > 0 && (
                  <>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--accent)' }}>{selectedJobs.length} Selected</span>
                    <button className="btn btn-primary" onClick={() => handleBatchSend()} disabled={fetching}>
                      Batch Apply 🚀
                    </button>
                    <button className="btn btn-primary" style={{ background: 'var(--error)', borderColor: 'var(--error)', padding: '6px 12px' }} onClick={() => handleBatchDelete()} disabled={fetching}>
                      Delete
                    </button>
                    <div style={{ width: '1px', height: '24px', background: 'var(--border)', margin: '0 4px' }}></div>
                  </>
                )}

                <button className="btn btn-secondary" onClick={() => {
                  const hrJobs = jobs.filter(j => j.status === 'HR_Found');
                  if (selectedJobs.length === hrJobs.length && hrJobs.length > 0) setSelectedJobs([]);
                  else setSelectedJobs(hrJobs.map(j => j.id));
                }}>
                  {selectedJobs.length === jobs.filter(j => j.status === 'HR_Found').length && jobs.filter(j => j.status === 'HR_Found').length > 0 ? 'Deselect All' : 'Select All'}
                </button>

                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (fetching) return;
                    setFetching(true);
                    try {
                      const effectiveQuery = hrQuery.trim() || fetchQuery.trim() || fetchQueries[0] || 'software engineer';
                      const effectiveLocations = hrLocations.length > 0 ? hrLocations : ['All India'];
                      const res = await fetch(`${API_BASE}/api/jobs/scrape-hr`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token') || ''}` },
                        body: JSON.stringify({
                          query: effectiveQuery,
                          experience: experienceFilter !== 'All' ? experienceFilter : '',
                          locations: effectiveLocations,
                          location: effectiveLocations.join(', ')
                        })
                      });
                      const result = await res.json();
                      if (result.success) {
                        const nonAll = effectiveLocations.filter(l => !['all', 'all india'].includes(l.toLowerCase()));
                        const locText = nonAll.length > 0 ? ` in ${nonAll.join(', ')}` : '';
                        notify(`Discovered ${result.count} new HR leads for "${effectiveQuery}"${locText}!`);
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
                  style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', position: 'relative', zIndex: 30 }}
                >
                  <input
                    type="text"
                    className="form-input"
                    style={{ width: '210px', padding: '7px 12px', fontSize: '13px' }}
                    placeholder="Role, Skill or Company..."
                    value={hrQuery}
                    onChange={e => setHrQuery(e.target.value)}
                  />

                  {/* HR Location Pills & Popover Trigger */}
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                    {hrLocations.map((loc, idx) => {
                      const isAll = loc === 'All India';
                      const isRemote = loc.toLowerCase().includes('remote');
                      return (
                        <span
                          key={idx}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                            padding: '3px 8px',
                            borderRadius: '7px',
                            fontSize: '11.5px',
                            fontWeight: 600,
                            background: isAll ? 'rgba(59, 130, 246, 0.15)' : isRemote ? 'rgba(168, 85, 247, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                            color: isAll ? '#93c5fd' : isRemote ? '#d8b4fe' : '#6ee7b7',
                            border: `1px solid ${isAll ? 'rgba(59, 130, 246, 0.35)' : isRemote ? 'rgba(168, 85, 247, 0.35)' : 'rgba(16, 185, 129, 0.35)'}`
                          }}
                        >
                          <span>{isAll ? '🌐' : isRemote ? '🏠' : '📍'}</span>
                          <span>{loc}</span>
                          {hrLocations.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeHrLocation(loc)}
                              style={{
                                background: 'transparent',
                                border: 'none',
                                color: 'inherit',
                                cursor: 'pointer',
                                fontSize: '13px',
                                lineHeight: 1,
                                padding: '0 2px',
                                opacity: 0.8
                              }}
                              title={`Remove ${loc}`}
                            >
                              &times;
                            </button>
                          )}
                        </span>
                      );
                    })}

                    {/* Popover trigger */}
                    <div ref={hrLocationPickerRef} style={{ position: 'relative', display: 'inline-flex' }}>
                      <button
                        type="button"
                        onClick={() => setShowHrLocationPicker(!showHrLocationPicker)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '5px',
                          padding: '4px 10px',
                          borderRadius: '8px',
                          fontSize: '12px',
                          fontWeight: 600,
                          background: showHrLocationPicker ? 'rgba(56, 189, 248, 0.2)' : 'rgba(255, 255, 255, 0.06)',
                          border: `1px solid ${showHrLocationPicker ? 'rgba(56, 189, 248, 0.5)' : 'rgba(255, 255, 255, 0.15)'}`,
                          color: showHrLocationPicker ? '#38bdf8' : 'var(--text-2)',
                          cursor: 'pointer'
                        }}
                      >
                        <span>📍 Locations</span>
                        <span style={{ fontSize: '10px' }}>{showHrLocationPicker ? '▲' : '▼'}</span>
                      </button>

                      {showHrLocationPicker && (
                        <div style={{
                          position: 'absolute',
                          top: 'calc(100% + 6px)',
                          left: 0,
                          zIndex: 9999,
                          background: '#0f172a',
                          border: '1px solid rgba(56, 189, 248, 0.35)',
                          borderRadius: '12px',
                          padding: '12px',
                          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.85), 0 0 0 1px rgba(255, 255, 255, 0.08)',
                          minWidth: '290px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '8px'
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                              Target Locations
                            </span>
                            <button
                              type="button"
                              onClick={() => setHrLocations(['All India'])}
                              style={{
                                background: 'none',
                                border: 'none',
                                color: '#38bdf8',
                                fontSize: '11px',
                                cursor: 'pointer',
                                fontWeight: 600
                              }}
                            >
                              Reset to All India
                            </button>
                          </div>

                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                            {[
                              { id: 'All India', label: 'All India', icon: '🌐' },
                              { id: 'Bangalore', label: 'Bangalore', icon: '📍' },
                              { id: 'Hyderabad', label: 'Hyderabad', icon: '📍' },
                              { id: 'Pune', label: 'Pune', icon: '📍' },
                              { id: 'Mumbai', label: 'Mumbai', icon: '📍' },
                              { id: 'Delhi NCR', label: 'Delhi NCR', icon: '📍' },
                              { id: 'Chennai', label: 'Chennai', icon: '📍' },
                              { id: 'Remote', label: 'Remote', icon: '🏠' }
                            ].map(locItem => {
                              const isSelected = hrLocations.includes(locItem.id);
                              return (
                                <div
                                  key={locItem.id}
                                  onClick={() => toggleHrLocation(locItem.id)}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    padding: '5px 8px',
                                    borderRadius: '7px',
                                    background: isSelected ? 'rgba(56, 189, 248, 0.18)' : 'rgba(255, 255, 255, 0.03)',
                                    border: `1px solid ${isSelected ? 'rgba(56, 189, 248, 0.5)' : 'rgba(255, 255, 255, 0.07)'}`,
                                    color: isSelected ? '#38bdf8' : 'var(--text-2)',
                                    fontSize: '11.5px',
                                    fontWeight: isSelected ? 600 : 500,
                                    cursor: 'pointer',
                                    userSelect: 'none'
                                  }}
                                >
                                  <span style={{ fontSize: '11px', width: '12px', textAlign: 'center' }}>
                                    {isSelected ? '✓' : '•'}
                                  </span>
                                  <span>{locItem.icon} {locItem.label}</span>
                                </div>
                              );
                            })}
                          </div>

                          {/* Add Custom Location Input */}
                          <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: '8px', marginTop: '4px' }}>
                            <div style={{ fontSize: '11px', color: 'var(--text-3)', marginBottom: '4px' }}>Custom City or Region:</div>
                            <div style={{ display: 'flex', gap: '6px' }}>
                              <input
                                type="text"
                                placeholder="e.g. Kolkata, London, USA..."
                                value={newCustomHrLoc}
                                onChange={e => setNewCustomHrLoc(e.target.value)}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    if (newCustomHrLoc.trim().length >= 2) {
                                      addCustomHrLocation(newCustomHrLoc.trim());
                                      setNewCustomHrLoc('');
                                    }
                                  }
                                }}
                                style={{
                                  flex: 1,
                                  background: 'rgba(255, 255, 255, 0.05)',
                                  border: '1px solid rgba(255, 255, 255, 0.12)',
                                  borderRadius: '6px',
                                  padding: '4px 8px',
                                  fontSize: '12px',
                                  color: 'var(--text-1)',
                                  outline: 'none'
                                }}
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  if (newCustomHrLoc.trim().length >= 2) {
                                    addCustomHrLocation(newCustomHrLoc.trim());
                                    setNewCustomHrLoc('');
                                  }
                                }}
                                style={{
                                  padding: '4px 10px',
                                  fontSize: '11px',
                                  borderRadius: '6px',
                                  background: 'rgba(56, 189, 248, 0.2)',
                                  border: '1px solid rgba(56, 189, 248, 0.4)',
                                  color: '#38bdf8',
                                  cursor: 'pointer',
                                  fontWeight: 600
                                }}
                              >
                                Add
                              </button>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => setShowHrLocationPicker(false)}
                            style={{
                              marginTop: '4px',
                              padding: '5px 12px',
                              borderRadius: '7px',
                              background: 'rgba(255, 255, 255, 0.08)',
                              border: '1px solid rgba(255, 255, 255, 0.15)',
                              color: 'var(--text-1)',
                              fontSize: '11.5px',
                              fontWeight: 600,
                              cursor: 'pointer'
                            }}
                          >
                            Done ({hrLocations.length} selected)
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                  <button type="submit" className="btn btn-primary" disabled={fetching}>
                    {fetching ? <span className="spinner"></span> : 'Discover HRs 🚀'}
                  </button>
                </form>
              </div>
            </div>

            {/* HR Sub-Filter Tabs & Selection Controls */}
            {(() => {
              const allHrJobs = jobs.filter(j => j.status === 'HR_Found');
              const withEmailCount = allHrJobs.filter(j => !!j.emailRecipient).length;
              const noEmailCount = allHrJobs.filter(j => !j.emailRecipient).length;
              const activeHrJobs = jobs.filter(j => {
                if (j.status !== 'HR_Found') return false;
                if (hrFilter === 'with_email') return !!j.emailRecipient;
                if (hrFilter === 'no_email') return !j.emailRecipient;
                return true;
              });

              return (
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '12px' }}>
                    {[
                      { id: 'all', label: `All Leads (${allHrJobs.length})` },
                      { id: 'with_email', label: `With Email ✉️ (${withEmailCount})` },
                      { id: 'no_email', label: `LinkedIn Outreach 💼 (${noEmailCount})` }
                    ].map(f => (
                      <button
                        key={f.id}
                        onClick={() => setHrFilter(f.id)}
                        style={{
                          padding: '6px 14px',
                          borderRadius: '8px',
                          fontSize: '13px',
                          fontWeight: hrFilter === f.id ? 600 : 500,
                          border: '1px solid',
                          borderColor: hrFilter === f.id ? 'var(--accent)' : 'var(--border)',
                          background: hrFilter === f.id ? 'var(--surface-3)' : 'var(--surface-2)',
                          color: hrFilter === f.id ? 'var(--text-1)' : 'var(--text-2)',
                          cursor: 'pointer',
                          transition: 'all 0.2s'
                        }}
                      >
                        {f.label}
                      </button>
                    ))}

                    {activeHrJobs.length > 0 && (
                      <button
                        onClick={() => {
                          const activeIds = activeHrJobs.map(j => j.id || j._id).filter(Boolean);
                          const allSelected = activeIds.length > 0 && activeIds.every(id => selectedJobs.includes(id));
                          if (allSelected) {
                            const activeSet = new Set(activeIds);
                            setSelectedJobs(prev => prev.filter(id => !activeSet.has(id)));
                          } else {
                            setSelectedJobs(prev => [...new Set([...prev, ...activeIds])]);
                          }
                        }}
                        className="btn btn-secondary"
                        style={{ marginLeft: 'auto', fontSize: '12px', padding: '6px 12px' }}
                      >
                        {activeHrJobs.every(j => selectedJobs.includes(j.id || j._id)) ? 'Deselect All HR' : `Select All HR (${activeHrJobs.length})`}
                      </button>
                    )}
                  </div>

                  {/* Batch Action Toolbar for HR Dashboard */}
                  {selectedJobs.length > 0 && (
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      background: 'var(--surface-2)',
                      padding: '10px 16px',
                      borderRadius: '10px',
                      border: '1px solid var(--border)',
                      gap: '12px',
                      flexWrap: 'wrap'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--accent)' }}>
                          ✓ {selectedJobs.length} selected
                        </span>
                        <button
                          onClick={() => setSelectedJobs([])}
                          className="btn btn-ghost"
                          style={{ fontSize: '12px', padding: '2px 8px' }}
                        >
                          Clear
                        </button>
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          className="btn btn-primary"
                          onClick={() => handleBatchDelete()}
                          disabled={fetching}
                          style={{ background: 'var(--error)', borderColor: 'var(--error)', padding: '6px 14px', fontSize: '12px' }}
                        >
                          Delete Selected ({selectedJobs.length}) 🗑️
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px' }}>
              {jobs.filter(j => {
                if (j.status !== 'HR_Found') return false;
                if (hrFilter === 'with_email') return !!j.emailRecipient;
                if (hrFilter === 'no_email') return !j.emailRecipient;
                return true;
              }).map(job => {
                const jobId = job.id || job._id;
                const isHrSelected = selectedJobs.includes(jobId) || selectedJobs.includes(job.id) || (job._id && selectedJobs.includes(job._id));
                const linkedInTargetUrl = job.hrLinkedIn || `https://www.linkedin.com/search/results/all/?keywords=${encodeURIComponent((job.hrName || '') + ' ' + (job.company || ''))}`;
                const hasEmail = !!job.emailRecipient;

                return (
                  <div key={jobId} style={{
                    background: 'var(--surface-2)',
                    borderRadius: '12px',
                    border: '1px solid var(--border)',
                    padding: '18px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                  }}>
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ fontWeight: 600, fontSize: '15px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <input
                            type="checkbox"
                            checked={isHrSelected}
                            onChange={() => toggleSelectJob(jobId)}
                            style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: 'var(--accent)' }}
                          />
                          <span>{job.hrName || 'Unknown Recruiter'}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          {job.source && (
                            <span className={`source-pill source-${job.source.toLowerCase()}`} style={{ padding: '2px 8px', fontSize: '10px' }}>
                              {job.source}
                            </span>
                          )}
                          <button
                            className="btn btn-ghost"
                            style={{
                              padding: '2px',
                              color: 'var(--text-3)',
                              fontSize: '15px',
                              lineHeight: 1,
                              background: 'transparent',
                              border: 'none',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              width: '22px',
                              height: '22px',
                              borderRadius: '50%',
                              transition: 'all 0.2s ease',
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.color = 'var(--error)';
                              e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.color = 'var(--text-3)';
                              e.currentTarget.style.background = 'transparent';
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(jobId);
                            }}
                            title="Delete HR Lead"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                      <div style={{ fontSize: '13px', color: 'var(--accent)', marginTop: '4px', fontWeight: 600 }}>🏢 {job.company}</div>
                      <div style={{ fontSize: '12px', color: 'var(--text-2)', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
                        <span style={{ color: 'var(--text-3)', fontSize: '11px' }}>Role:</span>
                        <span style={{ color: 'var(--text-1)', fontWeight: 500 }}>{job.role}</span>
                      </div>
                    </div>

                    {/* Email Box / Inline Editor */}
                    <div style={{
                      fontSize: '12px',
                      background: 'var(--surface-1)',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      border: '1px solid var(--border)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '8px'
                    }}>
                      {editingEmailId === job.id ? (
                        <div style={{ display: 'flex', gap: '6px', width: '100%', alignItems: 'center' }}>
                          <input
                            type="email"
                            className="form-input"
                            style={{ flex: 1, padding: '4px 8px', fontSize: '12px' }}
                            placeholder="Enter email..."
                            value={editEmailVal}
                            onChange={(e) => setEditEmailVal(e.target.value)}
                            autoFocus
                          />
                          <button
                            className="btn btn-primary"
                            style={{ padding: '4px 10px', fontSize: '11px' }}
                            onClick={async () => {
                              if (editEmailVal.trim()) {
                                await updateStatus(job.id, 'HR_Found', editEmailVal.trim());
                                notify('Email updated!');
                              }
                              setEditingEmailId(null);
                            }}
                          >
                            Save
                          </button>
                          <button
                            className="btn btn-ghost"
                            style={{ padding: '4px 8px', fontSize: '11px' }}
                            onClick={() => setEditingEmailId(null)}
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <>
                          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '4px' }}>
                            <strong style={{ color: 'var(--text-2)' }}>Email: </strong>
                            {hasEmail ? (
                              <>
                                <span style={{ color: 'var(--text-1)', fontWeight: 500 }}>{job.emailRecipient}</span>
                                {job.status === 'Bounced' || job.deliverabilityStatus === 'bounced' ? (
                                  <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: 4, background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', fontWeight: 600 }}>🚨 Bounced</span>
                                ) : job.deliverabilityScore >= 70 ? (
                                  <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: 4, background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', fontWeight: 600 }} title={job.deliverabilityReason || 'High deliverability confidence'}>✓ {job.deliverabilityScore}% Verified</span>
                                ) : job.deliverabilityScore > 0 ? (
                                  <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: 4, background: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', fontWeight: 600 }} title={job.deliverabilityReason || 'Low mailbox confidence'}>⚠ {job.deliverabilityScore}% Risky</span>
                                ) : null}
                              </>
                            ) : (
                              <>
                                <span style={{ color: 'var(--text-3)', fontStyle: 'italic' }}>Not Found</span>
                                {job.deliverabilityStatus === 'undeliverable' && (
                                  <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: 4, background: 'rgba(239, 68, 68, 0.12)', color: '#f87171', fontWeight: 500 }} title={job.deliverabilityReason || 'Zero verified inboxes found'}>🛡️ Protected (No Mailbox)</span>
                                )}
                              </>
                            )}
                          </div>
                          <button
                            onClick={() => {
                              setEditingEmailId(job.id);
                              setEditEmailVal(job.emailRecipient || '');
                            }}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: 'var(--accent)',
                              fontSize: '11px',
                              cursor: 'pointer',
                              padding: '2px 4px',
                              textDecoration: 'underline'
                            }}
                            title="Edit email"
                          >
                            {hasEmail ? '✏️ Edit' : '+ Add'}
                          </button>
                        </>
                      )}
                    </div>

                    {/* Action Buttons */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: 'auto', paddingTop: '6px' }}>
                      {/* Unified LinkedIn Connect with Note Button */}
                      <button
                        className="btn"
                        style={{
                          width: '100%',
                          textAlign: 'center',
                          fontSize: '12px',
                          padding: '8px',
                          background: '#0a66c2',
                          color: '#fff',
                          borderRadius: '8px',
                          fontWeight: 600,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px'
                        }}
                        onClick={() => handleConnectWithNote(job)}
                        disabled={copyingNoteId === job.id}
                        title="Copy tailored pitch note & open recruiter's LinkedIn"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z" />
                        </svg>
                        {copyingNoteId === job.id ? (
                          <>
                            <span className="spinner" style={{ width: '11px', height: '11px' }}></span>
                            Crafting Pitch & Opening...
                          </>
                        ) : (
                          '💼 Connect with AI Note'
                        )}
                      </button>

                      {/* Primary Outreach / Scan Button */}
                      {hasEmail ? (
                        <button
                          className="btn btn-primary"
                          style={{ width: '100%', fontSize: '12px', padding: '8px', borderRadius: '8px' }}
                          onClick={() => handleBatchSend([job.id])}
                        >
                          ✉️ Send Mail
                        </button>
                      ) : (
                        <button
                          className="btn btn-ghost"
                          style={{
                            width: '100%',
                            fontSize: '12px',
                            padding: '8px',
                            borderRadius: '8px',
                            border: '1px dashed var(--accent)',
                            color: 'var(--accent)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '6px'
                          }}
                          onClick={() => handleDeepDiscoverHrEmail(job)}
                          disabled={discoveringHrId === job.id}
                        >
                          {discoveringHrId === job.id ? (
                            <>
                              <span className="spinner" style={{ width: '12px', height: '12px' }}></span>
                              Scanning Web & Patterns...
                            </>
                          ) : (
                            '🔍 Deep Scan for Email'
                          )}
                        </button>
                      )}

                      {/* Revealed Only After Clicking Connect / Copy */}
                      {connectedJobIds.includes(job.id) && (
                        <button
                          className="btn btn-ghost"
                          style={{
                            width: '100%',
                            fontSize: '11px',
                            padding: '6px',
                            borderRadius: '6px',
                            color: '#38bdf8',
                            borderColor: 'rgba(10, 102, 194, 0.4)',
                            background: 'rgba(10, 102, 194, 0.1)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '6px',
                            fontWeight: 600
                          }}
                          onClick={async () => {
                            await updateStatus(job.id, 'LinkedIn_Sent');
                            notify(`💼 Marked ${job.hrName || 'lead'} as LinkedIn Invite Sent! Moved to Applied tab.`);
                          }}
                          title="Mark LinkedIn invite as sent and track in Applied Jobs"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z" />
                          </svg>
                          ✓ Mark Invite Sent (Move to Applied)
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}

              {jobs.filter(j => j.status === 'HR_Found').length === 0 && (
                <div style={{ gridColumn: '1 / -1', color: 'var(--text-3)', textAlign: 'center', padding: '40px', background: 'var(--surface-2)', borderRadius: '12px' }}>
                  No HR leads found yet. Click "Discover HRs" to start scraping!
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'applications' && (
          <div className="add-job-bar" style={{ position: 'relative', zIndex: showLocationPicker ? 1000 : 50, overflow: 'visible' }}>
            {selectedJobs.length > 0 ? (
              <div style={{ display: 'flex', alignItems: 'center', width: '100%', gap: '15px' }}>
                <span style={{ fontWeight: 600, color: 'var(--accent)' }}>{selectedJobs.length} selected</span>
                {batchProgress !== null ? (
                  <div style={{ flex: 1, height: '8px', background: 'var(--surface-4)', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{ width: `${batchProgress}%`, height: '100%', background: 'var(--accent)', transition: 'width 0.3s' }} />
                  </div>
                ) : (
                  <>
                    <button className="btn btn-primary" onClick={() => handleBatchSend()}>
                      Batch Send Emails 🚀
                    </button>
                    <button className="btn btn-primary" style={{ background: 'var(--error)', borderColor: 'var(--error)' }} onClick={() => handleBatchDelete()}>
                      Delete Selected
                    </button>
                  </>
                )}
                <button className="btn btn-ghost" style={{ marginLeft: 'auto' }} onClick={() => setSelectedJobs([])}>Cancel</button>
              </div>
            ) : (
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
                width: '100%'
              }}>
                {/* Deck 1: Target Roles (Job Titles) */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  flexWrap: 'wrap',
                  background: 'rgba(15, 20, 32, 0.8)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '12px',
                  padding: '6px 12px',
                  boxShadow: 'inset 0 1px 3px rgba(0, 0, 0, 0.2)',
                  position: 'relative',
                  zIndex: 2
                }}>
                  {/* Label */}
                  <div style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    fontSize: '11px',
                    fontWeight: 700,
                    color: 'var(--text-3)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    paddingRight: '8px',
                    borderRight: '1px solid rgba(255, 255, 255, 0.08)',
                    flexShrink: 0
                  }}>
                    <span>💼</span>
                    <span>Roles ({fetchQueries.length}):</span>
                  </div>

                  {/* Active Role Badges */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', alignItems: 'center' }}>
                    {fetchQueries.map((q, idx) => (
                      <span
                        key={idx}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '5px',
                          padding: '3px 9px',
                          borderRadius: '7px',
                          fontSize: '11.5px',
                          fontWeight: 600,
                          background: 'rgba(239, 68, 68, 0.15)',
                          color: '#fca5a5',
                          border: '1px solid rgba(239, 68, 68, 0.35)',
                          boxShadow: '0 2px 5px rgba(239, 68, 68, 0.06)'
                        }}
                      >
                        <span>{q}</span>
                        {fetchQueries.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeFetchQuery(q)}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: '#f87171',
                              cursor: 'pointer',
                              fontSize: '13px',
                              lineHeight: 1,
                              padding: '0 1px',
                              display: 'flex',
                              alignItems: 'center',
                              opacity: 0.8
                            }}
                            title="Remove role"
                          >
                            &times;
                          </button>
                        )}
                      </span>
                    ))}
                  </div>

                  {/* Inline Add Role Form */}
                  <form onSubmit={addFetchQuery} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', flex: '1 1 180px', maxWidth: '280px', minWidth: '150px' }}>
                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center', flex: 1 }}>
                      <span style={{ position: 'absolute', left: '6px', color: 'var(--text-3)', fontSize: '11px', pointerEvents: 'none' }}>🔍</span>
                      <input
                        type="text"
                        style={{
                          width: '100%',
                          background: 'rgba(255, 255, 255, 0.05)',
                          border: '1px solid rgba(255, 255, 255, 0.12)',
                          borderRadius: '7px',
                          outline: 'none',
                          padding: '4px 8px 4px 22px',
                          fontSize: '12px',
                          color: 'var(--text-1)',
                          fontFamily: 'inherit'
                        }}
                        placeholder="+ Add role (Enter)..."
                        value={fetchQuery}
                        onChange={e => setFetchQuery(e.target.value)}
                      />
                    </div>
                    <button
                      type="submit"
                      className="btn btn-secondary"
                      style={{
                        padding: '4px 9px',
                        fontSize: '11px',
                        fontWeight: 600,
                        borderRadius: '6px',
                        flexShrink: 0,
                        background: 'rgba(255, 255, 255, 0.08)',
                        border: '1px solid rgba(255, 255, 255, 0.15)'
                      }}
                    >
                      + Add
                    </button>
                  </form>
                </div>

                {/* Deck 2: Target Locations (Multi-Select Pills & Popover) */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  flexWrap: 'wrap',
                  background: 'rgba(15, 20, 32, 0.8)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '12px',
                  padding: '6px 12px',
                  boxShadow: 'inset 0 1px 3px rgba(0, 0, 0, 0.2)',
                  position: 'relative',
                  zIndex: showLocationPicker ? 100 : 5
                }}>
                  {/* Label */}
                  <div style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    fontSize: '11px',
                    fontWeight: 700,
                    color: 'var(--text-3)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    paddingRight: '8px',
                    borderRight: '1px solid rgba(255, 255, 255, 0.08)',
                    flexShrink: 0
                  }}>
                    <span>📍</span>
                    <span>Locations ({selectedLocations.length}):</span>
                  </div>

                  {/* Active Location Pills */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', alignItems: 'center' }}>
                    {selectedLocations.map((loc, idx) => {
                      const isAll = loc === 'All India';
                      const isRemote = loc.toLowerCase().includes('remote');
                      return (
                        <span
                          key={idx}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                            padding: '3px 9px',
                            borderRadius: '7px',
                            fontSize: '11.5px',
                            fontWeight: 600,
                            background: isAll ? 'rgba(59, 130, 246, 0.15)' : isRemote ? 'rgba(168, 85, 247, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                            color: isAll ? '#93c5fd' : isRemote ? '#d8b4fe' : '#6ee7b7',
                            border: `1px solid ${isAll ? 'rgba(59, 130, 246, 0.35)' : isRemote ? 'rgba(168, 85, 247, 0.35)' : 'rgba(16, 185, 129, 0.35)'}`,
                            boxShadow: '0 2px 5px rgba(0, 0, 0, 0.1)'
                          }}
                        >
                          <span>{isAll ? '🌐' : isRemote ? '🏠' : '📍'}</span>
                          <span>{loc}</span>
                          {selectedLocations.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeLocation(loc)}
                              style={{
                                background: 'transparent',
                                border: 'none',
                                color: 'inherit',
                                cursor: 'pointer',
                                fontSize: '13px',
                                lineHeight: 1,
                                padding: '0 1px',
                                display: 'flex',
                                alignItems: 'center',
                                opacity: 0.8
                              }}
                              title={`Remove ${loc}`}
                            >
                              &times;
                            </button>
                          )}
                        </span>
                      );
                    })}
                  </div>

                  {/* Location Selector Popover Trigger & Non-duplicated Quick Hubs */}
                  <div ref={locationPickerRef} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                    <button
                      type="button"
                      onClick={() => setShowLocationPicker(!showLocationPicker)}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                        padding: '4px 10px',
                        borderRadius: '7px',
                        fontSize: '11.5px',
                        fontWeight: 600,
                        background: showLocationPicker ? 'rgba(56, 189, 248, 0.2)' : 'rgba(255, 255, 255, 0.06)',
                        border: `1px solid ${showLocationPicker ? 'rgba(56, 189, 248, 0.5)' : 'rgba(255, 255, 255, 0.15)'}`,
                        color: showLocationPicker ? '#38bdf8' : 'var(--text-2)',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <span>+ Select Locations</span>
                      <span style={{ fontSize: '10px' }}>{showLocationPicker ? '▲' : '▼'}</span>
                    </button>

                    {/* Quick Preset Shortcut Chips (Only show hubs not currently selected) */}
                    {(() => {
                      const unselectedQuickHubs = [
                        { id: 'Bangalore', label: '+ BLR' },
                        { id: 'Hyderabad', label: '+ HYD' },
                        { id: 'Pune', label: '+ Pune' },
                        { id: 'Remote', label: '+ Remote' }
                      ].filter(hub => !selectedLocations.includes(hub.id));

                      if (unselectedQuickHubs.length === 0) return null;

                      return (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                          {unselectedQuickHubs.map(hub => (
                            <button
                              key={hub.id}
                              type="button"
                              onClick={() => toggleLocation(hub.id)}
                              style={{
                                padding: '3px 7px',
                                borderRadius: '5px',
                                fontSize: '10.5px',
                                fontWeight: 600,
                                background: 'rgba(255, 255, 255, 0.04)',
                                border: '1px solid rgba(255, 255, 255, 0.09)',
                                color: 'var(--text-3)',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease'
                              }}
                              title={`Add ${hub.id}`}
                            >
                              {hub.label}
                            </button>
                          ))}
                        </div>
                      );
                    })()}

                    {/* Popover Menu */}
                    {showLocationPicker && (
                      <div style={{
                        position: 'absolute',
                        top: 'calc(100% + 6px)',
                        left: 0,
                        zIndex: 9999,
                        background: '#0f172a',
                        border: '1px solid rgba(56, 189, 248, 0.35)',
                        borderRadius: '12px',
                        padding: '12px',
                        boxShadow: '0 20px 50px rgba(0, 0, 0, 0.85), 0 0 0 1px rgba(255, 255, 255, 0.08)',
                        minWidth: '290px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                            Select Locations
                          </span>
                          <button
                            type="button"
                            onClick={() => setSelectedLocations(['All India'])}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: '#38bdf8',
                              fontSize: '11px',
                              cursor: 'pointer',
                              fontWeight: 600
                            }}
                          >
                            Reset to All India
                          </button>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                          {[
                            { id: 'All India', label: 'All India', icon: '🌐' },
                            { id: 'Bangalore', label: 'Bangalore', icon: '📍' },
                            { id: 'Hyderabad', label: 'Hyderabad', icon: '📍' },
                            { id: 'Pune', label: 'Pune', icon: '📍' },
                            { id: 'Mumbai', label: 'Mumbai', icon: '📍' },
                            { id: 'Delhi NCR', label: 'Delhi NCR', icon: '📍' },
                            { id: 'Chennai', label: 'Chennai', icon: '📍' },
                            { id: 'Remote', label: 'Remote', icon: '🏠' }
                          ].map(locItem => {
                            const isSelected = selectedLocations.includes(locItem.id);
                            return (
                              <div
                                key={locItem.id}
                                onClick={() => toggleLocation(locItem.id)}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                  padding: '5px 8px',
                                  borderRadius: '7px',
                                  background: isSelected ? 'rgba(56, 189, 248, 0.18)' : 'rgba(255, 255, 255, 0.03)',
                                  border: `1px solid ${isSelected ? 'rgba(56, 189, 248, 0.5)' : 'rgba(255, 255, 255, 0.07)'}`,
                                  color: isSelected ? '#38bdf8' : 'var(--text-2)',
                                  fontSize: '11.5px',
                                  fontWeight: isSelected ? 600 : 500,
                                  cursor: 'pointer',
                                  userSelect: 'none',
                                  transition: 'all 0.15s ease'
                                }}
                              >
                                <span style={{ fontSize: '11px', width: '12px', textAlign: 'center' }}>
                                  {isSelected ? '✓' : '•'}
                                </span>
                                <span>{locItem.icon} {locItem.label}</span>
                              </div>
                            );
                          })}
                        </div>

                        {/* Add Custom Location Input */}
                        <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: '8px', marginTop: '4px' }}>
                          <div style={{ fontSize: '11px', color: 'var(--text-3)', marginBottom: '4px' }}>Custom City or Region:</div>
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <input
                              type="text"
                              placeholder="e.g. Kolkata, London, USA..."
                              value={newCustomLoc}
                              onChange={e => setNewCustomLoc(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  if (newCustomLoc.trim().length >= 2) {
                                    addCustomLocation(newCustomLoc.trim());
                                    setNewCustomLoc('');
                                  }
                                }
                              }}
                              style={{
                                flex: 1,
                                background: 'rgba(255, 255, 255, 0.05)',
                                border: '1px solid rgba(255, 255, 255, 0.12)',
                                borderRadius: '6px',
                                padding: '4px 8px',
                                fontSize: '12px',
                                color: 'var(--text-1)',
                                outline: 'none'
                              }}
                            />
                            <button
                              type="button"
                              onClick={() => {
                                if (newCustomLoc.trim().length >= 2) {
                                  addCustomLocation(newCustomLoc.trim());
                                  setNewCustomLoc('');
                                }
                              }}
                              style={{
                                padding: '4px 10px',
                                fontSize: '11px',
                                borderRadius: '6px',
                                background: 'rgba(56, 189, 248, 0.2)',
                                border: '1px solid rgba(56, 189, 248, 0.4)',
                                color: '#38bdf8',
                                cursor: 'pointer',
                                fontWeight: 600
                              }}
                            >
                              Add
                            </button>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => setShowLocationPicker(false)}
                          style={{
                            marginTop: '4px',
                            padding: '5px 12px',
                            borderRadius: '7px',
                            background: 'rgba(255, 255, 255, 0.08)',
                            border: '1px solid rgba(255, 255, 255, 0.15)',
                            color: 'var(--text-1)',
                            fontSize: '11.5px',
                            fontWeight: 600,
                            cursor: 'pointer'
                          }}
                        >
                          Done ({selectedLocations.length} selected)
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Deck 3: Controls Ribbon & Action Button */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px',
                  flexWrap: 'wrap',
                  paddingTop: '4px'
                }}>
                  {/* Left Filters Group */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    {/* Target Experience Selector */}
                    <div style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      background: 'rgba(255, 255, 255, 0.04)',
                      border: `1px solid ${experienceFilter !== 'All' ? 'rgba(239, 68, 68, 0.5)' : 'rgba(255, 255, 255, 0.1)'}`,
                      padding: '3px 10px',
                      borderRadius: '10px',
                      boxShadow: experienceFilter !== 'All' ? '0 0 10px rgba(239, 68, 68, 0.15)' : 'none',
                      transition: 'all 0.2s ease'
                    }}>
                      <span style={{ fontSize: '13px' }}>🎯</span>
                      <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                        EXP:
                      </span>
                      <select
                        value={experienceFilter}
                        onChange={(e) => setExperienceFilter(e.target.value)}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          outline: 'none',
                          color: 'var(--text-1)',
                          fontSize: '13px',
                          fontWeight: 600,
                          cursor: 'pointer',
                          padding: '5px 0'
                        }}
                        title="Filter by experience level"
                      >
                        <option value="All" style={{ background: 'var(--surface-2)', color: 'var(--text-1)' }}>All Levels</option>
                        <option value="Junior" style={{ background: 'var(--surface-2)', color: 'var(--text-1)' }}>🟢 Junior / Entry</option>
                        <option value="Mid" style={{ background: 'var(--surface-2)', color: 'var(--text-1)' }}>🟡 Mid-Level</option>
                        <option value="Senior" style={{ background: 'var(--surface-2)', color: 'var(--text-1)' }}>🟣 Senior / Lead</option>
                      </select>
                    </div>

                    {/* Interactive Deep Scraper Toggle Pill */}
                    <div
                      onClick={() => setUseApify(!useApify)}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '6px 12px',
                        borderRadius: '10px',
                        background: useApify ? 'rgba(56, 189, 248, 0.12)' : 'rgba(255, 255, 255, 0.04)',
                        border: `1px solid ${useApify ? 'rgba(56, 189, 248, 0.45)' : 'rgba(255, 255, 255, 0.1)'}`,
                        color: useApify ? '#38bdf8' : 'var(--text-2)',
                        cursor: 'pointer',
                        fontSize: '12px',
                        fontWeight: 600,
                        userSelect: 'none',
                        transition: 'all 0.2s ease'
                      }}
                      title="Toggle deep scraping across LinkedIn, Naukri, Indeed, Glassdoor"
                    >
                      <span>⚡ Deep Scraper</span>
                      <span style={{
                        width: '7px',
                        height: '7px',
                        borderRadius: '50%',
                        background: useApify ? '#38bdf8' : 'var(--text-3)',
                        boxShadow: useApify ? '0 0 8px #38bdf8' : 'none',
                        transition: 'all 0.2s ease'
                      }} />
                    </div>
                  </div>

                  {/* Right: Summary & Action Button */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '12px', color: 'var(--text-3)', fontWeight: 500 }}>
                      {fetchQueries.length} {fetchQueries.length === 1 ? 'Role' : 'Roles'} · {selectedLocations.includes('All India') ? 'All India' : `${selectedLocations.length} ${selectedLocations.length === 1 ? 'Location' : 'Locations'}`}
                    </span>
                    <button
                      className="btn btn-primary"
                      onClick={handleFetchJobs}
                      disabled={fetching || fetchQueries.length === 0}
                      style={{
                        padding: '8px 18px',
                        fontSize: '13px',
                        fontWeight: 700,
                        borderRadius: '10px',
                        background: 'linear-gradient(135deg, #ef4444 0%, #ea580c 100%)',
                        boxShadow: '0 4px 16px rgba(239, 68, 68, 0.35)',
                        border: 'none',
                        color: '#ffffff',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '8px',
                        whiteSpace: 'nowrap',
                        letterSpacing: '0.2px',
                        cursor: fetching || fetchQueries.length === 0 ? 'not-allowed' : 'pointer',
                        transition: 'all 0.2s ease'
                      }}
                    >
                      {fetching ? (
                        <>
                          <span className="spinner" style={{ width: 14, height: 14 }}></span>
                          <span>Scraping Fresh Jobs...</span>
                        </>
                      ) : (
                        <>
                          <span>🚀</span>
                          <span>
                            {experienceFilter !== 'All'
                              ? `Auto-Scrape ${experienceFilter} Jobs`
                              : selectedLocations.length > 1
                                ? `Auto-Scrape in ${selectedLocations.length} Locations ✨`
                                : !selectedLocations.includes('All India')
                                  ? `Auto-Scrape in ${selectedLocations[0]} ✨`
                                  : 'Auto-Scrape Fresh Jobs ✨'}
                          </span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {tab === 'resume' ? (
          <div className="profile-section" style={{
            padding: '24px 32px',
            background: 'var(--surface-2)',
            borderRadius: 'var(--radius)',
            border: '1px solid var(--border)',
            flex: 1,
            overflowY: 'auto',
            margin: '16px 24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '20px'
          }}>

            {/* Top Bar with Title and Actions */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', borderBottom: '1px solid var(--border)', paddingBottom: '16px' }}>
              <div>
                <h1 style={{ fontSize: '22px', fontWeight: 700, margin: 0, color: 'var(--text-1)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span>👤</span> Candidate Profile & Portfolio Memory
                </h1>
                <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: 'var(--text-3)' }}>
                  Manage your personal details, parsed resume skills, and deep GitHub repository knowledge used to draft hyper-relevant cold emails.
                </p>
              </div>

              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={exportToCSV}
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', fontSize: '12px' }}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                  Export Pipeline CSV
                </button>
              </div>
            </div>

            {/* 2-Column Split: Left (Info & Resume & Account) | Right (GitHub Technical Portfolio) */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(360px, 440px) minmax(460px, 1fr)',
              gap: '24px',
              alignItems: 'start'
            }}>

              {/* LEFT COLUMN: Personal Info Form + Resume + Email Account */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

                {/* 1. Personal Information Form */}
                <div style={{
                  background: 'rgba(15, 23, 42, 0.65)',
                  border: '1px solid var(--border)',
                  borderRadius: '14px',
                  padding: '20px'
                }}>
                  <h2 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '16px', color: 'var(--text-1)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>📝</span> Personal Information
                  </h2>
                  <form onSubmit={handleProfileSave} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <div className="form-row">
                      <div style={{ flex: 1 }}>
                        <label style={{ display: 'block', marginBottom: '6px', color: 'var(--text-2)', fontSize: '12px', fontWeight: 500 }}>Full Name</label>
                        <input className="form-input" style={{ width: '100%', fontSize: '13px' }} value={profile.name} onChange={e => setProfile({ ...profile, name: e.target.value })} placeholder="Your Name" />
                      </div>
                      <div style={{ flex: 1 }}>
                        <label style={{ display: 'block', marginBottom: '6px', color: 'var(--text-2)', fontSize: '12px', fontWeight: 500 }}>Job Title</label>
                        <input className="form-input" style={{ width: '100%', fontSize: '13px' }} value={profile.title} onChange={e => setProfile({ ...profile, title: e.target.value })} placeholder="Software Developer" />
                      </div>
                    </div>

                    <div>
                      <label style={{ display: 'block', marginBottom: '6px', color: 'var(--text-2)', fontSize: '12px', fontWeight: 500 }}>Phone Number</label>
                      <input className="form-input" style={{ width: '100%', fontSize: '13px' }} value={profile.phone} onChange={e => setProfile({ ...profile, phone: e.target.value })} placeholder="+1 (555) 000-0000" />
                    </div>

                    <div>
                      <label style={{ display: 'block', marginBottom: '6px', color: 'var(--text-2)', fontSize: '12px', fontWeight: 500 }}>LinkedIn Profile URL</label>
                      <input className="form-input" style={{ width: '100%', fontSize: '13px' }} value={profile.linkedin} onChange={e => setProfile({ ...profile, linkedin: e.target.value })} placeholder="https://linkedin.com/in/username" />
                    </div>

                    <div>
                      <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', color: 'var(--text-2)', fontSize: '12px', fontWeight: 500 }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                          Portfolio / Website URL
                        </span>
                      </label>
                      <input
                        className="form-input"
                        style={{ width: '100%', fontSize: '13px' }}
                        value={profile.portfolio || ''}
                        onChange={e => setProfile({ ...profile, portfolio: e.target.value })}
                        placeholder="https://yourportfolio.dev or https://yourname.com"
                      />
                    </div>

                    <div className="form-row">
                      <div style={{ flex: 1 }}>
                        <label style={{ display: 'block', marginBottom: '6px', color: 'var(--text-2)', fontSize: '12px', fontWeight: 500 }}>GitHub Profile URL</label>
                        <input className="form-input" style={{ width: '100%', fontSize: '13px' }} value={profile.github || ''} onChange={e => setProfile({ ...profile, github: e.target.value })} placeholder="https://github.com/username" />
                      </div>
                      <div style={{ flex: 1 }}>
                        <label style={{ display: 'block', marginBottom: '6px', color: 'var(--text-2)', fontSize: '12px', fontWeight: 500 }}>Experience Level</label>
                        <input className="form-input" style={{ width: '100%', fontSize: '13px' }} value={profile.experienceLevel || ''} onChange={e => setProfile({ ...profile, experienceLevel: e.target.value })} placeholder="e.g. Junior, Mid, Senior" />
                      </div>
                    </div>

                    <div>
                      <label style={{ display: 'block', marginBottom: '6px', color: 'var(--text-2)', fontSize: '12px', fontWeight: 500 }}>Custom AI Writing Tone</label>
                      <select className="form-input" style={{ width: '100%', fontSize: '13px' }} value={profile.tone || 'Professional'} onChange={e => setProfile({ ...profile, tone: e.target.value })}>
                        <option value="Professional">Professional & Formal</option>
                        <option value="Confident & Direct">Confident & Direct</option>
                        <option value="Enthusiastic & Friendly">Enthusiastic & Friendly</option>
                        <option value="Short & Punchy">Short & Punchy</option>
                      </select>
                    </div>

                    <button type="submit" className="btn btn-primary" style={{ alignSelf: 'flex-start', marginTop: '8px', padding: '9px 22px', fontSize: '13px', fontWeight: 600 }} disabled={savingProfile}>
                      {savingProfile ? <span className="spinner"></span> : '💾 Save Profile Information'}
                    </button>
                  </form>
                </div>

                {/* 2. Resume Upload & Skills Parser */}
                <div style={{
                  background: 'rgba(15, 23, 42, 0.65)',
                  border: '1px solid var(--border)',
                  borderRadius: '14px',
                  padding: '20px'
                }}>
                  <h2 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '12px', color: 'var(--text-1)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>📄</span> Resume & Extracted Skills
                  </h2>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                    <label className="btn btn-secondary" style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '8px 16px', fontSize: '12px' }}>
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
                      Upload New PDF
                      <input type="file" accept="application/pdf" onChange={handleResumeUpload} style={{ display: 'none' }} />
                    </label>
                    {profile.resumeFilename ? (
                      <span style={{ fontSize: '12px', color: '#38bdf8', background: 'rgba(56, 189, 248, 0.1)', padding: '4px 10px', borderRadius: '6px', border: '1px solid rgba(56, 189, 248, 0.2)' }}>
                        ✓ {profile.resumeFilename}
                      </span>
                    ) : (
                      <span style={{ fontSize: '12px', color: 'var(--text-3)' }}>
                        No PDF uploaded yet
                      </span>
                    )}
                  </div>

                  {Array.isArray(profile.skills) && profile.skills.length > 0 && (
                    <div style={{ marginTop: '14px', borderTop: '1px solid rgba(255, 255, 255, 0.06)', paddingTop: '12px' }}>
                      <div style={{ fontSize: '11px', color: 'var(--text-3)', marginBottom: '8px', fontWeight: 600 }}>
                        Extracted Core Skills ({profile.skills.length}):
                      </div>
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        {profile.skills.map((skill, idx) => (
                          <span key={idx} style={{
                            fontSize: '11px',
                            background: 'rgba(255, 255, 255, 0.05)',
                            color: '#cbd5e1',
                            padding: '3px 8px',
                            borderRadius: '4px',
                            border: '1px solid rgba(255, 255, 255, 0.08)'
                          }}>
                            {skill}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* 3. Linked Google Account */}
                <div style={{
                  background: 'rgba(15, 23, 42, 0.65)',
                  border: '1px solid var(--border)',
                  borderRadius: '14px',
                  padding: '20px'
                }}>
                  <h2 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '12px', color: 'var(--text-1)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>🔗</span> Sending Account (Google OAuth)
                  </h2>
                  <div>
                    {profile.emailUser ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                        <div style={{ background: 'rgba(34, 197, 94, 0.15)', color: '#4ade80', padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: 600, border: '1px solid rgba(34, 197, 94, 0.3)' }}>
                          ✓ Connected
                        </div>
                        <span style={{ color: 'var(--text-1)', fontWeight: '500', fontSize: '13px' }}>{profile.emailUser}</span>
                        <button onClick={logout} type="button" className="btn btn-ghost" style={{ marginLeft: 'auto', fontSize: '12px', padding: '4px 10px' }}>Logout</button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                        <span style={{ color: 'var(--text-2)', fontSize: '13px' }}>No account connected.</span>
                        <a href={`${API_BASE}/api/auth/google`} className="btn btn-primary" style={{ textDecoration: 'none', fontSize: '12px', padding: '6px 14px' }}>Connect Google</a>
                      </div>
                    )}
                  </div>
                </div>

              </div>

              {/* RIGHT COLUMN: Full GitHub Portfolio & Deep Architecture Knowledge */}
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <GitHubPortfolioCard profile={profile} syncingGithub={syncingGithub} syncGithub={syncGithub} />
              </div>

            </div>

          </div>
        ) : tab === 'ai_settings' ? (
          <div style={{ padding: '30px', flex: 1, overflowY: 'auto' }}>
            <h2 style={{ fontSize: '24px', fontWeight: 600, marginBottom: '24px', color: 'var(--text-1)' }}>AI Prompt Settings</h2>

            <div style={{ background: 'var(--surface-2)', padding: '24px', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
              <form onSubmit={handleProfileSave} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: 'var(--surface-3)', padding: '16px', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
                  <input
                    type="checkbox"
                    id="enableFlex"
                    checked={profile.enableFlex !== false}
                    onChange={e => setProfile({ ...profile, enableFlex: e.target.checked })}
                    style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                  />
                  <div>
                    <label htmlFor="enableFlex" style={{ display: 'block', fontWeight: '600', color: 'var(--text-1)', cursor: 'pointer' }}>
                      Enable "The Flex" Postscript
                    </label>
                    <div style={{ fontSize: '13px', color: 'var(--text-2)', marginTop: '4px' }}>
                      Appends: <i>"P.S. I'm highly passionate about automation and software engineering—in fact, I built the AI web-scraper and autonomous agent that found this job and drafted this email!"</i>
                    </div>
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: 'var(--text-1)' }}>Custom AI Instructions</label>
                  <div style={{ fontSize: '13px', color: 'var(--text-2)', marginBottom: '8px' }}>Add any custom rules, constraints, or specific formats you want the AI to follow.</div>
                  <textarea
                    className="form-input"
                    style={{ width: '100%', height: '150px', resize: 'vertical' }}
                    placeholder="e.g. Always mention that I am willing to relocate to New York. Do not use words like 'synergy'..."
                    value={profile.aiInstructions || ''}
                    onChange={e => setProfile({ ...profile, aiInstructions: e.target.value })}
                  />
                </div>

                <button type="submit" className="btn btn-primary" style={{ alignSelf: 'flex-start', padding: '10px 24px' }} disabled={savingProfile}>
                  {savingProfile ? <span className="spinner"></span> : 'Save AI Settings'}
                </button>
              </form>
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
                <input name="recipientEmail" type="email" className="form-input" style={{ width: '100%' }} placeholder="e.g. hiring@company.com (Optional — auto-detected from JD if present)" />
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
            {/* Table Header Toolbar & Quick Stats */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: 'rgba(20, 25, 38, 0.7)',
              padding: '10px 16px',
              borderRadius: '12px',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              flexWrap: 'wrap',
              gap: '12px',
              backdropFilter: 'blur(12px)'
            }}>
              {/* Left: Summary Stats & Selection Counter */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-1)' }}>
                  Showing <span style={{ color: '#f87171' }}>{paginatedJobs.length}</span> of {activeJobs.length} jobs
                </div>

                {selectedJobs.length > 0 && (
                  <div style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    background: 'rgba(99, 102, 241, 0.15)',
                    border: '1px solid rgba(99, 102, 241, 0.35)',
                    padding: '3px 10px',
                    borderRadius: '20px',
                    fontSize: '12px',
                    color: '#a5b4fc',
                    fontWeight: 600
                  }}>
                    <span>✓ {selectedJobs.length} selected</span>
                    <button
                      onClick={() => setSelectedJobs([])}
                      style={{ background: 'none', border: 'none', color: '#c7d2fe', cursor: 'pointer', fontSize: '11px', padding: 0 }}
                      title="Clear selection"
                    >
                      Clear
                    </button>
                  </div>
                )}

                {/* Quick Status Pills */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  {tab === 'applications' ? (
                    <>
                      <span style={{
                        fontSize: '11px',
                        padding: '3px 10px',
                        borderRadius: '14px',
                        background: 'rgba(16, 185, 129, 0.12)',
                        color: '#34d399',
                        border: '1px solid rgba(16, 185, 129, 0.3)',
                        fontWeight: 600,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px'
                      }}>
                        ✉️ {activeJobs.filter(j => !!j.emailRecipient).length} Verified Inboxes
                      </span>
                      <span style={{
                        fontSize: '11px',
                        padding: '3px 10px',
                        borderRadius: '14px',
                        background: 'rgba(56, 189, 248, 0.12)',
                        color: '#38bdf8',
                        border: '1px solid rgba(56, 189, 248, 0.3)',
                        fontWeight: 600,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px'
                      }}>
                        🛡️ {activeJobs.filter(j => j.deliverabilityStatus === 'undeliverable').length} Protected
                      </span>
                    </>
                  ) : (
                    <>
                      <span style={{
                        fontSize: '11px',
                        padding: '3px 10px',
                        borderRadius: '14px',
                        background: 'rgba(59, 130, 246, 0.12)',
                        color: '#60a5fa',
                        border: '1px solid rgba(59, 130, 246, 0.3)',
                        fontWeight: 600
                      }}>
                        ✉️ {activeJobs.filter(j => (j.status || '').toLowerCase() === 'sent').length} Sent
                      </span>
                      <span style={{
                        fontSize: '11px',
                        padding: '3px 10px',
                        borderRadius: '14px',
                        background: 'rgba(168, 85, 247, 0.12)',
                        color: '#c084fc',
                        border: '1px solid rgba(168, 85, 247, 0.3)',
                        fontWeight: 600
                      }}>
                        📬 {activeJobs.filter(j => (j.status || '').toLowerCase() === 'opened').length} Opened
                      </span>
                      <span style={{
                        fontSize: '11px',
                        padding: '3px 10px',
                        borderRadius: '14px',
                        background: 'rgba(16, 185, 129, 0.12)',
                        color: '#34d399',
                        border: '1px solid rgba(16, 185, 129, 0.3)',
                        fontWeight: 600
                      }}>
                        💬 {activeJobs.filter(j => (j.status || '').toLowerCase() === 'replied').length} Replied
                      </span>
                      <span style={{
                        fontSize: '11px',
                        padding: '3px 10px',
                        borderRadius: '14px',
                        background: 'rgba(239, 68, 68, 0.12)',
                        color: '#f87171',
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                        fontWeight: 600
                      }}>
                        🔴 {activeJobs.filter(j => (j.status || '').toLowerCase() === 'bounced').length} Bounced
                      </span>
                    </>
                  )}
                </div>
              </div>

              {/* Right: Quick Action Buttons & Pagination */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                {selectedJobs.length > 0 && (
                  <>
                    <button
                      className="btn btn-primary"
                      onClick={() => handleBatchSend()}
                      disabled={fetching}
                      style={{ padding: '6px 14px', fontSize: '12px' }}
                    >
                      Batch Apply ({selectedJobs.length}) 🚀
                    </button>
                    <button
                      className="btn btn-primary"
                      onClick={() => handleBatchDelete()}
                      disabled={fetching}
                      style={{ background: 'var(--error)', borderColor: 'var(--error)', padding: '6px 12px', fontSize: '12px' }}
                    >
                      Delete ({selectedJobs.length})
                    </button>
                  </>
                )}

                {tab === 'applied' && (
                  <button
                    className="btn btn-secondary"
                    onClick={exportToCSV}
                    style={{ padding: '6px 12px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}
                    title="Export applied jobs to CSV spreadsheet"
                  >
                    <span>📥 Export CSV</span>
                  </button>
                )}

                {totalPages > 1 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text-3)' }}>
                    <span>Page {currentPage} / {totalPages}</span>
                    <button
                      className="btn btn-ghost"
                      disabled={currentPage === 1}
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      style={{ padding: '4px 8px', fontSize: '11px' }}
                    >
                      ◀
                    </button>
                    <button
                      className="btn btn-ghost"
                      disabled={currentPage === totalPages}
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      style={{ padding: '4px 8px', fontSize: '11px' }}
                    >
                      ▶
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Table Container */}
            <div className="table-wrapper">
              {loading ? (
                <div>
                  <table className="applications-table">
                    <thead>
                      <tr>
                        <th style={{ width: '38px', textAlign: 'center' }}>
                          <span className="skeleton-box" style={{ width: 14, height: 14, borderRadius: 3 }} />
                        </th>
                        <th style={{ width: tab === 'applications' ? '18%' : '20%' }}>Company</th>
                        <th style={{ width: tab === 'applications' ? '22%' : '24%' }}>Role & Level</th>
                        <th style={{ width: tab === 'applications' ? '22%' : '24%' }}>{tab === 'applications' ? 'Contact & Mailbox' : 'Recipient & Status'}</th>
                        <th style={{ width: tab === 'applications' ? '14%' : '17%' }}>Location</th>
                        {tab === 'applications' && <th style={{ width: '10%' }}>Package</th>}
                        <th style={{ width: tab === 'applications' ? '9%' : '10%' }}>{tab === 'applied' ? 'Date Applied' : 'Date Found'}</th>
                        <th style={{ width: '95px', textAlign: 'center' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[1, 2, 3, 4, 5, 6].map((i) => (
                        <tr key={i} className="skeleton-row">
                          <td style={{ textAlign: 'center' }}>
                            <span className="skeleton-box" style={{ width: 14, height: 14, borderRadius: 3 }} />
                          </td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <span className="skeleton-box" style={{ width: 34, height: 34, borderRadius: '50%', flexShrink: 0 }} />
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '70%' }}>
                                <span className="skeleton-box" style={{ width: `${60 + (i % 3) * 15}%`, height: 13 }} />
                                <span className="skeleton-box" style={{ width: '45px', height: 10, borderRadius: 10 }} />
                              </div>
                            </div>
                          </td>
                          <td>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                              <span className="skeleton-box" style={{ width: `${70 + (i % 4) * 8}%`, height: 14 }} />
                              <span className="skeleton-box" style={{ width: 50, height: 12, borderRadius: 10 }} />
                            </div>
                          </td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span className="skeleton-box" style={{ width: 80, height: 24, borderRadius: 6 }} />
                            </div>
                          </td>
                          <td>
                            <span className="skeleton-box" style={{ width: `${65 + (i % 2) * 20}%`, height: 13 }} />
                          </td>
                          {tab === 'applications' && (
                            <td>
                              <span className="skeleton-box" style={{ width: 50, height: 13 }} />
                            </td>
                          )}
                          <td>
                            <span className="skeleton-box" style={{ width: 60, height: 13 }} />
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <div style={{ display: 'flex', justifyContent: 'center', gap: 6 }}>
                              <span className="skeleton-box" style={{ width: 22, height: 22, borderRadius: 4 }} />
                              <span className="skeleton-box" style={{ width: 22, height: 22, borderRadius: 4 }} />
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '10px',
                    padding: '24px',
                    color: 'var(--text-3)',
                    fontSize: '13px',
                    fontWeight: 500,
                    borderTop: '1px solid rgba(255, 255, 255, 0.05)'
                  }}>
                    <span className="spinner" style={{ width: 16, height: 16, borderColor: 'rgba(239, 68, 68, 0.3)', borderTopColor: '#ef4444' }}></span>
                    <span>Scanning live job boards & recruiter networks across {locationFilter || 'All India'}...</span>
                  </div>
                </div>
              ) : activeJobs.length === 0 ? (
                <div className="empty-state" style={{ padding: '80px 24px' }}>
                  <div className="empty-icon" style={{ fontSize: '46px' }}>🧭</div>
                  <h3 style={{ fontSize: '20px', fontWeight: 700, margin: 0, color: 'var(--text-1)' }}>No Jobs Match Your Criteria</h3>
                  <p style={{ margin: 0, color: 'var(--text-3)', fontSize: '13px', maxWidth: '400px' }}>
                    No active listings match your current role or location filters in {locationFilter || 'All India'}. You can scrape fresh jobs or reset your search.
                  </p>
                  <div style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
                    <button
                      className="btn btn-primary"
                      onClick={handleFetchJobs}
                      disabled={fetching}
                      style={{
                        padding: '8px 18px',
                        fontSize: '13px',
                        fontWeight: 600,
                        background: 'linear-gradient(135deg, #ef4444 0%, #ea580c 100%)',
                        boxShadow: '0 4px 14px rgba(239, 68, 68, 0.3)'
                      }}
                    >
                      🚀 Auto-Scrape Fresh Jobs
                    </button>
                    {(search || filter !== 'all' || experienceFilter !== 'All' || (locationFilter && locationFilter !== 'All India')) && (
                      <button
                        className="btn btn-secondary"
                        onClick={() => {
                          setSearch('');
                          setFilter('all');
                          setExperienceFilter('All');
                          setLocationFilter('All India');
                        }}
                        style={{ padding: '8px 16px', fontSize: '13px' }}
                      >
                        🔄 Reset All Filters
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <table className="applications-table">
                  <thead>
                    <tr>
                      <th style={{ width: '38px', textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          onChange={(e) => {
                            const activeIds = activeJobs.map(j => j.id || j._id).filter(Boolean);
                            if (e.target.checked) {
                              setSelectedJobs(prev => [...new Set([...prev, ...activeIds])]);
                            } else {
                              const activeSet = new Set(activeIds);
                              setSelectedJobs(prev => prev.filter(id => !activeSet.has(id)));
                            }
                          }}
                          checked={activeJobs.length > 0 && activeJobs.every(j => selectedJobs.includes(j.id || j._id))}
                          title={activeJobs.length > 0 && activeJobs.every(j => selectedJobs.includes(j.id || j._id)) ? "Deselect all filtered jobs" : "Select all filtered jobs"}
                        />
                      </th>
                      <th style={{ width: tab === 'applications' ? '18%' : '20%' }}>Company</th>
                      <th style={{ width: tab === 'applications' ? '22%' : '24%' }}>Role & Level</th>
                      <th style={{ width: tab === 'applications' ? '22%' : '24%' }}>{tab === 'applications' ? 'Contact & Mailbox' : 'Recipient & Status'}</th>
                      <th style={{ width: tab === 'applications' ? '14%' : '17%' }}>Location</th>
                      {tab === 'applications' && <th style={{ width: '10%' }}>Package</th>}
                      <th style={{ width: tab === 'applications' ? '9%' : '10%' }}>{tab === 'applied' ? 'Date Applied' : 'Date Found'}</th>
                      <th style={{ width: '95px', textAlign: 'center' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedJobs.map(job => {
                      const jobId = job.id || job._id;
                      const isSelected = selectedJobs.includes(jobId) || selectedJobs.includes(job.id) || (job._id && selectedJobs.includes(job._id));
                      const dateInfo = formatTableDate(
                        tab === 'applied'
                          ? (job.sentAt || job.updatedAt || job.createdAt)
                          : (job.createdAt || job.publishedAt)
                      );
                      const { title, meta } = parseRoleDisplay(job.role);
                      const level = getJobLevel(job);
                      const pkg = extractPackage(job.salary, job.jd);
                      const workMode = extractWorkMode(job.location, job.jd);

                      return (
                        <tr className={`table-row ${isSelected ? 'selected-row' : ''}`} key={jobId}>
                          {/* Checkbox */}
                          <td style={{ textAlign: 'center' }}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelectJob(jobId)}
                            />
                          </td>

                          {/* Company Column */}
                          <td>
                            <div className="company-cell">
                              <div className="company-avatar">
                                {(job.company || 'XX').substring(0, 2).toUpperCase()}
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', minWidth: 0, flex: 1, overflow: 'hidden', gap: '2px' }}>
                                <span style={{ fontWeight: 600, color: 'var(--text-1)', fontSize: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', width: '100%' }} title={job.company || 'Unknown Company'}>
                                  {job.company || 'Unknown Company'}
                                </span>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'nowrap', overflow: 'hidden', maxWidth: '100%' }}>
                                  {job.source && job.source !== 'Manual' && (
                                    <span className={`source-pill source-${(job.source || '').toLowerCase()}`} style={{ fontSize: '10px', padding: '1px 5px', flexShrink: 0 }}>
                                      <img
                                        src={`https://www.google.com/s2/favicons?domain=${(job.source || '').toLowerCase()}.com&sz=16`}
                                        alt={job.source}
                                        style={{ width: 10, height: 10, borderRadius: '2px' }}
                                        onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                      />
                                      {job.source}
                                    </span>
                                  )}
                                  {job.hrName && (
                                    <span style={{ fontSize: '11px', color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={job.hrName}>
                                      👤 {job.hrName}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* Role & Level Column */}
                          <td className="role-cell">
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', alignItems: 'flex-start', minWidth: 0, overflow: 'hidden' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', maxWidth: '100%', minWidth: 0 }}>
                                <span style={{ fontWeight: 600, color: 'var(--text-1)', fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={title}>
                                  {title}
                                </span>
                                <span className={`level-pill ${level === 'Senior' ? 'level-senior' : level === 'Junior' ? 'level-junior' : 'level-mid'}`} style={{ fontSize: '10px', padding: '1px 5px', flexShrink: 0 }}>
                                  {level === 'Junior' ? '🟢 Jr' : level === 'Senior' ? '🟣 Sr' : '🟡 Mid'}
                                </span>
                              </div>
                              {meta.length > 0 && (
                                <div style={{ display: 'flex', gap: '3px', flexWrap: 'nowrap', overflow: 'hidden', maxWidth: '100%' }}>
                                  {meta.slice(0, 2).map((m, idx) => (
                                    <span key={idx} style={{ fontSize: '10px', background: 'var(--surface-3)', color: 'var(--text-3)', padding: '1px 4px', borderRadius: '4px', border: '1px solid var(--border)', whiteSpace: 'nowrap' }}>
                                      {m}
                                    </span>
                                  ))}
                                  {meta.length > 2 && (
                                    <span style={{ fontSize: '10px', color: 'var(--text-3)' }}>+{meta.length - 2}</span>
                                  )}
                                </div>
                              )}
                            </div>
                          </td>

                          {/* Contact & Mailbox Column (Applications) OR Recipient & Status (Applied) */}
                          <td style={{ minWidth: 0, overflow: 'hidden' }}>
                            {tab === 'applications' ? (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-start', minWidth: 0, maxWidth: '100%' }}>
                                {job.emailRecipient ? (
                                  <>
                                    <div style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '5px',
                                      background: 'var(--surface-3)',
                                      border: '1px solid var(--border)',
                                      padding: '2px 6px',
                                      borderRadius: '6px',
                                      fontFamily: 'monospace',
                                      fontSize: '11px',
                                      color: 'var(--text-1)',
                                      maxWidth: '100%',
                                      minWidth: 0
                                    }}>
                                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={job.emailRecipient}>
                                        {job.emailRecipient}
                                      </span>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          navigator.clipboard.writeText(job.emailRecipient);
                                          setCopiedEmailJobId(job.id);
                                          setTimeout(() => setCopiedEmailJobId(null), 2000);
                                        }}
                                        style={{
                                          background: 'none',
                                          border: 'none',
                                          cursor: 'pointer',
                                          padding: '0 2px',
                                          color: copiedEmailJobId === job.id ? '#10b981' : 'var(--text-3)',
                                          display: 'flex',
                                          alignItems: 'center',
                                          flexShrink: 0
                                        }}
                                        title="Copy Email Address"
                                      >
                                        {copiedEmailJobId === job.id ? (
                                          <span style={{ fontSize: '10px', color: '#10b981', fontWeight: 600 }}>✓</span>
                                        ) : (
                                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                                          </svg>
                                        )}
                                      </button>
                                    </div>

                                    {/* Deliverability Badge */}
                                    {(() => {
                                      const status = job.deliverabilityStatus || (job.deliverabilityScore >= 60 ? 'deliverable' : 'unverified');
                                      const score = job.deliverabilityScore || (status === 'deliverable' ? 85 : 0);

                                      if (status === 'deliverable') {
                                        return (
                                          <span style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '3px',
                                            fontSize: '10px',
                                            fontWeight: 600,
                                            padding: '1px 5px',
                                            borderRadius: '10px',
                                            background: 'rgba(16, 185, 129, 0.12)',
                                            color: '#10b981',
                                            border: '1px solid rgba(16, 185, 129, 0.3)',
                                            whiteSpace: 'nowrap'
                                          }} title={job.deliverabilityReason || 'Verified deliverable inbox'}>
                                            🟢 {score}% Verified
                                          </span>
                                        );
                                      }
                                      if (status === 'risky') {
                                        return (
                                          <span style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '3px',
                                            fontSize: '10px',
                                            fontWeight: 600,
                                            padding: '1px 5px',
                                            borderRadius: '10px',
                                            background: 'rgba(245, 158, 11, 0.12)',
                                            color: '#f59e0b',
                                            border: '1px solid rgba(245, 158, 11, 0.3)',
                                            whiteSpace: 'nowrap'
                                          }} title={job.deliverabilityReason || 'Catch-all or risky mailbox'}>
                                            🟡 {score}% Risky
                                          </span>
                                        );
                                      }
                                      return (
                                        <span style={{
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          gap: '3px',
                                          fontSize: '10px',
                                          fontWeight: 600,
                                          padding: '1px 5px',
                                          borderRadius: '10px',
                                          background: 'rgba(239, 68, 68, 0.12)',
                                          color: '#ef4444',
                                          border: '1px solid rgba(239, 68, 68, 0.3)',
                                          whiteSpace: 'nowrap'
                                        }} title={job.deliverabilityReason || 'Address failed verification'}>
                                          🔴 Protected
                                        </span>
                                      );
                                    })()}
                                  </>
                                ) : (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'nowrap', maxWidth: '100%' }}>
                                    {job.deliverabilityStatus === 'undeliverable' ? (
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', alignItems: 'flex-start' }}>
                                        <span style={{
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          gap: '3px',
                                          fontSize: '10px',
                                          fontWeight: 600,
                                          padding: '1px 6px',
                                          borderRadius: '10px',
                                          background: 'rgba(239, 68, 68, 0.12)',
                                          color: '#ef4444',
                                          border: '1px solid rgba(239, 68, 68, 0.3)',
                                          whiteSpace: 'nowrap'
                                        }} title={job.deliverabilityReason || 'No verified recipient mailbox found'}>
                                          🛡️ No Mailbox
                                        </span>
                                        <button
                                          className="btn btn-ghost"
                                          disabled={discoveringHrId === job.id}
                                          onClick={() => handleDeepDiscoverHrEmail(job)}
                                          style={{
                                            fontSize: '10px',
                                            padding: '1px 4px',
                                            color: 'var(--text-3)',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '2px',
                                            whiteSpace: 'nowrap'
                                          }}
                                          title="Retry deep email search"
                                        >
                                          {discoveringHrId === job.id ? <span className="spinner" style={{ width: 8, height: 8 }}></span> : '↺ Retry'}
                                        </button>
                                      </div>
                                    ) : (
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'nowrap' }}>
                                        <span style={{
                                          fontSize: '10px',
                                          color: 'var(--text-3)',
                                          background: 'var(--surface-3)',
                                          padding: '2px 5px',
                                          borderRadius: '8px',
                                          border: '1px solid var(--border)',
                                          whiteSpace: 'nowrap'
                                        }}>
                                          Uninspected
                                        </span>
                                        <button
                                          className="btn btn-secondary"
                                          disabled={discoveringHrId === job.id}
                                          onClick={() => handleDeepDiscoverHrEmail(job)}
                                          style={{
                                            fontSize: '10px',
                                            padding: '2px 6px',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '2px',
                                            borderColor: 'var(--accent)',
                                            color: 'var(--accent)',
                                            whiteSpace: 'nowrap'
                                          }}
                                          title="Find & verify recipient email"
                                        >
                                          {discoveringHrId === job.id ? (
                                            <span className="spinner" style={{ width: 8, height: 8 }}></span>
                                          ) : (
                                            <span>⚡ Find HR</span>
                                          )}
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            ) : (
                              /* Applied Tab Contact & Status Cell */
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', alignItems: 'flex-start', minWidth: 0, maxWidth: '100%' }}>
                                {job.emailRecipient && (
                                  <div style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '3px',
                                    fontSize: '11px',
                                    fontFamily: 'monospace',
                                    color: 'var(--text-2)',
                                    maxWidth: '100%',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap'
                                  }} title={job.emailRecipient}>
                                    <span>✉️ {job.emailRecipient}</span>
                                  </div>
                                )}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'nowrap', maxWidth: '100%' }}>
                                  {(job.status || '').startsWith('LinkedIn') ? (
                                    <select
                                      value={job.status}
                                      onChange={(e) => updateStatus(job.id, e.target.value)}
                                      style={{
                                        fontSize: '10px',
                                        fontWeight: 600,
                                        padding: '2px 4px',
                                        borderRadius: '6px',
                                        background: 'rgba(10, 102, 194, 0.15)',
                                        color: '#38bdf8',
                                        border: '1px solid rgba(10, 102, 194, 0.4)',
                                        cursor: 'pointer'
                                      }}
                                      title="Change LinkedIn Status"
                                    >
                                      <option value="LinkedIn_Sent" style={{ background: 'var(--surface-2)', color: 'var(--text-1)' }}>💼 Sent</option>
                                      <option value="LinkedIn_Connected" style={{ background: 'var(--surface-2)', color: 'var(--text-1)' }}>🤝 Connected</option>
                                      <option value="LinkedIn_Replied" style={{ background: 'var(--surface-2)', color: 'var(--text-1)' }}>💬 Replied</option>
                                    </select>
                                  ) : (
                                    <span className={`badge ${(job.status || 'applied').toLowerCase()}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '10px', padding: '1px 6px', whiteSpace: 'nowrap' }}>
                                      {(job.status || '').toLowerCase() === 'bounced' ? '🔴 Bounced' :
                                        (job.status || '').toLowerCase() === 'sent' ? '✉️ Sent' :
                                          (job.status || '').toLowerCase() === 'opened' ? '📬 Opened' :
                                            (job.status || '').toLowerCase() === 'replied' ? '💬 Replied' : (job.status || 'Applied')}
                                    </span>
                                  )}

                                  {job.tracked && (
                                    <span style={{ fontSize: '11px', cursor: 'help' }} title="Link Tracking Enabled">
                                      🎯
                                    </span>
                                  )}

                                  {job.clickedLinks && job.clickedLinks.length > 0 && (
                                    <div style={{ display: 'inline-flex', gap: '3px', alignItems: 'center', background: 'var(--surface-3)', padding: '1px 5px', borderRadius: '10px', border: '1px solid var(--border)' }}>
                                      {(() => {
                                        const counts = job.clickedLinks.reduce((acc, link) => {
                                          if (link.includes('linkedin.com')) acc.linkedin = (acc.linkedin || 0) + 1;
                                          else if (link.includes('github.com')) acc.github = (acc.github || 0) + 1;
                                          else if (link.includes('resume-pdf')) acc.resume = (acc.resume || 0) + 1;
                                          else if ((props.profile?.portfolio && link.includes(props.profile.portfolio.replace(/^https?:\/\//, ''))) || link.includes('portfolio') || link.includes('vercel.app')) acc.portfolio = (acc.portfolio || 0) + 1;
                                          else acc.other = (acc.other || 0) + 1;
                                          return acc;
                                        }, {});
                                        return Object.entries(counts).map(([type, count], idx) => {
                                          let icon = null;
                                          let titleStr = "";
                                          if (type === 'linkedin') {
                                            icon = <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="#0a66c2"><path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z" /></svg>;
                                            titleStr = "LinkedIn Clicked";
                                          } else if (type === 'github') {
                                            icon = <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" /></svg>;
                                            titleStr = "GitHub Clicked";
                                          } else if (type === 'portfolio') {
                                            icon = <span style={{ fontSize: '10px' }}>🌐</span>;
                                            titleStr = "Portfolio Clicked";
                                          } else if (type === 'resume') {
                                            icon = <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>;
                                            titleStr = "Resume Downloaded";
                                          } else {
                                            icon = <span style={{ fontSize: '10px' }}>🔗</span>;
                                            titleStr = "Link Clicked";
                                          }
                                          return (
                                            <span key={idx} title={`${titleStr} (${count}x)`} style={{ cursor: 'help', display: 'flex', alignItems: 'center', gap: '1px' }}>
                                              {icon}
                                              {count > 1 && <span style={{ fontSize: '8px', color: 'var(--text-3)', fontWeight: '600' }}>x{count}</span>}
                                            </span>
                                          );
                                        });
                                      })()}
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                          </td>

                          {/* Location & Mode Column */}
                          <td style={{ minWidth: 0, overflow: 'hidden' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', alignItems: 'flex-start', minWidth: 0, maxWidth: '100%' }}>
                              <span style={{ fontSize: '12px', color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%' }} title={job.location || 'India'}>
                                📍 {job.location || 'India'}
                              </span>
                              {workMode && (
                                <span style={{
                                  fontSize: '10px',
                                  fontWeight: 500,
                                  padding: '1px 5px',
                                  borderRadius: '6px',
                                  background: workMode === 'Remote' ? 'rgba(16, 185, 129, 0.1)' : workMode === 'Hybrid' ? 'rgba(56, 189, 248, 0.1)' : 'var(--surface-3)',
                                  color: workMode === 'Remote' ? '#34d399' : workMode === 'Hybrid' ? '#38bdf8' : 'var(--text-3)',
                                  border: `1px solid ${workMode === 'Remote' ? 'rgba(16, 185, 129, 0.25)' : workMode === 'Hybrid' ? 'rgba(56, 189, 248, 0.25)' : 'var(--border)'}`,
                                  whiteSpace: 'nowrap'
                                }}>
                                  {workMode === 'Remote' ? '🏠 Remote' : workMode === 'Hybrid' ? '🏢 Hybrid' : '🏢 On-site'}
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Package Column (Applications Tab Only) */}
                          {tab === 'applications' && (
                            <td style={{ minWidth: 0, overflow: 'hidden' }}>
                              {pkg ? (
                                <span style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '3px',
                                  background: 'rgba(16, 185, 129, 0.12)',
                                  color: '#10b981',
                                  border: '1px solid rgba(16, 185, 129, 0.25)',
                                  padding: '2px 6px',
                                  borderRadius: '10px',
                                  fontSize: '10px',
                                  fontWeight: 600,
                                  whiteSpace: 'nowrap',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  maxWidth: '100%'
                                }} title={pkg}>
                                  💰 {pkg}
                                </span>
                              ) : (
                                <span style={{ fontSize: '11px', color: 'var(--text-3)', fontStyle: 'italic' }}>
                                  —
                                </span>
                              )}
                            </td>
                          )}

                          {/* Date Column */}
                          <td style={{ minWidth: 0, overflow: 'hidden' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', whiteSpace: 'nowrap' }}>
                              <span style={{ fontSize: '11px', fontWeight: dateInfo.isRecent ? 600 : 500, color: dateInfo.isRecent ? 'var(--accent)' : 'var(--text-1)' }}>
                                {dateInfo.date}
                              </span>
                              {dateInfo.time && (
                                <span style={{ fontSize: '10px', color: 'var(--text-3)' }}>
                                  {dateInfo.time}
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Actions Column */}
                          <td style={{ width: '95px', textAlign: 'center', padding: '10px 4px' }}>
                            <div style={{ display: 'flex', flexDirection: 'row', gap: '2px', alignItems: 'center', justifyContent: 'center' }}>
                              {/* View Details Modal */}
                              <button
                                className="icon-btn"
                                title="View Full Job Description"
                                onClick={() => setSelectedJobDetails(job)}
                                style={{ color: '#38bdf8', padding: '4px' }}
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                                  <circle cx="12" cy="12" r="3" />
                                </svg>
                              </button>

                              {/* External Apply Link */}
                              {job.applyLink && (
                                <button
                                  className="icon-btn"
                                  title="Open External Job Posting"
                                  onClick={() => window.open(job.applyLink, '_blank')}
                                  style={{ color: 'var(--text-2)', padding: '4px' }}
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                                    <polyline points="15 3 21 3 21 9"></polyline>
                                    <line x1="10" y1="14" x2="21" y2="3"></line>
                                  </svg>
                                </button>
                              )}

                              {/* HR LinkedIn */}
                              {job.hrLinkedIn && (
                                <button
                                  className="icon-btn"
                                  title="Open Recruiter's LinkedIn"
                                  onClick={() => window.open(job.hrLinkedIn, '_blank')}
                                  style={{ color: '#0a66c2', padding: '4px' }}
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z" />
                                  </svg>
                                </button>
                              )}

                              {/* Email Draft / Sent Mail */}
                              {(job.emailDraft || job.status === 'Sent' || job.status === 'Opened') && (
                                <button
                                  className="icon-btn"
                                  title={job.status === 'Sent' || job.status === 'Opened' ? "View Sent Email" : "View AI Email Draft"}
                                  onClick={() => setSelectedMail(job)}
                                  style={{ color: '#818cf8', padding: '4px' }}
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <rect width="20" height="16" x="2" y="4" rx="2"></rect>
                                    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"></path>
                                  </svg>
                                </button>
                              )}

                              {/* Delete Button */}
                              <button
                                className="icon-btn text-danger"
                                title="Delete Job"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDelete(job.id || job._id);
                                }}
                                style={{ padding: '4px' }}
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="3 6 5 6 21 6"></polyline>
                                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                  <line x1="10" y1="11" x2="10" y2="17"></line>
                                  <line x1="14" y1="11" x2="14" y2="17"></line>
                                </svg>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}

              {/* Table Footer with Pagination & Jobs Per Page Selector */}
              {activeJobs.length > 0 && (
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '12px 20px',
                  borderTop: '1px solid var(--border)',
                  background: 'var(--surface-2)',
                  flexWrap: 'wrap',
                  gap: '12px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '13px', color: 'var(--text-3)' }}>
                      Showing <strong style={{ color: 'var(--text-1)' }}>{(currentPage - 1) * itemsPerPage + 1}–{Math.min(currentPage * itemsPerPage, activeJobs.length)}</strong> of <strong style={{ color: 'var(--text-1)' }}>{activeJobs.length}</strong> jobs
                    </span>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '12px', color: 'var(--text-3)' }}>Jobs per page:</span>
                      <select
                        value={itemsPerPage}
                        onChange={(e) => {
                          setItemsPerPage(Number(e.target.value));
                          setCurrentPage(1);
                        }}
                        style={{
                          padding: '3px 8px',
                          fontSize: '12px',
                          borderRadius: '6px',
                          background: 'var(--surface-3)',
                          color: 'var(--text-1)',
                          border: '1px solid var(--border)',
                          cursor: 'pointer',
                          outline: 'none',
                          fontWeight: 500
                        }}
                      >
                        <option value={10}>10</option>
                        <option value={20}>20</option>
                        <option value={30}>30</option>
                        <option value={50}>50</option>
                        <option value={100}>100</option>
                      </select>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <button
                      className="btn btn-secondary"
                      disabled={currentPage <= 1}
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      style={{ padding: '5px 12px', fontSize: '12px' }}
                    >
                      Previous
                    </button>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-2)', padding: '0 4px' }}>
                      Page {currentPage} of {Math.max(1, totalPages)}
                    </span>
                    <button
                      className="btn btn-secondary"
                      disabled={currentPage >= totalPages}
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      style={{ padding: '5px 12px', fontSize: '12px' }}
                    >
                      Next
                    </button>
                  </div>
                </div>
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
              {selectedMail.emailDraft || 'No draft saved for this job.'}
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
              {selectedJobDetails.jd || 'No job description available.'}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
