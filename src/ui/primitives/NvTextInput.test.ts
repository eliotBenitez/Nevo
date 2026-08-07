import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import NvTextInput from './NvTextInput.vue'

describe('NvTextInput', () => {
  it('renders a controlled, accessible text field', () => {
    const wrapper = mount(NvTextInput, {
      props: {
        modelValue: 'Canvas image',
        ariaLabel: 'Alternative text',
        maxlength: 120,
      },
    })

    const input = wrapper.get('input')
    expect(input.element.value).toBe('Canvas image')
    expect(input.attributes('aria-label')).toBe('Alternative text')
    expect(input.attributes('maxlength')).toBe('120')
  })

  it('emits live and committed values', async () => {
    const onUpdate = vi.fn()
    const onChange = vi.fn()
    const wrapper = mount(NvTextInput, {
      props: {
        modelValue: '',
        'onUpdate:modelValue': onUpdate,
        onChange,
      },
    })

    await wrapper.get('input').setValue('Diagram')
    await wrapper.get('input').trigger('change')

    expect(onUpdate).toHaveBeenLastCalledWith('Diagram')
    expect(onChange).toHaveBeenLastCalledWith('Diagram')
  })
})
