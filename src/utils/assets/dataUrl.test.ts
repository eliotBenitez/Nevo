import { describe, expect, it } from 'vitest'
import { parseDataUrl } from './dataUrl'

// A 1x1 transparent PNG.
const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='

describe('parseDataUrl', () => {
  it('decodes a base64-encoded image data URL', () => {
    const result = parseDataUrl(`data:image/png;base64,${PNG_BASE64}`)
    expect(result).not.toBeNull()
    expect(result?.mime).toBe('image/png')
    expect(result?.fileName).toBe('pasted-image.png')
    expect(result?.bytes.length).toBeGreaterThan(0)
    // PNG signature.
    expect(Array.from(result!.bytes.slice(0, 4))).toEqual([0x89, 0x50, 0x4e, 0x47])
  })

  it('decodes a percent-encoded (non-base64) SVG data URL', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"></svg>'
    const result = parseDataUrl(`data:image/svg+xml,${encodeURIComponent(svg)}`)
    expect(result).not.toBeNull()
    expect(result?.mime).toBe('image/svg+xml')
    expect(result?.fileName).toBe('pasted-image.svg')
    expect(new TextDecoder().decode(result!.bytes)).toBe(svg)
  })

  it('handles extra parameters before the base64 marker', () => {
    const result = parseDataUrl(`data:image/svg+xml;charset=utf-8;base64,${btoa('<svg/>')}`)
    expect(result).not.toBeNull()
    expect(result?.mime).toBe('image/svg+xml')
  })

  it('returns null for a non-data URL', () => {
    expect(parseDataUrl('https://example.com/pic.png')).toBeNull()
  })

  it('returns null for malformed base64', () => {
    expect(parseDataUrl('data:image/png;base64,not-valid-base64!!!')).toBeNull()
  })

  it('returns null for an empty payload', () => {
    expect(parseDataUrl('data:image/png;base64,')).toBeNull()
  })
})
