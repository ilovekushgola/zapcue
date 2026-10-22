import { ZapcueSettings } from '../types';

export const CURRENT_SETTINGS_SCHEMA_VERSION = 2;

export const DEFAULT_SETTINGS: ZapcueSettings = {
  schemaVersion: CURRENT_SETTINGS_SCHEMA_VERSION,
  // General
  autoExtract: true,
  preferredLanguage: 'en',
  theme: 'auto',
  // Panel layout
  showThumbnailPreview: true,
  defaultTranscriptExpanded: true,
  defaultChaptersExpanded: true,
  defaultCommentsExpanded: false,
  // Comments
  autoExtractComments: true,
  commentSortOrder: 'top',
  commentLimit: 50,
  includeCommentReplies: false,
  includeCommentsInCopy: false,
  // Export
  exportIncludeChapters: true,
  exportIncludeImages: true,
  exportIncludeComments: true
};

/**
 * Migrates and normalizes any raw or older version settings to the current schema.
 */
export function normalizeSettings(raw: any): ZapcueSettings {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_SETTINGS };
  }

  return {
    schemaVersion: CURRENT_SETTINGS_SCHEMA_VERSION,
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

/**
 * Loads settings from chrome.storage.local with automatic migration.
 */
export async function getSettings(): Promise<ZapcueSettings> {
  return new Promise((resolve) => {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(null, (allData) => {
        const normalized = normalizeSettings(allData);
        resolve(normalized);
      });
    } else {
      resolve({ ...DEFAULT_SETTINGS });
    }
  });
}

/**
 * Updates settings in chrome.storage.local.
 */
export async function saveSettings(partial: Partial<ZapcueSettings>): Promise<ZapcueSettings> {
  const current = await getSettings();
  const updated = normalizeSettings({ ...current, ...partial });
  return new Promise((resolve) => {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set(updated, () => {
        resolve(updated);
      });
    } else {
      resolve(updated);
    }
  });
}

/**
 * Resets settings to default values.
 */
export async function resetSettings(): Promise<ZapcueSettings> {
  const defaults = { ...DEFAULT_SETTINGS };
  return new Promise((resolve) => {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.clear(() => {
        chrome.storage.local.set(defaults, () => {
          resolve(defaults);
        });
      });
    } else {
      resolve(defaults);
    }
  });
}
