import { describe, expect, it } from 'vitest'
import { measureCanvasText, textElementSize } from '..'

describe('textElementSize', () => {
  it('grows the measured box as font size increases', () => {
    const small = textElementSize('Hello world', { fontSize: 12 })
    const large = textElementSize('Hello world', { fontSize: 48 })
    expect(large.width).toBeGreaterThan(small.width)
    expect(large.height).toBeGreaterThan(small.height)
  })

  it('grows the measured box as line count increases', () => {
    const oneLine = textElementSize('one line', { fontSize: 16 })
    const threeLines = textElementSize('one line\ntwo line\nthree line', { fontSize: 16 })
    expect(threeLines.height).toBeGreaterThan(oneLine.height)
  })

  it('clamps to sensible minimums for empty or tiny text', () => {
    const size = textElementSize('', { fontSize: 8 })
    expect(size.width).toBeGreaterThanOrEqual(40)
    expect(size.height).toBeGreaterThanOrEqual(32)
  })

  it('returns integer dimensions', () => {
    const size = textElementSize('Some text here', { fontSize: 17 })
    expect(Number.isInteger(size.width)).toBe(true)
    expect(Number.isInteger(size.height)).toBe(true)
  })

  it('never throws and falls back to a character-count approximation when there is no DOM canvas context', () => {
    // In this project's Vitest environment (jsdom), HTMLCanvasElement has no
    // real 2D rendering backend, so getContext('2d') already returns null —
    // exercising the same no-DOM fallback path this test targets.
    expect(() => measureCanvasText('fallback path', { fontSize: 16 })).not.toThrow()
    const measured = measureCanvasText('fallback path', { fontSize: 16 })
    expect(measured.width).toBeGreaterThan(0)
    expect(measured.height).toBeGreaterThan(0)
  })
})
