import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import HistoryPreviewBlock from './HistoryPreviewBlock.vue'
import { buildHistoryPreview, type HistoryPreviewBlock as HistoryPreviewBlockModel } from '../../utils/noteHistoryPreview'
import en from '../../locales/en.json'

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } })

function mountBlock(block: HistoryPreviewBlockModel) {
  return mount(HistoryPreviewBlock, {
    global: { plugins: [i18n] },
    props: { block },
  })
}

describe('HistoryPreviewBlock', () => {
  it('renders a checked disabled checkbox for a checked checklist item', () => {
    const wrapper = mountBlock({
      kind: 'checklist',
      checked: true,
      children: [{ kind: 'paragraph', runs: [{ kind: 'text', text: 'Done', marks: [] }] }],
    })

    const checkbox = wrapper.find('input[type="checkbox"]')
    expect(checkbox.exists()).toBe(true)
    expect((checkbox.element as HTMLInputElement).checked).toBe(true)
    expect((checkbox.element as HTMLInputElement).disabled).toBe(true)
  })

  it('renders a table with th and td cells', () => {
    const wrapper = mountBlock({
      kind: 'table',
      rows: [
        [
          { header: true, blocks: [{ kind: 'paragraph', runs: [{ kind: 'text', text: 'Name', marks: [] }] }] },
          { header: true, blocks: [{ kind: 'paragraph', runs: [{ kind: 'text', text: 'Age', marks: [] }] }] },
        ],
        [
          { header: false, blocks: [{ kind: 'paragraph', runs: [{ kind: 'text', text: 'Ada', marks: [] }] }] },
          { header: false, blocks: [{ kind: 'paragraph', runs: [{ kind: 'text', text: '36', marks: [] }] }] },
        ],
      ],
    })

    expect(wrapper.findAll('th').length).toBe(2)
    expect(wrapper.findAll('td').length).toBe(2)
    expect(wrapper.find('th').attributes('scope')).toBe('col')
  })

  it('renders no img and shows the raw URL as text for a real https image, via the actual builder output', () => {
    const [block] = buildHistoryPreview({
      type: 'doc',
      content: [{ type: 'image_block', attrs: { src: 'https://example.com/pic.png', alt: '', caption: '' } }],
    })
    const wrapper = mountBlock(block!)

    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.text()).toContain('External image')
    expect(wrapper.text()).toContain('https://example.com/pic.png')
  })

  it('renders nothing extra for a missing, non-external image src', () => {
    const wrapper = mountBlock({
      kind: 'image',
      src: null,
      alt: '',
      caption: '',
      external: false,
      externalUrl: null,
    })

    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('External image')
  })

  it('renders no a element for a link run', () => {
    const wrapper = mountBlock({
      kind: 'paragraph',
      runs: [{ kind: 'text', text: 'click me', marks: ['link'], href: 'javascript:alert(1)' }],
    })

    expect(wrapper.find('a').exists()).toBe(false)
    expect(wrapper.text()).toContain('click me')
    expect(wrapper.text()).toContain('javascript:alert(1)')
  })

  it('shows the block type for an unsupported block', () => {
    const wrapper = mountBlock({
      kind: 'unsupported',
      type: 'plugin_x_block',
      text: 'plugin body',
    })

    expect(wrapper.text()).toContain('plugin_x_block')
    expect(wrapper.text()).toContain('plugin body')
  })
})
