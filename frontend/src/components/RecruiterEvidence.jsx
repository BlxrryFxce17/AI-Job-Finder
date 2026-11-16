import React, { useState } from 'react';
import { API_BASE } from '../useAppLogic';
import './RecruiterEvidence.css';
const safeLink = value => { try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : null; } catch { return null; } };
export function HrSearchReport({ report }) {
  if (!report) return null;
  return <div className="hr-search-report" role="status"><p>{report.message}</p><details><summary>Search details</summary>{report.query && <p>{report.mode === 'company' ? 'Company' : 'Specialty'}: {report.query}</p>}<p>Search evidence may not reflect current employment. Email lookup runs separately.</p>{report.diagnostics?.map((entry, i) => <div key={i}>{entry.provider}: {entry.message}</div>)}</details></div>;
}
export function RecruiterLookupTools({ apiFetch, notify, loadJobs, pendingCount }) {
  const [busy, setBusy] = useState(false);
  return <div><button type="button" className="btn btn-ghost" disabled={busy || pendingCount === 0} onClick={async () => {
    setBusy(true);
    try {
      const response = await apiFetch(`${API_BASE}/api/jobs/check-all-emails`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scope: 'hr' }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Could not queue lookups');
      notify(result.message || 'Lookups queued'); await loadJobs();
    } catch (err) { notify(err.message, 'error'); } finally { setBusy(false); }
  }}>{busy ? 'Queueing lookups…' : 'Find missing emails'}</button></div>;
}
export default function RecruiterEvidence({ job, apiFetch, notify, loadJobs }) {
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [company, setCompany] = useState('');
  const [domain, setDomain] = useState('');
  const [error, setError] = useState('');
  const evidence = job.hrEvidence;
  const lookup = job.hrEmailLookup;
  const email = job.hrEmailEvidence;
  const sourceUrl = safeLink(evidence?.sourceUrl);
  const emailUrl = safeLink(email?.sourceUrl);
  const unknownEmployer = !job.company || /^(unknown employer|unknown company|direct recruiter\s*\/\s*agency)$/i.test(job.company);
  const running = lookup?.state === 'queued' || (lookup?.state === 'running' && (!lookup.leaseUntil || new Date(lookup.leaseUntil) > new Date()));
  const stateLabel = { queued: unknownEmployer ? 'Queued: resolve employer, then email' : 'Queued', running: unknownEmployer ? 'Resolving employer and email' : 'Checking email', needs_employer: 'Employer could not be confirmed', not_found: 'No verified address found', complete: 'Finished', blocked: 'Blocked', failed: 'Lookup failed' }[lookup?.state] || (unknownEmployer ? 'Employer unresolved — lookup can resolve it' : 'Not queued');
  async function saveEmployer(event) {
    event.preventDefault(); event.stopPropagation(); setBusy(true); setError('');
    try {
      const response = await apiFetch(`${API_BASE}/api/hr/employer`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jobId: job._id || job.id, company, domain }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Could not save employer');
      setEditing(false); notify(result.message); await loadJobs();
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  async function lookupEmail(event) {
    event.stopPropagation(); setBusy(true);
    try {
      const response = await apiFetch(`${API_BASE}/api/hr/email-lookup`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jobId: job._id || job.id }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Could not queue lookup');
      notify(result.message); await loadJobs();
    } catch (err) { notify(err.message, 'error'); } finally { setBusy(false); }
  }
  return <div className="recruiter-evidence" onClick={e => e.stopPropagation()}>
    <div className="hr-state-line"><strong className="hr-state">{job.hrContactState || (job.sentAt ? 'Already contacted' : 'New')}</strong>{evidence?.score != null && <> · Relevance {evidence.score}/100</>}</div>
    <div>{stateLabel}{lookup?.error && <> · {lookup.error}</>}</div>
    {email && <div>{email.inferred ? 'Inferred name pattern' : email.personMatched ? 'Source-supported personal contact' : 'Department inbox only'} · {email.mailboxConfirmed ? 'Mailbox confirmed by verifier' : 'Mailbox existence not independently confirmed'}</div>}

    <details style={{ marginTop: 6 }}><summary>Details & corrections</summary>
      {job.status === 'HR_Found' && <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '8px 0' }}><button type="button" className="btn btn-secondary" style={{ fontSize: 11, padding: '4px 8px', marginTop: 6 }} onClick={() => { setCompany(unknownEmployer ? '' : job.company); setDomain(email?.domain || ''); setError(''); setEditing(value => !value); }}>Add / correct employer</button>{job.emailRecipient && <button type="button" className="btn btn-ghost" disabled={busy || running} onClick={lookupEmail}>{running ? 'Lookup in progress' : 'Refresh email'}</button>}</div>}
    {editing && <form onSubmit={saveEmployer} style={{ display: 'grid', gap: 8, marginTop: 10 }}><label>Current employer<input className="form-input" required value={company} onChange={e => { setCompany(e.target.value); if (e.target.value.trim() !== job.company) setDomain(''); }} placeholder="Company shown on the recruiter’s profile" style={{ width: '100%', minWidth: 0 }} /></label><label>Official email domain (optional)<input className="form-input" value={domain} onChange={e => setDomain(e.target.value)} placeholder="employer.com" style={{ width: '100%', minWidth: 0 }} /></label><p>Use the company’s own domain. It will be saved for your account and checked for active mail servers.</p>{error && <p role="alert" style={{ color: 'var(--error)' }}>{error}</p>}<button className="btn btn-primary" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save and find email'}</button></form>}

      {evidence ? <><div>{evidence.source} · Search checked {evidence.observedAt ? new Date(evidence.observedAt).toLocaleString() : 'date not recorded'}</div>{evidence.sourcePublishedAt && <div>Source date: {evidence.sourcePublishedAt}</div>}<div>{evidence.status === 'user-confirmed-employer' ? 'Employer confirmed by you' : 'Current employer in source'}: {evidence.currentEmployer || 'Not confirmed'}</div><ul style={{ paddingLeft: 16 }}>{evidence.reasons?.map(reason => <li key={reason}>{reason}</li>)}</ul><p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{evidence.snippet}</p>{sourceUrl && <a href={sourceUrl} target="_blank" rel="noopener noreferrer">Open source profile</a>}</> : <p>Older lead: source evidence and freshness were not recorded. Search again to refresh its evidence.</p>}
      {email && <div style={{ marginTop: 8 }}>Email method: {email.method} · Score: {email.score ?? job.deliverabilityScore}%<p>{email.reason || job.deliverabilityReason}</p>{emailUrl && <a href={emailUrl} target="_blank" rel="noopener noreferrer">Email source</a>}</div>}
      {lookup?.diagnostics?.map((message, i) => <div key={i}>{message}</div>)}
    </details>
  </div>;
}
