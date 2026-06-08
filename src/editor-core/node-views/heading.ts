import type { Node as PMNode } from 'prosemirror-model'
import type { EditorView, NodeView } from 'prosemirror-view'
import { resolveNodePosition, type NodeViewPosition, addClickHandler } from './utils'
import { headingFoldingKey } from '../plugins/heading-folding'

export function createHeadingNodeView(node: PMNode, view: EditorView, getPos: NodeViewPosition): NodeView {
  const level = node.attrs.level
  const dom = document.createElement(`h${level}`)
  dom.className = `nv-heading h${level}`
  
  const toggle = document.createElement('button')
  toggle.type = 'button'
  toggle.className = 'nv-heading-toggle'
  toggle.contentEditable = 'false'
  toggle.setAttribute('aria-label', 'Toggle folding')
  
  const chevron = document.createElement('span')
  chevron.className = 'nv-heading-chevron'
  chevron.textContent = '▸'
  toggle.appendChild(chevron)
  
  const contentDOM = document.createElement('span')
  contentDOM.className = 'nv-heading-content'
  
  dom.appendChild(toggle)
  dom.appendChild(contentDOM)

  let currentNode = node

  const sync = () => {
    const collapsed = currentNode.attrs.collapsed === true
    dom.dataset.collapsed = collapsed ? 'true' : 'false'
    chevron.style.transform = collapsed ? '' : 'rotate(90deg)'
    chevron.style.display = 'inline-block'
    chevron.style.transition = 'transform 0.2s ease'
  }

  const removeHandler = addClickHandler(toggle, (event: MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    const pos = resolveNodePosition(getPos)
    if (typeof pos !== 'number') return
    
    const tr = view.state.tr.setNodeMarkup(pos, undefined, {
      ...currentNode.attrs,
      collapsed: !currentNode.attrs.collapsed
    })
    
    // Notify the folding plugin that a collapse state changed
    tr.setMeta(headingFoldingKey, true)
    view.dispatch(tr)
  })

  sync()

  return {
    dom,
    contentDOM,
    update(nextNode) {
      if (nextNode.type !== currentNode.type || nextNode.attrs.level !== currentNode.attrs.level) return false
      currentNode = nextNode
      sync()
      return true
    },
    destroy() {
      removeHandler()
    }
  }
}
