import type { NodeType } from 'prosemirror-model'
import { NodeSelection, type Command } from 'prosemirror-state'
import { generateDrawId } from '../../utils/draw/drawEngine'

/** Insert an empty draw_block. When `drawId` is empty a fresh one is generated
 *  on each invocation, so the slash command can register a single factory.
 *  The caller (useEditorCore) is expected to open the canvas immediately after
 *  via `onDrawOpen(drawId)`, so the node ships with a placeholder preview. */
export function createInsertDrawCommand(nodeType: NodeType, drawId = ''): Command {
  return (state, dispatch) => {
    const id = drawId || generateDrawId()
    const node = nodeType.create({ drawId: id, src: '', svgPreview: '', title: '' })
    if (!dispatch) return true

    const { $from } = state.selection
    let insertPos = state.selection.from
    let tr = state.tr

    if (state.selection.empty && $from.parent.isTextblock && $from.parent.content.size === 0) {
      insertPos = $from.before()
      tr = tr.replaceWith(insertPos, insertPos + $from.parent.nodeSize, node)
    } else {
      tr = tr.replaceSelectionWith(node, false)
      insertPos = tr.mapping.map(insertPos)
    }

    dispatch(tr.setSelection(NodeSelection.create(tr.doc, insertPos)).scrollIntoView())
    return true
  }
}

/** Update the active draw_block attributes (after a save on the canvas). */
export function createUpdateDrawCommand(nodeType: NodeType, attrs: Record<string, unknown>): Command {
  return (state, dispatch) => {
    const { selection } = state
    if (!(selection instanceof NodeSelection) || selection.node.type !== nodeType) return false
    if (!dispatch) return true
    dispatch(state.tr.setNodeMarkup(selection.from, undefined, { ...selection.node.attrs, ...attrs }).scrollIntoView())
    return true
  }
}

/** Update a draw_block by its `drawId`, regardless of the current selection.
 *  Used from the canvas to sync preview/src back into the note after saving,
 *  even when the cursor isn't on the drawing node. */
export function createUpdateDrawByIdCommand(nodeType: NodeType, drawId: string, attrs: Record<string, unknown>): Command {
  return (state, dispatch) => {
    let target = -1
    state.doc.descendants((node, pos) => {
      if (target === -1 && node.type === nodeType && node.attrs.drawId === drawId) {
        target = pos
        return false
      }
      return false
    })
    if (target === -1) return false
    if (!dispatch) return true
    const node = state.doc.nodeAt(target)
    if (!node) return false
    dispatch(state.tr.setNodeMarkup(target, undefined, { ...node.attrs, ...attrs }))
    return true
  }
}

/** Remove the selected draw_block. The associated asset is reaped by the
 *  workspace GC scanner (it scans note content for `.nevo/assets/...` refs). */
export function createRemoveDrawCommand(nodeType: NodeType): Command {
  return (state, dispatch) => {
    const { selection } = state
    if (!(selection instanceof NodeSelection) || selection.node.type !== nodeType) return false
    if (!dispatch) return true
    dispatch(state.tr.delete(selection.from, selection.from + selection.node.nodeSize).scrollIntoView())
    return true
  }
}
