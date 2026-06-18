import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NoteDocument } from '../../types/note'
import { buildTypstExport } from './buildTypstExport'
import { renderVegaToSvg } from './vegaToSvg'

vi.mock('./vegaToSvg', () => ({
  renderVegaToSvg: vi.fn(async () => '<svg><rect width="10" height="10"/></svg>'),
}))

function note(content: NoteDocument['content']): NoteDocument {
  return {
    id: 'n1', title: 'Doc', icon: '', folderId: null,
    createdAt: '', updatedAt: '', content,
  }
}

describe('buildTypstExport', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(renderVegaToSvg).mockResolvedValue('<svg><rect width="10" height="10"/></svg>')
  })

  it('renders Vega charts as inline SVG assets', async () => {
    const spec = '{"mark":"bar"}'

    const payload = await buildTypstExport(note({
      type: 'doc',
      content: [
        { type: 'vega_block', attrs: { spec } },
      ],
    }))

    expect(renderVegaToSvg).toHaveBeenCalledWith(spec)
    expect(payload.source).toContain('image("vega-1.svg")')
    expect(payload.assets).toEqual([
      {
        name: 'vega-1.svg',
        bytesBase64: btoa('<svg><rect width="10" height="10"/></svg>'),
      },
    ])
  })

  it('inlines drawings, replacing width="100%" with viewBox pixel size for usvg', async () => {
    const svgPreview = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 80" width="100%" preserveAspectRatio="xMidYMid meet"><path d="M0 0L10 10"/></svg>'

    const payload = await buildTypstExport(note({
      type: 'doc',
      content: [
        { type: 'draw_block', attrs: { drawId: 'd1', src: 's', svgPreview } },
      ],
    }))

    expect(payload.source).toContain('image("draw-1.svg", width: 70%)')
    expect(payload.assets).toHaveLength(1)
    const decoded = atob(payload.assets[0].bytesBase64!)
    expect(decoded).toContain('width="120" height="80"')
    expect(decoded).not.toContain('width="100%"')
  })

  it('skips invalid Vega charts when SVG rendering returns null', async () => {
    vi.mocked(renderVegaToSvg).mockResolvedValueOnce(null)

    const payload = await buildTypstExport(note({
      type: 'doc',
      content: [
        { type: 'vega_block', attrs: { spec: '{' } },
      ],
    }))

    expect(payload.source).toContain('image("vega-1.svg")')
    expect(payload.assets).toEqual([])
  })
})
