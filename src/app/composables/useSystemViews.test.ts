import { describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { ref } from 'vue'
import { useSystemViews } from './useSystemViews'

function createTestRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/workspace', component: { template: '<div>Workspace</div>' } },
      { path: '/workspace/more', component: { template: '<div>More</div>' } },
      { path: '/workspace/note/:noteId', component: { template: '<div>Note</div>' } },
      { path: '/workspace/settings/:section?', component: { template: '<div>Settings</div>' } },
      { path: '/workspace/archive', component: { template: '<div>Archive</div>' } },
    ],
  })
}

describe('useSystemViews', () => {
  it('opens and toggles settings and archive', async () => {
    const router = createTestRouter()
    await router.push('/workspace')
    const closeSidebar = vi.fn()
    const views = useSystemViews({
      router,
      route: router.currentRoute,
      closeMobileSidebar: closeSidebar,
    })

    expect(views.isSettingsView.value).toBe(false)
    expect(views.isArchiveView.value).toBe(false)

    // Open settings
    await views.openSettings('appearance')
    expect(router.currentRoute.value.path).toBe('/workspace/settings/appearance')
    expect(views.isSettingsView.value).toBe(true)
    expect(views.settingsSection.value).toBe('appearance')
    expect(closeSidebar).toHaveBeenCalled()

    // Toggle settings while in settings leaves system view
    await views.toggleSettings()
    expect(router.currentRoute.value.path).toBe('/workspace')
    expect(views.isSettingsView.value).toBe(false)

    // Open archive
    await views.openArchive()
    expect(router.currentRoute.value.path).toBe('/workspace/archive')
    expect(views.isArchiveView.value).toBe(true)

    // Toggle archive while in archive leaves system view
    await views.toggleArchive()
    expect(router.currentRoute.value.path).toBe('/workspace')
    expect(views.isArchiveView.value).toBe(false)
  })

  it('leaves system view back to originating note route when history state back matches', async () => {
    const router = createTestRouter()
    await router.push('/workspace/note/note-123')
    await router.push({
      path: '/workspace/settings/editor',
      state: { back: '/workspace/note/note-123' },
    })

    const backSpy = vi.spyOn(router, 'back')

    const views = useSystemViews({
      router,
      route: router.currentRoute,
    })

    // Leave settings
    await views.leaveSystemView()
    expect(backSpy).toHaveBeenCalled()
  })

  it('leaves to /workspace (or /workspace/more on phone) when entering directly with no back state', async () => {
    const router = createTestRouter()
    await router.push('/workspace/settings')

    // Desktop
    const desktopViews = useSystemViews({
      router,
      route: router.currentRoute,
      isPhone: ref(false),
    })
    await desktopViews.leaveSystemView()
    expect(router.currentRoute.value.path).toBe('/workspace')

    // Phone
    await router.push('/workspace/archive')
    const phoneViews = useSystemViews({
      router,
      route: router.currentRoute,
      isPhone: ref(true),
    })
    await phoneViews.leaveSystemView()
    expect(router.currentRoute.value.path).toBe('/workspace/more')
  })

  it('switching sections uses replace so a single leave exits settings', async () => {
    const router = createTestRouter()
    await router.push('/workspace/note/my-note')

    const views = useSystemViews({
      router,
      route: router.currentRoute,
    })

    const pushSpy = vi.spyOn(router, 'push')
    const replaceSpy = vi.spyOn(router, 'replace')

    await views.openSettings('general')
    expect(pushSpy).toHaveBeenCalledWith('/workspace/settings/general')

    // Switch section while in settings
    await views.openSettings('editor')
    expect(replaceSpy).toHaveBeenCalledWith('/workspace/settings/editor')
  })

  it('opening archive from settings (or vice versa) uses replace', async () => {
    const router = createTestRouter()
    await router.push('/workspace/settings')

    const views = useSystemViews({
      router,
      route: router.currentRoute,
    })

    const replaceSpy = vi.spyOn(router, 'replace')
    await views.openArchive()
    expect(replaceSpy).toHaveBeenCalledWith('/workspace/archive')

    await views.openSettings('files')
    expect(replaceSpy).toHaveBeenCalledWith('/workspace/settings/files')
  })

  it('stores and consumes pending reveal title', async () => {
    const router = createTestRouter()
    const views = useSystemViews({
      router,
      route: router.currentRoute,
    })

    await views.openSettings('general', 'Theme setting')
    expect(views.consumePendingReveal()).toBe('Theme setting')
    expect(views.consumePendingReveal()).toBeNull()
  })

  it('redirects to /workspace/settings on unknown section or phone-excluded section on phone', async () => {
    const router = createTestRouter()
    const replaceSpy = vi.spyOn(router, 'replace')

    // Desktop unknown section
    await router.push('/workspace/settings/totally-unknown')
    useSystemViews({
      router,
      route: router.currentRoute,
      isPhone: ref(false),
    })
    expect(replaceSpy).toHaveBeenCalledWith('/workspace/settings')

    // Phone excluded section (mcp)
    replaceSpy.mockClear()
    await router.push('/workspace/settings/mcp')
    useSystemViews({
      router,
      route: router.currentRoute,
      isPhone: ref(true),
    })
    expect(replaceSpy).toHaveBeenCalledWith('/workspace/settings')
  })
})
