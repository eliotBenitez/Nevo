import { afterEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { nextTick } from 'vue'
import NvColorPicker from './NvColorPicker.vue'
import en from '../../locales/en.json'

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: { en },
})

afterEach(() => {
  document.body.innerHTML = ''
})

describe('NvColorPicker', () => {
  it('emits the original preset value when a preset is selected', async () => {
    const gradient = 'linear-gradient(135deg, #111827, #7c3aed)'
    const wrapper = mount(NvColorPicker, {
      global: { plugins: [i18n] },
      props: {
        display: 'inline',
        modelValue: '#000000',
        colors: [{ color: gradient, label: 'Gradient' }],
        hideCustom: true,
      },
    })

    await wrapper.get('.nv-color-picker__swatch').trigger('click')

    expect(wrapper.emitted('update:modelValue')).toEqual([[gradient]])
    wrapper.unmount()
  })

  it('normalizes valid HEX input before emitting', async () => {
    const wrapper = mount(NvColorPicker, {
      global: { plugins: [i18n] },
      attachTo: document.body,
      props: {
        display: 'inline',
        modelValue: '#000000',
        colors: [],
      },
    })

    await wrapper.get('.nv-color-picker__custom-trigger').trigger('click')
    await nextTick()

    const input = document.body.querySelector<HTMLInputElement>('.nv-color-picker__hex')
    expect(input).not.toBeNull()
    if (!input) throw new Error('HEX input not found')
    input.value = 'abc'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()
    input.dispatchEvent(new Event('blur', { bubbles: true }))
    await nextTick()

    expect(wrapper.emitted('update:modelValue')).toEqual([['#aabbcc']])
    expect(input.value).toBe('#aabbcc')
    wrapper.unmount()
  })

  it('rolls invalid HEX input back to the current value', async () => {
    const wrapper = mount(NvColorPicker, {
      global: { plugins: [i18n] },
      attachTo: document.body,
      props: {
        display: 'inline',
        modelValue: '#112233',
        colors: [],
      },
    })

    await wrapper.get('.nv-color-picker__custom-trigger').trigger('click')
    await nextTick()

    const input = document.body.querySelector<HTMLInputElement>('.nv-color-picker__hex')
    expect(input).not.toBeNull()
    if (!input) throw new Error('HEX input not found')
    input.value = 'not-hex'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()
    input.dispatchEvent(new Event('blur', { bubbles: true }))
    await nextTick()

    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect(input.value).toBe('#112233')
    expect(input.classList.contains('is-invalid')).toBe(true)
    wrapper.unmount()
  })

  it('opens and closes the popover from trigger, outside click, and Escape', async () => {
    const wrapper = mount(NvColorPicker, {
      global: { plugins: [i18n] },
      attachTo: document.body,
      props: {
        modelValue: '#112233',
        colors: [],
      },
    })

    await wrapper.get('.nv-color-picker__trigger').trigger('click')
    await nextTick()
    expect(document.body.querySelector('.nv-color-picker__panel--popover')).not.toBeNull()

    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    await nextTick()
    expect(document.body.querySelector('.nv-color-picker__panel--popover')).toBeNull()

    await wrapper.get('.nv-color-picker__trigger').trigger('click')
    await nextTick()
    expect(document.body.querySelector('.nv-color-picker__panel--popover')).not.toBeNull()

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await nextTick()
    expect(document.body.querySelector('.nv-color-picker__panel--popover')).toBeNull()
    wrapper.unmount()
  })

  it('emits null from the none action when allowed', async () => {
    const wrapper = mount(NvColorPicker, {
      global: { plugins: [i18n] },
      props: {
        display: 'inline',
        modelValue: '#112233',
        colors: [],
        allowNone: true,
      },
    })

    await wrapper.get('.nv-color-picker__none').trigger('click')

    expect(wrapper.emitted('update:modelValue')).toEqual([[null]])
    wrapper.unmount()
  })
})
