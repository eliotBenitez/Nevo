import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import NvGlyph from './NvGlyph.vue'
import { WORKSPACE_GLYPHS } from '../../utils/workspaceGlyphs'

describe('NvGlyph', () => {
  it('renders the paths for a known bare id', () => {
    const glyph = WORKSPACE_GLYPHS[0]
    const wrapper = mount(NvGlyph, { props: { id: glyph.id, size: 20 } })

    const svg = wrapper.get('svg')
    expect(svg.attributes('width')).toBe('20')
    expect(svg.attributes('height')).toBe('20')
    expect(svg.attributes('viewBox')).toBe('0 0 24 24')
    expect(wrapper.findAll('path')).toHaveLength(glyph.paths.length)
  })

  it('renders the paths for a full glyph token', () => {
    const glyph = WORKSPACE_GLYPHS[1]
    const wrapper = mount(NvGlyph, { props: { id: `glyph:${glyph.id}` } })

    expect(wrapper.findAll('path')).toHaveLength(glyph.paths.length)
  })

  it('renders nothing for an unknown id', () => {
    const wrapper = mount(NvGlyph, { props: { id: 'not-a-real-glyph' } })

    expect(wrapper.find('svg').exists()).toBe(false)
  })
})
