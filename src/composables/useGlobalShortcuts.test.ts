import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const register = vi.fn()
const unregister = vi.fn()

vi.mock('@tauri-apps/plugin-global-shortcut', () => ({
  register,
  unregister,
}))

async function setupStore(runtime: 'desktop' | 'android', supportsGlobalShortcuts: boolean) {
  vi.resetModules()
  setActivePinia(createPinia())

  const [{ useWorkspaceStore }, { createDefaultWorkspaceSettings }] = await Promise.all([
    import('../stores/workspace'),
    import('../utils/workspace-settings'),
  ])

  const store = useWorkspaceStore()
  store.activeHandle = { kind: 'local', path: '/workspace' }
  store.settings = createDefaultWorkspaceSettings()
  store.appMetadata = {
    version: '0.1.0',
    engine: 'Tauri 2',
    runtime,
    platform: runtime === 'android' ? 'android' : 'linux',
    appDataDir: '/tmp/app',
    configPath: '/tmp/app/config.json',
    logsPath: '/tmp/app/logs',
    supportsWindowControls: runtime === 'desktop',
    supportsGlobalShortcuts,
    supportsRevealInFileManager: runtime === 'desktop',
    supportsWindowDragRegions: runtime === 'desktop',
  }

  return store
}

describe('initGlobalShortcuts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(document, 'hidden', { value: false, configurable: true })
    vi.spyOn(document, 'hasFocus').mockReturnValue(true)
  })

  it('does not register global shortcuts on mobile runtimes', async () => {
    await setupStore('android', false)
    const { initGlobalShortcuts } = await import('./useGlobalShortcuts')

    initGlobalShortcuts()
    await Promise.resolve()
    await Promise.resolve()

    expect(register).not.toHaveBeenCalled()
  })

  it('registers global shortcuts when the runtime supports them', async () => {
    await setupStore('desktop', true)
    const { initGlobalShortcuts } = await import('./useGlobalShortcuts')

    initGlobalShortcuts()
    await vi.waitFor(() => {
      expect(register).toHaveBeenCalled()
    })
  })
})
