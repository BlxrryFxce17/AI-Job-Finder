<div align="center">
  <img src="https://raw.githubusercontent.com/BlxrryFxce17/AI-Job-Finder/master/frontend/public/favicon.svg" alt="Logo" width="80" height="80">
  <h1 align="center">AI Job Email Drafter</h1>
  
  <p align="center">
    An intelligent, automated multi-user job application tracking, cold-email outreach, and delivery platform.
    <br />
    <br />
    <a href="https://ai-job-finder-alpha.vercel.app/"><img src="https://img.shields.io/badge/Live_Demo-000000?style=for-the-badge&logo=vercel&logoColor=white" alt="Live Demo" /></a>
  </p>

  <p align="center">
    <img src="https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB" alt="React" />
    <img src="https://img.shields.io/badge/Node.js-43853D?style=for-the-badge&logo=node.js&logoColor=white" alt="Node.js" />
    <img src="https://img.shields.io/badge/Express.js-404D59?style=for-the-badge" alt="Express" />
    <img src="https://img.shields.io/badge/MongoDB-4EA94B?style=for-the-badge&logo=mongodb&logoColor=white" alt="MongoDB" />
    <img src="https://img.shields.io/badge/Gmail_API-EA4335?style=for-the-badge&logo=gmail&logoColor=white" alt="Gmail API" />
    <img src="https://img.shields.io/badge/OpenAI-412991?style=for-the-badge&logo=openai&logoColor=white" alt="OpenAI" />
  </p>
</div>

---

## ✨ Features

- 🤖 **AI-Powered Outreach & Pitch Generation**: Automatically generates personalized, highly relevant cold pitches and cover letters citing the candidate's real GitHub projects, skills, and portfolio without bracketed placeholders or repetitive hallucinations.
- 🧵 **Universal In-Thread Email Follow-Ups**: 
  - Follow-up emails are **never orphaned** as separate messages; they reply directly to the original application thread with RFC-compliant `Message-ID`, `In-Reply-To`, and `References` headers.
  - Dynamic root-thread recovery auto-discovers and links follow-ups to the authentic initial pitch even across legacy jobs.
- ⏰ **Automated Multi-User Follow-Up Engine**:
  - Background cron worker monitors application age (Day 3 & Day 6 milestones) across all connected Google accounts.
  - Automatically verifies whether a recruiter has replied via the Gmail API before generating and scheduling follow-ups.
- 🛡️ **Multi-Layer Deliverability & Mailbox Verification**:
  - 5-layer verification pipeline checks syntax, resolves DNS MX records (with DNS-over-HTTPS fallback), filters disposable domains via Disify, checks Hunter.io, and conducts zero-send SMTP handshakes.
  - Intelligent ISP Port 25 fail-safe scoring ensures legitimate recruiter inboxes (`careers@`, `talent@`, `hr@`) receive passing deliverability marks (>= 65%) to prevent batch sender queue stalls.
- 🛑 **Personal Exclusion Blocklist**:
  - Exclude specific company names, domains, or email addresses from being drafted or contacted across both single sends and batch queues.
- ⚡ **Batch Outreach Queue**:
  - Seamless batch processing supporting dual-ID (`_id` and custom `id`) resolution with real-time verification scores, live progress streaming, and automatic email discovery.
- 🎯 **Engagement Tracking & Bot Filtering**:
  - Real-time tracking of email **Opens** and link **Clicks**.
  - Built-in heuristic bot detection filters out corporate email security pre-fetch scans (Apple Mail, Google Image Proxy).
- 🧩 **Chrome Extension (Copilot Sidebar)**:
  - Scrapes job postings and recruiter contacts in real-time from LinkedIn, Naukri, and career boards.
  - Allows 1-click outreach with attached tailored PDF resumes directly from the browser sidebar.
- 🔄 **Bounce Processing & Reputation Protection**:
  - Continuously scans user inboxes for Mail Delivery Subsystem bounce reports to blacklist unreachable addresses and shield sender reputation.

---

## 🚀 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (v18+)
- [MongoDB](https://www.mongodb.com/) (Local or Atlas)
- Google Cloud Project with Gmail API & OAuth credentials

### Installation

1. **Clone the repository**
   ```sh
   git clone https://github.com/BlxrryFxce17/AI-Job-Finder.git
   cd AI-Job-Finder
   ```

2. **Backend Setup**
   ```sh
   cd backend
   npm install
   ```
   Create a `.env` file in `backend/` with:
   ```env
   PORT=5000
   MONGO_URI=your_mongodb_connection_string
   JWT_SECRET=your_jwt_secret
   GOOGLE_CLIENT_ID=your_google_client_id
   GOOGLE_CLIENT_SECRET=your_google_client_secret
   GOOGLE_REDIRECT_URI=http://localhost:5000/api/auth/google/callback
   PUBLIC_URL=http://localhost:5000
   OPENAI_API_KEY=your_openai_key
   HUNTER_API_KEY=optional_hunter_api_key
   ```
   Start the backend server:
   ```sh
   npm start
   ```

3. **Frontend Setup**
   ```sh
   cd ../frontend
   npm install
   ```
   Create a `.env` file in `frontend/` with:
   ```env
   VITE_API_BASE=http://localhost:5000
   ```
   Start the development server:
   ```sh
   npm run dev
   ```

---

## 🛠 Tech Stack

### Frontend
- **React** (Vite)
- **Vanilla CSS** (Custom responsive design system, Glassmorphism)
- **Lucide Icons**

### Backend
- **Node.js & Express**
- **MongoDB & Mongoose** (Multi-tenant data isolation)
- **Google APIs** (OAuth2, Gmail API for message sending and thread inspection)
- **Node-Cron** (Automated follow-up scheduling)
- **OpenAI / OpenRouter API** (Dynamic outreach drafting)
- **Nodemailer & MailComposer** (RFC 2822 email building and transport)

---

## 📈 Architecture Highlights

- **Multi-Tenant Isolation**: Queries and background jobs are strictly scoped by `userId` to ensure zero cross-user data leakage.
- **RFC Thread Consistency**: All follow-ups preserve the Gmail thread hierarchy to provide hiring managers with seamless context.
- **Sender Reputation Safeguard**: Bypasses guessed or risky addresses below deliverability thresholds to maintain high inbox deliverability.

<div align="center">
  <br />
  <p><i>Built for the modern job seeker.</i></p>
</div>
