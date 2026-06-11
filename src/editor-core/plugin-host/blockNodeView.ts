import type { Node as PMNode } from 'prosemirror-model'
import { NodeSelection } from 'prosemirror-state'
import type { EditorView, NodeView } from 'prosemirror-view'
import type { NevoBlockTypeConfig, NevoEditorContext, NevoSerializableNode } from '../../types/editor-plugin'

function toSerializable(node: PMNode): NevoSerializableNode {
  return node.toJSON() as NevoSerializableNode
}

/**
 * Генерик node view для кастомного блока плагина. Отрисовывает содержимое через
 * config.render и по клику открывает поповер редактирования (если он задан).
 * Аналог createMermaidNodeView, но без специфики mermaid.
 */
export function makeBlockNodeView(
  config: NevoBlockTypeConfig,
  ctx: NevoEditorContext,
): (node: PMNode, view: EditorView, getPos: () => number | undefined) => NodeView {
  return (node, view, getPos) => {
    const dom = document.createElement('div')
    dom.className = `nv-plugin-block nv-plugin-block--${config.name}`

    let currentNode = node

    const requestEdit = (anchorRect?: DOMRect) => {
      const position = getPos()
      if (typeof position !== 'number') return
      ctx.requestNodeEdit(view, position, anchorRect ?? dom.getBoundingClientRect())
    }

    const renderContent = () => {
      dom.replaceChildren(config.render(toSerializable(currentNode), { requestEdit }))
    }

    const onClick = config.popover
      ? (event: MouseEvent) => {
          event.preventDefault()
          event.stopPropagation()
          const position = getPos()
          if (typeof position === 'number') {
            view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, position)))
          }
          requestEdit(new DOMRect(event.clientX - 5, event.clientY - 5, 10, 10))
        }
      : null

    if (onClick) dom.addEventListener('click', onClick)
    renderContent()

    return {
      dom,
      update(nextNode) {
        if (nextNode.type !== currentNode.type) return false
        currentNode = nextNode
        renderContent()
        return true
      },
      destroy() {
        if (onClick) dom.removeEventListener('click', onClick)
      },
    }
  }
}
