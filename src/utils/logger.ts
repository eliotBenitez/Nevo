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
  traceId?: string
  workspacePath?: string | null
  workspaceId?: string | null
  error?: unknown
  payload?: unknown
  diagnosticsEnabled?: boolean
}

export interface FrontendLogEntry {
  level: LogLevel
  source: string
  event: string
  message: string
  traceId?: string
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

function fallbackTraceId() {
  return Math.random().toString(16).slice(2, 10).padEnd(8, '0')
}

function formatTimestamp(date: Date) {
  const pad = (value: number, length = 2) => value.toString().padStart(length, '0')

  return [
    date.getFullYear(),
    '-',
    pad(date.getMonth() + 1),
    '-',
    pad(date.getDate()),
    ' ',
    pad(date.getHours()),
    ':',
    pad(date.getMinutes()),
    ':',
    pad(date.getSeconds()),
    '.',
    pad(date.getMilliseconds(), 3),
  ].join('')
}

function sanitizeLogText(value: string) {
  return value.replace(/\r/g, '\\r').replace(/\n/g, '\\n')
}

function buildEntry(level: LogLevel, options: LoggerOptions): FrontendLogEntry {
  return {
    level,
    source: options.source,
    event: options.event,
    message: options.message,
    traceId: options.traceId,
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

function contextJson(entry: FrontendLogEntry) {
  const context: Record<string, unknown> = {}

  if (entry.event) context.event = entry.event
  if (entry.workspacePath) context.workspacePath = entry.workspacePath
  if (entry.workspaceId) context.workspaceId = entry.workspaceId
  if (entry.error) context.error = entry.error
  if (entry.payload != null) context.payload = entry.payload

  if (Object.keys(context).length === 0) return ''

  return JSON.stringify(context)
}

function formatConsoleLine(level: LogLevel, entry: FrontendLogEntry) {
  const traceId = entry.traceId ?? fallbackTraceId()

  const base = [
    `[${formatTimestamp(new Date())}]`,
    `[${level.toUpperCase()}]`,
    '[pid:browser/thread:main]',
    `[${sanitizeLogText(entry.source)}]`,
    `[${sanitizeLogText(traceId)}]`,
    `- ${sanitizeLogText(entry.message)}`,
  ].join(' ')
  const context = contextJson(entry)

  return context ? `${base} ${context}` : base
}

function writeConsole(level: LogLevel, options: LoggerOptions) {
  const entry = buildEntry(level, options)
  consoleMethod(level)(formatConsoleLine(level, entry))
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
