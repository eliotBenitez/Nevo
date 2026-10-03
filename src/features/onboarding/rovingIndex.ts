/**
 * Shared arrow-key roving-tabindex math for the create-workspace wizard's
 * radiogroups (glyph, colour, template) and tablist (step tabs). Kept
 * framework-agnostic so it is trivial to unit-test and reuse across the
 * handful of grouped controls on the screen.
 */

const NEXT_KEYS = new Set(['ArrowRight', 'ArrowDown'])
const PREV_KEYS = new Set(['ArrowLeft', 'ArrowUp'])

/**
 * Given the key pressed and the current index within a group of `count`
 * items, returns the next index to select/focus, skipping indices for which
 * `isEnabled` returns false (defaults to all enabled). Returns null when the
 * key isn't a roving-navigation key, or when no enabled index exists.
 */
export function nextRovingIndex(
  key: string,
  current: number,
  count: number,
  isEnabled: (index: number) => boolean = () => true,
): number | null {
  const delta = NEXT_KEYS.has(key) ? 1 : PREV_KEYS.has(key) ? -1 : 0
  if (delta === 0 || count <= 0) return null
  for (let step = 1, next = current; step <= count; step += 1) {
    next = (next + delta + count) % count
    if (isEnabled(next)) return next
  }
  return null
}
