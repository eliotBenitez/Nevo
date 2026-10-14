import { NodeSelection, TextSelection, type Command } from 'prosemirror-state'
import type { Schema } from 'prosemirror-model'
import { chainCommands, newlineInCode, splitBlock } from 'prosemirror-commands'
import { redo, undo } from 'prosemirror-history'
import { liftListItem, splitListItem } from 'prosemirror-schema-list'
import { CellSelection, findTable, goToNextCell, selectedRect } from 'prosemirror-tables'
import { createExitToggleCommand, createExitToggleOnDoubleEnterCommand } from './node-views/toggle'
import { getContainerBlockTypes } from './schema/container-blocks'

const PARAGRAPH_AFTER_SELECTED_BLOCK_TYPES = new Set([
  'file_block',
  'image_block',
  'media_block',
  'embed_block',
  'note_embed',
  'block_embed',
  'mermaid_block',
  'draw_block',
  'markmap_block',
  'vega_block',
  'query_block',
  'table',
  'divider',
  'math_block',
])

function createInsertParagraphAfterSelectedBlockCommand(schema: Schema): Command {
  const paragraph = schema.nodes.paragraph
  const supportedTypes = new Set(
    Array.from(PARAGRAPH_AFTER_SELECTED_BLOCK_TYPES)
      .map((typeName) => schema.nodes[typeName])
      .filter(Boolean),
  )

  return (state, dispatch) => {
    if (!paragraph) return false

    const insertPos = (() => {
      if (state.selection instanceof NodeSelection) {
        const node = state.selection.node
        const hasBlockGroup = typeof node.type.spec.group === 'string' && node.type.spec.group.split(/\s+/).includes('block')
        if ((!node.isBlock && !hasBlockGroup) || !supportedTypes.has(node.type)) return null
        return state.selection.to
      }
      if (state.selection instanceof CellSelection) {
        const table = findTable(state.selection.$anchorCell)
        if (!table || !supportedTypes.has(table.node.type)) return null
        const rect = selectedRect(state)
        if (rect.top !== 0 || rect.left !== 0 || rect.bottom !== rect.map.height || rect.right !== rect.map.width) return null
        return table.pos + table.node.nodeSize
      }
      return null
    })()
    if (insertPos === null) return false

    const paragraphNode = paragraph.createAndFill()
    if (!paragraphNode) return false
    if (!dispatch) return true

    const tr = state.tr.insert(insertPos, paragraphNode)
    dispatch(tr.setSelection(TextSelection.create(tr.doc, insertPos + 1)).scrollIntoView())
    return true
  }
}

function createAppendParagraphAtEndCommand(schema: Schema): Command {
  const paragraph = schema.nodes.paragraph

  return (state, dispatch) => {
    if (!paragraph) return false
    if (!dispatch) return true

    const { doc } = state
    const last = doc.lastChild
    // Reuse a trailing empty paragraph instead of stacking blank blocks on repeated presses.
    if (last && last.type === paragraph && last.content.size === 0) {
      const pos = doc.content.size - last.nodeSize + 1
      dispatch(state.tr.setSelection(TextSelection.create(doc, pos)).scrollIntoView())
      return true
    }

    const paragraphNode = paragraph.createAndFill()
    if (!paragraphNode) return false
    const tr = state.tr.insert(doc.content.size, paragraphNode)
    dispatch(tr.setSelection(TextSelection.create(tr.doc, tr.doc.content.size - 1)).scrollIntoView())
    return true
  }
}

function createExitContainerOnDoubleEnterCommand(schema: Schema): Command {
  const containerTypes = getContainerBlockTypes(schema)
  const paragraphType = schema.nodes.paragraph

  return (state, dispatch) => {
    if (containerTypes.size === 0 || !paragraphType) return false
    if (!(state.selection instanceof TextSelection) || !state.selection.$cursor) return false
    const $cursor = state.selection.$cursor

    let containerDepth: number | null = null
    for (let d = $cursor.depth; d >= 1; d--) {
      if (containerTypes.has($cursor.node(d).type)) {
        containerDepth = d
        break
      }
    }
    if (containerDepth === null) return false

    const blockDepth = containerDepth + 1
    if ($cursor.depth < blockDepth) return false

    const currentBlock = $cursor.node(blockDepth)
    if (currentBlock.type !== paragraphType || currentBlock.textContent !== '') return false

    const containerNode = $cursor.node(containerDepth)
    const currentBlockIndex = $cursor.index(containerDepth)
    if (currentBlockIndex === 0) return false

    const prevBlock = containerNode.child(currentBlockIndex - 1)
    if (prevBlock.type !== paragraphType || prevBlock.textContent !== '') return false

    if (!dispatch) return true

    const currentBlockStart = $cursor.before(blockDepth)
    const currentBlockEnd = currentBlockStart + currentBlock.nodeSize
    const prevBlockStart = currentBlockStart - prevBlock.nodeSize
    const containerStart = $cursor.before(containerDepth)
    const containerEnd = containerStart + containerNode.nodeSize

    const newParagraph = paragraphType.createAndFill()
    if (!newParagraph) return false

    let tr = state.tr

    if (containerNode.childCount === 2) {
      tr = tr.replaceWith(containerStart, containerEnd, newParagraph)
      dispatch(tr.setSelection(TextSelection.create(tr.doc, containerStart + 1)).scrollIntoView())
    } else {
      tr = tr.delete(prevBlockStart, currentBlockEnd)
      const newContainerEnd = containerEnd - (currentBlockEnd - prevBlockStart)
      tr = tr.insert(newContainerEnd, newParagraph)
      dispatch(tr.setSelection(TextSelection.create(tr.doc, newContainerEnd + 1)).scrollIntoView())
    }

    return true
  }
}

function createExitContainerCommand(schema: Schema): Command {
  const containerTypes = getContainerBlockTypes(schema)
  const paragraphType = schema.nodes.paragraph

  return (state, dispatch) => {
    if (containerTypes.size === 0 || !paragraphType) return false
    if (!(state.selection instanceof TextSelection) || !state.selection.$cursor) return false
    const $cursor = state.selection.$cursor

    let containerDepth: number | null = null
    for (let d = $cursor.depth; d >= 1; d--) {
      if (containerTypes.has($cursor.node(d).type)) {
        containerDepth = d
        break
      }
    }
    if (containerDepth === null) return false

    const paragraph = paragraphType.createAndFill()
    if (!paragraph) return false
    if (!dispatch) return true

    const containerNode = $cursor.node(containerDepth)
    const insertPos = $cursor.before(containerDepth) + containerNode.nodeSize
    const tr = state.tr.insert(insertPos, paragraph)
    dispatch(tr.setSelection(TextSelection.create(tr.doc, insertPos + 1)).scrollIntoView())
    return true
  }
}

function createExitEmptyListItemCommand(schema: Schema): Command {
  const listItem = schema.nodes.list_item

  return (state, dispatch) => {
    if (!listItem) return false
    if (!(state.selection instanceof TextSelection) || !state.selection.$cursor) return false

    const $cursor = state.selection.$cursor
    const itemDepth = $cursor.depth - 1
    if (itemDepth < 1 || $cursor.node(itemDepth).type !== listItem) return false
    if ($cursor.parent.content.size !== 0) return false
    if ($cursor.node(itemDepth).childCount !== $cursor.indexAfter(itemDepth)) return false

    return liftListItem(listItem)(state, dispatch)
  }
}

// Enter in a checklist item continues the checklist; Enter in an empty item exits it into a paragraph, like lists do.
function createSplitChecklistItemCommand(schema: Schema): Command {
  const checklistItem = schema.nodes.checklist_item
  const paragraph = schema.nodes.paragraph

  return (state, dispatch) => {
    if (!checklistItem || !paragraph) return false
    if (!(state.selection instanceof TextSelection)) return false
    const { $from, $to } = state.selection
    if ($from.parent.type !== checklistItem || !$from.sameParent($to)) return false

    if ($from.parent.content.size === 0) {
      if (dispatch) dispatch(state.tr.setBlockType($from.pos, $from.pos, paragraph).scrollIntoView())
      return true
    }
    if (!dispatch) return true

    const tr = state.tr.deleteSelection()
    if ($from.parentOffset === 0) {
      // At the start, keep the current item (and its checked state) intact and open an empty one above it.
      tr.insert($from.before(), checklistItem.create({ checked: false }))
    } else {
      tr.split(tr.selection.from, 1, [{ type: checklistItem, attrs: { checked: false } }])
    }
    dispatch(tr.scrollIntoView())
    return true
  }
}

function createInsertListItemHardBreakCommand(schema: Schema): Command {
  const hardBreak = schema.nodes.hard_break
  const listItem = schema.nodes.list_item

  return (state, dispatch) => {
    if (!hardBreak || !listItem) return false
    if (!(state.selection instanceof TextSelection) || !state.selection.$cursor) return false

    const $cursor = state.selection.$cursor
    let isInsideListItem = false
    for (let depth = $cursor.depth; depth >= 1; depth -= 1) {
      if ($cursor.node(depth).type === listItem) {
        isInsideListItem = true
        break
      }
    }

    if (!isInsideListItem) return false
    if (!dispatch) return true

    dispatch(state.tr.replaceSelectionWith(hardBreak.create()).scrollIntoView())
    return true
  }
}

function createInsertHardBreakCommand(schema: Schema): Command {
  const hardBreak = schema.nodes.hard_break

  return (state, dispatch) => {
    if (!hardBreak) return false
    if (!(state.selection instanceof TextSelection) || !state.selection.$cursor) return false

    const $cursor = state.selection.$cursor
    if (!$cursor.parent.canReplaceWith($cursor.index(), $cursor.index(), hardBreak)) return false
    if (!dispatch) return true

    dispatch(state.tr.replaceSelectionWith(hardBreak.create()).scrollIntoView())
    return true
  }
}

export function createCoreKeymap(schema: Schema, commands: Map<string, Command>, tabBehavior: 'indent' | 'focus' = 'indent'): Record<string, Command> {
  const listItem = schema.nodes.list_item
  const insertParagraphAfterSelectedBlock = createInsertParagraphAfterSelectedBlockCommand(schema)
  const exitContainerOnDoubleEnter = createExitContainerOnDoubleEnterCommand(schema)
  const exitContainer = createExitContainerCommand(schema)
  const exitToggle = createExitToggleCommand(schema)
  const exitToggleOnDoubleEnter = createExitToggleOnDoubleEnterCommand(schema)
  const exitEmptyListItem = createExitEmptyListItemCommand(schema)
  const splitChecklistItem = createSplitChecklistItemCommand(schema)
  const insertListItemHardBreak = createInsertListItemHardBreakCommand(schema)
  const insertHardBreak = createInsertHardBreakCommand(schema)
  const appendParagraphAtEnd = createAppendParagraphAtEndCommand(schema)

  const bindings: Record<string, Command> = {
    'Mod-z': undo,
    'Mod-y': redo,
    'Shift-Mod-z': redo,
    'Mod-Shift-z': redo,
    'Mod-b': commands.get('core.bold') ?? (() => false),
    'Mod-i': commands.get('core.italic') ?? (() => false),
    'Mod-Shift-s': commands.get('core.strikethrough') ?? (() => false),
    'Mod-u': commands.get('core.underline') ?? (() => false),
    'Mod-e': commands.get('core.kbd') ?? (() => false),
    'Mod-Shift-t': commands.get('core.tag') ?? (() => false),
    'Mod-Alt-1': commands.get('core.heading.1') ?? (() => false),
    'Mod-Alt-2': commands.get('core.heading.2') ?? (() => false),
    'Mod-Alt-3': commands.get('core.heading.3') ?? (() => false),
    'Mod-Alt-4': commands.get('core.heading.4') ?? (() => false),
    'Mod-Alt-5': commands.get('core.heading.5') ?? (() => false),
    'Mod-Alt-6': commands.get('core.heading.6') ?? (() => false),
    'Mod-Shift-7': commands.get('core.orderedList') ?? (() => false),
    'Mod-Shift-8': commands.get('core.bulletList') ?? (() => false),
    'Mod-Shift-9': commands.get('core.blockquote') ?? (() => false),
    Enter: chainCommands(insertParagraphAfterSelectedBlock, newlineInCode, exitContainerOnDoubleEnter, exitToggleOnDoubleEnter, splitChecklistItem, exitEmptyListItem, listItem ? splitListItem(listItem) : () => false, splitBlock),
    'Shift-Enter': chainCommands(newlineInCode, insertHardBreak),
    'Mod-Enter': chainCommands(insertParagraphAfterSelectedBlock, exitContainer, exitToggle, insertListItemHardBreak),
    'Ctrl-Enter': chainCommands(insertParagraphAfterSelectedBlock, exitContainer, exitToggle, insertListItemHardBreak),
    'Mod-Shift-Enter': appendParagraphAtEnd,
  }

  if (tabBehavior !== 'focus') {
    if (commands.get('core.list.sink')) {
      bindings.Tab = chainCommands(goToNextCell(1), commands.get('core.list.sink') as Command)
    } else {
      bindings.Tab = goToNextCell(1)
    }
    if (commands.get('core.list.lift')) {
      bindings['Shift-Tab'] = chainCommands(goToNextCell(-1), commands.get('core.list.lift') as Command)
    } else {
      bindings['Shift-Tab'] = goToNextCell(-1)
    }
  }

  return bindings
}
