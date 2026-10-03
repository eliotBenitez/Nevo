import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { createPinia, setActivePinia } from 'pinia'
import SettingsMcpPanel from './SettingsMcpPanel.vue'
import en from '../../../locales/en.json'
import { useWorkspaceStore } from '../../../stores/workspace'
import type { AppMetadata, McpMode } from '../../../types/workspace'

const getMcpBridgeInfo = vi.fn()
const getMcpAgentStatus = vi.fn()
const connectMcpAgent = vi.fn()
const disconnectMcpAgent = vi.fn()

vi.mock('../../../tauri/mcp', () => ({
  getMcpBridgeInfo: (...args: unknown[]) => getMcpBridgeInfo(...args),
  getMcpAgentStatus: (...args: unknown[]) => getMcpAgentStatus(...args),
  connectMcpAgent: (...args: unknown[]) => connectMcpAgent(...args),
  disconnectMcpAgent: (...args: unknown[]) => disconnectMcpAgent(...args),
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
  store.appMetadata = { runtime: 'desktop' } as AppMetadata
  return store
}

function agentRow(wrapper: ReturnType<typeof mountPanel>, agent: string) {
  return wrapper.find(`[data-mcp-agent="${agent}"]`)
}

describe('SettingsMcpPanel', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    getMcpBridgeInfo.mockReset()
    getMcpBridgeInfo.mockResolvedValue(null)
    getMcpAgentStatus.mockReset()
    getMcpAgentStatus.mockResolvedValue({
      codex: { kind: 'notConfigured', message: null },
      claudeCode: { kind: 'notConfigured', message: null },
    })
    connectMcpAgent.mockReset()
    disconnectMcpAgent.mockReset()
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

  it('disables the controls when there is no open local workspace', async () => {
    const store = useWorkspaceStore()
    store.activeHandle = null

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

  it('shows independent Codex and Claude Code statuses without enabling access', async () => {
    openLocalWorkspace('off')
    getMcpAgentStatus.mockResolvedValue({
      codex: { kind: 'connected', message: null },
      claudeCode: { kind: 'notConfigured', message: null },
    })

    const wrapper = mountPanel()
    await flushPromises()

    expect(agentRow(wrapper, 'codex').text()).toContain('Connected')
    expect(agentRow(wrapper, 'claudeCode').text()).toContain('Not connected')
    expect(agentRow(wrapper, 'claudeCode').find('button').attributes('aria-label')).toBe('Connect Claude Code')
    expect(wrapper.text()).toContain('Not running')
  })

  it('connects only the selected agent and refreshes its status', async () => {
    openLocalWorkspace('off')
    connectMcpAgent.mockResolvedValue({ kind: 'connected', message: null })
    getMcpAgentStatus.mockResolvedValueOnce({
      codex: { kind: 'notConfigured', message: null },
      claudeCode: { kind: 'notConfigured', message: null },
    }).mockResolvedValueOnce({
      codex: { kind: 'connected', message: null },
      claudeCode: { kind: 'notConfigured', message: null },
    })

    const wrapper = mountPanel()
    await flushPromises()
    await agentRow(wrapper, 'codex').find('button').trigger('click')
    await flushPromises()

    expect(connectMcpAgent).toHaveBeenCalledWith('codex', false)
    expect(agentRow(wrapper, 'codex').text()).toContain('Connected')
    expect(agentRow(wrapper, 'claudeCode').text()).toContain('Not connected')
    expect(useWorkspaceStore().settings.mcp.mode).toBe('off')
  })

  it('requires a second explicit action before replacing a conflicting entry', async () => {
    openLocalWorkspace()
    getMcpAgentStatus.mockResolvedValue({
      codex: { kind: 'conflict', message: null },
      claudeCode: { kind: 'notConfigured', message: null },
    })
    connectMcpAgent.mockResolvedValue({ kind: 'connected', message: null })

    const wrapper = mountPanel()
    await flushPromises()
    const row = agentRow(wrapper, 'codex')
    await row.find('button').trigger('click')
    expect(connectMcpAgent).not.toHaveBeenCalled()
    expect(row.text()).toContain('Replace existing entry?')
    await row.find('[data-mcp-confirm]').trigger('click')
    expect(connectMcpAgent).toHaveBeenCalledWith('codex', true)
  })

  it('shows a safe error when registration fails', async () => {
    openLocalWorkspace()
    connectMcpAgent.mockRejectedValue('Configuration changed; try again')
    const wrapper = mountPanel()
    await flushPromises()
    await agentRow(wrapper, 'codex').find('button').trigger('click')
    await flushPromises()

    expect(agentRow(wrapper, 'codex').text()).toContain('Configuration changed; try again')
  })

  it('does not offer registration on mobile', async () => {
    const store = openLocalWorkspace()
    store.appMetadata = { runtime: 'android' } as AppMetadata
    const wrapper = mountPanel()
    await flushPromises()

    expect(getMcpAgentStatus).not.toHaveBeenCalled()
    expect(agentRow(wrapper, 'codex').find('button').exists()).toBe(false)
    expect(wrapper.text()).toContain('desktop app')
  })
})
