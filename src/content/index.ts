// Content Script Entry Point (Isolated World)
// Coordinates SPA Navigation, Bridge Communication, Extraction Engines, and UI

import { ExtractorResult, ZapcueSettings } from '../types';
import { DEFAULT_SETTINGS, getSettings, saveSettings } from '../utils/settings';
import { memoryCache } from './extractor/cache';
import { extractChapters } from './extractor/chapters';
import { extractComments } from './extractor/comments';
import { extractMetadata } from './extractor/metadata';
import { extractTranscript } from './extractor/transcript';
import { ExtractorPanel } from './ui/panel';
import { ensureHostPosition } from './ui/shadow-host';

let currentRequestId = 0;
let lastVideoId: string | null = null;
let panel: ExtractorPanel | null = null;
let activeSettings: ZapcueSettings = { ...DEFAULT_SETTINGS };
let lastInnertubeApiKey = '';
let lastInnertubeContext: any = null;
let lastCommentsToken: string | null = null;

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
  const cached = memoryCache.get(videoId, activeSettings.preferredLanguage);
  if (cached) {
    if (requestId === currentRequestId) {
      let needsCommentExtraction = false;

      if (activeSettings.autoExtractComments) {
        if (!cached.comments || cached.comments.status === 'not_requested') {
          needsCommentExtraction = true;
        } else if (cached.comments.sortOrder !== activeSettings.commentSortOrder) {
          // Sort order changed: re-extract
          needsCommentExtraction = true;
        } else if (activeSettings.commentLimit < cached.comments.threads.length) {
          // User lowered the comment limit: trim cached result to new limit
          const trimmed = cached.comments.threads.slice(0, activeSettings.commentLimit);
          cached.comments = {
            ...cached.comments,
            requestedLimit: activeSettings.commentLimit,
            effectiveLimit: activeSettings.commentLimit,
            topLevelCount: trimmed.length,
            replyCount: trimmed.reduce((sum, th) => sum + (th.replies ? th.replies.length : 0), 0),
            extractedCount: trimmed.length,
            threads: trimmed,
            status: 'complete',
            reason: 'reached_limit'
          };
        } else if (activeSettings.commentLimit > cached.comments.threads.length && cached.comments.status !== 'complete') {
          // User increased the limit and previous extraction didn't finish: schedule additional extraction
          needsCommentExtraction = true;
        }
      }

      panel.setResult(cached);

      if (needsCommentExtraction) {
        panel.setComments({
          available: false,
          status: 'loading',
          sortOrder: activeSettings.commentSortOrder,
          requestedLimit: activeSettings.commentLimit,
          effectiveLimit: activeSettings.commentLimit,
          topLevelCount: 0,
          replyCount: 0,
          extractedCount: 0,
          threads: []
        });

        extractComments({
          videoId,
          limit: activeSettings.commentLimit,
          sortOrder: activeSettings.commentSortOrder,
          includeReplies: activeSettings.includeCommentReplies,
          innertubeApiKey: lastInnertubeApiKey,
          innertubeContext: lastInnertubeContext,
          initialCommentsToken: lastCommentsToken
        }).then((comments) => {
          if (currentRequestId === requestId || requestId === 0) {
            cached.comments = comments;
            memoryCache.set(videoId, cached, activeSettings.preferredLanguage);
            panel?.setComments(comments);
          }
        }).catch((err) => {
          console.warn('[YT Extractor] Background comment extraction failed:', err);
        });
      }
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
  const { requestId, videoId, playerResponse, innertubeApiKey, innertubeContext, commentsToken } = detail;

  if (innertubeApiKey) lastInnertubeApiKey = innertubeApiKey;
  if (innertubeContext) lastInnertubeContext = innertubeContext;
  if (commentsToken) lastCommentsToken = commentsToken;

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
    // Fast path 1: Extract metadata (<20ms)
    const metadata = extractMetadata(playerResponse, videoId);

    // Fast path 2: Extract chapters (<5ms)
    const chapters = extractChapters(playerResponse, metadata.description, metadata.durationSeconds);

    // Parallel path 3: Extract transcript (~180ms) with multi-stage fallback
    const transcript = await extractTranscript(playerResponse, activeSettings.preferredLanguage);

    if (currentRequestId !== requestId && requestId !== 0) {
      return;
    }

    const result: ExtractorResult = {
      videoId,
      metadata,
      chapters,
      transcript,
      extractedAt: new Date().toISOString()
    };

    // Store base result in cache
    memoryCache.set(videoId, result, activeSettings.preferredLanguage);

    // Render immediately (metadata + chapters + transcript ready in <200ms)
    panel.setResult(result);

    // Non-blocking Asynchronous Path 4: Current-video Comments Extraction
    if (activeSettings.autoExtractComments) {
      panel.setComments({
        available: false,
        status: 'loading',
        sortOrder: activeSettings.commentSortOrder,
        requestedLimit: activeSettings.commentLimit,
        effectiveLimit: activeSettings.commentLimit,
        topLevelCount: 0,
        replyCount: 0,
        extractedCount: 0,
        threads: []
      });

      extractComments({
        videoId,
        limit: activeSettings.commentLimit,
        sortOrder: activeSettings.commentSortOrder,
        includeReplies: activeSettings.includeCommentReplies,
        innertubeApiKey: lastInnertubeApiKey,
        innertubeContext: lastInnertubeContext,
        initialCommentsToken: lastCommentsToken
      }).then((comments) => {
        if (currentRequestId === requestId || requestId === 0) {
          result.comments = comments;
          memoryCache.set(videoId, result, activeSettings.preferredLanguage);
          panel?.setComments(comments);
        }
      }).catch((err) => {
        console.warn('[YT Extractor] Background comment extraction failed:', err);
      });
    }
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

  if (activeSettings.autoExtract) {
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
      activeSettings.autoExtract = enabled;
      saveSettings({ autoExtract: enabled });
    },
    onCommentSortChange: async (newSort) => {
      activeSettings.commentSortOrder = newSort;
      saveSettings({ commentSortOrder: newSort });
      const vid = getCurrentVideoId();
      if (vid) {
        panel?.setComments({
          available: false,
          status: 'loading',
          sortOrder: newSort,
          requestedLimit: activeSettings.commentLimit,
          effectiveLimit: activeSettings.commentLimit,
          topLevelCount: 0,
          replyCount: 0,
          extractedCount: 0,
          threads: []
        });
        const comments = await extractComments({
          videoId: vid,
          limit: activeSettings.commentLimit,
          sortOrder: newSort,
          includeReplies: activeSettings.includeCommentReplies,
          innertubeApiKey: lastInnertubeApiKey,
          innertubeContext: lastInnertubeContext,
          initialCommentsToken: lastCommentsToken
        });
        panel?.setComments(comments);
      }
    }
  });

  panel.setSettings(activeSettings);
  panel.render();
}

/**
 * Loads user settings from chrome.storage.local with migration.
 */
async function loadSettings(): Promise<void> {
  activeSettings = await getSettings();
  panel?.setSettings(activeSettings);

  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener(async () => {
      const prevLimit = activeSettings.commentLimit;
      const prevSort = activeSettings.commentSortOrder;
      const prevReplies = activeSettings.includeCommentReplies;

      activeSettings = await getSettings();
      panel?.setSettings(activeSettings);

      // If user changed comment settings while viewing a video, automatically refresh comments
      if (panel && (prevLimit !== activeSettings.commentLimit || prevSort !== activeSettings.commentSortOrder || prevReplies !== activeSettings.includeCommentReplies)) {
        const vid = getCurrentVideoId();
        if (vid && activeSettings.autoExtractComments) {
          panel.setComments({
            available: false,
            status: 'loading',
            sortOrder: activeSettings.commentSortOrder,
            requestedLimit: activeSettings.commentLimit,
            effectiveLimit: activeSettings.commentLimit,
            topLevelCount: 0,
            replyCount: 0,
            extractedCount: 0,
            threads: []
          });

          const comments = await extractComments({
            videoId: vid,
            limit: activeSettings.commentLimit,
            sortOrder: activeSettings.commentSortOrder,
            includeReplies: activeSettings.includeCommentReplies,
            innertubeApiKey: lastInnertubeApiKey,
            innertubeContext: lastInnertubeContext,
            initialCommentsToken: lastCommentsToken
          });

          panel.setComments(comments);
        }
      }
    });
  }
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
