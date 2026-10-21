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

  const exportPayload = {
    extractedAt: result.extractedAt,
    video: {
      id: m.videoId,
      url: m.url,
      title: m.title,
      channel: {
        name: m.channelName,
        url: m.channelUrl
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

  return JSON.stringify(exportPayload, null, 2);
}

/**
 * Formats extraction result into GitHub-Flavored Markdown.
 */
export function toMarkdown(result: ExtractorResult, withTimestamps = true): string {
  const m = result.metadata;
  const t = result.transcript;

  let segmentsMd = '_No transcript available for this video._';
  if (t.available && t.segments.length > 0) {
    if (withTimestamps) {
      segmentsMd = t.segments.map((s) => `- **[${s.timestamp}]** ${s.text}`).join('\n');
    } else {
      segmentsMd = t.segments.map((s) => s.text).join('\n\n');
    }
  }

  return `# ${m.title}

## Video Information
| Attribute | Details |
| :--- | :--- |
| **Channel** | [${m.channelName}](${m.channelUrl || m.url}) |
| **Views** | ${m.formattedViews} |
| **Likes** | ${m.likeCount} |
| **Duration** | ${m.formattedDuration} |
| **Published** | ${m.uploadDate} |
| **URL** | [${m.url}](${m.url}) |
| **Extracted** | ${result.extractedAt} |

## Description
> ${m.description.replace(/\n/g, '\n> ') || '_No description provided._'}

---

## Transcript (${t.available ? `Language: ${t.selectedLanguage} • Words: ${t.wordCount}` : 'Unavailable'})

${segmentsMd}
`;
}

/**
 * Formats extraction result into clean Plain Text.
 */
export function toTXT(result: ExtractorResult, withTimestamps = true): string {
  const m = result.metadata;
  const t = result.transcript;

  const header = [
    '======================================================================',
    `TITLE:       ${m.title}`,
    `CHANNEL:     ${m.channelName}`,
    `VIEWS:       ${m.formattedViews}`,
    `LIKES:       ${m.likeCount}`,
    `DURATION:    ${m.formattedDuration}`,
    `PUBLISHED:   ${m.uploadDate}`,
    `URL:         ${m.url}`,
    `EXTRACTED:   ${result.extractedAt}`,
    '======================================================================',
    '',
    '--- DESCRIPTION ---',
    m.description || 'No description.',
    '',
    '--- TRANSCRIPT ---',
    ''
  ].join('\n');

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

  return header + body;
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
