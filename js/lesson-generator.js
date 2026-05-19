/**
 * ShadowLearn — LLM Lesson Generator
 * Uses the LLM provider to generate structured language lessons from a topic.
 */

const LessonGenerator = (() => {

    /**
     * System prompt for lesson generation
     */
    const SYSTEM_PROMPT = `You are a language teaching expert. You create structured language lessons for learners.

CRITICAL RULES:
1. You MUST respond with ONLY valid JSON — no markdown, no explanation, no code fences.
2. The JSON must follow the exact schema provided.
3. All phrases must be practical, commonly used, and appropriate for beginners to intermediate learners.
4. Provide accurate translations and transliterations.
5. The "words" array must contain the transliteration of each word in lowercase, split by spaces.
6. Each phrase should be a complete, natural expression (not just a single word, unless it's a greeting like "Hello").
7. Transliterations should use standard romanization that helps English speakers pronounce the word correctly.`;

    /**
     * Build the user prompt for lesson generation
     */
    function buildPrompt(topic, targetLang, sourceLang, phraseCount) {
        return `Create a language lesson with exactly ${phraseCount} phrases.

Topic: "${topic}"
Target language: ${targetLang}
Source language: ${sourceLang}

Respond with ONLY this JSON structure (no markdown, no code fences, no extra text):

{
  "title": "A descriptive lesson title in ${sourceLang}",
  "description": "Brief description of what the learner will practice",
  "language": "${targetLang.toLowerCase()}",
  "phrases": [
    {
      "id": 1,
      "${targetLang.toLowerCase()}": "Text in ${targetLang} script",
      "transliteration": "Romanized pronunciation guide",
      "${sourceLang.toLowerCase()}": "Translation in ${sourceLang}",
      "words": ["word1", "word2"]
    }
  ]
}

IMPORTANT:
- Generate exactly ${phraseCount} phrases
- The "${targetLang.toLowerCase()}" field must use the native script of ${targetLang}
- The "words" array contains each word from the transliteration in lowercase
- Phrases should progress from simple to more complex
- Include practical, everyday expressions related to "${topic}"
- Each phrase object "id" should be sequential starting from 1`;
    }

    /**
     * Extract JSON from LLM response (handles code fences, extra text, etc.)
     */
    function extractJSON(text) {
        // Try direct parse first
        try {
            return JSON.parse(text.trim());
        } catch (e) {
            // Continue to extraction methods
        }

        // Try extracting from markdown code fence
        const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
        if (codeBlockMatch) {
            try {
                return JSON.parse(codeBlockMatch[1].trim());
            } catch (e) {
                // Continue
            }
        }

        // Try finding JSON object pattern
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            try {
                return JSON.parse(jsonMatch[0]);
            } catch (e) {
                // Continue
            }
        }

        throw new Error('Could not extract valid JSON from LLM response. Please try again.');
    }

    /**
     * Validate the generated lesson data
     */
    function validateLesson(data, targetLang, sourceLang) {
        if (!data || typeof data !== 'object') {
            throw new Error('Invalid lesson data: not an object');
        }

        if (!data.title || typeof data.title !== 'string') {
            throw new Error('Invalid lesson data: missing or invalid "title"');
        }

        if (!Array.isArray(data.phrases) || data.phrases.length === 0) {
            throw new Error('Invalid lesson data: "phrases" must be a non-empty array');
        }

        const langKey = targetLang.toLowerCase();
        const srcKey = sourceLang.toLowerCase();

        // Validate and normalize each phrase
        data.phrases.forEach((phrase, index) => {
            if (!phrase.transliteration) {
                throw new Error(`Phrase ${index + 1}: missing "transliteration"`);
            }

            // Normalize: ensure the phrase has standard field names
            // The LLM might use the language name as key (e.g., "kannada", "hindi")
            if (!phrase[langKey] && !phrase.native && !phrase.text) {
                // Try to find the native text in any non-standard key
                const knownKeys = ['id', 'transliteration', 'words', srcKey, 'description'];
                const nativeKey = Object.keys(phrase).find(k => !knownKeys.includes(k) && typeof phrase[k] === 'string');
                if (nativeKey) {
                    phrase[langKey] = phrase[nativeKey];
                }
            }

            // Ensure words array exists
            if (!Array.isArray(phrase.words) || phrase.words.length === 0) {
                // Auto-generate from transliteration
                phrase.words = phrase.transliteration.toLowerCase().split(/\s+/);
            }

            // Ensure english/source text exists
            if (!phrase[srcKey] && phrase.english) {
                phrase[srcKey] = phrase.english;
            }
            if (!phrase[srcKey]) {
                phrase[srcKey] = phrase.transliteration;
            }

            // Ensure sequential IDs
            phrase.id = index + 1;
        });

        return data;
    }

    /**
     * Generate a lesson using the active LLM provider
     *
     * @param {string} topic - The lesson topic (e.g., "Ordering food at a restaurant")
     * @param {string} targetLang - Target language (e.g., "Kannada")
     * @param {string} sourceLang - Source language (e.g., "English")
     * @param {number} phraseCount - Number of phrases to generate (5-20)
     * @param {Function} [onStatus] - Optional callback for status updates
     * @returns {Promise<Object>} The generated lesson data
     */
    async function generate(topic, targetLang, sourceLang = 'English', phraseCount = 10, onStatus = null) {
        if (!topic || !targetLang) {
            throw new Error('Topic and target language are required.');
        }

        phraseCount = Math.max(3, Math.min(20, phraseCount));

        // Status: Creating provider
        if (onStatus) onStatus('Connecting to LLM...');
        const provider = LLMProvider.createFromSettings();

        // Status: Generating
        if (onStatus) onStatus(`Generating lesson with ${provider.name} (${provider.model})...`);

        const prompt = buildPrompt(topic, targetLang, sourceLang, phraseCount);
        const response = await provider.generate(prompt, SYSTEM_PROMPT);

        // Status: Parsing
        if (onStatus) onStatus('Parsing lesson data...');

        const lessonData = extractJSON(response);
        const validated = validateLesson(lessonData, targetLang, sourceLang);

        // Add metadata
        validated.id = `generated-${Date.now()}`;
        validated.mode = 'practice';
        validated.language = targetLang.toLowerCase();
        validated.sourceLang = sourceLang.toLowerCase();

        if (onStatus) onStatus('Lesson ready!');
        return validated;
    }

    // Public API
    return {
        generate,
        extractJSON,
        validateLesson
    };

})();
