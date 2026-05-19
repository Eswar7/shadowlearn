/**
 * ShadowLearn — OpenAI Text-to-Speech Engine
 * Interfaces with the OpenAI REST API to stream ultra-realistic TTS 
 * when the user provides an API key in the settings.
 */

const CloudTTS = (() => {

    let currentAudio = null;
    let isSpeaking = false;
    const audioCache = new Map(); // In-memory cache for audio blobs

    /**
     * Synthesize and play speech via OpenAI API
     * @param {string} text 
     * @param {string} apiKey 
     * @param {Object} options 
     */
    async function speak(text, apiKey, options = {}) {
        stop(); // Cancel any current speech
        
        try {
            const rate = options.rate || 1.0;
            const cleanText = text || "Hello";
            const cacheKey = `${cleanText}-${rate}`;

            let url;

            if (audioCache.has(cacheKey)) {
                // Instantly load from memory cache
                url = audioCache.get(cacheKey);
            } else {
                // Fetch from OpenAI API
                const response = await fetch('https://api.openai.com/v1/audio/speech', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${apiKey}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        model: 'tts-1',
                        input: cleanText,
                        voice: 'alloy',
                        response_format: 'mp3',
                        speed: rate
                    })
                });

                if (!response.ok) {
                    const errText = await response.text();
                    throw new Error(`OpenAI API Error: ${response.status} - ${errText}`);
                }

                const blob = await response.blob();
                url = URL.createObjectURL(blob);
                audioCache.set(cacheKey, url);
            }

            currentAudio = new Audio(url);
            
            currentAudio.onplay = () => { isSpeaking = true; };
            currentAudio.onended = () => {
                isSpeaking = false;
                // URL.revokeObjectURL(url); // Don't revoke so we can keep it cached in memory!
                if (options.onEnd) options.onEnd();
            };
            currentAudio.onerror = (e) => {
                isSpeaking = false;
                if (options.onError) options.onError("Failed to play OpenAI audio stream.");
            };

            await currentAudio.play();
        } catch (err) {
            isSpeaking = false;
            console.error(err);
            if (options.onError) options.onError(err.message);
        }
    }

    /**
     * Stop current playback
     */
    function stop() {
        if (currentAudio) {
            currentAudio.pause();
            currentAudio.currentTime = 0;
            currentAudio = null;
        }
        isSpeaking = false;
    }

    /**
     * Check if currently speaking
     */
    function getIsSpeaking() {
        return isSpeaking;
    }

    // Public API
    return {
        speak,
        stop,
        getIsSpeaking
    };

})();
