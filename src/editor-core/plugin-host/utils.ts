import type {
  NevoEditorCapability,
  NevoEditorPluginManifest,
  NevoPluginExecutionMode,
  NevoUiCapability,
  NevoWorkspaceCapability,
} from '../../types/editor-plugin'
import { NEVO_EDITOR_SDK_VERSION, NEVO_SANDBOX_SDK_VERSION } from '../../types/editor-plugin'
import type { SandboxWorkerFactory } from './sandbox'

export const VALID_EDITOR_CAPABILITIES: Set<NevoEditorCapability> = new Set([
  'editor.read',
  'editor.write',
  'editor.write.self',
  'editor.schema',
])

export const VALID_UI_CAPABILITIES: Set<NevoUiCapability> = new Set([
  'ui.contributions',
  'ui.iframe',
  'ui.blockFrame',
  'ui.navigation',
  'workspace.view.register',
  'workspace.navigation',
])

export const VALID_WORKSPACE_CAPABILITIES: Set<NevoWorkspaceCapability> = new Set([
  'workspace.read',
  'workspace.write',
  'note.read',
  'note.write',
  'template.read',
  'template.write',
  'kanban.read',
  'kanban.write',
  'settings.read',
  'settings.write',
  'secrets.read',
  'storage.local',
  'storage.workspace',
  'assets.read',
  'assets.write',
  'runtime.events',
  'runtime.scheduling',
  'network.fetch',
])

export interface EditorPluginHostOptions {
  workspacePath: string | null
  manifests: NevoEditorPluginManifest[]
  nevoVersion: string
  workerFactory?: SandboxWorkerFactory
  runtime?: {
    invoke?: <T = unknown>(commandId: string, args?: Record<string, unknown>) => Promise<T>
    openRoute?: (route: string) => void
    backToWorkspace?: () => void
    t?: (key: string, params?: Record<string, unknown>) => string
    getPluginSetting?: <T = unknown>(pluginId: string, key: string) => T | undefined
    setPluginSetting?: (pluginId: string, key: string, value: unknown) => void
    locale?: () => string
    timeZone?: () => string
    theme?: () => 'light' | 'dark'
    createPluginCodeSession?: (
      pluginId: string,
      entryPoint: string,
    ) => Promise<{ token: string; entryUrl: string }>
    revokePluginCodeSession?: (token: string) => Promise<void>
    pluginStorageGet?: (
      pluginId: string,
      scope: 'workspace' | 'local',
      key: string,
    ) => Promise<unknown>
    pluginStorageSet?: (
      pluginId: string,
      scope: 'workspace' | 'local',
      key: string,
      value: unknown,
    ) => Promise<void>
    pluginStorageDelete?: (
      pluginId: string,
      scope: 'workspace' | 'local',
      key: string,
    ) => Promise<void>
    getPluginSecret?: (pluginId: string, key: string) => Promise<string | null>
    pluginAssetWrite?: (pluginId: string, dataBase64: string) => Promise<string>
    pluginAssetRead?: (pluginId: string, assetId: string) => Promise<string | null>
    pluginAssetDelete?: (pluginId: string, assetId: string) => Promise<void>
    pluginAssetBeginUpload?: (pluginId: string) => Promise<string>
    pluginAssetAppendChunk?: (pluginId: string, uploadId: string, chunkBase64: string) => Promise<void>
    pluginAssetFinishUpload?: (pluginId: string, uploadId: string) => Promise<string>
    pluginAssetAbortUpload?: (pluginId: string, uploadId: string) => Promise<void>
    pluginAssetUrl?: (pluginId: string, assetId: string) => Promise<string>
    pluginNetworkFetch?: (pluginId: string, request: Record<string, unknown>) => Promise<unknown>
    loadPluginRegistry?: () => Promise<{
      version: 1
      plugins: Record<string, {
        version: string
        dataVersion: number
        contributions: Array<Record<string, unknown>>
      }>
    }>
    savePluginRegistry?: (registry: {
      version: 1
      plugins: Record<string, {
        version: string
        dataVersion: number
        contributions: Array<Record<string, unknown>>
      }>
    }) => Promise<void>
  }
}

export function getMajor(version: string): string {
  return version.split('.')[0] ?? ''
}

export function isApiCompatible(apiVersion: string, expectedApiVersion: string): boolean {
  return getMajor(apiVersion) === getMajor(expectedApiVersion)
}

export function isNevoVersionCompatible(nevoVersion: string, range?: string): boolean {
  if (!range || range === '*' || range === 'latest') return true
  if (range.startsWith('^')) return getMajor(range.slice(1)) === getMajor(nevoVersion)
  return nevoVersion === range
}

export function sanitizePluginPath(path: string): string {
  return path.replace(/\\/g, '/')
}

export function normalizeErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

export function validateManifest(manifest: NevoEditorPluginManifest, nevoVersion: string): void {
  if (!manifest.id.trim()) throw new Error('Manifest id is required')
  if (!manifest.entryPoint.trim()) throw new Error('Manifest entryPoint is required')
  const executionMode: NevoPluginExecutionMode = manifest.executionMode ?? 'trusted-webview'
  const expectedApiVersion = executionMode === 'sandboxed-worker'
    ? NEVO_SANDBOX_SDK_VERSION
    : NEVO_EDITOR_SDK_VERSION
  if (!isApiCompatible(manifest.apiVersion, expectedApiVersion)) {
    throw new Error(`Incompatible apiVersion ${manifest.apiVersion}, expected ${expectedApiVersion} for ${executionMode}`)
  }
  if (!isNevoVersionCompatible(nevoVersion, manifest.nevoVersionRange)) {
    throw new Error(`Incompatible nevoVersionRange ${manifest.nevoVersionRange ?? 'n/a'}`)
  }
  if (
    executionMode === 'sandboxed-worker'
    && !manifest.capabilities
  ) {
    throw new Error('Sandboxed plugin manifest requires a unified capabilities array')
  }
  if (executionMode === 'sandboxed-worker') {
    if (!Number.isSafeInteger(manifest.dataVersion ?? 1) || (manifest.dataVersion ?? 1) < 1) {
      throw new Error('Sandboxed plugin dataVersion must be a positive integer')
    }
    for (const capability of manifest.capabilities ?? []) {
      if (
        !VALID_EDITOR_CAPABILITIES.has(capability as NevoEditorCapability)
        && !VALID_UI_CAPABILITIES.has(capability as NevoUiCapability)
        && !VALID_WORKSPACE_CAPABILITIES.has(capability as NevoWorkspaceCapability)
      ) {
        throw new Error(`Unknown plugin capability: ${capability}`)
      }
    }
    if (manifest.network) {
      for (const host of manifest.network.hosts) {
        if (!/^(?:\*\.)?[A-Za-z0-9.-]+$/.test(host) || host.includes('..')) {
          throw new Error(`Invalid network host: ${host}`)
        }
      }
    }
    return
  }
  for (const capability of manifest.editorCapabilities) {
    if (!VALID_EDITOR_CAPABILITIES.has(capability)) {
      throw new Error(`Unknown editor capability: ${capability}`)
    }
  }
  for (const capability of manifest.uiCapabilities ?? []) {
    if (!VALID_UI_CAPABILITIES.has(capability)) {
      throw new Error(`Unknown UI capability: ${capability}`)
    }
  }
  for (const capability of manifest.workspaceCapabilities ?? []) {
    if (!VALID_WORKSPACE_CAPABILITIES.has(capability)) {
      throw new Error(`Unknown workspace capability: ${capability}`)
    }
  }
}
