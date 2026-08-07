import { describe, expect, it } from 'vitest'
import { EditorState } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { nevoBaseSchema } from '../schema'
import { parseNoteContentToDoc, serializeDocToNoteContent } from '../serialization'
import { createBlockIdRekeyPlugin } from '../plugins/blockIds'
import { ensureBlockId, ensureTopLevelBlockIds } from '../commands/blockId'
import type { BlockNode } from '../../types/note'

function mount(doc: BlockNode) {
  const parsed = parseNoteContentToDoc(nevoBaseSchema, doc)
  const state = EditorState.create({
    schema: nevoBaseSchema,
    doc: parsed,
    plugins: [createBlockIdRekeyPlugin()],
  })
  const el = document.createElement('div')
  document.body.appendChild(el)
  let view: EditorView
  // eslint-disable-next-line prefer-const
  view = new EditorView(el, {
    state,
    dispatchTransaction(tr) { view.updateState(view.state.apply(tr)) },
  })
  return { view, destroy: () => { view.destroy(); el.remove() } }
}

/** Recursively collects every `attrs.id` value found in a serialized doc,
 *  keyed by node type, so tests can assert both "no id key at all" and
 *  "the exact id value survived". */
function collectIds(node: BlockNode, out: { type: string; hasIdKey: boolean; id: unknown }[] = []) {
  out.push({ type: node.type, hasIdKey: Boolean(node.attrs && 'id' in node.attrs), id: node.attrs?.id })
  node.content?.forEach((child) => collectIds(child, out))
  return out
}

describe('block ids — serialization stays clean without an assigned id', () => {
  it('serializes plain paragraphs/headings with no `id` key at all', () => {
    const content: BlockNode = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1, collapsed: false }, content: [{ type: 'text', text: 'Title' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Body text' }] },
        { type: 'blockquote', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Quoted' }] }] },
      ],
    }

    const doc = parseNoteContentToDoc(nevoBaseSchema, content)
    const serialized = serializeDocToNoteContent(doc)

    expect(serialized).toEqual(content)
    for (const entry of collectIds(serialized)) {
      expect(entry.hasIdKey).toBe(false)
    }
  })

  it('preserves an explicitly assigned id through parse -> serialize -> parse -> serialize', () => {
    const content: BlockNode = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2, collapsed: false, id: 'stable-heading-1' }, content: [{ type: 'text', text: 'Referenced' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Not referenced' }] },
      ],
    }

    const doc = parseNoteContentToDoc(nevoBaseSchema, content)
    const serialized = serializeDocToNoteContent(doc)

    expect(serialized.content?.[0]?.attrs?.id).toBe('stable-heading-1')
    expect(serialized.content?.[1]?.attrs).toBeUndefined()

    // Round-trip again to confirm the id is stable, not regenerated.
    const doc2 = parseNoteContentToDoc(nevoBaseSchema, serialized)
    const serialized2 = serializeDocToNoteContent(doc2)
    expect(serialized2).toEqual(serialized)
  })
})

describe('ensureBlockId', () => {
  it('assigns a fresh id on first call and is idempotent on the second', () => {
    const content: BlockNode = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Target' }] }],
    }
    const { view, destroy } = mount(content)
    try {
      const id1 = ensureBlockId(view, 0)
      expect(id1).toBeTruthy()
      expect(view.state.doc.nodeAt(0)?.attrs.id).toBe(id1)

      const id2 = ensureBlockId(view, 0)
      expect(id2).toBe(id1)
    } finally {
      destroy()
    }
  })

  it('assigns ids to container blocks used as Canvas cards', () => {
    const content: BlockNode = {
      type: 'doc',
      content: [
        { type: 'table', content: [{ type: 'table_row', content: [{ type: 'table_header', content: [{ type: 'paragraph' }] }] }] },
      ],
    }
    const { view, destroy } = mount(content)
    try {
      expect(ensureBlockId(view, 0)).toBeTruthy()
    } finally {
      destroy()
    }
  })

  it('assigns every top-level block atomically without changing document order', () => {
    const content: BlockNode = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'A' }] },
        { type: 'bullet_list', content: [{ type: 'list_item', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'B' }] }] }] },
        { type: 'table', content: [{ type: 'table_row', content: [{ type: 'table_cell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'C' }] }] }] }] },
      ],
    }
    const { view, destroy } = mount(content)
    try {
      const before = view.state.doc.textContent
      const ids = ensureTopLevelBlockIds(view)
      expect(ids).toHaveLength(3)
      expect(new Set(ids).size).toBe(3)
      expect(view.state.doc.textContent).toBe(before)
      expect(view.state.doc.child(0).type.name).toBe('paragraph')
      expect(view.state.doc.child(1).type.name).toBe('bullet_list')
      expect(view.state.doc.child(2).type.name).toBe('table')
    } finally {
      destroy()
    }
  })
})

describe('block id re-key plugin', () => {
  it('regenerates the id of a duplicated block while the original keeps its id', () => {
    const content: BlockNode = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1, collapsed: false, id: 'original-id' }, content: [{ type: 'text', text: 'Original' }] },
      ],
    }
    const { view, destroy } = mount(content)
    try {
      const headingType = nevoBaseSchema.nodes.heading
      const originalNode = view.state.doc.child(0)
      // Simulate a split/paste/duplicate: insert a second node carrying the
      // exact same attrs (including `id`) right after the first.
      const duplicate = headingType.create(originalNode.attrs, originalNode.content)
      const insertPos = originalNode.nodeSize
      view.dispatch(view.state.tr.insert(insertPos, duplicate))

      const doc = view.state.doc
      expect(doc.childCount).toBe(2)
      const firstId = doc.child(0).attrs.id
      const secondId = doc.child(1).attrs.id

      expect(firstId).toBe('original-id')
      expect(secondId).toBeTruthy()
      expect(secondId).not.toBe('original-id')
    } finally {
      destroy()
    }
  })

  it('leaves distinct ids untouched (no false positives)', () => {
    const content: BlockNode = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1, collapsed: false, id: 'id-a' }, content: [{ type: 'text', text: 'A' }] },
        { type: 'heading', attrs: { level: 1, collapsed: false, id: 'id-b' }, content: [{ type: 'text', text: 'B' }] },
      ],
    }
    const { view, destroy } = mount(content)
    try {
      // Trigger any doc-changing transaction so appendTransaction runs.
      // pos 1 is inside the first heading's text content.
      view.dispatch(view.state.tr.insertText('!', 1))

      const doc = view.state.doc
      expect(doc.child(0).attrs.id).toBe('id-a')
      expect(doc.child(1).attrs.id).toBe('id-b')
    } finally {
      destroy()
    }
  })
})
