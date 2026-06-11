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

/**
 * Лёгкое представление ноды для сериализации/импорта. Структурно совместимо с
 * BlockNode из ../types/note, но не зависит от него, чтобы плагины могли
 * импортировать только publichный SDK.
 */
export interface NevoSerializableNode {
  type: string
  attrs?: Record<string, unknown>
  content?: NevoSerializableNode[]
  text?: string
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>
}

export interface NevoNodeSerializerHelpers {
  /** Сериализовать дочерние ноды текущей ноды в том же формате. */
  serializeChildren: () => string
}

export interface NevoNodeHtmlSerializerHelpers extends NevoNodeSerializerHelpers {
  escapeHtml: (value: string) => string
}

/** Хуки сериализации плагинной ноды во все форматы экспорта. */
export interface NevoNodeSerializer {
  markdown?: (node: NevoSerializableNode, helpers: NevoNodeSerializerHelpers) => string
  html?: (node: NevoSerializableNode, helpers: NevoNodeHtmlSerializerHelpers) => string
  typst?: (node: NevoSerializableNode, helpers: NevoNodeSerializerHelpers) => string
}

/** Импорт плагинной ноды из fenced code block Markdown по языку. */
export interface NevoNodeImporter {
  fencedLang: string
  fromFenced: (code: string) => NevoSerializableNode | null
}

export type NevoNodePopoverFieldType = 'text' | 'textarea' | 'select' | 'number' | 'checkbox' | 'color'

export interface NevoNodePopoverField {
  /** Ключ attr ноды (если не переопределены read/apply). */
  key: string
  type?: NevoNodePopoverFieldType
  label?: string
  placeholder?: string
  rows?: number
  options?: Array<{ value: string; label: string }>
  min?: number
  max?: number
  step?: number
}

export interface NevoNodePopoverConfig {
  title?: string
  fields: NevoNodePopoverField[]
  /** Показывать кнопку удаления ноды (по умолчанию true). */
  removable?: boolean
  /** Прочитать значения полей из attrs ноды (по умолчанию — сами attrs). */
  read?: (attrs: Record<string, unknown>) => Record<string, unknown>
  /** Преобразовать значения полей в патч attrs (по умолчанию — сами значения). */
  apply?: (values: Record<string, unknown>) => Record<string, unknown>
}

/** Высокоуровневое описание кастомного блока «всё в одном». */
export interface NevoBlockTypeConfig {
  name: string
  schema: NodeSpec
  /** Отрисовка содержимого ноды. requestEdit открывает поповер редактирования. */
  render: (
    node: NevoSerializableNode,
    helpers: { requestEdit: (anchorRect?: DOMRect) => void },
  ) => HTMLElement
  popover?: NevoNodePopoverConfig
  serialize?: NevoNodeSerializer
  importer?: NevoNodeImporter
  /** Пункт slash-меню для вставки ноды (run генерируется автоматически). */
  slashItem?: Omit<NevoSlashItem, 'run'> & { defaultAttrs?: Record<string, unknown> }
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
  registerNodeSerializer(nodeName: string, serializer: NevoNodeSerializer): void
  registerNodeImporter(importer: NevoNodeImporter): void
  registerNodePopover(nodeName: string, config: NevoNodePopoverConfig): void
  /** Открыть поповер редактирования для ноды на позиции position. */
  requestNodeEdit(view: EditorView, position: number, anchorRect?: DOMRect): void
  /** Зарегистрировать кастомный блок одним вызовом (нода + view + поповер + сериализация). */
  registerBlockType(config: NevoBlockTypeConfig): void
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
  nodeSerializers: Map<string, NevoNodeSerializer>
  nodeImporters: Map<string, NevoNodeImporter>
  nodePopovers: Map<string, NevoNodePopoverConfig>
  extraPlugins: PMPlugin[]
}
