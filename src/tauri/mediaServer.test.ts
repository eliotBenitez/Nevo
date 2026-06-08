import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getMediaServerInfoMock } = vi.hoisted(() => ({
  getMediaServerInfoMock: vi.fn(),
}))

vi.mock('./commands', () => ({
  noteCommands: {
    getMediaServerInfo: getMediaServerInfoMock,
  },
}))

describe('mediaServer helpers', () => {
  beforeEach(() => {
    vi.resetModules()
    getMediaServerInfoMock.mockReset()
    getMediaServerInfoMock.mockResolvedValue({ port: 1429, token: 'test-token' })
  })

  it('does not fetch server info on module import', async () => {
    await import('./mediaServer')

    expect(getMediaServerInfoMock).not.toHaveBeenCalled()
  })

  it('fetches server info lazily and caches it', async () => {
    const { ensureMediaServer, youTubeEmbedUrl } = await import('./mediaServer')

    await expect(ensureMediaServer()).resolves.toEqual({ port: 1429, token: 'test-token' })
    await expect(ensureMediaServer()).resolves.toEqual({ port: 1429, token: 'test-token' })

    expect(getMediaServerInfoMock).toHaveBeenCalledTimes(1)
    expect(youTubeEmbedUrl('dQw4w9WgXcQ')).toBe('http://127.0.0.1:1429/youtube?id=dQw4w9WgXcQ')
  })
})
