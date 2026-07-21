import type {
  NevoEditorPluginManifest,
  NevoPluginCapability,
  NevoPluginMigrationInput,
  NevoPluginMigrationResult,
  NevoSandboxContribution,
  NevoSandboxEditorSnapshot,
  NevoSandboxPluginDefinition,
} from '../../types/editor-plugin'
import {
  MAX_SANDBOX_MESSAGE_BYTES,
  SANDBOX_HANDLER_TIMEOUT_MS,
  SANDBOX_LIFECYCLE_TIMEOUT_MS,
  SANDBOX_PING_TIMEOUT_MS,
  SANDBOX_PROTOCOL_VERSION,
  assertSandboxMessageSize,
  isSandboxWorkerResponse,
  type SandboxWorkerRequest,
  type SandboxWorkerResponse,
} from './sandboxProtocol'

const LOAD_TIMEOUT_MS = 10_000
const MAX_REGISTRATIONS = 200
const MAX_ID_LENGTH = 160
const MAX_TITLE_LENGTH = 200
const MAX_JSON_DEPTH = 24
const MAX_ARRAY_ITEMS = 2_000
const MAX_OBJECT_KEYS = 300

export type SandboxWorkerFactory = () => Worker

interface PendingRequest {
  resolve: (value: unknown) => void
  reject: (reason: Error) => void
  timeout: ReturnType<typeof setTimeout>
}

type SandboxRequestPayload =
  | { type: 'initialize'; pluginUrl: string; pluginId: string; capabilities: NevoPluginCapability[]; dataVersion: number }
  | { type: 'invoke'; invocation: { handlerId: string; input: unknown; editor?: NevoSandboxEditorSnapshot } }
  | { type: 'lifecycle'; phase: 'activate' | 'deactivate' | 'dispose' }
  | { type: 'ping' }
  | { type: 'migration'; targetDataVersion: number; input: NevoPluginMigrationInput }
  | { type: 'cancel'; targetRequestId: string }
  | { type: 'hostResponse'; ok: boolean; result?: unknown; error?: { code: string; message: string } }

export type SandboxHostBroker = (method: string, args: unknown) => Promise<unknown>

const CONTRIBUTION_CAPABILITIES: Readonly<Record<NevoSandboxContribution['kind'], NevoPluginCapability>> = {
  command: 'editor.write',
  keymap: 'editor.write',
  slashItem: 'editor.write',
  toolbarAction: 'editor.write',
  schemaNode: 'editor.schema',
  schemaMark: 'editor.schema',
  blockType: 'editor.schema',
  popover: 'ui.contributions',
  decoration: 'editor.read',
  serializer: 'editor.read',
  importer: 'editor.write',
  workspaceView: 'ui.iframe',
  sidebarItem: 'ui.contributions',
  modal: 'ui.iframe',
  editorEvent: 'runtime.events',
}

const HANDLER_REQUIRED = new Set<NevoSandboxContribution['kind']>([
  'command',
  'keymap',
  'slashItem',
  'toolbarAction',
  'serializer',
  'importer',
  'editorEvent',
])

export function manifestCapabilities(manifest: NevoEditorPluginManifest): NevoPluginCapability[] {
  if (manifest.executionMode === 'sandboxed-worker') {
    return [...new Set(manifest.capabilities ?? [])]
  }
  return [...new Set([
    ...manifest.editorCapabilities,
    ...(manifest.uiCapabilities ?? []),
    ...(manifest.workspaceCapabilities ?? []),
  ])]
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

export function assertJsonValue(value: unknown, field: string, seen = new Set<object>(), depth = 0): void {
  if (depth > MAX_JSON_DEPTH) throw new Error(`${field} exceeds maximum nesting depth`)
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return
  if (typeof value === 'number' && Number.isFinite(value)) return
  if (typeof value !== 'object') throw new Error(`${field} must contain only JSON values`)
  if (seen.has(value)) throw new Error(`${field} must not contain cycles`)
  seen.add(value)
  if (Array.isArray(value)) {
    if (value.length > MAX_ARRAY_ITEMS) throw new Error(`${field} contains too many items`)
    value.forEach((item, index) => assertJsonValue(item, `${field}[${index}]`, seen, depth + 1))
    seen.delete(value)
    return
  }
  if (!isPlainObject(value)) throw new Error(`${field} must contain only plain JSON objects`)
  const entries = Object.entries(value)
  if (entries.length > MAX_OBJECT_KEYS) throw new Error(`${field} contains too many keys`)
  for (const [key, item] of entries) {
    if (key === '__proto__' || key === 'prototype' || key === 'constructor') {
      throw new Error(`${field} contains forbidden key ${key}`)
    }
    assertJsonValue(item, `${field}.${key}`, seen, depth + 1)
  }
  seen.delete(value)
}

function stringField(
  object: Record<string, unknown>,
  key: string,
  field: string,
  max = MAX_TITLE_LENGTH,
  required = false,
): string | undefined {
  const value = object[key]
  if (value === undefined && !required) return undefined
  if (typeof value !== 'string' || (required && value.length === 0) || value.length > max) {
    throw new Error(`${field}.${key} must be a string up to ${max} characters`)
  }
  return value
}

function validateContribution(
  manifest: NevoEditorPluginManifest,
  value: unknown,
  index: number,
): NevoSandboxContribution {
  const field = `contributions[${index}]`
  if (!isPlainObject(value)) throw new Error(`${field} must be an object`)
  const kind = value.kind
  if (typeof kind !== 'string' || !(kind in CONTRIBUTION_CAPABILITIES)) {
    throw new Error(`${field}.kind is unsupported`)
  }
  const typedKind = kind as NevoSandboxContribution['kind']
  const capability = CONTRIBUTION_CAPABILITIES[typedKind]
  if (!manifestCapabilities(manifest).includes(capability)) {
    throw new Error(`Plugin ${manifest.id} requires capability ${capability} for ${kind}`)
  }
  const id = typeof value.id === 'string' ? value.id : ''
  if (
    !id.startsWith(`${manifest.id}.`)
    || id.length > MAX_ID_LENGTH
    || !/^[A-Za-z0-9._-]+$/.test(id)
  ) {
    throw new Error(`${field}.id must be namespaced under ${manifest.id}`)
  }
  const handlerId = value.handlerId
  if (
    handlerId !== undefined
    && (typeof handlerId !== 'string' || handlerId.length > MAX_ID_LENGTH)
  ) {
    throw new Error(`${field}.handlerId is invalid`)
  }
  if (HANDLER_REQUIRED.has(typedKind) && typeof handlerId !== 'string') {
    throw new Error(`${field}.handlerId is required for ${kind}`)
  }
  if (!isPlainObject(value.descriptor)) throw new Error(`${field}.descriptor must be an object`)
  assertJsonValue(value.descriptor, `${field}.descriptor`)
  if (value.descriptor.id !== id) throw new Error(`${field}.descriptor.id must match id`)
  stringField(value.descriptor, 'title', `${field}.descriptor`)

  if (typedKind === 'schemaNode' || typedKind === 'schemaMark' || typedKind === 'blockType') {
    stringField(value.descriptor, 'name', `${field}.descriptor`, 80, true)
    if (value.descriptor.toDOM !== undefined || value.descriptor.parseDOM !== undefined) {
      throw new Error(`${field}.descriptor cannot contain raw DOM handlers`)
    }
  }
  if (typedKind === 'blockType' && value.descriptor.render !== undefined) {
    if (value.descriptor.render !== 'svg') {
      throw new Error(`${field}.descriptor.render must be "svg"`)
    }
    if (typeof handlerId !== 'string') {
      throw new Error(`${field}.descriptor.render requires a handler`)
    }
    const blockSchema = value.descriptor.schema
    if (isPlainObject(blockSchema) && 'content' in blockSchema) {
      throw new Error(`${field}.descriptor.render blocks must be content-less`)
    }
  }
  if (typedKind === 'blockType' && value.descriptor.frame !== undefined) {
    if (value.descriptor.render !== undefined) {
      throw new Error(`${field}.descriptor cannot use both render and frame`)
    }
    if (!manifestCapabilities(manifest).includes('ui.blockFrame')) {
      throw new Error(`Plugin ${manifest.id} requires capability ui.blockFrame for a block frame`)
    }
    const frame = value.descriptor.frame
    if (!isPlainObject(frame)) throw new Error(`${field}.descriptor.frame must be an object`)
    const source = stringField(frame, 'source', `${field}.descriptor.frame`, 240, true)
    if (
      source
      && (
        /^(?:https?:|data:|javascript:|\/|\\)/i.test(source)
        || source.includes('..')
        || source.includes('\\')
      )
    ) {
      throw new Error(`${field}.descriptor.frame.source must be a plugin-relative iframe entry`)
    }
    const blockSchema = value.descriptor.schema
    if (isPlainObject(blockSchema) && 'content' in blockSchema) {
      throw new Error(`${field}.descriptor.frame blocks must be content-less`)
    }
  }
  if (typedKind === 'workspaceView' || typedKind === 'modal') {
    const source = stringField(value.descriptor, 'source', `${field}.descriptor`, 240, true)
    if (
      source
      && (
        /^(?:https?:|data:|javascript:|\/|\\)/i.test(source)
        || source.includes('..')
        || source.includes('\\')
      )
    ) {
      throw new Error(`${field}.descriptor.source must be a plugin-relative iframe entry`)
    }
  }
  if (typedKind === 'workspaceView' || typedKind === 'sidebarItem') {
    const route = stringField(value.descriptor, 'route', `${field}.descriptor`, 240)
    const prefix = `/workspace/plugin/${manifest.id}`
    if (
      route
      && (
        (route !== prefix && !route.startsWith(`${prefix}/`))
        || route.includes('?')
        || route.includes('#')
        || route.includes('\\')
        || Array.from(route).some((character) => {
          const code = character.charCodeAt(0)
          return code <= 31 || code === 127
        })
      )
    ) {
      throw new Error(`${field}.descriptor.route must stay inside ${prefix}`)
    }
  }
  return {
    kind: typedKind,
    id,
    ...(typeof handlerId === 'string' ? { handlerId } : {}),
    descriptor: value.descriptor,
  }
}

export function validateSandboxDefinition(
  manifest: NevoEditorPluginManifest,
  value: unknown,
): NevoSandboxPluginDefinition {
  if (!isPlainObject(value)) throw new Error('Sandbox definition must be an object')
  if (!Array.isArray(value.contributions) || value.contributions.length > MAX_REGISTRATIONS) {
    throw new Error(`Sandbox definition must contain at most ${MAX_REGISTRATIONS} contributions`)
  }
  const contributions = value.contributions.map((item, index) =>
    validateContribution(manifest, item, index),
  )
  const ids = new Set<string>()
  for (const contribution of contributions) {
    if (ids.has(contribution.id)) {
      throw new Error(`Duplicate sandbox registration: ${contribution.id}`)
    }
    ids.add(contribution.id)
  }
  const dataVersion = value.dataVersion
  if (
    dataVersion !== undefined
    && (!Number.isSafeInteger(dataVersion) || (dataVersion as number) < 0)
  ) {
    throw new Error('Sandbox dataVersion must be a non-negative integer')
  }
  const definition = {
    contributions,
    ...(typeof dataVersion === 'number' ? { dataVersion } : {}),
  }
  if (new TextEncoder().encode(JSON.stringify(definition)).byteLength > MAX_SANDBOX_MESSAGE_BYTES) {
    throw new Error(`Sandbox definition exceeds ${MAX_SANDBOX_MESSAGE_BYTES} bytes`)
  }
  return definition
}

function requestId(): string {
  return globalThis.crypto?.randomUUID?.()
    ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

function sessionToken(): string {
  if (!globalThis.crypto?.getRandomValues) {
    throw new Error('Secure randomness is unavailable for plugin session')
  }
  const values = new Uint8Array(32)
  globalThis.crypto.getRandomValues(values)
  return Array.from(values, value => value.toString(16).padStart(2, '0')).join('')
}

export class SandboxedPluginSession {
  private worker: Worker | null = null
  private token = ''
  private readonly pending = new Map<string, PendingRequest>()
  private restartCount = 0
  private initialized = false
  private active = false
  private disposed = false
  private quarantined = false

  constructor(
    private readonly manifest: NevoEditorPluginManifest,
    private readonly pluginUrl: string,
    private readonly workerFactory?: SandboxWorkerFactory,
    private readonly hostBroker?: SandboxHostBroker,
  ) {}

  get isQuarantined(): boolean {
    return this.quarantined
  }

  async initialize(): Promise<NevoSandboxPluginDefinition> {
    const result = await this.startWorker()
    this.initialized = true
    return validateSandboxDefinition(this.manifest, result)
  }

  async activate(): Promise<void> {
    await this.lifecycle('activate')
    this.active = true
  }

  async deactivate(): Promise<void> {
    if (!this.initialized || this.quarantined) return
    await this.lifecycle('deactivate')
    this.active = false
  }

  async dispose(): Promise<void> {
    if (this.disposed) return
    try {
      if (this.initialized && !this.quarantined) await this.lifecycle('dispose')
    } finally {
      this.disposed = true
      this.terminate()
    }
  }

  async invoke(
    handlerId: string,
    input: unknown,
    editor?: NevoSandboxEditorSnapshot,
  ): Promise<unknown> {
    if (this.quarantined) throw new Error(`Plugin ${this.manifest.id} is quarantined for this session`)
    const payload: SandboxRequestPayload = {
      type: 'invoke',
      invocation: { handlerId, input, ...(editor ? { editor } : {}) },
    }
    try {
      return await this.request(payload, SANDBOX_HANDLER_TIMEOUT_MS)
    } catch (error) {
      const fatal = await this.isFatalInvokeError(error)
      if (!fatal || this.restartCount >= 1) {
        if (fatal) this.quarantined = true
        throw error
      }
      this.restartCount += 1
      try {
        await this.restart()
        return await this.request(payload, SANDBOX_HANDLER_TIMEOUT_MS)
      } catch (retryError) {
        if (await this.isFatalInvokeError(retryError)) this.quarantined = true
        throw retryError
      }
    }
  }

  async migrate(
    input: NevoPluginMigrationInput,
    targetDataVersion: number,
  ): Promise<NevoPluginMigrationResult> {
    if (!this.initialized || this.quarantined) {
      throw new Error(`Plugin ${this.manifest.id} is unavailable for migration`)
    }
    const result = await this.request({
      type: 'migration',
      targetDataVersion,
      input,
    }, SANDBOX_LIFECYCLE_TIMEOUT_MS)
    if (!isPlainObject(result)) throw new Error('Plugin migration result must be an object')
    if (
      result.dataVersion !== targetDataVersion
      || !isPlainObject(result.storage)
      || !Array.isArray(result.nodes)
      || !result.nodes.every(isPlainObject)
    ) {
      throw new Error('Plugin migration result has an invalid shape or dataVersion')
    }
    assertJsonValue(result.storage, 'migration.storage')
    assertJsonValue(result.nodes, 'migration.nodes')
    return result as unknown as NevoPluginMigrationResult
  }

  private async lifecycle(phase: 'activate' | 'deactivate' | 'dispose'): Promise<void> {
    await this.request({ type: 'lifecycle', phase }, SANDBOX_LIFECYCLE_TIMEOUT_MS)
  }

  private createWorker(): Worker {
    return this.workerFactory?.() ?? new Worker(new URL('./sandboxWorker.ts', import.meta.url), {
      type: 'module',
      name: `nevo-plugin-${this.manifest.id}`,
    })
  }

  private async startWorker(): Promise<unknown> {
    this.token = sessionToken()
    const worker = this.createWorker()
    this.worker = worker
    worker.addEventListener('message', this.onMessage)
    worker.addEventListener('error', this.onError)
    worker.addEventListener('messageerror', this.onMessageError)
    return this.request({
      type: 'initialize',
      pluginUrl: this.pluginUrl,
      pluginId: this.manifest.id,
      capabilities: manifestCapabilities(this.manifest),
      dataVersion: this.manifest.dataVersion ?? 1,
    }, LOAD_TIMEOUT_MS)
  }

  private async restart(): Promise<void> {
    this.terminate()
    const result = await this.startWorker()
    validateSandboxDefinition(this.manifest, result)
    if (this.active) await this.lifecycle('activate')
  }

  private request(
    message: SandboxRequestPayload,
    timeoutMs: number,
  ): Promise<unknown> {
    if (!this.worker) return Promise.reject(new Error('Sandbox worker is not running'))
    const id = requestId()
    const request = {
      ...message,
      protocolVersion: SANDBOX_PROTOCOL_VERSION,
      requestId: id,
      sessionToken: this.token,
    } as SandboxWorkerRequest
    assertSandboxMessageSize(request)
    return new Promise((resolve, reject) => {
      const timeout = globalThis.setTimeout(() => {
        this.pending.delete(id)
        if (message.type === 'invoke' && this.worker) {
          const cancel: SandboxWorkerRequest = {
            protocolVersion: SANDBOX_PROTOCOL_VERSION,
            requestId: requestId(),
            sessionToken: this.token,
            type: 'cancel',
            targetRequestId: id,
          }
          this.worker.postMessage(cancel)
        }
        const timeoutError = new Error(`Sandbox request timed out after ${timeoutMs}ms`)
        timeoutError.name = 'SANDBOX_TIMEOUT'
        reject(timeoutError)
      }, timeoutMs)
      this.pending.set(id, { resolve, reject, timeout })
      this.worker?.postMessage(request)
    })
  }

  private readonly onMessage = (event: MessageEvent<SandboxWorkerResponse>) => {
    let message: SandboxWorkerResponse
    try {
      assertSandboxMessageSize(event.data)
      if (!isSandboxWorkerResponse(event.data)) throw new Error('Malformed sandbox response')
      message = event.data
    } catch (error) {
      this.failAll(error instanceof Error ? error : new Error(String(error)))
      return
    }
    if (message.type === 'hostCall') {
      if (message.sessionToken !== this.token) {
        this.postHostResponse(message.requestId, false, undefined, {
          code: 'INVALID_SESSION',
          message: 'Invalid sandbox session',
        })
        return
      }
      if (!this.hostBroker) {
        this.postHostResponse(message.requestId, false, undefined, {
          code: 'HOST_API_UNAVAILABLE',
          message: 'Plugin host API is unavailable',
        })
        return
      }
      void this.hostBroker(message.call.method, message.call.args).then(
        result => this.postHostResponse(message.requestId, true, result),
        error => this.postHostResponse(message.requestId, false, undefined, {
          code: error instanceof Error ? error.name : 'HOST_CALL_FAILED',
          message: error instanceof Error ? error.message : String(error),
        }),
      )
      return
    }
    const pending = this.pending.get(message.requestId)
    if (!pending) return
    this.pending.delete(message.requestId)
    clearTimeout(pending.timeout)
    if (message.ok) {
      pending.resolve(message.result)
    } else {
      const error = new Error(message.error.message)
      error.name = message.error.code
      pending.reject(error)
    }
  }

  private postHostResponse(
    id: string,
    ok: boolean,
    result?: unknown,
    error?: { code: string; message: string },
  ): void {
    if (!this.worker) return
    const message: SandboxWorkerRequest = {
      protocolVersion: SANDBOX_PROTOCOL_VERSION,
      requestId: id,
      sessionToken: this.token,
      type: 'hostResponse',
      ok,
      ...(result === undefined ? {} : { result }),
      ...(error ? { error } : {}),
    }
    assertSandboxMessageSize(message)
    this.worker.postMessage(message)
  }

  private readonly onError = (event: ErrorEvent) => {
    const error = new Error(event.message || 'Sandbox worker crashed')
    error.name = 'WORKER_CRASH'
    this.failAll(error)
  }

  private readonly onMessageError = () => {
    const error = new Error('Sandbox worker returned an unreadable message')
    error.name = 'WORKER_CRASH'
    this.failAll(error)
  }

  private failAll(error: Error): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout)
      pending.reject(error)
    }
    this.pending.clear()
  }

  private isCrashError(error: unknown): boolean {
    return error instanceof Error && (
      error.name === 'WORKER_CRASH'
      || error.message === 'Sandbox worker is not running'
    )
  }

  private isTimeoutError(error: unknown): boolean {
    return error instanceof Error && error.name === 'SANDBOX_TIMEOUT'
  }

  /**
   * A crash is always fatal. A timeout is fatal only when the Worker's event loop
   * is wedged (e.g. an infinite synchronous loop): a cooperative cancel can never
   * reach it, so the Worker is hard-terminated and treated as crashed. A timeout on
   * a Worker that still answers a ping means the handler is merely slow or awaiting a
   * host call, so the rejected invoke stands without tearing down the session.
   */
  private async isFatalInvokeError(error: unknown): Promise<boolean> {
    if (this.isCrashError(error)) return true
    if (!this.isTimeoutError(error)) return false
    if (await this.isWorkerResponsive()) return false
    this.terminate()
    return true
  }

  private async isWorkerResponsive(): Promise<boolean> {
    if (!this.worker) return false
    try {
      await this.request({ type: 'ping' }, SANDBOX_PING_TIMEOUT_MS)
      return true
    } catch {
      return false
    }
  }

  private terminate(): void {
    const worker = this.worker
    this.worker = null
    if (!worker) return
    worker.removeEventListener('message', this.onMessage)
    worker.removeEventListener('error', this.onError)
    worker.removeEventListener('messageerror', this.onMessageError)
    worker.terminate()
    const error = new Error('Sandbox worker terminated')
    error.name = 'WORKER_CRASH'
    this.failAll(error)
  }
}

export async function loadSandboxedPluginDefinition(
  manifest: NevoEditorPluginManifest,
  pluginUrl: string,
  workerFactory?: SandboxWorkerFactory,
  hostBroker?: SandboxHostBroker,
): Promise<{ definition: NevoSandboxPluginDefinition; session: SandboxedPluginSession }> {
  const session = new SandboxedPluginSession(manifest, pluginUrl, workerFactory, hostBroker)
  const definition = await session.initialize()
  return { definition, session }
}
