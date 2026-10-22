import { ExportOptions, ExtractorResult } from '../../types';

/**
 * Default export configuration.
 */
export const DEFAULT_EXPORT_OPTIONS: Required<ExportOptions> = {
  withTimestamps: true,
  includeChapters: true,
  includeImages: true,
  includeComments: true,
  isCopyAction: false
};

/**
 * Normalizes export options from boolean (legacy) or partial configuration object.
 */
export function resolveExportOptions(
  optionsOrTimestamps?: boolean | ExportOptions,
  legacyIncludeComments?: boolean
): Required<ExportOptions> {
  if (typeof optionsOrTimestamps === 'boolean') {
    return {
      withTimestamps: optionsOrTimestamps,
      includeChapters: true,
      includeImages: true,
      includeComments: legacyIncludeComments !== undefined ? Boolean(legacyIncludeComments) : true,
      isCopyAction: false
    };
  }

  if (optionsOrTimestamps && typeof optionsOrTimestamps === 'object') {
    return {
      withTimestamps: optionsOrTimestamps.withTimestamps ?? DEFAULT_EXPORT_OPTIONS.withTimestamps,
      includeChapters: optionsOrTimestamps.includeChapters ?? DEFAULT_EXPORT_OPTIONS.includeChapters,
      includeImages: optionsOrTimestamps.includeImages ?? DEFAULT_EXPORT_OPTIONS.includeImages,
      includeComments: optionsOrTimestamps.includeComments ?? DEFAULT_EXPORT_OPTIONS.includeComments,
      isCopyAction: Boolean(optionsOrTimestamps.isCopyAction)
    };
  }

  return { ...DEFAULT_EXPORT_OPTIONS };
}

/**
 * Sanitizes a title string into a safe filesystem filename.
 */
export function sanitizeFilename(title: string, maxLength = 60): string {
  const clean = title
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
    .trim()
    .replace(/\s+/g, '_');

  return (clean.slice(0, maxLength) || 'youtube_transcript').replace(/_+$/, '');
}

/**
 * Validates that a URL uses a safe protocol (http or https).
 */
export function isSafeUrl(url?: string | null): boolean {
  if (!url || typeof url !== 'string') return false;
  return /^https?:\/\//i.test(url.trim());
}

/**
 * Constructs a deep-link timestamp URL targeting a specific second in the video.
 */
export function buildTimestampUrl(videoUrl: string, seconds: number): string {
  const cleanSeconds = Math.max(0, Math.floor(seconds));
  try {
    const urlObj = new URL(videoUrl);
    // If it's a Shorts URL, normalize to watch link so t parameter works reliably
    if (urlObj.pathname.startsWith('/shorts/')) {
      const shortId = urlObj.pathname.split('/')[2];
      return `https://www.youtube.com/watch?v=${shortId}&t=${cleanSeconds}s`;
    }
    urlObj.searchParams.set('t', `${cleanSeconds}s`);
    return urlObj.toString();
  } catch {
    const sep = videoUrl.includes('?') ? '&' : '?';
    return `${videoUrl}${sep}t=${cleanSeconds}s`;
  }
}

/**
 * Escapes raw text for safe inclusion inside Markdown blocks without HTML injection.
 */
export function escapeMarkdown(text: string): string {
  if (!text) return '';
  return text
    .replace(/\r\n/g, '\n')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .trim();
}

/**
 * Escapes table cell values so pipe delimiters and newlines do not break table layouts.
 */
export function escapeTableCell(text: string): string {
  if (!text) return '';
  return escapeMarkdown(text)
    .replace(/\|/g, '\\|')
    .replace(/\n+/g, ' ')
    .trim();
}

/**
 * Shared normalized export data model ensuring consistent cross-format representation.
 */
export interface NormalizedExportData {
  schemaVersion: number;
  extractedAt: string;
  video: {
    id: string;
    url: string;
    title: string;
    isShort: boolean;
    channel: {
      id: string | null;
      name: string;
      url: string;
      avatarUrl: string | null;
      subscriberInfo: {
        count: number | null;
        displayText: string;
        status: 'available' | 'rounded' | 'hidden' | 'unavailable';
      };
    };
    stats: {
      views: number;
      formattedViews: string;
      likes: string;
      durationSeconds: number;
      formattedDuration: string;
      uploadDate: string;
    };
    description: string;
    images: {
      thumbnailUrl: string | null;
      channelAvatarUrl: string | null;
    };
  };
  chapters: {
    available: boolean;
    status: 'detected' | 'none_found' | 'failed';
    count: number;
    items: Array<{
      title: string;
      startSeconds: number;
      startTimestamp: string;
      endSeconds: number | null;
      endTimestamp: string | null;
      durationSeconds: number | null;
      formattedDuration: string | null;
      source: 'player_markers' | 'description_timestamps';
      url: string;
    }>;
  };
  transcript: {
    available: boolean;
    status: 'complete' | 'failed' | 'unavailable';
    language: string;
    wordCount: number;
    segmentCount: number;
    segments: Array<{
      start: number;
      duration: number;
      timestamp: string;
      text: string;
      url: string;
    }>;
  };
  comments: {
    available: boolean;
    status: 'complete' | 'partial' | 'loading' | 'unavailable' | 'failed' | 'not_requested';
    sortOrder: 'top' | 'newest';
    requestedLimit: number;
    effectiveLimit: number;
    topLevelCount: number;
    replyCount: number;
    extractedCount: number;
    warning: string | null;
    reason: string | null;
    error: string | null;
    threads: Array<{
      topLevelComment: {
        id: string;
        videoId: string;
        text: string;
        author: {
          displayName: string;
          channelUrl: string | null;
          avatarUrl: string | null;
        };
        publishedAt: string | null;
        likeCount: string;
        replyCount: number;
        isPinned: boolean;
        isOwner: boolean;
      };
      replies: Array<{
        id: string;
        parentCommentId: string;
        videoId: string;
        text: string;
        author: {
          displayName: string;
          channelUrl: string | null;
          avatarUrl: string | null;
        };
        publishedAt: string | null;
        likeCount: string;
        replyCount: number;
        isPinned: boolean;
        isOwner: boolean;
        replies: any[];
      }>;
    }>;
  };
  export: {
    format: 'markdown' | 'json' | 'txt';
    timestampPreference: boolean;
    included: {
      chapters: boolean;
      comments: boolean;
      thumbnailUrl: boolean;
      channelAvatarUrl: boolean;
    };
  };
}

/**
 * Normalizes an ExtractorResult and active ExportOptions into a canonical structure.
 */
export function normalizeExportData(
  result: ExtractorResult,
  options: Required<ExportOptions>,
  format: 'markdown' | 'json' | 'txt'
): NormalizedExportData {
  const m = result.metadata;
  const t = result.transcript;
  const ch = result.chapters;
  const cm = result.comments;

  const videoUrl = m.url || `https://www.youtube.com/watch?v=${m.videoId}`;

  // 1. Chapters Normalization
  const chaptersAvailable = Boolean(options.includeChapters && ch?.available && ch.items && ch.items.length > 0);
  const chapterItems = (options.includeChapters && ch?.items ? ch.items : []).map((c) => ({
    title: c.title,
    startSeconds: c.startSeconds,
    startTimestamp: c.startTimestamp,
    endSeconds: c.endSeconds ?? null,
    endTimestamp: c.endTimestamp ?? null,
    durationSeconds: c.durationSeconds ?? null,
    formattedDuration: c.formattedDuration ?? null,
    source: c.source,
    url: buildTimestampUrl(videoUrl, c.startSeconds)
  }));

  // 2. Transcript Normalization
  const transcriptSegments = (t.segments || []).map((s) => ({
    start: s.start,
    duration: s.duration,
    timestamp: s.timestamp,
    text: s.text,
    url: buildTimestampUrl(videoUrl, s.start)
  }));

  // 3. Comments Normalization
  const commentsAvailable = Boolean(options.includeComments && cm?.available && cm.threads && cm.threads.length > 0);
  const commentThreads = (options.includeComments && cm?.threads ? cm.threads : []).map((th) => ({
    topLevelComment: {
      id: th.id,
      videoId: th.videoId || m.videoId,
      text: th.text,
      author: {
        displayName: th.author.displayName || 'Anonymous',
        channelUrl: isSafeUrl(th.author.channelUrl) ? th.author.channelUrl! : null,
        avatarUrl: isSafeUrl(th.author.avatarUrl) ? th.author.avatarUrl! : null
      },
      publishedAt: th.publishedAt || null,
      likeCount: th.likeCount || '0',
      replyCount: th.replyCount !== undefined ? th.replyCount : (th.replies ? th.replies.length : 0),
      isPinned: Boolean(th.isPinned),
      isOwner: Boolean(th.isOwner)
    },
    replies: (th.replies || []).map((r) => ({
      id: r.id,
      parentCommentId: th.id,
      videoId: r.videoId || th.videoId || m.videoId,
      text: r.text,
      author: {
        displayName: r.author.displayName || 'Anonymous',
        channelUrl: isSafeUrl(r.author.channelUrl) ? r.author.channelUrl! : null,
        avatarUrl: isSafeUrl(r.author.avatarUrl) ? r.author.avatarUrl! : null
      },
      publishedAt: r.publishedAt || null,
      likeCount: r.likeCount || '0',
      replyCount: 0,
      isPinned: Boolean(r.isPinned),
      isOwner: Boolean(r.isOwner),
      replies: []
    }))
  }));

  const topLevelCount = options.includeComments ? (cm?.topLevelCount ?? commentThreads.length) : 0;
  const replyCount = options.includeComments ? (cm?.replyCount ?? commentThreads.reduce((acc, th) => acc + th.replies.length, 0)) : 0;

  return {
    schemaVersion: 2,
    extractedAt: result.extractedAt,
    video: {
      id: m.videoId,
      url: videoUrl,
      title: m.title,
      isShort: Boolean(m.isShort),
      channel: {
        id: null,
        name: m.channelName,
        url: m.channelUrl || videoUrl,
        avatarUrl: options.includeImages && isSafeUrl(m.channelAvatarUrl) ? m.channelAvatarUrl! : null,
        subscriberInfo: {
          count: m.subscriberInfo?.count ?? null,
          displayText: m.subscriberInfo?.displayText || 'Unavailable',
          status: m.subscriberInfo?.status || 'unavailable'
        }
      },
      stats: {
        views: m.viewCount,
        formattedViews: m.formattedViews,
        likes: m.likeCount,
        durationSeconds: m.durationSeconds,
        formattedDuration: m.formattedDuration,
        uploadDate: m.uploadDate
      },
      description: m.description || '',
      images: {
        thumbnailUrl: options.includeImages && isSafeUrl(m.thumbnailUrl) ? m.thumbnailUrl! : null,
        channelAvatarUrl: options.includeImages && isSafeUrl(m.channelAvatarUrl) ? m.channelAvatarUrl! : null
      }
    },
    chapters: {
      available: chaptersAvailable,
      status: ch?.status ?? (ch?.available ? 'detected' : 'none_found'),
      count: chapterItems.length,
      items: chapterItems
    },
    transcript: {
      available: Boolean(t.available && transcriptSegments.length > 0),
      status: t.available ? 'complete' : (t.error ? 'failed' : 'unavailable'),
      language: t.selectedLanguage || 'unknown',
      wordCount: t.wordCount,
      segmentCount: transcriptSegments.length,
      segments: transcriptSegments
    },
    comments: {
      available: commentsAvailable,
      status: cm?.status ?? 'not_requested',
      sortOrder: cm?.sortOrder ?? 'top',
      requestedLimit: cm?.requestedLimit ?? 0,
      effectiveLimit: cm?.effectiveLimit ?? 0,
      topLevelCount,
      replyCount,
      extractedCount: options.includeComments ? (cm?.extractedCount ?? (topLevelCount + replyCount)) : 0,
      warning: cm?.warning || null,
      reason: cm?.reason || null,
      error: cm?.error || null,
      threads: commentThreads
    },
    export: {
      format,
      timestampPreference: options.withTimestamps,
      included: {
        chapters: options.includeChapters,
        comments: options.includeComments,
        thumbnailUrl: options.includeImages && Boolean(m.thumbnailUrl),
        channelAvatarUrl: options.includeImages && Boolean(m.channelAvatarUrl)
      }
    }
  };
}

/**
 * Formats extraction result into canonical machine-readable JSON.
 */
export function toJSON(result: ExtractorResult, optionsOrTimestamps?: boolean | ExportOptions): string {
  const opts = resolveExportOptions(optionsOrTimestamps);
  const data = normalizeExportData(result, opts, 'json');

  const payload: any = {
    schemaVersion: data.schemaVersion,
    extractedAt: data.extractedAt,
    video: {
      id: data.video.id,
      url: data.video.url,
      title: data.video.title,
      isShort: data.video.isShort,
      channel: {
        id: data.video.channel.id,
        name: data.video.channel.name,
        url: data.video.channel.url,
        avatarUrl: data.video.channel.avatarUrl,
        subscriberInfo: data.video.channel.subscriberInfo
      },
      stats: {
        views: data.video.stats.views,
        formattedViews: data.video.stats.formattedViews,
        likes: data.video.stats.likes,
        durationSeconds: data.video.stats.durationSeconds,
        formattedDuration: data.video.stats.formattedDuration,
        uploadDate: data.video.stats.uploadDate
      },
      description: data.video.description,
      images: {
        thumbnailUrl: data.video.images.thumbnailUrl
      }
    },
    chapters: {
      available: data.chapters.available,
      status: data.chapters.status,
      count: data.chapters.count,
      items: data.chapters.items.map((c) => ({
        title: c.title,
        startSeconds: c.startSeconds,
        startTimestamp: c.startTimestamp,
        endSeconds: c.endSeconds,
        endTimestamp: c.endTimestamp,
        durationSeconds: c.durationSeconds,
        formattedDuration: c.formattedDuration,
        source: c.source
      }))
    },
    transcript: {
      available: data.transcript.available,
      status: data.transcript.status,
      language: data.transcript.language,
      wordCount: data.transcript.wordCount,
      segmentCount: data.transcript.segmentCount,
      segments: data.transcript.segments.map((s) => ({
        start: s.start,
        duration: s.duration,
        timestamp: s.timestamp,
        text: s.text
      }))
    },
    comments: {
      available: data.comments.available,
      status: data.comments.status,
      sortOrder: data.comments.sortOrder,
      requestedLimit: data.comments.requestedLimit,
      effectiveLimit: data.comments.effectiveLimit,
      topLevelCount: data.comments.topLevelCount,
      replyCount: data.comments.replyCount,
      threads: data.comments.threads,
      error: data.comments.error,
      reason: data.comments.reason,
      warning: data.comments.warning
    },
    export: data.export
  };

  return JSON.stringify(payload, null, 2);
}

/**
 * Formats extraction result into GitHub-Flavored Markdown.
 */
export function toMarkdown(
  result: ExtractorResult,
  optionsOrTimestamps?: boolean | ExportOptions,
  legacyIncludeComments?: boolean
): string {
  const opts = resolveExportOptions(optionsOrTimestamps, legacyIncludeComments);
  const data = normalizeExportData(result, opts, 'markdown');

  const cleanTitle = escapeMarkdown(data.video.title);
  const channelName = escapeMarkdown(data.video.channel.name);
  const channelUrl = data.video.channel.url;
  const videoUrl = data.video.url;

  // 1. Title
  const sections: string[] = [`# ${cleanTitle}`];

  // 2. Embedded Clickable Thumbnail Preview
  if (opts.includeImages && data.video.images.thumbnailUrl) {
    sections.push(`[![Video thumbnail: ${cleanTitle}](${data.video.images.thumbnailUrl})](${videoUrl})`);
  } else if (!opts.includeImages) {
    // Images omitted by user preference
  } else {
    sections.push('_Thumbnail unavailable._');
  }

  // 3. Compact Channel Identity Line
  const subsDisplay = `${data.video.channel.subscriberInfo.displayText} (${data.video.channel.subscriberInfo.status})`;
  let channelIdentity = `**[${channelName}](${channelUrl})** • ${subsDisplay}`;
  if (opts.includeImages && data.video.images.channelAvatarUrl) {
    channelIdentity = `[![${channelName} Avatar](${data.video.images.channelAvatarUrl})](${channelUrl}) ` + channelIdentity;
  }
  sections.push(channelIdentity);

  // 4. Compact Video Information Table
  const thumbCell = opts.includeImages && data.video.images.thumbnailUrl
    ? `[Open thumbnail](${data.video.images.thumbnailUrl})`
    : 'Unavailable';

  const videoType = data.video.isShort ? 'YouTube Short' : 'Standard video';

  sections.push(
    `## Video Information\n\n` +
    `| Field | Value |\n` +
    `| :--- | :--- |\n` +
    `| Channel | [${escapeTableCell(channelName)}](${channelUrl}) |\n` +
    `| Subscribers | ${escapeTableCell(subsDisplay)} |\n` +
    `| Views | ${escapeTableCell(data.video.stats.formattedViews)} |\n` +
    `| Likes | ${escapeTableCell(data.video.stats.likes)} |\n` +
    `| Duration | ${escapeTableCell(data.video.stats.formattedDuration)} |\n` +
    `| Published | ${escapeTableCell(data.video.stats.uploadDate)} |\n` +
    `| Video type | ${videoType} |\n` +
    `| Video URL | [Watch on YouTube](${videoUrl}) |\n` +
    `| Thumbnail | ${thumbCell} |`
  );

  // 5. Description
  const descBody = data.video.description
    ? `> ${escapeMarkdown(data.video.description).replace(/\n/g, '\n> ')}`
    : '_No description provided._';
  sections.push(`## Description\n\n${descBody}`);

  // 6. Chapters Section
  if (opts.includeChapters) {
    if (data.chapters.available && data.chapters.items.length > 0) {
      const chapterRows = data.chapters.items.map((c) => {
        const dur = c.formattedDuration || '-';
        return `| **[${c.startTimestamp}](${c.url})** | ${dur} | ${escapeTableCell(c.title)} |`;
      }).join('\n');

      sections.push(
        `## Chapters (${data.chapters.items.length} Detected)\n\n` +
        `| Timestamp | Duration | Chapter Title |\n` +
        `| :--- | :--- | :--- |\n` +
        chapterRows
      );
    } else if (data.chapters.status === 'failed') {
      sections.push(`## Chapters\n\n_Chapter detection failed._`);
    } else {
      sections.push(`## Chapters\n\n_No chapters available for this video._`);
    }
  }

  // 7. Transcript Section
  const transcriptHeading = `## Transcript (${data.transcript.available ? `Language: ${data.transcript.language} • Words: ${data.transcript.wordCount} • Segments: ${data.transcript.segmentCount}` : 'Unavailable'})`;
  if (data.transcript.available && data.transcript.segments.length > 0) {
    let transcriptBody = '';
    if (opts.withTimestamps) {
      transcriptBody = data.transcript.segments
        .map((s) => `- **[${s.timestamp}](${s.url})** ${escapeMarkdown(s.text)}`)
        .join('\n');
    } else {
      transcriptBody = data.transcript.segments
        .map((s) => escapeMarkdown(s.text))
        .join('\n\n');
    }
    sections.push(`${transcriptHeading}\n\n${transcriptBody}`);
  } else {
    sections.push(`${transcriptHeading}\n\n_No transcript available for this video._`);
  }

  // 8. Comments Section with Visible YouTube-Style Hierarchy
  if (opts.includeComments) {
    if (data.comments.available && data.comments.threads.length > 0) {
      const sortLabel = data.comments.sortOrder === 'newest' ? 'Newest First' : 'Top Comments';
      const statusLabel = data.comments.status === 'complete' ? 'Complete extraction' : 'Partial extraction';
      const warningNotice = data.comments.warning ? `> ⚠️ *Notice:* ${escapeMarkdown(data.comments.warning)}\n\n` : '';

      const commentsHeading = `## Comments (${data.comments.topLevelCount} top-level comments · ${data.comments.replyCount} replies · ${sortLabel} · ${statusLabel})`;

      const threadBlocks = data.comments.threads.map((th, index) => {
        const top = th.topLevelComment;
        const authorLink = top.author.channelUrl
          ? `[${escapeMarkdown(top.author.displayName)}](${top.author.channelUrl})`
          : `**${escapeMarkdown(top.author.displayName)}**`;

        const badges: string[] = [];
        if (top.isPinned) badges.push('📌 Pinned');
        if (top.isOwner) badges.push('👑 Creator');
        const badgeStr = badges.length > 0 ? ` · ${badges.join(' ')}` : '';

        const published = top.publishedAt || 'Unavailable date';
        const likes = top.likeCount || '0';

        let block = `### #${index + 1} — ${authorLink} · ❤️ ${likes} · ${published}${badgeStr}\n\n` +
          `| Field | Details |\n` +
          `| :--- | :--- |\n` +
          `| **Comment ID** | \`${top.id}\` |\n` +
          `| **Author** | ${authorLink} |\n` +
          `| **Published** | ${published} |\n` +
          `| **Likes** | ❤️ ${likes} |\n` +
          `| **Replies** | 💬 ${top.replyCount} |\n\n` +
          `> ${escapeMarkdown(top.text).replace(/\n/g, '\n> ')}\n`;

        if (th.replies.length > 0) {
          block += `\n> **Replies (${th.replies.length}):**\n>\n`;
          block += th.replies.map((r, rIdx) => {
            const rAuthorLink = r.author.channelUrl
              ? `[${escapeMarkdown(r.author.displayName)}](${r.author.channelUrl})`
              : `**${escapeMarkdown(r.author.displayName)}**`;

            const rPublished = r.publishedAt ? ` · ${r.publishedAt}` : '';
            const rLikes = r.likeCount && r.likeCount !== '0' ? ` · ❤️ ${r.likeCount}` : '';
            const rBadges: string[] = [];
            if (r.isOwner) rBadges.push('👑 Creator');
            const rBadgeStr = rBadges.length > 0 ? ` · ${rBadges.join(' ')}` : '';

            return `> ↳ **Reply #${index + 1}.${rIdx + 1} — ${rAuthorLink}**${rLikes}${rPublished}${rBadgeStr} [ID: \`${r.id}\`]:\n` +
              `> > ${escapeMarkdown(r.text).replace(/\n/g, '\n> > ')}\n>`;
          }).join('\n');
        }

        return block;
      }).join('\n---\n\n');

      sections.push(`${commentsHeading}\n\n${warningNotice}${threadBlocks}`);
    } else if (data.comments.status === 'unavailable') {
      sections.push(`## Comments\n\n_Comments are disabled for this video._`);
    } else if (data.comments.status === 'failed') {
      sections.push(`## Comments\n\n_Comment extraction failed: ${escapeMarkdown(data.comments.error || 'Network error')}._`);
    } else {
      sections.push(`## Comments\n\n_No comments extracted._`);
    }
  }

  // 9. Extraction / Completeness Report
  const chReport = data.chapters.available ? `Detected (${data.chapters.count} chapters)` : data.chapters.status;
  const trReport = data.transcript.available ? `Complete (${data.transcript.segmentCount} segments, ${data.transcript.wordCount} words)` : data.transcript.status;
  const cmReport = data.comments.available
    ? `${data.comments.status} (${data.comments.topLevelCount} top-level, ${data.comments.replyCount} replies)`
    : (opts.includeComments ? data.comments.status : 'Omitted per export settings');

  sections.push(
    `---\n\n` +
    `## Extraction Quality Report\n\n` +
    `| Component | Status | Details |\n` +
    `| :--- | :--- | :--- |\n` +
    `| **Metadata** | Complete | Video ID: \`${data.video.id}\` |\n` +
    `| **Chapters** | ${escapeTableCell(chReport)} | ${data.chapters.available ? 'Player & description markers' : 'None detected'} |\n` +
    `| **Transcript** | ${escapeTableCell(trReport)} | Language: \`${data.transcript.language}\` |\n` +
    `| **Comments** | ${escapeTableCell(cmReport)} | Sort: \`${data.comments.sortOrder}\` |\n` +
    `| **Extracted At** | Complete | ${data.extractedAt} |\n` +
    `| **Provenance** | Verified | ZapCue In-Page Extractor (DOM & YouTube InnerTube API) |`
  );

  return sections.join('\n\n');
}

/**
 * Formats extraction result into portable Plain Text (.txt).
 */
export function toTXT(
  result: ExtractorResult,
  optionsOrTimestamps?: boolean | ExportOptions,
  legacyIncludeComments?: boolean
): string {
  const opts = resolveExportOptions(optionsOrTimestamps, legacyIncludeComments);
  const data = normalizeExportData(result, opts, 'txt');

  const subsDisplay = `${data.video.channel.subscriberInfo.displayText} [Status: ${data.video.channel.subscriberInfo.status}]`;
  const videoType = data.video.isShort ? 'YouTube Short' : 'Standard video';

  const lines: string[] = [
    'ZAPCUE VIDEO RESEARCH EXPORT',
    '================================================================',
    `TITLE:       ${data.video.title}`,
    `VIDEO URL:   ${data.video.url}`,
    `VIDEO ID:    ${data.video.id}`,
    `EXTRACTED:   ${data.extractedAt}`,
    '',
    'VIDEO INFORMATION',
    '----------------------------------------------------------------',
    `CHANNEL:     ${data.video.channel.name}`,
    `CHANNEL URL: ${data.video.channel.url}`,
    `SUBSCRIBERS: ${subsDisplay}`,
    `VIEWS:       ${data.video.stats.formattedViews}`,
    `LIKES:       ${data.video.stats.likes}`,
    `DURATION:    ${data.video.stats.formattedDuration}`,
    `PUBLISHED:   ${data.video.stats.uploadDate}`,
    `VIDEO TYPE:  ${videoType}`,
    '',
    'IMAGES',
    '----------------------------------------------------------------',
    `THUMBNAIL:      ${opts.includeImages && data.video.images.thumbnailUrl ? data.video.images.thumbnailUrl : (opts.includeImages ? 'Unavailable' : 'Omitted per export settings')}`,
    `CHANNEL AVATAR: ${opts.includeImages && data.video.images.channelAvatarUrl ? data.video.images.channelAvatarUrl : (opts.includeImages ? 'Unavailable' : 'Omitted per export settings')}`,
    '',
    'DESCRIPTION',
    '----------------------------------------------------------------',
    data.video.description || 'No description provided.',
    ''
  ];

  // Chapters
  if (opts.includeChapters) {
    if (data.chapters.available && data.chapters.items.length > 0) {
      lines.push(`CHAPTERS (${data.chapters.items.length})`);
      lines.push('----------------------------------------------------------------');
      for (const c of data.chapters.items) {
        const dur = c.formattedDuration ? ` (Duration: ${c.formattedDuration})` : '';
        lines.push(`[${c.startTimestamp}] ${c.title}${dur}`);
      }
      lines.push('');
    } else if (data.chapters.status === 'failed') {
      lines.push('CHAPTERS');
      lines.push('----------------------------------------------------------------');
      lines.push('Chapter detection failed.');
      lines.push('');
    }
  }

  // Transcript
  const trSummary = data.transcript.available
    ? `${data.transcript.language} | ${data.transcript.wordCount} words | ${data.transcript.segmentCount} segments`
    : 'Unavailable';

  lines.push(`TRANSCRIPT (${trSummary})`);
  lines.push('----------------------------------------------------------------');
  if (data.transcript.available && data.transcript.segments.length > 0) {
    if (opts.withTimestamps) {
      for (const s of data.transcript.segments) {
        lines.push(`[${s.timestamp}] ${s.text}`);
      }
    } else {
      for (const s of data.transcript.segments) {
        lines.push(s.text);
      }
    }
  } else {
    lines.push('No transcript available for this video.');
  }
  lines.push('');

  // Comments
  if (opts.includeComments) {
    if (data.comments.available && data.comments.threads.length > 0) {
      const sortLabel = data.comments.sortOrder === 'newest' ? 'Newest' : 'Top';
      const statusLabel = data.comments.status === 'complete' ? 'Complete' : 'Partial';

      lines.push('================================================================');
      lines.push(`COMMENTS (${data.comments.topLevelCount} top-level | ${data.comments.replyCount} replies | ${sortLabel} | ${statusLabel})`);
      lines.push('================================================================');
      lines.push('');

      data.comments.threads.forEach((th, idx) => {
        const top = th.topLevelComment;
        lines.push(`[${idx + 1}] PARENT COMMENT`);
        lines.push(`Author:    ${top.author.displayName}`);
        lines.push(`Channel:   ${top.author.channelUrl || 'Unavailable'}`);
        lines.push(`Published: ${top.publishedAt || 'Unavailable'}`);
        lines.push(`Likes:     ${top.likeCount}`);
        lines.push(`Replies:   ${top.replyCount}`);
        lines.push('Text:');
        lines.push('  ' + top.text.replace(/\n/g, '\n  '));

        if (th.replies.length > 0) {
          th.replies.forEach((r, rIdx) => {
            lines.push('');
            lines.push(`  └── REPLY ${rIdx + 1}`);
            lines.push(`      Author:    ${r.author.displayName}`);
            lines.push(`      Channel:   ${r.author.channelUrl || 'Unavailable'}`);
            lines.push(`      Published: ${r.publishedAt || 'Unavailable'}`);
            lines.push(`      Likes:     ${r.likeCount}`);
            lines.push('      Text:');
            lines.push('        ' + r.text.replace(/\n/g, '\n        '));
          });
        }
        lines.push('');
        lines.push('----------------------------------------------------------------');
      });
      lines.push('');
    } else if (data.comments.status === 'unavailable') {
      lines.push('COMMENTS');
      lines.push('----------------------------------------------------------------');
      lines.push('Comments are disabled for this video.');
      lines.push('');
    } else if (data.comments.status === 'failed') {
      lines.push('COMMENTS');
      lines.push('----------------------------------------------------------------');
      lines.push(`Comment extraction failed: ${data.comments.error || 'Network error'}`);
      lines.push('');
    }
  }

  // Extraction Status Section
  const chStatusText = data.chapters.available ? `available (${data.chapters.count} chapters)` : data.chapters.status;
  const trStatusText = data.transcript.available ? 'complete' : data.transcript.status;
  const cmStatusText = data.comments.available
    ? `${data.comments.status} (${data.comments.topLevelCount} top-level comments; ${data.comments.replyCount} replies)`
    : (opts.includeComments ? data.comments.status : 'omitted per export settings');

  lines.push('EXTRACTION STATUS');
  lines.push('----------------------------------------------------------------');
  lines.push('Metadata:   complete');
  lines.push(`Chapters:   ${chStatusText}`);
  lines.push(`Transcript: ${trStatusText}`);
  lines.push(`Comments:   ${cmStatusText}`);
  lines.push(`Notes:      Clean research export generated by ZapCue.`);

  return lines.join('\n');
}

/**
 * Triggers instant in-browser file download via Blob URL.
 */
export function downloadFile(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';

  document.body.appendChild(anchor);
  anchor.click();

  setTimeout(() => {
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }, 100);
}
