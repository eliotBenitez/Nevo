import { describe, expect, it } from 'vitest'
import type { EditorCore } from './useEditorCore'
import { getEditorOverlayBoundaryRect, placeEditorPopoverNearAnchor, type ClampOverlayPosition } from './editorPopoverPosition'

function rect(left: number, top: number, width: number, height: number): DOMRect {
  return new DOMRect(left, top, width, height)
}

describe('editorPopoverPosition', () => {
  it('resolves popup boundaries from the editor scroll container', () => {
    const boundary = document.createElement('section')
    const editor = document.createElement('div')
    boundary.className = 'doc-body'
    boundary.append(editor)
    document.body.append(boundary)
    boundary.getBoundingClientRect = () => rect(80, 40, 640, 500)

    const core = { editorView: { dom: editor } } as unknown as EditorCore
    const boundaryRect = getEditorOverlayBoundaryRect(core)

    expect(boundaryRect).toMatchObject({
      left: 80,
      top: 40,
      right: 720,
      bottom: 540,
    })

    boundary.remove()
  })

  it('opens above the anchor when the editor boundary has no room below', () => {
    const popover = document.createElement('form')
    Object.defineProperty(popover, 'offsetHeight', { value: 120 })
    popover.getBoundingClientRect = () => rect(200, 470, 480, 120)

    const clamp: ClampOverlayPosition = (position, _el, _margin, boundaryRect) => {
      expect(boundaryRect).toMatchObject({ top: 100, bottom: 520 })
      return position
    }

    const position = placeEditorPopoverNearAnchor(
      popover,
      rect(300, 450, 80, 40),
      clamp,
      rect(100, 100, 700, 420),
    )

    expect(position).toEqual({ top: 318, left: 340 })
  })

  it('measures and clamps the preferred position inside the editor boundary', () => {
    const popover = document.createElement('form')
    Object.defineProperty(popover, 'offsetHeight', { value: 200 })
    popover.getBoundingClientRect = () => {
      const top = Number.parseFloat(popover.style.top) || 0
      const center = Number.parseFloat(popover.style.left) || 0
      return rect(center - 150, top, 300, 200)
    }

    const clamp: ClampOverlayPosition = (position, el, margin = 12, boundaryRect) => {
      const bounds = boundaryRect as DOMRect
      const popupRect = el.getBoundingClientRect()
      const maxRight = bounds.right - margin
      return popupRect.right > maxRight
        ? { ...position, left: position.left - (popupRect.right - maxRight) }
        : position
    }

    const position = placeEditorPopoverNearAnchor(
      popover,
      rect(570, 160, 10, 10),
      clamp,
      rect(100, 100, 500, 400),
    )

    expect(popover.style.maxWidth).toBe('476px')
    expect(popover.style.maxHeight).toBe('376px')
    expect(popover.style.top).toBe('182px')
    expect(popover.style.left).toBe('575px')
    expect(position).toEqual({ top: 182, left: 438 })
  })

  it('prefers opening above the anchor when preferAbove is true and space permits', () => {
    const popover = document.createElement('div')
    Object.defineProperty(popover, 'offsetHeight', { value: 80 })
    popover.getBoundingClientRect = () => rect(200, 150, 300, 80)

    const clamp: ClampOverlayPosition = (pos) => pos

    // Anchor at top: 300, bottom: 350. Bounds: top 50, bottom 600.
    // preferredAboveTop = 300 - 80 - 12 = 208 >= 50 + 12 (fits above).
    // preferredBelowTop = 350 + 12 = 362 (fits below too).
    const position = placeEditorPopoverNearAnchor(
      popover,
      rect(200, 300, 100, 50),
      clamp,
      rect(0, 50, 800, 550),
      12,
      true,
    )

    expect(position).toEqual({ top: 208, left: 250 })
  })

  it('falls back to below when preferAbove is true but there is no space above', () => {
    const popover = document.createElement('div')
    Object.defineProperty(popover, 'offsetHeight', { value: 80 })
    popover.getBoundingClientRect = () => rect(200, 150, 300, 80)

    const clamp: ClampOverlayPosition = (pos) => pos

    // Anchor at top: 70, bottom: 120. Bounds: top 50, bottom 600.
    // preferredAboveTop = 70 - 80 - 12 = -22 < 50 + 12 (does not fit above).
    // preferredBelowTop = 120 + 12 = 132 (fits below).
    const position = placeEditorPopoverNearAnchor(
      popover,
      rect(200, 70, 100, 50),
      clamp,
      rect(0, 50, 800, 550),
      12,
      true,
    )

    expect(position).toEqual({ top: 132, left: 250 })
  })
})
