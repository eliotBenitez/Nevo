import { beforeEach, describe, expect, it, vi } from 'vitest'

const convertFileSrc = vi.fn()
vi.mock('@tauri-apps/api/core', () => ({ convertFileSrc }))

describe('workspaceAssetUrl', () => {
  beforeEach(() => {
    convertFileSrc.mockReset()
    convertFileSrc.mockImplementation((path: string, protocol: string) => `${protocol}://${path}`)
  })

  it('uses the confined workspace protocol for assets and plugins', async () => {
    const { workspaceAssetUrl } = await import('./workspaceAssetUrl')
    expect(workspaceAssetUrl('.nevo/assets/image.png')).toBe('nevoasset://.nevo/assets/image.png')
    expect(workspaceAssetUrl('.nevo/plugins/example/index.js')).toBe('nevoasset://.nevo/plugins/example/index.js')
    expect(convertFileSrc).toHaveBeenCalledWith('.nevo/assets/image.png', 'nevoasset')
  })

  it('rejects paths outside the protocol roots', async () => {
    const { workspaceAssetUrl } = await import('./workspaceAssetUrl')
    expect(() => workspaceAssetUrl('/etc/passwd')).toThrow('Unsafe workspace asset path')
    expect(() => workspaceAssetUrl('.nevo/assets/../../secret')).toThrow('Unsafe workspace asset path')
    expect(() => workspaceAssetUrl('.nevo\\assets\\image.png')).toThrow('Unsafe workspace asset path')
  })
})
