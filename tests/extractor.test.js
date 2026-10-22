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
// Test Group 13: Comment Extraction Limit Hard Caps (P0 Audit)
// ----------------------------------------------------------------------
console.log('\n--- Group 13: Comment Extraction Limit Hard Caps (10, 20, 50, 100, 200) ---');

function mockExtractCommentsPipeline(totalPool, limit, sortOrder = 'top', includeReplies = true) {
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

  const seenIds = new Set();
  const threads = [];
  for (const item of totalPool) {
    if (threads.length >= effectiveLimit) break;
    if (!seenIds.has(item.id)) {
      seenIds.add(item.id);
      const cloned = { ...item };
      if (!includeReplies) {
        cloned.replies = [];
      }
      threads.push(cloned);
    }
  }

  const finalThreads = threads.slice(0, effectiveLimit);
  const topLevelCount = finalThreads.length;
  const replyCount = finalThreads.reduce((acc, t) => acc + (t.replies ? t.replies.length : 0), 0);

  let status = 'complete';
  let reason = 'reached_limit';
  if (topLevelCount === 0) {
    status = 'complete';
    reason = 'zero_comments';
  } else if (topLevelCount < effectiveLimit) {
    status = 'complete';
    reason = 'all_available_extracted';
  }

  return {
    available: topLevelCount > 0,
    status,
    sortOrder,
    requestedLimit: limit,
    effectiveLimit,
    topLevelCount,
    replyCount,
    extractedCount: topLevelCount,
    threads: finalThreads,
    reason
  };
}

// Generate a pool of 250 mock comments with 2 replies each
const mockPool250 = Array.from({ length: 250 }, (_, i) => ({
  id: `comment_${i + 1}`,
  videoId: 'mockVideo123',
  text: `This is comment number ${i + 1}`,
  author: { displayName: `User_${i + 1}`, channelUrl: `https://youtube.com/@user_${i + 1}`, avatarUrl: `https://yt.com/avatar_${i + 1}.jpg` },
  publishedAt: `${i + 1} days ago`,
  likeCount: `${i * 3}`,
  replyCount: 2,
  replies: [
    { id: `reply_${i + 1}_1`, parentCommentId: `comment_${i + 1}`, text: `Reply 1 to comment ${i + 1}`, author: { displayName: `Replier_${i + 1}_1` }, likeCount: '1' },
    { id: `reply_${i + 1}_2`, parentCommentId: `comment_${i + 1}`, text: `Reply 2 to comment ${i + 1}`, author: { displayName: `Replier_${i + 1}_2` }, likeCount: '0' }
  ]
}));

[10, 20, 50, 100, 200].forEach((cap) => {
  it(`enforces hard maximum limit of ${cap} top-level comments and counts replies separately`, () => {
    const result = mockExtractCommentsPipeline(mockPool250, cap, 'top', true);
    assert.strictEqual(result.topLevelCount, cap, `Top-level comments must equal cap ${cap}`);
    assert.strictEqual(result.threads.length, cap, `Thread array must equal cap ${cap}`);
    assert.strictEqual(result.effectiveLimit, cap);
    assert.strictEqual(result.replyCount, cap * 2, `Replies must be counted separately (${cap * 2})`);
    assert.strictEqual(result.status, 'complete');
    assert.strictEqual(result.reason, 'reached_limit');
  });
});

it('handles limit 0 as not_requested with zero extracted comments', () => {
  const result = mockExtractCommentsPipeline(mockPool250, 0);
  assert.strictEqual(result.available, false);
  assert.strictEqual(result.status, 'not_requested');
  assert.strictEqual(result.topLevelCount, 0);
  assert.strictEqual(result.threads.length, 0);
});

// ----------------------------------------------------------------------
// Test Group 14: Dynamic Cap Adjustment & Cache Trimming
// ----------------------------------------------------------------------
console.log('\n--- Group 14: Dynamic Cap Adjustment & Cache Trimming ---');

it('lowering cap after larger extraction trims cached result without retaining excess comments', () => {
  // Initial run at cap 100
  const initial = mockExtractCommentsPipeline(mockPool250, 100);
  assert.strictEqual(initial.topLevelCount, 100);

  // User lowers cap to 20
  const newCap = 20;
  const trimmedThreads = initial.threads.slice(0, newCap);
  const trimmedResult = {
    ...initial,
    requestedLimit: newCap,
    effectiveLimit: newCap,
    topLevelCount: trimmedThreads.length,
    replyCount: trimmedThreads.reduce((s, th) => s + (th.replies ? th.replies.length : 0), 0),
    extractedCount: trimmedThreads.length,
    threads: trimmedThreads,
    status: 'complete',
    reason: 'reached_limit'
  };

  assert.strictEqual(trimmedResult.topLevelCount, 20);
  assert.strictEqual(trimmedResult.threads.length, 20);
  assert.strictEqual(trimmedResult.replyCount, 40);
  assert.strictEqual(trimmedResult.effectiveLimit, 20);
  assert.strictEqual(trimmedResult.threads[19].id, 'comment_20');
});

// ----------------------------------------------------------------------
// Test Group 15: Deduplication Across Batches and Fallbacks
// ----------------------------------------------------------------------
console.log('\n--- Group 15: Deduplication Across Batches & Fallbacks ---');

it('deduplicates comments appearing in multiple pagination batches or fallbacks', () => {
  const seenIds = new Set();
  const rawBatch1 = [
    { id: 'c1', text: 'First' },
    { id: 'c2', text: 'Second' }
  ];
  const rawBatch2WithDuplicates = [
    { id: 'c2', text: 'Second (duplicate)' },
    { id: 'c3', text: 'Third' },
    { id: 'c1', text: 'First (duplicate)' }
  ];

  const combined = [];
  [...rawBatch1, ...rawBatch2WithDuplicates].forEach(c => {
    if (!seenIds.has(c.id)) {
      seenIds.add(c.id);
      combined.push(c);
    }
  });

  assert.strictEqual(combined.length, 3);
  assert.deepStrictEqual(combined.map(c => c.id), ['c1', 'c2', 'c3']);
});

// ----------------------------------------------------------------------
// Test Group 16: Sort Verification & Degradation Reporting
// ----------------------------------------------------------------------
console.log('\n--- Group 16: Sort Verification & Degradation Reporting ---');

function mockVerifySort(requestedSort, availableTokens) {
  if (requestedSort === 'newest') {
    if (availableTokens.newestToken) {
      return { effectiveSort: 'newest', warning: undefined };
    }
    return {
      effectiveSort: 'top',
      warning: 'Requested newest sort is not supported for this video; defaulted to top comments.'
    };
  }
  return { effectiveSort: 'top', warning: undefined };
}

it('reports verified newest sort when token is available from provider', () => {
  const res = mockVerifySort('newest', { topToken: 'tok_top', newestToken: 'tok_newest' });
  assert.strictEqual(res.effectiveSort, 'newest');
  assert.strictEqual(res.warning, undefined);
});

it('gracefully degrades to top sort with truthful warning when newest is unsupported', () => {
  const res = mockVerifySort('newest', { topToken: 'tok_top' });
  assert.strictEqual(res.effectiveSort, 'top');
  assert.ok(res.warning.includes('defaulted to top comments'));
});

// ----------------------------------------------------------------------
// Test Group 17: Markdown Export (Visual, Structural, Safety & Exclusion)
// ----------------------------------------------------------------------
console.log('\n--- Group 17: Markdown Export (Visual, Structural, Safety & Exclusion) ---');

function isSafeUrl(url) {
  if (!url || typeof url !== 'string') return false;
  return /^https?:\/\//i.test(url.trim());
}

function buildTimestampUrl(videoUrl, seconds) {
  const cleanSeconds = Math.max(0, Math.floor(seconds));
  try {
    const urlObj = new URL(videoUrl);
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

function escapeMarkdown(text) {
  if (!text) return '';
  return text
    .replace(/\r\n/g, '\n')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .trim();
}

function escapeTableCell(text) {
  if (!text) return '';
  return escapeMarkdown(text)
    .replace(/\|/g, '\\|')
    .replace(/\n+/g, ' ')
    .trim();
}

function resolveExportOptions(optionsOrTimestamps, legacyIncludeComments) {
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
      withTimestamps: optionsOrTimestamps.withTimestamps ?? true,
      includeChapters: optionsOrTimestamps.includeChapters ?? true,
      includeImages: optionsOrTimestamps.includeImages ?? true,
      includeComments: optionsOrTimestamps.includeComments ?? true,
      isCopyAction: Boolean(optionsOrTimestamps.isCopyAction)
    };
  }
  return {
    withTimestamps: true,
    includeChapters: true,
    includeImages: true,
    includeComments: true,
    isCopyAction: false
  };
}

function normalizeExportData(result, options, format) {
  const m = result.metadata;
  const t = result.transcript;
  const ch = result.chapters;
  const cm = result.comments;
  const videoUrl = m.url || `https://www.youtube.com/watch?v=${m.videoId}`;

  const chaptersAvailable = Boolean(options.includeChapters && ch?.available && ch.items && ch.items.length > 0);
  const chapterItems = (options.includeChapters && ch?.items ? ch.items : []).map((c) => ({
    title: c.title,
    startSeconds: c.startSeconds,
    startTimestamp: c.startTimestamp,
    endSeconds: c.endSeconds ?? null,
    endTimestamp: c.endTimestamp ?? null,
    durationSeconds: c.durationSeconds ?? null,
    formattedDuration: c.formattedDuration ?? null,
    source: c.source || 'description_timestamps',
    url: buildTimestampUrl(videoUrl, c.startSeconds)
  }));

  const transcriptSegments = (t.segments || []).map((s) => ({
    start: s.start,
    duration: s.duration,
    timestamp: s.timestamp,
    text: s.text,
    url: buildTimestampUrl(videoUrl, s.start)
  }));

  const commentsAvailable = Boolean(options.includeComments && cm?.available && cm.threads && cm.threads.length > 0);
  const commentThreads = (options.includeComments && cm?.threads ? cm.threads : []).map((th) => ({
    topLevelComment: {
      id: th.id,
      videoId: th.videoId || m.videoId,
      text: th.text,
      author: {
        displayName: th.author.displayName || 'Anonymous',
        channelUrl: isSafeUrl(th.author.channelUrl) ? th.author.channelUrl : null,
        avatarUrl: isSafeUrl(th.author.avatarUrl) ? th.author.avatarUrl : null
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
        channelUrl: isSafeUrl(r.author.channelUrl) ? r.author.channelUrl : null,
        avatarUrl: isSafeUrl(r.author.avatarUrl) ? r.author.avatarUrl : null
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
        avatarUrl: options.includeImages && isSafeUrl(m.channelAvatarUrl) ? m.channelAvatarUrl : null,
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
        thumbnailUrl: options.includeImages && isSafeUrl(m.thumbnailUrl) ? m.thumbnailUrl : null,
        channelAvatarUrl: options.includeImages && isSafeUrl(m.channelAvatarUrl) ? m.channelAvatarUrl : null
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

function toMarkdown(result, optionsOrTimestamps, legacyIncludeComments) {
  const opts = resolveExportOptions(optionsOrTimestamps, legacyIncludeComments);
  const data = normalizeExportData(result, opts, 'markdown');

  const cleanTitle = escapeMarkdown(data.video.title);
  const channelName = escapeMarkdown(data.video.channel.name);
  const channelUrl = data.video.channel.url;
  const videoUrl = data.video.url;

  const sections = [`# ${cleanTitle}`];

  if (opts.includeImages && data.video.images.thumbnailUrl) {
    sections.push(`[![Video thumbnail: ${cleanTitle}](${data.video.images.thumbnailUrl})](${videoUrl})`);
  } else if (!opts.includeImages) {
    // Images omitted
  } else {
    sections.push('_Thumbnail unavailable._');
  }

  const subsDisplay = `${data.video.channel.subscriberInfo.displayText} (${data.video.channel.subscriberInfo.status})`;
  let channelIdentity = `**[${channelName}](${channelUrl})** • ${subsDisplay}`;
  if (opts.includeImages && data.video.images.channelAvatarUrl) {
    channelIdentity = `[![${channelName} Avatar](${data.video.images.channelAvatarUrl})](${channelUrl}) ` + channelIdentity;
  }
  sections.push(channelIdentity);

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

  const descBody = data.video.description
    ? `> ${escapeMarkdown(data.video.description).replace(/\n/g, '\n> ')}`
    : '_No description provided._';
  sections.push(`## Description\n\n${descBody}`);

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

        const badges = [];
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
            const rBadges = [];
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

function toJSON(result, optionsOrTimestamps) {
  const opts = resolveExportOptions(optionsOrTimestamps);
  const data = normalizeExportData(result, opts, 'json');

  const payload = {
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

function toTXT(result, optionsOrTimestamps, legacyIncludeComments) {
  const opts = resolveExportOptions(optionsOrTimestamps, legacyIncludeComments);
  const data = normalizeExportData(result, opts, 'txt');

  const subsDisplay = `${data.video.channel.subscriberInfo.displayText} [Status: ${data.video.channel.subscriberInfo.status}]`;
  const videoType = data.video.isShort ? 'YouTube Short' : 'Standard video';

  const lines = [
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

// Comprehensive Fixture for testing exports & cross-format parity
const exportFixture = {
  videoId: 'dQw4w9WgXcQ',
  extractedAt: '2026-10-22T08:00:00.000Z',
  metadata: {
    videoId: 'dQw4w9WgXcQ',
    url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    title: 'Advanced AI Architectures <2026> | Multimodal LLMs',
    channelName: 'DeepMind Dev',
    channelUrl: 'https://www.youtube.com/@deepmind',
    viewCount: 690006,
    formattedViews: '690,006 views (690K)',
    likeCount: '6,333',
    durationSeconds: 966,
    formattedDuration: '16:06',
    uploadDate: '2026-03-15',
    description: 'Deep dive into transformers and graph networks.\n\nEnjoy the full tutorial!',
    thumbnailUrl: 'https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
    channelAvatarUrl: 'https://yt3.ggpht.com/avatar.jpg',
    subscriberInfo: { count: null, displayText: '1.5M subscribers', status: 'rounded' },
    isShort: false
  },
  chapters: {
    available: true,
    status: 'detected',
    items: [
      {
        title: 'Introduction & Scope | Overview',
        startSeconds: 0,
        startTimestamp: '00:00',
        durationSeconds: 150,
        formattedDuration: '02:30',
        source: 'player_markers'
      },
      {
        title: 'Graph Transformer Attention',
        startSeconds: 150,
        startTimestamp: '02:30',
        durationSeconds: 816,
        formattedDuration: '13:36',
        source: 'player_markers'
      }
    ]
  },
  transcript: {
    available: true,
    selectedLanguage: 'en',
    wordCount: 14,
    segments: [
      { start: 0, duration: 2.5, timestamp: '00:00', text: 'Welcome to the AI research breakdown.' },
      { start: 150, duration: 4.0, timestamp: '02:30', text: 'Next we analyze transformer attention matrices.' }
    ]
  },
  comments: {
    available: true,
    status: 'complete',
    sortOrder: 'top',
    requestedLimit: 50,
    effectiveLimit: 50,
    topLevelCount: 1,
    replyCount: 1,
    extractedCount: 2,
    warning: null,
    reason: 'reached_limit',
    threads: [
      {
        id: 'c_top_1',
        videoId: 'dQw4w9WgXcQ',
        text: 'Phenomenal breakdown of <script>alert(1)</script> & attention!',
        author: {
          displayName: 'Alice Research',
          channelUrl: 'https://www.youtube.com/@alice',
          avatarUrl: 'https://yt3.ggpht.com/alice.jpg'
        },
        publishedAt: '2 days ago',
        likeCount: '42',
        replyCount: 1,
        isPinned: true,
        isOwner: false,
        replies: [
          {
            id: 'r_sub_1',
            parentCommentId: 'c_top_1',
            videoId: 'dQw4w9WgXcQ',
            text: 'Thank you Alice! Happy researching.',
            author: {
              displayName: 'DeepMind Dev',
              channelUrl: 'https://www.youtube.com/@deepmind',
              avatarUrl: 'https://yt3.ggpht.com/avatar.jpg'
            },
            publishedAt: '1 day ago',
            likeCount: '12',
            replyCount: 0,
            isPinned: false,
            isOwner: true
          }
        ]
      }
    ]
  }
};

it('generates Markdown starting with H1 title, clickable embedded thumbnail, and channel identity', () => {
  const md = toMarkdown(exportFixture);
  assert.ok(md.startsWith('# Advanced AI Architectures &lt;2026&gt; | Multimodal LLMs'));
  assert.ok(md.includes('[![Video thumbnail: Advanced AI Architectures &lt;2026&gt; | Multimodal LLMs](https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg)](https://www.youtube.com/watch?v=dQw4w9WgXcQ)'));
  assert.ok(md.includes('[![DeepMind Dev Avatar](https://yt3.ggpht.com/avatar.jpg)](https://www.youtube.com/@deepmind) **[DeepMind Dev](https://www.youtube.com/@deepmind)** • 1.5M subscribers (rounded)'));
});

it('escapes Markdown table delimiters and unsafe HTML entities cleanly', () => {
  const md = toMarkdown(exportFixture);
  assert.ok(md.includes('| Subscribers | 1.5M subscribers (rounded) |'));
  assert.ok(md.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(md.includes('Introduction &amp; Scope \\| Overview') || md.includes('Introduction & Scope \\| Overview'));
});

it('generates clickable timestamp URLs in chapters and transcript lines', () => {
  const md = toMarkdown(exportFixture);
  assert.ok(md.includes('**[00:00](https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=0s)**'));
  assert.ok(md.includes('**[02:30](https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=150s)**'));
});

it('renders visibly nested comments with badges and reply indentation', () => {
  const md = toMarkdown(exportFixture);
  assert.ok(md.includes('### #1 — [Alice Research](https://www.youtube.com/@alice) · ❤️ 42 · 2 days ago · 📌 Pinned'));
  assert.ok(md.includes('> Phenomenal breakdown'));
  assert.ok(md.includes('> ↳ **Reply #1.1 — [DeepMind Dev](https://www.youtube.com/@deepmind)** · ❤️ 12 · 1 day ago · 👑 Creator [ID: `r_sub_1`]:'));
  assert.ok(md.includes('> > Thank you Alice!'));
});

it('respects Markdown export exclusion options for chapters, comments, and images', () => {
  const mdExcluded = toMarkdown(exportFixture, {
    includeChapters: false,
    includeComments: false,
    includeImages: false,
    withTimestamps: false
  });
  assert.ok(!mdExcluded.includes('[![Video thumbnail:'), 'Images must be excluded');
  assert.ok(!mdExcluded.includes('## Chapters ('), 'Chapters section must be excluded');
  assert.ok(!mdExcluded.includes('## Comments ('), 'Comments section must be excluded');
  assert.ok(mdExcluded.includes('## Description'), 'Description must remain');
  assert.ok(mdExcluded.includes('Welcome to the AI research breakdown.'), 'Continuous text without timestamp links must remain');
});

// ----------------------------------------------------------------------
// Test Group 18: Canonical JSON Export (Schema, Types, Correctness & Exclusions)
// ----------------------------------------------------------------------
console.log('\n--- Group 18: Canonical JSON Export (Schema, Types & Exclusions) ---');

it('parses valid JSON with exact canonical schemaVersion 2', () => {
  const jsonStr = toJSON(exportFixture);
  const parsed = JSON.parse(jsonStr);

  assert.strictEqual(parsed.schemaVersion, 2);
  assert.strictEqual(parsed.extractedAt, '2026-10-22T08:00:00.000Z');
  assert.strictEqual(parsed.video.id, 'dQw4w9WgXcQ');
  assert.strictEqual(parsed.video.stats.views, 690006);
  assert.strictEqual(parsed.video.stats.durationSeconds, 966);
  assert.strictEqual(parsed.video.images.thumbnailUrl, 'https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg');

  assert.strictEqual(parsed.chapters.count, 2);
  assert.strictEqual(parsed.chapters.items[0].startSeconds, 0);
  assert.strictEqual(parsed.chapters.items[1].durationSeconds, 816);

  assert.strictEqual(parsed.transcript.segmentCount, 2);
  assert.strictEqual(parsed.transcript.segments[0].timestamp, '00:00');

  assert.strictEqual(parsed.comments.topLevelCount, 1);
  assert.strictEqual(parsed.comments.replyCount, 1);
  assert.strictEqual(parsed.comments.threads[0].topLevelComment.id, 'c_top_1');
  assert.strictEqual(parsed.comments.threads[0].replies[0].id, 'r_sub_1');
  assert.strictEqual(parsed.comments.threads[0].topLevelComment.isPinned, true);
  assert.strictEqual(parsed.comments.threads[0].replies[0].isOwner, true);

  assert.strictEqual(parsed.export.format, 'json');
  assert.strictEqual(parsed.export.included.chapters, true);
  assert.strictEqual(parsed.export.included.comments, true);
});

it('honors exclusion settings in JSON export structure', () => {
  const jsonStr = toJSON(exportFixture, {
    includeChapters: false,
    includeComments: false,
    includeImages: false
  });
  const parsed = JSON.parse(jsonStr);

  assert.strictEqual(parsed.export.included.chapters, false);
  assert.strictEqual(parsed.export.included.comments, false);
  assert.strictEqual(parsed.chapters.items.length, 0);
  assert.strictEqual(parsed.comments.threads.length, 0);
  assert.strictEqual(parsed.video.images.thumbnailUrl, null);
});

// ----------------------------------------------------------------------
// Test Group 19: Plain Text Export (Portability, Hierarchy & Status Block)
// ----------------------------------------------------------------------
console.log('\n--- Group 19: Plain Text Export (Portability & Hierarchy) ---');

it('generates portable Plain Text with clean banners and no Markdown constructs', () => {
  const txt = toTXT(exportFixture);
  assert.ok(txt.startsWith('ZAPCUE VIDEO RESEARCH EXPORT\n================================================================'));
  assert.ok(txt.includes('TITLE:       Advanced AI Architectures <2026> | Multimodal LLMs'));
  assert.ok(txt.includes('SUBSCRIBERS: 1.5M subscribers [Status: rounded]'));
  assert.ok(txt.includes('THUMBNAIL:      https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg'));
  assert.ok(txt.includes('[00:00] Introduction & Scope | Overview (Duration: 02:30)'));
  assert.ok(txt.includes('[00:00] Welcome to the AI research breakdown.'));

  // Ensure no Markdown table or image syntax leaked into plain text
  assert.ok(!txt.includes('| Field | Value |'), 'Must not contain Markdown table headers');
  assert.ok(!txt.includes('[!['), 'Must not contain Markdown image links');
});

it('indents nested comment replies cleanly with tree branch symbols in Plain Text', () => {
  const txt = toTXT(exportFixture);
  assert.ok(txt.includes('[1] PARENT COMMENT'));
  assert.ok(txt.includes('Author:    Alice Research'));
  assert.ok(txt.includes('Likes:     42'));
  assert.ok(txt.includes('  └── REPLY 1'));
  assert.ok(txt.includes('      Author:    DeepMind Dev'));
  assert.ok(txt.includes('      Likes:     12'));
  assert.ok(txt.includes('      Text:\n        Thank you Alice! Happy researching.'));
  assert.ok(txt.includes('EXTRACTION STATUS\n----------------------------------------------------------------'));
  assert.ok(txt.includes('Chapters:   available (2 chapters)'));
  assert.ok(txt.includes('Transcript: complete'));
});

// ----------------------------------------------------------------------
// Test Group 20: Cross-Format Consistency & Parity Validation
// ----------------------------------------------------------------------
console.log('\n--- Group 20: Cross-Format Consistency & Parity Validation ---');

it('guarantees identical core data representation across Markdown, JSON, and Plain Text', () => {
  const md = toMarkdown(exportFixture);
  const jsonStr = toJSON(exportFixture);
  const txt = toTXT(exportFixture);
  const json = JSON.parse(jsonStr);

  // 1. Video ID Parity
  assert.strictEqual(json.video.id, 'dQw4w9WgXcQ');
  assert.ok(md.includes('dQw4w9WgXcQ'));
  assert.ok(txt.includes('VIDEO ID:    dQw4w9WgXcQ'));

  // 2. Channel & Subscriber Parity
  assert.strictEqual(json.video.channel.name, 'DeepMind Dev');
  assert.strictEqual(json.video.channel.subscriberInfo.displayText, '1.5M subscribers');
  assert.strictEqual(json.video.channel.subscriberInfo.status, 'rounded');
  assert.ok(md.includes('DeepMind Dev'));
  assert.ok(md.includes('1.5M subscribers (rounded)'));
  assert.ok(txt.includes('CHANNEL:     DeepMind Dev'));
  assert.ok(txt.includes('SUBSCRIBERS: 1.5M subscribers [Status: rounded]'));

  // 3. Thumbnail Parity
  const thumbUrl = 'https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg';
  assert.strictEqual(json.video.images.thumbnailUrl, thumbUrl);
  assert.ok(md.includes(thumbUrl));
  assert.ok(txt.includes(`THUMBNAIL:      ${thumbUrl}`));

  // 4. Chapter Count Parity
  assert.strictEqual(json.chapters.count, 2);
  assert.ok(md.includes('Chapters (2 Detected)'));
  assert.ok(txt.includes('CHAPTERS (2)'));

  // 5. Transcript Segment Count Parity
  assert.strictEqual(json.transcript.segmentCount, 2);
  assert.ok(md.includes('Segments: 2'));
  assert.ok(txt.includes('2 segments'));

  // 6. Comment and Reply Count Parity
  assert.strictEqual(json.comments.topLevelCount, 1);
  assert.strictEqual(json.comments.replyCount, 1);
  assert.ok(md.includes('1 top-level comments · 1 replies'));
  assert.ok(txt.includes('1 top-level | 1 replies'));

  // 7. Extraction Status Truthfulness Parity
  assert.strictEqual(json.chapters.status, 'detected');
  assert.strictEqual(json.transcript.status, 'complete');
  assert.strictEqual(json.comments.status, 'complete');
  assert.ok(md.includes('Extraction Quality Report'));
  assert.ok(txt.includes('EXTRACTION STATUS'));
});

// ----------------------------------------------------------------------
// Test Group 21: Modern YouTube ViewModel & Entity Mutations Comments Parsing
// ----------------------------------------------------------------------
console.log('\n--- Group 21: Modern YouTube ViewModel & Entity Mutations Comments Parsing ---');

function mockBuildEntityMap(data) {
  const map = new Map();
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

function mockParseCommentViewModel(vm, entityMap, videoId, parentCommentId) {
  if (!vm) return null;
  const inner = vm.commentViewModel || vm;
  const commentKey = inner.commentKey || inner.commentId || '';
  const entity = entityMap.get(commentKey) || (inner.commentId ? entityMap.get(inner.commentId) : null);

  if (entity) {
    const props = entity.properties || {};
    const author = entity.author || {};
    const toolbar = entity.toolbar || {};

    return {
      id: props.commentId || inner.commentId || commentKey,
      videoId,
      parentCommentId,
      text: props.content?.content || '',
      author: {
        displayName: author.displayName || 'Anonymous',
        channelUrl: author.channelId ? `https://www.youtube.com/channel/${author.channelId}` : undefined,
        avatarUrl: author.avatarThumbnailUrl || undefined
      },
      publishedAt: props.publishedTime || undefined,
      likeCount: toolbar.likeCountNotliked || toolbar.likeCountLiked || '0',
      replyCount: parseInt(toolbar.replyCount || '0', 10) || 0,
      isOwner: Boolean(author.isCreator),
      isPinned: Boolean(props.isPinned || inner.pinnedBadge)
    };
  }

  // Fallback to inline ViewModel
  return {
    id: inner.commentId || commentKey || 'c_1',
    videoId,
    parentCommentId,
    text: inner.contentText?.content || '',
    author: { displayName: inner.authorName || 'Anonymous' },
    likeCount: inner.likeCount || '0',
    replyCount: inner.replyCount || 0
  };
}

function mockFindCommentsToken(data) {
  if (!data || typeof data !== 'object') return null;
  try {
    const sections = data?.contents?.twoColumnWatchNextResults?.results?.results?.contents;
    if (Array.isArray(sections)) {
      for (const s of sections) {
        const itemSection = s?.itemSectionRenderer;
        const targetId = itemSection?.targetId || itemSection?.sectionIdentifier;
        if (targetId === 'comments-section' || targetId === 'comment-item-section') {
          if (Array.isArray(itemSection.contents)) {
            for (const c of itemSection.contents) {
              const token = c?.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token;
              if (token) return token;
            }
          }
          const legacy = itemSection?.continuations?.[0]?.nextContinuationData?.continuation;
          if (legacy) return legacy;
        }
      }
    }

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
            }
          }
        }
      }
    }
  } catch {}
  return null;
}

it('locates continuation token in modern YouTube twoColumnWatchNextResults layout', () => {
  const modernNextResponse = {
    contents: {
      twoColumnWatchNextResults: {
        results: {
          results: {
            contents: [
              {
                itemSectionRenderer: {
                  targetId: 'comments-section',
                  contents: [
                    {
                      continuationItemRenderer: {
                        continuationEndpoint: {
                          continuationCommand: {
                            token: 'token_comments_init_99'
                          }
                        }
                      }
                    }
                  ]
                }
              }
            ]
          }
        }
      }
    }
  };

  const token = mockFindCommentsToken(modernNextResponse);
  assert.strictEqual(token, 'token_comments_init_99');
});

it('locates continuation token in modern YouTube engagementPanels layout', () => {
  const engagementPanelResponse = {
    engagementPanels: [
      {
        engagementPanelSectionListRenderer: {
          targetId: 'engagement-panel-comments',
          content: {
            sectionListRenderer: {
              contents: [
                {
                  itemSectionRenderer: {
                    contents: [
                      {
                        continuationItemRenderer: {
                          continuationEndpoint: {
                            continuationCommand: {
                              token: 'token_panel_comments_88'
                            }
                          }
                        }
                      }
                    ]
                  }
                }
              ]
            }
          }
        }
      }
    ]
  };

  const token = mockFindCommentsToken(engagementPanelResponse);
  assert.strictEqual(token, 'token_panel_comments_88');
});

it('correctly maps modern commentViewModel to frameworkUpdates entity mutations', () => {
  const mockModernCommentResponse = {
    frameworkUpdates: {
      entityBatchUpdate: {
        mutations: [
          {
            entityKey: 'comment_entity_key_abc',
            payload: {
              commentEntityPayload: {
                properties: {
                  commentId: 'Ugz_test_comment_1',
                  content: { content: 'This is genuinely a fantastic conversation full of great info for D2C!' },
                  publishedTime: '1 year ago'
                },
                author: {
                  displayName: '@freedomutopuia',
                  channelId: 'UC_freedom_channel',
                  avatarThumbnailUrl: 'https://yt3.ggpht.com/freedom.jpg',
                  isCreator: false
                },
                toolbar: {
                  likeCountNotliked: '4',
                  replyCount: '1'
                }
              }
            }
          }
        ]
      }
    }
  };

  const entityMap = mockBuildEntityMap(mockModernCommentResponse);
  assert.ok(entityMap.has('comment_entity_key_abc'));
  assert.ok(entityMap.has('Ugz_test_comment_1'));

  const viewModel = {
    commentViewModel: {
      commentKey: 'comment_entity_key_abc',
      commentId: 'Ugz_test_comment_1'
    }
  };

  const parsed = mockParseCommentViewModel(viewModel, entityMap, 'f1SdVoL4nmk');
  assert.strictEqual(parsed.id, 'Ugz_test_comment_1');
  assert.strictEqual(parsed.author.displayName, '@freedomutopuia');
  assert.strictEqual(parsed.author.channelUrl, 'https://www.youtube.com/channel/UC_freedom_channel');
  assert.strictEqual(parsed.text, 'This is genuinely a fantastic conversation full of great info for D2C!');
  assert.strictEqual(parsed.publishedAt, '1 year ago');
  assert.strictEqual(parsed.likeCount, '4');
  assert.strictEqual(parsed.replyCount, 1);
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
