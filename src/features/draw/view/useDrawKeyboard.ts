import { onMounted, onBeforeUnmount, type Ref } from 'vue'
import type { DrawEditorTool } from '../useDrawEditor'

export interface DrawKeyboardOptions {
  tool: Ref<DrawEditorTool>
  selection: Ref<Set<string>>
  textEditorActive: () => boolean
  canPaste: Ref<boolean>
  back: () => Promise<void>
  pasteImageFromClipboard: () => Promise<void>
  undo: () => void
  redo: () => void
  duplicateSelection: () => void
  bringToFront: () => void
  bringForward: () => void
  sendToBack: () => void
  sendBackward: () => void
  deleteSelection: () => void
  clearSelection: () => void
  selectAll: () => void
  copySelection: () => void
  cutSelection: () => void
  paste: () => void
  scheduleSave: () => void
  group: () => void
  ungroup: () => void
}

export function useDrawKeyboard(options: DrawKeyboardOptions) {
  async function handlePasteShortcut() {
    if (options.textEditorActive()) return
    if (options.canPaste.value) {
      options.tool.value = 'select'
      options.paste()
      options.scheduleSave()
      return
    }
    await options.pasteImageFromClipboard()
  }

  function onKeydown(event: KeyboardEvent) {
    const mod = event.ctrlKey || event.metaKey
    const key = event.key.toLowerCase()
    const target = event.target as HTMLElement | null
    const typing = !!target && (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.isContentEditable
    )
    if (mod && key === 'z' && !event.shiftKey) { event.preventDefault(); options.undo() }
    else if (mod && (key === 'y' || (key === 'z' && event.shiftKey))) { event.preventDefault(); options.redo() }
    else if (mod && key === 'd') {
      if (options.selection.value.size) { event.preventDefault(); options.duplicateSelection() }
    }
    else if (mod && event.key === ']') {
      if (options.selection.value.size) {
        event.preventDefault()
        if (event.shiftKey) options.bringToFront()
        else options.bringForward()
      }
    }
    else if (mod && event.key === '[') {
      if (options.selection.value.size) {
        event.preventDefault()
        if (event.shiftKey) options.sendToBack()
        else options.sendBackward()
      }
    }
    else if (event.key === 'Delete' || event.key === 'Backspace') {
      if (options.selection.value.size) { event.preventDefault(); options.deleteSelection() }
    }
    else if (event.key === 'Escape') {
      if (options.selection.value.size) { options.clearSelection() }
      else { void options.back() }
    }
    else if (!options.textEditorActive() && mod && key === 'a') {
      event.preventDefault()
      options.tool.value = 'select'
      options.selectAll()
    }
    else if (!options.textEditorActive() && mod && key === 'c') {
      if (options.selection.value.size) { event.preventDefault(); options.copySelection() }
    }
    else if (!options.textEditorActive() && mod && key === 'x') {
      if (options.selection.value.size) { event.preventDefault(); options.cutSelection(); options.scheduleSave() }
    }
    else if (!options.textEditorActive() && mod && key === 'v') {
      event.preventDefault()
      void handlePasteShortcut()
    }
    else if (mod && key === 'g') {
      event.preventDefault()
      if (event.shiftKey) options.ungroup()
      else options.group()
    }
    else if (!mod && !typing && !options.textEditorActive()) {
      const toolMap: Record<string, string> = {
        v: 'select',
        '1': 'select',
        p: 'freehand',
        '2': 'freehand',
        m: 'highlighter',
        '3': 'highlighter',
        r: 'rectangle',
        '4': 'rectangle',
        l: 'line',
        '5': 'line',
        a: 'arrow',
        '6': 'arrow',
        o: 'ellipse',
        '7': 'ellipse',
        d: 'diamond',
        '8': 'diamond',
        t: 'text',
        '9': 'text',
        e: 'eraser',
        '0': 'eraser',
        h: 'hand',
      }
      const next = toolMap[key]
      if (next) { event.preventDefault(); options.tool.value = next as DrawEditorTool }
    }
  }

  onMounted(() => {
    window.addEventListener('keydown', onKeydown)
  })

  onBeforeUnmount(() => {
    window.removeEventListener('keydown', onKeydown)
  })

  return {
    onKeydown,
    handlePasteShortcut,
  }
}
