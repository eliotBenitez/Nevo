import { describe, expect, it } from 'vitest'
import {
  alignElements,
  bindConnectorEndpoint,
  distributeElements,
  normalizeCanvasSnapshot,
  parseCanvasClipboard,
  resizeBounds,
  serializeCanvasClipboard,
  strokeOutlinePath,
  type CanvasClipboardPayload,
  type CanvasElement,
} from '..'

const elements: CanvasElement[] = [
  { id: 'a', kind: 'shape', shape: 'rectangle', x: 10, y: 20, width: 100, height: 60, zIndex: 0 },
  { id: 'b', kind: 'shape', shape: 'ellipse', x: 180, y: 80, width: 80, height: 40, zIndex: 1 },
  { id: 'c', kind: 'text', text: 'C', x: 330, y: 140, width: 60, height: 30, zIndex: 2 },
]

describe('canvas P0 geometry', () => {
  it('creates constrained and center-origin bounds', () => {
    expect(resizeBounds({ x: 100, y: 100 }, { x: 130, y: 120 }, {
      constrain: true,
      fromCenter: false,
    })).toEqual({ x: 100, y: 100, width: 30, height: 30 })
    expect(resizeBounds({ x: 100, y: 100 }, { x: 130, y: 120 }, {
      constrain: false,
      fromCenter: true,
    })).toEqual({ x: 70, y: 80, width: 60, height: 40 })
  })

  it('aligns and distributes several elements without mutating them', () => {
    const centered = alignElements(elements, 'center')
    expect(centered.a.x + elements[0].width / 2).toBe(centered.c.x + elements[2].width / 2)
    const distributed = distributeElements(elements, 'horizontal')
    const gapA = distributed.b.x - (distributed.a.x + elements[0].width)
    const gapB = distributed.c.x - (distributed.b.x + elements[1].width)
    expect(gapA).toBeCloseTo(gapB)
    expect(elements[0].x).toBe(10)
  })

  it('binds connector endpoints to the nearest element edge', () => {
    const endpoint = bindConnectorEndpoint(
      { x: 108, y: 50 },
      { a: elements[0] },
      { x: -500, y: -500, width: 200, height: 200 },
      16,
    )
    expect(endpoint).toMatchObject({
      x: 110,
      y: 50,
      binding: { target: 'element', targetId: 'a', side: 'right' },
    })
  })
})

describe('canvas P0 persistence', () => {
  it('normalizes pressure, text style, and connector caps additively in version 1', () => {
    const snapshot = normalizeCanvasSnapshot({
      version: 1,
      frame: { x: 0, y: 0, width: 800, height: 600, zIndex: 0 },
      elements: {
        stroke: {
          id: 'stroke',
          kind: 'freehand',
          x: 0,
          y: 0,
          width: 20,
          height: 20,
          zIndex: 1,
          points: [{ x: 0, y: 0, pressure: 0.2 }, { x: 20, y: 20, pressure: 0.9 }],
          style: { fontSize: 20, textColor: '#123456', textAlign: 'right' },
        },
      },
      connectors: {
        link: {
          id: 'link',
          from: { x: 0, y: 0 },
          to: { x: 20, y: 20 },
          routing: 'bezier',
          zIndex: 2,
          startCap: 'dot',
          endCap: 'arrow',
        },
      },
      order: ['stroke', 'link'],
    })
    expect(snapshot?.elements.stroke).toMatchObject({
      points: [{ pressure: 0.2 }, { pressure: 0.9 }],
      style: { fontSize: 20, textColor: '#123456', textAlign: 'right' },
    })
    expect(snapshot?.connectors.link).toMatchObject({ startCap: 'dot', endCap: 'arrow' })
  })

  it('round-trips the private canvas clipboard payload', () => {
    const payload: CanvasClipboardPayload = { version: 1, elements, connectors: [] }
    expect(parseCanvasClipboard(serializeCanvasClipboard(payload))).toEqual(payload)
    expect(parseCanvasClipboard('not-json')).toBeNull()
  })

  it('builds a pressure-aware native SVG path without foreignObject', () => {
    const path = strokeOutlinePath([
      { x: 0, y: 0, pressure: 0.2 },
      { x: 20, y: 10, pressure: 0.8 },
      { x: 40, y: 0, pressure: 0.4 },
    ], 6)
    expect(path).toMatch(/^M /)
    expect(path).toContain(' Q ')
    expect(path).toMatch(/ Z$/)
  })
})
