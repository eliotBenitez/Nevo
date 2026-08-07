import { ref, type Ref } from 'vue'
import type {
  CanvasElement,
  CanvasPoint,
  CanvasRichTextDocument,
  CanvasSnapshotV1,
} from '../../../core/canvas'
import { useCanvasPresentation } from './useCanvasPresentation'
import { useCanvasRichEditing } from './useCanvasRichEditing'

export interface CanvasNoteOption {
  id: string
  title: string
  icon?: string
}

interface CanvasP1Actions {
  addNoteLink: (x: number, y: number, note: CanvasNoteOption) => string
  addMindMapChild: (parentId: string) => string
  layoutMindMap: (id: string) => boolean
  setRichText: (id: string, content: CanvasRichTextDocument) => void
  updateElement: (id: string, patch: Record<string, unknown>) => boolean
}

interface UseCanvasP1FeaturesOptions {
  snapshot: Ref<CanvasSnapshotV1>
  camera: { x: number; y: number; zoom: number }
  actions: CanvasP1Actions
  selectedElement: Ref<CanvasElement | null>
  select: (id: string) => void
  editText: (id: string) => void
  returnToSelect: () => void
  focusFrame: (frame: Extract<CanvasElement, { kind: 'frame' }>) => void
  openNote: (noteId: string) => void
}

export function useCanvasP1Features(options: UseCanvasP1FeaturesOptions) {
  const notePickerOpen = ref(false)
  const noteLinkPoint = ref<CanvasPoint>({ x: 0, y: 0 })
  const richEditing = useCanvasRichEditing({
    snapshot: options.snapshot,
    camera: options.camera,
    setRichText: options.actions.setRichText,
  })
  const presentation = useCanvasPresentation({
    snapshot: options.snapshot,
    focusFrame: options.focusFrame,
  })

  function requestNoteLink(point: CanvasPoint) {
    noteLinkPoint.value = point
    notePickerOpen.value = true
  }

  function insertNoteLink(note: CanvasNoteOption) {
    const id = options.actions.addNoteLink(noteLinkPoint.value.x, noteLinkPoint.value.y, note)
    notePickerOpen.value = false
    options.returnToSelect()
    if (id) options.select(id)
  }

  function editItem(id: string): boolean {
    const element = options.snapshot.value.elements[id]
    if (element?.kind === 'note') return richEditing.start(id)
    if (element?.kind === 'note-link') {
      options.openNote(element.noteId)
      return true
    }
    return false
  }

  function addMindMapChild() {
    const element = options.selectedElement.value
    if (element?.kind !== 'shape' || !element.mindMap) return
    const id = options.actions.addMindMapChild(element.id)
    if (!id) return
    options.select(id)
    options.editText(id)
  }

  function layoutSelectedMindMap() {
    const element = options.selectedElement.value
    if (element?.kind === 'shape' && element.mindMap) options.actions.layoutMindMap(element.id)
  }

  function patchSelectedElement(patch: Record<string, unknown>) {
    const element = options.selectedElement.value
    if (element) options.actions.updateElement(element.id, patch)
  }

  function openSelectedNoteLink() {
    const element = options.selectedElement.value
    if (element?.kind === 'note-link') options.openNote(element.noteId)
  }

  return {
    notePickerOpen,
    richEditing,
    presentation,
    requestNoteLink,
    insertNoteLink,
    editItem,
    addMindMapChild,
    layoutSelectedMindMap,
    patchSelectedElement,
    openSelectedNoteLink,
  }
}
