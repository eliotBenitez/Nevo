import { describe, expect, it } from 'vitest'
import { captureNotebookRulerGuide, projectNotebookRulerPoint } from '../ruler'

describe('notebook ruler guides', () => {
  const ruler = { x: 250, y: 200, angle: 0 }

  it('captures either edge only within a screen-sized tolerance and the ruler length', () => {
    expect(captureNotebookRulerGuide(ruler, { x: 200, y: 170 }, 1)?.origin.y).toBe(174)
    expect(captureNotebookRulerGuide(ruler, { x: 200, y: 230 }, 1)?.origin.y).toBe(226)
    expect(captureNotebookRulerGuide(ruler, { x: 200, y: 200 }, 1)).toBeNull()
    expect(captureNotebookRulerGuide(ruler, { x: 450, y: 174 }, 1)).toBeNull()
    expect(captureNotebookRulerGuide(ruler, { x: 200, y: 170 }, 3.5)).toBeNull()
    expect(captureNotebookRulerGuide(ruler, { x: 200, y: 173 }, 3.5)).not.toBeNull()
  })

  it.each([0, 30, 90, -135])('projects all points onto a frozen %s degree edge without losing pressure', angle => {
    const pose = { ...ruler, angle }
    const radians = angle * Math.PI / 180
    const start = { x: pose.x + Math.sin(radians) * 26, y: pose.y - Math.cos(radians) * 26 }
    const guide = captureNotebookRulerGuide(pose, start, 1)!
    pose.x += 100
    pose.angle += 20
    const point = projectNotebookRulerPoint({ x: 350, y: 280, pressure: 0.73, extra: 'keep' }, guide)
    const cross = (point.x - guide.origin.x) * guide.direction.y - (point.y - guide.origin.y) * guide.direction.x
    expect(cross).toBeCloseTo(0, 10)
    expect(point.pressure).toBe(0.73)
    expect(point.extra).toBe('keep')
    expect(projectNotebookRulerPoint(start, guide).x).toBeCloseTo(start.x)
  })
})
