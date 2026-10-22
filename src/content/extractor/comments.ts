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
 * Extracts comment threads for the current YouTube video with strict cap enforcement,
 * separate reply counting, verified sorting, and deduplication.
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

  const effectiveLimit = Math.max(0, Math.min(isNaN(limit) ? 50 : limit, 500));

  if (effectiveLimit === 0) {
    return {
      available: false,
      status: 'not_requested',
      sortOrder,
      requestedLimit: limit,
      effectiveLimit: 0,
      topLevelCount: 0,
      replyCount: 0,
      extractedCount: 0,
      threads: [],
      reason: 'not_requested'
    };
  }

  const seenIds = new Set<string>();
  const allThreads: CommentItem[] = [];
  let sortWarning: string | undefined;
  let effectiveSort: 'top' | 'newest' = sortOrder;
  let statusReason = 'unknown';

  try {
    // 1. Try Innertube API via YouTube internal endpoint
    if (innertubeApiKey && innertubeContext) {
      const apiResult = await fetchCommentsViaInnertube(
        videoId,
        effectiveLimit,
        sortOrder,
        includeReplies,
        innertubeApiKey,
        innertubeContext,
        seenIds
      );

      if (apiResult) {
        effectiveSort = apiResult.effectiveSort;
        sortWarning = apiResult.sortWarning;
        statusReason = apiResult.reason;

        for (const th of apiResult.threads) {
          if (allThreads.length < effectiveLimit && !seenIds.has(th.id)) {
            seenIds.add(th.id);
            allThreads.push(th);
          }
        }
      }
    }

    // 2. Supplement or Fallback with DOM comments if we haven't reached the limit
    if (allThreads.length < effectiveLimit) {
      const domThreads = extractCommentsFromDOM(videoId, effectiveLimit - allThreads.length, includeReplies, seenIds);
      for (const th of domThreads) {
        if (allThreads.length < effectiveLimit && !seenIds.has(th.id)) {
          seenIds.add(th.id);
          allThreads.push(th);
        }
      }
    }

    // Strict Hard-Cap Slicing: Output can NEVER exceed effectiveLimit
    const finalThreads = allThreads.slice(0, effectiveLimit);
    const topLevelCount = finalThreads.length;
    const totalReplies = finalThreads.reduce((sum, th) => sum + (th.replies ? th.replies.length : 0), 0);

    // Determine honest, truthful extraction status
    let finalStatus: CommentData['status'] = 'complete';
    if (topLevelCount === 0) {
      if (statusReason === 'comments_disabled') {
        finalStatus = 'unavailable';
      } else if (statusReason === 'network_error') {
        finalStatus = 'failed';
      } else {
        finalStatus = 'complete';
        statusReason = 'zero_comments';
      }
    } else if (topLevelCount >= effectiveLimit) {
      finalStatus = 'complete';
      statusReason = 'reached_limit';
    } else {
      // Returned fewer than requested limit
      if (statusReason === 'all_available_extracted' || statusReason === 'zero_comments') {
        finalStatus = 'complete';
      } else {
        finalStatus = 'partial';
        if (statusReason === 'unknown') {
          statusReason = 'pagination_interrupted';
        }
      }
    }

    return {
      available: topLevelCount > 0,
      status: finalStatus,
      sortOrder: effectiveSort,
      requestedLimit: limit,
      effectiveLimit,
      topLevelCount,
      replyCount: totalReplies,
      extractedCount: topLevelCount,
      threads: finalThreads,
      reason: statusReason,
      warning: sortWarning
    };
  } catch (err: any) {
    console.warn('[YT Extractor] Comments extraction error:', err);
    return {
      available: allThreads.length > 0,
      status: allThreads.length > 0 ? 'partial' : 'failed',
      sortOrder: effectiveSort,
      requestedLimit: limit,
      effectiveLimit,
      topLevelCount: allThreads.length,
      replyCount: allThreads.reduce((sum, th) => sum + (th.replies ? th.replies.length : 0), 0),
      extractedCount: allThreads.length,
      threads: allThreads.slice(0, effectiveLimit),
      error: err?.message || 'Failed to extract comments.',
      reason: 'network_error',
      warning: sortWarning
    };
  }
}

/**
 * Queries YouTube's internal /youtubei/v1/next endpoint with pagination and sort verification.
 */
async function fetchCommentsViaInnertube(
  videoId: string,
  effectiveLimit: number,
  requestedSort: 'top' | 'newest',
  includeReplies: boolean,
  apiKey: string,
  context: any,
  seenIds: Set<string>
): Promise<{
  threads: CommentItem[];
  effectiveSort: 'top' | 'newest';
  sortWarning?: string;
  reason: string;
} | null> {
  try {
    const initialUrl = `https://www.youtube.com/youtubei/v1/next?key=${apiKey}`;
    const initialRes = await fetch(initialUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ context, videoId }),
      credentials: 'include'
    });

    if (!initialRes.ok) {
      return { threads: [], effectiveSort: requestedSort, reason: 'network_error' };
    }

    const initialData = await initialRes.json();

    // Check if comments are disabled
    if (isCommentsDisabled(initialData)) {
      return { threads: [], effectiveSort: requestedSort, reason: 'comments_disabled' };
    }

    // Locate initial comments continuation token
    let token = findCommentsContinuationToken(initialData);
    if (!token) {
      return { threads: [], effectiveSort: requestedSort, reason: 'zero_comments' };
    }

    const threads: CommentItem[] = [];
    let currentToken: string | null = token;
    let effectiveSort: 'top' | 'newest' = 'top';
    let sortWarning: string | undefined;
    let isFirstBatch = true;
    let allAvailableExtracted = false;

    while (currentToken && threads.length < effectiveLimit) {
      const contRes = await fetch(initialUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context, continuation: currentToken }),
        credentials: 'include'
      });

      if (!contRes.ok) break;
      const contData = await contRes.json();

      // On first batch, inspect the sort menu if user requested newest comments
      if (isFirstBatch) {
        isFirstBatch = false;
        const sortInfo = findSortMenuTokens(contData);
        if (requestedSort === 'newest') {
          if (sortInfo.newestToken) {
            effectiveSort = 'newest';
            if (sortInfo.newestToken !== currentToken) {
              currentToken = sortInfo.newestToken;
              continue; // Re-fetch with verified newest token
            }
          } else {
            effectiveSort = 'top';
            sortWarning = 'Requested newest sort is not supported for this video; defaulted to top comments.';
          }
        } else {
          effectiveSort = 'top';
        }
      }

      const { newThreads, nextContinuation } = parseCommentSectionData(contData, videoId, includeReplies);

      for (const th of newThreads) {
        if (!seenIds.has(th.id) && threads.length < effectiveLimit) {
          seenIds.add(th.id);
          threads.push(th);
        }
      }

      if (!nextContinuation) {
        allAvailableExtracted = true;
        break;
      }

      currentToken = nextContinuation;
    }

    return {
      threads: threads.slice(0, effectiveLimit),
      effectiveSort,
      sortWarning,
      reason: threads.length >= effectiveLimit ? 'reached_limit' : (allAvailableExtracted ? 'all_available_extracted' : 'pagination_interrupted')
    };
  } catch (e) {
    console.warn('[YT Extractor] Innertube fetch failed:', e);
    return null;
  }
}

/**
 * Checks if comments are explicitly disabled on the video.
 */
function isCommentsDisabled(data: any): boolean {
  try {
    const panels = data?.engagementPanels || [];
    for (const p of panels) {
      const target = p?.engagementPanelSectionListRenderer?.targetId;
      if (target === 'engagement-panel-comments-disabled') {
        return true;
      }
    }

    const jsonStr = JSON.stringify(data);
    if (jsonStr.includes('Comments are turned off') || jsonStr.includes('comments-disabled')) {
      return true;
    }
  } catch {}
  return false;
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
 * Inspects sortFilterSubMenuRenderer to extract and verify Top vs Newest continuation tokens.
 */
export function findSortMenuTokens(data: any): { topToken?: string; newestToken?: string } {
  const result: { topToken?: string; newestToken?: string } = {};
  try {
    const findSubMenu = (obj: any): any => {
      if (!obj || typeof obj !== 'object') return null;
      if (obj.sortFilterSubMenuRenderer) return obj.sortFilterSubMenuRenderer;
      for (const k of Object.keys(obj)) {
        if (typeof obj[k] === 'object') {
          const res = findSubMenu(obj[k]);
          if (res) return res;
        }
      }
      return null;
    };

    const subMenu = findSubMenu(data);
    if (subMenu?.subMenuItems && Array.isArray(subMenu.subMenuItems)) {
      for (const item of subMenu.subMenuItems) {
        const title = (item.title || '').toLowerCase();
        const token = item.serviceEndpoint?.continuationEndpoint?.continuationCommand?.token;
        if (token) {
          if (title.includes('newest') || title.includes('new')) {
            result.newestToken = token;
          } else if (title.includes('top') || title.includes('popular')) {
            result.topToken = token;
          }
        }
      }
    }
  } catch {}
  return result;
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
    const endpoints = data?.onResponseReceivedEndpoints || [];
    for (const ep of endpoints) {
      const actionItems = ep?.appendContinuationItemsAction?.continuationItems ||
                          ep?.reloadContinuationItemsCommand?.continuationItems || [];

      for (const item of actionItems) {
        // Next continuation token
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
                const replyObj = parseCommentRenderer(r?.commentRenderer, videoId, topComment.id);
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
export function parseCommentRenderer(renderer: any, videoId: string, parentCommentId?: string): CommentItem | null {
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
    parentCommentId,
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
 * Fallback: Extracts comments from YouTube DOM elements with hard cap and deduplication.
 */
export function extractCommentsFromDOM(
  videoId: string,
  limit: number,
  includeReplies: boolean,
  seenIds: Set<string>
): CommentItem[] {
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
      const commentId = el.getAttribute('id') || `dom-comment-${i}`;

      if (text && !seenIds.has(commentId)) {
        seenIds.add(commentId);
        const item: CommentItem = {
          id: commentId,
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
                  id: `${commentId}-reply-${j}`,
                  videoId,
                  parentCommentId: commentId,
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

  return threads.slice(0, limit);
}
