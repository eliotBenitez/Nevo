import { describe, expect, it } from 'vitest'
import type { NevoPluginRuntime } from '../../types/editor-plugin'
import { isPluginAvailableOnRuntime } from './runtimeAvailability'

describe('isPluginAvailableOnRuntime', () => {
  it('treats a manifest without runtimes as available everywhere', () => {
    expect(isPluginAvailableOnRuntime({}, 'desktop')).toBe(true)
    expect(isPluginAvailableOnRuntime({}, 'android')).toBe(true)
    expect(isPluginAvailableOnRuntime({}, 'web')).toBe(true)
  })

  it('limits a manifest to the listed runtimes', () => {
    const desktopOnly: { runtimes: NevoPluginRuntime[] } = { runtimes: ['desktop'] }
    expect(isPluginAvailableOnRuntime(desktopOnly, 'desktop')).toBe(true)
    expect(isPluginAvailableOnRuntime(desktopOnly, 'android')).toBe(false)
    expect(isPluginAvailableOnRuntime(desktopOnly, 'ios')).toBe(false)
    expect(isPluginAvailableOnRuntime(desktopOnly, 'web')).toBe(false)
  })
})
