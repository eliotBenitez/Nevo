import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NotionExportManifest } from '../types/notion-import'

const mocks = vi.hoisted(() => {
  const refreshSidebarNotePreviews = vi.fn()
  return {
    createFolder: vi.fn(), createNote: vi.fn(), syncNoteMeta: vi.fn(), invalidateNoteCache: vi.fn(),
    refreshSidebarNotePreviews, pickAndScanNotionExport: vi.fn(), importNotionAssets: vi.fn(),
    releaseNotionImport: vi.fn(), saveNote: vi.fn(), deleteYjsState: vi.fn(), importRecords: vi.fn(),
    workspaceStore: {
      backendKind: 'local' as 'local' | 'cloud',
      activePath: '/workspace' as string | null,
      manifest: { tree: [{ title: 'Export (Notion)' }] } as { tree: Array<{ title: string }> } | null,
      refreshSidebarNotePreviews,
    },
  }
})

const {
  createFolder, createNote,
  pickAndScanNotionExport, importNotionAssets, releaseNotionImport, saveNote, deleteYjsState,
  importRecords, workspaceStore,
} = mocks

vi.mock('../stores/tree', () => ({
  useTreeStore: () => ({ createFolder: mocks.createFolder, createNote: mocks.createNote, syncNoteMeta: mocks.syncNoteMeta }),
}))
vi.mock('../stores/workspace', () => ({ useWorkspaceStore: () => mocks.workspaceStore }))
vi.mock('../stores/note', () => ({ useNoteStore: () => ({ invalidateNoteCache: mocks.invalidateNoteCache }) }))
vi.mock('../tauri/commands', () => ({
  pickAndScanNotionExport: mocks.pickAndScanNotionExport,
  importNotionAssets: mocks.importNotionAssets,
  releaseNotionImport: mocks.releaseNotionImport,
  noteCommands: { saveNote: mocks.saveNote },
  collabCommands: { deleteYjsState: mocks.deleteYjsState },
}))
vi.mock('../features/database/databaseRepository', () => ({
  createDatabaseRepository: () => ({ importRecords: mocks.importRecords }),
}))

import { useNotionImport } from './useNotionImport'

function manifest(): NotionExportManifest {
  return {
    sessionToken: 'session-1',
    exportName: 'Export',
    documents: [
      { relativePath: 'Parent abcdef1234567890abcdef1234567890.md', kind: 'markdown', content: '[Child](Parent%20abcdef1234567890abcdef1234567890/Child.md)', size: 10 },
      { relativePath: 'Parent abcdef1234567890abcdef1234567890/Child.md', kind: 'markdown', content: '# Child', size: 10 },
      { relativePath: 'Tasks.csv', kind: 'csv', content: 'Name,Done\nOne,true', size: 10 },
    ],
    assets: [{ relativePath: 'files/manual.pdf', size: 20 }],
    skipped: [],
  }
}

describe('useNotionImport', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    workspaceStore.backendKind = 'local'
    workspaceStore.activePath = '/workspace'
    workspaceStore.manifest = { tree: [{ title: 'Export (Notion)' }] }
    let folderIndex = 0
    let noteIndex = 0
    createFolder.mockImplementation(async (_parentId: string | null, title: string) => ({ id: `folder-${++folderIndex}`, title }))
    createNote.mockImplementation(async (folderId: string, title: string, icon: string) => ({
      id: `note-${++noteIndex}`, title, icon, folderId, createdAt: 'now', updatedAt: 'now', content: { type: 'doc', content: [] },
    }))
    pickAndScanNotionExport.mockResolvedValue(manifest())
    importNotionAssets.mockResolvedValue([{ relativePath: 'files/manual.pdf', asset: { src: '.nevo/assets/manual.pdf', hash: 'h', deduplicated: false, bytes: 20 }, error: null }])
    releaseNotionImport.mockResolvedValue(true)
    saveNote.mockResolvedValue(undefined)
    deleteYjsState.mockResolvedValue(true)
    importRecords.mockResolvedValue(1)
  })

  it('creates a unique root, allocates every note before writing, imports database rows, resets Y.Doc and releases the session', async () => {
    const importer = useNotionImport()
    const result = await importer.importExport()

    expect(createFolder).toHaveBeenNthCalledWith(1, null, 'Export (Notion) 2')
    expect(Math.max(...createNote.mock.invocationCallOrder)).toBeLessThan(Math.min(...saveNote.mock.invocationCallOrder))
    expect(importRecords).toHaveBeenCalledOnce()
    expect(deleteYjsState).toHaveBeenCalledTimes(3)
    expect(releaseNotionImport).toHaveBeenCalledWith('session-1')
    expect(result).toMatchObject({ notesCreated: 3, databasesCreated: 1, rootName: 'Export (Notion) 2' })
    const childSave = saveNote.mock.calls.find(([_, note]) => note.title === 'Child')
    expect(childSave?.[1].content.content).toEqual([])
  })

  it('stops cleanly when the picker is cancelled without creating or releasing a session', async () => {
    pickAndScanNotionExport.mockResolvedValueOnce(null)
    const importer = useNotionImport()

    expect(await importer.importExport()).toBeNull()
    expect(createFolder).not.toHaveBeenCalled()
    expect(releaseNotionImport).not.toHaveBeenCalled()
    expect(importer.progress.value.phase).toBe('idle')
  })

  it('continues after attachment and note save failures and reports both', async () => {
    importNotionAssets.mockResolvedValueOnce([{ relativePath: 'files/manual.pdf', asset: null, error: 'read failed' }])
    saveNote.mockRejectedValueOnce(new Error('save failed'))
    const importer = useNotionImport()

    const result = await importer.importExport()

    expect(saveNote).toHaveBeenCalledTimes(3)
    expect(result?.errors).toBeGreaterThanOrEqual(2)
    expect(result?.issues.map(issue => issue.reason)).toEqual(expect.arrayContaining(['read failed', 'save failed']))
    expect(releaseNotionImport).toHaveBeenCalledOnce()
  })

  it('stores raw CSV in a code block when repository import fails', async () => {
    importRecords.mockRejectedValueOnce(new Error('database unavailable'))
    const importer = useNotionImport()

    await importer.importExport()

    const csvSave = saveNote.mock.calls.find(([_, note]) => note.title === 'Tasks')
    expect(csvSave?.[1].content.content[0]).toMatchObject({ type: 'code_block', attrs: { language: 'csv' } })
    expect(releaseNotionImport).toHaveBeenCalledOnce()
  })
})
