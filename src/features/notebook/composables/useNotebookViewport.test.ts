import { describe, expect, it, vi } from 'vitest'
import { createNotebookViewport } from './useNotebookViewport'

describe('createNotebookViewport', () => {
  it('keeps one page above and below the visible page in the virtual window', () => {
    const viewport = createNotebookViewport(() => 100)
    const element = { scrollTop: viewport.rowHeight.value * 50, clientHeight: 800 } as HTMLElement
    viewport.onScroll({ currentTarget: element } as unknown as Event)

    expect(viewport.visibleRange.value).toEqual({ start: 49, end: 52 })
    expect(viewport.totalHeight.value).toBeGreaterThan(80_000)
  })

  it('clamps zoom while preserving the scroll anchor and navigates to a requested page', () => {
    const viewport = createNotebookViewport(() => 20)
    const element = { scrollTop: viewport.rowHeight.value * 4, clientHeight: 600, scrollTo: vi.fn() } as unknown as HTMLElement
    viewport.attach(() => element)
    viewport.onScroll({ currentTarget: element } as unknown as Event)
    viewport.setZoom(99)
    expect(viewport.zoom.value).toBe(3.5)
    expect(element.scrollTop).toBeCloseTo(4 * viewport.rowHeight.value)

    viewport.scrollToPage(9)
    expect(element.scrollTo).toHaveBeenCalledWith({ top: 9 * viewport.rowHeight.value, behavior: 'smooth' })
  })

  it('renders every page inside a tall zoomed viewport plus one neighbor at each edge', () => {
    const viewport = createNotebookViewport(() => 100)
    viewport.setZoom(0.35)
    const element = { scrollTop: viewport.rowHeight.value * 20, clientHeight: 1_280 } as HTMLElement
    viewport.onScroll({ currentTarget: element } as unknown as Event)

    expect(viewport.visibleRange.value.start).toBe(19)
    expect(viewport.visibleRange.value.end).toBeGreaterThan(22)
    expect(viewport.visibleRange.value.end - viewport.visibleRange.value.start).toBeGreaterThan(3)
  })
})
