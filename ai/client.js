const { functionDeclarations } = require('./tools');

let cachedModel = null;

async function getGemini() {
  if (cachedModel) return cachedModel;

  const { GoogleGenerativeAI } = await import('@google/generative-ai');
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY missing');

  const genAI = new GoogleGenerativeAI(apiKey);
  const modelName = process.env.GEMINI_MODEL || 'gemini-2.0-flash';

  cachedModel = genAI.getGenerativeModel({
    model: modelName,
    tools: [{ functionDeclarations }],
  });

  return cachedModel;
}

module.exports = { getGemini };

