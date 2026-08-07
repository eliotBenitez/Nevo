import {
  viewportRenderBudget,
  type ViewportRenderBudget,
} from './viewportRenderBudget'
import { isElementWithinViewportMargin } from './viewportVisibility'

export interface ViewportRenderController {
  isActive: () => boolean
  requestRender: () => void
  destroy: () => void
}

export interface ViewportRenderControllerOptions {
  render: () => void | Promise<void>
  suspend: () => void
  canSuspend?: () => boolean
  initialPlaceholderHeight?: number
  rootMargin?: string
  suspendDelayMs?: number
  budget?: ViewportRenderBudget
}

const DEFAULT_PLACEHOLDER_HEIGHT = 120
const DEFAULT_ROOT_MARGIN = '225% 0px'
const DEFAULT_SUSPEND_DELAY = 6_000

function containsBrowserSelection(dom: HTMLElement): boolean {
  const selection = window.getSelection()
  if (!selection) return false
  return Boolean(
    (selection.anchorNode && dom.contains(selection.anchorNode))
    || (selection.focusNode && dom.contains(selection.focusNode)),
  )
}

function canSuspendDom(dom: HTMLElement): boolean {
  if (dom.matches('.ProseMirror-selectednode')) return false
  if (document.activeElement && dom.contains(document.activeElement)) return false
  return !containsBrowserSelection(dom)
}

/**
 * Keeps expensive leaf-node rendering within a buffered editor viewport while
 * preserving the outer NodeView DOM and its measured height. ProseMirror still
 * owns the complete document and position map; only replaceable preview UI is
 * suspended.
 */
export function createViewportRenderController(
  dom: HTMLElement,
  options: ViewportRenderControllerOptions,
): ViewportRenderController {
  let active = false
  let destroyed = false
  let visible = false
  let observer: IntersectionObserver | null = null
  let resizeObserver: ResizeObserver | null = null
  let suspendTimer: number | null = null
  let clearPlaceholderFrame: number | null = null
  let renderRequested = false
  let rendering = false
  let renderGeneration = 0
  const budget = options.budget ?? viewportRenderBudget
  const budgetEntry = {}
  let lastMeasuredHeight = Math.max(
    1,
    options.initialPlaceholderHeight ?? DEFAULT_PLACEHOLDER_HEIGHT,
  )

  dom.dataset.viewportRenderState = 'suspended'
  dom.style.minHeight = `${lastMeasuredHeight}px`

  function cancelSuspend() {
    if (suspendTimer === null) return
    window.clearTimeout(suspendTimer)
    suspendTimer = null
  }

  function cancelPlaceholderClear() {
    if (clearPlaceholderFrame === null) return
    window.cancelAnimationFrame(clearPlaceholderFrame)
    clearPlaceholderFrame = null
  }

  function scheduleReveal(generation: number) {
    cancelPlaceholderClear()
    clearPlaceholderFrame = window.requestAnimationFrame(() => {
      clearPlaceholderFrame = window.requestAnimationFrame(() => {
        clearPlaceholderFrame = null
        if (destroyed || !active || generation !== renderGeneration) return
        dom.dataset.viewportRenderState = 'active'
        dom.style.minHeight = ''
      })
    })
  }

  async function drainRenderQueue() {
    if (rendering || destroyed || !active) return
    rendering = true
    const generation = renderGeneration
    try {
      while (renderRequested && !destroyed && active && generation === renderGeneration) {
        renderRequested = false
        await options.render()
      }
    } finally {
      rendering = false
      if (!destroyed && active && renderRequested) {
        void drainRenderQueue()
      } else if (
        !destroyed
        && active
        && generation === renderGeneration
        && dom.dataset.viewportRenderState === 'warming'
      ) {
        scheduleReveal(generation)
      }
    }
  }

  function requestRender() {
    if (destroyed || !active) return
    renderRequested = true
    void drainRenderQueue()
  }

  function activate() {
    cancelSuspend()
    budget.release(budgetEntry)
    if (!active) {
      active = true
      renderGeneration++
      dom.dataset.viewportRenderState = 'warming'
    }
    requestRender()
  }

  function canSuspend() {
    return canSuspendDom(dom) && (options.canSuspend?.() ?? true)
  }

  function suspend(): boolean {
    if (destroyed || !active || visible) return false
    if (!canSuspend()) {
      scheduleSuspend()
      return false
    }
    const measuredHeight = dom.getBoundingClientRect().height
    if (Number.isFinite(measuredHeight) && measuredHeight > 0) {
      lastMeasuredHeight = measuredHeight
    }
    active = false
    budget.release(budgetEntry)
    renderRequested = false
    renderGeneration++
    cancelPlaceholderClear()
    dom.style.minHeight = `${Math.max(1, lastMeasuredHeight)}px`
    dom.dataset.viewportRenderState = 'suspended'
    options.suspend()
    return true
  }

  function scheduleSuspend() {
    if (!active || suspendTimer !== null) return
    suspendTimer = window.setTimeout(() => {
      suspendTimer = null
      budget.retain(budgetEntry, suspend)
    }, options.suspendDelayMs ?? DEFAULT_SUSPEND_DELAY)
  }

  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver((entries) => {
      if (!active) return
      const height = entries[0]?.borderBoxSize?.[0]?.blockSize
        ?? entries[0]?.contentRect.height
        ?? 0
      if (Number.isFinite(height) && height > 0) lastMeasuredHeight = height
    })
    resizeObserver.observe(dom)
  }

  if (typeof IntersectionObserver === 'undefined') {
    queueMicrotask(() => {
      if (destroyed) return
      visible = true
      activate()
    })
  } else {
    queueMicrotask(() => {
      if (destroyed) return
      const root = dom.closest<HTMLElement>('.doc-body, .editor-surface--compact')
      const rootMargin = options.rootMargin ?? DEFAULT_ROOT_MARGIN
      observer = new IntersectionObserver((entries) => {
        const entry = entries[0]
        visible = Boolean(entry?.isIntersecting || (entry?.intersectionRatio ?? 0) > 0)
        if (visible) activate()
        else scheduleSuspend()
      }, {
        root,
        rootMargin,
      })
      observer.observe(dom)
      if (!visible && isElementWithinViewportMargin(dom, root, rootMargin)) {
        visible = true
        activate()
      }
    })
  }

  function destroy() {
    destroyed = true
    active = false
    visible = false
    renderGeneration++
    cancelSuspend()
    cancelPlaceholderClear()
    budget.release(budgetEntry)
    observer?.disconnect()
    observer = null
    resizeObserver?.disconnect()
    resizeObserver = null
  }

  return {
    isActive: () => active,
    requestRender,
    destroy,
  }
}
