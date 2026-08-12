const pdfParse = require('pdf-parse');
const { callAIWithRetry } = require('./aiService');
const logger = require('../utils/logger');

/**
 * Parse resume PDF and extract structured data using AI
 */
async function parseResume(fileBuffer, originalFilename) {
  // Parse PDF text
  const data = await pdfParse(fileBuffer);
  const resumeText = data.text;
  
  // Extract structured data using AI
  let extractedData = {
    skills: [],
    achievements: [],
    experienceLevel: '',
    name: '',
    title: '',
    phone: '',
    linkedin: '',
    github: ''
  };
  
  try {
    logger.info('[Resume Parse] Extracting details with AI...');
    const prompt = `Extract the core skills (max 10), top 3 achievements, experience level (e.g., Junior, Mid, Senior), full name, current professional title (e.g., Software Engineer), phone number, LinkedIn URL, and GitHub URL from this resume text. 
Return ONLY a valid JSON object with the following structure:
{"skills": ["skill1", "skill2"], "achievements": ["achievement1", "achievement2"], "experienceLevel": "Senior", "name": "John Doe", "title": "Developer", "phone": "1234567890", "linkedin": "url", "github": "url"}
Resume text:
${resumeText.substring(0, 4000)}
`;
    const response = await callAIWithRetry(prompt, 3, 2000);
    let jsonStr = response.text;
    const match = jsonStr.match(/```(?:json)?([\s\S]*?)```/);
    if (match) jsonStr = match[1].trim();
    extractedData = JSON.parse(jsonStr);
    
    logger.info('[Resume Parse] Extracted successfully');
  } catch (aiErr) {
    logger.error('[Resume Parse] AI extraction failed', { error: aiErr.message });
  }
  
  return {
    resumeText,
    resumePdf: fileBuffer,
    resumeFilename: originalFilename,
    ...extractedData
  };
}

module.exports = {
  parseResume
};