import { describe, expect, it, vi } from 'vitest'

vi.mock('../markmap/markmapCore', () => ({
  transformMarkmap: vi.fn(async () => ({
    root: {},
    options: {},
    view: { Markmap: { create: () => ({ fit: () => {}, destroy: () => {} }) } },
  })),
}))

import { renderMarkmapToExportSvg, renderMarkmapToSvg } from './markmapToSvg'

describe('markmapToSvg', () => {
  it('drops the offscreen layout styles from the serialized root', async () => {
    for (const render of [renderMarkmapToSvg, renderMarkmapToExportSvg]) {
      const svg = await render('# Root')
      const root = svg?.match(/<svg[^>]*>/)?.[0] ?? ''
      expect(root).toContain('width="800"')
      expect(root).not.toMatch(/position|left|visibility/)
    }
    expect(document.body.querySelector('svg')).toBeNull()
  })
})
