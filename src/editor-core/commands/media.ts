import type { NodeType } from 'prosemirror-model'
import type { Command } from 'prosemirror-state'
import { createInsertBlockCommand, createSetNodeAttrsCommand } from './utils'

export interface MediaBlockAttrs {
  kind: 'audio' | 'video'
  src: string
  name: string
  mime: string
  size: number
  duration: number | null
  poster: string
  bookmarks: unknown[]
}

export function createInsertMediaBlockCommand(mediaBlock: NodeType, kind: 'audio' | 'video'): Command {
  return createInsertBlockCommand(mediaBlock, {
    kind,
    src: '',
    name: '',
    mime: '',
    size: 0,
    duration: null,
    poster: '',
    bookmarks: [],
  })
}

export function createMediaBlockAttrsCommand(mediaBlock: NodeType, attrs: Partial<MediaBlockAttrs>): Command {
  return createSetNodeAttrsCommand(mediaBlock, (node) => ({ ...node.attrs, ...attrs }))
}
