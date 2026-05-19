/**
 * ShadowLearn — Curriculum Generator Module
 * Prompts the LLM Provider to design a structured, multi-module macro-learning syllabus in valid JSON.
 */

const CurriculumGenerator = (() => {

    const systemPrompt = `You are a master polyglot linguist and curriculum designer. 
The user wants to learn a new language from scratch.
You must generate a beginner-level language learning curriculum.
The curriculum must be divided into exactly 10 distinct, sequential modules/chapters (e.g., Greetings, Ordering Food, Directions, Grammar basics, Hobbies).

You MUST respond strictly with a valid JSON object matching this schema. NO markdown backticks outside of the object, NO extra text.
{
  "language": "<Target Language Name>",
  "proficiency": "Beginner",
  "modules": [
    {
      "id": "module_1",
      "title": "<Module Subject (e.g., Greetings & Introductions)>",
      "description": "<What the user will specifically learn in this module>",
      "status": "pending"
    }
  ]
}`;

    /**
     * Generate a new curriculum plan
     * @param {string} targetLang 
     * @param {string} sourceLang 
     * @returns {Promise<Object>} The parsed curriculum JSON
     */
    async function generatePlan(targetLang, sourceLang = "English") {
        const userPrompt = `Create a highly structured 10-module beginner curriculum to learn ${targetLang} for a native ${sourceLang} speaker.`;
        
        try {
            const settings = LLMProvider.getSettings();
            if (!settings || (!settings.gemini.apiKey && settings.provider === "gemini")) {
                throw new Error("Missing API Key. Please configure your LLM provider in Settings.");
            }

            const provider = LLMProvider.createProvider(settings.provider, settings[settings.provider] || {});
            
            const rawResponse = await provider.generate(systemPrompt + "\n\nUser Request: " + userPrompt);
            
            // Extract the strict JSON payload from the raw sequence string
            let jsonStr = rawResponse;
            const match = rawResponse.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
            if (match) {
                jsonStr = match[1];
            }
            
            const startIndex = jsonStr.indexOf('{');
            const endIndex = jsonStr.lastIndexOf('}');
            if (startIndex === -1 || endIndex === -1) {
                console.error("Raw Response:", rawResponse);
                throw new Error("Invalid format: The LLM failed to return a JSON object.");
            }
            jsonStr = jsonStr.substring(startIndex, endIndex + 1);

            const parsed = JSON.parse(jsonStr);
            if (!parsed.modules || !Array.isArray(parsed.modules)) {
                throw new Error("CRITICAL: Missing 'modules' array in the generated syllabus.");
            }
            
            // Enforce correct schema IDs
            parsed.modules.forEach((mod, index) => {
                if (!mod.id) mod.id = `module_${index + 1}`;
                if (!mod.status) mod.status = 'pending';
            });
            // Normalize language capitalization 
            parsed.language = targetLang.charAt(0).toUpperCase() + targetLang.slice(1).toLowerCase();

            return parsed;
        } catch (err) {
            console.error("Curriculum generation failed:", err);
            throw err;
        }
    }

    return {
        generatePlan
    };
})();
