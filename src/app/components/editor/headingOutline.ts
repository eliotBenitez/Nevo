import type { Node as ProseMirrorNode } from 'prosemirror-model'

export interface HeadingOutlineItem {
  pos: number
  level: number
  text: string
}

/** Every heading in document order, including ones nested in containers. */
export function collectHeadingOutline(doc: ProseMirrorNode): HeadingOutlineItem[] {
  const items: HeadingOutlineItem[] = []
  doc.descendants((node, pos) => {
    if (node.type.name === 'heading') {
      items.push({ pos, level: Number(node.attrs.level) || 1, text: node.textContent.trim() })
    }
    return !node.isTextblock
  })
  return items
}

/** Index of the last heading whose top has scrolled to or above `threshold`, or -1. */
export function findActiveHeadingIndex(tops: readonly number[], threshold: number): number {
  let active = -1
  for (let i = 0; i < tops.length; i++) {
    if (tops[i] > threshold) break
    active = i
  }
  return active
}
