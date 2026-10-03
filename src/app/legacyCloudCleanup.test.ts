import { beforeEach, describe, expect, it, vi } from 'vitest'

const invoke = vi.hoisted(() => vi.fn())

vi.mock('@tauri-apps/api/core', () => ({ invoke }))

import { runLegacyCloudCleanup } from './legacyCloudCleanup'

const FLAG = 'nevo.legacyCloudCleanupDone'

describe('runLegacyCloudCleanup', () => {
  beforeEach(() => {
    invoke.mockReset()
    invoke.mockResolvedValue(null)
    localStorage.clear()
  })

  it('clears legacy cloud state and marks itself done', async () => {
    localStorage.setItem('nevo.serverUrl', 'https://example.com')
    const deleteDatabase = vi.fn()
    vi.stubGlobal('indexedDB', { deleteDatabase })

    await runLegacyCloudCleanup()

    expect(localStorage.getItem('nevo.serverUrl')).toBeNull()
    expect(deleteDatabase).toHaveBeenCalledWith('nevo-cloud-offline')
    expect(invoke).toHaveBeenCalledWith('secure_store_delete', { key: 'auth.refreshToken' })
    expect(invoke).toHaveBeenCalledWith('secure_store_delete', { key: 'e2e.privateKey' })
    expect(localStorage.getItem(FLAG)).toBe('true')

    vi.unstubAllGlobals()
  })

  it('runs only once', async () => {
    localStorage.setItem(FLAG, 'true')

    await runLegacyCloudCleanup()

    expect(invoke).not.toHaveBeenCalled()
  })

  it('never throws when a step fails', async () => {
    invoke.mockRejectedValue(new Error('no secure store'))

    await expect(runLegacyCloudCleanup()).resolves.toBeUndefined()
  })
})
