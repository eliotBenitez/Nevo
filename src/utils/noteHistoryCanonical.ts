import type { BlockNode } from '../types/note'

/** Reasons a 'changed' row differs, in report order. Several may apply at once. */
export type HistoryBlockChangeKind = 'text' | 'type' | 'attrs' | 'marks' | 'structure'

/** Recursively sorts object keys and drops `undefined` values so equal data
 *  produces an equal string regardless of key order. Arrays keep their order. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value))
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entryValue]) => entryValue !== undefined)
      .map(([key, entryValue]) => [key, canonicalize(entryValue)] as const)
      .sort(([a], [b]) => a.localeCompare(b))
    return Object.fromEntries(entries)
  }
  return value
}

/** Canonical, recursive shape of a node used for both the block signature
 *  and change-kind detection. `{}`/`null`/missing `attrs` and `[]`/`null`/missing
 *  `marks` normalize to `null` so they compare equal. */
export interface NormalizedNode {
  type: string
  attrs: Record<string, unknown> | null
  marks: { type: string; attrs: Record<string, unknown> | null }[] | null
  text: string | null
  content: NormalizedNode[] | null
}

export function normalizeNode(block: BlockNode): NormalizedNode {
  return {
    type: block.type,
    attrs: normalizeAttrsOrNull(block.attrs),
    marks: normalizeMarksOrNull(block.marks),
    text: block.text ?? null,
    content: block.content?.length ? block.content.map(normalizeNode) : null,
  }
}

export function normalizeAttrsOrNull(attrs?: Record<string, unknown>): Record<string, unknown> | null {
  if (!attrs || !Object.keys(attrs).length) return null
  return attrs
}

function normalizeMarksOrNull(marks: BlockNode['marks']): { type: string; attrs: Record<string, unknown> | null }[] | null {
  if (!marks || !marks.length) return null
  return marks.map(mark => ({ type: mark.type, attrs: normalizeAttrsOrNull(mark.attrs) }))
}

/** Same node tree with `attrs` (and optionally `marks`) removed at every
 *  level, used to isolate whether a difference is purely attrs/marks or a
 *  genuine structural difference (reordering, nesting, added/removed children). */
function stripNode(node: NormalizedNode, omitMarks: boolean): unknown {
  return {
    type: node.type,
    marks: omitMarks ? undefined : node.marks,
    text: node.text,
    content: node.content ? node.content.map(child => stripNode(child, omitMarks)) : null,
  }
}

interface ComparableBlockLike {
  type: string
  text: string
  attrs: Record<string, unknown>
}

/**
 * Explains why a 'changed' row differs, in this precedence: `type` and `text`
 * are independent top-level checks; `attrs` compares the block's own attrs
 * (not nested children); `marks` only applies when text is equal and no
 * shape difference (reordered/added/removed children) exists — otherwise a
 * marks-anywhere difference is ambiguous with a structural one; `structure`
 * is the fallback covering nested attrs changes, reordering, and similar.
 */
export function detectBlockChanges(
  snapshotRaw: BlockNode,
  currentRaw: BlockNode,
  snapshotComparable: ComparableBlockLike,
  currentComparable: ComparableBlockLike,
): { changes: HistoryBlockChangeKind[]; changedAttrs?: string[] } {
  const changes: HistoryBlockChangeKind[] = []

  if (snapshotComparable.type !== currentComparable.type) changes.push('type')

  const textEqual = snapshotComparable.text === currentComparable.text
  if (!textEqual) changes.push('text')

  const changedAttrs = diffAttrKeys(snapshotComparable.attrs, currentComparable.attrs)
  if (changedAttrs.length) changes.push('attrs')

  if (textEqual) {
    const snapshotNode = normalizeNode(snapshotRaw)
    const currentNode = normalizeNode(currentRaw)
    const shapeEqual = canonicalJson(stripNode(snapshotNode, true)) === canonicalJson(stripNode(currentNode, true))
    if (shapeEqual) {
      const marksProbeEqual = canonicalJson(stripNode(snapshotNode, false)) === canonicalJson(stripNode(currentNode, false))
      if (!marksProbeEqual) changes.push('marks')
    }
  }

  if (!changes.length) changes.push('structure')

  return changedAttrs.length ? { changes, changedAttrs } : { changes }
}

function diffAttrKeys(snapshotAttrs: Record<string, unknown>, currentAttrs: Record<string, unknown>): string[] {
  const keys = new Set([...Object.keys(snapshotAttrs), ...Object.keys(currentAttrs)])
  const changed: string[] = []
  for (const key of keys) {
    if (canonicalJson(snapshotAttrs[key]) !== canonicalJson(currentAttrs[key])) changed.push(key)
  }
  return changed.sort()
}
