import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import NvSelect from './NvSelect.vue'

const options = [
  { value: '1', label: '1×' },
  { value: '1.5', label: '1.5×' },
]

describe('NvSelect', () => {
  it('exposes an optional accessible name on the trigger', () => {
    const wrapper = mount(NvSelect, { props: { modelValue: '1', options, ariaLabel: 'Playback speed' } })
    expect(wrapper.get('.nv-select__trigger').attributes('aria-label')).toBe('Playback speed')
  })

  it('emits the chosen value and reflects it on the trigger', async () => {
    const onUpdate = vi.fn()
    const wrapper = mount(NvSelect, {
      props: { modelValue: '1', options, 'onUpdate:modelValue': onUpdate },
    })

    await wrapper.get('.nv-select__trigger').trigger('click')
    const optionButtons = document.querySelectorAll<HTMLButtonElement>('.nv-select__option')
    optionButtons[1].click()

    expect(onUpdate).toHaveBeenLastCalledWith('1.5')
  })
})
