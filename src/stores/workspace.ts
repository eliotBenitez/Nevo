import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
import { applyAppLocale, i18n } from '../i18n'
import type {
  AppMetadata,
  AppConfig,
  AppLocale,
  WorkspaceCleanupReport,
  WorkspaceDiagnostics,
  MarketplaceCatalog,
  PluginManifest,
  RecentWorkspace,
  WorkspaceConfig,
  WorkspaceManifest,
  ThemeMode,
  WorkspaceSettings,
} from '../types/workspace'
import type { SidebarNotePreview } from '../types/note'
import { configCommands, githubSyncCommands, workspaceCommands } from '../tauri/commands'
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
import { runMarketplacePluginTransaction } from '../core/plugins/marketplaceMigration'
import { pauseMarketplaceRuntime } from '../core/plugins/marketplaceRuntime'

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
  // Settings is only ever replaced wholesale (saveSettings/updateSettings reassign
  // a fresh object), never mutated in place — so a shallowRef avoids the cost of
  // deeply proxying this large object on every nested read while staying reactive.
  const settings = shallowRef<WorkspaceSettings>(createDefaultWorkspaceSettings())
  const plugins = ref<PluginManifest[]>([])
  const sidebarNotePreviews = ref<SidebarNotePreview[]>([])
  const marketplaceCatalog = ref<MarketplaceCatalog | null>(null)
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
  const customCss = ref('')
  // Keeps the injected custom-CSS <style> as the last node so it always wins the
  // cascade, even when SFC scoped styles are appended later (dev-mode lazy inject).
  let customCssOrderObserver: MutationObserver | null = null
  // Guards against re-entrancy: the observer's own reassert (appendChild) is
  // itself a childList mutation, so without this it would keep re-triggering
  // itself synchronously. Scheduling on rAF also coalesces bursts of sibling
  // mutations (e.g. several SFC styles injected back-to-back) into one move.
  let customCssReassertScheduled = false
  // Debounces persisting `lastContext` to disk: navigating between notes calls
  // updateLastContext on every open, and going through the full saveSettings
  // path (deep clone + applyWorkspaceStyle + loadCustomCss + loadDiagnostics) on
  // each one is unnecessary I/O for a field that only matters at app restart.
  let lastContextPersistTimer: ReturnType<typeof setTimeout> | null = null
  const LAST_CONTEXT_PERSIST_DEBOUNCE_MS = 700

  function _setHandle(handle: WorkspaceHandle | null) {
    // Tear down a previous cloud backend (closes its live Yjs sessions) when
    // switching to a different workspace.
    if (_cloudBackend.value && handle?.kind !== 'cloud') {
      ;(_cloudBackend.value as CloudBackend).destroy()
      _cloudBackend.value = null
    }
    applyCustomCssStyle('', false)
    customCss.value = ''
    sidebarNotePreviews.value = []
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
      await syncGithubAutoState()
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
  async function openCloudWorkspace(storageId: string, serverUrl?: string) {
    const shared = useSharedStorageStore()
    const auth = useAuthStore()
    const server = useServerConfigStore()
    const api = useApiClient()
    try {
      const target = serverUrl ?? recents.value.find(r => r.storageId === storageId)?.serverUrl ?? server.serverUrl
      if (target !== server.serverUrl) {
        server.setServerUrl(target)
        shared.reset()
      }
      if (!auth.isAuthenticated || auth.sessionServerUrl !== server.serverUrl) {
        await auth.login('github')
      }
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
      await loadCustomCss()
      plugins.value = []
      marketplaceCatalog.value = null
      diagnostics.value = await cloud.getDiagnostics()
      await refreshSidebarNotePreviews()
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
    const server = useServerConfigStore()
    const now = new Date().toISOString()
    const existing = recents.value.find(r => r.storageId === storage.id)
    const recent: RecentWorkspace = existing
      ? { ...existing, name: storage.name, glyph: storage.glyph, gradient: storage.gradient, lastOpened: now, serverUrl: server.serverUrl }
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
          serverUrl: server.serverUrl,
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
      const [ws, pluginList, workspaceDiagnostics, previews] = await Promise.all([
        backend.value.loadSettings(),
        backend.value.listPlugins(),
        backend.value.getDiagnostics(),
        backend.value.listSidebarNotePreviews(),
      ])

      settings.value = normalizeWorkspaceSettings(ws)
      applyWorkspaceStyle(settings.value.appearance)
      plugins.value = pluginList
      sidebarNotePreviews.value = previews
      diagnostics.value = workspaceDiagnostics
      await loadCustomCss()
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
      if (normalized.appearance.customCssEnabled) {
        await loadCustomCss()
      } else {
        applyCustomCssStyle('', false)
      }
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

  function applyCustomCssStyle(css: string, enabled: boolean) {
    const STYLE_ID = 'nevo-workspace-custom-css'
    let styleEl = document.getElementById(STYLE_ID) as HTMLStyleElement | null
    if (!enabled) {
      if (styleEl) styleEl.remove()
      customCssOrderObserver?.disconnect()
      customCssOrderObserver = null
      customCssReassertScheduled = false
      return
    }
    if (!styleEl) {
      styleEl = document.createElement('style')
      styleEl.id = STYLE_ID
    }
    styleEl.textContent = css
    // Inject at the end of <body>: in document order this comes after every <head>
    // stylesheet (bundled CSS plus lazily-injected SFC/KaTeX/Mermaid styles), so the
    // user's rules win the cascade by source order without needing !important.
    if (styleEl.parentNode !== document.body || styleEl.nextSibling) {
      document.body.appendChild(styleEl)
    }
    // Re-assert "last node" whenever something is appended to <body> after it.
    if (!customCssOrderObserver) {
      customCssOrderObserver = new MutationObserver(() => {
        if (customCssReassertScheduled) return
        customCssReassertScheduled = true
        requestAnimationFrame(() => {
          customCssReassertScheduled = false
          const el = document.getElementById(STYLE_ID)
          if (el && el.nextSibling) document.body.appendChild(el)
        })
      })
      customCssOrderObserver.observe(document.body, { childList: true })
    }
  }

  async function loadCustomCss(): Promise<string> {
    if (!backend.value) return ''
    try {
      const css = await backend.value.loadCustomCss()
      customCss.value = css
      applyCustomCssStyle(css, settings.value.appearance.customCssEnabled)
      return css
    } catch (error) {
      await appLogger.error({
        source: 'frontend.workspace',
        event: 'load_custom_css',
        message: 'Failed to load custom CSS',
        error,
      })
      return ''
    }
  }

  async function saveCustomCss(css: string) {
    if (!backend.value) return
    try {
      customCss.value = css
      applyCustomCssStyle(css, settings.value.appearance.customCssEnabled)
      await backend.value.saveCustomCss(css)
    } catch (error) {
      await appLogger.error({
        source: 'frontend.workspace',
        event: 'save_custom_css',
        message: 'Failed to save custom CSS',
        error,
      })
    }
  }

  async function updateLastContext(context: { noteId: string | null; folderId: string | null }) {
    settings.value = {
      ...settings.value,
      general: {
        ...settings.value.general,
        lastContext: {
          kind: context.noteId ? 'note' : context.folderId ? 'folder' : 'workspace',
          noteId: context.noteId,
          folderId: context.folderId,
        },
      },
    }

    if (lastContextPersistTimer) clearTimeout(lastContextPersistTimer)
    lastContextPersistTimer = setTimeout(() => {
      lastContextPersistTimer = null
      void persistLastContext()
    }, LAST_CONTEXT_PERSIST_DEBOUNCE_MS)
  }

  async function persistLastContext() {
    if (!backend.value) return
    const normalized = normalizeWorkspaceSettings(settings.value)
    try {
      await backend.value.saveSettings(normalized)
    } catch (error) {
      await appLogger.error({
        source: 'frontend.workspace',
        event: 'update_last_context',
        message: 'Failed to persist last context',
        workspacePath: activePath.value,
        error,
      })
    }
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

  async function refreshSidebarNotePreviews() {
    if (!backend.value) {
      sidebarNotePreviews.value = []
      return
    }
    try {
      sidebarNotePreviews.value = await backend.value.listSidebarNotePreviews()
    } catch (error) {
      await appLogger.warn({
        source: 'frontend.workspace',
        event: 'refresh_sidebar_note_previews',
        message: 'Failed to refresh sidebar note previews',
        workspacePath: activePath.value ?? undefined,
        error,
      })
      sidebarNotePreviews.value = []
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
    if (pluginId === 'nevo.github-sync') await syncGithubAutoState()
  }

  /**
   * Start or stop the Rust-side GitHub Sync background timer to match the
   * `nevo.github-sync` plugin's enabled state and its `autoSync`/
   * `intervalMinutes` settings. Safe to call repeatedly (e.g. after toggling
   * the plugin or editing its settings) — the backend command replaces any
   * previously running timer. No-op for cloud workspaces (no `activePath`).
   */
  async function syncGithubAutoState(): Promise<void> {
    if (!activePath.value) return
    const pluginId = 'nevo.github-sync'
    try {
      const enabled = plugins.value.find(p => p.id === pluginId)?.enabled === true
      const autoSync = getPluginSetting(pluginId, 'autoSync') === true
      const interval = Number(getPluginSetting(pluginId, 'intervalMinutes')) || 15
      if (enabled && autoSync) {
        await githubSyncCommands.startAuto(activePath.value, interval)
      } else {
        await githubSyncCommands.stopAuto()
      }
    } catch (error) {
      await appLogger.error({
        source: 'frontend.workspace',
        event: 'sync_github_auto_state',
        message: 'Failed to update GitHub Sync background task',
        workspacePath: activePath.value,
        error,
      })
    }
  }

  function getPluginSetting<T = unknown>(pluginId: string, key: string): T | undefined {
    const bag = settings.value.pluginSettings?.[pluginId]
    return bag ? (bag[key] as T) : undefined
  }

  async function setPluginSetting(pluginId: string, key: string, value: unknown): Promise<void> {
    await updateSettings(d => {
      if (!d.pluginSettings) d.pluginSettings = {}
      if (!d.pluginSettings[pluginId]) d.pluginSettings[pluginId] = {}
      d.pluginSettings[pluginId][key] = value
    })
  }

  async function loadMarketplacePlugins(forceRefresh = false): Promise<MarketplaceCatalog | null> {
    if (!backend.value) return null
    try {
      marketplaceCatalog.value = await backend.value.marketplaceListPlugins(forceRefresh)
      return marketplaceCatalog.value
    } catch (error) {
      await appLogger.error({
        source: 'frontend.workspace',
        event: 'marketplace_list_plugins',
        message: 'Failed to load marketplace catalog',
        workspacePath: activePath.value,
        error,
      })
      throw error
    }
  }

  async function installMarketplacePlugin(pluginId: string, permissionFingerprint: string, version?: string) {
    if (!backend.value) return
    if (activePath.value && manifest.value) {
      const resumeRuntime = await pauseMarketplaceRuntime()
      try {
        await runMarketplacePluginTransaction({
          workspacePath: activePath.value,
          pluginId,
          permissionFingerprint,
          version,
          update: false,
          workspace: manifest.value,
        })
        await reloadPlugins()
        await loadMarketplacePlugins(true)
      } finally {
        await resumeRuntime()
      }
      return
    } else {
      await backend.value.marketplaceInstallPlugin(pluginId, permissionFingerprint, version)
    }
    await reloadPlugins()
    await loadMarketplacePlugins(true)
  }

  async function updateMarketplacePlugin(pluginId: string, permissionFingerprint: string) {
    if (!backend.value) return
    if (activePath.value && manifest.value) {
      const resumeRuntime = await pauseMarketplaceRuntime()
      try {
        await runMarketplacePluginTransaction({
          workspacePath: activePath.value,
          pluginId,
          permissionFingerprint,
          update: true,
          workspace: manifest.value,
        })
        await reloadPlugins()
        await loadMarketplacePlugins(true)
      } finally {
        await resumeRuntime()
      }
      return
    } else {
      await backend.value.marketplaceUpdatePlugin(pluginId, permissionFingerprint)
    }
    await reloadPlugins()
    await loadMarketplacePlugins(true)
  }

  async function removeMarketplacePlugin(pluginId: string) {
    if (!backend.value) return
    await backend.value.marketplaceRemovePlugin(pluginId)
    await reloadPlugins()
    await loadMarketplacePlugins(true)
  }

  async function refreshMarketplaceCache(): Promise<MarketplaceCatalog | null> {
    if (!backend.value) return null
    marketplaceCatalog.value = await backend.value.marketplaceRefreshCache()
    return marketplaceCatalog.value
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
    if (h < 1) return i18n.global.t('workspace.relativeTime.justNow')
    if (h < 2) return i18n.global.t('workspace.relativeTime.hourAgo')
    if (h < 24) return i18n.global.t('workspace.relativeTime.hoursAgo', { count: Math.floor(h) })
    if (h < 48) return i18n.global.t('workspace.relativeTime.yesterday')
    const d = Math.floor(h / 24)
    if (d < 7) return i18n.global.t('workspace.relativeTime.daysAgo', { count: d })
    return date.toLocaleDateString('en', { month: 'short', day: 'numeric' })
  }

  return {
    manifest,
    settings,
    plugins,
    sidebarNotePreviews,
    marketplaceCatalog,
    recents,
    activePath,
    activeHandle,
    backend,
    backendKind,
    isOnboarded,
    customCss,
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
    loadCustomCss,
    saveCustomCss,
    updateLastContext,
    saveWorkspaceManifest,
    refreshSidebarNotePreviews,
    reloadPlugins,
    setPluginEnabled,
    syncGithubAutoState,
    getPluginSetting,
    setPluginSetting,
    loadMarketplacePlugins,
    installMarketplacePlugin,
    updateMarketplacePlugin,
    removeMarketplacePlugin,
    refreshMarketplaceCache,
    loadDiagnostics,
    pruneSnapshots,
    cleanupOrphanedAssets,
    getRelativeTime,
  }
})
