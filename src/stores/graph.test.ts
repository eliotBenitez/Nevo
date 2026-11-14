import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { NoteMeta } from '../types/note'
import type { WorkspaceManifest } from '../types/workspace'
import type { BacklinkRef, GraphEdge } from '../types/graph'
import { useGraphStore } from './graph'
import { useWorkspaceStore } from './workspace'

const mockBackend = {
  graphGetBacklinks: vi.fn<(noteId: string) => Promise<BacklinkRef[]>>(),
  graphGetOutlinks: vi.fn<(noteId: string) => Promise<GraphEdge[]>>(async () => []),
}

vi.mock('../core/workspace-backend', async () => {
  const actual = await vi.importActual<typeof import('../core/workspace-backend')>('../core/workspace-backend')
  return {
    ...actual,
    resolveBackend: () => mockBackend,
  }
})

function note(id: string, title: string, icon: string): NoteMeta {
  return { id, title, icon, folderId: null, updatedAt: '2026-01-01T00:00:00.000Z' }
}

function manifestWith(notes: NoteMeta[]): WorkspaceManifest {
  return {
    id: 'ws',
    name: 'WS',
    glyph: 'N',
    gradient: '',
    schemaVersion: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    rootOrder: notes.map(n => n.id),
    tree: [],
    rootNotes: notes,
  }
}

function backlink(sourceId: string, title = '', icon = '', count = 1): BacklinkRef {
  return { sourceId, sourceTitle: title, sourceIcon: icon, count }
}

describe('useGraphStore.loadNoteGraph backlink enrichment', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockBackend.graphGetBacklinks.mockReset()
    mockBackend.graphGetOutlinks.mockReset().mockResolvedValue([])
  })

  function openLocalWorkspace(notes: NoteMeta[]) {
    const workspaceStore = useWorkspaceStore()
    workspaceStore.activeHandle = { kind: 'local', path: '/workspace' }
    workspaceStore.manifest = manifestWith(notes)
    return workspaceStore
  }

  it('fills empty source title/icon from the workspace manifest (local backend)', async () => {
    openLocalWorkspace([note('src', 'Source Note', '🧠')])
    mockBackend.graphGetBacklinks.mockResolvedValue([backlink('src', '', '', 2)])

    const graphStore = useGraphStore()
    await graphStore.loadNoteGraph('target')

    expect(graphStore.backlinks).toEqual([
      { sourceId: 'src', sourceTitle: 'Source Note', sourceIcon: '🧠', count: 2 },
    ])
  })

  it('keeps title/icon already provided by the backend', async () => {
    openLocalWorkspace([note('src', 'Manifest Title', '📁')])
    mockBackend.graphGetBacklinks.mockResolvedValue([backlink('src', 'Backend Title', '🔗')])

    const graphStore = useGraphStore()
    await graphStore.loadNoteGraph('target')

    expect(graphStore.backlinks[0]).toMatchObject({ sourceTitle: 'Backend Title', sourceIcon: '🔗' })
  })

  it('leaves the backlink untouched when the source note is absent from the manifest', async () => {
    openLocalWorkspace([])
    mockBackend.graphGetBacklinks.mockResolvedValue([backlink('ghost', '', '', 1)])

    const graphStore = useGraphStore()
    await graphStore.loadNoteGraph('target')

    expect(graphStore.backlinks).toEqual([backlink('ghost', '', '', 1)])
  })

  it('ignores an older graph request that resolves after the selected note changed', async () => {
    openLocalWorkspace([note('source-a', 'A', '🅰️'), note('source-b', 'B', '🅱️')])
    let resolveOldBacklinks!: (refs: BacklinkRef[]) => void
    let resolveOldOutlinks!: (edges: GraphEdge[]) => void
    mockBackend.graphGetBacklinks.mockImplementation((noteId: string) => noteId === 'old'
      ? new Promise(resolve => { resolveOldBacklinks = resolve })
      : Promise.resolve([backlink('source-b', 'B', '🅱️')]))
    mockBackend.graphGetOutlinks.mockImplementation((noteId: string) => noteId === 'old'
      ? new Promise(resolve => { resolveOldOutlinks = resolve })
      : Promise.resolve([{ source: 'new', target: 'source-b', kind: 'link' }]))

    const graphStore = useGraphStore()
    const oldLoad = graphStore.loadNoteGraph('old')
    await graphStore.loadNoteGraph('new')
    resolveOldBacklinks([backlink('source-a', 'A', '🅰️')])
    resolveOldOutlinks([{ source: 'old', target: 'source-a', kind: 'link' }])
    await oldLoad

    expect(graphStore.activeNoteId).toBe('new')
    expect(graphStore.backlinks).toEqual([backlink('source-b', 'B', '🅱️')])
    expect(graphStore.outlinks).toEqual([{ source: 'new', target: 'source-b', kind: 'link' }])
  })

  it('does not repopulate graph data after clear invalidates a pending load', async () => {
    openLocalWorkspace([])
    let resolveBacklinks!: (refs: BacklinkRef[]) => void
    let resolveOutlinks!: (edges: GraphEdge[]) => void
    mockBackend.graphGetBacklinks.mockImplementation(() => new Promise(resolve => { resolveBacklinks = resolve }))
    mockBackend.graphGetOutlinks.mockImplementation(() => new Promise(resolve => { resolveOutlinks = resolve }))

    const graphStore = useGraphStore()
    const pending = graphStore.loadNoteGraph('pending')
    graphStore.clear()
    resolveBacklinks([])
    resolveOutlinks([])
    await pending

    expect(graphStore.activeNoteId).toBeNull()
    expect(graphStore.backlinks).toEqual([])
    expect(graphStore.outlinks).toEqual([])
  })

  it('ignores an outlink refresh that finishes after another note is selected', async () => {
    openLocalWorkspace([])
    mockBackend.graphGetBacklinks.mockResolvedValue([])
    let resolveOldOutlinks!: (edges: GraphEdge[]) => void
    mockBackend.graphGetOutlinks.mockImplementation((noteId: string) => noteId === 'old'
      ? new Promise(resolve => { resolveOldOutlinks = resolve })
      : Promise.resolve([{ source: 'new', target: 'current', kind: 'link' }]))

    const graphStore = useGraphStore()
    graphStore.activeNoteId = 'old'
    const oldUpdate = graphStore.refreshOutlinks('old')
    await Promise.resolve()
    await graphStore.loadNoteGraph('new')
    resolveOldOutlinks([{ source: 'old', target: 'stale', kind: 'link' }])
    await oldUpdate

    expect(graphStore.activeNoteId).toBe('new')
    expect(graphStore.outlinks).toEqual([{ source: 'new', target: 'current', kind: 'link' }])
  })

  it('refreshes outlinks only for the active note', async () => {
    openLocalWorkspace([])
    mockBackend.graphGetOutlinks.mockResolvedValue([{ source: 'a', target: 'b', kind: 'link' }])
    const graphStore = useGraphStore()

    await graphStore.refreshOutlinks('a')
    expect(mockBackend.graphGetOutlinks).not.toHaveBeenCalled()

    graphStore.activeNoteId = 'a'
    await graphStore.refreshOutlinks('a')
    expect(graphStore.outlinks).toEqual([{ source: 'a', target: 'b', kind: 'link' }])
  })

  it('keeps the current lists while refreshing and drops a refresh made stale by a note switch', async () => {
    openLocalWorkspace([])
    const graphStore = useGraphStore()
    graphStore.activeNoteId = 'a'
    graphStore.outlinks = [{ source: 'a', target: 'old', kind: 'link' }]
    let resolveOutlinks!: (edges: GraphEdge[]) => void
    mockBackend.graphGetBacklinks.mockResolvedValue([])
    mockBackend.graphGetOutlinks.mockImplementation(() => new Promise(resolve => { resolveOutlinks = resolve }))

    const refresh = graphStore.refreshActiveNote()
    await Promise.resolve()
    expect(graphStore.outlinks).toEqual([{ source: 'a', target: 'old', kind: 'link' }])
    resolveOutlinks([{ source: 'a', target: 'new', kind: 'link' }])
    await refresh
    expect(graphStore.outlinks).toEqual([{ source: 'a', target: 'new', kind: 'link' }])

    const stale = graphStore.refreshActiveNote()
    await Promise.resolve()
    mockBackend.graphGetOutlinks.mockResolvedValue([])
    await graphStore.loadNoteGraph('b')
    resolveOutlinks([{ source: 'a', target: 'stale', kind: 'link' }])
    await stale
    expect(graphStore.activeNoteId).toBe('b')
    expect(graphStore.outlinks).toEqual([])
  })
  it('keeps the newest outlinks when an older same-note request resolves last', async () => {
    openLocalWorkspace([])
    const graphStore = useGraphStore()
    graphStore.activeNoteId = 'a'
    const resolvers: Array<(edges: GraphEdge[]) => void> = []
    mockBackend.graphGetBacklinks.mockResolvedValue([])
    mockBackend.graphGetOutlinks.mockImplementation(() => new Promise(resolve => { resolvers.push(resolve) }))

    const older = graphStore.refreshActiveNote()
    const newer = graphStore.refreshOutlinks('a')
    await Promise.resolve()
    resolvers[1]([{ source: 'a', target: 'new', kind: 'link' }])
    await newer
    resolvers[0]([{ source: 'a', target: 'old', kind: 'link' }])
    await older

    expect(graphStore.outlinks).toEqual([{ source: 'a', target: 'new', kind: 'link' }])
  })

  it('skips the refresh after a save whose internal links did not change', async () => {
    openLocalWorkspace([])
    const graphStore = useGraphStore()
    graphStore.activeNoteId = 'a'
    const content = (text: string) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] })

    await graphStore.refreshOutlinks('a', content('one'))
    await graphStore.refreshOutlinks('a', content('two'))
    expect(mockBackend.graphGetOutlinks).toHaveBeenCalledOnce()
  })
  it('refreshes again after a reload even when the saved links match an earlier save', async () => {
    openLocalWorkspace([])
    const graphStore = useGraphStore()
    const linked = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x', marks: [{ type: 'internal_link', attrs: { noteId: 'x', anchor: null } }] }] }] }
    graphStore.activeNoteId = 'a'
    await graphStore.refreshOutlinks('a', linked)
    await graphStore.loadNoteGraph('a')
    mockBackend.graphGetOutlinks.mockClear()

    await graphStore.refreshOutlinks('a', linked)
    expect(mockBackend.graphGetOutlinks).toHaveBeenCalledOnce()
  })
})
