/**
 * ShadowLearn — YouTube Player Wrapper
 * Uses YouTube IFrame API for video playback with phrase-level control.
 */

const Player = (() => {

    let ytPlayer = null;
    let isReady = false;
    let timeUpdateInterval = null;
    let onTimeUpdateCallback = null;
    let onReadyCallback = null;
    let onStateChangeCallback = null;

    /**
     * Load the YouTube IFrame API script
     * @returns {Promise} Resolves when API is loaded
     */
    function loadAPI() {
        return new Promise((resolve, reject) => {
            // Check if already loaded
            if (window.YT && window.YT.Player) {
                resolve();
                return;
            }

            // Set up the global callback
            window.onYouTubeIframeAPIReady = () => {
                resolve();
            };

            // Load the API script
            const tag = document.createElement('script');
            tag.src = 'https://www.youtube.com/iframe_api';
            tag.onerror = () => reject(new Error('Failed to load YouTube IFrame API'));
            document.head.appendChild(tag);
        });
    }

    /**
     * Initialize the player in a given container
     * @param {string} containerId - DOM element ID to embed the player in
     * @param {string} videoId - YouTube video ID
     * @returns {Promise} Resolves when player is ready
     */
    async function init(containerId, videoId) {
        await loadAPI();

        return new Promise((resolve, reject) => {
            try {
                ytPlayer = new YT.Player(containerId, {
                    videoId: videoId,
                    width: '100%',
                    height: '100%',
                    playerVars: {
                        autoplay: 0,
                        controls: 1,
                        modestbranding: 1,
                        rel: 0,
                        fs: 1,
                        cc_load_policy: 0,
                        iv_load_policy: 3,  // hide annotations
                        playsinline: 1     // for mobile
                    },
                    events: {
                        onReady: (event) => {
                            isReady = true;
                            startTimeUpdate();
                            if (onReadyCallback) onReadyCallback();
                            resolve(event);
                        },
                        onStateChange: (event) => {
                            if (onStateChangeCallback) onStateChangeCallback(event.data);
                        },
                        onError: (event) => {
                            console.error('YouTube player error:', event.data);
                            reject(new Error(`YouTube player error: ${event.data}`));
                        }
                    }
                });
            } catch (err) {
                reject(err);
            }
        });
    }

    /**
     * Start polling for time updates (YouTube API doesn't have a native timeupdate event)
     */
    function startTimeUpdate() {
        if (timeUpdateInterval) clearInterval(timeUpdateInterval);
        timeUpdateInterval = setInterval(() => {
            if (ytPlayer && isReady && typeof ytPlayer.getCurrentTime === 'function') {
                const state = ytPlayer.getPlayerState();
                // Only emit during playback (1 = playing)
                if (state === YT.PlayerState.PLAYING) {
                    if (onTimeUpdateCallback) {
                        onTimeUpdateCallback(ytPlayer.getCurrentTime());
                    }
                }
            }
        }, 250); // 4 times per second
    }

    /**
     * Play the video
     */
    function play() {
        if (ytPlayer && isReady) ytPlayer.playVideo();
    }

    /**
     * Pause the video
     */
    function pause() {
        if (ytPlayer && isReady) ytPlayer.pauseVideo();
    }

    /**
     * Seek to a specific time (in seconds)
     */
    function seekTo(seconds) {
        if (ytPlayer && isReady) {
            ytPlayer.seekTo(seconds, true);
        }
    }

    /**
     * Get the current playback time
     */
    function getCurrentTime() {
        if (ytPlayer && isReady && typeof ytPlayer.getCurrentTime === 'function') {
            return ytPlayer.getCurrentTime();
        }
        return 0;
    }

    /**
     * Get the video duration
     */
    function getDuration() {
        if (ytPlayer && isReady && typeof ytPlayer.getDuration === 'function') {
            return ytPlayer.getDuration();
        }
        return 0;
    }

    /**
     * Get current player state
     */
    function getState() {
        if (ytPlayer && isReady && typeof ytPlayer.getPlayerState === 'function') {
            return ytPlayer.getPlayerState();
        }
        return -1;
    }

    /**
     * Play a specific segment of the video
     * @param {number} startTime - Start time in seconds
     * @param {number} endTime - End time in seconds
     */
    function playSegment(startTime, endTime) {
        if (!ytPlayer || !isReady) return;

        seekTo(startTime);
        play();

        // Set up a watcher to pause at endTime
        const segmentWatcher = setInterval(() => {
            const currentTime = getCurrentTime();
            if (currentTime >= endTime) {
                pause();
                clearInterval(segmentWatcher);
            }
        }, 100);
    }

    /**
     * Set callback handlers
     */
    function onTimeUpdate(cb) { onTimeUpdateCallback = cb; }
    function onReady(cb) { onReadyCallback = cb; }
    function onStateChange(cb) { onStateChangeCallback = cb; }

    /**
     * Clean up resources
     */
    function destroy() {
        if (timeUpdateInterval) clearInterval(timeUpdateInterval);
        if (ytPlayer && typeof ytPlayer.destroy === 'function') {
            ytPlayer.destroy();
        }
        ytPlayer = null;
        isReady = false;
    }

    // Public API
    return {
        init,
        play,
        pause,
        seekTo,
        getCurrentTime,
        getDuration,
        getState,
        playSegment,
        onTimeUpdate,
        onReady,
        onStateChange,
        destroy
    };

})();
