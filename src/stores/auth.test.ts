import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn(async () => () => {}) }))
vi.mock('../tauri/commands', () => ({ systemCommands: { openExternalUrl: vi.fn() } }))
vi.mock('../core/crypto/keypair', () => ({ generateKeypair: vi.fn(), derivePublicKey: vi.fn() }))
vi.mock('../tauri/secureStore', () => ({
  SECRET_PRIVATE_KEY: 'e2e.privateKey',
  SECRET_REFRESH_TOKEN: 'auth.refreshToken',
  secureStore: { get: vi.fn(async () => null), set: vi.fn(async () => {}), delete: vi.fn(async () => {}) },
}))
vi.mock('../utils/logger', () => ({ appLogger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }))

import { useAuthStore } from './auth'
import { generateKeypair, derivePublicKey } from '../core/crypto/keypair'
import { secureStore } from '../tauri/secureStore'

function jwt(expiresInSeconds: number): string {
  const encode = (value: object) =>
    btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  const exp = Math.floor(Date.now() / 1000) + expiresInSeconds
  return `${encode({ alg: 'HS256' })}.${encode({ exp, uid: 'u1' })}.sig`
}

describe('auth store getValidAccessToken', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    setActivePinia(createPinia())
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => { vi.unstubAllGlobals() })

  it('returns the current token untouched while it is still valid', async () => {
    const auth = useAuthStore()
    const token = jwt(15 * 60)
    auth.accessToken = token
    auth.refreshToken = 'refresh-1'

    expect(await auth.getValidAccessToken()).toBe(token)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('refreshes before returning when the token is expired', async () => {
    const auth = useAuthStore()
    auth.accessToken = jwt(-60)
    auth.refreshToken = 'refresh-1'

    const fresh = jwt(15 * 60)
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ access: fresh, refresh: 'refresh-2' }),
    })

    expect(await auth.getValidAccessToken()).toBe(fresh)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toContain('/api/v1/auth/refresh')
  })

  it('refreshes a token that is within the skew window of expiring', async () => {
    const auth = useAuthStore()
    auth.accessToken = jwt(30)
    auth.refreshToken = 'refresh-1'

    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ access: jwt(15 * 60), refresh: 'refresh-2' }),
    })

    await auth.getValidAccessToken()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('does not attempt a refresh without a refresh token', async () => {
    const auth = useAuthStore()
    auth.accessToken = jwt(-60)
    auth.refreshToken = null

    expect(await auth.getValidAccessToken()).toBe(auth.accessToken)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns null after a failed refresh instead of a token the relay will reject', async () => {
    const auth = useAuthStore()
    auth.accessToken = jwt(-60)
    auth.refreshToken = 'revoked'
    fetchMock.mockResolvedValue({ ok: false, status: 401 })

    expect(await auth.getValidAccessToken()).toBeNull()
  })
})

// Every storage DEK is wrapped to the registered public key, so replacing that
// key destroys access to all of the account's encrypted data. These tests pin
// down the one case where generating a keypair is allowed.
describe('auth store ensureKeypair', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  const storeMock = secureStore as unknown as { get: ReturnType<typeof vi.fn>; set: ReturnType<typeof vi.fn> }
  const generateMock = generateKeypair as unknown as ReturnType<typeof vi.fn>
  const deriveMock = derivePublicKey as unknown as ReturnType<typeof vi.fn>

  function keyUploads() {
    return fetchMock.mock.calls.filter((call) => String(call[0]).includes('/api/v1/keys/public'))
  }

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    storeMock.get.mockResolvedValue(null)
    fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({}) }))
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => { vi.unstubAllGlobals() })

  it('accepts a device key that matches the registered one', async () => {
    const auth = useAuthStore()
    auth.user = { id: 'u1', email: 'a@b.c', displayName: 'A', avatarUrl: '', publicKey: 'PUB' } as never
    storeMock.get.mockResolvedValue('PRIV')
    deriveMock.mockResolvedValue('PUB')

    await auth.ensureKeypair()

    expect(auth.privateKey).toBe('PRIV')
    expect(auth.publicKey).toBe('PUB')
    expect(generateMock).not.toHaveBeenCalled()
    expect(keyUploads()).toHaveLength(0)
  })

  it('refuses a device key that does not match the registered one', async () => {
    const auth = useAuthStore()
    auth.user = { id: 'u1', email: 'a@b.c', displayName: 'A', avatarUrl: '', publicKey: 'PUB' } as never
    storeMock.get.mockResolvedValue('OTHER-PRIV')
    deriveMock.mockResolvedValue('OTHER-PUB')

    await expect(auth.ensureKeypair()).rejects.toThrow('device-key-mismatch')
    expect(generateMock).not.toHaveBeenCalled()
    expect(storeMock.set).not.toHaveBeenCalled()
    expect(keyUploads()).toHaveLength(0)
  })

  it('refuses to mint a replacement when the account already has a key', async () => {
    const auth = useAuthStore()
    auth.user = { id: 'u1', email: 'a@b.c', displayName: 'A', avatarUrl: '', publicKey: 'PUB' } as never
    storeMock.get.mockResolvedValue(null)

    await expect(auth.ensureKeypair()).rejects.toThrow('device-key-missing')
    expect(generateMock).not.toHaveBeenCalled()
    expect(storeMock.set).not.toHaveBeenCalled()
    expect(keyUploads()).toHaveLength(0)
  })

  it('refuses to generate while the profile is unknown', async () => {
    const auth = useAuthStore()
    auth.user = null
    storeMock.get.mockResolvedValue(null)

    await expect(auth.ensureKeypair()).rejects.toThrow('profile-unavailable')
    expect(generateMock).not.toHaveBeenCalled()
  })

  it('generates on a first run, when the account owns no key yet', async () => {
    const auth = useAuthStore()
    auth.user = { id: 'u1', email: 'a@b.c', displayName: 'A', avatarUrl: '', publicKey: null } as never
    storeMock.get.mockResolvedValue(null)
    generateMock.mockResolvedValue({ publicKey: 'NEW-PUB', privateKey: 'NEW-PRIV' })

    await auth.ensureKeypair()

    expect(storeMock.set).toHaveBeenCalledWith('e2e.privateKey', 'NEW-PRIV')
    expect(keyUploads()).toHaveLength(1)
    expect(auth.publicKey).toBe('NEW-PUB')
  })

  it('re-registers an existing device key the server has not seen', async () => {
    const auth = useAuthStore()
    auth.user = { id: 'u1', email: 'a@b.c', displayName: 'A', avatarUrl: '', publicKey: null } as never
    storeMock.get.mockResolvedValue('PRIV')
    deriveMock.mockResolvedValue('PUB')

    await auth.ensureKeypair()

    expect(generateMock).not.toHaveBeenCalled()
    expect(keyUploads()).toHaveLength(1)
    expect(auth.privateKey).toBe('PRIV')
  })
})
