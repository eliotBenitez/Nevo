import { h, render, markRaw } from 'vue'
import type { Node as PMNode } from 'prosemirror-model'
import type { EditorView, NodeView } from 'prosemirror-view'
import QueryBlock from '../../app/components/editor/query/QueryBlock.vue'
import { normalizeQueryBlockData, type QueryBlockData } from '../../features/query/queryBlockData'
import { resolveNodePosition, selectNodeAt, type CoreNodeViewOptions, type NodeViewPosition } from './utils'
import {
  createViewportRenderController,
  type ViewportRenderController,
} from './viewportRenderController'

export function createQueryNodeView(
  node: PMNode,
  view: EditorView,
  getPos: NodeViewPosition,
  options?: CoreNodeViewOptions,
): NodeView {
  const t = options?.t || ((key: string) => key)
  const dom = document.createElement('div')
  dom.className = 'nv-query-block'

  let currentNode = node
  let viewportController: ViewportRenderController | null = null

  const readData = (source: PMNode): QueryBlockData => normalizeQueryBlockData(source.attrs.data)

  // Editing and deletion go through the block-handle and the query popover
  // (useQueryEditor), which dispatch ProseMirror transactions directly on the
  // live view — mirroring the mermaid_block popover pattern. This node view
  // only needs to render results and request the popover to open.
  const requestEdit = (event?: MouseEvent): void => {
    const position = resolveNodePosition(getPos)
    if (typeof position !== 'number') return
    selectNodeAt(view, position)
    const anchorRect = event
      ? new DOMRect(event.clientX - 5, event.clientY - 5, 10, 10)
      : dom.getBoundingClientRect()
    options?.onRequestQueryEdit?.({ view, position, node: currentNode, anchorRect })
  }

  const mount = (): void => {
    render(
      h(QueryBlock, {
        data: readData(currentNode),
        t: markRaw(t),
        onQueryNotes: options?.onQueryNotes,
        onOpenNote: options?.onNoteEmbedOpen,
        onEditRequest: requestEdit,
      }),
      dom,
    )
  }

  viewportController = createViewportRenderController(dom, {
    render: mount,
    suspend: () => render(null, dom),
    initialPlaceholderHeight: 180,
  })

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
      viewportController?.requestRender()
      return true
    },
    destroy() {
      viewportController?.destroy()
      render(null, dom)
    },
  }
}
