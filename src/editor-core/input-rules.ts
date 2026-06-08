import { InputRule, inputRules, textblockTypeInputRule, wrappingInputRule } from 'prosemirror-inputrules'
import { NodeSelection, TextSelection } from 'prosemirror-state'
import type { Plugin } from 'prosemirror-state'
import { Fragment, type MarkType, type Node as PMNode, type NodeType, type Schema } from 'prosemirror-model'

function markInputRule(regexp: RegExp, markType: MarkType, attrs?: Record<string, unknown>): InputRule {
  return new InputRule(regexp, (state, match, start, end) => {
    const tr = state.tr
    if (match[1]) {
      const textStart = start + match[0].indexOf(match[1])
      const textEnd = textStart + match[1].length
      if (textEnd < end) tr.delete(textEnd, end)
      if (textStart > start) tr.delete(start, textStart)
      end = start + match[1].length
    }
    tr.addMark(start, end, markType.create(attrs))
    tr.removeStoredMark(markType)
    return tr
  })
}

function findListItemDepth($from: TextSelection['$from'], listItemType: NodeType): number | null {
  for (let depth = $from.depth; depth >= 1; depth -= 1) {
    if ($from.node(depth).type === listItemType) return depth
  }

  return null
}

function canReuseNestedOrderedList(list: PMNode, nextOrder: number): boolean {
  const order = typeof list.attrs.order === 'number' ? list.attrs.order : 1
  return order + list.childCount === nextOrder
}

function createNestedListMarkerRule(schema: Schema, regexp: RegExp, getList: (match: RegExpMatchArray) => { type: NodeType; attrs?: Record<string, unknown>; order?: number } | null): InputRule {
  return new InputRule(regexp, (state, match) => {
    const listItemType = schema.nodes.list_item
    const paragraphType = schema.nodes.paragraph
    if (!listItemType || !paragraphType || !(state.selection instanceof TextSelection) || !state.selection.$cursor) return null

    const $cursor = state.selection.$cursor
    const markerBeforeTypedSpace = match[0].slice(0, -1)
    if (
      $cursor.parent.type !== paragraphType
      || ($cursor.parent.textContent !== markerBeforeTypedSpace && $cursor.parent.textContent !== match[0])
    ) return null

    const itemDepth = findListItemDepth($cursor, listItemType)
    if (itemDepth === null || itemDepth < 2) return null

    const listDepth = itemDepth - 1
    const parentList = $cursor.node(listDepth)
    const currentItemIndex = $cursor.index(listDepth)
    if (currentItemIndex === 0) return null

    const currentItem = parentList.child(currentItemIndex)
    if (currentItem.childCount !== 1 || currentItem.firstChild?.type !== paragraphType) return null

    const targetList = getList(match)
    if (!targetList) return null

    const previousItem = parentList.child(currentItemIndex - 1)
    const newParagraph = paragraphType.createAndFill()
    if (!newParagraph) return null
    const newSubItem = listItemType.createAndFill(null, newParagraph)
    if (!newSubItem) return null

    const previousChildren: PMNode[] = []
    previousItem.forEach((child) => previousChildren.push(child))

    let nestedListIndex = previousChildren.length - 1
    const lastChild = nestedListIndex >= 0 ? previousChildren[nestedListIndex] : null
    const canAppendToLastList = Boolean(
      lastChild
      && lastChild.type === targetList.type
      && (targetList.type.name !== 'ordered_list' || canReuseNestedOrderedList(lastChild, targetList.order ?? 1)),
    )

    let nestedItemIndex = 0
    if (canAppendToLastList && lastChild) {
      nestedItemIndex = lastChild.childCount
      previousChildren[nestedListIndex] = lastChild.copy(lastChild.content.append(Fragment.from(newSubItem)))
    } else {
      nestedListIndex = previousChildren.length
      previousChildren.push(targetList.type.create(targetList.attrs ?? null, [newSubItem]))
    }

    const updatedPreviousItem = previousItem.copy(Fragment.fromArray(previousChildren))

    const listStart = $cursor.start(listDepth)
    let previousItemStart = listStart
    for (let index = 0; index < currentItemIndex - 1; index += 1) {
      previousItemStart += parentList.child(index).nodeSize
    }
    const currentItemStart = previousItemStart + previousItem.nodeSize
    const currentItemEnd = currentItemStart + currentItem.nodeSize

    let nestedListStart = previousItemStart + 1
    for (let index = 0; index < nestedListIndex; index += 1) {
      nestedListStart += updatedPreviousItem.child(index).nodeSize
    }

    const nestedList = updatedPreviousItem.child(nestedListIndex)
    let nestedItemStart = nestedListStart + 1
    for (let index = 0; index < nestedItemIndex; index += 1) {
      nestedItemStart += nestedList.child(index).nodeSize
    }

    const tr = state.tr
      .delete(currentItemStart, currentItemEnd)
      .replaceWith(previousItemStart, previousItemStart + previousItem.nodeSize, updatedPreviousItem)

    return tr.setSelection(TextSelection.create(tr.doc, nestedItemStart + 2)).scrollIntoView()
  })
}

function blockRules(schema: Schema): InputRule[] {
  const rules: InputRule[] = []

  // # / ## / ### → heading (triggered by space after hashes)
  if (schema.nodes.heading) {
    rules.push(
      textblockTypeInputRule(/^(#{1,6})\s$/, schema.nodes.heading, (match) => ({
        level: match[1].length,
      })),
    )
  }

  // > → blockquote
  if (schema.nodes.blockquote) {
    rules.push(wrappingInputRule(/^\s*>\s$/, schema.nodes.blockquote))
  }

  // ```lang → code block (triggered by space after optional language)
  if (schema.nodes.code_block) {
    rules.push(
      textblockTypeInputRule(/^```(\w*)\s$/, schema.nodes.code_block, (match) => ({
        language: match[1] || null,
      })),
    )
  }

  if (schema.nodes.bullet_list && schema.nodes.ordered_list && schema.nodes.list_item && schema.nodes.paragraph) {
    rules.push(
      createNestedListMarkerRule(schema, /^\s*[-*]\s$/, () => ({ type: schema.nodes.bullet_list })),
      createNestedListMarkerRule(schema, /^(\d+)\.\s$/, (match) => ({
        type: schema.nodes.ordered_list,
        attrs: { order: +match[1] },
        order: +match[1],
      })),
    )
  }

  // - or * → bullet list
  if (schema.nodes.bullet_list) {
    rules.push(wrappingInputRule(/^\s*[-*]\s$/, schema.nodes.bullet_list))
  }

  // 1. → ordered list
  if (schema.nodes.ordered_list) {
    rules.push(
      wrappingInputRule(
        /^(\d+)\.\s$/,
        schema.nodes.ordered_list,
        (match) => ({ order: +match[1] }),
        (match, node) => node.childCount + node.attrs.order === +match[1],
      ),
    )
  }

  // [ ] or [x] → checklist item
  if (schema.nodes.checklist_item) {
    rules.push(
      textblockTypeInputRule(/^\[([ x]?)\]\s$/, schema.nodes.checklist_item, (match) => ({
        checked: match[1] === 'x',
      })),
    )
  }

  // --- → divider + new paragraph
  if (schema.nodes.divider && schema.nodes.paragraph) {
    rules.push(
      new InputRule(/^---$/, (state) => {
        const { $from } = state.selection
        if (!$from.parent.isTextblock) return null
        const divider = schema.nodes.divider.create()
        const para = schema.nodes.paragraph.create()
        const from = $from.before()
        const to = $from.after()
        const tr = state.tr.replaceWith(from, to, [divider, para])
        return tr.setSelection(TextSelection.create(tr.doc, from + divider.nodeSize + 1))
      }),
    )
  }

  // ```mermaid → mermaid diagram block
  if (schema.nodes.mermaid_block) {
    rules.push(
      new InputRule(/^```mermaid\s$/, (state) => {
        const { $from } = state.selection
        if (!$from.parent.isTextblock) return null
        const mermaidBlock = schema.nodes.mermaid_block.create({ code: 'graph TD\n  A --> B' })
        const from = $from.before()
        const tr = state.tr.replaceWith(from, $from.after(), mermaidBlock)
        return tr.setSelection(NodeSelection.create(tr.doc, from))
      }),
    )
  }

  // ```markmap → markmap mind map block
  if (schema.nodes.markmap_block) {
    rules.push(
      new InputRule(/^```markmap\s$/, (state) => {
        const { $from } = state.selection
        if (!$from.parent.isTextblock) return null
        const markmapBlock = schema.nodes.markmap_block.create({ markdown: '# Topic\n## Idea A\n## Idea B' })
        const from = $from.before()
        const tr = state.tr.replaceWith(from, $from.after(), markmapBlock)
        return tr.setSelection(NodeSelection.create(tr.doc, from))
      }),
    )
  }

  // $$ at start of empty block → math block
  if (schema.nodes.math_block) {
    rules.push(
      new InputRule(/^\$\$$/, (state) => {
        const { $from } = state.selection
        if (!$from.parent.isTextblock) return null
        const mathBlock = schema.nodes.math_block.create({ latex: '', displayMode: true })
        const from = $from.before()
        const tr = state.tr.replaceWith(from, $from.after(), mathBlock)
        return tr.setSelection(NodeSelection.create(tr.doc, from))
      }),
    )
  }

  return rules
}

function markRules(schema: Schema): InputRule[] {
  const rules: InputRule[] = []

  // **text** or __text__ → bold (must come before italic)
  if (schema.marks.strong) {
    rules.push(markInputRule(/\*\*([^*]+)\*\*$/, schema.marks.strong))
    rules.push(markInputRule(/__([^_]+)__$/, schema.marks.strong))
  }

  // *text* or _text_ → italic (negative look-around avoids matching **)
  if (schema.marks.em) {
    rules.push(markInputRule(/(?<!\*)\*([^*]+)\*(?!\*)$/, schema.marks.em))
    rules.push(markInputRule(/(?<!_)_([^_]+)_(?!_)$/, schema.marks.em))
  }

  // `text` → inline code
  if (schema.marks.code) {
    rules.push(markInputRule(/`([^`]+)`$/, schema.marks.code))
  }

  // ~~text~~ → strikethrough
  if (schema.marks.strike) {
    rules.push(markInputRule(/~~([^~]+)~~$/, schema.marks.strike))
  }

  // ==text== → highlight
  if (schema.marks.highlight) {
    rules.push(markInputRule(/==([^=]+)==$/, schema.marks.highlight))
  }

  return rules
}

function inlineNodeRules(schema: Schema): InputRule[] {
  const rules: InputRule[] = []

  if (schema.nodes.math_inline) {
    // $$formula$$ inline → display-mode math (must come before single-$ rule)
    rules.push(
      new InputRule(/(?<!\$)\$\$([^$\n]+)\$\$(?!\$)$/, (state, match, start, end) => {
        const node = schema.nodes.math_inline.create({ latex: match[1], displayMode: true })
        return state.tr.replaceWith(start, end, node)
      }),
    )

    // $formula$ → inline math
    rules.push(
      new InputRule(/(?<!\$)\$([^$\n]+)\$(?!\$)$/, (state, match, start, end) => {
        const node = schema.nodes.math_inline.create({ latex: match[1], displayMode: false })
        return state.tr.replaceWith(start, end, node)
      }),
    )
  }

  return rules
}

export function createMarkdownInputRules(schema: Schema): Plugin {
  return inputRules({
    rules: [
      ...blockRules(schema),
      ...markRules(schema),
      ...inlineNodeRules(schema),
    ],
  })
}
