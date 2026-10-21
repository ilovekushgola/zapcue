// Content Script Entry Point (Isolated World)
// Coordinates SPA Navigation, Bridge Communication, Extraction Engines, and UI

import { ExtractorResult } from '../types';
import { memoryCache } from './extractor/cache';
import { extractMetadata } from './extractor/metadata';
import { extractTranscript } from './extractor/transcript';
import { ExtractorPanel } from './ui/panel';
import { ensureHostPosition } from './ui/shadow-host';

let currentRequestId = 0;
let lastVideoId: string | null = null;
let panel: ExtractorPanel | null = null;
let userAutoExtract = true;
let userPreferredLang = 'en';

/**
 * Extracts video ID from current window location.
 */
function getCurrentVideoId(): string | null {
  try {
    const url = new URL(window.location.href);

    // Shorts: /shorts/VIDEO_ID
    if (url.pathname.startsWith('/shorts/')) {
      const parts = url.pathname.split('/');
      const shortId = parts[2];
      return shortId && shortId.length >= 8 ? shortId : null;
    }

    // Watch: /watch?v=VIDEO_ID
    return url.searchParams.get('v');
  } catch {
    return null;
  }
}

/**
 * Executes full extraction pipeline for the given video ID.
 */
async function runExtractionPipeline(videoId: string, requestId: number): Promise<void> {
  if (!panel) return;

  // 1. Check in-memory cache (<5ms)
  const cached = memoryCache.get(videoId, userPreferredLang);
  if (cached) {
    if (requestId === currentRequestId) {
      panel.setResult(cached);
    }
    return;
  }

  // Clear previous video data and show loading state
  panel.setResult(null);
  panel.setLoading(true);

  // 2. Request player data from Main World Bridge
  window.dispatchEvent(
    new CustomEvent('__YT_EXTRACTOR_REQUEST__', {
      detail: { requestId }
    })
  );
}

/**
 * Handles incoming player response dispatched by the Main World bridge.
 */
async function handleBridgeResponse(detail: any): Promise<void> {
  const { requestId, videoId, playerResponse } = detail;

  // Guard against race conditions: Ignore responses from past requests
  if (requestId !== 0 && requestId !== currentRequestId) {
    return;
  }

  const currentId = getCurrentVideoId();
  if (!currentId || videoId !== currentId) {
    return;
  }

  if (!panel) return;

  try {
    // Fast path: Extract metadata (<20ms)
    const metadata = extractMetadata(playerResponse, videoId);

    // Parallel path: Extract transcript (~200ms) with multi-stage fallback
    const transcript = await extractTranscript(playerResponse, userPreferredLang);

    if (currentRequestId !== requestId && requestId !== 0) {
      return;
    }

    const result: ExtractorResult = {
      videoId,
      metadata,
      transcript,
      extractedAt: new Date().toISOString()
    };

    // Store in cache for 0ms subsequent visits
    memoryCache.set(videoId, result, userPreferredLang);

    // Update UI
    panel.setResult(result);
  } catch (err) {
    console.error('[YT Extractor] Extraction pipeline error:', err);
    panel.setResult(null);
  }
}

/**
 * Handles video navigation events (initial load or SPA transition).
 */
function handleNavigation(): void {
  const videoId = getCurrentVideoId();

  if (!videoId) {
    lastVideoId = null;
    return;
  }

  // Prevent duplicate execution for same video
  if (videoId === lastVideoId) {
    return;
  }

  lastVideoId = videoId;
  const requestId = ++currentRequestId;

  ensureHostPosition();

  if (!panel) {
    initPanel();
  } else {
    panel.render();
  }

  if (userAutoExtract) {
    runExtractionPipeline(videoId, requestId);
  } else {
    panel?.setResult(null);
  }
}

/**
 * Initializes the floating UI panel and sets up event listeners.
 */
function initPanel(): void {
  panel = new ExtractorPanel({
    onManualExtract: () => {
      const vid = getCurrentVideoId();
      if (vid) {
        runExtractionPipeline(vid, ++currentRequestId);
      }
    },
    onAutoExtractToggle: (enabled) => {
      userAutoExtract = enabled;
      chrome?.storage?.local?.set({ autoExtract: enabled });
    }
  });

  panel.setAutoExtract(userAutoExtract);
  panel.render();
}

/**
 * Loads user settings from chrome.storage.local.
 */
function loadSettings(): Promise<void> {
  return new Promise((resolve) => {
    if (chrome?.storage?.local) {
      chrome.storage.local.get(['autoExtract', 'preferredLanguage'], (res) => {
        if (res.autoExtract !== undefined) {
          userAutoExtract = Boolean(res.autoExtract);
        }
        if (res.preferredLanguage) {
          userPreferredLang = res.preferredLanguage;
        }
        resolve();
      });

      // Listen for popup settings changes
      chrome.storage.onChanged.addListener((changes) => {
        if (changes.autoExtract) {
          userAutoExtract = changes.autoExtract.newValue;
          panel?.setAutoExtract(userAutoExtract);
        }
        if (changes.preferredLanguage) {
          userPreferredLang = changes.preferredLanguage.newValue;
          const vid = getCurrentVideoId();
          if (vid && userAutoExtract) {
            runExtractionPipeline(vid, ++currentRequestId);
          }
        }
      });
    } else {
      resolve();
    }
  });
}

// Main Initialization Routine
(async function init() {
  await loadSettings();

  // Listen to Bridge responses
  window.addEventListener('__YT_EXTRACTOR_RESPONSE__', (e: Event) => {
    const customEvent = e as CustomEvent;
    if (customEvent?.detail) {
      handleBridgeResponse(customEvent.detail);
    }
  });

  // Listen to YouTube's native SPA navigation events
  window.addEventListener('yt-navigate-finish', handleNavigation);
  window.addEventListener('yt-page-data-updated', handleNavigation);
  window.addEventListener('spfdone', handleNavigation);
  window.addEventListener('popstate', handleNavigation);

  // High-reliability URL change watcher (polls every 250ms as safety fallback for SPA)
  let lastObservedUrl = location.href;
  setInterval(() => {
    if (location.href !== lastObservedUrl) {
      lastObservedUrl = location.href;
      handleNavigation();
    }
  }, 250);

  // Initial check on page load
  handleNavigation();
})();
