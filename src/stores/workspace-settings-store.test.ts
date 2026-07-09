import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type {
  AppMetadata,
  PluginManifest,
  WorkspaceDiagnostics,
  WorkspaceManifest,
} from '../types/workspace'
import { configCommands, workspaceCommands } from '../tauri/commands'
import { appLogger } from '../utils/logger'
import { useWorkspaceStore } from './workspace'

vi.mock('../tauri/commands', () => ({
  configCommands: {
    loadAppConfig: vi.fn(),
    saveAppConfig: vi.fn(),
    getAppMetadata: vi.fn(),
  },
  workspaceCommands: {
    createWorkspace: vi.fn(),
    openWorkspace: vi.fn(),
    saveManifest: vi.fn(),
    loadSettings: vi.fn(),
    saveSettings: vi.fn(),
    listPlugins: vi.fn(),
    validatePluginManifest: vi.fn(),
    setPluginEnabled: vi.fn(),
    marketplaceListPlugins: vi.fn(),
    marketplaceInstallPlugin: vi.fn(),
    marketplaceUpdatePlugin: vi.fn(),
    marketplaceRemovePlugin: vi.fn(),
    marketplaceRefreshCache: vi.fn(),
    getWorkspaceDiagnostics: vi.fn(),
    pruneWorkspaceSnapshots: vi.fn(),
    cleanupOrphanedAssets: vi.fn(),
  },
  folderCommands: {},
  noteCommands: {
    listSidebarNotePreviews: vi.fn().mockResolvedValue([]),
  },
}))

vi.mock('../utils/logger', () => ({
  appLogger: {
    error: vi.fn().mockResolvedValue(undefined),
    warn: vi.fn().mockResolvedValue(undefined),
    info: vi.fn().mockResolvedValue(undefined),
    debug: vi.fn().mockResolvedValue(undefined),
  },
}))

function manifest(): WorkspaceManifest {
  return {
    id: 'workspace-id',
    name: 'Workspace',
    glyph: 'N',
    gradient: 'linear-gradient(red, blue)',
    schemaVersion: 1,
    createdAt: '2026-05-15T10:00:00.000Z',
    rootOrder: [],
    tree: [],
    rootNotes: [],
  }
}

function diagnostics(): WorkspaceDiagnostics {
  return {
    workspacePath: '/tmp/workspace',
    notesFolderPath: '/tmp/workspace/notes',
    assetsFolderPath: '/tmp/workspace/.nevo/assets',
    nevoFolderPath: '/tmp/workspace/.nevo',
    settingsPath: '/tmp/workspace/.nevo/settings.json',
    logsPath: '/tmp/app/logs',
    noteCount: 0,
    folderCount: 0,
    pluginCount: 0,
    snapshotCount: 0,
    assetCount: 0,
    workspaceBytes: 0,
    notesBytes: 0,
    assetsBytes: 0,
    snapshotsBytes: 0,
  }
}

function plugin(enabled: boolean): PluginManifest {
  return {
    id: 'plugin.alpha',
    name: 'Alpha',
    version: '1.0.0',
    description: 'Alpha plugin',
    enabled,
    entryPoint: 'index.js',
    apiVersion: '1.0.0',
    editorCapabilities: ['editor.read'],
  }
}

describe('useWorkspaceStore settings integration', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()

    vi.mocked(configCommands.loadAppConfig).mockResolvedValue({ version: '1', theme: 'system', locale: 'ru', recents: [], interfaceDensity: 'comfortable', reducedMotion: 'system', scrollbarVisibility: 'hidden', focusRingStyle: 'accent', windowChromeStyle: 'default', interfaceZoom: 100, reduceTransparency: false, interfaceRoundness: 'default', themeSchedule: { enabled: false, lightTime: '07:00', darkTime: '20:00' } })
    vi.mocked(configCommands.getAppMetadata).mockResolvedValue({
      version: '0.1.0',
      engine: 'Tauri 2',
      runtime: 'desktop',
      platform: 'linux',
      appDataDir: '/tmp/app',
      configPath: '/tmp/app/config.json',
      logsPath: '/tmp/app/logs',
      supportsWindowControls: true,
      supportsGlobalShortcuts: true,
      supportsRevealInFileManager: true,
      supportsWindowDragRegions: true,
    } as AppMetadata)
    vi.mocked(workspaceCommands.getWorkspaceDiagnostics).mockResolvedValue(diagnostics())
  })

  it('normalizes legacy workspace settings on open', async () => {
    vi.mocked(workspaceCommands.openWorkspace).mockResolvedValue(manifest())
    vi.mocked(workspaceCommands.loadSettings).mockResolvedValue({
      defaultView: 'graph',
      editorFontSize: 18,
      editorLineWidth: 'wide',
      spellCheck: true,
    } as never)
    vi.mocked(workspaceCommands.listPlugins).mockResolvedValue([])

    const store = useWorkspaceStore()
    await store.init()
    await store.openWorkspace('/tmp/workspace')

    expect(store.settings.general.defaultStartupView).toBe('graph')
    expect(store.settings.workspace.defaultLandingView).toBe('graph')
    expect(store.settings.workspace.sidebarContentMode).toBe('tree')
    expect(store.settings.appearance.editorFontSize).toBe(18)
    expect(store.settings.editor.spellCheck).toBe(true)
  })

  it('saves nested settings updates through the workspace command', async () => {
    vi.mocked(workspaceCommands.openWorkspace).mockResolvedValue(manifest())
    vi.mocked(workspaceCommands.loadSettings).mockResolvedValue({} as never)
    vi.mocked(workspaceCommands.listPlugins).mockResolvedValue([])
    vi.mocked(workspaceCommands.saveSettings).mockResolvedValue()

    const store = useWorkspaceStore()
    await store.init()
    await store.openWorkspace('/tmp/workspace')
    await store.updateSettings((draft) => {
      draft.editor.spellCheck = true
      draft.files.snapshotRetentionCount = 12
    })

    expect(store.settings.editor.spellCheck).toBe(true)
    expect(store.settings.files.snapshotRetentionCount).toBe(12)
    expect(vi.mocked(workspaceCommands.saveSettings)).toHaveBeenCalledWith(
      '/tmp/workspace',
      expect.objectContaining({
        editor: expect.objectContaining({ spellCheck: true }),
        files: expect.objectContaining({ snapshotRetentionCount: 12 }),
      }),
    )
  })

  it('reloads plugin state after toggling a manifest enabled flag', async () => {
    vi.mocked(workspaceCommands.openWorkspace).mockResolvedValue(manifest())
    vi.mocked(workspaceCommands.loadSettings).mockResolvedValue({} as never)
    vi.mocked(workspaceCommands.listPlugins)
      .mockResolvedValueOnce([plugin(true)])
      .mockResolvedValueOnce([plugin(false)])
    vi.mocked(workspaceCommands.setPluginEnabled).mockResolvedValue()

    const store = useWorkspaceStore()
    await store.init()
    await store.openWorkspace('/tmp/workspace')
    await store.setPluginEnabled('plugin.alpha', false)

    expect(vi.mocked(workspaceCommands.setPluginEnabled)).toHaveBeenCalledWith('/tmp/workspace', 'plugin.alpha', false)
    expect(store.plugins[0]?.enabled).toBe(false)
  })

  it('reloads installed plugins after marketplace install', async () => {
    vi.mocked(workspaceCommands.openWorkspace).mockResolvedValue(manifest())
    vi.mocked(workspaceCommands.loadSettings).mockResolvedValue({} as never)
    vi.mocked(workspaceCommands.listPlugins)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([plugin(true)])
    vi.mocked(workspaceCommands.marketplaceInstallPlugin).mockResolvedValue(plugin(true))
    vi.mocked(workspaceCommands.marketplaceListPlugins).mockResolvedValue({
      repo: 'eliotBenitez/nevo-marketplace',
      branch: 'main',
      updatedAt: '2026-07-05T00:00:00.000Z',
      fromCache: false,
      error: null,
      plugins: [],
    })

    const store = useWorkspaceStore()
    await store.init()
    await store.openWorkspace('/tmp/workspace')
    await store.installMarketplacePlugin('plugin.alpha', '1.0.0')

    expect(vi.mocked(workspaceCommands.marketplaceInstallPlugin)).toHaveBeenCalledWith('/tmp/workspace', 'plugin.alpha', '1.0.0')
    expect(store.plugins[0]?.id).toBe('plugin.alpha')
  })

  it('persists locale changes through app config', async () => {
    const store = useWorkspaceStore()
    await store.init()
    await store.setAppLocale('en')

    expect(store.appConfig.locale).toBe('en')
    expect(vi.mocked(configCommands.saveAppConfig)).toHaveBeenCalledWith(expect.objectContaining({
      locale: 'en',
    }))
  })

  it('logs save settings failures with workspace context', async () => {
    vi.mocked(workspaceCommands.openWorkspace).mockResolvedValue(manifest())
    vi.mocked(workspaceCommands.loadSettings).mockResolvedValue({} as never)
    vi.mocked(workspaceCommands.listPlugins).mockResolvedValue([])
    vi.mocked(workspaceCommands.saveSettings).mockRejectedValue(new Error('disk full'))

    const store = useWorkspaceStore()
    await store.init()
    await store.openWorkspace('/tmp/workspace')

    await expect(store.updateSettings((draft) => {
      draft.editor.spellCheck = true
    })).rejects.toThrow('disk full')

    expect(vi.mocked(appLogger.error)).toHaveBeenCalledWith(expect.objectContaining({
      source: 'frontend.workspace',
      event: 'save_settings',
      workspacePath: '/tmp/workspace',
    }))
  })
})
