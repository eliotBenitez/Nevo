/// <reference lib="webworker" />

import type {
  NevoPluginCapability,
  NevoPluginMigrationInput,
  NevoPluginMigrationResult,
  NevoSandboxContribution,
  NevoSandboxContributionKind,
  NevoSandboxPluginDefinition,
} from '../../types/editor-plugin'
import {
  MAX_SANDBOX_ERROR_LENGTH,
  SANDBOX_PROTOCOL_VERSION,
  assertSandboxMessageSize,
  isSandboxWorkerRequest,
  type SandboxWorkerRequest,
  type SandboxWorkerResponse,
} from './sandboxProtocol'
import { lockDownSandboxGlobals } from './sandboxLockdown'

type JsonRecord = Record<string, unknown>
type Handler = (
  input: unknown,
  context: { editor?: unknown; signal: AbortSignal },
) => unknown | Promise<unknown>

interface WorkerPluginDefinition {
  setup(api: WorkerSetupApi): void | NevoSandboxContribution[] | Promise<void | NevoSandboxContribution[]>
  activate?(): void | Promise<void>
  deactivate?(): void | Promise<void>
  dispose?(): void | Promise<void>
  migrations?: Record<number, (
    input: NevoPluginMigrationInput,
  ) => NevoPluginMigrationResult | Promise<NevoPluginMigrationResult>>
}

interface WorkerSetupApi {
  pluginId: string
  capabilities: ReadonlySet<NevoPluginCapability>
  register(kind: NevoSandboxContributionKind, descriptor: JsonRecord, handler?: Handler): string | undefined
  command(descriptor: JsonRecord, handler: Handler): string
  keymap(descriptor: JsonRecord, handler: Handler): string
  slashItem(descriptor: JsonRecord, handler: Handler): string
  toolbarAction(descriptor: JsonRecord, handler: Handler): string
  schemaNode(descriptor: JsonRecord): void
  schemaMark(descriptor: JsonRecord): void
  blockType(descriptor: JsonRecord, handler?: Handler): string | undefined
  serializer(descriptor: JsonRecord, handler: Handler): string
  importer(descriptor: JsonRecord, handler: Handler): string
  workspaceView(descriptor: JsonRecord, handler?: Handler): string | undefined
  sidebarItem(descriptor: JsonRecord, handler?: Handler): string | undefined
  modal(descriptor: JsonRecord, handler?: Handler): string | undefined
  onEditorEvent(descriptor: JsonRecord, handler: Handler): string
  scheduling: {
    setTimeout(handler: Handler, delayMs: number): Promise<unknown>
    setInterval(handler: Handler, intervalMs: number): Promise<unknown>
    clear(scheduleId: string): Promise<unknown>
  }
  storage: {
    workspace: WorkerStorage
    local: WorkerStorage
  }
  settings: {
    get(key: string): Promise<unknown>
    set(key: string, value: unknown): Promise<unknown>
  }
  secrets: {
    get(key: string): Promise<unknown>
  }
  network: {
    fetch(request: unknown): Promise<unknown>
  }
  workspace: {
    invoke(commandId: string, args?: unknown): Promise<unknown>
  }
}

interface WorkerStorage {
  get(key: string): Promise<unknown>
  set(key: string, value: unknown): Promise<unknown>
  delete(key: string): Promise<unknown>
}

const workerScope = self as DedicatedWorkerGlobalScope
const postToHost = workerScope.postMessage.bind(workerScope)
const pending = new Map<string, AbortController>()
const handlers = new Map<string, Handler>()
let plugin: WorkerPluginDefinition | null = null
let sessionToken = ''
let sequence = 0
const pendingHostCalls = new Map<string, {
  resolve: (value: unknown) => void
  reject: (reason: Error) => void
}>()

function send(message: SandboxWorkerResponse): void {
  assertSandboxMessageSize(message)
  postToHost(message)
}

function success(requestId: string, result: unknown): void {
  send({
    protocolVersion: SANDBOX_PROTOCOL_VERSION,
    requestId,
    type: 'response',
    ok: true,
    result,
  })
}

function failure(requestId: string, code: string, error: unknown): void {
  const message = (error instanceof Error ? error.message : String(error))
    .slice(0, MAX_SANDBOX_ERROR_LENGTH)
  send({
    protocolVersion: SANDBOX_PROTOCOL_VERSION,
    requestId,
    type: 'response',
    ok: false,
    error: { code, message },
  })
}

function registrationApi(
  pluginId: string,
  capabilities: NevoPluginCapability[],
  contributions: NevoSandboxContribution[],
): WorkerSetupApi {
  const hostCall = (method: string, args: unknown): Promise<unknown> => {
    const id = `${pluginId}:host:${++sequence}`
    postToHost({
      protocolVersion: SANDBOX_PROTOCOL_VERSION,
      requestId: id,
      sessionToken,
      type: 'hostCall',
      call: { method, args },
    })
    return new Promise((resolve, reject) => {
      pendingHostCalls.set(id, { resolve, reject })
    })
  }
  const register = (
    kind: NevoSandboxContributionKind,
    descriptor: JsonRecord,
    handler?: Handler,
  ): string | undefined => {
    const handlerId = handler ? `${pluginId}:h${++sequence}` : undefined
    if (handlerId && handler) handlers.set(handlerId, handler)
    contributions.push({
      kind,
      id: String(descriptor.id ?? ''),
      ...(handlerId ? { handlerId } : {}),
      descriptor,
    })
    return handlerId
  }
  const requiredHandler = (kind: NevoSandboxContributionKind) =>
    (descriptor: JsonRecord, handler: Handler) => register(kind, descriptor, handler) as string
  const optionalHandler = (kind: NevoSandboxContributionKind) =>
    (descriptor: JsonRecord, handler?: Handler) => register(kind, descriptor, handler)
  const schedule = (handler: Handler, delayMs: number, repeat: boolean) => {
    const handlerId = `${pluginId}:h${++sequence}`
    handlers.set(handlerId, handler)
    return hostCall('runtime.schedule', { handlerId, delayMs, repeat })
  }

  return Object.freeze({
    pluginId,
    capabilities: Object.freeze(new Set(capabilities)),
    register,
    command: requiredHandler('command'),
    keymap: requiredHandler('keymap'),
    slashItem: requiredHandler('slashItem'),
    toolbarAction: requiredHandler('toolbarAction'),
    schemaNode: (descriptor: JsonRecord) => { register('schemaNode', descriptor) },
    schemaMark: (descriptor: JsonRecord) => { register('schemaMark', descriptor) },
    blockType: optionalHandler('blockType'),
    serializer: requiredHandler('serializer'),
    importer: requiredHandler('importer'),
    workspaceView: optionalHandler('workspaceView'),
    sidebarItem: optionalHandler('sidebarItem'),
    modal: optionalHandler('modal'),
    onEditorEvent: requiredHandler('editorEvent'),
    scheduling: Object.freeze({
      setTimeout: (handler: Handler, delayMs: number) => schedule(handler, delayMs, false),
      setInterval: (handler: Handler, intervalMs: number) => schedule(handler, intervalMs, true),
      clear: (scheduleId: string) => hostCall('runtime.schedule.clear', { scheduleId }),
    }),
    storage: Object.freeze({
      workspace: Object.freeze({
        get: (key: string) => hostCall('storage.workspace.get', { key }),
        set: (key: string, value: unknown) => hostCall('storage.workspace.set', { key, value }),
        delete: (key: string) => hostCall('storage.workspace.delete', { key }),
      }),
      local: Object.freeze({
        get: (key: string) => hostCall('storage.local.get', { key }),
        set: (key: string, value: unknown) => hostCall('storage.local.set', { key, value }),
        delete: (key: string) => hostCall('storage.local.delete', { key }),
      }),
    }),
    settings: Object.freeze({
      get: (key: string) => hostCall('settings.get', { key }),
      set: (key: string, value: unknown) => hostCall('settings.set', { key, value }),
    }),
    secrets: Object.freeze({
      get: (key: string) => hostCall('secrets.get', { key }),
    }),
    assets: Object.freeze({
      write: (dataBase64: string) => hostCall('assets.write', { dataBase64 }),
      read: (assetId: string) => hostCall('assets.read', { assetId }),
      delete: (assetId: string) => hostCall('assets.delete', { assetId }),
      url: (assetId: string) => hostCall('assets.url', { assetId }),
      // High-level upload: small payloads take the single-shot path; larger ones
      // are streamed in <=512 KiB base64 chunks (sliced on 4-char boundaries so
      // each chunk decodes independently) and aborted on any failure.
      upload: async (dataBase64: string) => {
        // 655360 base64 chars decode to exactly 480 KiB, under the chunk ceiling.
        const chunkChars = 655360
        if (dataBase64.length <= chunkChars) {
          return hostCall('assets.write', { dataBase64 })
        }
        const uploadId = (await hostCall('assets.beginUpload', {})) as string
        try {
          for (let offset = 0; offset < dataBase64.length; offset += chunkChars) {
            await hostCall('assets.appendChunk', {
              uploadId,
              chunkBase64: dataBase64.slice(offset, offset + chunkChars),
            })
          }
          return await hostCall('assets.finishUpload', { uploadId })
        } catch (error) {
          await hostCall('assets.abortUpload', { uploadId }).catch(() => {})
          throw error
        }
      },
    }),
    network: Object.freeze({
      fetch: (request: unknown) => hostCall('network.fetch', request),
    }),
    workspace: Object.freeze({
      invoke: (commandId: string, args: unknown = {}) =>
        hostCall('workspace.invoke', { commandId, args }),
    }),
  })
}

async function initialize(message: Extract<SandboxWorkerRequest, { type: 'initialize' }>): Promise<void> {
  sessionToken = message.sessionToken
  lockDownSandboxGlobals(workerScope)
  const pluginModule = await import(/* @vite-ignore */ message.pluginUrl) as {
    default?: WorkerPluginDefinition
    plugin?: WorkerPluginDefinition
  }
  plugin = pluginModule.plugin ?? pluginModule.default ?? null
  if (!plugin || typeof plugin.setup !== 'function') {
    throw new Error('Sandboxed plugin must export definePlugin({ setup })')
  }
  const contributions: NevoSandboxContribution[] = []
  const returned = await plugin.setup(registrationApi(
    message.pluginId,
    message.capabilities,
    contributions,
  ))
  if (returned) contributions.push(...returned)
  const definition: NevoSandboxPluginDefinition = {
    contributions,
    dataVersion: message.dataVersion,
  }
  success(message.requestId, definition)
}

async function processRequest(message: SandboxWorkerRequest): Promise<void> {
  if (message.protocolVersion !== SANDBOX_PROTOCOL_VERSION) return
  if (message.type === 'ping') {
    // Answered from the message loop itself, so a reply proves the loop is not
    // wedged. Deliberately session-agnostic: it is a pure liveness signal.
    success(message.requestId, 'pong')
    return
  }
  if (message.type === 'initialize') {
    if (plugin) throw new Error('Sandbox worker is already initialized')
    await initialize(message)
    return
  }
  if (!plugin || message.sessionToken !== sessionToken) {
    throw new Error('Invalid sandbox session')
  }
  if (message.type === 'hostResponse') {
    const pending = pendingHostCalls.get(message.requestId)
    if (!pending) return
    pendingHostCalls.delete(message.requestId)
    if (message.ok) pending.resolve(message.result)
    else {
      const error = new Error(message.error?.message ?? 'Host broker call failed')
      error.name = message.error?.code ?? 'HOST_CALL_FAILED'
      pending.reject(error)
    }
    return
  }
  if (message.type === 'cancel') {
    pending.get(message.targetRequestId)?.abort()
    success(message.requestId, null)
    return
  }
  if (message.type === 'lifecycle') {
    await plugin[message.phase]?.()
    success(message.requestId, null)
    return
  }
  if (message.type === 'migration') {
    if (message.targetDataVersion < message.input.fromDataVersion) {
      throw new Error('Migration target precedes stored dataVersion')
    }
    let current: NevoPluginMigrationResult = {
      dataVersion: message.input.fromDataVersion,
      storage: message.input.storage,
      nodes: message.input.nodes,
    }
    for (
      let dataVersion = message.input.fromDataVersion + 1;
      dataVersion <= message.targetDataVersion;
      dataVersion += 1
    ) {
      const migration = plugin.migrations?.[dataVersion]
      if (!migration) throw new Error(`Missing plugin migration for dataVersion ${dataVersion}`)
      const result = await migration({
        fromDataVersion: current.dataVersion,
        storage: current.storage,
        nodes: current.nodes,
      })
      if (
        !result
        || result.dataVersion !== dataVersion
        || !result.storage
        || typeof result.storage !== 'object'
        || Array.isArray(result.storage)
        || !Array.isArray(result.nodes)
      ) {
        throw new Error(`Plugin migration ${dataVersion} returned an invalid result`)
      }
      current = result
    }
    success(message.requestId, current)
    return
  }
  const handler = handlers.get(message.invocation.handlerId)
  if (!handler) throw new Error(`Unknown sandbox handler: ${message.invocation.handlerId}`)
  const controller = new AbortController()
  pending.set(message.requestId, controller)
  try {
    const result = await handler(message.invocation.input, {
      editor: message.invocation.editor,
      signal: controller.signal,
    })
    success(message.requestId, result ?? null)
  } finally {
    pending.delete(message.requestId)
  }
}

workerScope.addEventListener('message', (event: MessageEvent<SandboxWorkerRequest>) => {
  const message = event.data
  if (!isSandboxWorkerRequest(message)) return
  try {
    assertSandboxMessageSize(message)
  } catch (error) {
    failure(message.requestId, 'MESSAGE_TOO_LARGE', error)
    return
  }
  void processRequest(message).catch(error => failure(message.requestId, 'PLUGIN_ERROR', error))
})
