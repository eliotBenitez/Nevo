import type { EditorView } from 'prosemirror-view'
import type { CaretAnimationMode } from '../../../types/workspace'
import { CaretOverlay, type CaretOverlayEffect } from './caretOverlay'

const NATIVE_CLASSES: Partial<Record<CaretAnimationMode, string>> = {
  steady: 'caret--steady',
  blink: 'caret--blink',
  fade: 'caret--fade',
}
const OVERLAY_EFFECTS: ReadonlySet<CaretAnimationMode> = new Set(['smooth', 'sparkle', 'glow', 'comet', 'jelly'])
const overlays = new WeakMap<EditorView, CaretOverlay>()

export function applyCaretAnimation(view: EditorView | null | undefined, mode: CaretAnimationMode): void {
  if (!view) return
  const dom = view.dom as HTMLElement
  dom.classList.remove('caret--overlay', ...Object.values(NATIVE_CLASSES))
  const nativeClass = NATIVE_CLASSES[mode]
  if (nativeClass) dom.classList.add(nativeClass)

  const overlay = overlays.get(view)
  if (!OVERLAY_EFFECTS.has(mode)) {
    overlay?.destroy()
    overlays.delete(view)
    return
  }
  dom.classList.add('caret--overlay')
  if (overlay) overlay.setEffect(mode as CaretOverlayEffect)
  else overlays.set(view, new CaretOverlay(view, mode as CaretOverlayEffect))
}

export function detachCaretAnimation(view: EditorView | null | undefined): void {
  if (!view) return
  overlays.get(view)?.destroy()
  overlays.delete(view)
}
