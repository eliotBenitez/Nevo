import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { createNotebook } from '../../../core/notebook/codec'
import { notebookImageCorners } from '../../../core/notebook/image'
import type { NotebookImageV1 } from '../../../core/notebook/types'
import NotebookImageObject from './NotebookImageObject.vue'
import NotebookPage from './NotebookPage.vue'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))
vi.mock('../../../utils/workspaceAssetUrl', () => ({
  workspaceAssetUrl: (src: string) => {
    if (src.includes('bad')) throw new Error('Unsafe workspace asset path')
    return `nevoasset://localhost/${src}`
  },
}))

function image(overrides: Partial<NotebookImageV1> = {}): NotebookImageV1 {
  return {
    id: 'img', actionId: 'a', kind: 'image', src: '.nevo/assets/photo.png', opacity: 0.8,
    points: notebookImageCorners({ x: 100, y: 80 }, 100, 50), ...overrides,
  }
}

describe('NotebookImageObject', () => {
  it('renders an unit-square image with the quad matrix and opacity', () => {
    const wrapper = mount(NotebookImageObject, { props: { image: image() }, attachTo: document.body })
    const node = wrapper.get('image')
    expect(node.attributes('href')).toBe('nevoasset://localhost/.nevo/assets/photo.png')
    expect(node.attributes('transform')).toBe('matrix(100 0 0 50 50 55)')
    expect(node.attributes('width')).toBe('1')
    expect(node.attributes('preserveAspectRatio') ?? node.attributes('preserveaspectratio')).toBe('none')
    expect(node.attributes('opacity')).toBe('0.8')
    expect(wrapper.find('.notebook-image__outline').exists()).toBe(false)
    wrapper.unmount()
  })

  it('draws a selection outline and a placeholder when loading fails', async () => {
    const wrapper = mount(NotebookImageObject, { props: { image: image(), selected: true } })
    expect(wrapper.find('.notebook-image__outline').exists()).toBe(true)
    await wrapper.get('image').trigger('error')
    expect(wrapper.find('image').exists()).toBe(false)
    expect(wrapper.find('.notebook-image__placeholder').exists()).toBe(true)
  })

  it('shows a placeholder for an unsafe source', () => {
    const wrapper = mount(NotebookImageObject, { props: { image: image({ src: '.nevo/assets/bad.png' }) } })
    expect(wrapper.find('image').exists()).toBe(false)
    expect(wrapper.find('.notebook-image__placeholder').exists()).toBe(true)
  })
})

describe('NotebookPage with images', () => {
  it('renders images and ink in z-order and moves selected images with the move preview', () => {
    const page = createNotebook().pages[0]
    page.objects = [
      { id: 's1', actionId: 's1', kind: 'stroke', color: '#000000', width: 2, opacity: 1, points: [{ x: 10, y: 10 }, { x: 20, y: 20 }] },
      image(),
      { id: 's2', actionId: 's2', kind: 'stroke', color: '#000000', width: 2, opacity: 1, points: [{ x: 30, y: 30 }, { x: 40, y: 40 }] },
    ]
    const wrapper = mount(NotebookPage, { props: {
      page, pageNumber: 1, zoom: 1, tool: 'move',
      activePoints: [{ x: 0, y: 0 }, { x: 10, y: 5 }],
      strokeColor: '#000000', strokeWidth: 1.5, markerWidth: 12, eraserDiameter: 12,
      selectedObjectIds: ['img'], penActive: false, lineDash: 'solid',
    } })
    const children = Array.from(wrapper.get('.notebook-ink').element.children).map(element => element.tagName.toLowerCase())
    expect(children).toEqual(['path', 'g', 'path'])
    expect(wrapper.get('.notebook-image').attributes('transform')).toBe('translate(10 5)')
    wrapper.unmount()
  })
})
