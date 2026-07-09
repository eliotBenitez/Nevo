import type {
  NevoEditorCapability,
  NevoEditorPluginManifest,
  NevoUiCapability,
  NevoWorkspaceCapability,
} from '../../types/editor-plugin'
import { NEVO_EDITOR_SDK_VERSION } from '../../types/editor-plugin'

export const VALID_EDITOR_CAPABILITIES: Set<NevoEditorCapability> = new Set([
  'editor.read',
  'editor.write',
])

export const VALID_UI_CAPABILITIES: Set<NevoUiCapability> = new Set([
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
])

export interface EditorPluginHostOptions {
  workspacePath: string | null
  manifests: NevoEditorPluginManifest[]
  nevoVersion: string
  runtime?: {
    invoke?: <T = unknown>(commandId: string, args?: Record<string, unknown>) => Promise<T>
    openRoute?: (route: string) => void
    backToWorkspace?: () => void
    t?: (key: string, params?: Record<string, unknown>) => string
    getPluginSetting?: <T = unknown>(pluginId: string, key: string) => T | undefined
    setPluginSetting?: (pluginId: string, key: string, value: unknown) => void
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
  if (!isApiCompatible(manifest.apiVersion, NEVO_EDITOR_SDK_VERSION)) {
    throw new Error(`Incompatible apiVersion ${manifest.apiVersion}, expected ${NEVO_EDITOR_SDK_VERSION}`)
  }
  if (!isNevoVersionCompatible(nevoVersion, manifest.nevoVersionRange)) {
    throw new Error(`Incompatible nevoVersionRange ${manifest.nevoVersionRange ?? 'n/a'}`)
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
