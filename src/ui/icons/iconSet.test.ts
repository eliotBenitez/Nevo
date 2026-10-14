import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Search } from './index'
import { iconSet } from './iconSet'

describe('icon set switching', () => {
  afterEach(() => {
    iconSet.value = 'lucide'
  })

  it('renders lucide by default and tabler once selected, mapping strokeWidth', async () => {
    const wrapper = mount(Search, { props: { size: 18, strokeWidth: 1.5, class: 'x' } })
    expect(wrapper.classes()).toContain('lucide')
    expect(wrapper.classes()).toContain('x')

    iconSet.value = 'tabler'
    await vi.waitFor(() => expect(wrapper.classes()).toContain('tabler-icon'))
    const svg = wrapper.find('svg')
    expect(svg.classes()).toContain('tabler-icon')
    expect(svg.classes()).toContain('x')
    expect(svg.attributes('stroke-width')).toBe('1.5')
    expect(svg.attributes('width')).toBe('18')
  })
})
