import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { describe, expect, it } from 'vitest'
import EditorFindBar from './EditorFindBar.vue'
import en from '../../../locales/en.json'

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } })

interface MountOverrides {
  open?: boolean
  replaceOpen?: boolean
  query?: string
  replacement?: string
  caseSensitive?: boolean
  wholeWord?: boolean
  regex?: boolean
  matchCount?: number
  activeIndex?: number
  hasError?: boolean
  errorReason?: 'invalid' | 'unsafe' | 'timeout'
  truncated?: boolean
  focusToken?: number
}

function mountBar(overrides: MountOverrides = {}) {
  return mount(EditorFindBar, {
    attachTo: document.body,
    props: {
      open: true,
      replaceOpen: false,
      query: '',
      replacement: '',
      caseSensitive: false,
      wholeWord: false,
      regex: false,
      matchCount: 0,
      activeIndex: -1,
      hasError: false,
      truncated: false,
      focusToken: 0,
      ...overrides,
    },
    global: { plugins: [i18n] },
  })
}

describe('EditorFindBar', () => {
  it('renders nothing when closed', () => {
    const wrapper = mountBar({ open: false })
    expect(wrapper.find('.nv-find-bar').exists()).toBe(false)
    wrapper.unmount()
  })

  it('shows the replace row only when replaceOpen is true', () => {
    const closed = mountBar({ replaceOpen: false })
    expect(closed.find('.nv-find-bar__row--replace').exists()).toBe(false)
    closed.unmount()

    const opened = mountBar({ replaceOpen: true })
    expect(opened.find('.nv-find-bar__row--replace').exists()).toBe(true)
    opened.unmount()
  })

  it('emits next on Enter and prev on Shift+Enter from the find input', async () => {
    const wrapper = mountBar({ query: 'cat', matchCount: 2, activeIndex: 0 })
    const input = wrapper.get('.nv-find-bar__input')

    await input.trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('next')).toHaveLength(1)

    await input.trigger('keydown', { key: 'Enter', shiftKey: true })
    expect(wrapper.emitted('prev')).toHaveLength(1)

    wrapper.unmount()
  })

  it('emits close on Escape from anywhere inside the bar', async () => {
    const wrapper = mountBar()
    await wrapper.get('.nv-find-bar').trigger('keydown', { key: 'Escape' })
    expect(wrapper.emitted('close')).toHaveLength(1)
    wrapper.unmount()
  })

  it('emits replace on Enter and replace-all on Ctrl+Enter from the replace input', async () => {
    const wrapper = mountBar({ replaceOpen: true })
    const replaceInput = wrapper.get('.nv-find-bar__input--replace')

    await replaceInput.trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('replace')).toHaveLength(1)

    await replaceInput.trigger('keydown', { key: 'Enter', ctrlKey: true })
    expect(wrapper.emitted('replace-all')).toHaveLength(1)

    wrapper.unmount()
  })

  it('toggles case/word/regex options via Alt+C/W/R and reflects aria-pressed', async () => {
    const wrapper = mountBar({ caseSensitive: false })
    const input = wrapper.get('.nv-find-bar__input')

    await input.trigger('keydown', { key: 'c', altKey: true })
    expect(wrapper.emitted('update:caseSensitive')?.[0]).toEqual([true])

    await input.trigger('keydown', { key: 'w', altKey: true })
    expect(wrapper.emitted('update:wholeWord')?.[0]).toEqual([true])

    await input.trigger('keydown', { key: 'r', altKey: true })
    expect(wrapper.emitted('update:regex')?.[0]).toEqual([true])

    wrapper.unmount()
  })

  it('reflects option state through aria-pressed and toggles via click', async () => {
    const wrapper = mountBar({ caseSensitive: true })
    const options = wrapper.findAll('.nv-find-bar__option')
    expect(options[0].attributes('aria-pressed')).toBe('true')

    await options[0].trigger('click')
    expect(wrapper.emitted('update:caseSensitive')?.[0]).toEqual([false])

    wrapper.unmount()
  })

  it('shows "No results" when a query has zero matches, and the match counter otherwise', () => {
    const empty = mountBar({ query: 'zzz', matchCount: 0 })
    expect(empty.get('.nv-find-bar__counter').text()).toBe('No results')
    empty.unmount()

    const found = mountBar({ query: 'cat', matchCount: 3, activeIndex: 1 })
    expect(found.get('.nv-find-bar__counter').text()).toBe('2 / 3')
    found.unmount()
  })

  it('shows an invalid-regex state and marks the input aria-invalid', () => {
    const wrapper = mountBar({ query: 'foo(', regex: true, hasError: true })
    expect(wrapper.get('.nv-find-bar__counter').text()).toBe('Invalid regex')
    expect(wrapper.get('.nv-find-bar__input').attributes('aria-invalid')).toBe('true')
    wrapper.unmount()
  })

  it('shows a distinct message for a pattern rejected as unsafe', () => {
    const wrapper = mountBar({ query: '(a+)+', regex: true, hasError: true, errorReason: 'unsafe' })
    expect(wrapper.get('.nv-find-bar__counter').text()).toBe('This pattern is too expensive to run safely — simplify it')
    wrapper.unmount()
  })

  it('shows a distinct message when a regex search times out', () => {
    const wrapper = mountBar({ query: 'cat', regex: true, hasError: true, errorReason: 'timeout' })
    expect(wrapper.get('.nv-find-bar__counter').text()).toBe('Search took too long and was stopped — try a simpler pattern')
    wrapper.unmount()
  })

  it('shows the truncated "N+" counter when the match limit was hit', () => {
    const wrapper = mountBar({ query: 'a', matchCount: 5000, activeIndex: 0, truncated: true })
    expect(wrapper.get('.nv-find-bar__counter').text()).toBe('1 / 5000+')
    wrapper.unmount()
  })

  it('disables prev/next/replace controls when there are no matches', () => {
    const wrapper = mountBar({ query: 'zzz', matchCount: 0, replaceOpen: true })
    const iconButtons = wrapper.findAll('.nv-find-bar__icon-btn')
    for (const btn of iconButtons) {
      if (btn.classes().includes('nv-find-bar__close')) continue
      expect(btn.attributes('disabled')).toBeDefined()
    }
    wrapper.unmount()
  })

  it('emits toggle-replace when the chevron button is clicked', async () => {
    const wrapper = mountBar()
    await wrapper.get('.nv-find-bar__toggle-replace').trigger('click')
    expect(wrapper.emitted('toggle-replace')).toHaveLength(1)
    wrapper.unmount()
  })
})
