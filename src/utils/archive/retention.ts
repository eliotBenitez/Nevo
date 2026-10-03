const MS_PER_DAY = 24 * 60 * 60 * 1000

export type RetentionTone = 'none' | 'normal' | 'soon' | 'last'

/**
 * Calculates remaining days before an archived item is purged permanently.
 *
 * @param deletedAt - ISO-8601 timestamp string when the item was moved to trash/archive.
 * @param retentionDays - Days to retain (from workspace settings; 0 means keep forever).
 * @param now - Reference date (defaults to current system time).
 * @returns Days remaining (integer >= 0), or null if retention is 0 (keep forever) or deletedAt is invalid.
 */
export function daysUntilPurge(
  deletedAt: string,
  retentionDays: number,
  now: Date = new Date(),
): number | null {
  if (retentionDays <= 0) return null

  const deletedTime = new Date(deletedAt).getTime()
  if (Number.isNaN(deletedTime)) return null

  const elapsedDays = Math.floor((now.getTime() - deletedTime) / MS_PER_DAY)
  const remaining = retentionDays - elapsedDays

  return Math.max(0, remaining)
}

/**
 * Categorizes remaining retention days into visual tone levels.
 *
 * - null -> 'none' (retention is unlimited)
 * - > 7 -> 'normal' (plenty of time)
 * - 2..7 -> 'soon' (warning color)
 * - <= 1 -> 'last' (danger color, urgent)
 */
export function retentionTone(days: number | null): RetentionTone {
  if (days === null) return 'none'
  if (days > 7) return 'normal'
  if (days >= 2) return 'soon'
  return 'last'
}
