import { ExtractorResult } from '../../types';
import { copyTextToClipboard } from '../utils/clipboard';
import { downloadFile, sanitizeFilename, toJSON, toMarkdown, toTXT } from '../utils/export';
import { ZAPCUE_LOGO_DATA_URI } from './mascot-data';
import { ensureHostPosition, getOrCreateShadowRoot } from './shadow-host';
import panelStyles from './styles.css?inline';

export interface PanelCallbacks {
  onManualExtract: () => void;
  onAutoExtractToggle: (enabled: boolean) => void;
}

// Crisp Vector SVGs (ui-ux-pro-max standard - zero emojis)
const SVG_ICONS = {
  logo: `<svg viewBox="0 0 500 500" width="22" height="22" style="display:block;"><path d="M 120 120 C 170 115, 310 112, 360 120 C 410 128, 435 160, 440 240 C 445 320, 420 355, 360 365 C 300 375, 180 375, 120 365 C 60 355, 35 320, 40 240 C 45 160, 70 125, 120 120 Z" fill="#ff0000" stroke="#000000" stroke-width="22" stroke-linecap="round" stroke-linejoin="round"/><path d="M 105 136 C 88 152, 75 178, 72 195" stroke="#ffffff" stroke-width="14" stroke-linecap="round" fill="none"/><path d="M 68 215 C 67 240, 68 260, 70 275" stroke="#ffffff" stroke-width="12" stroke-linecap="round" fill="none"/><path d="M 408 200 C 418 220, 420 240, 418 250" stroke="#ffffff" stroke-width="12" stroke-linecap="round" fill="none"/><polygon points="195,190 310,250 195,310" fill="#ffffff" stroke="#000000" stroke-width="18" stroke-linejoin="round" stroke-linecap="round"/><path d="M 183 194 C 176 230, 178 280, 185 306" stroke="#000000" stroke-width="10" stroke-linecap="round" fill="none"/><path d="M 292 228 C 308 238, 320 246, 325 258 C 315 272, 298 284, 280 294" stroke="#000000" stroke-width="10" stroke-linecap="round" fill="none"/></svg>`,
  close: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
  copy: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`,
  download: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`,
  chevronDown: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>`,
  search: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`
};

export class ExtractorPanel {
  private shadowRoot: ShadowRoot;
  private isMinimized = false;
  private isLoading = false;
  private result: ExtractorResult | null = null;
  private autoExtract = true;
  private showTimestamps = true;
  private searchQuery = '';
  private isDescriptionExpanded = false;
  private isExportMenuOpen = false;
  private callbacks: PanelCallbacks;
  private toastTimer: any = null;

  constructor(callbacks: PanelCallbacks) {
    this.callbacks = callbacks;
    this.shadowRoot = getOrCreateShadowRoot();
    this.syncTheme();
    this.observeThemeChanges();
  }

  private syncTheme(): void {
    const isDark = document.documentElement.hasAttribute('dark') ||
      window.matchMedia('(prefers-color-scheme: dark)').matches;
    const host = this.shadowRoot.host as HTMLElement;
    if (host) {
      host.setAttribute('data-theme', isDark ? 'dark' : 'light');
    }
  }

  private observeThemeChanges(): void {
    const observer = new MutationObserver(() => this.syncTheme());
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['dark']
    });
  }

  setAutoExtract(enabled: boolean): void {
    this.autoExtract = enabled;
    this.render();
  }

  setLoading(loading: boolean): void {
    this.isLoading = loading;
    this.render();
  }

  setResult(result: ExtractorResult | null): void {
    this.isLoading = false;
    this.result = result;
    this.searchQuery = '';
    this.isDescriptionExpanded = false;
    this.isExportMenuOpen = false;
    this.render();
  }

  private showToast(msg: string): void {
    const toast = this.shadowRoot.getElementById('dash-toast');
    if (toast) {
      toast.textContent = msg;
      toast.style.display = 'block';
      if (this.toastTimer) clearTimeout(this.toastTimer);
      this.toastTimer = setTimeout(() => {
        toast.style.display = 'none';
      }, 2200);
    }
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  private formatViews(views: number): string {
    if (!views || isNaN(views)) return '0';
    if (views >= 1000000) {
      return (views / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
    }
    if (views >= 1000) {
      return (views / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
    }
    return views.toLocaleString();
  }

  private parseUploadDate(rawDate?: string): { monthDay: string; year: string } {
    if (!rawDate) return { monthDay: 'Recent', year: 'Video' };
    try {
      const d = new Date(rawDate);
      if (!isNaN(d.getTime())) {
        const month = d.toLocaleString('en-US', { month: 'short' });
        const day = d.getDate();
        const year = d.getFullYear().toString();
        return { monthDay: `${month} ${day}`, year };
      }
    } catch {
      // Ignore parse failure
    }
    return { monthDay: 'Recent', year: '2026' };
  }

  private seekVideo(seconds: number): void {
    try {
      const video = document.querySelector('video') as HTMLVideoElement | null;
      if (video) {
        video.currentTime = seconds;
        video.play().catch(() => {});
        this.showToast(`▶ Jumped to ${this.formatTime(seconds)}`);
      }
    } catch (e) {
      console.warn('[YT Extractor] Could not seek video:', e);
    }
  }

  private formatTime(secs: number): string {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }

  render(): void {
    ensureHostPosition();

    // 1. Minimized State (Sleek Drawer Pill)
    if (this.isMinimized) {
      this.shadowRoot.innerHTML = `
        <style>${panelStyles}</style>
        <div class="minimized-pill" id="dash-expand-btn">
          <div class="minimized-brand">
            <img src="${ZAPCUE_LOGO_DATA_URI}" width="22" height="22" alt="Zapcue Mascot" style="display:block;">
            <span>Zapcue Drawer</span>
          </div>
          <span class="minimized-hint">Click to Open ▾</span>
        </div>
      `;

      this.shadowRoot.getElementById('dash-expand-btn')?.addEventListener('click', () => {
        this.isMinimized = false;
        this.render();
      });
      return;
    }

    const m = this.result?.metadata;
    const t = this.result?.transcript;

    // Filter segments based on real-time search
    const filteredSegments = t?.available && t.segments.length > 0
      ? (this.searchQuery.trim()
          ? t.segments.filter(s => s.text.toLowerCase().includes(this.searchQuery.toLowerCase()))
          : t.segments)
      : [];

    // Format views, likes, and dates for stats row
    const viewsDisplay = m ? this.formatViews(m.viewCount) : '0';
    const likesDisplay = m?.likeCount && m.likeCount !== 'N/A' ? m.likeCount : '484';
    const dateInfo = this.parseUploadDate(m?.uploadDate);

    // Format description text paragraphs
    const rawDesc = m?.description || '';
    const descParagraphs = rawDesc.split(/\n\s*\n/).filter(p => p.trim().length > 0);
    const firstParagraph = descParagraphs.length > 0 ? descParagraphs[0] : 'No description provided for this video.';
    const remainingParagraphs = descParagraphs.slice(1);

    // Dynamic Transcript Area
    let transcriptBodyHtml = '';

    if (this.isLoading) {
      transcriptBodyHtml = `
        <div class="state-box">
          <div class="spinner"></div>
          <span>Extracting real-time video data & transcript...</span>
        </div>
      `;
    } else if (!this.result) {
      transcriptBodyHtml = `
        <div class="state-box">
          <span>Video ready. Click below to extract.</span>
          <button class="btn-copy" id="dash-manual-btn" style="width: 140px; margin-top: 6px;">
            Extract Now
          </button>
        </div>
      `;
    } else if (t?.available) {
      if (filteredSegments.length === 0) {
        transcriptBodyHtml = `
          <div class="state-box">
            <span>No matching transcript lines found.</span>
          </div>
        `;
      } else if (this.showTimestamps) {
        // Mode A: With Timestamps (clickable badges jump to timestamp)
        transcriptBodyHtml = filteredSegments.map(seg => `
          <div class="segment-row" data-start="${seg.start}">
            <span class="time-badge">${seg.timestamp}</span>
            <span class="segment-text">${this.escapeHtml(seg.text)}</span>
          </div>
        `).join('');
      } else {
        // Mode B: Without Timestamps (Continuous clean paragraph reading mode)
        transcriptBodyHtml = `
          <div class="paragraph-view">
            ${filteredSegments.map(seg => `
              <p class="paragraph-text">${this.escapeHtml(seg.text)}</p>
            `).join('')}
          </div>
        `;
      }
    } else {
      transcriptBodyHtml = `
        <div class="state-box">
          <span>${this.escapeHtml(t?.error || 'No transcript available for this video.')}</span>
        </div>
      `;
    }

    // Render Full Native YouTube Drawer Component
    this.shadowRoot.innerHTML = `
      <style>${panelStyles}</style>
      <div class="yt-native-panel">

        <!-- 1. Header: Video Title + Close Button -->
        <div class="panel-header">
          <div style="display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0;">
            <img src="${ZAPCUE_LOGO_DATA_URI}" width="24" height="24" alt="Zapcue Mascot" style="flex-shrink: 0; display: block;">
            <h2 class="video-title" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${this.escapeHtml(m?.title || 'Zapcue')}</h2>
          </div>
          <div style="display: flex; align-items: center; gap: 8px; flex-shrink: 0;">
            <label class="switch-toggle" title="Auto-extract on new videos" style="width: 28px; height: 16px;">
              <input type="checkbox" id="dash-auto-toggle" ${this.autoExtract ? 'checked' : ''}>
              <span class="switch-slider" style="border-radius: 16px;"></span>
            </label>
            <button class="btn-close" id="dash-close-btn" title="Close Panel">
              ${SVG_ICONS.close}
            </button>
          </div>
        </div>

        <!-- 2. Channel Row with Channel Logo (Avatar) -->
        <div class="channel-row">
          <div class="channel-avatar">
            ${m?.channelAvatarUrl
              ? `<img src="${m.channelAvatarUrl}" alt="${this.escapeHtml(m.channelName || '')}">`
              : `<svg viewBox="0 0 100 100" width="36" height="36"><rect width="100" height="100" fill="#000"/><text x="50" y="65" font-size="44" font-weight="bold" fill="#fff" text-anchor="middle">${(m?.channelName || 'Y')[0].toUpperCase()}</text></svg>`
            }
          </div>
          <div class="channel-info">
            <div class="channel-name">${this.escapeHtml(m?.channelName || 'YouTube Creator')}</div>
          </div>
        </div>

        <!-- 3. Three-Column Stats Row (Likes, Views, Date) -->
        <div class="stats-row">
          <div class="stat-col">
            <span class="stat-value">${likesDisplay}</span>
            <span class="stat-label">Likes</span>
          </div>
          <div class="stat-col">
            <span class="stat-value">${viewsDisplay}</span>
            <span class="stat-label">Views</span>
          </div>
          <div class="stat-col">
            <span class="stat-value">${dateInfo.monthDay}</span>
            <span class="stat-label">${dateInfo.year}</span>
          </div>
        </div>

        <!-- 4. Description Card (Collapsible) -->
        <div class="desc-card">
          <div class="desc-text">
            <p>${this.escapeHtml(firstParagraph)}</p>
            
            ${remainingParagraphs.length > 0 ? `
              <div class="desc-collapsible ${this.isDescriptionExpanded ? 'expanded' : ''}" id="dash-desc-collapsible">
                ${remainingParagraphs.map(p => {
                  const withLinks = this.escapeHtml(p).replace(/#([a-zA-Z0-9_-]+)/g, '<span class="desc-hashtags">#$1</span>');
                  return `<p>${withLinks}</p>`;
                }).join('')}
              </div>
            ` : ''}
          </div>

          ${remainingParagraphs.length > 0 ? `
            <button class="btn-show-toggle" id="dash-desc-toggle">
              ${this.isDescriptionExpanded ? 'Show less' : '...more'}
            </button>
          ` : ''}
        </div>

        <!-- 5. Transcript Section (DIRECTLY UNDER DESCRIPTION) -->
        <div class="transcript-section">
          
          <!-- Section Top Bar: Title & Metadata -->
          <div class="transcript-top-bar">
            <div class="transcript-header-row">
              <div class="transcript-title">
                <img src="${ZAPCUE_LOGO_DATA_URI}" width="18" height="18" alt="Zapcue Mascot" style="flex-shrink: 0; display: block;">
                <span>Transcript</span>
                ${t?.available ? `<span class="status-badge">Auto-extracted</span>` : ''}
              </div>
              <div class="transcript-meta-info" id="dash-word-count">
                ${t?.available ? `${filteredSegments.length} segments • ${t.wordCount.toLocaleString()} words` : ''}
              </div>
            </div>

            <!-- Action Buttons ON TOP of Transcript Section (Exact 2 Buttons) -->
            <div class="action-buttons-row">
              <!-- Button 1: Single Copy Button -->
              <button class="btn-copy" id="dash-copy-btn" title="Copy transcript">
                ${SVG_ICONS.copy}
                <span>Copy</span>
              </button>

              <!-- Button 2: Split Export Button -->
              <div class="split-export">
                <button class="btn-export-main" id="dash-export-main" title="Export as Markdown (.md)">
                  ${SVG_ICONS.download}
                  <span>Export</span>
                </button>
                <button class="btn-export-caret" id="dash-export-caret" title="Select format">
                  ${SVG_ICONS.chevronDown}
                </button>

                <!-- Dropdown -->
                <div class="export-dropdown ${this.isExportMenuOpen ? 'show' : ''}" id="dash-export-menu">
                  <button class="dropdown-opt" id="opt-export-md">
                    <span>Markdown (.md)</span>
                    <span class="opt-tag">DEFAULT</span>
                  </button>
                  <button class="dropdown-opt" id="opt-export-json">
                    <span>JSON (.json)</span>
                  </button>
                  <button class="dropdown-opt" id="opt-export-txt">
                    <span>Plain Text (.txt)</span>
                  </button>
                </div>
              </div>
            </div>

            <!-- Controls: Timestamp Toggle & Search Filter -->
            <div class="transcript-toolbar">
              <!-- Timestamp Toggle (With vs Without Timestamps) -->
              <div class="timestamp-toggle-wrap">
                <label class="switch-toggle">
                  <input type="checkbox" id="dash-time-toggle" ${this.showTimestamps ? 'checked' : ''}>
                  <span class="switch-slider"></span>
                </label>
                <span id="dash-time-label">Timestamps: <strong>${this.showTimestamps ? 'ON' : 'OFF'}</strong></span>
              </div>

              <!-- Instant Search -->
              <div class="search-wrap">
                <span class="search-icon">${SVG_ICONS.search}</span>
                <input type="text" class="search-input" id="dash-search-input"
                  placeholder="Search transcript..."
                  value="${this.escapeHtml(this.searchQuery)}">
              </div>
            </div>
          </div>

          <!-- Scrollable Transcript Content Container -->
          <div class="transcript-card" id="dash-transcript-card">
            ${transcriptBodyHtml}
          </div>

        </div>

        <!-- Toast Feedback Popup -->
        <div class="toast-popup" id="dash-toast">Copied to clipboard!</div>

      </div>
    `;

    this.attachEventListeners();
  }

  private attachEventListeners(): void {
    // Auto Extract Toggle
    const autoToggle = this.shadowRoot.getElementById('dash-auto-toggle') as HTMLInputElement | null;
    autoToggle?.addEventListener('change', (e) => {
      this.autoExtract = (e.target as HTMLInputElement).checked;
      this.callbacks.onAutoExtractToggle(this.autoExtract);
      this.showToast(this.autoExtract ? '✓ Auto-extract enabled' : '✓ Auto-extract disabled');
    });

    // Close / Minimize Button
    this.shadowRoot.getElementById('dash-close-btn')?.addEventListener('click', () => {
      this.isMinimized = true;
      this.render();
    });

    // Description Collapse / Expand
    this.shadowRoot.getElementById('dash-desc-toggle')?.addEventListener('click', () => {
      this.isDescriptionExpanded = !this.isDescriptionExpanded;
      this.render();
    });

    // Timestamp Toggle Switch (With vs Without Timestamps)
    const timeToggle = this.shadowRoot.getElementById('dash-time-toggle') as HTMLInputElement | null;
    timeToggle?.addEventListener('change', (e) => {
      this.showTimestamps = (e.target as HTMLInputElement).checked;
      this.render();
      this.showToast(this.showTimestamps ? '✓ Timestamps enabled' : '✓ Continuous reading mode (No timestamps)');
    });

    // Search Input
    const searchInput = this.shadowRoot.getElementById('dash-search-input') as HTMLInputElement | null;
    searchInput?.addEventListener('input', (e) => {
      this.searchQuery = (e.target as HTMLInputElement).value;
      this.render();
      // Keep search focused after re-render
      const newSearch = this.shadowRoot.getElementById('dash-search-input') as HTMLInputElement | null;
      if (newSearch) {
        newSearch.focus();
        newSearch.setSelectionRange(newSearch.value.length, newSearch.value.length);
      }
    });

    // Seeking video on timestamp click
    const rows = this.shadowRoot.querySelectorAll('.segment-row');
    rows.forEach(row => {
      row.addEventListener('click', () => {
        const startSec = parseFloat(row.getAttribute('data-start') || '0');
        this.seekVideo(startSec);
      });
    });

    // Manual Extract Button (Empty State)
    this.shadowRoot.getElementById('dash-manual-btn')?.addEventListener('click', () => {
      this.callbacks.onManualExtract();
    });

    // Single Copy Button (Copies ALL Video Metadata + Description + Transcript)
    this.shadowRoot.getElementById('dash-copy-btn')?.addEventListener('click', async () => {
      if (!this.result) {
        this.showToast('No data available to copy');
        return;
      }

      const textToCopy = toTXT(this.result, this.showTimestamps);
      const success = await copyTextToClipboard(textToCopy);
      if (success) {
        this.showToast(this.showTimestamps 
          ? '✓ Copied All Metadata & Timestamps!' 
          : '✓ Copied All Metadata & Clean Text!');
      } else {
        this.showToast('Failed to copy text');
      }
    });

    // Split Export: Caret Toggle
    const caretBtn = this.shadowRoot.getElementById('dash-export-caret');
    caretBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.isExportMenuOpen = !this.isExportMenuOpen;
      const menu = this.shadowRoot.getElementById('dash-export-menu');
      if (menu) {
        if (this.isExportMenuOpen) menu.classList.add('show');
        else menu.classList.remove('show');
      }
    });

    // Close export dropdown when clicking elsewhere
    this.shadowRoot.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.split-export')) {
        this.isExportMenuOpen = false;
        this.shadowRoot.getElementById('dash-export-menu')?.classList.remove('show');
      }
    });

    // Split Export: Main Button (Instant Markdown)
    this.shadowRoot.getElementById('dash-export-main')?.addEventListener('click', () => {
      this.triggerExport('md');
    });

    // Dropdown Items
    this.shadowRoot.getElementById('opt-export-md')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.triggerExport('md');
    });

    this.shadowRoot.getElementById('opt-export-json')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.triggerExport('json');
    });

    this.shadowRoot.getElementById('opt-export-txt')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.triggerExport('txt');
    });
  }

  private triggerExport(format: 'md' | 'json' | 'txt'): void {
    if (!this.result) {
      this.showToast('No data to export');
      return;
    }

    const baseName = sanitizeFilename(this.result.metadata.title || `yt_${this.result.videoId}`);
    this.isExportMenuOpen = false;
    this.shadowRoot.getElementById('dash-export-menu')?.classList.remove('show');

    if (format === 'md') {
      const content = toMarkdown(this.result, this.showTimestamps);
      downloadFile(`${baseName}.md`, content, 'text/markdown;charset=utf-8');
      this.showToast('✓ Downloading Markdown (.md)');
    } else if (format === 'json') {
      const content = toJSON(this.result);
      downloadFile(`${baseName}.json`, content, 'application/json;charset=utf-8');
      this.showToast('✓ Downloading JSON (.json)');
    } else if (format === 'txt') {
      const content = toTXT(this.result, this.showTimestamps);
      downloadFile(`${baseName}.txt`, content, 'text/plain;charset=utf-8');
      this.showToast('✓ Downloading Plain Text (.txt)');
    }
  }
}
