import type { Node as PMNode } from 'prosemirror-model'
import type { EditorView, NodeView } from 'prosemirror-view'
import { resolveNodePosition, type CoreNodeViewOptions, type NodeViewPosition } from './utils'

export function createChecklistItemNodeView(node: PMNode, view: EditorView, getPos: NodeViewPosition): NodeView {
  const dom = document.createElement('div')
  dom.className = 'nv-checklist-item'

  const checkbox = document.createElement('button')
  checkbox.type = 'button'
  checkbox.className = 'nv-checklist-checkbox'

  const contentDOM = document.createElement('div')
  contentDOM.className = 'nv-checklist-content'

  dom.append(checkbox, contentDOM)

  let currentNode = node

  const sync = () => {
    const checked = currentNode.attrs.checked === true
    dom.dataset.checked = checked ? 'true' : 'false'
    checkbox.textContent = checked ? '☑' : '☐'
  }

  const onMouseDown = (event: MouseEvent) => { event.preventDefault() }

  const onClick = (event: MouseEvent) => {
    event.preventDefault()
    const pos = resolveNodePosition(getPos)
    if (typeof pos !== 'number') return
    view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, { ...currentNode.attrs, checked: currentNode.attrs.checked !== true }))
  }

  checkbox.addEventListener('mousedown', onMouseDown)
  checkbox.addEventListener('click', onClick)
  sync()

  return {
    dom,
    contentDOM,
    update(nextNode) {
      if (nextNode.type !== currentNode.type) return false
      currentNode = nextNode
      sync()
      return true
    },
    destroy() {
      checkbox.removeEventListener('mousedown', onMouseDown)
      checkbox.removeEventListener('click', onClick)
    },
  }
}

export function createCalloutNodeView(node: PMNode, view: EditorView, getPos: NodeViewPosition, options?: CoreNodeViewOptions): NodeView {
  const dom = document.createElement('div')
  dom.className = 'nv-callout'

  const icon = document.createElement('button')
  icon.type = 'button'
  icon.className = 'nv-callout-icon'
  icon.contentEditable = 'false'
  icon.setAttribute('aria-label', 'Change callout icon')

  const contentDOM = document.createElement('div')
  contentDOM.className = 'nv-callout-content'

  dom.append(icon, contentDOM)

  let currentNode = node

  const sync = () => {
    const iconValue = typeof currentNode.attrs.icon === 'string' ? currentNode.attrs.icon : '💡'
    const variantValue = typeof currentNode.attrs.variant === 'string' ? currentNode.attrs.variant : 'info'
    dom.dataset.variant = variantValue
    icon.textContent = iconValue
  }

  const onMouseDown = (event: MouseEvent) => { event.preventDefault() }

  const onClick = (event: MouseEvent) => {
    event.preventDefault()
    const pos = resolveNodePosition(getPos)
    if (typeof pos !== 'number') return
    options?.onRequestCalloutIconPick?.({
      view,
      position: pos,
      node: currentNode,
      anchorRect: icon.getBoundingClientRect(),
    })
  }

  icon.addEventListener('mousedown', onMouseDown)
  icon.addEventListener('click', onClick)
  sync()

  return {
    dom,
    contentDOM,
    update(nextNode) {
      if (nextNode.type !== currentNode.type) return false
      currentNode = nextNode
      sync()
      return true
    },
    destroy() {
      icon.removeEventListener('mousedown', onMouseDown)
      icon.removeEventListener('click', onClick)
    },
  }
}


