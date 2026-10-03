import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import SettingsMcpAgentCard from './SettingsMcpAgentCard.vue'
import en from '../../../../locales/en.json'
import type { McpAgent, McpAgentStatus } from '../../../../tauri/mcp'

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } })

function mountCard(props: {
  agent?: McpAgent
  status?: McpAgentStatus | null
  desktop?: boolean
  busy?: boolean
  error?: string
  restartHint?: boolean
  isConfirming?: boolean
} = {}) {
  return mount(SettingsMcpAgentCard, {
    props: {
      agent: props.agent ?? 'codex',
      status: props.status ?? { kind: 'notConfigured', message: null },
      desktop: props.desktop ?? true,
      busy: props.busy ?? false,
      error: props.error,
      restartHint: props.restartHint ?? false,
      isConfirming: props.isConfirming ?? false,
    },
    global: {
      plugins: [i18n],
    },
  })
}

describe('SettingsMcpAgentCard', () => {
  it('renders Codex with icon, title, and config path', () => {
    const wrapper = mountCard({ agent: 'codex' })

    expect(wrapper.find('.row-title').text()).toBe('Codex')
    expect(wrapper.find('.mcp-agent-meta').text()).toContain('~/.codex/config.toml')
    expect(wrapper.find('svg').exists()).toBe(true)
  })

  it('renders Claude Code with icon, title, and config path', () => {
    const wrapper = mountCard({ agent: 'claudeCode' })

    expect(wrapper.find('.row-title').text()).toBe('Claude Code')
    expect(wrapper.find('.mcp-agent-meta').text()).toContain('~/.claude.json')
    expect(wrapper.find('svg').exists()).toBe(true)
  })

  it('displays status badge with semantic dot and status text', () => {
    const wrapper = mountCard({
      status: { kind: 'connected', message: null },
    })

    const chip = wrapper.find('.status-chip')
    expect(chip.exists()).toBe(true)
    expect(chip.text()).toBe('Connected')
    expect(chip.classes()).toContain('tw:bg-[var(--surface-success)]')
    expect(wrapper.find('.settings-object-card__footer').exists()).toBe(false)
  })

  it('applies warning tone when in conflict state', () => {
    const wrapper = mountCard({
      status: { kind: 'conflict', message: null },
    })

    const card = wrapper.find('.settings-object-card')
    expect(card.classes()).toContain('settings-object-card--warning')
    expect(wrapper.find('.status-chip').classes()).toContain('tw:bg-[var(--surface-warning)]')
    expect(wrapper.text()).toContain('Another Nevo entry exists')
  })

  it('emits connect event when connect button is clicked', async () => {
    const wrapper = mountCard({
      agent: 'codex',
      status: { kind: 'notConfigured', message: null },
    })

    const button = wrapper.find('button')
    await button.trigger('click')

    expect(wrapper.emitted('connect')).toHaveLength(1)
    expect(wrapper.emitted('connect')?.[0]).toEqual(['codex'])
  })

  it('emits disconnect event when disconnect button is clicked', async () => {
    const wrapper = mountCard({
      agent: 'codex',
      status: { kind: 'connected', message: null },
    })

    const button = wrapper.find('button')
    await button.trigger('click')

    expect(wrapper.emitted('disconnect')).toHaveLength(1)
    expect(wrapper.emitted('disconnect')?.[0]).toEqual(['codex'])
  })

  it('replaces normal actions with left-side confirmation actions', async () => {
    const wrapper = mountCard({
      agent: 'codex',
      status: { kind: 'notConfigured', message: null },
      isConfirming: true,
    })

    expect(wrapper.text()).toContain('Replace existing entry?')
    expect(wrapper.find('.mcp-agent-actions').exists()).toBe(false)
    expect(wrapper.find('.mcp-agent-confirm').exists()).toBe(true)
    expect(wrapper.findAll('button')).toHaveLength(2)

    const confirmBtn = wrapper.find('[data-mcp-confirm]')
    await confirmBtn.trigger('click')
    expect(wrapper.emitted('replace')?.[0]).toEqual(['codex'])

    await wrapper.find('.mcp-agent-confirm__actions button').trigger('click')
    expect(wrapper.emitted('cancelReplace')).toHaveLength(1)

    await wrapper.setProps({ isConfirming: false })
    expect(wrapper.find('.mcp-agent-actions').exists()).toBe(true)
    expect(wrapper.find('.mcp-agent-confirm').exists()).toBe(false)
    expect(wrapper.findAll('button')).toHaveLength(1)
  })

  it('keeps confirmation busy state on replace while leaving cancel available', () => {
    const wrapper = mountCard({
      status: { kind: 'conflict', message: null },
      busy: true,
      isConfirming: true,
    })

    const buttons = wrapper.findAll('button')
    expect(buttons).toHaveLength(2)
    expect(wrapper.find('[data-mcp-confirm]').attributes('disabled')).toBeDefined()
    expect(wrapper.find('.mcp-agent-confirm__actions button').attributes('disabled')).toBeUndefined()
  })

  it('renders restart hint when active', () => {
    const wrapper = mountCard({
      restartHint: true,
    })

    expect(wrapper.find('.mcp-agent-hint').exists()).toBe(true)
    expect(wrapper.find('.mcp-agent-hint').text()).toContain('Restart the agent to apply this change.')
  })

  it('renders error alert when error message is present', () => {
    const wrapper = mountCard({
      error: 'Permission denied',
    })

    const errorEl = wrapper.find('[role="alert"]')
    expect(errorEl.exists()).toBe(true)
    expect(errorEl.text()).toContain('Permission denied')
  })

  it('hides action buttons on non-desktop platforms', () => {
    const wrapper = mountCard({
      desktop: false,
    })

    expect(wrapper.find('.mcp-agent-actions').exists()).toBe(false)
    expect(wrapper.find('.status-chip').exists()).toBe(true)
    expect(wrapper.find('.status-chip').text()).toContain('Available in the desktop app only.')
  })
})
