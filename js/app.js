/**
 * ShadowLearn — Main App Controller
 * Orchestrates video playback, transcript sync, speech recording, and scoring.
 */

const App = (() => {

    // App state
    let state = {
        lessonData: null,
        currentPhraseIndex: -1,
        mode: 'idle',  // idle | watching | selected | recording | scored
    };

    // DOM references
    const dom = {};

    /**
     * Cache all DOM element references
     */
    function cacheDom() {
        dom.lessonTitle = document.getElementById('lessonTitle');
        dom.videoOverlay = document.getElementById('videoOverlay');
        dom.practicePhrase = document.getElementById('practicePhrase');
        dom.practicePhraseText = document.getElementById('practicePhraseText');
        dom.practicePhraseEnglish = document.getElementById('practicePhraseEnglish');
        dom.btnPrev = document.getElementById('btnPrev');
        dom.btnNext = document.getElementById('btnNext');
        dom.btnReplay = document.getElementById('btnReplay');
        dom.btnRecord = document.getElementById('btnRecord');
        dom.btnListen = document.getElementById('btnListen');
        dom.btnAutoPlay = document.getElementById('btnAutoPlay');
        dom.statusBar = document.getElementById('statusBar');
        dom.scoreSection = document.getElementById('scoreSection');
        dom.scoreCircle = document.getElementById('scoreCircle');
        dom.scoreValue = document.getElementById('scoreValue');
        dom.scoreMessage = document.getElementById('scoreMessage');
        dom.scoreWords = document.getElementById('scoreWords');
        dom.spokenText = document.getElementById('spokenText');
        dom.transcriptList = document.getElementById('transcriptList');
        // Dashboard / My Languages
        dom.dashboardView = document.getElementById('dashboardView');
        dom.practiceView = document.getElementById('practiceView');
        dom.languageGrid = document.getElementById('languageGrid');
        dom.curriculumView = document.getElementById('curriculumView');
        dom.modulesList = document.getElementById('modulesList');
        dom.curriculumTitle = document.getElementById('curriculumTitle');
        dom.btnMyLanguages = document.getElementById('btnMyLanguages');
        dom.btnEnrollLanguage = document.getElementById('btnEnrollLanguage');
        dom.btnBackToDashboard = document.getElementById('btnBackToDashboard');

        // Enroll Modal
        dom.enrollModal = document.getElementById('enrollModal');
        dom.enrollClose = document.getElementById('enrollClose');
        dom.enrollCancel = document.getElementById('enrollCancel');
        dom.btnGenerateCurriculum = document.getElementById('btnGenerateCurriculum');
        dom.enrollTargetLanguage = document.getElementById('enrollTargetLanguage');
        dom.enrollSourceLanguage = document.getElementById('enrollSourceLanguage');
        dom.enrollStatus = document.getElementById('enrollStatus');

        dom.btnMarkComplete = document.getElementById('btnMarkComplete');

        dom.transcriptProgress = document.getElementById('transcriptProgress');
        dom.browserWarning = document.getElementById('browserWarning');

        // New DOM elements for Practice Mode / Modals
        dom.languageBadgeText = document.getElementById('languageBadgeText');
        dom.videoSection = document.querySelector('.video-section');
        dom.videoContainer = document.getElementById('videoContainer');
        
        // Modals
        dom.btnSettings = document.getElementById('btnSettings');
        dom.settingsModal = document.getElementById('settingsModal');
        dom.settingsClose = document.getElementById('settingsClose');
        dom.settingsCancel = document.getElementById('settingsCancel');
        dom.settingsSave = document.getElementById('settingsSave');
        dom.btnTestConnection = document.getElementById('btnTestConnection');
        dom.connectionStatus = document.getElementById('connectionStatus');

        dom.btnNewLesson = document.getElementById('btnNewLesson');
        dom.createLessonModal = document.getElementById('createLessonModal');
        dom.createLessonClose = document.getElementById('createLessonClose');
        dom.createLessonCancel = document.getElementById('createLessonCancel');
        dom.btnGenerateLesson = document.getElementById('btnGenerateLesson');
        dom.phraseCountSlider = document.getElementById('phraseCount');
        dom.phraseCountValue = document.getElementById('phraseCountValue');
        dom.generateStatus = document.getElementById('generateStatus');
    }

    /**
     * Load lesson data from JSON
     */
    async function loadLesson(path) {
        try {
            const response = await fetch(path);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            state.lessonData = await response.json();
            dom.lessonTitle.textContent = state.lessonData.title;
            return state.lessonData;
        } catch (err) {
            console.error('Failed to load lesson:', err);
            setStatus('❌ Failed to load lesson data. Please refresh and try again.');
            throw err;
        }
    }

    /**
     * Initialize all modules and wire up the app
     */
    async function init() {
        cacheDom();

        // Inject gamification badge into the header
        if (typeof Gamification !== 'undefined') {
            Gamification.injectHeaderBadge();
        }

        // Check browser support
        if (!Recorder.isSupported()) {
            dom.browserWarning.classList.add('visible');
        }

        // Initialize recorder synchronously
        if (Recorder.isSupported()) {
            Recorder.init('kn-IN'); // Will be updated later when lesson loads

            Recorder.onStart(() => {
                setMode('recording');
                dom.btnRecord.classList.add('recording');
                setStatus('🎤 Listening... Speak now!');
                dom.videoOverlay.classList.add('visible');
            });

            Recorder.onResult((result) => {
                handleSpeechResult(result);
                if (state.autoPlaying) {
                    setTimeout(() => _autoPlayNext(), 1500);
                }
            });

            Recorder.onError((message) => {
                setStatus(`⚠️ ${message}`);
                dom.btnRecord.classList.remove('recording');
                dom.videoOverlay.classList.remove('visible');
                setMode('selected');
            });

            Recorder.onEnd(() => {
                dom.btnRecord.classList.remove('recording');
                dom.videoOverlay.classList.remove('visible');
            });
        }

        // Wire up core practice buttons
        dom.btnRecord.addEventListener('click', handleRecord);
        dom.btnListen.addEventListener('click', handleListen);
        dom.btnPrev.addEventListener('click', () => navigatePhrase(-1));
        dom.btnNext.addEventListener('click', () => navigatePhrase(1));
        dom.btnAutoPlay.addEventListener('click', toggleAutoPlay);

        // Keyboard shortcuts
        document.addEventListener('keydown', handleKeyboard);

        // Touch swipe gestures for mobile phrase navigation
        _initSwipeGestures();
        
        // Wire up UI state routers
        initModals();
        setupDashboardEvents();

        // Check if there's a generated lesson in memory or storage
        setStatus('📚 Loading lesson...');
        let lesson;
        
        // Check if we just generated a lesson (stored in sessionStorage)
        const storedLesson = sessionStorage.getItem('shadowlearn_current_lesson');
        if (storedLesson) {
            try {
                lesson = JSON.parse(storedLesson);
                dom.lessonTitle.textContent = lesson.title;
                dom.languageBadgeText.textContent = lesson.language.charAt(0).toUpperCase() + lesson.language.slice(1);
            } catch (e) {
                console.error("Failed to parse stored lesson", e);
            }
        }

        if (lesson) {
            state.lessonData = lesson;
            loadGeneratedLesson(lesson);
        } else {
            // we don't await blocking here, we handle it
            loadLesson('data/lessons/lesson-01.json').then(l => {
                lesson = l;
                loadVideoLesson(lesson);
            }).catch(e => {
                console.error("Failed to load root lesson:", e);
                setStatus('❌ Failed to load lesson data.');
            });
        }

        // Ready state is handled inside the specific loaders

        // Check if we came from a curriculum module — wire Mark Complete button + time tracking
        const moduleCtx = sessionStorage.getItem('shadowlearn_module_context');
        if (moduleCtx && dom.btnMarkComplete) {
            try {
                const ctx = JSON.parse(moduleCtx);

                // ── Session Timer ──────────────────────────────────────────
                // Record session start in sessionStorage (survives HMR but not tab close)
                if (!sessionStorage.getItem('shadowlearn_session_start')) {
                    sessionStorage.setItem('shadowlearn_session_start', String(Date.now()));
                }

                const getElapsedSeconds = () => {
                    const start = parseInt(sessionStorage.getItem('shadowlearn_session_start') || '0', 10);
                    return start ? Math.floor((Date.now() - start) / 1000) : 0;
                };

                // Guard flag: ensures time is saved exactly once per session,
                // preventing double-counting when the Mark Complete button fires
                // saveTime() and then window.location.reload() also triggers beforeunload.
                let timeSaved = false;
                const saveTime = () => {
                    if (timeSaved) return;
                    timeSaved = true;
                    StorageManager.addTimeSpent(ctx.language, getElapsedSeconds());
                };

                // Save time when tab is closed / navigated away mid-session
                window.addEventListener('beforeunload', saveTime);

                // ── Mark Complete Button ───────────────────────────────────
                dom.btnMarkComplete.style.display = 'inline-flex';
                dom.btnMarkComplete.addEventListener('click', () => {
                    saveTime();
                    StorageManager.markModuleComplete(ctx.language, ctx.moduleId);
                    sessionStorage.removeItem('shadowlearn_module_context');
                    sessionStorage.removeItem('shadowlearn_current_lesson');
                    sessionStorage.removeItem('shadowlearn_session_start');
                    window.removeEventListener('beforeunload', saveTime);

                    // Show gamification completion overlay
                    if (typeof Gamification !== 'undefined') {
                        const total     = state.lessonData ? state.lessonData.phrases.length : 0;
                        const attempted = Transcript ? Transcript.getCompletedCount() : 0;
                        Gamification.showCompletionOverlay({
                            phrasesAttempted: attempted,
                            phrasesTotal:     total,
                            onClose: () => { window.location.reload(); }
                        });
                    } else {
                        dom.btnMarkComplete.textContent = '✅ Saved!';
                        dom.btnMarkComplete.disabled = true;
                        setTimeout(() => { window.location.reload(); }, 800);
                    }
                });
            } catch (e) { /* ignore */ }
        }
    }

    /**
     * Load Video Mode (Original Behavior)
     */
    async function loadVideoLesson(lesson) {
        state.lessonData = lesson;
        
        // Initialize transcript (pass language for mastery lookup)
        Transcript.init(dom.transcriptList, lesson.phrases, lesson.language || '');
        Transcript.onPhraseClick(handlePhraseClick);
        updateProgress();

        // Initialize YouTube player
        setStatus('🎬 Loading video player...');
        Player.init('player', lesson.youtubeVideoId).then(() => {
            // Set up player time sync
            Player.onTimeUpdate((time) => {
                Transcript.syncWithTime(time);
                const idx = findPhraseAtTime(time);
                if (idx >= 0 && state.mode === 'watching') {
                    updatePracticeDisplay(idx);
                }
            });

            setMode('watching');
            setStatus('✨ Ready! Click a phrase in the transcript or press a number key to start practicing.');
            enableControls(false);
            
            // Check if we should load dashboard first over the active video overlay
            const curriculums = StorageManager.getCurriculums();
            if (curriculums.length > 0 && !window.location.search && !sessionStorage.getItem('shadowlearn_current_lesson')) {
                showDashboard();
            } else {
                // Determine source: URL param or local storage override
                const urlParams = new URLSearchParams(window.location.search);
                const lessonJsonUrl = urlParams.get('lesson');
                if (lessonJsonUrl) {
                    loadLesson(lessonJsonUrl).then(l => {
                        loadVideoLesson(l);
                    }).catch(e => {
                        console.error("Failed to load URL lesson:", e);
                        setStatus('❌ Failed to load lesson from URL.');
                    });
                } else {
                    // Default lesson already loaded, just enforce practice view natively
                    showPracticeView();
                }
            }
            
            // Set recorder language now that lesson is loaded
            if (Recorder.isSupported() && Recorder.setLanguage) {
               const langCode = TTS ? TTS.getLangCode(lesson.language) : 'kn-IN';
               Recorder.setLanguage(langCode);
            }

        }).catch(err => {
            console.error('Player init error:', err);
            setStatus('⚠️ Video failed to load. You can still practice with the transcript.');
            setMode('watching');
            enableControls(false);
        });

        // Wire video-specific buttons
        dom.btnReplay.addEventListener('click', handleReplay);
        
        // UI State
        dom.btnReplay.style.display = 'inline-flex';
        dom.btnListen.style.display = 'none';
        dom.videoSection.classList.remove('practice-mode');
        
        // Remove old practice card if it exists
        const oldCard = document.getElementById('practiceModeCard');
        if (oldCard) oldCard.remove();
    }

    /**
     * Load Practice Mode (LLM Generated, No Video)
     */
    function loadGeneratedLesson(lesson) {
        state.lessonData = lesson;
        
        // Initialize transcript (pass language for mastery lookup)
        Transcript.init(dom.transcriptList, lesson.phrases, lesson.language || '');
        Transcript.onPhraseClick(handlePhraseClick);
        updateProgress();

        // Switch UI to practice mode
        dom.videoSection.classList.add('practice-mode');
        dom.btnReplay.style.display = 'none';
        dom.btnListen.style.display = 'inline-flex';
        dom.btnListen.addEventListener('click', handleListen);

        // Make TTS available if needed
        if (Player.destroy) Player.destroy();

        // Create practice display card if it doesn't exist
        let practiceCard = document.getElementById('practiceModeCard');
        if (!practiceCard) {
            practiceCard = document.createElement('div');
            practiceCard.id = 'practiceModeCard';
            practiceCard.className = 'practice-mode-card';
            practiceCard.innerHTML = `
                <div class="practice-mode-native" id="pmNative">Select a phrase</div>
                <div class="practice-mode-translit" id="pmTranslit"></div>
                <div class="practice-mode-english" id="pmEnglish"></div>
            `;
            dom.videoContainer.parentNode.insertBefore(practiceCard, dom.practiceBar);
        }
        
        setMode('watching');
        setStatus('✨ Ready! Click a phrase in the transcript or press 1-9 to start practicing.');
        enableControls(false);
        
        // Set recorder language now that lesson is loaded
        if (Recorder.isSupported() && Recorder.setLanguage) {
           const langCode = TTS ? TTS.getLangCode(lesson.language) : 'kn-IN';
           Recorder.setLanguage(langCode);
        }
    }

    /**
     * Setup Modals and Events
     */
    function initModals() {
        // --- Settings Modal ---
        const populateSettings = () => {
            const settings = LLMProvider.getSettings();
            document.querySelector(`input[name="llmProvider"][value="${settings.provider}"]`).checked = true;
            document.getElementById('ollamaEndpoint').value = settings.ollama.endpoint;
            document.getElementById('ollamaModel').value = settings.ollama.model;
            document.getElementById('geminiApiKey').value = settings.gemini.apiKey;
            document.getElementById('geminiModel').value = settings.gemini.model;
            
            if (document.getElementById('openaiTtsKey') && settings.openaiTts) {
                document.getElementById('openaiTtsKey').value = settings.openaiTts.apiKey || '';
            }
            if (document.getElementById('reverieAppId') && settings.reverieTts) {
                document.getElementById('reverieAppId').value = settings.reverieTts.appId || '';
            }
            if (document.getElementById('reverieApiKey') && settings.reverieTts) {
                document.getElementById('reverieApiKey').value = settings.reverieTts.apiKey || '';
            }
            toggleProviderSettings(settings.provider);
        };

        const toggleProviderSettings = (provider) => {
            document.getElementById('ollamaSettings').style.display = provider === 'ollama' ? 'block' : 'none';
            document.getElementById('geminiSettings').style.display = provider === 'gemini' ? 'block' : 'none';
            dom.connectionStatus.className = 'connection-status';
            dom.connectionStatus.textContent = '';
        };

        document.querySelectorAll('input[name="llmProvider"]').forEach(radio => {
            radio.addEventListener('change', (e) => toggleProviderSettings(e.target.value));
        });

        dom.btnSettings.addEventListener('click', () => {
            populateSettings();
            dom.settingsModal.classList.add('visible');
        });

        const closeSettings = () => dom.settingsModal.classList.remove('visible');
        dom.settingsClose.addEventListener('click', closeSettings);
        dom.settingsCancel.addEventListener('click', closeSettings);

        dom.settingsSave.addEventListener('click', () => {
            const provider = document.querySelector('input[name="llmProvider"]:checked').value;
            LLMProvider.saveSettings({
                provider,
                ollama: {
                    endpoint: document.getElementById('ollamaEndpoint').value,
                    model: document.getElementById('ollamaModel').value
                },
                gemini: {
                    apiKey: document.getElementById('geminiApiKey').value,
                    model: document.getElementById('geminiModel').value
                },
                openaiTts: {
                    apiKey: document.getElementById('openaiTtsKey') ? document.getElementById('openaiTtsKey').value : ''
                },
                reverieTts: {
                    appId: document.getElementById('reverieAppId') ? document.getElementById('reverieAppId').value : '',
                    apiKey: document.getElementById('reverieApiKey') ? document.getElementById('reverieApiKey').value : ''
                }
            });
            closeSettings();
        });

        dom.btnTestConnection.addEventListener('click', async () => {
            dom.connectionStatus.textContent = 'Testing connection...';
            dom.connectionStatus.className = 'connection-status';
            
            const provider = document.querySelector('input[name="llmProvider"]:checked').value;
            const config = provider === 'ollama' 
                ? { endpoint: document.getElementById('ollamaEndpoint').value }
                : { apiKey: document.getElementById('geminiApiKey').value };
                
            const testProvider = LLMProvider.createProvider(provider, config);
            const result = await testProvider.testConnection();
            
            dom.connectionStatus.textContent = result.message;
            dom.connectionStatus.className = `connection-status ${result.success ? 'success' : 'error'}`;
        });

        // --- Data Safety: Export / Import ---
        const _setDataSafetyStatus = (msg, type = '') => {
            const el = document.getElementById('dataSafetyStatus');
            if (el) { el.textContent = msg; el.className = `data-safety-status ${type}`; }
        };

        // Refresh storage size label every time the modal opens
        dom.btnSettings.addEventListener('click', () => {
            const sizeEl = document.getElementById('storageSizeLabel');
            if (sizeEl) sizeEl.textContent = `💾 ${StorageManager.getStorageSizeLabel()} used`;
        });

        document.getElementById('btnExportData').addEventListener('click', () => {
            try {
                StorageManager.downloadBackup();
                _setDataSafetyStatus('✅ Backup downloaded successfully!', 'success');
            } catch (e) {
                _setDataSafetyStatus('❌ Export failed: ' + e.message, 'error');
            }
        });

        document.getElementById('btnImportData').addEventListener('click', async () => {
            _setDataSafetyStatus('📂 Choose your backup file…', '');
            try {
                const { restored } = await StorageManager.restoreFromFile();
                _setDataSafetyStatus(`✅ Restored ${restored} items. Reloading…`, 'success');
                setTimeout(() => window.location.reload(), 2000);
            } catch (e) {
                _setDataSafetyStatus('❌ Import failed: ' + e.message, 'error');
            }
        });

        // Storage full warning listener — fires when a lesson save fails due to quota
        window.addEventListener('shadowlearn:storageWarning', (e) => {
            const msg = e.detail?.message || 'Storage warning';
            const banner = document.createElement('div');
            banner.className = 'storage-warning-banner';
            banner.innerHTML = `
                <span>⚠️ ${msg}</span>
                <button onclick="StorageManager.downloadBackup(); this.parentElement.remove();">⬇️ Backup Now</button>
                <button onclick="this.parentElement.remove()">✕</button>
            `;
            document.body.appendChild(banner);
        });

        // --- Create Lesson Modal ---
        dom.phraseCountSlider.addEventListener('input', (e) => {
            dom.phraseCountValue.textContent = e.target.value;
        });

        dom.btnNewLesson.addEventListener('click', () => {
            dom.generateStatus.textContent = '';
            dom.generateStatus.className = 'generate-status';
            dom.createLessonModal.classList.add('visible');
        });

        const closeCreateLesson = () => {
            dom.createLessonModal.classList.remove('visible');
            dom.btnGenerateLesson.disabled = false;
        };
        dom.createLessonClose.addEventListener('click', closeCreateLesson);
        dom.createLessonCancel.addEventListener('click', closeCreateLesson);

        dom.btnGenerateLesson.addEventListener('click', async () => {
            const topic = document.getElementById('lessonTopic').value.trim();
            if (!topic) {
                dom.generateStatus.textContent = 'Please enter a topic.';
                dom.generateStatus.className = 'generate-status error';
                return;
            }

            const targetLang = document.getElementById('targetLanguage').value;
            const sourceLang = document.getElementById('sourceLanguage').value;
            const phraseCount = parseInt(dom.phraseCountSlider.value, 10);

            dom.btnGenerateLesson.disabled = true;
            dom.generateStatus.className = 'generate-status';
            dom.generateStatus.innerHTML = '<span class="loading-dots">Initializing</span>';

            try {
                const lessonData = await LessonGenerator.generate(
                    topic, targetLang, sourceLang, phraseCount,
                    (status) => { dom.generateStatus.innerHTML = `<span class="loading-dots">${status}</span>`; }
                );

                // Save to session storage and reload
                sessionStorage.setItem('shadowlearn_current_lesson', JSON.stringify(lessonData));
                window.location.reload();
            } catch (err) {
                console.error(err);
                dom.generateStatus.textContent = `Error: ${err.message}`;
                dom.generateStatus.className = 'generate-status error';
                dom.btnGenerateLesson.disabled = false;
            }
        });
    }

    /**
     * Find phrase index at a given time
     */
    function findPhraseAtTime(time) {
        if (!state.lessonData) return -1;
        for (let i = 0; i < state.lessonData.phrases.length; i++) {
            const p = state.lessonData.phrases[i];
            if (time >= p.startTime && time < p.endTime) return i;
        }
        return -1;
    }

    /**
     * Handle clicking on a phrase card
     */
    function handlePhraseClick(index, phrase) {
        selectPhrase(index);
    }

    /**
     * Select a phrase for practice
     */
    function selectPhrase(index) {
        if (index < 0 || index >= state.lessonData.phrases.length) return;

        // Cancel any pending auto-advance when the user picks a phrase
        _cancelAutoAdvance();

        state.currentPhraseIndex = index;
        const phrase = state.lessonData.phrases[index];

        // Update transcript highlight
        Transcript.setActive(index);

        // Update practice display
        updatePracticeDisplay(index);

        // Seek video to phrase start
        Player.seekTo(phrase.startTime);
        Player.pause();

        // Enable controls
        enableControls(true);
        setMode('selected');

        // Hide previous score
        dom.scoreSection.classList.remove('visible');
        
        // Stop any playing TTS
        if (TTS && TTS.getIsSpeaking()) TTS.stop();

        // Auto-play: use TTS in practice mode, video replay otherwise
        const isPracticeMode = state.lessonData.mode === 'practice' || !phrase.startTime;
        if (isPracticeMode && TTS) {
            setTimeout(handleListen, 50);
        } else if (!isPracticeMode) {
            setTimeout(handleReplay, 100);
        }
    }

    /**
     * Update the practice bar display with current phrase
     */
    function updatePracticeDisplay(index) {
        const phrase = state.lessonData.phrases[index];
        if (!phrase) return;

        dom.practicePhraseText.textContent = phrase.transliteration;
        dom.practicePhraseEnglish.textContent = phrase[state.lessonData.sourceLang] || phrase.english;

        // If in practice mode, also update the big display card
        if (state.lessonData.mode === 'practice') {
            const pmNative = document.getElementById('pmNative');
            const pmTranslit = document.getElementById('pmTranslit');
            const pmEnglish = document.getElementById('pmEnglish');
            if (pmNative) pmNative.textContent = phrase[state.lessonData.language] || phrase.native || '';
            if (pmTranslit) pmTranslit.textContent = phrase.transliteration;
            if (pmEnglish) pmEnglish.textContent = phrase[state.lessonData.sourceLang] || phrase.english;
        }

        // Animate the change
        dom.practicePhrase.style.animation = 'none';
        dom.practicePhrase.offsetHeight; // trigger reflow
        dom.practicePhrase.style.animation = 'slideUp 0.3s ease';
    }

    /**
     * Handle record button click
     */
    function handleRecord() {
        if (!Recorder.isSupported()) {
            setStatus('⚠️ Speech recognition is not supported in this browser. Please use Chrome.');
            return;
        }

        if (Recorder.getIsRecording()) {
            Recorder.stop();
            return;
        }

        const phrase = state.lessonData.phrases[state.currentPhraseIndex];
        if (!phrase) return;

        // Pause video and stop TTS and start recording
        Player.pause();
        if (TTS) TTS.stop();
        dom.scoreSection.classList.remove('visible');
        
        // Dynamically switch recorder language based on current lesson
        if (Recorder.setLanguage) {
            const langCode = TTS ? TTS.getLangCode(state.lessonData.language) : 'kn-IN';
            Recorder.setLanguage(langCode);
        }
        
        Recorder.start();
    }

    /**
     * Handle speech recognition result
     */
    function handleSpeechResult(result) {
        const phrase = state.lessonData.phrases[state.currentPhraseIndex];
        if (!phrase) return;

        // Score the result — compare spoken text against native script words
        const langKey = state.lessonData.language;
        const nativeText = phrase[langKey] || phrase.native || '';
        const nativeWords = nativeText.split(/\s+/);
        const scoreResult = Scorer.score(result.transcript, nativeWords, phrase.words);

        // Record XP & streak, then refresh badge
        if (typeof Gamification !== 'undefined') {
            const { xpGained, leveledUp, newLevel } = Gamification.recordAttempt(scoreResult.overallScore);
            Gamification.refreshHeaderBadge();
            Gamification.showXpPop(xpGained, leveledUp);
            // Remove streak-at-risk banner once first attempt is recorded
            Gamification.removeStreakBannerIfPracticed();
        }

        // Display the score
        displayScore(scoreResult);

        // Mark phrase as completed in transcript
        Transcript.markCompleted(phrase.id, scoreResult.overallScore);
        updateProgress();

        // ── Daily progress tracking ───────────────────────────────────────
        if (typeof StorageManager !== 'undefined') {
            StorageManager.addDailyProgress(1);
            if (typeof Gamification !== 'undefined') {
                Gamification.refreshDailyGoalWidget();
                Gamification.checkDailyGoalComplete();
            }
        }

        setMode('scored');

        // ── Auto Play: always advance after 1.5 s (score doesn't block flow) ──
        if (_autoPlaying) {
            if (_autoPlayMicTimer) { clearTimeout(_autoPlayMicTimer); _autoPlayMicTimer = null; }
            _autoPlayExpectingResult = false;
            setStatus(`${scoreResult.message} — ⏭ Next phrase in 1.5s…`);
            setTimeout(() => { if (_autoPlaying) _autoPlayNext(); }, 1500);
        } else {
            setStatus(scoreResult.message + ' Press 🎤 to try again or ▶ for the next phrase.');
            // Smart Auto-Advance: score ≥ 70% moves to next after 2 s
            if (scoreResult.overallScore >= 70) {
                _startAutoAdvance();
            }
        }
    }

    // ── Auto-Advance state ────────────────────────────────────────────────
    let _autoAdvanceTimer  = null;
    let _autoAdvancePaused = false;

    function _startAutoAdvance() {
        _cancelAutoAdvance(); // clear any existing

        const nextIndex = state.currentPhraseIndex + 1;
        if (nextIndex >= (state.lessonData?.phrases.length || 0)) return; // last phrase

        // Inject countdown bar
        let bar = document.getElementById('autoAdvanceBar');
        if (!bar) {
            bar = document.createElement('div');
            bar.id = 'autoAdvanceBar';
            bar.className = 'auto-advance-bar';
            bar.innerHTML = `
                <div class="aa-track">
                    <div class="aa-fill" id="aaFill"></div>
                </div>
                <button class="aa-cancel" id="aaCancelBtn" title="Stay on this phrase">Stay</button>
            `;
            dom.scoreSection.appendChild(bar);
        }
        bar.style.display = 'flex';
        const fill = document.getElementById('aaFill');
        if (fill) {
            fill.style.transition = 'none';
            fill.style.width = '0%';
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    fill.style.transition = 'width 2s linear';
                    fill.style.width = '100%';
                });
            });
        }

        document.getElementById('aaCancelBtn').addEventListener('click', _cancelAutoAdvance, { once: true });

        _autoAdvanceTimer = setTimeout(() => {
            bar.style.display = 'none';
            navigatePhrase(1);
        }, 2000);
    }

    function _cancelAutoAdvance() {
        if (_autoAdvanceTimer) {
            clearTimeout(_autoAdvanceTimer);
            _autoAdvanceTimer = null;
        }
        const bar = document.getElementById('autoAdvanceBar');
        if (bar) bar.style.display = 'none';
    }

    // ══════════════════════════════════════════════════════════════════
    //  AUTO PLAY — hands-free practice loop
    //  Flow: TTS speaks → mic opens → user repeats → score → next phrase
    // ══════════════════════════════════════════════════════════════════
    let _autoPlaying            = false;
    let _autoPlayMicTimer       = null;
    let _autoPlayExpectingResult= false;
    let _wakeLock               = null;   // Screen Wake Lock API

    /** Toggle auto play on/off */
    function toggleAutoPlay() {
        if (_autoPlaying) {
            stopAutoPlay();
        } else {
            startAutoPlay();
        }
    }

    function startAutoPlay() {
        if (!state.lessonData) return;

        _autoPlaying = true;

        // Update button
        dom.btnAutoPlay.textContent = '⏸ Pause';
        dom.btnAutoPlay.classList.add('btn-auto-active');
        dom.practiceBar?.classList.add('auto-play-active');

        // Prevent screen from sleeping (walking use-case)
        if ('wakeLock' in navigator) {
            navigator.wakeLock.request('screen')
                .then(lock => { _wakeLock = lock; })
                .catch(() => {});
        }

        // Start from current phrase (or phrase 0)
        const startIdx = state.currentPhraseIndex >= 0 ? state.currentPhraseIndex : 0;
        setStatus('🚶 Auto Play started — hear the phrase, then repeat it!');
        selectPhrase(startIdx);
    }

    function stopAutoPlay() {
        _autoPlaying = false;
        _autoPlayExpectingResult = false;

        if (_autoPlayMicTimer) { clearTimeout(_autoPlayMicTimer); _autoPlayMicTimer = null; }
        if (Recorder.getIsRecording()) Recorder.stop();
        if (TTS && TTS.getIsSpeaking()) TTS.stop();
        _cancelAutoAdvance();

        // Release wake lock
        if (_wakeLock) { _wakeLock.release().catch(() => {}); _wakeLock = null; }

        // Reset button
        dom.btnAutoPlay.textContent = '🚶 Auto';
        dom.btnAutoPlay.classList.remove('btn-auto-active');
        dom.practiceBar?.classList.remove('auto-play-active');

        setStatus('⏸ Auto Play paused. Tap a phrase or 🎤 to practice manually.');
    }

    /** Open the mic immediately — called after TTS finishes in auto mode */
    function _autoPlayOpenMic() {
        if (!_autoPlaying) return;

        if (!Recorder.isSupported()) {
            // No mic support — just advance
            setTimeout(() => { if (_autoPlaying) _autoPlayNext(); }, 1000);
            return;
        }

        setStatus('🎤 Your turn — repeat the phrase!');

        // Set recording language
        if (Recorder.setLanguage) {
            const langCode = TTS ? TTS.getLangCode(state.lessonData.language) : 'kn-IN';
            Recorder.setLanguage(langCode);
        }

        _autoPlayExpectingResult = true;

        // Safety timeout: if no speech detected in 8 s, skip to next
        _autoPlayMicTimer = setTimeout(() => {
            if (!_autoPlaying || !_autoPlayExpectingResult) return;
            _autoPlayExpectingResult = false;
            if (Recorder.getIsRecording()) Recorder.stop();
            setStatus('⏭ No speech detected — moving to next phrase…');
            setTimeout(() => { if (_autoPlaying) _autoPlayNext(); }, 700);
        }, 8000);

        // Stop any playing TTS then start recording
        if (TTS && TTS.getIsSpeaking()) TTS.stop();
        Player.pause();
        dom.scoreSection.classList.remove('visible');
        Recorder.start();
    }

    /** Advance to the next phrase, or stop at end of lesson */
    function _autoPlayNext() {
        if (!_autoPlaying) return;
        const nextIndex = state.currentPhraseIndex + 1;
        const total     = state.lessonData?.phrases.length || 0;

        if (nextIndex >= total) {
            stopAutoPlay();
            setStatus('🎉 Auto Play complete! You practiced all phrases. Great work!');
            return;
        }
        selectPhrase(nextIndex);
    }

    /**
     * Display score results in the UI
     */
    function displayScore(result) {
        // Show spoken text
        dom.spokenText.textContent = result.spokenText;

        // Show overall score
        dom.scoreValue.textContent = result.overallScore + '%';
        dom.scoreMessage.textContent = result.message;

        // Color the score circle based on performance + animate count-up
        const scoreEl = dom.scoreCircle;
        if (result.overallScore >= 80) {
            scoreEl.style.color = 'var(--success)';
        } else if (result.overallScore >= 50) {
            scoreEl.style.color = 'var(--warning)';
        } else {
            scoreEl.style.color = 'var(--error)';
        }

        // Animate score count-up
        dom.scoreValue.textContent = '0%';
        const target = result.overallScore;
        let current = 0;
        const step = Math.ceil(target / 20);
        const interval = setInterval(() => {
            current = Math.min(current + step, target);
            dom.scoreValue.textContent = current + '%';
            if (current >= target) clearInterval(interval);
        }, 30);

        // Render word breakdown
        dom.scoreWords.innerHTML = '';
        result.wordResults.forEach(w => {
            const el = document.createElement('span');
            el.className = `score-word ${w.status}`;
            el.title = `Expected: "${w.expected}" — Heard: "${w.spoken}" — Similarity: ${Math.round(w.similarity * 100)}%`;

            const icon = w.status === 'matched' ? '✅' : w.status === 'close' ? '⚠️' : '❌';
            el.textContent = `${icon} ${w.expected}`;
            dom.scoreWords.appendChild(el);
        });

        // Show the score section with animation
        dom.scoreSection.classList.add('visible');
    }

    /**
     * Handle replay button — replay the current phrase's video segment
     */
    function handleReplay() {
        if (state.currentPhraseIndex < 0) return;
        const phrase = state.lessonData.phrases[state.currentPhraseIndex];
        Player.playSegment(phrase.startTime, phrase.endTime);
        setMode('watching');
        dom.scoreSection.classList.remove('visible');
        setStatus('🔄 Replaying phrase... Listen carefully!');
    }

    /**
     * Handle listen button — play TTS for current phrase
     */
    function handleListen() {
        if (state.currentPhraseIndex < 0 || !TTS) return;
        const phrase = state.lessonData.phrases[state.currentPhraseIndex];
        const langKey = state.lessonData.language;
        const nativeText = phrase[langKey] || phrase.native || '';
        const transliteration = phrase.transliteration || '';
        
        dom.btnListen.classList.add('btn-listen-active');
        setStatus(`🔊 Listening to ${state.lessonData.language}...`);
        
        const textToSpeak = nativeText || transliteration || phrase.english;
        
        TTS.speak(textToSpeak, state.lessonData.language, {
            rate: 0.85,
            transliteration: transliteration,
            onEnd: () => {
                dom.btnListen.classList.remove('btn-listen-active');
                // ── Auto Play hook: open mic automatically after TTS ──
                if (_autoPlaying) {
                    _autoPlayOpenMic();
                } else {
                    setStatus(`🎯 Phrase ${state.currentPhraseIndex + 1} — Click 🔊 to listen or 🎤 to record.`);
                }
            },
            onError: (err) => {
                dom.btnListen.classList.remove('btn-listen-active');
                // Even if TTS fails, open mic in auto mode
                if (_autoPlaying) {
                    _autoPlayOpenMic();
                } else {
                    setStatus(`⚠️ TTS Error: ${err}`);
                }
            }
        });
    }

    /**
     * Navigate to previous/next phrase
     */
    function navigatePhrase(direction) {
        const newIndex = state.currentPhraseIndex + direction;
        if (newIndex >= 0 && newIndex < state.lessonData.phrases.length) {
            selectPhrase(newIndex);
        }
    }

    /**
     * Keyboard shortcut handler
     */
    function handleKeyboard(e) {
        // Don't handle if typing in an input
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

        switch (e.key) {
            case ' ':  // Space = record
                e.preventDefault();
                handleRecord();
                break;
            case 'r':  // R = replay
            case 'R':
                handleReplay();
                break;
            case 'l':  // L = listen (practice mode only)
            case 'L':
                if (state.lessonData && state.lessonData.mode === 'practice') {
                    handleListen();
                }
                break;
            case 'ArrowLeft':   // Left = prev phrase
                navigatePhrase(-1);
                break;
            case 'ArrowRight':  // Right = next phrase
                navigatePhrase(1);
                break;
            default:
                // Number keys 1-9 = select phrase
                const num = parseInt(e.key);
                if (num >= 1 && num <= 9 && num <= state.lessonData.phrases.length) {
                    selectPhrase(num - 1);
                }
        }
    }

    /**
     * Enable/disable control buttons
     */
    function enableControls(enabled) {
        dom.btnRecord.disabled = !enabled || !Recorder.isSupported();
        
        if (state.lessonData && state.lessonData.mode === 'practice') {
            dom.btnListen.disabled = !enabled || !TTS.isSupported();
            dom.btnReplay.disabled = true;
        } else {
            dom.btnReplay.disabled = !enabled;
            dom.btnListen.disabled = true;
        }
        
        dom.btnPrev.disabled     = !enabled || state.currentPhraseIndex <= 0;
        dom.btnNext.disabled     = !enabled || state.currentPhraseIndex >= (state.lessonData?.phrases.length || 0) - 1;
        dom.btnAutoPlay.disabled = !enabled;

        // Cache practiceBar reference if not already done
        if (!dom.practiceBar) dom.practiceBar = document.querySelector('.practice-bar');
    }

    /**
     * Set the app mode
     */
    function setMode(mode) {
        state.mode = mode;
    }

    /**
     * Update status bar message
     */
    function setStatus(message) {
        dom.statusBar.innerHTML = message;
    }

    /**
     * Update transcript progress counter
     */
    function updateProgress() {
        const total = Transcript.getCount();
        const completed = Transcript.getCompletedCount();
        dom.transcriptProgress.innerHTML = `<span>${completed} / ${total} practiced</span>`;
    }

    /**
     * Dashboard & Navigation Logic
     */
    function setupDashboardEvents() {
        const btnMyLanguages = document.getElementById('btnMyLanguages');
        const btnEnrollLanguage = document.getElementById('btnEnrollLanguage');
        const btnBackToDashboard = document.getElementById('btnBackToDashboard');
        
        if (btnMyLanguages) btnMyLanguages.addEventListener('click', showDashboard);
        if (btnEnrollLanguage) btnEnrollLanguage.addEventListener('click', () => {
            document.getElementById('enrollModal').classList.add('visible');
        });
        if (btnBackToDashboard) btnBackToDashboard.addEventListener('click', showDashboard);
        
        const enrollClose = document.getElementById('enrollClose');
        const enrollCancel = document.getElementById('enrollCancel');
        const closeEnroll = () => document.getElementById('enrollModal').classList.remove('visible');
        if (enrollClose) enrollClose.addEventListener('click', closeEnroll);
        if (enrollCancel) enrollCancel.addEventListener('click', closeEnroll);
        
        const btnGenerateCurriculum = document.getElementById('btnGenerateCurriculum');
        if (btnGenerateCurriculum) btnGenerateCurriculum.addEventListener('click', async () => {
            const targetLang = document.getElementById('enrollTargetLanguage').value;
            const sourceLang = document.getElementById('enrollSourceLanguage').value;
            const enrollStatus = document.getElementById('enrollStatus');
            
            btnGenerateCurriculum.disabled = true;
            enrollStatus.className = 'generate-status';
            enrollStatus.innerHTML = '<span class="loading-dots">Generating curriculum</span>';
            
            try {
                const plan = await CurriculumGenerator.generatePlan(targetLang, sourceLang);
                StorageManager.saveCurriculum(plan);
                closeEnroll();
                showDashboard();
            } catch (e) {
                enrollStatus.textContent = 'Error: ' + e.message;
                enrollStatus.className = 'generate-status error';
            } finally {
                btnGenerateCurriculum.disabled = false;
            }
        });
    }

    function showDashboard() {
        if (Player && Player.pause) Player.pause();
        const practiceView = document.getElementById('practiceView');
        if (practiceView) practiceView.style.display = 'none';
        
        const dashboardView = document.getElementById('dashboardView');
        if (dashboardView) dashboardView.style.display = 'block';
        
        document.getElementById('languageGrid').style.display = 'grid';
        document.getElementById('curriculumView').style.display = 'none';

        // ── Streak at-risk banner ─────────────────────────────────────────
        if (typeof Gamification !== 'undefined') {
            Gamification.showStreakBanner(dashboardView);
        }

        // ── Daily goal ring widget ────────────────────────────────────────
        if (typeof Gamification !== 'undefined') {
            const dashHeader = dashboardView.querySelector('.dashboard-header');
            if (dashHeader) {
                Gamification.injectDailyGoalWidget(dashHeader);
                Gamification.refreshDailyGoalWidget();
            }
        }
        
        const grid = document.getElementById('languageGrid');
        grid.innerHTML = '';
        const curriculums = StorageManager.getCurriculums();
        
        if (curriculums.length === 0) {
            grid.innerHTML = '<p style="color:var(--text-muted); grid-column:1/-1;">No languages enrolled yet. Click "Enroll New Language" to start!</p>';
            return;
        }
        
        curriculums.forEach(curr => {
            const completed = curr.modules.filter(m => m.status === 'completed').length;
            const total = curr.modules.length;
            const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
            const timeSpent = StorageManager.getTimeSpent(curr.language);
            const timeLabel = timeSpent > 0 ? StorageManager.formatTime(timeSpent) : 'No sessions yet';
            const card = document.createElement('div');
            card.className = 'language-card';
            card.innerHTML = `
                <h3>${curr.language.charAt(0).toUpperCase() + curr.language.slice(1)}</h3>
                <p style="color:var(--text-secondary); margin:0.25rem 0 0.75rem;">${curr.proficiency} Level</p>
                <div class="progress-bar-wrap">
                    <div class="progress-bar-fill" style="width:${pct}%"></div>
                </div>
                <div style="display:flex; justify-content:space-between; margin-top:0.4rem; font-size:0.82rem; color:var(--text-muted);">
                    <span>${completed} / ${total} modules</span>
                    <span>${pct}% complete</span>
                </div>
                <div style="margin-top:0.6rem; font-size:0.8rem; color:var(--text-muted); display:flex; align-items:center; gap:0.35rem;">
                    <span>⏱️</span><span>${timeLabel} total</span>
                </div>
            `;
            card.addEventListener('click', () => showCurriculumDetails(curr.language));
            grid.appendChild(card);
        });
    }

    function showCurriculumDetails(lang) {
        document.getElementById('languageGrid').style.display = 'none';
        document.getElementById('curriculumView').style.display = 'flex';
        
        const curr = StorageManager.getCurriculumByLanguage(lang);
        if (!curr) return;
        
        document.getElementById('curriculumTitle').textContent = `${lang.charAt(0).toUpperCase() + lang.slice(1)} Plan`;
        
        const list = document.getElementById('modulesList');
        list.innerHTML = '';
        
        curr.modules.forEach(mod => {
            const el = document.createElement('div');
            el.className = 'module-card';
            const isCompleted = mod.status === 'completed';
            const hasCachedLesson = !!StorageManager.getLesson(lang, mod.id);
            
            el.innerHTML = `
                <div class="module-info">
                    <h4>${mod.title}</h4>
                    <p>${mod.description}</p>
                </div>
                <div class="module-actions">
                    <span class="module-status ${isCompleted ? 'status-completed' : 'status-pending'}">
                        ${isCompleted ? '✅ Completed' : 'Pending'}
                    </span>
                    ${hasCachedLesson ? '<span style="font-size:0.75rem; color:var(--text-muted); margin-right:0.5rem;">💾 Cached</span>' : ''}
                    ${hasCachedLesson ? `<button class="btn btn-sm btn-ghost btn-regen-module" title="Regenerate with AI">🔄</button>` : ''}
                    <button class="btn btn-sm ${isCompleted ? 'btn-secondary' : 'btn-primary'} btn-practice-module">
                        ▶ Practice
                    </button>
                </div>
            `;
            
            // Practice button — load from cache or generate fresh
            el.querySelector('.btn-practice-module').addEventListener('click', async () => {
                const btn = el.querySelector('.btn-practice-module');

                // Cache hit — launch instantly!
                const cached = StorageManager.getLesson(lang, mod.id);
                if (cached) {
                    sessionStorage.setItem('shadowlearn_current_lesson', JSON.stringify(cached));
                    sessionStorage.setItem('shadowlearn_module_context', JSON.stringify({ language: lang, moduleId: mod.id }));
                    window.location.reload();
                    return;
                }

                // No cache — call the LLM
                const originalText = btn.innerHTML;
                btn.innerHTML = '<span class="loading-dots">Generating</span>';
                btn.disabled = true;
                
                try {
                    const lessonData = await LessonGenerator.generate(
                        mod.title, lang, "English", 20,
                        (status) => { btn.innerHTML = `<span class="loading-dots">${status}</span>`; }
                    );
                    
                    // Save to cache so future clicks are instant
                    StorageManager.saveLesson(lang, mod.id, lessonData);
                    sessionStorage.setItem('shadowlearn_current_lesson', JSON.stringify(lessonData));
                    sessionStorage.setItem('shadowlearn_module_context', JSON.stringify({ language: lang, moduleId: mod.id }));
                    window.location.reload();
                } catch (err) {
                    console.error(err);
                    btn.textContent = '❌ Error';
                    setTimeout(() => { btn.innerHTML = originalText; btn.disabled = false; }, 2000);
                }
            });

            // Regenerate button — clear cache and generate fresh
            const regenBtn = el.querySelector('.btn-regen-module');
            if (regenBtn) {
                regenBtn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    if (!confirm(`Regenerate lesson for "${mod.title}"? This will replace the cached version.`)) return;
                    StorageManager.clearLesson(lang, mod.id);
                    // Trigger as if Practice was clicked without cache
                    regenBtn.textContent = '⏳';
                    regenBtn.disabled = true;
                    try {
                        const lessonData = await LessonGenerator.generate(
                            mod.title, lang, "English", 20, () => {}
                        );
                        StorageManager.saveLesson(lang, mod.id, lessonData);
                        sessionStorage.setItem('shadowlearn_current_lesson', JSON.stringify(lessonData));
                        sessionStorage.setItem('shadowlearn_module_context', JSON.stringify({ language: lang, moduleId: mod.id }));
                        window.location.reload();
                    } catch (err) {
                        console.error(err);
                        regenBtn.textContent = '🔄';
                        regenBtn.disabled = false;
                    }
                });
            }
            
            list.appendChild(el);
        });
    }

    function showPracticeView() {
        const d = document.getElementById('dashboardView');
        if (d) d.style.display = 'none';
        const p = document.getElementById('practiceView');
        if (p) p.style.display = 'grid';
    }

    // ── Touch Swipe Gestures (mobile phrase navigation) ────────────────
    function _initSwipeGestures() {
        let _touchStartX = 0;
        let _touchStartY = 0;
        const SWIPE_THRESHOLD = 60;  // px minimum horizontal travel
        const ANGLE_LIMIT     = 40;  // degrees: reject if too vertical

        const practiceEl = document.getElementById('practiceView');
        if (!practiceEl) return;

        practiceEl.addEventListener('touchstart', (e) => {
            _touchStartX = e.changedTouches[0].clientX;
            _touchStartY = e.changedTouches[0].clientY;
        }, { passive: true });

        practiceEl.addEventListener('touchend', (e) => {
            // Only act when a lesson is loaded
            if (!state.lessonData) return;

            const dx = e.changedTouches[0].clientX - _touchStartX;
            const dy = e.changedTouches[0].clientY - _touchStartY;

            // Ignore if swipe is mostly vertical (user is scrolling transcript)
            if (Math.abs(dy) > Math.abs(dx) * Math.tan((ANGLE_LIMIT * Math.PI) / 180)) return;

            if (Math.abs(dx) < SWIPE_THRESHOLD) return; // too short

            if (dx < 0) {
                // Swipe left → next phrase
                _cancelAutoAdvance();
                navigatePhrase(1);
            } else {
                // Swipe right → previous phrase
                _cancelAutoAdvance();
                navigatePhrase(-1);
            }
        }, { passive: true });
    }

    // Initialize on DOM ready
    document.addEventListener('DOMContentLoaded', init);

    // Public API (for debugging)
    return {
        getState: () => state,
        selectPhrase
    };

})();
