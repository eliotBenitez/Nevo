import { beforeEach, describe, expect, it, vi } from 'vitest'
import { appLogger } from './logger'

const invokeMock = vi.hoisted(() => vi.fn())

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock,
}))

describe('appLogger', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__
  })

  it('falls back to console when tauri runtime is unavailable', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await appLogger.warn({
      source: 'frontend.search',
      event: 'search_workspace_blocks',
      message: 'Search failed',
      workspacePath: '/workspace',
      payload: { queryLength: 5 },
    })

    expect(invokeMock).not.toHaveBeenCalled()
    expect(warnSpy).toHaveBeenCalledWith(
      '[frontend.search] search_workspace_blocks: Search failed',
      expect.objectContaining({
        workspacePath: '/workspace',
        payload: { queryLength: 5 },
      }),
    )
  })

  it('sends structured logs to tauri on desktop runtime', async () => {
    ;(window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {}
    invokeMock.mockResolvedValue(undefined)

    await appLogger.error({
      source: 'frontend.workspace',
      event: 'open_workspace',
      message: 'Failed to open workspace',
      workspacePath: '/workspace',
      error: new Error('missing manifest'),
    })

    expect(invokeMock).toHaveBeenCalledWith('log_frontend_event', {
      entry: expect.objectContaining({
        level: 'error',
        source: 'frontend.workspace',
        event: 'open_workspace',
        message: 'Failed to open workspace',
        workspacePath: '/workspace',
        error: expect.objectContaining({
          kind: 'Error',
          message: 'missing manifest',
        }),
      }),
    })
  })
})
