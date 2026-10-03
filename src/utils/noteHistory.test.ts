import { describe, expect, it } from 'vitest'
import type { NoteDocument } from '../types/note'
import { CANVAS_SNAPSHOT_VERSION, type CanvasElement, type CanvasSnapshotV1 } from '../core/canvas/types'
import {
  buildNoteHistoryDiff,
  filterHistoryFiles,
  pickInitialHistoryNoteId,
  type HistoryFileListItem,
} from './noteHistory'

function createNote(overrides: Partial<NoteDocument> = {}): NoteDocument {
  return {
    id: 'note-1',
    title: 'Note 1',
    icon: '📄',
    folderId: null,
    createdAt: '2026-05-14T10:00:00.000Z',
    updatedAt: '2026-05-14T11:00:00.000Z',
    content: {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'First paragraph' }],
        },
      ],
    },
    ...overrides,
  }
}

const note = createNote

function canvasWith(elementCount: number): CanvasSnapshotV1 {
  const elements: Record<string, CanvasElement> = {}
  const order: string[] = []
  for (let index = 0; index < elementCount; index += 1) {
    const id = `el-${index}`
    elements[id] = {
      kind: 'shape',
      id,
      shape: 'rectangle',
      x: index * 10,
      y: 0,
      width: 100,
      height: 50,
      zIndex: index,
    }
    order.push(id)
  }
  return {
    version: CANVAS_SNAPSHOT_VERSION,
    frame: { x: 0, y: 0, width: 800, height: 600, zIndex: 0 },
    elements,
    connectors: {},
    order,
  }
}

describe('pickInitialHistoryNoteId', () => {
  it('prefers the explicit preselected note when it has history', () => {
    expect(
      pickInitialHistoryNoteId(['note-1', 'note-2'], {
        preselectedNoteId: 'note-2',
        activeNoteId: 'note-1',
      }),
    ).toBe('note-2')
  })

  it('falls back to the active note, then to the first note with history', () => {
    expect(
      pickInitialHistoryNoteId(['note-1', 'note-2'], {
        preselectedNoteId: 'missing',
        activeNoteId: 'note-2',
      }),
    ).toBe('note-2')

    expect(
      pickInitialHistoryNoteId(['note-3', 'note-4'], {
        preselectedNoteId: null,
        activeNoteId: 'missing',
      }),
    ).toBe('note-3')
  })

  it('returns null when no files have history', () => {
    expect(
      pickInitialHistoryNoteId([], {
        preselectedNoteId: 'note-1',
        activeNoteId: 'note-2',
      }),
    ).toBeNull()
  })
})

describe('filterHistoryFiles', () => {
  const files: HistoryFileListItem[] = [
    {
      id: 'note-1',
      title: 'Project Alpha',
      icon: '📄',
      folderId: null,
      updatedAt: '2026-05-14T10:00:00.000Z',
      snapshotCount: 3,
      latestSnapshotAt: '2026-05-14T11:00:00.000Z',
    },
    {
      id: 'note-2',
      title: 'Research Notes',
      icon: '🧪',
      folderId: 'folder-1',
      updatedAt: '2026-05-13T10:00:00.000Z',
      snapshotCount: 1,
      latestSnapshotAt: '2026-05-13T11:00:00.000Z',
    },
  ]

  it('returns all files for an empty query', () => {
    expect(filterHistoryFiles(files, '')).toEqual(files)
  })

  it('matches titles case-insensitively', () => {
    expect(filterHistoryFiles(files, 'research').map(file => file.id)).toEqual(['note-2'])
  })
})

describe('buildNoteHistoryDiff', () => {
  it('diffs notebook pages by stable id, including moves and page content changes', () => {
    const emptyDocument = { type: 'doc' as const, content: [{ type: 'paragraph' as const }] }
    const pageA = { id: 'page-a', width: 595.28, height: 841.89, paper: { kind: 'ruled' as const }, objects: [], vendor: 'keep' }
    const pageB = { id: 'page-b', width: 595.28, height: 841.89, paper: { kind: 'plain' as const }, objects: [] }
    const current = createNote({
      documentKind: 'notebook', content: emptyDocument,
      notebook: { version: 1, pages: [pageB, { ...pageA, vendor: 'updated' }, { ...pageB, id: 'page-c' }] },
    })
    const snapshot = createNote({
      documentKind: 'notebook', content: emptyDocument,
      notebook: { version: 1, pages: [pageA, pageB] },
    })

    expect(buildNoteHistoryDiff(current, snapshot).notebookPages).toEqual([
      { pageId: 'page-a', kind: 'changed', currentIndex: 1, snapshotIndex: 0, moved: true },
      { pageId: 'page-b', kind: 'moved', currentIndex: 0, snapshotIndex: 1 },
      { pageId: 'page-c', kind: 'added', currentIndex: 2 },
    ])
  })

  it('keeps unchanged blocks as context between changed rows', () => {
    const snapshot = createNote({
      content: {
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'Before' }] },
          { type: 'paragraph', content: [{ type: 'text', text: 'Shared context' }] },
          { type: 'paragraph', content: [{ type: 'text', text: 'After' }] },
        ],
      },
    })
    const current = createNote({
      content: {
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'Before updated' }] },
          { type: 'paragraph', content: [{ type: 'text', text: 'Shared context' }] },
          { type: 'paragraph', content: [{ type: 'text', text: 'After updated' }] },
        ],
      },
    })

    expect(buildNoteHistoryDiff(current, snapshot).rows.map(row => ({
      kind: row.kind,
      snapshot: row.snapshot?.label ?? null,
      current: row.current?.label ?? null,
    }))).toEqual([
      { kind: 'changed', snapshot: 'Before', current: 'Before updated' },
      { kind: 'unchanged', snapshot: 'Shared context', current: 'Shared context' },
      { kind: 'changed', snapshot: 'After', current: 'After updated' },
    ])
  })

  it('reports top-level metadata changes without inventing content changes', () => {
    const snapshot = createNote()
    const current = createNote({
      title: 'Renamed note',
      icon: '🔥',
      cover: 'image:cover.png',
    })

    const diff = buildNoteHistoryDiff(current, snapshot)

    expect(diff.metadata).toEqual([
      {
        field: 'title',
        currentValue: 'Renamed note',
        snapshotValue: 'Note 1',
      },
      {
        field: 'icon',
        currentValue: '🔥',
        snapshotValue: '📄',
      },
      {
        field: 'cover',
        currentValue: 'image:cover.png',
        snapshotValue: null,
      },
    ])
    expect(diff.rows).toEqual([])
  })

  it('classifies paragraph additions, removals, and changed blocks', () => {
    const snapshot = createNote({
      content: {
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'Alpha' }] },
          { type: 'paragraph', content: [{ type: 'text', text: 'Snapshot only paragraph' }] },
          { type: 'paragraph', content: [{ type: 'text', text: 'Stable anchor' }] },
          { type: 'paragraph', content: [{ type: 'text', text: 'Needs rewrite' }] },
        ],
      },
    })
    const current = createNote({
      content: {
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'Alpha' }] },
          { type: 'paragraph', content: [{ type: 'text', text: 'Stable anchor' }] },
          { type: 'paragraph', content: [{ type: 'text', text: 'Rewritten paragraph' }] },
          { type: 'paragraph', content: [{ type: 'text', text: 'Current only paragraph' }] },
        ],
      },
    })

    const diff = buildNoteHistoryDiff(current, snapshot)

    expect(diff.rows.map(row => row.kind)).toEqual(['unchanged', 'removed', 'unchanged', 'changed', 'added'])
    expect(diff.rows[1]).toMatchObject({
      kind: 'removed',
      snapshot: { label: 'Snapshot only paragraph' },
      current: null,
    })
    expect(diff.rows[3]).toMatchObject({
      kind: 'changed',
      snapshot: { label: 'Needs rewrite' },
      current: { label: 'Rewritten paragraph' },
    })
    expect(diff.rows[4]).toMatchObject({
      kind: 'added',
      snapshot: null,
      current: { label: 'Current only paragraph' },
    })
  })

  it('uses stable fallback labels for complex blocks', () => {
    const snapshot = createNote({
      content: {
        type: 'doc',
        content: [
          {
            type: 'table',
            content: [],
          },
        ],
      },
    })
    const current = createNote({
      content: {
        type: 'doc',
        content: [
          {
            type: 'table',
            attrs: { columns: 3 },
            content: [],
          },
        ],
      },
    })

    const diff = buildNoteHistoryDiff(current, snapshot)

    expect(diff.rows).toHaveLength(1)
    expect(diff.rows[0]).toMatchObject({
      kind: 'changed',
      snapshot: { label: 'Table block' },
      current: { label: 'Table block' },
    })
  })
})

describe('semantic comparison', () => {
  const para = (text: string, extra: Record<string, unknown> = {}) => ({ type: 'paragraph', attrs: { id: 'b1', align: null }, content: [{ type: 'text', text }], ...extra })
  const reordered = (text: string) => ({ content: [{ text, type: 'text' }], attrs: { align: null, id: 'b1' }, type: 'paragraph' })

  it('ignores object key order', () => {
    const current = note({ content: { type: 'doc', content: [para('Same')] } })
    const snapshot = note({ content: { content: [reordered('Same')], type: 'doc' } as never })
    const diff = buildNoteHistoryDiff(current, snapshot)
    expect(diff.rows).toEqual([])
    expect(diff.metadata).toEqual([])
  })

  it('treats empty attrs and marks as absent', () => {
    const a = note({ content: { type: 'doc', content: [{ type: 'paragraph', attrs: {}, marks: [], content: [{ type: 'text', text: 'x' }] }] } })
    const b = note({ content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x' }] }] } })
    expect(buildNoteHistoryDiff(a, b).rows).toEqual([])
  })

  it('explains a formatting-only change', () => {
    const current = note({ content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Bold', marks: [{ type: 'strong' }] }] }] } })
    const snapshot = note({ content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Bold' }] }] } })
    const [row] = buildNoteHistoryDiff(current, snapshot).rows
    expect(row).toMatchObject({ kind: 'changed', changes: ['marks'] })
  })

  it('explains a block type change and an attribute change', () => {
    const typeDiff = buildNoteHistoryDiff(
      note({ content: { type: 'doc', content: [{ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'T' }] }] } }),
      note({ content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'T' }] }] } }),
    )
    expect(typeDiff.rows[0]).toMatchObject({ kind: 'changed', changes: expect.arrayContaining(['type']) })

    const attrDiff = buildNoteHistoryDiff(
      note({ content: { type: 'doc', content: [{ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'T' }] }] } }),
      note({ content: { type: 'doc', content: [{ type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'T' }] }] } }),
    )
    expect(attrDiff.rows[0]).toMatchObject({ kind: 'changed', changes: ['attrs'], changedAttrs: ['level'] })
  })

  it('reports a checklist toggle as a change', () => {
    const item = (checked: boolean) => ({ type: 'checklist_item', attrs: { checked }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Task' }] }] })
    const diff = buildNoteHistoryDiff(
      note({ content: { type: 'doc', content: [item(true)] } }),
      note({ content: { type: 'doc', content: [item(false)] } }),
    )
    expect(diff.rows[0]).toMatchObject({ kind: 'changed', changes: ['attrs'], changedAttrs: ['checked'] })
  })

  it('reports every property field and canvas', () => {
    const current = note({ properties: { type: 'task', tags: ['a', 'b'], date: '2026-09-28', status: 'active' }, canvas: canvasWith(2) })
    const snapshot = note({ properties: { type: 'note', tags: ['a'], date: null, status: null } })
    const fields = buildNoteHistoryDiff(current, snapshot).metadata.map(change => change.field)
    expect(fields).toEqual(['propertiesType', 'propertiesTags', 'propertiesDate', 'propertiesStatus', 'canvas'])
  })

  it('flags a canvas layout-only change', () => {
    const moved = canvasWith(1); moved.elements[Object.keys(moved.elements)[0]!]!.x = 999
    const change = buildNoteHistoryDiff(note({ canvas: moved }), note({ canvas: canvasWith(1) })).metadata[0]
    expect(change).toMatchObject({ field: 'canvas', layoutOnly: true })
  })

  it('an identical note has no metadata and no rows', () => {
    const n = note({ properties: { type: 'task', tags: ['a'], date: null, status: 'done' }, canvas: canvasWith(1) })
    expect(buildNoteHistoryDiff(n, structuredClone(n))).toEqual({ metadata: [], rows: [] })
  })
})
