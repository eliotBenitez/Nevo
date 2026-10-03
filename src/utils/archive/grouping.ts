const MS_PER_DAY = 24 * 60 * 60 * 1000

export type ArchiveGroupKey = 'today' | 'thisWeek' | 'earlier'

export interface ArchiveGroup<T> {
  key: ArchiveGroupKey
  items: T[]
}

/**
 * Groups items into 'today', 'thisWeek', and 'earlier' by their deletedAt timestamp.
 *
 * Uses calendar-day arithmetic in local time (matching retention.ts convention).
 * - today: items deleted on the same calendar day as `now` (daysAgo <= 0)
 * - thisWeek: items deleted 1 to 6 calendar days before `now` (1 <= daysAgo < 7)
 * - earlier: items deleted 7 or more calendar days before `now` (daysAgo >= 7)
 *
 * Preserves item order and omits empty groups.
 */
export function groupArchiveItems<T extends { item: { deletedAt: string } }>(
  items: T[],
  now: Date = new Date(),
): ArchiveGroup<T>[] {
  const refMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()

  const todayItems: T[] = []
  const thisWeekItems: T[] = []
  const earlierItems: T[] = []

  for (const item of items) {
    const deletedTime = new Date(item.item.deletedAt)
    if (Number.isNaN(deletedTime.getTime())) {
      earlierItems.push(item)
      continue
    }

    const itemMidnight = new Date(
      deletedTime.getFullYear(),
      deletedTime.getMonth(),
      deletedTime.getDate(),
    ).getTime()

    const daysAgo = Math.round((refMidnight - itemMidnight) / MS_PER_DAY)

    if (daysAgo <= 0) {
      todayItems.push(item)
    } else if (daysAgo < 7) {
      thisWeekItems.push(item)
    } else {
      earlierItems.push(item)
    }
  }

  const result: ArchiveGroup<T>[] = []
  if (todayItems.length > 0) {
    result.push({ key: 'today', items: todayItems })
  }
  if (thisWeekItems.length > 0) {
    result.push({ key: 'thisWeek', items: thisWeekItems })
  }
  if (earlierItems.length > 0) {
    result.push({ key: 'earlier', items: earlierItems })
  }

  return result
}
