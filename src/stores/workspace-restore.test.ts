import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { AppConfig, RecentWorkspace, WorkspaceManifest } from '../types/workspace'
import { configCommands } from '../tauri/commands'
import { resolveBackend } from '../core/workspace-backend'
import { useNoteStore } from './note'
import { useWorkspaceStore } from './workspace'

vi.mock('../core/plugins/marketplaceMigration', () => ({
  runMarketplacePluginTransaction: vi.fn(),
}))

vi.mock('../core/plugins/marketplaceRuntime', () => ({
  pauseMarketplaceRuntime: vi.fn(),
}))

vi.mock('../utils/logger', () => ({
  appLogger: {
    error: vi.fn().mockResolvedValue(undefined),
    warn: vi.fn().mockResolvedValue(undefined),
    info: vi.fn().mockResolvedValue(undefined),
    debug: vi.fn().mockResolvedValue(undefined),
  },
}))

vi.mock('../tauri/commands', () => ({
  configCommands: {
    loadAppConfig: vi.fn(),
    saveAppConfig: vi.fn().mockResolvedValue(undefined),
    getAppMetadata: vi.fn(),
  },
  workspaceCommands: {
    loadManifest: vi.fn(),
  },
  githubSyncCommands: {
    startAuto: vi.fn().mockResolvedValue(undefined),
    stopAuto: vi.fn().mockResolvedValue(undefined),
  },
  folderCommands: {},
  noteCommands: {
    listSidebarNotePreviews: vi.fn().mockResolvedValue([]),
  },
}))

function backendStub(manifestName: string) {
  return {
    open: vi.fn().mockResolvedValue(manifest(manifestName)),
    loadSettings: vi.fn().mockResolvedValue({}),
    listPlugins: vi.fn().mockResolvedValue([]),
    getDiagnostics: vi.fn().mockResolvedValue(null),
    listSidebarNotePreviews: vi.fn().mockResolvedValue([]),
    loadCustomCss: vi.fn().mockResolvedValue(''),
  }
}

const firstBackend = backendStub('First workspace')
const secondBackend = backendStub('Second workspace')

vi.mock('../core/workspace-backend', () => ({
  resolveBackend: vi.fn(() => firstBackend),
}))

function manifest(name: string): WorkspaceManifest {
  return {
    id: 'workspace-id',
    name,
    glyph: 'N',
    gradient: 'linear-gradient(red, blue)',
    schemaVersion: 1,
    createdAt: '2026-05-15T10:00:00.000Z',
    rootOrder: [],
    tree: [],
    rootNotes: [],
  }
}

function recent(id: string, name: string, path: string, lastOpened: string): RecentWorkspace {
  return {
    id,
    name,
    glyph: 'L',
    gradient: 'linear-gradient(red, blue)',
    path,
    lastOpened,
    pageCount: 0,
  }
}

function appConfig(recents: RecentWorkspace[]): AppConfig {
  return {
    version: '1',
    theme: 'system',
    locale: 'ru',
    recents,
    interfaceDensity: 'comfortable',
    reducedMotion: 'system',
    scrollbarVisibility: 'hidden',
    focusRingStyle: 'accent',
    windowChromeStyle: 'default',
    interfaceZoom: 100,
    reduceTransparency: false,
    interfaceRoundness: 'default',
    themeSchedule: { enabled: false, lightTime: '07:00', darkTime: '20:00' },
    onboarding: { tourStatus: 'pending', firstSteps: [], firstStepsHidden: false, seenHints: [], hintsEnabled: true },
  }
}

describe('useWorkspaceStore.restoreLastWorkspace', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    vi.mocked(configCommands.getAppMetadata).mockResolvedValue({ platform: 'linux' } as never)
    vi.mocked(configCommands.saveAppConfig).mockResolvedValue(undefined)
  })

  it('restores the most recently opened workspace', async () => {
    vi.mocked(configCommands.loadAppConfig).mockResolvedValue(appConfig([
      recent('first', 'First workspace', '/tmp/first', '2026-05-15T10:00:00.000Z'),
      recent('second', 'Second workspace', '/tmp/second', '2026-05-14T10:00:00.000Z'),
    ]))

    const store = useWorkspaceStore()
    await store.init()
    const restored = await store.restoreLastWorkspace()

    expect(restored).toBe(true)
    expect(store.backendKind).toBe('local')
    expect(store.activePath).toBe('/tmp/first')
    expect(store.manifest?.name).toBe('First workspace')
    expect(vi.mocked(resolveBackend)).toHaveBeenCalled()
  })

  it('falls back to the next recent workspace when the most recent one fails to open', async () => {
    vi.mocked(configCommands.loadAppConfig).mockResolvedValue(appConfig([
      recent('first', 'First workspace', '/tmp/first', '2026-05-15T10:00:00.000Z'),
      recent('second', 'Second workspace', '/tmp/second', '2026-05-14T10:00:00.000Z'),
    ]))
    firstBackend.open.mockRejectedValueOnce(new Error('missing'))
    vi.mocked(resolveBackend).mockImplementationOnce(() => firstBackend as never)
      .mockImplementationOnce(() => secondBackend as never)

    const store = useWorkspaceStore()
    await store.init()
    const restored = await store.restoreLastWorkspace()

    expect(restored).toBe(true)
    expect(store.activePath).toBe('/tmp/second')
    expect(store.manifest?.name).toBe('Second workspace')
  })

  it('returns false when there are no recent workspaces', async () => {
    vi.mocked(configCommands.loadAppConfig).mockResolvedValue(appConfig([]))

    const store = useWorkspaceStore()
    await store.init()
    const restored = await store.restoreLastWorkspace()

    expect(restored).toBe(false)
    expect(store.backendKind).toBeNull()
  })

  it('keeps the current workspace active when a notebook has pending input', async () => {
    const store = useWorkspaceStore()
    store.activeHandle = { kind: 'local', path: '/tmp/current' }
    const noteStore = useNoteStore()
    noteStore.activeNote = {
      id: 'pending-workspace-notebook', title: 'Notebook', icon: '📓', folderId: null,
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
      content: { type: 'doc', content: [{ type: 'paragraph' }] },
      documentKind: 'notebook',
      notebook: { version: 1, pages: [{ id: 'p', width: 595.28, height: 841.89, paper: { kind: 'plain' }, objects: [] }] },
    }
    vi.spyOn(noteStore, 'flushDurably').mockResolvedValue({ ok: false, error: new Error('pending input') })

    await expect(store.openWorkspace('/tmp/next')).rejects.toThrow('pending input')

    expect(store.activePath).toBe('/tmp/current')
  })

  it('refreshes an existing recent count with root and nested notes when opening', async () => {
    const loaded = manifest('First workspace')
    loaded.rootNotes = [{ id: 'root', title: 'Root', icon: '', folderId: null, updatedAt: '' }]
    loaded.tree = [{
      id: 'folder', title: 'Folder', icon: '', parentId: null, order: 0,
      notes: [{ id: 'folder-note', title: 'Note', icon: '', folderId: 'folder', updatedAt: '' }],
      children: [{
        id: 'nested', title: 'Nested', icon: '', parentId: 'folder', order: 0,
        notes: [{ id: 'nested-note', title: 'Note', icon: '', folderId: 'nested', updatedAt: '' }], children: [],
      }],
    }]
    firstBackend.open.mockResolvedValueOnce(loaded)
    const store = useWorkspaceStore()
    store.recents = [recent('workspace-id', 'First workspace', '/tmp/first', '')]

    await store.openWorkspace('/tmp/first')

    expect(store.recents[0].pageCount).toBe(3)
  })
})
