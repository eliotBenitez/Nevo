export const MIN_SCROLLBAR_THUMB_HEIGHT = 40

interface ScrollbarMetricsInput {
  scrollTop: number
  scrollHeight: number
  clientHeight: number
  trackHeight: number
}

interface TrackClickInput {
  clickOffsetY: number
  trackHeight: number
  scrollHeight: number
  clientHeight: number
}

interface ThumbDragInput {
  pointerDeltaY: number
  startThumbOffset: number
  trackHeight: number
  thumbHeight: number
  scrollHeight: number
  clientHeight: number
}

export interface ScrollbarMetrics {
  isScrollable: boolean
  thumbHeight: number
  thumbOffset: number
  maxThumbOffset: number
  maxScrollTop: number
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

export function computeScrollbarMetrics({
  scrollTop,
  scrollHeight,
  clientHeight,
  trackHeight,
}: ScrollbarMetricsInput): ScrollbarMetrics {
  if (trackHeight <= 0 || clientHeight <= 0 || scrollHeight <= clientHeight) {
    return {
      isScrollable: false,
      thumbHeight: 0,
      thumbOffset: 0,
      maxThumbOffset: 0,
      maxScrollTop: 0,
    }
  }

  const maxScrollTop = scrollHeight - clientHeight
  const thumbHeight = clamp(
    (clientHeight / scrollHeight) * trackHeight,
    MIN_SCROLLBAR_THUMB_HEIGHT,
    trackHeight,
  )
  const maxThumbOffset = trackHeight - thumbHeight
  const clampedScrollTop = clamp(scrollTop, 0, maxScrollTop)
  const thumbOffset = maxScrollTop === 0
    ? 0
    : (clampedScrollTop / maxScrollTop) * maxThumbOffset

  return {
    isScrollable: true,
    thumbHeight,
    thumbOffset,
    maxThumbOffset,
    maxScrollTop,
  }
}

export function mapTrackClickToScrollTop({
  clickOffsetY,
  trackHeight,
  scrollHeight,
  clientHeight,
}: TrackClickInput): number {
  const metrics = computeScrollbarMetrics({
    scrollTop: 0,
    scrollHeight,
    clientHeight,
    trackHeight,
  })

  if (!metrics.isScrollable || metrics.maxThumbOffset === 0) return 0

  const thumbOffset = clamp(
    clickOffsetY - metrics.thumbHeight / 2,
    0,
    metrics.maxThumbOffset,
  )

  return (thumbOffset / metrics.maxThumbOffset) * metrics.maxScrollTop
}

export function mapThumbDragToScrollTop({
  pointerDeltaY,
  startThumbOffset,
  trackHeight,
  thumbHeight: _thumbHeight,
  scrollHeight,
  clientHeight,
}: ThumbDragInput): number {
  const metrics = computeScrollbarMetrics({
    scrollTop: 0,
    scrollHeight,
    clientHeight,
    trackHeight,
  })

  if (!metrics.isScrollable) return 0
  if (metrics.maxThumbOffset === 0) return 0

  const thumbOffset = clamp(startThumbOffset + pointerDeltaY, 0, metrics.maxThumbOffset)
  return (thumbOffset / metrics.maxThumbOffset) * metrics.maxScrollTop
}
