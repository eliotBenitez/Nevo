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

import { transformMarkmap, type MarkmapInstance } from '../../utils/markmap/markmapCore'

const BASE_OPTIONS = { autoFit: true, duration: 200, maxWidth: 320, fitRatio: 0.92 }

function buildHeader(): HTMLElement {
  const header = document.createElement('div')
  header.className = 'nv-markmap-header'

  const left = document.createElement('div')
  left.className = 'nv-markmap-header-left'

  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  icon.setAttribute('viewBox', '0 0 14 14')
  icon.setAttribute('fill', 'none')
  icon.setAttribute('stroke', 'currentColor')
  icon.setAttribute('stroke-width', '1.25')
  icon.setAttribute('stroke-linecap', 'round')
  icon.setAttribute('stroke-linejoin', 'round')
  icon.setAttribute('class', 'nv-markmap-header-icon')

  const trunk = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  trunk.setAttribute('d', 'M1 7h3')
  const branchUp = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  branchUp.setAttribute('d', 'M4 7c2 0 2-3.5 4-3.5h2')
  const branchDown = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  branchDown.setAttribute('d', 'M4 7c2 0 2 3.5 4 3.5h2')
  const c1 = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
  c1.setAttribute('cx', '1'); c1.setAttribute('cy', '7'); c1.setAttribute('r', '1')
  const c2 = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
  c2.setAttribute('cx', '11'); c2.setAttribute('cy', '3.5'); c2.setAttribute('r', '1')
  const c3 = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
  c3.setAttribute('cx', '11'); c3.setAttribute('cy', '10.5'); c3.setAttribute('r', '1')

  icon.append(trunk, branchUp, branchDown, c1, c2, c3)

  const label = document.createElement('span')
  label.textContent = 'Mind Map'

  left.append(icon, label)

  const hint = document.createElement('span')
  hint.className = 'nv-markmap-edit-hint'
  hint.textContent = 'Click to edit'

  header.append(left, hint)
  return header
}

export function createMarkmapNodeView(node: PMNode, view: EditorView, getPos: NodeViewPosition, options?: CoreNodeViewOptions): NodeView {
  const dom = document.createElement('div')
  dom.className = 'nv-markmap-block'

  const header = buildHeader()

  const rendered = document.createElement('div')
  rendered.className = 'nv-markmap-render'

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.classList.add('nv-markmap-svg')
  rendered.append(svg)

  const placeholder = document.createElement('div')
  placeholder.className = 'nv-markmap-placeholder'
  placeholder.textContent = 'Add a mind map — click header to edit'
  rendered.append(placeholder)

  dom.append(header, rendered)

  let currentNode = node
  let isVisible = false
  let pendingRender = false
  let lastRenderedMarkdown = ''
  let markmap: MarkmapInstance | null = null

  const sync = async () => {
    if (!isVisible) {
      pendingRender = true
      return
    }

    const markdown = getStringAttr(currentNode, 'markdown')
    const isEmpty = markdown.trim().length === 0
    dom.dataset.empty = isEmpty ? 'true' : 'false'

    if (isEmpty) {
      if (markmap) {
        markmap.destroy()
        markmap = null
      }
      placeholder.style.display = ''
      dom.dataset.error = 'false'
      lastRenderedMarkdown = markdown
      return
    }

    try {
      const { view, root, options } = await transformMarkmap(markdown)
      const opts = { ...BASE_OPTIONS, ...options }
      placeholder.style.display = 'none'
      if (markmap) {
        markmap.setOptions(opts)
        markmap.setData(root)
        void markmap.fit()
      } else {
        markmap = view.Markmap.create(svg, opts as never, root as never) as MarkmapInstance
      }
      dom.dataset.error = 'false'
      lastRenderedMarkdown = markdown
    } catch {
      if (markmap) {
        markmap.destroy()
        markmap = null
      }
      placeholder.style.display = ''
      placeholder.textContent = 'Invalid mind map'
      dom.dataset.error = 'true'
      lastRenderedMarkdown = markdown
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

  const requestMarkmapEdit = (event?: MouseEvent) => {
    const position = resolveNodePosition(getPos)
    if (typeof position !== 'number') return
    const anchorRect = event
      ? new DOMRect(event.clientX - 5, event.clientY - 5, 10, 10)
      : dom.getBoundingClientRect()
    options?.onRequestMarkmapEdit?.({ view, position, node: currentNode, anchorRect })
  }

  const onHeaderClick = (event: MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    const position = resolveNodePosition(getPos)
    if (typeof position === 'number') {
      selectNodeAt(view, position)
    }
    requestMarkmapEdit(event)
  }

  // Keep the interactive map body (zoom/pan/fold) isolated from ProseMirror
  // selection, block-selection plugin, and page scroll.
  const stopBubble = (event: Event) => event.stopPropagation()

  // The node is `draggable: true` (moved via the block handle grip), so a
  // mousedown+drag inside the map body would otherwise start a native node
  // drag instead of panning/folding. Cancel it so the map stays interactive.
  const onRenderedDragStart = (event: DragEvent) => {
    event.preventDefault()
    event.stopPropagation()
  }

  header.addEventListener('click', onHeaderClick)
  rendered.addEventListener('mousedown', stopBubble)
  rendered.addEventListener('pointerdown', stopBubble)
  rendered.addEventListener('wheel', stopBubble, { passive: true })
  rendered.addEventListener('dragstart', onRenderedDragStart)

  void sync()

  return {
    dom,
    update(nextNode) {
      if (nextNode.type !== currentNode.type) return false
      currentNode = nextNode
      const newMarkdown = getStringAttr(nextNode, 'markdown')
      if (isVisible && newMarkdown !== lastRenderedMarkdown) void sync()
      else if (!isVisible) pendingRender = true
      return true
    },
    destroy() {
      lazyRender.disconnect()
      if (markmap) {
        markmap.destroy()
        markmap = null
      }
      header.removeEventListener('click', onHeaderClick)
      rendered.removeEventListener('mousedown', stopBubble)
      rendered.removeEventListener('pointerdown', stopBubble)
      rendered.removeEventListener('wheel', stopBubble)
      rendered.removeEventListener('dragstart', onRenderedDragStart)
    },
  }
}
