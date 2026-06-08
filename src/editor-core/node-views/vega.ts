import type { Node as PMNode } from 'prosemirror-model'
import { NodeSelection } from 'prosemirror-state'
import type { EditorView, NodeView } from 'prosemirror-view'
import { resolveNodePosition, getStringAttr, type CoreNodeViewOptions, type NodeViewPosition } from './utils'

let vegaEmbedModule: typeof import('vega-embed')['default'] | null = null

async function loadVegaEmbed() {
  if (vegaEmbedModule) return vegaEmbedModule
  const mod = await import('vega-embed')
  vegaEmbedModule = mod.default
  return vegaEmbedModule
}

function isDarkTheme(): boolean {
  return document.documentElement.classList.contains('theme-dark')
}

function buildHeader(): HTMLElement {
  const header = document.createElement('div')
  header.className = 'nv-vega-header'

  const left = document.createElement('div')
  left.className = 'nv-vega-header-left'

  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  icon.setAttribute('viewBox', '0 0 14 14')
  icon.setAttribute('fill', 'none')
  icon.setAttribute('stroke', 'currentColor')
  icon.setAttribute('stroke-width', '1.25')
  icon.setAttribute('stroke-linecap', 'round')
  icon.setAttribute('stroke-linejoin', 'round')
  icon.setAttribute('class', 'nv-vega-header-icon')

  const r1 = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
  r1.setAttribute('x', '1'); r1.setAttribute('y', '8'); r1.setAttribute('width', '3'); r1.setAttribute('height', '5'); r1.setAttribute('rx', '0.5')
  const r2 = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
  r2.setAttribute('x', '5.5'); r2.setAttribute('y', '5'); r2.setAttribute('width', '3'); r2.setAttribute('height', '8'); r2.setAttribute('rx', '0.5')
  const r3 = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
  r3.setAttribute('x', '10'); r3.setAttribute('y', '1'); r3.setAttribute('width', '3'); r3.setAttribute('height', '12'); r3.setAttribute('rx', '0.5')

  icon.append(r1, r2, r3)

  const label = document.createElement('span')
  label.textContent = 'Chart'

  left.append(icon, label)

  const hint = document.createElement('span')
  hint.className = 'nv-vega-edit-hint'
  hint.textContent = 'Click to edit'

  header.append(left, hint)
  return header
}

export function createVegaNodeView(node: PMNode, view: EditorView, getPos: NodeViewPosition, options?: CoreNodeViewOptions): NodeView {
  const dom = document.createElement('div')
  dom.className = 'nv-vega-block'

  const rendered = document.createElement('div')
  rendered.className = 'nv-vega-render'

  dom.append(buildHeader(), rendered)

  let currentNode = node
  let isVisible = typeof IntersectionObserver === 'undefined'
  let pendingRender = false
  let lastRenderedSpec = ''
  let observer: IntersectionObserver | null = null
  let currentView: { finalize: () => void } | null = null

  const sync = async () => {
    if (!isVisible) {
      pendingRender = true
      return
    }

    const specStr = getStringAttr(currentNode, 'spec')
    const isEmpty = specStr.trim().length === 0 || specStr.trim() === '{}'
    dom.dataset.empty = isEmpty ? 'true' : 'false'

    if (currentView) {
      currentView.finalize()
      currentView = null
    }

    if (isEmpty) {
      rendered.innerHTML = ''
      rendered.textContent = 'Add a chart — click to edit'
      dom.dataset.error = 'false'
      lastRenderedSpec = specStr
      return
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(specStr)
    } catch {
      rendered.innerHTML = ''
      rendered.textContent = 'Invalid JSON'
      dom.dataset.error = 'true'
      lastRenderedSpec = specStr
      return
    }

    try {
      rendered.innerHTML = ''
      const embed = await loadVegaEmbed()
      const result = await embed(rendered, parsed as any, {
        actions: false,
        renderer: 'svg',
        theme: isDarkTheme() ? 'dark' : undefined,
      })
      currentView = result.view
      dom.dataset.error = 'false'
      lastRenderedSpec = specStr
    } catch {
      rendered.innerHTML = ''
      rendered.textContent = 'Invalid chart specification'
      dom.dataset.error = 'true'
      lastRenderedSpec = specStr
    }
  }

  if (typeof IntersectionObserver !== 'undefined') {
    observer = new IntersectionObserver((entries) => {
      if (!entries[0]?.isIntersecting) return
      isVisible = true
      observer?.disconnect()
      observer = null
      if (pendingRender) {
        pendingRender = false
        void sync()
      }
    }, { rootMargin: '200px' })
    observer.observe(dom)
  }

  const requestVegaEdit = (event?: MouseEvent) => {
    const position = resolveNodePosition(getPos)
    if (typeof position !== 'number') return
    const anchorRect = event
      ? new DOMRect(event.clientX - 5, event.clientY - 5, 10, 10)
      : dom.getBoundingClientRect()
    options?.onRequestVegaEdit?.({ view, position, node: currentNode, anchorRect })
  }

  const onClick = (event: MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    const position = resolveNodePosition(getPos)
    if (typeof position === 'number') {
      view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, position)))
    }
    requestVegaEdit(event)
  }

  dom.addEventListener('click', onClick)
  sync()

  return {
    dom,
    update(nextNode) {
      if (nextNode.type !== currentNode.type) return false
      currentNode = nextNode
      const newSpec = getStringAttr(nextNode, 'spec')
      if (isVisible && newSpec !== lastRenderedSpec) void sync()
      else if (!isVisible) pendingRender = true
      return true
    },
    destroy() {
      observer?.disconnect()
      if (currentView) {
        currentView.finalize()
        currentView = null
      }
      dom.removeEventListener('click', onClick)
    },
  }
}
