// Test script for Lesson Generator

const fetch = require('node-fetch'); // assuming we have it, else we use standard http
const https = require('https');

// Simulate the lesson generator extracting logic
function extractJSON(text) {
    try { return JSON.parse(text.trim()); } catch (e) {}
    const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (codeBlockMatch) {
        try { return JSON.parse(codeBlockMatch[1].trim()); } catch (e) {}
    }
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
        try { return JSON.parse(jsonMatch[0]); } catch (e) {}
    }
    throw new Error('Could not extract JSON');
}

// Basic fetch polyfill for Node
async function doFetch(url, options) {
    return new Promise((resolve, reject) => {
        const req = https.request(url, options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                resolve({
                    ok: res.statusCode >= 200 && res.statusCode < 300,
                    status: res.statusCode,
                    json: async () => JSON.parse(data),
                    text: async () => data
                });
            });
        });
        req.on('error', reject);
        if (options.body) req.write(options.body);
        req.end();
    });
}

const prompt = `Create a language lesson with exactly 3 phrases.

Topic: "Asking for directions"
Target language: Kannada
Source language: English

Respond with ONLY this JSON structure (no markdown, no code fences, no extra text):

{
  "title": "A descriptive lesson title in English",
  "description": "Brief description of what the learner will practice",
  "language": "kannada",
  "phrases": [
    {
      "id": 1,
      "kannada": "Text in Kannada script",
      "transliteration": "Romanized pronunciation guide",
      "english": "Translation in English",
      "words": ["word1", "word2"]
    }
  ]
}

IMPORTANT:
- Generate exactly 3 phrases
- The "kannada" field must use the native script of Kannada
- The "words" array contains each word from the transliteration in lowercase
- Phrases should progress from simple to more complex
- Include practical, everyday expressions related to "Asking for directions"
- Each phrase object "id" should be sequential starting from 1`;

async function testGemini() {
    // Note: requires a GEMINI_API_KEY environment variable to test locally outside the browser
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.log("Skipping real Gemini test: No API key provided in env (this is expected during automated dev tests)");
        return;
    }
    
    console.log("Testing Gemini generation...");
    
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    const contents = [{ role: 'user', parts: [{ text: prompt }] }];
    
    const response = await doFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents,
            generationConfig: { temperature: 0.7 }
        })
    });
    
    if (!response.ok) {
        console.error("Gemini Error:", response.status);
        return;
    }
    
    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    console.log("Raw Response:", text);
    
    try {
        const json = extractJSON(text);
        console.log("Extracted JSON:", JSON.stringify(json, null, 2));
    } catch(e) {
        console.error("JSON Extraction Failed:", e);
    }
}

testGemini();
