import { ChapterData, ChapterItem } from '../../types';
import { formatTimestamp, parseTimestampToSeconds } from '../utils/time';

/**
 * Extracts video chapters from YouTube player response markers or video description.
 */
export function extractChapters(playerResponse?: any, description?: string, totalDuration = 0): ChapterData {
  try {
    // 1. Try Player Response Macro Markers
    const markerChapters = extractFromPlayerResponse(playerResponse, totalDuration);
    if (markerChapters.length >= 2) {
      return {
        available: true,
        items: markerChapters
      };
    }

    // 2. Fallback: Parse Timestamps from Video Description
    if (description) {
      const descChapters = extractFromDescription(description, totalDuration);
      if (descChapters.length >= 2) {
        return {
          available: true,
          items: descChapters
        };
      }
    }
  } catch (err) {
    console.warn('[YT Extractor] Error extracting chapters:', err);
  }

  return {
    available: false,
    items: []
  };
}

/**
 * Parses chapter markers embedded in YouTube player response.
 */
function extractFromPlayerResponse(playerResponse: any, totalDuration: number): ChapterItem[] {
  if (!playerResponse) return [];

  const chapters: ChapterItem[] = [];

  // Check engagement panels / macro markers list
  const panels = playerResponse?.engagementPanels || [];
  for (const panel of panels) {
    const macroMarkers = panel?.engagementPanelSectionListRenderer?.content?.macroMarkersListRenderer?.contents;
    if (Array.isArray(macroMarkers) && macroMarkers.length > 0) {
      for (const item of macroMarkers) {
        const marker = item?.macroMarkersListItemRenderer;
        if (!marker) continue;

        const title = marker?.title?.simpleText ||
                      marker?.title?.runs?.map((r: any) => r.text).join('') || 'Chapter';
        const timeText = marker?.timeDescription?.simpleText ||
                         marker?.timeDescription?.runs?.map((r: any) => r.text).join('') || '00:00';

        const startSeconds = parseTimestampToSeconds(timeText);
        chapters.push({
          title: title.trim(),
          startSeconds,
          startTimestamp: formatTimestamp(startSeconds),
          source: 'player_markers'
        });
      }
      break;
    }
  }

  // Calculate endSeconds for each chapter
  calculateChapterEndTimes(chapters, totalDuration);
  return chapters;
}

/**
 * Extracts timestamped chapters from video description lines.
 * Requires at least 2 distinct chapters in increasing time order.
 */
export function extractFromDescription(description: string, totalDuration: number): ChapterItem[] {
  const lines = description.split(/\r?\n/);
  const rawMatches: { title: string; startSeconds: number; timeText: string }[] = [];

  // Regex matching patterns like:
  // "00:00 Intro"
  // "01:23 - The Setup"
  // "(05:12) Deep Dive"
  // "1:02:45 Conclusion"
  const timestampRegex = /(?:^|\s)(?:\[|\()?((?:\d{1,2}:)?\d{1,2}:\d{2})(?:\]|\))?\s*[-–—:]?\s*(.+)$/;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const match = trimmed.match(timestampRegex);
    if (match) {
      const timeText = match[1];
      const title = match[2].trim().replace(/^[-–—:]+\s*/, '');
      const startSeconds = parseTimestampToSeconds(timeText);

      if (title.length > 0 && !isNaN(startSeconds)) {
        rawMatches.push({ title, startSeconds, timeText });
      }
    }
  }

  // Validate increasing order and at least 2 chapters
  if (rawMatches.length < 2) return [];

  const chapters: ChapterItem[] = [];
  let lastSeconds = -1;

  for (const m of rawMatches) {
    if (m.startSeconds >= lastSeconds) {
      chapters.push({
        title: m.title,
        startSeconds: m.startSeconds,
        startTimestamp: formatTimestamp(m.startSeconds),
        source: 'description_timestamps'
      });
      lastSeconds = m.startSeconds;
    }
  }

  if (chapters.length < 2) return [];

  calculateChapterEndTimes(chapters, totalDuration);
  return chapters;
}

function calculateChapterEndTimes(chapters: ChapterItem[], totalDuration: number): void {
  for (let i = 0; i < chapters.length; i++) {
    if (i < chapters.length - 1) {
      chapters[i].endSeconds = chapters[i + 1].startSeconds;
    } else if (totalDuration > chapters[i].startSeconds) {
      chapters[i].endSeconds = totalDuration;
    }
  }
}
