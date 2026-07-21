import { setBlockType, toggleMark, wrapIn } from 'prosemirror-commands'
import { redo, undo } from 'prosemirror-history'
import { type Node as PMNode, type NodeType, Schema } from 'prosemirror-model'
import { TextSelection, type Command } from 'prosemirror-state'
import { liftListItem, sinkListItem, wrapInList } from 'prosemirror-schema-list'
import {
  addColumnAfter,
  addColumnBefore,
  addRowAfter,
  addRowBefore,
  deleteColumn,
  deleteRow,
  deleteTable,
  mergeCells,
  setCellAttr,
  splitCell,
  toggleHeaderCell,
  toggleHeaderColumn,
  toggleHeaderRow,
} from 'prosemirror-tables'
import type { TableCellAlignment, TableInsertOptions, ImageBlockAttrs, FileBlockAttrs, NoteEmbedAttrs, MediaBlockAttrs, EmbedBlockAttrs } from './types'
import { getLinkRange, createLinkSetCommand, createUnsetLinkCommand } from './link'
import { getInternalLinkRange, createSetInternalLinkCommand, createUnsetInternalLinkCommand } from './internal-link'
import { createInsertMathInlineCommand, createInsertMathBlockCommand, createUpdateMathCommand, createRemoveMathCommand } from './math'
import { createInsertMermaidCommand, createUpdateMermaidCommand, createRemoveMermaidCommand } from './mermaid'
import { createInsertDrawCommand, createUpdateDrawByIdCommand, createRemoveDrawCommand } from './draw'
import { createInsertMarkmapCommand, createUpdateMarkmapCommand, createRemoveMarkmapCommand } from './markmap'
import { createInsertVegaCommand, createUpdateVegaCommand, createRemoveVegaCommand } from './vega'
import { createInsertTableCommand, createSetCellFormulaCommand } from './table'
import { createImageAttrsCommand, createInsertImageCommand, createRemoveImageCommand } from './image'
import { createFileAttrsCommand, createInsertFileCommand, createRemoveFileCommand } from './file'
import { createInsertNoteEmbedCommand, createNoteEmbedAttrsCommand } from './note-embed'
import { createInsertEmbedCommand, createEmbedAttrsCommand } from './embed'
import { createInsertMediaBlockCommand, createMediaBlockAttrsCommand } from './media'
import { createInsertDatabaseCommand, createDatabaseDataCommand } from './database'
import type { DatabaseBlockData } from '../../types/database-block'
import { createInsertBlockCommand, createCodeLanguageCommand, createSetNodeAttrsCommand } from './utils'
import { createInsertToggleCommand, createToggleCollapseCommand } from './toggle'

export type { CoreCommandId, NevoLinkRange, NevoInternalLinkRange, TableCellAlignment, ImageBlockAttrs, FileBlockAttrs, TableInsertOptions, NevoCoreCommands } from './types'
export { getLinkRange } from './link'
export { getInternalLinkRange } from './internal-link'

function createCalloutParagraph(paragraph: NodeType, sourceNode: PMNode | null) {
  const content = sourceNode?.content
  if (content && content.size > 0) {
    return paragraph.createAndFill(null, content) ?? paragraph.create(null, content)
  }

  return paragraph.createAndFill()
}

function createInsertCalloutCommand(callout: NodeType, paragraph: NodeType, attrs: Record<string, unknown>): Command {
  return (state, dispatch) => {
    const { selection } = state
    const { $from } = selection

    let targetDepth = -1
    for (let depth = $from.depth; depth >= 1; depth -= 1) {
      if ($from.node(depth).isTextblock) {
        targetDepth = depth
        break
      }
    }

    if (targetDepth < 1) return false

    const targetNode = $from.node(targetDepth)
    const targetParent = $from.node(targetDepth - 1)
    const targetIndex = $from.index(targetDepth - 1)
    if (!targetParent.canReplaceWith(targetIndex, targetIndex + 1, callout)) {
      return false
    }

    const calloutParagraph = createCalloutParagraph(paragraph, targetNode)
    if (!calloutParagraph) return false

    const calloutNode = callout.createAndFill(attrs, [calloutParagraph]) ?? callout.create(attrs, [calloutParagraph])
    if (!dispatch || !calloutNode) return Boolean(calloutNode)

    const from = $from.before(targetDepth)
    const to = from + targetNode.nodeSize
    const cursorOffset = Math.min($from.pos - $from.start(targetDepth), calloutParagraph.content.size)
    const tr = state.tr.replaceWith(from, to, calloutNode)
    dispatch(tr.setSelection(TextSelection.create(tr.doc, from + 2 + cursorOffset)).scrollIntoView())
    return true
  }
}

function createWrapTextblockInListCommand(listType: NodeType): Command {
  return wrapInList(listType)
}

export function createCoreCommands(schema: Schema) {
  const heading = schema.nodes.heading
  const paragraph = schema.nodes.paragraph
  const blockquote = schema.nodes.blockquote
  const codeBlock = schema.nodes.code_block
  const bulletList = schema.nodes.bullet_list
  const orderedList = schema.nodes.ordered_list
  const listItem = schema.nodes.list_item
  const callout = schema.nodes.callout
  const checklistItem = schema.nodes.checklist_item
  const divider = schema.nodes.divider
  const mathInline = schema.nodes.math_inline
  const mathBlock = schema.nodes.math_block
  const table = schema.nodes.table
  const tableRow = schema.nodes.table_row
  const tableCell = schema.nodes.table_cell
  const tableHeader = schema.nodes.table_header
  const imageBlock = schema.nodes.image_block
  const fileBlock = schema.nodes.file_block
  const mermaidBlock = schema.nodes.mermaid_block
  const markmapBlock = schema.nodes.markmap_block
  const vegaBlock = schema.nodes.vega_block
  const noteEmbed = schema.nodes.note_embed
  const embedBlock = schema.nodes.embed_block
  const mediaBlock = schema.nodes.media_block
  const databaseBlock = schema.nodes.database_block
  const toggle = schema.nodes.toggle
  const toggleTitle = schema.nodes.toggle_title

  const strong = schema.marks.strong
  const em = schema.marks.em
  const code = schema.marks.code
  const kbd = schema.marks.kbd
  const tag = schema.marks.tag
  const link = schema.marks.link
  const internalLink = schema.marks.internal_link
  const strike = schema.marks.strike
  const underline = schema.marks.underline
  const highlight = schema.marks.highlight
  const textColor = schema.marks.text_color
  const superscript = schema.marks.superscript
  const subscript = schema.marks.subscript

  const commands = new Map<string, Command>()

  commands.set('core.undo', undo)
  commands.set('core.redo', redo)

  if (strong) commands.set('core.bold', toggleMark(strong))
  if (em) commands.set('core.italic', toggleMark(em))
  if (strike) commands.set('core.strikethrough', toggleMark(strike))
  if (underline) commands.set('core.underline', toggleMark(underline))
  if (code) commands.set('core.code', toggleMark(code))
  if (kbd) commands.set('core.kbd', toggleMark(kbd))
  if (tag) commands.set('core.tag', toggleMark(tag))
  if (superscript) commands.set('core.superscript', toggleMark(superscript))
  if (subscript) commands.set('core.subscript', toggleMark(subscript))
  if (paragraph) commands.set('core.paragraph', setBlockType(paragraph))

  if (heading) {
    commands.set('core.heading.1', setBlockType(heading, { level: 1 }))
    commands.set('core.heading.2', setBlockType(heading, { level: 2 }))
    commands.set('core.heading.3', setBlockType(heading, { level: 3 }))
    commands.set('core.heading.4', setBlockType(heading, { level: 4 }))
    commands.set('core.heading.5', setBlockType(heading, { level: 5 }))
    commands.set('core.heading.6', setBlockType(heading, { level: 6 }))
  }

  if (blockquote) commands.set('core.blockquote', wrapIn(blockquote))
  if (codeBlock) commands.set('core.codeBlock', setBlockType(codeBlock, { language: null }))

  if (bulletList) commands.set('core.bulletList', createWrapTextblockInListCommand(bulletList))
  if (orderedList) commands.set('core.orderedList', createWrapTextblockInListCommand(orderedList))
  if (listItem) {
    commands.set('core.list.sink', sinkListItem(listItem))
    commands.set('core.list.lift', liftListItem(listItem))
  }

  if (callout && paragraph) commands.set('core.callout', createInsertCalloutCommand(callout, paragraph, { variant: 'info', icon: '💡' }))
  if (checklistItem) commands.set('core.checklistItem', setBlockType(checklistItem, { checked: false }))
  if (divider) commands.set('core.divider', createInsertBlockCommand(divider))

  const insertMathInline = mathInline ? (latex = '') => createInsertMathInlineCommand(mathInline, latex) : () => () => false
  const insertMathBlock = mathBlock ? (latex = '') => createInsertMathBlockCommand(mathBlock, latex) : () => () => false
  const updateMathAtSelection = mathInline && mathBlock ? (latex: string) => createUpdateMathCommand(mathInline, mathBlock, latex) : () => () => false
  const removeMathAtSelection = mathInline && mathBlock ? createRemoveMathCommand(mathInline, mathBlock) : () => false

  commands.set('core.math.inline.insert', insertMathInline(''))
  commands.set('core.math.block.insert', insertMathBlock(''))
  commands.set('core.math.update', updateMathAtSelection(''))
  commands.set('core.math.remove', removeMathAtSelection)

  const insertTable =
    table && tableRow && tableCell && tableHeader
      ? (options?: TableInsertOptions) => createInsertTableCommand(table, tableRow, tableCell, tableHeader, options)
      : () => () => false

  commands.set('core.table.insert', insertTable())
  commands.set('core.table.row.add.before', addRowBefore)
  commands.set('core.table.row.add.after', addRowAfter)
  commands.set('core.table.row.delete', deleteRow)
  commands.set('core.table.column.add.before', addColumnBefore)
  commands.set('core.table.column.add.after', addColumnAfter)
  commands.set('core.table.column.delete', deleteColumn)
  commands.set('core.table.merge', mergeCells)
  commands.set('core.table.split', splitCell)
  commands.set('core.table.header.toggle.row', toggleHeaderRow)
  commands.set('core.table.header.toggle.column', toggleHeaderColumn)
  commands.set('core.table.header.toggle.cell', toggleHeaderCell)
  commands.set('core.table.delete', deleteTable)

  const setTableCellAlignment = (alignment: TableCellAlignment): Command => setCellAttr('align', alignment)
  const setTableCellBackground = (background: string | null): Command => setCellAttr('background', background)
  const setTableCellAttr = (name: string, value: unknown): Command => setCellAttr(name, value)
  const setTableCellFormula = (value: string | null): Command => createSetCellFormulaCommand(value)

  if (imageBlock) {
    commands.set('core.image.insert', createInsertImageCommand(imageBlock))
    commands.set('core.image.remove', createRemoveImageCommand(imageBlock))
  }

  if (fileBlock) {
    commands.set('core.file.insert', createInsertFileCommand(fileBlock))
    commands.set('core.file.remove', createRemoveFileCommand(fileBlock))
  }

  const insertMermaid = mermaidBlock ? () => createInsertMermaidCommand(mermaidBlock) : () => () => false
  const updateMermaidAtSelection = mermaidBlock ? (code: string) => createUpdateMermaidCommand(mermaidBlock, code) : () => () => false
  const removeMermaidAtSelection = mermaidBlock ? createRemoveMermaidCommand(mermaidBlock) : () => false

  commands.set('core.mermaid.insert', insertMermaid())
  commands.set('core.mermaid.update', updateMermaidAtSelection(''))

  const insertMarkmap = markmapBlock ? () => createInsertMarkmapCommand(markmapBlock) : () => () => false
  const updateMarkmapAtSelection = markmapBlock ? (markdown: string) => createUpdateMarkmapCommand(markmapBlock, markdown) : () => () => false
  const removeMarkmapAtSelection = markmapBlock ? createRemoveMarkmapCommand(markmapBlock) : () => false

  commands.set('core.markmap.insert', insertMarkmap())
  commands.set('core.markmap.update', updateMarkmapAtSelection(''))

  const drawBlock = schema.nodes.draw_block
  const insertDraw = drawBlock ? (drawId: string) => createInsertDrawCommand(drawBlock, drawId) : () => () => false
  const updateDrawById = drawBlock
    ? (drawId: string, attrs: Record<string, unknown>) => createUpdateDrawByIdCommand(drawBlock, drawId, attrs)
    : () => () => false
  const removeDrawAtSelection = drawBlock ? createRemoveDrawCommand(drawBlock) : () => false

  commands.set('core.draw.insert', insertDraw(''))
  commands.set('core.draw.updateById', updateDrawById('', {}))
  commands.set('core.draw.remove', removeDrawAtSelection)

  const insertVega = vegaBlock ? () => createInsertVegaCommand(vegaBlock) : () => () => false
  const updateVegaAtSelection = vegaBlock ? (spec: string) => createUpdateVegaCommand(vegaBlock, spec) : () => () => false
  const removeVegaAtSelection = vegaBlock ? createRemoveVegaCommand(vegaBlock) : () => false
  commands.set('core.vega.insert', insertVega())

  if (noteEmbed) commands.set('core.noteEmbed.insert', createInsertNoteEmbedCommand(noteEmbed))
  if (embedBlock) commands.set('core.embed.insert', createInsertEmbedCommand(embedBlock))
  if (mediaBlock) {
    commands.set('core.media.audio.insert', createInsertMediaBlockCommand(mediaBlock, 'audio'))
    commands.set('core.media.video.insert', createInsertMediaBlockCommand(mediaBlock, 'video'))
  }
  if (databaseBlock) commands.set('core.database.insert', createInsertDatabaseCommand(databaseBlock))
  if (toggle && toggleTitle && paragraph) commands.set('core.toggle.insert', createInsertToggleCommand(toggle, toggleTitle, paragraph))
  if (toggle) commands.set('core.toggle.collapse', createToggleCollapseCommand(toggle))

  const setImageAttrsAtSelection = imageBlock ? (attrs: Partial<ImageBlockAttrs>) => createImageAttrsCommand(imageBlock, attrs) : () => () => false
  const setFileAttrsAtSelection = fileBlock ? (attrs: Partial<FileBlockAttrs>) => createFileAttrsCommand(fileBlock, attrs) : () => () => false
  const setNoteEmbedAttrsAtSelection = noteEmbed ? (attrs: Partial<NoteEmbedAttrs>) => createNoteEmbedAttrsCommand(noteEmbed, attrs) : () => () => false
  const setMediaBlockAttrsAtSelection = mediaBlock ? (attrs: Partial<MediaBlockAttrs>) => createMediaBlockAttrsCommand(mediaBlock, attrs) : () => () => false
  const setEmbedAttrsAtSelection = embedBlock ? (attrs: Partial<EmbedBlockAttrs>) => createEmbedAttrsCommand(embedBlock, attrs) : () => () => false
  const setDatabaseDataAtSelection = databaseBlock ? (data: DatabaseBlockData) => createDatabaseDataCommand(databaseBlock, data) : () => () => false
  const setCalloutIcon = callout ? (icon: string) => createSetNodeAttrsCommand(callout, (node) => ({ ...node.attrs, icon })) : () => () => false
  const setCalloutVariant = callout ? (variant: string) => createSetNodeAttrsCommand(callout, (node) => ({ ...node.attrs, variant })) : () => () => false

  const setCodeLanguage = codeBlock ? (language: string) => createCodeLanguageCommand(codeBlock, language.trim() || null) : () => () => false
  const clearCodeLanguage = codeBlock ? createCodeLanguageCommand(codeBlock, null) : () => false
  commands.set('core.code.language.clear', clearCodeLanguage)

  const setLink = (href: string): Command => {
    if (!link) return () => false
    return createLinkSetCommand(link, href)
  }
  const updateLink = (href: string): Command => {
    if (!link) return () => false
    return createLinkSetCommand(link, href)
  }
  const unsetLink = link ? createUnsetLinkCommand(link) : () => false

  commands.set('core.link.set', setLink('https://'))
  commands.set('core.link.update', updateLink('https://'))
  commands.set('core.link.unset', unsetLink)
  commands.set('core.setLink', setLink('https://'))

  const noopCommand: Command = () => false
  const setInternalLink = (noteId: string, anchor: string | null = null): Command => {
    if (!internalLink) return noopCommand
    return createSetInternalLinkCommand(internalLink, noteId, anchor)
  }
  const unsetInternalLink: Command = internalLink ? createUnsetInternalLinkCommand(internalLink) : noopCommand

  const toggleHighlightCmd = highlight
    ? (color: string): Command => toggleMark(highlight, { color })
    : (): Command => () => false

  const removeHighlight: Command = highlight
    ? (state, dispatch) => {
        dispatch?.(state.tr.removeMark(state.selection.from, state.selection.to, highlight).scrollIntoView())
        return true
      }
    : () => false

  const toggleTextColorCmd = textColor
    ? (color: string): Command => toggleMark(textColor, { color })
    : (): Command => () => false

  const removeTextColor: Command = textColor
    ? (state, dispatch) => {
        dispatch?.(state.tr.removeMark(state.selection.from, state.selection.to, textColor).scrollIntoView())
        return true
      }
    : () => false

  return {
    commands,
    toggleHighlight: toggleHighlightCmd,
    removeHighlight,
    toggleTextColor: toggleTextColorCmd,
    removeTextColor,
    setLink,
    updateLink,
    unsetLink,
    getLinkRange,
    setInternalLink,
    unsetInternalLink,
    getInternalLinkRange,
    setCalloutIcon,
    setCalloutVariant,
    setCodeLanguage,
    clearCodeLanguage,
    insertMathInline,
    insertMathBlock,
    updateMathAtSelection,
    removeMathAtSelection,
    insertTable,
    setImageAttrsAtSelection,
    setFileAttrsAtSelection,
    setTableCellAttr,
    setTableCellFormula,
    setTableCellAlignment,
    setTableCellBackground,
    insertMermaid,
    updateMermaidAtSelection,
    removeMermaidAtSelection,
    insertMarkmap,
    updateMarkmapAtSelection,
    removeMarkmapAtSelection,
    insertVega,
    updateVegaAtSelection,
    removeVegaAtSelection,
    setNoteEmbedAttrsAtSelection,
    setMediaBlockAttrsAtSelection,
    setEmbedAttrsAtSelection,
    setDatabaseDataAtSelection,
  }
}
