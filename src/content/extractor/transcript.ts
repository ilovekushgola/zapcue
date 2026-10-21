import { CaptionTrackInfo, TranscriptData, TranscriptSegment } from '../../types';
import { formatTimestamp } from '../utils/time';

/**
 * Decodes HTML entities commonly found in YouTube captions.
 */
function decodeHTMLEntities(text: string): string {
  const entities: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&apos;': "'",
    '&#x27;': "'",
    '&#x2F;': '/',
    '&#10;': '\n',
    '&#xA;': '\n',
    '&#13;': '\r',
    '&#xD;': '\r'
  };

  return text
    .replace(/&(?:amp|lt|gt|quot|apos|#39|#x27|#x2F|#10|#xA|#13|#xD);/g, (match) => entities[match] || match)
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Parses timestamp string (e.g. "0:44" or "1:02:15") to total seconds.
 */
export function parseTimestampToSeconds(ts: string): number {
  if (!ts) return 0;
  const parts = ts.trim().split(':').map((p) => parseFloat(p) || 0);
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  } else if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  return 0;
}

/**
 * Stage 1: Extracts transcript segments directly from YouTube's rendered DOM if open.
 */
export function extractTranscriptFromDOM(): TranscriptSegment[] {
  const segmentNodes = document.querySelectorAll('ytd-transcript-segment-renderer');
  if (!segmentNodes || segmentNodes.length === 0) {
    return [];
  }

  const segments: TranscriptSegment[] = [];

  segmentNodes.forEach((node) => {
    const timeEl = node.querySelector('.segment-timestamp, [class*="segment-timestamp"]');
    const textEl = node.querySelector('.segment-text, [class*="segment-text"], yt-formatted-string');

    if (timeEl && textEl) {
      const rawTimestamp = timeEl.textContent?.trim() || '0:00';
      const rawText = textEl.textContent?.trim() || '';
      const clean = decodeHTMLEntities(rawText);

      if (clean) {
        const start = parseTimestampToSeconds(rawTimestamp);
        segments.push({
          start,
          duration: 0,
          timestamp: rawTimestamp,
          text: clean
        });
      }
    }
  });

  return segments;
}

/**
 * Stage 2: Programmatically clicks YouTube's native "Show transcript" button in the description,
 * waits for DOM segments to populate, and extracts them.
 */
export async function triggerAndExtractNativeTranscript(timeoutMs = 1800): Promise<TranscriptSegment[]> {
  // Check if segments are already in the DOM
  let existing = extractTranscriptFromDOM();
  if (existing.length > 0) {
    return existing;
  }

  // Find native transcript button
  const selectors = [
    'ytd-video-description-transcript-section-renderer button',
    '#panels ytd-button-renderer button',
    'button[aria-label*="transcript" i]',
    'button[aria-label*="Transcript" i]',
    'ytd-button-renderer#primary-button button',
    'ytd-engagement-panel-section-list-renderer[target-id*="transcript"] button'
  ];

  let btn: HTMLElement | null = null;
  for (const s of selectors) {
    const el = document.querySelector(s) as HTMLElement | null;
    if (el) {
      btn = el;
      break;
    }
  }

  // If button not found, try expanding description first
  if (!btn) {
    const expandDescBtn = document.querySelector('tp-yt-paper-button#expand, #expand') as HTMLElement | null;
    if (expandDescBtn) {
      expandDescBtn.click();
      await new Promise((r) => setTimeout(r, 100));
      for (const s of selectors) {
        const el = document.querySelector(s) as HTMLElement | null;
        if (el) {
          btn = el;
          break;
        }
      }
    }
  }

  if (btn) {
    btn.click();

    // Poll for transcript elements to render
    const startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
      await new Promise((r) => setTimeout(r, 120));
      const segs = extractTranscriptFromDOM();
      if (segs.length > 0) {
        return segs;
      }
    }
  }

  return [];
}

/**
 * Parses caption events from YouTube's json3 endpoint format.
 */
function parseJSON3CaptionEvents(events: any[]): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];

  for (const event of events) {
    if (!event.segs || !event.segs.length) continue;

    const rawText = event.segs.map((s: any) => s.utf8 || '').join('');
    const clean = decodeHTMLEntities(rawText);

    if (!clean) continue;

    const start = (event.tStartMs || 0) / 1000;
    const duration = (event.dDurationMs || 0) / 1000;

    segments.push({
      start,
      duration,
      timestamp: formatTimestamp(start),
      text: clean
    });
  }

  return segments;
}

/**
 * Fallback parser for standard YouTube XML timedtext.
 */
function parseXMLTimedText(xmlString: string): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlString, 'text/xml');
  const textNodes = doc.querySelectorAll('text');

  textNodes.forEach((node) => {
    const startAttr = node.getAttribute('start') || '0';
    const durAttr = node.getAttribute('dur') || '0';
    const rawText = node.textContent || '';
    const clean = decodeHTMLEntities(rawText);

    if (!clean) return;

    const start = parseFloat(startAttr);
    const duration = parseFloat(durAttr);

    segments.push({
      start,
      duration,
      timestamp: formatTimestamp(start),
      text: clean
    });
  });

  return segments;
}

/**
 * Extracts available caption tracks from player response.
 */
export function extractAvailableCaptionTracks(playerResponse: any): CaptionTrackInfo[] {
  const tracklist = playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
  if (!Array.isArray(tracklist) || tracklist.length === 0) {
    return [];
  }

  return tracklist.map((track: any) => {
    const isAutoGenerated = track.vssId?.startsWith('a.') || track.kind === 'asr';
    const name = track.name?.simpleText || track.name?.runs?.[0]?.text || track.languageCode;

    return {
      languageCode: track.languageCode || 'unknown',
      name: isAutoGenerated ? `${name} (auto)` : name,
      isAutoGenerated,
      baseUrl: track.baseUrl
    };
  });
}

/**
 * Master Transcript Extraction Pipeline with 4-Layer Fallback Architecture.
 */
export async function extractTranscript(
  playerResponse: any,
  preferredLanguage = 'en'
): Promise<TranscriptData> {
  const tracks = extractAvailableCaptionTracks(playerResponse);

  // Layer 1: Check if YouTube's native transcript panel is ALREADY open in the DOM
  const domSegments = extractTranscriptFromDOM();
  if (domSegments.length > 0) {
    const fullText = domSegments.map((s) => s.text).join(' ');
    const wordCount = fullText.split(/\s+/).filter(Boolean).length;
    return {
      available: true,
      selectedLanguage: preferredLanguage,
      availableTracks: tracks,
      segments: domSegments,
      fullText,
      wordCount
    };
  }

  // Layer 2: Fetch via caption track baseUrl with multi-format and track fallback
  if (tracks.length > 0) {
    // Sort tracks: preferred language first, then English, then original
    const candidateTracks = [
      ...tracks.filter((t) => t.languageCode === preferredLanguage && !t.isAutoGenerated),
      ...tracks.filter((t) => t.languageCode === preferredLanguage),
      ...tracks.filter((t) => t.languageCode.startsWith('en') && !t.isAutoGenerated),
      ...tracks.filter((t) => t.languageCode.startsWith('en')),
      ...tracks
    ];

    // Remove duplicates
    const uniqueTracks = Array.from(new Set(candidateTracks));

    for (const track of uniqueTracks) {
      let segments: TranscriptSegment[] = [];

      // Try JSON3 with credentials
      try {
        const json3Url = `${track.baseUrl}&fmt=json3`;
        const resp = await fetch(json3Url, { credentials: 'include' });
        if (resp.ok) {
          const text = await resp.text();
          if (text && text.trim().length > 0) {
            const data = JSON.parse(text);
            if (data?.events && Array.isArray(data.events)) {
              segments = parseJSON3CaptionEvents(data.events);
            }
          }
        }
      } catch (err) {
        // Fallthrough to raw XML
      }

      // Try raw timedtext XML
      if (!segments.length) {
        try {
          const xmlResp = await fetch(track.baseUrl, { credentials: 'include' });
          if (xmlResp.ok) {
            const xmlText = await xmlResp.text();
            if (xmlText && xmlText.trim().length > 0 && xmlText.includes('<text')) {
              segments = parseXMLTimedText(xmlText);
            }
          }
        } catch (err) {
          // Fallthrough
        }
      }

      if (segments.length > 0) {
        const fullText = segments.map((s) => s.text).join(' ');
        const wordCount = fullText.split(/\s+/).filter(Boolean).length;
        return {
          available: true,
          selectedLanguage: track.languageCode,
          availableTracks: tracks,
          segments,
          fullText,
          wordCount
        };
      }
    }
  }

  // Layer 3: Native DOM Trigger Fallback
  // Programmatically click YouTube's native "Show transcript" button to let YouTube load it
  const nativeSegments = await triggerAndExtractNativeTranscript(1500);
  if (nativeSegments.length > 0) {
    const fullText = nativeSegments.map((s) => s.text).join(' ');
    const wordCount = fullText.split(/\s+/).filter(Boolean).length;
    return {
      available: true,
      selectedLanguage: preferredLanguage,
      availableTracks: tracks,
      segments: nativeSegments,
      fullText,
      wordCount
    };
  }

  return {
    available: false,
    selectedLanguage: 'none',
    availableTracks: tracks,
    segments: [],
    fullText: '',
    wordCount: 0,
    error: 'No captions available for this video'
  };
}
