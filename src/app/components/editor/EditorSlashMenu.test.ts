import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { describe, expect, it } from 'vitest'
import EditorSlashMenu from './EditorSlashMenu.vue'
import type { NevoSlashItem } from '../../../types/editor-plugin'
import en from '../../../locales/en.json'

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } })

function item(id: string, category: string): NevoSlashItem {
  return { id, title: id, category, keywords: [id], run: () => {} } as NevoSlashItem
}

// Plugin order: text (paragraph, h1, h2, emoji) then lists (ul).
const items = [item('paragraph', 'text'), item('h1', 'text'), item('h2', 'text'), item('emoji', 'text'), item('ul', 'lists')]

function mountMenu(layout: 'list' | 'grid' | 'preview', activeIndex = 0) {
  return mount(EditorSlashMenu, {
    props: { open: true, query: '', activeIndex, items, menuStyle: {}, emojiPickerOpen: false, layout },
    global: { plugins: [i18n], stubs: { NvIconPicker: true } },
  })
}

describe('EditorSlashMenu', () => {
  it('renders the list layout by default with item ids', () => {
    const wrapper = mountMenu('list')
    expect(wrapper.find('.slash-menu--tiles').exists()).toBe(false)
    expect(wrapper.findAll('.slash-menu__tile')).toHaveLength(0)
    expect(wrapper.findAll('.slash-menu__item')).toHaveLength(5)
    expect(wrapper.find('.slash-menu__id').text()).toContain('/paragraph')
  })

  it('renders one tile grid per category and highlights the active flat index', () => {
    const wrapper = mountMenu('grid', 4)
    expect(wrapper.find('.slash-menu--tiles').exists()).toBe(true)
    const grids = wrapper.findAll('.slash-menu__tiles')
    expect(grids).toHaveLength(2)
    expect(grids[0].attributes('style')).toContain('--slash-grid-columns: 4')
    expect(grids[0].findAll('.slash-menu__tile')).toHaveLength(4)
    const active = wrapper.find('.slash-menu__tile.is-active')
    expect(active.attributes('title')).toBe('/ul · ul')
    expect(wrapper.find('.slash-menu__id').exists()).toBe(false)
  })

  it('renders previews with fallback icons and preserves emoji selection', async () => {
    const wrapper = mountMenu('preview', 4)
    expect(wrapper.find('.slash-menu--previews').exists()).toBe(true)
    expect(wrapper.findAll('.slash-menu__tiles')).toHaveLength(2)
    expect(wrapper.findAll('.slash-block-preview')).toHaveLength(5)
    expect(wrapper.findAll('.slash-block-preview--fallback')).toHaveLength(0)
    expect(wrapper.find('.slash-menu__tile.is-active').attributes('title')).toBe('/ul · ul')
    await wrapper.findAll('.slash-menu__tile')[3].trigger('click')
    expect(wrapper.emitted('openEmojiPicker')).toHaveLength(1)
  })

  it('uses a fallback icon for an unknown preview id', () => {
    const wrapper = mount(EditorSlashMenu, {
      props: { open: true, query: '', activeIndex: 0, items: [item('plugin:block', 'text')], menuStyle: {}, emojiPickerOpen: false, layout: 'preview' },
      global: { plugins: [i18n] },
    })
    expect(wrapper.find('.slash-block-preview--fallback svg').exists()).toBe(true)
  })

  it('renders distinct miniatures for media, diagrams, note embeds and templates', () => {
    const ids = ['audio', 'video', 'file', 'chart', 'mermaid', 'markmap', 'note-embed', 'insert-template']
    const wrapper = mount(EditorSlashMenu, {
      props: { open: true, query: '', activeIndex: 0, items: ids.map(id => item(id, 'media')), menuStyle: {}, emojiPickerOpen: false, layout: 'preview' },
      global: { plugins: [i18n] },
    })
    const kinds = ['audio', 'video', 'file', 'chart', 'mermaid', 'markmap', 'note-embed', 'template']
    for (const kind of kinds) {
      const preview = wrapper.find(`.slash-block-preview--${kind}`)
      expect(preview.exists()).toBe(true)
      expect(preview.element.children.length).toBeGreaterThan(0)
      expect(wrapper.find(`.slash-block-preview--${kind} .pv-fallback-icon`).exists()).toBe(false)
    }
  })

  it('uses specific icons for the same commands in keycap view', () => {
    const ids = ['audio', 'video', 'file', 'chart', 'mermaid', 'markmap', 'note-embed', 'insert-template']
    const wrapper = mount(EditorSlashMenu, {
      props: { open: true, query: '', activeIndex: 0, items: ids.map(id => item(id, 'media')), menuStyle: {}, emojiPickerOpen: false, layout: 'grid' },
      global: { plugins: [i18n] },
    })
    const icons = wrapper.findAll('.slash-menu__tile-icon svg')
    expect(icons).toHaveLength(ids.length)
    expect(icons.every(icon => !icon.classes().includes('lucide-pilcrow'))).toBe(true)
  })

  it('emits select for a tile and opens the emoji picker for the emoji tile', async () => {
    const wrapper = mountMenu('grid')
    const tiles = wrapper.findAll('.slash-menu__tile')
    await tiles[1].trigger('click')
    expect(wrapper.emitted('select')?.[0]?.[0]).toMatchObject({ id: 'h1' })
    await tiles[3].trigger('click')
    expect(wrapper.emitted('openEmojiPicker')).toHaveLength(1)
    expect(wrapper.emitted('select')).toHaveLength(1)
  })
})
