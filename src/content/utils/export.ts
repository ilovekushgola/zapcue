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
      channel: {
        name: m.channelName,
        url: m.channelUrl,
        avatarUrl: m.channelAvatarUrl || null,
        subscriberInfo: m.subscriberInfo || null
      },
      stats: {
        views: m.viewCount,
        likes: m.likeCount,
        durationSeconds: m.durationSeconds,
        formattedDuration: m.formattedDuration
      },
      uploadDate: m.uploadDate,
      description: m.description,
      thumbnailUrl: m.thumbnailUrl,
      isShort: m.isShort
    },
    chapters: {
      available: ch?.available ?? false,
      count: ch?.items?.length ?? 0,
      items: (ch?.items ?? []).map((c) => ({
        title: c.title,
        startSeconds: c.startSeconds,
        startTimestamp: c.startTimestamp,
        endSeconds: c.endSeconds ?? null,
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
      sortOrder: cm.sortOrder,
      requestedLimit: cm.requestedLimit,
      extractedCount: cm.extractedCount,
      threads: (cm.threads || []).map((th) => ({
        topLevelComment: {
          id: th.id,
          text: th.text,
          author: {
            displayName: th.author.displayName,
            channelUrl: th.author.channelUrl || null,
            avatarUrl: th.author.avatarUrl || null
          },
          publishedAt: th.publishedAt || null,
          likeCount: th.likeCount || null,
          replyCount: th.replyCount || 0
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
          likeCount: r.likeCount || null
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

  let segmentsMd = '_No transcript available for this video._';
  if (t.available && t.segments.length > 0) {
    if (withTimestamps) {
      segmentsMd = t.segments.map((s) => `- **[${s.timestamp}]** ${s.text}`).join('\n');
    } else {
      segmentsMd = t.segments.map((s) => s.text).join('\n\n');
    }
  }

  let chaptersMd = '';
  if (ch?.available && ch.items.length > 0) {
    chaptersMd = `\n## Chapters (${ch.items.length} Detected)\n` +
      `| Timestamp | Title |\n` +
      `| :--- | :--- |\n` +
      ch.items.map((c) => `| **[${c.startTimestamp}]** | ${c.title} |`).join('\n') +
      '\n';
  }

  let commentsMd = '';
  if (includeComments && cm?.available && cm.threads.length > 0) {
    commentsMd = `\n## Comments (${cm.extractedCount} Extracted • ${cm.sortOrder === 'top' ? 'Top Comments' : 'Newest First'})\n\n`;
    commentsMd += cm.threads.map((th) => {
      let block = `### ${th.author.displayName}${th.publishedAt ? ` (${th.publishedAt})` : ''}\n`;
      if (th.likeCount) block += `> ❤️ Likes: ${th.likeCount}\n`;
      block += `\n${th.text.replace(/\n/g, '\n\n')}\n`;

      if (th.replies && th.replies.length > 0) {
        block += `\n**Replies (${th.replies.length}):**\n\n`;
        block += th.replies.map((r) => {
          return `> **${r.author.displayName}**${r.publishedAt ? ` (${r.publishedAt})` : ''}:\n> ${r.text.replace(/\n/g, '\n> ')}\n`;
        }).join('\n');
      }
      return block;
    }).join('\n---\n\n');
  }

  const avatarRow = m.channelAvatarUrl ? `| **Channel Avatar** | [View Avatar](${m.channelAvatarUrl}) |\n` : '';
  const subsRow = m.subscriberInfo ? `| **Subscribers** | ${m.subscriberInfo.displayText} |\n` : '';

  return `# ${m.title}

## Video Information
| Attribute | Details |
| :--- | :--- |
| **Channel** | [${m.channelName}](${m.channelUrl || m.url}) |
${subsRow}| **Views** | ${m.formattedViews} |
| **Likes** | ${m.likeCount} |
| **Duration** | ${m.formattedDuration} |
| **Published** | ${m.uploadDate} |
| **URL** | [${m.url}](${m.url}) |
| **Thumbnail** | [View Thumbnail](${m.thumbnailUrl}) |
${avatarRow}| **Extracted** | ${result.extractedAt} |

## Description
> ${m.description.replace(/\n/g, '\n> ') || '_No description provided._'}
${chaptersMd}
---

## Transcript (${t.available ? `Language: ${t.selectedLanguage} • Words: ${t.wordCount}` : 'Unavailable'})

${segmentsMd}
${commentsMd}`;
}

/**
 * Formats extraction result into clean Plain Text.
 */
export function toTXT(result: ExtractorResult, withTimestamps = true, includeComments = true): string {
  const m = result.metadata;
  const t = result.transcript;
  const ch = result.chapters;
  const cm = result.comments;

  const header = [
    '======================================================================',
    `TITLE:       ${m.title}`,
    `CHANNEL:     ${m.channelName}`,
    `SUBSCRIBERS: ${m.subscriberInfo?.displayText || 'Unavailable'}`,
    `VIEWS:       ${m.formattedViews}`,
    `LIKES:       ${m.likeCount}`,
    `DURATION:    ${m.formattedDuration}`,
    `PUBLISHED:   ${m.uploadDate}`,
    `URL:         ${m.url}`,
    `THUMBNAIL:   ${m.thumbnailUrl}`,
    `AVATAR:      ${m.channelAvatarUrl || 'N/A'}`,
    `EXTRACTED:   ${result.extractedAt}`,
    '======================================================================',
    '',
    '--- DESCRIPTION ---',
    m.description || 'No description.',
    ''
  ];

  if (ch?.available && ch.items.length > 0) {
    header.push('--- CHAPTERS ---');
    for (const c of ch.items) {
      header.push(`[${c.startTimestamp}] ${c.title}`);
    }
    header.push('');
  }

  header.push('--- TRANSCRIPT ---');
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
    commentsSection = '\n\n======================================================================\n' +
      `COMMENTS (${cm.extractedCount} Extracted • ${cm.sortOrder === 'top' ? 'Top' : 'Newest'})\n` +
      '======================================================================\n\n' +
      cm.threads.map((th) => {
        let b = `[${th.author.displayName}]${th.publishedAt ? ` (${th.publishedAt})` : ''} - Likes: ${th.likeCount || '0'}\n` +
          `${th.text}\n`;
        if (th.replies && th.replies.length > 0) {
          b += `  Replies (${th.replies.length}):\n` +
            th.replies.map((r) => `    ↳ [${r.author.displayName}] ${r.text}`).join('\n') + '\n';
        }
        return b;
      }).join('\n----------------------------------------------------------------------\n');
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
