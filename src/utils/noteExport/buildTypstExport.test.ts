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
