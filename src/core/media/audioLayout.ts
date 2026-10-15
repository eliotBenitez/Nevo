import { readAudioBookmarks } from './audioBookmarks'

/**
 * Persisted preference on an audio `media_block`.
 *
 * `auto` (the schema default) keeps legacy notes unchanged: the bookmarks
 * panel shows only when the block already has bookmarks, so an untouched
 * empty block reads as a plain player and a block with bookmarks keeps its
 * panel. `player` and `bookmarks` are explicit user choices, stored so the
 * layout survives reloads.
 */
export type AudioLayout = 'auto' | 'player' | 'bookmarks'

/** The concrete layout a block renders, after resolving `auto`. */
export type ResolvedAudioLayout = 'player' | 'bookmarks'

/** Normalizes an unknown persisted value; anything unrecognized is `auto`. */
export function readAudioLayout(value: unknown): AudioLayout {
  return value === 'player' || value === 'bookmarks' ? value : 'auto'
}

/**
 * Resolves the persisted preference into a concrete layout. `auto` defers to
 * the presence of valid bookmarks so the choice never needs a write on open.
 */
export function resolveAudioLayout(value: unknown, bookmarks: unknown): ResolvedAudioLayout {
  const layout = readAudioLayout(value)
  if (layout !== 'auto') return layout
  return readAudioBookmarks(bookmarks).length > 0 ? 'bookmarks' : 'player'
}
