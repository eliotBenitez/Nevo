import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { createPinia, setActivePinia } from 'pinia'
import SettingsMcpPanel from './SettingsMcpPanel.vue'
import en from '../../../locales/en.json'
import { useWorkspaceStore } from '../../../stores/workspace'
import type { McpMode } from '../../../types/workspace'

const getMcpBridgeInfo = vi.fn()

vi.mock('../../../tauri/mcp', () => ({
  getMcpBridgeInfo: (...args: unknown[]) => getMcpBridgeInfo(...args),
}))

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } })

function mountPanel() {
  return mount(SettingsMcpPanel, { global: { plugins: [i18n] } })
}

/** Puts the store in the state the panel expects: a local workspace is open. */
function openLocalWorkspace(mode: McpMode = 'off', autoSnapshot = true) {
  const store = useWorkspaceStore()
  store.activeHandle = { kind: 'local', path: '/home/u/vault' }
  store.settings = { ...store.settings, mcp: { mode, autoSnapshot } }
  return store
}

describe('SettingsMcpPanel', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    getMcpBridgeInfo.mockReset()
    getMcpBridgeInfo.mockResolvedValue(null)
  })

  it('reports the bridge as not running while the mode is off', async () => {
    openLocalWorkspace('off')
    const wrapper = mountPanel()
    await Promise.resolve()

    expect(wrapper.text()).toContain('Not running')
  })

  it('reports the listening port once the bridge is up', async () => {
    openLocalWorkspace('read-only')
    getMcpBridgeInfo.mockResolvedValue({
      port: 51234,
      token: 'secret',
      workspacePath: '/home/u/vault',
    })

    const wrapper = mountPanel()
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(wrapper.text()).toContain('51234')
    // The token must never reach the UI: it is a live credential.
    expect(wrapper.text()).not.toContain('secret')
  })

  it('disables the controls on a cloud workspace, which the bridge cannot serve', async () => {
    const store = useWorkspaceStore()
    store.activeHandle = { kind: 'cloud', storageId: 'remote-1' }

    const wrapper = mountPanel()
    await Promise.resolve()

    expect(wrapper.text()).toContain('local workspaces only')
  })

  it('persists a mode change to workspace settings', async () => {
    const store = openLocalWorkspace('off')
    const updateSettings = vi.spyOn(store, 'updateSettings').mockResolvedValue(undefined)

    const wrapper = mountPanel()
    await Promise.resolve()

    const select = wrapper.findComponent({ name: 'NvSelect' })
    await select.vm.$emit('update:modelValue', 'ask')

    expect(updateSettings).toHaveBeenCalledTimes(1)
    const draft = { mcp: { mode: 'off' as McpMode, autoSnapshot: true } }
    updateSettings.mock.calls[0]?.[0]?.(draft as never)
    expect(draft.mcp.mode).toBe('ask')
  })

  it('only offers the snapshot toggle once writes are possible', async () => {
    openLocalWorkspace('read-only')
    const readOnly = mountPanel()
    await Promise.resolve()
    expect(readOnly.findComponent({ name: 'NvToggle' }).props('disabled')).toBe(true)

    setActivePinia(createPinia())
    openLocalWorkspace('auto')
    const auto = mountPanel()
    await Promise.resolve()
    expect(auto.findComponent({ name: 'NvToggle' }).props('disabled')).toBe(false)
  })
})
