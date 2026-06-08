import { Schema } from 'prosemirror-model'
import { schema as basicSchema } from 'prosemirror-schema-basic'
import { addListNodes } from 'prosemirror-schema-list'
import { calloutNodeSpec, checklistItemNodeSpec, dividerNodeSpec, headingNodeSpec, toggleNodeSpec, toggleTitleNodeSpec } from './nodes-block'
import { codeBlockNodeSpec, mathBlockNodeSpec, mathInlineNodeSpec } from './nodes-content'
import {
  strikeMarkSpec,
  underlineMarkSpec,
  highlightMarkSpec,
  textColorMarkSpec,
  superscriptMarkSpec,
  subscriptMarkSpec,
} from './marks'

/**
 * A trimmed-down sibling of `nevoBaseSchema` for the lightweight mini editor.
 * It deliberately omits columns, tables and asset/embed blocks (image, file,
 * media, mermaid, note-embed) which all require workspace context, while keeping
 * the full set of text-level blocks and marks so the editing experience matches
 * the main editor.
 *
 * Vega-Lite chart blocks are also omitted (they require vega-embed and
 * workspace-level feature gating), matching the mermaid omission.
 */
const baseNodes = basicSchema.spec.nodes.remove('image').remove('horizontal_rule')

const nodes = addListNodes(baseNodes, 'paragraph block*', 'block')
  .update('code_block', codeBlockNodeSpec)
  .update('heading', headingNodeSpec)
  .addToEnd('callout', calloutNodeSpec)
  .addToEnd('checklist_item', checklistItemNodeSpec)
  .addToEnd('divider', dividerNodeSpec)
  .addToEnd('toggle', toggleNodeSpec)
  .addToEnd('toggle_title', toggleTitleNodeSpec)
  .addToEnd('math_block', mathBlockNodeSpec)
  .addToEnd('math_inline', mathInlineNodeSpec)

export const nevoMiniSchema = new Schema({
  nodes,
  marks: basicSchema.spec.marks
    .addToEnd('strike', strikeMarkSpec)
    .addToEnd('underline', underlineMarkSpec)
    .addToEnd('highlight', highlightMarkSpec)
    .addToEnd('text_color', textColorMarkSpec)
    .addToEnd('superscript', superscriptMarkSpec)
    .addToEnd('subscript', subscriptMarkSpec),
})
