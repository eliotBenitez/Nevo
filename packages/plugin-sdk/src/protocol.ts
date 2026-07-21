export const PLUGIN_API_VERSION = '2.0.0' as const
export const PLUGIN_PROTOCOL_VERSION = '2.0' as const

export const PLUGIN_PROTOCOL_LIMITS = Object.freeze({
  messageBytes: 1024 * 1024,
  valueBytes: 256 * 1024,
  storageBytes: 5 * 1024 * 1024,
  registrations: 200,
  handlerTimeoutMs: 5_000,
  lifecycleTimeoutMs: 10_000,
})

export type PluginCapability =
  | 'editor.read'
  | 'editor.write'
  | 'editor.write.self'
  | 'editor.schema'
  | 'ui.contributions'
  | 'ui.iframe'
  | 'ui.blockFrame'
  | 'ui.navigation'
  | 'workspace.read'
  | 'workspace.write'
  | 'note.read'
  | 'note.write'
  | 'template.read'
  | 'template.write'
  | 'kanban.read'
  | 'kanban.write'
  | 'settings.read'
  | 'settings.write'
  | 'secrets.read'
  | 'storage.local'
  | 'storage.workspace'
  | 'assets.read'
  | 'assets.write'
  | 'runtime.events'
  | 'runtime.scheduling'
  | 'network.fetch'

export type JsonPrimitive = string | number | boolean | null
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue }
export type JsonObject = { [key: string]: JsonValue }

export interface PluginSelectionSnapshot {
  from: number
  to: number
  empty: boolean
  anchor: number
  head: number
}

export interface PluginSchemaSnapshot {
  nodes: string[]
  marks: string[]
}

export interface PluginEditorSnapshot {
  revision: number
  selection: PluginSelectionSnapshot
  schema: PluginSchemaSnapshot
  doc?: JsonObject
  now: string
  locale: string
  timeZone: string
}

export type TransactionPosition =
  | number
  | 'selection.from'
  | 'selection.to'

export type TransactionOperation =
  | { type: 'insertText'; text: string; from?: TransactionPosition; to?: TransactionPosition }
  | { type: 'insertNode'; nodeType: string; attrs?: JsonObject; at?: TransactionPosition }
  | { type: 'replaceSelection'; content: JsonObject | JsonObject[] }
  | { type: 'setNodeAttrs'; position: TransactionPosition; attrs: JsonObject }
  | { type: 'addMark'; markType: string; attrs?: JsonObject; from: TransactionPosition; to: TransactionPosition }
  | { type: 'removeMark'; markType: string; from: TransactionPosition; to: TransactionPosition }
  | { type: 'wrap'; nodeType: string; attrs?: JsonObject; from: TransactionPosition; to: TransactionPosition }
  | { type: 'setSelection'; from: TransactionPosition; to?: TransactionPosition }

export interface TransactionIntent {
  type: 'transaction'
  revision: number
  operations: TransactionOperation[]
  scrollIntoView?: boolean
}

export interface PluginHandlerInvocation {
  handlerId: string
  input: JsonValue | null
  editor?: PluginEditorSnapshot
}

export type PluginHandlerResult =
  | TransactionIntent
  | JsonValue
  | null

export type PluginContributionKind =
  | 'command'
  | 'keymap'
  | 'slashItem'
  | 'toolbarAction'
  | 'schemaNode'
  | 'schemaMark'
  | 'blockType'
  | 'popover'
  | 'decoration'
  | 'serializer'
  | 'importer'
  | 'workspaceView'
  | 'sidebarItem'
  | 'modal'
  | 'editorEvent'

export interface PluginContribution {
  kind: PluginContributionKind
  id: string
  handlerId?: string
  descriptor: JsonObject
}

export interface PluginSetupResult {
  contributions: PluginContribution[]
  dataVersion?: number
}

interface RpcBase {
  protocolVersion: typeof PLUGIN_PROTOCOL_VERSION
  requestId: string
}

export interface InitializeRequest extends RpcBase {
  type: 'initialize'
  sessionToken: string
  pluginUrl: string
  pluginId: string
  capabilities: PluginCapability[]
  dataVersion: number
}

export interface InvokeRequest extends RpcBase {
  type: 'invoke'
  sessionToken: string
  invocation: PluginHandlerInvocation
}

export interface LifecycleRequest extends RpcBase {
  type: 'lifecycle'
  sessionToken: string
  phase: 'activate' | 'deactivate' | 'dispose'
}

export interface CancelRequest extends RpcBase {
  type: 'cancel'
  sessionToken: string
  targetRequestId: string
}

export interface EventRequest extends RpcBase {
  type: 'event'
  sessionToken: string
  event: string
  payload: JsonValue
}

export interface MigrationRequest extends RpcBase {
  type: 'migration'
  sessionToken: string
  targetDataVersion: number
  input: {
    fromDataVersion: number
    storage: JsonObject
    nodes: JsonObject[]
  }
}

export type HostToWorkerMessage =
  | InitializeRequest
  | InvokeRequest
  | LifecycleRequest
  | CancelRequest
  | EventRequest
  | MigrationRequest

export interface RpcSuccessResponse extends RpcBase {
  type: 'response'
  ok: true
  result: JsonValue | null
}

export interface RpcErrorResponse extends RpcBase {
  type: 'response'
  ok: false
  error: {
    code: string
    message: string
  }
}

export type WorkerToHostMessage = RpcSuccessResponse | RpcErrorResponse

export function transaction(
  revision: number,
  operations: TransactionOperation[],
  options: { scrollIntoView?: boolean } = {},
): TransactionIntent {
  return {
    type: 'transaction',
    revision,
    operations,
    ...(options.scrollIntoView === undefined ? {} : { scrollIntoView: options.scrollIntoView }),
  }
}
