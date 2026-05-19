/**
 * ShadowLearn — LLM Provider Abstraction
 * Supports Ollama (local) and Gemini (cloud) for lesson generation.
 */

const LLMProvider = (() => {

    const STORAGE_KEY = 'shadowlearn_llm_settings';

    // Default settings
    const DEFAULTS = {
        provider: 'ollama',
        ollama: {
            endpoint: 'http://localhost:11434',
            model: 'llama3.2'
        },
        gemini: {
            apiKey: '',
            model: 'gemini-2.5-flash'
        },
        openaiTts: {
            apiKey: ''
        },
        reverieTts: {
            appId: '',
            apiKey: ''
        }
    };

    /**
     * Load settings from localStorage
     */
    function loadSettings() {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                const parsed = JSON.parse(stored);
                // Deep merge with defaults to handle missing keys
                return {
                    provider: parsed.provider || DEFAULTS.provider,
                    ollama: { ...DEFAULTS.ollama, ...parsed.ollama },
                    gemini: { ...DEFAULTS.gemini, ...parsed.gemini },
                    openaiTts: { ...DEFAULTS.openaiTts, ...parsed.openaiTts },
                    reverieTts: { ...DEFAULTS.reverieTts, ...parsed.reverieTts }
                };
            }
        } catch (e) {
            console.warn('Failed to load LLM settings:', e);
        }
        return { ...DEFAULTS };
    }

    /**
     * Save settings to localStorage
     */
    function saveSettings(settings) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
        } catch (e) {
            console.warn('Failed to save LLM settings:', e);
        }
    }

    /**
     * Get current settings
     */
    function getSettings() {
        return loadSettings();
    }

    // ─── Ollama Provider ─────────────────────────────────

    function ollamaProvider(config) {
        const endpoint = config.endpoint || DEFAULTS.ollama.endpoint;
        const model = config.model || DEFAULTS.ollama.model;

        return {
            name: 'ollama',
            model,

            async generate(prompt, systemPrompt = '') {
                const url = `${endpoint}/api/chat`;

                const messages = [];
                if (systemPrompt) {
                    messages.push({ role: 'system', content: systemPrompt });
                }
                messages.push({ role: 'user', content: prompt });

                const response = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        model: model,
                        messages: messages,
                        stream: false,
                        options: {
                            temperature: 0.7,
                            num_predict: 4096
                        }
                    })
                });

                if (!response.ok) {
                    const errText = await response.text().catch(() => '');
                    throw new Error(`Ollama error (${response.status}): ${errText || 'Request failed'}`);
                }

                const data = await response.json();
                return data.message?.content || '';
            },

            async testConnection() {
                try {
                    const response = await fetch(`${endpoint}/api/tags`, {
                        method: 'GET',
                        signal: AbortSignal.timeout(5000)
                    });
                    if (!response.ok) throw new Error(`HTTP ${response.status}`);
                    const data = await response.json();
                    const models = (data.models || []).map(m => m.name);
                    return {
                        success: true,
                        message: `Connected! ${models.length} model(s) available.`,
                        models
                    };
                } catch (err) {
                    return {
                        success: false,
                        message: `Cannot reach Ollama at ${endpoint}. Is it running?`,
                        models: []
                    };
                }
            }
        };
    }

    // ─── Gemini Provider ─────────────────────────────────

    function geminiProvider(config) {
        const apiKey = config.apiKey || '';
        const model = config.model || DEFAULTS.gemini.model;

        return {
            name: 'gemini',
            model,

            async generate(prompt, systemPrompt = '') {
                if (!apiKey) {
                    throw new Error('Gemini API key is required. Please set it in Settings.');
                }

                const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

                const contents = [];

                if (systemPrompt) {
                    contents.push({
                        role: 'user',
                        parts: [{ text: systemPrompt }]
                    });
                    contents.push({
                        role: 'model',
                        parts: [{ text: 'Understood. I will follow these instructions.' }]
                    });
                }

                contents.push({
                    role: 'user',
                    parts: [{ text: prompt }]
                });

                const response = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents,
                        generationConfig: {
                            temperature: 0.7,
                            maxOutputTokens: 4096
                        }
                    })
                });

                if (!response.ok) {
                    const errData = await response.json().catch(() => ({}));
                    const errMsg = errData.error?.message || `HTTP ${response.status}`;
                    throw new Error(`Gemini error: ${errMsg}`);
                }

                const data = await response.json();
                const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
                return text;
            },

            async testConnection() {
                if (!apiKey) {
                    return {
                        success: false,
                        message: 'API key is not set. Please enter your Gemini API key.',
                        models: []
                    };
                }

                try {
                    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
                    const response = await fetch(url, {
                        signal: AbortSignal.timeout(8000)
                    });

                    if (!response.ok) {
                        if (response.status === 400 || response.status === 403) {
                            return { success: false, message: 'Invalid API key.', models: [] };
                        }
                        throw new Error(`HTTP ${response.status}`);
                    }

                    const data = await response.json();
                    const models = (data.models || [])
                        .filter(m => m.name.includes('gemini'))
                        .map(m => m.name.split('/').pop());

                    return {
                        success: true,
                        message: `Connected! ${models.length} Gemini model(s) available.`,
                        models
                    };
                } catch (err) {
                    return {
                        success: false,
                        message: `Connection failed: ${err.message}`,
                        models: []
                    };
                }
            }
        };
    }

    // ─── Factory ─────────────────────────────────────────

    /**
     * Create a provider instance from saved settings
     */
    function createFromSettings() {
        const settings = loadSettings();
        return createProvider(settings.provider, settings[settings.provider]);
    }

    /**
     * Create a provider instance
     * @param {'ollama'|'gemini'} type
     * @param {Object} config
     */
    function createProvider(type, config = {}) {
        switch (type) {
            case 'ollama':  return ollamaProvider(config);
            case 'gemini':  return geminiProvider(config);
            default:        throw new Error(`Unknown LLM provider: ${type}`);
        }
    }

    // Public API
    return {
        createProvider,
        createFromSettings,
        loadSettings,
        saveSettings,
        getSettings,
        DEFAULTS
    };

})();
