import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import NotebookPage from './NotebookPage.vue'
import { createNotebook } from '../../../core/notebook/codec'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))

describe('NotebookPage move preview', () => {
  it('constrains a large selection without overflowing the JavaScript argument stack', () => {
    const page = createNotebook().pages[0]
    page.objects = Array.from({ length: 40 }, (_, index) => ({
      id: `stroke-${index}`, actionId: `action-${index}`, kind: 'stroke' as const,
      color: '#000000', width: 2, opacity: 1,
      points: Array.from({ length: 4_096 }, (_, point) => ({ x: 10 + point / 100, y: 20 })),
    }))
    const wrapper = mount(NotebookPage, { props: {
      page, pageNumber: 1, zoom: 1, tool: 'move',
      activePoints: [{ x: 0, y: 0 }, { x: -100, y: -100 }],
      strokeColor: '#000000', strokeWidth: 1.5, markerWidth: 12, eraserDiameter: 12,
      selectedObjectIds: page.objects.map(object => object.id), penActive: false, lineDash: 'solid',
    } })
    expect(wrapper.get('.notebook-ink path').attributes('transform')).toBe('translate(-9 -19)')
    wrapper.unmount()
  })

  it('draws a dashed straight-line preview as multiple filled marks', () => {
    const page = createNotebook().pages[0]
    const wrapper = mount(NotebookPage, { props: {
      page, pageNumber: 1, zoom: 1, tool: 'line',
      activePoints: [{ x: 20, y: 20 }, { x: 120, y: 20 }],
      strokeColor: '#000000', strokeWidth: 4, markerWidth: 12, eraserDiameter: 12,
      selectedObjectIds: [], penActive: false, lineDash: 'dashed',
    } })
    expect(wrapper.findAll('.notebook-line-preview path').length).toBeGreaterThan(1)
    wrapper.unmount()
  })

  it('renders a closed shape preview for a shape tool', () => {
    const page = createNotebook().pages[0]
    const wrapper = mount(NotebookPage, { props: {
      page, pageNumber: 1, zoom: 1, tool: 'rectangle',
      activePoints: [{ x: 20, y: 20 }, { x: 120, y: 80 }],
      strokeColor: '#000000', strokeWidth: 2, markerWidth: 12, eraserDiameter: 12,
      selectedObjectIds: [], penActive: false, lineDash: 'solid',
    } })
    expect(wrapper.get('.notebook-shape-preview path').attributes('d')).toContain('Z')
    wrapper.unmount()
  })
})

describe('NotebookPage ghost', () => {
  const props = () => ({
    page: createNotebook().pages[0], pageNumber: 3, zoom: 1, tool: 'pen' as const, activePoints: [],
    strokeColor: '#000000', strokeWidth: 1.5, markerWidth: 12, eraserDiameter: 12,
    selectedObjectIds: [], penActive: false, lineDash: 'solid' as const,
  })

  it('announces the ghost page, dims its number, and otherwise renders the same paper', () => {
    const regular = mount(NotebookPage, { props: props() })
    const ghost = mount(NotebookPage, { props: { ...props(), ghost: true } })
    expect(ghost.get('.notebook-page').attributes('aria-label')).toBe('notebook.pages.ghost')
    expect(ghost.get('.notebook-page-shell').attributes('aria-label')).toBe('notebook.pages.ghost')
    expect(ghost.get('.notebook-page-gutter').classes()).toContain('notebook-page-gutter--ghost')
    expect(ghost.get('.notebook-page-gutter').text()).toBe('3')
    expect(regular.get('.notebook-page').attributes('aria-label')).toBe('notebook.pages.accessibleSummary')
    expect(regular.get('.notebook-page-gutter').classes()).not.toContain('notebook-page-gutter--ghost')
    expect(ghost.findAll('.notebook-paper-lines line')).toHaveLength(regular.findAll('.notebook-paper-lines line').length)
    regular.unmount()
    ghost.unmount()
  })
})
