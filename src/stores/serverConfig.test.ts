import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useServerConfigStore } from './serverConfig'

describe('useServerConfigStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('checkServerHealth', () => {
    it('returns true when the server responds with ok status', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))
      const store = useServerConfigStore()
      const result = await store.checkServerHealth('http://localhost:8080')
      expect(result).toBe(true)
      vi.unstubAllGlobals()
    })

    it('returns false when the server responds with non-ok status', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))
      const store = useServerConfigStore()
      const result = await store.checkServerHealth('http://localhost:8080')
      expect(result).toBe(false)
      vi.unstubAllGlobals()
    })

    it('returns false when fetch rejects (network error)', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')))
      const store = useServerConfigStore()
      const result = await store.checkServerHealth('http://localhost:8080')
      expect(result).toBe(false)
      vi.unstubAllGlobals()
    })

    it('returns false when fetch is aborted (timeout)', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('The operation was aborted', 'AbortError')))
      const store = useServerConfigStore()
      const result = await store.checkServerHealth('http://localhost:8080')
      expect(result).toBe(false)
      vi.unstubAllGlobals()
    })

    it('normalizes trailing slash in the url', async () => {
      const mockFetch = vi.fn().mockResolvedValue({ ok: true })
      vi.stubGlobal('fetch', mockFetch)
      const store = useServerConfigStore()
      await store.checkServerHealth('http://localhost:8080/')
      expect(mockFetch).toHaveBeenCalledWith('http://localhost:8080/health', expect.any(Object))
      vi.unstubAllGlobals()
    })
  })
})
