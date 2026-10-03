import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { describe, expect, it } from 'vitest'
import en from '../../../locales/en.json'
import NotebookSelectionOverlay from './NotebookSelectionOverlay.vue'

describe('NotebookSelectionOverlay controls', () => {
  it.each([.5, 1, 3.5])('keeps tiny edge selections reachable with distinct controls at zoom %s', zoom => {
    const view = mount(NotebookSelectionOverlay, {
      props: { bounds: { x: 0, y: 0, width: 2, height: 2 }, zoom, pageWidth: 595.28, pageHeight: 841.89, disabled: false },
      global: { plugins: [createI18n({ legacy: false, locale: 'en', messages: { en } })] },
    })
    const positions = view.findAll('.notebook-selection__handle').map(handle => {
      const [x, y] = handle.attributes('transform')!.match(/translate\(([^ ]+) ([^)]+)\)/)!.slice(1).map(Number)
      return { x: x * zoom, y: y * zoom }
    })
    expect(positions).toHaveLength(6)
    expect(positions.every(point => point.x >= 22 && point.y >= 22)).toBe(true)
    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        expect(Math.max(Math.abs(positions[i].x - positions[j].x), Math.abs(positions[i].y - positions[j].y))).toBeGreaterThanOrEqual(24)
      }
    }
    view.unmount()
  })
})
