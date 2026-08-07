import { Schema } from 'prosemirror-model'
import { schema as basicSchema } from 'prosemirror-schema-basic'
import { addListNodes } from 'prosemirror-schema-list'
import { blockquoteNodeSpec, calloutNodeSpec, checklistItemNodeSpec, dividerNodeSpec, headingNodeSpec, paragraphNodeSpec, toggleNodeSpec, toggleTitleNodeSpec } from './nodes-block'
import { codeBlockNodeSpec, drawBlockNodeSpec, fileBlockNodeSpec, imageBlockNodeSpec, mathBlockNodeSpec, mathInlineNodeSpec, markmapBlockNodeSpec, mermaidBlockNodeSpec, queryBlockNodeSpec, vegaBlockNodeSpec } from './nodes-content'
import { mediaBlockNodeSpec, noteEmbedNodeSpec, embedBlockNodeSpec, blockEmbedNodeSpec } from './nodes-embeds'
import { databaseNodeSpec } from './nodes-database'
import { columnListNodeSpec, columnNodeSpec } from './nodes-columns'
import { tableNodeSpecs } from './nodes-table'
import { withStableBlockIdSpec } from './blockIdAttr'
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
  .update('paragraph', paragraphNodeSpec)
  .update('blockquote', blockquoteNodeSpec)
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
  .addToEnd('block_embed', blockEmbedNodeSpec)
  .addToEnd('media_block', mediaBlockNodeSpec)
  .addToEnd('database_block', databaseNodeSpec)
  .addToEnd('query_block', queryBlockNodeSpec)
  .addToEnd('column_list', columnListNodeSpec)
  .addToEnd('column', columnNodeSpec)

for (const [name, spec] of Object.entries(tableNodeSpecs)) {
  nodes = nodes.addToEnd(name, spec)
}

// Canvas cards address every top-level document block by the same stable id
// contract. Explicit specs above keep their custom DOM handling; the remaining
// containers/atoms are extended without changing their existing attributes.
for (const name of [
  'bullet_list',
  'ordered_list',
  'divider',
  'toggle',
  'file_block',
  'note_embed',
  'embed_block',
  'block_embed',
  'media_block',
  'column_list',
  'table',
]) {
  const spec = nodes.get(name)
  if (spec) nodes = nodes.update(name, withStableBlockIdSpec(spec))
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
