import React from 'react';
import { NAV, API_BASE } from './useAppLogic.jsx';

function FollowUpRow({ job, f, API_BASE, token, setJobs, jobs, notify }) {
  const [expanded, setExpanded] = React.useState(false);
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
            {f.draft.replace(/\n/g, ' ')}
          </div>
        </div>

        {/* Right: Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexShrink: 0, paddingLeft: '16px' }}>
          <button
            className="btn btn-primary"
            style={{ padding: '6px 16px', fontSize: '13px', borderRadius: '8px' }}
            onClick={async (e) => {
              e.stopPropagation();
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
                notify('Failed to send follow-up', 'error');
              }
            }}
          >
            Send ✈️
          </button>
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
              const isError = log.includes('Error') || log.includes('Failed');
              const isSuccess = log.includes('Successfully');
              let color = '#00ff00';
              if (isError) color = '#ff0000';
              if (isSuccess) color = '#00aaff';
              return (
                <div key={idx} style={{ fontSize: '12px', color, lineHeight: 1.4 }}>
                  <span style={{ color: '#555' }}>$</span> {log}
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
    handleDelete,
    handleBatchDelete,
    updateStatus,
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
    setAppliedViewType
  } = props;

  const [activeReplyIndex, setActiveReplyIndex] = React.useState(null);
  const [draftOptions, setDraftOptions] = React.useState([]);
  const [selectedDraft, setSelectedDraft] = React.useState('');
  const [sendingReply, setSendingReply] = React.useState(false);

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
          <div className="header-actions">
            {tab === 'applications' && (
              <select className="form-input" style={{ width: 'auto', padding: '6px 12px' }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="All">All Statuses</option>
                <option value="Found">Found</option>
                <option value="Drafting">Drafting</option>
              </select>
            )}

            {tab === 'applied' && (
              <div style={{ display: 'flex', background: 'var(--surface-3)', borderRadius: '20px', padding: '4px', gap: '4px', border: '1px solid var(--border)' }}>
                {['All', 'Jobs', 'HR'].map(type => (
                  <button
                    key={type}
                    onClick={() => setAppliedViewType(type)}
                    style={{
                      padding: '4px 16px',
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

            <button className="btn btn-ghost theme-toggle" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} title="Toggle Theme">
              {theme === 'dark' ? '☀️' : '🌙'}
            </button>
            <button
              className="btn btn-ghost"
              style={{ fontSize: '14px', padding: '8px 16px', marginRight: '10px', color: 'var(--error)' }}
              onClick={logout}
            >
              Logout
            </button>
            {(tab === 'applications' || tab === 'applied') && (
              <>
                {tab === 'applications' && (
                  <select
                    className="form-input"
                    style={{ width: '140px', padding: '6px 12px', marginRight: '10px' }}
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                  >
                    <option value="All">All Statuses</option>
                    <option value="Found">Found</option>
                    <option value="Drafting">Drafting</option>
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
              </>
            )}
          </div>
        </div>

        {tab === 'inbox' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--surface-1)', overflow: 'hidden' }}>

            {/* Inbox Header */}
            <div style={{ padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                {activeReplyIndex !== null && (
                  <button
                    className="btn btn-ghost"
                    onClick={() => {
                      setActiveReplyIndex(null);
                      setDraftOptions([]);
                      setSelectedDraft('');
                    }}
                    style={{ padding: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
                  </button>
                )}
                <h2 style={{ fontSize: '20px', fontWeight: 500, margin: 0 }}>Smart Inbox</h2>
              </div>
              <button className="btn btn-ghost" onClick={props.fetchInbox} disabled={props.inboxLoading} style={{ padding: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                {props.inboxLoading ? <span className="spinner"></span> : <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /></svg>}
              </button>
            </div>

            {/* Content Area */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {props.inboxLoading && (!props.inboxReplies || props.inboxReplies.length === 0) ? (
                <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-3)' }}>Loading inbox...</div>
              ) : props.inboxReplies && props.inboxReplies.length > 0 ? (

                activeReplyIndex !== null ? (
                  /* --- Detail View --- */
                  <div style={{ padding: '32px 48px', maxWidth: '900px', margin: '0 auto' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
                      <h1 style={{ fontSize: '24px', fontWeight: 400, color: 'var(--text-1)', margin: 0 }}>
                        {props.inboxReplies[activeReplyIndex].subject}
                      </h1>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        {!(props.inboxReplies[activeReplyIndex].threadMessages && props.inboxReplies[activeReplyIndex].threadMessages.length > 0 && props.inboxReplies[activeReplyIndex].threadMessages[props.inboxReplies[activeReplyIndex].threadMessages.length - 1].isMe) && (
                          <button
                            className="btn btn-primary"
                            style={{ fontSize: '13px', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '8px' }}
                            onClick={async (e) => {
                              const btn = e.target;
                              const originalText = btn.innerHTML;
                              btn.innerText = 'Drafting...';
                              btn.disabled = true;
                              try {
                                const res = await fetch(`${API_BASE}/api/inbox/draft-reply`, {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token') || ''}` },
                                  body: JSON.stringify({
                                    from: props.inboxReplies[activeReplyIndex].from,
                                    subject: props.inboxReplies[activeReplyIndex].subject,
                                    body: props.inboxReplies[activeReplyIndex].body
                                  })
                                });
                                const data = await res.json();
                                if (data.drafts && data.drafts.length > 0) {
                                  setDraftOptions(data.drafts);
                                  setSelectedDraft(data.drafts[0]);
                                } else {
                                  notify('Failed to generate drafts.', 'error');
                                }
                              } catch (err) {
                                notify('Error generating draft.', 'error');
                              }
                              btn.innerHTML = originalText;
                              btn.disabled = false;
                            }}
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" /></svg>
                            Draft Reply with AI
                          </button>
                        )}
                      </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                      {props.inboxReplies[activeReplyIndex].threadMessages && props.inboxReplies[activeReplyIndex].threadMessages.length > 0 ? (
                        props.inboxReplies[activeReplyIndex].threadMessages.map((tMsg, idx) => (
                          <div key={idx} style={{
                            padding: '16px',
                            borderRadius: '8px',
                            background: tMsg.isMe ? 'var(--surface-2)' : 'var(--surface-1)',
                            border: '1px solid var(--border)',
                            marginLeft: tMsg.isMe ? '40px' : '0',
                            marginRight: tMsg.isMe ? '0' : '40px'
                          }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                              <span style={{ fontWeight: 600, fontSize: '13px' }}>{tMsg.from}</span>
                              <span style={{ fontSize: '12px', color: 'var(--text-3)' }}>{tMsg.date}</span>
                            </div>
                            <div style={{ fontSize: '14px', lineHeight: '1.6', whiteSpace: 'pre-wrap', color: 'var(--text-1)', wordBreak: 'break-word', overflowWrap: 'break-word' }}>
                              {tMsg.body}
                            </div>
                          </div>
                        ))
                      ) : (
                        <div style={{
                          padding: '16px',
                          borderRadius: '8px',
                          background: 'var(--surface-1)',
                          border: '1px solid var(--border)'
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                            <span style={{ fontWeight: 600, fontSize: '13px' }}>{props.inboxReplies[activeReplyIndex].from}</span>
                            <span style={{ fontSize: '12px', color: 'var(--text-3)' }}>{props.inboxReplies[activeReplyIndex].date}</span>
                          </div>
                          <div style={{ fontSize: '14px', lineHeight: '1.6', whiteSpace: 'pre-wrap', color: 'var(--text-1)', wordBreak: 'break-word', overflowWrap: 'break-word' }}>
                            {props.inboxReplies[activeReplyIndex].body || props.inboxReplies[activeReplyIndex].snippet}
                          </div>
                        </div>
                      )}
                    </div>

                    {draftOptions && draftOptions.length > 0 && (
                      <div style={{
                        position: 'fixed',
                        top: 0, left: 0, right: 0, bottom: 0,
                        backgroundColor: 'rgba(0,0,0,0.6)',
                        zIndex: 9999,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}>
                        <div style={{
                          background: 'var(--surface-1)',
                          width: '800px',
                          maxWidth: '90%',
                          borderRadius: '12px',
                          padding: '32px',
                          boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '24px'
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h3 style={{ fontSize: '20px', fontWeight: 500, margin: 0 }}>Select an AI Draft</h3>
                            <button className="btn btn-ghost" onClick={() => { setDraftOptions([]); setSelectedDraft(''); }} style={{ padding: '8px' }}>
                              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
                            </button>
                          </div>

                          <div style={{ display: 'flex', gap: '12px' }}>
                            {draftOptions.map((draft, idx) => (
                              <button
                                key={idx}
                                className="btn"
                                style={{
                                  flex: 1,
                                  padding: '16px',
                                  fontSize: '14px',
                                  fontWeight: 600,
                                  textAlign: 'center',
                                  background: selectedDraft === draft ? 'var(--accent, #d34a36)' : 'var(--surface-2, #2a2a2a)',
                                  color: selectedDraft === draft ? '#ffffff' : 'var(--text-2, #cccccc)',
                                  border: selectedDraft === draft ? '1px solid var(--accent, #d34a36)' : '1px solid var(--border, #333333)',
                                  transition: 'all 0.2s'
                                }}
                                onClick={() => setSelectedDraft(draft)}
                              >
                                Option {idx + 1}
                              </button>
                            ))}
                          </div>

                          {selectedDraft && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                              <textarea
                                className="input"
                                style={{ width: '100%', minHeight: '200px', padding: '16px', fontSize: '14px', resize: 'vertical', background: 'var(--surface-2)', color: 'var(--text-1)', border: '1px solid var(--border)', borderRadius: '8px' }}
                                value={selectedDraft}
                                onChange={(e) => setSelectedDraft(e.target.value)}
                              />
                              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                                <button className="btn btn-ghost" onClick={() => { setDraftOptions([]); setSelectedDraft(''); }}>Cancel</button>
                                <button
                                  className="btn btn-primary"
                                  disabled={sendingReply}
                                  onClick={async () => {
                                    setSendingReply(true);
                                    try {
                                      const replyData = props.inboxReplies[activeReplyIndex];
                                      const res = await fetch(`${API_BASE}/api/inbox/send-reply`, {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token') || ''}` },
                                        body: JSON.stringify({
                                          to: replyData.fromFull,
                                          subject: replyData.subject,
                                          body: selectedDraft,
                                          messageId: replyData.messageId,
                                          threadId: replyData.threadId
                                        })
                                      });
                                      if (res.ok) {
                                        notify('Reply sent successfully!', 'success');
                                        setDraftOptions([]);
                                        setSelectedDraft('');
                                        props.fetchInbox(); // Refresh threads
                                      } else {
                                        notify('Failed to send reply', 'error');
                                      }
                                    } catch (err) {
                                      notify('Error sending reply', 'error');
                                    }
                                    setSendingReply(false);
                                  }}
                                >
                                  {sendingReply ? 'Sending...' : 'Send Reply'}
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  /* --- List View --- */
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {props.inboxReplies.map((reply, i) => (
                      <div
                        key={i}
                        onClick={() => setActiveReplyIndex(i)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          padding: '10px 16px',
                          borderBottom: '1px solid var(--border)',
                          cursor: 'pointer',
                          background: 'var(--surface-1)',
                          transition: 'background 0.1s'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.boxShadow = 'inset 1px 0 0 #dadce0, inset -1px 0 0 #dadce0, 0 1px 2px 0 rgba(60,64,67,.3), 0 1px 3px 1px rgba(60,64,67,.15)'}
                        onMouseLeave={(e) => e.currentTarget.style.boxShadow = 'none'}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', width: '60px', flexShrink: 0 }}>
                          <input type="checkbox" style={{ accentColor: 'var(--text-3)', cursor: 'pointer' }} onClick={(e) => e.stopPropagation()} />
                          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ cursor: 'pointer' }}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>
                        </div>
                        <div style={{ width: '200px', fontWeight: 600, fontSize: '14px', color: 'var(--text-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flexShrink: 0, paddingRight: '16px' }}>
                          {reply.from.split('<')[0].trim()}
                        </div>
                        <div style={{ flex: 1, display: 'flex', alignItems: 'center', minWidth: 0, paddingRight: '16px' }}>
                          <span style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-1)', marginRight: '8px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {reply.subject}
                          </span>
                          <span style={{ fontSize: '14px', color: 'var(--text-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>
                            - {reply.snippet}
                          </span>
                        </div>
                        <div style={{ width: '80px', fontSize: '12px', color: 'var(--text-1)', fontWeight: 500, textAlign: 'right', flexShrink: 0 }}>
                          {new Date(reply.date).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                        </div>
                      </div>
                    ))}
                  </div>
                )
              ) : (
                <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-3)', fontSize: '14px' }}>
                  No replies found from HRs yet. Keep applying!
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'followups' && (
          <div style={{ padding: '24px', flex: 1, overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h2 style={{ fontSize: '24px', fontWeight: 600, margin: 0 }}>Pending Follow Ups</h2>
              <button className="btn btn-primary" onClick={async () => {
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
              }} disabled={fetching}>
                {fetching ? <span className="spinner"></span> : 'Check Now'}
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {jobs.flatMap(job =>
                (job.followUps || [])
                  .filter(f => !f.sent)
                  .map(f => (
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
                  ))
              )}
              {jobs.flatMap(j => (j.followUps || []).filter(f => !f.sent)).length === 0 && (
                <div style={{ color: 'var(--text-3)', fontStyle: 'italic' }}>No pending follow ups at this time.</div>
              )}
            </div>
          </div>
        )}

        {tab === 'hr_dashboard' && (
          <div style={{ padding: '24px', flex: 1, overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <div>
                <h2 style={{ fontSize: '24px', fontWeight: 600, margin: 0 }}>HR Discovery Dashboard</h2>
                <p style={{ color: 'var(--text-2)', fontSize: '14px', margin: '4px 0 0 0' }}>Find HRs hiring right now for your queries.</p>
              </div>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
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

                <button className="btn btn-primary" onClick={async () => {
                  setFetching(true);
                  try {
                    const res = await fetch(`${API_BASE}/api/jobs/scrape-hr`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token') || ''}` },
                      body: JSON.stringify({ query: fetchQuery || fetchQueries[0] || 'software engineer' })
                    });
                    const result = await res.json();
                    if (result.success) {
                      notify(`Discovered ${result.count} new HR leads!`);
                      loadJobs();
                    } else {
                      notify(result.error || 'Failed to scrape HRs', 'error');
                    }
                  } catch (err) {
                    notify('An error occurred', 'error');
                  }
                  setFetching(false);
                }} disabled={fetching}>
                  {fetching ? <span className="spinner"></span> : 'Discover HRs 🚀'}
                </button>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
              {jobs.filter(j => j.status === 'HR_Found').map(job => (
                <div key={job.id} style={{
                  background: 'var(--surface-2)',
                  borderRadius: '12px',
                  border: '1px solid var(--border)',
                  padding: '20px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px'
                }}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ fontWeight: 600, fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <input
                          type="checkbox"
                          checked={selectedJobs.includes(job.id)}
                          onChange={() => toggleSelectJob(job.id)}
                          style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: 'var(--accent)' }}
                        />
                        {job.hrName || 'Unknown HR'}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {job.source && (
                          <span className={`source-pill source-${job.source.toLowerCase()}`} style={{ padding: '2px 8px', fontSize: '10px' }}>
                            {job.source}
                          </span>
                        )}
                        <button
                          className="btn btn-ghost"
                          style={{
                            padding: '4px',
                            color: 'var(--text-3)',
                            fontSize: '16px',
                            lineHeight: 1,
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: '24px',
                            height: '24px',
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
                          onClick={() => handleDelete(job.id)}
                          title="Delete HR Lead"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                    <div style={{ fontSize: '13px', color: 'var(--accent)', marginTop: '4px' }}>{job.company}</div>
                    <div style={{ fontSize: '13px', color: 'var(--text-2)' }}>{job.role}</div>
                  </div>

                  <div style={{ fontSize: '13px', background: 'var(--surface-1)', padding: '10px', borderRadius: '8px' }}>
                    <strong>Email:</strong> {job.emailRecipient || 'Not Found'}
                  </div>

                  <div style={{ display: 'flex', gap: '10px', marginTop: 'auto', paddingTop: '10px' }}>
                    {job.hrLinkedIn && (
                      <a href={job.hrLinkedIn} target="_blank" rel="noreferrer" className="btn btn-secondary" style={{ flex: 1, textAlign: 'center', textDecoration: 'none', fontSize: '13px', padding: '8px' }}>
                        🔗 Connect
                      </a>
                    )}
                    <button className="btn btn-primary" style={{ flex: 1, fontSize: '13px', padding: '8px' }} onClick={() => {
                      if (!job.emailRecipient) return notify('No email found to send to!', 'error');
                      handleBatchSend([job.id]);
                    }}>
                      ✉️ Send Mail
                    </button>
                  </div>
                </div>
              ))}
              {jobs.filter(j => j.status === 'HR_Found').length === 0 && (
                <div style={{ gridColumn: '1 / -1', color: 'var(--text-3)', textAlign: 'center', padding: '40px', background: 'var(--surface-2)', borderRadius: '12px' }}>
                  No HR leads found yet. Click "Discover HRs" to start scraping!
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'applications' && (
          <div className="add-job-bar">
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
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flexGrow: 1 }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {fetchQueries.map((q, idx) => (
                      <span key={idx} style={{ background: 'var(--accent-glow)', color: 'var(--accent)', padding: '4px 10px', borderRadius: '16px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {q}
                        <button onClick={() => removeFetchQuery(q)} style={{ background: 'transparent', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontWeight: 'bold' }}>&times;</button>
                      </span>
                    ))}
                  </div>
                  <form onSubmit={addFetchQuery} style={{ display: 'flex', gap: '10px' }}>
                    <input
                      type="text"
                      className="form-input flex-grow"
                      placeholder="Type a role & press Enter..."
                      value={fetchQuery}
                      onChange={e => setFetchQuery(e.target.value)}
                    />
                    <button type="submit" className="btn btn-ghost" style={{ padding: '6px 12px' }}>Add</button>
                  </form>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '15px', alignSelf: 'flex-end' }}>
                  <label style={{ fontSize: '13px', color: 'var(--text-2)', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                    <input type="checkbox" checked={useApify} onChange={e => setUseApify(e.target.checked)} style={{ accentColor: 'var(--accent)' }} />
                    Use Deep Scraper (Apify)
                  </label>
                  <button className="btn btn-primary" onClick={handleFetchJobs} disabled={fetching || fetchQueries.length === 0}>
                    {fetching ? <span className="spinner"></span> : 'Auto-Scrape Fresh Jobs ✨'}
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {tab === 'resume' ? (
          <div className="profile-section" style={{ padding: '24px', background: 'var(--surface-2)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', flex: 1, overflowY: 'auto', margin: '20px 28px' }}>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '20px' }}>
              <button className="btn btn-secondary" onClick={exportToCSV} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', background: 'var(--surface-3)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                Export Pipeline to CSV
              </button>
            </div>

            {/* 1. Resume Upload (Simple) */}
            <div style={{ marginBottom: '30px' }}>
              <h2 style={{ fontSize: '20px', marginBottom: '16px', color: 'var(--text-1)' }}>Resume Upload</h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <label className="btn btn-secondary" style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '10px 20px', background: 'var(--surface-3)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
                  Choose File
                  <input type="file" accept="application/pdf" onChange={handleResumeUpload} style={{ display: 'none' }} />
                </label>
                {profile.resumeFilename ? (
                  <span style={{ fontSize: '14px', color: 'var(--text-1)' }}>
                    {profile.resumeFilename}
                  </span>
                ) : (
                  <span style={{ fontSize: '14px', color: 'var(--text-3)' }}>
                    No file chosen
                  </span>
                )}
              </div>
              {profile.skills && profile.skills.length > 0 && (
                <div style={{ marginTop: '16px', fontSize: '13px', color: 'var(--text-3)' }}>
                  Extracted {profile.skills.length} skills. Level: {profile.experienceLevel}
                </div>
              )}
            </div>

            {/* 2. Personal Information */}
            <div style={{ paddingTop: '20px', borderTop: '1px solid var(--border)' }}>
              <h2 style={{ fontSize: '20px', marginBottom: '20px', color: 'var(--text-1)' }}>Personal Information</h2>
              <form onSubmit={handleProfileSave} style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '600px' }}>
                <div className="form-row">
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-2)', fontSize: '13px' }}>Full Name</label>
                    <input className="form-input" style={{ width: '100%' }} value={profile.name} onChange={e => setProfile({ ...profile, name: e.target.value })} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-2)', fontSize: '13px' }}>Job Title</label>
                    <input className="form-input" style={{ width: '100%' }} value={profile.title} onChange={e => setProfile({ ...profile, title: e.target.value })} />
                  </div>
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-2)', fontSize: '13px' }}>Phone Number</label>
                  <input className="form-input" style={{ width: '100%' }} value={profile.phone} onChange={e => setProfile({ ...profile, phone: e.target.value })} />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-2)', fontSize: '13px' }}>LinkedIn URL</label>
                  <input className="form-input" style={{ width: '100%' }} value={profile.linkedin} onChange={e => setProfile({ ...profile, linkedin: e.target.value })} />
                </div>
                <div className="form-row">
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-2)', fontSize: '13px' }}>GitHub URL</label>
                    <input className="form-input" style={{ width: '100%' }} value={profile.github || ''} onChange={e => setProfile({ ...profile, github: e.target.value })} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-2)', fontSize: '13px' }}>Experience Level</label>
                    <input className="form-input" style={{ width: '100%' }} value={profile.experienceLevel || ''} onChange={e => setProfile({ ...profile, experienceLevel: e.target.value })} placeholder="e.g. Junior, Mid, Senior" />
                  </div>
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-2)', fontSize: '13px' }}>Custom AI Tone</label>
                  <select className="form-input" style={{ width: '100%' }} value={profile.tone || 'Professional'} onChange={e => setProfile({ ...profile, tone: e.target.value })}>
                    <option value="Professional">Professional & Formal</option>
                    <option value="Confident & Direct">Confident & Direct</option>
                    <option value="Enthusiastic & Friendly">Enthusiastic & Friendly</option>
                    <option value="Short & Punchy">Short & Punchy</option>
                  </select>
                </div>

                {/* 3. Save Button */}
                <button type="submit" className="btn btn-primary" style={{ alignSelf: 'flex-start', marginTop: '16px', padding: '10px 24px' }} disabled={savingProfile}>
                  {savingProfile ? <span className="spinner"></span> : 'Save Changes'}
                </button>
              </form>
            </div>

            {/* 4. Email Connection */}
            <div style={{ marginTop: '40px', paddingTop: '30px', borderTop: '1px solid var(--border)' }}>
              <h2 style={{ fontSize: '20px', marginBottom: '16px', color: 'var(--text-1)' }}>Linked Google Account</h2>
              <div style={{ background: 'var(--surface-3)', padding: '20px', borderRadius: 'var(--radius)', maxWidth: '600px' }}>
                {profile.emailUser ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ background: 'rgba(34, 197, 94, 0.2)', color: '#4ade80', padding: '6px 12px', borderRadius: '4px', fontSize: '13px', fontWeight: 'bold' }}>✓ Connected</div>
                    <span style={{ color: 'var(--text-1)', fontWeight: '500' }}>{profile.emailUser}</span>
                    <button onClick={logout} type="button" className="btn btn-ghost" style={{ marginLeft: 'auto' }}>Logout</button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-2)', fontSize: '14px' }}>No account connected for sending emails.</span>
                    <a href={`${API_BASE}/api/auth/google`} className="btn btn-primary" style={{ textDecoration: 'none' }}>Connect Google Account</a>
                  </div>
                )}
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
                <input name="recipientEmail" type="email" required className="form-input" style={{ width: '100%' }} placeholder="e.g. hiring@google.com" />
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
                      {tab !== 'applied' && (
                        <th style={{ width: '40px' }}>
                          <input
                            type="checkbox"
                            onChange={(e) => {
                              if (e.target.checked) setSelectedJobs(activeJobs.map(j => j.id));
                              else setSelectedJobs([]);
                            }}
                            checked={activeJobs.length > 0 && selectedJobs.length === activeJobs.length}
                          />
                        </th>
                      )}
                      <th>Company</th>
                      <th>Role</th>
                      <th>{tab === 'applied' ? 'Date Applied' : 'Date Found'}</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedJobs.map(job => (
                      <tr className="table-row" key={job.id}>
                        {tab !== 'applied' && (
                          <td>
                            <input
                              type="checkbox"
                              checked={selectedJobs.includes(job.id)}
                              onChange={() => toggleSelectJob(job.id)}
                            />
                          </td>
                        )}
                        <td>
                          <div className="company-cell">
                            <div className="company-avatar">{job.company.substring(0, 2).toUpperCase()}</div>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                              <span>{job.company}</span>
                              {job.source && job.source !== 'Manual' && (
                                <span className={`source-pill source-${job.source.toLowerCase()}`}>
                                  <img src={`https://www.google.com/s2/favicons?domain=${job.source.toLowerCase()}.com&sz=16`} alt={job.source} style={{ width: 12, height: 12, borderRadius: '2px' }} />
                                  {job.source}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="role-cell">{job.role}</td>
                        <td className="date-cell">
                          {tab === 'applied'
                            ? new Date(job.sentAt || job.updatedAt || job.createdAt || Date.now()).toLocaleString([], { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                            : new Date(job.publishedAt || job.createdAt || Date.now()).toLocaleString([], { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                          }
                        </td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center' }}>
                            {tab === 'applied' && (
                              <span className={`badge ${job.status.toLowerCase()}`}>
                                {job.status}
                              </span>
                            )}
                            {job.tracked && (
                              <span style={{ fontSize: '14px', marginLeft: '6px', cursor: 'help' }} title="Link Tracking Enabled">
                                🎯
                              </span>
                            )}
                            {job.clickedLinks && job.clickedLinks.length > 0 && (
                              <div style={{ display: 'flex', gap: '6px', marginLeft: '8px', alignItems: 'center' }}>
                                {(() => {
                                  const counts = job.clickedLinks.reduce((acc, link) => {
                                    if (link.includes('linkedin.com')) acc.linkedin = (acc.linkedin || 0) + 1;
                                    else if (link.includes('github.com')) acc.github = (acc.github || 0) + 1;
                                    else if (link.includes('resume-pdf')) acc.resume = (acc.resume || 0) + 1;
                                    else acc.other = (acc.other || 0) + 1;
                                    return acc;
                                  }, {});
                                  return Object.entries(counts).map(([type, count], idx) => {
                                    let icon = null;
                                    let title = "";
                                    if (type === 'linkedin') { icon = <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="#0a66c2"><path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z" /></svg>; title="LinkedIn Clicked"; }
                                    else if (type === 'github') { icon = <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" /></svg>; title="GitHub Clicked"; }
                                    else if (type === 'resume') { icon = <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>; title="Resume Downloaded"; }
                                    else { icon = <span style={{ fontSize: '14px' }}>🔗</span>; title="Link Clicked"; }
                                    return (
                                      <span key={idx} title={`${title} (${count}x)`} style={{ cursor: 'help', display: 'flex', alignItems: 'center', gap: '2px' }}>
                                        {icon}
                                        {count > 1 && <span style={{ fontSize: '10px', color: 'var(--text-3)', fontWeight: '600' }}>x{count}</span>}
                                      </span>
                                    );
                                  });
                                })()}
                              </div>
                            )}
                          </div>
                        </td>
                        <td>
                          <div style={{ display: 'flex', flexDirection: 'row', gap: '8px', alignItems: 'center' }}>
                            <button className="icon-btn" title="View Job" onClick={() => job.applyLink ? window.open(job.applyLink, '_blank') : alert('No URL available for this job')}>
                              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                            </button>
                            {job.hrLinkedIn && (
                              <button className="icon-btn text-accent" title="HR LinkedIn" onClick={() => window.open(job.hrLinkedIn, '_blank')}>
                                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"></path><rect x="2" y="9" width="4" height="12"></rect><circle cx="4" cy="4" r="2"></circle></svg>
                              </button>
                            )}
                            {(job.emailDraft || job.status === 'Sent' || job.status === 'Opened') && (
                              <button className="icon-btn text-accent" title="Show Mail" onClick={() => setSelectedMail(job)}>
                                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
                              </button>
                            )}
                            <button className="icon-btn text-danger" title="Delete" onClick={() => handleDelete(job.id)}>
                              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {totalPages > 1 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px', borderTop: '1px solid var(--border)' }}>
                  <span style={{ fontSize: '13px', color: 'var(--text-3)' }}>
                    Showing page {currentPage} of {totalPages}
                  </span>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button className="btn btn-secondary" disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)}>Previous</button>
                    <button className="btn btn-secondary" disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)}>Next</button>
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
