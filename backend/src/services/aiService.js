const { GoogleGenAI } = require('@google/genai');
const Groq = require('groq-sdk');
const config = require('../config');
const logger = require('../utils/logger');

let groq = null;
let gemini = null;

if (config.groqApiKey) {
  groq = new Groq({ apiKey: config.groqApiKey });
}

if (config.geminiApiKey) {
  gemini = new GoogleGenAI({ apiKey: config.geminiApiKey });
}

/**
 * Calls AI with retry logic - tries Groq first, falls back to Gemini
 */
const callAIWithRetry = async (prompt, retries = 5, delayMs = 3000) => {
  for (let i = 0; i < retries; i++) {
    // Try Groq first
    if (groq) {
      try {
        logger.debug('[AI] Attempt', { attempt: i + 1, total: retries, engine: 'Groq' });
        const completion = await groq.chat.completions.create({
          messages: [{ role: 'user', content: prompt }],
          model: 'llama-3.1-8b-instant',
        });
        const text = completion.choices[0]?.message?.content || '';
        if (text) {
          logger.debug('[AI] Groq succeeded');
          return { text };
        }
      } catch (groqErr) {
        logger.warn('[Groq API] Failed', { error: groqErr.message });
      }
    }
    
    // Fall back to Gemini
    if (gemini) {
      try {
        logger.debug('[AI] Attempt', { attempt: i + 1, total: retries, engine: 'Gemini' });
        const response = await gemini.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: prompt,
        });
        const text = response.text;
        if (text) {
          logger.debug('[AI] Gemini succeeded');
          return { text };
        }
      } catch (geminiErr) {
        logger.warn('[Gemini API] Failed', { error: geminiErr.message });
      }
    }
    
    // Both failed, retry if not last attempt
    if (i < retries - 1) {
      logger.info('[AI] Both engines failed, retrying', { waitMs: delayMs });
      await new Promise(res => setTimeout(res, delayMs));
      delayMs += 3000;
    }
  }
  
  throw new Error(`All AI engines failed after ${retries} attempts.`);
};

module.exports = {
  callAIWithRetry,
  groq,
  gemini
};