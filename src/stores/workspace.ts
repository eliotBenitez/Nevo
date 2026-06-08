import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { applyAppLocale } from '../i18n'
import type {
  AppMetadata,
  AppConfig,
  AppLocale,
  WorkspaceCleanupReport,
  WorkspaceDiagnostics,
  PluginManifest,
  RecentWorkspace,
  WorkspaceConfig,
  WorkspaceManifest,
  ThemeMode,
  WorkspaceSettings,
} from '../types/workspace'
import { configCommands, workspaceCommands } from '../tauri/commands'
import { resolveBackend, CloudBackend, type WorkspaceBackend, type WorkspaceHandle } from '../core/workspace-backend'
import { useSharedStorageStore } from './sharedStorage'
import { useAuthStore } from './auth'
import { useServerConfigStore } from './serverConfig'
import { useApiClient } from '../app/composables/useApiClient'
import type { CloudDocument, SharedStorage } from '../types/cloud'
import {
  cloneWorkspaceSettings,
  createDefaultAppConfig,
  createDefaultWorkspaceSettings,
  normalizeAppConfig,
  normalizeWorkspaceSettings,
} from '../utils/workspace-settings'
import { appLogger } from '../utils/logger'
import { applyWorkspaceStyle } from '../utils/apply-workspace-style'
import { expandHomePath } from '../utils/workspacePath'

export function getRestoreCandidates(recents: RecentWorkspace[]): RecentWorkspace[] {
  return [...recents]
    .map((workspace, index) => ({ workspace, index }))
    .sort((a, b) => {
      const aTime = Date.parse(a.workspace.lastOpened)
      const bTime = Date.parse(b.workspace.lastOpened)

      if (Number.isNaN(aTime) && Number.isNaN(bTime)) return a.index - b.index
      if (Number.isNaN(aTime)) return 1
      if (Number.isNaN(bTime)) return -1
      if (aTime === bTime) return a.index - b.index

      return bTime - aTime
    })
    .map(({ workspace }) => workspace)
}

export const useWorkspaceStore = defineStore('workspace', () => {
  const manifest = ref<WorkspaceManifest | null>(null)
  const settings = ref<WorkspaceSettings>(createDefaultWorkspaceSettings())
  const plugins = ref<PluginManifest[]>([])
  const recents = ref<RecentWorkspace[]>([])
  const activeHandle = ref<WorkspaceHandle | null>(null)
  // Cloud backends need async setup (DEK fetch + live Yjs), so they are built by
  // openCloudWorkspace and stored here; local backends are resolved on the fly.
  const _cloudBackend = ref<WorkspaceBackend | null>(null)
  // The backend follows the handle (memoized; identity changes only when the
  // handle changes, which stores use to detect workspace switches).
  const backend = computed<WorkspaceBackend | null>(() => {
    if (!activeHandle.value) return null
    if (activeHandle.value.kind === 'local') return resolveBackend(activeHandle.value)
    return _cloudBackend.value
  })
  // Compatibility getter: most shell/UI code reads `activePath`. It resolves to
  // the filesystem path for local workspaces and null for cloud ones.
  const activePath = computed(() =>
    activeHandle.value?.kind === 'local' ? activeHandle.value.path : null)
  const backendKind = computed(() => activeHandle.value?.kind ?? null)
  const isOnboarded = ref(false)

  function _setHandle(handle: WorkspaceHandle | null) {
    // Tear down a previous cloud backend (closes its live Yjs sessions) when
    // switching to a different workspace.
    if (_cloudBackend.value && handle?.kind !== 'cloud') {
      ;(_cloudBackend.value as CloudBackend).destroy()
      _cloudBackend.value = null
    }
    activeHandle.value = handle
  }
  const appConfig = ref<AppConfig>(createDefaultAppConfig())
  const diagnostics = ref<WorkspaceDiagnostics | null>(null)
  const appMetadata = ref<AppMetadata | null>(null)

  async function init() {
    try {
      const [config, metadata] = await Promise.all([
        configCommands.loadAppConfig(),
        configCommands.getAppMetadata(),
      ])
      appConfig.value = normalizeAppConfig(config)
      recents.value = appConfig.value.recents
      appMetadata.value = metadata
      applyAppLocale(appConfig.value.locale)
    } catch (error) {
      await appLogger.warn({
        source: 'frontend.workspace',
        event: 'init',
        message: 'Falling back to default app config',
        error,
      })
      // first run or web dev — no-op
      appConfig.value = createDefaultAppConfig()
      recents.value = appConfig.value.recents
      applyAppLocale(appConfig.value.locale)
    }
  }

  async function restoreLastWorkspace(): Promise<boolean> {
    const candidates = getRestoreCandidates(recents.value)
    for (const workspace of candidates) {
      // Cloud workspaces require auth + network; they are opened explicitly from
      // the recents UI, never auto-restored on launch.
      if (workspace.kind === 'cloud') continue
      try {
        await openWorkspace(workspace.path)
        return true
      } catch (error) {
        await appLogger.warn({
          source: 'frontend.workspace',
          event: 'restore_last_workspace',
          message: 'Failed to restore recent workspace candidate',
          workspacePath: workspace.path,
          workspaceId: workspace.id,
          error,
        })
        // workspace no longer available or invalid — try the next recent entry
      }
    }

    return false
  }

  async function createWorkspace(config: WorkspaceConfig) {
    // Store an absolute path so asset:// URLs stay within the protocol scope.
    const path = await expandHomePath(config.path)
    try {
      const newManifest = await workspaceCommands.createWorkspace({
        path,
        name: config.name,
        glyph: config.glyph,
        gradient: config.gradient,
      })
      manifest.value = newManifest
      _setHandle({ kind: 'local', path })
      await hydrateWorkspaceState()
      await _persistRecent(path, newManifest)
      isOnboarded.value = true
    } catch (error) {
      await appLogger.error({
        source: 'frontend.workspace',
        event: 'create_workspace',
        message: 'Failed to create workspace',
        workspacePath: config.path,
        error,
        payload: { name: config.name },
      })
      throw error
    }
  }

  async function openWorkspace(rawPath: string) {
    // Store an absolute path so asset:// URLs stay within the protocol scope.
    const path = await expandHomePath(rawPath)
    try {
      _setHandle({ kind: 'local', path })
      const loadedManifest = await backend.value!.open()
      manifest.value = loadedManifest
      await hydrateWorkspaceState()
      await _persistRecent(path, loadedManifest)
      isOnboarded.value = true
    } catch (error) {
      await appLogger.error({
        source: 'frontend.workspace',
        event: 'open_workspace',
        message: 'Failed to open workspace',
        workspacePath: path,
        error,
      })
      throw error
    }
  }

  /** Open a server-hosted shared storage as a workspace (cloud backend). */
  async function openCloudWorkspace(storageId: string) {
    const shared = useSharedStorageStore()
    const auth = useAuthStore()
    const server = useServerConfigStore()
    const api = useApiClient()
    try {
      if (!shared.storages.length) await shared.loadStorages()
      const storage = shared.storages.find(s => s.id === storageId)
      if (!storage) throw new Error('shared storage not found')

      const key = await shared.getDekKey(storageId)
      const cloud = new CloudBackend({
        storageId,
        name: storage.name,
        glyph: storage.glyph,
        gradient: storage.gradient,
        manifestRoom: storage.manifestRoom,
        key,
        token: auth.accessToken ?? '',
        wsBase: server.wsBase,
        listDocuments: (id) => api.get<CloudDocument[]>(`/api/v1/storages/${id}/documents`),
        createDocument: (id) => api.post<CloudDocument>(`/api/v1/storages/${id}/documents`),
        listSnapshots: (docId) =>
          api.get<Array<{ id: string; label: string; createdAt: string }>>(`/api/v1/storages/${storageId}/documents/${docId}/snapshots`),
        createSnapshot: (docId, blob, label) =>
          api.postBinary(`/api/v1/storages/${storageId}/documents/${docId}/snapshots?label=${encodeURIComponent(label)}`, blob),
        getSnapshot: (snapshotId) =>
          api.getBinary(`/api/v1/storages/${storageId}/snapshots/${snapshotId}`),
        uploadAsset: (blob, contentType) =>
          api.postBinary<{ id: string }>(`/api/v1/storages/${storageId}/assets`, blob, contentType),
        fetchAsset: (assetId) =>
          api.getBinaryTyped(`/api/v1/storages/${storageId}/assets/${assetId}`),
        onManifest: (m) => { manifest.value = m },
      })

      _setHandle(null) // tear down any previous workspace
      _cloudBackend.value = cloud
      activeHandle.value = { kind: 'cloud', storageId }

      manifest.value = await cloud.open()
      settings.value = normalizeWorkspaceSettings(await cloud.loadSettings())
      applyWorkspaceStyle(settings.value.appearance)
      plugins.value = []
      diagnostics.value = await cloud.getDiagnostics()
      isOnboarded.value = true
      await _persistCloudRecent(storage)
    } catch (error) {
      await appLogger.error({
        source: 'frontend.workspace',
        event: 'open_cloud_workspace',
        message: 'Failed to open cloud workspace',
        error,
        payload: { storageId },
      })
      throw error
    }
  }

  async function _persistCloudRecent(storage: SharedStorage) {
    const now = new Date().toISOString()
    const existing = recents.value.find(r => r.storageId === storage.id)
    const recent: RecentWorkspace = existing
      ? { ...existing, name: storage.name, glyph: storage.glyph, gradient: storage.gradient, lastOpened: now }
      : {
          id: storage.id,
          name: storage.name,
          glyph: storage.glyph,
          gradient: storage.gradient,
          path: `cloud:${storage.id}`,
          lastOpened: now,
          pageCount: 0,
          kind: 'cloud',
          storageId: storage.id,
        }
    recents.value = [recent, ...recents.value.filter(r => r.storageId !== storage.id)]
    await saveAppConfig({ recents: recents.value })
  }

  async function removeRecentWorkspace(workspace: Pick<RecentWorkspace, 'path' | 'storageId'>) {
    const nextRecents = workspace.storageId
      ? recents.value.filter(r => r.storageId !== workspace.storageId)
      : recents.value.filter(r => r.path !== workspace.path)
    await saveAppConfig({ recents: nextRecents })
  }

  async function hydrateWorkspaceState() {
    if (!backend.value) return
    try {
      const [ws, pluginList, workspaceDiagnostics] = await Promise.all([
        backend.value.loadSettings(),
        backend.value.listPlugins(),
        backend.value.getDiagnostics(),
      ])

      settings.value = normalizeWorkspaceSettings(ws)
      applyWorkspaceStyle(settings.value.appearance)
      plugins.value = pluginList
      diagnostics.value = workspaceDiagnostics
    } catch (error) {
      await appLogger.error({
        source: 'frontend.workspace',
        event: 'hydrate_workspace_state',
        message: 'Failed to hydrate workspace state',
        workspacePath: activePath.value ?? undefined,
        error,
      })
      throw error
    }
  }

  async function _persistRecent(path: string, ws: WorkspaceManifest) {
    const now = new Date().toISOString()
    const existing = recents.value.find(r => r.path === path)
    const recent: RecentWorkspace = existing
      ? { ...existing, lastOpened: now }
      : {
          id: ws.id,
          name: ws.name,
          glyph: ws.glyph,
          gradient: ws.gradient,
          path,
          lastOpened: now,
          pageCount: (ws.rootNotes?.length ?? 0),
        }
    recents.value = [recent, ...recents.value.filter(r => r.path !== path)]
    await saveAppConfig({ recents: recents.value })
  }

  async function saveAppConfig(patch: Partial<AppConfig>) {
    const nextConfig = normalizeAppConfig({
      ...appConfig.value,
      ...patch,
    })
    appConfig.value = nextConfig
    recents.value = nextConfig.recents

    try {
      await configCommands.saveAppConfig(nextConfig)
    } catch (error) {
      await appLogger.warn({
        source: 'frontend.workspace',
        event: 'save_app_config',
        message: 'Failed to persist app config, keeping in-memory state',
        error,
      })
      // web dev fallback
    }
  }

  async function setAppTheme(theme: ThemeMode) {
    await saveAppConfig({ theme })
  }

  async function setAppLocale(locale: AppLocale) {
    applyAppLocale(locale)
    await saveAppConfig({ locale })
  }

  async function saveSettings(nextSettings: WorkspaceSettings) {
    if (!backend.value) return
    const normalized = normalizeWorkspaceSettings(nextSettings)
    try {
      settings.value = normalized
      applyWorkspaceStyle(normalized.appearance)
      await backend.value.saveSettings(normalized)
      await loadDiagnostics()
    } catch (error) {
      await appLogger.error({
        source: 'frontend.workspace',
        event: 'save_settings',
        message: 'Failed to save workspace settings',
        workspacePath: activePath.value,
        error,
      })
      throw error
    }
  }

  async function updateSettings(mutator: (draft: WorkspaceSettings) => void) {
    const draft = cloneWorkspaceSettings(settings.value)
    mutator(draft)
    await saveSettings(draft)
  }

  async function resetSettings() {
    await saveSettings(createDefaultWorkspaceSettings())
  }

  async function updateLastContext(context: { noteId: string | null; folderId: string | null }) {
    await updateSettings((draft) => {
      draft.general.lastContext = {
        kind: context.noteId ? 'note' : context.folderId ? 'folder' : 'workspace',
        noteId: context.noteId,
        folderId: context.folderId,
      }
    })
  }

  async function saveWorkspaceManifest(nextManifest: WorkspaceManifest) {
    if (!backend.value) return
    try {
      manifest.value = nextManifest
      await backend.value.saveManifest(nextManifest)
      if (activePath.value) await _persistRecent(activePath.value, nextManifest)
      await loadDiagnostics()
    } catch (error) {
      await appLogger.error({
        source: 'frontend.workspace',
        event: 'save_manifest',
        message: 'Failed to save workspace manifest',
        workspacePath: activePath.value,
        workspaceId: nextManifest.id,
        error,
      })
      throw error
    }
  }

  async function reloadPlugins() {
    if (!backend.value) return
    try {
      plugins.value = await backend.value.listPlugins()
      await loadDiagnostics()
    } catch (error) {
      await appLogger.error({
        source: 'frontend.workspace',
        event: 'reload_plugins',
        message: 'Failed to reload plugins',
        workspacePath: activePath.value,
        error,
      })
      throw error
    }
  }

  async function setPluginEnabled(pluginId: string, enabled: boolean) {
    if (!backend.value) return
    await backend.value.setPluginEnabled(pluginId, enabled)
    await reloadPlugins()
  }

  async function loadDiagnostics() {
    if (!backend.value) {
      diagnostics.value = null
      return
    }
    try {
      diagnostics.value = await backend.value.getDiagnostics()
    } catch (error) {
      await appLogger.error({
        source: 'frontend.workspace',
        event: 'load_diagnostics',
        message: 'Failed to load workspace diagnostics',
        workspacePath: activePath.value,
        error,
      })
      throw error
    }
  }

  async function pruneSnapshots(keepPerNote: number): Promise<WorkspaceCleanupReport | null> {
    if (!backend.value) return null
    const report = await backend.value.pruneSnapshots(keepPerNote)
    await loadDiagnostics()
    return report
  }

  async function cleanupOrphanedAssets(): Promise<WorkspaceCleanupReport | null> {
    if (!backend.value) return null
    const report = await backend.value.cleanupOrphanedAssets()
    await loadDiagnostics()
    return report
  }

  function getRelativeTime(isoString: string): string {
    const date = new Date(isoString)
    const diff = Date.now() - date.getTime()
    const h = diff / (1000 * 60 * 60)
    if (h < 1) return 'just now'
    if (h < 2) return '1 hour ago'
    if (h < 24) return `${Math.floor(h)} hours ago`
    if (h < 48) return 'yesterday'
    const d = Math.floor(h / 24)
    if (d < 7) return `${d} days ago`
    return date.toLocaleDateString('en', { month: 'short', day: 'numeric' })
  }

  return {
    manifest,
    settings,
    plugins,
    recents,
    activePath,
    activeHandle,
    backend,
    backendKind,
    isOnboarded,
    appConfig,
    diagnostics,
    appMetadata,
    init,
    restoreLastWorkspace,
    createWorkspace,
    openWorkspace,
    openCloudWorkspace,
    removeRecentWorkspace,
    saveAppConfig,
    setAppTheme,
    setAppLocale,
    saveSettings,
    updateSettings,
    resetSettings,
    updateLastContext,
    saveWorkspaceManifest,
    reloadPlugins,
    setPluginEnabled,
    loadDiagnostics,
    pruneSnapshots,
    cleanupOrphanedAssets,
    getRelativeTime,
  }
})
