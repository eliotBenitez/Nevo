import { describe, expect, it, vi } from 'vitest'
import type { WorkspaceManifest } from '../../types/workspace'
import type { NoteDocument } from '../../types/note'

const commandMocks = vi.hoisted(() => ({
  saveManifest: vi.fn(async (_path: string, _manifest: WorkspaceManifest) => {}),
  saveNote: vi.fn(async (_path: string, _note: NoteDocument) => {}),
  createNotebook: vi.fn(async (_args: { workspacePath: string; folderId?: string | null; title: string; icon: string; paper: 'plain' | 'grid' | 'ruled' }) => ({
    id: 'notebook-native', title: 'Notebook', icon: '📄', folderId: null,
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    documentKind: 'notebook' as const, notebook: { version: 1 as const, pages: [] },
    content: { type: 'doc' as const, content: [] },
  })),
}))

vi.mock('../../tauri/notebook', () => ({ createNotebook: commandMocks.createNotebook }))

vi.mock('../../tauri/commands', () => ({
  workspaceCommands: { saveManifest: commandMocks.saveManifest },
  noteCommands: { saveNote: commandMocks.saveNote },
  folderCommands: {},
  templateCommands: {},
  kanbanCommands: {},
  graphCommands: {},
  noteQueryCommands: {},
}))

vi.mock('../../features/database/databaseRepository', () => ({
  TauriDatabaseRepository: class {},
}))

import { LocalBackend } from './localBackend'

describe('LocalBackend save pass-through', () => {
  it('creates notebooks through the gated native notebook command', async () => {
    const backend = new LocalBackend('/workspace')

    const created = await backend.createNotebook('folder-1', 'Journal', '📓', 'grid')

    expect(commandMocks.createNotebook).toHaveBeenCalledWith({
      workspacePath: '/workspace', folderId: 'folder-1', title: 'Journal', icon: '📓', paper: 'grid',
    })
    expect(created.documentKind).toBe('notebook')
  })

  it('saveManifest forwards an unknown top-level field to the Tauri command unchanged', async () => {
    const backend = new LocalBackend('/workspace')
    const manifest = {
      id: 'ws-1',
      name: 'Team',
      glyph: 'N',
      gradient: 'violet',
      schemaVersion: 1,
      createdAt: '2026-01-01T00:00:00.000Z',
      rootOrder: [],
      tree: [],
      rootNotes: [],
      trash: [],
      sidebarNoteOrder: [],
      futureFeatureFlag: 'from-a-newer-build',
    } as WorkspaceManifest & { futureFeatureFlag: string }

    await backend.saveManifest(manifest)

    expect(commandMocks.saveManifest).toHaveBeenCalledWith('/workspace', manifest)
    const sent = commandMocks.saveManifest.mock.calls[0][1] as typeof manifest
    expect(sent.futureFeatureFlag).toBe('from-a-newer-build')
  })

  it('saveNote forwards an unknown top-level field to the Tauri command unchanged', async () => {
    const backend = new LocalBackend('/workspace')
    const note = {
      id: 'note-1',
      title: 'Note',
      icon: '📄',
      cover: null,
      folderId: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      properties: null,
      content: { type: 'doc', content: [] },
      futureFeatureFlag: 'from-a-newer-build',
    } as unknown as NoteDocument & { futureFeatureFlag: string }

    await backend.saveNote(note)

    expect(commandMocks.saveNote).toHaveBeenCalledWith('/workspace', note)
    const sent = commandMocks.saveNote.mock.calls[0][1] as typeof note
    expect(sent.futureFeatureFlag).toBe('from-a-newer-build')
  })
})
