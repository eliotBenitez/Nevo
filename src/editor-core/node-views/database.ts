import { h, render, markRaw } from 'vue'
import type { Node as PMNode } from 'prosemirror-model'
import type { EditorView, NodeView } from 'prosemirror-view'
import DatabaseBlock from '../../app/components/editor/database/DatabaseBlock.vue'
import {
  normalizeDatabaseData,
  type DatabaseBlockData,
} from '../../types/database-block'
import {
  resolveNodePosition,
  type CoreNodeViewOptions,
  type NodeViewPosition,
} from './utils'
import { createDatabaseRepository } from '../../features/database/databaseRepository'

export function createDatabaseNodeView(
  node: PMNode,
  view: EditorView,
  getPos: NodeViewPosition,
  options?: CoreNodeViewOptions,
): NodeView {
  const t = options?.t || ((key: string) => key)
  const dom = document.createElement('div')
  dom.className = 'nv-database-block'

  let currentNode = node

  const readData = (source: PMNode): DatabaseBlockData => normalizeDatabaseData(source.attrs.data)

  const writeData = (next: DatabaseBlockData): void => {
    const position = resolveNodePosition(getPos)
    if (typeof position !== 'number') return
    view.dispatch(view.state.tr.setNodeMarkup(position, undefined, { ...currentNode.attrs, data: next }))
  }

  const removeSelf = (): void => {
    const position = resolveNodePosition(getPos)
    if (typeof position !== 'number') return
    view.dispatch(view.state.tr.delete(position, position + currentNode.nodeSize).scrollIntoView())
  }

  const mount = (): void => {
    render(
      h(DatabaseBlock, {
        data: readData(currentNode),
        repository: options?.databaseRepository ?? createDatabaseRepository(null),
        t: markRaw(t),
        onChange: writeData,
        onRequestDelete: removeSelf,
      }),
      dom,
    )
  }

  mount()

  return {
    dom,
    stopEvent() {
      return true
    },
    ignoreMutation() {
      return true
    },
    update(nextNode) {
      if (nextNode.type !== currentNode.type) return false
      currentNode = nextNode
      mount()
      return true
    },
    destroy() {
      render(null, dom)
    },
  }
}
