import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { NoteMeta } from '../types/note'
import type { WorkspaceManifest } from '../types/workspace'
import type { BacklinkRef, GraphEdge } from '../types/graph'
import { useGraphStore } from './graph'
import { useWorkspaceStore } from './workspace'

const mockBackend = {
  graphGetBacklinks: vi.fn<() => Promise<BacklinkRef[]>>(),
  graphGetOutlinks: vi.fn<() => Promise<GraphEdge[]>>(async () => []),
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

  it('keeps title/icon already provided by the backend (cloud enrichment)', async () => {
    openLocalWorkspace([note('src', 'Manifest Title', '📁')])
    mockBackend.graphGetBacklinks.mockResolvedValue([backlink('src', 'Cloud Title', '☁️')])

    const graphStore = useGraphStore()
    await graphStore.loadNoteGraph('target')

    expect(graphStore.backlinks[0]).toMatchObject({ sourceTitle: 'Cloud Title', sourceIcon: '☁️' })
  })

  it('leaves the backlink untouched when the source note is absent from the manifest', async () => {
    openLocalWorkspace([])
    mockBackend.graphGetBacklinks.mockResolvedValue([backlink('ghost', '', '', 1)])

    const graphStore = useGraphStore()
    await graphStore.loadNoteGraph('target')

    expect(graphStore.backlinks).toEqual([backlink('ghost', '', '', 1)])
  })
})
