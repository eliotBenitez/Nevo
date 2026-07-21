import { ref, watch } from 'vue'
import type { EditorCore } from './useEditorCore'
import type { PluginManifest, WorkspaceSettings } from '../../../types/workspace'
import type { NevoSandboxUiContributionSnapshot } from '../../../types/editor-plugin'
import { registerMarketplaceRuntimeGuard } from '../../../core/plugins/marketplaceRuntime'

const EMPTY_PLUGIN_CONTRIBUTIONS: NevoSandboxUiContributionSnapshot = {
  workspaceViews: [],
  sidebarItems: [],
  modals: [],
}

interface PluginRuntimeEditorSetup {
  initPluginHost: (workspacePath: string | null, manifests: PluginManifest[]) => Promise<void>
  destroyEditorView: () => void
  flushYjsPersistenceNow: () => Promise<void>
}

interface EditorPluginRuntimeOptions {
  core: EditorCore
  editorSetup: PluginRuntimeEditorSetup
  getWorkspacePath: () => string | null
  getPluginManifests: () => PluginManifest[]
  getSettings: () => WorkspaceSettings
  flushPendingContent: () => void
  unmountNotePreload: () => void
  unmountBlockHandle: () => void
  closeEditorUi: () => void
  reinitializeEditor: () => Promise<void>
  emitContributions: (snapshot: NevoSandboxUiContributionSnapshot) => void
}

function pluginManifestSignature(manifests: PluginManifest[]): string {
  return manifests
    .map((manifest) => [
      manifest.id,
      manifest.version,
      manifest.enabled,
      manifest.entryPoint,
      manifest.apiVersion,
      manifest.executionMode ?? 'trusted-webview',
      manifest.dataVersion ?? 1,
      manifest.priority ?? 0,
      (manifest.capabilities ?? []).join(','),
      (manifest.editorCapabilities ?? []).join(','),
      (manifest.uiCapabilities ?? []).join(','),
      (manifest.workspaceCapabilities ?? []).join(','),
      (manifest.network?.hosts ?? []).join(','),
      (manifest.network?.methods ?? []).join(','),
    ].join(':'))
    .join('|')
}

export function useEditorPluginRuntime(options: EditorPluginRuntimeOptions) {
  const initialized = ref(false)
  const paused = ref(false)
  const disposedHosts = new WeakSet<object>()
  let unregisterMarketplaceRuntimeGuard: (() => void) | null = null
  let disposed = false

  async function teardownHost(host: EditorCore['pluginHost']) {
    if (!host || disposedHosts.has(host)) return
    disposedHosts.add(host)
    await host.deactivateAll()
    await host.dispose()
  }

  async function rebuild(): Promise<void> {
    if (paused.value || disposed) return
    await options.editorSetup.initPluginHost(
      options.getWorkspacePath(),
      options.getPluginManifests(),
    )
    if (paused.value || disposed) {
      const pluginHost = options.core.pluginHost
      options.core.pluginHost = null
      await teardownHost(pluginHost)
      return
    }
    options.emitContributions(
      options.core.pluginHost?.getSandboxUiContributions() ?? EMPTY_PLUGIN_CONTRIBUTIONS,
    )
    options.editorSetup.destroyEditorView()
    options.closeEditorUi()
    await options.reinitializeEditor()
    initialized.value = true
  }

  const stopRuntimeWatch = watch(
    () => {
      const settings = options.getSettings()
      return {
        workspacePath: options.getWorkspacePath(),
        pluginSignature: pluginManifestSignature(options.getPluginManifests()),
        slashCommands: settings.editor.slashCommands,
        markdownShortcuts: settings.editor.markdownShortcuts,
        tabKeyBehavior: settings.editor.tabKeyBehavior,
        pasteBehavior: settings.editor.pasteBehavior,
        aiEnabled: settings.ai.enabled,
        aiSlash: settings.ai.slashCommands,
      }
    },
    rebuild,
    { immediate: true },
  )

  async function pause(): Promise<void> {
    if (paused.value || disposed) return
    paused.value = true
    options.flushPendingContent()
    await options.editorSetup.flushYjsPersistenceNow()
    options.unmountNotePreload()
    options.unmountBlockHandle()
    options.emitContributions(EMPTY_PLUGIN_CONTRIBUTIONS)
    const pluginHost = options.core.pluginHost
    options.core.pluginHost = null
    await teardownHost(pluginHost)
    options.editorSetup.destroyEditorView()
  }

  async function resume(): Promise<void> {
    if (!paused.value || disposed) return
    paused.value = false
    await rebuild()
  }

  function startMarketplaceGuard() {
    unregisterMarketplaceRuntimeGuard?.()
    unregisterMarketplaceRuntimeGuard = registerMarketplaceRuntimeGuard({ pause, resume })
  }

  async function dispose(): Promise<void> {
    if (disposed) return
    disposed = true
    stopRuntimeWatch()
    unregisterMarketplaceRuntimeGuard?.()
    unregisterMarketplaceRuntimeGuard = null
    options.emitContributions(EMPTY_PLUGIN_CONTRIBUTIONS)
    const pluginHost = options.core.pluginHost
    options.core.pluginHost = null
    options.editorSetup.destroyEditorView()
    await teardownHost(pluginHost)
  }

  async function dispatchPluginUiEvent(
    pluginId: string,
    contributionId: string,
    event: { type: string; payload: unknown },
  ): Promise<unknown> {
    return options.core.pluginHost?.dispatchSandboxUiEvent(
      pluginId,
      contributionId,
      event,
    ) ?? null
  }

  return {
    initialized,
    paused,
    rebuild,
    pause,
    resume,
    startMarketplaceGuard,
    dispose,
    dispatchPluginUiEvent,
  }
}
