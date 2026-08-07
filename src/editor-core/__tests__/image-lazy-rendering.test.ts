import { describe, expect, it } from 'vitest'
import { EditorView } from 'prosemirror-view'
import { createNevoEditorState } from '../state'
import { nevoBaseSchema } from '../schema'
import type { BlockNode } from '../../types/note'

describe('image viewport rendering', () => {
  it('defers image loading and decoding to the browser', () => {
    const content: BlockNode = {
      type: 'doc',
      content: [
        {
          type: 'image_block',
          attrs: {
            src: '.nevo/assets/image.png',
            alt: 'sample',
            caption: '',
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
    })
    const mount = document.createElement('div')
    document.body.appendChild(mount)
    const view = new EditorView(mount, {
      state: setup.state,
      nodeViews: setup.nodeViews,
    })

    try {
      const image = mount.querySelector<HTMLImageElement>('.nv-image-preview')
      expect(image?.loading).toBe('lazy')
      expect(image?.decoding).toBe('async')
    } finally {
      view.destroy()
      mount.remove()
    }
  })
})
