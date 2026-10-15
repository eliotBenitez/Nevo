export interface AudioBookmark {
  id: string
  time: number
  label: string
  [key: string]: unknown
}

/** Returns usable bookmarks without modifying the persisted source array. */
export function readAudioBookmarks(value: unknown): AudioBookmark[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  return value
    .filter((entry): entry is AudioBookmark => {
      if (!entry || typeof entry !== 'object') return false
      const bookmark = entry as Record<string, unknown>
      if (typeof bookmark.id !== 'string' || !bookmark.id || seen.has(bookmark.id)
        || typeof bookmark.time !== 'number' || !Number.isFinite(bookmark.time) || bookmark.time < 0
        || typeof bookmark.label !== 'string') return false
      seen.add(bookmark.id)
      return true
    })
    .sort((a, b) => a.time - b.time)
}

export function formatAudioTime(seconds: number): string {
  const whole = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0
  const s = String(whole % 60).padStart(2, '0')
  const minutes = Math.floor(whole / 60)
  if (minutes < 60) return `${minutes}:${s}`
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}:${s}`
}
