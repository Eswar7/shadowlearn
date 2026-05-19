/**
 * ShadowLearn — Reverie Native Text-to-Speech Engine
 * Generates flawless Indic AI playback via the revapi.reverieinc.com endpoint.
 */

const ReverieTTS = (() => {

    let currentAudio = null;
    let isSpeaking = false;
    const audioCache = new Map(); // In-memory cache for audio blobs

    /**
     * Synthesize and play native speech via Reverie Inc
     * @param {string} text 
     * @param {string} langCode 
     * @param {string} appId 
     * @param {string} apiKey 
     * @param {Object} options 
     */
    async function speak(text, langCode, appId, apiKey, options = {}) {
        stop(); // Cancel any current speech
        
        try {
            // E.g., 'kn-IN' -> 'kn', 'hi-IN' -> 'hi'
            const prefix = langCode.split('-')[0].toLowerCase();
            const speaker = `${prefix}_female`;
            const cacheKey = `${text}-${speaker}`;

            let url;

            if (audioCache.has(cacheKey)) {
                // Instantly load from memory cache
                url = audioCache.get(cacheKey);
            } else {
                // Fetch from Reverie API
                const response = await fetch('https://revapi.reverieinc.com/', {
                    method: 'POST',
                    headers: {
                        'REV-API-KEY': apiKey.trim(),
                        'REV-APP-ID': appId.trim(),
                        'REV-APPNAME': 'tts',
                        'speaker': speaker,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        text: text
                    })
                });

                if (!response.ok) {
                    const errText = await response.text().catch(() => '');
                    throw new Error(`Reverie API Error: ${response.status} - ${errText}`);
                }

                // Reverie returns binary audio directly
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
                if (options.onError) options.onError("Failed to play streamed Reverie audio buffer.");
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
