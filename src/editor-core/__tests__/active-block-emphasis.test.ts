import { describe, expect, it } from 'vitest'
// @ts-expect-error Vitest runs in Node; the app tsconfig does not include Node types.
import { readFileSync } from 'node:fs'
import { TextSelection } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { createNevoEditorState } from '../state'
import { nevoBaseSchema } from '../schema'
import { parseNoteContentToDoc } from '../serialization'
import type { BlockNode } from '../../types/note'

interface TextBlockPosition {
  from: number
  contentFrom: number
}

function findTextBlockPosition(doc: ReturnType<typeof parseNoteContentToDoc>, text: string): TextBlockPosition {
  let found: TextBlockPosition | null = null

  doc.descendants((node, pos) => {
    if (found || !node.isTextblock || node.textContent !== text) return true

    found = {
      from: pos,
      contentFrom: pos + 1,
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

function setCursor(view: EditorView, pos: number) {
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos)))
}

describe('active block emphasis', () => {
  it('adds the active block decoration to the text block containing a collapsed cursor', () => {
    const content: BlockNode = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'alpha block' }] },
      ],
    }

    const { view, mount, destroy } = mountEditor(content)

    try {
      const paragraph = findTextBlockPosition(view.state.doc, 'alpha block')
      setCursor(view, paragraph.contentFrom + 2)

      const activeBlock = mount.querySelector('.nv-active-block')
      expect(activeBlock).toBeInstanceOf(HTMLElement)
      expect(activeBlock?.tagName).toBe('P')
      expect(activeBlock?.textContent).toBe('alpha block')
    } finally {
      destroy()
    }
  })

  it('moves the active block decoration between adjacent paragraphs as the cursor moves', () => {
    const content: BlockNode = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'first paragraph' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'second paragraph' }] },
      ],
    }

    const { view, mount, destroy } = mountEditor(content)

    try {
      const firstParagraph = findTextBlockPosition(view.state.doc, 'first paragraph')
      const secondParagraph = findTextBlockPosition(view.state.doc, 'second paragraph')

      setCursor(view, firstParagraph.contentFrom + 1)
      expect(mount.querySelectorAll('.nv-active-block')).toHaveLength(1)
      expect(mount.querySelector('.nv-active-block')?.textContent).toBe('first paragraph')

      setCursor(view, secondParagraph.contentFrom + 1)
      expect(mount.querySelectorAll('.nv-active-block')).toHaveLength(1)
      expect(mount.querySelector('.nv-active-block')?.textContent).toBe('second paragraph')
    } finally {
      destroy()
    }
  })

  it('decorates the editable list paragraph instead of the top-level list container', () => {
    const content: BlockNode = {
      type: 'doc',
      content: [
        {
          type: 'bullet_list',
          content: [
            {
              type: 'list_item',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'list item one' }] }],
            },
            {
              type: 'list_item',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'list item two' }] }],
            },
          ],
        },
      ],
    }

    const { view, mount, destroy } = mountEditor(content)

    try {
      const secondItem = findTextBlockPosition(view.state.doc, 'list item two')
      setCursor(view, secondItem.contentFrom + 2)

      const activeBlock = mount.querySelector('.nv-active-block')
      expect(activeBlock).toBeInstanceOf(HTMLElement)
      expect(activeBlock?.tagName).toBe('P')
      expect(activeBlock?.textContent).toBe('list item two')
      expect(mount.querySelector('ul.nv-active-block')).toBeNull()
    } finally {
      destroy()
    }
  })

  it('keeps list active-block indicator offset separate from the default block offset', () => {
    const editorProseCss = readFileSync('src/styles/editor-prose.css', 'utf8')

    expect(editorProseCss).toContain('--nv-active-list-block-indicator-offset')
    expect(editorProseCss).toMatch(/li > \.nv-active-block::before\s*{[^}]*var\(--nv-active-list-block-indicator-offset\)/s)
  })
})
