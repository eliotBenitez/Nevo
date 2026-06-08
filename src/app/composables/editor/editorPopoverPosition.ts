import type { EditorCore } from './useEditorCore'
import type { OverlayPosition } from './useEditorOverlays'

export type ClampOverlayPosition = (
  position: OverlayPosition,
  el: HTMLElement,
  margin?: number,
  boundaryRect?: DOMRect,
) => OverlayPosition

const editorPopoverGap = 12

export function getEditorOverlayBoundaryRect(core: EditorCore): DOMRect | null {
  const editorDom = core.editorView?.dom
  if (!(editorDom instanceof HTMLElement)) return null

  const boundaryEl = editorDom.closest<HTMLElement>('.doc-body') ?? editorDom.closest<HTMLElement>('.doc-body-wrap') ?? editorDom
  const rect = boundaryEl.getBoundingClientRect()
  const left = Math.max(rect.left, 0)
  const top = Math.max(rect.top, 0)
  const right = Math.min(rect.right, window.innerWidth)
  const bottom = Math.min(rect.bottom, window.innerHeight)

  return new DOMRect(left, top, Math.max(right - left, 1), Math.max(bottom - top, 1))
}

export function placeEditorPopoverNearAnchor(
  el: HTMLElement,
  anchorRect: DOMRect,
  clampOverlayPosition: ClampOverlayPosition,
  boundaryRect: DOMRect | null,
  margin = 12,
): OverlayPosition {
  const bounds = boundaryRect ?? new DOMRect(0, 0, window.innerWidth, window.innerHeight)
  const elRect = el.getBoundingClientRect()
  const elHeight = el.offsetHeight || elRect.height
  const preferredBelowTop = anchorRect.bottom + editorPopoverGap
  const preferredAboveTop = anchorRect.top - elHeight - editorPopoverGap
  const minTop = bounds.top + margin
  const maxBottom = bounds.bottom - margin
  const fitsBelow = preferredBelowTop + elHeight <= maxBottom
  const fitsAbove = preferredAboveTop >= minTop

  const preferredPosition = {
    top: !fitsBelow && fitsAbove ? preferredAboveTop : preferredBelowTop,
    left: anchorRect.left + anchorRect.width / 2,
  }

  return clampOverlayPosition(preferredPosition, el, margin, bounds)
}
