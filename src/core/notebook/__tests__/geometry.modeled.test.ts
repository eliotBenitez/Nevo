import getStroke from 'perfect-freehand'
import { describe, expect, it } from 'vitest'
import {
  notebookOutlinePathData,
  notebookStrokeOutline,
  notebookStrokeOutlineData,
  notebookStrokeOutlinePath,
  notebookStrokeOutlines,
  lassoSelectNotebookObjects,
} from '../geometry'
import type { NotebookPathCommand, NotebookPointV1, NotebookStrokeV1 } from '../types'

const points: NotebookPointV1[] = Array.from({ length: 40 }, (_, index) => ({
  x: index * 2.5, y: 40 + Math.sin(index / 5) * 6, pressure: 0.3 + (index % 7) / 10,
}))

function commandsFrom(outline: [number, number][]): NotebookPathCommand[] {
  const commands: NotebookPathCommand[] = [{ type: 'M', x: outline[0][0], y: outline[0][1] }]
  for (let index = 1; index < outline.length; index += 1) {
    const [x, y] = outline[index]
    const [px, py] = outline[index - 1]
    commands.push({ type: 'Q', cx: px, cy: py, x: (px + x) / 2, y: (py + y) / 2 })
  }
  const [lx, ly] = outline[outline.length - 1]
  commands.push({ type: 'L', x: lx, y: ly }, { type: 'Z' })
  return commands
}

describe('modeled notebook stroke geometry', () => {
  it('keeps the exact legacy perfect-freehand options for strokes without the modeled flag', () => {
    const expected = getStroke(points.map(p => [p.x, p.y, p.pressure ?? 0.5]), {
      size: 3, thinning: 0.6, smoothing: 0.5, streamline: 0.5, simulatePressure: false, last: false,
    }) as [number, number][]
    expect(notebookStrokeOutline(points, 3)).toEqual(commandsFrom(expected))
    expect(notebookStrokeOutline(points, 3, false, false)).toEqual(commandsFrom(expected))

    const twoPoints = points.slice(0, 2)
    const expectedTwo = getStroke(twoPoints.map(p => [p.x, p.y, p.pressure ?? 0.5]), {
      size: 3, thinning: 0.6, smoothing: 0.5, streamline: 0.5, simulatePressure: false, last: true,
    }) as [number, number][]
    expect(notebookStrokeOutline(twoPoints, 3)).toEqual(commandsFrom(expectedTwo))

    const expectedMarker = getStroke(points.map(p => [p.x, p.y, 0.5]), {
      size: 12, thinning: 0, smoothing: 0.5, streamline: 0.5, simulatePressure: false, last: false,
    }) as [number, number][]
    expect(notebookStrokeOutline(points, 12, true)).toEqual(commandsFrom(expectedMarker))
  })

  it('draws modeled strokes without streamline lag and ends at the last point', () => {
    const expected = getStroke(points.map(p => [p.x, p.y, p.pressure ?? 0.5]), {
      size: 3, thinning: 0.6, smoothing: 0.2, streamline: 0, simulatePressure: false, last: true,
    }) as [number, number][]
    const modeled = notebookStrokeOutline(points, 3, false, true)
    expect(modeled).toEqual(commandsFrom(expected))
    expect(modeled).not.toEqual(notebookStrokeOutline(points, 3))

    const last = points[points.length - 1]
    // perfect-freehand radius: size * (0.5 - thinning * (0.5 - pressure))
    const lastPressureRadius = 3 * (0.5 - 0.6 * (0.5 - (last.pressure ?? 0.5)))
    const nearest = Math.min(...expected.map(([x, y]) => Math.hypot(x - last.x, y - last.y)))
    expect(nearest).toBeLessThanOrEqual(lastPressureRadius + 0.05)
  })

  it('threads the flag through every outline entry point', () => {
    const modeledCommands = notebookStrokeOutline(points, 3, false, true)
    expect(notebookStrokeOutlines(points, 3, false, undefined, true)).toEqual([modeledCommands])
    expect(notebookStrokeOutlinePath(points, 3, false, true)).toBe(notebookOutlinePathData(modeledCommands))
    expect(notebookStrokeOutlineData(points, 3, false, undefined, true)).toBe(notebookOutlinePathData(modeledCommands))
    expect(notebookStrokeOutlineData(points, 3)).not.toBe(notebookStrokeOutlineData(points, 3, false, undefined, true))
  })

  it('hit-tests a modeled stroke with its modeled outline', () => {
    const stroke: NotebookStrokeV1 = { id: 'm', kind: 'stroke', actionId: 'a', color: '#000000', width: 3, opacity: 1, path: 'modeled', points }
    const mid = points[20]
    const lasso = [{ x: mid.x - 1, y: mid.y - 1 }, { x: mid.x + 1, y: mid.y - 1 }, { x: mid.x + 1, y: mid.y + 1 }, { x: mid.x - 1, y: mid.y + 1 }]
    expect(lassoSelectNotebookObjects([stroke], lasso)).toEqual(['m'])
  })
})

describe('modeled strokes in export paths', () => {
  const page = (path?: string) => ({
    id: 'p', width: 200, height: 100, paper: { kind: 'plain' as const },
    objects: [{ id: 's', kind: 'stroke' as const, actionId: 'a', color: '#000000', width: 3, opacity: 1, ...(path ? { path } : {}), points }],
  })

  it('uses the modeled outline for SVG and PDF export, and the legacy one otherwise', async () => {
    const { notebookPageSvg } = await import('../svg')
    const { createNotebookExport } = await import('../export')
    const modeledData = notebookStrokeOutlineData(points, 3, false, undefined, true)
    expect(notebookPageSvg(page('modeled'), false)).toContain(modeledData)
    expect(notebookPageSvg(page(), false)).not.toContain(modeledData)
    expect(notebookPageSvg(page('future-mode'), false)).not.toContain(modeledData)
    const modeledExport = createNotebookExport({ version: 1, pages: [page('modeled')] }, false)
    expect(modeledExport.pages[0].paths[0].commands).toEqual(notebookStrokeOutline(points, 3, false, true))
    const legacyExport = createNotebookExport({ version: 1, pages: [page()] }, false)
    expect(legacyExport.pages[0].paths[0].commands).toEqual(notebookStrokeOutline(points, 3))
  })
})
