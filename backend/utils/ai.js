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
      'qwen/qwen3.8-27b',
      'openai/gpt-oss-120b',
      'openai/gpt-oss-20b',
      'llama-3.3-70b-versatile',
      'llama-3.1-8b-instant',
      'allam-2-7b'
    ];
    for (const pref of preferences) {
      if (models.includes(pref)) {
        cachedGroqModel = pref;
        lastGroqFetch = Date.now();
        return pref;
      }
    }
    const textModels = models.filter(m => !m.includes('whisper') && !m.includes('vision') && !m.includes('guard'));
    if (textModels.length > 0) {
      cachedGroqModel = textModels[0];
      lastGroqFetch = Date.now();
      return textModels[0];
    }
  } catch (err) {
    console.warn("[Groq] Failed to fetch models list dynamically:", err.message);
  }
  return 'qwen/qwen3.8-27b';
}

let cachedGeminiModel = null;
let lastGeminiFetch = 0;

async function getBestGeminiModel() {
  if (cachedGeminiModel && Date.now() - lastGeminiFetch < 1000 * 60 * 60 * 24) {
    return cachedGeminiModel;
  }
  cachedGeminiModel = 'gemini-2.5-flash';
  lastGeminiFetch = Date.now();
  return cachedGeminiModel;
}

const callAIWithRetry = async (prompt, retries = 3, delayMs = 2000, options = {}) => {
  const action = options.action || 'Cold Email Generation';
  const userId = options.userId || null;
  const bestGroq = await getBestGroqModel();
  const GEMINI_MODEL = process.env.GEMINI_MODEL || await getBestGeminiModel();

  const groqModelsToTry = [...new Set([
    process.env.GROQ_MODEL,
    bestGroq,
    'qwen/qwen3.8-27b',
    'openai/gpt-oss-120b',
    'openai/gpt-oss-20b'
  ].filter(Boolean))];

  for (let i = 0; i < retries; i++) {
    // 1. Try available Groq models in sequence
    let groqSuccess = null;
    for (const modelId of groqModelsToTry) {
      try {
        console.log(`[AI] Attempt ${i + 1}/${retries}: Trying Groq (${modelId})...`);
        const completion = await groq.chat.completions.create({
          messages: [{ role: 'user', content: prompt }],
          model: modelId,
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
          model: modelId,
          promptTokens: pTokens,
          completionTokens: cTokens,
          totalTokens: tTokens,
          creditsUsed: 1,
          status: 'success'
        });

        const textOutput = completion.choices[0]?.message?.content || '';
        if (textOutput.trim().startsWith('Error:')) {
          throw new Error(textOutput.trim());
        }

        groqSuccess = { text: textOutput };
        break;
      } catch (err) {
        console.warn(`[Groq ${modelId}] Failed (${err.message}). Trying next...`);
      }
    }

    if (groqSuccess) {
      return groqSuccess;
    }

    console.log(`[AI] Attempt ${i + 1}/${retries}: All Groq models failed. Falling back to Gemini...`);
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

        const textOutput = response.text || '';
        if (textOutput.trim().startsWith('Error:')) {
          throw new Error(textOutput.trim());
        }

        return { text: textOutput };
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
};

module.exports = { callAIWithRetry, recordApiUsage, getBestGroqModel, getBestGeminiModel };
