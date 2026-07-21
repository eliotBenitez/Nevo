import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import SandboxPluginFrame from './SandboxPluginFrame.vue'

describe('SandboxPluginFrame', () => {
  it('uses the strict iframe sandbox without same-origin, navigation or popups', () => {
    const wrapper = mount(SandboxPluginFrame, {
      props: {
        src: 'nevoplugin://0123456789abcdef0123456789abcdef/view.html',
        pluginId: 'plugin.frame',
        locale: 'en',
        theme: 'dark',
      },
    })
    const frame = wrapper.get('iframe')
    expect(frame.attributes('sandbox')).toBe('allow-scripts')
    expect(frame.attributes('sandbox')).not.toContain('allow-same-origin')
    expect(frame.attributes('sandbox')).not.toContain('allow-popups')
    expect(frame.attributes('referrerpolicy')).toBe('no-referrer')
  })

  it('renders explicit unsupported state without an iframe', () => {
    const wrapper = mount(SandboxPluginFrame, {
      props: {
        src: '',
        pluginId: 'plugin.frame',
        locale: 'en',
        theme: 'light',
        supported: false,
        unsupportedLabel: 'Unsupported on mobile',
      },
    })
    expect(wrapper.find('iframe').exists()).toBe(false)
    expect(wrapper.get('[role="status"]').text()).toBe('Unsupported on mobile')
  })

  it('brokers only versioned, size-limited messages from its own frame', async () => {
    const wrapper = mount(SandboxPluginFrame, {
      props: {
        src: 'nevoplugin://0123456789abcdef0123456789abcdef/view.html',
        pluginId: 'plugin.frame',
        locale: 'en',
        theme: 'light',
      },
    })
    const frame = wrapper.get('iframe').element
    const source = {} as Window
    Object.defineProperty(frame, 'contentWindow', { configurable: true, value: source })
    const dispatchMessage = (data: unknown, messageSource: Window | null = source) => {
      const event = new Event('message')
      Object.defineProperties(event, {
        data: { value: data },
        source: { value: messageSource },
      })
      globalThis.dispatchEvent(event)
    }

    dispatchMessage({ protocolVersion: '2.0', type: 'select', payload: { id: 1 } })
    dispatchMessage({
      protocolVersion: '2.0',
      type: 'oversized',
      payload: { value: 'x'.repeat(256 * 1024) },
    })
    dispatchMessage(
      { protocolVersion: '2.0', type: 'foreign', payload: null },
      {} as Window,
    )
    await wrapper.vm.$nextTick()

    expect(wrapper.emitted('event')).toEqual([
      [{ type: 'select', payload: { id: 1 } }],
    ])
  })
})
