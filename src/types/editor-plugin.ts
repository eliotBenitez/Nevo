import type { EditorView, NodeViewConstructor } from 'prosemirror-view'
import type { EditorState, Transaction, Plugin as PMPlugin } from 'prosemirror-state'
import type { Command } from 'prosemirror-state'
import type { NodeSpec, MarkSpec } from 'prosemirror-model'
import type { Decoration, DecorationSet } from 'prosemirror-view'

export const NEVO_EDITOR_SDK_VERSION = '1.0.0'

export type NevoEditorCapability =
  | 'editor.read'
  | 'editor.write'
  | 'workspace.read'
  | 'workspace.command.invoke'

export interface NevoEditorPluginManifest {
  id: string
  name: string
  version: string
  description?: string
  enabled: boolean
  entryPoint: string
  apiVersion: string
  nevoVersionRange?: string
  editorCapabilities: NevoEditorCapability[]
  priority?: number
}

export interface NevoEditorPluginCompatibility {
  apiVersion: string
  nevoVersion: string
}

export interface NevoSlashItem {
  id: string
  title: string
  category?: string
  keywords?: string[]
  run: (ctx: { view: EditorView; state: EditorState; dispatch: (tr: Transaction) => void }) => void
}

export interface NevoSlashMenuState {
  open: boolean
  query: string
  range: { from: number; to: number } | null
  activeIndex: number
  itemIds: string[]
}

export interface NevoToolbarAction {
  id: string
  title: string
  order?: number
  run: (ctx: { view: EditorView; state: EditorState; dispatch: (tr: Transaction) => void }) => void
}

export interface NevoTableContext {
  inTable: boolean
  tablePos: number
  rows: number
  cols: number
  selectedRows: number
  selectedCols: number
  canMerge: boolean
  canSplit: boolean
  isMergedCell: boolean
  activeCell: {
    pos: number
    align: string | null
    background: string | null
    borderColor: string | null
    textColor: string | null
    padding: string | null
    isHeader: boolean
  } | null
}

export interface NevoTableMenuAction {
  id: string
  title: string
  order?: number
  run: (ctx: { view: EditorView; state: EditorState; dispatch: (tr: Transaction) => void; table: NevoTableContext }) => void
}

export interface NevoEditorEventMap {
  transactionApplied: { state: EditorState; transaction: Transaction }
  pluginActivated: { pluginId: string }
  pluginDeactivated: { pluginId: string }
}

export interface NevoEditorEventBus {
  emit<K extends keyof NevoEditorEventMap>(event: K, payload: NevoEditorEventMap[K]): void
  on<K extends keyof NevoEditorEventMap>(event: K, listener: (payload: NevoEditorEventMap[K]) => void): () => void
}

export interface NevoEditorStorage {
  get<T>(key: string): T | undefined
  set<T>(key: string, value: T): void
  delete(key: string): void
}

export interface NevoEditorContext {
  pluginId: string
  capabilities: Set<NevoEditorCapability>
  registerNode(name: string, spec: NodeSpec): void
  registerMark(name: string, spec: MarkSpec): void
  registerCommand(id: string, command: Command): void
  registerKeymap(priority: number, bindings: Record<string, Command>): void
  registerSlashItem(item: NevoSlashItem): void
  registerNodeView(nodeName: string, nodeView: NodeViewConstructor): void
  registerDecorationProvider(id: string, provider: (state: EditorState) => Decoration[] | DecorationSet): void
  registerToolbarAction(action: NevoToolbarAction): void
  eventBus: NevoEditorEventBus
  storage: NevoEditorStorage
}

export interface NevoEditorPlugin {
  onRegister?(ctx: NevoEditorContext): void | Promise<void>
  onActivate?(ctx: NevoEditorContext): void | Promise<void>
  onDeactivate?(ctx: NevoEditorContext): void | Promise<void>
  onDispose?(ctx: NevoEditorContext): void | Promise<void>
}

export interface NevoEditorPluginModule {
  manifest?: Partial<NevoEditorPluginManifest>
  default?: NevoEditorPlugin
  plugin?: NevoEditorPlugin
  createPlugin?: () => NevoEditorPlugin
}

export interface NevoEditorRuntimePlugin {
  manifest: NevoEditorPluginManifest
  instance: NevoEditorPlugin
}

export interface NevoEditorRegistries {
  commands: Map<string, Command>
  keymaps: Array<{ priority: number; bindings: Record<string, Command>; pluginId: string }>
  slashItems: Map<string, NevoSlashItem>
  toolbarActions: Map<string, NevoToolbarAction>
  nodeViews: Map<string, NodeViewConstructor>
  decorationProviders: Map<string, (state: EditorState) => Decoration[] | DecorationSet>
  nodes: Map<string, NodeSpec>
  marks: Map<string, MarkSpec>
  extraPlugins: PMPlugin[]
}
