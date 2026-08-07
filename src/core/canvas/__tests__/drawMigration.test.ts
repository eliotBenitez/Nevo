import { describe, expect, it } from 'vitest'
import { convertDrawStrokesToCanvas } from '..'

describe('convertDrawStrokesToCanvas', () => {
  it('converts shapes, freehand and bound arrows without changing draw assets', () => {
    const migrated = convertDrawStrokesToCanvas([
      {
        id: 'shape',
        type: 'rectangle',
        points: [{ x: 10, y: 20 }, { x: 110, y: 80 }],
        color: '#111111',
        fillColor: '#ffffff',
        size: 2,
      },
      {
        id: 'arrow',
        type: 'arrow',
        points: [{ x: 110, y: 50 }, { x: 220, y: 50 }],
        color: '#222222',
        size: 3,
        startBinding: { strokeId: 'shape' },
        arrowShape: 'orthogonal',
      },
      {
        id: 'pen',
        type: 'freehand',
        points: [{ x: 0, y: 0 }, { x: 2, y: 3 }],
        color: '#333333',
        size: 4,
      },
    ], () => 'generated')

    expect(migrated.elements.shape).toMatchObject({ kind: 'shape', shape: 'rectangle' })
    expect(migrated.elements.pen).toMatchObject({ kind: 'freehand' })
    expect(migrated.connectors.arrow).toMatchObject({
      routing: 'orthogonal',
      from: { binding: { target: 'element', targetId: 'shape' } },
    })
    expect(migrated.order).toEqual(['shape', 'arrow', 'pen'])
  })
})
