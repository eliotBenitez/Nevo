import { describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, shallowMount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import CreateWorkspaceView from './CreateWorkspaceView.vue'
import MobileCreateWorkspaceFlow from './MobileCreateWorkspaceFlow.vue'
import OpenWorkspaceView from './OpenWorkspaceView.vue'
import { useWorkspaceStore } from '../../../stores/workspace'
import { useTreeStore } from '../../../stores/tree'
import { appLogger } from '../../../utils/logger'
import en from '../../../locales/en.json'

vi.mock('@tauri-apps/api/path', () => ({
  appLocalDataDir: vi.fn().mockResolvedValue('/app-data'),
  documentDir: vi.fn().mockResolvedValue('/documents'),
  join: vi.fn(async (...parts: string[]) => parts.join('/')),
}))

function mountOptions(pinia = createPinia()) {
  return {
    global: {
      plugins: [
        pinia,
        createI18n({
          legacy: false,
          locale: 'en',
          messages: { en },
        }),
      ],
    },
  }
}

async function goToStep(wrapper: ReturnType<typeof mount>, step: number) {
  for (let i = 1; i < step; i += 1) {
    await wrapper.get('.footer-btn-next').trigger('click')
  }
}

describe('onboarding workspace storage options', () => {
  it('uses the mobile flow without exposing a filesystem path', () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    useWorkspaceStore().appMetadata = {
      version: '0.1.0',
      engine: 'Tauri 2',
      runtime: 'android',
      platform: 'android',
      appDataDir: '/app-data',
      configPath: '/app-data/config.json',
      logsPath: '/app-data/logs',
      supportsWindowControls: false,
      supportsGlobalShortcuts: false,
      supportsRevealInFileManager: false,
      supportsWindowDragRegions: false,
    }

    const wrapper = shallowMount(CreateWorkspaceView, mountOptions(pinia))

    expect(wrapper.findComponent(MobileCreateWorkspaceFlow).exists()).toBe(true)
    expect(wrapper.find('#workspace-location').exists()).toBe(false)
    expect(wrapper.text()).not.toContain(en.onboarding.create.locationLabel)

    wrapper.unmount()
  })

  it('explains an empty workspace name instead of silently ignoring the create action', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const createWorkspace = vi.spyOn(useWorkspaceStore(), 'createWorkspace')
      .mockImplementation(async () => undefined as never)
    const wrapper = mount(CreateWorkspaceView, {
      ...mountOptions(pinia),
      attachTo: document.body,
    })

    const input = wrapper.get('#workspace-name')
    await input.setValue('   ')
    await wrapper.get('.footer-btn-next').trigger('click')
    await flushPromises()

    expect(createWorkspace).not.toHaveBeenCalled()
    expect(wrapper.get('#workspace-name-error').text()).toBe(en.onboarding.create.nameRequired)
    expect(input.attributes('aria-invalid')).toBe('true')
    expect(input.attributes('aria-describedby')).toContain('workspace-name-error')
    expect(document.activeElement).toBe(input.element)
    expect(wrapper.get('label[for="workspace-name"]').text()).toBe(en.onboarding.create.nameLabel)
    // A blank-name Next must not advance the wizard.
    expect(wrapper.get('.cw-foot-count').text()).toBe('Step 1 of 3')

    await input.setValue('Atelier')
    expect(wrapper.find('#workspace-name-error').exists()).toBe(false)

    wrapper.unmount()
  })

  it('shows creation failures for the local-only workspace flow', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    vi.spyOn(useWorkspaceStore(), 'createWorkspace').mockRejectedValue(new Error('disk full'))
    vi.spyOn(appLogger, 'error').mockImplementation(async () => undefined)
    const wrapper = mount(CreateWorkspaceView, mountOptions(pinia))

    expect(wrapper.findAll('.gradient-swatch').map(swatch => swatch.attributes('aria-label')))
      .toEqual(Object.values(en.onboarding.create.colourNames))

    await goToStep(wrapper, 3)
    await wrapper.get('.footer-btn-create').trigger('click')
    // `create()` awaits a dynamic `import('@tauri-apps/api/path')`, which needs
    // more than one microtask drain before the rejection reaches the catch.
    await flushPromises()
    await flushPromises()

    expect(wrapper.get('.form-error--footer').attributes('role')).toBe('alert')
    expect(wrapper.get('.form-error--footer').text()).toBe(en.onboarding.create.mobile.createError)

    wrapper.unmount()
  })

  it('disables the location and template tabs while the name is blank', async () => {
    const wrapper = mount(CreateWorkspaceView, mountOptions())
    await wrapper.get('#workspace-name').setValue('')

    const tabs = wrapper.findAll('[role="tab"]')
    expect(tabs[1].attributes('disabled')).toBeDefined()
    expect(tabs[2].attributes('disabled')).toBeDefined()

    await wrapper.get('#workspace-name').setValue('Atelier')
    expect(wrapper.findAll('[role="tab"]')[1].attributes('disabled')).toBeUndefined()

    wrapper.unmount()
  })

  it('advances with Next and disables Back on the first step', async () => {
    const wrapper = mount(CreateWorkspaceView, mountOptions())

    expect(wrapper.get('.footer-btn-back').attributes('disabled')).toBeDefined()

    await wrapper.get('.footer-btn-next').trigger('click')

    expect(wrapper.get('.cw-foot-count').text()).toBe('Step 2 of 3')
    expect(wrapper.get('.footer-btn-back').attributes('disabled')).toBeUndefined()

    wrapper.unmount()
  })

  it('shows the typed name and the chosen template starters live in the preview', async () => {
    const wrapper = mount(CreateWorkspaceView, mountOptions())
    await wrapper.get('#workspace-name').setValue('Field notes')
    await goToStep(wrapper, 3)
    await wrapper.findAll('.cw-template-card')[1].trigger('click')
    await wrapper.vm.$nextTick()

    expect(wrapper.get('.cw-ws-name').text()).toBe('Field notes')
    const navText = wrapper.get('.cw-nav').text()
    expect(navText).toContain(en.onboarding.create.templates.researcher.starter.litReview)
    expect(navText).toContain(en.onboarding.create.templates.researcher.starter.journals)
    expect(navText).toContain(en.onboarding.create.templates.researcher.starter.ideas)

    wrapper.unmount()
  })

  it('creates the researcher template starters in order when selected', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    vi.spyOn(useWorkspaceStore(), 'createWorkspace').mockResolvedValue(undefined as never)
    const treeStore = useTreeStore()
    const createFolder = vi.spyOn(treeStore, 'createFolder').mockResolvedValue(undefined as never)
    const createNote = vi.spyOn(treeStore, 'createNote').mockResolvedValue(undefined as never)

    const wrapper = mount(CreateWorkspaceView, mountOptions(pinia))
    await wrapper.get('#workspace-name').setValue('Field notes')
    await goToStep(wrapper, 3)
    await wrapper.findAll('.cw-template-card')[1].trigger('click')
    await wrapper.get('.footer-btn-create').trigger('click')
    await flushPromises()

    const { starter } = en.onboarding.create.templates.researcher
    expect(createFolder.mock.calls.map(call => call[1])).toEqual([starter.litReview, starter.journals])
    // The "Getting started" note is created first for every template.
    expect(createNote.mock.calls.map(call => call[1])).toEqual([en.onboarding.starterNote.title, starter.ideas])
    expect(createFolder.mock.invocationCallOrder[0]).toBeLessThan(createFolder.mock.invocationCallOrder[1])
    expect(createFolder.mock.invocationCallOrder[1]).toBeLessThan(createNote.mock.invocationCallOrder[1])

    wrapper.unmount()
  })

  it('makes opening a folder the primary action and keeps back and create reachable', async () => {
    const wrapper = shallowMount(OpenWorkspaceView, mountOptions())
    const actions = wrapper.get('.open-header__actions').findAll('button')

    expect(actions[0].text()).toContain(en.onboarding.open.browse)
    expect(actions[0].classes()).toContain('nv-btn--primary')
    expect(actions[2].classes()).toContain('open-header-btn--create')
    expect(actions[2].classes()).not.toContain('nv-btn--primary')
    expect(wrapper.get('.open-empty-state__action').text()).toContain(en.onboarding.open.browse)

    await wrapper.get('.open-back-btn').trigger('click')
    expect(wrapper.emitted('back')).toHaveLength(1)

    wrapper.unmount()
  })

  it('toggles the recent workspaces list between recent and name order', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const recent = (id: string, name: string) => ({
      id, name, glyph: 'N', gradient: '', path: `/w/${id}`, lastOpened: '2026-09-01T00:00:00.000Z', pageCount: 1,
    })
    useWorkspaceStore().recents = [recent('1', 'Zeta'), recent('2', 'alpha'), recent('3', 'Mid')]
    const wrapper = shallowMount(OpenWorkspaceView, mountOptions(pinia))
    const names = () => wrapper.findAll('.ws-name').map(name => name.text())
    const sortButton = wrapper.get('.sort-btn')

    expect(names()).toEqual(['Zeta', 'alpha', 'Mid'])
    expect(sortButton.attributes('aria-label')).toBe(`Sort: ${en.onboarding.open.recent}`)
    expect(wrapper.get('.search-field .nv-kbd').text()).toBe('Ctrl+F')

    await sortButton.trigger('click')

    expect(names()).toEqual(['alpha', 'Mid', 'Zeta'])
    expect(sortButton.text()).toContain(en.onboarding.open.sortName)

    wrapper.unmount()
  })

  it('groups mobile workspace actions without a members or storage-type entry', () => {
    const wrapper = shallowMount(OpenWorkspaceView, mountOptions())
    const buttonLabels = wrapper.findAll('button').map(button => button.text())

    expect(buttonLabels).toContain(en.onboarding.open.browse)
    expect(buttonLabels).toContain(en.onboarding.open.importArchive)
    expect(buttonLabels).toContain(en.onboarding.open.new)
    expect(wrapper.get('.open-header__actions').findAll('button')).toHaveLength(3)

    wrapper.unmount()
  })
})
