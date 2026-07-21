import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import NvNoteIcon from './NvNoteIcon.vue'
import { WORKSPACE_GLYPHS, glyphToken } from '../../utils/workspaceGlyphs'

describe('NvNoteIcon', () => {
  it('renders a glyph token as the designed SVG mark', () => {
    const glyph = WORKSPACE_GLYPHS[0]
    const wrapper = mount(NvNoteIcon, { props: { value: glyphToken(glyph.id) } })

    expect(wrapper.find('svg').exists()).toBe(true)
    expect(wrapper.findAll('path')).toHaveLength(glyph.paths.length)
    expect(wrapper.find('.nv-note-icon__emoji').exists()).toBe(false)
  })

  it('still renders a lucide token as a component icon', () => {
    const wrapper = mount(NvNoteIcon, { props: { value: 'lucide:Star' } })

    expect(wrapper.find('svg').exists()).toBe(true)
    expect(wrapper.find('.nv-note-icon__emoji').exists()).toBe(false)
  })

  it('falls back to text/emoji for anything else', () => {
    const wrapper = mount(NvNoteIcon, { props: { value: 'N' } })

    expect(wrapper.find('svg').exists()).toBe(false)
    expect(wrapper.get('.nv-note-icon__emoji').text()).toBe('N')
  })

  it('falls back to the default emoji when the value is empty', () => {
    const wrapper = mount(NvNoteIcon, { props: { value: '' } })

    expect(wrapper.get('.nv-note-icon__emoji').text()).toBe('📄')
  })
})
