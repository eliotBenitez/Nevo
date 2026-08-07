import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  captureEditorLayoutScrollAnchor,
  createEditorLayoutScrollStabilizer,
  restoreEditorLayoutScrollAnchor,
} from './editorLayoutScrollStabilizer'

afterEach(() => {
  Reflect.deleteProperty(document, 'caretRangeFromPoint')
  document.body.innerHTML = ''
})

function createEditorHarness() {
  const scrollEl = document.createElement('section')
  scrollEl.className = 'doc-body'
  const editorRoot = document.createElement('div')
  const proseMirror = document.createElement('div')
  proseMirror.className = 'ProseMirror'
  const first = document.createElement('p')
  const anchorBlock = document.createElement('p')
  proseMirror.append(first, anchorBlock)
  editorRoot.append(proseMirror)
  scrollEl.append(editorRoot)
  document.body.append(scrollEl)

  let anchorTop = 120
  scrollEl.scrollTop = 500
  Object.defineProperty(scrollEl, 'getBoundingClientRect', {
    configurable: true,
    value: () => new DOMRect(0, 0, 800, 600),
  })
  Object.defineProperty(first, 'getBoundingClientRect', {
    configurable: true,
    value: () => new DOMRect(0, -100, 600, 90),
  })
  Object.defineProperty(anchorBlock, 'getBoundingClientRect', {
    configurable: true,
    value: () => new DOMRect(0, anchorTop, 600, 80),
  })

  return {
    scrollEl,
    editorRoot,
    setAnchorTop: (top: number) => { anchorTop = top },
  }
}

describe('editor layout scroll anchoring', () => {
  it('restores the top visible block after content above it reflows', () => {
    const harness = createEditorHarness()
    const anchor = captureEditorLayoutScrollAnchor(harness.editorRoot)
    expect(anchor).not.toBeNull()

    harness.setAnchorTop(180)
    expect(restoreEditorLayoutScrollAnchor(anchor!)).toBe(true)
    expect(harness.scrollEl.scrollTop).toBe(560)
  })

  it('uses an exact text range when WebKit exposes caretRangeFromPoint', () => {
    const harness = createEditorHarness()
    const textNode = harness.editorRoot.querySelector('.ProseMirror > p:last-child')!
      .appendChild(document.createTextNode('anchored text'))
    let rangeTop = 140
    const range = {
      startContainer: textNode,
      getBoundingClientRect: () => new DOMRect(0, rangeTop, 1, 18),
    } as unknown as Range
    Object.defineProperty(document, 'caretRangeFromPoint', {
      configurable: true,
      value: () => range,
    })
    const anchor = captureEditorLayoutScrollAnchor(harness.editorRoot)

    rangeTop = 215
    expect(restoreEditorLayoutScrollAnchor(anchor!)).toBe(true)
    expect(harness.scrollEl.scrollTop).toBe(575)
  })

  it('keeps the editor at the start when panels change at scrollTop zero', () => {
    const harness = createEditorHarness()
    harness.scrollEl.scrollTop = 0
    const anchor = captureEditorLayoutScrollAnchor(harness.editorRoot)

    harness.scrollEl.scrollTop = 80
    expect(restoreEditorLayoutScrollAnchor(anchor!)).toBe(true)
    expect(harness.scrollEl.scrollTop).toBe(0)
  })

  it('stabilizes every animation frame and cleans up after the transition', () => {
    const harness = createEditorHarness()
    const frames = new Map<number, FrameRequestCallback>()
    let nextFrame = 1
    let finish: (() => void) | null = null
    const stabilizer = createEditorLayoutScrollStabilizer({
      getEditorRoot: () => harness.editorRoot,
      timing: {
        requestAnimationFrame: (callback) => {
          const handle = nextFrame++
          frames.set(handle, callback)
          return handle
        },
        cancelAnimationFrame: (handle) => { frames.delete(handle) },
        setTimeout: (callback) => {
          finish = callback
          return 1
        },
        clearTimeout: vi.fn(),
      },
    })

    expect(stabilizer.preserve()).toBe(true)
    expect(harness.scrollEl.classList.contains('doc-body--layout-stabilizing')).toBe(true)

    harness.setAnchorTop(160)
    const firstFrame = frames.entries().next().value as [number, FrameRequestCallback]
    frames.delete(firstFrame[0])
    firstFrame[1](16)
    expect(harness.scrollEl.scrollTop).toBe(540)

    const finishTransition = finish as (() => void) | null
    expect(finishTransition).not.toBeNull()
    finishTransition?.()
    expect(frames.size).toBe(0)
    expect(harness.scrollEl.classList.contains('doc-body--layout-stabilizing')).toBe(false)
  })
})
