import type {
  NevoPluginCapability,
  NevoPluginMigrationInput,
  NevoSandboxEditorSnapshot,
  NevoSandboxPluginDefinition,
  NevoTransactionIntent,
} from '../../types/editor-plugin'

export const SANDBOX_PROTOCOL_VERSION = '2.0' as const
export const MAX_SANDBOX_MESSAGE_BYTES = 1024 * 1024
export const MAX_SANDBOX_VALUE_BYTES = 256 * 1024
export const MAX_SANDBOX_ERROR_LENGTH = 2_000
export const SANDBOX_HANDLER_TIMEOUT_MS = 5_000
export const SANDBOX_LIFECYCLE_TIMEOUT_MS = 10_000
// Liveness probe budget: a Worker whose event loop is free answers a ping well
// within this window; exceeding it means the loop is wedged and must be killed.
export const SANDBOX_PING_TIMEOUT_MS = 750

interface SandboxRequestBase {
  protocolVersion: typeof SANDBOX_PROTOCOL_VERSION
  requestId: string
  sessionToken: string
}

export interface SandboxInitializeMessage extends SandboxRequestBase {
  type: 'initialize'
  pluginUrl: string
  pluginId: string
  capabilities: NevoPluginCapability[]
  dataVersion: number
}

export interface SandboxInvokeMessage extends SandboxRequestBase {
  type: 'invoke'
  invocation: {
    handlerId: string
    input: unknown
    editor?: NevoSandboxEditorSnapshot
  }
}

export interface SandboxLifecycleMessage extends SandboxRequestBase {
  type: 'lifecycle'
  phase: 'activate' | 'deactivate' | 'dispose'
}

export interface SandboxPingMessage extends SandboxRequestBase {
  type: 'ping'
}

export interface SandboxMigrationMessage extends SandboxRequestBase {
  type: 'migration'
  targetDataVersion: number
  input: NevoPluginMigrationInput
}

export interface SandboxCancelMessage extends SandboxRequestBase {
  type: 'cancel'
  targetRequestId: string
}

export interface SandboxHostResponseMessage extends SandboxRequestBase {
  type: 'hostResponse'
  ok: boolean
  result?: unknown
  error?: {
    code: string
    message: string
  }
}

export type SandboxWorkerRequest =
  | SandboxInitializeMessage
  | SandboxInvokeMessage
  | SandboxLifecycleMessage
  | SandboxPingMessage
  | SandboxMigrationMessage
  | SandboxCancelMessage
  | SandboxHostResponseMessage

interface SandboxResponseBase {
  protocolVersion: typeof SANDBOX_PROTOCOL_VERSION
  requestId: string
  type: 'response'
}

export interface SandboxSuccessMessage extends SandboxResponseBase {
  ok: true
  result: NevoSandboxPluginDefinition | NevoTransactionIntent | unknown
}

export interface SandboxErrorMessage extends SandboxResponseBase {
  ok: false
  error: {
    code: string
    message: string
  }
}

export interface SandboxHostCallMessage {
  protocolVersion: typeof SANDBOX_PROTOCOL_VERSION
  requestId: string
  sessionToken: string
  type: 'hostCall'
  call: {
    method: string
    args: unknown
  }
}

export type SandboxWorkerResponse =
  | SandboxSuccessMessage
  | SandboxErrorMessage
  | SandboxHostCallMessage

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function encodedSandboxBytes(value: unknown): number {
  const serialized = JSON.stringify(value)
  if (typeof serialized !== 'string') throw new Error('Sandbox message is not JSON serializable')
  return new TextEncoder().encode(serialized).byteLength
}

export function assertSandboxMessageSize(value: unknown): void {
  if (encodedSandboxBytes(value) > MAX_SANDBOX_MESSAGE_BYTES) {
    throw new Error(`Sandbox message exceeds ${MAX_SANDBOX_MESSAGE_BYTES} bytes`)
  }
}

export function isSandboxWorkerResponse(value: unknown): value is SandboxWorkerResponse {
  if (!isObject(value)) return false
  if (
    value.protocolVersion !== SANDBOX_PROTOCOL_VERSION
    || typeof value.requestId !== 'string'
  ) return false
  if (value.type === 'hostCall') {
    return typeof value.sessionToken === 'string'
      && isObject(value.call)
      && typeof value.call.method === 'string'
      && 'args' in value.call
  }
  if (value.type !== 'response' || typeof value.ok !== 'boolean') return false
  if (value.ok) return 'result' in value
  return isObject(value.error)
    && typeof value.error.code === 'string'
    && typeof value.error.message === 'string'
}

export function isSandboxWorkerRequest(value: unknown): value is SandboxWorkerRequest {
  if (!isObject(value)) return false
  if (
    value.protocolVersion !== SANDBOX_PROTOCOL_VERSION
    || typeof value.requestId !== 'string'
    || typeof value.sessionToken !== 'string'
    || typeof value.type !== 'string'
  ) return false
  if (value.type === 'initialize') {
    return typeof value.pluginUrl === 'string'
      && typeof value.pluginId === 'string'
      && Array.isArray(value.capabilities)
      && Number.isSafeInteger(value.dataVersion)
  }
  if (value.type === 'invoke') {
    return isObject(value.invocation)
      && typeof value.invocation.handlerId === 'string'
      && 'input' in value.invocation
  }
  if (value.type === 'lifecycle') {
    return value.phase === 'activate' || value.phase === 'deactivate' || value.phase === 'dispose'
  }
  if (value.type === 'ping') return true
  if (value.type === 'migration') {
    return Number.isSafeInteger(value.targetDataVersion)
      && isObject(value.input)
      && Number.isSafeInteger(value.input.fromDataVersion)
      && isObject(value.input.storage)
      && Array.isArray(value.input.nodes)
  }
  if (value.type === 'cancel') return typeof value.targetRequestId === 'string'
  if (value.type === 'hostResponse') {
    return typeof value.ok === 'boolean'
      && (value.ok || (isObject(value.error) && typeof value.error.message === 'string'))
  }
  return false
}
