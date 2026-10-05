const { GoogleGenAI } = require('@google/genai');
const Groq = require('groq-sdk');
let ApiUsage;
try {
  ApiUsage = require('../models/ApiUsage');
} catch (e) {
  // Graceful fallback if model not yet loaded
}

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const gemini = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const recordApiUsage = async ({
  userId = null,
  service = 'Groq',
  action = 'General',
  model = '',
  promptTokens = 0,
  completionTokens = 0,
  totalTokens = 0,
  creditsUsed = 1,
  status = 'success',
  meta = {}
} = {}) => {
  try {
    if (!ApiUsage) ApiUsage = require('../models/ApiUsage');
    // Save asynchronously in background without blocking caller
    ApiUsage.create({
      userId,
      service,
      action,
      model,
      promptTokens: promptTokens || 0,
      completionTokens: completionTokens || 0,
      totalTokens: totalTokens || ((promptTokens || 0) + (completionTokens || 0)),
      creditsUsed: creditsUsed !== undefined ? creditsUsed : 1,
      status,
      meta
    }).catch(err => {
      console.warn('[ApiUsage] Failed to record usage:', err.message);
    });
  } catch (err) {
    // Non-fatal, do not break application flow
  }
};

let cachedGroqModel = null;
let lastGroqFetch = 0;

async function getBestGroqModel() {
  if (cachedGroqModel && Date.now() - lastGroqFetch < 1000 * 60 * 60 * 24) {
    return cachedGroqModel;
  }
  try {
    const list = await groq.models.list();
    const models = list.data.map(m => m.id);
    const preferences = [
      'llama-3.3-70b-versatile',
      'llama-3.1-70b-versatile',
      'qwen-2.5-32b-it',
      'llama-3.2-90b-text-preview',
      'mixtral-8x7b-32768',
      'llama-3.1-8b-instant',
      'llama3-70b-8192'
    ];
    for (const pref of preferences) {
      if (models.includes(pref)) {
        cachedGroqModel = pref;
        lastGroqFetch = Date.now();
        return pref;
      }
    }
    const textModels = models.filter(m => !m.includes('whisper') && !m.includes('vision'));
    if (textModels.length > 0) {
      cachedGroqModel = textModels[0];
      lastGroqFetch = Date.now();
      return textModels[0];
    }
  } catch (err) {
    console.warn("[Groq] Failed to fetch models list dynamically:", err.message);
  }
  return 'llama-3.3-70b-versatile';
}

let cachedGeminiModel = null;
let lastGeminiFetch = 0;

async function getBestGeminiModel() {
  if (cachedGeminiModel && Date.now() - lastGeminiFetch < 1000 * 60 * 60 * 24) {
    return cachedGeminiModel;
  }
  // Google's core endpoints are very stable, flash is always reliable, but we can verify dynamically if needed.
  // For now, we will stick to known reliable models that do not break easily to avoid overhead,
  // but let's implement dynamic discovery for Gemini too.
  try {
    // Note: Gemini SDK for node might not expose a simple listModels without rest API, but we'll try a fallback check
    // Actually, gemini-1.5-flash is stable and rolling.
    cachedGeminiModel = 'gemini-1.5-flash';
    lastGeminiFetch = Date.now();
    return cachedGeminiModel;
  } catch(e) {
    return 'gemini-1.5-flash';
  }
}


const callAIWithRetry = async (prompt, retries = 5, delayMs = 3000, options = {}) => {
  const action = options.action || 'Cold Email Generation';
  const userId = options.userId || null;
  const GROQ_MODEL = process.env.GROQ_MODEL || await getBestGroqModel();
  const GEMINI_MODEL = process.env.GEMINI_MODEL || await getBestGeminiModel();

  for (let i = 0; i < retries; i++) {
    try {
      console.log(`[AI] Attempt ${i + 1}/${retries}: Trying Groq (${GROQ_MODEL})...`);
      const completion = await groq.chat.completions.create({
        messages: [{ role: 'user', content: prompt }],
        model: GROQ_MODEL,
        max_tokens: 2000,
        temperature: 0.7
      });

      const pTokens = completion.usage?.prompt_tokens || Math.round(prompt.length / 4);
      const cTokens = completion.usage?.completion_tokens || Math.round((completion.choices[0]?.message?.content || '').length / 4);
      const tTokens = completion.usage?.total_tokens || (pTokens + cTokens);

      recordApiUsage({
        userId,
        service: 'Groq',
        action,
        model: GROQ_MODEL,
        promptTokens: pTokens,
        completionTokens: cTokens,
        totalTokens: tTokens,
        creditsUsed: 1,
        status: 'success'
      });

      return { text: completion.choices[0]?.message?.content || '' };
    } catch (groqErr) {
      console.warn(`[Groq API] Failed:`, groqErr.message || groqErr);
      recordApiUsage({
        userId,
        service: 'Groq',
        action,
        model: GROQ_MODEL,
        status: 'failed',
        meta: { error: groqErr.message }
      });

      console.log(`[AI] Attempt ${i + 1}/${retries}: Falling back to Gemini...`);
      try {
        const response = await gemini.models.generateContent({
          model: GEMINI_MODEL,
          contents: prompt,
          config: {
            maxOutputTokens: 8192,
          }
        });

        const pTokens = response.usageMetadata?.promptTokenCount || Math.round(prompt.length / 4);
        const cTokens = response.usageMetadata?.candidatesTokenCount || Math.round((response.text || '').length / 4);
        const tTokens = response.usageMetadata?.totalTokenCount || (pTokens + cTokens);

        recordApiUsage({
          userId,
          service: 'Gemini',
          action,
          model: GEMINI_MODEL,
          promptTokens: pTokens,
          completionTokens: cTokens,
          totalTokens: tTokens,
          creditsUsed: 1,
          status: 'fallback'
        });

        return { text: response.text };
      } catch (geminiErr) {
        console.warn(`[Gemini API] Failed:`, geminiErr.message || geminiErr);
        recordApiUsage({
          userId,
          service: 'Gemini',
          action,
          model: GEMINI_MODEL,
          status: 'failed',
          meta: { error: geminiErr.message }
        });

        if (i < retries - 1) {
          console.log(`[AI] Both engines failed. Waiting ${delayMs / 1000}s before retry...`);
          await new Promise(res => setTimeout(res, delayMs));
          delayMs += 3000;
        } else {
          throw new Error(`All AI engines failed after ${retries} attempts.`);
        }
      }
    }
  }
};

module.exports = { callAIWithRetry, recordApiUsage, getBestGroqModel, getBestGeminiModel };
