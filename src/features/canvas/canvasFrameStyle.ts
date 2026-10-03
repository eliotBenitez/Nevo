import type { CanvasDocumentFrame } from '../../core/canvas'

/**
 * Translates the single document frame's geometry into CSS custom properties
 * and data attributes on the ProseMirror root element. This is the entire
 * bridge between canvas store frame state and layout — ProseMirror itself
 * never knows about the canvas, and no PM transaction/decoration is involved.
 */
export function applyCanvasFrameStyle(element: HTMLElement, frame: CanvasDocumentFrame): void {
  element.style.setProperty('--canvas-frame-x', `${frame.x}px`)
  element.style.setProperty('--canvas-frame-y', `${frame.y}px`)
  element.style.setProperty('--canvas-frame-width', `${frame.width}px`)
  element.style.setProperty('--canvas-frame-height', `${frame.height}px`)
  element.style.setProperty('--canvas-frame-z', `${frame.zIndex}`)
  element.dataset.canvasFrameAutoheight = frame.autoHeight === false ? 'false' : 'true'
  element.dataset.canvasFrameCollapsed = frame.collapsed ? 'true' : 'false'
}

export function clearCanvasFrameStyle(element: HTMLElement): void {
  element.style.removeProperty('--canvas-frame-x')
  element.style.removeProperty('--canvas-frame-y')
  element.style.removeProperty('--canvas-frame-width')
  element.style.removeProperty('--canvas-frame-height')
  element.style.removeProperty('--canvas-frame-z')
  delete element.dataset.canvasFrameAutoheight
  delete element.dataset.canvasFrameCollapsed
}
