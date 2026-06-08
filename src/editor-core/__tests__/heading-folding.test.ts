import { describe, expect, it } from 'vitest'
import { Decoration, EditorView } from 'prosemirror-view'
import { createNevoEditorState } from '../state'
import { nevoBaseSchema } from '../schema'
import type { BlockNode } from '../../types/note'
import { headingFoldingKey } from '../plugins/heading-folding'

describe('heading folding', () => {
  it('hides content between collapsed heading and next same/higher level heading', () => {
    const content: BlockNode = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1, collapsed: true }, content: [{ type: 'text', text: 'H1 folded' }] } as any,
        { type: 'paragraph', content: [{ type: 'text', text: 'P1 hidden' }] } as any,
        { type: 'heading', attrs: { level: 2, collapsed: false }, content: [{ type: 'text', text: 'H2 hidden' }] } as any,
        { type: 'paragraph', content: [{ type: 'text', text: 'P2 hidden' }] } as any,
        { type: 'heading', attrs: { level: 1, collapsed: false }, content: [{ type: 'text', text: 'H1 visible' }] } as any,
        { type: 'paragraph', content: [{ type: 'text', text: 'P3 visible' }] } as any,
      ],
    }

    const setup = createNevoEditorState({ schema: nevoBaseSchema, content })
    const mount = document.createElement('div')
    const view = new EditorView(mount, {
      state: setup.state,
    })

    const decorations = headingFoldingKey.getState(view.state)
    const decoratedNodes = decorations.find()
    
    // We expect 3 nodes to be hidden: P1, H2, P2.
    // H1 folded is visible. H1 visible is visible. P3 is visible.
    expect(decoratedNodes).toHaveLength(3)
    
    // Check if classes are correct
    decoratedNodes.forEach((deco: Decoration) => {
      expect(((deco as any).type as any).attrs.class).toBe('nv-heading-folded-hidden')
    })
  })

  it('unfolds content when heading collapsed attribute is toggled', () => {
    const content: BlockNode = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1, collapsed: true }, content: [{ type: 'text', text: 'H1' }] } as any,
        { type: 'paragraph', content: [{ type: 'text', text: 'P1' }] } as any,
      ],
    }

    const setup = createNevoEditorState({ schema: nevoBaseSchema, content })
    const mount = document.createElement('div')
    const view = new EditorView(mount, {
      state: setup.state,
      dispatchTransaction(tr) {
        view.updateState(view.state.apply(tr))
      }
    })

    expect(headingFoldingKey.getState(view.state).find()).toHaveLength(1)

    // Toggle collapse
    const tr = view.state.tr.setNodeMarkup(0, undefined, { level: 1, collapsed: false })
    tr.setMeta(headingFoldingKey, true)
    view.dispatch(tr)

    expect(headingFoldingKey.getState(view.state).find()).toHaveLength(0)
  })

  it('toggles collapse state when chevron is clicked', () => {
    const content: BlockNode = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1, collapsed: false }, content: [{ type: 'text', text: 'H1' }] } as any,
      ],
    }

    const setup = createNevoEditorState({ schema: nevoBaseSchema, content })
    const mount = document.createElement('div')
    document.body.appendChild(mount)
    const view = new EditorView(mount, {
      state: setup.state,
      nodeViews: setup.nodeViews,
      dispatchTransaction(tr) {
        view.updateState(view.state.apply(tr))
      }
    })

    try {
      const headingNode = mount.querySelector('.nv-heading')
      const toggle = headingNode?.querySelector('.nv-heading-toggle') as HTMLElement
      expect(toggle).toBeTruthy()

      // Trigger click on toggle
      toggle.click()

      expect(view.state.doc.firstChild?.attrs.collapsed).toBe(true)

      // Toggle back
      toggle.click()
      expect(view.state.doc.firstChild?.attrs.collapsed).toBe(false)
    } finally {
      mount.remove()
    }
  })
})
