import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import type { CloudUser, AuthTokens } from '../types/cloud'
import { useServerConfigStore } from './serverConfig'
import { secureStore, SECRET_PRIVATE_KEY, SECRET_REFRESH_TOKEN } from '../tauri/secureStore'
import { generateKeypair, derivePublicKey } from '../core/crypto/keypair'
import { isJwtExpiring } from '../utils/jwt'
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
      try {
        await ensureKeypair()
      } catch (error) {
        // The account is fine, but this device cannot act for it. Staying
        // signed out is the honest state: a session that cannot unwrap any DEK
        // would present every cloud storage as broken. Startup continues, so
        // local workspaces are unaffected.
        await appLogger.error({
          source: 'frontend.auth',
          event: 'init',
          message: 'Cloud session not restored: device key unusable',
          error,
        })
        status.value = 'anonymous'
        return
      }
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

  /**
   * Return an access token that is valid for at least the next minute,
   * refreshing first when the current one is expired or about to be.
   *
   * REST calls can recover from an expired token by retrying after a 401, but a
   * WebSocket cannot: the relay authorizes the token once, at upgrade, and a
   * rejected upgrade surfaces to the browser as an opaque close. Every WS
   * connect (and reconnect) must therefore fetch its token through here rather
   * than reuse one captured when the session was opened.
   */
  async function getValidAccessToken(): Promise<string | null> {
    if (isJwtExpiring(accessToken.value) && refreshToken.value) await refresh()
    return accessToken.value
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
   *
   * Generating a keypair is only ever safe on an account that has none: every
   * storage DEK is wrapped to the registered public key, so replacing it locks
   * the user out of all their encrypted data with no way back. This function
   * therefore refuses to generate whenever the account might already own an
   * identity — including when the profile could not be loaded and we simply do
   * not know. Failing loudly is recoverable; a silent replacement is not.
   */
  async function ensureKeypair(): Promise<void> {
    const storedPriv = await secureStore.get(SECRET_PRIVATE_KEY)
    // `loadMe` swallows its errors, so a null user means "unknown", not "new".
    const profileKnown = user.value !== null
    const registered = user.value?.publicKey ?? null

    if (storedPriv) {
      const derived = await derivePublicKey(storedPriv)
      if (registered && derived !== registered) {
        await appLogger.error({
          source: 'frontend.auth',
          event: 'ensure_keypair',
          message: 'Device key does not match the key registered for this account',
        })
        throw new Error('device-key-mismatch')
      }
      privateKey.value = storedPriv
      publicKey.value = derived
      // Re-register an existing device key the server has not seen (a relay
      // that lost the row, or an upload that failed on an earlier run).
      if (profileKnown && !registered) await uploadPublicKey(derived)
      return
    }

    if (!profileKnown) {
      await appLogger.error({
        source: 'frontend.auth',
        event: 'ensure_keypair',
        message: 'No device key and no profile: refusing to generate one blindly',
      })
      throw new Error('profile-unavailable')
    }
    if (registered) {
      await appLogger.error({
        source: 'frontend.auth',
        event: 'ensure_keypair',
        message: 'This account has a registered key that is missing on this device',
      })
      throw new Error('device-key-missing')
    }

    const pair = await generateKeypair()
    privateKey.value = pair.privateKey
    publicKey.value = pair.publicKey
    await secureStore.set(SECRET_PRIVATE_KEY, pair.privateKey)
    await uploadPublicKey(pair.publicKey)
  }

  async function uploadPublicKey(key: string): Promise<void> {
    await fetch(`${serverCfg.serverUrl}/api/v1/keys/public`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken.value}` },
      body: JSON.stringify({ publicKey: key }),
    })
    if (user.value) user.value.publicKey = key
  }

  return {
    accessToken, refreshToken, user, status, publicKey, privateKey,
    isAuthenticated, sessionServerUrl,
    init, login, logout, refresh, getValidAccessToken, ensureKeypair,
  }
})
