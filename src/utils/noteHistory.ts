import type { BlockNode, NoteDocument } from '../types/note'

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

export interface HistoryDiffMetadataChange {
  field: 'title' | 'icon' | 'cover'
  currentValue: string | null
  snapshotValue: string | null
}

export interface HistoryComparableBlock {
  type: string
  label: string
  signature: string
}

export interface NormalizedDiffBlockRow {
  kind: 'added' | 'removed' | 'changed'
  current: HistoryComparableBlock | null
  snapshot: HistoryComparableBlock | null
}

export interface NoteHistoryDiff {
  metadata: HistoryDiffMetadataChange[]
  rows: NormalizedDiffBlockRow[]
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

export function buildNoteHistoryDiff(current: NoteDocument, snapshot: NoteDocument): NoteHistoryDiff {
  const currentBlocks = normalizeHistoryBlocks(current.content)
  const snapshotBlocks = normalizeHistoryBlocks(snapshot.content)
  const unchangedPairs = buildUnchangedPairs(snapshotBlocks, currentBlocks)
  const rows = buildDiffRows(snapshotBlocks, currentBlocks, unchangedPairs)

  return {
    metadata: [
      buildMetadataChange('title', current.title, snapshot.title),
      buildMetadataChange('icon', current.icon, snapshot.icon),
      buildMetadataChange('cover', current.cover ?? null, snapshot.cover ?? null),
    ].filter((change): change is HistoryDiffMetadataChange => change !== null),
    rows,
  }
}

function buildMetadataChange(
  field: HistoryDiffMetadataChange['field'],
  currentValue: string | null,
  snapshotValue: string | null,
): HistoryDiffMetadataChange | null {
  if (currentValue === snapshotValue) return null
  return { field, currentValue, snapshotValue }
}

export function normalizeHistoryBlocks(content: BlockNode): HistoryComparableBlock[] {
  if (content.type !== 'doc' || !content.content?.length) return []
  return content.content.map(toComparableBlock)
}

function toComparableBlock(block: BlockNode): HistoryComparableBlock {
  const text = collectInlineText(block).trim()
  const label = text || COMPLEX_BLOCK_LABELS[block.type] || 'Changed block'
  const serializedPayload = JSON.stringify({
    attrs: block.attrs ?? null,
    content: block.content ?? null,
    marks: block.marks ?? null,
    text: block.text ?? null,
  })
  return {
    type: block.type,
    label,
    signature: `${block.type}:${text || label}:${serializedPayload}`,
  }
}

function collectInlineText(block: BlockNode): string {
  if (block.type === 'text') return block.text ?? ''
  if (block.type === 'hard_break') return '\n'
  if (!block.content?.length) return ''
  return block.content.map(collectInlineText).join('')
}

function buildUnchangedPairs(
  snapshotBlocks: HistoryComparableBlock[],
  currentBlocks: HistoryComparableBlock[],
): Array<[number, number]> {
  const snapshotLength = snapshotBlocks.length
  const currentLength = currentBlocks.length
  const dp = Array.from({ length: snapshotLength + 1 }, () => Array<number>(currentLength + 1).fill(0))

  for (let i = snapshotLength - 1; i >= 0; i -= 1) {
    for (let j = currentLength - 1; j >= 0; j -= 1) {
      if (snapshotBlocks[i]?.signature === currentBlocks[j]?.signature) {
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
    if (snapshotBlocks[i]?.signature === currentBlocks[j]?.signature) {
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
  snapshotBlocks: HistoryComparableBlock[],
  currentBlocks: HistoryComparableBlock[],
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
    snapshotStart = snapshotIndex + 1
    currentStart = currentIndex + 1
  }

  return rows
}

function buildGapRows(
  snapshotGap: HistoryComparableBlock[],
  currentGap: HistoryComparableBlock[],
): NormalizedDiffBlockRow[] {
  const rows: NormalizedDiffBlockRow[] = []
  const changedCount = Math.min(snapshotGap.length, currentGap.length)

  if (snapshotGap.length > currentGap.length) {
    const removedCount = snapshotGap.length - currentGap.length
    for (const block of snapshotGap.slice(0, removedCount)) {
      rows.push({
        kind: 'removed',
        snapshot: block,
        current: null,
      })
    }
  }

  for (let index = 0; index < changedCount; index += 1) {
    const snapshotOffset = Math.max(0, snapshotGap.length - changedCount) + index
    const currentOffset = index
    rows.push({
      kind: 'changed',
      snapshot: snapshotGap[snapshotOffset] ?? null,
      current: currentGap[currentOffset] ?? null,
    })
  }

  if (currentGap.length > snapshotGap.length) {
    const addedStart = changedCount
    for (const block of currentGap.slice(addedStart)) {
      rows.push({
        kind: 'added',
        snapshot: null,
        current: block,
      })
    }
  }

  return rows.filter(row => {
    if (row.kind !== 'changed') return true
    return row.snapshot?.signature !== row.current?.signature
  })
}
