import type { BlockNode, NoteDocument, NoteProperties } from '../types/note'
import type { NotebookPageV1 } from '../core/notebook/types'
import {
  canonicalJson,
  detectBlockChanges,
  normalizeAttrsOrNull,
  normalizeNode,
  type HistoryBlockChangeKind,
} from './noteHistoryCanonical'

export { canonicalJson } from './noteHistoryCanonical'
export type { HistoryBlockChangeKind } from './noteHistoryCanonical'

export interface HistoryFileListItem {
  id: string
  title: string
  icon: string
  folderId: string | null
  updatedAt: string
  snapshotCount: number
  latestSnapshotAt: string
}

export interface HistoryNoteSelectionOptions {
  preselectedNoteId: string | null
  activeNoteId: string | null
}

export type HistoryMetadataField =
  | 'title'
  | 'icon'
  | 'cover'
  | 'propertiesType'
  | 'propertiesTags'
  | 'propertiesDate'
  | 'propertiesStatus'
  | 'canvas'

export interface HistoryDiffMetadataChange {
  field: HistoryMetadataField
  currentValue: string | null
  snapshotValue: string | null
  /** canvas only: element/connector counts equal but layout/content differs */
  layoutOnly?: boolean
}

export interface HistoryComparableBlock {
  type: string
  label: string
  /** collected inline text ('' for atoms) */
  text: string
  /** canonical, key-order independent */
  signature: string
  attrs: Record<string, unknown>
}

export interface NormalizedDiffBlockRow {
  kind: 'added' | 'removed' | 'changed' | 'unchanged'
  current: HistoryComparableBlock | null
  snapshot: HistoryComparableBlock | null
  /** only for kind 'changed' with both sides */
  changes?: HistoryBlockChangeKind[]
  /** attr keys whose values differ, sorted; only when changes includes 'attrs' */
  changedAttrs?: string[]
}

export interface NoteHistoryDiff {
  metadata: HistoryDiffMetadataChange[]
  rows: NormalizedDiffBlockRow[]
  notebookPages?: NotebookPageHistoryChange[]
}

export interface NotebookPageHistoryChange {
  pageId: string
  kind: 'added' | 'removed' | 'changed' | 'moved'
  currentIndex?: number
  snapshotIndex?: number
  moved?: boolean
}

const COMPLEX_BLOCK_LABELS: Record<string, string> = {
  blockquote: 'Quote block',
  bullet_list: 'Bullet list',
  code_block: 'Code block',
  heading: 'Heading block',
  horizontal_rule: 'Divider block',
  image: 'Image block',
  math_block: 'Math block',
  ordered_list: 'Numbered list',
  table: 'Table block',
  task_list: 'Task list',
}

export function pickInitialHistoryNoteId(
  noteIdsWithHistory: string[],
  options: HistoryNoteSelectionOptions,
): string | null {
  if (options.preselectedNoteId && noteIdsWithHistory.includes(options.preselectedNoteId)) {
    return options.preselectedNoteId
  }

  if (options.activeNoteId && noteIdsWithHistory.includes(options.activeNoteId)) {
    return options.activeNoteId
  }

  return noteIdsWithHistory[0] ?? null
}

export function filterHistoryFiles(files: HistoryFileListItem[], query: string): HistoryFileListItem[] {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) return files
  return files.filter(file => file.title.toLowerCase().includes(normalizedQuery))
}

export function summarizeCanvas(canvas: NoteDocument['canvas']): string | null {
  if (!canvas) return null
  return `${Object.keys(canvas.elements ?? {}).length}/${Object.keys(canvas.connectors ?? {}).length}`
}

export function buildNoteHistoryDiff(current: NoteDocument, snapshot: NoteDocument): NoteHistoryDiff {
  const currentBlocks = toInternalBlocks(current.content)
  const snapshotBlocks = toInternalBlocks(snapshot.content)
  const unchangedPairs = buildUnchangedPairs(snapshotBlocks, currentBlocks)
  const rows = buildDiffRows(snapshotBlocks, currentBlocks, unchangedPairs)

  return {
    metadata: buildMetadataChanges(current, snapshot),
    rows,
    ...(current.documentKind === 'notebook' || snapshot.documentKind === 'notebook'
      ? { notebookPages: diffNotebookPages(current.notebook?.pages, snapshot.notebook?.pages) }
      : {}),
  }
}

function diffNotebookPages(
  currentPages: NotebookPageV1[] | undefined,
  snapshotPages: NotebookPageV1[] | undefined,
): NotebookPageHistoryChange[] {
  const current = Array.isArray(currentPages) ? currentPages : []
  const snapshot = Array.isArray(snapshotPages) ? snapshotPages : []
  const currentIndexById = new Map(current.map((page, index) => [page.id, index]))
  const snapshotIndexById = new Map(snapshot.map((page, index) => [page.id, index]))
  const changes: NotebookPageHistoryChange[] = []

  for (let index = 0; index < snapshot.length; index += 1) {
    const page = snapshot[index]
    if (!page) continue
    const currentIndex = currentIndexById.get(page.id)
    if (currentIndex === undefined) {
      changes.push({ pageId: page.id, kind: 'removed', snapshotIndex: index })
      continue
    }
    const currentPage = current[currentIndex]
    if (!currentPage) continue
    const moved = currentIndex !== index
    const currentValue = { ...currentPage, id: undefined }
    const snapshotValue = { ...page, id: undefined }
    if (canonicalJson(currentValue) !== canonicalJson(snapshotValue)) {
      changes.push({ pageId: page.id, kind: 'changed', currentIndex, snapshotIndex: index, ...(moved ? { moved: true } : {}) })
    } else if (moved) {
      changes.push({ pageId: page.id, kind: 'moved', currentIndex, snapshotIndex: index })
    }
  }

  for (let index = 0; index < current.length; index += 1) {
    const page = current[index]
    if (page && !snapshotIndexById.has(page.id)) changes.push({ pageId: page.id, kind: 'added', currentIndex: index })
  }
  return changes
}

function buildMetadataChanges(current: NoteDocument, snapshot: NoteDocument): HistoryDiffMetadataChange[] {
  const changes = [
    buildMetadataChange('title', current.title, snapshot.title),
    buildMetadataChange('icon', current.icon, snapshot.icon),
    buildMetadataChange('cover', current.cover ?? null, snapshot.cover ?? null),
    buildMetadataChange('propertiesType', normalizePropertyValue(current.properties, 'type'), normalizePropertyValue(snapshot.properties, 'type')),
    buildMetadataChange('propertiesTags', normalizePropertyTags(current.properties), normalizePropertyTags(snapshot.properties)),
    buildMetadataChange('propertiesDate', normalizePropertyValue(current.properties, 'date'), normalizePropertyValue(snapshot.properties, 'date')),
    buildMetadataChange('propertiesStatus', normalizePropertyValue(current.properties, 'status'), normalizePropertyValue(snapshot.properties, 'status')),
    buildCanvasMetadataChange(current.canvas, snapshot.canvas),
  ]
  return changes.filter((change): change is HistoryDiffMetadataChange => change !== null)
}

function buildMetadataChange(
  field: HistoryMetadataField,
  currentValue: string | null,
  snapshotValue: string | null,
): HistoryDiffMetadataChange | null {
  if (currentValue === snapshotValue) return null
  return { field, currentValue, snapshotValue }
}

function normalizePropertyValue(properties: NoteProperties | undefined, key: 'type' | 'date' | 'status'): string | null {
  const value = properties?.[key]
  if (typeof value !== 'string') return null
  return value.trim() || null
}

function normalizePropertyTags(properties: NoteProperties | undefined): string | null {
  const tags = (properties?.tags ?? []).map(tag => tag.trim()).filter(Boolean)
  return tags.length ? tags.join(', ') : null
}

function buildCanvasMetadataChange(
  current: NoteDocument['canvas'],
  snapshot: NoteDocument['canvas'],
): HistoryDiffMetadataChange | null {
  if (canonicalJson(current ?? null) === canonicalJson(snapshot ?? null)) return null
  const currentValue = summarizeCanvas(current)
  const snapshotValue = summarizeCanvas(snapshot)
  return { field: 'canvas', currentValue, snapshotValue, layoutOnly: currentValue === snapshotValue }
}

export function normalizeHistoryBlocks(content: BlockNode): HistoryComparableBlock[] {
  if (content.type !== 'doc' || !content.content?.length) return []
  return content.content.map(toComparableBlock)
}

/** A comparable block paired with the raw node it was derived from, so a
 *  'changed' row can inspect the original attrs/marks/content to explain
 *  *why* it changed without re-deriving that from the flattened signature. */
interface InternalDiffBlock {
  raw: BlockNode
  comparable: HistoryComparableBlock
}

function toInternalBlocks(content: BlockNode): InternalDiffBlock[] {
  if (content.type !== 'doc' || !content.content?.length) return []
  return content.content.map(raw => ({ raw, comparable: toComparableBlock(raw) }))
}

function toComparableBlock(block: BlockNode): HistoryComparableBlock {
  const text = collectInlineText(block).trim()
  const label = text || COMPLEX_BLOCK_LABELS[block.type] || 'Changed block'
  return {
    type: block.type,
    label,
    text,
    signature: canonicalJson(normalizeNode(block)),
    attrs: normalizeAttrsOrNull(block.attrs) ?? {},
  }
}

function collectInlineText(block: BlockNode): string {
  if (block.type === 'text') return block.text ?? ''
  if (block.type === 'hard_break') return '\n'
  if (!block.content?.length) return ''
  return block.content.map(collectInlineText).join('')
}

function buildUnchangedPairs(
  snapshotBlocks: InternalDiffBlock[],
  currentBlocks: InternalDiffBlock[],
): Array<[number, number]> {
  const snapshotLength = snapshotBlocks.length
  const currentLength = currentBlocks.length
  const dp = Array.from({ length: snapshotLength + 1 }, () => Array<number>(currentLength + 1).fill(0))

  for (let i = snapshotLength - 1; i >= 0; i -= 1) {
    for (let j = currentLength - 1; j >= 0; j -= 1) {
      if (snapshotBlocks[i]?.comparable.signature === currentBlocks[j]?.comparable.signature) {
        dp[i]![j] = dp[i + 1]![j + 1]! + 1
      } else {
        dp[i]![j] = Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!)
      }
    }
  }

  const pairs: Array<[number, number]> = []
  let i = 0
  let j = 0
  while (i < snapshotLength && j < currentLength) {
    if (snapshotBlocks[i]?.comparable.signature === currentBlocks[j]?.comparable.signature) {
      pairs.push([i, j])
      i += 1
      j += 1
      continue
    }

    if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      i += 1
      continue
    }

    j += 1
  }

  return pairs
}

function buildDiffRows(
  snapshotBlocks: InternalDiffBlock[],
  currentBlocks: InternalDiffBlock[],
  unchangedPairs: Array<[number, number]>,
): NormalizedDiffBlockRow[] {
  const rows: NormalizedDiffBlockRow[] = []
  let snapshotStart = 0
  let currentStart = 0

  for (const [snapshotIndex, currentIndex] of [...unchangedPairs, [snapshotBlocks.length, currentBlocks.length] as [number, number]]) {
    rows.push(
      ...buildGapRows(
        snapshotBlocks.slice(snapshotStart, snapshotIndex),
        currentBlocks.slice(currentStart, currentIndex),
      ),
    )
    if (snapshotIndex < snapshotBlocks.length && currentIndex < currentBlocks.length) {
      rows.push({
        kind: 'unchanged',
        snapshot: snapshotBlocks[snapshotIndex]?.comparable ?? null,
        current: currentBlocks[currentIndex]?.comparable ?? null,
      })
    }
    snapshotStart = snapshotIndex + 1
    currentStart = currentIndex + 1
  }

  return rows.some(row => row.kind !== 'unchanged') ? rows : []
}

function buildGapRows(
  snapshotGap: InternalDiffBlock[],
  currentGap: InternalDiffBlock[],
): NormalizedDiffBlockRow[] {
  const rows: NormalizedDiffBlockRow[] = []
  const changedCount = Math.min(snapshotGap.length, currentGap.length)

  if (snapshotGap.length > currentGap.length) {
    const removedCount = snapshotGap.length - currentGap.length
    for (const block of snapshotGap.slice(0, removedCount)) {
      rows.push({ kind: 'removed', snapshot: block.comparable, current: null })
    }
  }

  for (let index = 0; index < changedCount; index += 1) {
    const snapshotOffset = Math.max(0, snapshotGap.length - changedCount) + index
    const currentOffset = index
    const snapshotBlock = snapshotGap[snapshotOffset]
    const currentBlock = currentGap[currentOffset]
    if (!snapshotBlock || !currentBlock) continue
    if (snapshotBlock.comparable.signature === currentBlock.comparable.signature) continue
    const { changes, changedAttrs } = detectBlockChanges(
      snapshotBlock.raw,
      currentBlock.raw,
      snapshotBlock.comparable,
      currentBlock.comparable,
    )
    rows.push({
      kind: 'changed',
      snapshot: snapshotBlock.comparable,
      current: currentBlock.comparable,
      changes,
      ...(changedAttrs ? { changedAttrs } : {}),
    })
  }

  if (currentGap.length > snapshotGap.length) {
    const addedStart = changedCount
    for (const block of currentGap.slice(addedStart)) {
      rows.push({ kind: 'added', snapshot: null, current: block.comparable })
    }
  }

  return rows
}
