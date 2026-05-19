/**
 * ShadowLearn — Local Storage Manager
 * Handles persisting user-generated curriculums and progression stats sequentially in localStorage.
 *
 * DATA SAFETY:
 *   Use exportAllData() to download a JSON backup at any time.
 *   Use importAllData(json) to restore from a backup.
 *   All ShadowLearn keys are prefixed 'shadowlearn_' for easy identification.
 */

const StorageManager = (() => {
    const CURRICULUM_KEY      = 'shadowlearn_curriculums';
    const LESSON_CACHE_PREFIX = 'shadowlearn_lesson_';

    // ── All shadowlearn_ key names ────────────────────────────────────────
    // Used by export/import to capture everything in one shot.
    function _getAllShadowLearnKeys() {
        const keys = [];
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && k.startsWith('shadowlearn_')) keys.push(k);
        }
        return keys;
    }

    // ── Curriculums ───────────────────────────────────────────────────────
    function getCurriculums() {
        try {
            const data = localStorage.getItem(CURRICULUM_KEY);
            return data ? JSON.parse(data) : [];
        } catch (e) {
            console.error('Error reading curriculums', e);
            return [];
        }
    }

    function saveCurriculum(planData) {
        const curriculums = getCurriculums();
        const existingIndex = curriculums.findIndex(c => c.language.toLowerCase() === planData.language.toLowerCase());
        if (existingIndex >= 0) {
            curriculums[existingIndex] = planData;
        } else {
            curriculums.push(planData);
        }
        localStorage.setItem(CURRICULUM_KEY, JSON.stringify(curriculums));
    }

    function getCurriculumByLanguage(language) {
        return getCurriculums().find(c => c.language.toLowerCase() === language.toLowerCase());
    }

    function markModuleComplete(language, moduleId) {
        const curriculums = getCurriculums();
        const plan = curriculums.find(c => c.language.toLowerCase() === language.toLowerCase());
        if (plan) {
            const mod = plan.modules.find(m => m.id === moduleId);
            if (mod) mod.status = 'completed';
            localStorage.setItem(CURRICULUM_KEY, JSON.stringify(curriculums));
        }
    }

    // ── Lesson Cache ──────────────────────────────────────────────────────
    function _lessonKey(language, moduleId) {
        return `${LESSON_CACHE_PREFIX}${language.toLowerCase()}_${moduleId}`;
    }

    function saveLesson(language, moduleId, lessonData) {
        try {
            localStorage.setItem(_lessonKey(language, moduleId), JSON.stringify(lessonData));
        } catch (e) {
            console.warn('Could not cache lesson (storage full?):', e);
            // Show user-visible warning
            _dispatchStorageWarning('Storage is nearly full. Please export your data to avoid losing progress.');
        }
    }

    function getLesson(language, moduleId) {
        try {
            const data = localStorage.getItem(_lessonKey(language, moduleId));
            return data ? JSON.parse(data) : null;
        } catch (e) {
            return null;
        }
    }

    function clearLesson(language, moduleId) {
        localStorage.removeItem(_lessonKey(language, moduleId));
    }

    // ── Time Tracking ─────────────────────────────────────────────────────
    const TIME_KEY_PREFIX = 'shadowlearn_time_';

    function addTimeSpent(language, seconds) {
        if (!seconds || seconds <= 0) return;
        const key = TIME_KEY_PREFIX + language.toLowerCase();
        const current = parseInt(localStorage.getItem(key) || '0', 10);
        localStorage.setItem(key, String(current + Math.round(seconds)));
    }

    function getTimeSpent(language) {
        const key = TIME_KEY_PREFIX + language.toLowerCase();
        return parseInt(localStorage.getItem(key) || '0', 10);
    }

    function formatTime(totalSeconds) {
        if (totalSeconds < 60) return `${totalSeconds}s`;
        const h = Math.floor(totalSeconds / 3600);
        const m = Math.floor((totalSeconds % 3600) / 60);
        const s = totalSeconds % 60;
        if (h > 0) return `${h}h ${m}m`;
        return `${m}m ${s}s`;
    }

    // ── Phrase Mastery ────────────────────────────────────────────────────
    function _masteryKey(language, phraseId) {
        return `shadowlearn_mastery_${language.toLowerCase()}_${phraseId}`;
    }

    function getMastery(language, phraseId) {
        try {
            const raw = localStorage.getItem(_masteryKey(language, phraseId));
            return raw ? JSON.parse(raw) : null;
        } catch (e) {
            return null;
        }
    }

    function saveMastery(language, phraseId, score) {
        const existing = getMastery(language, phraseId) || { bestScore: 0, attempts: 0 };
        const updated = {
            bestScore: Math.max(existing.bestScore, score),
            attempts: existing.attempts + 1,
        };
        try {
            localStorage.setItem(_masteryKey(language, phraseId), JSON.stringify(updated));
        } catch (e) {
            console.warn('Could not save mastery:', e);
        }
        return updated;
    }

    // ── Daily Goal ────────────────────────────────────────────────────────
    function _todayKey() {
        return 'shadowlearn_daily_' + new Date().toISOString().slice(0, 10);
    }

    function getDailyProgress() {
        return parseInt(localStorage.getItem(_todayKey()) || '0', 10);
    }

    function addDailyProgress(count = 1) {
        const current = getDailyProgress();
        const next = current + count;
        localStorage.setItem(_todayKey(), String(next));
        return next;
    }

    function getDailyGoal() {
        return parseInt(localStorage.getItem('shadowlearn_daily_goal') || '10', 10);
    }

    function setDailyGoal(n) {
        localStorage.setItem('shadowlearn_daily_goal', String(n));
    }

    // ── Storage Size ──────────────────────────────────────────────────────
    /**
     * Returns the approximate size of all shadowlearn_ keys in bytes.
     */
    function getStorageSizeBytes() {
        let total = 0;
        _getAllShadowLearnKeys().forEach(k => {
            const v = localStorage.getItem(k) || '';
            total += k.length + v.length;
        });
        return total * 2; // UTF-16 = 2 bytes/char
    }

    function getStorageSizeLabel() {
        const bytes = getStorageSizeBytes();
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    }

    // ── Export / Import ───────────────────────────────────────────────────
    /**
     * Serialize all shadowlearn_ localStorage keys to a JSON object.
     * Returns the parsed object (so you can stringify it yourself or let
     * downloadBackup() handle it).
     */
    function exportAllData() {
        const snapshot = { _version: 1, _exported: new Date().toISOString(), keys: {} };
        _getAllShadowLearnKeys().forEach(k => {
            snapshot.keys[k] = localStorage.getItem(k);
        });
        return snapshot;
    }

    /**
     * Download a JSON backup file to the user's disk.
     * File is named shadowlearn-backup-YYYY-MM-DD.json
     */
    function downloadBackup() {
        const snapshot = exportAllData();
        const json = JSON.stringify(snapshot, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        const date = new Date().toISOString().slice(0, 10);
        a.href     = url;
        a.download = `shadowlearn-backup-${date}.json`;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
    }

    /**
     * Restore all data from a JSON backup object (as returned by exportAllData).
     * Existing keys are overwritten; keys not in the backup are left alone.
     * Returns { restored: number } count of keys written.
     */
    function importAllData(snapshotObj) {
        if (!snapshotObj || !snapshotObj.keys) throw new Error('Invalid backup file format.');
        let restored = 0;
        Object.entries(snapshotObj.keys).forEach(([k, v]) => {
            if (k.startsWith('shadowlearn_') && typeof v === 'string') {
                localStorage.setItem(k, v);
                restored++;
            }
        });
        return { restored };
    }

    /**
     * Load a JSON file from disk and call importAllData().
     * Returns a Promise that resolves to { restored: number }.
     */
    function restoreFromFile() {
        return new Promise((resolve, reject) => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json,application/json';
            input.addEventListener('change', async () => {
                const file = input.files[0];
                if (!file) { reject(new Error('No file selected')); return; }
                try {
                    const text = await file.text();
                    const obj  = JSON.parse(text);
                    const result = importAllData(obj);
                    resolve(result);
                } catch (e) {
                    reject(new Error('Could not read backup file: ' + e.message));
                } finally {
                    input.remove();
                }
            });
            document.body.appendChild(input);
            input.click();
        });
    }

    // ── Internal helpers ──────────────────────────────────────────────────
    function _dispatchStorageWarning(message) {
        window.dispatchEvent(new CustomEvent('shadowlearn:storageWarning', { detail: { message } }));
    }

    // ── Public API ────────────────────────────────────────────────────────
    return {
        getCurriculums,
        saveCurriculum,
        getCurriculumByLanguage,
        markModuleComplete,
        saveLesson,
        getLesson,
        clearLesson,
        addTimeSpent,
        getTimeSpent,
        formatTime,
        // Mastery
        getMastery,
        saveMastery,
        // Daily Goal
        getDailyProgress,
        addDailyProgress,
        getDailyGoal,
        setDailyGoal,
        // Data Safety
        getStorageSizeBytes,
        getStorageSizeLabel,
        exportAllData,
        downloadBackup,
        importAllData,
        restoreFromFile,
    };
})();
