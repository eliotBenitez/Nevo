import type { Node as PMNode } from 'prosemirror-model'
import type { EditorView, NodeView } from 'prosemirror-view'
import {
  resolveNodePosition,
  getStringAttr,
  createLazyRenderObserver,
  selectNodeAt,
  type CoreNodeViewOptions,
  type NodeViewPosition,
} from './utils'
import { sanitizeSvg } from '../../utils/sanitizeSvg'

let renderCounter = 0

// Mermaid (~500 KB) is loaded on demand the first time a diagram becomes
// visible, keeping it out of the initial bundle. The module promise is cached
// so concurrent diagrams share a single load.
let mermaidModulePromise: Promise<typeof import('mermaid')['default']> | null = null

function loadMermaid(): Promise<typeof import('mermaid')['default']> {
  if (!mermaidModulePromise) {
    mermaidModulePromise = import('mermaid').then((mod) => mod.default)
  }
  return mermaidModulePromise
}

function getMermaidTheme(): 'dark' | 'neutral' {
  return document.documentElement.classList.contains('theme-dark') ? 'dark' : 'neutral'
}

let initializedTheme: string | null = null

async function ensureMermaid(): Promise<typeof import('mermaid')['default']> {
  const mermaid = await loadMermaid()
  const theme = getMermaidTheme()
  if (theme !== initializedTheme) {
    initializedTheme = theme
    // securityLevel 'strict' strips <script>/event handlers and HTML labels from
    // rendered diagrams. Diagram source may originate from shared/collab notes, so
    // 'loose' (which permits inline HTML/click handlers) is an XSS vector here.
    mermaid.initialize({ startOnLoad: false, theme, securityLevel: 'strict' })
  }
  return mermaid
}

function buildHeader(): HTMLElement {
  const header = document.createElement('div')
  header.className = 'nv-mermaid-header'

  const left = document.createElement('div')
  left.className = 'nv-mermaid-header-left'

  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  icon.setAttribute('viewBox', '0 0 14 14')
  icon.setAttribute('fill', 'none')
  icon.setAttribute('stroke', 'currentColor')
  icon.setAttribute('stroke-width', '1.25')
  icon.setAttribute('stroke-linecap', 'round')
  icon.setAttribute('class', 'nv-mermaid-header-icon')

  const r1 = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
  r1.setAttribute('x', '1'); r1.setAttribute('y', '1'); r1.setAttribute('width', '12'); r1.setAttribute('height', '4'); r1.setAttribute('rx', '1')
  const ln = document.createElementNS('http://www.w3.org/2000/svg', 'line')
  ln.setAttribute('x1', '7'); ln.setAttribute('y1', '5'); ln.setAttribute('x2', '7'); ln.setAttribute('y2', '9')
  const r2 = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
  r2.setAttribute('x', '1'); r2.setAttribute('y', '9'); r2.setAttribute('width', '12'); r2.setAttribute('height', '4'); r2.setAttribute('rx', '1')

  icon.append(r1, ln, r2)

  const label = document.createElement('span')
  label.textContent = 'Diagram'

  left.append(icon, label)

  const hint = document.createElement('span')
  hint.className = 'nv-mermaid-edit-hint'
  hint.textContent = 'Click to edit'

  header.append(left, hint)
  return header
}

export function createMermaidNodeView(node: PMNode, view: EditorView, getPos: NodeViewPosition, options?: CoreNodeViewOptions): NodeView {
  const dom = document.createElement('div')
  dom.className = 'nv-mermaid-block'

  const rendered = document.createElement('div')
  rendered.className = 'nv-mermaid-render'

  dom.append(buildHeader(), rendered)

  let currentNode = node
  let isVisible = false
  let pendingRender = false
  let lastRenderedCode = ''

  const sync = async () => {
    if (!isVisible) {
      pendingRender = true
      return
    }

    const code = getStringAttr(currentNode, 'code')
    const isEmpty = code.trim().length === 0
    dom.dataset.empty = isEmpty ? 'true' : 'false'

    if (isEmpty) {
      rendered.innerHTML = ''
      rendered.textContent = 'Add a diagram — click to edit'
      dom.dataset.error = 'false'
      lastRenderedCode = code
      return
    }

    try {
      const mermaid = await ensureMermaid()
      const id = `nv-mermaid-${++renderCounter}`
      const { svg } = await mermaid.render(id, code)
      rendered.innerHTML = sanitizeSvg(svg)
      dom.dataset.error = 'false'
      lastRenderedCode = code
    } catch {
      rendered.innerHTML = ''
      rendered.textContent = 'Invalid diagram syntax'
      dom.dataset.error = 'true'
      lastRenderedCode = code
    }
  }

  const lazyRender = createLazyRenderObserver(dom, () => {
    isVisible = true
    if (pendingRender) {
      pendingRender = false
      void sync()
    }
  })
  isVisible = lazyRender.isInitiallyVisible

  const requestMermaidEdit = (event?: MouseEvent) => {
    const position = resolveNodePosition(getPos)
    if (typeof position !== 'number') return
    const anchorRect = event
      ? new DOMRect(event.clientX - 5, event.clientY - 5, 10, 10)
      : dom.getBoundingClientRect()
    options?.onRequestMermaidEdit?.({ view, position, node: currentNode, anchorRect })
  }

  const onClick = (event: MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    const position = resolveNodePosition(getPos)
    if (typeof position === 'number') {
      selectNodeAt(view, position)
    }
    requestMermaidEdit(event)
  }

  dom.addEventListener('click', onClick)
  sync()

  return {
    dom,
    update(nextNode) {
      if (nextNode.type !== currentNode.type) return false
      currentNode = nextNode
      const newCode = getStringAttr(nextNode, 'code')
      if (isVisible && newCode !== lastRenderedCode) void sync()
      else if (!isVisible) pendingRender = true
      return true
    },
    destroy() {
      lazyRender.disconnect()
      dom.removeEventListener('click', onClick)
    },
  }
}
