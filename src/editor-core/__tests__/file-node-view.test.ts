import { describe, expect, it, vi } from 'vitest'
import { EditorView } from 'prosemirror-view'
import { createNevoEditorState } from '../state'
import { nevoBaseSchema } from '../schema'
import type { BlockNode } from '../../types/note'

function createFileEditor(attrs: Record<string, unknown>) {
  const onRequestFileAsset = vi.fn()
  const onOpenFileAsset = vi.fn()
  const content: BlockNode = {
    type: 'doc',
    content: [
      {
        type: 'file_block',
        attrs,
      },
    ],
  }

  const setup = createNevoEditorState({
    schema: nevoBaseSchema,
    content,
    nodeViewOptions: { onRequestFileAsset, onOpenFileAsset },
  })

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
    mount,
    view,
    onRequestFileAsset,
    onOpenFileAsset,
    destroy: () => {
      view.destroy()
      mount.remove()
    },
  }
}

function clickFileCard(mount: HTMLElement) {
  const card = mount.querySelector<HTMLElement>('.nv-file-card')
  expect(card).toBeTruthy()
  card!.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }))
}

describe('file node view', () => {
  it('opens an existing file attachment when the card is clicked', () => {
    const editor = createFileEditor({
      src: '.nevo/assets/file.pdf',
      filename: 'file.pdf',
      mime: 'application/pdf',
      size: 1000,
    })

    try {
      clickFileCard(editor.mount)

      expect(editor.onOpenFileAsset).toHaveBeenCalledTimes(1)
      expect(editor.onOpenFileAsset).toHaveBeenCalledWith(expect.objectContaining({
        view: editor.view,
        position: 0,
        src: '.nevo/assets/file.pdf',
        attrs: expect.objectContaining({ filename: 'file.pdf' }),
      }))
      expect(editor.onRequestFileAsset).not.toHaveBeenCalled()
    } finally {
      editor.destroy()
    }
  })

  it('requests a file picker when an empty file card is clicked', () => {
    const editor = createFileEditor({
      src: '',
      filename: '',
      mime: '',
      size: 0,
    })

    try {
      clickFileCard(editor.mount)

      expect(editor.onRequestFileAsset).toHaveBeenCalledTimes(1)
      expect(editor.onRequestFileAsset).toHaveBeenCalledWith(expect.objectContaining({
        view: editor.view,
        position: 0,
      }))
      expect(editor.onOpenFileAsset).not.toHaveBeenCalled()
    } finally {
      editor.destroy()
    }
  })
})
