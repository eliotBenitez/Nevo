import { describe, expect, it } from 'vitest'
import { resolveRuntimeCapabilities } from './runtime'

describe('resolveRuntimeCapabilities', () => {
  it('keeps desktop capabilities when metadata reports desktop runtime', () => {
    const runtime = resolveRuntimeCapabilities({
      version: '0.1.0',
      engine: 'Tauri 2',
      runtime: 'desktop',
      platform: 'linux',
      appDataDir: '/tmp/app',
      configPath: '/tmp/app/config.json',
      logsPath: '/tmp/app/logs',
      supportsWindowControls: true,
      supportsGlobalShortcuts: true,
      supportsRevealInFileManager: true,
      supportsWindowDragRegions: true,
    })

    expect(runtime.isDesktopRuntime).toBe(true)
    expect(runtime.isMobileRuntime).toBe(false)
    expect(runtime.supportsWindowControls).toBe(true)
  })

  it('falls back to mobile semantics for android runtimes', () => {
    const runtime = resolveRuntimeCapabilities({
      version: '0.1.0',
      engine: 'Tauri 2',
      runtime: 'android',
      platform: 'android',
      appDataDir: '/tmp/app',
      configPath: '/tmp/app/config.json',
      logsPath: '/tmp/app/logs',
      supportsWindowControls: false,
      supportsGlobalShortcuts: false,
      supportsRevealInFileManager: false,
      supportsWindowDragRegions: false,
    })

    expect(runtime.isDesktopRuntime).toBe(false)
    expect(runtime.isMobileRuntime).toBe(true)
    expect(runtime.supportsRevealInFileManager).toBe(false)
  })
})
