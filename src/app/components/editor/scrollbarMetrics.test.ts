import { describe, expect, it } from 'vitest'
import {
  MIN_SCROLLBAR_THUMB_HEIGHT,
  computeScrollbarMetrics,
  mapThumbDragToScrollTop,
  mapTrackClickToScrollTop,
} from './scrollbarMetrics'

describe('computeScrollbarMetrics', () => {
  it('returns hidden metrics when content does not overflow', () => {
    expect(computeScrollbarMetrics({
      scrollTop: 0,
      scrollHeight: 600,
      clientHeight: 600,
      trackHeight: 540,
    })).toEqual({
      isScrollable: false,
      thumbHeight: 0,
      thumbOffset: 0,
      maxThumbOffset: 0,
      maxScrollTop: 0,
    })
  })

  it('computes thumb height and offset for overflowing content', () => {
    expect(computeScrollbarMetrics({
      scrollTop: 300,
      scrollHeight: 1200,
      clientHeight: 600,
      trackHeight: 540,
    })).toEqual({
      isScrollable: true,
      thumbHeight: 270,
      thumbOffset: 135,
      maxThumbOffset: 270,
      maxScrollTop: 600,
    })
  })

  it('enforces a minimum thumb height for long documents', () => {
    expect(computeScrollbarMetrics({
      scrollTop: 0,
      scrollHeight: 12000,
      clientHeight: 600,
      trackHeight: 200,
    })).toEqual({
      isScrollable: true,
      thumbHeight: MIN_SCROLLBAR_THUMB_HEIGHT,
      thumbOffset: 0,
      maxThumbOffset: 160,
      maxScrollTop: 11400,
    })
  })
})

describe('mapTrackClickToScrollTop', () => {
  it('centers the thumb around the clicked position within bounds', () => {
    expect(mapTrackClickToScrollTop({
      clickOffsetY: 135,
      trackHeight: 540,
      scrollHeight: 1200,
      clientHeight: 600,
    })).toBe(0)

    expect(mapTrackClickToScrollTop({
      clickOffsetY: 270,
      trackHeight: 540,
      scrollHeight: 1200,
      clientHeight: 600,
    })).toBe(300)

    expect(mapTrackClickToScrollTop({
      clickOffsetY: 500,
      trackHeight: 540,
      scrollHeight: 1200,
      clientHeight: 600,
    })).toBe(600)
  })
})

describe('mapThumbDragToScrollTop', () => {
  it('maps drag distance from pointer delta plus starting thumb offset to scrollTop', () => {
    expect(mapThumbDragToScrollTop({
      pointerDeltaY: 35,
      startThumbOffset: 100,
      trackHeight: 540,
      thumbHeight: 270,
      scrollHeight: 1200,
      clientHeight: 600,
    })).toBe(300)

    expect(mapThumbDragToScrollTop({
      pointerDeltaY: 500,
      startThumbOffset: 100,
      trackHeight: 540,
      thumbHeight: 270,
      scrollHeight: 1200,
      clientHeight: 600,
    })).toBe(600)
  })

  it('uses canonical scrollbar metrics when the provided thumb height is stale', () => {
    expect(mapThumbDragToScrollTop({
      pointerDeltaY: 20,
      startThumbOffset: 60,
      trackHeight: 200,
      thumbHeight: 80,
      scrollHeight: 12000,
      clientHeight: 600,
    })).toBe(5700)
  })

  it('ignores a non-finite thumb height when mapping drag to scrollTop', () => {
    expect(mapThumbDragToScrollTop({
      pointerDeltaY: 20,
      startThumbOffset: 60,
      trackHeight: 200,
      thumbHeight: Number.NaN,
      scrollHeight: 12000,
      clientHeight: 600,
    })).toBe(5700)
  })
})
