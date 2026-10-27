import React from 'react';
import { API_BASE } from './useAppLogic.jsx';

export default function LandingPage() {
  const handleGoogleLogin = () => {
    window.location.href = `${API_BASE}/api/auth/google`;
  };

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#090a0f',
      color: '#f8fafc',
      fontFamily: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      display: 'flex',
      flexDirection: 'column'
    }}>
      {/* Top Navigation */}
      <header style={{
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
        backgroundColor: 'rgba(9, 10, 15, 0.8)',
        backdropFilter: 'blur(12px)',
        position: 'sticky',
        top: 0,
        zIndex: 50
      }}>
        <div style={{
          maxWidth: '1200px',
          margin: '0 auto',
          padding: '16px 24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, #6366f1, #a855f7)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '18px'
            }}>
              ⚡
            </div>
            <span style={{ fontSize: '18px', fontWeight: '700', letterSpacing: '-0.02em', color: '#ffffff' }}>
              AI Job Finder
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            <a href="/privacy" style={{ color: '#94a3b8', textDecoration: 'none', fontSize: '14px' }}>Privacy</a>
            <a href="/terms" style={{ color: '#94a3b8', textDecoration: 'none', fontSize: '14px' }}>Terms</a>
            <button
              onClick={handleGoogleLogin}
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.1)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                color: '#ffffff',
                padding: '8px 16px',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: '600',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              Sign In
            </button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main style={{ flex: 1 }}>
        <section style={{
          padding: '80px 24px 60px 24px',
          maxWidth: '1000px',
          margin: '0 auto',
          textAlign: 'center'
        }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            backgroundColor: 'rgba(99, 102, 241, 0.12)',
            border: '1px solid rgba(99, 102, 241, 0.3)',
            borderRadius: '999px',
            padding: '6px 16px',
            fontSize: '13px',
            color: '#a5b4fc',
            marginBottom: '24px'
          }}>
            <span>🚀 Intelligent Cold Outreach Platform</span>
          </div>

          <h1 style={{
            fontSize: 'clamp(2.4rem, 5vw, 3.8rem)',
            fontWeight: '800',
            lineHeight: 1.15,
            letterSpacing: '-0.03em',
            marginBottom: '20px',
            background: 'linear-gradient(180deg, #ffffff 0%, #cbd5e1 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent'
          }}>
            Land Developer Roles With AI-Drafted Outreach That Converts
          </h1>

          <p style={{
            fontSize: '17px',
            color: '#94a3b8',
            maxWidth: '720px',
            margin: '0 auto 36px auto',
            lineHeight: 1.6
          }}>
            AI Job Finder connects to your Gmail to draft personalized, project-grounded job application emails, validates recruiter email addresses to prevent bounces, and tracks recruiter responses automatically.
          </p>

          <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', flexWrap: 'wrap' }}>
            <button
              onClick={handleGoogleLogin}
              style={{
                background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
                color: '#ffffff',
                border: 'none',
                borderRadius: '12px',
                padding: '16px 32px',
                fontSize: '16px',
                fontWeight: '600',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '12px',
                boxShadow: '0 8px 24px rgba(79, 70, 229, 0.4)',
                transition: 'transform 0.15s ease'
              }}
            >
              <svg viewBox="0 0 24 24" width="20" height="20" xmlns="http://www.w3.org/2000/svg">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#fff"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#fff"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#fff"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#fff"/>
              </svg>
              Continue with Google
            </button>
          </div>

          <p style={{ fontSize: '13px', color: '#64748b', marginTop: '16px' }}>
            Free for job seekers • Direct Gmail integration • Full privacy protection
          </p>
        </section>

        {/* Feature Grid */}
        <section style={{
          maxWidth: '1100px',
          margin: '20px auto 80px auto',
          padding: '0 24px',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '24px'
        }}>
          <div style={{
            backgroundColor: 'rgba(15, 23, 42, 0.6)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '16px',
            padding: '28px',
            textAlign: 'left'
          }}>
            <div style={{ fontSize: '28px', marginBottom: '14px' }}>🎯</div>
            <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '8px', color: '#f8fafc' }}>
              Project-Grounded AI Drafts
            </h3>
            <p style={{ fontSize: '14px', color: '#94a3b8', lineHeight: 1.6 }}>
              Generates genuine, authentic developer outreach citing your verified GitHub projects and technical accomplishments rather than robotic clichés.
            </p>
          </div>

          <div style={{
            backgroundColor: 'rgba(15, 23, 42, 0.6)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '16px',
            padding: '28px',
            textAlign: 'left'
          }}>
            <div style={{ fontSize: '28px', marginBottom: '14px' }}>🛡️</div>
            <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '8px', color: '#f8fafc' }}>
              Deliverability & Bounce Guard
            </h3>
            <p style={{ fontSize: '14px', color: '#94a3b8', lineHeight: 1.6 }}>
              Multi-layer DNS, MX record, and corporate inbox verification shields your Gmail reputation from bounces and dead recruiter addresses.
            </p>
          </div>

          <div style={{
            backgroundColor: 'rgba(15, 23, 42, 0.6)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '16px',
            padding: '28px',
            textAlign: 'left'
          }}>
            <div style={{ fontSize: '28px', marginBottom: '14px' }}>📬</div>
            <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '8px', color: '#f8fafc' }}>
              Seamless Gmail Dispatch
            </h3>
            <p style={{ fontSize: '14px', color: '#94a3b8', lineHeight: 1.6 }}>
              Dispatches directly through your authorized Gmail address with authentic message threading so hiring teams see the full application context.
            </p>
          </div>
        </section>

        {/* Permissions & Transparency Section */}
        <section style={{
          maxWidth: '800px',
          margin: '0 auto 80px auto',
          padding: '32px 24px',
          backgroundColor: 'rgba(30, 41, 59, 0.4)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '16px',
          textAlign: 'left'
        }}>
          <h2 style={{ fontSize: '20px', fontWeight: '700', marginBottom: '12px', color: '#ffffff' }}>
            Why We Request Google Permissions
          </h2>
          <p style={{ fontSize: '14px', color: '#94a3b8', lineHeight: 1.6, marginBottom: '16px' }}>
            To send your job applications on your behalf and detect when recruiters reply, AI Job Finder requests two specific permissions:
          </p>
          <ul style={{ paddingLeft: '20px', color: '#cbd5e1', fontSize: '14px', lineHeight: 1.6 }}>
            <li style={{ marginBottom: '8px' }}>
              <strong>Send emails (<code style={{ color: '#818cf8' }}>gmail.send</code>):</strong> Allows the app to dispatch your approved outreach drafts and resumes directly from your inbox.
            </li>
            <li>
              <strong>Read email responses (<code style={{ color: '#818cf8' }}>gmail.readonly</code>):</strong> Checks for replies from recruiters you contacted so your dashboard can mark the job as "Replied" and stop unnecessary follow-ups.
            </li>
          </ul>
          <p style={{ fontSize: '13px', color: '#64748b', marginTop: '16px' }}>
            We strictly adhere to the Google API Services User Data Policy. We never sell or share your email data.
          </p>
        </section>
      </main>

      {/* Footer with mandatory compliance links */}
      <footer style={{
        borderTop: '1px solid rgba(255, 255, 255, 0.08)',
        backgroundColor: '#07080c',
        padding: '32px 24px'
      }}>
        <div style={{
          maxWidth: '1200px',
          margin: '0 auto',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '16px'
        }}>
          <div>
            <div style={{ fontWeight: '700', color: '#ffffff', fontSize: '15px' }}>AI Job Finder</div>
            <div style={{ color: '#64748b', fontSize: '13px' }}>Automated, authentic job application outreach.</div>
          </div>

          <div style={{ display: 'flex', gap: '24px', alignItems: 'center' }}>
            <a href="/privacy" style={{ color: '#94a3b8', textDecoration: 'none', fontSize: '14px' }}>
              Privacy Policy
            </a>
            <a href="/terms" style={{ color: '#94a3b8', textDecoration: 'none', fontSize: '14px' }}>
              Terms of Service
            </a>
            <a href="mailto:akashvmsn@gmail.com" style={{ color: '#94a3b8', textDecoration: 'none', fontSize: '14px' }}>
              Contact Support
            </a>
          </div>

          <div style={{ color: '#64748b', fontSize: '13px', width: '100%', textAlign: 'center', marginTop: '16px', borderTop: '1px solid rgba(255, 255, 255, 0.05)', paddingTop: '16px' }}>
            © {new Date().getFullYear()} AI Job Finder. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
