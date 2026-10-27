import React from 'react';

export default function TermsOfService() {
  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#090a0f',
      color: '#e2e8f0',
      fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
      padding: '40px 20px',
      lineHeight: '1.7'
    }}>
      <div style={{
        maxWidth: '800px',
        margin: '0 auto',
        backgroundColor: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(16px)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '16px',
        padding: '40px 32px',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.6)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <a href="/" style={{
            color: '#818cf8',
            textDecoration: 'none',
            fontSize: '14px',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px'
          }}>
            ← Back to Home
          </a>
          <span style={{ fontSize: '13px', color: '#94a3b8' }}>Last Updated: October 2026</span>
        </div>

        <h1 style={{ fontSize: '30px', fontWeight: '800', color: '#ffffff', marginBottom: '16px' }}>
          Terms of Service
        </h1>
        <p style={{ color: '#94a3b8', fontSize: '15px', marginBottom: '28px' }}>
          Welcome to AI Job Finder. By accessing our platform or connecting your Google account, you agree to these Terms of Service.
        </p>

        <section style={{ marginBottom: '28px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#f1f5f9', marginBottom: '12px' }}>
            1. Authorized & Acceptable Use
          </h2>
          <p style={{ fontSize: '14px', color: '#cbd5e1', marginBottom: '12px' }}>
            AI Job Finder is provided exclusively for individual job seekers to automate and manage legitimate professional job outreach. You agree not to use the platform for:
          </p>
          <ul style={{ paddingLeft: '20px', color: '#cbd5e1', fontSize: '14px' }}>
            <li style={{ marginBottom: '8px' }}>Sending unsolicited mass promotional emails, bulk advertisements, or spam.</li>
            <li style={{ marginBottom: '8px' }}>Harassment, fraudulent communications, or misrepresentation of credentials.</li>
            <li style={{ marginBottom: '8px' }}>Any activity that violates Google's Acceptable Use Policy or applicable anti-spam laws.</li>
          </ul>
        </section>

        <section style={{ marginBottom: '28px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#f1f5f9', marginBottom: '12px' }}>
            2. User Responsibility
          </h2>
          <p style={{ fontSize: '14px', color: '#cbd5e1' }}>
            You maintain complete control and responsibility over all messages dispatched through your connected account. You are responsible for inspecting generated drafts, verifying recipient addresses, and ensuring accuracy before authorizing dispatches.
          </p>
        </section>

        <section style={{ marginBottom: '28px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#f1f5f9', marginBottom: '12px' }}>
            3. Disclaimer of Warranties
          </h2>
          <p style={{ fontSize: '14px', color: '#cbd5e1' }}>
            AI Job Finder is provided on an "as is" and "as available" basis. We do not guarantee specific interview response rates, employment offers, or hiring outcomes. We are not affiliated with Google or any third-party recruiting firms.
          </p>
        </section>

        <section>
          <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#f1f5f9', marginBottom: '12px' }}>
            4. Contact
          </h2>
          <p style={{ fontSize: '14px', color: '#cbd5e1' }}>
            For legal inquiries or questions regarding these terms, reach out to us at:{' '}
            <a href="mailto:akashvmsn@gmail.com" style={{ color: '#818cf8' }}>akashvmsn@gmail.com</a>.
          </p>
        </section>
      </div>
    </div>
  );
}
