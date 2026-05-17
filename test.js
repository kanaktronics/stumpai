const start = Date.now();
require('dotenv').config({ path: '.env.local' });
const { GoogleGenerativeAI } = require('@google/generative-ai');
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

const prompt = `SYSTEM SPECIFICATION — STUMP.AI RAGQ ENGINE v2.0
Powered by Google Gemini 3.1 Pro reasoning infrastructure.
...
SURVIVING CANDIDATE POOL — VERIFIED METADATA
ID:1 | Player A | Role:batsman
ID:2 | Player B | Role:bowler
ID:3 | Player C | Role:allrounder
...
Return ONLY a JSON object matching this exact structure:
{
  "question": "The YES/NO question text",
  "hint": "A contextual hint for the user",
  "reasoning": "Why this question minimizes entropy",
  "appliesTo": [
    { "playerId": "string", "applies": true }
  ]
}
The appliesTo array MUST contain one entry for every candidate ID listed above.`;

model.generateContent({
  contents: [{ role: 'user', parts: [{ text: prompt }] }],
  generationConfig: {
    temperature: 0.6,
    maxOutputTokens: 800,
    responseMimeType: 'application/json'
  }
}).then(res => console.log('SUCCESS in ' + (Date.now() - start) + 'ms:', res.response.text())).catch(err => console.error('ERROR in ' + (Date.now() - start) + 'ms:', err));
