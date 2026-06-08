import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { openUrl } from '@tauri-apps/plugin-opener'
import type { CloudUser, AuthTokens } from '../types/cloud'
import { useServerConfigStore } from './serverConfig'
import { secureStore, SECRET_PRIVATE_KEY, SECRET_REFRESH_TOKEN } from '../tauri/secureStore'
import { generateKeypair } from '../core/crypto/keypair'

export type AuthStatus = 'anonymous' | 'authenticating' | 'authenticated'
export type OAuthProvider = 'google' | 'github'

export const useAuthStore = defineStore('auth', () => {
  const accessToken = ref<string | null>(null)
  const refreshToken = ref<string | null>(null)
  const user = ref<CloudUser | null>(null)
  const status = ref<AuthStatus>('anonymous')

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
      status.value = 'authenticated'
    }
  }

  /** Begin an OAuth login: open the system browser and await the loopback. */
  async function login(provider: OAuthProvider): Promise<void> {
    status.value = 'authenticating'
    const port = await invoke<number>('start_oauth_loopback')

    const done = new Promise<AuthTokens>((resolve) => {
      const unlistenPromise = listen<AuthTokens>('oauth-callback', (event) => {
        void unlistenPromise.then((un) => un())
        resolve(event.payload)
      })
    })

    await openUrl(`${serverCfg.serverUrl}/api/v1/auth/${provider}/start?port=${port}`)

    const tokens = await done
    await applyTokens(tokens)
    await loadMe()
    await ensureKeypair()
    status.value = 'authenticated'
  }

  /** Exchange the refresh token for a new access+refresh pair. */
  async function refresh(): Promise<boolean> {
    if (!refreshToken.value) return false
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
    } catch {
      return false
    }
  }

  async function logout(): Promise<void> {
    if (refreshToken.value) {
      try {
        await fetch(`${serverCfg.serverUrl}/api/v1/auth/logout`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh: refreshToken.value }),
        })
      } catch { /* best effort */ }
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
    await secureStore.delete(SECRET_REFRESH_TOKEN)
  }

  async function loadMe(): Promise<void> {
    const res = await fetch(`${serverCfg.serverUrl}/api/v1/me`, {
      headers: { Authorization: `Bearer ${accessToken.value}` },
    })
    if (res.ok) user.value = await res.json() as CloudUser
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
    isAuthenticated,
    init, login, logout, refresh, ensureKeypair,
  }
})
