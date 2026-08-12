require('dotenv').config();

module.exports = {
  // Server
  port: process.env.PORT || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',
  
  // Database
  mongoUri: process.env.MONGO_URI,
  
  // JWT
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: '7d',
  
  // Frontend
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  publicUrl: process.env.PUBLIC_URL,
  
  // AI
  geminiApiKey: process.env.GEMINI_API_KEY,
  groqApiKey: process.env.GROQ_API_KEY,
  
  // Google OAuth
  googleClientId: process.env.GOOGLE_CLIENT_ID,
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,
  
  // Email
  emailUser: process.env.EMAIL_USER,
  emailPass: process.env.EMAIL_PASS,
  
  // External APIs
  adzunaAppId: process.env.ADZUNA_APP_ID,
  adzunaAppKey: process.env.ADZUNA_APP_KEY,
  hunterApiKey: process.env.HUNTER_API_KEY,
  serperApiKey: process.env.SERPER_API_KEY,
};