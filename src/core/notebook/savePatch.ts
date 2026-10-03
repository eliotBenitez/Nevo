import type { NoteDocument } from '../../types/note'
import type { NotebookPageV1, NotebookSnapshotV1, NotebookObjectV1 } from './types'

interface FieldsPatch { set: Record<string, unknown>; remove: string[] }
interface PagePatch {
  id: string
  fields: FieldsPatch
  order: string[]
  objects: NotebookObjectV1[]
}
export interface NotebookSavePatch {
  fields: FieldsPatch
  notebook: FieldsPatch
  order: string[]
  pages: PagePatch[]
}

function fieldsPatch(before: object, after: object, excluded: string): FieldsPatch {
  const old = before as Record<string, unknown>
  const next = after as Record<string, unknown>
  return {
    set: Object.fromEntries(Object.keys(next).filter(key => key !== excluded && next[key] !== old[key]).map(key => [key, next[key]])),
    remove: Object.keys(old).filter(key => key !== excluded && !Object.prototype.hasOwnProperty.call(next, key)),
  }
}

function applyFields<T extends object>(before: T, patch: FieldsPatch): T {
  const next = { ...before, ...patch.set }
  for (const key of patch.remove) delete (next as Record<string, unknown>)[key]
  return next
}

export function createNotebookSavePatch(before: NoteDocument, after: NoteDocument): NotebookSavePatch {
  const previous = before.notebook!
  const next = after.notebook!
  const oldPages = new Map(previous.pages.map(page => [page.id, page]))
  return {
    fields: fieldsPatch(before, after, 'notebook'),
    notebook: fieldsPatch(previous, next, 'pages'),
    order: next.pages.map(page => page.id),
    pages: next.pages.filter(page => page !== oldPages.get(page.id)).map(page => {
      const old = oldPages.get(page.id)
      const oldObjects = new Map(old?.objects.map(object => [object.id, object]) ?? [])
      return {
        id: page.id,
        fields: fieldsPatch(old ?? {}, page, 'objects'),
        order: page.objects.map(object => object.id),
        objects: page.objects.filter(object => object !== oldObjects.get(object.id)),
      }
    }),
  }
}

export function applyNotebookSavePatch(before: NoteDocument, patch: NotebookSavePatch): NoteDocument {
  const old = before.notebook!
  const pages = new Map(old.pages.map(page => [page.id, page]))
  for (const change of patch.pages) {
    const previous = pages.get(change.id)
    const objects = new Map(previous?.objects.map(object => [object.id, object]) ?? [])
    for (const object of change.objects) objects.set(object.id, object)
    const page = applyFields(previous ?? {} as NotebookPageV1, change.fields)
    page.objects = change.order.map(id => {
      const object = objects.get(id)
      if (!object) throw new Error('Notebook save patch references an unavailable object.')
      return object
    })
    pages.set(change.id, page)
  }
  const notebook = applyFields(old, patch.notebook)
  notebook.pages = patch.order.map(id => {
    const page = pages.get(id)
    if (!page) throw new Error('Notebook save patch references an unavailable page.')
    return page
  })
  return { ...applyFields(before, patch.fields), notebook: notebook as NotebookSnapshotV1 }
}
