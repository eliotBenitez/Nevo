import { afterEach, describe, expect, it } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import en from '../../../locales/en.json'
import ru from '../../../locales/ru.json'
import GraphHeader from './GraphHeader.vue'

const i18n = createI18n({
  legacy: false,
  locale: 'ru',
  messages: { en, ru },
})

let activeWrapper: VueWrapper | null = null

function mountHeader() {
  activeWrapper = mount(GraphHeader, {
    props: {
      searchQuery: '',
      nodeCount: 1,
      edgeCount: 5,
      mobileFiltersOpen: false,
    },
    global: { plugins: [i18n] },
  })
  return activeWrapper
}

afterEach(() => {
  activeWrapper?.unmount()
  activeWrapper = null
})

describe('GraphHeader', () => {
  it('emits back, search updates, and filter toggles', async () => {
    const wrapper = mountHeader()

    await wrapper.get('.graph-header__back').trigger('click')
    await wrapper.get('.graph-header__search-input').setValue('workspace')
    await wrapper.get('.graph-header__filter').trigger('click')

    expect(wrapper.emitted('back')).toHaveLength(1)
    expect(wrapper.emitted('update:searchQuery')).toEqual([['workspace']])
    expect(wrapper.emitted('update:mobileFiltersOpen')).toEqual([[true]])
    await wrapper.setProps({ mobileFiltersOpen: true })
    expect(wrapper.get('.graph-header__filter').attributes('aria-pressed')).toBe('true')
    await wrapper.get('.graph-header__filter').trigger('click')
    expect(wrapper.emitted('update:mobileFiltersOpen')).toEqual([[true], [false]])

    await wrapper.setProps({ searchQuery: 'controlled search' })
    expect((wrapper.get('.graph-header__search-input').element as HTMLInputElement).value).toBe('controlled search')
  })

  it('uses locale-aware plural forms for graph counts', async () => {
    const wrapper = mountHeader()

    expect(wrapper.findAll('.graph-meta-pill').map(pill => pill.text())).toEqual(['1 узел', '5 рёбер'])

    await wrapper.setProps({ nodeCount: 4, edgeCount: 21 })
    expect(wrapper.findAll('.graph-meta-pill').map(pill => pill.text())).toEqual(['4 узла', '21 ребро'])
  })
})
