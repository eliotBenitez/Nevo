import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { nextTick } from 'vue'
import { afterEach, describe, expect, it } from 'vitest'
import en from '../../../locales/en.json'
import NotebookColorControl from './NotebookColorControl.vue'

function mountControl(props: Record<string, unknown> = {}) {
  return mount(NotebookColorControl, {
    attachTo: document.body,
    props: { modelValue: '#123456', presets: ['#abcdef'], recents: ['#123456', '#000000'], quickColors: ['#123456', '#dc2626'], ...props },
    global: { plugins: [createI18n({ legacy: false, locale: 'en', messages: { en } })] },
  })
}

async function openPalette(wrapper: ReturnType<typeof mountControl>) {
  await wrapper.get('.nv-color-picker__trigger--swatch').trigger('click')
  await nextTick()
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('NotebookColorControl', () => {
  it('labels the trigger and quick swatches with names and marks the current one pressed', () => {
    const wrapper = mountControl()
    expect(wrapper.get('.nv-color-picker__trigger--swatch').attributes('aria-label')).toBe('Color palette')
    const quick = wrapper.findAll('.notebook-color-control__quick-swatch')
    expect(quick.map(node => node.attributes('aria-label'))).toEqual(['#123456', 'Red'])
    expect(quick.map(node => node.attributes('aria-pressed'))).toEqual(['true', 'false'])
    wrapper.unmount()
  })

  it('applies a quick swatch color', async () => {
    const wrapper = mountControl()
    await wrapper.findAll('.notebook-color-control__quick-swatch')[1].trigger('click')
    expect(wrapper.emitted('update:modelValue')).toEqual([['#dc2626']])
    wrapper.unmount()
  })

  it('hides quick swatches when disabled by showQuick and disables the trigger', async () => {
    const wrapper = mountControl({ showQuick: false, disabled: true })
    expect(wrapper.find('.notebook-color-control__quick').exists()).toBe(false)
    expect(wrapper.get('.nv-color-picker__trigger--swatch').attributes('disabled')).toBeDefined()
    wrapper.unmount()
  })

  it('selects builtin colors, own presets and recents from the popover', async () => {
    const wrapper = mountControl()
    await openPalette(wrapper)
    document.body.querySelector<HTMLButtonElement>('.nv-color-picker__swatch[aria-label="Blue"]')!.click()
    await nextTick()
    await openPalette(wrapper)
    document.body.querySelector<HTMLButtonElement>('.notebook-color-control__swatch[aria-label="#abcdef"]')!.click()
    expect(wrapper.emitted('update:modelValue')).toEqual([['#1d4ed8'], ['#abcdef']])
    wrapper.unmount()
  })

  it('adds the current color as a preset and disables the action for builtin colors', async () => {
    const wrapper = mountControl()
    await openPalette(wrapper)
    const add = document.body.querySelector<HTMLButtonElement>('.notebook-color-control__add')!
    expect(add.disabled).toBe(false)
    // Icon-only actions must keep an accessible name.
    expect(add.getAttribute('aria-label')).toBeTruthy()
    expect(add.textContent?.trim()).toBe('')
    add.click()
    expect(wrapper.emitted('add-preset')).toEqual([['#123456']])
    await wrapper.setProps({ modelValue: '#000000' })
    expect(add.disabled).toBe(true)
    wrapper.unmount()
  })

  it('removes own presets only in edit mode, with a per-color aria-label', async () => {
    const wrapper = mountControl()
    await openPalette(wrapper)
    expect(document.body.querySelector('.notebook-color-control__remove')).toBeNull()
    const edit = document.body.querySelector<HTMLButtonElement>('.notebook-color-control__edit')!
    const editLabel = edit.getAttribute('aria-label')
    expect(editLabel).toBeTruthy()
    edit.click()
    await nextTick()
    expect(edit.getAttribute('aria-pressed')).toBe('true')
    expect(edit.getAttribute('aria-label')).not.toBe(editLabel)
    const remove = document.body.querySelector<HTMLButtonElement>('.notebook-color-control__remove')!
    expect(remove.getAttribute('aria-label')).toBe('Remove color #abcdef')
    expect(document.body.querySelectorAll('.notebook-color-control__remove')).toHaveLength(1)
    remove.click()
    expect(wrapper.emitted('remove-preset')).toEqual([['#abcdef']])
    wrapper.unmount()
  })
})
