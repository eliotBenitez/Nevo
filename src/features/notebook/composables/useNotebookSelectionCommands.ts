import type { ComputedRef, Ref, ShallowRef } from 'vue'
import { duplicateNotebookObjects, translateNotebookObjects } from '../../../core/notebook/operations'
import { alignNotebookSelection, distributeNotebookSelection, type NotebookAlignMode, type NotebookDistributeAxis } from '../../../core/notebook/alignment'
import { flipNotebookSelection, transformNotebookSelection, type NotebookFlipAxis, type NotebookSelectionTransform } from '../../../core/notebook/selectionTransform'
import { estimateNotebookBytes, notebookListItemBytes, notebookListSeparators } from '../../../core/notebook/snapshotBytes'
import { isNotebookStroke, NOTEBOOK_OBJECT_LIMIT, type NotebookPageV1, type NotebookSnapshotV1 } from '../../../core/notebook/types'

export function useNotebookSelectionCommands(options: {
  snapshot: ShallowRef<NotebookSnapshotV1>
  currentPage: ComputedRef<NotebookPageV1>
  selectedObjectIds: ShallowRef<string[]>
  limitReached: Ref<string | null>
  commit: (next: NotebookSnapshotV1, inverseBytes: number, delta: { objects: number; points: number; bytes: number }) => void
}) {
  const { snapshot, currentPage, selectedObjectIds } = options

  function commitPage(nextPage: NotebookPageV1): boolean {
    const page = currentPage.value
    if (nextPage === page) return false
    const beforeSet = new Set(page.objects), afterSet = new Set(nextPage.objects)
    const before = page.objects.filter(object => !afterSet.has(object))
    const after = nextPage.objects.filter(object => !beforeSet.has(object))
    const next = { ...snapshot.value, pages: snapshot.value.pages.map(candidate => candidate.id === page.id ? nextPage : candidate) }
    options.commit(next, Math.max(estimateNotebookBytes(before), estimateNotebookBytes(after)), {
      objects: after.length - before.length,
      points: after.reduce((sum, object) => sum + object.points.length, 0) - before.reduce((sum, object) => sum + object.points.length, 0),
      bytes: notebookListItemBytes(after) - notebookListItemBytes(before)
        + notebookListSeparators(nextPage.objects.length) - notebookListSeparators(page.objects.length),
    })
    return snapshot.value === next
  }

  function transformSelection(transform: NotebookSelectionTransform): void {
    commitPage(transformNotebookSelection(currentPage.value, selectedObjectIds.value, transform))
  }

  function flipSelection(axis: NotebookFlipAxis): void {
    commitPage(flipNotebookSelection(currentPage.value, selectedObjectIds.value, axis))
  }

  function alignSelection(mode: NotebookAlignMode): void {
    commitPage(alignNotebookSelection(currentPage.value, selectedObjectIds.value, mode))
  }

  function distributeSelection(axis: NotebookDistributeAxis): void {
    commitPage(distributeNotebookSelection(currentPage.value, selectedObjectIds.value, axis))
  }

  function moveSelection(dx: number, dy: number): void {
    const next = translateNotebookObjects(snapshot.value, currentPage.value.id, selectedObjectIds.value, dx, dy)
    commitPage(next.pages.find(page => page.id === currentPage.value.id)!)
  }

  function colorSelection(color: string): boolean {
    if (!/^#[\da-f]{6}$/i.test(color)) return false
    const selected = new Set(selectedObjectIds.value), page = currentPage.value
    const objects = page.objects.map(object => selected.has(object.id) && isNotebookStroke(object) && object.color !== color ? { ...object, color } : object)
    return objects.some((object, index) => object !== page.objects[index]) && commitPage({ ...page, objects })
  }

  function copySelection(): void {
    const page = currentPage.value
    const ids = new Set(selectedObjectIds.value)
    const count = page.objects.filter(object => ids.has(object.id)).length
    if (!count) return
    if (snapshot.value.pages.reduce((sum, candidate) => sum + candidate.objects.length, 0) + count > NOTEBOOK_OBJECT_LIMIT) {
      options.limitReached.value = 'notebook.errors.objectLimit'
      return
    }
    const duplicate = duplicateNotebookObjects(snapshot.value, page.id, selectedObjectIds.value)
    const copiedIds = duplicate.pages.find(candidate => candidate.id === page.id)!.objects.slice(page.objects.length).map(object => object.id)
    const shifted = translateNotebookObjects(duplicate, page.id, copiedIds, 12, 12)
    if (commitPage(shifted.pages.find(candidate => candidate.id === page.id)!)) selectedObjectIds.value = copiedIds
  }

  function deleteSelection(): void {
    const selected = new Set(selectedObjectIds.value), page = currentPage.value
    const objects = page.objects.filter(object => !selected.has(object.id))
    if (objects.length !== page.objects.length && commitPage({ ...page, objects })) selectedObjectIds.value = []
  }

  return { transformSelection, flipSelection, colorSelection, copySelection, moveSelection, alignSelection, distributeSelection, deleteSelection }
}
