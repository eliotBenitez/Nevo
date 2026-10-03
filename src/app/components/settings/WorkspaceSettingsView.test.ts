import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter } from 'vue-router'
import { computed, nextTick, ref } from 'vue'
import WorkspaceSettingsView from './WorkspaceSettingsView.vue'
import { useWorkspaceStore } from '../../../stores/workspace'
import type { SettingsSectionId } from '../../../types/workspace'
import en from '../../../locales/en.json'

const mockIsPhone = ref(false)
vi.mock('../../../composables/useDeviceLayout', () => ({
  useDeviceLayout: () => ({
    isPhone: computed(() => mockIsPhone.value),
  }),
}))

const mockCapturingBindingId = ref<string | null>(null)
vi.mock('../../composables/useSettingsHotkeys', () => ({
  useSettingsHotkeys: () => ({
    capturingBindingId: mockCapturingBindingId,
    hotkeyConflicts: computed(() => new Map()),
    isEditableHotkey: () => true,
    hotkeyLabel: () => '',
  }),
}))

const mockRevealSetting = vi.fn().mockResolvedValue(true)
vi.mock('../../composables/useSettingHighlight', () => ({
  useSettingHighlight: () => ({
    revealSetting: (...args: unknown[]) => mockRevealSetting(...args),
  }),
}))

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: { en },
})

describe('WorkspaceSettingsView', () => {
  let router: ReturnType<typeof createRouter>
  let wrappers: VueWrapper[] = []

  afterEach(() => {
    wrappers.forEach(w => w.unmount())
    wrappers = []
  })

  beforeEach(async () => {
    setActivePinia(createPinia())
    mockIsPhone.value = false
    mockCapturingBindingId.value = null
    mockRevealSetting.mockClear()
    document.body.className = ''

    router = createRouter({
      history: createMemoryHistory(),
      routes: [
        {
          path: '/workspace/settings/:section?',
          name: 'workspace-settings',
          component: { template: '<div>Settings Route</div>' },
        },
        {
          path: '/workspace',
          name: 'workspace',
          component: { template: '<div>Workspace</div>' },
        },
      ],
    })

    await router.push('/workspace/settings')
    await router.isReady()

    const workspaceStore = useWorkspaceStore()
    workspaceStore.loadDiagnostics = vi.fn().mockResolvedValue(undefined)
    workspaceStore.reloadPlugins = vi.fn().mockResolvedValue(undefined)
  })

  function mountView(props: { section?: SettingsSectionId | null } = {}) {
    const wrapper = mount(WorkspaceSettingsView, {
      props,
      global: {
        plugins: [i18n, router],
      },
    })
    wrappers.push(wrapper)
    return wrapper
  }

  it('renders the section from the prop', () => {
    const wrapper = mountView({ section: 'appearance' })

    const activeItem = wrapper.find('.settings-nav-item.is-active')
    expect(activeItem.exists()).toBe(true)
    expect(activeItem.attributes('aria-current')).toBe('page')
    expect(activeItem.text()).toContain(en.settings.sections.appearance)
  })

  it('falls back to general section when prop is unknown', () => {
    const wrapper = mountView({ section: 'non-existent' as unknown as SettingsSectionId })

    const activeItem = wrapper.find('.settings-nav-item.is-active')
    expect(activeItem.exists()).toBe(true)
    expect(activeItem.text()).toContain(en.settings.sections.general)
  })

  it('displays search results, and clicking one updates section and calls revealSetting', async () => {
    const wrapper = mountView({ section: 'general' })

    const searchInput = wrapper.find('.settings-search-input')
    await searchInput.setValue('theme')
    await nextTick()

    // Results card should render
    const resultsCard = wrapper.find('.results-card')
    expect(resultsCard.exists()).toBe(true)

    // Click first search result item
    const firstResult = wrapper.find('.result-row')
    expect(firstResult.exists()).toBe(true)
    await firstResult.trigger('click')

    await nextTick()
    expect(mockRevealSetting).toHaveBeenCalled()
  })

  it('handles Escape key in priority order: cancel capture, ignore select-open, clear search, emit back', async () => {
    const wrapper = mountView({ section: 'general' })

    // 1. When capturing a binding, Escape cancels capture
    mockCapturingBindingId.value = 'app.open-settings'
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(mockCapturingBindingId.value).toBeNull()
    expect(wrapper.emitted('back')).toBeUndefined()

    // 2. When body has nv-select-open, Escape is ignored
    document.body.classList.add('nv-select-open')
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(wrapper.emitted('back')).toBeUndefined()
    document.body.classList.remove('nv-select-open')

    // 3. When search input has query, Escape clears search
    const searchInput = wrapper.find('.settings-search-input')
    await searchInput.setValue('keyboard')
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await nextTick()
    expect((wrapper.find('.settings-search-input').element as HTMLInputElement).value).toBe('')
    expect(wrapper.emitted('back')).toBeUndefined()

    // 4. Otherwise, Escape emits back
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(wrapper.emitted('back')).toHaveLength(1)
  })

  it('renders phone root list when isPhone is true and section is not provided', () => {
    mockIsPhone.value = true
    const wrapper = mountView({ section: null })

    expect(wrapper.find('.mobile-settings').exists()).toBe(true)
    expect(wrapper.find('.mobile-settings__row').exists()).toBe(true)
    expect(wrapper.find('.settings-nav-col').exists()).toBe(false)
  })

  it('renders phone detail page when isPhone is true and section is provided', () => {
    mockIsPhone.value = true
    const wrapper = mountView({ section: 'appearance' })

    expect(wrapper.find('.mobile-settings').exists()).toBe(true)
    expect(wrapper.find('.mobile-settings__topbar h1').text()).toBe(en.settings.sections.appearance)
    expect(wrapper.find('.settings-nav-col').exists()).toBe(false)
  })

  it('shows hotkey binding chord in the left column metadata', () => {
    const wrapper = mountView({ section: 'general' })

    const meta = wrapper.find('.settings-nav-col__meta')
    expect(meta.exists()).toBe(true)
    // Chord should be present in the meta string
    expect(meta.text().length).toBeGreaterThan(0)
  })
})
