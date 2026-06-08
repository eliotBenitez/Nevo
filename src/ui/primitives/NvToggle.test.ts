import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import NvToggle from './NvToggle.vue'

describe('NvToggle', () => {
  it('renders the current model value as a switch checkbox', () => {
    const wrapper = mount(NvToggle, {
      props: {
        modelValue: true,
        ariaLabel: 'Enable sync',
      },
    })

    const input = wrapper.get<HTMLInputElement>('.nv-toggle__input')

    expect(input.element.checked).toBe(true)
    expect(input.attributes('type')).toBe('checkbox')
    expect(input.attributes('role')).toBe('switch')
    expect(input.attributes('aria-label')).toBe('Enable sync')
    wrapper.unmount()
  })

  it('emits the next checked value when changed', async () => {
    const wrapper = mount(NvToggle, {
      props: {
        modelValue: false,
      },
    })

    await wrapper.get('.nv-toggle__input').setValue(true)

    expect(wrapper.emitted('update:modelValue')).toEqual([[true]])
    wrapper.unmount()
  })

  it('does not emit when disabled', async () => {
    const wrapper = mount(NvToggle, {
      props: {
        modelValue: false,
        disabled: true,
      },
    })

    await wrapper.get('.nv-toggle__input').trigger('change')

    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    wrapper.unmount()
  })
})
