import React from 'react';

export default function PrivacyPolicy() {
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
          Privacy Policy
        </h1>
        <p style={{ color: '#94a3b8', fontSize: '15px', marginBottom: '28px' }}>
          AI Job Finder ("we", "our", or "us") is dedicated to protecting your personal data and maintaining full transparency in how your credentials and email workflows are handled.
        </p>

        <section style={{ marginBottom: '28px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#f1f5f9', marginBottom: '12px' }}>
            1. Information We Collect
          </h2>
          <ul style={{ paddingLeft: '20px', color: '#cbd5e1', fontSize: '14px' }}>
            <li style={{ marginBottom: '8px' }}><strong>Account Information:</strong> Your name and Google email address provided during authentication.</li>
            <li style={{ marginBottom: '8px' }}><strong>Profile & Candidate Information:</strong> Resumes, portfolio URLs, GitHub profiles, and skill sets that you voluntarily submit to customize your job applications.</li>
            <li style={{ marginBottom: '8px' }}><strong>Google User Data:</strong> When granting Google OAuth permissions, we access your authorized Gmail account strictly to send individualized job applications and check for replies from hiring managers.</li>
          </ul>
        </section>

        <section style={{ marginBottom: '28px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#f1f5f9', marginBottom: '12px' }}>
            2. How We Use Your Data
          </h2>
          <p style={{ fontSize: '14px', color: '#cbd5e1', marginBottom: '12px' }}>
            Your information is used strictly to power the core functionality of AI Job Finder:
          </p>
          <ul style={{ paddingLeft: '20px', color: '#cbd5e1', fontSize: '14px' }}>
            <li style={{ marginBottom: '8px' }}>Drafting role-tailored outreach emails matching your actual projects and experience.</li>
            <li style={{ marginBottom: '8px' }}>Sending approved job applications directly through your connected Gmail account.</li>
            <li style={{ marginBottom: '8px' }}>Detecting incoming replies and bounce notifications to keep your application pipeline updated in real time.</li>
          </ul>
        </section>

        {/* Mandatory Google Limited Use Disclosure Block */}
        <div style={{
          backgroundColor: 'rgba(99, 102, 241, 0.1)',
          borderLeft: '4px solid #6366f1',
          padding: '20px',
          borderRadius: '8px',
          marginBottom: '28px'
        }}>
          <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#c7d2fe', marginBottom: '8px' }}>
            Google API Limited Use Disclosure
          </h3>
          <p style={{ fontSize: '14px', color: '#e0e7ff', margin: 0, lineHeight: 1.6 }}>
            AI Job Finder's use and transfer to any other app of information received from Google APIs will adhere to the{' '}
            <a 
              href="https://developers.google.com/terms/api-services-user-data-policy#additional_requirements_for_specific_api_scopes"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: '#a5b4fc', textDecoration: 'underline' }}
            >
              Google API Services User Data Policy
            </a>
            , including the Limited Use requirements. We never sell your personal data or email contents to third parties.
          </p>
        </div>

        <section style={{ marginBottom: '28px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#f1f5f9', marginBottom: '12px' }}>
            3. Data Retention & Revocation
          </h2>
          <p style={{ fontSize: '14px', color: '#cbd5e1' }}>
            You maintain full sovereignty over your data. You may revoke access to your Google account at any moment through your{' '}
            <a 
              href="https://myaccount.google.com/permissions" 
              target="_blank" 
              rel="noopener noreferrer"
              style={{ color: '#818cf8', textDecoration: 'underline' }}
            >
              Google Security Permissions
            </a>
            . You may also request deletion of your account and stored profile information by reaching out to us.
          </p>
        </section>

        <section>
          <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#f1f5f9', marginBottom: '12px' }}>
            4. Contact
          </h2>
          <p style={{ fontSize: '14px', color: '#cbd5e1' }}>
            If you have questions regarding this Privacy Policy, please contact us at:{' '}
            <a href="mailto:akashvmsn@gmail.com" style={{ color: '#818cf8' }}>akashvmsn@gmail.com</a>.
          </p>
        </section>
      </div>
    </div>
  );
}
