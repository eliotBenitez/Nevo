import { useAuthStore } from '../../stores/auth'
import { useServerConfigStore } from '../../stores/serverConfig'

// Authenticated REST client for the relay. Injects the bearer access token and,
// on a 401, transparently refreshes once and retries. Auth endpoints
// (login/refresh) use raw fetch in the auth store to avoid recursion.

export interface ApiError extends Error {
  status: number
}

function apiError(status: number, message: string): ApiError {
  const err = new Error(message) as ApiError
  err.status = status
  return err
}

export function useApiClient() {
  // Resolve stores synchronously (Pinia must be active here). Call useApiClient()
  // from a store setup or component setup — not lazily inside an async callback.
  const server = useServerConfigStore()
  const auth = useAuthStore()

  async function raw(method: string, path: string, body?: unknown, retry = true): Promise<Response> {
    const headers: Record<string, string> = {}
    if (auth.accessToken) headers.Authorization = `Bearer ${auth.accessToken}`
    if (body !== undefined) headers['Content-Type'] = 'application/json'

    const res = await fetch(`${server.serverUrl}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })

    if (res.status === 401 && retry && auth.refreshToken) {
      const ok = await auth.refresh()
      if (ok) return raw(method, path, body, false)
    }
    return res
  }

  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await raw(method, path, body)
    if (!res.ok) {
      let message = res.statusText
      try {
        const data = await res.json()
        if (data?.error) message = data.error
      } catch { /* non-JSON error body */ }
      throw apiError(res.status, message)
    }
    if (res.status === 204) return undefined as T
    return res.json() as Promise<T>
  }

  // Binary variants (assets, encrypted snapshot blobs) with the same
  // auth + 401-refresh handling.
  async function rawBinary(method: string, path: string, blob?: Uint8Array, contentType?: string, retry = true): Promise<Response> {
    const headers: Record<string, string> = {}
    if (auth.accessToken) headers.Authorization = `Bearer ${auth.accessToken}`
    if (blob) headers['Content-Type'] = contentType ?? 'application/octet-stream'
    const res = await fetch(`${server.serverUrl}${path}`, {
      method,
      headers,
      body: blob ? blob.slice().buffer : undefined,
    })
    if (res.status === 401 && retry && auth.refreshToken) {
      const ok = await auth.refresh()
      if (ok) return rawBinary(method, path, blob, contentType, false)
    }
    return res
  }

  async function getBinary(path: string): Promise<Uint8Array> {
    const res = await rawBinary('GET', path)
    if (!res.ok) throw apiError(res.status, res.statusText)
    return new Uint8Array(await res.arrayBuffer())
  }

  async function getBinaryTyped(path: string): Promise<{ bytes: Uint8Array; contentType: string }> {
    const res = await rawBinary('GET', path)
    if (!res.ok) throw apiError(res.status, res.statusText)
    return {
      bytes: new Uint8Array(await res.arrayBuffer()),
      contentType: res.headers.get('Content-Type') ?? 'application/octet-stream',
    }
  }

  async function postBinary<T>(path: string, blob: Uint8Array, contentType?: string): Promise<T> {
    const res = await rawBinary('POST', path, blob, contentType)
    if (!res.ok) throw apiError(res.status, res.statusText)
    return res.json() as Promise<T>
  }

  return {
    get: <T>(path: string) => request<T>('GET', path),
    post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
    patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
    put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
    del: <T>(path: string) => request<T>('DELETE', path),
    getBinary,
    getBinaryTyped,
    postBinary,
  }
}
