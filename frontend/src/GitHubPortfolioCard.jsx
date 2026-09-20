import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { API_BASE } from './useAppLogic';

// GitHub-accurate language colors
const LANG_COLORS = {
  JavaScript: '#f1e05a', TypeScript: '#3178c6', Python: '#3572A5', Java: '#b07219',
  Go: '#00ADD8', Rust: '#dea584', Ruby: '#701516', PHP: '#4F5D95', Swift: '#F05138',
  Kotlin: '#A97BFF', 'C++': '#f34b7d', C: '#555555', 'C#': '#178600', Dart: '#00B4AB',
  Shell: '#89e051', HTML: '#e34c26', CSS: '#563d7c', SCSS: '#c6538c', Vue: '#41b883',
  Svelte: '#ff3e00', Lua: '#000080', R: '#198CE7', Scala: '#c22d40', Elixir: '#6e4a7e',
  Haskell: '#5e5086', Blade: '#f7523f', Jupyter: '#DA5B0B', Dockerfile: '#384d54',
  Makefile: '#427819', EJS: '#a91e50', HCL: '#844FBA', Nix: '#7e7eff', Zig: '#ec915c',
  Code: '#8b949e'
};

function getRelativeTime(dateStr) {
  if (!dateStr) return '';
  const now = new Date();
  const d = new Date(dateStr);
  const diffMs = now - d;
  const mins = Math.floor(diffMs / 60000);
  const hrs = Math.floor(diffMs / 3600000);
  const days = Math.floor(diffMs / 86400000);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (hrs < 24) return `${hrs}h ago`;
  if (days < 30) return `${days}d ago`;
  if (months < 12) return `${months}mo ago`;
  return `${years}y ago`;
}

export default function GitHubPortfolioCard({ profile, setProfile, apiFetch, notify, syncingGithub, syncGithub }) {
  const [searchRepo, setSearchRepo] = useState('');
  const [selectedLang, setSelectedLang] = useState('ALL');
  const [sortBy, setSortBy] = useState('relevance');
  const [expandedReadme, setExpandedReadme] = useState({});
  const [copiedRepo, setCopiedRepo] = useState(null);
  const [hoveredRepo, setHoveredRepo] = useState(null);
  const [showAllRepos, setShowAllRepos] = useState(false);
  const [showTokenSettings, setShowTokenSettings] = useState(false);
  const [tokenInput, setTokenInput] = useState(profile?.githubToken || '');

  // ── Repository Link Limit & Pinning Configuration ──────
  const [repoLinkCount, setRepoLinkCount] = useState(
    typeof profile?.githubRepoLinkCount === 'number' ? profile.githubRepoLinkCount : 2
  );
  const [selectedReposForLinks, setSelectedReposForLinks] = useState(
    Array.isArray(profile?.selectedRepoNames) ? profile.selectedRepoNames : []
  );
  const [isSavingRepoSettings, setIsSavingRepoSettings] = useState(false);
  const [confirmedNotice, setConfirmedNotice] = useState(null);

  useEffect(() => {
    if (profile) {
      if (typeof profile.githubRepoLinkCount === 'number') {
        setRepoLinkCount(profile.githubRepoLinkCount);
      }
      if (Array.isArray(profile.selectedRepoNames)) {
        setSelectedReposForLinks(profile.selectedRepoNames);
      }
    }
  }, [profile?.githubRepoLinkCount, profile?.selectedRepoNames]);

  const savedCount = typeof profile?.githubRepoLinkCount === 'number' ? profile.githubRepoLinkCount : 2;
  const savedSelected = Array.isArray(profile?.selectedRepoNames) ? profile.selectedRepoNames : [];
  const hasUnsavedChanges =
    repoLinkCount !== savedCount ||
    JSON.stringify([...selectedReposForLinks].sort()) !== JSON.stringify([...savedSelected].sort());

  const handleConfirmRepoLinks = async (overrideCount, overrideList) => {
    const countToSave = typeof overrideCount === 'number' ? overrideCount : repoLinkCount;
    const listToSave = Array.isArray(overrideList) ? overrideList : selectedReposForLinks;

    setIsSavingRepoSettings(true);
    try {
      const fetcher = apiFetch || fetch;
      const res = await fetcher(`${API_BASE}/api/profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...profile,
          githubRepoLinkCount: countToSave,
          selectedRepoNames: listToSave
        })
      });
      if (res.ok) {
        const updated = await res.json();
        if (setProfile) setProfile(updated);
        setConfirmedNotice(`Confirmed: AI will use up to ${countToSave} repository link${countToSave === 1 ? '' : 's'} in emails.`);
        if (notify) {
          notify(`Confirmed: Using up to ${countToSave} repo link${countToSave === 1 ? '' : 's'} for emails.`, 'success');
        }
        setTimeout(() => setConfirmedNotice(null), 4000);
      } else {
        if (notify) notify('Failed to save repository link settings.', 'error');
      }
    } catch (err) {
      console.error('Error saving repo link settings:', err);
      if (notify) notify('Failed to save repository link settings.', 'error');
    } finally {
      setIsSavingRepoSettings(false);
    }
  };

  const handleToggleRepoSelection = (repoName) => {
    const isSelected = selectedReposForLinks.includes(repoName);
    let updated;
    if (isSelected) {
      updated = selectedReposForLinks.filter(n => n !== repoName);
    } else {
      updated = [...selectedReposForLinks, repoName];
      if (repoLinkCount < updated.length && repoLinkCount < 4) {
        setRepoLinkCount(Math.min(updated.length, 4));
      }
    }
    setSelectedReposForLinks(updated);
  };

  const insights = profile?.githubInsights;

  const renderTokenSettings = () => (
    <div style={{
      margin: '16px auto',
      maxWidth: '560px',
      padding: '16px 18px',
      background: 'rgba(15, 23, 42, 0.95)',
      border: '1px solid rgba(56, 189, 248, 0.3)',
      borderRadius: '12px',
      textAlign: 'left',
      boxShadow: '0 8px 30px rgba(0, 0, 0, 0.4)'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 700, color: '#f8fafc' }}>
          <span>🔑</span>
          <span>GitHub Personal Access Token</span>
          <span style={{ fontSize: '10px', background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', padding: '2px 8px', borderRadius: '10px', fontWeight: 600 }}>
            5,000 req/hr
          </span>
        </div>
        <button
          type="button"
          onClick={() => setShowTokenSettings(false)}
          style={{ background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '16px', padding: '2px 6px' }}
        >
          ✕
        </button>
      </div>

      <p style={{ fontSize: '12px', color: '#94a3b8', lineHeight: 1.5, margin: '0 0 12px 0' }}>
        Unauthenticated GitHub API calls are limited to <strong>60/hr per IP</strong>. A free GitHub token increases your limit to <strong>5,000/hr</strong>. It only needs public read-only access.
      </p>

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="password"
          placeholder="ghp_... or github_pat_..."
          value={tokenInput}
          onChange={(e) => setTokenInput(e.target.value)}
          style={{
            flex: 1, minWidth: '220px',
            background: 'rgba(0, 0, 0, 0.4)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            color: '#f8fafc', padding: '8px 12px',
            borderRadius: '8px', fontSize: '13px',
            outline: 'none', fontFamily: 'monospace'
          }}
        />

        {(() => {
          const hasTokenChange = tokenInput.trim() !== (profile?.githubToken || '').trim();
          return (
            <button
              type="button"
              onClick={() => {
                syncGithub(profile.github, tokenInput);
                setShowTokenSettings(false);
              }}
              disabled={syncingGithub || !hasTokenChange}
              style={{
                padding: '8px 16px', fontSize: '12px', fontWeight: 600,
                background: hasTokenChange
                  ? 'linear-gradient(135deg, #0284c7, #38bdf8)'
                  : 'rgba(255, 255, 255, 0.05)',
                color: hasTokenChange ? '#fff' : '#64748b',
                border: hasTokenChange ? 'none' : '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '8px',
                cursor: (syncingGithub || !hasTokenChange) ? 'not-allowed' : 'pointer',
                opacity: hasTokenChange ? 1 : 0.5,
                boxShadow: hasTokenChange ? '0 2px 10px rgba(2, 132, 199, 0.3)' : 'none',
                transition: 'all 0.2s ease'
              }}
            >
              {syncingGithub ? 'Saving & Syncing...' : hasTokenChange ? 'Save & Sync' : 'No Changes'}
            </button>
          );
        })()}

        {profile?.githubToken && (
          <button
            type="button"
            onClick={() => {
              setTokenInput('');
              syncGithub(profile.github, '');
              setShowTokenSettings(false);
            }}
            style={{
              padding: '8px 12px', fontSize: '12px', fontWeight: 500,
              background: 'rgba(239, 68, 68, 0.1)', color: '#f87171',
              border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '8px',
              cursor: 'pointer'
            }}
          >
            Clear
          </button>
        )}
      </div>

      <div style={{ marginTop: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: '#64748b', flexWrap: 'wrap', gap: '6px' }}>
        <span>Stored securely in your private user profile.</span>
        <a
          href="https://github.com/settings/tokens/new?description=AI-Job-Finder-Sync&scopes=public_repo"
          target="_blank" rel="noreferrer"
          style={{ color: '#38bdf8', textDecoration: 'none', fontWeight: 500 }}
        >
          Generate Free Token on GitHub ↗
        </a>
      </div>
    </div>
  );

  const toggleReadme = useCallback((repoName) => {
    setExpandedReadme(prev => ({ ...prev, [repoName]: !prev[repoName] }));
  }, []);

  const copyReadme = useCallback((text, repoName) => {
    navigator.clipboard.writeText(text);
    setCopiedRepo(repoName);
    setTimeout(() => setCopiedRepo(null), 2000);
  }, []);

  // Compute language distribution percentages
  const langDistribution = useMemo(() => {
    if (!insights || !Array.isArray(insights.repos)) return [];
    const counts = {};
    insights.repos.forEach(r => {
      if (r.language && r.language !== 'Code') {
        counts[r.language] = (counts[r.language] || 0) + 1;
      }
    });
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([lang, count]) => ({
        lang,
        count,
        pct: total > 0 ? Math.round((count / total) * 100) : 0,
        color: LANG_COLORS[lang] || '#8b949e'
      }));
  }, [insights]);

  // Filtered & Sorted Repos
  const processedRepos = useMemo(() => {
    if (!insights || !Array.isArray(insights.repos)) return [];
    let list = [...insights.repos];

    if (searchRepo.trim()) {
      const q = searchRepo.toLowerCase().trim();
      list = list.filter(r =>
        (r.name && r.name.toLowerCase().includes(q)) ||
        (r.language && r.language.toLowerCase().includes(q)) ||
        (r.description && r.description.toLowerCase().includes(q)) ||
        (r.readmeSnippet && r.readmeSnippet.toLowerCase().includes(q)) ||
        (r.topics && r.topics.some(t => t.toLowerCase().includes(q)))
      );
    }

    if (selectedLang !== 'ALL') {
      list = list.filter(r => r.language === selectedLang);
    }

    if (sortBy === 'stars') list.sort((a, b) => (b.stars || 0) - (a.stars || 0));
    else if (sortBy === 'recent') list.sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
    else if (sortBy === 'readme') list.sort((a, b) => (b.readmeSnippet ? 1 : 0) - (a.readmeSnippet ? 1 : 0));

    return list;
  }, [insights, searchRepo, selectedLang, sortBy]);

  const displayRepos = showAllRepos ? processedRepos : processedRepos.slice(0, 8);

  // ── Empty State ──────────────────────────────────────────
  if (!insights || !Array.isArray(insights.repos) || insights.repos.length === 0) {
    return (
      <div style={{
        background: 'linear-gradient(160deg, rgba(15, 23, 42, 0.85), rgba(30, 41, 59, 0.9))',
        border: '1px dashed rgba(56, 189, 248, 0.35)',
        borderRadius: '18px',
        padding: '44px 32px',
        textAlign: 'center',
        boxShadow: '0 12px 40px rgba(0, 0, 0, 0.3)',
        backdropFilter: 'blur(16px)',
        position: 'relative',
        overflow: 'hidden'
      }}>
        {/* Background glow */}
        <div style={{
          position: 'absolute', top: '-80px', left: '50%', transform: 'translateX(-50%)',
          width: '300px', height: '200px', borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(56, 189, 248, 0.08) 0%, transparent 70%)',
          pointerEvents: 'none'
        }} />

        <div style={{
          width: '64px', height: '64px', borderRadius: '50%',
          background: 'rgba(56, 189, 248, 0.08)', border: '2px solid rgba(56, 189, 248, 0.2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '30px', margin: '0 auto 20px auto',
          boxShadow: '0 0 20px rgba(56, 189, 248, 0.15)'
        }}>
          🐙
        </div>

        <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#f8fafc', marginBottom: '8px', letterSpacing: '-0.02em' }}>
          Deep Technical Portfolio Sync
        </h3>
        <p style={{ fontSize: '13px', color: '#94a3b8', maxWidth: '440px', margin: '0 auto 24px auto', lineHeight: 1.65 }}>
          Index all your public repos, extract architectural summaries from{' '}
          <code style={{ color: '#38bdf8', background: 'rgba(56, 189, 248, 0.08)', padding: '2px 6px', borderRadius: '4px', fontSize: '12px' }}>README.md</code>{' '}
          files, and build a verified portfolio memory that auto-cites real projects in outreach.
        </p>

        <button
          type="button"
          onClick={() => syncGithub(profile.github)}
          disabled={syncingGithub || !profile.github}
          style={{
            padding: '11px 28px', fontSize: '14px', fontWeight: 600,
            display: 'inline-flex', alignItems: 'center', gap: '10px',
            background: syncingGithub ? 'rgba(56, 189, 248, 0.15)' : 'linear-gradient(135deg, #0284c7, #38bdf8)',
            color: '#fff', border: 'none', borderRadius: '10px', cursor: syncingGithub ? 'wait' : 'pointer',
            boxShadow: syncingGithub ? 'none' : '0 6px 20px rgba(2, 132, 199, 0.4)',
            transition: 'all 0.25s ease',
            opacity: (!profile.github && !syncingGithub) ? 0.5 : 1
          }}
        >
          {syncingGithub ? (
            <>
              <span className="spinner" style={{ width: '14px', height: '14px' }} />
              Indexing Public Repos & READMEs...
            </>
          ) : (
            <>⚡ Sync GitHub Portfolio</>
          )}
        </button>

        <div style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
          <button
            type="button"
            onClick={() => setShowTokenSettings(!showTokenSettings)}
            style={{
              background: 'transparent',
              border: 'none',
              color: profile?.githubToken ? '#4ade80' : '#38bdf8',
              fontSize: '12px',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              textDecoration: 'underline',
              textUnderlineOffset: '3px'
            }}
          >
            {profile?.githubToken ? '🔑 Token Configured (5k req/hr) · Change' : '🔑 Optional: Add GitHub Token (Unlocks 5,000 req/hr limit)'}
          </button>
        </div>

        {showTokenSettings && renderTokenSettings()}

        {!profile.github && (
          <p style={{ marginTop: '14px', fontSize: '11px', color: '#64748b' }}>
            Enter your GitHub URL in the form above to enable sync.
          </p>
        )}
      </div>
    );
  }

  // ── Main View ────────────────────────────────────────────
  return (
    <div style={{
      background: 'linear-gradient(180deg, rgba(15, 23, 42, 0.9) 0%, rgba(15, 23, 42, 0.97) 100%)',
      border: '1px solid rgba(255, 255, 255, 0.07)',
      borderRadius: '18px',
      boxShadow: '0 12px 40px rgba(0, 0, 0, 0.4)',
      backdropFilter: 'blur(20px)',
      overflow: 'hidden'
    }}>
      {/* ── Header Banner ──────────────────────────────────── */}
      <div style={{
        padding: '22px 24px 18px',
        background: 'linear-gradient(135deg, rgba(56, 189, 248, 0.06), rgba(168, 85, 247, 0.04))',
        borderBottom: '1px solid rgba(255, 255, 255, 0.06)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '14px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            {insights.avatarUrl ? (
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <img src={insights.avatarUrl} alt="" style={{
                  width: '50px', height: '50px', borderRadius: '14px',
                  border: '2px solid rgba(56, 189, 248, 0.4)',
                  boxShadow: '0 0 18px rgba(56, 189, 248, 0.2)'
                }} />
                <span style={{
                  position: 'absolute', bottom: '-3px', right: '-3px',
                  background: '#22c55e', width: '12px', height: '12px',
                  borderRadius: '50%', border: '2.5px solid #0f172a'
                }} />
              </div>
            ) : (
              <div style={{
                width: '50px', height: '50px', borderRadius: '14px',
                background: 'rgba(56, 189, 248, 0.08)', border: '1px solid rgba(56, 189, 248, 0.25)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px'
              }}>🐙</div>
            )}

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <a
                  href={profile.github || `https://github.com/${insights.username}`}
                  target="_blank" rel="noreferrer"
                  style={{
                    fontSize: '17px', fontWeight: 700, color: '#f1f5f9',
                    textDecoration: 'none', letterSpacing: '-0.02em'
                  }}
                >
                  @{insights.username}
                </a>
                <span style={{
                  fontSize: '10px', fontWeight: 600, letterSpacing: '0.03em',
                  background: 'linear-gradient(135deg, rgba(56, 189, 248, 0.15), rgba(168, 85, 247, 0.12))',
                  color: '#7dd3fc', padding: '3px 9px', borderRadius: '20px',
                  border: '1px solid rgba(56, 189, 248, 0.2)'
                }}>
                  ⚡ AI-INDEXED
                </span>
              </div>

              {insights.bio && (
                <p style={{ margin: '3px 0 0 0', fontSize: '12px', color: '#94a3b8', lineHeight: 1.4, maxWidth: '380px' }}>
                  {insights.bio}
                </p>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              onClick={() => setShowTokenSettings(!showTokenSettings)}
              style={{
                padding: '7px 12px', fontSize: '11px', fontWeight: 600,
                display: 'inline-flex', alignItems: 'center', gap: '6px',
                background: profile?.githubToken ? 'rgba(34, 197, 94, 0.1)' : 'rgba(255, 255, 255, 0.04)',
                color: profile?.githubToken ? '#4ade80' : '#94a3b8',
                border: profile?.githubToken ? '1px solid rgba(34, 197, 94, 0.25)' : '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '8px',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              title={profile?.githubToken ? 'Using 5,000 req/hr limit' : 'Click to configure GitHub Token (5,000 req/hr)'}
            >
              🔑 {profile?.githubToken ? '5k/hr' : 'Token'}
            </button>

            <button
              type="button"
              onClick={() => syncGithub(profile.github)}
              disabled={syncingGithub}
              style={{
                padding: '7px 14px', fontSize: '11px', fontWeight: 600,
                display: 'inline-flex', alignItems: 'center', gap: '6px',
                background: 'rgba(255, 255, 255, 0.04)', color: '#94a3b8',
                border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '8px',
                cursor: syncingGithub ? 'wait' : 'pointer',
                transition: 'all 0.2s'
              }}
            >
              {syncingGithub ? (
                <><span className="spinner" style={{ width: '11px', height: '11px' }} /> Syncing…</>
              ) : (
                <>🔄 Re-Sync</>
              )}
            </button>
          </div>
        </div>

        {showTokenSettings && renderTokenSettings()}
      </div>

      {/* ── Language Distribution Bar ──────────────────────── */}
      {langDistribution.length > 0 && (
        <div style={{ padding: '14px 24px' }}>
          <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600, marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Language Distribution
          </div>
          {/* Progress bar */}
          <div style={{
            display: 'flex', height: '8px', borderRadius: '4px', overflow: 'hidden',
            background: 'rgba(0, 0, 0, 0.3)', marginBottom: '8px'
          }}>
            {langDistribution.map((ld, i) => (
              <div key={i} style={{
                width: `${ld.pct}%`, background: ld.color,
                minWidth: ld.pct > 0 ? '3px' : '0',
                transition: 'width 0.5s ease',
                borderRight: i < langDistribution.length - 1 ? '1px solid rgba(0,0,0,0.4)' : 'none'
              }} title={`${ld.lang}: ${ld.pct}% (${ld.count} repos)`} />
            ))}
          </div>
          {/* Legend chips */}
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {langDistribution.slice(0, 8).map((ld, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setSelectedLang(selectedLang === ld.lang ? 'ALL' : ld.lang)}
                style={{
                  fontSize: '11px', fontWeight: 500,
                  padding: '3px 9px', borderRadius: '6px', cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', gap: '5px',
                  background: selectedLang === ld.lang ? `${ld.color}22` : 'rgba(255, 255, 255, 0.03)',
                  border: selectedLang === ld.lang ? `1px solid ${ld.color}55` : '1px solid rgba(255, 255, 255, 0.06)',
                  color: selectedLang === ld.lang ? ld.color : '#cbd5e1',
                  transition: 'all 0.15s ease'
                }}
              >
                <span style={{
                  width: '7px', height: '7px', borderRadius: '50%',
                  background: ld.color, flexShrink: 0
                }} />
                {ld.lang}
                <span style={{ color: '#64748b', fontSize: '10px' }}>{ld.pct}%</span>
              </button>
            ))}
            {selectedLang !== 'ALL' && (
              <button
                type="button"
                onClick={() => setSelectedLang('ALL')}
                style={{
                  fontSize: '11px', padding: '3px 9px', borderRadius: '6px',
                  background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.2)',
                  color: '#f87171', cursor: 'pointer'
                }}
              >
                ✕ Clear
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Cold Email Repository Link Settings ────────────── */}
      <div style={{
        margin: '0 24px 16px',
        padding: '16px 18px',
        background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.85) 0%, rgba(30, 41, 59, 0.65) 100%)',
        border: hasUnsavedChanges
          ? '1px solid rgba(245, 158, 11, 0.4)'
          : '1px solid rgba(56, 189, 248, 0.25)',
        borderRadius: '12px',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.25)',
        position: 'relative'
      }}>
        {/* Top Header Row */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '10px',
          marginBottom: '10px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '16px' }}>🔗</span>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '13px', fontWeight: 700, color: '#f8fafc', letterSpacing: '-0.01em' }}>
                  Cold Email Repository Link Settings
                </span>
                {hasUnsavedChanges ? (
                  <span style={{
                    fontSize: '10px', fontWeight: 700,
                    background: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24',
                    border: '1px solid rgba(245, 158, 11, 0.35)',
                    padding: '2px 8px', borderRadius: '10px'
                  }}>
                    ● Unsaved Changes (Click Confirm below)
                  </span>
                ) : (
                  <span style={{
                    fontSize: '10px', fontWeight: 700,
                    background: 'rgba(16, 185, 129, 0.15)', color: '#34d399',
                    border: '1px solid rgba(16, 185, 129, 0.35)',
                    padding: '2px 8px', borderRadius: '10px'
                  }}>
                    ✓ Confirmed & Active: Up to {repoLinkCount} Link{repoLinkCount === 1 ? '' : 's'}
                  </span>
                )}
              </div>
              <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#94a3b8' }}>
                Configure and confirm how many GitHub project links AI embeds in drafted cold emails. (2 links is recommended).
              </p>
            </div>
          </div>

          {/* Confirm Action Button */}
          <button
            type="button"
            onClick={() => handleConfirmRepoLinks()}
            disabled={!hasUnsavedChanges || isSavingRepoSettings}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '7px 15px',
              borderRadius: '8px',
              fontSize: '12px',
              fontWeight: 700,
              cursor: (!hasUnsavedChanges || isSavingRepoSettings) ? 'not-allowed' : 'pointer',
              background: hasUnsavedChanges
                ? 'linear-gradient(135deg, #0284c7 0%, #2563eb 100%)'
                : 'rgba(255, 255, 255, 0.04)',
              color: hasUnsavedChanges ? '#ffffff' : '#64748b',
              border: hasUnsavedChanges
                ? '1px solid #38bdf8'
                : '1px solid rgba(255, 255, 255, 0.08)',
              boxShadow: hasUnsavedChanges ? '0 0 16px rgba(2, 132, 199, 0.45)' : 'none',
              opacity: hasUnsavedChanges ? 1 : 0.6,
              transition: 'all 0.2s ease'
            }}
          >
            {isSavingRepoSettings ? (
              <>
                <span className="spinner" style={{ width: '12px', height: '12px' }} />
                <span>Saving...</span>
              </>
            ) : hasUnsavedChanges ? (
              <>
                <span>✓</span>
                <span>Confirm: Use {repoLinkCount} {repoLinkCount === 1 ? 'Repo' : 'Repos'} for Links</span>
              </>
            ) : (
              <>
                <span>✓</span>
                <span>Confirmed (No Changes)</span>
              </>
            )}
          </button>
        </div>

        {/* Count Selector Options */}
        <div style={{
          display: 'flex',
          gap: '8px',
          flexWrap: 'wrap',
          alignItems: 'center',
          marginTop: '10px',
          paddingTop: '10px',
          borderTop: '1px solid rgba(255, 255, 255, 0.06)'
        }}>
          <span style={{ fontSize: '11px', fontWeight: 600, color: '#cbd5e1', marginRight: '4px' }}>
            Repo Links Limit:
          </span>
          {[
            { count: 0, label: '0 (None / Text Only)', hint: 'Zero hyperlinks, project names as plain text' },
            { count: 1, label: '1 Repo', hint: '1 top match' },
            { count: 2, label: '2 Repos (Recommended)', hint: 'Ideal balance & deliverability' },
            { count: 3, label: '3 Repos', hint: 'Multi-stack showcases' },
            { count: 4, label: '4 Repos', hint: 'Maximum technical proof' }
          ].map((item) => {
            const isSelected = repoLinkCount === item.count;
            return (
              <button
                key={item.count}
                type="button"
                onClick={() => setRepoLinkCount(item.count)}
                title={item.hint}
                style={{
                  fontSize: '11px',
                  fontWeight: isSelected ? 700 : 500,
                  padding: '5px 12px',
                  borderRadius: '7px',
                  cursor: 'pointer',
                  background: isSelected
                    ? 'rgba(56, 189, 248, 0.2)'
                    : 'rgba(255, 255, 255, 0.04)',
                  color: isSelected ? '#38bdf8' : '#94a3b8',
                  border: isSelected
                    ? '1px solid rgba(56, 189, 248, 0.6)'
                    : '1px solid rgba(255, 255, 255, 0.08)',
                  transition: 'all 0.15s ease',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                {isSelected && <span style={{ color: '#38bdf8' }}>●</span>}
                {item.label}
              </button>
            );
          })}
        </div>

        {/* Dynamic Context & Pinned Repos Guidance */}
        <div style={{ marginTop: '10px', fontSize: '11px', color: '#94a3b8', lineHeight: 1.5 }}>
          {repoLinkCount === 0 ? (
            <div style={{
              background: 'rgba(239, 68, 68, 0.08)',
              border: '1px solid rgba(239, 68, 68, 0.2)',
              borderRadius: '8px',
              padding: '6px 12px',
              color: '#fca5a5',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}>
              <span>🛡️</span>
              <span><strong>Hyperlinks disabled:</strong> The AI drafter will mention relevant project names as plain text without adding markdown links, keeping cold email spam filters at minimal sensitivity.</span>
            </div>
          ) : (
            <div style={{
              background: 'rgba(0, 0, 0, 0.25)',
              border: '1px solid rgba(255, 255, 255, 0.05)',
              borderRadius: '8px',
              padding: '8px 12px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '6px' }}>
                <span style={{ color: '#cbd5e1' }}>
                  {selectedReposForLinks.length > 0 ? (
                    <>
                      📌 <strong>{selectedReposForLinks.length}</strong> pinned priority pool (AI matches & embeds the <strong>best {repoLinkCount} fit{repoLinkCount === 1 ? '' : 's'}</strong> for each specific job):
                    </>
                  ) : (
                    <>
                      ⚡ <strong>Automatic AI Selection:</strong> AI will choose the top {repoLinkCount} best matching repo link{repoLinkCount === 1 ? '' : 's'} for each job description.
                    </>
                  )}
                </span>
                <span style={{ fontSize: '10px', color: '#64748b' }}>
                  Tip: Click "★ Link in Emails" on any repo below to prioritize it
                </span>
              </div>

              {selectedReposForLinks.length > 0 && (
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '6px' }}>
                  {selectedReposForLinks.map((name) => (
                    <span
                      key={name}
                      style={{
                        fontSize: '10px',
                        fontWeight: 600,
                        background: 'rgba(56, 189, 248, 0.15)',
                        border: '1px solid rgba(56, 189, 248, 0.35)',
                        color: '#7dd3fc',
                        padding: '2px 8px',
                        borderRadius: '6px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px'
                      }}
                    >
                      <span>📌 {name}</span>
                      <button
                        type="button"
                        onClick={() => handleToggleRepoSelection(name)}
                        title="Unpin this repo"
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#94a3b8',
                          cursor: 'pointer',
                          fontSize: '10px',
                          padding: 0,
                          lineHeight: 1
                        }}
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                  <button
                    type="button"
                    onClick={() => setSelectedReposForLinks([])}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#f87171',
                      cursor: 'pointer',
                      fontSize: '10px',
                      padding: '2px 6px'
                    }}
                  >
                    Clear All Pinned
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Confirmation Success Alert */}
        {confirmedNotice && (
          <div style={{
            marginTop: '10px',
            background: 'rgba(16, 185, 129, 0.15)',
            border: '1px solid rgba(16, 185, 129, 0.4)',
            color: '#6ee7b7',
            padding: '7px 12px',
            borderRadius: '8px',
            fontSize: '11px',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}>
            <span>✓</span>
            <span>{confirmedNotice}</span>
          </div>
        )}
      </div>

      {/* ── Search & Sort Bar ──────────────────────────────── */}
      <div style={{
        padding: '0 24px 14px',
        display: 'flex', justifyContent: 'space-between',
        alignItems: 'center', gap: '10px', flexWrap: 'wrap'
      }}>
        <div style={{ flex: 1, minWidth: '180px', position: 'relative' }}>
          <input
            type="text"
            className="form-input"
            style={{
              width: '100%', padding: '8px 32px 8px 14px', fontSize: '12px', height: '34px',
              background: 'rgba(0, 0, 0, 0.3)', borderColor: 'rgba(255, 255, 255, 0.08)',
              borderRadius: '8px', color: '#e2e8f0'
            }}
            placeholder="Search repos, stacks, README content…"
            value={searchRepo}
            onChange={(e) => setSearchRepo(e.target.value)}
          />
          {searchRepo && (
            <button
              type="button"
              onClick={() => setSearchRepo('')}
              style={{
                position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)',
                background: 'rgba(255,255,255,0.08)', border: 'none', color: '#94a3b8',
                width: '18px', height: '18px', borderRadius: '50%', cursor: 'pointer',
                fontSize: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}
            >✕</button>
          )}
        </div>

        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          className="form-input"
          style={{
            height: '34px', padding: '0 10px', fontSize: '11px',
            background: 'rgba(0, 0, 0, 0.3)', borderColor: 'rgba(255, 255, 255, 0.08)',
            borderRadius: '8px', color: '#cbd5e1', minWidth: '150px'
          }}
        >
          <option value="relevance">Sort: AI Relevance</option>
          <option value="stars">Sort: Most Stars ★</option>
          <option value="recent">Sort: Recently Updated</option>
          <option value="readme">Sort: Has README 📖</option>
        </select>
      </div>

      {/* ── Repo Count / Filter Info ───────────────────── */}
      <div style={{
        padding: '0 24px 10px', fontSize: '11px', color: '#64748b',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center'
      }}>
        <span>
          Showing <strong style={{ color: '#94a3b8' }}>{displayRepos.length}</strong>{' '}
          of <strong style={{ color: '#94a3b8' }}>{processedRepos.length}</strong> repos
          {selectedLang !== 'ALL' && (
            <span style={{ color: LANG_COLORS[selectedLang] || '#38bdf8' }}> • filtered by {selectedLang}</span>
          )}
        </span>
        {insights.lastSyncedAt && (
          <span>Last synced: {getRelativeTime(insights.lastSyncedAt)}</span>
        )}
      </div>

      {/* ── Repository Cards ───────────────────────────────── */}
      <div style={{
        padding: '0 24px 20px',
        maxHeight: '580px',
        overflowY: 'auto'
      }}>
        {processedRepos.length === 0 ? (
          <div style={{
            padding: '36px 20px', textAlign: 'center',
            background: 'rgba(0, 0, 0, 0.2)', borderRadius: '12px',
            border: '1px solid rgba(255, 255, 255, 0.05)'
          }}>
            <div style={{ fontSize: '28px', marginBottom: '10px' }}>🔍</div>
            <div style={{ fontSize: '14px', color: '#94a3b8', fontWeight: 500 }}>No repos match your search</div>
            <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
              Try a different keyword or clear the filter.
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {displayRepos.map((r, i) => {
              const isExpanded = !!expandedReadme[r.name];
              const hasReadme = !!r.readmeSnippet;
              const isHovered = hoveredRepo === r.name;
              const isSelectedForLink = selectedReposForLinks.includes(r.name);
              const langColor = LANG_COLORS[r.language] || LANG_COLORS.Code;

              return (
                <div
                  key={r.name || i}
                  onMouseEnter={() => setHoveredRepo(r.name)}
                  onMouseLeave={() => setHoveredRepo(null)}
                  style={{
                    background: isSelectedForLink
                      ? 'rgba(56, 189, 248, 0.05)'
                      : isHovered
                      ? 'rgba(255, 255, 255, 0.04)'
                      : 'rgba(0, 0, 0, 0.2)',
                    border: `1px solid ${isSelectedForLink ? 'rgba(56, 189, 248, 0.35)' : isHovered ? 'rgba(56, 189, 248, 0.15)' : 'rgba(255, 255, 255, 0.05)'}`,
                    borderRadius: '12px',
                    padding: '14px 16px',
                    transition: 'all 0.2s ease',
                    position: 'relative',
                    overflow: 'hidden'
                  }}
                >
                  {/* Left accent line */}
                  <div style={{
                    position: 'absolute', left: 0, top: 0, bottom: 0, width: isSelectedForLink ? '4px' : '3px',
                    background: isSelectedForLink ? '#38bdf8' : langColor, borderRadius: '3px 0 0 3px',
                    opacity: isHovered || isSelectedForLink ? 1 : 0.5,
                    transition: 'all 0.2s ease'
                  }} />

                  {/* Top row: name + badges */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px', paddingLeft: '6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', flex: 1, minWidth: 0 }}>
                      <a
                        href={r.url} target="_blank" rel="noreferrer"
                        style={{
                          fontSize: '14px', fontWeight: 700, color: '#e2e8f0',
                          textDecoration: 'none', letterSpacing: '-0.01em',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                        }}
                      >
                        {r.name}
                      </a>
                      {hasReadme && (
                        <span style={{
                          fontSize: '9px', fontWeight: 700, letterSpacing: '0.04em',
                          background: 'rgba(16, 185, 129, 0.1)', color: '#34d399',
                          padding: '2px 6px', borderRadius: '4px',
                          border: '1px solid rgba(16, 185, 129, 0.2)'
                        }}>README</span>
                      )}
                      {/* Cold Email Link Pin Toggle */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleRepoSelection(r.name);
                        }}
                        title={isSelectedForLink ? 'Click to unpin from cold email links' : 'Click to prioritize this repository link in cold emails'}
                        style={{
                          background: isSelectedForLink ? 'rgba(56, 189, 248, 0.2)' : 'rgba(255, 255, 255, 0.04)',
                          border: isSelectedForLink ? '1px solid rgba(56, 189, 248, 0.5)' : '1px solid rgba(255, 255, 255, 0.08)',
                          color: isSelectedForLink ? '#38bdf8' : '#94a3b8',
                          padding: '2px 8px',
                          borderRadius: '5px',
                          fontSize: '10px',
                          fontWeight: 600,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        <span>{isSelectedForLink ? '★' : '☆'}</span>
                        <span>{isSelectedForLink ? 'Linked for Emails' : 'Link in Emails'}</span>
                      </button>
                    </div>

                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexShrink: 0 }}>
                      {r.stars > 0 && (
                        <span style={{
                          fontSize: '11px', fontWeight: 600, color: '#fbbf24',
                          background: 'rgba(251, 191, 36, 0.1)',
                          padding: '1px 7px', borderRadius: '5px'
                        }}>★ {r.stars}</span>
                      )}
                      {r.forks > 0 && (
                        <span style={{
                          fontSize: '11px', color: '#94a3b8',
                          background: 'rgba(255,255,255,0.04)',
                          padding: '1px 6px', borderRadius: '5px'
                        }}>🍴 {r.forks}</span>
                      )}
                      <span style={{
                        fontSize: '10px', fontWeight: 600, color: langColor,
                        background: `${langColor}15`,
                        padding: '2px 7px', borderRadius: '5px',
                        border: `1px solid ${langColor}30`,
                        display: 'inline-flex', alignItems: 'center', gap: '4px'
                      }}>
                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: langColor }} />
                        {r.language || 'Code'}
                      </span>
                    </div>
                  </div>

                  {/* Description */}
                  <p style={{
                    fontSize: '12px', color: '#94a3b8', margin: '0 0 0 6px',
                    lineHeight: 1.45,
                    display: '-webkit-box', WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical', overflow: 'hidden'
                  }}>
                    {r.description || 'Public repository'}
                  </p>

                  {/* Bottom row: topics + updated + readme toggle */}
                  <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    marginTop: '10px', paddingLeft: '6px', flexWrap: 'wrap', gap: '8px'
                  }}>
                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', alignItems: 'center' }}>
                      {Array.isArray(r.topics) && r.topics.slice(0, 4).map((t, tidx) => (
                        <span key={tidx} style={{
                          fontSize: '10px', color: '#7dd3fc',
                          background: 'rgba(56, 189, 248, 0.08)',
                          padding: '1px 6px', borderRadius: '4px'
                        }}>#{t}</span>
                      ))}
                      {r.updatedAt && (
                        <span style={{ fontSize: '10px', color: '#475569', marginLeft: '4px' }}>
                          Updated {getRelativeTime(r.updatedAt)}
                        </span>
                      )}
                    </div>

                    {hasReadme && (
                      <button
                        type="button"
                        onClick={() => toggleReadme(r.name)}
                        style={{
                          background: isExpanded ? 'rgba(56, 189, 248, 0.1)' : 'none',
                          border: isExpanded ? '1px solid rgba(56, 189, 248, 0.2)' : '1px solid rgba(255,255,255,0.08)',
                          padding: '3px 10px', borderRadius: '6px',
                          color: isExpanded ? '#38bdf8' : '#94a3b8',
                          fontSize: '10px', fontWeight: 600, cursor: 'pointer',
                          display: 'inline-flex', alignItems: 'center', gap: '4px',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        <span style={{ fontSize: '8px' }}>{isExpanded ? '▼' : '▶'}</span>
                        📖 {isExpanded ? 'Hide README' : 'Deep README'}
                      </button>
                    )}
                  </div>

                  {/* Expanded README Drawer */}
                  {isExpanded && hasReadme && (
                    <div style={{
                      marginTop: '12px', marginLeft: '6px',
                      background: 'rgba(0, 0, 0, 0.4)',
                      border: '1px solid rgba(56, 189, 248, 0.15)',
                      borderRadius: '10px', overflow: 'hidden'
                    }}>
                      {/* README header */}
                      <div style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '8px 12px',
                        background: 'rgba(56, 189, 248, 0.05)',
                        borderBottom: '1px solid rgba(56, 189, 248, 0.1)'
                      }}>
                        <span style={{ fontSize: '11px', fontWeight: 600, color: '#7dd3fc', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <span>📄</span> Architecture & Technical Summary
                        </span>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button
                            type="button"
                            onClick={() => copyReadme(r.readmeSnippet, r.name)}
                            style={{
                              background: 'rgba(255,255,255,0.05)',
                              border: '1px solid rgba(255,255,255,0.1)',
                              color: copiedRepo === r.name ? '#4ade80' : '#94a3b8',
                              borderRadius: '5px', padding: '2px 8px',
                              fontSize: '10px', cursor: 'pointer',
                              transition: 'color 0.2s'
                            }}
                          >
                            {copiedRepo === r.name ? '✓ Copied!' : '📋 Copy'}
                          </button>
                          <a
                            href={`${r.url}#readme`}
                            target="_blank" rel="noreferrer"
                            style={{
                              fontSize: '10px', color: '#94a3b8',
                              textDecoration: 'none',
                              background: 'rgba(255,255,255,0.05)',
                              border: '1px solid rgba(255,255,255,0.1)',
                              padding: '2px 8px', borderRadius: '5px',
                              display: 'inline-flex', alignItems: 'center', gap: '3px'
                            }}
                          >
                            GitHub ↗
                          </a>
                        </div>
                      </div>

                      {/* README content */}
                      <div style={{
                        padding: '12px',
                        fontSize: '11.5px', color: '#cbd5e1',
                        lineHeight: 1.6, whiteSpace: 'pre-wrap',
                        maxHeight: '220px', overflowY: 'auto',
                        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace'
                      }}>
                        {r.readmeSnippet}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Show More / Less toggle */}
        {processedRepos.length > 8 && (
          <div style={{ textAlign: 'center', marginTop: '14px' }}>
            <button
              type="button"
              onClick={() => setShowAllRepos(!showAllRepos)}
              style={{
                background: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                color: '#38bdf8', padding: '8px 20px',
                borderRadius: '8px', fontSize: '12px', fontWeight: 600,
                cursor: 'pointer', transition: 'all 0.2s',
                display: 'inline-flex', alignItems: 'center', gap: '6px'
              }}
            >
              {showAllRepos ? (
                <>Show Top 8 ↑</>
              ) : (
                <>View All {processedRepos.length} Repositories ↓</>
              )}
            </button>
          </div>
        )}
      </div>

      {/* ── Footer ─────────────────────────────────────────── */}
      <div style={{
        padding: '12px 24px 14px',
        borderTop: '1px solid rgba(255, 255, 255, 0.05)',
        background: 'rgba(0, 0, 0, 0.15)',
        display: 'flex', alignItems: 'center', gap: '8px',
        fontSize: '11px', color: '#64748b'
      }}>
        <span style={{ fontSize: '13px' }}>🤖</span>
        <span>
          When drafting outreach, the AI scans this indexed portfolio to cite matching projects and architecture details for each recruiter's stack.
        </span>
      </div>
    </div>
  );
}
