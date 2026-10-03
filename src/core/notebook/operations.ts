import { clampNotebookTranslation } from './geometry'
import { createNotebookId } from './codec'
import type {
  NotebookIdFactory,
  NotebookImageV1,
  NotebookObjectV1,
  NotebookPageV1,
  NotebookPaperKind,
  NotebookSnapshotV1,
  NotebookStrokeV1,
} from './types'
import { NOTEBOOK_OBJECT_LIMIT, NOTEBOOK_PAGE_LIMIT, NOTEBOOK_SEGMENT_POINT_LIMIT } from './types'

export function insertNotebookPage(
  snapshot: NotebookSnapshotV1,
  afterPageId?: string,
  paper?: NotebookPaperKind,
  createId: NotebookIdFactory = createNotebookId,
): NotebookSnapshotV1 {
  const index = afterPageId === undefined
    ? snapshot.pages.length - 1
    : snapshot.pages.findIndex(page => page.id === afterPageId)
  if (index < 0) throw new Error(`Notebook page not found: ${afterPageId}`)
  if (snapshot.pages.length >= NOTEBOOK_PAGE_LIMIT) throw new Error('Notebook page limit exceeded.')
  const previous = snapshot.pages[index]
  const page: NotebookPageV1 = {
    id: createId(),
    width: previous.width,
    height: previous.height,
    paper: { ...previous.paper, kind: paper ?? previous.paper.kind },
    objects: [],
  }
  const pages = [...snapshot.pages]
  pages.splice(index + 1, 0, page)
  return { ...snapshot, pages }
}

export function appendNotebookPage(
  snapshot: NotebookSnapshotV1,
  options: { id: string; paper?: NotebookPaperKind },
): NotebookSnapshotV1 {
  if (snapshot.pages.length >= NOTEBOOK_PAGE_LIMIT) throw new Error('Notebook page limit exceeded.')
  const last = snapshot.pages[snapshot.pages.length - 1]
  const page: NotebookPageV1 = {
    id: options.id,
    width: last.width,
    height: last.height,
    paper: { ...last.paper, kind: options.paper ?? last.paper.kind },
    objects: [],
  }
  return { ...snapshot, pages: [...snapshot.pages, page] }
}

export function removeNotebookPage(snapshot: NotebookSnapshotV1, pageId: string): NotebookSnapshotV1 {
  if (snapshot.pages.length <= 1) return snapshot
  const pages = snapshot.pages.filter(page => page.id !== pageId)
  return pages.length === snapshot.pages.length ? snapshot : { ...snapshot, pages }
}

export function duplicateNotebookPage(
  snapshot: NotebookSnapshotV1,
  pageId: string,
  createId: NotebookIdFactory = createNotebookId,
): NotebookSnapshotV1 {
  const index = snapshot.pages.findIndex(page => page.id === pageId)
  if (index < 0) throw new Error(`Notebook page not found: ${pageId}`)
  if (snapshot.pages.length >= NOTEBOOK_PAGE_LIMIT) throw new Error('Notebook page limit exceeded.')
  const source = snapshot.pages[index]
  const actionIds = new Map<string, string>()
  const duplicate: NotebookPageV1 = {
    ...source,
    id: createId(),
    paper: { ...source.paper },
    objects: source.objects.map(object => ({
      ...object,
      id: createId(),
      actionId: remapActionId(object.actionId, actionIds, createId),
      points: object.points.map(point => ({ ...point })),
    })),
  }
  const pages = [...snapshot.pages]
  pages.splice(index + 1, 0, duplicate)
  return { ...snapshot, pages }
}

export function moveNotebookPage(snapshot: NotebookSnapshotV1, pageId: string, toIndex: number): NotebookSnapshotV1 {
  const fromIndex = snapshot.pages.findIndex(page => page.id === pageId)
  if (fromIndex < 0) throw new Error(`Notebook page not found: ${pageId}`)
  if (!Number.isFinite(toIndex)) return snapshot
  const pages = [...snapshot.pages]
  const [page] = pages.splice(fromIndex, 1)
  pages.splice(Math.max(0, Math.min(pages.length, Math.trunc(toIndex))), 0, page)
  return pages.every((item, index) => item === snapshot.pages[index]) ? snapshot : { ...snapshot, pages }
}

export function setNotebookPagePaper(
  snapshot: NotebookSnapshotV1,
  pageId: string,
  paper: NotebookPaperKind,
): NotebookSnapshotV1 {
  return updatePage(snapshot, pageId, page => page.paper.kind === paper
    ? page
    : { ...page, paper: { ...page.paper, kind: paper } })
}

export function addNotebookStroke(
  snapshot: NotebookSnapshotV1,
  pageId: string,
  stroke: NotebookStrokeV1,
): NotebookSnapshotV1 {
  if (countObjects(snapshot) >= NOTEBOOK_OBJECT_LIMIT) throw new Error('Notebook object limit exceeded.')
  if (stroke.points.length > NOTEBOOK_SEGMENT_POINT_LIMIT) throw new Error('Notebook stroke segment point limit exceeded.')
  return updatePage(snapshot, pageId, page => ({ ...page, objects: [...page.objects, cloneObject(stroke)] }))
}

export function addNotebookImage(
  snapshot: NotebookSnapshotV1,
  pageId: string,
  image: NotebookImageV1,
): NotebookSnapshotV1 {
  if (countObjects(snapshot) >= NOTEBOOK_OBJECT_LIMIT) throw new Error('Notebook object limit exceeded.')
  return updatePage(snapshot, pageId, page => ({ ...page, objects: [...page.objects, cloneObject(image)] }))
}

/** Drops every object drawn by one action on a page and appends `stroke` in their place. */
export function replaceNotebookActionObjects(
  snapshot: NotebookSnapshotV1,
  pageId: string,
  actionId: string,
  stroke: NotebookStrokeV1,
): NotebookSnapshotV1 {
  if (stroke.points.length > NOTEBOOK_SEGMENT_POINT_LIMIT) throw new Error('Notebook stroke segment point limit exceeded.')
  return updatePage(snapshot, pageId, page => ({
    ...page,
    objects: [...page.objects.filter(object => object.actionId !== actionId), cloneObject(stroke)],
  }))
}

export function removeNotebookObject(snapshot: NotebookSnapshotV1, pageId: string, objectId: string): NotebookSnapshotV1 {
  return updatePage(snapshot, page => page.id === pageId, page => {
    const objects = page.objects.filter(object => object.id !== objectId)
    return objects.length === page.objects.length ? page : { ...page, objects }
  })
}

export function replaceNotebookObject(
  snapshot: NotebookSnapshotV1,
  pageId: string,
  objectId: string,
  replacement: NotebookObjectV1,
): NotebookSnapshotV1 {
  return updatePage(snapshot, page => page.id === pageId, page => {
    const index = page.objects.findIndex(object => object.id === objectId)
    if (index < 0) return page
    const objects = [...page.objects]
    objects[index] = cloneObject(replacement)
    return { ...page, objects }
  })
}

export function duplicateNotebookObjects(
  snapshot: NotebookSnapshotV1,
  pageId: string,
  objectIds: readonly string[],
  createId: NotebookIdFactory = createNotebookId,
): NotebookSnapshotV1 {
  const selected = new Set(objectIds)
  const actionIds = new Map<string, string>()
  return updatePage(snapshot, page => page.id === pageId, page => {
    const duplicateCount = page.objects.filter(object => selected.has(object.id)).length
    if (countObjects(snapshot) + duplicateCount > NOTEBOOK_OBJECT_LIMIT) throw new Error('Notebook object limit exceeded.')
    const duplicates = page.objects.filter(object => selected.has(object.id)).map(object => ({
      ...object,
      id: createId(),
      actionId: remapActionId(object.actionId, actionIds, createId),
      points: object.points.map(point => ({ ...point })),
    }))
    return duplicates.length ? { ...page, objects: [...page.objects, ...duplicates] } : page
  })
}

export function translateNotebookObjects(
  snapshot: NotebookSnapshotV1,
  pageId: string,
  objectIds: readonly string[],
  dx: number,
  dy: number,
): NotebookSnapshotV1 {
  const selected = new Set(objectIds)
  return updatePage(snapshot, page => page.id === pageId, page => {
    const moving = page.objects.filter(object => selected.has(object.id))
    if (!moving.length) return page
    const translation = clampNotebookTranslation(moving, dx, dy, page.width, page.height)
    if (translation.dx === 0 && translation.dy === 0) return page
    return {
      ...page,
      objects: page.objects.map(object => selected.has(object.id)
        ? { ...object, points: object.points.map(point => ({ ...point, x: point.x + translation.dx, y: point.y + translation.dy })) }
        : object),
    }
  })
}

function countObjects(snapshot: NotebookSnapshotV1): number {
  return snapshot.pages.reduce((total, page) => total + page.objects.length, 0)
}

function updatePage(
  snapshot: NotebookSnapshotV1,
  pageIdOrPredicate: string | ((page: NotebookPageV1) => boolean),
  update: (page: NotebookPageV1) => NotebookPageV1,
): NotebookSnapshotV1 {
  const predicate = typeof pageIdOrPredicate === 'string'
    ? (page: NotebookPageV1) => page.id === pageIdOrPredicate
    : pageIdOrPredicate
  const index = snapshot.pages.findIndex(predicate)
  if (index < 0) throw new Error(`Notebook page not found: ${typeof pageIdOrPredicate === 'string' ? pageIdOrPredicate : ''}`)
  const page = snapshot.pages[index]
  const next = update(page)
  if (next === page) return snapshot
  const pages = [...snapshot.pages]
  pages[index] = next
  return { ...snapshot, pages }
}

function cloneObject<T extends NotebookObjectV1>(object: T): T {
  return { ...object, points: object.points.map(point => ({ ...point })) }
}

function remapActionId(actionId: string, mappings: Map<string, string>, createId: NotebookIdFactory): string {
  let mapped = mappings.get(actionId)
  if (!mapped) {
    mapped = createId()
    mappings.set(actionId, mapped)
  }
  return mapped
}
