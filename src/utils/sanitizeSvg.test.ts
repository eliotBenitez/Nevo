import { describe, expect, it } from 'vitest'
import { sanitizeSvg } from './sanitizeSvg'

describe('sanitizeSvg', () => {
  it('removes executable and externally loaded SVG content', () => {
    const dirty = `
      <svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)">
        <script>alert(1)</script>
        <foreignObject><iframe src="https://evil.example"></iframe></foreignObject>
        <image href="https://evil.example/tracker.png" />
        <path style="background:url(https://evil.example/a)" fill="url(https://evil.example/p)" />
        <a href="javascript:alert(1)"><text>bad</text></a>
      </svg>
    `

    const clean = sanitizeSvg(dirty)

    expect(clean).toContain('<svg')
    expect(clean).not.toMatch(/script|foreignObject|iframe|onload|javascript:|evil\.example|style=/i)
  })

  it('keeps native geometry, local references and raster data images', () => {
    const clean = sanitizeSvg(`
      <svg xmlns="http://www.w3.org/2000/svg">
        <defs><clipPath id="clip"><rect width="10" height="10" /></clipPath></defs>
        <path d="M0 0L10 10" clip-path="url(#clip)" stroke="#000" />
        <image href="data:image/png;base64,AA==" />
      </svg>
    `)

    expect(clean).toContain('clip-path="url(#clip)"')
    expect(clean).toContain('data:image/png;base64,AA==')
    expect(clean).toContain('d="M0 0L10 10"')
  })

  it('rejects non-SVG and oversized input', () => {
    expect(sanitizeSvg('<div>not svg</div>')).toBe('')
    expect(sanitizeSvg(`<svg>${'x'.repeat(2 * 1024 * 1024)}</svg>`)).toBe('')
  })
})
