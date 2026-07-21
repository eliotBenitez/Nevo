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
  NevoSandboxContribution,
  NevoSandboxFrameDescriptor,
  NevoSandboxPluginDefinition,
  NevoSandboxUiContributionSnapshot,
  NevoSlashItem,
  NevoToolbarAction,
} from '../../types/editor-plugin'
import { sanitizePluginPath, normalizeErrorMessage, validateManifest, type EditorPluginHostOptions } from './utils'
import { buildPluginContext } from './context'
import { workspaceAssetUrl } from '../../utils/workspaceAssetUrl'
import { assertWorkspaceCommandCapability } from './capabilities'
import {
  assertJsonValue,
  loadSandboxedPluginDefinition,
  manifestCapabilities,
  type SandboxedPluginSession,
} from './sandbox'
import { sanitizeScopedCss, schemaMarkFromDescriptor, schemaNodeFromDescriptor } from './sandboxUi'
import { createSandboxRenderNodeView } from './sandboxRenderView'
import { createSandboxFrameNodeView } from './sandboxFrameView'

const MAX_FRAME_PATCH_BYTES = 256 * 1024
import {
  applyTransactionIntent,
  createEditorSnapshot,
  validateTransactionIntent,
} from './sandboxTransactions'

// Editor events fire on every ProseMirror transaction (i.e. every keystroke). The
// Worker round-trip plus a full doc snapshot per transaction is wasteful, so bursts
// are coalesced into a single trailing dispatch carrying the latest editor state.
const EDITOR_EVENT_DEBOUNCE_MS = 48

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
  private readonly sandboxedEventHandlers = new Map<string, Map<string, string[]>>()
  private readonly sandboxedUiHandlers = new Map<string, string>()
  private readonly sandboxedStyles: HTMLStyleElement[] = []
  private readonly sandboxedSchedules = new Map<string, Map<string, ReturnType<typeof setTimeout>>>()
  private editorRevision = 0
  private pendingEditorEventState: EditorState | null = null
  private pendingEditorEventDocChanged = false
  private editorEventFlushTimer: ReturnType<typeof setTimeout> | null = null
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

  private nodeEditRequestHandler:
    | ((view: EditorView, position: number, nodeName: string, anchorRect?: DOMRect) => void)
    | null = null

  constructor(options: EditorPluginHostOptions) {
    this.workspacePath = options.workspacePath
    this.manifests = options.manifests
    this.nevoVersion = options.nevoVersion
    this.runtime = options.runtime
    this.workerFactory = options.workerFactory
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
      if (!enabledIds.has(pluginId)) this.registerCachedSchemas(pluginId, entry.contributions)
    }

    for (const manifest of manifests) {
      await this.loadAndRegister(manifest)
    }
    for (const manifest of manifests) {
      await this.activate(manifest.id)
    }
  }

  async deactivateAll(): Promise<void> {
    this.clearAllSandboxSchedules()
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
    this.sandboxedEventHandlers.clear()
    this.sandboxedUiHandlers.clear()
    if (this.editorEventFlushTimer !== null) {
      clearTimeout(this.editorEventFlushTimer)
      this.editorEventFlushTimer = null
    }
    this.pendingEditorEventState = null
    this.pendingEditorEventDocChanged = false
    this.clearAllSandboxSchedules()
    for (const token of this.sandboxedCodeTokens.values()) {
      try {
        await this.runtime?.revokePluginCodeSession?.(token)
      } catch (error) {
        this.errors.push(`Plugin code session revoke failed: ${normalizeErrorMessage(error)}`)
      }
    }
    this.sandboxedCodeTokens.clear()
    for (const style of this.sandboxedStyles.splice(0)) style.remove()
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
    const handlerId = this.sandboxedUiHandlers.get(`${pluginId}:${contributionId}`)
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
    if (this.sandboxedEventHandlers.size === 0) return
    this.pendingEditorEventState = state
    this.pendingEditorEventDocChanged = this.pendingEditorEventDocChanged || transaction.docChanged
    if (this.editorEventFlushTimer === null) {
      this.editorEventFlushTimer = setTimeout(
        () => this.flushSandboxEditorEvents(),
        EDITOR_EVENT_DEBOUNCE_MS,
      )
    }
  }

  private flushSandboxEditorEvents(): void {
    this.editorEventFlushTimer = null
    const state = this.pendingEditorEventState
    if (!state) return
    const docChanged = this.pendingEditorEventDocChanged
    this.pendingEditorEventState = null
    this.pendingEditorEventDocChanged = false
    for (const [pluginId, events] of this.sandboxedEventHandlers) {
      const handlers = events.get('transactionApplied')
      const session = this.sandboxedSessions.get(pluginId)
      if (!handlers?.length || !session) continue
      const manifest = this.manifests.find(item => item.id === pluginId)
      if (!manifest) continue
      const snapshot = createEditorSnapshot(
        state,
        this.editorRevision,
        manifestCapabilities(manifest).includes('editor.read'),
        this.runtime?.locale?.() ?? 'en',
        this.runtime?.timeZone?.() ?? 'UTC',
      )
      for (const handlerId of handlers) {
        void session.invoke(handlerId, { docChanged }, snapshot)
          .catch(error => this.recordSandboxError(pluginId, 'event', error))
      }
    }
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
        if (cached) this.registerCachedSchemas(manifest.id, cached.contributions)
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
      (method, args) => this.executeSandboxHostCall(manifest, method, args),
    )
    try {
      if (codeSession) this.sandboxedCodeTokens.set(manifest.id, codeSession.token)
      this.registerSandboxDefinition(manifest, definition, session)
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

  private registerCachedSchemas(pluginId: string, contributions: Array<Record<string, unknown>>): void {
    for (const raw of contributions) {
      const kind = raw.kind
      const descriptor = raw.descriptor
      if (!descriptor || typeof descriptor !== 'object' || Array.isArray(descriptor)) continue
      try {
        if (kind === 'schemaNode') {
          const { name, spec } = schemaNodeFromDescriptor({
            ...(descriptor as Record<string, unknown>),
            pluginId,
          })
          if (!this.registries.nodes.has(name)) this.registries.nodes.set(name, spec)
        } else if (kind === 'schemaMark') {
          const { name, spec } = schemaMarkFromDescriptor(descriptor as Record<string, unknown>)
          if (!this.registries.marks.has(name)) this.registries.marks.set(name, spec)
        } else if (kind === 'blockType') {
          const block = descriptor as Record<string, unknown>
          const schema = block.schema
          if (!schema || typeof schema !== 'object' || Array.isArray(schema)) continue
          const { name, spec } = schemaNodeFromDescriptor({
            ...schema,
            name: block.name,
            ui: block.ui,
            pluginId,
          })
          if (!this.registries.nodes.has(name)) this.registries.nodes.set(name, spec)
        }
      } catch (error) {
        this.errors.push(`Cached schema for ${pluginId} was rejected: ${normalizeErrorMessage(error)}`)
      }
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

  private registerSandboxDefinition(
    manifest: NevoEditorPluginManifest,
    definition: NevoSandboxPluginDefinition,
    session: SandboxedPluginSession,
  ): void {
    for (const contribution of definition.contributions) {
      this.registerSandboxContribution(manifest, contribution, session)
    }
  }

  private registerSandboxContribution(
    manifest: NevoEditorPluginManifest,
    contribution: NevoSandboxContribution,
    session: SandboxedPluginSession,
  ): void {
    const descriptor = contribution.descriptor
    const title = typeof descriptor.title === 'string' ? descriptor.title : contribution.id
    const handlerId = contribution.handlerId
    const run = (
      state: EditorState,
      dispatch: (transaction: Transaction) => void,
      input: unknown = null,
      view?: EditorView,
    ) => {
      if (!handlerId) return
      void this.executeSandboxHandler(manifest, session, handlerId, state, dispatch, input, view)
    }

    if (contribution.kind === 'schemaNode') {
      const { name, spec } = schemaNodeFromDescriptor(descriptor)
      if (this.registries.nodes.has(name)) throw new Error(`Node already registered: ${name}`)
      this.registries.nodes.set(name, spec)
      return
    }
    if (contribution.kind === 'schemaMark') {
      const { name, spec } = schemaMarkFromDescriptor(descriptor)
      if (this.registries.marks.has(name)) throw new Error(`Mark already registered: ${name}`)
      this.registries.marks.set(name, spec)
      return
    }
    if (contribution.kind === 'blockType') {
      const schema = descriptor.schema
      console.log('DBG blockType', contribution.id, 'schema?', typeof schema, 'frame?', typeof descriptor.frame)
      if (schema && typeof schema === 'object' && !Array.isArray(schema)) {
        const merged = {
          ...schema,
          id: contribution.id,
          name: descriptor.name,
          ui: descriptor.ui,
          pluginId: manifest.id,
        }
        const { name, spec } = schemaNodeFromDescriptor(merged)
        if (this.registries.nodes.has(name)) throw new Error(`Node already registered: ${name}`)
        this.registries.nodes.set(name, spec)
        if (typeof descriptor.css === 'string' && typeof document !== 'undefined') {
          const style = document.createElement('style')
          style.dataset.nevoPluginStyle = manifest.id
          style.textContent = sanitizeScopedCss(manifest.id, descriptor.css)
          document.head.append(style)
          this.sandboxedStyles.push(style)
        }
        // Tier 1 render channel: a Worker handler owns `attrs -> { svg }` and the
        // host mounts the sanitized output as a live NodeView. The static toDOM from
        // the schema spec stays as the export/copy/disabled-plugin fallback.
        if (descriptor.render === 'svg' && handlerId) {
          this.registries.nodeViews.set(name, createSandboxRenderNodeView({
            pluginId: manifest.id,
            nodeName: name,
            handlerId,
            session,
            onError: error => this.recordSandboxError(manifest.id, 'render', error),
          }))
        }
        // Tier 2 interactive block: the plugin view runs in a sandboxed iframe and
        // proposes attr patches that the host applies node-scoped after validation.
        const frame = descriptor.frame
        if (frame && typeof frame === 'object' && !Array.isArray(frame)) {
          const frameUrl = this.sandboxIframeUrl(manifest.id, (frame as Record<string, unknown>).source)
          this.registries.nodeViews.set(name, createSandboxFrameNodeView({
            pluginId: manifest.id,
            nodeName: name,
            frameUrl,
            session,
            editable: manifestCapabilities(manifest).includes('editor.write.self'),
            locale: () => this.runtime?.locale?.() ?? 'en',
            theme: () => this.runtime?.theme?.() ?? 'light',
            applyPatch: (view, position, patch) =>
              this.applySandboxFramePatch(manifest, view, position, patch),
            onError: error => this.recordSandboxError(manifest.id, 'frame', error),
          }))
        }
      }
      return
    }
    if (contribution.kind === 'command') {
      if (this.registries.commands.has(contribution.id)) {
        throw new Error(`Command already registered: ${contribution.id}`)
      }
      this.registries.commands.set(contribution.id, (state, dispatch, view) => {
        if (!dispatch) return true
        run(state, dispatch, null, view)
        return true
      })
      return
    }
    if (contribution.kind === 'keymap') {
      const key = typeof descriptor.key === 'string' ? descriptor.key : ''
      if (!key) throw new Error(`Keymap ${contribution.id} requires key`)
      const priority = typeof descriptor.priority === 'number' ? descriptor.priority : 0
      this.registries.keymaps.push({
        pluginId: manifest.id,
        priority,
        bindings: {
          [key]: (state, dispatch, view) => {
            if (!dispatch) return true
            run(state, dispatch, null, view)
            return true
          },
        },
      })
      return
    }
    if (contribution.kind === 'slashItem') {
      if (this.registries.slashItems.has(contribution.id)) {
        throw new Error(`Slash item already registered: ${contribution.id}`)
      }
      this.registries.slashItems.set(contribution.id, {
        id: contribution.id,
        title,
        category: typeof descriptor.category === 'string' ? descriptor.category : undefined,
        keywords: Array.isArray(descriptor.keywords)
          ? descriptor.keywords.filter((item): item is string => typeof item === 'string')
          : undefined,
        run: ({ view, state, dispatch }) => run(state, dispatch, null, view),
      })
      return
    }
    if (contribution.kind === 'toolbarAction') {
      if (this.registries.toolbarActions.has(contribution.id)) {
        throw new Error(`Toolbar action already registered: ${contribution.id}`)
      }
      this.registries.toolbarActions.set(contribution.id, {
        id: contribution.id,
        title,
        order: typeof descriptor.order === 'number' ? descriptor.order : undefined,
        run: ({ view, state, dispatch }) => run(state, dispatch, null, view),
      })
      return
    }
    if (contribution.kind === 'serializer') {
      const nodeType = typeof descriptor.nodeType === 'string' ? descriptor.nodeType : ''
      const format = descriptor.format
      if (!nodeType || !['markdown', 'html', 'typst'].includes(String(format))) {
        throw new Error(`Serializer ${contribution.id} has invalid nodeType/format`)
      }
      const serializer = this.registries.nodeSerializers.get(nodeType) ?? {}
      const invoke = async (node: unknown, helpers: { serializeChildren: () => string }) => {
        const result = await session.invoke(handlerId!, { node, children: helpers.serializeChildren() })
        if (typeof result !== 'string') throw new Error(`Serializer ${contribution.id} must return a string`)
        if (result.length > 1024 * 1024) throw new Error(`Serializer ${contribution.id} exceeded 1 MiB`)
        if (
          format === 'html'
          && /<\s*(?:script|iframe|object|embed|link|meta)\b|\son[a-z]+\s*=|javascript:|data:\s*text\/html/i
            .test(result)
        ) {
          throw new Error(`Serializer ${contribution.id} returned unsafe HTML`)
        }
        return result
      }
      if (format === 'markdown') serializer.markdown = invoke
      if (format === 'html') serializer.html = invoke
      if (format === 'typst') serializer.typst = invoke
      this.registries.nodeSerializers.set(nodeType, serializer)
      return
    }
    if (contribution.kind === 'importer') {
      const fencedLang = typeof descriptor.fencedLang === 'string' ? descriptor.fencedLang : ''
      if (!fencedLang) throw new Error(`Importer ${contribution.id} requires fencedLang`)
      this.registries.nodeImporters.set(fencedLang, {
        fencedLang,
        fromFenced: async code => {
          const result = await session.invoke(handlerId!, { code })
          return result && typeof result === 'object' ? result as never : null
        },
      })
      return
    }
    if (contribution.kind === 'popover') {
      const nodeType = typeof descriptor.nodeType === 'string' ? descriptor.nodeType : ''
      if (!nodeType || !Array.isArray(descriptor.fields)) {
        throw new Error(`Popover ${contribution.id} requires nodeType and fields`)
      }
      const fields = descriptor.fields.map((value, index) => {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
          throw new Error(`Popover ${contribution.id} field ${index} is invalid`)
        }
        const field = value as Record<string, unknown>
        if (typeof field.key !== 'string') {
          throw new Error(`Popover ${contribution.id} field ${index} requires key`)
        }
        return {
          key: field.key,
          type: typeof field.type === 'string' ? field.type as never : undefined,
          label: typeof field.label === 'string' ? field.label : undefined,
          placeholder: typeof field.placeholder === 'string' ? field.placeholder : undefined,
          rows: typeof field.rows === 'number' ? field.rows : undefined,
          min: typeof field.min === 'number' ? field.min : undefined,
          max: typeof field.max === 'number' ? field.max : undefined,
          step: typeof field.step === 'number' ? field.step : undefined,
          options: Array.isArray(field.options)
            ? field.options
                .filter((option): option is Record<string, unknown> =>
                  Boolean(option) && typeof option === 'object' && !Array.isArray(option))
                .map(option => ({
                  value: String(option.value ?? ''),
                  label: String(option.label ?? option.value ?? ''),
                }))
            : undefined,
        }
      })
      this.registries.nodePopovers.set(nodeType, {
        title,
        fields,
        removable: descriptor.removable !== false,
      })
      return
    }
    if (contribution.kind === 'decoration') {
      const mode = descriptor.mode === 'selection' ? 'selection' : 'node'
      const nodeType = typeof descriptor.nodeType === 'string' ? descriptor.nodeType : ''
      const className = typeof descriptor.className === 'string' ? descriptor.className : ''
      if (!/^[A-Za-z][A-Za-z0-9_-]{0,79}$/.test(className)) {
        throw new Error(`Decoration ${contribution.id} requires a safe className`)
      }
      if (mode === 'node' && !/^[A-Za-z][A-Za-z0-9_]{0,79}$/.test(nodeType)) {
        throw new Error(`Decoration ${contribution.id} requires a safe nodeType`)
      }
      const attrs = descriptor.attrs && typeof descriptor.attrs === 'object' && !Array.isArray(descriptor.attrs)
        ? descriptor.attrs as Record<string, unknown>
        : {}
      this.registries.decorationProviders.set(contribution.id, {
        dependsOnSelection: mode === 'selection',
        provider: state => {
          if (mode === 'selection') {
            if (state.selection.empty) return []
            return [Decoration.inline(state.selection.from, state.selection.to, {
              class: className,
              'data-nevo-plugin': manifest.id,
            })]
          }
          const decorations: Decoration[] = []
          state.doc.descendants((node, position) => {
            if (node.type.name !== nodeType) return
            const matches = Object.entries(attrs).every(([key, value]) => node.attrs[key] === value)
            if (!matches) return
            decorations.push(Decoration.node(position, position + node.nodeSize, {
              class: className,
              'data-nevo-plugin': manifest.id,
            }))
          })
          return decorations
        },
      })
      return
    }
    if (contribution.kind === 'workspaceView') {
      const source = this.sandboxIframeUrl(manifest.id, descriptor.source)
      const route = this.sandboxContributionRoute(manifest.id, contribution.id, descriptor.route)
      this.registries.workspaceViews.set(contribution.id, {
        pluginId: manifest.id,
        id: contribution.id,
        title,
        route,
        component: Object.freeze({
          type: 'sandboxed-plugin-iframe',
          pluginId: manifest.id,
          source,
          sandbox: 'allow-scripts',
        }),
        icon: typeof descriptor.icon === 'string' ? descriptor.icon : undefined,
        order: typeof descriptor.order === 'number' ? descriptor.order : undefined,
      })
      if (handlerId) {
        this.sandboxedUiHandlers.set(`${manifest.id}:${contribution.id}`, handlerId)
      }
      return
    }
    if (contribution.kind === 'sidebarItem') {
      const route = this.sandboxContributionRoute(manifest.id, contribution.id, descriptor.route)
      this.registries.sidebarItems.set(contribution.id, {
        pluginId: manifest.id,
        id: contribution.id,
        title,
        route,
        icon: typeof descriptor.icon === 'string' ? descriptor.icon : undefined,
        order: typeof descriptor.order === 'number' ? descriptor.order : undefined,
      })
      if (handlerId) {
        this.sandboxedUiHandlers.set(`${manifest.id}:${contribution.id}`, handlerId)
      }
      return
    }
    if (contribution.kind === 'modal') {
      const source = this.sandboxIframeUrl(manifest.id, descriptor.source)
      this.registries.modals.set(contribution.id, {
        pluginId: manifest.id,
        id: contribution.id,
        component: Object.freeze({
          type: 'sandboxed-plugin-iframe',
          pluginId: manifest.id,
          source,
          sandbox: 'allow-scripts',
        }),
      })
      if (handlerId) {
        this.sandboxedUiHandlers.set(`${manifest.id}:${contribution.id}`, handlerId)
      }
      return
    }
    if (contribution.kind === 'editorEvent') {
      const event = typeof descriptor.event === 'string' ? descriptor.event : ''
      if (!event || !handlerId) throw new Error(`Editor event ${contribution.id} is invalid`)
      const events = this.sandboxedEventHandlers.get(manifest.id) ?? new Map<string, string[]>()
      events.set(event, [...(events.get(event) ?? []), handlerId])
      this.sandboxedEventHandlers.set(manifest.id, events)
    }
  }

  private async executeSandboxHandler(
    manifest: NevoEditorPluginManifest,
    session: SandboxedPluginSession,
    handlerId: string,
    state: EditorState,
    dispatch: (transaction: Transaction) => void,
    input: unknown,
    view?: EditorView,
  ): Promise<void> {
    try {
      const invocationState = view?.state ?? state
      const revision = this.editorRevision
      const snapshot = createEditorSnapshot(
        invocationState,
        revision,
        manifestCapabilities(manifest).includes('editor.read'),
        this.runtime?.locale?.() ?? 'en',
        this.runtime?.timeZone?.() ?? 'UTC',
      )
      const result = await session.invoke(handlerId, input, snapshot)
      const currentState = view?.state ?? invocationState
      const currentRevision = this.editorRevision
      const intent = validateTransactionIntent(result, currentRevision)
      dispatch(applyTransactionIntent(currentState, intent))
    } catch (error) {
      this.recordSandboxError(manifest.id, 'handler', error)
    }
  }

  private recordSandboxError(pluginId: string, phase: string, error: unknown): void {
    this.errors.push(`Sandboxed plugin ${pluginId} ${phase} failed: ${normalizeErrorMessage(error)}`)
  }

  /**
   * Applies an attr patch proposed by a Tier 2 block iframe. The write is gated by
   * `editor.write.self`, validated as bounded JSON, and confined to the single node
   * that owns the frame (identified by its live position); unknown attrs are dropped
   * by ProseMirror against the node's schema.
   */
  private applySandboxFramePatch(
    manifest: NevoEditorPluginManifest,
    view: EditorView,
    position: number,
    patch: Record<string, unknown>,
  ): boolean {
    if (!manifestCapabilities(manifest).includes('editor.write.self')) {
      this.recordSandboxError(manifest.id, 'frame-patch',
        new Error(`Plugin ${manifest.id} requires capability editor.write.self`))
      return false
    }
    try {
      assertJsonValue(patch, 'frame.patch')
      if (new TextEncoder().encode(JSON.stringify(patch)).byteLength > MAX_FRAME_PATCH_BYTES) {
        throw new Error('Sandbox block patch exceeds the value limit')
      }
    } catch (error) {
      this.recordSandboxError(manifest.id, 'frame-patch', error)
      return false
    }
    const node = view.state.doc.nodeAt(position)
    if (!node) return false
    try {
      const transaction = view.state.tr.setNodeMarkup(
        position,
        undefined,
        { ...node.attrs, ...patch },
        node.marks,
      )
      view.dispatch(transaction)
      return true
    } catch (error) {
      this.recordSandboxError(manifest.id, 'frame-patch', error)
      return false
    }
  }

  private async executeSandboxHostCall(
    manifest: NevoEditorPluginManifest,
    method: string,
    args: unknown,
  ): Promise<unknown> {
    const values = args && typeof args === 'object' && !Array.isArray(args)
      ? args as Record<string, unknown>
      : {}
    const key = typeof values.key === 'string' ? values.key : ''
    const capabilities = manifestCapabilities(manifest)
    const requireCapability = (capability: typeof capabilities[number]) => {
      if (!capabilities.includes(capability)) {
        throw new Error(`Plugin ${manifest.id} requires capability ${capability}`)
      }
    }
    if (method.startsWith('storage.workspace.')) {
      requireCapability('storage.workspace')
      if (!key) throw new Error('Plugin storage key is required')
      if (method.endsWith('.get')) {
        if (!this.runtime?.pluginStorageGet) throw new Error('Workspace plugin storage is unavailable')
        return this.runtime.pluginStorageGet(manifest.id, 'workspace', key)
      }
      if (method.endsWith('.set')) {
        if (!this.runtime?.pluginStorageSet) throw new Error('Workspace plugin storage is unavailable')
        await this.runtime.pluginStorageSet(manifest.id, 'workspace', key, values.value)
        return null
      }
      if (!this.runtime?.pluginStorageDelete) throw new Error('Workspace plugin storage is unavailable')
      await this.runtime.pluginStorageDelete(manifest.id, 'workspace', key)
      return null
    }
    if (method.startsWith('storage.local.')) {
      requireCapability('storage.local')
      if (!key) throw new Error('Plugin storage key is required')
      if (method.endsWith('.get')) {
        if (!this.runtime?.pluginStorageGet) throw new Error('Local plugin storage is unavailable')
        return this.runtime.pluginStorageGet(manifest.id, 'local', key)
      }
      if (method.endsWith('.set')) {
        if (!this.runtime?.pluginStorageSet) throw new Error('Local plugin storage is unavailable')
        await this.runtime.pluginStorageSet(manifest.id, 'local', key, values.value)
        return null
      }
      if (!this.runtime?.pluginStorageDelete) throw new Error('Local plugin storage is unavailable')
      await this.runtime.pluginStorageDelete(manifest.id, 'local', key)
      return null
    }
    if (method === 'settings.get') {
      requireCapability('settings.read')
      if (!key) throw new Error('Plugin setting key is required')
      return this.runtime?.getPluginSetting?.(manifest.id, key) ?? null
    }
    if (method === 'settings.set') {
      requireCapability('settings.write')
      if (!key) throw new Error('Plugin setting key is required')
      if (!this.runtime?.setPluginSetting) throw new Error('Plugin settings are unavailable')
      this.runtime.setPluginSetting(manifest.id, key, values.value)
      return null
    }
    if (method === 'secrets.get') {
      requireCapability('secrets.read')
      if (!key) throw new Error('Plugin secret key is required')
      if (!this.runtime?.getPluginSecret) throw new Error('Plugin secrets are unavailable')
      return this.runtime.getPluginSecret(manifest.id, key)
    }
    if (method === 'assets.write') {
      requireCapability('assets.write')
      if (!this.runtime?.pluginAssetWrite) throw new Error('Plugin asset store is unavailable')
      const dataBase64 = typeof values.dataBase64 === 'string' ? values.dataBase64 : ''
      if (!dataBase64) throw new Error('Plugin asset data is required')
      return this.runtime.pluginAssetWrite(manifest.id, dataBase64)
    }
    if (method === 'assets.read') {
      requireCapability('assets.read')
      if (!this.runtime?.pluginAssetRead) throw new Error('Plugin asset store is unavailable')
      const assetId = typeof values.assetId === 'string' ? values.assetId : ''
      if (!assetId) throw new Error('Plugin asset id is required')
      return this.runtime.pluginAssetRead(manifest.id, assetId)
    }
    if (method === 'assets.delete') {
      requireCapability('assets.write')
      if (!this.runtime?.pluginAssetDelete) throw new Error('Plugin asset store is unavailable')
      const assetId = typeof values.assetId === 'string' ? values.assetId : ''
      if (!assetId) throw new Error('Plugin asset id is required')
      await this.runtime.pluginAssetDelete(manifest.id, assetId)
      return null
    }
    if (method === 'assets.beginUpload') {
      requireCapability('assets.write')
      if (!this.runtime?.pluginAssetBeginUpload) throw new Error('Plugin asset store is unavailable')
      return this.runtime.pluginAssetBeginUpload(manifest.id)
    }
    if (method === 'assets.appendChunk') {
      requireCapability('assets.write')
      if (!this.runtime?.pluginAssetAppendChunk) throw new Error('Plugin asset store is unavailable')
      const uploadId = typeof values.uploadId === 'string' ? values.uploadId : ''
      const chunkBase64 = typeof values.chunkBase64 === 'string' ? values.chunkBase64 : ''
      if (!uploadId || !chunkBase64) throw new Error('Plugin asset chunk is required')
      await this.runtime.pluginAssetAppendChunk(manifest.id, uploadId, chunkBase64)
      return null
    }
    if (method === 'assets.finishUpload') {
      requireCapability('assets.write')
      if (!this.runtime?.pluginAssetFinishUpload) throw new Error('Plugin asset store is unavailable')
      const uploadId = typeof values.uploadId === 'string' ? values.uploadId : ''
      if (!uploadId) throw new Error('Plugin asset upload id is required')
      return this.runtime.pluginAssetFinishUpload(manifest.id, uploadId)
    }
    if (method === 'assets.abortUpload') {
      requireCapability('assets.write')
      if (!this.runtime?.pluginAssetAbortUpload) throw new Error('Plugin asset store is unavailable')
      const uploadId = typeof values.uploadId === 'string' ? values.uploadId : ''
      if (!uploadId) throw new Error('Plugin asset upload id is required')
      await this.runtime.pluginAssetAbortUpload(manifest.id, uploadId)
      return null
    }
    if (method === 'assets.url') {
      requireCapability('assets.read')
      if (!this.runtime?.pluginAssetUrl) throw new Error('Plugin asset store is unavailable')
      const assetId = typeof values.assetId === 'string' ? values.assetId : ''
      if (!assetId) throw new Error('Plugin asset id is required')
      return this.runtime.pluginAssetUrl(manifest.id, assetId)
    }
    if (method === 'network.fetch') {
      requireCapability('network.fetch')
      if (!this.runtime?.pluginNetworkFetch) throw new Error('Plugin network broker is unavailable')
      return this.runtime.pluginNetworkFetch(manifest.id, values)
    }
    if (method === 'runtime.schedule') {
      requireCapability('runtime.scheduling')
      const handlerId = typeof values.handlerId === 'string' ? values.handlerId : ''
      const delayMs = typeof values.delayMs === 'number' ? values.delayMs : Number.NaN
      const repeat = values.repeat === true
      if (!handlerId.startsWith(`${manifest.id}:h`) || !Number.isSafeInteger(delayMs)) {
        throw new Error('Plugin schedule request is invalid')
      }
      if (delayMs < 100 || delayMs > 24 * 60 * 60 * 1_000) {
        throw new Error('Plugin schedule delay must be between 100 ms and 24 hours')
      }
      const schedules = this.sandboxedSchedules.get(manifest.id) ?? new Map()
      if (schedules.size >= 32) throw new Error('Plugin schedule limit exceeded')
      const scheduleId = globalThis.crypto?.randomUUID?.()
        ?? `${manifest.id}-${Date.now()}-${Math.random()}`
      const invoke = () => {
        const session = this.sandboxedSessions.get(manifest.id)
        if (!session) return
        void session.invoke(handlerId, {
          scheduleId,
          scheduledAt: new Date().toISOString(),
        }).catch(error => this.recordSandboxError(manifest.id, 'schedule', error))
        if (!repeat) schedules.delete(scheduleId)
      }
      const timer = repeat
        ? globalThis.setInterval(invoke, delayMs)
        : globalThis.setTimeout(invoke, delayMs)
      schedules.set(scheduleId, timer)
      this.sandboxedSchedules.set(manifest.id, schedules)
      return scheduleId
    }
    if (method === 'runtime.schedule.clear') {
      requireCapability('runtime.scheduling')
      const scheduleId = typeof values.scheduleId === 'string' ? values.scheduleId : ''
      const schedules = this.sandboxedSchedules.get(manifest.id)
      const timer = schedules?.get(scheduleId)
      if (timer !== undefined) {
        globalThis.clearTimeout(timer)
        globalThis.clearInterval(timer)
        schedules?.delete(scheduleId)
      }
      return null
    }
    if (method === 'workspace.invoke') {
      const commandId = typeof values.commandId === 'string' ? values.commandId : ''
      assertWorkspaceCommandCapability(manifest, commandId)
      if (!this.runtime?.invoke) throw new Error('Workspace invoke runtime is unavailable')
      const commandArgs = values.args && typeof values.args === 'object' && !Array.isArray(values.args)
        ? values.args as Record<string, unknown>
        : undefined
      return this.runtime.invoke(commandId, commandArgs)
    }
    throw new Error(`Plugin host method is not exposed: ${method}`)
  }

  private sandboxIframeUrl(pluginId: string, source: unknown): string {
    if (typeof source !== 'string') throw new Error('Sandbox iframe source is required')
    const token = this.sandboxedCodeTokens.get(pluginId)
    if (!token) throw new Error('Sandbox iframe requires a plugin-scoped code session')
    const encodedPath = source.split('/').map(encodeURIComponent).join('/')
    return `nevoplugin://${token}/${encodedPath}`
  }

  private sandboxContributionRoute(pluginId: string, contributionId: string, route: unknown): string {
    if (typeof route === 'string') return route
    const viewId = contributionId.startsWith(`${pluginId}.`)
      ? contributionId.slice(pluginId.length + 1)
      : contributionId
    return `/workspace/plugin/${pluginId}/${encodeURIComponent(viewId)}`
  }

  private clearAllSandboxSchedules(): void {
    for (const schedules of this.sandboxedSchedules.values()) {
      for (const timer of schedules.values()) {
        globalThis.clearTimeout(timer)
        globalThis.clearInterval(timer)
      }
    }
    this.sandboxedSchedules.clear()
  }

  private resolvePluginInstance(module: NevoEditorPluginModule): NevoEditorPlugin {
    if (module.createPlugin) return module.createPlugin()
    if (module.plugin) return module.plugin
    if (module.default) return module.default
    throw new Error('Plugin module must export default, plugin, or createPlugin')
  }
}
