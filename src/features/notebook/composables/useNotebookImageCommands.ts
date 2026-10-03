import type { ComputedRef, Ref, ShallowRef } from 'vue'
import { createNotebookId } from '../../../core/notebook/codec'
import { fitNotebookImage, isNotebookImageSrc } from '../../../core/notebook/image'
import { addNotebookImage } from '../../../core/notebook/operations'
import { estimateNotebookBytes, notebookListSeparators } from '../../../core/notebook/snapshotBytes'
import { NOTEBOOK_OBJECT_LIMIT, type NotebookImageV1, type NotebookPageV1, type NotebookSnapshotV1 } from '../../../core/notebook/types'

export function useNotebookImageCommands(options: {
  snapshot: ShallowRef<NotebookSnapshotV1>
  currentPage: ComputedRef<NotebookPageV1>
  selectedObjectIds: ShallowRef<string[]>
  limitReached: Ref<string | null>
  commit: (next: NotebookSnapshotV1, inverseBytes: number, delta: { objects: number; points: number; bytes: number }) => void
}) {
  /** Places an imported asset on top of the current page as one undo step; returns its id. */
  function insertImage(src: string, naturalWidth: number, naturalHeight: number): string | null {
    const { snapshot, currentPage, selectedObjectIds } = options
    const page = currentPage.value
    // An src the codec rejects would make every later save of this notebook fail.
    if (!isNotebookImageSrc(src)) return null
    if (snapshot.value.pages.reduce((sum, candidate) => sum + candidate.objects.length, 0) >= NOTEBOOK_OBJECT_LIMIT) {
      options.limitReached.value = 'notebook.errors.objectLimit'
      return null
    }
    const image: NotebookImageV1 = {
      id: createNotebookId(),
      actionId: createNotebookId(),
      kind: 'image',
      src,
      opacity: 1,
      points: fitNotebookImage({ width: naturalWidth, height: naturalHeight }, page),
    }
    const next = addNotebookImage(snapshot.value, page.id, image)
    const bytes = estimateNotebookBytes(image)
    options.commit(next, bytes, {
      objects: 1,
      points: image.points.length,
      bytes: bytes + notebookListSeparators(page.objects.length + 1) - notebookListSeparators(page.objects.length),
    })
    if (snapshot.value !== next) return null
    selectedObjectIds.value = [image.id]
    return image.id
  }

  return { insertImage }
}
