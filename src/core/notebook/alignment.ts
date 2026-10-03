import { clampNotebookTranslation } from './geometry'
import { notebookSelectionBounds, type NotebookSelectionBounds } from './selectionTransform'
import type { NotebookObjectV1, NotebookPageV1 } from './types'

export type NotebookAlignMode = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom'
export type NotebookDistributeAxis = 'horizontal' | 'vertical'

/** Selected objects drawn by one action (an arrow, a long stroke, an erased remainder) move as one rigid group. */
export interface NotebookSelectionUnit {
  objects: NotebookObjectV1[]
  bounds: NotebookSelectionBounds
}

export function notebookSelectionUnits(page: NotebookPageV1, ids: readonly string[]): NotebookSelectionUnit[] {
  const selected = new Set(ids)
  const groups = new Map<string, NotebookObjectV1[]>()
  for (const object of page.objects) {
    if (!selected.has(object.id)) continue
    const group = groups.get(object.actionId)
    if (group) group.push(object)
    else groups.set(object.actionId, [object])
  }
  const units: NotebookSelectionUnit[] = []
  for (const objects of groups.values()) {
    const bounds = notebookSelectionBounds(objects)
    if (bounds) units.push({ objects, bounds })
  }
  return units
}

/**
 * Shifts below this many page points are float noise from re-aligning an
 * already aligned selection; applying them would add an empty-looking undo step.
 */
const SHIFT_EPSILON = 1e-6

const settle = (value: number) => Math.abs(value) < SHIFT_EPSILON ? 0 : value

function applyShifts(page: NotebookPageV1, shifts: Map<NotebookSelectionUnit, { dx: number; dy: number }>): NotebookPageV1 {
  const byId = new Map<string, { dx: number; dy: number }>()
  for (const [unit, requested] of shifts) {
    const clamped = clampNotebookTranslation(unit.objects, settle(requested.dx), settle(requested.dy), page.width, page.height)
    const dx = settle(clamped.dx), dy = settle(clamped.dy)
    if (dx === 0 && dy === 0) continue
    for (const object of unit.objects) byId.set(object.id, { dx, dy })
  }
  if (!byId.size) return page
  return {
    ...page,
    objects: page.objects.map(object => {
      const shift = byId.get(object.id)
      return shift
        ? { ...object, points: object.points.map(point => ({ ...point, x: point.x + shift.dx, y: point.y + shift.dy })) }
        : object
    }),
  }
}

export function alignNotebookSelection(
  page: NotebookPageV1,
  ids: readonly string[],
  mode: NotebookAlignMode,
): NotebookPageV1 {
  const units = notebookSelectionUnits(page, ids)
  if (!units.length) return page
  let target: NotebookSelectionBounds
  if (units.length === 1) {
    target = { x: 0, y: 0, width: page.width, height: page.height }
  } else {
    let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity
    for (const { bounds } of units) {
      left = Math.min(left, bounds.x); top = Math.min(top, bounds.y)
      right = Math.max(right, bounds.x + bounds.width); bottom = Math.max(bottom, bounds.y + bounds.height)
    }
    target = { x: left, y: top, width: right - left, height: bottom - top }
  }
  const shifts = new Map<NotebookSelectionUnit, { dx: number; dy: number }>()
  for (const unit of units) {
    const { bounds } = unit
    let dx = 0, dy = 0
    if (mode === 'left') dx = target.x - bounds.x
    else if (mode === 'center') dx = target.x + target.width / 2 - (bounds.x + bounds.width / 2)
    else if (mode === 'right') dx = target.x + target.width - (bounds.x + bounds.width)
    else if (mode === 'top') dy = target.y - bounds.y
    else if (mode === 'middle') dy = target.y + target.height / 2 - (bounds.y + bounds.height / 2)
    else dy = target.y + target.height - (bounds.y + bounds.height)
    shifts.set(unit, { dx, dy })
  }
  return applyShifts(page, shifts)
}

export function distributeNotebookSelection(
  page: NotebookPageV1,
  ids: readonly string[],
  axis: NotebookDistributeAxis,
): NotebookPageV1 {
  const units = notebookSelectionUnits(page, ids)
  if (units.length < 3) return page
  const horizontal = axis === 'horizontal'
  const start = (unit: NotebookSelectionUnit) => horizontal ? unit.bounds.x : unit.bounds.y
  const size = (unit: NotebookSelectionUnit) => horizontal ? unit.bounds.width : unit.bounds.height
  const sorted = [...units].sort((a, b) => start(a) - start(b))
  const first = sorted[0], last = sorted[sorted.length - 1]
  const span = start(last) + size(last) - start(first)
  const gap = (span - sorted.reduce((sum, unit) => sum + size(unit), 0)) / (sorted.length - 1)
  const shifts = new Map<NotebookSelectionUnit, { dx: number; dy: number }>()
  let cursor = start(first) + size(first) + gap
  for (const unit of sorted.slice(1, -1)) {
    const delta = cursor - start(unit)
    shifts.set(unit, horizontal ? { dx: delta, dy: 0 } : { dx: 0, dy: delta })
    cursor += size(unit) + gap
  }
  return applyShifts(page, shifts)
}
