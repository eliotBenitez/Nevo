import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import TitleBarTabs from './TitleBarTabs.vue'
import NvNoteIcon from '../../ui/primitives/NvNoteIcon.vue'
import en from '../../locales/en.json'
import type { TabEntry } from '../../stores/tabs'

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: { en },
})

function createTab(id: string, title: string): TabEntry {
  return {
    id,
    noteId: `note-${id}`,
    title,
    icon: '📄',
    isDirty: false,
    isPinned: false,
  }
}

function mountTabs(tabs: TabEntry[]) {
  return mount(TitleBarTabs, {
    global: {
      plugins: [i18n],
    },
    props: {
      tabs,
      activeTabId: tabs[0]?.id ?? null,
    },
  })
}

const pointerInit = { bubbles: true, pointerId: 1, isPrimary: true, button: 0 }

function pointerDown(el: Element) {
  el.dispatchEvent(new PointerEvent('pointerdown', { ...pointerInit, clientX: 10, clientY: 10 }))
}

function pointerMove(over: Element | null, x = 60) {
  document.elementFromPoint = vi.fn(() => over)
  window.dispatchEvent(new PointerEvent('pointermove', { ...pointerInit, clientX: x, clientY: 10 }))
}

function pointerUp(x = 60) {
  window.dispatchEvent(new PointerEvent('pointerup', { ...pointerInit, clientX: x, clientY: 10 }))
}

describe('TitleBarTabs', () => {
  it('emits reorder with current indexes when dragging a tab over another tab', async () => {
    const tabs = [createTab('a', 'Alpha'), createTab('b', 'Beta'), createTab('c', 'Gamma')]
    const wrapper = mountTabs(tabs)
    const tabEls = wrapper.findAll('.title-tab')

    pointerDown(tabEls[0].element)
    pointerMove(tabEls[2].element)

    expect(wrapper.emitted('reorder')).toEqual([[0, 2]])

    await wrapper.setProps({ tabs: [tabs[1], tabs[2], tabs[0]] })
    pointerMove(wrapper.findAll('.title-tab')[0].element)
    pointerUp()

    expect(wrapper.emitted('reorder')).toEqual([
      [0, 2],
      [2, 0],
    ])
  })

  it('does not emit reorder when dragging over the same tab or below the threshold', async () => {
    const tabs = [createTab('a', 'Alpha'), createTab('b', 'Beta')]
    const wrapper = mountTabs(tabs)
    const tabEls = wrapper.findAll('.title-tab')

    pointerDown(tabEls[0].element)
    pointerMove(tabEls[1].element, 12)
    pointerMove(tabEls[0].element)
    pointerUp()

    expect(wrapper.emitted('reorder')).toBeUndefined()
  })

  it('does not select a tab when a click follows a drag gesture', async () => {
    const tabs = [createTab('a', 'Alpha'), createTab('b', 'Beta')]
    const wrapper = mountTabs(tabs)
    document.body.appendChild(wrapper.element)
    const tabEls = wrapper.findAll('.title-tab')

    pointerDown(tabEls[0].element)
    pointerMove(tabEls[1].element)
    pointerUp()
    await tabEls[0].trigger('click')

    expect(wrapper.emitted('select')).toBeUndefined()
    wrapper.unmount()
  })

  it('restores the original position on Escape', async () => {
    const tabs = [createTab('a', 'Alpha'), createTab('b', 'Beta'), createTab('c', 'Gamma')]
    const wrapper = mountTabs(tabs)
    const tabEls = wrapper.findAll('.title-tab')

    pointerDown(tabEls[0].element)
    pointerMove(tabEls[2].element)
    await wrapper.setProps({ tabs: [tabs[1], tabs[2], tabs[0]] })
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))

    expect(wrapper.emitted('reorder')).toEqual([
      [0, 2],
      [2, 0],
    ])
  })

  it('emits select when clicking a tab', async () => {
    const tabs = [createTab('a', 'Alpha'), createTab('b', 'Beta')]
    const wrapper = mountTabs(tabs)

    await wrapper.findAll('.title-tab')[1].trigger('click')

    expect(wrapper.emitted('select')).toEqual([['note-b']])
  })

  it('supports semantic tab buttons and localized close labels', () => {
    const tabs = [createTab('a', 'Alpha')]
    const wrapper = mountTabs(tabs)

    expect(wrapper.get('[role="tablist"]').attributes('aria-label')).toBe('Open notes')
    expect(wrapper.get('.title-tab').attributes('role')).toBe('tab')
    expect(wrapper.get('.title-tab').attributes('aria-selected')).toBe('true')
    expect(wrapper.get('.tab-close').attributes('aria-label')).toBe('Close Alpha')
  })

  it('emits only close when clicking a tab close control', async () => {
    const tabs = [createTab('a', 'Alpha'), createTab('b', 'Beta')]
    const wrapper = mountTabs(tabs)

    await wrapper.findAll('.tab-close')[1].trigger('click')

    expect(wrapper.emitted('close')).toEqual([['b']])
    expect(wrapper.emitted('select')).toBeUndefined()
  })

  it('renders icons using NvNoteIcon', () => {
    const tabs = [
      { ...createTab('a', 'Alpha'), icon: 'lucide:heart' },
      { ...createTab('b', 'Beta'), icon: '😊' },
    ]
    const wrapper = mountTabs(tabs)
    const icons = wrapper.findAllComponents(NvNoteIcon)

    expect(icons).toHaveLength(2)
    expect(icons[0].props('value')).toBe('lucide:heart')
    expect(icons[1].props('value')).toBe('😊')
  })
})
