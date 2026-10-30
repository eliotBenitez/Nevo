import { Plugin } from 'prosemirror-state'
import type { Transaction, Command } from 'prosemirror-state'
import { Decoration, DecorationSet } from 'prosemirror-view'
import type { EditorView } from 'prosemirror-view'
import type { EditorState } from 'prosemirror-state'
import type {
  NevoEditorContext,
  NevoEditorEventMap,
  NevoEditorPlugin,
  NevoEditorPluginManifest,
  NevoEditorPluginModule,
  NevoEditorRegistries,
  NevoEditorRuntimePlugin,
  NevoSandboxFrameDescriptor,
  NevoSandboxPluginDefinition,
  NevoSandboxUiContributionSnapshot,
  NevoSlashItem,
  NevoToolbarAction,
} from '../../types/editor-plugin'
import { sanitizePluginPath, normalizeErrorMessage, validateManifest, type EditorPluginHostOptions } from './utils'
import { buildPluginContext } from './context'
import { workspaceAssetUrl } from '../../utils/workspaceAssetUrl'
import { loadSandboxedPluginDefinition, type SandboxedPluginSession } from './sandbox'
import { SandboxContributionRegistry } from './sandboxContributionRegistry'
import { SandboxEditorBridge } from './sandboxEditorBridge'
import { SandboxEditorEvents } from './sandboxEditorEvents'
import { SandboxHostBroker } from './sandboxHostBroker'

export class EditorPluginHost {
  private readonly workspacePath: string | null
  private readonly manifests: NevoEditorPluginManifest[]
  private readonly nevoVersion: string
  private readonly runtime: EditorPluginHostOptions['runtime']
  private readonly workerFactory: EditorPluginHostOptions['workerFactory']
  private readonly listeners = new Map<keyof NevoEditorEventMap, Set<(payload: unknown) => void>>()
  private readonly storage = new Map<string, Map<string, unknown>>()
  private readonly runtimePlugins = new Map<string, NevoEditorRuntimePlugin>()
  private readonly contexts = new Map<string, NevoEditorContext>()
  private readonly sandboxedSessions = new Map<string, SandboxedPluginSession>()
  private readonly sandboxedCodeTokens = new Map<string, string>()
  private editorRevision = 0
  private pluginRegistry: {
    version: 1
    plugins: Record<string, {
      version: string
      dataVersion: number
      contributions: Array<Record<string, unknown>>
    }>
  } = { version: 1, plugins: {} }

  readonly errors: string[] = []

  readonly registries: NevoEditorRegistries = {
    commands: new Map<string, Command>(),
    keymaps: [],
    slashItems: new Map<string, NevoSlashItem>(),
    workspaceViews: new Map(),
    sidebarItems: new Map(),
    modals: new Map(),
    toolbarActions: new Map<string, NevoToolbarAction>(),
    nodeViews: new Map(),
    decorationProviders: new Map(),
    nodes: new Map(),
    marks: new Map(),
    nodeSerializers: new Map(),
    nodeImporters: new Map(),
    nodePopovers: new Map(),
    extraPlugins: [],
  }

  private readonly recordSandboxError = (pluginId: string, phase: string, error: unknown): void => {
    this.errors.push(`Sandboxed plugin ${pluginId} ${phase} failed: ${normalizeErrorMessage(error)}`)
  }

  private readonly sandboxBroker: SandboxHostBroker
  private readonly sandboxEvents: SandboxEditorEvents
  private readonly sandboxContributions: SandboxContributionRegistry

  private nodeEditRequestHandler:
    | ((view: EditorView, position: number, nodeName: string, anchorRect?: DOMRect) => void)
    | null = null

  constructor(options: EditorPluginHostOptions) {
    this.workspacePath = options.workspacePath
    this.manifests = options.manifests
    this.nevoVersion = options.nevoVersion
    this.runtime = options.runtime
    this.workerFactory = options.workerFactory
    const getSession = (pluginId: string) => this.sandboxedSessions.get(pluginId)
    this.sandboxBroker = new SandboxHostBroker({
      runtime: this.runtime,
      getSession,
      recordError: this.recordSandboxError,
    })
    this.sandboxEvents = new SandboxEditorEvents({
      manifests: this.manifests,
      runtime: this.runtime,
      getSession,
      getRevision: () => this.editorRevision,
      recordError: this.recordSandboxError,
    })
    this.sandboxContributions = new SandboxContributionRegistry({
      registries: this.registries,
      runtime: this.runtime,
      errors: this.errors,
      codeTokens: this.sandboxedCodeTokens,
      events: this.sandboxEvents,
      bridge: new SandboxEditorBridge({
        runtime: this.runtime,
        getRevision: () => this.editorRevision,
        recordError: this.recordSandboxError,
      }),
      recordError: this.recordSandboxError,
    })
  }

  async initialize(): Promise<void> {
    if (this.runtime?.loadPluginRegistry) {
      try {
        this.pluginRegistry = await this.runtime.loadPluginRegistry()
      } catch (error) {
        this.errors.push(`Plugin registry load failed: ${normalizeErrorMessage(error)}`)
      }
    }
    const manifests = this.manifests
      .filter((manifest) => manifest.enabled)
      .slice()
      .sort((a, b) => {
        const byPriority = (b.priority ?? 0) - (a.priority ?? 0)
        if (byPriority !== 0) return byPriority
        return a.id.localeCompare(b.id)
      })

    const enabledIds = new Set(manifests.map(manifest => manifest.id))
    for (const [pluginId, entry] of Object.entries(this.pluginRegistry.plugins)) {
      if (!enabledIds.has(pluginId)) this.sandboxContributions.registerCachedSchemas(pluginId, entry.contributions)
    }

    for (const manifest of manifests) {
      await this.loadAndRegister(manifest)
    }
    const trustedIds: string[] = []
    const sandboxedIds: string[] = []
    for (const manifest of manifests) {
      if (this.sandboxedSessions.has(manifest.id)) sandboxedIds.push(manifest.id)
      else trustedIds.push(manifest.id)
    }
    await Promise.all(sandboxedIds.map(id => this.activate(id)))
    for (const pluginId of trustedIds) {
      await this.activate(pluginId)
    }
  }

  async deactivateAll(): Promise<void> {
    this.sandboxBroker.clearAllSchedules()
    for (const [pluginId, runtime] of this.runtimePlugins.entries()) {
      const context = this.contexts.get(pluginId)
      if (!context) continue
      try {
        await runtime.instance.onDeactivate?.(context)
        this.emit('pluginDeactivated', { pluginId })
      } catch (error) {
        this.errors.push(`Plugin ${pluginId} deactivate failed: ${normalizeErrorMessage(error)}`)
      }
    }
    for (const [pluginId, session] of this.sandboxedSessions) {
      try {
        await session.deactivate()
        this.emit('pluginDeactivated', { pluginId })
      } catch (error) {
        this.errors.push(`Plugin ${pluginId} deactivate failed: ${normalizeErrorMessage(error)}`)
      }
    }
  }

  async dispose(): Promise<void> {
    for (const [pluginId, runtime] of this.runtimePlugins.entries()) {
      const context = this.contexts.get(pluginId)
      if (!context) continue
      try {
        await runtime.instance.onDispose?.(context)
      } catch (error) {
        this.errors.push(`Plugin ${pluginId} dispose failed: ${normalizeErrorMessage(error)}`)
      }
    }
    for (const [pluginId, session] of this.sandboxedSessions) {
      try {
        await session.dispose()
      } catch (error) {
        this.errors.push(`Plugin ${pluginId} dispose failed: ${normalizeErrorMessage(error)}`)
      }
    }
    this.runtimePlugins.clear()
    this.contexts.clear()
    this.sandboxedSessions.clear()
    this.sandboxEvents.dispose()
    this.sandboxBroker.clearAllSchedules()
    for (const token of this.sandboxedCodeTokens.values()) {
      try {
        await this.runtime?.revokePluginCodeSession?.(token)
      } catch (error) {
        this.errors.push(`Plugin code session revoke failed: ${normalizeErrorMessage(error)}`)
      }
    }
    this.sandboxedCodeTokens.clear()
    this.sandboxContributions.dispose()
  }

  listSlashItems(): NevoSlashItem[] {
    return Array.from(this.registries.slashItems.values())
  }

  getSandboxUiContributions(): NevoSandboxUiContributionSnapshot {
    const isFrame = (value: unknown): value is NevoSandboxFrameDescriptor => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return false
      const frame = value as Partial<NevoSandboxFrameDescriptor>
      return frame.type === 'sandboxed-plugin-iframe'
        && typeof frame.pluginId === 'string'
        && typeof frame.source === 'string'
        && frame.sandbox === 'allow-scripts'
    }
    return {
      workspaceViews: [...this.registries.workspaceViews.values()]
        .filter(view => isFrame(view.component))
        .map(view => ({
          id: view.id,
          pluginId: view.pluginId,
          title: view.title,
          route: view.route,
          icon: view.icon,
          order: view.order,
          frame: view.component as NevoSandboxFrameDescriptor,
        }))
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.id.localeCompare(b.id)),
      sidebarItems: [...this.registries.sidebarItems.values()]
        .filter(item => this.sandboxedSessions.has(item.pluginId))
        .map(item => ({ ...item }))
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.id.localeCompare(b.id)),
      modals: [...this.registries.modals.values()]
        .filter(modal => isFrame(modal.component))
        .map(modal => ({
          id: modal.id,
          pluginId: modal.pluginId,
          frame: modal.component as NevoSandboxFrameDescriptor,
        })),
    }
  }

  async dispatchSandboxUiEvent(
    pluginId: string,
    contributionId: string,
    event: { type: string; payload: unknown },
  ): Promise<unknown> {
    const session = this.sandboxedSessions.get(pluginId)
    const handlerId = this.sandboxContributions.uiHandlerId(pluginId, contributionId)
    if (!session || !handlerId) return null
    return session.invoke(handlerId, {
      contributionId,
      event,
    })
  }

  /** Подключить обработчик, открывающий поповер редактирования плагинной ноды. */
  setNodeEditRequestHandler(
    handler: ((view: EditorView, position: number, nodeName: string, anchorRect?: DOMRect) => void) | null,
  ): void {
    this.nodeEditRequestHandler = handler
  }

  private invokeNodeEditRequest(view: EditorView, position: number, anchorRect?: DOMRect): void {
    const nodeName = view.state.doc.nodeAt(position)?.type.name
    if (!nodeName) return
    this.nodeEditRequestHandler?.(view, position, nodeName, anchorRect)
  }

  getOrderedKeymaps(): Array<{ priority: number; bindings: Record<string, Command>; pluginId: string }> {
    return this.registries.keymaps.slice().sort((a, b) => {
      const byPriority = b.priority - a.priority
      if (byPriority !== 0) return byPriority
      return a.pluginId.localeCompare(b.pluginId)
    })
  }

  createDecorationPlugin(): Plugin<DecorationSet | null> {
    return new Plugin<DecorationSet | null>({
      state: {
        init: (_, state) => this._buildDecorations(state),
        apply: (tr, oldSet, _, newState) => {
          if (!tr.docChanged && !tr.selectionSet) return oldSet
          if (tr.docChanged) return this._buildDecorations(newState)
          // Selection moved but the document didn't change: positions are identical,
          // so re-running every provider (and re-walking the whole document for each
          // one) on plain cursor movement is wasted work — unless some provider
          // explicitly declared that its output depends on the selection.
          if (!this._hasSelectionDependentProviders()) return oldSet
          return this._buildDecorations(newState)
        },
      },
      props: {
        decorations(state) {
          return this.getState(state)
        },
      },
    })
  }

  private _hasSelectionDependentProviders(): boolean {
    for (const entry of this.registries.decorationProviders.values()) {
      if (entry.dependsOnSelection) return true
    }
    return false
  }

  private _buildDecorations(state: EditorState): DecorationSet | null {
    const collected: Decoration[] = []
    for (const entry of this.registries.decorationProviders.values()) {
      try {
        const result = entry.provider(state)
        if (result instanceof DecorationSet) {
          collected.push(...result.find())
        } else {
          collected.push(...result)
        }
      } catch (error) {
        this.errors.push(`Decoration provider failed: ${normalizeErrorMessage(error)}`)
      }
    }
    if (!collected.length) return null
    return DecorationSet.create(state.doc, collected)
  }

  on<K extends keyof NevoEditorEventMap>(event: K, listener: (payload: NevoEditorEventMap[K]) => void): () => void {
    const listeners = this.listeners.get(event) ?? new Set()
    listeners.add(listener as (payload: unknown) => void)
    this.listeners.set(event, listeners)

    return () => {
      const existing = this.listeners.get(event)
      existing?.delete(listener as (payload: unknown) => void)
      if (existing && existing.size === 0) this.listeners.delete(event)
    }
  }

  notifyTransactionApplied(state: EditorState, transaction: Transaction): void {
    this.editorRevision += 1
    this.emit('transactionApplied', { state, transaction })
    if (!this.sandboxEvents.hasHandlers) return
    this.sandboxEvents.schedule(state, transaction.docChanged)
  }

  private emit<K extends keyof NevoEditorEventMap>(event: K, payload: NevoEditorEventMap[K]): void {
    const listeners = this.listeners.get(event)
    if (!listeners) return
    for (const listener of listeners) {
      try {
        listener(payload)
      } catch (error) {
        this.errors.push(`Event listener for ${String(event)} failed: ${normalizeErrorMessage(error)}`)
      }
    }
  }

  private async loadAndRegister(manifest: NevoEditorPluginManifest): Promise<void> {
    try {
      validateManifest(manifest, this.nevoVersion)
      if (manifest.executionMode === 'sandboxed-worker') {
        await this.loadAndRegisterSandboxed(manifest)
        return
      }
      const pluginModule = await this.loadPluginModule(manifest)
      const instance = this.resolvePluginInstance(pluginModule)
      const context = buildPluginContext(
        manifest,
        this.storage,
        this.registries,
        this.emit.bind(this),
        this.on.bind(this),
        this.invokeNodeEditRequest.bind(this),
        this.runtime,
      )

      await instance.onRegister?.(context)
      this.runtimePlugins.set(manifest.id, { manifest, instance })
      this.contexts.set(manifest.id, context)
    } catch (error) {
      if (manifest.executionMode === 'sandboxed-worker') {
        const cached = this.pluginRegistry.plugins[manifest.id]
        if (cached) this.sandboxContributions.registerCachedSchemas(manifest.id, cached.contributions)
      }
      this.errors.push(`Plugin ${manifest.id} registration failed: ${normalizeErrorMessage(error)}`)
    }
  }

  private async activate(pluginId: string): Promise<void> {
    const sandboxedSession = this.sandboxedSessions.get(pluginId)
    if (sandboxedSession) {
      try {
        await sandboxedSession.activate()
        this.emit('pluginActivated', { pluginId })
      } catch (error) {
        this.errors.push(`Plugin ${pluginId} activation failed: ${normalizeErrorMessage(error)}`)
      }
      return
    }
    const runtime = this.runtimePlugins.get(pluginId)
    const context = this.contexts.get(pluginId)
    if (!runtime || !context) return
    try {
      await runtime.instance.onActivate?.(context)
      this.emit('pluginActivated', { pluginId })
    } catch (error) {
      this.errors.push(`Plugin ${pluginId} activation failed: ${normalizeErrorMessage(error)}`)
    }
  }

  private async loadPluginModule(manifest: NevoEditorPluginManifest): Promise<NevoEditorPluginModule> {
    return import(/* @vite-ignore */ this.pluginUrl(manifest))
  }

  private pluginUrl(manifest: NevoEditorPluginManifest): string {
    if (!this.workspacePath) {
      throw new Error('No workspace path available for plugin loading')
    }
    const pluginPath = sanitizePluginPath(`.nevo/plugins/${manifest.id}/${manifest.entryPoint}`)
    return `${workspaceAssetUrl(pluginPath)}?v=${encodeURIComponent(manifest.version)}`
  }

  private async loadAndRegisterSandboxed(manifest: NevoEditorPluginManifest): Promise<void> {
    const codeSession = this.runtime?.createPluginCodeSession
      ? await this.runtime.createPluginCodeSession(manifest.id, manifest.entryPoint)
      : null
    const { definition, session } = await loadSandboxedPluginDefinition(
      manifest,
      codeSession?.entryUrl ?? this.pluginUrl(manifest),
      this.workerFactory,
      (method, args) => this.sandboxBroker.execute(manifest, method, args),
    )
    try {
      if (codeSession) this.sandboxedCodeTokens.set(manifest.id, codeSession.token)
      this.sandboxContributions.registerDefinition(manifest, definition, session)
      this.sandboxedSessions.set(manifest.id, session)
      await this.cacheSandboxSchemas(manifest, definition)
    } catch (error) {
      await session.dispose()
      if (codeSession) {
        this.sandboxedCodeTokens.delete(manifest.id)
        await this.runtime?.revokePluginCodeSession?.(codeSession.token)
      }
      throw error
    }
  }

  private async cacheSandboxSchemas(
    manifest: NevoEditorPluginManifest,
    definition: NevoSandboxPluginDefinition,
  ): Promise<void> {
    const contributions = definition.contributions
      .filter(item => item.kind === 'schemaNode' || item.kind === 'schemaMark' || item.kind === 'blockType')
      .map(item => JSON.parse(JSON.stringify(item)) as Record<string, unknown>)
    if (!contributions.length) return
    this.pluginRegistry.plugins[manifest.id] = {
      version: manifest.version,
      dataVersion: definition.dataVersion ?? manifest.dataVersion ?? 1,
      contributions,
    }
    await this.runtime?.savePluginRegistry?.(this.pluginRegistry)
  }

  private resolvePluginInstance(module: NevoEditorPluginModule): NevoEditorPlugin {
    if (module.createPlugin) return module.createPlugin()
    if (module.plugin) return module.plugin
    if (module.default) return module.default
    throw new Error('Plugin module must export default, plugin, or createPlugin')
  }
}
