function resolveMargin(value: string, referenceSize: number): number {
  const parsed = Number.parseFloat(value)
  if (!Number.isFinite(parsed)) return 0
  if (value.endsWith('%')) return referenceSize * parsed / 100
  return parsed
}

function resolveVerticalMargins(rootMargin: string, referenceSize: number) {
  const tokens = rootMargin.trim().split(/\s+/)
  const topToken = tokens[0] ?? '0px'
  const bottomToken = tokens.length >= 3 ? tokens[2] : topToken
  return {
    top: resolveMargin(topToken, referenceSize),
    bottom: resolveMargin(bottomToken, referenceSize),
  }
}

/**
 * Synchronous fallback for webviews that delay or suppress the first
 * IntersectionObserver notification. A zero-sized root is treated as not laid
 * out yet so callers can continue waiting for the observer.
 */
export function isElementWithinViewportMargin(
  dom: HTMLElement,
  root: HTMLElement | null,
  rootMargin: string,
): boolean {
  const viewportHeight = root
    ? root.getBoundingClientRect().height
    : window.innerHeight || document.documentElement.clientHeight
  if (!Number.isFinite(viewportHeight) || viewportHeight <= 0) return false

  const rootRect = root?.getBoundingClientRect()
  const rootTop = rootRect?.top ?? 0
  const rootBottom = rootRect?.bottom ?? viewportHeight
  const elementRect = dom.getBoundingClientRect()
  const margin = resolveVerticalMargins(rootMargin, viewportHeight)

  return elementRect.bottom >= rootTop - margin.top
    && elementRect.top <= rootBottom + margin.bottom
}
