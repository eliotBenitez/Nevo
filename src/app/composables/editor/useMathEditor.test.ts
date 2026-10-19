import { afterEach, describe, expect, it } from 'vitest'
import { nextTick, reactive } from 'vue'
import { EditorState } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { history, undo } from 'prosemirror-history'
import { nevoBaseSchema } from '../../../editor-core/schema'
import { useMathEditor } from './useMathEditor'
import type { EditorCore } from './useEditorCore'
import type { MathPopoverState } from './useEditorOverlays'

// Undestroyed views leave DOMObserver timers that fire after jsdom teardown.
const views: EditorView[] = []
afterEach(() => { views.splice(0).forEach(v => v.destroy()) })

function setup(latex = 'a') {
  const state = EditorState.create({
    doc: nevoBaseSchema.node('doc', null, [nevoBaseSchema.node('math_block', { latex })]),
    plugins: [history()],
  })
  const view = new EditorView(document.createElement('div'), { state })
  views.push(view)
  const core = { editorView: view, coreCommands: {} } as unknown as EditorCore
  const popover = reactive({ open: false, nodePos: null, latex: '', isInline: false, position: { top: 0, left: 0 } }) as MathPopoverState
  const editor = useMathEditor(core, popover, { getMathPopoverEl: () => null, onFocusInput: () => {} }, () => {}, (p) => p)
  editor.openMathPopoverForNode(0, new DOMRect(0, 0, 10, 10))
  const latexInDoc = () => view.state.doc.firstChild?.attrs.latex
  return { view, popover, editor, latexInDoc }
}

describe('useMathEditor live preview', () => {
  it('writes typed latex to the node before apply', async () => {
    const { popover, latexInDoc } = setup()
    popover.latex = 'x^2'
    await nextTick()
    expect(latexInDoc()).toBe('x^2')
  })

  it('restores the original latex when the popover is dismissed', async () => {
    const { popover, editor, latexInDoc } = setup()
    popover.latex = 'x^2'
    await nextTick()
    editor.closeMathPopover()
    expect(latexInDoc()).toBe('a')
  })

  it('commits as a single undo step', async () => {
    const { view, popover, editor, latexInDoc } = setup()
    popover.latex = 'x'
    await nextTick()
    popover.latex = 'x^2'
    await nextTick()
    editor.applyMathFromPopover()
    expect(latexInDoc()).toBe('x^2')
    undo(view.state, view.dispatch)
    expect(latexInDoc()).toBe('a')
  })
})
