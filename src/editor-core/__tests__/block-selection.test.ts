import { describe, expect, it } from 'vitest'
import { TextSelection } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { createNevoEditorState } from '../state'
import { nevoBaseSchema } from '../schema'
import type { BlockNode } from '../../types/note'

interface TextBlockPosition {
  contentFrom: number
  contentTo: number
}

function findTextBlockPosition(view: EditorView, text: string): TextBlockPosition {
  let found: TextBlockPosition | null = null

  view.state.doc.descendants((node, pos) => {
    if (found || !node.isTextblock || node.textContent !== text) return true

    found = {
      contentFrom: pos + 1,
      contentTo: pos + 1 + node.content.size,
    }

    return false
  })

  if (!found) {
    throw new Error(`Text block "${text}" not found`)
  }

  return found
}

function mountEditor(content: BlockNode) {
  const setup = createNevoEditorState({ schema: nevoBaseSchema, content })
  const mount = document.createElement('div')
  document.body.appendChild(mount)

  const view = new EditorView(mount, {
    state: setup.state,
    nodeViews: setup.nodeViews,
    dispatchTransaction(transaction) {
      view.updateState(view.state.apply(transaction))
    },
  })

  return {
    view,
    mount,
    destroy() {
      view.destroy()
      mount.remove()
    },
  }
}

function setTextSelection(view: EditorView, from: number, to: number) {
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, from, to)))
}

describe('block selection', () => {
  it('does not decorate a partially selected single block', () => {
    const content: BlockNode = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'alpha block' }] },
      ],
    }

    const { view, mount, destroy } = mountEditor(content)

    try {
      const paragraph = findTextBlockPosition(view, 'alpha block')
      setTextSelection(view, paragraph.contentFrom + 1, paragraph.contentFrom + 5)

      expect(mount.querySelector('.nv-block-selected')).toBeNull()
    } finally {
      destroy()
    }
  })

  it('decorates a fully selected single block without the range class', () => {
    const content: BlockNode = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'alpha block' }] },
      ],
    }

    const { view, mount, destroy } = mountEditor(content)

    try {
      const paragraph = findTextBlockPosition(view, 'alpha block')
      setTextSelection(view, paragraph.contentFrom, paragraph.contentTo)

      const selected = mount.querySelector('.nv-block-selected')
      expect(selected).toBeInstanceOf(HTMLElement)
      expect(selected?.classList.contains('nv-block-selection-range')).toBe(false)
      expect(selected?.textContent).toBe('alpha block')
    } finally {
      destroy()
    }
  })

  it('adds the range class to blocks touched by a multi-block selection', () => {
    const content: BlockNode = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'first block' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'second block' }] },
      ],
    }

    const { view, mount, destroy } = mountEditor(content)

    try {
      const first = findTextBlockPosition(view, 'first block')
      const second = findTextBlockPosition(view, 'second block')
      setTextSelection(view, first.contentFrom + 2, second.contentFrom + 4)

      const selected = Array.from(mount.querySelectorAll('.nv-block-selected'))
      expect(selected).toHaveLength(2)
      expect(selected.every((element) => element.classList.contains('nv-block-selection-range'))).toBe(true)
      expect(selected.map((element) => element.textContent)).toEqual(['first block', 'second block'])
    } finally {
      destroy()
    }
  })
})
