# ⚡ Zapcue — YouTube Metadata & Transcript Extractor

<p align="center">
  <img src="public/icons/icon128.png" width="120" height="120" alt="Zapcue Mascot Logo" />
  <br />
  <strong>Sub-second YouTube metadata & transcript extraction with native sidebar drawer UI.</strong>
</p>

[![Manifest V3](https://img.shields.io/badge/Manifest-V3-success?style=flat-square&logo=googlechrome)](https://developer.chrome.com/docs/extensions/mv3/)
[![TypeScript 5.7](https://img.shields.io/badge/TypeScript-5.7-blue?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Vite 6](https://img.shields.io/badge/Vite-6.0-646CFF?style=flat-square&logo=vite)](https://vitejs.dev/)
[![Tests Passing](https://img.shields.io/badge/Tests-11%2F11%20Passing-brightgreen?style=flat-square)](tests/extractor.test.js)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](LICENSE)

---

## 🌟 What is Zapcue?

**Zapcue** is a high-performance, privacy-first Chrome Extension (Manifest V3) that extracts rich YouTube video metadata (Title, Channel, Views, Likes, Duration, Upload Date, Description) and complete timestamped transcripts in milliseconds.

Instead of annoying floating overlays or complex cloud services, **Zapcue embeds directly into YouTube's native sidebar** (above recommended videos), perfectly matching YouTube's dark and light theme styles.

---

## 🌟 Key Features

- **⚡ Sub-Second Extraction (<20ms Metadata, ~200ms Transcript):**
  Uses an in-memory MAIN-world bridge communicating directly with YouTube's internal `movie_player` API and player response cache. Zero third-party servers, zero external HTTP dependencies.
  
- **🎯 Embedded YouTube Native Sidebar (Zero Floating Popups):**
  Neatly injected directly above related videos in YouTube's right column (`#secondary-inner`). Looks and feels like a native YouTube component with smooth drawer behavior.

- **🎨 Hand-Drawn Doodle Play Button Branding:**
  Custom-designed organic vector doodle artwork for browser icons, popup, and in-page drawer header.

- **🌓 Auto Dark / Light Theme Sync:**
  Detects YouTube's active theme attribute in real time and adapts backgrounds, text contrast, borders, and shadows dynamically (`#0f0f0f` dark mode / `#ffffff` light mode).

- **📊 3-Column Video Stats & Collapsible Description:**
  Displays high-contrast metrics for **Likes**, **Views**, and **Published Date**, alongside a collapsible description card (`...more` / `Show less`) with blue `#3ea6ff` hashtag highlights.

- **⏱️ Timestamp Toggle (Timestamps vs Continuous Text):**
  Switch between:
  - **Timestamps ON:** Clickable timestamp pills (`[00:15]`) that instantly seek the YouTube video player to that second.
  - **Timestamps OFF:** Clean, continuous paragraph text view for comfortable reading and distraction-free copying.

- **📋 1-Click Complete Package Copy:**
  Copies the entire extracted video package in one click — Video Title, Channel, Stats, URL, Description, and the complete Transcript (smartly formatted with or without timestamps according to your toggle).

- **⬇️ Split Export Button (Markdown, JSON, Plain Text):**
  - **Instant Click:** Downloads formatted Markdown (`.md`) ready for Obsidian, Notion, and Logseq.
  - **Caret Dropdown (`▾`):** Choose between Markdown (`.md`), structured JSON (`.json`), or Plain Text (`.txt`).

- **🔄 SPA Auto-Extract & Seamless Video Switching:**
  Listens to YouTube's internal `yt-navigate-finish` events. Automatically extracts data when you click any new video or Short without needing page reloads.

- **🔒 100% Private & Client-Side:**
  Runs entirely inside your browser. No data ever leaves your computer. No API keys or Google Cloud configurations required.

---

## 📸 Component Showcase & Prototypes

The project includes standalone design prototypes inside `prototypes/`:
- **`prototypes/index.html`:** Interactive 2-column YouTube layout simulator featuring live tab switching.
- **`prototypes/prototype-7-youtube-sidebar-native.html`:** The official final drawer layout matching YouTube's native design tokens.
- **`prototypes/logo-preview.html`:** Vector showcase of the hand-drawn doodle logo across light/dark themes and multiple icon resolutions.

---

## 🚀 Installation Guide

### Load Unpacked in Chrome, Brave, Edge, or Opera:

1. **Clone or download this repository:**
   ```bash
   git clone https://github.com/ilovekushgola/zapcue.git
   cd zapcue
   ```

2. **Install dependencies and compile:**
   ```bash
   npm install
   npm run build
   ```
   *(This builds the production-ready extension into the `dist/` folder in under 2 seconds).*

3. **Open Chrome Extensions Manager:**
   - In Chrome, navigate to `chrome://extensions/`
   - Enable **Developer mode** toggle in the top-right corner.

4. **Load the Extension:**
   - Click the **Load unpacked** button (top-left).
   - Select the `dist/` folder inside the `zapcue` directory.

5. **Test on YouTube:**
   - Open any YouTube video (e.g., `https://www.youtube.com/watch?v=...`) or Shorts.
   - The Zapcue Drawer will appear in the right column above recommended videos!

---

## 🏗️ Architecture & Technical Stack

```
zapcue/
├── public/
│   ├── manifest.json            # Manifest V3 configuration
│   └── icons/                   # Vector logo + generated PNGs (16, 32, 48, 128)
├── src/
│   ├── background/
│   │   └── service-worker.ts    # Background MV3 service worker
│   ├── content/
│   │   ├── bridge.ts            # MAIN-world script reading movie_player & playerResponse
│   │   ├── index.ts             # Content script coordinator & SPA navigation listener
│   │   ├── extractor/
│   │   │   ├── cache.ts         # In-memory LRU cache (<5ms subsequent visits)
│   │   │   ├── metadata.ts      # Metadata extractor (Title, Channel, Views, Likes, Date)
│   │   │   └── transcript.ts    # Multi-stage hybrid caption extractor
│   │   ├── ui/
│   │   │   ├── panel.ts         # Native drawer component state machine
│   │   │   ├── shadow-host.ts   # Shadow DOM attachment inside #secondary-inner
│   │   │   └── styles.css       # Isolated Shadow DOM styles matching YouTube tokens
│   │   └── utils/
│   │       ├── clipboard.ts     # Safe clipboard write helper
│   │       ├── export.ts        # MD, JSON, TXT formatters and Blob download trigger
│   │       └── time.ts          # Seconds-to-timestamp and compact number formatters
│   ├── popup/
│   │   ├── popup.html           # Extension action popup with Doodle branding
│   │   ├── popup.css            # Dark themed popup styling
│   │   └── popup.ts             # Settings persistence (Auto-extract, Preferred Language)
│   └── types/
│       └── index.ts             # Unified TypeScript data interfaces
├── scripts/
│   ├── build.js                 # Rollup/Vite multi-bundle packager
│   └── generate-icons.js        # High-DPI icon generator using sharp
├── tests/
│   └── extractor.test.js        # 11-stage automated verification suite
├── prototypes/                  # UI prototypes and layout simulators
└── package.json
```

### Multi-Stage Transcript Extraction Cascade:
1. **DOM Scrape:** Inspects `ytd-transcript-segment-renderer` if transcript is already open.
2. **Programmatic Trigger:** Clicks YouTube's native "Show transcript" button in the description section to fetch authentic captions without triggering anti-bot hurdles.
3. **Internal `timedtext` API:** Parses JSON3 caption track events with credentials included.

---

## 📊 Export Formats

### 1. Markdown (`.md`)
```markdown
# China's AX8860 AI Chip vs NVIDIA DGX Spark

## Video Information
| Attribute | Details |
| :--- | :--- |
| **Channel** | [RedSwitches](https://www.youtube.com/channel/...) |
| **Views** | 31,250 views (31.3K) |
| **Likes** | 484 |
| **Duration** | 24:35 |
| **Published** | 2026-10-20 |
| **URL** | https://www.youtube.com/watch?v=... |
| **Extracted** | 2026-10-21T21:46:05.000Z |

## Description
> Can China's new AI chip challenge NVIDIA?
> The Axera AX8860 is making headlines...

---

## Transcript (Language: en • Words: 1,120)
- **[00:00]** Can China's new artificial intelligence chip genuinely challenge NVIDIA?
- **[00:45]** The Axera AX8860 has been making major headlines worldwide...
```

### 2. JSON (`.json`)
```json
{
  "extractedAt": "2026-10-21T21:46:05.000Z",
  "video": {
    "id": "dQw4w9WgXcQ",
    "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "title": "China's AX8860 AI Chip vs NVIDIA DGX Spark",
    "channel": {
      "name": "RedSwitches",
      "url": "https://www.youtube.com/channel/..."
    },
    "stats": {
      "views": 31250,
      "likes": "484",
      "durationSeconds": 1475,
      "formattedDuration": "24:35"
    },
    "uploadDate": "2026-10-20",
    "description": "Can China's new AI chip challenge NVIDIA?...",
    "isShort": false
  },
  "transcript": {
    "available": true,
    "language": "en",
    "wordCount": 1120,
    "segments": [
      {
        "start": 0.0,
        "duration": 4.5,
        "timestamp": "00:00",
        "text": "Can China's new artificial intelligence chip genuinely challenge NVIDIA?"
      }
    ]
  }
}
```

### 3. Plain Text (`.txt`)
```text
======================================================================
TITLE:       China's AX8860 AI Chip vs NVIDIA DGX Spark
CHANNEL:     RedSwitches
VIEWS:       31,250 views (31.3K)
LIKES:       484
DURATION:    24:35
PUBLISHED:   2026-10-20
URL:         https://www.youtube.com/watch?v=...
EXTRACTED:   2026-10-21T21:46:05.000Z
======================================================================

--- DESCRIPTION ---
Can China's new AI chip challenge NVIDIA?
The Axera AX8860 is making headlines...

--- TRANSCRIPT ---
[00:00] Can China's new artificial intelligence chip genuinely challenge NVIDIA?
[00:45] The Axera AX8860 has been making major headlines worldwide...
```

---

## 🧪 Testing & Verification

Run the built-in test suite:
```bash
npm test
```

### Test Coverage (11/11 Passing):
- **Group 1:** Distribution & Manifest V3 structure validation.
- **Group 2:** Time math (`MM:SS`, `HH:MM:SS`) & compact view count conversions.
- **Group 3:** HTML entity decoding without text corruption.
- **Group 4:** JSON3 event stream parser into timestamped segment arrays.
- **Group 5:** Filename sanitization, valid JSON roundtrip, Markdown generation.
- **Group 6:** In-memory LRU cache capacity and eviction rules.

---

## 📄 License

MIT License. Free and open source for developers and researchers.
Created with ❤️ by [Lovekush Gola](https://github.com/ilovekushgola).
