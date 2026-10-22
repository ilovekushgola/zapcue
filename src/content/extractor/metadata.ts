import { SubscriberInfo, VideoMetadata } from '../../types';
import { formatCompactNumber, formatDuration, formatNumberWithCommas } from '../utils/time';

/**
 * Extracts visible like count from YouTube DOM accessibility labels.
 */
export function extractLikeCountFromDOM(): string {
  try {
    const selectors = [
      'like-button-view-model button',
      'ytd-like-button-renderer button',
      '#segmented-like-button button',
      'button[aria-label*="like" i]'
    ];

    for (const selector of selectors) {
      const btn = document.querySelector(selector);
      if (btn) {
        const ariaLabel = btn.getAttribute('aria-label') || '';
        // Matches counts like "like this video along with 24,152 other people" or "24K likes"
        const match = ariaLabel.match(/([\d,.]+\s*[KMkm]?)/);
        if (match && match[1]) {
          return match[1].trim();
        }

        // Check text content inside button
        const text = btn.textContent?.trim();
        if (text && /\d/.test(text)) {
          return text;
        }
      }
    }
  } catch (e) {
    console.warn('[YT Extractor] Error reading like count from DOM:', e);
  }
  return 'N/A';
}

/**
 * Extracts channel subscriber count from YouTube DOM or player response.
 */
export function extractSubscriberInfo(playerResponse?: any): SubscriberInfo {
  try {
    // 1. Check DOM selectors
    const subSelectors = [
      '#owner-sub-count',
      'ytd-video-owner-renderer #owner-sub-count',
      '#subscriber-count',
      'ytd-subscribe-button-renderer #subscriber-count'
    ];

    for (const selector of subSelectors) {
      const el = document.querySelector(selector);
      const text = el?.textContent?.trim();
      if (text) {
        const cleanText = text.replace(/\s+/g, ' ');
        const isHidden = /hidden/i.test(cleanText);
        const isRounded = /^[0-9]+(\.[0-9]+)?[KkMmBb]/.test(cleanText);
        return {
          displayText: cleanText,
          status: isHidden ? 'hidden' : (isRounded ? 'rounded' : 'available')
        };
      }
    }

    // 2. Check player response secondary info if available
    const ownerRenderer = playerResponse?.contents?.twoColumnWatchNextResults?.results?.results?.contents?.find(
      (c: any) => c?.videoSecondaryInfoRenderer
    )?.videoSecondaryInfoRenderer?.owner?.videoOwnerRenderer;

    const subText = ownerRenderer?.subscriberCountText?.simpleText ||
                    ownerRenderer?.subscriberCountText?.runs?.map((r: any) => r.text).join('');

    if (subText && subText.trim()) {
      const cleanText = subText.trim().replace(/\s+/g, ' ');
      const isHidden = /hidden/i.test(cleanText);
      const isRounded = /^[0-9]+(\.[0-9]+)?[KkMmBb]/.test(cleanText);
      return {
        displayText: cleanText,
        status: isHidden ? 'hidden' : (isRounded ? 'rounded' : 'available')
      };
    }
  } catch (e) {
    console.warn('[YT Extractor] Error reading subscriber info:', e);
  }

  return {
    displayText: 'Unavailable',
    status: 'unavailable'
  };
}

/**
 * Parses and extracts complete video metadata using playerResponse with DOM fallback.
 */
export function extractMetadata(playerResponse: any, videoId: string): VideoMetadata {
  const isShort = window.location.pathname.startsWith('/shorts/');
  const canonicalUrl = isShort
    ? `https://www.youtube.com/shorts/${videoId}`
    : `https://www.youtube.com/watch?v=${videoId}`;

  const details = playerResponse?.videoDetails;
  const microformat = playerResponse?.microformat?.playerMicroformatRenderer;

  // 1. Title
  let title = details?.title || '';
  if (!title) {
    const domTitle = document.querySelector('h1.ytd-watch-metadata yt-formatted-string, h1.ytd-shorts-player yt-formatted-string');
    title = domTitle?.textContent?.trim() || document.title.replace(/\s*-\s*YouTube$/, '').trim();
  }

  // 2. Channel Name & URL
  let channelName = details?.author || '';
  let channelUrl = details?.channelId ? `https://www.youtube.com/channel/${details.channelId}` : '';
  if (!channelName) {
    const channelAnchor = document.querySelector('ytd-channel-name a, #channel-name a, .ytd-channel-name a') as HTMLAnchorElement | null;
    channelName = channelAnchor?.textContent?.trim() || 'Unknown Channel';
    if (channelAnchor?.href) channelUrl = channelAnchor.href;
  }

  // 3. View Count
  let rawViews = parseInt(details?.viewCount || '0', 10);
  if (isNaN(rawViews) || rawViews === 0) {
    const viewsEl = document.querySelector('ytd-watch-info-text #count, #info-container span');
    const viewMatch = viewsEl?.textContent?.replace(/,/g, '').match(/\d+/);
    if (viewMatch) rawViews = parseInt(viewMatch[0], 10);
  }

  const viewCount = rawViews;
  const formattedViews = formatNumberWithCommas(rawViews) + ' views (' + formatCompactNumber(rawViews) + ')';

  // 4. Likes
  const likeCount = extractLikeCountFromDOM();

  // 5. Duration
  let durationSeconds = parseInt(details?.lengthSeconds || '0', 10);
  if (isNaN(durationSeconds) || durationSeconds === 0) {
    const videoEl = document.querySelector('video') as HTMLVideoElement | null;
    if (videoEl && !isNaN(videoEl.duration)) {
      durationSeconds = Math.round(videoEl.duration);
    }
  }
  const formattedDuration = formatDuration(durationSeconds);

  // 6. Upload Date
  const uploadDate = microformat?.publishDate || microformat?.uploadDate || 'Unknown Date';

  // 7. Description
  let description = details?.shortDescription || '';
  if (!description) {
    const descEl = document.querySelector('#description-inline-expander yt-formatted-string, #description yt-formatted-string');
    description = descEl?.textContent?.trim() || '';
  }

  // 8. Thumbnail
  const thumbnails = details?.thumbnail?.thumbnails || [];
  const thumbnailUrl = thumbnails.length > 0 ? thumbnails[thumbnails.length - 1].url : `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

  // 9. Channel Avatar
  let channelAvatarUrl = '';
  try {
    const avatarImg = document.querySelector('#owner #avatar #img, ytd-video-owner-renderer #avatar img, #avatar.ytd-video-owner-renderer img, #avatar img') as HTMLImageElement | null;
    if (avatarImg?.src && !avatarImg.src.startsWith('data:image/gif')) {
      channelAvatarUrl = avatarImg.src;
    }
  } catch (e) {
    // Ignore DOM read error
  }

  // 10. Channel Subscriber Info
  const subscriberInfo = extractSubscriberInfo(playerResponse);

  return {
    videoId,
    url: canonicalUrl,
    title,
    channelName,
    channelUrl,
    viewCount,
    formattedViews,
    likeCount,
    durationSeconds,
    formattedDuration,
    uploadDate,
    description,
    thumbnailUrl,
    channelAvatarUrl,
    subscriberInfo,
    isShort
  };
}
