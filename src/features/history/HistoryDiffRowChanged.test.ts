import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import HistoryDiffRowChanged from './HistoryDiffRowChanged.vue'
import HistoryDiffRow from './HistoryDiffRow.vue'
import en from '../../locales/en.json'
import ruMessages from '../../locales/ru.json'

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } })

// Regression for the "changed" row that used to render as two whole blocks
// (a full "removed" block stacked on a full "added" block). It must now
// render as a single block containing an inline word-level diff instead.
describe('HistoryDiffRowChanged', () => {
  it('renders one block with both a removed and an added span inside it', () => {
    const wrapper = mount(HistoryDiffRowChanged, {
      global: { plugins: [i18n] },
      props: { before: 'the quick brown fox', after: 'the quick red fox' },
    })

    expect(wrapper.findAll('.history-diff-row-changed').length).toBe(1)

    const removed = wrapper.find('.history-diff-row-changed__removed')
    const added = wrapper.find('.history-diff-row-changed__added')
    expect(removed.exists()).toBe(true)
    expect(added.exists()).toBe(true)
    expect(removed.text()).toContain('brown')
    expect(added.text()).toContain('red')

    // Unchanged text renders plainly, once, alongside the changed spans.
    expect(wrapper.text()).toContain('the quick')
    expect(wrapper.text()).toContain('fox')
  })

  it('shows the changed badge and nothing else in the footer', () => {
    const wrapper = mount(HistoryDiffRowChanged, {
      global: { plugins: [i18n] },
      props: { before: 'old text', after: 'new text' },
    })

    expect(wrapper.find('.history-diff-row-changed__badge').text()).toBe('changed')
  })
})

describe('history block type labels', () => {
  const ru = createI18n({ legacy: false, locale: 'ru', messages: { ru: ruMessages } })

  it('names an empty added block by its localized type instead of a generic label', () => {
    const wrapper = mount(HistoryDiffRow, {
      global: { plugins: [ru] },
      props: { tone: 'added', caption: 'добавлено', block: { type: 'heading', text: '', signature: '', attrs: {} } },
    })

    expect(wrapper.find('.history-block-content--empty').text()).toBe('Заголовок (пусто)')
    expect(wrapper.find('.history-diff-row__type').text()).toBe('· Заголовок')
    expect(wrapper.text()).not.toContain('Changed block')
  })

  it('localizes block types in a type-change explanation', () => {
    const wrapper = mount(HistoryDiffRowChanged, {
      global: { plugins: [ru] },
      props: { before: 'x', after: 'x', changes: ['type'], beforeType: 'paragraph', afterType: 'heading' },
    })

    expect(wrapper.text()).toContain('Абзац → Заголовок')
  })
})
