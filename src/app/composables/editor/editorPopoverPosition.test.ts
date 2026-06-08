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
})
