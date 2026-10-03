/**
 * Keyboard navigation for the slash menu's tile (grid) layout.
 *
 * The menu renders each category as its own grid of `columns` tiles, in the
 * same flat order the slash plugin keeps (`itemIds`). Arrow keys therefore
 * move inside a category's grid and step into the neighbouring category at
 * its edges, keeping the column where possible.
 */

export type SlashGridKey = 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown'

interface GroupSpan {
  start: number
  size: number
}

/** Splits the flat item list into runs of consecutive equal categories. */
export function groupSpans(categories: readonly string[]): GroupSpan[] {
  const spans: GroupSpan[] = []
  categories.forEach((category, index) => {
    const last = spans[spans.length - 1]
    if (last && categories[last.start] === category) {
      last.size += 1
    } else {
      spans.push({ start: index, size: 1 })
    }
  })
  return spans
}

/** Returns the flat index the key moves to; wraps at both ends of the list. */
export function resolveSlashGridMove(
  categories: readonly string[],
  index: number,
  key: SlashGridKey,
  columns: number,
): number {
  const count = categories.length
  if (count === 0) return 0
  const current = Math.min(Math.max(index, 0), count - 1)

  if (key === 'ArrowRight') return (current + 1) % count
  if (key === 'ArrowLeft') return (current - 1 + count) % count

  const cols = Math.max(1, Math.floor(columns))
  const spans = groupSpans(categories)
  const groupIndex = spans.findIndex(span => current >= span.start && current < span.start + span.size)
  const group = spans[groupIndex]
  const position = current - group.start
  const row = Math.floor(position / cols)
  const column = position % cols

  if (key === 'ArrowDown') {
    const nextRowStart = (row + 1) * cols
    if (nextRowStart < group.size) {
      return group.start + Math.min(nextRowStart + column, group.size - 1)
    }
    const next = spans[(groupIndex + 1) % spans.length]
    return next.start + Math.min(column, next.size - 1)
  }

  if (row > 0) {
    return group.start + (row - 1) * cols + column
  }
  const previous = spans[(groupIndex - 1 + spans.length) % spans.length]
  const lastRow = Math.floor((previous.size - 1) / cols)
  return previous.start + Math.min(lastRow * cols + column, previous.size - 1)
}
