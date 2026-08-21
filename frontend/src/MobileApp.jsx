import React from 'react';
import { NAV, API_BASE } from './useAppLogic.jsx';

function FollowUpRow({ job, f, API_BASE, token, setJobs, jobs, notify }) {
  const [expanded, setExpanded] = React.useState(false);
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
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
            <span style={{
              background: f.day === 3 ? 'var(--blue-bg)' : 'var(--purple-bg)',
              color: f.day === 3 ? 'var(--blue)' : 'var(--purple)',
              padding: '2px 8px', borderRadius: '100px', fontSize: '10px', fontWeight: 600
            }}>Day {f.day}</span>
            <div style={{ color: 'var(--text-3)', transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', fontSize: '12px' }}>
              ▼
            </div>
          </div>
        </div>
        
        <div style={{ fontSize: '13px', color: 'var(--text-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {f.draft.replace(/\n/g, ' ')}
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
          <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)' }}>
            <button
              className="btn btn-primary"
              style={{ width: '100%', padding: '8px', fontSize: '13px' }}
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
    setAppliedViewType
  } = props;

  const [isScrolled, setIsScrolled] = React.useState(false);
  const [activeReplyIndex, setActiveReplyIndex] = React.useState(null);
  const [draftOptions, setDraftOptions] = React.useState([]);
  const [selectedDraft, setSelectedDraft] = React.useState('');
  const [sendingReply, setSendingReply] = React.useState(false);
  const [showMoreMenu, setShowMoreMenu] = React.useState(false);

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

          {tab !== 'resume' && tab !== 'single_drafter' && (
            <p className="mobile-subtitle">{activeJobs.length} results found</p>
          )}
        </div>


        {tab === 'inbox' && (
          <>
            
            <div style={{ padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
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
                <h2 style={{ fontSize: '18px', fontWeight: 600, margin: 0 }}>Smart Inbox</h2>
              </div>
              <button className="btn btn-ghost" onClick={props.fetchInbox} disabled={props.inboxLoading} style={{ padding: '6px' }}>
                {props.inboxLoading ? <span className="spinner"></span> : <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>}
              </button>
            </div>

            <div style={{ paddingBottom: '20px' }}>
              {props.inboxLoading && (!props.inboxReplies || props.inboxReplies.length === 0) ? (
                <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-3)' }}>Loading...</div>
              ) : props.inboxReplies && props.inboxReplies.length > 0 ? (
                
                activeReplyIndex !== null ? (
                  <div style={{ padding: '20px 16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                      <h1 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-1)', margin: 0 }}>
                        {props.inboxReplies[activeReplyIndex].subject}
                      </h1>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginBottom: '24px' }}>
                      {props.inboxReplies[activeReplyIndex].threadMessages && props.inboxReplies[activeReplyIndex].threadMessages.length > 0 ? (
                        props.inboxReplies[activeReplyIndex].threadMessages.map((tMsg, idx) => (
                          <div key={idx} style={{ 
                            padding: '14px', 
                            borderRadius: '8px', 
                            background: tMsg.isMe ? 'var(--surface-2)' : 'var(--surface-1)',
                            border: '1px solid var(--border)',
                            marginLeft: tMsg.isMe ? '24px' : '0',
                            marginRight: tMsg.isMe ? '0' : '24px'
                          }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                              <span style={{ fontWeight: 600, fontSize: '13px' }}>{tMsg.from}</span>
                              <span style={{ fontSize: '11px', color: 'var(--text-3)' }}>{tMsg.date.substring(0, 16)}</span>
                            </div>
                            <div style={{ fontSize: '13px', lineHeight: '1.5', whiteSpace: 'pre-wrap', color: 'var(--text-1)', wordBreak: 'break-word', overflowWrap: 'break-word' }}>
                              {tMsg.body}
                            </div>
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
                            <span style={{ fontWeight: 600, fontSize: '13px' }}>{props.inboxReplies[activeReplyIndex].from}</span>
                            <span style={{ fontSize: '11px', color: 'var(--text-3)' }}>{props.inboxReplies[activeReplyIndex].date.substring(0, 16)}</span>
                          </div>
                          <div style={{ fontSize: '13px', lineHeight: '1.5', whiteSpace: 'pre-wrap', color: 'var(--text-1)', wordBreak: 'break-word', overflowWrap: 'break-word' }}>
                            {props.inboxReplies[activeReplyIndex].body || props.inboxReplies[activeReplyIndex].snippet}
                          </div>
                        </div>
                      )}
                    </div>

                    {!(props.inboxReplies[activeReplyIndex].threadMessages && props.inboxReplies[activeReplyIndex].threadMessages.length > 0 && props.inboxReplies[activeReplyIndex].threadMessages[props.inboxReplies[activeReplyIndex].threadMessages.length - 1].isMe) && (
                    <button 
                      className="btn btn-primary"
                      style={{ fontSize: '13px', padding: '10px', width: '100%', display: 'flex', justifyContent: 'center', gap: '8px' }}
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
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>
                      Draft Reply with AI
                    </button>
                    )}

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
                          width: '90%',
                          maxHeight: '90vh',
                          overflowY: 'auto',
                          borderRadius: '12px',
                          padding: '24px',
                          boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '20px'
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h3 style={{ fontSize: '18px', fontWeight: 600, margin: 0 }}>Select an AI Draft</h3>
                            <button className="btn btn-ghost" onClick={() => { setDraftOptions([]); setSelectedDraft(''); }} style={{ padding: '8px' }}>
                              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                            </button>
                          </div>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            {draftOptions.map((draft, idx) => (
                              <button
                                key={idx}
                                className="btn"
                                style={{ 
                                  flex: 1, 
                                  padding: '12px', 
                                  fontSize: '13px', 
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
                                style={{ width: '100%', minHeight: '180px', padding: '12px', fontSize: '13px', resize: 'vertical', background: 'var(--surface-2)', color: 'var(--text-1)', border: '1px solid var(--border)', borderRadius: '8px' }}
                                value={selectedDraft}
                                onChange={(e) => setSelectedDraft(e.target.value)}
                              />
                              <div style={{ display: 'flex', gap: '8px' }}>
                                <button className="btn btn-ghost" style={{ flex: 1, padding: '10px' }} onClick={() => { setDraftOptions([]); setSelectedDraft(''); }}>Cancel</button>
                                <button 
                                  className="btn btn-primary"
                                  style={{ flex: 1, padding: '10px' }}
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
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {props.inboxReplies.map((reply, i) => (
                      <div 
                        key={i} 
                        onClick={() => setActiveReplyIndex(i)}
                        style={{ 
                          padding: '12px 16px', 
                          borderBottom: '1px solid var(--border)', 
                          cursor: 'pointer',
                          background: 'var(--surface-1)'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                          <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', paddingRight: '8px' }}>
                            {reply.from.split('<')[0].trim()}
                          </div>
                          <div style={{ fontSize: '12px', color: 'var(--text-1)', flexShrink: 0 }}>
                            {new Date(reply.date).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                          </div>
                        </div>
                        <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-1)', marginBottom: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {reply.subject}
                        </div>
                        <div style={{ fontSize: '13px', color: 'var(--text-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {reply.snippet}
                        </div>
                      </div>
                    ))}
                  </div>
                )
              ) : (
                <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-3)', fontSize: '13px' }}>
                  No replies found.
                </div>
              )}
            </div>
          </>
        )}

        {tab === 'followups' && (
          <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: '20px', fontWeight: 600, margin: 0 }}>Follow Ups</h2>
              <button className="btn btn-primary" style={{ padding: '8px 12px', fontSize: '13px' }} onClick={async () => {
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
                <div style={{ color: 'var(--text-3)', fontStyle: 'italic', fontSize: '14px', textAlign: 'center', marginTop: '20px' }}>No pending follow ups at this time.</div>
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
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button className="btn btn-primary" style={{ background: 'var(--error)', borderColor: 'var(--error)', padding: '6px 12px', fontSize: '13px' }} onClick={handleBatchDelete}>Delete</button>
                    <button className="btn btn-primary" style={{ padding: '6px 12px', fontSize: '13px' }} onClick={handleBatchSend}>Auto-Apply 🚀</button>
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
                  <label style={{ fontSize: '13px', color: 'var(--text-2)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <input type="checkbox" checked={useApify} onChange={e => setUseApify(e.target.checked)} style={{ accentColor: 'var(--accent)' }} />
                    Use Deep Scraper (Apify)
                  </label>
                  <button className="btn btn-primary" onClick={handleFetchJobs} disabled={fetching || fetchQueries.length === 0}>
                    {fetching ? <span className="spinner"></span> : 'Auto-Scrape Jobs ✨'}
                  </button>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
              <select className="form-input" style={{ flex: 1 }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="All">All Statuses</option>
                <option value="Found">Found</option>
                <option value="Drafting">Drafting</option>
                <option value="Sent">Sent</option>
                <option value="Opened">Opened</option>
                <option value="Bounced">Bounced</option>
                <option value="Replied">Replied</option>
              </select>
              <div className="search-wrapper" style={{ flex: 1, margin: 0 }}>
                <span className="search-icon">🔍</span>
                <input type="text" className="search-input" placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
            </div>
            {activeJobs.length > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', padding: '0 4px' }}>
                <button 
                  className="btn btn-ghost" 
                  style={{ padding: '6px 12px', fontSize: '13px', background: 'var(--surface-3)', borderRadius: '6px', color: 'var(--text-1)' }} 
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
          <div className="mobile-actions-panel" style={{ display: 'flex', gap: '10px' }}>
            <select className="form-input" style={{ flex: 1 }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="All">All Statuses</option>
              <option value="Sent">Sent</option>
              <option value="Opened">Opened</option>
              <option value="Bounced">Bounced</option>
              <option value="Replied">Replied</option>
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
                paginatedJobs.map(job => (
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
                            <h3 style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                              {job.company}
                              {job.source && job.source !== 'Manual' && (
                                <span className={`source-pill source-${job.source.toLowerCase()}`}>
                                  <img src={`https://www.google.com/s2/favicons?domain=${job.source.toLowerCase()}.com&sz=16`} alt={job.source} style={{width: 10, height: 10, borderRadius: '2px'}} />
                                  {job.source}
                                </span>
                              )}
                            </h3>
                            <p>{job.role}</p>
                         </div>
                      </div>
                      <div className="mobile-card-footer">
                        <span className="mobile-card-date">
                          {tab === 'applied'
                            ? `Sent: ${new Date(job.sentAt || job.updatedAt || job.createdAt || Date.now()).toLocaleString([], {year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute:'2-digit'})}`
                            : `Found: ${new Date(job.createdAt || Date.now()).toLocaleString([], {year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute:'2-digit'})}`
                          }
                        </span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          {tab === 'applied' && (
                            <span className={`badge ${job.status.toLowerCase()}`}>
                              {job.status}
                            </span>
                          )}
                          {job.tracked && <span style={{ fontSize: '12px' }}>🎯</span>}
                        </div>
                      </div>
                      <div className="mobile-card-actions">
                         <button className="icon-btn" onClick={(e) => { e.stopPropagation(); job.applyLink ? window.open(job.applyLink, '_blank') : alert('No link'); }}>
                           <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                         </button>
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
        {tab === 'hr_dashboard' && (
          <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: '20px', fontWeight: 600, margin: 0 }}>HR Discovery</h2>
              <button className="btn btn-primary" style={{ padding: '8px 12px', fontSize: '13px' }} onClick={async () => {
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
                {fetching ? <span className="spinner"></span> : 'Discover 🚀'}
              </button>
            </div>

            <div className="mobile-actions-panel">
              {selectedJobs.length > 0 ? (
                <div className="mobile-selection-bar">
                  <span style={{ fontWeight: 600, color: 'var(--accent)' }}>{selectedJobs.length} selected</span>
                  <div style={{ flex: 1 }} />
                  {batchProgress !== null ? (
                     <span className="spinner"></span>
                  ) : (
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button className="btn btn-primary" style={{ background: 'var(--error)', borderColor: 'var(--error)', padding: '6px 12px', fontSize: '13px' }} onClick={handleBatchDelete}>Delete</button>
                      <button className="btn btn-primary" style={{ padding: '6px 12px', fontSize: '13px' }} onClick={handleBatchSend}>Send 🚀</button>
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

            <div className="mobile-job-list" style={{ marginTop: '0' }}>
              {jobs.filter(j => j.status === 'HR_Found').length === 0 ? (
                 <div className="empty-state"><div className="empty-icon">📭</div><h3>No HRs found</h3></div>
              ) : (
                 jobs.filter(j => j.status === 'HR_Found').map(job => (
                  <div className={`mobile-job-card ${selectedJobs.includes(job.id) ? 'selected' : ''}`} key={job.id} onClick={() => toggleSelectJob(job.id)}>
                    <div className="mobile-card-checkbox">
                      <input type="checkbox" checked={selectedJobs.includes(job.id)} onChange={() => {}} />
                    </div>
                    <div className="mobile-card-content">
                      <div className="mobile-card-header">
                        <div className="company-avatar" style={{ width: '32px', height: '32px', fontSize: '12px' }}>{job.hrName ? job.hrName.substring(0,2).toUpperCase() : 'HR'}</div>
                        <div className="mobile-card-title">
                          <h3 style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                            {job.hrName || 'Unknown HR'}
                            {job.source && (
                              <span className={`source-pill source-${job.source.toLowerCase()}`} style={{ padding: '2px 6px', fontSize: '10px' }}>
                                {job.source}
                              </span>
                            )}
                          </h3>
                          <p>{job.company}</p>
                        </div>
                      </div>
                      <div className="mobile-card-footer">
                        <span className="mobile-card-date">
                          {new Date(job.publishedAt || Date.now()).toLocaleString([], {year: 'numeric', month: 'numeric', day: 'numeric'})}
                        </span>
                      </div>
                      <div className="mobile-card-actions">
                        <button className="icon-btn" onClick={(e) => { e.stopPropagation(); job.hrLinkedIn ? window.open(job.hrLinkedIn, '_blank') : alert('No link'); }}>
                           <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"></path><rect x="2" y="9" width="4" height="12"></rect><circle cx="4" cy="4" r="2"></circle></svg>
                        </button>
                        <button className="icon-btn text-accent" onClick={(e) => { 
                          e.stopPropagation(); 
                          if (!job.emailRecipient) return notify('No email found to send to!', 'error');
                          handleBatchSend([job.id]);
                        }}>
                          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
                        </button>
                        <button className="icon-btn text-danger" onClick={async (e) => { 
                          e.stopPropagation(); 
                          try {
                            await fetch(`${API_BASE}/api/jobs/${job.id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${localStorage.getItem('token') || ''}` } });
                            setJobs(p => p.filter(j => j.id !== job.id));
                            notify('Lead deleted');
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
