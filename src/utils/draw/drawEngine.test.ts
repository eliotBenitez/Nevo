import { describe, expect, it } from 'vitest'
import {
  DEFAULT_DRAW_DATA,
  computeBounds,
  generateDrawId,
  parseDrawData,
  serializeDrawData,
  svgPathFromPoints,
  type DrawData,
  type DrawStroke,
} from './drawEngine'

function stroke(type: DrawStroke['type'], points: [number, number][] = [[0, 0], [10, 10]]): DrawStroke {
  return {
    type,
    points: points.map(([x, y]) => ({ x, y })),
    color: '#000',
    size: 3,
    roughness: 1,
  }
}

const sampleData: DrawData = {
  version: 1,
  bgColor: '#fff',
  strokes: [
    stroke('rectangle', [[0, 0], [100, 50]]),
    stroke('freehand', [[5, 5], [6, 7], [9, 12]]),
  ],
}

describe('drawEngine — serialize/parse round-trip', () => {
  it('round-trips a full DrawData through serialize → parse', () => {
    const json = serializeDrawData(sampleData)
    const parsed = parseDrawData(json)
    expect(parsed).toEqual(sampleData)
  })

  it('preserves pressure on freehand points', () => {
    const data: DrawData = {
      ...DEFAULT_DRAW_DATA,
      strokes: [{ type: 'freehand', points: [{ x: 1, y: 2, p: 0.8 }, { x: 3, y: 4, p: 0.1 }], color: '#111', size: 2 }],
    }
    expect(parseDrawData(serializeDrawData(data))).toEqual(data)
  })

  it('returns DEFAULT_DRAW_DATA for empty input', () => {
    expect(parseDrawData('')).toEqual(DEFAULT_DRAW_DATA)
  })

  it('returns DEFAULT_DRAW_DATA for malformed JSON', () => {
    expect(parseDrawData('{not json')).toEqual(DEFAULT_DRAW_DATA)
  })

  it('drops invalid strokes and keeps valid ones', () => {
    const json = JSON.stringify({
      version: 1,
      bgColor: 'transparent',
      strokes: [
        { type: 'line', points: [{ x: 0, y: 0 }, { x: 1, y: 1 }], color: '#000', size: 1 },
        { type: 'line', points: [], color: '#000', size: 1 },
        { type: 'line', points: [{ x: 'bad', y: 0 }] },
        'not-a-stroke',
      ],
    })
    const parsed = parseDrawData(json)
    expect(parsed.strokes).toHaveLength(1)
    expect(parsed.strokes[0].points).toHaveLength(2)
  })

  it('coerces unknown version to 1', () => {
    const parsed = parseDrawData(JSON.stringify({ version: 99, strokes: [], bgColor: 'red' }))
    expect(parsed.version).toBe(1)
    expect(parsed.bgColor).toBe('red')
  })
})

describe('drawEngine — generateDrawId', () => {
  it('produces two distinct ids', () => {
    const a = generateDrawId()
    const b = generateDrawId()
    expect(a).toBeTruthy()
    expect(b).toBeTruthy()
    expect(a).not.toBe(b)
  })
})

describe('drawEngine — computeBounds', () => {
  it('returns zeros for an empty stroke set', () => {
    expect(computeBounds([])).toEqual({ minX: 0, minY: 0, maxX: 0, maxY: 0 })
  })

  it('computes the bounding box across all strokes', () => {
    const bounds = computeBounds([
      stroke('line', [[10, 20], [30, 5]]),
      stroke('line', [[0, 40], [50, 0]]),
    ])
    expect(bounds).toEqual({ minX: 0, minY: 0, maxX: 50, maxY: 40 })
  })
})

describe('drawEngine — svgPathFromPoints', () => {
  it('returns empty string for no points', () => {
    expect(svgPathFromPoints([])).toBe('')
  })

  it('starts with a Move command', () => {
    const d = svgPathFromPoints([[1, 2], [3, 4]])
    expect(d.startsWith('M 1,2')).toBe(true)
  })

  it('closes the path', () => {
    const d = svgPathFromPoints([[1, 2], [3, 4], [5, 6]])
    expect(d.endsWith('Z')).toBe(true)
  })
})
