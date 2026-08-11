import React, { useState } from 'react';

export default function TutorialModal({ onComplete }) {
  const [step, setStep] = useState(0);

  const slides = [
    {
      title: "Welcome to AI Job Finder! 🚀",
      desc: "Get ready to put your job search on autopilot. We'll help you find jobs, discover recruiter emails, and send hyper-personalized cold outreach.",
      icon: "🤖"
    },
    {
      title: "How it Works ⚙️",
      desc: "Our AI agent scrapes the latest job listings, reads the Job Descriptions, hunts down the hiring manager's email, and writes a custom pitch for you in seconds.",
      icon: "⚡"
    },
    {
      title: "Action Required! 📄",
      desc: "To write a compelling pitch, the AI needs to know your skills and experience! The absolute most important step is to upload your latest PDF resume on the next screen.",
      icon: "🎯"
    }
  ];

  const handleNext = () => {
    if (step < slides.length - 1) {
      setStep(step + 1);
    } else {
      onComplete();
    }
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0, 0, 0, 0.75)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 9999, padding: '20px'
    }}>
      <div style={{
        background: 'var(--surface-1)', border: '1px solid var(--border)',
        borderRadius: '16px', padding: '32px', maxWidth: '400px', width: '100%',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
        textAlign: 'center', position: 'relative'
      }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>{slides[step].icon}</div>
        <h2 style={{ fontSize: '24px', color: 'var(--text-1)', marginBottom: '16px', fontWeight: 'bold' }}>
          {slides[step].title}
        </h2>
        <p style={{ color: 'var(--text-2)', fontSize: '16px', lineHeight: '1.6', marginBottom: '32px', minHeight: '80px' }}>
          {slides[step].desc}
        </p>

        <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginBottom: '32px' }}>
          {slides.map((_, i) => (
            <div key={i} style={{
              width: '8px', height: '8px', borderRadius: '50%',
              background: i === step ? '#3b82f6' : 'var(--border)',
              transition: 'background 0.3s'
            }} />
          ))}
        </div>

        <button 
          onClick={handleNext}
          className="btn btn-primary"
          style={{ width: '100%', padding: '14px', fontSize: '16px', fontWeight: 'bold' }}
        >
          {step === slides.length - 1 ? "Let's Go!" : "Next"}
        </button>
      </div>
    </div>
  );
}
