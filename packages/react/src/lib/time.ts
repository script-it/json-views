/**
 * ISO-8601 datetime shape: `2026-07-05T13:05:56Z`, with optional fractional
 * seconds and either a `Z` or `±HH[:]MM` offset (a timezone-less string parses
 * as local time). Date-only strings and epoch numbers are deliberately NOT
 * matched — bare `2026-07-05` or a 13-digit integer could just as well be an
 * identifier, and misformatting data is worse than leaving it raw.
 */
const ISO_DATETIME_RE =
  /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?(Z|[+-]\d{2}:?\d{2})?$/

/**
 * Parse a value as an ISO-8601 datetime string. Returns the epoch millis, or
 * null when the value isn't a string in ISO datetime shape.
 */
export function parseIsoDateString(value: unknown): number | null {
  if (typeof value !== 'string' || !ISO_DATETIME_RE.test(value)) return null
  const ms = Date.parse(value)
  return Number.isNaN(ms) ? null : ms
}

/**
 * Format an epoch-millis timestamp as a readable local date-time, e.g.
 * "Jul 5, 2026, 1:05 PM" (locale-dependent).
 */
export function formatAbsoluteTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

/** Compact relative form: "just now", "12s ago", "2m ago", "3h ago", "5d ago",
 *  else a local date. Sub-minute rendering is per-surface: the default
 *  `'seconds'` shows "12s ago" (with "just now" under 5s) for surfaces where
 *  events land moments apart (e.g. a trigger's run history);
 *  `'just-now'` collapses everything under a minute for surfaces where
 *  second-level churn is noise (e.g. file modification times). */
export function formatRelativeTimeShort(
  timestamp: number,
  { subMinute = 'seconds' }: { subMinute?: 'seconds' | 'just-now' } = {},
): string {
  const now = Date.now()
  const diffSeconds = Math.floor((now - timestamp) / 1000)
  const diffMinutes = Math.floor(diffSeconds / 60)
  const diffHours = Math.floor(diffMinutes / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffSeconds < 60) {
    if (subMinute === 'just-now' || diffSeconds < 5) return 'just now'
    return `${diffSeconds}s ago`
  }
  if (diffMinutes < 60) return `${diffMinutes}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return new Date(timestamp).toLocaleDateString()
}

/**
 * Short relative form ("2m ago") for past timestamps, null for future ones —
 * "ago" phrasing makes no sense for a time that hasn't happened yet.
 */
export function formatRelativeTimeShortIfPast(timestamp: number): string | null {
  return timestamp <= Date.now() ? formatRelativeTimeShort(timestamp) : null
}
