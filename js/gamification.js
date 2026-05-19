/**
 * ShadowLearn — Gamification Module
 * Handles XP, levels, daily streaks, daily goal ring, streak warning banner,
 * and the lesson completion overlay.
 */

const Gamification = (() => {

    // ── Storage Keys ──────────────────────────────────────────────────────
    const KEY_XP        = 'shadowlearn_xp_total';
    const KEY_STREAK    = 'shadowlearn_streak';
    const KEY_LAST_DAY  = 'shadowlearn_last_practice_day';

    // ── XP Awards ─────────────────────────────────────────────────────────
    const XP = {
        ATTEMPT:    5,   // any recording attempt
        CLOSE:     10,   // score >= 50%
        GOOD:      20,   // score >= 70%
        EXCELLENT: 40,   // score >= 90%
        DAILY_GOAL: 50,  // completing the daily goal
    };

    // ── Level thresholds ──────────────────────────────────────────────────
    const LEVELS = [
        { min: 0,    label: 'Beginner',     emoji: '🌱' },
        { min: 100,  label: 'Explorer',     emoji: '🗺️' },
        { min: 300,  label: 'Apprentice',   emoji: '📖' },
        { min: 600,  label: 'Speaker',      emoji: '🗣️' },
        { min: 1000, label: 'Conversant',   emoji: '💬' },
        { min: 1500, label: 'Fluent',       emoji: '🌟' },
        { min: 2500, label: 'Native-Like',  emoji: '🏆' },
    ];

    // ── Lesson session accumulator ─────────────────────────────────────────
    let _sessionXP       = 0;
    let _sessionAttempts = 0;
    let _sessionBest     = 0; // highest score in this session

    // ── Daily goal bonus: awarded at most once per day ─────────────────────
    const _dailyGoalBonusKey = 'shadowlearn_daily_goal_bonus_' + new Date().toISOString().slice(0, 10);
    let _dailyGoalBonusGiven = !!localStorage.getItem(_dailyGoalBonusKey);

    // ─────────────────────────────────────────────────────
    //  Core helpers
    // ─────────────────────────────────────────────────────

    function getTotalXP() {
        return parseInt(localStorage.getItem(KEY_XP) || '0', 10);
    }

    function addXP(amount) {
        const newTotal = getTotalXP() + amount;
        localStorage.setItem(KEY_XP, String(newTotal));
        _sessionXP += amount;
        return newTotal;
    }

    function getLevel(xp = null) {
        const total = xp !== null ? xp : getTotalXP();
        let level = LEVELS[0];
        for (const l of LEVELS) {
            if (total >= l.min) level = l;
        }
        const levelIdx = LEVELS.indexOf(level);
        const next = LEVELS[levelIdx + 1] || null;
        const progress = next
            ? Math.round(((total - level.min) / (next.min - level.min)) * 100)
            : 100;
        return { ...level, index: levelIdx, next, progress, total };
    }

    // ─────────────────────────────────────────────────────
    //  Streak
    // ─────────────────────────────────────────────────────

    function _todayKey() {
        return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    }

    function getStreak() {
        return parseInt(localStorage.getItem(KEY_STREAK) || '0', 10);
    }

    /**
     * Returns true if the user has NOT practiced yet today
     * (streak is about to break if they don't open the app).
     */
    function isStreakAtRisk() {
        const lastDay = localStorage.getItem(KEY_LAST_DAY) || '';
        return lastDay !== _todayKey() && getStreak() > 0;
    }

    /**
     * Call once when the user completes any scored attempt today.
     * Returns { streak, isNew } where isNew=true means streak just incremented.
     */
    function touchStreak() {
        const today     = _todayKey();
        const lastDay   = localStorage.getItem(KEY_LAST_DAY) || '';
        const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

        if (lastDay === today) {
            return { streak: getStreak(), isNew: false }; // already counted today
        }

        let streak = getStreak();
        if (lastDay === yesterday) {
            streak += 1; // continuing streak
        } else {
            streak = 1;  // streak broken or first practice
        }

        localStorage.setItem(KEY_STREAK, String(streak));
        localStorage.setItem(KEY_LAST_DAY, today);
        return { streak, isNew: true };
    }

    // ─────────────────────────────────────────────────────
    //  Called from App after each scored attempt
    // ─────────────────────────────────────────────────────

    /**
     * Award XP for an attempt result. Returns { xpGained, totalXP, leveledUp }.
     */
    function recordAttempt(score) {
        _sessionAttempts++;
        if (score > _sessionBest) _sessionBest = score;

        let xpGained;
        if (score >= 90)      xpGained = XP.EXCELLENT;
        else if (score >= 70) xpGained = XP.GOOD;
        else if (score >= 50) xpGained = XP.CLOSE;
        else                  xpGained = XP.ATTEMPT;

        const oldLevel  = getLevel();
        const totalXP   = addXP(xpGained);
        const newLevel  = getLevel(totalXP);
        const leveledUp = newLevel.index > oldLevel.index;

        // Touch streak on first attempt of the session
        if (_sessionAttempts === 1) touchStreak();

        return { xpGained, totalXP, leveledUp, newLevel };
    }

    // ─────────────────────────────────────────────────────
    //  Header XP indicator
    // ─────────────────────────────────────────────────────

    let _xpBadgeEl = null;

    function injectHeaderBadge() {
        const header = document.querySelector('.header-actions');
        if (!header || document.getElementById('xpBadge')) return;

        const badge = document.createElement('div');
        badge.id = 'xpBadge';
        badge.className = 'xp-badge';
        badge.innerHTML = `
            <span class="xp-badge-icon">⚡</span>
            <span class="xp-badge-amount" id="xpBadgeAmount">0 XP</span>
            <span class="xp-badge-sep">·</span>
            <span class="xp-badge-streak" id="xpBadgeStreak">🔥 0</span>
        `;
        header.prepend(badge);
        _xpBadgeEl = badge;
        refreshHeaderBadge();
    }

    function refreshHeaderBadge() {
        const amountEl = document.getElementById('xpBadgeAmount');
        const streakEl = document.getElementById('xpBadgeStreak');
        if (!amountEl) return;
        const level = getLevel();
        amountEl.textContent = `${level.emoji} ${level.total} XP`;
        streakEl.textContent = `🔥 ${getStreak()}`;
    }

    /**
     * Temporarily show a floating "+XP" pop near the badge.
     */
    function showXpPop(amount, isLevelUp = false) {
        const badge = document.getElementById('xpBadge');
        if (!badge) return;
        const pop = document.createElement('div');
        pop.className = 'xp-pop' + (isLevelUp ? ' xp-pop-levelup' : '');
        pop.textContent = isLevelUp ? '🎉 Level Up!' : `+${amount} XP`;
        document.body.appendChild(pop);

        const rect = badge.getBoundingClientRect();
        pop.style.left = `${rect.left + rect.width / 2}px`;
        pop.style.top  = `${rect.top - 8}px`;

        requestAnimationFrame(() => pop.classList.add('xp-pop-animate'));
        setTimeout(() => pop.remove(), 1400);
    }

    // ─────────────────────────────────────────────────────
    //  Daily Goal Ring
    // ─────────────────────────────────────────────────────

    const RING_R  = 24;   // SVG circle radius
    const RING_C  = Math.round(2 * Math.PI * RING_R); // circumference ≈ 151

    function injectDailyGoalWidget(container) {
        if (!container || document.getElementById('dailyGoalWidget')) return;

        const goal = StorageManager.getDailyGoal();
        const done = StorageManager.getDailyProgress();
        const pct  = Math.min(done / goal, 1);
        const offset = RING_C - Math.round(pct * RING_C);

        const wrap = document.createElement('div');
        wrap.id = 'dailyGoalWidget';
        wrap.className = 'daily-goal-widget';
        wrap.title = `Daily Goal: ${done} / ${goal} phrases practiced`;
        wrap.innerHTML = `
            <svg class="daily-goal-ring" viewBox="0 0 60 60" width="60" height="60">
                <circle class="ring-track" cx="30" cy="30" r="${RING_R}"/>
                <circle class="ring-fill"  cx="30" cy="30" r="${RING_R}"
                    id="dailyGoalRingFill"
                    stroke-dasharray="${RING_C}"
                    stroke-dashoffset="${offset}"
                    transform="rotate(-90 30 30)"/>
            </svg>
            <div class="daily-goal-text">
                <div class="daily-goal-count" id="dailyGoalCount">${done}</div>
                <div class="daily-goal-label">/ ${goal}<br>today</div>
            </div>
        `;
        container.appendChild(wrap);
    }

    function refreshDailyGoalWidget() {
        const fill  = document.getElementById('dailyGoalRingFill');
        const count = document.getElementById('dailyGoalCount');
        if (!fill || !count) return;

        const goal   = StorageManager.getDailyGoal();
        const done   = StorageManager.getDailyProgress();
        const pct    = Math.min(done / goal, 1);
        const offset = RING_C - Math.round(pct * RING_C);

        fill.style.transition = 'stroke-dashoffset 0.6s ease';
        fill.setAttribute('stroke-dashoffset', offset);
        count.textContent = done;

        // Update tooltip
        const widget = document.getElementById('dailyGoalWidget');
        if (widget) widget.title = `Daily Goal: ${done} / ${goal} phrases practiced`;
    }

    /**
     * Call after each phrase attempt. Awards 50 XP bonus once per day
     * when the daily goal is first reached.
     */
    function checkDailyGoalComplete() {
        if (_dailyGoalBonusGiven) return;
        const goal = StorageManager.getDailyGoal();
        const done = StorageManager.getDailyProgress();
        if (done >= goal) {
            _dailyGoalBonusGiven = true;
            localStorage.setItem(_dailyGoalBonusKey, '1');

            const { xpGained, leveledUp } = { xpGained: XP.DAILY_GOAL, leveledUp: false };
            addXP(XP.DAILY_GOAL);
            refreshHeaderBadge();
            refreshDailyGoalWidget();
            _showToast(`🎯 Daily Goal Complete! +${XP.DAILY_GOAL} XP Bonus!`, 'success', 3000);
        }
    }

    // ─────────────────────────────────────────────────────
    //  Streak At-Risk Banner
    // ─────────────────────────────────────────────────────

    const _bannerDismissKey = 'shadowlearn_streak_banner_dismissed_' + new Date().toISOString().slice(0, 10);

    function showStreakBanner(container) {
        if (!container) return;
        if (document.getElementById('streakBanner')) return;
        if (localStorage.getItem(_bannerDismissKey)) return; // dismissed today
        if (!isStreakAtRisk()) return; // already practiced today or no streak

        const streak = getStreak();
        const banner = document.createElement('div');
        banner.id = 'streakBanner';
        banner.className = 'streak-banner';
        banner.innerHTML = `
            <span class="streak-banner-icon">🔥</span>
            <span class="streak-banner-text">
                Your <strong>${streak}-day streak</strong> is at risk!
                Practice at least one phrase today to keep it alive.
            </span>
            <button class="streak-banner-dismiss" id="streakBannerDismiss" title="Dismiss">✕</button>
        `;
        container.prepend(banner);

        document.getElementById('streakBannerDismiss').addEventListener('click', () => {
            localStorage.setItem(_bannerDismissKey, '1');
            banner.classList.add('streak-banner-out');
            setTimeout(() => banner.remove(), 350);
        });

        // Animate in
        requestAnimationFrame(() => banner.classList.add('streak-banner-in'));
    }

    function removeStreakBannerIfPracticed() {
        const banner = document.getElementById('streakBanner');
        if (banner) {
            banner.classList.add('streak-banner-out');
            setTimeout(() => banner.remove(), 350);
        }
    }

    // ─────────────────────────────────────────────────────
    //  Toast helper (shared)
    // ─────────────────────────────────────────────────────

    function _showToast(message, type = 'info', duration = 2500) {
        const existing = document.getElementById('slToast');
        if (existing) existing.remove();

        const toast = document.createElement('div');
        toast.id = 'slToast';
        toast.className = `sl-toast sl-toast-${type}`;
        toast.textContent = message;
        document.body.appendChild(toast);
        requestAnimationFrame(() => toast.classList.add('sl-toast-in'));
        setTimeout(() => {
            toast.classList.remove('sl-toast-in');
            setTimeout(() => toast.remove(), 350);
        }, duration);
    }

    // ─────────────────────────────────────────────────────
    //  Lesson Completion Overlay
    // ─────────────────────────────────────────────────────

    /**
     * Show the lesson-complete celebration overlay.
     * @param {object} opts  { phrasesAttempted, phrasesTotal, onClose }
     */
    function showCompletionOverlay(opts = {}) {
        const { phrasesAttempted = 0, phrasesTotal = 0, onClose } = opts;
        const level  = getLevel();
        const streak = getStreak();

        // Build stars from session best score
        const stars = _sessionBest >= 90 ? 3 : _sessionBest >= 60 ? 2 : 1;
        const starHtml = '⭐'.repeat(stars) + '☆'.repeat(3 - stars);

        // Remove existing if any
        const existing = document.getElementById('completionOverlay');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.id = 'completionOverlay';
        overlay.className = 'completion-overlay';
        overlay.innerHTML = `
            <div class="completion-card">
                <div class="completion-confetti" id="completionConfetti"></div>

                <div class="completion-badge">
                    <span class="completion-badge-emoji">🎉</span>
                </div>

                <h2 class="completion-title">Lesson Complete!</h2>

                <div class="completion-stars">${starHtml}</div>

                <div class="completion-stats">
                    <div class="completion-stat">
                        <div class="completion-stat-value">+${_sessionXP}</div>
                        <div class="completion-stat-label">XP Earned</div>
                    </div>
                    <div class="completion-stat">
                        <div class="completion-stat-value">${phrasesAttempted}/${phrasesTotal}</div>
                        <div class="completion-stat-label">Phrases</div>
                    </div>
                    <div class="completion-stat">
                        <div class="completion-stat-value">🔥 ${streak}</div>
                        <div class="completion-stat-label">Day Streak</div>
                    </div>
                </div>

                <div class="completion-level">
                    <div class="completion-level-label">${level.emoji} ${level.label}</div>
                    <div class="completion-level-bar-wrap">
                        <div class="completion-level-bar-fill" style="width: 0%" data-target="${level.progress}%"></div>
                    </div>
                    <div class="completion-level-subtext">
                        ${level.next
                            ? `${level.total} / ${level.next.min} XP → ${level.next.label}`
                            : 'Max level reached! 🏆'
                        }
                    </div>
                </div>

                <button class="btn btn-primary completion-close-btn" id="completionClose">
                    Continue →
                </button>
            </div>
        `;

        document.body.appendChild(overlay);
        _spawnConfetti(overlay.querySelector('#completionConfetti'));

        // Animate XP bar fill after paint
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                const fill = overlay.querySelector('.completion-level-bar-fill');
                if (fill) fill.style.width = fill.dataset.target;
            });
        });

        document.getElementById('completionClose').addEventListener('click', () => {
            overlay.classList.add('completion-overlay-out');
            setTimeout(() => {
                overlay.remove();
                _sessionXP       = 0;
                _sessionAttempts = 0;
                _sessionBest     = 0;
                if (onClose) onClose();
            }, 400);
        });
    }

    // ─────────────────────────────────────────────────────
    //  Confetti
    // ─────────────────────────────────────────────────────

    function _spawnConfetti(container) {
        if (!container) return;
        const colors = ['#06b6d4','#8b5cf6','#f59e0b','#10b981','#ef4444','#ec4899'];
        const count  = 60;
        for (let i = 0; i < count; i++) {
            const el = document.createElement('div');
            el.className = 'confetti-piece';
            el.style.cssText = `
                left: ${Math.random() * 100}%;
                background: ${colors[Math.floor(Math.random() * colors.length)]};
                width: ${Math.random() * 8 + 4}px;
                height: ${Math.random() * 8 + 4}px;
                border-radius: ${Math.random() > 0.5 ? '50%' : '2px'};
                animation-delay: ${Math.random() * 0.6}s;
                animation-duration: ${Math.random() * 1 + 0.8}s;
            `;
            container.appendChild(el);
        }
    }

    // ─────────────────────────────────────────────────────
    //  Public API
    // ─────────────────────────────────────────────────────

    return {
        injectHeaderBadge,
        refreshHeaderBadge,
        showXpPop,
        recordAttempt,
        showCompletionOverlay,
        getTotalXP,
        getLevel,
        getStreak,
        isStreakAtRisk,
        // Daily goal
        injectDailyGoalWidget,
        refreshDailyGoalWidget,
        checkDailyGoalComplete,
        // Streak banner
        showStreakBanner,
        removeStreakBannerIfPracticed,
        // Expose for app.js
        getSessionXP:       () => _sessionXP,
        getSessionAttempts: () => _sessionAttempts,
        getSessionBest:     () => _sessionBest,
    };

})();
