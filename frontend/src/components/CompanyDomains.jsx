import React, { useEffect, useRef, useState } from 'react';
import { API_BASE } from '../useAppLogic';
export default function CompanyDomains({ apiFetch, notify }) {
  const [items, setItems] = useState([]);
  const [company, setCompany] = useState('');
  const [domain, setDomain] = useState('');
  const [aliases, setAliases] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const apiRef = useRef(apiFetch); apiRef.current = apiFetch;
  async function refresh() {
    const response = await apiRef.current(`${API_BASE}/api/outreach/domains`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Could not load domains');
    setItems(data.domains);
  }
  const refreshRef = useRef(refresh); refreshRef.current = refresh;
  useEffect(() => { refreshRef.current().catch(err => setError(err.message)); }, []);
  async function save(event) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const response = await apiFetch(`${API_BASE}/api/outreach/domains`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ company, domain, aliases: aliases.split(',').map(a => a.trim()).filter(Boolean) }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Could not save domain');
      setCompany(''); setDomain(''); setAliases(''); await refresh(); notify('Company domain saved for your account');
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  return <section><h3>Company domains & aliases</h3><p>Save an official employer email domain when discovery gets it wrong. Confirm the company owns it before saving. Mail-server checks confirm the domain can receive mail, not company ownership.</p>
    <form onSubmit={save}><div className="safety-grid"><label>Company name<input required value={company} onChange={e => setCompany(e.target.value)} placeholder="Employer name as shown in the job" /></label><label>Official email domain<input required value={domain} onChange={e => setDomain(e.target.value)} placeholder="employer.com" /></label><label>Other company names (optional)<input value={aliases} onChange={e => setAliases(e.target.value)} placeholder="Brand name, subsidiary name" /></label></div><button type="submit" disabled={busy}>{busy ? 'Checking mail servers…' : 'Save company domain'}</button></form>
    {error && <p role="alert" className="safety-error">{error}</p>}
    <div className="safety-table"><table><thead><tr><th>Company</th><th>Domain / evidence</th><th>Action</th></tr></thead><tbody>{items.map(item => <tr key={item._id}><td>{item.company}<small>{item.aliases?.join(', ')}</small></td><td>{item.domain}<small>{item.source === 'user' ? 'Saved by you' : 'Official website in job-page metadata'} · {new Date(item.updatedAt).toLocaleDateString()}</small>{item.evidenceUrl && <a href={item.evidenceUrl} target="_blank" rel="noopener noreferrer">View evidence</a>}</td><td><button disabled={busy} onClick={() => { setCompany(item.company); setDomain(item.domain); setAliases((item.aliases || []).join(', ')); }}>Edit</button><button disabled={busy} onClick={async () => { try { const response = await apiFetch(`${API_BASE}/api/outreach/domains/${item._id}`, { method: 'DELETE' }); if (!response.ok) throw new Error('Could not remove domain'); await refresh(); } catch (err) { setError(err.message); } }}>Remove</button></td></tr>)}</tbody></table></div>
    {!items.length && <p>No saved domains. Discovery will use official job-page evidence and company-name matches.</p>}
  </section>;
}
