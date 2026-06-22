import { describe, expect, it } from 'vitest'
import { yDocToProsemirrorJSON } from 'y-prosemirror'
import { nevoBaseSchema } from '../schema'
import {
  createYDocFromContent,
  updateDrawBlockAttrsInYDoc,
  Y_FRAGMENT_NAME,
} from '../collaboration'

const drawBlock = (drawId: string, src = '', svgPreview = '') => ({
  type: 'draw_block',
  attrs: { drawId, src, svgPreview, title: '' },
})

const docWith = (...blocks: unknown[]) => ({ type: 'doc', content: blocks })

describe('updateDrawBlockAttrsInYDoc', () => {
  it('patches the matching draw_block by id and leaves siblings untouched', () => {
    const ydoc = createYDocFromContent(
      nevoBaseSchema,
      docWith(
        drawBlock('a', '.nevo/assets/draw-a-old.draw.json'),
        drawBlock('b', '.nevo/assets/draw-b.draw.json'),
      ),
    )

    const changed = updateDrawBlockAttrsInYDoc(ydoc, 'a', {
      src: '.nevo/assets/draw-a-new.draw.json',
      svgPreview: '<svg/>',
    })

    expect(changed).toBe(true)
    const json = yDocToProsemirrorJSON(ydoc, Y_FRAGMENT_NAME) as {
      content: Array<{ attrs: Record<string, unknown> }>
    }
    expect(json.content[0].attrs.src).toBe('.nevo/assets/draw-a-new.draw.json')
    expect(json.content[0].attrs.svgPreview).toBe('<svg/>')
    // Sibling drawing must be left exactly as it was.
    expect(json.content[1].attrs.src).toBe('.nevo/assets/draw-b.draw.json')
  })

  it('returns false when no draw_block matches the id', () => {
    const ydoc = createYDocFromContent(nevoBaseSchema, docWith(drawBlock('a')))
    expect(
      updateDrawBlockAttrsInYDoc(ydoc, 'missing', { src: 'x', svgPreview: '' }),
    ).toBe(false)
  })
})
