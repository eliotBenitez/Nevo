import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { EditorView } from 'prosemirror-view'
import { createNevoEditorState } from '../state'
import { nevoBaseSchema } from '../schema'
import type { BlockNode } from '../../types/note'

function createImageEditor(onRequestImageContextMenu = vi.fn()) {
  const content: BlockNode = {
    type: 'doc',
    content: [
      {
        type: 'image_block',
        attrs: {
          src: '.nevo/assets/image.png',
          alt: 'sample',
          caption: 'caption',
          sizePreset: 'medium',
          width: null,
          align: 'center',
        },
      },
    ],
  }

  const setup = createNevoEditorState({
    schema: nevoBaseSchema,
    content,
    nodeViewOptions: { onRequestImageContextMenu },
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
    onRequestImageContextMenu,
    destroy: () => {
      view.destroy()
      mount.remove()
    },
  }
}

describe('image node view', () => {
  it('opens the image context menu at the right-click coordinates', () => {
    const editor = createImageEditor()

    try {
      const image = editor.mount.querySelector<HTMLImageElement>('.nv-image-preview')
      expect(image).toBeTruthy()

      const event = new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        clientX: 123,
        clientY: 45,
      })
      image!.dispatchEvent(event)

      expect(event.defaultPrevented).toBe(true)
      expect(editor.onRequestImageContextMenu).toHaveBeenCalledTimes(1)
      expect(editor.onRequestImageContextMenu).toHaveBeenCalledWith(expect.objectContaining({
        view: editor.view,
        position: 0,
        attrs: expect.objectContaining({ src: '.nevo/assets/image.png' }),
        anchorPoint: { top: 45, left: 123 },
      }))
    } finally {
      editor.destroy()
    }
  })

  it('does not intercept right-clicks inside the caption', () => {
    const editor = createImageEditor()

    try {
      const caption = editor.mount.querySelector<HTMLElement>('.nv-image-caption')
      expect(caption).toBeTruthy()

      const event = new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        clientX: 123,
        clientY: 45,
      })
      caption!.dispatchEvent(event)

      expect(event.defaultPrevented).toBe(false)
      expect(editor.onRequestImageContextMenu).not.toHaveBeenCalled()
    } finally {
      editor.destroy()
    }
  })

  it('uses fixed widths for image size presets', () => {
    const css = readFileSync('src/styles/editor-prose/prose-media.css', 'utf8')

    expect(css).toContain(".nv-image-block[data-size-preset='small']  .nv-image-preview { width: 320px; }")
    expect(css).toContain(".nv-image-block[data-size-preset='medium'] .nv-image-preview { width: 560px; }")
    expect(css).toContain(".nv-image-block[data-size-preset='large']  .nv-image-preview { width: 760px; }")
    expect(css).toContain(".nv-image-block[data-size-preset='full']   .nv-image-preview { width: 100%; }")
    expect(css).toContain('max-width: 100%')
    expect(css).toContain('max-height: 600px')
  })
})
