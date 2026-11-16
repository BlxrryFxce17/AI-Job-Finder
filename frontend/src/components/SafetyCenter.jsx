import CompanyDomains from './CompanyDomains';
import BlocklistModal from './BlocklistModal';
import React, { useEffect, useState, useRef } from 'react';
import { API_BASE } from '../useAppLogic';
import './SafetyCenter.css';

export default function SafetyCenter({ apiFetch, notify, loadJobs, loadProfile, logout, profile, setProfile, handleProfileSave, jobs = [], handleBatchSend }) {
  const [showBlocklist, setShowBlocklist] = useState(false);
  const [data, setData] = useState(null);
  const [settings, setSettings] = useState(null);
  const [days, setDays] = useState('3, 6');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [groups, setGroups] = useState(null);
  const [selected, setSelected] = useState([]);
  const [undo, setUndo] = useState('');
  const [confirmation, setConfirmation] = useState('');
  async function request(path = '', options = {}) {
    const response = await apiFetch(`${API_BASE}/api/controls${path}`, { ...options, headers: { 'Content-Type': 'application/json', ...options.headers } });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Request failed');
    return result;
  }
  async function refresh(initial = false) {
    try {
      const result = await request();
      setData(result);
      if (initial) { setSettings(result.controls); setDays(result.controls.followUpDays.join(', ')); }
    } catch (err) { setError(err.message); }
  }
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  useEffect(() => { refreshRef.current(true); const timer = setInterval(() => refreshRef.current(), 15000); return () => clearInterval(timer); }, []);
  async function action(task) {
    setBusy(true); setError('');
    try { await task(); } catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  async function save(e) {
    e.preventDefault();
    await action(async () => {
      const parsedDays = days.trim() ? days.split(',').map(v => Number(v.trim())) : [];
      const result = await request('/settings', { method: 'PUT', body: JSON.stringify({ ...settings, followUpDays: parsedDays }) });
      setSettings(result.controls); notify('Safety settings saved'); await refresh(); await loadProfile();
    });
  }
  async function pause() {
    await action(async () => {
      const paused = !data.controls.paused;
      await request('/settings', { method: 'PUT', body: JSON.stringify({ paused }) });
      setSettings(s => ({ ...s, paused })); await refresh(); notify(paused ? 'Sending paused' : 'Sending resumed');
    });
  }
  async function download(format) {
    await action(async () => {
      const response = await apiFetch(`${API_BASE}/api/controls/export?format=${format}`);
      if (!response.ok) throw new Error('Export failed');
      const url = URL.createObjectURL(await response.blob());
      const a = document.createElement('a'); a.href = url; a.download = format === 'csv' ? 'applications.csv' : 'my-job-data.json'; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
  }
  if (!data || !settings) return <div className="safety"><h2>Safety & activity</h2><p role="status">{error || 'Loading your account…'}</p><button onClick={() => refresh(true)}>Retry</button></div>;
  const pipeline = jobs.filter(j => j.pipelineStage && j.pipelineStage !== 'sent');
  return <div className="safety">
    <div className="safety-heading"><div><p className="safety-eyebrow">Your outreach, under control</p><h2>Safety & activity</h2><p>Review progress, set boundaries, and manage your data.</p></div><button className={data.controls.paused ? 'safety-primary' : 'safety-danger'} disabled={busy} onClick={pause}>{data.controls.paused ? 'Resume sending' : 'Pause all sending'}</button></div>
    {error && <p className="safety-error" role="alert">{error}</p>}
    <div className="safety-grid">{[['Applications', data.metrics.applications], ['Replies', data.metrics.replies], ['Interviews', data.metrics.interviews], ['Follow-ups ready', data.metrics.followUpsDue], ['Reply rate', `${data.metrics.replyRate}%`]].map(([label, value]) => <div className="safety-card" key={label}><strong>{value}</strong><span>{label}</span></div>)}</div>
    <section><h3>Daily limits & follow-ups</h3><p>Today: {data.usage.email}/{data.controls.dailyEmailLimit} email attempts · {data.usage.ai}/{data.controls.dailyAiLimit} AI requests. Limits reset at midnight in your selected timezone. Failed attempts may still count.</p>
      <form onSubmit={save}><div className="safety-grid">
        <label>Daily email limit<input type="number" min="0" max="200" value={settings.dailyEmailLimit} onChange={e => setSettings({ ...settings, dailyEmailLimit: Number(e.target.value) })} required /></label>
        <label>Daily AI request limit<input type="number" min="0" max="1000" value={settings.dailyAiLimit} onChange={e => setSettings({ ...settings, dailyAiLimit: Number(e.target.value) })} required /></label>
        <label>Timezone<input value={settings.timezone} onChange={e => setSettings({ ...settings, timezone: e.target.value })} placeholder="Asia/Kolkata" required /></label>
        <label>Quiet hours start<input type="time" value={settings.quietStart} onChange={e => setSettings({ ...settings, quietStart: e.target.value })} /></label>
        <label>Quiet hours end<input type="time" value={settings.quietEnd} onChange={e => setSettings({ ...settings, quietEnd: e.target.value })} /></label>
        <label>Follow-up days after applying<input value={days} onChange={e => setDays(e.target.value)} placeholder="3, 6" /><small>Up to three days, separated by commas. Leave blank to disable.</small></label>
      </div><label className="safety-check"><input type="checkbox" checked={settings.autoFollowUp} onChange={e => setSettings({ ...settings, autoFollowUp: e.target.checked })} />Send follow-ups automatically after checking for replies. Leave off to review each draft.</label><p><small>The background check runs daily at 11:00 AM India time. Pausing takes effect before the next send; an email already submitted cannot be recalled.</small></p><button type="submit" className="safety-primary" disabled={busy}>Save settings</button></form>
    </section>
    <CompanyDomains apiFetch={apiFetch} notify={notify} />
    <section><h3>Recipient exclusions</h3><p>Check why an address or domain is blocked, including bounce history and when it was added.</p><button onClick={() => setShowBlocklist(true)}>Manage blocklist</button><BlocklistModal isOpen={showBlocklist} onClose={() => setShowBlocklist(false)} /></section>
    <section><h3>Confirmed application details</h3><p>Used when answering recruiter questions. Leave blank if you have not decided.</p><form onSubmit={async e => { await handleProfileSave(e); await loadJobs(); }}>
      <label className="safety-check"><input type="checkbox" checked={profile.excludeUnrelatedJobs !== false} onChange={e => setProfile({ ...profile, excludeUnrelatedJobs: e.target.checked })} />Exclude jobs in clearly unrelated disciplines before drafting</label><p><small>Uses your saved title and skills. Ambiguous roles remain available; this does not remove your application history.</small></p>
      <label>Availability / notice period<input value={profile.availability || ''} onChange={e => setProfile({ ...profile, availability: e.target.value })} placeholder="Your confirmed availability" /></label>
      <label>Desired compensation<input value={profile.desiredSalary || ''} onChange={e => setProfile({ ...profile, desiredSalary: e.target.value })} placeholder="Your preferred range and currency" /></label><button type="submit">Save profile details</button></form>
    </section>
    {pipeline.length > 0 && <section><h3>Application queue</h3><div className="safety-table"><table><thead><tr><th>Application</th><th>Stage</th><th>Verification / next step</th></tr></thead><tbody>{pipeline.map(j => <tr key={j._id || j.id}><td>{j.company}<small>{j.role}</small></td><td>{j.pipelineStage}{j.sendSummary && <small>{j.sendSummary.sentCount} sent · {j.sendSummary.blockedCount} blocked · {j.sendSummary.failedCount} failed/uncertain</small>}{j.relevance && <small>Profile match: {j.relevance.score}%</small>}</td><td>{j.deliverabilityScore || 0}%<small>{j.pipelineError || j.deliverabilityReason}</small>{j.recipientResults?.length > 0 && <details><summary>Recipient results</summary>{j.recipientResults.map(r => <p key={r.email}><strong>{r.email}</strong> · {r.status}<small>{r.reason}</small></p>)}</details>}{['failed', 'drafted', 'paused', 'partial'].includes(j.pipelineStage) && <button disabled={busy || data.controls.paused} onClick={() => handleBatchSend([j.id || j._id])}>Retry send</button>}</td></tr>)}</tbody></table></div></section>}
    <section><h3>Profile match</h3><p>Scores indicate relevance to your saved skills and discipline, not your chances of being hired.</p><div className="safety-table"><table><thead><tr><th>Application</th><th>Match</th><th>Reason</th></tr></thead><tbody>{jobs.filter(j => j.relevance?.excluded || j.pipelineStage === 'filtered').slice(0, 50).map(j => <tr key={j._id || j.id}><td>{j.company}<small>{j.role}</small></td><td>{j.relevance?.score ?? '—'}%</td><td>{j.relevance?.reason || j.pipelineError}</td></tr>)}</tbody></table></div></section>
    <section><h3>Recent sends</h3><p>Uncertain sends stay blocked until Gmail confirms delivery. This prevents a timeout from sending the same email twice.</p><div className="safety-table"><table><thead><tr><th>Recipient</th><th>State</th><th>Details</th><th>Action</th></tr></thead><tbody>{data.activity.map(item => <tr key={item._id}><td>{item.recipient}<small>{item.subject}</small></td><td>{item.state}<small>{new Date(item.createdAt).toLocaleString()}</small></td><td><small>{item.error || (item.state === 'sent' ? 'Accepted by the mail provider' : '')}</small></td><td>{['unknown', 'submitting'].includes(item.state) && <button disabled={busy} onClick={() => action(async () => { const result = await request(`/reconcile/${item._id}`, { method: 'POST' }); notify(result.message || result.state); await refresh(); await loadJobs(); })}>Check sent mail</button>}</td></tr>)}</tbody></table>{data.activity.length === 0 && <p>No send attempts yet. Your next email will appear here.</p>}</div></section>
    <section><h3>Duplicate review</h3><p>Only unsent records with the same company, role, and application URL are suggested. Your sent history stays intact.</p><button disabled={busy} onClick={() => action(async () => { const result = await request('/duplicates'); setGroups(result.groups); setSelected([]); })}>Find potential duplicates</button>
      {groups?.length === 0 && <p>No potential duplicates found.</p>}
      {groups?.map((group, index) => <div key={index}><h4>{group[0].company} · {group[0].role}</h4>{group.map((job, i) => <label key={job._id} className="safety-check"><input type="checkbox" checked={selected.includes(job.id)} onChange={e => setSelected(current => e.target.checked ? [...current, job.id] : current.filter(id => id !== job.id))} />{i === 0 ? 'Oldest' : 'Duplicate candidate'} · {new Date(job.createdAt).toLocaleDateString()} · {job.source || 'Manual'}</label>)}</div>)}
      <div className="safety-actions">{selected.length > 0 && <button disabled={busy} onClick={() => action(async () => { const result = await request('/archive-duplicates', { method: 'POST', body: JSON.stringify({ ids: selected }) }); setUndo(result.undoToken); setGroups(null); setSelected([]); notify(`${result.archived} records archived`); await loadJobs(); })}>Archive {selected.length} selected</button>}{undo && <button onClick={() => action(async () => { await request('/undo-archive', { method: 'POST', body: JSON.stringify({ undoToken: undo }) }); setUndo(''); await loadJobs(); notify('Archive undone'); })}>Undo last archive</button>}</div>
    </section>
    <section><h3>Your data</h3><p>Export your applications or download your profile and application data. Secret keys, account tokens, and the resume file are excluded from JSON exports.</p><div className="safety-actions"><button disabled={busy} onClick={() => download('csv')}>Export applications CSV</button><button disabled={busy} onClick={() => download('json')}>Download my data</button></div>
      <details><summary>Delete account and stored data</summary><p>This permanently deletes your profile, resume, applications, blocklist, usage, and send records. Previously sent messages remain in Gmail. You can also remove the app from your Google account connections.</p><label>Type DELETE MY ACCOUNT<input value={confirmation} onChange={e => setConfirmation(e.target.value)} autoComplete="off" /></label><button className="safety-danger" disabled={busy || confirmation !== 'DELETE MY ACCOUNT'} onClick={() => action(async () => { await request('/account', { method: 'DELETE', body: JSON.stringify({ confirmation }) }); logout(); })}>Permanently delete my account</button></details>
    </section>
  </div>;
}
