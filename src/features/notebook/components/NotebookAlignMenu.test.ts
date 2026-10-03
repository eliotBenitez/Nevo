import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { describe, expect, it } from 'vitest'
import en from '../../../locales/en.json'
import NotebookAlignMenu from './NotebookAlignMenu.vue'

function mountMenu(unitCount: number, disabled = false) {
  return mount(NotebookAlignMenu, {
    props: { unitCount, disabled },
    attachTo: document.body,
    global: { plugins: [createI18n({ legacy: false, locale: 'en', messages: { en } })] },
  })
}

const items = () => Array.from(document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'))

describe('NotebookAlignMenu', () => {
  it('lists align and distribute items and emits the chosen modes, returning focus', async () => {
    const wrapper = mountMenu(3)
    const trigger = wrapper.get('button[aria-haspopup="menu"]')
    expect(trigger.attributes('aria-label')).toBe('Align')
    await trigger.trigger('click')
    expect(trigger.attributes('aria-expanded')).toBe('true')
    expect(items().map(item => item.getAttribute('aria-label'))).toEqual([
      'Align left', 'Align center', 'Align right', 'Align top', 'Align middle', 'Align bottom',
      'Distribute horizontally', 'Distribute vertically',
    ])
    expect(document.querySelector('[role="separator"]')).not.toBeNull()
    items()[0].click()
    await wrapper.vm.$nextTick()
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('align')?.at(-1)).toEqual(['left'])
    expect(document.activeElement).toBe(trigger.element)
    await trigger.trigger('click')
    items()[7].click()
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('distribute')?.at(-1)).toEqual(['vertical'])
    wrapper.unmount()
  })

  it('disables distribution below three groups with a hint and does not emit', async () => {
    const wrapper = mountMenu(2)
    await wrapper.get('button[aria-haspopup="menu"]').trigger('click')
    const distribute = items().slice(6)
    expect(distribute.every(item => item.disabled)).toBe(true)
    expect(distribute[0].getAttribute('title')).toBe('Select at least 3 items')
    expect(items()[0].disabled).toBe(false)
    distribute[0].click()
    expect(wrapper.emitted('distribute')).toBeUndefined()
    wrapper.unmount()
  })

  it('disables the trigger when the toolbar is disabled', () => {
    const wrapper = mountMenu(3, true)
    expect(wrapper.get('button[aria-haspopup="menu"]').attributes('disabled')).toBeDefined()
    wrapper.unmount()
  })
})
