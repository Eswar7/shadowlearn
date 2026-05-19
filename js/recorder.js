/**
 * ShadowLearn — Speech Recorder
 * Uses Web Speech API (SpeechRecognition) to capture spoken text.
 */

const Recorder = (() => {

    let recognition = null;
    let isRecording = false;
    let onResultCallback = null;
    let onErrorCallback = null;
    let onStartCallback = null;
    let onEndCallback = null;

    /**
     * Check if speech recognition is supported
     */
    function isSupported() {
        return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
    }

    /**
     * Initialize the speech recognizer
     * @param {string} lang - Language code (e.g., 'kn-IN' for Kannada, 'en-US' for English)
     */
    function init(lang = 'kn-IN') {
        if (!isSupported()) {
            console.warn('Speech Recognition not supported in this browser.');
            return false;
        }

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        recognition = new SpeechRecognition();

        // Configuration
        recognition.lang = lang;
        recognition.interimResults = false;   // Only final results
        recognition.maxAlternatives = 3;      // Get up to 3 alternatives
        recognition.continuous = false;       // Stop after one phrase

        // Event handlers
        recognition.onstart = () => {
            isRecording = true;
            if (onStartCallback) onStartCallback();
        };

        recognition.onresult = (event) => {
            const result = event.results[0];
            const transcript = result[0].transcript;
            const confidence = result[0].confidence;

            // Collect all alternatives
            const alternatives = [];
            for (let i = 0; i < result.length; i++) {
                alternatives.push({
                    transcript: result[i].transcript,
                    confidence: result[i].confidence
                });
            }

            if (onResultCallback) {
                onResultCallback({
                    transcript,
                    confidence,
                    alternatives
                });
            }
        };

        recognition.onerror = (event) => {
            console.error('Speech recognition error:', event.error);
            isRecording = false;

            let friendlyMessage;
            switch (event.error) {
                case 'no-speech':
                    friendlyMessage = 'No speech detected. Please try speaking closer to the microphone.';
                    break;
                case 'audio-capture':
                    friendlyMessage = 'No microphone found. Please connect a microphone and try again.';
                    break;
                case 'not-allowed':
                    friendlyMessage = 'Microphone access denied. Please allow microphone access in your browser settings.';
                    break;
                case 'network':
                    friendlyMessage = 'Network error. Speech recognition requires an internet connection.';
                    break;
                case 'aborted':
                    friendlyMessage = 'Recording was stopped.';
                    break;
                default:
                    friendlyMessage = `Speech recognition error: ${event.error}`;
            }

            if (onErrorCallback) onErrorCallback(friendlyMessage, event.error);
        };

        recognition.onend = () => {
            isRecording = false;
            if (onEndCallback) onEndCallback();
        };

        return true;
    }

    /**
     * Start recording
     */
    function start() {
        if (!recognition) {
            console.error('Recorder not initialized. Call init() first.');
            return;
        }
        if (isRecording) {
            console.warn('Already recording.');
            return;
        }

        try {
            recognition.start();
        } catch (err) {
            console.error('Failed to start recognition:', err);
            if (onErrorCallback) onErrorCallback('Failed to start speech recognition. Please try again.');
        }
    }

    /**
     * Stop recording
     */
    function stop() {
        if (recognition && isRecording) {
            recognition.stop();
        }
    }

    /**
     * Abort recording (discard results)
     */
    function abort() {
        if (recognition && isRecording) {
            recognition.abort();
        }
    }

    /**
     * Change recognition language
     */
    function setLanguage(langCode) {
        if (!isSupported()) return;
        if (recognition) {
            recognition.lang = langCode;
        }
    }

    /**
     * Set callback handlers
     */
    function onResult(cb) { onResultCallback = cb; }
    function onError(cb) { onErrorCallback = cb; }
    function onStart(cb) { onStartCallback = cb; }
    function onEnd(cb) { onEndCallback = cb; }

    /**
     * Get recording state
     */
    function getIsRecording() {
        return isRecording;
    }

    // Public API
    return {
        init,
        start,
        stop,
        abort,
        isSupported,
        getIsRecording,
        setLanguage,
        onStart,
        onResult,
        onError,
        onEnd
    };

})();
