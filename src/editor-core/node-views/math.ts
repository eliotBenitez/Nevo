import type { Node as PMNode } from 'prosemirror-model'
import type { EditorView, NodeView } from 'prosemirror-view'
import { isKatexLoaded, loadKatex, renderKatexToString } from '../../utils/katex'
import {
  resolveNodePosition,
  getStringAttr,
  createLazyRenderObserver,
  selectNodeAt,
  type CoreNodeViewOptions,
  type NodeViewPosition,
} from './utils'

function formatKatexError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error)
  return raw.replace(/^KaTeX parse error:\s*/, '').trim() || 'Invalid formula'
}

export function createMathNodeView(node: PMNode, view: EditorView, getPos: NodeViewPosition, options?: CoreNodeViewOptions): NodeView {
  const isInline = node.type.name === 'math_inline'
  const dom = document.createElement(isInline ? 'span' : 'div')
  dom.className = isInline ? 'nv-math-inline' : 'nv-math-block'

  const rendered = document.createElement(isInline ? 'span' : 'div')
  rendered.className = 'nv-math-render'

  const errorEl = document.createElement(isInline ? 'span' : 'div')
  errorEl.className = 'nv-math-error'
  errorEl.hidden = true

  dom.append(rendered, errorEl)

  let currentNode = node
  let isVisible = false
  let pendingRender = false
  let lastRenderedLatex: string | null = null
  let lastRenderedDisplayMode: boolean | null = null

  const sync = () => {
    if (!isVisible) {
      pendingRender = true
      return
    }

    const latex = getStringAttr(currentNode, 'latex')
    const displayMode = currentNode.type.name === 'math_block' || currentNode.attrs.displayMode === true

    // KaTeX is loaded lazily. Until it is ready show the raw LaTeX as a placeholder
    // and re-render once the module resolves.
    if (!isKatexLoaded()) {
      const isEmpty = latex.trim().length === 0
      dom.dataset.empty = isEmpty ? 'true' : 'false'
      rendered.textContent = latex || '…'
      void loadKatex().then(() => {
        lastRenderedLatex = null
        lastRenderedDisplayMode = null
        sync()
      })
      return
    }

    if (latex === lastRenderedLatex && displayMode === lastRenderedDisplayMode) return

    const isEmpty = latex.trim().length === 0
    dom.dataset.empty = isEmpty ? 'true' : 'false'

    try {
      rendered.innerHTML = renderKatexToString(latex || '\\;', { displayMode, throwOnError: true })
      dom.dataset.error = 'false'
      errorEl.hidden = true
      errorEl.textContent = ''
    } catch (error) {
      rendered.textContent = latex || '(empty formula)'
      dom.dataset.error = 'true'
      errorEl.textContent = formatKatexError(error)
      errorEl.hidden = false
    }
    lastRenderedLatex = latex
    lastRenderedDisplayMode = displayMode
  }

  const lazyRender = createLazyRenderObserver(dom, () => {
    isVisible = true
    if (pendingRender) {
      pendingRender = false
      sync()
    }
  })
  isVisible = lazyRender.isInitiallyVisible

  const requestMathEdit = (event?: MouseEvent) => {
    const position = resolveNodePosition(getPos)
    if (typeof position !== 'number') return
    const anchorRect = event
      ? new DOMRect(event.clientX - 5, event.clientY - 5, 10, 10)
      : dom.getBoundingClientRect()
    options?.onRequestMathEdit?.({ view, position, node: currentNode, isInline, anchorRect })
  }

  const onClick: EventListener = (event) => {
    event.preventDefault()
    event.stopPropagation()
    const mouseEvent = event as MouseEvent
    const position = resolveNodePosition(getPos)
    if (typeof position === 'number') {
      selectNodeAt(view, position)
    }
    requestMathEdit(mouseEvent)
  }

  dom.addEventListener('click', onClick)
  sync()

  return {
    dom,
    update(nextNode) {
      if (nextNode.type !== currentNode.type) return false
      currentNode = nextNode
      const newLatex = getStringAttr(nextNode, 'latex')
      const newDisplayMode = nextNode.type.name === 'math_block' || nextNode.attrs.displayMode === true
      if (isVisible && (newLatex !== lastRenderedLatex || newDisplayMode !== lastRenderedDisplayMode)) sync()
      else if (!isVisible) pendingRender = true
      return true
    },
    destroy() {
      lazyRender.disconnect()
      dom.removeEventListener('click', onClick)
    },
  }
}
