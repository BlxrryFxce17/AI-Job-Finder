import { API_BASE } from '../useAppLogic';
import React, { useState, useEffect } from 'react';

export default function BlocklistModal({ isOpen, onClose }) {
  const [blocklist, setBlocklist] = useState([]);
  const [newValue, setNewValue] = useState('');
  const [newType, setNewType] = useState('email');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchBlocklist = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/blocklist`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      const data = await res.json();
      if (data.success) {
        setBlocklist(data.blocklist);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchBlocklist();
      setError('');
    }
  }, [isOpen]);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!newValue.trim()) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/api/blocklist`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ value: newValue, type: newType })
      });
      const data = await res.json();
      if (data.success) {
        setNewValue('');
        fetchBlocklist();
      } else {
        setError(data.error || 'Failed to add');
      }
    } catch (err) {
      setError('Network error');
    }
    setLoading(false);
  };

  const handleDelete = async (id) => {
    try {
      const res = await fetch(`${API_BASE}/api/blocklist/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      const data = await res.json();
      if (data.success) {
        fetchBlocklist();
      }
    } catch (err) {
      console.error(err);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose} style={{
      position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', 
      backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', 
      alignItems: 'center', justifyContent: 'center'
    }}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{
        background: 'var(--surface-2)', border: '1px solid var(--border)', 
        borderRadius: '12px', padding: '24px', width: '90%', maxWidth: '500px',
        maxHeight: '80vh', overflowY: 'auto'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ margin: 0, fontSize: '18px', color: 'var(--text-1)' }}>🛡️ Deliverability Blocklist</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-2)', cursor: 'pointer', fontSize: '20px' }}>&times;</button>
        </div>
        
        <p style={{ fontSize: '13px', color: 'var(--text-2)', marginBottom: '20px' }}>
          Emails and domains added here are excluded from outbound emails and follow-ups until you remove the rule.
        </p>

        <form onSubmit={handleAdd} style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '20px' }}>
          <select 
            value={newType} 
            onChange={e => setNewType(e.target.value)}
            style={{ padding: '8px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface-3)', color: 'var(--text-1)' }}
          >
            <option value="email">Email</option>
            <option value="domain">Domain</option>
          </select>
          <input 
            type="text" 
            placeholder={newType === 'email' ? 'e.g. hr@company.com' : 'e.g. company.com'}
            value={newValue}
            onChange={e => setNewValue(e.target.value)}
            style={{ flex: '1 1 140px', minWidth: 0, padding: '8px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface-3)', color: 'var(--text-1)' }}
          />
          <button type="submit" disabled={loading} className="btn btn-primary" style={{ padding: '8px 16px', borderRadius: '6px' }}>
            {loading ? '...' : 'Block'}
          </button>
        </form>
        {error && <div style={{ color: 'var(--error)', fontSize: '12px', marginBottom: '10px' }}>{error}</div>}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {blocklist.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--text-2)', fontSize: '13px', padding: '20px' }}>
              Your blocklist is empty.
            </div>
          ) : (
            blocklist.map(item => (
              <div key={item._id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px', background: 'var(--surface-3)', borderRadius: '6px', border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '12px', padding: '2px 6px', borderRadius: '4px', background: 'var(--surface-1)', border: '1px solid var(--border)', color: 'var(--text-1)' }}>
                    {item.type}
                  </span>
                  <div style={{ minWidth: 0, overflowWrap: 'anywhere' }}><span style={{ fontSize: '14px', fontFamily: 'monospace', color: 'var(--text-1)' }}>{item.value}</span><div style={{ fontSize: '12px', color: 'var(--text-2)', marginTop: '6px' }}>{item.source === 'bounce' ? 'Automatic bounce protection' : item.source === 'manual' ? 'Manually blocked' : 'Older rule (source not recorded)'} · {item.createdAt ? new Date(item.createdAt).toLocaleString() : 'Date not recorded'}</div><div style={{ fontSize: '12px', color: 'var(--text-2)' }}>{item.reason || 'Reason not recorded'}</div></div>
                </div>
                <button 
                  onClick={() => handleDelete(item._id)}
                  style={{ background: 'none', border: 'none', color: 'var(--error)', cursor: 'pointer', fontSize: '12px', padding: '4px 8px' }}
                >
                  Remove
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
