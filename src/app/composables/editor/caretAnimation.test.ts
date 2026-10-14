import { afterEach, describe, expect, it } from 'vitest'
import { EditorState } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { schema } from 'prosemirror-schema-basic'
import { applyCaretAnimation, detachCaretAnimation } from './caretAnimation'

function createView() {
  const mount = document.createElement('div')
  document.body.appendChild(mount)
  return new EditorView(mount, { state: EditorState.create({ schema }) })
}

describe('applyCaretAnimation', () => {
  let view: EditorView | null = null

  afterEach(() => {
    detachCaretAnimation(view)
    view?.destroy()
    view = null
  })

  it('switches between native classes and the drawn overlay caret', () => {
    view = createView()

    applyCaretAnimation(view, 'fade')
    expect(view.dom.classList.contains('caret--fade')).toBe(true)
    expect(document.querySelector('.nv-caret-layer')).toBeNull()

    applyCaretAnimation(view, 'sparkle')
    expect(view.dom.classList.contains('caret--fade')).toBe(false)
    expect(view.dom.classList.contains('caret--overlay')).toBe(true)
    expect(document.querySelectorAll('.nv-caret-layer')).toHaveLength(1)

    applyCaretAnimation(view, 'comet')
    expect(document.querySelectorAll('.nv-caret-layer')).toHaveLength(1)
    expect(document.querySelector<HTMLElement>('.nv-caret')?.dataset.effect).toBe('comet')

    applyCaretAnimation(view, 'system')
    expect(view.dom.classList.contains('caret--overlay')).toBe(false)
    expect(document.querySelector('.nv-caret-layer')).toBeNull()
  })

  it('removes the overlay when the editor is detached', () => {
    view = createView()
    applyCaretAnimation(view, 'glow')
    detachCaretAnimation(view)
    expect(document.querySelector('.nv-caret-layer')).toBeNull()
  })
})
