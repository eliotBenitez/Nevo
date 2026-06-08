import { invoke } from '@tauri-apps/api/core'

export type LogLevel = 'error' | 'warn' | 'info' | 'debug'

export interface LoggerErrorPayload {
  kind?: string
  message: string
  details?: string
}

export interface LoggerOptions {
  source: string
  event: string
  message: string
  workspacePath?: string | null
  workspaceId?: string | null
  error?: unknown
  payload?: unknown
  diagnosticsEnabled?: boolean
}

interface FrontendLogEntry {
  level: LogLevel
  source: string
  event: string
  message: string
  workspacePath?: string
  workspaceId?: string
  error?: LoggerErrorPayload
  payload?: unknown
  diagnosticsEnabled?: boolean
}

function isTauriRuntime() {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

function normalizeError(error: unknown): LoggerErrorPayload | undefined {
  if (!error) return undefined

  if (error instanceof Error) {
    return {
      kind: error.name,
      message: error.message,
      details: error.stack,
    }
  }

  if (typeof error === 'string') {
    return { message: error }
  }

  try {
    return {
      kind: typeof error,
      message: JSON.stringify(error),
    }
  } catch {
    return {
      kind: typeof error,
      message: String(error),
    }
  }
}

function normalizePayload(payload: unknown): unknown {
  if (payload == null) return undefined

  try {
    return JSON.parse(JSON.stringify(payload))
  } catch {
    return { value: String(payload) }
  }
}

function buildEntry(level: LogLevel, options: LoggerOptions): FrontendLogEntry {
  return {
    level,
    source: options.source,
    event: options.event,
    message: options.message,
    workspacePath: options.workspacePath ?? undefined,
    workspaceId: options.workspaceId ?? undefined,
    error: normalizeError(options.error),
    payload: normalizePayload(options.payload),
    diagnosticsEnabled: options.diagnosticsEnabled,
  }
}

function consoleMethod(level: LogLevel) {
  if (level === 'error') return console.error
  if (level === 'warn') return console.warn
  if (level === 'info') return console.info
  return console.debug
}

function writeConsole(level: LogLevel, options: LoggerOptions) {
  const entry = buildEntry(level, options)
  consoleMethod(level)(`[${entry.source}] ${entry.event}: ${entry.message}`, {
    workspacePath: entry.workspacePath,
    workspaceId: entry.workspaceId,
    error: entry.error,
    payload: entry.payload,
  })
}

async function dispatch(level: LogLevel, options: LoggerOptions) {
  if (!isTauriRuntime()) {
    writeConsole(level, options)
    return
  }

  try {
    await invoke('log_frontend_event', { entry: buildEntry(level, options) })
  } catch {
    writeConsole(level, options)
  }
}

export const appLogger = {
  error: (options: LoggerOptions) => dispatch('error', options),
  warn: (options: LoggerOptions) => dispatch('warn', options),
  info: (options: LoggerOptions) => dispatch('info', options),
  debug: (options: LoggerOptions) => dispatch('debug', options),
}
