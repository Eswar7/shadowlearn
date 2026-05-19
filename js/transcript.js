/**
 * ShadowLearn — Transcript Panel
 * Renders phrase cards and keeps them synchronized with video playback.
 * Supports per-phrase mastery state: untried → attempted → mastered → perfect
 */

const Transcript = (() => {

    let phrases = [];
    let activeIndex = -1;
    let completedPhrases = new Map(); // phraseId -> score (session only)
    let onPhraseClickCallback = null;
    let containerEl = null;
    let _language = '';  // current lesson language, used for mastery lookup

    // Mastery thresholds
    const MASTERY_PERFECT  = 90;
    const MASTERY_MASTERED = 70;

    // Mastery tier definitions
    const MASTERY_TIERS = [
        { key: 'perfect',   icon: '💎', label: 'Perfect',  cls: 'mastery-perfect'   },
        { key: 'mastered',  icon: '🟢', label: 'Mastered', cls: 'mastery-mastered'  },
        { key: 'attempted', icon: '🟡', label: 'Attempted',cls: 'mastery-attempted' },
        { key: 'untried',   icon: '⬜', label: 'Not tried',cls: 'mastery-untried'   },
    ];

    /**
     * Return the mastery tier object for a given phraseId.
     * Reads from StorageManager for persistent cross-session data,
     * then falls back to the in-session completedPhrases map.
     */
    function _getMasteryTier(phraseId) {
        // Prefer persistent storage if available
        const stored = (typeof StorageManager !== 'undefined' && _language)
            ? StorageManager.getMastery(_language, phraseId)
            : null;
        const sessionScore = completedPhrases.get(phraseId);

        const bestScore = stored
            ? Math.max(stored.bestScore, sessionScore ?? 0)
            : (sessionScore ?? -1);

        if (bestScore < 0)               return MASTERY_TIERS[3]; // untried
        if (bestScore >= MASTERY_PERFECT) return MASTERY_TIERS[0]; // perfect
        if (bestScore >= MASTERY_MASTERED)return MASTERY_TIERS[1]; // mastered
        return MASTERY_TIERS[2];                                   // attempted
    }

    /**
     * Initialize the transcript panel
     * @param {HTMLElement} container - The transcript list container element
     * @param {Array} phraseData - Array of phrase objects from lesson JSON
     * @param {string} [language] - Current lesson language key (for mastery lookup)
     */
    function init(container, phraseData, language = '') {
        containerEl = container;
        phrases = phraseData;
        _language = language;
        completedPhrases = new Map(); // reset session state on new lesson
        activeIndex = -1;
        render();
    }

    /**
     * Render all phrase cards in the transcript list
     */
    function render() {
        if (!containerEl) return;

        containerEl.innerHTML = '';

        phrases.forEach((phrase, index) => {
            const card = document.createElement('div');
            card.className = 'phrase-card';
            card.dataset.index = index;
            card.dataset.phraseId = phrase.id;

            const tier  = _getMasteryTier(phrase.id);
            const score = completedPhrases.get(phrase.id);

            // Apply mastery class for left-border colouring
            card.classList.add(tier.cls);
            if (score !== undefined) card.classList.add('completed');

            // Handle dynamic language keys
            const knownKeys = ['id', 'transliteration', 'words', 'startTime', 'endTime', 'english', 'nativeText', 'completed', 'score'];
            let nativeKey  = Object.keys(phrase).find(k => !knownKeys.includes(k) && typeof phrase[k] === 'string');
            let sourceLang = Object.keys(phrase).find(k => k !== nativeKey && !knownKeys.includes(k) && typeof phrase[k] === 'string');

            const nativeText  = phrase[nativeKey] || phrase.native || phrase.kannada || '';
            const englishText = phrase[sourceLang] || phrase.english || '';

            // Score badge text & colour
            const badgeBg    = score >= MASTERY_PERFECT  ? 'var(--success-bg)' :
                               score >= MASTERY_MASTERED ? 'var(--success-bg)' : 'var(--warning-bg)';
            const badgeColor = score >= MASTERY_PERFECT  ? 'var(--success)' :
                               score >= MASTERY_MASTERED ? 'var(--success)' : 'var(--warning)';
            const badgeBorder= score >= MASTERY_MASTERED ? 'rgba(16,185,129,0.25)' : 'rgba(245,158,11,0.25)';

            card.innerHTML = `
        <span class="phrase-number">${index + 1}</span>
        <div class="phrase-content">
          <div class="phrase-transliteration">${phrase.transliteration}</div>
          <div class="phrase-english">${englishText}</div>
          <div class="phrase-kannada">${nativeText}</div>
        </div>
        <div class="phrase-mastery-col">
          <span class="phrase-mastery-icon" title="${tier.label}">${tier.icon}</span>
          <span class="phrase-score-badge" style="
            background: ${score !== undefined ? badgeBg : 'transparent'};
            color: ${score !== undefined ? badgeColor : 'transparent'};
            border: 1px solid ${score !== undefined ? badgeBorder : 'transparent'};
          ">${score !== undefined ? score + '%' : ''}</span>
        </div>
      `;

            // Click handler — select this phrase for practice
            card.addEventListener('click', () => {
                if (onPhraseClickCallback) {
                    onPhraseClickCallback(index, phrase);
                }
            });

            containerEl.appendChild(card);
        });
    }

    /**
     * Set the active phrase by index (highlights it in the transcript)
     * @param {number} index - Index of the phrase to highlight
     */
    function setActive(index) {
        if (index === activeIndex) return;
        activeIndex = index;

        // Update card classes
        const cards = containerEl.querySelectorAll('.phrase-card');
        cards.forEach((card, i) => {
            card.classList.toggle('active', i === index);
        });

        // Auto-scroll to active card
        if (index >= 0 && cards[index]) {
            cards[index].scrollIntoView({
                behavior: 'smooth',
                block: 'nearest'
            });
        }
    }

    /**
     * Find which phrase is active at a given video time
     * @param {number} currentTime - Current video time in seconds
     * @returns {number} Index of the active phrase, or -1 if none
     */
    function findPhraseAtTime(currentTime) {
        for (let i = 0; i < phrases.length; i++) {
            if (currentTime >= phrases[i].startTime && currentTime < phrases[i].endTime) {
                return i;
            }
        }
        return -1;
    }

    /**
     * Update active phrase based on current video time
     * @param {number} currentTime - Current video time in seconds
     */
    function syncWithTime(currentTime) {
        const index = findPhraseAtTime(currentTime);
        if (index >= 0) {
            setActive(index);
        }
    }

    /**
     * Mark a phrase as completed with a score.
     * Also persists mastery to StorageManager.
     * @param {number|string} phraseId - The phrase ID
     * @param {number} score - Score percentage (0-100)
     */
    function markCompleted(phraseId, score) {
        completedPhrases.set(phraseId, score);

        // Persist mastery cross-session
        if (typeof StorageManager !== 'undefined' && _language) {
            StorageManager.saveMastery(_language, phraseId, score);
        }

        render(); // re-render to update badges + mastery icons
        // Re-apply active state after re-render
        if (activeIndex >= 0) {
            const cards = containerEl.querySelectorAll('.phrase-card');
            if (cards[activeIndex]) {
                cards[activeIndex].classList.add('active');
            }
        }
    }

    /**
     * Get the active phrase index
     */
    function getActiveIndex() {
        return activeIndex;
    }

    /**
     * Get a phrase by index
     */
    function getPhrase(index) {
        return phrases[index] || null;
    }

    /**
     * Get total number of phrases
     */
    function getCount() {
        return phrases.length;
    }

    /**
     * Get number of completed phrases (session)
     */
    function getCompletedCount() {
        return completedPhrases.size;
    }

    /**
     * Set click callback
     */
    function onPhraseClick(cb) {
        onPhraseClickCallback = cb;
    }

    // Public API
    return {
        init,
        setActive,
        syncWithTime,
        markCompleted,
        getActiveIndex,
        getPhrase,
        getCount,
        getCompletedCount,
        onPhraseClick
    };

})();
