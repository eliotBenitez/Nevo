import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import NvNumberInput from './NvNumberInput.vue'

describe('NvNumberInput', () => {
  it('names the editable input and keeps fractional keyboard stepping bounded', async () => {
    const wrapper = mount(NvNumberInput, {
      props: { modelValue: 1.5, min: 0.25, max: 8, step: 0.25, ariaLabel: 'Stroke width' },
    })
    const input = wrapper.get('input')
    expect(input.attributes('aria-label')).toBe('Stroke width')
    await input.trigger('keydown', { key: 'ArrowUp' })
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([1.75])
    await input.setValue('20')
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([8])
    wrapper.unmount()
  })
})
