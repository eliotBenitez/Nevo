import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter } from 'vue-router'
import OnboardingView from './OnboardingView.vue'
import WelcomeView from './components/WelcomeView.vue'
import { useWorkspaceStore } from '../../stores/workspace'
import en from '../../locales/en.json'

let wrapper: VueWrapper | null = null

function mountOnboarding() {
  const pinia = createPinia()
  setActivePinia(pinia)
  const store = useWorkspaceStore()
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: OnboardingView },
      { path: '/workspace', component: { template: '<div>Workspace</div>' } },
    ],
  })
  const pushSpy = vi.spyOn(router, 'push')

  wrapper = mount(OnboardingView, {
    global: {
      plugins: [
        pinia,
        router,
        createI18n({ legacy: false, locale: 'en', messages: { en } }),
      ],
    },
  })
  return { wrapper, store, router, pushSpy }
}

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
})

describe('OnboardingView', () => {
  it('navigates to /workspace when WelcomeView emits done', async () => {
    const { wrapper, pushSpy } = mountOnboarding()
    const welcome = wrapper.findComponent(WelcomeView)
    expect(welcome.exists()).toBe(true)

    welcome.vm.$emit('done')
    await flushPromises()

    expect(pushSpy).toHaveBeenCalledWith('/workspace')
  })

  it('opens a recent workspace from WelcomeView and navigates to /workspace', async () => {
    const { wrapper, store, pushSpy } = mountOnboarding()
    store.recents = [
      {
        id: 'ws-1',
        name: 'Field notes',
        glyph: 'F',
        gradient: 'var(--accent)',
        path: '/home/u/field-notes',
        lastOpened: '2026-09-22T10:00:00Z',
        pageCount: 128,
      },
    ]
    vi.spyOn(store, 'openWorkspace').mockResolvedValue(undefined as never)
    await wrapper.vm.$nextTick()

    const row = wrapper.get('.recent-row')
    await row.trigger('click')
    await flushPromises()

    expect(store.openWorkspace).toHaveBeenCalledWith('/home/u/field-notes')
    expect(pushSpy).toHaveBeenCalledWith('/workspace')
  })

  it('returns to welcome from the desktop create screen via the titlebar back button', async () => {
    const { wrapper } = mountOnboarding()
    const welcome = wrapper.findComponent(WelcomeView)

    welcome.vm.$emit('create')
    await flushPromises()

    expect(wrapper.findComponent(WelcomeView).exists()).toBe(false)
    await wrapper.get('.onboard-back-btn').trigger('click')
    await flushPromises()

    expect(wrapper.findComponent(WelcomeView).exists()).toBe(true)
  })
})
