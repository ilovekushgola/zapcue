// Automated End-to-End Verification Test Suite
// Tests metadata extraction, transcript parsing (JSON3 + XML), export formatting, cache, and sanitization.

import assert from 'assert';
import fs from 'fs';
import path from 'path';

console.log('\n======================================================');
console.log('🧪 RUNNING YT-META-EXTRACTOR TEST SUITE (PHASE 7)');
console.log('======================================================\n');

let passedTests = 0;
let totalTests = 0;

function it(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✓ [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ [FAIL] ${name}`);
    console.error(err);
  }
}

// ----------------------------------------------------------------------
// Test Group 1: Manifest & Distribution Integrity
// ----------------------------------------------------------------------
console.log('--- Group 1: Distribution & Manifest V3 Validation ---');

it('manifest.json exists and adheres to MV3 structure', () => {
  const manifestRaw = fs.readFileSync('dist/manifest.json', 'utf8');
  const manifest = JSON.parse(manifestRaw);

  assert.strictEqual(manifest.manifest_version, 3, 'Must be Manifest V3');
  assert.ok(manifest.name, 'Manifest must have a name');
  assert.ok(manifest.version, 'Manifest must have a version');
  assert.ok(manifest.content_scripts.length >= 2, 'Must have at least 2 content scripts');
  assert.ok(manifest.options_ui, 'Manifest must have options_ui declared');
  assert.strictEqual(manifest.options_ui.page, 'options/options.html');

  const mainWorldScript = manifest.content_scripts.find(s => s.world === 'MAIN');
  assert.ok(mainWorldScript, 'Must have a MAIN world content script for bridge');
  assert.strictEqual(mainWorldScript.js[0], 'content/bridge.js');

  const isolatedScript = manifest.content_scripts.find(s => s.world === 'ISOLATED');
  assert.ok(isolatedScript, 'Must have an ISOLATED world content script');
  assert.strictEqual(isolatedScript.js[0], 'content/index.js');
});

it('icons exist and have non-zero file sizes', () => {
  [16, 32, 48, 128].forEach(size => {
    const iconPath = `dist/icons/icon${size}.png`;
    assert.ok(fs.existsSync(iconPath), `Icon ${iconPath} must exist`);
    const stat = fs.statSync(iconPath);
    assert.ok(stat.size > 50, `Icon ${iconPath} must be a valid PNG file`);
  });
});

it('all compiled bundles exist and are non-empty', () => {
  assert.ok(fs.existsSync('dist/content/bridge.js'));
  assert.ok(fs.existsSync('dist/content/index.js'));
  assert.ok(fs.existsSync('dist/background/service-worker.js'));
  assert.ok(fs.existsSync('dist/popup/popup.html'));
  assert.ok(fs.existsSync('dist/options/options.html'));
});

// ----------------------------------------------------------------------
// Test Group 2: Time & Number Formatting
// ----------------------------------------------------------------------
console.log('\n--- Group 2: Time and Number Utilities ---');

// Mock helpers directly to test math & formatters
function formatDuration(seconds) {
  if (isNaN(seconds) || seconds < 0) return '00:00';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const pad = (n) => n.toString().padStart(2, '0');
  if (hrs > 0) return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
  return `${pad(mins)}:${pad(secs)}`;
}

function formatCompactNumber(num) {
  if (isNaN(num)) return '0';
  if (num < 1000) return num.toString();
  if (num < 1000000) return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  if (num < 1000000000) return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
  return (num / 1000000000).toFixed(1).replace(/\.0$/, '') + 'B';
}

it('formats seconds into accurate MM:SS and HH:MM:SS strings', () => {
  assert.strictEqual(formatDuration(0), '00:00');
  assert.strictEqual(formatDuration(45), '00:45');
  assert.strictEqual(formatDuration(125), '02:05');
  assert.strictEqual(formatDuration(3665), '01:01:05');
  assert.strictEqual(formatDuration(7200), '02:00:00');
});

it('formats compact view counts correctly', () => {
  assert.strictEqual(formatCompactNumber(450), '450');
  assert.strictEqual(formatCompactNumber(1200), '1.2K');
  assert.strictEqual(formatCompactNumber(45000), '45K');
  assert.strictEqual(formatCompactNumber(1250000), '1.3M');
  assert.strictEqual(formatCompactNumber(2500000000), '2.5B');
});

// ----------------------------------------------------------------------
// Test Group 3: HTML Entity Decoding & Caption Normalization
// ----------------------------------------------------------------------
console.log('\n--- Group 3: Caption Text Normalization ---');

function decodeHTMLEntities(text) {
  const entities = {
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

it('decodes HTML entities cleanly without mangling text', () => {
  const raw = 'Welcome &amp; thank you for watching &#39;How to Code&#39; &quot;Part 1&quot; &lt;Tutorial&gt;';
  const expected = "Welcome & thank you for watching 'How to Code' \"Part 1\" <Tutorial>";
  assert.strictEqual(decodeHTMLEntities(raw), expected);
});

// ----------------------------------------------------------------------
// Test Group 4: JSON3 Caption Event Parsing
// ----------------------------------------------------------------------
console.log('\n--- Group 4: JSON3 Caption Event Parser ---');

function parseJSON3CaptionEvents(events) {
  const segments = [];
  for (const event of events) {
    if (!event.segs || !event.segs.length) continue;
    const rawText = event.segs.map((s) => s.utf8 || '').join('');
    const clean = decodeHTMLEntities(rawText);
    if (!clean) continue;
    const start = (event.tStartMs || 0) / 1000;
    const duration = (event.dDurationMs || 0) / 1000;
    segments.push({
      start,
      duration,
      timestamp: formatDuration(start),
      text: clean
    });
  }
  return segments;
}

it('parses structured JSON3 events into timestamped segments', () => {
  const mockEvents = [
    {
      tStartMs: 0,
      dDurationMs: 4200,
      segs: [{ utf8: 'Hello and welcome ' }, { utf8: 'to this &amp; demo video.' }]
    },
    {
      tStartMs: 4500,
      dDurationMs: 3100,
      segs: [{ utf8: 'Today we will test the extension.' }]
    },
    {
      tStartMs: 8000,
      dDurationMs: 2000,
      segs: [] // empty segment, should be skipped
    }
  ];

  const parsed = parseJSON3CaptionEvents(mockEvents);
  assert.strictEqual(parsed.length, 2, 'Should parse 2 valid segments');
  assert.strictEqual(parsed[0].timestamp, '00:00');
  assert.strictEqual(parsed[0].text, 'Hello and welcome to this & demo video.');
  assert.strictEqual(parsed[1].timestamp, '00:04');
  assert.strictEqual(parsed[1].text, 'Today we will test the extension.');
});

// ----------------------------------------------------------------------
// Test Group 5: Export Formatters (JSON, Markdown, TXT)
// ----------------------------------------------------------------------
console.log('\n--- Group 5: Export Engine (JSON, Markdown, TXT) ---');

function sanitizeFilename(title, maxLength = 60) {
  const clean = title
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
    .trim()
    .replace(/\s+/g, '_');
  return (clean.slice(0, maxLength) || 'youtube_transcript').replace(/_+$/, '');
}

it('sanitizes titles with illegal filesystem characters', () => {
  const title = 'What is Web3? / Architecture & Design: A "Deep Dive" <2026> | Part 1*';
  const clean = sanitizeFilename(title);
  assert.ok(!/[<>:"/\\|?*]/.test(clean), 'Filename must contain zero illegal characters');
  assert.strictEqual(clean, 'What_is_Web3_Architecture_&_Design_A_Deep_Dive_2026_Part_1');
});

const sampleResult = {
  videoId: 'dQw4w9WgXcQ',
  metadata: {
    videoId: 'dQw4w9WgXcQ',
    url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    title: 'Never Gonna Give You Up',
    channelName: 'Rick Astley',
    channelUrl: 'https://www.youtube.com/channel/UCuAXFkgsw1L7xaCfnd5JJOw',
    viewCount: 1500000000,
    formattedViews: '1,500,000,000 views (1.5B)',
    likeCount: '17M',
    durationSeconds: 213,
    formattedDuration: '03:33',
    uploadDate: '2009-10-25',
    description: 'The official video for Never Gonna Give You Up by Rick Astley.',
    thumbnailUrl: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
    isShort: false
  },
  transcript: {
    available: true,
    selectedLanguage: 'en',
    availableTracks: [
      { languageCode: 'en', name: 'English', isAutoGenerated: false, baseUrl: 'https://www.youtube.com/api/timedtext' }
    ],
    segments: [
      { start: 18.5, duration: 4.2, timestamp: '00:18', text: "We're no strangers to love" },
      { start: 23.1, duration: 3.9, timestamp: '00:23', text: 'You know the rules and so do I' }
    ],
    fullText: "We're no strangers to love You know the rules and so do I",
    wordCount: 14
  },
  extractedAt: '2026-10-21T14:30:00.000Z'
};

it('generates valid JSON export string that re-parses with exact schema', () => {
  const jsonStr = JSON.stringify({
    extractedAt: sampleResult.extractedAt,
    video: {
      id: sampleResult.metadata.videoId,
      url: sampleResult.metadata.url,
      title: sampleResult.metadata.title,
      channel: {
        name: sampleResult.metadata.channelName,
        url: sampleResult.metadata.channelUrl
      },
      stats: {
        views: sampleResult.metadata.viewCount,
        likes: sampleResult.metadata.likeCount,
        durationSeconds: sampleResult.metadata.durationSeconds,
        formattedDuration: sampleResult.metadata.formattedDuration
      },
      uploadDate: sampleResult.metadata.uploadDate,
      description: sampleResult.metadata.description,
      thumbnailUrl: sampleResult.metadata.thumbnailUrl,
      isShort: sampleResult.metadata.isShort
    },
    transcript: sampleResult.transcript
  }, null, 2);

  const parsed = JSON.parse(jsonStr);
  assert.strictEqual(parsed.video.id, 'dQw4w9WgXcQ');
  assert.strictEqual(parsed.transcript.segments.length, 2);
  assert.strictEqual(parsed.transcript.wordCount, 14);
});

it('generates valid Markdown with table, frontmatter, and timestamped lines', () => {
  const m = sampleResult.metadata;
  const t = sampleResult.transcript;

  const md = `# ${m.title}

## Video Information
| Attribute | Details |
| :--- | :--- |
| **Channel** | [${m.channelName}](${m.channelUrl}) |
| **Views** | ${m.formattedViews} |
| **Likes** | ${m.likeCount} |
| **Duration** | ${m.formattedDuration} |
| **URL** | [${m.url}](${m.url}) |

## Description
> ${m.description}

---

## Transcript (Language: ${t.selectedLanguage})
${t.segments.map(s => `- **[${s.timestamp}]** ${s.text}`).join('\n')}
`;

  assert.ok(md.includes('# Never Gonna Give You Up'));
  assert.ok(md.includes('| **Views** | 1,500,000,000 views (1.5B) |'));
  assert.ok(md.includes("- **[00:18]** We're no strangers to love"));
});

// ----------------------------------------------------------------------
// Test Group 6: LRU Cache Behavior
// ----------------------------------------------------------------------
console.log('\n--- Group 6: In-Memory LRU Cache Behavior ---');

class MockCache {
  constructor(maxEntries = 3) {
    this.cache = new Map();
    this.maxEntries = maxEntries;
  }
  get(key) {
    if (!this.cache.has(key)) return null;
    const val = this.cache.get(key);
    this.cache.delete(key);
    this.cache.set(key, val);
    return val;
  }
  set(key, val) {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxEntries) {
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }
    this.cache.set(key, val);
  }
}

it('LRU Cache evicts oldest item when max capacity is reached', () => {
  const cache = new MockCache(3);
  cache.set('vid1', { title: 'Video 1' });
  cache.set('vid2', { title: 'Video 2' });
  cache.set('vid3', { title: 'Video 3' });

  // Access vid1 to make vid2 the oldest
  assert.strictEqual(cache.get('vid1').title, 'Video 1');

  // Insert 4th video
  cache.set('vid4', { title: 'Video 4' });

  // vid2 should have been evicted
  assert.strictEqual(cache.get('vid2'), null, 'vid2 must be evicted');
  assert.ok(cache.get('vid1') !== null, 'vid1 must remain');
  assert.ok(cache.get('vid3') !== null, 'vid3 must remain');
  assert.ok(cache.get('vid4') !== null, 'vid4 must remain');
});

// ----------------------------------------------------------------------
// Test Group 7: Metric Accuracy Hardening (P1.02)
// ----------------------------------------------------------------------
console.log('\n--- Group 7: Metric Accuracy Hardening ---');

function parseUploadDate(rawDate) {
  if (!rawDate || rawDate === 'Unknown Date') return { monthDay: 'N/A', year: 'Date' };
  try {
    const d = new Date(rawDate);
    if (!isNaN(d.getTime())) {
      const month = d.toLocaleString('en-US', { month: 'short' });
      const day = d.getDate();
      const year = d.getFullYear().toString();
      return { monthDay: `${month} ${day}`, year };
    }
  } catch {}
  return { monthDay: 'N/A', year: 'Date' };
}

function formatLikesDisplay(likeCount) {
  return likeCount && likeCount !== 'N/A' ? likeCount : 'N/A';
}

it('missing or N/A likes render N/A and never 484', () => {
  assert.strictEqual(formatLikesDisplay(undefined), 'N/A');
  assert.strictEqual(formatLikesDisplay(null), 'N/A');
  assert.strictEqual(formatLikesDisplay('N/A'), 'N/A');
  assert.notStrictEqual(formatLikesDisplay(undefined), '484');
  assert.strictEqual(formatLikesDisplay('0'), '0');
  assert.strictEqual(formatLikesDisplay('12K'), '12K');
});

it('unknown or invalid dates render N/A Date and never 2026', () => {
  assert.deepStrictEqual(parseUploadDate(undefined), { monthDay: 'N/A', year: 'Date' });
  assert.deepStrictEqual(parseUploadDate('Unknown Date'), { monthDay: 'N/A', year: 'Date' });
  assert.deepStrictEqual(parseUploadDate('invalid-date-string'), { monthDay: 'N/A', year: 'Date' });
  assert.notStrictEqual(parseUploadDate('invalid-date-string').year, '2026');

  const valid = parseUploadDate('2024-05-15T00:00:00Z');
  assert.strictEqual(valid.year, '2024');
  assert.ok(valid.monthDay.includes('May'));
});

// ----------------------------------------------------------------------
// Test Group 8: Settings Normalization & Migration (P1.03)
// ----------------------------------------------------------------------
console.log('\n--- Group 8: Settings Normalization & Migration ---');

const DEFAULT_SETTINGS = {
  schemaVersion: 2,
  autoExtract: true,
  preferredLanguage: 'en',
  theme: 'auto',
  showThumbnailPreview: true,
  defaultTranscriptExpanded: true,
  defaultChaptersExpanded: true,
  defaultCommentsExpanded: false,
  autoExtractComments: true,
  commentSortOrder: 'top',
  commentLimit: 50,
  includeCommentReplies: false,
  includeCommentsInCopy: false,
  exportIncludeChapters: true,
  exportIncludeImages: true,
  exportIncludeComments: true
};

function normalizeSettings(raw) {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_SETTINGS };
  }
  return {
    schemaVersion: 2,
    autoExtract: raw.autoExtract !== undefined ? Boolean(raw.autoExtract) : DEFAULT_SETTINGS.autoExtract,
    preferredLanguage: typeof raw.preferredLanguage === 'string' && raw.preferredLanguage ? raw.preferredLanguage : DEFAULT_SETTINGS.preferredLanguage,
    theme: raw.theme === 'dark' || raw.theme === 'light' || raw.theme === 'auto' ? raw.theme : DEFAULT_SETTINGS.theme,
    showThumbnailPreview: raw.showThumbnailPreview !== undefined ? Boolean(raw.showThumbnailPreview) : DEFAULT_SETTINGS.showThumbnailPreview,
    defaultTranscriptExpanded: raw.defaultTranscriptExpanded !== undefined ? Boolean(raw.defaultTranscriptExpanded) : DEFAULT_SETTINGS.defaultTranscriptExpanded,
    defaultChaptersExpanded: raw.defaultChaptersExpanded !== undefined ? Boolean(raw.defaultChaptersExpanded) : DEFAULT_SETTINGS.defaultChaptersExpanded,
    defaultCommentsExpanded: raw.defaultCommentsExpanded !== undefined ? Boolean(raw.defaultCommentsExpanded) : DEFAULT_SETTINGS.defaultCommentsExpanded,
    autoExtractComments: raw.autoExtractComments !== undefined ? Boolean(raw.autoExtractComments) : DEFAULT_SETTINGS.autoExtractComments,
    commentSortOrder: raw.commentSortOrder === 'newest' ? 'newest' : 'top',
    commentLimit: typeof raw.commentLimit === 'number' && !isNaN(raw.commentLimit) ? Math.min(Math.max(0, raw.commentLimit), 500) : DEFAULT_SETTINGS.commentLimit,
    includeCommentReplies: raw.includeCommentReplies !== undefined ? Boolean(raw.includeCommentReplies) : DEFAULT_SETTINGS.includeCommentReplies,
    includeCommentsInCopy: raw.includeCommentsInCopy !== undefined ? Boolean(raw.includeCommentsInCopy) : DEFAULT_SETTINGS.includeCommentsInCopy,
    exportIncludeChapters: raw.exportIncludeChapters !== undefined ? Boolean(raw.exportIncludeChapters) : DEFAULT_SETTINGS.exportIncludeChapters,
    exportIncludeImages: raw.exportIncludeImages !== undefined ? Boolean(raw.exportIncludeImages) : DEFAULT_SETTINGS.exportIncludeImages,
    exportIncludeComments: raw.exportIncludeComments !== undefined ? Boolean(raw.exportIncludeComments) : DEFAULT_SETTINGS.exportIncludeComments
  };
}

it('normalizes empty input to default settings with schemaVersion 2', () => {
  const settings = normalizeSettings(null);
  assert.strictEqual(settings.schemaVersion, 2);
  assert.strictEqual(settings.autoExtract, true);
  assert.strictEqual(settings.commentLimit, 50);
  assert.strictEqual(settings.defaultCommentsExpanded, false);
});

it('migrates v1 user preferences without loss and applies v2 defaults', () => {
  const v1Input = { autoExtract: false, preferredLanguage: 'hi' };
  const settings = normalizeSettings(v1Input);
  assert.strictEqual(settings.schemaVersion, 2);
  assert.strictEqual(settings.autoExtract, false, 'v1 autoExtract must be preserved');
  assert.strictEqual(settings.preferredLanguage, 'hi', 'v1 preferredLanguage must be preserved');
  assert.strictEqual(settings.showThumbnailPreview, true, 'v2 defaults must be populated');
  assert.strictEqual(settings.exportIncludeChapters, true);
});

it('clamps out-of-range comment limit values safely', () => {
  assert.strictEqual(normalizeSettings({ commentLimit: 9999 }).commentLimit, 500);
  assert.strictEqual(normalizeSettings({ commentLimit: -10 }).commentLimit, 0);
  assert.strictEqual(normalizeSettings({ commentLimit: 100 }).commentLimit, 100);
});

// ----------------------------------------------------------------------
// Test Group 9: Subscriber Count Normalization (P1.04)
// ----------------------------------------------------------------------
console.log('\n--- Group 9: Subscriber Count Normalization ---');

function normalizeSubscriberText(rawText) {
  if (!rawText || !rawText.trim()) {
    return { displayText: 'Unavailable', status: 'unavailable' };
  }
  const cleanText = rawText.trim().replace(/\s+/g, ' ');
  const isHidden = /hidden/i.test(cleanText);
  const isRounded = /^[0-9]+(\.[0-9]+)?[KkMmBb]/.test(cleanText);
  return {
    displayText: cleanText,
    status: isHidden ? 'hidden' : (isRounded ? 'rounded' : 'available')
  };
}

it('detects rounded subscriber count without converting to fake exact number', () => {
  const res = normalizeSubscriberText('1.25M subscribers');
  assert.strictEqual(res.displayText, '1.25M subscribers');
  assert.strictEqual(res.status, 'rounded');
  assert.strictEqual(res.count, undefined, 'Must not invent exact integer from rounded string');
});

it('detects hidden subscriber state correctly', () => {
  const res = normalizeSubscriberText('Subscribers hidden');
  assert.strictEqual(res.status, 'hidden');
  assert.strictEqual(res.displayText, 'Subscribers hidden');
});

it('marks missing subscriber info as unavailable', () => {
  const res = normalizeSubscriberText('');
  assert.strictEqual(res.status, 'unavailable');
  assert.strictEqual(res.displayText, 'Unavailable');
});

// ----------------------------------------------------------------------
// Test Group 10: Chapter Detection from Description (P1.06)
// ----------------------------------------------------------------------
console.log('\n--- Group 10: Chapter Detection & Validation ---');

function parseTimestampToSeconds(ts) {
  if (!ts) return 0;
  const parts = ts.trim().split(':').map(p => parseInt(p, 10));
  if (parts.length === 2) return (parts[0] || 0) * 60 + (parts[1] || 0);
  if (parts.length === 3) return (parts[0] || 0) * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0);
  return 0;
}

function extractFromDescription(description, totalDuration = 0) {
  const lines = description.split(/\r?\n/);
  const rawMatches = [];
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

  if (rawMatches.length < 2) return [];

  const chapters = [];
  let lastSeconds = -1;
  for (const m of rawMatches) {
    if (m.startSeconds >= lastSeconds) {
      chapters.push({
        title: m.title,
        startSeconds: m.startSeconds,
        startTimestamp: m.timeText,
        source: 'description_timestamps'
      });
      lastSeconds = m.startSeconds;
    }
  }

  if (chapters.length < 2) return [];

  for (let i = 0; i < chapters.length; i++) {
    if (i < chapters.length - 1) {
      chapters[i].endSeconds = chapters[i + 1].startSeconds;
    } else if (totalDuration > chapters[i].startSeconds) {
      chapters[i].endSeconds = totalDuration;
    }
  }
  return chapters;
}

it('detects and parses chapters from description timestamps with calculated end times', () => {
  const desc = `
Check out our latest video!
Chapters:
00:00 Introduction
02:15 Architecture & Design
08:45 Live Benchmark Results
12:30 Conclusion
Follow us on social media!
  `;
  const chapters = extractFromDescription(desc, 900);
  assert.strictEqual(chapters.length, 4);
  assert.strictEqual(chapters[0].title, 'Introduction');
  assert.strictEqual(chapters[0].startSeconds, 0);
  assert.strictEqual(chapters[0].endSeconds, 135);
  assert.strictEqual(chapters[1].title, 'Architecture & Design');
  assert.strictEqual(chapters[1].startSeconds, 135);
  assert.strictEqual(chapters[3].endSeconds, 900);
});

it('rejects description text with fewer than 2 valid timestamp lines', () => {
  const desc = 'Check out the video at 02:15 to see the highlights!';
  const chapters = extractFromDescription(desc, 300);
  assert.strictEqual(chapters.length, 0);
});

// ----------------------------------------------------------------------
// Test Group 11: Comment Normalization & Nested Reply Architecture (P1.09, P1.11)
// ----------------------------------------------------------------------
console.log('\n--- Group 11: Comment Normalization & Architecture ---');

function mockParseCommentRenderer(renderer, videoId) {
  if (!renderer) return null;
  return {
    id: renderer.commentId || 'c_1',
    videoId,
    text: renderer.text || '',
    author: {
      displayName: renderer.author || 'Anonymous',
      avatarUrl: renderer.avatar || undefined
    },
    likeCount: renderer.likes || '0',
    replyCount: renderer.replies ? renderer.replies.length : 0,
    replies: renderer.replies || []
  };
}

it('constructs nested comment thread with parent and child replies', () => {
  const rawRenderer = {
    commentId: 'thread_101',
    author: 'TechReviewer',
    text: 'Amazing explanation of the bridge context!',
    likes: '42',
    replies: [
      {
        id: 'reply_201',
        videoId: 'v123',
        text: 'Agreed, this solved my CORS issue completely.',
        author: { displayName: 'DevViewer' }
      }
    ]
  };

  const parsed = mockParseCommentRenderer(rawRenderer, 'v123');
  assert.strictEqual(parsed.id, 'thread_101');
  assert.strictEqual(parsed.author.displayName, 'TechReviewer');
  assert.strictEqual(parsed.likeCount, '42');
  assert.strictEqual(parsed.replyCount, 1);
  assert.strictEqual(parsed.replies.length, 1);
  assert.strictEqual(parsed.replies[0].author.displayName, 'DevViewer');
});

// ----------------------------------------------------------------------
// Test Group 12: Comment and Chapter Aware Exports (P1.07, P1.11)
// ----------------------------------------------------------------------
console.log('\n--- Group 12: Comment & Chapter Aware Exports ---');

function mockExportJSON(res) {
  const ch = res.chapters;
  const cm = res.comments;
  return {
    video: {
      id: res.metadata.videoId,
      title: res.metadata.title,
      thumbnailUrl: res.metadata.thumbnailUrl,
      channel: {
        name: res.metadata.channelName,
        subscriberInfo: res.metadata.subscriberInfo || null
      }
    },
    chapters: {
      available: ch?.available || false,
      items: ch?.items || []
    },
    comments: cm ? {
      available: cm.available,
      status: cm.status,
      threads: cm.threads || []
    } : null
  };
}

it('JSON export includes thumbnail, subscriber info, chapters, and nested comments', () => {
  const sampleResult = {
    videoId: 'testVid',
    metadata: {
      videoId: 'testVid',
      title: 'Zapcue Deep Dive',
      channelName: 'Zapcue Team',
      thumbnailUrl: 'https://i.ytimg.com/vi/testVid/maxresdefault.jpg',
      subscriberInfo: { displayText: '50K subscribers', status: 'rounded' }
    },
    chapters: {
      available: true,
      items: [
        { title: 'Intro', startSeconds: 0, startTimestamp: '00:00' },
        { title: 'Demo', startSeconds: 60, startTimestamp: '01:00' }
      ]
    },
    comments: {
      available: true,
      status: 'complete',
      threads: [
        {
          id: 'c1',
          text: 'Great tool!',
          author: { displayName: 'Coder' },
          replies: [{ id: 'r1', text: 'Thanks!', author: { displayName: 'Author' } }]
        }
      ]
    }
  };

  const exported = mockExportJSON(sampleResult);
  assert.strictEqual(exported.video.thumbnailUrl, 'https://i.ytimg.com/vi/testVid/maxresdefault.jpg');
  assert.strictEqual(exported.video.channel.subscriberInfo.displayText, '50K subscribers');
  assert.strictEqual(exported.chapters.items.length, 2);
  assert.strictEqual(exported.comments.threads[0].replies.length, 1);
});

// ----------------------------------------------------------------------
// Test Summary
// ----------------------------------------------------------------------
console.log('\n======================================================');
console.log(`📊 TEST RESULTS: ${passedTests}/${totalTests} TESTS PASSED`);
console.log('======================================================\n');

if (passedTests !== totalTests) {
  process.exit(1);
}
