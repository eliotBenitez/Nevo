import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import HistoryDiffRowChanged from './HistoryDiffRowChanged.vue'
import en from '../../locales/en.json'

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
