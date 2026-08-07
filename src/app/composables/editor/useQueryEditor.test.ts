import { effectScope, nextTick, reactive } from 'vue'
import { describe, expect, it } from 'vitest'
import type { EditorCore } from './useEditorCore'
import type { QueryPopoverState } from './useEditorOverlays'
import { useQueryEditor } from './useQueryEditor'
import { emptyQueryBlockData } from '../../../features/query/queryBlockData'

function rect(left: number, top: number, width: number, height: number): DOMRect {
  return new DOMRect(left, top, width, height)
}

describe('useQueryEditor', () => {
  it('keeps the popup anchored to the click instead of the bottom of the query block', async () => {
    const editorBoundary = document.createElement('section')
    editorBoundary.className = 'doc-body'
    editorBoundary.getBoundingClientRect = () => rect(0, 0, 800, 700)

    const editorDom = document.createElement('div')
    editorBoundary.append(editorDom)
    document.body.append(editorBoundary)

    const queryDom = document.createElement('div')
    queryDom.getBoundingClientRect = () => rect(80, 100, 640, 800)

    const popoverWrapper = document.createElement('div')
    const popover = document.createElement('form')
    Object.defineProperty(popover, 'offsetHeight', { value: 120 })
    popover.getBoundingClientRect = () => {
      const top = Number.parseFloat(popover.style.top) || 0
      const center = Number.parseFloat(popover.style.left) || 0
      return rect(center - 220, top, 440, 120)
    }
    popoverWrapper.append(popover)

    const data = emptyQueryBlockData()
    const queryNode = { type: { name: 'query_block' }, attrs: { data } }
    const core = {
      editorView: {
        dom: editorDom,
        state: { doc: { nodeAt: () => queryNode } },
        nodeDOM: () => queryDom,
        coordsAtPos: () => ({ left: 80, right: 720, top: 100, bottom: 900 }),
      },
    } as unknown as EditorCore
    const queryPopover = reactive<QueryPopoverState>({
      open: false,
      data,
      position: { top: 0, left: 0 },
      nodePos: null,
    })

    const scope = effectScope()
    const queryEditor = scope.run(() => useQueryEditor(
      core,
      queryPopover,
      { getQueryPopoverEl: () => popoverWrapper },
      () => {},
      position => position,
    ))

    try {
      queryEditor?.openQueryPopoverForNode(0, rect(300, 200, 10, 10))
      await nextTick()
      await nextTick()

      expect(queryPopover.position).toEqual({ top: 222, left: 305 })
      expect(queryPopover.position.top).toBeLessThan(queryDom.getBoundingClientRect().bottom)
    } finally {
      scope.stop()
      editorBoundary.remove()
    }
  })
})
