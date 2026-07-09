import type { Node as PMNode } from 'prosemirror-model'
import type { EditorView, NodeView } from 'prosemirror-view'
import { resolveNodePosition, getStringAttr, selectNodeAt, type CoreNodeViewOptions, type NodeViewPosition } from './utils'

function buildHeader(): HTMLElement {
  const header = document.createElement('div')
  header.className = 'nv-draw-header'

  const left = document.createElement('div')
  left.className = 'nv-draw-header-left'

  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  icon.setAttribute('viewBox', '0 0 14 14')
  icon.setAttribute('fill', 'none')
  icon.setAttribute('stroke', 'currentColor')
  icon.setAttribute('stroke-width', '1.25')
  icon.setAttribute('stroke-linecap', 'round')
  icon.setAttribute('stroke-linejoin', 'round')
  icon.setAttribute('class', 'nv-draw-header-icon')

  // Pencil glyph
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  path.setAttribute('d', 'M9.5 1.5l3 3-8 8H1.5v-3z')
  icon.appendChild(path)

  const label = document.createElement('span')
  label.textContent = 'Drawing'

  left.append(icon, label)

  const hint = document.createElement('span')
  hint.className = 'nv-draw-open-hint'
  hint.textContent = 'Click to open canvas'

  header.append(left, hint)
  return header
}

export function createDrawNodeView(node: PMNode, view: EditorView, getPos: NodeViewPosition, options?: CoreNodeViewOptions): NodeView {
  const dom = document.createElement('div')
  dom.className = 'nv-draw-block'
  dom.dataset.empty = 'true'

  const rendered = document.createElement('div')
  rendered.className = 'nv-draw-render'

  const titleEl = document.createElement('div')
  titleEl.className = 'nv-draw-caption'

  dom.append(buildHeader(), rendered, titleEl)

  let currentNode = node
  let lastRenderedPreview = ''

  const sync = () => {
    const svgPreview = getStringAttr(currentNode, 'svgPreview')
    const title = getStringAttr(currentNode, 'title')
    const isEmpty = svgPreview.trim().length === 0

    dom.dataset.empty = isEmpty ? 'true' : 'false'
    if (svgPreview !== lastRenderedPreview) {
      if (isEmpty) {
        rendered.innerHTML = ''
        const placeholder = document.createElement('div')
        placeholder.className = 'nv-draw-empty'
        placeholder.textContent = 'Empty drawing — click to open the canvas'
        rendered.appendChild(placeholder)
      } else {
        rendered.innerHTML = svgPreview
      }
      lastRenderedPreview = svgPreview
    }

    if (title.trim()) {
      titleEl.textContent = title
      titleEl.dataset.visible = 'true'
    } else {
      titleEl.textContent = ''
      titleEl.dataset.visible = 'false'
    }
  }

  const requestOpen = () => {
    const position = resolveNodePosition(getPos)
    if (typeof position !== 'number') return
    options?.onRequestDrawOpen?.({ view, position, node: currentNode })
  }

  const onClick = (event: MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    const position = resolveNodePosition(getPos)
    if (typeof position === 'number') {
      selectNodeAt(view, position)
    }
    requestOpen()
  }

  const onDblClick = (event: MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    requestOpen()
  }

  dom.addEventListener('click', onClick)
  dom.addEventListener('dblclick', onDblClick)
  sync()

  return {
    dom,
    update(nextNode) {
      if (nextNode.type !== currentNode.type) return false
      currentNode = nextNode
      sync()
      return true
    },
    destroy() {
      dom.removeEventListener('click', onClick)
      dom.removeEventListener('dblclick', onDblClick)
    },
  }
}
