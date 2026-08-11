<div align="center">
  <img src="https://raw.githubusercontent.com/BlxrryFxce17/AI-Job-Finder/master/frontend/public/favicon.svg" alt="Logo" width="80" height="80">
  <h1 align="center">AI Job Email Drafter</h1>
  
  <p align="center">
    An intelligent, automated job application tracking and cold-email outreach platform.
    <br />
    <br />
    <a href="https://ai-job-finder-alpha.vercel.app/"><img src="https://img.shields.io/badge/Live_Demo-000000?style=for-the-badge&logo=vercel&logoColor=white" alt="Live Demo" /></a>
  </p>

  <p align="center">
    <img src="https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB" alt="React" />
    <img src="https://img.shields.io/badge/Node.js-43853D?style=for-the-badge&logo=node.js&logoColor=white" alt="Node.js" />
    <img src="https://img.shields.io/badge/Express.js-404D59?style=for-the-badge" alt="Express" />
    <img src="https://img.shields.io/badge/MongoDB-4EA94B?style=for-the-badge&logo=mongodb&logoColor=white" alt="MongoDB" />
    <img src="https://img.shields.io/badge/OpenAI-412991?style=for-the-badge&logo=openai&logoColor=white" alt="OpenAI" />
  </p>
</div>

---

## ✨ Features

- 🤖 **AI-Powered Email Drafting**: Automatically crafts personalized cold emails for job applications based on the job description and your profile.
- 📬 **Gmail API Integration**: Seamlessly sends out emails directly from your connected Google account.
- 🎯 **Advanced Tracking**: 
  - Embeds invisible tracking pixels to track email **Opens**.
  - Routes links through the backend to track **Clicks**.
  - Built-in **Bot Detection** filters out corporate security scanners to give you accurate open rates.
- 💼 **Job Management Pipeline**: Save jobs, track application statuses (Found, Sent, Opened, Bounced), and manage follow-ups.
- 📱 **Responsive UI**: A beautiful, modern interface designed with Glassmorphism, optimized for both Desktop and Mobile experiences.
- 🔒 **Secure OAuth2**: Uses Google OAuth for secure login and email sending permissions.

## 🚀 Getting Started

### Prerequisites
Make sure you have [Node.js](https://nodejs.org/) and [MongoDB](https://www.mongodb.com/) installed on your machine.

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
   Create a `.env` file in the `backend` directory and add your environment variables (MongoDB URI, OpenAI Key, Google OAuth credentials, etc.).
   
   Start the backend server:
   ```sh
   node server.js
   ```

3. **Frontend Setup**
   ```sh
   cd frontend
   npm install
   ```
   Create a `.env` file in the `frontend` directory with `VITE_API_BASE=http://localhost:5000`.

   Start the development server:
   ```sh
   npm run dev
   ```

## 🛠 Tech Stack

### Frontend
- **React** (Vite)
- **Vanilla CSS** (Custom Design System, Glassmorphism)
- **Lucide Icons**

### Backend
- **Node.js & Express**
- **MongoDB & Mongoose** (Database)
- **Google APIs** (OAuth2, Gmail API)
- **OpenAI API** (Email generation)
- **Nodemailer** (Fallback email transport)

## 📈 Tracking System
The platform utilizes a sophisticated tracking engine:
- **Opens**: A 1x1 pixel is appended to the bottom of outgoing emails.
- **Bot Filtering**: The backend inspects `User-Agent` headers and applies a **time-delay check** to filter out pre-fetch scans by Apple Mail and Google Image Proxy.
- **Timestamping**: Exact `sentAt` timestamps are recorded to prevent data drift and mismatch in the UI.

<div align="center">
  <br />
  <p><i>Built for the modern job seeker.</i></p>
</div>
