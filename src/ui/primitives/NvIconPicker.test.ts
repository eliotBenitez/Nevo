import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { nextTick } from 'vue'
import NvIconPicker from './NvIconPicker.vue'
import en from '../../locales/en.json'

const fixtures = vi.hoisted(() => {
  const emojiItems = Array.from({ length: 250 }, (_, index) => ({
    value: `emoji-${index}`,
    name: index === 240 ? 'beyond-window' : `test emoji ${index}`,
    keywords: index === 240 ? ['beyond-window'] : [],
  }))
  const emojiCategories = [
    { id: 'first', labelKey: 'workspace.iconPicker.categories.smileys', items: emojiItems.slice(0, 125) },
    { id: 'second', labelKey: 'workspace.iconPicker.categories.people', items: emojiItems.slice(125) },
  ]

  const searchableIcons = Array.from({ length: 250 }, (_, index) => ({
    exportName: `TestIcon${index}`,
    token: `lucide:test-icon-${index}`,
    label: `Test Icon ${index}`,
    labelLower: `test icon ${index}`,
    component: 'span',
  }))

  const getSearchableIcons = vi.fn(() => searchableIcons)
  return { emojiCategories, searchableIcons, getSearchableIcons, filterEmojis: vi.fn(async (categories: typeof emojiCategories) => categories) }
})

vi.mock('./iconPickerEmoji', () => ({
  emojiCategories: fixtures.emojiCategories,
  filterUnsupportedEmojisAsync: fixtures.filterEmojis,
}))

vi.mock('./iconPickerIcons', () => ({
  searchableIcons: fixtures.searchableIcons,
  getSearchableIcons: fixtures.getSearchableIcons,
}))

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: { en },
})

function mountPicker(props: { value?: string; tabs?: ('emoji' | 'icons')[]; autofocus?: boolean } = {}) {
  return mount(NvIconPicker, {
    attachTo: document.body,
    global: { plugins: [i18n] },
    props: { value: '', ...props },
  })
}

function setScrollable(element: Element) {
  Object.defineProperties(element, {
    scrollHeight: { configurable: true, value: 800 },
    clientHeight: { configurable: true, value: 180 },
    scrollTop: { configurable: true, writable: true, value: 700 },
  })
}

afterEach(() => {
  document.body.innerHTML = ''
  fixtures.filterEmojis.mockClear()
  fixtures.getSearchableIcons.mockClear()
})

describe('NvIconPicker', () => {
  it('focuses the search field when autofocus is enabled', async () => {
    const wrapper = mountPicker({ autofocus: true })

    await nextTick()

    expect(document.activeElement).toBe(wrapper.get('.nv-icon-picker__search').element)
    wrapper.unmount()
  })

  it('renders only the first progressive window initially', async () => {
    const wrapper = mountPicker()
    await nextTick()

    expect(wrapper.findAll('.nv-icon-picker__item')).toHaveLength(120)
    wrapper.unmount()
  })

  it('appends entries as the scroll container approaches its end', async () => {
    const wrapper = mountPicker()
    await nextTick()
    const body = wrapper.get('.nv-icon-picker__body')
    setScrollable(body.element)

    await body.trigger('scroll')
    await nextTick()
    await body.trigger('scroll')
    await nextTick()

    expect(wrapper.findAll('.nv-icon-picker__item')).toHaveLength(250)
    expect(wrapper.find('button[title="test emoji 249"]').exists()).toBe(true)
    expect(wrapper.findAll('.nv-icon-picker__category-title').map((title) => title.text())).toEqual(['Smileys', 'People'])
    wrapper.unmount()
  })

  it('searches the complete catalogue beyond the initial window', async () => {
    const wrapper = mountPicker()
    await wrapper.get('.nv-icon-picker__search').setValue('beyond-window')

    expect(wrapper.findAll('.nv-icon-picker__item')).toHaveLength(1)
    expect(wrapper.get('button[title="beyond-window"]').text()).toBe('emoji-240')
    wrapper.unmount()
  })

  it('renders icon results progressively after switching tabs and clears search', async () => {
    const wrapper = mountPicker()
    await wrapper.get('.nv-icon-picker__search').setValue('icon 240')
    await wrapper.findAll('.nv-icon-picker__tab')[1].trigger('click')
    await nextTick()

    expect((wrapper.get('.nv-icon-picker__search').element as HTMLInputElement).value).toBe('')
    expect(wrapper.findAll('.nv-icon-picker__item')).toHaveLength(120)
    wrapper.unmount()
  })

  it('resets the visible limit and scroll position when the search changes', async () => {
    const wrapper = mountPicker()
    await wrapper.findAll('.nv-icon-picker__tab')[1].trigger('click')
    const body = wrapper.get('.nv-icon-picker__body')
    setScrollable(body.element)
    await body.trigger('scroll')
    await nextTick()
    expect(wrapper.findAll('.nv-icon-picker__item')).toHaveLength(240)

    await wrapper.get('.nv-icon-picker__search').setValue('icon 240')
    await nextTick()

    expect(wrapper.findAll('.nv-icon-picker__item')).toHaveLength(1)
    expect((body.element as HTMLElement).scrollTop).toBe(0)
    wrapper.unmount()
  })

  it('expands the window when keyboard focus approaches its boundary', async () => {
    const wrapper = mountPicker()
    await nextTick()

    const boundaryItem = wrapper.findAll('.nv-icon-picker__item')[110].element as HTMLElement
    boundaryItem.focus()
    await nextTick()

    expect(wrapper.findAll('.nv-icon-picker__item').length).toBeGreaterThan(120)
    wrapper.unmount()
  })

  it('finds and selects an icon beyond the initial window through search', async () => {
    const wrapper = mountPicker({ tabs: ['icons'] })
    await wrapper.get('.nv-icon-picker__search').setValue('icon 240')
    await wrapper.get('button[title="Test Icon 240"]').trigger('click')

    expect(wrapper.emitted('select')?.[0]).toEqual(['lucide:test-icon-240'])
    wrapper.unmount()
  })

  it('emits the existing selected emoji or icon token', async () => {
    const wrapper = mountPicker()
    await wrapper.get('button[title="test emoji 0"]').trigger('click')
    await wrapper.findAll('.nv-icon-picker__tab')[1].trigger('click')
    await wrapper.get('button[title="Test Icon 0"]').trigger('click')

    expect(wrapper.emitted('select')?.map(([value]) => value)).toEqual(['emoji-0', 'lucide:test-icon-0'])
    wrapper.unmount()
  })

  it('does not probe emoji when opened directly on the icons tab', async () => {
    const wrapper = mountPicker({ tabs: ['icons'] })
    await nextTick()

    expect(fixtures.filterEmojis).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('does not build the icon catalogue until the icons tab is opened', async () => {
    const wrapper = mountPicker()
    await nextTick()
    expect(fixtures.getSearchableIcons).not.toHaveBeenCalled()

    await wrapper.findAll('.nv-icon-picker__tab')[1].trigger('click')
    await nextTick()

    expect(fixtures.getSearchableIcons).toHaveBeenCalledOnce()
    wrapper.unmount()
  })
})
