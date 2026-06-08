import type { Node as PMNode, Schema } from 'prosemirror-model'
import { TextSelection, type Command } from 'prosemirror-state'
import type { EditorView, NodeView } from 'prosemirror-view'
import { resolveNodePosition, type NodeViewPosition } from './utils'

export function createExitToggleCommand(schema: Schema): Command {
  const toggleType = schema.nodes.toggle
  const paragraphType = schema.nodes.paragraph

  return (state, dispatch) => {
    if (!toggleType || !paragraphType) return false
    if (!(state.selection instanceof TextSelection) || !state.selection.$cursor) return false
    const $cursor = state.selection.$cursor

    let toggleDepth: number | null = null
    for (let d = $cursor.depth; d >= 1; d--) {
      if ($cursor.node(d).type === toggleType) {
        toggleDepth = d
        break
      }
    }
    if (toggleDepth === null) return false

    const paragraph = paragraphType.createAndFill()
    if (!paragraph) return false
    if (!dispatch) return true

    const toggleNode = $cursor.node(toggleDepth)
    const insertPos = $cursor.before(toggleDepth) + toggleNode.nodeSize
    const tr = state.tr.insert(insertPos, paragraph)
    dispatch(tr.setSelection(TextSelection.create(tr.doc, insertPos + 1)).scrollIntoView())
    return true
  }
}

export function createExitToggleOnDoubleEnterCommand(schema: Schema): Command {
  const toggleType = schema.nodes.toggle
  const paragraphType = schema.nodes.paragraph

  return (state, dispatch) => {
    if (!toggleType || !paragraphType) return false
    if (!(state.selection instanceof TextSelection) || !state.selection.$cursor) return false
    const $cursor = state.selection.$cursor

    let toggleDepth: number | null = null
    for (let d = $cursor.depth; d >= 1; d--) {
      if ($cursor.node(d).type === toggleType) {
        toggleDepth = d
        break
      }
    }
    if (toggleDepth === null) return false

    const blockDepth = toggleDepth + 1
    if ($cursor.depth < blockDepth) return false

    const currentBlock = $cursor.node(blockDepth)
    if (currentBlock.type !== paragraphType || currentBlock.textContent !== '') return false

    const toggleNode = $cursor.node(toggleDepth)
    const currentBlockIndex = $cursor.index(toggleDepth)
    if (currentBlockIndex <= 1) return false

    const prevBlock = toggleNode.child(currentBlockIndex - 1)
    if (prevBlock.type !== paragraphType || prevBlock.textContent !== '') return false

    const paragraph = paragraphType.createAndFill()
    if (!paragraph) return false
    if (!dispatch) return true

    const currentBlockStart = $cursor.before(blockDepth)
    const currentBlockEnd = currentBlockStart + currentBlock.nodeSize
    const keepPreviousEmptyBody = toggleNode.childCount === 3
    const deleteFrom = keepPreviousEmptyBody ? currentBlockStart : currentBlockStart - prevBlock.nodeSize
    const deleteTo = currentBlockEnd
    const toggleStart = $cursor.before(toggleDepth)
    const toggleEnd = toggleStart + toggleNode.nodeSize
    const insertPos = toggleEnd - (deleteTo - deleteFrom)

    const tr = state.tr.delete(deleteFrom, deleteTo).insert(insertPos, paragraph)
    dispatch(tr.setSelection(TextSelection.create(tr.doc, insertPos + 1)).scrollIntoView())
    return true
  }
}

export function createToggleNodeView(node: PMNode, view: EditorView, getPos: NodeViewPosition): NodeView {
  const dom = document.createElement('div')
  dom.className = 'nv-toggle'

  const chevron = document.createElement('button')
  chevron.type = 'button'
  chevron.className = 'nv-toggle-chevron'
  chevron.contentEditable = 'false'
  chevron.setAttribute('aria-label', 'Toggle content')
  chevron.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>'

  const contentDOM = document.createElement('div')
  contentDOM.className = 'nv-toggle-content'

  dom.append(chevron, contentDOM)

  let currentNode = node

  const sync = () => {
    const collapsed = currentNode.attrs.collapsed === true
    dom.dataset.collapsed = collapsed ? 'true' : 'false'
  }

  const onClick = (event: MouseEvent) => {
    event.preventDefault()
    const pos = resolveNodePosition(getPos)
    if (typeof pos !== 'number') return
    view.dispatch(
      view.state.tr.setNodeMarkup(pos, undefined, {
        ...currentNode.attrs,
        collapsed: currentNode.attrs.collapsed !== true,
      }),
    )
  }

  const onMouseDown = (event: MouseEvent) => {
    event.preventDefault()
  }

  chevron.addEventListener('mousedown', onMouseDown)
  chevron.addEventListener('click', onClick)
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
      chevron.removeEventListener('mousedown', onMouseDown)
      chevron.removeEventListener('click', onClick)
    },
  }
}

export function createToggleTitleNodeView(node: PMNode): NodeView {
  const dom = document.createElement('div')
  dom.className = 'nv-toggle-title'

  const contentDOM = document.createElement('div')
  contentDOM.className = 'nv-toggle-title-content'
  dom.append(contentDOM)

  return {
    dom,
    contentDOM,
    update(nextNode) {
      return nextNode.type === node.type
    },
  }
}
