import { computed, ref, shallowRef } from 'vue'
import type { ComputedRef, Ref, ShallowRef } from 'vue'
import {
  addNotebookStroke,
  replaceNotebookActionObjects,
  duplicateNotebookPage,
  insertNotebookPage,
  moveNotebookPage,
  removeNotebookPage,
  translateNotebookObjects,
} from '../../../core/notebook/operations'
import { createNotebookId, encodeNotebook } from '../../../core/notebook/codec'
import { eraseNotebookStroke, eraseWholeNotebookStrokes, lassoSelectNotebookObjects } from '../../../core/notebook/geometry'
import { notebookArrowSegments } from '../../../core/notebook/arrow'
import { notebookLineEndpoints } from '../../../core/notebook/line'
import { isNotebookShapeKind, notebookShapePoints } from '../../../core/notebook/shape'
import { isNotebookStroke, NOTEBOOK_OBJECT_LIMIT, NOTEBOOK_PAGE_LIMIT, NOTEBOOK_POINT_LIMIT, NOTEBOOK_SEGMENT_POINT_LIMIT, NOTEBOOK_SERIALIZED_LIMIT_BYTES } from '../../../core/notebook/types'
import type { NotebookLineStyle, NotebookObjectV1, NotebookPageV1, NotebookPaperKind, NotebookPointV1, NotebookSnapshotV1, NotebookStrokeV1 } from '../../../core/notebook/types'
import type { NotebookGestureStyle, NotebookInputTool } from './useNotebookInput'
import { createNotebookHistory, type NotebookHistory } from './useNotebookHistory'
import { useNotebookSelectionCommands } from './useNotebookSelectionCommands'
import { useNotebookImageCommands } from './useNotebookImageCommands'
import { useNotebookGhostPage } from './useNotebookGhostPage'
import type { NotebookAlignMode, NotebookDistributeAxis } from '../../../core/notebook/alignment'
import type { NotebookFlipAxis, NotebookSelectionTransform } from '../../../core/notebook/selectionTransform'
import { estimateNotebookBytes as estimateBytes, notebookListItemBytes as listItemBytes, notebookListSeparators as listSeparators } from '../../../core/notebook/snapshotBytes'

export interface NotebookDocumentSession {
  snapshot: ShallowRef<NotebookSnapshotV1>
  selectedObjectIds: ShallowRef<string[]>
  history: NotebookHistory<NotebookSnapshotV1>
  limitReached: Ref<string | null>
  currentPage: ComputedRef<NotebookPageV1>
  ghostPage: ComputedRef<NotebookPageV1 | null>
  setCurrentPage(pageId: string): void
  applyGesture(points: NotebookPointV1[], tool: NotebookInputTool, style?: NotebookGestureStyle, pageId?: string | null, actionId?: string, checkpoint?: boolean): void
  checkpointGesture(points: NotebookPointV1[], tool: NotebookInputTool, style: NotebookGestureStyle, actionId: string, pageId: string | null): void
  applyRecognizedStroke(points: NotebookPointV1[], style: NotebookGestureStyle, pageId: string | null, actionId: string): void
  addPage(): string | null
  duplicatePage(pageId: string): string
  movePage(pageId: string, direction: -1 | 1): void
  deletePage(pageId: string): void
  transformSelection(transform: NotebookSelectionTransform): void
  colorSelection(color: string): boolean
  copySelection(): void
  deleteSelection(): void
  insertImage(src: string, naturalWidth: number, naturalHeight: number): string | null
  setPaper(kind: NotebookPaperKind): void
  moveSelection(dx: number, dy: number): void
  flipSelection(axis: NotebookFlipAxis): void
  alignSelection(mode: NotebookAlignMode): void
  distributeSelection(axis: NotebookDistributeAxis): void
  setExternalSnapshot(next: NotebookSnapshotV1): void
  clearSelection(): void
}

export function useNotebookDocument(
  initial: NotebookSnapshotV1,
  onSnapshot: (snapshot: NotebookSnapshotV1) => void,
  serializedLimitBytes = NOTEBOOK_SERIALIZED_LIMIT_BYTES,
): NotebookDocumentSession {
  const snapshot = shallowRef(initial)
  const selectedPageId = shallowRef(initial.pages[0].id)
  const selectedObjectIds = shallowRef<string[]>([])
  const limitReached = ref<string | null>(null)
  let objectCount = initial.pages.reduce((sum, page) => sum + page.objects.length, 0)
  let pointCount = initial.pages.reduce((sum, page) => sum + page.objects.reduce((pageSum, object) => pageSum + object.points.length, 0), 0)
  let serializedBytes = new TextEncoder().encode(encodeNotebook(initial)).byteLength
  const snapshotStats = new WeakMap<NotebookSnapshotV1, { objects: number; points: number; bytes: number }>()
  const checkpointPoints = new Map<string, number>()
  snapshotStats.set(initial, { objects: objectCount, points: pointCount, bytes: serializedBytes })
  const ghost = useNotebookGhostPage({
    snapshot,
    snapshotStats,
    counts: {
      get: () => [objectCount, pointCount, serializedBytes],
      set: ([objects, points, bytes]) => { objectCount = objects; pointCount = points; serializedBytes = bytes },
    },
    selectPage: pageId => { selectedPageId.value = pageId; selectedObjectIds.value = [] },
  })
  const currentPage = computed(() => snapshot.value.pages.find(page => page.id === selectedPageId.value) ?? snapshot.value.pages[0])

  function applySnapshot(next: NotebookSnapshotV1): void {
    const previousIndex = snapshot.value.pages.findIndex(page => page.id === selectedPageId.value)
    snapshot.value = next
    const stats = snapshotStats.get(next)
    if (stats) {
      objectCount = stats.objects
      pointCount = stats.points
      serializedBytes = stats.bytes
    }
    // When Undo removes the current page (e.g. one auto-added by writing on the ghost page),
    // stay at the same position instead of jumping back to the first page.
    if (!next.pages.some(page => page.id === selectedPageId.value)) {
      selectedPageId.value = next.pages[Math.max(0, Math.min(previousIndex, next.pages.length - 1))].id
    }
    selectedObjectIds.value = selectedObjectIds.value.filter(id => currentPage.value.objects.some(object => object.id === id))
    onSnapshot(next)
  }

  const history = createNotebookHistory(applySnapshot)

  function commit(
    next: NotebookSnapshotV1,
    inverseBytes = 1,
    delta: { objects?: number; points?: number; bytes?: number } = {},
    groupKey?: string,
  ): void {
    if (next === snapshot.value) return
    if (next.pages.length > NOTEBOOK_PAGE_LIMIT) {
      limitReached.value = 'notebook.errors.pageLimit'
      return
    }
    if (objectCount + (delta.objects ?? 0) > NOTEBOOK_OBJECT_LIMIT
      || pointCount + (delta.points ?? 0) > NOTEBOOK_POINT_LIMIT
      || serializedBytes + (delta.bytes ?? 0) > serializedLimitBytes) {
      limitReached.value = objectCount + (delta.objects ?? 0) > NOTEBOOK_OBJECT_LIMIT
        ? 'notebook.errors.objectLimit'
        : pointCount + (delta.points ?? 0) > NOTEBOOK_POINT_LIMIT
          ? 'notebook.errors.pointLimit'
          : 'notebook.errors.serializedLimit'
      return
    }
    const previous = snapshot.value
    history.push(ghost.stagedBase() ?? previous, next, inverseBytes, groupKey)
    const previousStats = snapshotStats.get(previous) ?? { objects: objectCount, points: pointCount, bytes: serializedBytes }
    snapshotStats.set(next, {
      objects: previousStats.objects + (delta.objects ?? 0),
      points: previousStats.points + (delta.points ?? 0),
      bytes: previousStats.bytes + (delta.bytes ?? 0),
    })
    limitReached.value = null
    applySnapshot(next)
  }

  const selection = useNotebookSelectionCommands({ snapshot, currentPage, selectedObjectIds, limitReached, commit })
  const imageCommands = useNotebookImageCommands({ snapshot, currentPage, selectedObjectIds, limitReached, commit })

  function addPage(): string | null {
    if (snapshot.value.pages.length >= NOTEBOOK_PAGE_LIMIT) {
      limitReached.value = 'notebook.errors.pageLimit'
      return null
    }
    const next = insertNotebookPage(snapshot.value, currentPage.value.id, currentPage.value.paper.kind)
    const pageId = next.pages.find(page => !snapshot.value.pages.some(existing => existing.id === page.id))?.id
    if (!pageId) return currentPage.value.id
    const insertedPage = next.pages.find(page => page.id === pageId)!
    const separatorBytes = snapshot.value.pages.length > 0 ? 1 : 0
    commit(next, 128, { bytes: estimateBytes(insertedPage) + separatorBytes })
    if (!snapshot.value.pages.some(page => page.id === pageId)) return null
    selectedPageId.value = pageId
    return pageId
  }

  function duplicatePage(pageId: string): string {
    if (snapshot.value.pages.length >= NOTEBOOK_PAGE_LIMIT) {
      limitReached.value = 'notebook.errors.pageLimit'
      return pageId
    }
    const next = duplicateNotebookPage(snapshot.value, pageId)
    const copiedId = next.pages.find(page => !snapshot.value.pages.some(existing => existing.id === page.id))?.id
    if (!copiedId) return pageId
    const copiedPage = next.pages.find(page => page.id === copiedId)!
    const copiedPoints = copiedPage.objects.reduce((sum, object) => sum + object.points.length, 0)
    commit(next, estimateBytes(copiedPage), {
      objects: copiedPage.objects.length,
      points: copiedPoints,
      bytes: estimateBytes(copiedPage) + 1,
    })
    if (!snapshot.value.pages.some(page => page.id === copiedId)) return pageId
    selectedPageId.value = copiedId
    return copiedId
  }

  function movePage(pageId: string, direction: -1 | 1): void {
    const index = snapshot.value.pages.findIndex(page => page.id === pageId)
    const target = index + direction
    if (target < 0 || target >= snapshot.value.pages.length) return
    commit(moveNotebookPage(snapshot.value, pageId, target), 1)
  }

  function deletePage(pageId: string): void {
    const oldIndex = snapshot.value.pages.findIndex(page => page.id === pageId)
    const removedPage = snapshot.value.pages[oldIndex]
    const next = removeNotebookPage(snapshot.value, pageId)
    if (next === snapshot.value) return
    const removedPoints = removedPage.objects.reduce((sum, object) => sum + object.points.length, 0)
    commit(next, estimateBytes(removedPage), {
      objects: -removedPage.objects.length,
      points: -removedPoints,
      bytes: -estimateBytes(removedPage) - (snapshot.value.pages.length > 1 ? 1 : 0),
    })
    if (selectedPageId.value === pageId) selectedPageId.value = next.pages[Math.max(0, oldIndex - 1)].id
  }

  function setPaper(kind: NotebookPaperKind): void {
    const page = currentPage.value
    if (page.paper.kind === kind) return
    const next = {
      ...snapshot.value,
      pages: snapshot.value.pages.map(candidate => candidate.id === page.id
        ? { ...candidate, paper: { ...candidate.paper, kind } }
        : candidate),
    }
    const nextPage = next.pages.find(candidate => candidate.id === page.id)!
    commit(next, 64, { bytes: estimateBytes(nextPage.paper.kind) - estimateBytes(page.paper.kind) })
  }

  function appendSingleStroke(
    points: NotebookPointV1[],
    style: NotebookGestureStyle,
    actionId: string,
    page: NotebookPageV1,
    dash?: NotebookLineStyle,
  ): void {
    const stroke: NotebookStrokeV1 = {
      id: createNotebookId(), actionId, kind: 'stroke', color: style.color,
      width: style.width, opacity: 1,
      ...(dash && dash !== 'solid' ? { dash } : {}),
      points,
    }
    const next = {
      ...snapshot.value,
      pages: snapshot.value.pages.map(candidate => candidate.id === page.id
        ? { ...candidate, objects: [...candidate.objects, stroke] }
        : candidate),
    }
    const bytes = estimateBytes(stroke)
    commit(next, bytes, {
      objects: 1,
      points: stroke.points.length,
      bytes: bytes + listSeparators(page.objects.length + 1) - listSeparators(page.objects.length),
    }, actionId)
    if (snapshot.value === next) selectedObjectIds.value = []
  }

  function applyGesture(
    inputPoints: NotebookPointV1[],
    tool: NotebookInputTool,
    style: NotebookGestureStyle = { color: '#000000', width: 1.5, markerWidth: 12, eraserDiameter: 12 },
    pageId?: string | null,
    actionId = createNotebookId(),
    checkpoint = false,
  ): void {
    if (tool === 'laser') return
    const page = snapshot.value.pages.find(candidate => candidate.id === pageId) ?? currentPage.value
    if (tool === 'line') {
      if (checkpoint) return
      const endpoints = notebookLineEndpoints(inputPoints)
      if (!endpoints) return
      appendSingleStroke(endpoints, style, actionId, page, style.dash)
      return
    }
    if (isNotebookShapeKind(tool)) {
      if (checkpoint) return
      const points = notebookShapePoints(inputPoints, tool)
      if (!points.length) return
      appendSingleStroke(points, style, actionId, page)
      return
    }
    if (tool === 'arrow') {
      if (checkpoint) return
      const strokes: NotebookStrokeV1[] = notebookArrowSegments(inputPoints, style.width).map(points => ({
        id: createNotebookId(), actionId, kind: 'stroke', color: style.color,
        width: style.width, opacity: 1, points,
      }))
      if (!strokes.length) return
      const next = {
        ...snapshot.value,
        pages: snapshot.value.pages.map(candidate => candidate.id === page.id
          ? { ...candidate, objects: [...candidate.objects, ...strokes] }
          : candidate),
      }
      const bytes = listItemBytes(strokes)
      commit(next, bytes, {
        objects: strokes.length,
        points: strokes.reduce((sum, stroke) => sum + stroke.points.length, 0),
        bytes: bytes + listSeparators(page.objects.length + strokes.length) - listSeparators(page.objects.length),
      }, actionId)
      if (snapshot.value === next) selectedObjectIds.value = []
      return
    }
    const previousPointCount = checkpointPoints.get(actionId) ?? 0
    if (previousPointCount && inputPoints.length <= previousPointCount) {
      if (!checkpoint) checkpointPoints.delete(actionId)
      return
    }
    let points = previousPointCount ? inputPoints.slice(previousPointCount - 1) : inputPoints
    if (tool === 'lasso') {
      selectedObjectIds.value = lassoSelectNotebookObjects(page.objects, points)
      return
    }
    if (tool === 'move') {
      const first = points[0]
      const last = points[points.length - 1]
      if (first && last && (first.x !== last.x || first.y !== last.y)) {
        const selected = page.objects.filter(object => selectedObjectIds.value.includes(object.id))
        const next = translateNotebookObjects(snapshot.value, page.id, selectedObjectIds.value, last.x - first.x, last.y - first.y)
        const moved = next.pages.find(candidate => candidate.id === page.id)?.objects.filter(object => selectedObjectIds.value.includes(object.id)) ?? []
        commit(next, estimateBytes(selected), { bytes: estimateBytes(moved) - estimateBytes(selected) })
      }
      return
    }
    if (tool === 'eraser') {
      if (!points.length) return
      const radius = style.eraserDiameter / 2
      const objects: NotebookObjectV1[] = style.eraserMode === 'stroke'
        ? eraseWholeNotebookStrokes(page.objects, points, radius)
        : page.objects.flatMap((object): NotebookObjectV1[] => isNotebookStroke(object) ? eraseNotebookStroke(object, points, radius) : [object])
      if (objects.length === page.objects.length && objects.every((object, index) => object === page.objects[index])) {
        if (checkpoint) checkpointPoints.set(actionId, inputPoints.length)
        else checkpointPoints.delete(actionId)
        return
      }
      const next = { ...snapshot.value, pages: snapshot.value.pages.map(candidate => candidate.id === page.id ? { ...candidate, objects } : candidate) }
      const nextPage = next.pages.find(candidate => candidate.id === page.id)!
      const previousPointCount = page.objects.reduce((sum, object) => sum + object.points.length, 0)
      const nextPointCount = nextPage.objects.reduce((sum, object) => sum + object.points.length, 0)
      const changedBefore = page.objects.filter(object => !nextPage.objects.includes(object))
      const changedAfter = nextPage.objects.filter(object => !page.objects.includes(object))
      commit(next, estimateBytes(changedBefore), {
        objects: nextPage.objects.length - page.objects.length,
        points: nextPointCount - previousPointCount,
        bytes: listItemBytes(changedAfter) - listItemBytes(changedBefore)
          + listSeparators(nextPage.objects.length) - listSeparators(page.objects.length),
      }, actionId)
      if (snapshot.value === next && checkpoint) checkpointPoints.set(actionId, inputPoints.length)
      if (!checkpoint) checkpointPoints.delete(actionId)
      selectedObjectIds.value = []
      return
    }
    if (!points.length) return
    const availablePoints = Math.max(0, NOTEBOOK_POINT_LIMIT - pointCount)
    const availableObjects = Math.max(0, NOTEBOOK_OBJECT_LIMIT - objectCount)
    const availableBytes = Math.max(0, serializedLimitBytes - serializedBytes)
    if (availablePoints === 0 || availableObjects === 0 || availableBytes === 0) {
      limitReached.value = availablePoints === 0 ? 'notebook.errors.pointLimit' : availableObjects === 0 ? 'notebook.errors.objectLimit' : 'notebook.errors.serializedLimit'
      return
    }
    const storedPointCount = (logicalPoints: number) => {
      if (logicalPoints <= NOTEBOOK_SEGMENT_POINT_LIMIT) return logicalPoints
      const segments = Math.ceil((logicalPoints - 1) / (NOTEBOOK_SEGMENT_POINT_LIMIT - 1))
      return logicalPoints + segments - 1
    }
    let low = 0
    let high = Math.min(points.length, availablePoints)
    while (low < high) {
      const middle = Math.ceil((low + high) / 2)
      const segmentCount = middle <= NOTEBOOK_SEGMENT_POINT_LIMIT
        ? 1
        : 1 + Math.ceil((middle - NOTEBOOK_SEGMENT_POINT_LIMIT) / (NOTEBOOK_SEGMENT_POINT_LIMIT - 1))
      if (storedPointCount(middle) <= availablePoints && segmentCount <= availableObjects) low = middle
      else high = middle - 1
    }
    let acceptedPointCount = low
    let acceptedLimit: string | null = null
    if (acceptedPointCount < points.length) {
      acceptedLimit = storedPointCount(acceptedPointCount + 1) > availablePoints
        ? 'notebook.errors.pointLimit'
        : 'notebook.errors.objectLimit'
      points = points.slice(0, acceptedPointCount)
    }
    const inkStroke = (segment: NotebookPointV1[]): NotebookStrokeV1 => ({
      id: createNotebookId(),
      actionId,
      kind: tool === 'marker' ? 'highlighter' : 'stroke',
      color: style.color,
      width: tool === 'marker' ? style.markerWidth : style.width,
      opacity: tool === 'marker' ? 0.25 : 1,
      ...(style.modeled ? { path: 'modeled' } : {}),
      points: segment,
    })
    let next = snapshot.value
    let offset = 0
    let addedObjectCount = 0
    const addedStrokes: NotebookStrokeV1[] = []
    while (offset < points.length) {
      const start = offset === 0 ? 0 : offset - 1
      const end = Math.min(start + NOTEBOOK_SEGMENT_POINT_LIMIT, points.length)
      const segment = points.slice(start, end)
      if (!segment.length) break
      const stroke = inkStroke(segment)
      next = addNotebookStroke(next, page.id, stroke)
      addedStrokes.push(stroke)
      addedObjectCount += 1
      offset = end
    }
    let inkBytes = listItemBytes(addedStrokes)
    while (inkBytes + Math.max(0, addedObjectCount - (page.objects.length === 0 ? 1 : 0)) > availableBytes && points.length > 0) {
      acceptedLimit = 'notebook.errors.serializedLimit'
      acceptedPointCount = Math.max(0, Math.floor(points.length * availableBytes / inkBytes) - 1)
      if (acceptedPointCount === 0) break
      points = points.slice(0, acceptedPointCount)
      addedStrokes.length = 0
      next = snapshot.value
      offset = 0
      addedObjectCount = 0
      while (offset < points.length) {
        const start = offset === 0 ? 0 : offset - 1
        const end = Math.min(start + NOTEBOOK_SEGMENT_POINT_LIMIT, points.length)
        const segment = points.slice(start, end)
        const stroke = inkStroke(segment)
        next = addNotebookStroke(next, page.id, stroke)
        addedStrokes.push(stroke)
        addedObjectCount += 1
        offset = end
      }
      inkBytes = listItemBytes(addedStrokes)
    }
    if (points.length === 0) {
      limitReached.value = 'notebook.errors.serializedLimit'
      return
    }
    const addedSeparators = listSeparators(page.objects.length + addedObjectCount) - listSeparators(page.objects.length)
    commit(next, inkBytes, {
      objects: addedObjectCount,
      points: addedStrokes.reduce((sum, stroke) => sum + stroke.points.length, 0),
      bytes: inkBytes + addedSeparators,
    }, actionId)
    if (snapshot.value === next && checkpoint) checkpointPoints.set(actionId, previousPointCount + points.length - (previousPointCount ? 1 : 0))
    if (!checkpoint) checkpointPoints.delete(actionId)
    if (acceptedLimit) limitReached.value = acceptedLimit
    selectedObjectIds.value = []
  }

  function checkpointGesture(points: NotebookPointV1[], tool: NotebookInputTool, style: NotebookGestureStyle, actionId: string, pageId: string | null): void {
    if (tool === 'pen' || tool === 'marker' || tool === 'eraser') applyGesture(points, tool, style, pageId, actionId, true)
  }

  function applyRecognizedStroke(points: NotebookPointV1[], style: NotebookGestureStyle, pageId: string | null, actionId: string): void {
    checkpointPoints.delete(actionId)
    if (points.length < 2) return
    const page = snapshot.value.pages.find(candidate => candidate.id === pageId) ?? currentPage.value
    const stroke: NotebookStrokeV1 = {
      id: createNotebookId(), actionId, kind: 'stroke', color: style.color,
      width: style.width, opacity: 1, points,
    }
    const removed = page.objects.filter(object => object.actionId === actionId)
    const nextLength = page.objects.length - removed.length + 1
    const next = replaceNotebookActionObjects(snapshot.value, page.id, actionId, stroke)
    const strokeBytes = estimateBytes(stroke)
    commit(next, strokeBytes + listItemBytes(removed), {
      objects: 1 - removed.length,
      points: stroke.points.length - removed.reduce((sum, object) => sum + object.points.length, 0),
      bytes: strokeBytes - listItemBytes(removed) + listSeparators(nextLength) - listSeparators(page.objects.length),
    }, actionId)
    if (snapshot.value === next) selectedObjectIds.value = []
  }

  function setCurrentPage(pageId: string): void {
    if (!snapshot.value.pages.some(page => page.id === pageId)) return
    selectedPageId.value = pageId
    selectedObjectIds.value = []
  }

  function setExternalSnapshot(next: NotebookSnapshotV1): void {
    snapshot.value = next
    objectCount = next.pages.reduce((sum, page) => sum + page.objects.length, 0)
    pointCount = next.pages.reduce((sum, page) => sum + page.objects.reduce((pageSum, object) => pageSum + object.points.length, 0), 0)
    serializedBytes = new TextEncoder().encode(encodeNotebook(next)).byteLength
    snapshotStats.set(next, { objects: objectCount, points: pointCount, bytes: serializedBytes })
    limitReached.value = null
    selectedPageId.value = next.pages[0].id
    selectedObjectIds.value = []
    history.reset()
  }

  function clearSelection(): void {
    selectedObjectIds.value = []
  }

  return {
    snapshot,
    selectedObjectIds,
    limitReached,
    history,
    currentPage,
    ghostPage: ghost.ghostPage,
    setCurrentPage,
    applyGesture: (points, tool, style, pageId, actionId, checkpoint) =>
      ghost.onGhostPage(pageId, () => applyGesture(points, tool, style, pageId, actionId, checkpoint)),
    checkpointGesture: (points, tool, style, actionId, pageId) =>
      ghost.onGhostPage(pageId, () => checkpointGesture(points, tool, style, actionId, pageId)),
    applyRecognizedStroke: (points, style, pageId, actionId) =>
      ghost.onGhostPage(pageId, () => applyRecognizedStroke(points, style, pageId, actionId)),
    addPage,
    duplicatePage,
    movePage,
    deletePage,
    ...selection,
    ...imageCommands,
    setPaper,
    setExternalSnapshot,
    clearSelection,
  }
}
