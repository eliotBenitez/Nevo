import { describe, expect, it } from 'vitest'
import { EditorState } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { createBrokenLinkDecorationPlugin, brokenLinkPluginKey } from '../plugins/broken-link-decoration'
import { nevoBaseSchema } from '../schema'
import { parseNoteContentToDoc } from '../serialization'
import type { BlockNode } from '../../types/note'

function docWithLinks(links: { noteId: string; text: string }[]): BlockNode {
  return {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: links.map((l) => ({
          type: 'text',
          text: l.text,
          marks: [{ type: 'internal_link', attrs: { noteId: l.noteId, anchor: null, title: null, alias: null } }],
        })),
      },
    ],
  }
}

function mountWith(exists: (id: string) => boolean, doc: BlockNode) {
  const parsed = parseNoteContentToDoc(nevoBaseSchema, doc)
  const state = EditorState.create({
    schema: nevoBaseSchema,
    doc: parsed,
    plugins: [createBrokenLinkDecorationPlugin({ exists })],
  })
  const mount = document.createElement('div')
  document.body.appendChild(mount)
  const view = new EditorView(mount, {
    state,
    dispatchTransaction(tr) { view.updateState(view.state.apply(tr)) },
  })
  return {
    view,
    destroy() { view.destroy(); mount.remove() },
  }
}

describe('broken-link decoration plugin', () => {
  it('decorates only links whose noteId does not exist', () => {
    const { view, destroy } = mountWith(
      (id) => id === 'exists',
      docWithLinks([
        { noteId: 'exists', text: 'good' },
        { noteId: 'missing', text: 'bad' },
      ]),
    )
    const set = brokenLinkPluginKey.getState(view.state)
    expect(set).toBeDefined()
    const decos = set!.find()
    // One inline decoration is expected — over the "bad" text node.
    expect(decos.length).toBe(1)
    destroy()
  })

  it('produces no decorations when every link resolves', () => {
    const { view, destroy } = mountWith(
      () => true,
      docWithLinks([
        { noteId: 'a', text: 'a' },
        { noteId: 'b', text: 'b' },
      ]),
    )
    const set = brokenLinkPluginKey.getState(view.state)
    expect(set!.find()).toHaveLength(0)
    destroy()
  })

  it('recomputes when a refresh meta transaction is dispatched', () => {
    let known = new Set(['a'])
    const { view, destroy } = mountWith(
      (id) => known.has(id),
      docWithLinks([{ noteId: 'b', text: 'b' }]),
    )
    // Initially "b" is broken.
    expect(brokenLinkPluginKey.getState(view.state)!.find()).toHaveLength(1)
    // Simulate the workspace tree gaining note "b".
    known = new Set(['a', 'b'])
    view.dispatch(view.state.tr.setMeta(brokenLinkPluginKey, true))
    expect(brokenLinkPluginKey.getState(view.state)!.find()).toHaveLength(0)
    destroy()
  })
})
