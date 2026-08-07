import { describe, expect, it } from 'vitest'
import {
  createDocxPageGeometry,
  mmToPx,
  mmToTwip,
  ptToPx,
  pxToMm,
  pxToPt,
  twipToPx,
} from './docxLayout'
import { DEFAULT_DOCX_OPTIONS } from './docxOptions'

describe('docxLayout', () => {
  it.each([
    ['A4', 'portrait', 210, 297],
    ['A4', 'landscape', 297, 210],
    ['Letter', 'portrait', 215.9, 279.4],
    ['Letter', 'landscape', 279.4, 215.9],
  ] as const)('uses physical %s %s dimensions', (paperFormat, orientation, width, height) => {
    const geometry = createDocxPageGeometry({
      ...DEFAULT_DOCX_OPTIONS,
      paperFormat,
      orientation,
    })

    expect(geometry.pageWidthMm).toBe(width)
    expect(geometry.pageHeightMm).toBe(height)
    expect(geometry.pageWidthPx).toBeCloseTo(mmToPx(width), 8)
    expect(geometry.pageHeightPx).toBeCloseTo(mmToPx(height), 8)
  })

  it('calculates the usable area from custom margins', () => {
    const geometry = createDocxPageGeometry({
      ...DEFAULT_DOCX_OPTIONS,
      marginTop: 10,
      marginRight: 11,
      marginBottom: 12,
      marginLeft: 13,
    })

    expect(geometry.contentWidthMm).toBe(186)
    expect(geometry.contentHeightMm).toBe(275)
    expect(geometry.contentWidthPx).toBeCloseTo(mmToPx(186), 8)
    expect(geometry.contentHeightPx).toBeCloseTo(mmToPx(275), 8)
  })

  it('converts CSS pixels, points, millimeters, and twips consistently', () => {
    expect(mmToPx(25.4)).toBeCloseTo(96, 10)
    expect(pxToMm(96)).toBeCloseTo(25.4, 10)
    expect(ptToPx(11)).toBeCloseTo(14.6666667, 6)
    expect(pxToPt(96)).toBeCloseTo(72, 10)
    expect(mmToTwip(25.4)).toBe(1440)
    expect(twipToPx(1440)).toBeCloseTo(96, 10)
  })
})
