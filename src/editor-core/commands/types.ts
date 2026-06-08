import type { Command, EditorState } from 'prosemirror-state'
import type { NoteEmbedAttrs } from './note-embed'
import type { MediaBlockAttrs } from './media'
import type { EmbedBlockAttrs } from './embed'
export type CoreCommandId =
  | 'core.undo'
  | 'core.redo'
  | 'core.bold'
  | 'core.italic'
  | 'core.strikethrough'
  | 'core.underline'
  | 'core.code'
  | 'core.kbd'
  | 'core.tag'
  | 'core.superscript'
  | 'core.subscript'
  | 'core.paragraph'
  | 'core.heading.1'
  | 'core.heading.2'
  | 'core.heading.3'
  | 'core.heading.4'
  | 'core.heading.5'
  | 'core.heading.6'
  | 'core.blockquote'
  | 'core.codeBlock'
  | 'core.bulletList'
  | 'core.orderedList'
  | 'core.list.sink'
  | 'core.list.lift'
  | 'core.callout'
  | 'core.checklistItem'
  | 'core.divider'
  | 'core.link.set'
  | 'core.link.update'
  | 'core.link.unset'
  | 'core.setLink'
  | 'core.math.inline.insert'
  | 'core.math.block.insert'
  | 'core.math.update'
  | 'core.math.remove'
  | 'core.table.insert'
  | 'core.table.row.add.before'
  | 'core.table.row.add.after'
  | 'core.table.row.delete'
  | 'core.table.column.add.before'
  | 'core.table.column.add.after'
  | 'core.table.column.delete'
  | 'core.table.merge'
  | 'core.table.split'
  | 'core.table.header.toggle.row'
  | 'core.table.header.toggle.column'
  | 'core.table.header.toggle.cell'
  | 'core.table.delete'
  | 'core.image.insert'
  | 'core.image.remove'
  | 'core.file.insert'
  | 'core.file.remove'
  | 'core.code.language.clear'
  | 'core.mermaid.insert'
  | 'core.mermaid.update'
  | 'core.markmap.insert'
  | 'core.markmap.update'
  | 'core.vega.insert'
  | 'core.noteEmbed.insert'
  | 'core.media.audio.insert'
  | 'core.media.video.insert'
  | 'core.toggle.insert'
  | 'core.toggle.collapse'
  | 'core.embed.insert'

export interface NevoLinkRange {
  from: number
  to: number
  href: string
}

export interface NevoInternalLinkRange {
  from: number
  to: number
  noteId: string
  anchor: string | null
}

export type TableCellAlignment = 'left' | 'center' | 'right' | 'justify' | null

export interface FileBlockAttrs {
  src: string
  filename: string
  mime: string
  size: number
  caption: string
}

export interface ImageBlockAttrs {
  src: string
  alt: string
  caption: string
  sizePreset: 'small' | 'medium' | 'large' | 'full'
  width: number | string | null
  align: 'left' | 'center' | 'right'
}

export type { NoteEmbedAttrs }
export type { MediaBlockAttrs }
export type { EmbedBlockAttrs }

export interface TableInsertOptions {
  rows?: number
  cols?: number
  withHeaderRow?: boolean
}

export interface NevoCoreCommands {
  commands: Map<string, Command>
  toggleHighlight: (color: string) => Command
  removeHighlight: Command
  toggleTextColor: (color: string) => Command
  removeTextColor: Command
  setLink: (href: string) => Command
  updateLink: (href: string) => Command
  unsetLink: Command
  getLinkRange: (state: EditorState) => NevoLinkRange | null
  setInternalLink: (noteId: string, anchor?: string | null) => Command
  unsetInternalLink: Command
  getInternalLinkRange: (state: EditorState) => NevoInternalLinkRange | null
  setCalloutIcon: (icon: string) => Command
  setCalloutVariant: (variant: string) => Command
  setCodeLanguage: (language: string) => Command
  clearCodeLanguage: Command
  insertMathInline: (latex?: string) => Command
  insertMathBlock: (latex?: string) => Command
  updateMathAtSelection: (latex: string) => Command
  removeMathAtSelection: Command
  insertTable: (options?: TableInsertOptions) => Command
  setImageAttrsAtSelection: (attrs: Partial<ImageBlockAttrs>) => Command
  setFileAttrsAtSelection: (attrs: Partial<FileBlockAttrs>) => Command
  setTableCellAttr: (name: string, value: unknown) => Command
  setTableCellAlignment: (alignment: TableCellAlignment) => Command
  setTableCellBackground: (background: string | null) => Command
  insertMermaid: () => Command
  updateMermaidAtSelection: (code: string) => Command
  removeMermaidAtSelection: Command
  insertMarkmap: () => Command
  updateMarkmapAtSelection: (markdown: string) => Command
  removeMarkmapAtSelection: Command
  insertVega: () => Command
  updateVegaAtSelection: (spec: string) => Command
  removeVegaAtSelection: Command
  setNoteEmbedAttrsAtSelection: (attrs: Partial<NoteEmbedAttrs>) => Command
  setMediaBlockAttrsAtSelection: (attrs: Partial<MediaBlockAttrs>) => Command
  setEmbedAttrsAtSelection: (attrs: Partial<EmbedBlockAttrs>) => Command
}
