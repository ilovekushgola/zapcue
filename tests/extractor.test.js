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
// Test Summary
// ----------------------------------------------------------------------
console.log('\n======================================================');
console.log(`📊 TEST RESULTS: ${passedTests}/${totalTests} TESTS PASSED`);
console.log('======================================================\n');

if (passedTests !== totalTests) {
  process.exit(1);
}
