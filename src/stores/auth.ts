import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import type { CloudUser, AuthTokens } from '../types/cloud'
import { useServerConfigStore } from './serverConfig'
import { secureStore, SECRET_PRIVATE_KEY, SECRET_REFRESH_TOKEN } from '../tauri/secureStore'
import { generateKeypair } from '../core/crypto/keypair'
import { appLogger } from '../utils/logger'
import { systemCommands } from '../tauri/commands'

const OAUTH_TIMEOUT_MS = 5 * 60_000

export type AuthStatus = 'anonymous' | 'authenticating' | 'authenticated'
export type OAuthProvider = 'google' | 'github'

export const useAuthStore = defineStore('auth', () => {
  const accessToken = ref<string | null>(null)
  const refreshToken = ref<string | null>(null)
  const user = ref<CloudUser | null>(null)
  const status = ref<AuthStatus>('anonymous')
  const sessionServerUrl = ref<string | null>(null)

  // The user's own keys: public (base64 SPKI, also on server) and private
  // (base64 PKCS8, device-only, kept in memory after unlock for DEK unwrapping).
  const publicKey = ref<string | null>(null)
  const privateKey = ref<string | null>(null)

  const isAuthenticated = computed(() => status.value === 'authenticated')

  // Capture dependent stores synchronously while Pinia is active. Resolving
  // them lazily after an `await` can fail with "no active Pinia".
  const serverCfg = useServerConfigStore()

  /** Restore a session from the persisted refresh token, if any. */
  async function init(): Promise<void> {
    const stored = await secureStore.get(SECRET_REFRESH_TOKEN)
    if (!stored) return
    refreshToken.value = stored

    const storedPriv = await secureStore.get(SECRET_PRIVATE_KEY)
    if (storedPriv) privateKey.value = storedPriv

    if (await refresh()) {
      await loadMe()
      await ensureKeypair()
      sessionServerUrl.value = serverCfg.serverUrl
      status.value = 'authenticated'
    }
  }

  /** Begin an OAuth login: open the system browser and await the loopback. */
  async function login(provider: OAuthProvider): Promise<void> {
    status.value = 'authenticating'
    try {
      const port = await invoke<number>('start_oauth_loopback')

      let settled = false
      let resolveDone: (tokens: AuthTokens) => void = () => {}
      let rejectDone: (error: unknown) => void = () => {}
      const done = new Promise<AuthTokens>((resolve, reject) => {
        resolveDone = resolve
        rejectDone = reject
      })

      const unlistenPromise = listen<AuthTokens>('oauth-callback', (event) => {
        if (settled) return
        settled = true
        resolveDone(event.payload)
      })

      const timeoutId = setTimeout(() => {
        if (settled) return
        settled = true
        rejectDone(new Error('OAuth login timed out'))
      }, OAUTH_TIMEOUT_MS)

      // The listener and timeout are cleaned up in `finally` for every exit path
      // (success, timeout, token-exchange error, or `openUrl` failure), so a
      // failed browser launch can't leak them or leave `done` to reject unheard.
      try {
        await systemCommands.openExternalUrl(`${serverCfg.serverUrl}/api/v1/auth/${provider}/start?port=${port}`)

        const tokens = await done
        await applyTokens(tokens)
        await loadMe()
        await ensureKeypair()
        sessionServerUrl.value = serverCfg.serverUrl
        status.value = 'authenticated'
      } finally {
        clearTimeout(timeoutId)
        void unlistenPromise.then((un) => un())
      }
    } catch (error) {
      status.value = 'anonymous'
      throw error
    }
  }

  /** Exchange the refresh token for a new access+refresh pair. */
  async function _doRefresh(): Promise<boolean> {
    try {
      const res = await fetch(`${serverCfg.serverUrl}/api/v1/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh: refreshToken.value }),
      })
      if (!res.ok) {
        await clearSession()
        return false
      }
      await applyTokens(await res.json() as AuthTokens)
      return true
    } catch (error) {
      await appLogger.warn({
        source: 'frontend.auth',
        event: 'refresh',
        message: 'Token refresh failed',
        error,
      })
      return false
    }
  }

  let refreshInFlight: Promise<boolean> | null = null

  /** Exchange the refresh token for a new access+refresh pair (single-flight). */
  async function refresh(): Promise<boolean> {
    if (!refreshToken.value) return false
    if (refreshInFlight) return refreshInFlight
    refreshInFlight = _doRefresh().finally(() => { refreshInFlight = null })
    return refreshInFlight
  }

  async function logout(): Promise<void> {
    if (refreshToken.value) {
      try {
        await fetch(`${serverCfg.serverUrl}/api/v1/auth/logout`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh: refreshToken.value }),
        })
      } catch (error) {
        await appLogger.warn({
          source: 'frontend.auth',
          event: 'logout',
          message: 'Logout request failed',
          error,
        })
        /* best effort */
      }
    }
    await clearSession()
  }

  async function applyTokens(tokens: AuthTokens): Promise<void> {
    accessToken.value = tokens.access
    refreshToken.value = tokens.refresh
    await secureStore.set(SECRET_REFRESH_TOKEN, tokens.refresh)
  }

  async function clearSession(): Promise<void> {
    accessToken.value = null
    refreshToken.value = null
    user.value = null
    status.value = 'anonymous'
    sessionServerUrl.value = null
    await secureStore.delete(SECRET_REFRESH_TOKEN)
  }

  async function loadMe(): Promise<void> {
    try {
      const res = await fetch(`${serverCfg.serverUrl}/api/v1/me`, {
        headers: { Authorization: `Bearer ${accessToken.value}` },
      })
      if (res.ok) {
        user.value = await res.json() as CloudUser
      } else {
        await appLogger.warn({
          source: 'frontend.auth',
          event: 'load_me',
          message: `Failed to load user profile: ${res.status}`,
        })
      }
    } catch (error) {
      await appLogger.warn({
        source: 'frontend.auth',
        event: 'load_me',
        message: 'Failed to load user profile',
        error,
      })
    }
  }

  /**
   * Ensure a device keypair exists and the public key is registered server-side.
   * Generates a new pair on first run (or after key loss) and uploads the public
   * half so other members can wrap storage DEKs for this user.
   */
  async function ensureKeypair(): Promise<void> {
    const storedPriv = await secureStore.get(SECRET_PRIVATE_KEY)
    if (storedPriv && user.value?.publicKey) {
      privateKey.value = storedPriv
      publicKey.value = user.value.publicKey
      return
    }
    const pair = await generateKeypair()
    privateKey.value = pair.privateKey
    publicKey.value = pair.publicKey
    await secureStore.set(SECRET_PRIVATE_KEY, pair.privateKey)
    await fetch(`${serverCfg.serverUrl}/api/v1/keys/public`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken.value}` },
      body: JSON.stringify({ publicKey: pair.publicKey }),
    })
    if (user.value) user.value.publicKey = pair.publicKey
  }

  return {
    accessToken, refreshToken, user, status, publicKey, privateKey,
    isAuthenticated, sessionServerUrl,
    init, login, logout, refresh, ensureKeypair,
  }
})
