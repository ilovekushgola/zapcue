import { ExtractorResult } from '../../types';

// In-Memory LRU Cache for Ultra-Fast Retrieval (<5ms)
class ExtractorCache {
  private cache = new Map<string, ExtractorResult>();
  private readonly maxEntries: number;

  constructor(maxEntries = 25) {
    this.maxEntries = maxEntries;
  }

  private makeKey(videoId: string, lang = ''): string {
    return `${videoId}_${lang}`;
  }

  get(videoId: string, lang = ''): ExtractorResult | null {
    const key = this.makeKey(videoId, lang);
    const item = this.cache.get(key);
    if (!item) return null;

    // Refresh position for LRU
    this.cache.delete(key);
    this.cache.set(key, item);
    return item;
  }

  set(videoId: string, result: ExtractorResult, lang = ''): void {
    const key = this.makeKey(videoId, lang);

    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxEntries) {
      // Evict oldest entry (first key in iteration)
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) this.cache.delete(oldestKey);
    }

    this.cache.set(key, result);
  }

  clear(): void {
    this.cache.clear();
  }
}

export const memoryCache = new ExtractorCache();
