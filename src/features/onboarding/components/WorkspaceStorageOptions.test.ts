import { describe, expect, it, vi } from 'vitest'
import { flushPromises, shallowMount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import CreateWorkspaceView from './CreateWorkspaceView.vue'
import MobileCreateWorkspaceFlow from './MobileCreateWorkspaceFlow.vue'
import OpenWorkspaceView from './OpenWorkspaceView.vue'
import { useWorkspaceStore } from '../../../stores/workspace'
import { useAuthStore } from '../../../stores/auth'
import { useSharedStorageStore } from '../../../stores/sharedStorage'
import { useServerConfigStore } from '../../../stores/serverConfig'
import { WORKSPACE_GRADIENTS } from '../../../utils/workspaceGradients'
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

describe('onboarding workspace storage options', () => {
  it('lets desktop users choose between local and cloud storage', async () => {
    const wrapper = shallowMount(CreateWorkspaceView, mountOptions())
    const options = wrapper.findAll('.storage-type__btn')

    expect(options.map(option => option.text())).toEqual([
      en.workspace.localWorkspace,
      en.workspace.cloudWorkspace,
    ])
    expect(options[0].attributes('aria-pressed')).toBe('true')
    expect(options[1].attributes('aria-pressed')).toBe('false')
    expect(wrapper.text()).toContain(en.onboarding.create.locationLabel)
    expect(wrapper.text()).toContain(en.onboarding.create.glyphLabel)
    expect(wrapper.text()).toContain(en.onboarding.create.colourLabel)

    await options[1].trigger('click')

    expect(options[0].attributes('aria-pressed')).toBe('false')
    expect(options[1].attributes('aria-pressed')).toBe('true')
    expect(wrapper.text()).not.toContain(en.onboarding.create.locationLabel)
    expect(wrapper.text()).toContain(en.onboarding.create.serverLabel)

    wrapper.unmount()
  })

  it('creates and opens the selected cloud storage', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const workspace = useWorkspaceStore()
    const auth = useAuthStore()
    const shared = useSharedStorageStore()
    const server = useServerConfigStore()
    auth.status = 'authenticated'
    auth.sessionServerUrl = server.serverUrl
    const loadStorages = vi.spyOn(shared, 'loadStorages').mockImplementation(async () => undefined)
    const createStorage = vi.spyOn(shared, 'createStorage').mockImplementation(async () => ({
      id: 'storage-1',
      name: 'Atelier',
      glyph: 'N',
      gradient: WORKSPACE_GRADIENTS[0],
      ownerUserId: 'user-1',
      createdAt: '2026-08-06T00:00:00.000Z',
      role: 'owner',
      wrappedDek: 'wrapped',
      manifestRoom: 'manifest-1',
    }))
    const openCloudWorkspace = vi.spyOn(workspace, 'openCloudWorkspace')
      .mockImplementation(async () => undefined)
    const logError = vi.spyOn(appLogger, 'error').mockImplementation(async () => undefined)
    const done = vi.fn()
    const wrapper = shallowMount(CreateWorkspaceView, {
      ...mountOptions(pinia),
      attrs: { onDone: done },
    })

    await wrapper.findAll('.storage-type__btn')[1].trigger('click')
    await wrapper.get('.footer-btn-create').trigger('click')
    await flushPromises()

    expect(loadStorages).toHaveBeenCalledOnce()
    expect(createStorage).toHaveBeenCalledWith('Atelier', 'N', WORKSPACE_GRADIENTS[0])
    expect(openCloudWorkspace).toHaveBeenCalledWith('storage-1', server.serverUrl)
    expect(logError).not.toHaveBeenCalled()
    expect(wrapper.get('.footer-btn-create').attributes('disabled')).toBeUndefined()
    expect(done).toHaveBeenCalledOnce()

    wrapper.unmount()
  })

  it('uses the three-step mobile flow without exposing a filesystem path', () => {
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
    expect(wrapper.find('.location-field').exists()).toBe(false)
    expect(wrapper.text()).not.toContain(en.onboarding.create.locationLabel)

    wrapper.unmount()
  })

  it('groups mobile workspace actions without displaying a cloud sign-in action', () => {
    const wrapper = shallowMount(OpenWorkspaceView, mountOptions())
    const buttonLabels = wrapper.findAll('button').map(button => button.text())

    expect(buttonLabels).not.toContain(en.cloud.account.signIn)
    expect(buttonLabels).toContain(en.onboarding.open.browse)
    expect(buttonLabels).toContain(en.onboarding.open.importArchive)
    expect(buttonLabels).toContain(en.onboarding.open.new)
    expect(wrapper.get('.open-header__actions').findAll('button')).toHaveLength(3)

    wrapper.unmount()
  })
})
