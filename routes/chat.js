const express = require('express');
const router = express.Router();
const { getGemini } = require('../ai/client');
const { SYSTEM_PROMPT, dispatchTool } = require('../ai/tools');

router.post('/chat', async (req, res) => {
  try {
    const userMsg = String(req.body.message || '').slice(0, 4000);
    const model = await getGemini();

    // Step 1: ask Gemini; it may decide to call tools
    const first = await model.generateContent({
      contents: [
        { role: 'user', parts: [{ text: SYSTEM_PROMPT }] },
        { role: 'user', parts: [{ text: userMsg }] },
      ],
    });

    const modelContent = first.response.candidates?.[0]?.content;
    const parts = modelContent?.parts || [];
    const calls = parts.filter((p) => p.functionCall);

    // If Gemini didn't call any tools, return its reply directly
    if (calls.length === 0) {
      const text = first.response.text();
      return res.json({ reply: text });
    }

    // Step 2: execute tool calls (if any)
    const toolParts = [];
    for (const p of calls) {
      const { name, args } = p.functionCall;
      const result = await dispatchTool(name, args);
      toolParts.push({ functionResponse: { name, response: result } });
    }

    // Step 3: give tool results back to Gemini to compose natural reply
    const final = await model.generateContent({
      contents: [
        { role: 'user', parts: [{ text: SYSTEM_PROMPT }] },
        { role: 'user', parts: [{ text: userMsg }] },
        modelContent,
        ...toolParts.map((tp) => ({ role: 'tool', parts: [tp] })),
      ],
    });

    const text = final.response.text();
    res.json({ reply: text });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'CHAT_ERROR', detail: String(err.message || err) });
  }
});

module.exports = router;

