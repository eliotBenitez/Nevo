import type { NodeType } from 'prosemirror-model'
import type { Command } from 'prosemirror-state'
import { createInsertBlockCommand, createSetNodeAttrsCommand } from './utils'

export interface NoteEmbedAttrs {
  noteId: string
  title: string
  previewText: string
}

export function createInsertNoteEmbedCommand(noteEmbed: NodeType): Command {
  return createInsertBlockCommand(noteEmbed, { noteId: '', title: '', previewText: '' })
}

export function createNoteEmbedAttrsCommand(noteEmbed: NodeType, attrs: Partial<NoteEmbedAttrs>): Command {
  return createSetNodeAttrsCommand(noteEmbed, (node) => ({ ...node.attrs, ...attrs }))
}
