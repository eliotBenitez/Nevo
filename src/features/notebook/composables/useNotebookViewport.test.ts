import { describe, expect, it, vi } from 'vitest'
import { createNotebookViewport, fitNotebookWidthZoom } from './useNotebookViewport'

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

describe('fit width zoom', () => {
  it('fits a narrow container and keeps 100% when the page fits', () => {
    expect(fitNotebookWidthZoom(412)).toBeCloseTo((412 - 64) / 595)
    // The fitted page plus its 30px side padding must fit a 412px phone.
    expect(fitNotebookWidthZoom(412) * 595 + 60).toBeLessThanOrEqual(412)
    expect(fitNotebookWidthZoom(1200)).toBe(1)
    expect(fitNotebookWidthZoom(0)).toBe(1)
    expect(fitNotebookWidthZoom(50)).toBe(0.35)
  })

  it('applies the fit once on first measurement and not after a user zoom', () => {
    const viewport = createNotebookViewport(() => 3)
    const element = { scrollTop: 0, clientHeight: 800, clientWidth: 412 } as HTMLElement
    viewport.onScroll({ currentTarget: element } as unknown as Event)
    expect(viewport.zoom.value).toBeCloseTo((412 - 64) / 595)
    viewport.setZoom(1)
    viewport.onScroll({ currentTarget: element } as unknown as Event)
    expect(viewport.zoom.value).toBe(1)

    const chosen = createNotebookViewport(() => 3)
    chosen.setZoom(2)
    chosen.onScroll({ currentTarget: element } as unknown as Event)
    expect(chosen.zoom.value).toBe(2)
  })
})
