import { describe, expect, it } from 'vitest'
import { patchDrawBlockInContent } from './drawBlockPatch'
import type { BlockNode } from '../../types/note'

const drawBlock = (drawId: string, src = '', svgPreview = ''): BlockNode => ({
  type: 'draw_block',
  attrs: { drawId, src, svgPreview, title: '' },
})

const docWith = (...blocks: BlockNode[]): BlockNode => ({ type: 'doc', content: blocks })

describe('patchDrawBlockInContent', () => {
  it('patches the matching draw_block by id and leaves siblings untouched', () => {
    const content = docWith(
      drawBlock('a', '.nevo/assets/draw-a-old.draw.json'),
      drawBlock('b', '.nevo/assets/draw-b.draw.json'),
    )

    const result = patchDrawBlockInContent(content, 'a', {
      src: '.nevo/assets/draw-a-new.draw.json',
      svgPreview: '<svg/>',
    })

    expect(result.changed).toBe(true)
    const patched = result.content.content as BlockNode[]
    expect(patched[0]?.attrs?.src).toBe('.nevo/assets/draw-a-new.draw.json')
    expect(patched[0]?.attrs?.svgPreview).toBe('<svg/>')
    // Sibling drawing must be left exactly as it was.
    expect(patched[1]?.attrs?.src).toBe('.nevo/assets/draw-b.draw.json')
    // Untouched subtrees are structurally shared, not copied.
    expect(patched[1]).toBe(content.content?.[1])
  })

  it('finds a draw_block nested inside other blocks', () => {
    const target = drawBlock('nested', 'old.draw.json')
    const content: BlockNode = {
      type: 'doc',
      content: [{ type: 'column_list', content: [{ type: 'column', content: [target] }] }],
    }

    const result = patchDrawBlockInContent(content, 'nested', { src: 'new.draw.json', svgPreview: '<svg/>' })

    expect(result.changed).toBe(true)
    const nestedNode = result.content.content?.[0]?.content?.[0]?.content?.[0]
    expect(nestedNode?.attrs?.src).toBe('new.draw.json')
  })

  it('returns changed: false and the same content reference when no draw_block matches the id', () => {
    const content = docWith(drawBlock('a'))

    const result = patchDrawBlockInContent(content, 'missing', { src: 'x', svgPreview: '' })

    expect(result.changed).toBe(false)
    expect(result.content).toBe(content)
  })
})
