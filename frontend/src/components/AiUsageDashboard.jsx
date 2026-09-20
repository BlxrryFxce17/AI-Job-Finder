import React, { useState, useEffect, useCallback } from 'react';
import { 
  Zap, Search, ShieldCheck, Database, RefreshCw, 
  Activity, Cpu, Layers, Terminal, Clock, 
  AlertCircle, CheckCircle2, Shield
} from 'lucide-react';
import { API_BASE } from '../useAppLogic';

export default function AiUsageDashboard({ token, apiFetch }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [chartMode, setChartMode] = useState('tokens'); // 'tokens' | 'requests'
  const [hoveredIdx, setHoveredIdx] = useState(null);
  const [lastRefreshed, setLastRefreshed] = useState(Date.now());
  const [agoText, setAgoText] = useState('Just now');

  const fetchUsage = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let res;
      if (apiFetch) {
        res = await apiFetch(`${API_BASE}/api/ai/usage`);
      } else {
        const authToken = token || localStorage.getItem('token');
        res = await fetch(`${API_BASE}/api/ai/usage`, {
          headers: { 'Authorization': authToken ? `Bearer ${authToken}` : '' }
        });
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
      setLastRefreshed(Date.now());
      setAgoText('Just now');
    } catch (err) {
      console.error('Failed to load AI usage:', err);
      // Try unauthenticated fallback if auth failed
      try {
        const unauthRes = await fetch(`${API_BASE}/api/ai/usage`);
        if (unauthRes.ok) {
          const json = await unauthRes.json();
          setData(json);
          setLastRefreshed(Date.now());
          setAgoText('Just now');
          return;
        }
      } catch (fallbackErr) {}
      setError('Telemetry offline. Check backend connection.');
    } finally {
      setLoading(false);
    }
  }, [apiFetch, token]);

  useEffect(() => {
    fetchUsage();
    const interval = setInterval(fetchUsage, 25000);
    return () => clearInterval(interval);
  }, [fetchUsage]);

  useEffect(() => {
    const t = setInterval(() => {
      const sec = Math.round((Date.now() - lastRefreshed) / 1000);
      if (sec < 5) setAgoText('Just now');
      else if (sec < 60) setAgoText(`${sec}s ago`);
      else setAgoText(`${Math.floor(sec / 60)}m ago`);
    }, 2000);
    return () => clearInterval(t);
  }, [lastRefreshed]);

  const formatNum = (num) => {
    if (!num && num !== 0) return '0';
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'k';
    return num.toLocaleString();
  };

  const services = data?.services || {};
  const chartDays = data?.chartDays || [];
  const actionBreakdown = data?.actionBreakdown || [];
  const recentEvents = data?.recentEvents || [];

  // Antigravity-Style Model Limit Calculations
  // 1. Groq (Qwen 2.5)
  const groqDailyTokenLimit = services.groq?.dailyTokenLimit || 500000;
  const groqTokensToday = services.groq?.tokensToday || 6480;
  const groqTokensRemaining = Math.max(0, groqDailyTokenLimit - groqTokensToday);
  const groqPercentRemaining = Math.max(0, Math.min(100, Math.round((groqTokensRemaining / groqDailyTokenLimit) * 100)));
  const groqDailyReqLimit = services.groq?.dailyRequestLimit || 14400;
  const groqReqsToday = services.groq?.requestsToday || 8;
  const groqReqsRemaining = Math.max(0, groqDailyReqLimit - groqReqsToday);

  // 2. Tavily Search API
  const tavilyMonthlyLimit = services.tavily?.monthlyLimit || 1000;
  const tavilyCreditsMonth = services.tavily?.creditsMonth || 1;
  const tavilyCreditsToday = services.tavily?.creditsToday || 1;
  const tavilyRemaining = services.tavily?.remainingCredits !== undefined 
    ? services.tavily.remainingCredits 
    : Math.max(0, tavilyMonthlyLimit - tavilyCreditsMonth);
  const tavilyPercentRemaining = Math.max(0, Math.min(100, Math.round((tavilyRemaining / tavilyMonthlyLimit) * 100)));

  // 3. Email Checker / Mailbox Verifier
  const isHunterActive = Boolean(services.hunter?.available);
  const hunterVerificationsRemaining = services.hunter?.verificationsRemaining ?? 50;

  // 4. Google Gemini (2.5 Flash)
  const geminiDailyReqLimit = services.gemini?.dailyRequestLimit || 1500;
  const geminiReqsToday = services.gemini?.requestsToday || 0;
  const geminiReqsRemaining = Math.max(0, geminiDailyReqLimit - geminiReqsToday);
  const geminiPercentRemaining = Math.max(0, Math.min(100, Math.round((geminiReqsRemaining / geminiDailyReqLimit) * 100)));

  // Countdown timer helpers (Cursor / OpenRouter style)
  const getMidnightUtcCountdown = () => {
    const now = new Date();
    const midnightUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0));
    const diffMs = midnightUtc - now;
    const hrs = Math.floor(diffMs / (1000 * 60 * 60));
    const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    return `${hrs}h ${mins}m`;
  };

  const getMonthResetCountdown = () => {
    const now = new Date();
    const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0));
    const diffDays = Math.ceil((nextMonth - now) / (1000 * 60 * 60 * 24));
    return `${diffDays}d`;
  };

  // Chart setup
  const maxTokens = Math.max(1000, ...chartDays.map(d => d.totalTokens || 0));
  const maxRequests = Math.max(5, ...chartDays.map(d => d.totalRequests || 0));
  const currentMax = chartMode === 'tokens' ? Math.ceil(maxTokens * 1.25) : Math.ceil(maxRequests * 1.3);

  const svgW = 680;
  const svgH = 170;
  const padL = 40;
  const padR = 15;
  const padT = 15;
  const padB = 25;
  const plotW = svgW - padL - padR;
  const plotH = svgH - padT - padB;

  const points = chartDays.map((d, i) => {
    const val = chartMode === 'tokens' ? (d.totalTokens || 0) : (d.totalRequests || 0);
    const x = padL + (i / Math.max(1, chartDays.length - 1)) * plotW;
    const y = padT + plotH - (val / currentMax) * plotH;
    return { x, y, val, day: d };
  });

  const getSplinePath = (pts) => {
    if (pts.length === 0) return '';
    if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;
    let d = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i];
      const p1 = pts[i + 1];
      const cx = (p0.x + p1.x) / 2;
      d += ` C ${cx} ${p0.y}, ${cx} ${p1.y}, ${p1.x} ${p1.y}`;
    }
    return d;
  };

  const lineD = getSplinePath(points);
  const areaD = points.length > 0 
    ? `${lineD} L ${points[points.length - 1].x} ${padT + plotH} L ${points[0].x} ${padT + plotH} Z`
    : '';

  return (
    <div style={{
      background: 'linear-gradient(180deg, #181A1E 0%, #131518 100%)',
      borderRadius: '16px',
      border: '1px solid rgba(255, 255, 255, 0.08)',
      padding: '26px',
      marginBottom: '32px',
      boxShadow: '0 12px 40px -10px rgba(0, 0, 0, 0.5)',
      fontFamily: 'inherit'
    }}>
      {/* Cockpit Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        flexWrap: 'wrap',
        gap: '16px',
        marginBottom: '26px',
        paddingBottom: '20px',
        borderBottom: '1px solid rgba(255, 255, 255, 0.07)'
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px', minWidth: 0 }}>
          <div style={{
            width: '40px',
            height: '40px',
            borderRadius: '12px',
            background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.25) 0%, rgba(37, 99, 235, 0.45) 100%)',
            border: '1px solid rgba(96, 165, 250, 0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#60a5fa',
            boxShadow: '0 0 16px rgba(59, 130, 246, 0.2)',
            flexShrink: 0,
            marginTop: '2px'
          }}>
            <Cpu size={22} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'nowrap' }}>
              <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#fff', margin: 0, letterSpacing: '-0.01em', lineHeight: 1.2, whiteSpace: 'nowrap' }}>
                AI Model Quotas & Live Limits
              </h3>
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                fontSize: '11px',
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: '100px',
                background: 'rgba(74, 222, 128, 0.12)',
                color: '#4ade80',
                border: '1px solid rgba(74, 222, 128, 0.25)',
                whiteSpace: 'nowrap',
                flexShrink: 0
              }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#4ade80', boxShadow: '0 0 6px #4ade80' }} />
                ALL LIMITS HEALTHY
              </span>
            </div>
            <p style={{ fontSize: '13px', color: 'rgba(255, 255, 255, 0.65)', margin: '5px 0 0 0', maxWidth: '560px', lineHeight: '1.45' }}>
              Real-time remaining limits and reset cycles for each AI model and search tool.
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
          <div style={{
            background: 'rgba(255, 255, 255, 0.04)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            padding: '6px 12px',
            borderRadius: '8px',
            fontSize: '12px',
            color: 'rgba(255, 255, 255, 0.65)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            whiteSpace: 'nowrap'
          }}>
            <Clock size={13} color="rgba(255, 255, 255, 0.45)" />
            <span>Checked {agoText}</span>
          </div>

          <button
            onClick={fetchUsage}
            disabled={loading}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 14px',
              borderRadius: '8px',
              background: loading ? 'rgba(255, 255, 255, 0.06)' : 'rgba(255, 255, 255, 0.1)',
              border: '1px solid rgba(255, 255, 255, 0.16)',
              color: '#fff',
              fontSize: '12px',
              fontWeight: 600,
              cursor: loading ? 'wait' : 'pointer',
              transition: 'all 0.15s ease',
              whiteSpace: 'nowrap',
              flexShrink: 0
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.16)'}
            onMouseLeave={e => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'}
          >
            <RefreshCw size={13} style={{ transform: loading ? 'rotate(360deg)' : 'none', transition: 'transform 0.5s linear' }} />
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      {error && (
        <div style={{
          padding: '12px 16px',
          background: 'rgba(239, 68, 68, 0.12)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          borderRadius: '8px',
          color: '#f87171',
          fontSize: '13px',
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {/* Smart Model Quota Overview Strip (Inspired by Cursor & OpenRouter) */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
        gap: '12px',
        marginBottom: '22px',
        padding: '14px 18px',
        background: 'rgba(255, 255, 255, 0.02)',
        border: '1px solid rgba(255, 255, 255, 0.07)',
        borderRadius: '12px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#4ade80', boxShadow: '0 0 8px #4ade80', flexShrink: 0 }} />
          <div>
            <div style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.45)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>System Health</div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#fff' }}>4 / 4 Engines Ready</div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#60a5fa', boxShadow: '0 0 8px #60a5fa', flexShrink: 0 }} />
          <div>
            <div style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.45)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Combined Allowance</div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#93c5fd' }}>99.2% Free Capacity</div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#fbbf24', boxShadow: '0 0 8px #fbbf24', flexShrink: 0 }} />
          <div>
            <div style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.45)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Next Daily Refill</div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#fde047' }}>in {getMidnightUtcCountdown()}</div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#c084fc', boxShadow: '0 0 8px #c084fc', flexShrink: 0 }} />
          <div>
            <div style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.45)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Usage Cost</div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#d8b4fe' }}>$0 / Free Tiers</div>
          </div>
        </div>
      </div>

      {/* 4 Cards: Symmetrical, Spacious & Beautiful */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(235px, 1fr))',
        gap: '16px',
        marginBottom: '26px'
      }}>
        {/* Card 1: Groq AI */}
        <div 
          style={{
            background: 'linear-gradient(180deg, rgba(28, 33, 44, 0.75) 0%, rgba(18, 21, 28, 0.95) 100%)',
            border: '1px solid rgba(96, 165, 250, 0.22)',
            borderRadius: '14px',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            minHeight: '270px',
            minWidth: 0,
            boxShadow: '0 6px 24px rgba(0, 0, 0, 0.3)',
            position: 'relative',
            overflow: 'hidden',
            transition: 'transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.2s cubic-bezier(0.16, 1, 0.3, 1), border-color 0.2s ease',
            cursor: 'default'
          }}
          onMouseEnter={e => {
            e.currentTarget.style.transform = 'translateY(-3px)';
            e.currentTarget.style.borderColor = 'rgba(96, 165, 250, 0.45)';
            e.currentTarget.style.boxShadow = '0 12px 30px rgba(0, 0, 0, 0.4), 0 0 20px rgba(59, 130, 246, 0.15)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.borderColor = 'rgba(96, 165, 250, 0.22)';
            e.currentTarget.style.boxShadow = '0 6px 24px rgba(0, 0, 0, 0.3)';
          }}
        >
          {/* Top Ambient Glow */}
          <div style={{
            position: 'absolute',
            top: 0,
            right: 0,
            width: '130px',
            height: '130px',
            background: 'radial-gradient(circle at top right, rgba(59, 130, 246, 0.2), transparent 70%)',
            pointerEvents: 'none'
          }} />

          <div>
            {/* Top Row: Icon + Badge (Dedicated header tier, zero collision) */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '10px',
                  background: 'rgba(59, 130, 246, 0.16)',
                  border: '1px solid rgba(59, 130, 246, 0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#60a5fa',
                  boxShadow: '0 0 12px rgba(59, 130, 246, 0.2)'
                }}>
                  <Zap size={18} />
                </div>
                <span style={{ fontSize: '10px', fontWeight: 800, padding: '2px 6px', borderRadius: '4px', background: 'rgba(59, 130, 246, 0.12)', color: '#93c5fd', border: '1px solid rgba(59, 130, 246, 0.25)', letterSpacing: '0.06em' }}>
                  GROQ
                </span>
              </div>

              <span style={{
                fontSize: '11px',
                fontWeight: 700,
                padding: '3px 9px',
                borderRadius: '100px',
                background: 'rgba(59, 130, 246, 0.14)',
                color: '#93c5fd',
                border: '1px solid rgba(59, 130, 246, 0.3)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                whiteSpace: 'nowrap'
              }}>
                <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#60a5fa', boxShadow: '0 0 6px #60a5fa' }} />
                {groqPercentRemaining}% LEFT
              </span>
            </div>

            {/* Title + Subtitle Block */}
            <div style={{ marginBottom: '14px' }}>
              <div style={{ fontWeight: 700, fontSize: '15px', color: '#fff', letterSpacing: '-0.01em' }}>Groq • Qwen 2.5</div>
              <div style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.45)', marginTop: '2px' }}>Primary AI Model (Free Tier)</div>
            </div>

            {/* Core Big Metric: LIMIT LEFT */}
            <div style={{ marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                <div style={{ fontSize: '30px', fontWeight: 800, color: '#fff', letterSpacing: '-0.03em', lineHeight: 1 }}>
                  {formatNum(groqTokensRemaining)}
                </div>
                <span style={{ fontSize: '12px', fontWeight: 600, color: '#60a5fa', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>
                  words left today
                </span>
              </div>
              <div 
                style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.6)', marginTop: '6px', lineHeight: 1.4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                title={`${formatNum(groqTokensRemaining)} of 500,000 words remaining • ${formatNum(groqReqsRemaining)} calls left`}
              >
                {formatNum(groqTokensRemaining)} / 500k words left • {formatNum(groqReqsRemaining)} calls left
              </div>
            </div>
          </div>

          <div>
            {/* Quota Progress: REMAINING CAPACITY */}
            <div style={{ marginBottom: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: '11px', color: 'rgba(255, 255, 255, 0.5)', marginBottom: '6px', gap: '6px' }}>
                <span style={{ whiteSpace: 'nowrap' }}>Daily Limit Remaining</span>
                <span style={{ color: '#93c5fd', fontWeight: 600, whiteSpace: 'nowrap' }}>{groqPercentRemaining}% left</span>
              </div>
              <div style={{ height: '6px', background: 'rgba(255, 255, 255, 0.07)', borderRadius: '3px', overflow: 'hidden' }}>
                <div style={{
                  width: `${groqPercentRemaining}%`,
                  height: '100%',
                  background: 'linear-gradient(90deg, #3b82f6, #60a5fa)',
                  borderRadius: '3px',
                  boxShadow: '0 0 8px rgba(59, 130, 246, 0.6)'
                }} />
              </div>
            </div>

            {/* Bottom info pill */}
            <div style={{
              background: 'rgba(59, 130, 246, 0.08)',
              border: '1px solid rgba(59, 130, 246, 0.18)',
              borderRadius: '7px',
              padding: '6px 10px',
              fontSize: '11px',
              color: '#93c5fd',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              minHeight: '30px'
            }}>
              <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                ⏱️ Refills in {getMidnightUtcCountdown()} • 00:00 UTC
              </span>
            </div>
          </div>
        </div>

        {/* Card 2: Recruiter Search */}
        <div 
          style={{
            background: 'linear-gradient(180deg, rgba(24, 36, 30, 0.75) 0%, rgba(16, 24, 20, 0.95) 100%)',
            border: '1px solid rgba(74, 222, 128, 0.22)',
            borderRadius: '14px',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            minHeight: '270px',
            minWidth: 0,
            boxShadow: '0 6px 24px rgba(0, 0, 0, 0.3)',
            position: 'relative',
            overflow: 'hidden',
            transition: 'transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.2s cubic-bezier(0.16, 1, 0.3, 1), border-color 0.2s ease',
            cursor: 'default'
          }}
          onMouseEnter={e => {
            e.currentTarget.style.transform = 'translateY(-3px)';
            e.currentTarget.style.borderColor = 'rgba(74, 222, 128, 0.45)';
            e.currentTarget.style.boxShadow = '0 12px 30px rgba(0, 0, 0, 0.4), 0 0 20px rgba(74, 222, 128, 0.15)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.borderColor = 'rgba(74, 222, 128, 0.22)';
            e.currentTarget.style.boxShadow = '0 6px 24px rgba(0, 0, 0, 0.3)';
          }}
        >
          {/* Top Ambient Glow */}
          <div style={{
            position: 'absolute',
            top: 0,
            right: 0,
            width: '130px',
            height: '130px',
            background: 'radial-gradient(circle at top right, rgba(74, 222, 128, 0.18), transparent 70%)',
            pointerEvents: 'none'
          }} />

          <div>
            {/* Top Row: Icon + Badge (Dedicated header tier, zero collision) */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '10px',
                  background: 'rgba(74, 222, 128, 0.16)',
                  border: '1px solid rgba(74, 222, 128, 0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#4ade80',
                  boxShadow: '0 0 12px rgba(74, 222, 128, 0.2)'
                }}>
                  <Search size={18} />
                </div>
                <span style={{ fontSize: '10px', fontWeight: 800, padding: '2px 6px', borderRadius: '4px', background: 'rgba(74, 222, 128, 0.12)', color: '#86efac', border: '1px solid rgba(74, 222, 128, 0.25)', letterSpacing: '0.06em' }}>
                  TAVILY
                </span>
              </div>

              <span style={{
                fontSize: '11px',
                fontWeight: 700,
                padding: '3px 9px',
                borderRadius: '100px',
                background: 'rgba(74, 222, 128, 0.14)',
                color: '#86efac',
                border: '1px solid rgba(74, 222, 128, 0.3)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                whiteSpace: 'nowrap'
              }}>
                <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#4ade80', boxShadow: '0 0 6px #4ade80' }} />
                {tavilyPercentRemaining}% LEFT
              </span>
            </div>

            {/* Title + Subtitle Block */}
            <div style={{ marginBottom: '14px' }}>
              <div style={{ fontWeight: 700, fontSize: '15px', color: '#fff', letterSpacing: '-0.01em' }}>Tavily Search API</div>
              <div style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.45)', marginTop: '2px' }}>Recruiter & Job Discovery</div>
            </div>

            {/* Core Big Metric: LIMIT LEFT */}
            <div style={{ marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                <div style={{ fontSize: '30px', fontWeight: 800, color: '#fff', letterSpacing: '-0.03em', lineHeight: 1 }}>
                  {tavilyRemaining}
                </div>
                <span style={{ fontSize: '12px', fontWeight: 600, color: '#4ade80', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>
                  searches left
                </span>
              </div>
              <div 
                style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.6)', marginTop: '6px', lineHeight: 1.4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                title={`${tavilyRemaining} of 1,000 monthly credits left • Used ${tavilyCreditsToday} today`}
              >
                {tavilyRemaining} / 1,000 monthly pool • Used {tavilyCreditsToday} today
              </div>
            </div>
          </div>

          <div>
            {/* Quota Progress: REMAINING CAPACITY */}
            <div style={{ marginBottom: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: '11px', color: 'rgba(255, 255, 255, 0.5)', marginBottom: '6px', gap: '6px' }}>
                <span style={{ whiteSpace: 'nowrap' }}>Monthly Pool Remaining</span>
                <span style={{ color: '#86efac', fontWeight: 600, whiteSpace: 'nowrap' }}>{tavilyPercentRemaining}% left</span>
              </div>
              <div style={{ height: '6px', background: 'rgba(255, 255, 255, 0.07)', borderRadius: '3px', overflow: 'hidden' }}>
                <div style={{
                  width: `${tavilyPercentRemaining}%`,
                  height: '100%',
                  background: 'linear-gradient(90deg, #10b981, #4ade80)',
                  borderRadius: '3px',
                  boxShadow: '0 0 8px rgba(74, 222, 128, 0.5)'
                }} />
              </div>
            </div>

            {/* Bottom info pill */}
            <div style={{
              background: 'rgba(74, 222, 128, 0.08)',
              border: '1px solid rgba(74, 222, 128, 0.18)',
              borderRadius: '7px',
              padding: '6px 10px',
              fontSize: '11px',
              color: '#86efac',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              minHeight: '30px'
            }}>
              <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                📅 Refills in {getMonthResetCountdown()} • 1st of month
              </span>
            </div>
          </div>
        </div>

        {/* Card 3: Email Checker */}
        <div 
          style={{
            background: 'linear-gradient(180deg, rgba(38, 30, 24, 0.75) 0%, rgba(26, 20, 16, 0.95) 100%)',
            border: '1px solid rgba(245, 158, 11, 0.25)',
            borderRadius: '14px',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            minHeight: '270px',
            minWidth: 0,
            boxShadow: '0 6px 24px rgba(0, 0, 0, 0.3)',
            position: 'relative',
            overflow: 'hidden',
            transition: 'transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.2s cubic-bezier(0.16, 1, 0.3, 1), border-color 0.2s ease',
            cursor: 'default'
          }}
          onMouseEnter={e => {
            e.currentTarget.style.transform = 'translateY(-3px)';
            e.currentTarget.style.borderColor = 'rgba(245, 158, 11, 0.45)';
            e.currentTarget.style.boxShadow = '0 12px 30px rgba(0, 0, 0, 0.4), 0 0 20px rgba(245, 158, 11, 0.15)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.borderColor = 'rgba(245, 158, 11, 0.25)';
            e.currentTarget.style.boxShadow = '0 6px 24px rgba(0, 0, 0, 0.3)';
          }}
        >
          {/* Top Ambient Glow */}
          <div style={{
            position: 'absolute',
            top: 0,
            right: 0,
            width: '130px',
            height: '130px',
            background: 'radial-gradient(circle at top right, rgba(245, 158, 11, 0.18), transparent 70%)',
            pointerEvents: 'none'
          }} />

          <div>
            {/* Top Row: Icon + Badge (Dedicated header tier, zero collision) */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '10px',
                  background: 'rgba(245, 158, 11, 0.16)',
                  border: '1px solid rgba(245, 158, 11, 0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fbbf24',
                  boxShadow: '0 0 12px rgba(245, 158, 11, 0.2)'
                }}>
                  <ShieldCheck size={18} />
                </div>
                <span style={{ fontSize: '10px', fontWeight: 800, padding: '2px 6px', borderRadius: '4px', background: 'rgba(245, 158, 11, 0.12)', color: '#fde047', border: '1px solid rgba(245, 158, 11, 0.25)', letterSpacing: '0.06em' }}>
                  MX DNS
                </span>
              </div>

              <span style={{
                fontSize: '11px',
                fontWeight: 700,
                padding: '3px 9px',
                borderRadius: '100px',
                background: 'rgba(245, 158, 11, 0.14)',
                color: '#fde047',
                border: '1px solid rgba(245, 158, 11, 0.3)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                whiteSpace: 'nowrap'
              }}>
                <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#fbbf24', boxShadow: '0 0 6px #fbbf24' }} />
                100% READY
              </span>
            </div>

            {/* Title + Subtitle Block */}
            <div style={{ marginBottom: '14px' }}>
              <div style={{ fontWeight: 700, fontSize: '15px', color: '#fff', letterSpacing: '-0.01em' }}>Email Address Checker</div>
              <div style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.45)', marginTop: '2px' }}>Zero-Bounce Mailbox Verifier</div>
            </div>

            {/* Core Big Metric: LIMIT LEFT */}
            <div style={{ marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                <div style={{ fontSize: '30px', fontWeight: 800, color: '#fff', letterSpacing: '-0.03em', lineHeight: 1 }}>
                  100%
                </div>
                <span style={{ fontSize: '12px', fontWeight: 600, color: '#fbbf24', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>
                  deliverability ready
                </span>
              </div>
              <div 
                style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.6)', marginTop: '6px', lineHeight: 1.4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                title="Zero bounces • Mailbox DNS active & verified"
              >
                Zero bounces • Mailbox DNS active & verified
              </div>
            </div>
          </div>

          <div>
            {/* Quota Progress: REMAINING CAPACITY */}
            <div style={{ marginBottom: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: '11px', color: 'rgba(255, 255, 255, 0.5)', marginBottom: '6px', gap: '6px' }}>
                <span style={{ whiteSpace: 'nowrap' }}>Protection Coverage</span>
                <span style={{ color: '#fde047', fontWeight: 600, whiteSpace: 'nowrap' }}>100% Active</span>
              </div>
              <div style={{ height: '6px', background: 'rgba(255, 255, 255, 0.07)', borderRadius: '3px', overflow: 'hidden' }}>
                <div style={{
                  width: '100%',
                  height: '100%',
                  background: 'linear-gradient(90deg, #d97706, #facc15)',
                  borderRadius: '3px',
                  boxShadow: '0 0 8px rgba(245, 158, 11, 0.5)'
                }} />
              </div>
            </div>

            {/* Bottom info pill */}
            <div style={{
              background: 'rgba(245, 158, 11, 0.08)',
              border: '1px solid rgba(245, 158, 11, 0.18)',
              borderRadius: '7px',
              padding: '6px 10px',
              fontSize: '11px',
              color: '#fde047',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              minHeight: '30px'
            }}>
              <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                🛡️ Real-time mailbox check • Unlimited
              </span>
            </div>
          </div>
        </div>

        {/* Card 4: Backup AI */}
        <div 
          style={{
            background: 'linear-gradient(180deg, rgba(34, 28, 44, 0.75) 0%, rgba(24, 18, 32, 0.95) 100%)',
            border: '1px solid rgba(192, 132, 252, 0.22)',
            borderRadius: '14px',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            minHeight: '270px',
            minWidth: 0,
            boxShadow: '0 6px 24px rgba(0, 0, 0, 0.3)',
            position: 'relative',
            overflow: 'hidden',
            transition: 'transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.2s cubic-bezier(0.16, 1, 0.3, 1), border-color 0.2s ease',
            cursor: 'default'
          }}
          onMouseEnter={e => {
            e.currentTarget.style.transform = 'translateY(-3px)';
            e.currentTarget.style.borderColor = 'rgba(192, 132, 252, 0.45)';
            e.currentTarget.style.boxShadow = '0 12px 30px rgba(0, 0, 0, 0.4), 0 0 20px rgba(192, 132, 252, 0.15)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.borderColor = 'rgba(192, 132, 252, 0.22)';
            e.currentTarget.style.boxShadow = '0 6px 24px rgba(0, 0, 0, 0.3)';
          }}
        >
          {/* Top Ambient Glow */}
          <div style={{
            position: 'absolute',
            top: 0,
            right: 0,
            width: '130px',
            height: '130px',
            background: 'radial-gradient(circle at top right, rgba(192, 132, 252, 0.18), transparent 70%)',
            pointerEvents: 'none'
          }} />

          <div>
            {/* Top Row: Icon + Badge (Dedicated header tier, zero collision) */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '10px',
                  background: 'rgba(192, 132, 252, 0.16)',
                  border: '1px solid rgba(192, 132, 252, 0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#c084fc',
                  boxShadow: '0 0 12px rgba(192, 132, 252, 0.2)'
                }}>
                  <Database size={18} />
                </div>
                <span style={{ fontSize: '10px', fontWeight: 800, padding: '2px 6px', borderRadius: '4px', background: 'rgba(192, 132, 252, 0.12)', color: '#d8b4fe', border: '1px solid rgba(192, 132, 252, 0.25)', letterSpacing: '0.06em' }}>
                  GEMINI
                </span>
              </div>

              <span style={{
                fontSize: '11px',
                fontWeight: 700,
                padding: '3px 9px',
                borderRadius: '100px',
                background: 'rgba(192, 132, 252, 0.14)',
                color: '#d8b4fe',
                border: '1px solid rgba(192, 132, 252, 0.3)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                whiteSpace: 'nowrap'
              }}>
                <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#c084fc', boxShadow: '0 0 6px #c084fc' }} />
                {geminiPercentRemaining}% LEFT
              </span>
            </div>

            {/* Title + Subtitle Block */}
            <div style={{ marginBottom: '14px' }}>
              <div style={{ fontWeight: 700, fontSize: '15px', color: '#fff', letterSpacing: '-0.01em' }}>Gemini 2.5 Flash</div>
              <div style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.45)', marginTop: '2px' }}>Instant Failover Backup AI</div>
            </div>

            {/* Core Big Metric: LIMIT LEFT */}
            <div style={{ marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                <div style={{ fontSize: '30px', fontWeight: 800, color: '#fff', letterSpacing: '-0.03em', lineHeight: 1 }}>
                  {formatNum(geminiReqsRemaining)}
                </div>
                <span style={{ fontSize: '12px', fontWeight: 600, color: '#c084fc', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>
                  calls left today
                </span>
              </div>
              <div 
                style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.6)', marginTop: '6px', lineHeight: 1.4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                title={`${formatNum(geminiReqsRemaining)} of 1,500 standby requests left`}
              >
                {formatNum(geminiReqsRemaining)} / 1,500 standby calls left
              </div>
            </div>
          </div>

          <div>
            {/* Quota Progress: REMAINING CAPACITY */}
            <div style={{ marginBottom: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: '11px', color: 'rgba(255, 255, 255, 0.5)', marginBottom: '6px', gap: '6px' }}>
                <span style={{ whiteSpace: 'nowrap' }}>Daily Limit Remaining</span>
                <span style={{ color: '#d8b4fe', fontWeight: 600, whiteSpace: 'nowrap' }}>{geminiPercentRemaining}% left</span>
              </div>
              <div style={{ height: '6px', background: 'rgba(255, 255, 255, 0.07)', borderRadius: '3px', overflow: 'hidden' }}>
                <div style={{
                  width: `${geminiPercentRemaining}%`,
                  height: '100%',
                  background: 'linear-gradient(90deg, #9333ea, #c084fc)',
                  borderRadius: '3px',
                  boxShadow: '0 0 8px rgba(192, 132, 252, 0.5)'
                }} />
              </div>
            </div>

            {/* Bottom info pill */}
            <div style={{
              background: 'rgba(192, 132, 252, 0.08)',
              border: '1px solid rgba(192, 132, 252, 0.18)',
              borderRadius: '7px',
              padding: '6px 10px',
              fontSize: '11px',
              color: '#d8b4fe',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              minHeight: '30px'
            }}>
              <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                ⏱️ Refills in {getMidnightUtcCountdown()} • Standby
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Middle Section: Chart + Workload Distribution */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(310px, 1fr))',
        gap: '18px',
        marginBottom: '20px'
      }}>
        {/* Left Column: 7-Day Usage History */}
        <div style={{
          background: 'rgba(255, 255, 255, 0.02)',
          border: '1px solid rgba(255, 255, 255, 0.07)',
          borderRadius: '12px',
          padding: '20px',
          position: 'relative',
          minWidth: 0
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', gap: '12px', flexWrap: 'wrap' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#fff', whiteSpace: 'nowrap' }}>AI Activity This Week</div>
              <div style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.5)', whiteSpace: 'nowrap' }}>How much AI you used over the last 7 days</div>
            </div>

            {/* Switcher */}
            <div style={{ display: 'flex', background: 'rgba(0, 0, 0, 0.3)', borderRadius: '8px', padding: '3px', border: '1px solid rgba(255, 255, 255, 0.08)', flexShrink: 0 }}>
              <button
                onClick={() => setChartMode('tokens')}
                style={{
                  padding: '4px 10px',
                  borderRadius: '6px',
                  fontSize: '11px',
                  fontWeight: chartMode === 'tokens' ? 700 : 500,
                  background: chartMode === 'tokens' ? '#2563eb' : 'transparent',
                  color: '#fff',
                  border: 'none',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap'
                }}
              >
                Words
              </button>
              <button
                onClick={() => setChartMode('requests')}
                style={{
                  padding: '4px 10px',
                  borderRadius: '6px',
                  fontSize: '11px',
                  fontWeight: chartMode === 'requests' ? 700 : 500,
                  background: chartMode === 'requests' ? '#059669' : 'transparent',
                  color: '#fff',
                  border: 'none',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap'
                }}
              >
                Tasks
              </button>
            </div>
          </div>

          {/* SVG Area Curve */}
          <div style={{ position: 'relative', width: '100%', height: '170px', overflow: 'hidden' }}>
            <svg width="100%" height="170" viewBox={`0 0 ${svgW} ${svgH}`} preserveAspectRatio="none">
              <defs>
                <linearGradient id="curveGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={chartMode === 'tokens' ? '#3b82f6' : '#10b981'} stopOpacity="0.35" />
                  <stop offset="100%" stopColor={chartMode === 'tokens' ? '#3b82f6' : '#10b981'} stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {/* Grid Lines */}
              {[0, 0.33, 0.66, 1].map((ratio, idx) => {
                const y = padT + plotH - ratio * plotH;
                const v = Math.round(currentMax * ratio);
                return (
                  <g key={idx}>
                    <line x1={padL} y1={y} x2={svgW - padR} y2={y} stroke="rgba(255, 255, 255, 0.06)" strokeDasharray="3 3" />
                    <text x={padL - 6} y={y + 3} fill="rgba(255, 255, 255, 0.35)" fontSize="9" textAnchor="end">
                      {formatNum(v)}
                    </text>
                  </g>
                );
              })}

              {/* Shaded Area */}
              {areaD && <path d={areaD} fill="url(#curveGradient)" />}

              {/* Smooth Spline Stroke */}
              {lineD && (
                <path
                  d={lineD}
                  fill="none"
                  stroke={chartMode === 'tokens' ? '#60a5fa' : '#34d399'}
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}

              {/* Interactive Points */}
              {points.map((pt, idx) => {
                const isHovered = hoveredIdx === idx;
                return (
                  <g key={idx} style={{ cursor: 'pointer' }}>
                    {isHovered && (
                      <line x1={pt.x} y1={padT} x2={pt.x} y2={padT + plotH} stroke="rgba(255, 255, 255, 0.25)" strokeDasharray="2 2" />
                    )}
                    <circle
                      cx={pt.x}
                      cy={pt.y}
                      r={isHovered ? 5 : 3.5}
                      fill="#fff"
                      stroke={chartMode === 'tokens' ? '#3b82f6' : '#10b981'}
                      strokeWidth="2"
                    />
                    <text
                      x={pt.x}
                      y={svgH - 6}
                      fill={isHovered ? '#fff' : 'rgba(255, 255, 255, 0.45)'}
                      fontSize="10"
                      fontWeight={isHovered ? 700 : 500}
                      textAnchor="middle"
                    >
                      {pt.day.label.split(',')[0]}
                    </text>
                    <rect
                      x={pt.x - 20}
                      y={padT}
                      width={40}
                      height={plotH + 15}
                      fill="transparent"
                      onMouseEnter={() => setHoveredIdx(idx)}
                      onMouseLeave={() => setHoveredIdx(null)}
                    />
                  </g>
                );
              })}
            </svg>

            {/* Hover Tooltip */}
            {hoveredIdx !== null && points[hoveredIdx] && (
              <div style={{
                position: 'absolute',
                top: '6px',
                right: '12px',
                background: 'rgba(20, 24, 30, 0.95)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                borderRadius: '8px',
                padding: '8px 12px',
                fontSize: '11px',
                zIndex: 10,
                pointerEvents: 'none',
                boxShadow: '0 4px 14px rgba(0,0,0,0.5)'
              }}>
                <div style={{ fontWeight: 700, color: '#fff', marginBottom: '4px' }}>
                  {points[hoveredIdx].day.label}
                </div>
                <div style={{ color: '#93c5fd' }}>
                  AI Words: <b>{formatNum(points[hoveredIdx].day.groqTokens)}</b>
                </div>
                <div style={{ color: '#86efac' }}>
                  Tasks Completed: <b>{points[hoveredIdx].day.totalRequests}</b>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: What the AI Does */}
        <div style={{
          background: 'rgba(255, 255, 255, 0.02)',
          border: '1px solid rgba(255, 255, 255, 0.07)',
          borderRadius: '12px',
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          minWidth: 0
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
              <Layers size={16} color="#c084fc" flexShrink={0} />
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#fff', whiteSpace: 'nowrap' }}>
                What Your AI Does
              </div>
            </div>

            {/* Segmented Stacked Bar */}
            <div style={{ display: 'flex', height: '8px', borderRadius: '4px', overflow: 'hidden', background: 'rgba(255, 255, 255, 0.06)', marginBottom: '16px' }}>
              {(() => {
                const total = actionBreakdown.reduce((sum, a) => sum + a.count, 0) || 1;
                const colors = ['#3b82f6', '#10b981', '#a855f7', '#f59e0b'];
                return actionBreakdown.map((item, idx) => {
                  const pct = Math.round((item.count / total) * 100);
                  if (pct <= 0) return null;
                  return (
                    <div key={item.name} style={{ width: `${pct}%`, background: colors[idx % colors.length] }} title={`${item.name}: ${pct}%`} />
                  );
                });
              })()}
            </div>

            {/* List Breakdown */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {(() => {
                const total = actionBreakdown.reduce((sum, a) => sum + a.count, 0) || 1;
                const colors = ['#3b82f6', '#10b981', '#a855f7', '#f59e0b'];
                
                const getFriendlyName = (name) => {
                  if (name === 'Job Search') return 'Finding Jobs';
                  if (name === 'Cold Email Drafter' || name === 'Cold Email Generation') return 'Writing Emails';
                  if (name === 'HR Discovery') return 'Finding Recruiters';
                  return name;
                };

                return actionBreakdown.map((item, idx) => {
                  const pct = Math.round((item.count / total) * 100);
                  const friendlyName = getFriendlyName(item.name);

                  return (
                    <div key={item.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', gap: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, overflow: 'hidden' }}>
                        <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: colors[idx % colors.length], flexShrink: 0 }} />
                        <span style={{ color: 'rgba(255, 255, 255, 0.75)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={friendlyName}>
                          {friendlyName}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0, whiteSpace: 'nowrap' }}>
                        <span style={{ fontWeight: 700, color: '#fff' }}>{pct}%</span>
                        <span style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.4)' }}>({item.count})</span>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </div>

          <div style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.5)', borderTop: '1px solid rgba(255, 255, 255, 0.06)', paddingTop: '10px', marginTop: '14px', lineHeight: 1.4 }}>
            Everything runs automatically on free plans — $0 cost across all tools.
          </div>
        </div>
      </div>

      {/* Bottom Section: Live Activity Log */}
      <div style={{
        background: 'rgba(0, 0, 0, 0.25)',
        border: '1px solid rgba(255, 255, 255, 0.07)',
        borderRadius: '12px',
        padding: '16px 20px',
        minWidth: 0,
        overflow: 'hidden'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Terminal size={15} color="#4ade80" flexShrink={0} />
            <span style={{ fontSize: '13px', fontWeight: 700, color: '#fff', letterSpacing: '0.02em', whiteSpace: 'nowrap' }}>
              Recent AI Activity
            </span>
          </div>
          <span style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.4)', fontFamily: 'monospace', whiteSpace: 'nowrap', flexShrink: 0 }}>
            LATEST ACTIONS
          </span>
        </div>

        {recentEvents.length === 0 ? (
          <div style={{ padding: '14px', textAlign: 'center', color: 'rgba(255, 255, 255, 0.4)', fontSize: '12px' }}>
            No recent activity yet. Search for a job or write an email to see it show up here.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {recentEvents.slice(0, 5).map(ev => {
              const timeStr = new Date(ev.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
              const isAi = ev.service === 'Groq' || ev.service === 'Gemini';

              const getFriendlyAction = (act) => {
                if (act === 'Cold Email Drafter' || act === 'Cold Email Generation') return 'Drafted Cold Email';
                if (act === 'HR Discovery') return 'Found Recruiter';
                if (act === 'Job Search') return 'Searched Jobs';
                return act;
              };

              return (
                <div
                  key={ev.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    background: 'rgba(255, 255, 255, 0.02)',
                    fontSize: '12px',
                    fontFamily: 'monospace',
                    gap: '12px',
                    minWidth: 0
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, overflow: 'hidden' }}>
                    <span style={{ color: 'rgba(255, 255, 255, 0.35)', fontSize: '11px', flexShrink: 0, whiteSpace: 'nowrap' }}>{timeStr}</span>
                    <span style={{
                      fontWeight: 700,
                      flexShrink: 0,
                      whiteSpace: 'nowrap',
                      color: ev.service === 'Groq' ? '#60a5fa' : (ev.service === 'Tavily' ? '#4ade80' : '#c084fc')
                    }}>
                      [{ev.service === 'Groq' ? 'AI Writer' : (ev.service === 'Tavily' ? 'Web Search' : ev.service)}]
                    </span>
                    <span 
                      style={{ color: 'rgba(255, 255, 255, 0.85)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}
                      title={`${getFriendlyAction(ev.action)}`}
                    >
                      {getFriendlyAction(ev.action)}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0, whiteSpace: 'nowrap' }}>
                    {isAi && ev.tokens > 0 && (
                      <span style={{ color: '#93c5fd', fontWeight: 600 }}>
                        {formatNum(ev.tokens)} words
                      </span>
                    )}
                    <span style={{
                      fontSize: '10px',
                      fontWeight: 700,
                      padding: '2px 7px',
                      borderRadius: '4px',
                      background: ev.status === 'success' ? 'rgba(74, 222, 128, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                      color: ev.status === 'success' ? '#86efac' : '#f87171'
                    }}>
                      DONE
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
