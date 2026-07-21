import { Schema } from 'prosemirror-model'
import { schema as basicSchema } from 'prosemirror-schema-basic'
import { addListNodes } from 'prosemirror-schema-list'
import { calloutNodeSpec, checklistItemNodeSpec, dividerNodeSpec, headingNodeSpec, toggleNodeSpec, toggleTitleNodeSpec } from './nodes-block'
import { codeBlockNodeSpec, drawBlockNodeSpec, fileBlockNodeSpec, imageBlockNodeSpec, mathBlockNodeSpec, mathInlineNodeSpec, markmapBlockNodeSpec, mermaidBlockNodeSpec, vegaBlockNodeSpec } from './nodes-content'
import { mediaBlockNodeSpec, noteEmbedNodeSpec, embedBlockNodeSpec } from './nodes-embeds'
import { databaseNodeSpec } from './nodes-database'
import { columnListNodeSpec, columnNodeSpec } from './nodes-columns'
import { tableNodeSpecs } from './nodes-table'
import {
  strikeMarkSpec,
  underlineMarkSpec,
  highlightMarkSpec,
  textColorMarkSpec,
  superscriptMarkSpec,
  subscriptMarkSpec,
  internalLinkMarkSpec,
  kbdMarkSpec,
  tagMarkSpec,
} from './marks'

let nodes = addListNodes(basicSchema.spec.nodes, 'paragraph block*', 'block')
  .update('code_block', codeBlockNodeSpec)
  .update('heading', headingNodeSpec)
  .addToEnd('callout', calloutNodeSpec)
  .addToEnd('checklist_item', checklistItemNodeSpec)
  .addToEnd('toggle', toggleNodeSpec)
  .addToEnd('toggle_title', toggleTitleNodeSpec)
  .addToEnd('divider', dividerNodeSpec)
  .addToEnd('math_block', mathBlockNodeSpec)
  .addToEnd('math_inline', mathInlineNodeSpec)
  .addToEnd('image_block', imageBlockNodeSpec)
  .addToEnd('file_block', fileBlockNodeSpec)
  .addToEnd('mermaid_block', mermaidBlockNodeSpec)
  .addToEnd('draw_block', drawBlockNodeSpec)
  .addToEnd('markmap_block', markmapBlockNodeSpec)
  .addToEnd('vega_block', vegaBlockNodeSpec)
  .addToEnd('note_embed', noteEmbedNodeSpec)
  .addToEnd('embed_block', embedBlockNodeSpec)
  .addToEnd('media_block', mediaBlockNodeSpec)
  .addToEnd('database_block', databaseNodeSpec)
  .addToEnd('column_list', columnListNodeSpec)
  .addToEnd('column', columnNodeSpec)

for (const [name, spec] of Object.entries(tableNodeSpecs)) {
  nodes = nodes.addToEnd(name, spec)
}

export const nevoBaseSchema = new Schema({
  nodes,
  marks: basicSchema.spec.marks
    .addToEnd('strike', strikeMarkSpec)
    .addToEnd('underline', underlineMarkSpec)
    .addToEnd('highlight', highlightMarkSpec)
    .addToEnd('text_color', textColorMarkSpec)
    .addToEnd('superscript', superscriptMarkSpec)
    .addToEnd('subscript', subscriptMarkSpec)
    .addToEnd('internal_link', internalLinkMarkSpec)
    .addToEnd('kbd', kbdMarkSpec)
    .addToEnd('tag', tagMarkSpec),
})
