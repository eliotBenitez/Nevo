import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { FolderMeta, NoteDocument, VaultManifest } from '../types/note'
import type { WorkspaceManifest } from '../types/workspace'

const commandMocks = vi.hoisted(() => ({
  pickWorkspaceDirectory: vi.fn(),
  readObsidianVault: vi.fn(),
  saveNote: vi.fn(async (_workspacePath: string, _note: NoteDocument) => undefined),
  deleteYjsState: vi.fn(async () => undefined),
  importVaultAsset: vi.fn(),
}))
vi.mock('../tauri/commands', () => ({
  systemCommands: { pickWorkspaceDirectory: commandMocks.pickWorkspaceDirectory },
  noteCommands: {
    readObsidianVault: commandMocks.readObsidianVault,
    saveNote: commandMocks.saveNote,
    importVaultAsset: commandMocks.importVaultAsset,
  },
  collabCommands: { deleteYjsState: commandMocks.deleteYjsState },
}))

let folderCounter = 0
let noteCounter = 0

const mockBackend = vi.hoisted(() => ({
  createFolder: vi.fn(),
  createNote: vi.fn(),
  listSidebarNotePreviews: vi.fn(async () => []),
}))

vi.mock('../core/workspace-backend', async () => {
  const actual = await vi.importActual<typeof import('../core/workspace-backend')>('../core/workspace-backend')
  return {
    ...actual,
    resolveBackend: () => mockBackend,
  }
})

function emptyManifest(): WorkspaceManifest {
  return {
    id: 'ws',
    name: 'WS',
    glyph: 'N',
    gradient: '',
    schemaVersion: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    rootOrder: [],
    tree: [],
    rootNotes: [],
  }
}

beforeEach(async () => {
  setActivePinia(createPinia())
  folderCounter = 0
  noteCounter = 0
  commandMocks.pickWorkspaceDirectory.mockReset()
  commandMocks.readObsidianVault.mockReset()
  commandMocks.saveNote.mockClear()
  commandMocks.deleteYjsState.mockClear()
  commandMocks.importVaultAsset.mockReset()
  mockBackend.createFolder.mockReset()
  mockBackend.createNote.mockReset()
  mockBackend.listSidebarNotePreviews.mockClear()

  mockBackend.createFolder.mockImplementation(async (parentId: string | null, title: string, icon: string): Promise<FolderMeta> => {
    folderCounter++
    return { id: `folder-${folderCounter}`, title, icon, parentId, order: 0, children: [], notes: [] }
  })
  mockBackend.createNote.mockImplementation(async (folderId: string | null, title: string, icon: string): Promise<NoteDocument> => {
    noteCounter++
    return {
      id: `note-${noteCounter}`,
      title,
      icon,
      folderId,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      content: { type: 'doc', content: [] },
    }
  })

  const { useWorkspaceStore } = await import('../stores/workspace')
  const workspaceStore = useWorkspaceStore()
  workspaceStore.activeHandle = { kind: 'local', path: '/workspace' } as never
  workspaceStore.manifest = emptyManifest()
})

describe('useObsidianImport', () => {
  it('returns null without touching anything when there is no active workspace', async () => {
    const { useWorkspaceStore } = await import('../stores/workspace')
    useWorkspaceStore().activeHandle = null
    const { useObsidianImport } = await import('./useObsidianImport')
    const { importVault } = useObsidianImport()

    const result = await importVault(null)

    expect(result).toBeNull()
    expect(commandMocks.pickWorkspaceDirectory).not.toHaveBeenCalled()
  })

  it('resets to idle and returns null when the user cancels the vault picker', async () => {
    commandMocks.pickWorkspaceDirectory.mockResolvedValue(null)
    const { useObsidianImport } = await import('./useObsidianImport')
    const { importVault, progress } = useObsidianImport()

    const result = await importVault(null)

    expect(result).toBeNull()
    expect(progress.value.phase).toBe('idle')
    expect(commandMocks.readObsidianVault).not.toHaveBeenCalled()
  })

  it('creates folders top-down, creates a note per file, resolves wiki-links across the vault, and persists them', async () => {
    commandMocks.pickWorkspaceDirectory.mockResolvedValue('/vault')
    const manifest: VaultManifest = {
      rootName: 'MyVault',
      notes: [
        { relativePath: 'root.md', content: '# Root\n\nSee [[folder/Note]]' },
        { relativePath: 'folder/Note.md', content: '# Note H1\n\nHello' },
      ],
      assets: [],
      skipped: [{ relativePath: 'big.pdf', reason: 'unsupported' }],
    }
    commandMocks.readObsidianVault.mockResolvedValue(manifest)

    const { useObsidianImport } = await import('./useObsidianImport')
    const { importVault, progress } = useObsidianImport()

    const result = await importVault(null)

    expect(result).toEqual({
      rootName: 'MyVault',
      notesCreated: 2,
      foldersCreated: 1,
      unresolvedLinks: 0,
      skippedFiles: 1,
      attachmentsImported: 0,
      unresolvedEmbeds: 0,
      notesWithFrontmatter: 0,
      tagsCollected: 0,
    })
    expect(progress.value.phase).toBe('done')

    // One folder ("folder"), created with the root as its parent.
    expect(mockBackend.createFolder).toHaveBeenCalledTimes(1)
    expect(mockBackend.createFolder).toHaveBeenCalledWith(null, 'folder', '📁')

    // Two notes created, titled by filename basename (not by any H1).
    expect(mockBackend.createNote).toHaveBeenCalledTimes(2)
    expect(mockBackend.createNote).toHaveBeenCalledWith(null, 'root', '📄')
    expect(mockBackend.createNote).toHaveBeenCalledWith('folder-1', 'Note', '📄')

    // Both notes persisted with title = filename basename.
    expect(commandMocks.saveNote).toHaveBeenCalledTimes(2)
    const savedTitles = commandMocks.saveNote.mock.calls.map(([, note]) => (note as NoteDocument).title)
    expect(savedTitles.sort()).toEqual(['Note', 'root'])

    // The root note's wiki link to folder/Note resolved to the created note's id.
    const rootSaveCall = commandMocks.saveNote.mock.calls.find(([, note]) => (note as NoteDocument).title === 'root')
    const rootContent = (rootSaveCall![1] as NoteDocument).content
    const linkMark = JSON.stringify(rootContent).includes('"noteId":"note-2"')
    expect(linkMark).toBe(true)

    // The body H1 is preserved (title comes from the filename, not the H1).
    expect(JSON.stringify(rootContent)).toContain('"type":"heading"')

    // Local-backend persistence resets the disk-backed Y.Doc for each note.
    expect(commandMocks.deleteYjsState).toHaveBeenCalledTimes(2)
  })

  it('counts an unresolved wiki-link and still completes the import', async () => {
    commandMocks.pickWorkspaceDirectory.mockResolvedValue('/vault')
    const manifest: VaultManifest = {
      rootName: 'MyVault',
      notes: [{ relativePath: 'root.md', content: 'See [[Ghost]]' }],
      assets: [],
      skipped: [],
    }
    commandMocks.readObsidianVault.mockResolvedValue(manifest)

    const { useObsidianImport } = await import('./useObsidianImport')
    const { importVault } = useObsidianImport()

    const result = await importVault(null)

    expect(result?.unresolvedLinks).toBe(1)
    expect(result?.notesCreated).toBe(1)
  })

  it('imports an Obsidian image embed via importVaultAsset and rewrites its src', async () => {
    commandMocks.pickWorkspaceDirectory.mockResolvedValue('/vault')
    const manifest: VaultManifest = {
      rootName: 'MyVault',
      notes: [{ relativePath: 'root.md', content: '![[pic.png]]' }],
      assets: [{ relativePath: 'pic.png', size: 100 }],
      skipped: [],
    }
    commandMocks.readObsidianVault.mockResolvedValue(manifest)
    commandMocks.importVaultAsset.mockResolvedValue({
      src: '.nevo/assets/hash-pic.png',
      hash: 'hash',
      deduplicated: false,
      bytes: 100,
    })

    const { useObsidianImport } = await import('./useObsidianImport')
    const { importVault } = useObsidianImport()

    const result = await importVault(null)

    expect(result?.attachmentsImported).toBe(1)
    expect(result?.unresolvedEmbeds).toBe(0)
    expect(commandMocks.importVaultAsset).toHaveBeenCalledWith('/workspace', '/vault', 'pic.png')
    const savedContent = (commandMocks.saveNote.mock.calls[0][1] as NoteDocument).content
    expect(JSON.stringify(savedContent)).toContain('.nevo/assets/hash-pic.png')
  })

  it('counts an unresolved embed when the referenced attachment is missing from the vault', async () => {
    commandMocks.pickWorkspaceDirectory.mockResolvedValue('/vault')
    const manifest: VaultManifest = {
      rootName: 'MyVault',
      notes: [{ relativePath: 'root.md', content: '![[missing.png]]' }],
      assets: [],
      skipped: [],
    }
    commandMocks.readObsidianVault.mockResolvedValue(manifest)

    const { useObsidianImport } = await import('./useObsidianImport')
    const { importVault } = useObsidianImport()

    const result = await importVault(null)

    expect(result?.unresolvedEmbeds).toBe(1)
    expect(result?.attachmentsImported).toBe(0)
    expect(commandMocks.importVaultAsset).not.toHaveBeenCalled()
  })

  it('maps frontmatter onto note properties, tables the leftover keys, and merges inline tags', async () => {
    commandMocks.pickWorkspaceDirectory.mockResolvedValue('/vault')
    const content = [
      '---',
      'tags: [alpha, beta]',
      'status: active',
      'type: project',
      'date: 2026-03-04',
      'author: Ada',
      '---',
      '',
      'Body with #gamma tag.',
    ].join('\n')
    commandMocks.readObsidianVault.mockResolvedValue({
      rootName: 'MyVault',
      notes: [{ relativePath: 'root.md', content }],
      assets: [],
      skipped: [],
    } satisfies VaultManifest)

    const { useObsidianImport } = await import('./useObsidianImport')
    const { importVault } = useObsidianImport()

    const result = await importVault(null)

    expect(result?.notesWithFrontmatter).toBe(1)
    expect(result?.tagsCollected).toBe(3)

    const saved = commandMocks.saveNote.mock.calls[0][1] as NoteDocument
    expect(saved.properties).toEqual({
      type: 'project',
      status: 'active',
      date: '2026-03-04',
      tags: ['alpha', 'beta', 'gamma'],
    })

    // The unmapped `author` key is preserved as a leading key/value table.
    const first = saved.content.content?.[0]
    expect(first?.type).toBe('table')
    expect(JSON.stringify(first)).toContain('author')
    expect(JSON.stringify(first)).toContain('Ada')
  })

  it('converts callouts and highlights, and strips %%comments%% from the body', async () => {
    commandMocks.pickWorkspaceDirectory.mockResolvedValue('/vault')
    const content = [
      '> [!warning] Careful',
      '> mind the gap',
      '',
      'A ==bright== word %%and a hidden note%%.',
    ].join('\n')
    commandMocks.readObsidianVault.mockResolvedValue({
      rootName: 'MyVault',
      notes: [{ relativePath: 'root.md', content }],
      assets: [],
      skipped: [],
    } satisfies VaultManifest)

    const { useObsidianImport } = await import('./useObsidianImport')
    const { importVault } = useObsidianImport()

    await importVault(null)

    const saved = commandMocks.saveNote.mock.calls[0][1] as NoteDocument
    const serialized = JSON.stringify(saved.content)

    const callout = saved.content.content?.[0]
    expect(callout?.type).toBe('callout')
    expect(callout?.attrs).toEqual({ variant: 'warning', icon: '⚠️' })
    expect(serialized).toContain('mind the gap')

    expect(serialized).toContain('"type":"highlight"')
    expect(serialized).not.toContain('==')
    expect(serialized).not.toContain('hidden note')
  })
})
