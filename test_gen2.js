require('dotenv').config({ path: './backend/.env' });
const ai = require('./backend/utils/ai.js');

async function test() {
  try {
    const res = await ai.callAIWithRetry("Reply with exactly: OK");
    console.log("Result:", res);
  } catch (e) {
    console.error("Error:", e.message || e);
  }
}
test();
