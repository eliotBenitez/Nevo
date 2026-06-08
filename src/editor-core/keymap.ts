import { NodeSelection, TextSelection, type Command } from 'prosemirror-state'
import type { Schema } from 'prosemirror-model'
import { chainCommands, newlineInCode, splitBlock } from 'prosemirror-commands'
import { redo, undo } from 'prosemirror-history'
import { liftListItem, splitListItem } from 'prosemirror-schema-list'
import { goToNextCell } from 'prosemirror-tables'
import { createExitToggleCommand, createExitToggleOnDoubleEnterCommand } from './node-views/toggle'

function createInsertParagraphAfterMathBlockCommand(schema: Schema): Command {
  const mathBlock = schema.nodes.math_block
  const paragraph = schema.nodes.paragraph

  return (state, dispatch) => {
    if (!mathBlock || !paragraph) return false
    if (!(state.selection instanceof NodeSelection) || state.selection.node.type !== mathBlock) return false

    const paragraphNode = paragraph.createAndFill()
    if (!paragraphNode) return false
    if (!dispatch) return true

    const insertPos = state.selection.to
    const tr = state.tr.insert(insertPos, paragraphNode)
    dispatch(tr.setSelection(TextSelection.create(tr.doc, insertPos + 1)).scrollIntoView())
    return true
  }
}

function createExitContainerOnDoubleEnterCommand(schema: Schema): Command {
  const calloutType = schema.nodes.callout
  const blockquoteType = schema.nodes.blockquote
  const paragraphType = schema.nodes.paragraph

  return (state, dispatch) => {
    if ((!calloutType && !blockquoteType) || !paragraphType) return false
    if (!(state.selection instanceof TextSelection) || !state.selection.$cursor) return false
    const $cursor = state.selection.$cursor

    let containerDepth: number | null = null
    for (let d = $cursor.depth; d >= 1; d--) {
      const nodeType = $cursor.node(d).type
      if (nodeType === calloutType || nodeType === blockquoteType) {
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

function createExitBlockquoteCommand(schema: Schema): Command {
  const blockquoteType = schema.nodes.blockquote
  const paragraphType = schema.nodes.paragraph

  return (state, dispatch) => {
    if (!blockquoteType || !paragraphType) return false
    if (!(state.selection instanceof TextSelection) || !state.selection.$cursor) return false
    const $cursor = state.selection.$cursor

    let blockquoteDepth: number | null = null
    for (let d = $cursor.depth; d >= 1; d--) {
      if ($cursor.node(d).type === blockquoteType) {
        blockquoteDepth = d
        break
      }
    }
    if (blockquoteDepth === null) return false

    const paragraph = paragraphType.createAndFill()
    if (!paragraph) return false
    if (!dispatch) return true

    const blockquoteNode = $cursor.node(blockquoteDepth)
    const insertPos = $cursor.before(blockquoteDepth) + blockquoteNode.nodeSize
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

function createInsertBlockquoteHardBreakCommand(schema: Schema): Command {
  const hardBreak = schema.nodes.hard_break
  const blockquoteType = schema.nodes.blockquote

  return (state, dispatch) => {
    if (!hardBreak || !blockquoteType) return false
    if (!(state.selection instanceof TextSelection) || !state.selection.$cursor) return false

    const $cursor = state.selection.$cursor
    let isInsideBlockquote = false
    for (let depth = $cursor.depth; depth >= 1; depth -= 1) {
      if ($cursor.node(depth).type === blockquoteType) {
        isInsideBlockquote = true
        break
      }
    }

    if (!isInsideBlockquote) return false
    if (!$cursor.parent.canReplaceWith($cursor.index(), $cursor.index(), hardBreak)) return false
    if (!dispatch) return true

    dispatch(state.tr.replaceSelectionWith(hardBreak.create()).scrollIntoView())
    return true
  }
}

export function createCoreKeymap(schema: Schema, commands: Map<string, Command>, tabBehavior: 'indent' | 'focus' = 'indent'): Record<string, Command> {
  const listItem = schema.nodes.list_item
  const insertParagraphAfterMathBlock = createInsertParagraphAfterMathBlockCommand(schema)
  const exitContainerOnDoubleEnter = createExitContainerOnDoubleEnterCommand(schema)
  const exitBlockquote = createExitBlockquoteCommand(schema)
  const exitToggle = createExitToggleCommand(schema)
  const exitToggleOnDoubleEnter = createExitToggleOnDoubleEnterCommand(schema)
  const exitEmptyListItem = createExitEmptyListItemCommand(schema)
  const insertListItemHardBreak = createInsertListItemHardBreakCommand(schema)
  const insertBlockquoteHardBreak = createInsertBlockquoteHardBreakCommand(schema)

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
    Enter: chainCommands(insertParagraphAfterMathBlock, newlineInCode, exitContainerOnDoubleEnter, exitToggleOnDoubleEnter, exitEmptyListItem, listItem ? splitListItem(listItem) : () => false, splitBlock),
    'Shift-Enter': insertBlockquoteHardBreak,
    'Mod-Enter': chainCommands(insertParagraphAfterMathBlock, exitBlockquote, exitToggle, insertListItemHardBreak),
    'Ctrl-Enter': chainCommands(insertParagraphAfterMathBlock, exitBlockquote, exitToggle, insertListItemHardBreak),
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
