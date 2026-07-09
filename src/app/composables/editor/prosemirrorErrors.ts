import { appLogger } from '../../../utils/logger'

export function isProseMirrorTransformError(error: unknown): error is Error {
  return error instanceof Error && error.name === 'TransformError'
}

export interface GuardedCommandLogContext {
  event: string
  message: string
  workspacePath?: string | null
  payload?: Record<string, unknown>
}

/**
 * Runs `fn`, swallowing (and logging via `appLogger.warn`) ProseMirror transform
 * errors — non-transform errors are rethrown. Returns `true` if `fn` completed
 * without a transform error, `false` if a transform error was caught and logged.
 */
export function runGuardedCommand(fn: () => void, context: GuardedCommandLogContext): boolean {
  try {
    fn()
    return true
  } catch (error) {
    if (!isProseMirrorTransformError(error)) throw error
    void appLogger.warn({
      source: 'frontend.editor',
      event: context.event,
      message: context.message,
      workspacePath: context.workspacePath,
      error,
      ...(context.payload ? { payload: context.payload } : {}),
    })
    return false
  }
}
