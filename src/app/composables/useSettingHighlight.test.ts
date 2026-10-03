import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { mount } from '@vue/test-utils'
import { findSettingRow, SETTING_HIGHLIGHT_CLASS, useSettingHighlight } from './useSettingHighlight'

function row(title: string): string {
  return `<div class="settings-row"><div class="row-copy"><div class="row-title"> ${title} </div></div><button type="button">toggle</button></div>`
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
  document.body.innerHTML = ''
})

describe('findSettingRow', () => {
  it('matches the row by its exact visible title', () => {
    const root = document.createElement('div')
    root.innerHTML = row('Application language') + row('Application language direction')

    const found = findSettingRow(root, 'Application language')
    expect(found?.querySelector('.row-title')?.textContent?.trim()).toBe('Application language')
    expect(findSettingRow(root, 'Missing')).toBeNull()
    expect(findSettingRow(root, '  ')).toBeNull()
  })
})

describe('useSettingHighlight', () => {
  function mountHarness() {
    let api: ReturnType<typeof useSettingHighlight> | null = null
    const wrapper = mount(defineComponent({
      setup() {
        const root = ref<HTMLElement | null>(null)
        api = useSettingHighlight(root)
        return () => h('div', { ref: root })
      },
    }), { attachTo: document.body })
    return { wrapper, api: api! }
  }

  it('waits for a lazily rendered row, then focuses and highlights it', async () => {
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => setTimeout(() => cb(performance.now()), 0))
    vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id))
    const { wrapper, api } = mountHarness()

    const pending = api.revealSetting('Startup view')
    wrapper.element.innerHTML = row('Startup view')

    await expect(pending).resolves.toBe(true)
    const target = wrapper.element.querySelector('.settings-row')!
    expect(target.classList.contains(SETTING_HIGHLIGHT_CLASS)).toBe(true)
    expect(document.activeElement).toBe(target.querySelector('button'))

    wrapper.unmount()
    expect(target.classList.contains(SETTING_HIGHLIGHT_CLASS)).toBe(false)
  })

  it('gives up when the setting is never rendered', async () => {
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => setTimeout(() => cb(performance.now()), 0))
    vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id))
    const { wrapper, api } = mountHarness()
    // The deadline is read once when the lookup starts; every later check is past it.
    const now = vi.spyOn(performance, 'now')
    now.mockReturnValueOnce(0).mockReturnValue(10_000)

    await expect(api.revealSetting('Nope')).resolves.toBe(false)

    wrapper.unmount()
    now.mockRestore()
  })
})
