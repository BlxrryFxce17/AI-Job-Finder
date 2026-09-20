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

const callAIWithRetry = async (prompt, retries = 5, delayMs = 3000, options = {}) => {
  const action = options.action || 'Cold Email Generation';
  const userId = options.userId || null;

  for (let i = 0; i < retries; i++) {
    try {
      console.log(`[AI] Attempt ${i + 1}/${retries}: Trying Groq (Qwen 3.8 27B)...`);
      const completion = await groq.chat.completions.create({
        messages: [{ role: 'user', content: prompt }],
        model: 'qwen/qwen3.8-27b',
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
        model: 'qwen/qwen3.8-27b',
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
        model: 'qwen/qwen3.8-27b',
        status: 'failed',
        meta: { error: groqErr.message }
      });

      console.log(`[AI] Attempt ${i + 1}/${retries}: Falling back to Gemini...`);
      try {
        const response = await gemini.models.generateContent({
          model: 'gemini-2.5-flash',
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
          model: 'gemini-2.5-flash',
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
          model: 'gemini-2.5-flash',
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

module.exports = { callAIWithRetry, recordApiUsage };
