import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { i18n } from '../../i18n'
import NvDatePicker from './NvDatePicker.vue'

describe('NvDatePicker', () => {
  const initialLocale = i18n.global.locale.value
  afterEach(() => {
    i18n.global.locale.value = initialLocale
    document.body.innerHTML = ''
  })

  it('renders its placeholder, month and weekdays in the app locale', async () => {
    i18n.global.locale.value = 'ru'
    const wrapper = mount(NvDatePicker, { props: { modelValue: '2026-10-08' }, attachTo: document.body })
    expect(wrapper.text()).toContain('2026')
    expect(wrapper.text()).toMatch(/окт/)

    await wrapper.get('button').trigger('click')
    const popover = document.body.querySelector('.ndp-popover')!
    expect(popover.textContent).toMatch(/октябрь/i)
    const weekdays = [...popover.querySelectorAll('.ndp-dow__cell')].map(cell => cell.textContent)
    expect(weekdays[0]).toMatch(/^пн/i)
    expect(weekdays).toHaveLength(7)
    expect(popover.querySelector('.ndp-nav__btn')?.getAttribute('aria-label')).toBe(i18n.global.t('common.datePicker.previousMonth'))
    wrapper.unmount()
  })

  it('falls back to the translated placeholder without a value', () => {
    i18n.global.locale.value = 'en'
    const wrapper = mount(NvDatePicker, { props: { modelValue: null } })
    expect(wrapper.text()).toContain(i18n.global.t('common.datePicker.placeholder'))
    expect(wrapper.text()).not.toContain('common.datePicker')
    wrapper.unmount()
  })
})
