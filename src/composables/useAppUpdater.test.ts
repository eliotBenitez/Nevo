import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const checkUpdate = vi.fn()

vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => true }))
vi.mock('@tauri-apps/plugin-updater', () => ({ check: checkUpdate }))

async function setup(runtime: 'desktop' | 'android') {
  vi.resetModules()
  setActivePinia(createPinia())

  const { useWorkspaceStore } = await import('../stores/workspace')
  const store = useWorkspaceStore()
  store.appMetadata = {
    version: '0.1.0',
    engine: 'Tauri 2',
    runtime,
    platform: runtime === 'android' ? 'android' : 'linux',
    appDataDir: '/tmp/app',
    configPath: '/tmp/app/config.json',
    logsPath: '/tmp/app/logs',
    supportsWindowControls: runtime === 'desktop',
    supportsGlobalShortcuts: runtime === 'desktop',
    supportsRevealInFileManager: runtime === 'desktop',
    supportsWindowDragRegions: runtime === 'desktop',
  }

  const { useAppUpdater } = await import('./useAppUpdater')
  return useAppUpdater()
}

describe('useAppUpdater.check', () => {
  beforeEach(() => {
    checkUpdate.mockReset()
  })

  it('skips the updater plugin on mobile runtimes', async () => {
    const updater = await setup('android')

    await expect(updater.check({ silent: false })).resolves.toBe(false)

    expect(checkUpdate).not.toHaveBeenCalled()
    expect(updater.status.value).toBe('idle')
    expect(updater.dialogOpen.value).toBe(false)
  })

  it('queries the updater plugin on desktop runtimes', async () => {
    checkUpdate.mockResolvedValue(null)
    const updater = await setup('desktop')

    await expect(updater.check({ silent: true })).resolves.toBe(false)

    expect(checkUpdate).toHaveBeenCalledOnce()
    expect(updater.status.value).toBe('upToDate')
  })
})
