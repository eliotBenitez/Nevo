import type { Node as PMNode } from 'prosemirror-model'
import { NodeSelection } from 'prosemirror-state'
import type { EditorView, NodeView } from 'prosemirror-view'
import type {
  NevoBlockRenderResult,
  NevoBlockTypeConfig,
  NevoEditorContext,
  NevoSerializableNode,
} from '../../types/editor-plugin'

function toSerializable(node: PMNode): NevoSerializableNode {
  return node.toJSON() as NevoSerializableNode
}

function normalizeRender(result: HTMLElement | NevoBlockRenderResult): NevoBlockRenderResult {
  return result instanceof HTMLElement ? { dom: result } : result
}

/**
 * Генерик node view для кастомного блока плагина. Поддерживает два режима:
 *  - leaf/atom: config.render возвращает HTMLElement, содержимое перерисовывается
 *    при каждом обновлении, клик по блоку открывает поповер редактирования;
 *  - контейнер: config.render возвращает объект с contentDOM, куда ProseMirror
 *    отрисует редактируемое дочернее содержимое. «Хром» обновляется через
 *    result.update, contentDOM при этом не трогается.
 */
export function makeBlockNodeView(
  config: NevoBlockTypeConfig,
  ctx: NevoEditorContext,
): (node: PMNode, view: EditorView, getPos: () => number | undefined) => NodeView {
  return (node, view, getPos) => {
    let currentNode = node
    let anchorEl: HTMLElement | null = null

    const requestEdit = (anchorRect?: DOMRect) => {
      const position = getPos()
      if (typeof position !== 'number') return
      ctx.requestNodeEdit(view, position, anchorRect ?? anchorEl?.getBoundingClientRect())
    }

    const initial = normalizeRender(config.render(toSerializable(currentNode), { requestEdit }))

    // Контейнерный режим: редактируемое содержимое живёт в contentDOM.
    if (initial.contentDOM) {
      const host = initial.dom
      anchorEl = host
      host.classList.add('nv-plugin-block', `nv-plugin-block--${config.name}`)
      const contentDOM = initial.contentDOM

      return {
        dom: host,
        contentDOM,
        update(nextNode) {
          if (nextNode.type !== currentNode.type) return false
          currentNode = nextNode
          initial.update?.(toSerializable(nextNode))
          return true
        },
        ignoreMutation(mutation) {
          if (mutation.type === 'selection') return false
          return !contentDOM.contains(mutation.target as Node)
        },
        destroy() {
          initial.destroy?.()
        },
      }
    }

    // Leaf/atom режим.
    const host = document.createElement('div')
    host.className = `nv-plugin-block nv-plugin-block--${config.name}`
    anchorEl = host

    const renderContent = () => {
      const result = normalizeRender(config.render(toSerializable(currentNode), { requestEdit }))
      host.replaceChildren(result.dom)
    }

    host.replaceChildren(initial.dom)

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

    if (onClick) host.addEventListener('click', onClick)

    return {
      dom: host,
      update(nextNode) {
        if (nextNode.type !== currentNode.type) return false
        currentNode = nextNode
        renderContent()
        return true
      },
      destroy() {
        if (onClick) host.removeEventListener('click', onClick)
        initial.destroy?.()
      },
    }
  }
}
