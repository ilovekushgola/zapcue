// Main-World Bridge Script for YouTube Metadata & Transcript Extractor
// Runs in YouTube's MAIN world context to access internal JavaScript variables and APIs.

(function () {
  function getCurrentVideoId(): string {
    try {
      const url = new URL(window.location.href);
      if (url.pathname.startsWith('/shorts/')) {
        const parts = url.pathname.split('/');
        return parts[2] || '';
      }
      return url.searchParams.get('v') || '';
    } catch {
      return '';
    }
  }

  function getPlayerResponse(targetVideoId: string): any {
    try {
      // 1. Check movie_player live player API (Most accurate on SPA navigation)
      const moviePlayer = document.getElementById('movie_player') as any;
      if (typeof moviePlayer?.getPlayerResponse === 'function') {
        const resp = moviePlayer.getPlayerResponse();
        if (resp?.videoDetails?.videoId === targetVideoId) {
          return resp;
        }
      }

      // 2. Check ytd-watch-flexy element playerData
      const watchFlexy = document.querySelector('ytd-watch-flexy') as any;
      if (watchFlexy?.playerData?.videoDetails?.videoId === targetVideoId) {
        return watchFlexy.playerData;
      }

      // 3. Check Shorts player data
      const shortsPlayer = document.querySelector('ytd-shorts') as any;
      if (shortsPlayer?.playerData?.videoDetails?.videoId === targetVideoId) {
        return shortsPlayer.playerData;
      }

      // 4. Fallback: window.ytInitialPlayerResponse ONLY if videoId matches
      const initial = (window as any).ytInitialPlayerResponse;
      if (initial?.videoDetails?.videoId === targetVideoId) {
        return initial;
      }

      return null;
    } catch (e) {
      console.warn('[YT Extractor Bridge] Error reading player response:', e);
      return null;
    }
  }

  function dispatchPlayerResponse(requestId = 0) {
    const videoId = getCurrentVideoId();
    if (!videoId) return;

    let attempts = 0;
    const maxAttempts = 12;

    const poll = () => {
      attempts++;
      const playerResponse = getPlayerResponse(videoId);

      if (playerResponse || attempts >= maxAttempts) {
        let innertubeApiKey = '';
        let innertubeContext: any = null;
        try {
          const ytcfg = (window as any).ytcfg;
          if (typeof ytcfg?.get === 'function') {
            innertubeApiKey = ytcfg.get('INNERTUBE_API_KEY') || '';
            innertubeContext = ytcfg.get('INNERTUBE_CONTEXT') || null;
          }
        } catch {}

        window.dispatchEvent(
          new CustomEvent('__YT_EXTRACTOR_RESPONSE__', {
            detail: {
              requestId,
              videoId,
              playerResponse,
              innertubeApiKey,
              innertubeContext,
              timestamp: Date.now()
            }
          })
        );
      } else {
        setTimeout(poll, 75);
      }
    };

    poll();
  }

  // Listen for request from Isolated World content script
  window.addEventListener('__YT_EXTRACTOR_REQUEST__', (e: Event) => {
    const customEvent = e as CustomEvent<{ requestId: number }>;
    dispatchPlayerResponse(customEvent?.detail?.requestId);
  });

  // Listen for YouTube's native SPA navigation finish in main world
  window.addEventListener('yt-navigate-finish', () => {
    dispatchPlayerResponse();
  });

  window.addEventListener('yt-page-data-updated', () => {
    dispatchPlayerResponse();
  });

  // Initial announcement
  dispatchPlayerResponse();
})();
