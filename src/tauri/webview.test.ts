import { afterEach, describe, expect, it } from 'vitest'
import { applyWebviewZoom } from './webview'

describe('applyWebviewZoom', () => {
  afterEach(() => {
    delete document.documentElement.dataset.platform
  })

  it('falls back to false when the platform is the plain web build', async () => {
    document.documentElement.dataset.platform = 'web'

    await expect(applyWebviewZoom(1.1)).resolves.toBe(false)
  })

  it('falls back to false when no platform has been stamped yet', async () => {
    delete document.documentElement.dataset.platform

    await expect(applyWebviewZoom(1.1)).resolves.toBe(false)
  })
})
