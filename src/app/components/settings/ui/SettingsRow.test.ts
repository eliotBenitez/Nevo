import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import SettingsRow from './SettingsRow.vue'

describe('SettingsRow', () => {
  it('renders title as a label connected to controlId when controlId is provided', () => {
    const wrapper = mount(SettingsRow, {
      props: {
        title: 'App Theme',
        description: 'Choose light or dark theme',
        controlId: 'theme-select',
      },
      slots: {
        default: '<select id="theme-select"><option>Light</option></select>',
      },
    })

    const label = wrapper.find('label.row-title')
    expect(label.exists()).toBe(true)
    expect(label.attributes('for')).toBe('theme-select')
    expect(label.text()).toBe('App Theme')

    const desc = wrapper.find('.row-sub')
    expect(desc.attributes('id')).toBe('theme-select-desc')
    expect(desc.text()).toBe('Choose light or dark theme')
    expect(wrapper.get('.row-control').attributes('aria-labelledby')).toBe(label.attributes('id'))
    expect(wrapper.get('.row-control').attributes('aria-describedby')).toBe(desc.attributes('id'))
  })

  it('renders title as a span when controlId is not provided', () => {
    const wrapper = mount(SettingsRow, {
      props: {
        title: 'General Info',
      },
    })

    expect(wrapper.find('label.row-title').exists()).toBe(false)
    const span = wrapper.find('span.row-title')
    expect(span.exists()).toBe(true)
    expect(span.text()).toBe('General Info')
    expect(wrapper.get('.row-control').attributes('role')).toBe('group')
    expect(wrapper.get('.row-control').attributes('aria-labelledby')).toBe(span.attributes('id'))
    expect(wrapper.get('.row-control').attributes('aria-describedby')).toBeUndefined()
  })

  it('applies stacked layout class when layout="stacked"', () => {
    const wrapper = mount(SettingsRow, {
      props: {
        title: 'Path Grid',
        layout: 'stacked',
      },
    })

    expect(wrapper.classes()).toContain('settings-row--stacked')
    expect(wrapper.classes()).toContain('settings-row--stack')
  })

  it('places a stacked control below its title via a single-column layout utility', () => {
    const wrapper = mount(SettingsRow, {
      props: { title: 'Sidebar layout', layout: 'stacked' },
      slots: { default: '<div class="wide-control">Options</div>' },
    })

    expect(wrapper.classes()).toContain('tw:grid-cols-[minmax(0,1fr)]')
    expect(wrapper.classes()).not.toContain('tw:grid-cols-[minmax(0,1fr)_auto]')
  })

  it('applies disabled classes when disabled=true', () => {
    const wrapper = mount(SettingsRow, {
      props: {
        title: 'Disabled Feature',
        disabled: true,
      },
    })

    expect(wrapper.classes()).toContain('settings-row--disabled')
    expect(wrapper.classes()).toContain('is-muted')
  })

  it('renders custom description slot when provided', () => {
    const wrapper = mount(SettingsRow, {
      props: {
        title: 'Custom Meta',
      },
      slots: {
        description: '<span class="custom-badge">Important</span>',
      },
    })

    expect(wrapper.find('.custom-badge').exists()).toBe(true)
    expect(wrapper.find('.row-sub').text()).toBe('Important')
  })
})
