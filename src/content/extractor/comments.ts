import { CommentData, CommentItem } from '../../types';

export interface CommentExtractionOptions {
  videoId: string;
  limit?: number;
  sortOrder?: 'top' | 'newest';
  includeReplies?: boolean;
  innertubeApiKey?: string;
  innertubeContext?: any;
  initialCommentsToken?: string | null;
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
    innertubeContext,
    initialCommentsToken
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
        seenIds,
        initialCommentsToken
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
 * Queries YouTube's internal /youtubei/v1/next endpoint with pagination, sort verification,
 * and support for both modern ViewModel + entity mutations and legacy renderers.
 */
async function fetchCommentsViaInnertube(
  videoId: string,
  effectiveLimit: number,
  requestedSort: 'top' | 'newest',
  includeReplies: boolean,
  apiKey: string,
  context: any,
  seenIds: Set<string>,
  initialCommentsToken?: string | null
): Promise<{
  threads: CommentItem[];
  effectiveSort: 'top' | 'newest';
  sortWarning?: string;
  reason: string;
} | null> {
  try {
    const nextUrl = `https://www.youtube.com/youtubei/v1/next?key=${apiKey}`;
    let token: string | null = initialCommentsToken || null;

    // If no initial continuation token was provided by bridge, query /next to obtain it
    if (!token) {
      const initialRes = await fetch(nextUrl, {
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

      token = findCommentsContinuationToken(initialData);
      if (!token) {
        return { threads: [], effectiveSort: requestedSort, reason: 'zero_comments' };
      }
    }

    const threads: CommentItem[] = [];
    let currentToken: string | null = token;
    let effectiveSort: 'top' | 'newest' = 'top';
    let sortWarning: string | undefined;
    let isFirstBatch = true;
    let allAvailableExtracted = false;

    while (currentToken && threads.length < effectiveLimit) {
      const contRes = await fetch(nextUrl, {
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

      const { newThreads, nextContinuation, replyTokens } = parseCommentSectionData(contData, videoId, includeReplies);

      // If user enabled replies and we received reply tokens, fetch them asynchronously in parallel
      if (includeReplies && replyTokens.length > 0) {
        const replyPromises = replyTokens.map(async (rt) => {
          const replies = await fetchRepliesViaInnertube(rt.token, videoId, rt.parentCommentId, apiKey, context);
          const parent = newThreads.find((t) => t.id === rt.parentCommentId);
          if (parent) {
            if (!parent.replies) parent.replies = [];
            parent.replies.push(...replies);
            parent.replyCount = parent.replies.length;
          }
        });
        await Promise.allSettled(replyPromises);
      }

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
 * Fetches nested replies for a parent comment using its reply continuation token.
 */
async function fetchRepliesViaInnertube(
  replyToken: string,
  videoId: string,
  parentCommentId: string,
  apiKey: string,
  context: any
): Promise<CommentItem[]> {
  try {
    const nextUrl = `https://www.youtube.com/youtubei/v1/next?key=${apiKey}`;
    const res = await fetch(nextUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ context, continuation: replyToken }),
      credentials: 'include'
    });
    if (!res.ok) return [];

    const data = await res.json();
    const entityMap = buildEntityMap(data);
    const replies: CommentItem[] = [];

    const endpoints = data?.onResponseReceivedEndpoints || [];
    for (const ep of endpoints) {
      const actionItems = ep?.appendContinuationItemsAction?.continuationItems ||
                          ep?.reloadContinuationItemsCommand?.continuationItems || [];

      for (const item of actionItems) {
        let replyObj: CommentItem | null = null;
        if (item?.commentViewModel) {
          replyObj = parseCommentViewModel(item.commentViewModel, entityMap, videoId, parentCommentId);
        } else if (item?.commentRenderer) {
          replyObj = parseCommentRenderer(item.commentRenderer, videoId, parentCommentId);
        }

        if (replyObj) {
          replies.push(replyObj);
        }
      }
    }

    return replies;
  } catch {
    return [];
  }
}

/**
 * Checks if comments are explicitly disabled on the video.
 */
function isCommentsDisabled(data: any): boolean {
  try {
    const panels = data?.engagementPanels || [];
    for (const p of panels) {
      const target = p?.engagementPanelSectionListRenderer?.targetId || p?.targetId;
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
 * Searches YouTube response object for the comments continuation token across both modern
 * SDUI / engagement panels and legacy itemSectionRenderer structures.
 */
export function findCommentsContinuationToken(data: any): string | null {
  if (!data || typeof data !== 'object') return null;

  try {
    // 1. TwoColumnWatchNextResults -> itemSectionRenderer (Primary web layout)
    const sections = data?.contents?.twoColumnWatchNextResults?.results?.results?.contents;
    if (Array.isArray(sections)) {
      for (const s of sections) {
        const itemSection = s?.itemSectionRenderer;
        const targetId = itemSection?.targetId || itemSection?.sectionIdentifier;
        if (targetId === 'comments-section' || targetId === 'comment-item-section') {
          // Modern continuationItemRenderer in contents
          if (Array.isArray(itemSection.contents)) {
            for (const c of itemSection.contents) {
              const token = c?.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token;
              if (token) return token;
            }
          }
          // Legacy continuation
          const legacy = itemSection?.continuations?.[0]?.nextContinuationData?.continuation;
          if (legacy) return legacy;
        }
      }
    }

    // 2. Engagement panels (Mobile / Shorts / Modern Desktop layout)
    const panels = data?.engagementPanels;
    if (Array.isArray(panels)) {
      for (const p of panels) {
        const target = p?.engagementPanelSectionListRenderer?.targetId || p?.targetId || '';
        if (typeof target === 'string' && target.toLowerCase().includes('comment')) {
          const contents = p?.engagementPanelSectionListRenderer?.content?.sectionListRenderer?.contents;
          if (Array.isArray(contents)) {
            for (const c of contents) {
              const innerContents = c?.itemSectionRenderer?.contents;
              if (Array.isArray(innerContents)) {
                for (const ic of innerContents) {
                  const token = ic?.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token;
                  if (token) return token;
                }
              }
              const directToken = c?.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token;
              if (directToken) return directToken;
              const legacy = c?.itemSectionRenderer?.continuations?.[0]?.nextContinuationData?.continuation;
              if (legacy) return legacy;
            }
          }
        }
      }
    }

    // 3. Resilient breadth-first search for continuationCommand token within comment-related nodes
    const queue: any[] = [data];
    let inspected = 0;
    while (queue.length > 0 && inspected < 600) {
      inspected++;
      const curr = queue.shift();
      if (!curr || typeof curr !== 'object') continue;

      if (curr.continuationCommand?.token && typeof curr.continuationCommand.token === 'string') {
        return curr.continuationCommand.token;
      }

      for (const k of Object.keys(curr)) {
        if (typeof curr[k] === 'object' && curr[k] !== null) {
          queue.push(curr[k]);
        }
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
 * Builds an entity dictionary from modern YouTube frameworkUpdates.entityBatchUpdate.mutations.
 */
export function buildEntityMap(data: any): Map<string, any> {
  const map = new Map<string, any>();
  try {
    const mutations = data?.frameworkUpdates?.entityBatchUpdate?.mutations;
    if (Array.isArray(mutations)) {
      for (const m of mutations) {
        if (m.entityKey && m.payload?.commentEntityPayload) {
          map.set(m.entityKey, m.payload.commentEntityPayload);
          const cid = m.payload.commentEntityPayload.properties?.commentId;
          if (cid) {
            map.set(cid, m.payload.commentEntityPayload);
          }
        }
      }
    }
  } catch {}
  return map;
}

/**
 * Parses modern YouTube commentViewModel by cross-referencing with entityBatchUpdate mutations.
 */
export function parseCommentViewModel(
  vm: any,
  entityMap: Map<string, any>,
  videoId: string,
  parentCommentId?: string
): CommentItem | null {
  if (!vm) return null;

  const inner = vm.commentViewModel || vm;
  const commentKey = inner.commentKey || inner.commentId || '';

  // 1. Join with entity mutation if present
  const entity = entityMap.get(commentKey) || (inner.commentId ? entityMap.get(inner.commentId) : null);

  if (entity) {
    const props = entity.properties || {};
    const author = entity.author || {};
    const toolbar = entity.toolbar || {};

    const commentId = props.commentId || inner.commentId || commentKey;
    const text = props.content?.content || '';
    const publishedAt = props.publishedTime || undefined;
    const displayName = author.displayName || 'Anonymous';
    const channelUrl = author.channelId ? `https://www.youtube.com/channel/${author.channelId}` : undefined;
    const avatarUrl = author.avatarThumbnailUrl || undefined;
    const likeCount = toolbar.likeCountNotliked || toolbar.likeCountLiked || '0';
    const replyCount = parseInt(toolbar.replyCount || '0', 10) || 0;
    const isOwner = Boolean(author.isCreator);
    const isPinned = Boolean(props.isPinned || inner.pinnedBadge);

    return {
      id: commentId,
      videoId,
      parentCommentId,
      text,
      author: {
        displayName,
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

  // 2. Direct inline ViewModel parsing
  const id = inner.commentId || commentKey;
  const text = inner.contentText?.content ||
               inner.contentText?.runs?.map((r: any) => r.text).join('') ||
               inner.contentText?.simpleText || '';

  const authorName = inner.authorText?.simpleText ||
                     inner.authorText?.runs?.map((r: any) => r.text).join('') ||
                     inner.authorName || 'Anonymous';

  const avatarUrl = inner.authorThumbnail?.thumbnails?.[0]?.url || inner.avatarUrl || undefined;
  const channelUrl = inner.authorEndpoint?.commandMetadata?.webCommandMetadata?.url
    ? `https://www.youtube.com${inner.authorEndpoint.commandMetadata.webCommandMetadata.url}`
    : (inner.channelUrl || undefined);

  const publishedAt = inner.publishedTimeText?.runs?.[0]?.text ||
                      inner.publishedTimeText?.simpleText ||
                      inner.publishedTime || undefined;

  const likeCount = inner.voteCount?.simpleText ||
                    inner.voteCount?.runs?.[0]?.text ||
                    inner.likeCount || '0';

  const replyCount = inner.replyCount || 0;
  const isOwner = Boolean(inner.authorIsChannelOwner || inner.isCreator);
  const isPinned = Boolean(inner.pinnedCommentBadge || inner.isPinned);

  if (text || id) {
    return {
      id: id || `c_${Date.now()}`,
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

  return null;
}

/**
 * Parses raw JSON returned by comments continuation into structured CommentItem objects.
 */
export function parseCommentSectionData(
  data: any,
  videoId: string,
  includeReplies: boolean
): {
  newThreads: CommentItem[];
  nextContinuation: string | null;
  replyTokens: Array<{ parentCommentId: string; token: string }>;
} {
  const newThreads: CommentItem[] = [];
  let nextContinuation: string | null = null;
  const replyTokens: Array<{ parentCommentId: string; token: string }> = [];

  const entityMap = buildEntityMap(data);

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
          let topComment: CommentItem | null = null;
          if (thread.commentViewModel) {
            topComment = parseCommentViewModel(thread.commentViewModel, entityMap, videoId);
          } else if (thread.comment?.commentViewModel) {
            topComment = parseCommentViewModel(thread.comment.commentViewModel, entityMap, videoId);
          } else if (thread.comment?.commentRenderer) {
            topComment = parseCommentRenderer(thread.comment.commentRenderer, videoId);
          }

          if (topComment) {
            if (includeReplies && thread.replies?.commentRepliesRenderer) {
              const replyContents = thread.replies.commentRepliesRenderer.contents || [];
              topComment.replies = [];

              for (const r of replyContents) {
                const rToken = r?.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token;
                if (rToken) {
                  replyTokens.push({ parentCommentId: topComment.id, token: rToken });
                } else if (r?.commentRenderer) {
                  const replyObj = parseCommentRenderer(r.commentRenderer, videoId, topComment.id);
                  if (replyObj) topComment.replies.push(replyObj);
                } else if (r?.commentViewModel) {
                  const replyObj = parseCommentViewModel(r.commentViewModel, entityMap, videoId, topComment.id);
                  if (replyObj) topComment.replies.push(replyObj);
                }
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

  return { newThreads, nextContinuation, replyTokens };
}

/**
 * Extracts CommentItem from an individual legacy commentRenderer object.
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
 * Fallback: Extracts comments from YouTube DOM elements with hard cap, deduplication,
 * and support for modern ytd-comment-view-model elements.
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

      // Modern + legacy author selectors
      const authorEl = el.querySelector(
        '#author-text, #channel-name #text, a.yt-core-attributed-string__link, a[href*="/@"], a[href*="/channel/"], #name.ytd-channel-name'
      ) as HTMLElement | null;
      const authorAnchor = (authorEl?.tagName === 'A' ? authorEl : authorEl?.closest('a')) as HTMLAnchorElement | null;
      const authorName = authorEl?.textContent?.trim() || authorAnchor?.textContent?.trim() || 'Viewer';
      const channelUrl = authorAnchor?.href || undefined;

      // Modern + legacy avatar selectors
      const avatarEl = el.querySelector('#author-thumbnail img, yt-img-shadow img, img.yt-core-image') as HTMLImageElement | null;
      const avatarUrl = avatarEl?.src || undefined;

      // Modern + legacy content text selectors
      const contentEl = el.querySelector('#content-text, yt-attributed-string#content-text, .yt-core-attributed-string');
      const text = contentEl?.textContent?.trim() || '';

      // Published time
      const timeEl = el.querySelector('#published-time-text, a[href*="lc="], span.published-time-text');
      const publishedAt = timeEl?.textContent?.trim() || undefined;

      // Likes
      const likesEl = el.querySelector('#vote-count-middle, span#vote-count-amount, button[aria-label*="like"]');
      const likeCount = likesEl?.textContent?.trim() || '0';

      // Comment ID resolution
      const viewModelEl = el.querySelector('ytd-comment-view-model');
      const commentId = viewModelEl?.getAttribute('data-comment-id') ||
                        timeEl?.getAttribute('href')?.match(/lc=([^&]+)/)?.[1] ||
                        el.getAttribute('id') ||
                        `dom-comment-${i}`;

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
          const replyEls = el.querySelectorAll(
            'ytd-comment-replies-renderer ytd-comment-view-model, ytd-comment-replies-renderer ytd-comment-renderer'
          );
          if (replyEls.length > 0) {
            item.replies = [];
            for (let j = 0; j < replyEls.length; j++) {
              const rEl = replyEls[j];
              const rAuthorEl = rEl.querySelector(
                '#author-text, #channel-name #text, a.yt-core-attributed-string__link, a[href*="/@"]'
              ) as HTMLElement | null;
              const rAuthor = rAuthorEl?.textContent?.trim() || 'Viewer';
              const rTextEl = rEl.querySelector('#content-text, yt-attributed-string#content-text');
              const rText = rTextEl?.textContent?.trim() || '';
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
