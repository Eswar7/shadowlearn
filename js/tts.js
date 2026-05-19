/**
 * ShadowLearn — Text-to-Speech Module
 * Uses Web Speech Synthesis API for phrase pronunciation playback.
 */

const TTS = (() => {

    let currentUtterance = null;
    let currentAudio = null;
    let isSpeaking = false;

    // Language code mapping (display name → BCP-47)
    const LANG_CODES = {
        'kannada':    'kn-IN',
        'hindi':      'hi-IN',
        'tamil':      'ta-IN',
        'telugu':     'te-IN',
        'malayalam':  'ml-IN',
        'marathi':    'mr-IN',
        'bengali':    'bn-IN',
        'gujarati':   'gu-IN',
        'punjabi':    'pa-IN',
        'urdu':       'ur-IN',
        'japanese':   'ja-JP',
        'korean':     'ko-KR',
        'mandarin':   'zh-CN',
        'chinese':    'zh-CN',
        'spanish':    'es-ES',
        'french':     'fr-FR',
        'german':     'de-DE',
        'italian':    'it-IT',
        'portuguese': 'pt-BR',
        'russian':    'ru-RU',
        'arabic':     'ar-SA',
        'thai':       'th-TH',
        'vietnamese': 'vi-VN',
        'english':    'en-US',
        // European languages
        'dutch':      'nl-NL',
        'swedish':    'sv-SE',
        'norwegian':  'nb-NO',
        'danish':     'da-DK',
        'finnish':    'fi-FI',
        'polish':     'pl-PL',
        'greek':      'el-GR',
        'czech':      'cs-CZ',
        'turkish':    'tr-TR',
        'romanian':   'ro-RO',
        'hungarian':  'hu-HU',
        'ukrainian':  'uk-UA',
        'hebrew':     'he-IL',
        'indonesian': 'id-ID'
    };

    /**
     * Check if TTS is supported
     */
    function isSupported() {
        return 'speechSynthesis' in window;
    }

    /**
     * Get the BCP-47 language code for a language name
     */
    function getLangCode(language) {
        if (!language) return 'en-US';
        const lower = language.toLowerCase().trim();
        return LANG_CODES[lower] || lower;  // fallback to raw string if it looks like a code
    }

    /**
     * Get available voices for a language
     * @param {string} language - Language name or BCP-47 code
     * @returns {SpeechSynthesisVoice[]}
     */
    function getVoices(language) {
        if (!isSupported()) return [];
        const langCode = getLangCode(language);
        const langPrefix = langCode.split('-')[0]; // e.g., 'kn' from 'kn-IN'
        const voices = speechSynthesis.getVoices();
        return voices.filter(v => v.lang.startsWith(langPrefix));
    }

    /**
     * Speak text in a given language
     * @param {string} text - Text to speak
     * @param {string} language - Language name (e.g., "kannada") or BCP-47 code (e.g., "kn-IN")
     * @param {Object} [options] - Optional settings
     * @param {number} [options.rate=0.85] - Speech rate (0.1 to 2.0, slower is better for learning)
     * @param {number} [options.pitch=1.0] - Speech pitch
     * @param {Function} [options.onEnd] - Callback when speech ends
     * @param {Function} [options.onError] - Callback on error
     */
    function speak(text, language, options = {}) {
        // Check for Smart Cloud TTS overrides
        try {
            const settings = typeof LLMProvider !== 'undefined' ? LLMProvider.getSettings() : null;
            if (settings) {
                const langCode = getLangCode(language);
                const prefix = langCode.split('-')[0].toLowerCase();
                
                // Categorize Indian languages which are highly optimized natively by Reverie's REST Platform
                const indianLangs = ['kn', 'hi', 'ta', 'te', 'ml', 'mr', 'bn', 'gu', 'pa', 'ur'];
                
                if (indianLangs.includes(prefix) && settings.reverieTts && settings.reverieTts.appId && settings.reverieTts.apiKey && typeof ReverieTTS !== 'undefined') {
                    // Reverie accepts pure native syntax without translation
                    ReverieTTS.speak(text, langCode, settings.reverieTts.appId, settings.reverieTts.apiKey, options);
                    return;
                }
                
                if (settings.openaiTts && settings.openaiTts.apiKey && typeof CloudTTS !== 'undefined') {
                    // OpenAI struggles with complex non-Latin scripts, so we feed it the Romanized transliteration.
                    // For European (Latin) languages, options.transliteration falls back to the native text gracefully.
                    const cloudText = options.transliteration || text;
                    CloudTTS.speak(cloudText, settings.openaiTts.apiKey, options);
                    return;
                }
            }
        } catch (err) {
            console.warn("Failed to execute Cloud TTS smart routing:", err);
        }

        if (!isSupported()) {
            console.warn('Speech Synthesis is not supported in this browser.');
            if (options.onError) options.onError('TTS not supported');
            return;
        }

        // Stop any current speech
        stop();

        const langCode = getLangCode(language);
        const rate = options.rate || 0.85;
        const pitch = options.pitch || 1.0;

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = langCode;
        utterance.rate = rate;
        utterance.pitch = pitch;

        // Try to find a matching voice
        const voices = getVoices(language);
        if (voices.length > 0) {
            utterance.voice = voices[0];
            
            utterance.onstart = () => { isSpeaking = true; };
            utterance.onend = () => {
                isSpeaking = false;
                currentUtterance = null;
                if (options.onEnd) options.onEnd();
            };
            utterance.onerror = (event) => {
                isSpeaking = false;
                currentUtterance = null;
                console.error('TTS error:', event.error);
                if (options.onError) options.onError(event.error);
            };

            currentUtterance = utterance;
            speechSynthesis.speak(utterance);
        } else {
            // The user requested strict adherence to the Windows Language Pack.
            // If length is 0, the OS hasn't provided the voice to the browser yet.
            if (options.onError) {
                options.onError(`No native voice found for ${language}. Please ensure the Language Pack is installed in Windows Settings and completely restart your browser.`);
            }
        }
    }

    /**
     * Stop current speech
     */
    function stop() {
        if (typeof CloudTTS !== 'undefined' && CloudTTS.getIsSpeaking()) {
            CloudTTS.stop();
        }
        if (typeof ReverieTTS !== 'undefined' && ReverieTTS.getIsSpeaking()) {
            ReverieTTS.stop();
        }
        if (isSupported()) {
            speechSynthesis.cancel();
        }
        if (currentAudio) {
            currentAudio.pause();
            currentAudio.currentTime = 0;
            currentAudio = null;
        }
        isSpeaking = false;
        currentUtterance = null;
    }

    /**
     * Check if currently speaking
     */
    function getIsSpeaking() {
        if (typeof CloudTTS !== 'undefined' && CloudTTS.getIsSpeaking()) {
            return true;
        }
        if (typeof ReverieTTS !== 'undefined' && ReverieTTS.getIsSpeaking()) {
            return true;
        }
        return isSpeaking;
    }

    /**
     * Get supported languages (that have at least one voice)
     */
    function getSupportedLanguages() {
        if (!isSupported()) return [];
        const voices = speechSynthesis.getVoices();
        const langSet = new Set();
        voices.forEach(v => {
            const prefix = v.lang.split('-')[0];
            // Find display name from our map
            for (const [name, code] of Object.entries(LANG_CODES)) {
                if (code.startsWith(prefix)) {
                    langSet.add(name);
                    break;
                }
            }
        });
        return Array.from(langSet).sort();
    }

    // Preload voices (they load async in some browsers)
    if (isSupported() && speechSynthesis.onvoiceschanged !== undefined) {
        speechSynthesis.onvoiceschanged = () => { /* voices loaded */ };
    }

    // Public API
    return {
        isSupported,
        speak,
        stop,
        getIsSpeaking,
        getVoices,
        getLangCode,
        getSupportedLanguages,
        LANG_CODES
    };

})();
