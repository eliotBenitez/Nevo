import type { NodeType } from 'prosemirror-model'
import type { Command } from 'prosemirror-state'
import { createInsertBlockCommand, createSetNodeAttrsCommand } from './utils'

export interface BookmarkEmbedAttrs {
  url: string
  title: string
  description: string
  domain: string
  thumbnailUrl: string
}

export function createInsertBookmarkCommand(bookmarkEmbed: NodeType): Command {
  return createInsertBlockCommand(bookmarkEmbed, {
    url: '',
    title: '',
    description: '',
    domain: '',
    thumbnailUrl: '',
  })
}

export function createBookmarkAttrsCommand(bookmarkEmbed: NodeType, attrs: Partial<BookmarkEmbedAttrs>): Command {
  return createSetNodeAttrsCommand(bookmarkEmbed, (node) => ({ ...node.attrs, ...attrs }))
}
