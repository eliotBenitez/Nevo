import { describe, expect, it } from 'vitest'
import { graphNodeColor } from './nodeColor'

describe('graphNodeColor', () => {
  it('is stable for the same note', () => {
    expect(graphNodeColor('note-a', 'folder-1')).toBe(graphNodeColor('note-a', 'folder-1'))
  })

  it('varies notes inside one folder', () => {
    const colors = new Set(Array.from({ length: 20 }, (_, i) => graphNodeColor(`note-${i}`, 'folder-1')))
    expect(colors.size).toBeGreaterThan(8)
  })

  it('keeps notes of one folder within a hue family', () => {
    const hues = Array.from({ length: 20 }, (_, i) => Number(graphNodeColor(`note-${i}`, 'folder-1').split(' ')[2].slice(0, -1)))
    const base = hues[0]
    for (const hue of hues) {
      const diff = Math.min(Math.abs(hue - base), 360 - Math.abs(hue - base))
      expect(diff).toBeLessThanOrEqual(88)
    }
  })
})
