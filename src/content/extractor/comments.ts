import { CommentData, CommentItem } from '../../types';

export interface CommentExtractionOptions {
  videoId: string;
  limit?: number;
  sortOrder?: 'top' | 'newest';
  includeReplies?: boolean;
  innertubeApiKey?: string;
  innertubeContext?: any;
}

/**
 * Extracts comment threads for the current YouTube video asynchronously.
 */
export async function extractComments(options: CommentExtractionOptions): Promise<CommentData> {
  const {
    videoId,
    limit = 50,
    sortOrder = 'top',
    includeReplies = false,
    innertubeApiKey,
    innertubeContext
  } = options;

  if (limit <= 0) {
    return {
      available: false,
      status: 'not_requested',
      sortOrder,
      requestedLimit: limit,
      extractedCount: 0,
      threads: []
    };
  }

  try {
    // 1. Try Innertube API via YouTube internal endpoint
    if (innertubeApiKey && innertubeContext) {
      const apiResult = await fetchCommentsViaInnertube(
        videoId,
        limit,
        sortOrder,
        includeReplies,
        innertubeApiKey,
        innertubeContext
      );
      if (apiResult && apiResult.threads.length > 0) {
        return apiResult;
      }
    }

    // 2. Fallback: Parse visible comment threads from YouTube DOM
    const domResult = extractCommentsFromDOM(videoId, limit, includeReplies);
    if (domResult.threads.length > 0) {
      return {
        available: true,
        status: domResult.threads.length >= limit ? 'complete' : 'partial',
        sortOrder,
        requestedLimit: limit,
        extractedCount: domResult.threads.length,
        threads: domResult.threads
      };
    }
  } catch (err: any) {
    console.warn('[YT Extractor] Comments extraction error:', err);
    return {
      available: false,
      status: 'failed',
      sortOrder,
      requestedLimit: limit,
      extractedCount: 0,
      threads: [],
      error: err?.message || 'Failed to extract comments.'
    };
  }

  return {
    available: false,
    status: 'unavailable',
    sortOrder,
    requestedLimit: limit,
    extractedCount: 0,
    threads: []
  };
}

/**
 * Queries YouTube's internal /youtubei/v1/next endpoint to fetch comment threads.
 */
async function fetchCommentsViaInnertube(
  videoId: string,
  limit: number,
  sortOrder: 'top' | 'newest',
  includeReplies: boolean,
  apiKey: string,
  context: any
): Promise<CommentData | null> {
  try {
    // Step 1: Initial next query to obtain comments continuation token
    const initialUrl = `https://www.youtube.com/youtubei/v1/next?key=${apiKey}`;
    const initialRes = await fetch(initialUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ context, videoId }),
      credentials: 'include'
    });

    if (!initialRes.ok) return null;
    const initialData = await initialRes.json();

    // Locate comments continuation token in engagement panels or itemSectionRenderers
    let token = findCommentsContinuationToken(initialData);
    if (!token) return null;

    // Step 2: Fetch comment threads
    const threads: CommentItem[] = [];
    let currentToken: string | null = token;

    while (currentToken && threads.length < limit) {
      const contRes = await fetch(initialUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context, continuation: currentToken }),
        credentials: 'include'
      });

      if (!contRes.ok) break;
      const contData = await contRes.json();

      // If sortOrder === 'newest', check if we need to switch continuation token from the sort menu
      if (sortOrder === 'newest' && threads.length === 0) {
        const newestToken = findNewestSortToken(contData);
        if (newestToken && newestToken !== currentToken) {
          currentToken = newestToken;
          continue;
        }
      }

      const { newThreads, nextContinuation } = parseCommentSectionData(contData, videoId, includeReplies);
      for (const th of newThreads) {
        threads.push(th);
        if (threads.length >= limit) break;
      }

      currentToken = nextContinuation;
    }

    return {
      available: threads.length > 0,
      status: threads.length >= limit ? 'complete' : (threads.length > 0 ? 'partial' : 'unavailable'),
      sortOrder,
      requestedLimit: limit,
      extractedCount: threads.length,
      threads
    };
  } catch (e) {
    console.warn('[YT Extractor] Innertube comments query failed:', e);
    return null;
  }
}

/**
 * Searches YouTube response object for the comments continuation token.
 */
function findCommentsContinuationToken(data: any): string | null {
  try {
    const panels = data?.engagementPanels || [];
    for (const p of panels) {
      const contents = p?.engagementPanelSectionListRenderer?.content?.sectionListRenderer?.contents;
      if (Array.isArray(contents)) {
        for (const c of contents) {
          const token = c?.itemSectionRenderer?.continuations?.[0]?.nextContinuationData?.continuation;
          if (token) return token;
        }
      }
    }

    const sections = data?.contents?.twoColumnWatchNextResults?.results?.results?.contents || [];
    for (const s of sections) {
      const itemSection = s?.itemSectionRenderer;
      if (itemSection?.targetId === 'comments-section') {
        const token = itemSection?.continuations?.[0]?.nextContinuationData?.continuation;
        if (token) return token;
      }
    }
  } catch {}
  return null;
}

/**
 * Finds continuation token for 'Newest first' comments sort.
 */
function findNewestSortToken(data: any): string | null {
  try {
    const endpoints = JSON.stringify(data).match(/"continuation":"([^"]+)"/g) || [];
    // If multiple continuations exist, the second continuation usually points to newest comments
    if (endpoints.length > 1) {
      const match = endpoints[1].match(/"continuation":"([^"]+)"/);
      if (match) return match[1];
    }
  } catch {}
  return null;
}

/**
 * Parses raw JSON returned by comments continuation into structured CommentItem objects.
 */
export function parseCommentSectionData(data: any, videoId: string, includeReplies: boolean): {
  newThreads: CommentItem[];
  nextContinuation: string | null;
} {
  const newThreads: CommentItem[] = [];
  let nextContinuation: string | null = null;

  try {
    // Actions or Framework updates or sectionList
    const endpoints = data?.onResponseReceivedEndpoints || [];
    for (const ep of endpoints) {
      const actionItems = ep?.appendContinuationItemsAction?.continuationItems ||
                          ep?.reloadContinuationItemsCommand?.continuationItems || [];

      for (const item of actionItems) {
        // Next continuation
        if (item?.continuationItemRenderer) {
          nextContinuation = item.continuationItemRenderer.continuationEndpoint?.continuationCommand?.token || null;
          continue;
        }

        // Thread renderer
        const thread = item?.commentThreadRenderer;
        if (thread) {
          const topComment = parseCommentRenderer(thread.comment?.commentRenderer, videoId);
          if (topComment) {
            if (includeReplies && thread.replies?.commentRepliesRenderer?.contents) {
              topComment.replies = [];
              for (const r of thread.replies.commentRepliesRenderer.contents) {
                const replyObj = parseCommentRenderer(r?.commentRenderer, videoId);
                if (replyObj) topComment.replies.push(replyObj);
              }
            }
            newThreads.push(topComment);
          }
        }
      }
    }
  } catch (e) {
    console.warn('[YT Extractor] Error parsing comment section data:', e);
  }

  return { newThreads, nextContinuation };
}

/**
 * Extracts CommentItem from an individual commentRenderer object.
 */
export function parseCommentRenderer(renderer: any, videoId: string): CommentItem | null {
  if (!renderer) return null;

  const id = renderer.commentId || '';
  const text = renderer.contentText?.runs?.map((r: any) => r.text).join('') ||
               renderer.contentText?.simpleText || '';

  const authorName = renderer.authorText?.simpleText ||
                     renderer.authorText?.runs?.map((r: any) => r.text).join('') || 'Anonymous';

  const authorEndpoint = renderer.authorEndpoint?.commandMetadata?.webCommandMetadata?.url || '';
  const channelUrl = authorEndpoint ? `https://www.youtube.com${authorEndpoint}` : undefined;
  const avatarUrl = renderer.authorThumbnail?.thumbnails?.[0]?.url || undefined;

  const publishedAt = renderer.publishedTimeText?.runs?.[0]?.text ||
                      renderer.publishedTimeText?.simpleText || undefined;

  const likeCount = renderer.voteCount?.simpleText ||
                    renderer.voteCount?.runs?.[0]?.text || '0';

  const replyCount = renderer.replyCount || 0;
  const isOwner = Boolean(renderer.authorIsChannelOwner);
  const isPinned = Boolean(renderer.pinnedCommentBadge);

  return {
    id,
    videoId,
    text,
    author: {
      displayName: authorName,
      channelUrl,
      avatarUrl
    },
    publishedAt,
    likeCount,
    replyCount,
    isOwner,
    isPinned
  };
}

/**
 * Fallback: Extracts comments from YouTube DOM elements when already rendered on page.
 */
export function extractCommentsFromDOM(videoId: string, limit: number, includeReplies: boolean): {
  threads: CommentItem[];
} {
  const threads: CommentItem[] = [];
  try {
    const commentEls = document.querySelectorAll('ytd-comment-thread-renderer');
    for (let i = 0; i < commentEls.length && threads.length < limit; i++) {
      const el = commentEls[i];
      const authorEl = el.querySelector('#author-text') as HTMLAnchorElement | null;
      const avatarEl = el.querySelector('#author-thumbnail img') as HTMLImageElement | null;
      const contentEl = el.querySelector('#content-text');
      const timeEl = el.querySelector('#published-time-text');
      const likesEl = el.querySelector('#vote-count-middle');

      const authorName = authorEl?.textContent?.trim() || 'Viewer';
      const channelUrl = authorEl?.href || undefined;
      const avatarUrl = avatarEl?.src || undefined;
      const text = contentEl?.textContent?.trim() || '';
      const publishedAt = timeEl?.textContent?.trim() || undefined;
      const likeCount = likesEl?.textContent?.trim() || '0';

      if (text) {
        const item: CommentItem = {
          id: `dom-comment-${i}`,
          videoId,
          text,
          author: {
            displayName: authorName,
            channelUrl,
            avatarUrl
          },
          publishedAt,
          likeCount,
          replyCount: 0
        };

        if (includeReplies) {
          const replyEls = el.querySelectorAll('ytd-comment-replies-renderer ytd-comment-view-model, ytd-comment-replies-renderer ytd-comment-renderer');
          if (replyEls.length > 0) {
            item.replies = [];
            for (let j = 0; j < replyEls.length; j++) {
              const rEl = replyEls[j];
              const rAuthor = rEl.querySelector('#author-text')?.textContent?.trim() || 'Viewer';
              const rText = rEl.querySelector('#content-text')?.textContent?.trim() || '';
              if (rText) {
                item.replies.push({
                  id: `dom-reply-${i}-${j}`,
                  videoId,
                  text: rText,
                  author: { displayName: rAuthor }
                });
              }
            }
          }
        }

        threads.push(item);
      }
    }
  } catch (e) {
    console.warn('[YT Extractor] Error parsing DOM comments:', e);
  }

  return { threads };
}
