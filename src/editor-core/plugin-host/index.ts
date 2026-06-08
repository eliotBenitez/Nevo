import { convertFileSrc } from '@tauri-apps/api/core'
import { Plugin } from 'prosemirror-state'
import type { Transaction, Command } from 'prosemirror-state'
import { DecorationSet } from 'prosemirror-view'
import type { Decoration } from 'prosemirror-view'
import type { EditorState } from 'prosemirror-state'
import type {
  NevoEditorContext,
  NevoEditorEventMap,
  NevoEditorPlugin,
  NevoEditorPluginManifest,
  NevoEditorPluginModule,
  NevoEditorRegistries,
  NevoEditorRuntimePlugin,
  NevoSlashItem,
  NevoToolbarAction,
} from '../../types/editor-plugin'
import { sanitizePluginPath, normalizeErrorMessage, validateManifest, type EditorPluginHostOptions } from './utils'
import { buildPluginContext } from './context'

export class EditorPluginHost {
  private readonly workspacePath: string | null
  private readonly manifests: NevoEditorPluginManifest[]
  private readonly nevoVersion: string
  private readonly listeners = new Map<keyof NevoEditorEventMap, Set<(payload: unknown) => void>>()
  private readonly storage = new Map<string, Map<string, unknown>>()
  private readonly runtimePlugins = new Map<string, NevoEditorRuntimePlugin>()
  private readonly contexts = new Map<string, NevoEditorContext>()

  readonly errors: string[] = []

  readonly registries: NevoEditorRegistries = {
    commands: new Map<string, Command>(),
    keymaps: [],
    slashItems: new Map<string, NevoSlashItem>(),
    toolbarActions: new Map<string, NevoToolbarAction>(),
    nodeViews: new Map(),
    decorationProviders: new Map(),
    nodes: new Map(),
    marks: new Map(),
    extraPlugins: [],
  }

  constructor(options: EditorPluginHostOptions) {
    this.workspacePath = options.workspacePath
    this.manifests = options.manifests
    this.nevoVersion = options.nevoVersion
  }

  async initialize(): Promise<void> {
    const manifests = this.manifests
      .filter((manifest) => manifest.enabled)
      .slice()
      .sort((a, b) => {
        const byPriority = (b.priority ?? 0) - (a.priority ?? 0)
        if (byPriority !== 0) return byPriority
        return a.id.localeCompare(b.id)
      })

    for (const manifest of manifests) {
      await this.loadAndRegister(manifest)
    }
    for (const manifest of manifests) {
      await this.activate(manifest.id)
    }
  }

  async deactivateAll(): Promise<void> {
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
    this.runtimePlugins.clear()
    this.contexts.clear()
  }

  listSlashItems(): NevoSlashItem[] {
    return Array.from(this.registries.slashItems.values())
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

  private _buildDecorations(state: EditorState): DecorationSet | null {
    const collected: Decoration[] = []
    for (const provider of this.registries.decorationProviders.values()) {
      try {
        const result = provider(state)
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
    this.emit('transactionApplied', { state, transaction })
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
      const pluginModule = await this.loadPluginModule(manifest)
      const instance = this.resolvePluginInstance(pluginModule)
      const context = buildPluginContext(manifest, this.storage, this.registries, this.emit.bind(this), this.on.bind(this))

      await instance.onRegister?.(context)
      this.runtimePlugins.set(manifest.id, { manifest, instance })
      this.contexts.set(manifest.id, context)
    } catch (error) {
      this.errors.push(`Plugin ${manifest.id} registration failed: ${normalizeErrorMessage(error)}`)
    }
  }

  private async activate(pluginId: string): Promise<void> {
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
    if (!this.workspacePath) {
      throw new Error('No workspace path available for plugin loading')
    }
    const pluginPath = sanitizePluginPath(`${this.workspacePath}/.nevo/plugins/${manifest.id}/${manifest.entryPoint}`)
    const url = `${convertFileSrc(pluginPath)}?v=${encodeURIComponent(manifest.version)}`
    return import(/* @vite-ignore */ url)
  }

  private resolvePluginInstance(module: NevoEditorPluginModule): NevoEditorPlugin {
    if (module.createPlugin) return module.createPlugin()
    if (module.plugin) return module.plugin
    if (module.default) return module.default
    throw new Error('Plugin module must export default, plugin, or createPlugin')
  }
}
