import type { Schema } from 'prosemirror-model'
import type { NodeViewConstructor } from 'prosemirror-view'
import { createCalloutNodeView, createChecklistItemNodeView } from './simple'
import { createMathNodeView } from './math'
import { createImageNodeView } from './image'
import { createHeadingNodeView } from './heading'
import { createFileNodeView } from './file'
import { createCodeBlockNodeView } from './code-block'
import { createMermaidNodeView } from './mermaid'
import { createDrawNodeView } from './draw'
import { createMarkmapNodeView } from './markmap'
import { createVegaNodeView } from './vega'
import { createNoteEmbedNodeView } from './note-embed'
import { createEmbedNodeView } from './embed'
import { createMediaNodeView } from './media'
import { createDatabaseNodeView } from './database'
import { createColumnListNodeView, createColumnNodeView } from './columns'
import { createToggleNodeView, createToggleTitleNodeView } from './toggle'
import type { CoreNodeViewOptions } from './utils'

export type { CoreNodeViewOptions } from './utils'

export function createCoreNodeViews(schema: Schema, options?: CoreNodeViewOptions): Record<string, NodeViewConstructor> {
  const nodeViews: Record<string, NodeViewConstructor> = {}

  if (schema.nodes.heading) {
    nodeViews.heading = (node, view, getPos) => createHeadingNodeView(node, view, getPos)
  }
  if (schema.nodes.callout) {
    nodeViews.callout = (node, view, getPos) => createCalloutNodeView(node, view, getPos, options)
  }
  if (schema.nodes.checklist_item) {
    nodeViews.checklist_item = (node, view, getPos) => createChecklistItemNodeView(node, view, getPos)
  }
  if (schema.nodes.math_inline) {
    nodeViews.math_inline = (node, view, getPos) => createMathNodeView(node, view, getPos, options)
  }
  if (schema.nodes.math_block) {
    nodeViews.math_block = (node, view, getPos) => createMathNodeView(node, view, getPos, options)
  }
  if (schema.nodes.image_block) {
    nodeViews.image_block = (node, view, getPos) => createImageNodeView(node, view, getPos, options)
  }
  if (schema.nodes.file_block) {
    nodeViews.file_block = (node, view, getPos) => createFileNodeView(node, view, getPos, options)
  }
  if (schema.nodes.code_block) {
    nodeViews.code_block = (node, view, getPos) => createCodeBlockNodeView(node, view, getPos, options)
  }
  if (schema.nodes.mermaid_block) {
    nodeViews.mermaid_block = (node, view, getPos) => createMermaidNodeView(node, view, getPos, options)
  }
  if (schema.nodes.draw_block) {
    nodeViews.draw_block = (node, view, getPos) => createDrawNodeView(node, view, getPos, options)
  }
  if (schema.nodes.markmap_block) {
    nodeViews.markmap_block = (node, view, getPos) => createMarkmapNodeView(node, view, getPos, options)
  }
  if (schema.nodes.vega_block) {
    nodeViews.vega_block = (node, view, getPos) => createVegaNodeView(node, view, getPos, options)
  }
  if (schema.nodes.note_embed) {
    nodeViews.note_embed = (node, view, getPos) => createNoteEmbedNodeView(node, view, getPos, options)
  }
  if (schema.nodes.embed_block) {
    nodeViews.embed_block = (node, view, getPos) => createEmbedNodeView(node, view, getPos, options)
  }
  if (schema.nodes.media_block) {
    nodeViews.media_block = (node, view, getPos) => createMediaNodeView(node, view, getPos, options)
  }
  if (schema.nodes.database_block) {
    nodeViews.database_block = (node, view, getPos) => createDatabaseNodeView(node, view, getPos, options)
  }
  if (schema.nodes.column_list) {
    nodeViews.column_list = (node, view, getPos) => createColumnListNodeView(node, view, getPos)
  }
  if (schema.nodes.column) {
    nodeViews.column = (node) => createColumnNodeView(node)
  }
  if (schema.nodes.toggle) {
    nodeViews.toggle = (node, view, getPos) => createToggleNodeView(node, view, getPos)
  }
  if (schema.nodes.toggle_title) {
    nodeViews.toggle_title = (node) => createToggleTitleNodeView(node)
  }
  return nodeViews
}
