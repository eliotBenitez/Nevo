import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import NvRangeInput from './NvRangeInput.vue'

describe('NvRangeInput', () => {
  it('renders native range semantics and an optional formatted value', () => {
    const wrapper = mount(NvRangeInput, {
      props: {
        modelValue: 0.75,
        min: 0.1,
        max: 1,
        step: 0.05,
        ariaLabel: 'Opacity',
        showValue: true,
        valueSuffix: '×',
      },
    })

    const input = wrapper.get('input')
    expect(input.attributes('type')).toBe('range')
    expect(input.attributes('aria-label')).toBe('Opacity')
    expect(input.attributes('aria-valuetext')).toBe('0.75×')
    expect(wrapper.get('output').text()).toBe('0.75×')
  })

  it('emits a numeric value from pointer or keyboard-driven input', async () => {
    const onUpdate = vi.fn()
    const wrapper = mount(NvRangeInput, {
      props: {
        modelValue: 2,
        min: 1,
        max: 24,
        'onUpdate:modelValue': onUpdate,
      },
    })

    await wrapper.get('input').setValue('7')

    expect(onUpdate).toHaveBeenLastCalledWith(7)
  })
})
