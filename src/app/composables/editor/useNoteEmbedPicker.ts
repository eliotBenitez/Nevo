import { computed, nextTick, reactive, watch } from 'vue'
import type { EditorCore } from './useEditorCore'
import type { ClampOverlayPosition } from './editorPopoverPosition'
import { useTreeStore } from '../../../stores/tree'

interface NoteEmbedPickerState {
  open: boolean
  nodePos: number | null
  query: string
  position: { top: number; left: number }
  anchorRect: DOMRect | null
}

interface NoteEmbedPickerRefs {
  getNoteEmbedPickerEl: () => HTMLElement | null
}

/** Note-embed insertion picker (search + select) extracted from
 *  WorkspaceEditorPane. */
export function useNoteEmbedPicker(
  core: EditorCore,
  refs: NoteEmbedPickerRefs,
  clampOverlayPosition: ClampOverlayPosition,
) {
  const treeStore = useTreeStore()

  const noteEmbedPicker = reactive<NoteEmbedPickerState>({
    open: false,
    nodePos: null,
    query: '',
    position: { top: 0, left: 0 },
    anchorRect: null,
  })

  watch(
    () => noteEmbedPicker.open,
    async (isOpen) => {
      if (!isOpen) return
      await nextTick()
      const el = refs.getNoteEmbedPickerEl()
      const anchor = noteEmbedPicker.anchorRect
      if (!el || !anchor) return

      const margin = 12
      const popoverHeight = el.offsetHeight || 300
      const spaceBelow = window.innerHeight - anchor.bottom
      const spaceAbove = anchor.top

      let nextTop: number
      if (spaceBelow >= popoverHeight + margin || spaceBelow >= spaceAbove) {
        nextTop = anchor.bottom + 8
      } else {
        nextTop = anchor.top - popoverHeight - 8
      }

      noteEmbedPicker.position = clampOverlayPosition({ top: nextTop, left: anchor.left }, el, margin)
    },
  )

  function openNoteEmbedPicker(pos: number, anchorRect: DOMRect) {
    noteEmbedPicker.nodePos = pos
    noteEmbedPicker.query = ''
    noteEmbedPicker.anchorRect = anchorRect
    noteEmbedPicker.position = { top: anchorRect.bottom + 8, left: anchorRect.left }
    noteEmbedPicker.open = true
  }

  function closeNoteEmbedPicker() {
    noteEmbedPicker.open = false
    noteEmbedPicker.nodePos = null
    noteEmbedPicker.query = ''
  }

  function selectNoteForEmbed(noteId: string, title: string, icon: string) {
    const view = core.editorView
    const pos = noteEmbedPicker.nodePos
    if (!view || pos === null) return
    const node = view.state.doc.nodeAt(pos)
    if (!node || node.type !== view.state.schema.nodes.note_embed) return
    view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, noteId, title, icon, previewText: '' }).scrollIntoView())
    view.focus()
    closeNoteEmbedPicker()
  }

  const noteEmbedFilteredNotes = computed(() => {
    const q = noteEmbedPicker.query.trim().toLowerCase()
    const allNotes = Array.from(treeStore.noteById.values())
    if (!q) return allNotes.slice(0, 30)
    return allNotes.filter((n) => n.title.toLowerCase().includes(q)).slice(0, 30)
  })

  return {
    noteEmbedPicker,
    noteEmbedFilteredNotes,
    openNoteEmbedPicker,
    closeNoteEmbedPicker,
    selectNoteForEmbed,
  }
}
