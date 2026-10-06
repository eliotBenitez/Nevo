import { afterEach, describe, expect, it, vi } from 'vitest'
import { syncAndroidSystemBars } from './androidSystemBars'

type BridgeWindow = { nevoSystemBars?: unknown }

describe('syncAndroidSystemBars', () => {
  afterEach(() => {
    delete (window as unknown as BridgeWindow).nevoSystemBars
  })

  it('posts the resolved theme to the Android bridge', () => {
    const postMessage = vi.fn()
    ;(window as unknown as BridgeWindow).nevoSystemBars = { postMessage }

    syncAndroidSystemBars('dark')
    syncAndroidSystemBars('light')

    expect(postMessage).toHaveBeenNthCalledWith(1, 'dark')
    expect(postMessage).toHaveBeenNthCalledWith(2, 'light')
  })

  it('is a no-op without the bridge', () => {
    expect(() => syncAndroidSystemBars('dark')).not.toThrow()
  })

  it('swallows bridge failures', () => {
    ;(window as unknown as BridgeWindow).nevoSystemBars = {
      postMessage: () => { throw new Error('detached') },
    }
    expect(() => syncAndroidSystemBars('light')).not.toThrow()
  })
})
