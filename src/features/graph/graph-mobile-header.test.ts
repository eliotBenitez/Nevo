import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, shallowMount } from '@vue/test-utils'
import { ref } from 'vue'
import { createI18n } from 'vue-i18n'
import en from '../../locales/en.json'
import type { EdgeKind } from '../../types/graph'
import GraphView from './GraphView.vue'
import GraphControls from './components/GraphControls.vue'

const graphDataState = vi.hoisted(() => ({
  load: vi.fn(async () => {}),
}))

vi.mock('./composables/useGraphData', () => ({
  useGraphData: () => ({
    snapshot: ref(null),
    loading: ref(false),
    load: graphDataState.load,
  }),
}))

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: { en },
})

class ResizeObserverStub {
  observe() {}
  disconnect() {}
}

describe('GraphView mobile header', () => {
  beforeEach(() => {
    graphDataState.load.mockClear()
    Object.defineProperty(globalThis, 'ResizeObserver', {
      value: ResizeObserverStub,
      configurable: true,
      writable: true,
    })
    Object.defineProperty(window, 'innerWidth', { value: 390, configurable: true })
    window.dispatchEvent(new Event('resize'))
  })

  it('exposes the floating search and filter controls without graph data', async () => {
    const wrapper = mount(GraphView, {
      props: {
        workspacePath: null,
        manifest: null,
      },
      global: { plugins: [i18n] },
    })

    expect(wrapper.get('.graph-header__search-input').attributes('placeholder')).toBe('Search nodes…')
    const filterButton = wrapper.get('.graph-header__filter')
    expect(filterButton.attributes('aria-pressed')).toBe('false')

    await filterButton.trigger('click')

    expect(filterButton.attributes('aria-pressed')).toBe('true')
    wrapper.unmount()
  })

  it('forwards the GraphHeader back action to its parent', async () => {
    const wrapper = mount(GraphView, {
      props: {
        workspacePath: null,
        manifest: null,
      },
      global: { plugins: [i18n] },
    })

    await wrapper.get('.graph-header__back').trigger('click')

    expect(wrapper.emitted('back')).toHaveLength(1)
    wrapper.unmount()
  })

  it('loads the graph when a manifest is present without a filesystem workspace path', async () => {
    const wrapper = shallowMount(GraphView, {
      props: {
        workspacePath: null,
        manifest: {
          id: 'pathless-workspace',
          name: 'Pathless',
          glyph: 'C',
          gradient: 'violet',
          schemaVersion: 1,
          createdAt: '2026-08-07T00:00:00.000Z',
          rootOrder: [],
          rootNotes: [],
          tree: [],
        },
      },
      global: { plugins: [i18n] },
    })

    await Promise.resolve()

    expect(graphDataState.load).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('marks the compact control panel as expanded for mobile filters', () => {
    const wrapper = mount(GraphControls, {
      props: {
        nodeCount: 4,
        edgeCount: 3,
        showLabels: false,
        filters: new Set<EdgeKind>(['link']),
        zoom: 1,
        mobileFiltersOpen: true,
      },
      global: { plugins: [i18n] },
    })

    expect(wrapper.get('.graph-controls').classes()).toContain('graph-controls--filters-open')
    wrapper.unmount()
  })
})
