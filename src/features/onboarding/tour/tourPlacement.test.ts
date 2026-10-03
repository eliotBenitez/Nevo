import { describe, expect, it } from 'vitest'
import { placeCoachmark } from './tourPlacement'

const VIEWPORT = { width: 1200, height: 800 }
const COACH = { width: 304, height: 160 }

describe('placeCoachmark', () => {
  it('places the coachmark to the right of the target when there is room', () => {
    const result = placeCoachmark({
      target: { left: 100, top: 100, width: 40, height: 40 },
      coach: COACH,
      viewport: VIEWPORT,
      side: 'right',
    })

    expect(result.side).toBe('right')
    expect(result.coach.left).toBeGreaterThan(140)
  })

  it('flips right to left when there is not enough room on the right', () => {
    const result = placeCoachmark({
      target: { left: VIEWPORT.width - 60, top: 100, width: 40, height: 40 },
      coach: COACH,
      viewport: VIEWPORT,
      side: 'right',
    })

    expect(result.side).toBe('left')
    expect(result.coach.left).toBeLessThan(VIEWPORT.width - 60)
  })

  it('flips bottom to top when there is not enough room below', () => {
    const result = placeCoachmark({
      target: { left: 400, top: VIEWPORT.height - 60, width: 40, height: 40 },
      coach: COACH,
      viewport: VIEWPORT,
      side: 'bottom',
    })

    expect(result.side).toBe('top')
    expect(result.coach.top).toBeLessThan(VIEWPORT.height - 60)
  })

  it('keeps the requested side when there is enough room below', () => {
    const result = placeCoachmark({
      target: { left: 400, top: 100, width: 40, height: 40 },
      coach: COACH,
      viewport: VIEWPORT,
      side: 'bottom',
    })

    expect(result.side).toBe('bottom')
  })

  it('clamps the ring to the viewport when the target starts before the left edge', () => {
    const result = placeCoachmark({
      target: { left: -20, top: 100, width: 40, height: 40 },
      coach: COACH,
      viewport: VIEWPORT,
      side: 'right',
    })

    expect(result.ring.left).toBe(4)
    // Width shrinks by however far the target spilled past the edge.
    expect(result.ring.width).toBeLessThan(40 + 4 * 2)
  })

  it('clamps the ring to the viewport when the target overflows the right/bottom edge', () => {
    const result = placeCoachmark({
      target: { left: VIEWPORT.width - 10, top: VIEWPORT.height - 10, width: 40, height: 40 },
      coach: COACH,
      viewport: VIEWPORT,
      side: 'left',
    })

    expect(result.ring.left + result.ring.width).toBeLessThanOrEqual(VIEWPORT.width - 4)
    expect(result.ring.top + result.ring.height).toBeLessThanOrEqual(VIEWPORT.height - 4)
  })

  it('clamps the coachmark inside the viewport on a small viewport', () => {
    const smallViewport = { width: 320, height: 240 }
    const smallCoach = { width: 200, height: 120 }
    const result = placeCoachmark({
      target: { left: 10, top: 10, width: 20, height: 20 },
      coach: smallCoach,
      viewport: smallViewport,
      side: 'right',
    })

    expect(result.coach.left).toBeGreaterThanOrEqual(12)
    expect(result.coach.left + smallCoach.width).toBeLessThanOrEqual(smallViewport.width - 12)
    expect(result.coach.top).toBeGreaterThanOrEqual(12)
    expect(result.coach.top + smallCoach.height).toBeLessThanOrEqual(smallViewport.height - 12)
  })

  it('computes an arrow offset centered on the target for a horizontal side', () => {
    const result = placeCoachmark({
      target: { left: 100, top: 400, width: 40, height: 40 },
      coach: COACH,
      viewport: VIEWPORT,
      side: 'right',
    })

    expect(result.arrowOffset.top).toBeGreaterThanOrEqual(14)
    expect(result.arrowOffset.left).toBeUndefined()
  })

  it('computes an arrow offset centered on the target for a vertical side', () => {
    const result = placeCoachmark({
      target: { left: 400, top: 100, width: 40, height: 40 },
      coach: COACH,
      viewport: VIEWPORT,
      side: 'bottom',
    })

    expect(result.arrowOffset.left).toBeGreaterThanOrEqual(14)
    expect(result.arrowOffset.top).toBeUndefined()
  })
})
