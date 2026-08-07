import { computed, shallowRef, type Ref } from 'vue'
import {
  normalizeCanvasRichText,
  type CanvasCamera,
  type CanvasRichTextDocument,
  type CanvasSnapshotV1,
} from '../../../core/canvas'

interface UseCanvasRichEditingOptions {
  snapshot: Ref<CanvasSnapshotV1>
  camera: CanvasCamera
  setRichText: (id: string, content: CanvasRichTextDocument) => void
}

export function useCanvasRichEditing(options: UseCanvasRichEditingOptions) {
  const editingId = shallowRef<string | null>(null)
  const draft = shallowRef<CanvasRichTextDocument>(normalizeCanvasRichText(null))
  const editingElement = computed(() => {
    const element = editingId.value ? options.snapshot.value.elements[editingId.value] : null
    return element?.kind === 'note' ? element : null
  })
  const editingStyle = computed<Record<string, string>>(() => {
    const element = editingElement.value
    if (!element) return {} as Record<string, string>
    return {
      left: `${(element.x - options.camera.x) * options.camera.zoom}px`,
      top: `${(element.y - options.camera.y) * options.camera.zoom}px`,
      width: `${element.width * options.camera.zoom}px`,
      height: `${element.height * options.camera.zoom}px`,
      '--canvas-rich-editor-scale': String(options.camera.zoom),
    }
  })

  function start(id: string): boolean {
    const element = options.snapshot.value.elements[id]
    if (element?.kind !== 'note' || element.locked) return false
    editingId.value = id
    draft.value = structuredClone(element.content)
    return true
  }

  function commit(content: CanvasRichTextDocument) {
    if (editingId.value) options.setRichText(editingId.value, normalizeCanvasRichText(content))
    editingId.value = null
  }

  function cancel() {
    editingId.value = null
  }

  return { editingId, draft, editingStyle, start, commit, cancel }
}
