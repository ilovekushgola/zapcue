import { ExtractorResult } from '../../types';

/**
 * Sanitizes a title string into a safe filename.
 */
export function sanitizeFilename(title: string, maxLength = 60): string {
  const clean = title
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
    .trim()
    .replace(/\s+/g, '_');

  return (clean.slice(0, maxLength) || 'youtube_transcript').replace(/_+$/, '');
}

/**
 * Escapes raw text for safe inclusion inside Markdown blocks without HTML injection.
 */
function escapeMarkdown(text: string): string {
  if (!text) return '';
  return text
    .replace(/\r\n/g, '\n')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .trim();
}

/**
 * Formats extraction result into structured JSON.
 */
export function toJSON(result: ExtractorResult): string {
  const m = result.metadata;
  const t = result.transcript;
  const ch = result.chapters;
  const cm = result.comments;

  const exportPayload: any = {
    extractedAt: result.extractedAt,
    video: {
      id: m.videoId,
      url: m.url,
      title: m.title,
      thumbnailUrl: m.thumbnailUrl,
      channel: {
        name: m.channelName,
        url: m.channelUrl,
        avatarUrl: m.channelAvatarUrl || null,
        subscriberInfo: m.subscriberInfo ? {
          displayText: m.subscriberInfo.displayText,
          status: m.subscriberInfo.status,
          count: m.subscriberInfo.count ?? null
        } : null
      },
      stats: {
        views: m.viewCount,
        likes: m.likeCount,
        durationSeconds: m.durationSeconds,
        formattedDuration: m.formattedDuration
      },
      uploadDate: m.uploadDate,
      description: m.description,
      isShort: m.isShort
    },
    chapters: {
      available: ch?.available ?? false,
      status: ch?.status ?? (ch?.available ? 'detected' : 'none_found'),
      count: ch?.items?.length ?? 0,
      items: (ch?.items ?? []).map((c) => ({
        title: c.title,
        startSeconds: c.startSeconds,
        startTimestamp: c.startTimestamp,
        endSeconds: c.endSeconds ?? null,
        endTimestamp: c.endTimestamp ?? null,
        durationSeconds: c.durationSeconds ?? null,
        formattedDuration: c.formattedDuration ?? null,
        source: c.source
      }))
    },
    transcript: {
      available: t.available,
      language: t.selectedLanguage,
      wordCount: t.wordCount,
      segments: t.segments.map((s) => ({
        start: s.start,
        duration: s.duration,
        timestamp: s.timestamp,
        text: s.text
      }))
    }
  };

  if (cm) {
    exportPayload.comments = {
      available: cm.available,
      status: cm.status,
      reason: cm.reason || null,
      sortOrder: cm.sortOrder,
      requestedLimit: cm.requestedLimit,
      effectiveLimit: cm.effectiveLimit,
      topLevelCount: cm.topLevelCount,
      replyCount: cm.replyCount,
      extractedCount: cm.extractedCount,
      warning: cm.warning || null,
      threads: (cm.threads || []).map((th) => ({
        topLevelComment: {
          id: th.id,
          videoId: th.videoId,
          text: th.text,
          author: {
            displayName: th.author.displayName,
            channelUrl: th.author.channelUrl || null,
            avatarUrl: th.author.avatarUrl || null
          },
          publishedAt: th.publishedAt || null,
          likeCount: th.likeCount || '0',
          replyCount: th.replyCount || (th.replies ? th.replies.length : 0),
          isOwner: Boolean(th.isOwner),
          isPinned: Boolean(th.isPinned)
        },
        replies: (th.replies || []).map((r) => ({
          id: r.id,
          parentCommentId: th.id,
          text: r.text,
          author: {
            displayName: r.author.displayName,
            channelUrl: r.author.channelUrl || null,
            avatarUrl: r.author.avatarUrl || null
          },
          publishedAt: r.publishedAt || null,
          likeCount: r.likeCount || '0',
          isOwner: Boolean(r.isOwner)
        }))
      }))
    };
  }

  return JSON.stringify(exportPayload, null, 2);
}

/**
 * Formats extraction result into GitHub-Flavored Markdown.
 */
export function toMarkdown(result: ExtractorResult, withTimestamps = true, includeComments = true): string {
  const m = result.metadata;
  const t = result.transcript;
  const ch = result.chapters;
  const cm = result.comments;

  // 1. Chapters Section
  let chaptersMd = '';
  if (ch?.available && ch.items.length > 0) {
    chaptersMd = `\n## Chapters (${ch.items.length} Detected)\n\n` +
      `| Timestamp | Duration | Chapter Title |\n` +
      `| :--- | :--- | :--- |\n` +
      ch.items.map((c) => {
        const dur = c.formattedDuration ? c.formattedDuration : '-';
        return `| **[${c.startTimestamp}]** | ${dur} | ${escapeMarkdown(c.title)} |`;
      }).join('\n') +
      '\n';
  } else if (ch?.status === 'failed') {
    chaptersMd = '\n## Chapters\n_Chapter detection failed._\n';
  }

  // 2. Transcript Section
  let segmentsMd = '_No transcript available for this video._';
  if (t.available && t.segments.length > 0) {
    if (withTimestamps) {
      segmentsMd = t.segments.map((s) => `- **[${s.timestamp}]** ${escapeMarkdown(s.text)}`).join('\n');
    } else {
      segmentsMd = t.segments.map((s) => escapeMarkdown(s.text)).join('\n\n');
    }
  }

  // 3. Comments Section with Complete Hierarchy
  let commentsMd = '';
  if (includeComments && cm?.available && cm.threads.length > 0) {
    const sortLabel = cm.sortOrder === 'newest' ? 'Newest First' : 'Top Comments';
    const warningNotice = cm.warning ? `\n> ⚠️ *Notice:* ${escapeMarkdown(cm.warning)}\n` : '';
    const statusLabel = `Status: ${cm.status}` + (cm.reason ? ` (${cm.reason})` : '');

    commentsMd = `\n## Comments (${cm.topLevelCount} Top-Level, ${cm.replyCount} Replies • ${sortLabel} • ${statusLabel})\n` +
      warningNotice + '\n';

    commentsMd += cm.threads.map((th, index) => {
      const authorLink = th.author.channelUrl
        ? `[${escapeMarkdown(th.author.displayName)}](${th.author.channelUrl})`
        : `**${escapeMarkdown(th.author.displayName)}**`;

      const avatarMd = th.author.avatarUrl ? `[View Avatar](${th.author.avatarUrl})` : 'N/A';
      const channelMd = th.author.channelUrl ? `[Channel Link](${th.author.channelUrl})` : 'N/A';

      let block = `### #${index + 1} — ${authorLink}\n` +
        `| Field | Details |\n` +
        `| :--- | :--- |\n` +
        `| **Comment ID** | \`${th.id}\` |\n` +
        `| **Author** | ${authorLink} |\n` +
        `| **Channel URL** | ${channelMd} |\n` +
        `| **Avatar** | ${avatarMd} |\n` +
        `| **Published** | ${th.publishedAt || 'N/A'} |\n` +
        `| **Likes** | ❤️ ${th.likeCount || '0'} |\n` +
        `| **Replies** | 💬 ${th.replyCount || (th.replies ? th.replies.length : 0)} |\n\n` +
        `> ${escapeMarkdown(th.text).replace(/\n/g, '\n> ')}\n`;

      // Nested child replies
      if (th.replies && th.replies.length > 0) {
        block += `\n**Replies (${th.replies.length}):**\n\n`;
        block += th.replies.map((r, rIdx) => {
          const rAuthorLink = r.author.channelUrl
            ? `[${escapeMarkdown(r.author.displayName)}](${r.author.channelUrl})`
            : `**${escapeMarkdown(r.author.displayName)}**`;
          const rPublished = r.publishedAt ? ` (${r.publishedAt})` : '';
          const rLikes = r.likeCount && r.likeCount !== '0' ? ` • ❤️ ${r.likeCount}` : '';

          return `> **↳ #${index + 1}.${rIdx + 1} ${rAuthorLink}**${rPublished}${rLikes} [ID: \`${r.id}\`]:\n` +
            `> ${escapeMarkdown(r.text).replace(/\n/g, '\n> ')}\n`;
        }).join('\n');
      }

      return block;
    }).join('\n---\n\n');
  } else if (includeComments && cm) {
    if (cm.status === 'unavailable') {
      commentsMd = '\n## Comments\n_Comments are disabled for this video._\n';
    } else if (cm.status === 'failed') {
      commentsMd = `\n## Comments\n_Comment extraction failed: ${cm.error || 'Network error'}_\n`;
    }
  }

  // Video Info Table formatting with readable links
  const avatarLink = m.channelAvatarUrl
    ? `[Channel Avatar](${m.channelAvatarUrl})`
    : 'Unavailable';

  const thumbnailLink = m.thumbnailUrl
    ? `[${escapeMarkdown(m.title)} - Thumbnail](${m.thumbnailUrl})`
    : 'Unavailable';

  const subsDisplay = m.subscriberInfo
    ? `${m.subscriberInfo.displayText} (${m.subscriberInfo.status})`
    : 'Unavailable';

  return `# ${m.title}

## Video Information
| Attribute | Details |
| :--- | :--- |
| **Channel** | [${m.channelName}](${m.channelUrl || m.url}) |
| **Subscribers** | ${subsDisplay} |
| **Views** | ${m.formattedViews} |
| **Likes** | ${m.likeCount} |
| **Duration** | ${m.formattedDuration} |
| **Published** | ${m.uploadDate} |
| **URL** | [${m.url}](${m.url}) |
| **Thumbnail** | ${thumbnailLink} |
| **Channel Avatar** | ${avatarLink} |
| **Extracted** | ${result.extractedAt} |

## Description
> ${escapeMarkdown(m.description).replace(/\n/g, '\n> ') || '_No description provided._'}
${chaptersMd}
---

## Transcript (${t.available ? `Language: ${t.selectedLanguage} • Words: ${t.wordCount}` : 'Unavailable'})

${segmentsMd}
${commentsMd}`;
}

/**
 * Formats extraction result into clean Plain Text with full metadata, chapters, and nested comments.
 */
export function toTXT(result: ExtractorResult, withTimestamps = true, includeComments = true): string {
  const m = result.metadata;
  const t = result.transcript;
  const ch = result.chapters;
  const cm = result.comments;

  const subsDisplay = m.subscriberInfo
    ? `${m.subscriberInfo.displayText} [Status: ${m.subscriberInfo.status}]`
    : 'Unavailable';

  const header = [
    '======================================================================',
    `TITLE:          ${m.title}`,
    `CHANNEL:        ${m.channelName}`,
    `CHANNEL URL:    ${m.channelUrl || 'N/A'}`,
    `SUBSCRIBERS:    ${subsDisplay}`,
    `VIEWS:          ${m.formattedViews}`,
    `LIKES:          ${m.likeCount}`,
    `DURATION:       ${m.formattedDuration}`,
    `PUBLISHED:      ${m.uploadDate}`,
    `URL:            ${m.url}`,
    `THUMBNAIL URL:  ${m.thumbnailUrl}`,
    `AVATAR URL:     ${m.channelAvatarUrl || 'N/A'}`,
    `EXTRACTED AT:   ${result.extractedAt}`,
    '======================================================================',
    '',
    '--- DESCRIPTION ---',
    m.description || 'No description provided.',
    ''
  ];

  if (ch?.available && ch.items.length > 0) {
    header.push(`--- CHAPTERS (${ch.items.length} Detected) ---`);
    for (const c of ch.items) {
      const dur = c.formattedDuration ? ` (Duration: ${c.formattedDuration})` : '';
      header.push(`[${c.startTimestamp}] ${c.title}${dur}`);
    }
    header.push('');
  } else if (ch?.status === 'failed') {
    header.push('--- CHAPTERS ---');
    header.push('Chapter detection failed.');
    header.push('');
  }

  header.push(`--- TRANSCRIPT (${t.available ? `Language: ${t.selectedLanguage} • Words: ${t.wordCount}` : 'Unavailable'}) ---`);
  header.push('');

  let body = '';
  if (t.available && t.segments.length > 0) {
    if (withTimestamps) {
      body = t.segments.map((s) => `[${s.timestamp}] ${s.text}`).join('\n');
    } else {
      body = t.segments.map((s) => s.text).join('\n\n');
    }
  } else {
    body = 'No transcript available for this video.';
  }

  let commentsSection = '';
  if (includeComments && cm?.available && cm.threads.length > 0) {
    const sortLabel = cm.sortOrder === 'newest' ? 'Newest' : 'Top';
    const statusLabel = `Status: ${cm.status}` + (cm.reason ? ` (${cm.reason})` : '');

    commentsSection = '\n\n======================================================================\n' +
      `COMMENTS (${cm.topLevelCount} Top-Level, ${cm.replyCount} Replies • Sort: ${sortLabel} • ${statusLabel})\n` +
      '======================================================================\n\n' +
      cm.threads.map((th, idx) => {
        let b = `[#${idx + 1}] COMMENT ID: ${th.id}\n` +
          `AUTHOR:     ${th.author.displayName}\n` +
          `CHANNEL:    ${th.author.channelUrl || 'N/A'}\n` +
          `AVATAR:     ${th.author.avatarUrl || 'N/A'}\n` +
          `PUBLISHED:  ${th.publishedAt || 'N/A'}\n` +
          `LIKES:      ${th.likeCount || '0'}\n` +
          `REPLIES:    ${th.replyCount || (th.replies ? th.replies.length : 0)}\n` +
          `TEXT:\n${th.text}\n`;

        if (th.replies && th.replies.length > 0) {
          b += `\n  REPLIES (${th.replies.length}):\n` +
            th.replies.map((r, rIdx) => {
              return `  ↳ [#${idx + 1}.${rIdx + 1}] REPLY ID: ${r.id}\n` +
                `    AUTHOR:    ${r.author.displayName}\n` +
                `    CHANNEL:   ${r.author.channelUrl || 'N/A'}\n` +
                `    PUBLISHED: ${r.publishedAt || 'N/A'}\n` +
                `    LIKES:     ${r.likeCount || '0'}\n` +
                `    TEXT:      ${r.text.replace(/\n/g, '\n    ')}`;
            }).join('\n\n') + '\n';
        }
        return b;
      }).join('\n----------------------------------------------------------------------\n');
  } else if (includeComments && cm) {
    if (cm.status === 'unavailable') {
      commentsSection = '\n\n--- COMMENTS ---\nComments are disabled for this video.\n';
    } else if (cm.status === 'failed') {
      commentsSection = `\n\n--- COMMENTS ---\nComment extraction failed: ${cm.error || 'Network error'}\n`;
    }
  }

  return header.join('\n') + body + commentsSection;
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
