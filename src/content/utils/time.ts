// Time and Number Formatting Utilities

/**
 * Formats a duration in seconds to standard MM:SS or HH:MM:SS string.
 */
export function formatDuration(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return '00:00';

  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  const pad = (n: number) => n.toString().padStart(2, '0');

  if (hrs > 0) {
    return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
  }
  return `${pad(mins)}:${pad(secs)}`;
}

/**
 * Formats seconds into timestamp format for transcript segments (MM:SS or HH:MM:SS).
 */
export function formatTimestamp(seconds: number): string {
  return formatDuration(seconds);
}

/**
 * Formats a raw number with commas (e.g. 1245000 -> "1,245,000").
 */
export function formatNumberWithCommas(num: number): string {
  if (isNaN(num)) return '0';
  return num.toLocaleString();
}

/**
 * Formats a raw number into human-readable shorthand (e.g. 1245000 -> "1.2M").
 */
export function formatCompactNumber(num: number): string {
  if (isNaN(num)) return '0';
  if (num < 1000) return num.toString();
  if (num < 1000000) return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  if (num < 1000000000) return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
  return (num / 1000000000).toFixed(1).replace(/\.0$/, '') + 'B';
}
